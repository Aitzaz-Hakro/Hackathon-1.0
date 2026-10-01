"use server";

import { z } from "zod";

import { ALL_ROLES, assertRole, isStaffRole } from "@/lib/auth";
import { isValidWindow, windowsOverlap, type ExistingBooking, type TimeWindow } from "@/lib/booking/availability";
import { createClient } from "@/lib/supabase/server";
import { fail, ok, revalidateWaitlistSurfaces, toActionFailure, toHhMm, type ActionResult } from "./shared";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const joinSchema = z.object({
  labId: z.string().uuid(),
  date: z.string().regex(DATE_RE),
  start: z.string().regex(TIME_RE),
  end: z.string().regex(TIME_RE),
});

export async function joinWaitlist(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const profile = await assertRole(ALL_ROLES);

    const parsed = joinSchema.safeParse({
      labId: formData.get("labId"),
      date: formData.get("date"),
      start: formData.get("start"),
      end: formData.get("end"),
    });
    if (!parsed.success) return fail("Pick a valid date and time.", "validation");

    const window: TimeWindow = { date: parsed.data.date, start: parsed.data.start, end: parsed.data.end };
    if (!isValidWindow(window)) return fail("The end time must be after the start time.", "validation");

    const supabase = await createClient();
    const { data: lab } = await supabase
      .from("labs")
      .select("id, name")
      .eq("id", parsed.data.labId)
      .maybeSingle();

    if (!lab) return fail("That lab could not be found.", "not_found");

    // Own rows are readable under RLS, so the duplicate check runs client-side
    // in effect — no elevated helper needed.
    const { data: mine } = await supabase
      .from("waitlist")
      .select("id, booking_date, start_time, end_time")
      .eq("user_id", profile.id)
      .eq("lab_id", lab.id)
      .eq("booking_date", window.date)
      .eq("status", "waiting");

    const alreadyWaiting = (mine ?? []).some((row) => {
      const entry: ExistingBooking = {
        id: row.id,
        date: row.booking_date,
        start: toHhMm(row.start_time),
        end: toHhMm(row.end_time),
      };
      return windowsOverlap(window, entry);
    });
    if (alreadyWaiting) return fail("You are already on the waitlist for that window.", "validation");

    // RLS hides other users' waitlist rows, so the count of people ahead comes
    // from a SECURITY DEFINER function. See 0005_availability_and_waitlist.sql.
    const { data: position } = await supabase.rpc("waitlist_position", {
      p_lab: lab.id,
      p_date: window.date,
      p_start: window.start,
      p_end: window.end,
    });

    const place = typeof position === "number" && position > 0 ? position : 1;

    const { error } = await supabase.from("waitlist").insert({
      user_id: profile.id,
      lab_id: lab.id,
      booking_date: window.date,
      start_time: window.start,
      end_time: window.end,
      position: place,
      status: "waiting",
    });

    if (error) return fail("Could not join the waitlist.");

    revalidateWaitlistSurfaces();
    return ok(undefined, `You are number ${place} in line for ${lab.name}.`);
  } catch (error) {
    return toActionFailure(error, "Could not join the waitlist.");
  }
}

export async function leaveWaitlist(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const profile = await assertRole(ALL_ROLES);

    const parsed = z
      .object({ waitlistId: z.string().uuid() })
      .safeParse({ waitlistId: formData.get("waitlistId") });
    if (!parsed.success) return fail("That entry was malformed.", "validation");

    const supabase = await createClient();
    const { data: entry } = await supabase
      .from("waitlist")
      .select("id, user_id, status")
      .eq("id", parsed.data.waitlistId)
      .maybeSingle();

    if (!entry) return fail("Waitlist entry not found.", "not_found");
    if (entry.user_id !== profile.id && !isStaffRole(profile.role)) {
      return fail("You can only remove your own waitlist entries.", "unauthorized");
    }
    if (entry.status !== "waiting") return fail("That entry is no longer active.", "validation");

    // Flipped rather than deleted so the history survives for analytics.
    const { error } = await supabase.from("waitlist").update({ status: "cancelled" }).eq("id", entry.id);
    if (error) return fail("Could not leave the waitlist.");

    revalidateWaitlistSurfaces();
    return ok(undefined, "Removed from the waitlist.");
  } catch (error) {
    return toActionFailure(error, "Could not leave the waitlist.");
  }
}
