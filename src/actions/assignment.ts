"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { bulkAssignCore, reassignCore } from "@/lib/leads/assign";
import { fail, type ActionResult } from "@/types/action";
import type { BulkAssignInput, ReassignInput } from "@/lib/schemas/assign";

// Assignment. Everything goes through the database function public.move_leads(), so each call is
// one transaction with its ownership history and notification. This file is the ADMIN version
// (task A2.3). Arisha's manager version (B2.1) belongs here too: reuse lib/leads/assign.ts and
// add the "within your own scope" rule; do not write a second path to leads.assigned_to.

const SIGN_IN_AGAIN = "Please sign in again.";
const refresh = () => revalidatePath("/", "layout");

export async function reassign(input: ReassignInput): Promise<ActionResult<null>> {
  const user = await getCurrentUser();
  if (!user) return fail(SIGN_IN_AGAIN);
  const supabase = await createServerClient();

  const result = await reassignCore(supabase, user, input);
  if (result.ok) {
    await logAudit(supabase, user.id, "reassign", "lead", input.leadId, { to: input.toUserId, reason: input.reason ?? "manual" });
    refresh();
  }
  return result;
}

export async function bulkAssign(input: BulkAssignInput): Promise<ActionResult<{ moved: number; skipped: number }>> {
  const user = await getCurrentUser();
  if (!user) return fail(SIGN_IN_AGAIN);
  const supabase = await createServerClient();

  const result = await bulkAssignCore(supabase, user, input);
  if (result.ok) {
    // One audit row per batch, with the count, not one per lead: this is the rule "log every reassign"
    // without letting a 500-lead assignment write 500 rows.
    await logAudit(supabase, user.id, "reassign", "lead", input.leadIds[0], {
      bulk: true,
      requested: input.leadIds.length,
      moved: result.data.moved,
      to: input.toUserId,
      reason: input.reason ?? "manual",
    });
    refresh();
  }
  return result;
}
