/**
 * Shared plumbing for Server Actions.
 *
 * Deliberately NOT a `'use server'` module: `'use server'` files may only
 * export async functions, and actions need shared types plus synchronous
 * helpers like `fail()` and the Postgres error mapping.
 *
 * Every action returns an `ActionResult` instead of throwing, so forms can
 * render failures through `useActionState` without a try/catch.
 */

import { revalidatePath } from "next/cache";

import { AuthorizationError } from "@/lib/auth";
import { IllegalTransitionError } from "@/lib/booking/status";

export type ActionErrorCode =
  | "unauthorized"
  | "validation"
  | "conflict"
  | "not_found"
  | "illegal_transition"
  | "unknown";

export type ActionResult<T = undefined> = {
  ok: boolean;
  /** Success copy for a toast or inline confirmation. */
  message?: string;
  /** Human-readable failure copy, safe to show the user. */
  error?: string;
  code?: ActionErrorCode;
  /**
   * Optional payload. Carried on success (e.g. the new booking id) and on some
   * failures (e.g. ranked alternatives when a slot is taken).
   */
  data?: T;
};

export function ok<T>(data?: T, message?: string): ActionResult<T> {
  return { ok: true, data, message };
}

/**
 * `never` by default so a payload-less failure is assignable to any
 * `ActionResult<T>` — callers should not have to spell out the generic just to
 * return a plain error.
 */
export function fail<T = never>(
  error: string,
  code: ActionErrorCode = "unknown",
  data?: T,
): ActionResult<T> {
  return { ok: false, error, code, data };
}

// -----------------------------------------------------------------------------
// Postgres error mapping
//
// The EXCLUDE constraint and the equipment trigger raise raw Postgres errors.
// A race between the app's pre-check and the write would otherwise show the
// user a database string.
// -----------------------------------------------------------------------------

export type DbError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
};

/** `bookings_no_lab_overlap` — two active bookings in one slot. */
export function isLabConflict(error: DbError): boolean {
  if (error.code === "23P01") return true;
  const message = (error.message ?? "").toLowerCase();
  return (
    message.includes("bookings_no_lab_overlap") ||
    message.includes("conflicting key value violates exclusion constraint")
  );
}

/** The `check_equipment_availability` / `check_booking_activation` triggers. */
export function isEquipmentConflict(error: DbError): boolean {
  return /insufficient equipment|cannot approve: only/i.test(error.message ?? "");
}

export function dbErrorMessage(error: DbError, fallback: string): string {
  if (isLabConflict(error)) {
    return "That slot was taken moments ago — someone else got there first. Pick another time or lab.";
  }
  // Trigger messages are written for humans; surface them as-is.
  if (isEquipmentConflict(error) && error.message) {
    return error.message;
  }
  return fallback;
}

/**
 * Converts an unexpected throw into a safe failure. Never leaks a raw database
 * error to the client.
 */
export function toActionFailure(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): ActionResult<never> {
  if (error instanceof AuthorizationError) return fail(error.message, "unauthorized");
  if (error instanceof IllegalTransitionError) return fail(error.message, "illegal_transition");
  return fail(fallback);
}

/**
 * `YYYY-MM-DD` in UTC, matching the booking engine's date arithmetic and the
 * seed script. Deviating here would make "today" disagree with `daysBetween`.
 */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Normalises a Postgres `time` value (`HH:MM:SS`) to `HH:MM`. */
export function toHhMm(value: string): string {
  return value.slice(0, 5);
}

/**
 * Refreshes every surface a booking mutation can affect. Called from actions
 * after the write so the current page re-renders in the same round trip.
 */
export function revalidateBookingSurfaces(bookingId?: string): void {
  revalidatePath("/dashboard");
  revalidatePath("/bookings");
  revalidatePath("/approvals");
  if (bookingId) revalidatePath(`/bookings/${bookingId}`);
}

export function revalidateIssuesSurfaces(bookingId?: string): void {
  revalidatePath("/issues");
  revalidatePath("/dashboard");
  revalidatePath("/bookings");
  if (bookingId) revalidatePath(`/bookings/${bookingId}`);
}

export function revalidateWaitlistSurfaces(): void {
  revalidatePath("/waitlist");
  revalidatePath("/dashboard");
}
