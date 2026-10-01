"use server";

import { checkEquipmentAvailability, checkLabAvailability } from "@/lib/actions/bookings";
import { fail, ok, toActionFailure, todayIso, type ActionResult } from "@/lib/actions/shared";
import { ALL_ROLES, assertRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { AssistantUnavailableError, callGemini } from "./gemini";
import { resolveEquipment, resolveLab } from "./resolve";
import {
  buildPrompt,
  DATE_RE,
  extractionSchema,
  type AssistantEquipmentLine,
  type AssistantExtraction,
  type AssistantResult,
  type AssistantUnmatchedEquipment,
  type PreviousIntent,
} from "./schema";

const MAX_INPUT = 400;

export async function parseBookingRequest(
  text: string,
  previous?: PreviousIntent | null,
): Promise<ActionResult<AssistantResult>> {
  try {
    await assertRole(ALL_ROLES);

    const request = typeof text === "string" ? text.trim() : "";
    if (request.length < 3) return fail("Describe what you want to book.", "validation");
    if (request.length > MAX_INPUT) return fail(`Keep the request under ${MAX_INPUT} characters.`, "validation");

    const supabase = await createClient();
    const [{ data: labs }, { data: equipment }, { data: categories }] = await Promise.all([
      supabase.from("labs").select("id, name, code, capacity").eq("status", "available").order("name"),
      supabase.from("equipment_availability").select("*").gt("total_quantity", 0).order("name"),
      supabase.from("equipment_categories").select("id, name"),
    ]);

    const categoryNames = new Map((categories ?? []).map((category) => [category.id, category.name]));

    const labOptions = (labs ?? []).map((lab) => ({
      id: lab.id,
      name: lab.name,
      code: lab.code,
      capacity: lab.capacity,
    }));
    const equipmentOptions = (equipment ?? []).map((item) => ({
      id: item.equipment_id,
      name: item.name,
      assetCode: item.asset_code,
      categoryName: categoryNames.get(item.category_id) ?? "Category",
      available: item.available_quantity,
      total: item.total_quantity,
    }));

    const today = todayIso();
    const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(
      new Date(`${today}T00:00:00Z`),
    );

    const raw = await callGemini(
      buildPrompt({
        text: request,
        today,
        weekday,
        labs: labOptions.map((lab) => ({ name: lab.name, code: lab.code, capacity: lab.capacity })),
        equipment: equipmentOptions.map((item) => ({ name: item.name, categoryName: item.categoryName })),
        previous: sanitizePrevious(previous),
      }),
    );

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      return fail("The assistant's answer was malformed. Try again.", "unknown");
    }

    const parsed = extractionSchema.safeParse(parsedJson);
    if (!parsed.success) return fail("The assistant's answer was unexpected. Try again.", "unknown");
    const extraction = parsed.data;

    const labResolution = resolveLab(extraction.labHint, labOptions);

    const equipmentMatches: { equipmentId: string; quantity: number }[] = [];
    const unmatchedEquipment: AssistantUnmatchedEquipment[] = [];
    for (const line of extraction.equipment) {
      const resolution = resolveEquipment(line.nameHint, equipmentOptions);
      if (resolution.match) {
        equipmentMatches.push({ equipmentId: resolution.match.id, quantity: line.quantity });
      } else {
        unmatchedEquipment.push({
          hint: line.nameHint,
          candidates: resolution.candidates.map((candidate) => ({
            id: candidate.id,
            name: candidate.name,
            available: candidate.available,
          })),
        });
      }
    }

    const end =
      extraction.end ??
      (extraction.start ? addHoursToTime(extraction.start, 2) : null);
    const window =
      extraction.date && extraction.start && end && extraction.date >= today && extraction.start < end
        ? { date: extraction.date, start: extraction.start, end }
        : null;

    let isFree: boolean | null = null;
    let withinOpenHours: boolean | null = null;
    let conflicts: AssistantResult["conflicts"] = [];
    let alternatives: AssistantResult["alternatives"] = [];
    let ranked: AssistantResult["ranked"] = [];

    if (labResolution.match && window) {
      const check = await checkLabAvailability({
        labId: labResolution.match.id,
        date: window.date,
        start: window.start,
        end: window.end,
        expectedAttendees: extraction.expectedAttendees ?? undefined,
      });
      if (check.ok && check.data) {
        isFree = check.data.isFree;
        withinOpenHours = check.data.withinOpenHours;
        conflicts = check.data.conflicts;
        alternatives = check.data.alternatives;
        ranked = check.data.ranked;
      }
    }

    let equipmentLines: AssistantEquipmentLine[] = [];
    if (equipmentMatches.length > 0) {
      const check = await checkEquipmentAvailability(equipmentMatches);
      if (check.ok && check.data) equipmentLines = check.data.lines;
    }

    const params = new URLSearchParams();
    if (labResolution.match) params.set("lab", labResolution.match.id);
    if (equipmentMatches[0]) params.set("equipment", equipmentMatches[0].equipmentId);
    const wizardUrl = params.size > 0 ? `/bookings/new?${params.toString()}` : null;

    return ok({
      lab: labResolution.match ? { id: labResolution.match.id, name: labResolution.match.name } : null,
      labCandidates: labResolution.candidates.map((lab) => ({ id: lab.id, name: lab.name })),
      labDirectory: labOptions.map((lab) => ({ id: lab.id, name: lab.name })),
      date: extraction.date,
      start: extraction.start,
      end,
      purpose: extraction.purpose,
      attendees: extraction.expectedAttendees,
      isFree,
      withinOpenHours,
      conflicts,
      alternatives,
      ranked,
      equipment: equipmentLines,
      unmatchedEquipment,
      needsClarification: extraction.needsClarification,
      clarificationQuestion: extraction.clarificationQuestion,
      assistantMessage: fixWeekday(
        extraction.assistantMessage || defaultMessage(extraction),
        extraction.date,
      ),
      wizardUrl,
    } satisfies AssistantResult);
  } catch (error) {
    if (error instanceof AssistantUnavailableError) {
      return fail("The AI assistant is unavailable right now — use the booking form instead.", "unknown");
    }
    return toActionFailure(error, "The assistant hit a snag — use the booking form instead.");
  }
}

