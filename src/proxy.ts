import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Next.js 16 renamed Middleware to Proxy. The file lives at `src/proxy.ts`,
 * beside `src/app`, and must export `proxy` (or a default).
 *
 * Two jobs:
 *   1. Refresh the Supabase session on every request and write the rotated
 *      tokens back to the response. Without this, Server Components — which
 *      cannot set cookies — would let sessions expire mid-visit.
 *   2. Redirect signed-out users away from the authenticated area.
 *
 * The redirect here is an optimistic convenience only. It must never be the
 * sole gate: `requireRole` in pages and `assertRole` in Server Actions perform
 * the real check, because Proxy can be skipped and actions can be POSTed to
 * directly.
 *
 * The runtime is nodejs and cannot be changed.
 */

/** Reachable without signing in. */
const PUBLIC_PATHS = ["/", "/login", "/signup", "/auth"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Without credentials there is nothing to refresh. Let the request through
  // rather than 500 on every page — the missing-env error surfaces from the
  // Supabase clients instead, with a clearer message.
  if (!url || !anonKey) {
    return response;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        // Rebuild the request cookies, then the response, then attach the
        // refreshed tokens. Recreating the response is required because the
        // outgoing headers were already fixed by the time the client writes.
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }

        response = NextResponse.next({ request });

        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }

        // Cache-Control headers that stop a CDN or reverse proxy caching a
        // response carrying one user's session token and serving it to another.
        for (const [key, value] of Object.entries(headers)) {
          response.headers.set(key, value);
        }
      },
    },
  });

  // Must be called before the response is generated, or a token refresh
  // completing later cannot be written to `setAll` and is lost.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const publicPath = isPublicPath(pathname);

  if (!user && !publicPath) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    // Preserve where the user was heading so login can send them back.
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user && (pathname === "/login" || pathname === "/signup")) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    dashboardUrl.search = "";
    return NextResponse.redirect(dashboardUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Run on everything except Next internals and static assets.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
