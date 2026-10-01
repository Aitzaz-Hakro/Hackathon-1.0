"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { STAFF_ROLES, assertRole } from "@/lib/auth";
import { canTransition, type BookingStatus } from "@/lib/booking/status";
import { createClient } from "@/lib/supabase/server";
import type { ReturnCondition } from "@/lib/types";
import {
  dbErrorMessage,
  fail,
  ok,
  revalidateIssuesSurfaces,
  toActionFailure,
  toHhMm,
  type ActionResult,
} from "./shared";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Human-readable checkout code. Doubles as the QR payload and the manual
 * fallback. Ambiguous characters (0/O, 1/I) are left out so it can be typed
 * from a sticker.
 */
function makeCheckoutCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let code = "";
  for (const byte of bytes) code += alphabet[byte % alphabet.length];
  return `LAB-${code}`;
}

const bookingIdSchema = z.object({ bookingId: z.string().uuid() });

/**
 * Issue equipment (or grant lab access) for an approved booking.
 *
 * For each requested line an `issues` row is created carrying the checkout
 * code, and the booking moves to `in_use`. Lab-only bookings have no lines —
 * the same action just marks the session open.
 */
export async function issueBooking(
  _previous: ActionResult<{ issueCount: number }> | null,
  formData: FormData,
): Promise<ActionResult<{ issueCount: number }>> {
  try {
    const profile = await assertRole(STAFF_ROLES);

    const parsed = bookingIdSchema.safeParse({ bookingId: formData.get("bookingId") });
    if (!parsed.success) return fail("That request was malformed.", "validation");

    const supabase = await createClient();
    const { data: booking } = await supabase
      .from("bookings")
      .select("id, user_id, booking_status, booking_date, start_time, end_time, purpose")
      .eq("id", parsed.data.bookingId)
      .maybeSingle();

    if (!booking) return fail("Booking not found.", "not_found");
    if (booking.booking_status !== "approved" && booking.booking_status !== "reserved") {
      return fail("Only approved or reserved bookings can be issued.", "illegal_transition");
    }

    const { data: lines } = await supabase
      .from("booking_equipment")
      .select("equipment_id, quantity")
      .eq("booking_id", booking.id);

    const { error: statusError } = await supabase
      .from("bookings")
      .update({ booking_status: "in_use" })
      .eq("id", booking.id);

    if (statusError) return fail(dbErrorMessage(statusError, "Could not issue this booking."));

    let issueCount = 0;

    if (lines && lines.length > 0) {
      const issuedAt = new Date();
      // Equipment leaves with the session — due when the booking window ends.
      const dueAt = new Date(`${booking.booking_date}T${toHhMm(booking.end_time)}:00`);

      const { error: issueError } = await supabase.from("issues").insert(
        lines.map((line) => ({
          booking_id: booking.id,
          equipment_id: line.equipment_id,
          quantity: line.quantity,
          issued_at: issuedAt.toISOString(),
          due_at: dueAt.toISOString(),
          issued_by: profile.id,
          checkout_code: makeCheckoutCode(),
        })),
      );

      if (issueError) {
        // Undo the status flip — without issue rows the desk has nothing to
        // work from, and Supabase's REST layer has no transactions to lean on.
        await supabase.from("bookings").update({ booking_status: booking.booking_status }).eq("id", booking.id);
        return fail(dbErrorMessage(issueError, "Could not record the issued equipment."));
      }

      issueCount = lines.length;
    }

    await supabase.rpc("notify_user", {
      target_user: booking.user_id,
      n_title: issueCount > 0 ? "Equipment issued" : "Lab access granted",
      n_body:
        issueCount > 0
          ? `${issueCount} item line${issueCount === 1 ? "" : "s"} issued for your ${booking.booking_date} session. Return by ${toHhMm(booking.end_time)}.`
          : `Your reservation on ${booking.booking_date} is now open. Please check in at the lab desk.`,
      n_link: `/bookings/${booking.id}`,
      n_kind: "issue",
    });

    revalidateIssuesSurfaces(booking.id);
    return ok({ issueCount }, "Issued.");
  } catch (error) {
    return toActionFailure(error, "Could not issue this booking.");
  }
}

