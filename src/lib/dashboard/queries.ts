import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/types/database";
import { fail, ok, type ActionResult } from "@/types/action";
import type { PipelineStage } from "@/types/leads";
import { PIPELINE_STAGES } from "@/lib/schemas/lead";
import { callRpc } from "@/lib/supabase/rpc";

// The dashboards (tasks D1.1-D2.4). Every number is counted in SQL (migration 0010) as the signed-in
// user, so RLS decides the scope: the same call gives an admin the company and a manager their
// territory and team. This file only calls the two functions and shapes the result. No next/*
// imports, so supabase/tests can drive it directly.
//
// What the Today / All-time toggle changes, and what it does not (D-035):
//   toggled      totalLeads, and each manager's portfolio   ('today' = received today, IST)
//   never toggled  untouched ("right now"), escalations ("today"), site visits ("this week")

type Client = SupabaseClient<Database>;

export const dashboardRangeSchema = z.enum(["today", "all"]);
export type DashboardRange = z.infer<typeof dashboardRangeSchema>;

export type ManagerPortfolio = {
  managerId: string;
  name: string;
  /** Leads owned by this manager or anyone below them. */
  leadCount: number;
  untouched: number;
  byStage: Record<PipelineStage, number>;
  /** Active callers under them. */
  callers: number;
  /** Site visits scheduled (not yet done) on their leads. */
  visitsBooked: number;
};

export type DashboardData = {
  range: DashboardRange;
  totalLeads: number;
  /** Untouched right now, whoever owns them. */
  untouchedLeads: number;
  untouchedUnassigned: number;
  /** Leads whose 45-minute SLA was breached today. Named slaBreaches in the API contract. */
  slaBreaches: number;
  siteVisitsThisWeek: number;
  managerPortfolios: ManagerPortfolio[];
  /** The engine panel (D2.4). Meaningful for admins; RLS scopes it for everyone else. */
  engine: {
    unassigned: number;
    /** Unassigned LIVE leads: assigned by the next 10:30 run, so they are waiting, not lost. */
    waitingFor1030: number;
    /** Unassigned non-live leads: nothing assigns these automatically. */
    needsManualAssignment: number;
    escalationsToday: number;
  };
};

type RawCounts = {
  total_leads: number;
  untouched: number;
  untouched_unassigned: number;
  escalations_today: number;
  unassigned: number;
  unassigned_live: number;
  site_visits_week: number;
};

type RawPortfolio = {
  manager_id: string;
  name: string;
  leads: number;
  untouched: number;
  by_stage: Partial<Record<PipelineStage, number>>;
  callers: number;
  visits_booked: number;
};

const MIGRATION_MISSING = "The dashboard needs migration 0010, which has not been applied to this database. Ask Adish to run db push.";

export async function queryDashboard(supabase: Client, rawRange: unknown): Promise<ActionResult<DashboardData>> {
  const parsed = dashboardRangeSchema.safeParse(rawRange ?? "today");
  if (!parsed.success) return fail("Pick Today or All time.");
  const range = parsed.data;

  const [counts, portfolios] = await Promise.all([
    callRpc<RawCounts>(supabase, "dashboard_counts", { p_range: range }),
    callRpc<RawPortfolio[]>(supabase, "dashboard_portfolios", { p_range: range }),
  ]);

  for (const r of [counts, portfolios]) {
    if (r.error) {
      console.error("[dashboard] failed:", r.error.code, r.error.message);
      return fail(r.error.code === "PGRST202" ? MIGRATION_MISSING : "Could not load the dashboard. Try again in a moment.");
    }
  }
  const c = counts.data;
  if (!c) return fail("Could not load the dashboard. Try again in a moment.");

  const managerPortfolios: ManagerPortfolio[] = (portfolios.data ?? []).map((p) => ({
    managerId: p.manager_id,
    name: p.name,
    leadCount: Number(p.leads),
    untouched: Number(p.untouched),
    // every stage present, so the table never has to guess
    byStage: Object.fromEntries(PIPELINE_STAGES.map((s) => [s, Number(p.by_stage?.[s] ?? 0)])) as Record<PipelineStage, number>,
    callers: Number(p.callers),
    visitsBooked: Number(p.visits_booked),
  }));

  return ok({
    range,
    totalLeads: Number(c.total_leads),
    untouchedLeads: Number(c.untouched),
    untouchedUnassigned: Number(c.untouched_unassigned),
    slaBreaches: Number(c.escalations_today),
    siteVisitsThisWeek: Number(c.site_visits_week),
    managerPortfolios,
    engine: {
      unassigned: Number(c.unassigned),
      waitingFor1030: Number(c.unassigned_live),
      needsManualAssignment: Math.max(0, Number(c.unassigned) - Number(c.unassigned_live)),
      escalationsToday: Number(c.escalations_today),
    },
  });
}
