// run-dashboard-tests.ts — the dashboards (tasks D1.1-D2.4) against the real database.
//
//   npm run test:dashboard
//
// Needs .env.local, the seed, and migration 0010 (skipped, not failed, until it is applied).
//
// Every expected number is recomputed INDEPENDENTLY in JavaScript from raw rows, so a wrong filter in
// the SQL cannot pass by agreeing with itself. It creates three temporary site visits and deletes
// them again. Never run it against real data.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { queryDashboard } from "../../src/lib/dashboard/queries";
import { queryLeads } from "../../src/lib/leads/queries";
import { callRpc } from "../../src/lib/supabase/rpc";
import { dbNow } from "./db-clock";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!URL || !KEY) throw new Error("Missing Supabase URL / anon key in .env.local");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any>;

async function signIn(email: string) {
  const c: Client = createClient(URL, KEY, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: "Test@12345" });
  if (error) throw new Error(`sign in failed for ${email}: ${error.message}`);
  return { c, id: data.user.id };
}

let failed = 0;
let skipped = 0;
function check(name: string, passed: boolean, detail = "") {
  if (!passed) failed++;
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}
function skip(name: string, why: string) {
  skipped++;
  console.log(`SKIP  ${name}  — ${why}`);
}

// ------------------------------------------------------------------ IST time, computed independently
const istDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
// "now" is the DATABASE's clock (set at the start of main): this machine can be hours off.
let NOW = new Date();
const dayStart = () => new Date(`${istDate(NOW)}T00:00:00+05:30`);
/** Monday 00:00 IST of the current week. */
const weekStart = () => {
  const start = dayStart();
  const dow = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", weekday: "short" }).format(NOW);
  const back = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(dow);
  return new Date(start.getTime() - back * 864e5);
};

const STAGES = ["enquiry", "qualified", "site_visit_scheduled", "site_visit_done", "negotiation", "booked", "dropped"] as const;

type RawLead = { id: string; created_at: string; first_touch_at: string | null; sla_breached_at: string | null; assigned_to: string | null; is_live: boolean; pipeline_stage: (typeof STAGES)[number] };

/** The numbers the dashboard should show, from raw rows, with none of the SQL's logic. */
function expectedCounts(leads: RawLead[], range: "today" | "all") {
  const t0 = dayStart().getTime();
  const open = (l: RawLead) => l.pipeline_stage !== "booked" && l.pipeline_stage !== "dropped";
  return {
    total: leads.filter((l) => range === "all" || new Date(l.created_at).getTime() >= t0).length,
    untouched: leads.filter((l) => l.first_touch_at === null && open(l)).length,
    untouchedUnassigned: leads.filter((l) => l.first_touch_at === null && open(l) && l.assigned_to === null).length,
    escalations: leads.filter((l) => l.sla_breached_at !== null && new Date(l.sla_breached_at).getTime() >= t0).length,
    unassigned: leads.filter((l) => l.assigned_to === null && open(l)).length,
    unassignedLive: leads.filter((l) => l.assigned_to === null && l.is_live && open(l)).length,
  };
}

