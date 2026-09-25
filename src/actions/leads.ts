"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { applyCallOutcome, insertRemark, queryLead, queryLeads } from "@/lib/leads/queries";
import { fail, type ActionResult } from "@/types/action";
import type { LeadDetail, LeadRow } from "@/types/leads";
import type { CallOutcomeInput, LeadListParams } from "@/lib/schemas/lead";

// Shared by all portals. Same functions, different rows — RLS decides. No role checks here:
// if you catch yourself writing `if (role === ...)` in this file, the fix belongs in the database.

const SIGN_IN_AGAIN = "Please sign in again.";

/**
 * Lead data shows up on several routes across portals. revalidatePath("/", "layout") used to sit
 * here, which purges the router cache for the WHOLE app on every saved call outcome or remark
 * (brain/10-performance.md, P0-3) — narrowed to the routes that actually show lead rows.
 * "/leads" uses "layout" so it also covers "/leads/[id]". "/my-day" is Tanishka's stub today
 * (task C1.1) but the real path already exists, so her build needs no change here. When Arisha's
 * "/team/leads" (task B1.1) lands, add it to this list — it is shared by every portal on purpose.
 */
const refresh = () => {
  revalidatePath("/leads", "layout");
  revalidatePath("/dashboard");
  revalidatePath("/my-day", "layout");
};

export async function getLeads(
  params: LeadListParams,
): Promise<ActionResult<{ rows: LeadRow[]; total: number }>> {
  const user = await getCurrentUser();
  if (!user) return fail(SIGN_IN_AGAIN);
  const supabase = await createServerClient();
  return queryLeads(supabase, user.id, params);
}

/** Also writes the view_lead audit row — detail-page opens only, never lists. */
export async function getLead(leadId: string): Promise<ActionResult<LeadDetail>> {
  const user = await getCurrentUser();
  if (!user) return fail(SIGN_IN_AGAIN);
  const supabase = await createServerClient();

  const result = await queryLead(supabase, leadId);
  if (result.ok) await logAudit(supabase, user.id, "view_lead", "lead", leadId);
  return result;
}

export async function updateCallStatus(input: CallOutcomeInput): Promise<ActionResult<null>> {
  const user = await getCurrentUser();
  if (!user) return fail(SIGN_IN_AGAIN);
  const supabase = await createServerClient();

  const result = await applyCallOutcome(supabase, user.id, input);
  if (result.ok) {
    await logAudit(supabase, user.id, "edit_lead", "lead", input.leadId, { change: "call_outcome" });
    refresh();
  }
  return result;
}

export async function addRemark(input: { leadId: string; remark: string }): Promise<ActionResult<null>> {
  const user = await getCurrentUser();
  if (!user) return fail(SIGN_IN_AGAIN);
  const supabase = await createServerClient();

  const result = await insertRemark(supabase, user.id, input);
  if (result.ok) {
    await logAudit(supabase, user.id, "edit_lead", "lead", input.leadId, { change: "remark" });
    refresh();
  }
  return result;
}
