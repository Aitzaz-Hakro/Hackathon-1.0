import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { Profile, UserRole } from "@/lib/types";

/** Every role, for call sites that accept anyone signed in. */
export const ALL_ROLES: UserRole[] = ["student", "faculty", "lab_staff", "coordinator", "admin"];

/** Roles that can approve requests and manage labs. */
export const STAFF_ROLES: UserRole[] = ["lab_staff", "coordinator", "admin"];

/** Roles that can see department-wide analytics and rules. */
export const COORDINATOR_ROLES: UserRole[] = ["coordinator", "admin"];

/**
 * The signed-in user's profile, or null.
 *
 * Uses `getUser()` rather than `getSession()`: `getSession()` reads the cookie
 * and does not verify it, so on the server its result must not be trusted.
 */
export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();

  return profile ?? null;
}

/**
 * For pages and layouts: redirects to the login screen when signed out.
 */
export async function requireUser(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  return profile;
}

/**
 * For pages and layouts: redirects when the signed-in user lacks one of
 * `roles`.
 *
 * This is a convenience, not a security boundary. Row Level Security and the
 * explicit check inside every Server Action are what actually enforce access —
 * a page redirect can be bypassed by POSTing to the action directly.
 */
export async function requireRole(roles: readonly UserRole[]): Promise<Profile> {
  const profile = await requireUser();
  if (!roles.includes(profile.role)) redirect("/dashboard");
  return profile;
}

export class AuthorizationError extends Error {
  constructor(message = "You do not have permission to perform this action.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

/**
 * For Server Actions: throws instead of redirecting, so the caller can convert
 * it into a form error.
 *
 * Server Functions are reachable by direct POST request, so every action must
 * call this regardless of what the UI shows.
 */
export async function assertRole(roles: readonly UserRole[]): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) throw new AuthorizationError("You must be signed in to do that.");
  if (!roles.includes(profile.role)) throw new AuthorizationError();
  if (!profile.is_active) throw new AuthorizationError("This account has been deactivated.");
  return profile;
}

export function isStaffRole(role: UserRole): boolean {
  return STAFF_ROLES.includes(role);
}
