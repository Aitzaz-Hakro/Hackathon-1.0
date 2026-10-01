import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "@/lib/types";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 *
 * A new client is created per request and never shared — the docs are explicit
 * that reusing one across requests leaks session state between users.
 *
 * Unlike the proxy, a Server Component cannot write response cookies or
 * headers, so the `setAll` writes are wrapped in a try/catch. That is safe
 * because `src/proxy.ts` refreshes the session on every request; without that
 * proxy, silently swallowing this error would cause random logouts.
 */
export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env.local and fill it in.",
    );
  }

  const cookieStore = await cookies();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Thrown when called from a Server Component, where cookies are
          // read-only. Harmless here: the proxy already refreshed the session
          // and wrote the new tokens to the response.
        }
      },
    },
  });
}
