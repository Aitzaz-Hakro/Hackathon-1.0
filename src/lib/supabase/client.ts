import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/lib/types";

/**
 * Supabase client for Client Components.
 *
 * `createBrowserClient` memoises internally, so calling this in several
 * components still yields one underlying client.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env.local and fill it in.",
    );
  }

  return createBrowserClient<Database>(url, anonKey);
}
