/**
 * Priority Recommendation for the staff approval queue.
 *
 * The rulebook asks the system to "help staff review urgent academic or
 * research requests". Staff see dozens of pending rows; this ranks them so the
 * ones that matter float to the top instead of being handled in submission
 * order.
 *
 * Deliberately explainable. A queue ordered by an opaque number is worse than
 * an unordered one, so every score carries the reasons that produced it and
 * those are shown on the card.
 */

import { daysBetween } from "./availability";

const WEIGHTS = {
  role: 40,
  urgency: 30,
  purpose: 20,
  scope: 10,
} as const;

export type PriorityInput = {
  role: "student" | "faculty" | "lab_staff" | "coordinator" | "admin";
  /** Date of the requested booking, `YYYY-MM-DD`. */
  bookingDate: string;
  purpose: string;
  /** Total equipment units on the request. */
  totalEquipmentQuantity: number;
  /** Any requested category needs explicit sign-off. */
  includesRestrictedEquipment: boolean;
  isWholeLabRequest: boolean;
  /** Today, `YYYY-MM-DD`. Injected to keep this pure. */
  today: string;
};

export type Priority = {
  /** 0..100. */
  score: number;
  band: "high" | "medium" | "normal";
  reasons: string[];
};

/**
 * Words that signal coursework with a hard deadline. Matched case-insensitively
 * as substrings, so "midterm exam" and "thesis defence" both hit.
 */
const URGENT_KEYWORDS = [
  "exam",
  "midterm",
  "final",
  "thesis",
  "defence",
  "defense",
  "viva",
  "deadline",
  "submission",
  "research",
  "project demo",
  "competition",
  "hackathon",
];

export function scorePriority(input: PriorityInput): Priority {
  const reasons: string[] = [];

  // Role. Faculty requests outrank student requests — the rulebook calls out
  // "Faculty priority booking" among its optional features.
  let roleScore = 0;
  if (input.role === "faculty") {
    roleScore = WEIGHTS.role;
    reasons.push("Submitted by faculty");
  } else if (input.role === "student") {
    roleScore = WEIGHTS.role * 0.25;
  }

  // Urgency. A booking today scores full marks and decays to zero over a
  // fortnight, matching the advance-booking windows in the seed rules.
  const daysAhead = Math.max(daysBetween(input.today, input.bookingDate), 0);
  const HORIZON_DAYS = 14;
  const urgencyRatio = daysAhead >= HORIZON_DAYS ? 0 : 1 - daysAhead / HORIZON_DAYS;
  const urgencyScore = urgencyRatio * WEIGHTS.urgency;
  if (daysAhead === 0) reasons.push("Needed today");
  else if (daysAhead <= 2) reasons.push(`Needed in ${daysAhead} day${daysAhead === 1 ? "" : "s"}`);

  // Purpose keywords.
  const haystack = input.purpose.toLowerCase();
  const hits = URGENT_KEYWORDS.filter((keyword) => haystack.includes(keyword));
  const purposeScore = hits.length === 0 ? 0 : Math.min(WEIGHTS.purpose, 10 + (hits.length - 1) * 5);
  if (hits.length > 0) {
    reasons.push(`Purpose mentions ${hits.slice(0, 3).join(", ")}`);
  }

  // Scope — large or restricted requests deserve a careful look rather than a
  // rubber stamp.
  let scopeScore = 0;
  if (input.includesRestrictedEquipment) {
    scopeScore += WEIGHTS.scope * 0.6;
    reasons.push("Includes equipment that needs sign-off");
  }
  if (input.totalEquipmentQuantity >= 5) {
    scopeScore += WEIGHTS.scope * 0.4;
    reasons.push(`${input.totalEquipmentQuantity} equipment units`);
  }
  if (input.isWholeLabRequest) {
    scopeScore += WEIGHTS.scope * 0.3;
    reasons.push("Reserves an entire lab");
  }

  const score = Math.round(roleScore + urgencyScore + purposeScore + Math.min(scopeScore, WEIGHTS.scope));

  return {
    score: Math.min(score, 100),
    band: score >= 70 ? "high" : score >= 40 ? "medium" : "normal",
    reasons,
  };
}

export const PRIORITY_LABELS: Record<Priority["band"], string> = {
  high: "High priority",
  medium: "Medium priority",
  normal: "Normal",
};
