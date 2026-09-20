import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Call a database function with a hand-written result type.
 *
 * Why this exists: generated types (src/types/database.ts) only know a function after its
 * migration is applied AND `npm run db:types` is re-run. Until then a typed .rpc() call will not
 * compile, which would block everyone who pulls the code before that. This wrapper compiles either
 * way, and keeps the cast in ONE place instead of scattering it.
 *
 * The function name and argument shape are still checked at runtime by Postgres, and each caller
 * states the result type it expects.
 */
export async function callRpc<T>(
  supabase: SupabaseClient<Database>,
  fn: string,
  args?: Record<string, unknown>,
): Promise<{ data: T | null; error: PostgrestError | null }> {
  const res = await supabase.rpc(fn as never, args as never);
  return { data: res.data as T | null, error: res.error };
}
