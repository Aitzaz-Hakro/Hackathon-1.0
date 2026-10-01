"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  addDays,
  findAlternativeSlots,
  isValidWindow,
  toMinutes,
  windowsOverlap,
  type ExistingBooking,
  type TimeWindow,
} from "@/lib/booking/availability";
import { scorePriority } from "@/lib/booking/priority";
import { recommendLabs, suggestQuantity, type RecommendationInput } from "@/lib/booking/recommend";
import { evaluateRules, isWithinOpeningHours, type BookingRuleSet } from "@/lib/booking/rules";
import { assertTransition, isActive, isTerminal, type BookingStatus } from "@/lib/booking/status";
import { ALL_ROLES, assertRole, isStaffRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { LabBusySlotRow, LabStatus, Profile } from "@/lib/types";
import {
  dbErrorMessage,
  fail,
  ok,
  revalidateBookingSurfaces,
  revalidateWaitlistSurfaces,
  toActionFailure,
  toHhMm,
  todayIso,
  type ActionResult,
} from "./shared";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// -----------------------------------------------------------------------------
// Shared shapes
// -----------------------------------------------------------------------------

export type AvailabilityConflict = {
  date: string;
  start: string;
  end: string;
  status: BookingStatus;
};

export type RankedLab = {
  labId: string;
  name: string;
  capacity: number;
  matchPercent: number;
  isFree: boolean;
  reasons: string[];
};

export type ConflictAlternatives = {
  conflicts: AvailabilityConflict[];
  alternatives: TimeWindow[];
  ranked: RankedLab[];
};

export type AvailabilityCheckData = ConflictAlternatives & {
  labName: string;
  labStatus: LabStatus;
  openTime: string;
  closeTime: string;
  withinOpenHours: boolean;
  isFree: boolean;
};

export type EquipmentLineCheck = {
  equipmentId: string;
  name: string;
  requestedQuantity: number;
  availableQuantity: number;
  totalQuantity: number;
  feasible: boolean;
  suggestedQuantity: number;
  message: string;
};

export type EquipmentCheckData = {
  lines: EquipmentLineCheck[];
  allFeasible: boolean;
};

export type CreateBookingSuccess = {
  bookingId: string;
};

/**
 * Failure payloads travel on `ActionResult.data` so the wizard can render the
 * ranked alternatives (or the per-line equipment shortfall) inline.
 */
export type CreateBookingFailureData = {
  conflicts?: AvailabilityConflict[];
  alternatives?: TimeWindow[];
  ranked?: RankedLab[];
  lines?: EquipmentLineCheck[];
};

export type CreateBookingData = CreateBookingSuccess | CreateBookingFailureData;

// -----------------------------------------------------------------------------
// Internal helpers — not exported, so they are never POST-reachable actions.
// -----------------------------------------------------------------------------

const DEFAULT_RULES: Omit<BookingRuleSet, "departmentId"> = {
  maxDurationMinutes: 240,
  maxEquipmentQuantity: 10,
  advanceBookingDays: 30,
  requiresApproval: true,
  allowStudentBooking: true,
};

function slotToExisting(slot: LabBusySlotRow): ExistingBooking {
  return {
    id: `${slot.lab_id}:${slot.booking_date}:${slot.start_time}:${slot.end_time}`,
    date: slot.booking_date,
    start: toHhMm(slot.start_time),
    end: toHhMm(slot.end_time),
  };
}

async function loadRules(supabase: Supabase, departmentId: string | null): Promise<BookingRuleSet> {
  if (!departmentId) return { departmentId: "", ...DEFAULT_RULES };

  const { data } = await supabase
    .from("booking_rules")
    .select("*")
    .eq("department_id", departmentId)
    .maybeSingle();

  if (!data) return { departmentId, ...DEFAULT_RULES };

  return {
    departmentId,
    maxDurationMinutes: data.max_duration_minutes,
    maxEquipmentQuantity: data.max_equipment_quantity,
    advanceBookingDays: data.advance_booking_days,
    requiresApproval: data.requires_approval,
    allowStudentBooking: data.allow_student_booking,
  };
}

/**
 * Every busy interval needed for one availability decision: the previous 30
 * days for utilisation scoring, plus the requested week for alternative slots.
 * One query covers both.
 */
async function loadBusySlots(supabase: Supabase, date: string): Promise<LabBusySlotRow[]> {
  const from = addDays(todayIso(), -30);
  const to = addDays(date, 7);
  const { data } = await supabase
    .from("lab_busy_slots")
    .select("*")
    .gte("booking_date", from)
    .lte("booking_date", to);
  return data ?? [];
}

function conflictsFor(slots: LabBusySlotRow[], labId: string, window: TimeWindow): AvailabilityConflict[] {
  return slots
    .filter((slot) => slot.lab_id === labId && windowsOverlap(window, slotToExisting(slot)))
    .map((slot) => ({
      date: slot.booking_date,
      start: toHhMm(slot.start_time),
      end: toHhMm(slot.end_time),
      status: slot.booking_status,
    }));
}

function utilisationFor(slotList: LabBusySlotRow[], labId: string, openTime: string, closeTime: string): number {
  const openMinutes = Math.max(toMinutes(closeTime) - toMinutes(openTime), 1) * 30;
  const busyMinutes = slotList
    .filter((slot) => slot.lab_id === labId)
    .reduce(
      (sum, slot) => sum + Math.max(0, toMinutes(toHhMm(slot.end_time)) - toMinutes(toHhMm(slot.start_time))),
      0,
    );
  return Math.min(busyMinutes / openMinutes, 1);
}

/**
 * Why alternatives exist: when the requested slot is taken, surface more times
 * on the same lab plus the ranked list of other labs. Mirrors the rulebook's
 * Lab A/B/C table through `recommendLabs`.
 */
async function buildConflictAlternatives(
  supabase: Supabase,
  profile: Profile,
  lab: { id: string; open_time: string; close_time: string },
  window: TimeWindow,
  requiredFacilities: string[],
  expectedAttendees: number,
): Promise<ConflictAlternatives> {
  const slots = await loadBusySlots(supabase, window.date);
  const openTime = toHhMm(lab.open_time);
  const closeTime = toHhMm(lab.close_time);

  const alternatives = findAlternativeSlots(
    window,
    slots.filter((slot) => slot.lab_id === lab.id).map(slotToExisting),
    { openTime, closeTime, stepMinutes: 30, limit: 5, searchDays: 7 },
  );

  const { data: labs } = await supabase
    .from("labs")
    .select("id, name, capacity, department_id, facilities, open_time, close_time, status")
    .eq("status", "available");

  const inputs: RecommendationInput[] = (labs ?? []).map((candidate) => ({
    lab: {
      id: candidate.id,
      name: candidate.name,
      capacity: candidate.capacity,
      departmentId: candidate.department_id,
      facilities: candidate.facilities,
    },
    requiredFacilities,
    expectedAttendees,
    userDepartmentId: profile.department_id,
    isFree: conflictsFor(slots, candidate.id, window).length === 0,
    utilisation: utilisationFor(slots, candidate.id, candidate.open_time, candidate.close_time),
  }));

  const ranked = recommendLabs(inputs)
    .slice(0, 6)
    .map((recommendation) => ({
      labId: recommendation.lab.id,
      name: recommendation.lab.name,
      capacity: recommendation.lab.capacity,
      matchPercent: recommendation.matchPercent,
      isFree: recommendation.isFree,
      reasons: recommendation.reasons.slice(0, 3),
    }));

  return { conflicts: conflictsFor(slots, lab.id, window), alternatives, ranked };
}

async function countLateReturns(supabase: Supabase, userId: string): Promise<number> {
  const { data: bookings } = await supabase.from("bookings").select("id").eq("user_id", userId);
  const ids = (bookings ?? []).map((booking) => booking.id);
  if (ids.length === 0) return 0;

  const { data: issues } = await supabase
    .from("issues")
    .select("due_at, returned_at")
    .in("booking_id", ids)
    .not("returned_at", "is", null);

  return (issues ?? []).filter(
    (issue) => issue.due_at !== null && issue.returned_at !== null && issue.returned_at > issue.due_at,
  ).length;
}

type EquipmentLineInput = { equipmentId: string; quantity: number };

async function checkEquipmentLines(
  supabase: Supabase,
  lines: EquipmentLineInput[],
): Promise<EquipmentLineCheck[]> {
  if (lines.length === 0) return [];

  const ids = lines.map((line) => line.equipmentId);
  const { data: rows } = await supabase.from("equipment_availability").select("*").in("equipment_id", ids);

  const byId = new Map((rows ?? []).map((row) => [row.equipment_id, row]));

  return lines.map((line) => {
    const row = byId.get(line.equipmentId);
    if (!row) {
      return {
        equipmentId: line.equipmentId,
        name: "Unknown item",
        requestedQuantity: line.quantity,
        availableQuantity: 0,
        totalQuantity: 0,
        feasible: false,
        suggestedQuantity: 0,
        message: "That equipment item no longer exists.",
      };
    }

    const suggestion = suggestQuantity(line.quantity, row.available_quantity);
    return {
      equipmentId: line.equipmentId,
      name: row.name,
      requestedQuantity: line.quantity,
      availableQuantity: row.available_quantity,
      totalQuantity: row.total_quantity,
      feasible: suggestion.feasible,
      suggestedQuantity: suggestion.suggestedQuantity,
      message: suggestion.message,
    };
  });
}

// -----------------------------------------------------------------------------
// Availability checks — read-only, called from the wizard as the user picks.
// -----------------------------------------------------------------------------

const availabilityCheckSchema = z.object({
  labId: z.string().uuid(),
  date: z.string().regex(DATE_RE),
  start: z.string().regex(TIME_RE),
  end: z.string().regex(TIME_RE),
  expectedAttendees: z.coerce.number().int().min(1).max(500).catch(1),
  requiredFacilities: z.array(z.string()).max(20).catch([]),
});

export async function checkLabAvailability(input: {
  labId: string;
  date: string;
  start: string;
  end: string;
  expectedAttendees?: number;
  requiredFacilities?: string[];
}): Promise<ActionResult<AvailabilityCheckData>> {
  try {
    const profile = await assertRole(ALL_ROLES);
    const parsed = availabilityCheckSchema.safeParse(input);
    if (!parsed.success) return fail("Pick a valid date and time.", "validation");

    const { labId, date, start, end } = parsed.data;
    const window: TimeWindow = { date, start, end };
    if (!isValidWindow(window)) return fail("The end time must be after the start time.", "validation");

    const supabase = await createClient();
    const { data: lab } = await supabase
      .from("labs")
      .select("id, name, capacity, department_id, facilities, open_time, close_time, status")
      .eq("id", labId)
      .maybeSingle();

    if (!lab) return fail("That lab could not be found.", "not_found");

    const { conflicts, alternatives, ranked } = await buildConflictAlternatives(
      supabase,
      profile,
      lab,
      window,
      parsed.data.requiredFacilities,
      parsed.data.expectedAttendees,
    );

    return ok({
      conflicts,
      alternatives,
      ranked,
      labName: lab.name,
      labStatus: lab.status,
      openTime: toHhMm(lab.open_time),
      closeTime: toHhMm(lab.close_time),
      withinOpenHours: isWithinOpeningHours(window, toHhMm(lab.open_time), toHhMm(lab.close_time)),
      isFree: conflicts.length === 0,
    });
  } catch (error) {
    return toActionFailure(error, "Could not check availability right now.");
  }
}

const equipmentLinesSchema = z
  .array(
    z.object({
      equipmentId: z.string().uuid(),
      quantity: z.coerce.number().int().min(1).max(100),
    }),
  )
  .min(1)
  .max(20);

export async function checkEquipmentAvailability(
  lines: EquipmentLineInput[],
): Promise<ActionResult<EquipmentCheckData>> {
  try {
    await assertRole(ALL_ROLES);
    const parsed = equipmentLinesSchema.safeParse(lines);
    if (!parsed.success) return fail("The equipment list was malformed.", "validation");

    const supabase = await createClient();
    const checked = await checkEquipmentLines(supabase, parsed.data);
    return ok({ lines: checked, allFeasible: checked.every((line) => line.feasible) });
  } catch (error) {
    return toActionFailure(error, "Could not check equipment availability right now.");
  }
}

// -----------------------------------------------------------------------------
// Create
// -----------------------------------------------------------------------------

const bookingSchema = z.object({
  resourceType: z.enum(["lab", "equipment"]),
  labId: z.string().uuid().nullable().catch(null),
  date: z.string().regex(DATE_RE),
  start: z.string().regex(TIME_RE),
  end: z.string().regex(TIME_RE),
  purpose: z.string().trim().min(3, "Describe what the booking is for.").max(500),
  expectedAttendees: z.coerce.number().int().min(1).max(500).nullable().catch(null),
  requiredFacilities: z.array(z.string()).max(20).catch([]),
  equipment: z.string().optional(),
});

export async function createBooking(
  _previous: ActionResult<CreateBookingData> | null,
  formData: FormData,
): Promise<ActionResult<CreateBookingData>> {
  try {
    const profile = await assertRole(ALL_ROLES);

    const parsed = bookingSchema.safeParse({
      resourceType: formData.get("resourceType"),
      labId: formData.get("labId") || null,
      date: formData.get("date"),
      start: formData.get("start"),
      end: formData.get("end"),
      purpose: formData.get("purpose"),
      expectedAttendees: formData.get("expectedAttendees") || null,
      requiredFacilities: parseJsonField(formData.get("requiredFacilities"), []),
      equipment: formData.get("equipment") ?? undefined,
    });

    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Some details are missing.", "validation");
    }

    const input = parsed.data;
    const window: TimeWindow = { date: input.date, start: input.start, end: input.end };
    if (!isValidWindow(window)) return fail("The end time must be after the start time.", "validation");

    const rawLines = parseJsonField<unknown>(input.equipment ?? null, []);
    const linesParsed = z
      .array(z.object({ equipmentId: z.string().uuid(), quantity: z.coerce.number().int().min(1).max(100) }))
      .max(20)
      .safeParse(rawLines);
    if (!linesParsed.success) return fail("The equipment list was malformed.", "validation");
    const lines = linesParsed.data;

    if (input.resourceType === "lab" && !input.labId) {
      return fail("Choose a lab to book.", "validation");
    }
    if (input.resourceType === "equipment" && lines.length === 0) {
      return fail("Add at least one equipment item.", "validation");
    }

    const supabase = await createClient();

    // ---------------------------------------------------------------- lab
    let lab: {
      id: string;
      name: string;
      capacity: number;
      department_id: string;
      open_time: string;
      close_time: string;
      status: LabStatus;
    } | null = null;

    if (input.labId) {
      const { data } = await supabase
        .from("labs")
        .select("id, name, capacity, department_id, open_time, close_time, status")
        .eq("id", input.labId)
        .maybeSingle();

      if (!data) return fail("That lab could not be found.", "not_found");
      lab = data;

      if (lab.status === "maintenance") {
        return fail(`${lab.name} is under maintenance and cannot be booked right now.`, "validation");
      }
      if (lab.status === "closed") {
        return fail(`${lab.name} is temporarily closed.`, "validation");
      }
      if (!isWithinOpeningHours(window, toHhMm(lab.open_time), toHhMm(lab.close_time))) {
        return fail(
          `${lab.name} is open from ${toHhMm(lab.open_time)} to ${toHhMm(lab.close_time)}. Pick a slot inside those hours.`,
          "validation",
        );
      }
    }

    // ------------------------------------------------------------ equipment
    let resourceDepartmentId = lab?.department_id ?? null;

    if (lines.length > 0) {
      const { data: equipmentRows } = await supabase
        .from("equipment")
        .select("id, name, lab_id, maintenance_status")
        .in("id", lines.map((line) => line.equipmentId));

      if (!equipmentRows || equipmentRows.length !== lines.length) {
        return fail("One of the selected equipment items no longer exists.", "not_found");
      }

      const blocked = equipmentRows.find(
        (row) => row.maintenance_status === "under_maintenance" || row.maintenance_status === "out_of_service",
      );
      if (blocked) {
        return fail(`${blocked.name} is under maintenance and cannot be booked right now.`, "validation");
      }

      if (!resourceDepartmentId) {
        const labIds = equipmentRows.map((row) => row.lab_id).filter((id): id is string => id !== null);
        if (labIds.length > 0) {
          const { data: hostLab } = await supabase
            .from("labs")
            .select("department_id")
            .in("id", labIds)
            .limit(1)
            .maybeSingle();
          resourceDepartmentId = hostLab?.department_id ?? null;
        }
      }

      const checked = await checkEquipmentLines(supabase, lines);
      if (checked.some((line) => !line.feasible)) {
        return fail(
          checked.find((line) => !line.feasible)?.message ?? "Not enough equipment available.",
          "conflict",
          { lines: checked },
        );
      }
    }

    // ---------------------------------------------------------------- rules
    const rules = await loadRules(supabase, resourceDepartmentId);
    const lateReturnCount = await countLateReturns(supabase, profile.id);

    const { data: restrictedCategories } = await supabase
      .from("equipment_categories")
      .select("id")
      .eq("requires_approval", true);
    const restrictedIds = new Set((restrictedCategories ?? []).map((category) => category.id));

    let includesRestrictedEquipment = false;
    if (lines.length > 0) {
      const { data: categories } = await supabase
        .from("equipment")
        .select("category_id")
        .in("id", lines.map((line) => line.equipmentId));
      includesRestrictedEquipment = (categories ?? []).some((row) => restrictedIds.has(row.category_id));
    }

    const totalEquipmentQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);

    const outcome = evaluateRules(
      {
        role: profile.role,
        window,
        expectedAttendees: input.expectedAttendees ?? 1,
        labCapacity: lab?.capacity ?? 9999,
        totalEquipmentQuantity,
        includesRestrictedEquipment,
        resourceDepartmentId: resourceDepartmentId ?? profile.department_id ?? "",
        userDepartmentId: profile.department_id,
        today: todayIso(),
        lateReturnCount,
      },
      rules,
    );

    if (!outcome.allowed) {
      const blocking = outcome.violations.find((violation) => violation.blocking);
      return fail(blocking?.message ?? "This request breaks a booking rule.", "validation");
    }

    // -------------------------------------------------------------- conflicts
    if (lab) {
      const { conflicts, alternatives, ranked } = await buildConflictAlternatives(
        supabase,
        profile,
        lab,
        window,
        input.requiredFacilities,
        input.expectedAttendees ?? 1,
      );

      if (conflicts.length > 0) {
        return fail(`${lab.name} is already booked for part of that window.`, "conflict", {
          conflicts,
          alternatives,
          ranked,
        });
      }
    }

    // -------------------------------------------------------------- priority
    const priority = scorePriority({
      role: profile.role,
      bookingDate: input.date,
      purpose: input.purpose,
      totalEquipmentQuantity,
      includesRestrictedEquipment,
      isWholeLabRequest: lab !== null && (input.expectedAttendees ?? 0) >= lab.capacity,
      today: todayIso(),
    });

    // ---------------------------------------------------------------- insert
    const { data: created, error: insertError } = await supabase
      .from("bookings")
      .insert({
        user_id: profile.id,
        resource_type: input.resourceType,
        lab_id: lab?.id ?? null,
        booking_date: input.date,
        start_time: input.start,
        end_time: input.end,
        purpose: input.purpose,
        expected_attendees: input.expectedAttendees ?? null,
        approval_status: "pending",
        booking_status: "pending_approval",
        priority_score: priority.score,
        priority_reason: priority.reasons.length > 0 ? priority.reasons.join(" · ") : null,
      })
      .select("id")
      .single();

    if (insertError || !created) {
      return fail(dbErrorMessage(insertError ?? {}, "Could not submit the request."));
    }

    if (lines.length > 0) {
      const { error: lineError } = await supabase.from("booking_equipment").insert(
        lines.map((line) => ({
          booking_id: created.id,
          equipment_id: line.equipmentId,
          quantity: line.quantity,
        })),
      );

      if (lineError) {
        // No transactions over PostgREST — remove the parent so a failed line
        // insert cannot leave a half-built request behind.
        await supabase.from("bookings").delete().eq("id", created.id);
        return fail(dbErrorMessage(lineError, "Could not reserve the equipment."));
      }
    }

    revalidateBookingSurfaces(created.id);
    return ok(
      { bookingId: created.id },
      outcome.requiresApproval
        ? "Request submitted — lab staff will review it shortly."
        : "Booking confirmed.",
    );
  } catch (error) {
    return toActionFailure(error, "Could not submit the booking.");
  }
}

