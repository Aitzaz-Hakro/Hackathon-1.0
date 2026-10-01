"use server";

import { z } from "zod";

import { STAFF_ROLES, assertRole } from "@/lib/auth";
import { assertTransition, isPending } from "@/lib/booking/status";
import { createClient } from "@/lib/supabase/server";
import {
  dbErrorMessage,
  fail,
  isLabConflict,
  ok,
  revalidateBookingSurfaces,
  toActionFailure,
  toHhMm,
  type ActionResult,
} from "./shared";

const bookingIdSchema = z.object({
  bookingId: z.string().uuid(),
});

/**
 * Approve a pending request.
 *
 * This is the write that flips a booking into an active state, so it is where
 * the `bookings_no_lab_overlap` EXCLUDE constraint and the equipment
 * availability trigger fire. A race with another approval is possible; the
 * resulting error is mapped to a message staff can act on.
 */
export async function approveBooking(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const profile = await assertRole(STAFF_ROLES);
    const parsed = bookingIdSchema.safeParse({ bookingId: formData.get("bookingId") });
    if (!parsed.success) return fail("That request was malformed.", "validation");

    const supabase = await createClient();
    const { data: booking } = await supabase
      .from("bookings")
      .select("id, user_id, booking_status, booking_date, start_time, end_time")
      .eq("id", parsed.data.bookingId)
      .maybeSingle();

    if (!booking) return fail("Booking not found.", "not_found");
    if (!isPending(booking.booking_status)) {
      return fail("This request has already been decided.", "illegal_transition");
    }

    try {
      assertTransition(booking.booking_status, "approved");
    } catch (error) {
      return toActionFailure(error, "This request cannot be approved.");
    }

    const { error } = await supabase
      .from("bookings")
      .update({
        approval_status: "approved",
        booking_status: "approved",
        approved_by: profile.id,
        approved_at: new Date().toISOString(),
        rejection_reason: null,
      })
      .eq("id", booking.id);

    if (error) {
      return fail(
        dbErrorMessage(error, "Could not approve the booking."),
        isLabConflict(error) ? "conflict" : "unknown",
      );
    }

    await supabase.rpc("notify_user", {
      target_user: booking.user_id,
      n_title: "Booking approved",
      n_body: `Your ${booking.booking_date} booking from ${toHhMm(booking.start_time)} to ${toHhMm(booking.end_time)} was approved.`,
      n_link: `/bookings/${booking.id}`,
      n_kind: "approval",
    });

    revalidateBookingSurfaces(booking.id);
    return ok(undefined, "Request approved.");
  } catch (error) {
    return toActionFailure(error, "Could not approve the booking.");
  }
}

export async function rejectBooking(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await assertRole(STAFF_ROLES);

    const parsed = bookingIdSchema
      .extend({
        reason: z.string().trim().min(3, "Give a short reason for the rejection.").max(300),
      })
      .safeParse({
        bookingId: formData.get("bookingId"),
        reason: formData.get("reason"),
      });

    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "That request was malformed.", "validation");
    }

    const supabase = await createClient();
    const { data: booking } = await supabase
      .from("bookings")
      .select("id, user_id, booking_status, booking_date, start_time, end_time")
      .eq("id", parsed.data.bookingId)
      .maybeSingle();

    if (!booking) return fail("Booking not found.", "not_found");
    if (!isPending(booking.booking_status)) {
      return fail("This request has already been decided.", "illegal_transition");
    }

    try {
      assertTransition(booking.booking_status, "rejected");
    } catch (error) {
      return toActionFailure(error, "This request cannot be rejected.");
    }

    const { error } = await supabase
      .from("bookings")
      .update({
        approval_status: "rejected",
        booking_status: "rejected",
        rejection_reason: parsed.data.reason,
      })
      .eq("id", booking.id);

    if (error) return fail(dbErrorMessage(error, "Could not reject the booking."));

    await supabase.rpc("notify_user", {
      target_user: booking.user_id,
      n_title: "Booking rejected",
      n_body: parsed.data.reason,
      n_link: `/bookings/${booking.id}`,
      n_kind: "rejection",
    });

    revalidateBookingSurfaces(booking.id);
    return ok(undefined, "Request rejected.");
  } catch (error) {
    return toActionFailure(error, "Could not reject the booking.");
  }
}
