import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { fail, ok, type ActionResult } from "@/types/action";
import type { Actor } from "@/lib/org/mutations";
import { bulkAssignSchema, reassignSchema } from "@/lib/schemas/assign";
import { callRpc } from "@/lib/supabase/rpc";

// Admin-level assignment (task A2.3): "where an admin assigns leads down to managers".
//
// Deliberately admin-only. Arisha's B2.1 adds the MANAGER version with the scope rule ("within
// your own scope"), and should reuse public.move_leads through this file rather than write its own.
//
// Everything runs through public.move_leads(): one transaction, ownership history written,
// new owner notified, and the 45-minute SLA restarted for live leads exactly as
// app.assign_lead() does. The database function is the permission boundary (admins only); the
// actor check here is a better error message.

type Client = SupabaseClient<Database>;

const ONLY_ADMIN = "Only admins can assign leads from here.";
const MIGRATION_MISSING = "Assigning leads needs migration 0007, which has not been applied to this database. Ask Adish to run db push.";

const isAdmin = (a: Actor) => a.role === "super_admin" || a.role === "admin";

async function move(
  supabase: Client,
  leadIds: string[],
  toUserId: string,
  reason: "manual" | "escalation",
): Promise<ActionResult<{ moved: number; skipped: number }>> {
  const unique = [...new Set(leadIds)];
  const { data, error } = await callRpc<number>(supabase, "move_leads", {
    p_moves: unique.map((lead) => ({ lead, to: toUserId })),
    p_reason: reason,
    p_restart_sla: true,
  });
  if (error) {
    console.error("[assign] move_leads failed:", error.code, error.message);
    if (error.code === "PGRST202") return fail(MIGRATION_MISSING);
    if (error.code === "42501") return fail(ONLY_ADMIN);
    if (error.code === "22023") return fail("That person cannot take leads. Pick an active manager, sub manager or caller.");
    return fail("Could not assign the leads. Nothing was changed.");
  }
  const moved = Number(data ?? 0);
  // Not an error: the rest were already theirs, or no longer exist.
  return ok({ moved, skipped: unique.length - moved });
}

export async function bulkAssignCore(supabase: Client, actor: Actor, rawInput: unknown): Promise<ActionResult<{ moved: number; skipped: number }>> {
  if (!isAdmin(actor)) return fail(ONLY_ADMIN);
  const parsed = bulkAssignSchema.safeParse(rawInput);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the selection and try again.");
  return move(supabase, parsed.data.leadIds, parsed.data.toUserId, parsed.data.reason ?? "manual");
}

export async function reassignCore(supabase: Client, actor: Actor, rawInput: unknown): Promise<ActionResult<null>> {
  if (!isAdmin(actor)) return fail(ONLY_ADMIN);
  const parsed = reassignSchema.safeParse(rawInput);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form and try again.");

  const result = await move(supabase, [parsed.data.leadId], parsed.data.toUserId, parsed.data.reason ?? "manual");
  if (!result.ok) return result;
  if (result.data.moved === 0) return fail("That lead already belongs to them, or no longer exists.");
  return ok(null);
}
