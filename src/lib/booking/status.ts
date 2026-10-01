/**
 * Booking status state machine.
 *
 * Mirrors the `booking_status` enum in `supabase/migrations/0001_schema.sql`.
 * The rulebook lists the happy path as
 * Draft -> Pending Approval -> Approved -> Reserved -> In Use -> Completed,
 * plus the exception states Rejected, Cancelled, Overdue, Returned Late,
 * Damaged.
 *
 * Kept free of any Supabase import so it can be exercised in isolation.
 */

export const BOOKING_STATUSES = [
  "draft",
  "pending_approval",
  "approved",
  "reserved",
  "in_use",
  "completed",
  "rejected",
  "cancelled",
  "overdue",
  "returned_late",
  "damaged",
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const APPROVAL_STATUSES = ["pending", "approved", "rejected"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

/**
 * Legal transitions. Anything not listed here is rejected by
 * `assertTransition`, which the Server Actions call before writing.
 *
 * `completed` and `rejected` and `cancelled` are terminal.
 */
const TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  draft: ["pending_approval", "cancelled"],
  pending_approval: ["approved", "rejected", "cancelled"],
  approved: ["reserved", "in_use", "cancelled"],
  reserved: ["in_use", "overdue", "cancelled"],
  in_use: ["completed", "returned_late", "overdue", "damaged"],
  overdue: ["completed", "returned_late", "damaged"],
  returned_late: ["completed", "damaged"],
  damaged: ["completed"],
  completed: [],
  rejected: [],
  cancelled: [],
};

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function allowedTransitions(from: BookingStatus): readonly BookingStatus[] {
  return TRANSITIONS[from];
}

export class IllegalTransitionError extends Error {
  constructor(
    readonly from: BookingStatus,
    readonly to: BookingStatus,
  ) {
    super(`Cannot move a booking from "${from}" to "${to}".`);
    this.name = "IllegalTransitionError";
  }
}

export function assertTransition(from: BookingStatus, to: BookingStatus): void {
  if (!canTransition(from, to)) {
    throw new IllegalTransitionError(from, to);
  }
}

/**
 * Statuses that occupy the resource. These are exactly the statuses covered by
 * the `bookings_no_lab_overlap` EXCLUDE constraint and counted by the
 * `equipment_availability` view — keep the three in step.
 */
const ACTIVE: readonly BookingStatus[] = ["approved", "reserved", "in_use", "overdue"];

export function isActive(status: BookingStatus): boolean {
  return ACTIVE.includes(status);
}

export function isTerminal(status: BookingStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

/** Still awaiting a decision — surfaced in the staff approval queue. */
export function isPending(status: BookingStatus): boolean {
  return status === "pending_approval" || status === "draft";
}

export function isOverdueCandidate(status: BookingStatus): boolean {
  return status === "in_use" || status === "reserved";
}

/** Human-facing labels. */
export const STATUS_LABELS: Record<BookingStatus, string> = {
  draft: "Draft",
  pending_approval: "Pending approval",
  approved: "Approved",
  reserved: "Reserved",
  in_use: "In use",
  completed: "Completed",
  rejected: "Rejected",
  cancelled: "Cancelled",
  overdue: "Overdue",
  returned_late: "Returned late",
  damaged: "Damaged",
};

/**
 * Tone drives the status badge colour in the UI. Kept next to the status
 * definitions so the two never drift apart.
 */
export type StatusTone = "neutral" | "info" | "violet" | "warning" | "success" | "danger";

export const STATUS_TONES: Record<BookingStatus, StatusTone> = {
  draft: "neutral",
  pending_approval: "warning",
  approved: "info",
  reserved: "info",
  in_use: "violet",
  completed: "success",
  rejected: "danger",
  cancelled: "neutral",
  overdue: "danger",
  returned_late: "warning",
  damaged: "danger",
};
