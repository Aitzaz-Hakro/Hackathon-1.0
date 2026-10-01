import { z } from "zod";

import type { BookingStatus } from "@/lib/booking/status";

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * The model's answer. Every field carries a `.catch()` fallback so a single
 * off field (or a schema-compliant but odd response) degrades gracefully
 * instead of failing the whole parse.
 */
export const extractionSchema = z.object({
  labHint: z.string().max(200).nullable().catch(null),
  date: z.string().regex(DATE_RE).nullable().catch(null),
  start: z.string().regex(TIME_RE).nullable().catch(null),
  end: z.string().regex(TIME_RE).nullable().catch(null),
  purpose: z.string().trim().min(1).max(200).catch("Lab session"),
  expectedAttendees: z.number().int().min(1).max(500).nullable().catch(null),
  equipment: z
    .array(
      z.object({
        nameHint: z.string().max(200),
        quantity: z.number().int().min(1).max(100).catch(1),
      }),
    )
    .max(10)
    .catch([]),
  needsClarification: z.boolean().catch(false),
  clarificationQuestion: z.string().max(300).nullable().catch(null),
});

export type AssistantExtraction = z.infer<typeof extractionSchema>;

/** Response schema sent to Gemini (subset of JSON Schema the API supports). */
export const responseJsonSchema = {
  type: "object",
  properties: {
    labHint: {
      type: ["string", "null"],
      description: "Exact lab name or code from the provided list, or null when no lab was mentioned.",
    },
    date: {
      type: ["string", "null"],
      description: "Booking date as YYYY-MM-DD, or null when it cannot be inferred.",
    },
    start: { type: ["string", "null"], description: "Start time as HH:MM (24h), or null." },
    end: { type: ["string", "null"], description: "End time as HH:MM (24h), or null." },
    purpose: { type: "string", description: "Short summary of the stated reason, 3-200 characters." },
    expectedAttendees: { type: ["integer", "null"], description: "Stated attendee count, or null." },
    equipment: {
      type: "array",
      description: "Equipment items requested, matched to the provided list.",
      items: {
        type: "object",
        properties: {
          nameHint: { type: "string", description: "Exact equipment name from the provided list." },
          quantity: { type: "integer", description: "Requested quantity, default 1." },
        },
        required: ["nameHint", "quantity"],
      },
    },
    needsClarification: {
      type: "boolean",
      description: "True only when the resource or the date/time truly cannot be inferred.",
    },
    clarificationQuestion: {
      type: ["string", "null"],
      description: "One short question when needsClarification is true, otherwise null.",
    },
  },
  required: [
    "labHint",
    "date",
    "start",
    "end",
    "purpose",
    "expectedAttendees",
    "equipment",
    "needsClarification",
    "clarificationQuestion",
  ],
} as const;

export type PromptLab = { name: string; code: string; capacity: number };
export type PromptEquipment = { name: string; categoryName: string };

export function buildPrompt(input: {
  text: string;
  today: string;
  weekday: string;
  labs: PromptLab[];
  equipment: PromptEquipment[];
}): string {
  const labLines = input.labs.map((lab) => `- ${lab.name} (code ${lab.code}, ${lab.capacity} seats)`).join("\n");
  const equipmentLines = input.equipment.map((item) => `- ${item.name} (${item.categoryName})`).join("\n");

  return [
    "You convert a university lab and equipment booking request into JSON.",
    `Today is ${input.weekday}, ${input.today} (UTC). Resolve relative dates like "tomorrow", "Friday" or "next week" to the next matching calendar date on or after today.`,
    "",
    "Labs that exist:",
    labLines || "- (none)",
    "",
    "Equipment that exists:",
    equipmentLines || "- (none)",
    "",
    "Rules:",
    '- date as "YYYY-MM-DD"; times as "HH:MM" in 24-hour form.',
    "- If the start time is given but the end time is missing, assume the start plus 2 hours.",
    "- labHint must be an exact lab name or code from the list above, or null when no lab is mentioned.",
    "- nameHint must be an exact equipment name from the list above. Quantities default to 1.",
    '- purpose is a short summary of the stated reason (3-200 characters). If none is stated, use "Lab session".',
    "- Only set needsClarification true when the lab/resource or the date/time truly cannot be inferred; then ask one short question and leave the unclear fields null. If only a specific equipment item cannot be matched, do not ask a question — omit it from the list and keep the rest.",
    "- Never invent labs, equipment, dates or times.",
    "",
    `User request: """${input.text}"""`,
  ].join("\n");
}

// -----------------------------------------------------------------------------
// Result shape returned by the server action and rendered by the assistant UI.
// -----------------------------------------------------------------------------

export type AssistantLabOption = { id: string; name: string };
export type AssistantConflict = { date: string; start: string; end: string; status: BookingStatus };
export type AssistantSlot = { date: string; start: string; end: string };
export type AssistantRankedLab = {
  labId: string;
  name: string;
  matchPercent: number;
  isFree: boolean;
  reasons: string[];
};
export type AssistantEquipmentLine = {
  equipmentId: string;
  name: string;
  requestedQuantity: number;
  availableQuantity: number;
  totalQuantity: number;
  feasible: boolean;
  suggestedQuantity: number;
  message: string;
};

export type AssistantResult = {
  lab: AssistantLabOption | null;
  labCandidates: AssistantLabOption[];
  date: string | null;
  start: string | null;
  end: string | null;
  purpose: string;
  attendees: number | null;
  isFree: boolean | null;
  withinOpenHours: boolean | null;
  conflicts: AssistantConflict[];
  alternatives: AssistantSlot[];
  ranked: AssistantRankedLab[];
  equipment: AssistantEquipmentLine[];
  unmatchedEquipment: string[];
  needsClarification: boolean;
  clarificationQuestion: string | null;
  wizardUrl: string | null;
};