const WEEKDAYS_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const WEEKDAY_ALIASES: Record<string, string> = {
  sun: "Sunday",
  sunday: "Sunday",
  mon: "Monday",
  monday: "Monday",
  tue: "Tuesday",
  tues: "Tuesday",
  tuesday: "Tuesday",
  wed: "Wednesday",
  wednesday: "Wednesday",
  thu: "Thursday",
  thur: "Thursday",
  thurs: "Thursday",
  thursday: "Thursday",
  fri: "Friday",
  friday: "Friday",
  sat: "Saturday",
  saturday: "Saturday",
};

/**
 * The model reliably gets the date right in the structured fields but can
 * mislabel the weekday in free text. Correct any weekday mention to match the
 * final date — deterministic, so the chat bubble can be trusted in a demo.
 */
function fixWeekday(message: string, date: string | null): string {
  if (!date || !DATE_RE.test(date)) return message;
  const correct = WEEKDAYS_LONG[new Date(`${date}T00:00:00Z`).getUTCDay()];
  return message.replace(
    /\b(Sun(day)?|Mon(day)?|Tue(s(day)?)?|Wed(nesday)?|Thu(r(s(day)?)?)?|Fri(day)?|Sat(urday)?)\b/gi,
    (match) => {
      const canonical = WEEKDAY_ALIASES[match.toLowerCase()];
      if (!canonical || canonical === correct) return match;
      return correct;
    },
  );
}

function defaultMessage(extraction: AssistantExtraction): string {
  const bits: string[] = [];
  if (extraction.labHint) bits.push(extraction.labHint);
  if (extraction.date) {
    bits.push(
      `${extraction.date}${extraction.start ? ` ${extraction.start}${extraction.end ? `–${extraction.end}` : ""}` : ""}`,
    );
  }
  if (extraction.equipment.length > 0) {
    bits.push(extraction.equipment.map((line) => `${line.quantity}× ${line.nameHint}`).join(", "));
  }
  return bits.length > 0
    ? `Got it — ${bits.join(" · ")}. Checking availability now.`
    : "Got it — let me check what fits.";
}

function sanitizePrevious(previous: PreviousIntent | null | undefined): PreviousIntent | null {
  if (!previous || typeof previous !== "object") return null;
  try {
    if (JSON.stringify(previous).length > 1200) return null;
    return previous;
  } catch {
    return null;
  }
}

function addHoursToTime(time: string, hours: number): string {
  const [rawHour, rawMinute] = time.split(":");
  const total = Number(rawHour) * 60 + Number(rawMinute) + hours * 60;
  const hour = Math.floor(total / 60) % 24;
  const minute = total % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
