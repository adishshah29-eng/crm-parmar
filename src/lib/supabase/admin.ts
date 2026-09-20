import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * THE ONE service-role client in the codebase (D-023). It exists only because creating,
 * banning and unbanning an AUTH user needs the Supabase admin API, which the anon key cannot do.
 *
 * Rules that keep this safe:
 *  - `import "server-only"` makes the build fail if a client component ever imports this file.
 *  - The key is read from SUPABASE_SERVICE_ROLE_KEY — never a NEXT_PUBLIC_ variable.
 *  - It is used for auth-user administration ONLY. Every table read or write still goes through
 *    the session-bound client, so RLS applies. Do not call .from() on this client.
 *  - Callers must have already verified the acting user is super_admin.
 */
export type AdminAuthClient = Pick<SupabaseClient["auth"]["admin"], "createUser" | "deleteUser" | "updateUserById">;

export function createAdminAuthClient(): AdminAuthClient | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!key || !url) return null; // not configured on this machine: user admin is unavailable

  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  // Hand back only the auth-admin methods, so nobody can reach for .from() with this key.
  return client.auth.admin;
}
