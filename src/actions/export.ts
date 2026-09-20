"use server";

import { createServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { exportLeadsWithAudit } from "@/lib/leads/export";
import { fail, type ActionResult } from "@/types/action";
import type { LeadFilters } from "@/lib/schemas/lead";

/**
 * Export the leads matching the current filters as CSV (Adish, A3.2). Admin and super_admin only.
 * The audit row (row count + filters) is written BEFORE the CSV is returned, and a failed audit
 * write blocks the export. That is the control that protects the lead database (D-013).
 */
export async function exportLeads(input: { filters: LeadFilters }): Promise<ActionResult<{ csv: string; rowCount: number; filename: string }>> {
  const user = await getCurrentUser();
  if (!user) return fail("Please sign in again.");
  const supabase = await createServerClient();
  return exportLeadsWithAudit(supabase, user, input.filters);
}
