// Password-reset helpers (task A3.4). Pure, so the proxy, the pages and the tests all share one
// definition of "must this person change their password before doing anything else?".
//
// The flag lives in the Supabase auth user's app_metadata (`must_reset_password`), NOT in a
// table: the data model has no such column and the brain forbids inventing schema. app_metadata
// can only be written with the admin API, which is exactly why it is used: a user can edit their
// own user_metadata, so a flag kept there could be cleared without changing the password.
//
// This is a process control, not a security boundary: it stops a flagged person using the app
// until they set a new password. Their existing token can still call the database directly until
// it expires, and RLS is unchanged (see D-031).

export const RESET_FLAG = "must_reset_password";

export function mustResetPassword(user: { app_metadata?: Record<string, unknown> | null } | null | undefined): boolean {
  return user?.app_metadata?.[RESET_FLAG] === true;
}

/** Everything a flagged user may still reach: the change-password page and the auth callback. */
export function allowedWhileFlagged(pathname: string): boolean {
  return pathname === "/set-password" || pathname.startsWith("/auth/");
}

/**
 * Where to go after the email link is verified. Only same-site paths: an attacker who crafts
 * ?next=https://evil.example must not be able to bounce a freshly signed-in user there.
 */
export function safeNext(next: string | null | undefined, fallback = "/set-password"): string {
  if (!next) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\") || /[\r\n]/.test(next)) return fallback;
  return next;
}
