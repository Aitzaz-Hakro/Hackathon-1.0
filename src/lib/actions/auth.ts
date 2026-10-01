"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { fail, ok, type ActionResult } from "./shared";

/**
 * Mirrors the password `scripts/seed-users.ts` prints for every demo account.
 * Kept server-side so the one-click role buttons never ship credentials in the
 * client bundle.
 */
const DEMO_PASSWORD = "hackathon123";

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
  next: z.string().optional(),
});

/** Only same-origin absolute paths — never an open redirect. */
function safeRedirectTarget(next: string | undefined): string {
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return "/dashboard";
}

export async function login(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  let destination = "/dashboard";

  try {
    const parsed = loginSchema.safeParse({
      email: formData.get("email"),
      password: formData.get("password"),
      next: formData.get("next") || undefined,
    });
    if (!parsed.success) return fail("Enter your email and password.", "validation");

    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });

    // One message for every failure — never reveal whether an email exists.
    if (error) return fail("Incorrect email or password.", "validation");

    destination = safeRedirectTarget(parsed.data.next);
  } catch {
    return fail("Could not sign you in right now. Please try again.");
  }

  revalidatePath("/", "layout");
  redirect(destination);
}

/** One-click demo sign-in for the seeded accounts. */
export async function demoLogin(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const email = formData.get("email");
    if (typeof email !== "string" || !email.includes("@")) {
      return fail("Unknown demo account.", "validation");
    }

    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password: DEMO_PASSWORD,
    });

    if (error) {
      return fail("The demo accounts have not been seeded yet. Run `npm run seed` first.", "validation");
    }
  } catch {
    return fail("Could not sign you in right now. Please try again.");
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

const signupSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name.").max(120),
  email: z.string().trim().email(),
  password: z.string().min(8, "Use at least 8 characters."),
});

export async function signup(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  let destination: string | null = null;

  try {
    const parsed = signupSchema.safeParse({
      fullName: formData.get("fullName"),
      email: formData.get("email"),
      password: formData.get("password"),
    });
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Check your details.", "validation");
    }

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      // `full_name` only — role is never taken from signup metadata, so nobody
      // can self-register as staff. See the `handle_new_user` trigger.
      options: { data: { full_name: parsed.data.fullName } },
    });

    if (error) return fail(error.message, "validation");

    if (data.session) {
      destination = "/dashboard";
    } else {
      // Email confirmation is enabled on the project: no session until the
      // link in the inbox is clicked.
      return ok(undefined, "Account created. Check your email for a confirmation link, then sign in.");
    }
  } catch {
    return fail("Could not create your account right now.");
  }

  revalidatePath("/", "layout");
  redirect(destination ?? "/dashboard");
}

export async function logout(): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch {
    // Nothing useful to tell the user — send them to the login screen anyway.
  }

  revalidatePath("/", "layout");
  redirect("/login");
}
