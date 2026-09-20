import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { allowedWhileFlagged, mustResetPassword } from "@/lib/auth-flags";

/** Paths reachable without a session. Everything else requires login. */
const PUBLIC_PATHS = ["/login", "/reset-password", "/auth/confirm"];

const isPublic = (pathname: string) =>
  PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

/**
 * Refreshes the Supabase session cookie, redirects unauthenticated requests to
 * /login, and signs out any user whose row has is_active = false.
 * Called from src/proxy.ts on every request.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() validates the JWT with Supabase; getSession() would only read the cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user) {
    if (isPublic(pathname)) return response;
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // A deactivated user is signed out immediately (users_select lets a user read their own row).
  const { data: profile } = await supabase
    .from("users")
    .select("is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (profile && profile.is_active === false) {
    await supabase.auth.signOut();
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "?error=deactivated";
    return NextResponse.redirect(url);
  }

  // A super admin can require a password change (task A3.4). Until it is done, the only places a
  // flagged user can reach are the change-password page and the auth callback. Because the proxy
  // sees every request, this also stops a flagged session from calling server actions elsewhere.
  if (mustResetPassword(user) && !allowedWhileFlagged(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/set-password";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
