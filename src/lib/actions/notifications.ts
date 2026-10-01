"use server";

import { revalidatePath } from "next/cache";

import { ALL_ROLES, assertRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fail, ok, toActionFailure, type ActionResult } from "./shared";

/**
 * Marks every unread notification for the caller as read. RLS already limits
 * the update to the caller's own rows.
 */
export async function markAllNotificationsRead(): Promise<ActionResult> {
  try {
    const profile = await assertRole(ALL_ROLES);
    const supabase = await createClient();

    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", profile.id)
      .eq("is_read", false);

    if (error) return fail("Could not update your notifications.");

    revalidatePath("/", "layout");
    return ok(undefined, "Notifications marked as read.");
  } catch (error) {
    return toActionFailure(error, "Could not update your notifications.");
  }
}