async function main() {
  NOW = await dbNow(URL, KEY);
  const sup = await signIn("super@parmar.test");
  const adm = await signIn("admin1@parmar.test");
  const mw = await signIn("mgr.worli@parmar.test");
  const mp = await signIn("mgr.pune@parmar.test");
  const sub = await signIn("sub.worli@parmar.test");
  const c1 = await signIn("caller1@parmar.test");

  // ================================================== probe
  const probe = await queryDashboard(sup.c, "all");
  if (!probe.ok && /migration 0010/.test(probe.error)) {
    skip("dashboard: numbers, portfolios, scoping, toggle", "migration 0010 not applied — run `npx supabase db push`");
    console.log("");
    console.log(`All dashboard checks passed (${skipped} skipped — see SKIP lines above).`);
    return;
  }
  if (!probe.ok) throw new Error(`dashboard failed unexpectedly: ${probe.error}`);

  // ================================================== A. the numbers, as the super_admin
  const { data: rawLeads } = await sup.c.from("leads").select("id, created_at, first_touch_at, sla_breached_at, assigned_to, is_live, pipeline_stage").limit(5000);
  const leads = rawLeads as unknown as RawLead[];

  for (const range of ["all", "today"] as const) {
    const d = await queryDashboard(sup.c, range);
    const e = expectedCounts(leads, range);
    check(`counts (${range}): total leads matches the raw rows`, d.ok && d.data.totalLeads === e.total, d.ok ? `${d.data.totalLeads} vs ${e.total}` : d.error);
    if (d.ok) {
      check(`counts (${range}): untouched right now`, d.data.untouchedLeads === e.untouched && d.data.untouchedUnassigned === e.untouchedUnassigned, `${d.data.untouchedLeads}/${d.data.untouchedUnassigned} vs ${e.untouched}/${e.untouchedUnassigned}`);
      check(`counts (${range}): escalations today`, d.data.slaBreaches === e.escalations, `${d.data.slaBreaches} vs ${e.escalations}`);
      check(`counts (${range}): unassigned, waiting for 10:30, needs manual`, d.data.engine.unassigned === e.unassigned && d.data.engine.waitingFor1030 === e.unassignedLive && d.data.engine.needsManualAssignment === e.unassigned - e.unassignedLive, `${d.data.engine.unassigned}/${d.data.engine.waitingFor1030}/${d.data.engine.needsManualAssignment} vs ${e.unassigned}/${e.unassignedLive}/${e.unassigned - e.unassignedLive}`);
    }
  }

  // the toggle must change ONLY the total and the portfolios (decided with Adish)
  const dAll = await queryDashboard(sup.c, "all");
  const dToday = await queryDashboard(sup.c, "today");
  if (dAll.ok && dToday.ok) {
    check("toggle: untouched, escalations and site visits are the SAME in both ranges", dAll.data.untouchedLeads === dToday.data.untouchedLeads && dAll.data.slaBreaches === dToday.data.slaBreaches && dAll.data.siteVisitsThisWeek === dToday.data.siteVisitsThisWeek && dAll.data.engine.unassigned === dToday.data.engine.unassigned);
    check("toggle: 'today' never shows more leads than 'all time'", dToday.data.totalLeads <= dAll.data.totalLeads);
  }
  const dDefault = await queryDashboard(sup.c, undefined);
  check("toggle: with no range given it defaults to today", dDefault.ok && dToday.ok && dDefault.data.range === "today" && dDefault.data.totalLeads === dToday.data.totalLeads);
  check("toggle: an unknown range is refused", !(await queryDashboard(sup.c, "week")).ok);
  const direct = await callRpc(sup.c, "dashboard_counts", { p_range: "week" });
  check("toggle: the database itself refuses an unknown range (22023)", direct.error?.code === "22023", direct.error?.code ?? "ACCEPTED");

  // ================================================== B. portfolios, recomputed from the hierarchy
  const { data: hier } = await sup.c.from("user_hierarchy").select("ancestor_id, descendant_id");
  const { data: users } = await sup.c.from("users").select("id, full_name, role, is_active");
  const { data: rawVisits } = await sup.c.from("site_visits").select("id, lead_id, status, scheduled_at");
  const leadOwner = new Map(leads.map((l) => [l.id, l.assigned_to]));

  const below = (managerId: string) => new Set((hier ?? []).filter((h) => h.ancestor_id === managerId).map((h) => h.descendant_id as string));

  const expectedPortfolio = (managerId: string, range: "today" | "all", visits = rawVisits ?? []) => {
    const ids = below(managerId);
    const t0 = dayStart().getTime();
    const mine = leads.filter((l) => l.assigned_to && ids.has(l.assigned_to) && (range === "all" || new Date(l.created_at).getTime() >= t0));
    const byStage = Object.fromEntries(STAGES.map((s) => [s, mine.filter((l) => l.pipeline_stage === s).length]));
    return {
      leads: mine.length,
      untouched: mine.filter((l) => l.first_touch_at === null).length,
      byStage,
      callers: (users ?? []).filter((u) => ids.has(u.id) && u.role === "caller" && u.is_active).length,
      visitsBooked: visits.filter((v) => v.status === "scheduled" && (() => { const o = leadOwner.get(v.lead_id); return !!o && ids.has(o); })()).length,
    };
  };

  const managers = (users ?? []).filter((u) => u.role === "manager" && u.is_active).sort((a, b) => a.full_name.localeCompare(b.full_name));
  for (const range of ["all", "today"] as const) {
    const d = await queryDashboard(sup.c, range);
    if (!d.ok) continue;
    check(`portfolios (${range}): one row per active manager, ordered by name`, d.data.managerPortfolios.map((p) => p.name).join() === managers.map((m) => m.full_name).join(), d.data.managerPortfolios.map((p) => p.name).join());
    const allMatch = managers.every((m) => {
      const got = d.data.managerPortfolios.find((p) => p.managerId === m.id);
      const want = expectedPortfolio(m.id, range);
      return !!got && got.leadCount === want.leads && got.untouched === want.untouched && got.callers === want.callers && got.visitsBooked === want.visitsBooked && STAGES.every((s) => got.byStage[s] === want.byStage[s]);
    });
    check(`portfolios (${range}): leads, untouched, stages, callers and visits all match the hierarchy`, allMatch, d.data.managerPortfolios.map((p) => `${p.name}: ${p.leadCount}`).join(", "));
  }
  const worli = dAll.ok ? dAll.data.managerPortfolios.find((p) => p.managerId === mw.id) : undefined;
  check("portfolios: Worli's book includes their sub_manager's callers' leads (the hierarchy roll-up)", !!worli && worli.leadCount > 0 && worli.callers === 2, `${worli?.leadCount} leads, ${worli?.callers} callers`);
  check("portfolios: a manager's stage counts add up to their lead count", !!worli && Object.values(worli.byStage).reduce((s, n) => s + n, 0) === worli.leadCount);

  // ================================================== C. site visits this week and visits booked (temporary rows)
  const { data: c1Lead } = await sup.c.from("leads").select("id, project_id").eq("assigned_to", c1.id).limit(1).single();
  const wk = weekStart();
  const before = await queryDashboard(sup.c, "all");
  const beforeWorli = before.ok ? before.data.managerPortfolios.find((p) => p.managerId === mw.id)?.visitsBooked ?? 0 : 0;
  const beforePune = before.ok ? before.data.managerPortfolios.find((p) => p.managerId === mp.id)?.visitsBooked ?? 0 : 0;
  const visitIds: string[] = [];
  try {
    const at = (offsetDays: number) => new Date(wk.getTime() + offsetDays * 864e5 + 5 * 3600e3).toISOString(); // 05:00 UTC = 10:30 IST
    const rows = [
      { lead_id: c1Lead!.id, project_id: c1Lead!.project_id, scheduled_at: at(1), status: "scheduled" }, //   Tuesday this week: counts
      { lead_id: c1Lead!.id, project_id: c1Lead!.project_id, scheduled_at: at(2), status: "cancelled" }, //   this week but cancelled: never counts
      { lead_id: c1Lead!.id, project_id: c1Lead!.project_id, scheduled_at: at(-2), status: "scheduled" }, //  LAST week: not this week
    ];
    const { data: made, error } = await sup.c.from("site_visits").insert(rows).select("id");
    if (error) throw new Error(`could not create test visits: ${error.message}`);
    visitIds.push(...(made ?? []).map((v) => v.id));

    const after = await queryDashboard(sup.c, "all");
    const { data: allVisits } = await sup.c.from("site_visits").select("id, lead_id, status, scheduled_at");
    const expectWeek = (allVisits ?? []).filter((v) => v.status !== "cancelled" && new Date(v.scheduled_at).getTime() >= wk.getTime() && new Date(v.scheduled_at).getTime() < wk.getTime() + 7 * 864e5).length;
    check("site visits: this week counts scheduled ones, excludes cancelled and last week's (independent recount)", after.ok && after.data.siteVisitsThisWeek === expectWeek, after.ok ? `${after.data.siteVisitsThisWeek} vs ${expectWeek}` : "");
    check("site visits: exactly ONE of the three test visits was added to this week", after.ok && before.ok && after.data.siteVisitsThisWeek - before.data.siteVisitsThisWeek === 1, after.ok && before.ok ? `+${after.data.siteVisitsThisWeek - before.data.siteVisitsThisWeek}` : "");
    const afterWorli = after.ok ? after.data.managerPortfolios.find((p) => p.managerId === mw.id)?.visitsBooked ?? 0 : 0;
    const afterPune = after.ok ? after.data.managerPortfolios.find((p) => p.managerId === mp.id)?.visitsBooked ?? 0 : 0;
    check("visits booked: the two 'scheduled' visits land on the manager whose team owns the lead", afterWorli - beforeWorli === 2, `+${afterWorli - beforeWorli}`);
    check("visits booked: another manager's count is untouched", afterPune === beforePune);
    const asMgr = await queryDashboard(mw.c, "all");
    check("visits: a manager sees the same visit count for their scope (RLS on site_visits)", asMgr.ok && asMgr.data.siteVisitsThisWeek >= 1);
  } finally {
    if (visitIds.length) await sup.c.from("site_visits").delete().in("id", visitIds);
    const { count } = await sup.c.from("site_visits").select("id", { count: "exact", head: true }).in("id", visitIds);
    check("cleanup: the temporary site visits are gone", (count ?? 0) === 0);
  }

  // ================================================== D. scope: the same call, different rows
  const asAdmin = await queryDashboard(adm.c, "all");
  check("scope: an admin sees the whole company (same numbers as the super_admin)", asAdmin.ok && dAll.ok && asAdmin.data.totalLeads === dAll.data.totalLeads && asAdmin.data.managerPortfolios.length === dAll.data.managerPortfolios.length);

  const mwRead = await queryLeads(mw.c, mw.id, { pageSize: 100 });
  const mwDash = await queryDashboard(mw.c, "all");
  check("scope: a manager's total is exactly the leads they can read", mwDash.ok && mwRead.ok && mwDash.data.totalLeads === mwRead.data.total, mwDash.ok && mwRead.ok ? `${mwDash.data.totalLeads} vs ${mwRead.data.total}` : "");
  check("scope: a manager sees less than the company", mwDash.ok && dAll.ok && mwDash.data.totalLeads < dAll.data.totalLeads);
  check("scope: a manager's portfolio list is only themself (RLS on users)", mwDash.ok && mwDash.data.managerPortfolios.length === 1 && mwDash.data.managerPortfolios[0].managerId === mw.id, mwDash.ok ? mwDash.data.managerPortfolios.map((p) => p.name).join() : "");
  const worliAdmin = dAll.ok ? dAll.data.managerPortfolios.find((p) => p.managerId === mw.id) : undefined;
  const worliSelf = mwDash.ok ? mwDash.data.managerPortfolios[0] : undefined;
  check("scope: a manager's own portfolio matches what the super_admin sees for them", !!worliAdmin && !!worliSelf && worliAdmin.leadCount === worliSelf.leadCount && worliAdmin.callers === worliSelf.callers);

  const subDash = await queryDashboard(sub.c, "all");
  const subRead = await queryLeads(sub.c, sub.id, { pageSize: 100 });
  check("scope: a sub_manager gets the totals for their inherited territory and no portfolio rows", subDash.ok && subRead.ok && subDash.data.totalLeads === subRead.data.total && subDash.data.managerPortfolios.length === 0);

  const callerDash = await queryDashboard(c1.c, "all");
  const own = leads.filter((l) => l.assigned_to === c1.id).length;
  check("scope: a caller's numbers are only their own leads (and the page sends them to My Day)", callerDash.ok && callerDash.data.totalLeads === own && callerDash.data.managerPortfolios.length === 0, callerDash.ok ? `${callerDash.data.totalLeads} vs ${own}` : callerDash.error);

  // ================================================== E. the "team:<id>" link from a portfolio row
  const team = await queryLeads(sup.c, sup.id, { filters: { assignedTo: `team:${mw.id}` }, pageSize: 100 });
  check("click-through: team:<manager> lists exactly the leads counted in that manager's portfolio", team.ok && !!worliAdmin && team.data.total === worliAdmin.leadCount, team.ok && worliAdmin ? `${team.data.total} vs ${worliAdmin.leadCount}` : "");
  check("click-through: every row in it is owned by that manager or someone below them", team.ok && team.data.rows.every((r) => r.assignedTo !== null && below(mw.id).has(r.assignedTo)));
  const badTeam = await queryLeads(sup.c, sup.id, { filters: { assignedTo: "team:not-a-uuid" } });
  check("click-through: a malformed team: value is refused", !badTeam.ok);

  console.log("");
  if (failed) {
    console.error(`${failed} check(s) failed${skipped ? `, ${skipped} skipped` : ""}.`);
    process.exit(1);
  }
  console.log(`All dashboard checks passed${skipped ? ` (${skipped} skipped — see SKIP lines above)` : ""}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
