"use server";

import { createServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { queryDashboard, type DashboardData, type DashboardRange } from "@/lib/dashboard/queries";
import { fail, type ActionResult } from "@/types/action";

/**
 * The dashboard numbers for the signed-in user (Adish; moved from Sayli, D-034). No role branching
 * here: the counting functions run as the caller, so RLS gives an admin the company and a manager
 * their territory and team. A caller has no dashboard (they land on My Day).
 */
export async function getDashboard(input: { range: DashboardRange }): Promise<ActionResult<DashboardData>> {
  const user = await getCurrentUser();
  if (!user) return fail("Please sign in again.");
  const supabase = await createServerClient();
  return queryDashboard(supabase, input.range);
}