// -----------------------------------------------------------------------------
// Cancel
// -----------------------------------------------------------------------------

const cancelSchema = z.object({
  bookingId: z.string().uuid(),
  reason: z.string().trim().max(300).optional(),
});

export async function cancelBooking(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const profile = await assertRole(ALL_ROLES);
    const parsed = cancelSchema.safeParse({
      bookingId: formData.get("bookingId"),
      reason: formData.get("reason") || undefined,
    });
    if (!parsed.success) return fail("That request was malformed.", "validation");

    const supabase = await createClient();
    const { data: booking } = await supabase
      .from("bookings")
      .select("id, user_id, lab_id, booking_date, start_time, end_time, booking_status")
      .eq("id", parsed.data.bookingId)
      .maybeSingle();

    if (!booking) return fail("Booking not found.", "not_found");

    const isOwner = booking.user_id === profile.id;
    if (!isOwner && !isStaffRole(profile.role)) {
      return fail("You can only cancel your own bookings.", "unauthorized");
    }
    if (isTerminal(booking.booking_status)) {
      return fail("This booking can no longer be cancelled.", "illegal_transition");
    }

    try {
      assertTransition(booking.booking_status, "cancelled");
    } catch (error) {
      return toActionFailure(error, "This booking cannot be cancelled at this stage.");
    }

    const wasActive = isActive(booking.booking_status);

    const { error: updateError } = await supabase
      .from("bookings")
      .update({
        booking_status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancel_reason: parsed.data.reason ?? (isOwner ? null : "Cancelled by lab staff"),
      })
      .eq("id", booking.id);

    if (updateError) return fail(dbErrorMessage(updateError, "Could not cancel the booking."));

    // An active booking was holding the slot — offer it to the waitlist head.
    if (wasActive && booking.lab_id) {
      const { error: rpcError } = await supabase.rpc("promote_waitlist", {
        p_lab: booking.lab_id,
        p_date: booking.booking_date,
        p_start: booking.start_time,
        p_end: booking.end_time,
      });
      if (rpcError) {
        // Promotion is a courtesy, not part of the cancellation contract.
        console.error("promote_waitlist failed:", rpcError.message);
      }
      revalidatePath(`/labs/${booking.lab_id}`);
    }

    if (!isOwner) {
      await supabase.rpc("notify_user", {
        target_user: booking.user_id,
        n_title: "Booking cancelled",
        n_body: parsed.data.reason
          ? `Your booking was cancelled: ${parsed.data.reason}`
          : "Your booking was cancelled by lab staff.",
        n_link: `/bookings/${booking.id}`,
        n_kind: "cancellation",
      });
    }

    revalidateBookingSurfaces(booking.id);
    revalidateWaitlistSurfaces();

    return ok(undefined, "Booking cancelled.");
  } catch (error) {
    return toActionFailure(error, "Could not cancel the booking.");
  }
}

// -----------------------------------------------------------------------------

function parseJsonField<T>(value: FormDataEntryValue | string | null, fallback: T): T {
  const raw = typeof value === "string" ? value : null;
  if (!raw || raw.trim() === "") return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
