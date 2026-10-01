/**
 * Booking rule enforcement.
 *
 * The rulebook requires universities to be able to define Maximum booking
 * duration, Maximum equipment quantity, Advance booking limit,
 * Approval required for certain equipment, Department-specific access, and
 * Penalty after repeated late returns.
 *
 * Rules live per department in the `booking_rules` table. This module is the
 * single place that decides whether a request is legal, so the UI and the
 * Server Action cannot disagree.
 */

import { daysBetween, durationMinutes, toMinutes, type TimeWindow } from "./availability";

export type BookingRuleSet = {
  departmentId: string;
  maxDurationMinutes: number;
  maxEquipmentQuantity: number;
  advanceBookingDays: number;
  requiresApproval: boolean;
  allowStudentBooking: boolean;
};

export type RuleContext = {
  /** Role of the person making the request. */
  role: "student" | "faculty" | "lab_staff" | "coordinator" | "admin";
  window: TimeWindow;
  expectedAttendees: number;
  labCapacity: number;
  /** Total units across every equipment line on the request. */
  totalEquipmentQuantity: number;
  /** True when any requested category is marked `requires_approval`. */
  includesRestrictedEquipment: boolean;
  /** Department the lab or equipment belongs to. */
  resourceDepartmentId: string;
  /** Department the requester belongs to, if any. */
  userDepartmentId: string | null;
  /** Today, `YYYY-MM-DD`. Injected so this stays a pure function. */
  today: string;
  /** Count of the user's past late returns, for the penalty rule. */
  lateReturnCount?: number;
};

export type RuleViolation = {
  code: string;
  message: string;
  /** Blocks the request outright, rather than merely forcing approval. */
  blocking: boolean;
};

export type RuleOutcome = {
  /** No blocking violations. */
  allowed: boolean;
  violations: RuleViolation[];
  /** Approval needed even when the department would auto-approve. */
  requiresApproval: boolean;
};

/** Above this many late returns, a student needs staff sign-off. */
export const LATE_RETURN_THRESHOLD = 3;

export function evaluateRules(context: RuleContext, rules: BookingRuleSet): RuleOutcome {
  const violations: RuleViolation[] = [];

  const duration = durationMinutes(context.window);

  if (duration <= 0) {
    violations.push({
      code: "INVALID_WINDOW",
      message: "The end time must be after the start time.",
      blocking: true,
    });
  }

  if (duration > rules.maxDurationMinutes) {
    violations.push({
      code: "MAX_DURATION",
      message: `Bookings in this department are limited to ${formatDuration(rules.maxDurationMinutes)}. You requested ${formatDuration(duration)}.`,
      blocking: true,
    });
  }

  const daysAhead = daysBetween(context.today, context.window.date);

  if (daysAhead < 0) {
    violations.push({
      code: "IN_PAST",
      message: "That date has already passed.",
      blocking: true,
    });
  }

  if (daysAhead > rules.advanceBookingDays) {
    violations.push({
      code: "ADVANCE_LIMIT",
      message: `Bookings can be made at most ${rules.advanceBookingDays} days in advance. That date is ${daysAhead} days away.`,
      blocking: true,
    });
  }

  if (context.role === "student" && !rules.allowStudentBooking) {
    violations.push({
      code: "STUDENT_NOT_ALLOWED",
      message: "This department does not accept student bookings. Ask a faculty member to submit the request.",
      blocking: true,
    });
  }

  if (
    context.userDepartmentId !== null &&
    context.userDepartmentId !== context.resourceDepartmentId &&
    context.role !== "admin" &&
    context.role !== "coordinator"
  ) {
    violations.push({
      code: "DEPARTMENT_ACCESS",
      message: "You can only book resources belonging to your own department.",
      blocking: true,
    });
  }

  if (context.totalEquipmentQuantity > rules.maxEquipmentQuantity) {
    violations.push({
      code: "MAX_QUANTITY",
      message: `At most ${rules.maxEquipmentQuantity} equipment units may be requested at once. You asked for ${context.totalEquipmentQuantity}.`,
      blocking: true,
    });
  }

  if (context.expectedAttendees > context.labCapacity) {
    violations.push({
      code: "CAPACITY_EXCEEDED",
      message: `That lab seats ${context.labCapacity}, but ${context.expectedAttendees} attendees were given.`,
      blocking: true,
    });
  }

  const lateReturns = context.lateReturnCount ?? 0;
  if (lateReturns >= LATE_RETURN_THRESHOLD && context.role === "student") {
    violations.push({
      code: "LATE_RETURN_PENALTY",
      message: `You have ${lateReturns} late returns on record. This request needs staff approval.`,
      blocking: false,
    });
  }

  // Approval is forced by department policy, restricted equipment, or the
  // late-return penalty. Restricted categories are flagged in the seed data as
  // `equipment_categories.requires_approval`.
  const requiresApproval =
    rules.requiresApproval ||
    context.includesRestrictedEquipment ||
    (lateReturns >= LATE_RETURN_THRESHOLD && context.role === "student") ||
    context.role === "student";

  return {
    allowed: violations.every((violation) => !violation.blocking),
    violations,
    requiresApproval,
  };
}

/** Confine a window to the lab's opening hours. */
export function isWithinOpeningHours(
  window: TimeWindow,
  openTime: string,
  closeTime: string,
): boolean {
  return toMinutes(window.start) >= toMinutes(openTime) && toMinutes(window.end) <= toMinutes(closeTime);
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `${remainder} min`;
  if (remainder === 0) return `${hours} hr`;
  return `${hours} hr ${remainder} min`;
}
