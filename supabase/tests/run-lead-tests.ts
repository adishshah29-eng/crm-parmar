// run-lead-tests.ts — proves the shared lead data layer (src/lib/leads/queries.ts) against the
// real database, signed in as real users. Complements run-access-tests.mjs (which proves RLS).
//
//   npm run test:leads
//
// Needs .env.local and the seed loaded. It mutates ONE caller1 lead and restores its columns
// afterwards. lead_activities is append-only by design, so each run leaves a few history rows
// on that mock lead — harmless on the mock database, and the reason this must never run
// against real data.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { applyCallOutcome, insertRemark, queryLead, queryLeads } from "../../src/lib/leads/queries";
import { callOutcomeSchema } from "../../src/lib/schemas/lead";
import { NO_ACCESS } from "../../src/types/leads";

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
function check(name: string, passed: boolean, detail = "") {
  if (!passed) failed++;
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}
// The API returns at most 1,000 rows per request, so "read everything" must page. Without this the
// tests only saw the first 1,000 leads and every "expected" figure was wrong once data grew.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAll<T = any>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error(`fetchAll: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}
const iso = (d: Date) => d.toISOString();
const inDays = (n: number) => iso(new Date(Date.now() + n * 864e5));

async function main() {
  const sup = await signIn("super@parmar.test");
  const adm = await signIn("admin1@parmar.test");
  const c1 = await signIn("caller1@parmar.test");
  const c2 = await signIn("caller2@parmar.test");
  const mw = await signIn("mgr.worli@parmar.test");
  const sub = await signIn("sub.worli@parmar.test");

  // ------------------------------------------------ A. the call-outcome rules (offline)
  const id = "11111111-1111-4111-8111-111111111111";
  const rule = (label: string, input: object, shouldPass: boolean) =>
    check(`rule: ${label}`, callOutcomeSchema.safeParse({ leadId: id, remark: "", ...input }).success === shouldPass);

  rule("attempted needs next_call_at", { callStatus: "attempted" }, false);
  rule("attempted with next_call_at, no remark is fine", { callStatus: "attempted", nextCallAt: inDays(1) }, true);
  rule("connected needs temperature", { callStatus: "connected", remark: "spoke", nextCallAt: inDays(1) }, false);
  rule("connected needs remark", { callStatus: "connected", temperature: "hot", nextCallAt: inDays(1) }, false);
  rule("connected needs next_call_at", { callStatus: "connected", temperature: "hot", remark: "spoke" }, false);
  rule("connected complete", { callStatus: "connected", temperature: "warm", remark: "spoke", nextCallAt: inDays(2) }, true);
  rule("lost needs a reason", { callStatus: "lost" }, false);
  rule("lost with reason", { callStatus: "lost", remark: "not interested" }, true);
  rule("'new' is not a choice a caller can pick", { callStatus: "new", nextCallAt: inDays(1) }, false);
  rule("whitespace-only remark does not count", { callStatus: "lost", remark: "   " }, false);

  // ------------------------------------------------ B. lists
  const all = await fetchAll((a, b) =>
    sup.c.from("leads").select("id, assigned_to, person_id, first_touch_at, last_activity_at, call_status, temperature, pipeline_stage, next_call_at, renurture_at").order("id").range(a, b),
  );
  const mine = all.filter((l) => l.assigned_to === c1.id);
  const others = all.filter((l) => l.assigned_to === c2.id);

  const r1 = await queryLeads(c1.c, c1.id, {});
  check("caller list: only own leads, more than zero", r1.ok && r1.data.total === mine.length && r1.data.rows.length > 0 && r1.data.rows.every((x) => x.assignedTo === c1.id), r1.ok ? `${r1.data.total} rows` : r1.error);
  check("rows carry buyer, phone, project", r1.ok && r1.data.rows.every((x) => x.personName && x.phone.startsWith("+91") && x.projectName), "");

  const r1b = await queryLeads(c1.c, c1.id, { pageSize: 3 });
  const r1c = await queryLeads(c1.c, c1.id, { pageSize: 3, page: 2 });
  const r1d = await queryLeads(c1.c, c1.id, { pageSize: 3, page: 3 });
  const pagedIds = [r1b, r1c, r1d].flatMap((r) => (r.ok ? r.data.rows.map((x) => x.id) : []));
  // Three full pages of 3, none repeated, and the total is the real total (holds at any data size).
  check("paging: pages of 3 are full, disjoint, and the total is exact", r1b.ok && r1b.data.rows.length === 3 && r1b.data.total === mine.length && pagedIds.length === Math.min(9, mine.length) && new Set(pagedIds).size === pagedIds.length, `${pagedIds.length} ids over 3 pages, total ${r1b.ok ? r1b.data.total : "?"}`);

  const someone = r1.ok ? r1.data.rows[0] : null;
  const digits = someone ? someone.phone.slice(-5) : "";
  const bySearchPhone = await queryLeads(c1.c, c1.id, { filters: { search: digits } });
  check("search: partial phone finds the lead", bySearchPhone.ok && bySearchPhone.data.rows.some((x) => x.id === someone?.id), `"${digits}"`);
  const bySearchName = await queryLeads(c1.c, c1.id, { filters: { search: "BUYER" } });
  check("search: buyer name matches case-insensitively", bySearchName.ok && bySearchName.data.total === mine.length);
  const nothing = await queryLeads(c1.c, c1.id, { filters: { search: "zzzzzz" } });
  check("search: no match returns zero rows, not an error", nothing.ok && nothing.data.total === 0);
  const hostile = await queryLeads(c1.c, c1.id, { filters: { search: "a),phone.ilike.%(" } });
  check("search: punctuation cannot break the query", hostile.ok, hostile.ok ? "" : hostile.error);

  const status = mine[0].call_status;
  const byStatus = await queryLeads(c1.c, c1.id, { filters: { callStatus: [status] } });
  check("filter: call status", byStatus.ok && byStatus.data.total === mine.filter((l) => l.call_status === status).length && byStatus.data.rows.every((x) => x.callStatus === status));
  const untouched = await queryLeads(c1.c, c1.id, { filters: { untouched: true } });
  check("filter: untouched", untouched.ok && untouched.data.rows.every((x) => x.firstTouchAt === null));
  const badSort = await queryLeads(c1.c, c1.id, { sort: "assigned_to;drop table leads:asc" });
  check("sort: unknown column is rejected, not executed", !badSort.ok);
  const sorted = await queryLeads(c1.c, c1.id, { sort: "created_at:asc" });
  check("sort: created_at ascending", sorted.ok && sorted.data.rows.every((x, i, a) => i === 0 || a[i - 1].createdAt <= x.createdAt));

  // a manager: broader rows from the very same function
  const rm = await queryLeads(mw.c, mw.id, { pageSize: 100 });
  check("manager list: sees more than a caller, from the same function", rm.ok && r1.ok && rm.data.total > r1.data.total, rm.ok ? `${rm.data.total} rows` : rm.error);
  const rmTeam = await queryLeads(mw.c, mw.id, { filters: { assignedTo: "team" }, pageSize: 100 });
  const teamSet = new Set([sub.id, c1.id, c2.id]);
  check("manager 'team' filter: only leads owned by descendants", rmTeam.ok && rmTeam.data.total > 0 && rmTeam.data.rows.every((x) => x.assignedTo && teamSet.has(x.assignedTo)), rmTeam.ok ? `${rmTeam.data.total} rows` : rmTeam.error);
  const rmMe = await queryLeads(mw.c, mw.id, { filters: { assignedTo: "me" } });
  check("manager 'me' filter: own leads only", rmMe.ok && rmMe.data.rows.every((x) => x.assignedTo === mw.id));

  // admin: everything, and the source filter
  const ra = await queryLeads(adm.c, adm.id, { pageSize: 100 });
  check("admin list: all leads", ra.ok && ra.data.total === all.length, ra.ok ? `${ra.data.total} of ${all.length}` : ra.error);
  const metaSrc = await fetchAll((a, b) => sup.c.from("lead_sources").select("lead_id, sources!inner(code)").eq("sources.code", "meta").order("lead_id").range(a, b));
  const metaIds = new Set(metaSrc.map((s) => s.lead_id));
  const bySource = await queryLeads(adm.c, adm.id, { filters: { sourceCode: ["meta"] }, pageSize: 100 });
  check("filter: source code", bySource.ok && bySource.data.total === metaIds.size && bySource.data.rows.every((x) => metaIds.has(x.id)), bySource.ok ? `${bySource.data.total} rows` : bySource.error);
  const byProject = await queryLeads(adm.c, adm.id, { filters: { projectId: ["22222222-0000-0000-0000-000000000006"] }, pageSize: 100 });
  check("filter: project", byProject.ok && byProject.data.total > 0 && byProject.data.rows.every((x) => x.projectId === "22222222-0000-0000-0000-000000000006"));

  // ------------------------------------------------ C. detail
  // The seed's two 'Multi Project Buyer' leads have no source rows, so pick one that does.
  const { data: srcRows } = await sup.c.from('lead_sources').select('lead_id').in('lead_id', mine.slice(0, 100).map((l) => l.id));
  const withSource = new Set((srcRows ?? []).map((r) => r.lead_id));
  const target = mine.find((l) => withSource.has(l.id))!;
  const d = await queryLead(c1.c, target.id);
  check("detail: owner reads own lead with sources and project", d.ok && d.data.sources.length >= 1 && !!d.data.projectName && Array.isArray(d.data.activities), d.ok ? `${d.data.sources.length} source(s)` : d.error);
  const denied = await queryLead(c1.c, others[0].id);
  check("detail: another caller's lead returns NO_ACCESS", !denied.ok && denied.error === NO_ACCESS);
  const garbage = await queryLead(c1.c, "not-a-uuid");
  check("detail: malformed id returns NO_ACCESS", !garbage.ok && garbage.error === NO_ACCESS);
  const viaMgr = await queryLead(mw.c, target.id);
  check("detail: manager reads a team lead", viaMgr.ok);

  // ------------------------------------------------ D. mutations (restored afterwards)
  const snapshot = {
    call_status: target.call_status, temperature: target.temperature, pipeline_stage: target.pipeline_stage,
    first_touch_at: target.first_touch_at, last_activity_at: target.last_activity_at,
    next_call_at: target.next_call_at, renurture_at: target.renurture_at,
  };
  const baseline = { call_status: "new", temperature: null, pipeline_stage: "enquiry", first_touch_at: null, last_activity_at: null, next_call_at: null, renurture_at: null };
  const reset = (to: object) => sup.c.from("leads").update(to).eq("id", target.id);
  const lead = async () => (await sup.c.from("leads").select("*").eq("id", target.id).single()).data!;
  const activitiesFor = async () => (await sup.c.from("lead_activities").select("activity_type, from_value, to_value, remark, created_at").eq("lead_id", target.id).order("created_at", { ascending: false })).data ?? [];

  try {
    await reset(baseline);
    const before = (await activitiesFor()).length;

    const bad = await applyCallOutcome(c1.c, c1.id, { leadId: target.id, callStatus: "attempted", remark: "" });
    check("outcome: attempted without next_call_at is refused, nothing written", !bad.ok && (await lead()).call_status === "new" && (await activitiesFor()).length === before);

    const att = await applyCallOutcome(c1.c, c1.id, { leadId: target.id, callStatus: "attempted", remark: "", nextCallAt: inDays(1) });
    const l1 = await lead();
    const a1 = await activitiesFor();
    check("outcome: attempted saves status + next call date", att.ok && l1.call_status === "attempted" && !!l1.next_call_at, att.ok ? "" : att.error);
    check("outcome: the activity row trips first_touch_at (we never set it)", !!l1.first_touch_at && !!l1.last_activity_at);
    check("outcome: activity row records old -> new status", a1.length === before + 1 && a1[0].activity_type === "call" && a1[0].from_value === "new" && a1[0].to_value === "attempted");
    check("outcome: attempted does not move the pipeline", l1.pipeline_stage === "enquiry");

    const con = await applyCallOutcome(c1.c, c1.id, { leadId: target.id, callStatus: "connected", temperature: "hot", remark: "Wants a site visit", nextCallAt: inDays(2) });
    const l2 = await lead();
    const a2 = await activitiesFor();
    check("outcome: connected + hot saves temperature", con.ok && l2.call_status === "connected" && l2.temperature === "hot", con.ok ? "" : con.error);
    check("outcome: connected + hot moves enquiry -> qualified, with a stage_change row", l2.pipeline_stage === "qualified" && a2.some((a) => a.activity_type === "stage_change" && a.from_value === "enquiry" && a.to_value === "qualified"));

    const back = await applyCallOutcome(c1.c, c1.id, { leadId: target.id, callStatus: "attempted", remark: "", nextCallAt: inDays(1) });
    const l3 = await lead();
    check("outcome: leaving 'connected' clears temperature (DB CHECK would reject otherwise)", back.ok && l3.temperature === null && l3.call_status === "attempted", back.ok ? "" : back.error);
    check("outcome: a lead already qualified is not pulled back or re-staged", l3.pipeline_stage === "qualified");

    const lost = await applyCallOutcome(c1.c, c1.id, { leadId: target.id, callStatus: "lost", remark: "Bought elsewhere" });
    const l4 = await lead();
    const months = l4.renurture_at ? (new Date(l4.renurture_at).getTime() - Date.now()) / (30.44 * 864e5) : 0;
    check("outcome: lost sets dropped and renurture_at about +6 months", lost.ok && l4.pipeline_stage === "dropped" && months > 5.8 && months < 6.2, `${months.toFixed(2)} months`);

    const steal = await applyCallOutcome(c1.c, c1.id, { leadId: others[0].id, callStatus: "lost", remark: "nope" });
    const stolen = (await sup.c.from("leads").select("call_status").eq("id", others[0].id).single()).data;
    check("outcome: another caller's lead returns NO_ACCESS and is untouched", !steal.ok && steal.error === NO_ACCESS && stolen?.call_status === others[0].call_status);

    const rem = await insertRemark(c1.c, c1.id, { leadId: target.id, remark: "Called back at lunch" });
    check("remark: owner can add one", rem.ok, rem.ok ? "" : rem.error);
    const remBad = await insertRemark(c1.c, c1.id, { leadId: others[0].id, remark: "should not land" });
    check("remark: another caller's lead returns NO_ACCESS", !remBad.ok && remBad.error === NO_ACCESS);
    const remEmpty = await insertRemark(c1.c, c1.id, { leadId: target.id, remark: "   " });
    check("remark: empty is refused", !remEmpty.ok);
  } finally {
    await reset(snapshot); // restore the lead's columns; history rows stay (append-only)
  }

  console.log("");
  if (failed) { console.error(`${failed} check(s) failed.`); process.exit(1); }
  console.log("All lead data-layer checks passed.");
}

main().catch((e) => { console.error(e); process.exit(1); });