const returnSchema = z.object({
  issueId: z.string().uuid(),
  condition: z.enum(["good", "fair", "damaged", "missing_parts", "not_returned"]),
  remarks: z.string().trim().max(500).optional(),
  // A downscaled data URL produced client-side. Capped well under the 1MB
  // Server Action body limit.
  damageImage: z.string().max(400_000).optional(),
});

/** Conditions that count as damage for the analytics and the item's counter. */
const DAMAGING: readonly ReturnCondition[] = ["damaged", "missing_parts", "not_returned"];

export async function recordReturn(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const profile = await assertRole(STAFF_ROLES);

    const parsed = returnSchema.safeParse({
      issueId: formData.get("issueId"),
      condition: formData.get("condition"),
      remarks: formData.get("remarks") || undefined,
      damageImage: formData.get("damageImage") || undefined,
    });
    if (!parsed.success) return fail("Pick a return condition.", "validation");

    const supabase = await createClient();
    const { data: issue } = await supabase
      .from("issues")
      .select("id, booking_id, equipment_id, returned_at")
      .eq("id", parsed.data.issueId)
      .maybeSingle();

    if (!issue) return fail("Issue record not found.", "not_found");
    if (issue.returned_at) return fail("This item has already been returned.", "validation");

    const { data: booking } = await supabase
      .from("bookings")
      .select("id, user_id, booking_status")
      .eq("id", issue.booking_id)
      .maybeSingle();

    if (!booking) return fail("Booking not found.", "not_found");

    const { error: returnError } = await supabase
      .from("issues")
      .update({
        returned_at: new Date().toISOString(),
        return_condition: parsed.data.condition,
        remarks: parsed.data.remarks ?? null,
        damage_image_url: parsed.data.damageImage ?? null,
        received_by: profile.id,
      })
      .eq("id", issue.id);

    if (returnError) return fail(dbErrorMessage(returnError, "Could not record the return."));

    if (DAMAGING.includes(parsed.data.condition)) {
      await bumpDamageCount(supabase, issue.equipment_id);
    }

    // The booking only closes once every line is back. Then its final status
    // reflects the worst outcome across the lines.
    const { data: remaining } = await supabase
      .from("issues")
      .select("id")
      .eq("booking_id", booking.id)
      .is("returned_at", null);

    let outcome: BookingStatus | null = null;

    if ((remaining ?? []).length === 0) {
      const { data: all } = await supabase
        .from("issues")
        .select("return_condition, returned_at, due_at")
        .eq("booking_id", booking.id);

      const damaged = (all ?? []).some(
        (row) => row.return_condition !== null && DAMAGING.includes(row.return_condition),
      );
      const late = (all ?? []).some(
        (row) => row.returned_at !== null && row.due_at !== null && row.returned_at > row.due_at,
      );

      const target: BookingStatus = damaged ? "damaged" : late ? "returned_late" : "completed";

      if (canTransition(booking.booking_status, target)) {
        await supabase
          .from("bookings")
          .update({
            booking_status: target,
            completed_at: target === "completed" ? new Date().toISOString() : null,
          })
          .eq("id", booking.id);
      }

      outcome = target;
    }

    await supabase.rpc("notify_user", {
      target_user: booking.user_id,
      n_title:
        outcome === "damaged"
          ? "Equipment returned with damage"
          : outcome === "returned_late"
            ? "Equipment returned late"
            : "Equipment returned",
      n_body:
        parsed.data.remarks ??
        (outcome === "damaged"
          ? "Damage was recorded on your return. Please contact the lab desk."
          : "Thanks — your return is recorded."),
      n_link: `/bookings/${booking.id}`,
      n_kind: "return",
    });

    revalidateIssuesSurfaces(booking.id);
    revalidatePath("/equipment");
    if (issue.equipment_id) revalidatePath(`/equipment/${issue.equipment_id}`);

    return ok(undefined, outcome === "damaged" ? "Return recorded with damage." : "Return recorded.");
  } catch (error) {
    return toActionFailure(error, "Could not record the return.");
  }
}

/** Read-modify-write on the counter; races are irrelevant at demo scale. */
async function bumpDamageCount(supabase: Supabase, equipmentId: string): Promise<void> {
  const { data: equipment } = await supabase
    .from("equipment")
    .select("damage_count")
    .eq("id", equipmentId)
    .maybeSingle();

  if (equipment) {
    await supabase
      .from("equipment")
      .update({ damage_count: equipment.damage_count + 1 })
      .eq("id", equipmentId);
  }
}
