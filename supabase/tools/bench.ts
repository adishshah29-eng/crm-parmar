// bench.ts — measures the five budgets in brain/10-performance.md against whatever the database
// currently holds. Meant to be re-run after every phase — "Re-measure after every phase. A fix
// that does not move a number is not a fix." Same rule as everywhere else: measure signed in as a
// MANAGER or CALLER for the leads/detail/search/dashboard budgets, never super_admin or admin —
// app.is_admin() short-circuits can_read_lead() before it reaches the descendant/scope subqueries,
// which flatters the numbers exactly the way the postgres role would. Export is the one exception:
// only admin/super_admin CAN export, so that budget is necessarily measured as admin.
//
//   npx tsx supabase/tools/bench.ts        (npm run db:bench)
//
// It is the speed regression gate (team-playbook step 5b): it exits with status 1 if any budget is
// missed, and prints "All budgets met." otherwise.
//
// HOW TO ADD YOUR SCREEN: find the block for the closest existing screen below (a manager or caller
// list is the usual model) and copy it:
//     const mine = await timeMany(ITERATIONS, () => queryMyThing(client, userId, { ... }));
//     report("my screen (what it shows)", 500, mine);      // label, budget in ms, result
// Use a manager or caller client, never admin (see above). Budgets: list 500, detail 400,
// search 600, dashboard 800 (ms, p95).
//
// Needs .env.local. Mostly read-only: the export budget writes one real audit_log row if it
// succeeds (exportLeadsWithAudit always audits a successful export — that's the point of it), so
// this runs it once, not in a loop, and every other budget uses a SMALL iteration count on
// purpose. The first time this ran (2026-09-25, right after the 20,000-row bulk seed, before
// autovacuum/ANALYZE had caught up on the freshly changed table) the manager list query with an
// exact count timed out 20/20 times at ~8.3-9.2s against Postgres's statement_timeout — a real,
// if possibly transient, finding in its own right. A few minutes later the same query, same data,
// took 1.3s. If a run here reproduces a wall of timeouts, STOP after 2-3 confirming failures —
// looping 20x into a database four people share, once the answer is already "it times out", wastes
// their shared CPU for no new information.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import type { Database } from "../../src/types/database";
import { filteredLeads, queryLead, queryLeads } from "../../src/lib/leads/queries";
import { exportLeadsWithAudit } from "../../src/lib/leads/export";
import { queryDashboard } from "../../src/lib/dashboard/queries";
import type { Actor } from "../../src/lib/org/mutations";

type Client = SupabaseClient<Database>;
const ITERATIONS = 5; // small on purpose — see the header. Raise it once queries are reliably fast.

function readEnvLocal(): Record<string, string> {
  return Object.fromEntries(
    readFileSync(".env.local", "utf8")
      .split(/\r?\n/)
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
  );
}

async function signIn(url: string, anonKey: string, email: string): Promise<{ client: Client; userId: string }> {
  const client = createClient<Database>(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password: "Test@12345" });
  if (error || !data.user) throw new Error(`sign in failed for ${email}: ${error?.message}`);
  return { client, userId: data.user.id };
}

function stats(samplesMs: number[]) {
  const sorted = [...samplesMs].sort((a, b) => a - b);
  const at = (p: number) => sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
  return { min: sorted[0], p50: at(0.5), p95: at(0.95), max: sorted[sorted.length - 1] };
}

/** Times up to n runs of fn, but stops early after 2 timeouts/failures — see the file header. */
async function timeMany(n: number, fn: () => Promise<{ ok: boolean; error?: unknown } | { error: unknown }>) {
  const samples: number[] = [];
  let failures = 0;
  const failureDetails: unknown[] = [];
  // One untimed call first: the very first request pays for a cold connection and plan, which with
  // only a handful of samples would become the p95 and make this gate fail for no real reason.
  await fn();
  for (let i = 0; i < n; i++) {
    const start = performance.now();
    const res = await fn();
    const ms = performance.now() - start;
    const failed = "ok" in res ? !res.ok : !!res.error;
    if (failed) {
      failures++;
      failureDetails.push("error" in res ? res.error : undefined);
      if (failures >= 2) break; // stop hammering once it's clearly not going to succeed
    } else {
      samples.push(ms);
    }
  }
  return { samples, failures, failureDetails };
}

let missed = 0; // budgets over, or queries that failed every run: decides the exit status

function report(label: string, budgetMs: number, result: { samples: number[]; failures: number; failureDetails: unknown[] }) {
  if (result.samples.length === 0) {
    missed++;
    console.log(`FAIL  ${label.padEnd(38)} every run failed (${result.failures}) — ${JSON.stringify(result.failureDetails[0]).slice(0, 100)}`);
    return;
  }
  const s = stats(result.samples);
  const verdict = s.p95 <= budgetMs ? "OK  " : "OVER";
  if (verdict === "OVER") missed++;
  const n = result.failures ? `  (${result.failures} failed, ${result.samples.length} ok)` : "";
  console.log(
    `${verdict} ${label.padEnd(38)} budget ${String(budgetMs).padStart(6)}ms  ` +
    `p50 ${s.p50.toFixed(0).padStart(6)}ms  p95 ${s.p95.toFixed(0).padStart(6)}ms  max ${s.max.toFixed(0).padStart(6)}ms${n}`,
  );
}

async function main() {
  const env = readEnvLocal();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) { console.error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY missing from .env.local"); process.exit(1); }

  console.log(`Benchmarking against the live database, up to ${ITERATIONS} iterations per read query.\n`);

  // ---------------------------------------------------------------- manager (mgr.worli)
  const mgr = await signIn(url, anonKey, "mgr.worli@parmar.test");
  console.log("== mgr.worli@parmar.test (manager: Worli + Bellevue territory, plus his team) ==");

  const mgrList = await timeMany(ITERATIONS, () =>
    queryLeads(mgr.client, mgr.userId, { page: 1, pageSize: 25, sort: "created_at:desc", filters: {} }),
  );
  report("/leads list (25 rows, exact count — current app)", 500, mgrList);

  // Diagnostic: the same query without count:"exact" (P2-8). Not one of the five named budgets,
  // but cheap to include and it is the single most informative comparison in this file.
  const mgrListNoCount = await timeMany(ITERATIONS, async () => {
    const { query } = await filteredLeads(mgr.client, mgr.userId, {}, "id", false);
    const { error } = await query.order("created_at", { ascending: false }).range(0, 24);
    return { ok: !error, error };
  });
  report("  (same, without count — P2-8 isolated)", 500, mgrListNoCount);

  const mgrSearch = await timeMany(ITERATIONS, () =>
    queryLeads(mgr.client, mgr.userId, { page: 1, pageSize: 25, filters: { search: "000012" } }),
  );
  report("search — phone digits", 600, mgrSearch);

  let mgrLeadId: string | undefined;
  if (mgrList.samples.length) {
    const res = await queryLeads(mgr.client, mgr.userId, { page: 1, pageSize: 1, filters: {} });
    mgrLeadId = res.ok ? res.data.rows[0]?.id : undefined;
  }
  if (mgrLeadId) {
    const id = mgrLeadId;
    const mgrDetail = await timeMany(ITERATIONS, () => queryLead(mgr.client, id));
    report("lead detail", 400, mgrDetail);
  } else {
    console.log("SKIP lead detail — could not get a lead id for the manager.");
  }

  const mgrDash = await timeMany(ITERATIONS, () => queryDashboard(mgr.client, "today"));
  report("/dashboard", 800, mgrDash);

  // ---------------------------------------------------------------- caller (caller1)
  console.log("\n== caller1@parmar.test (caller: only their own assigned leads) ==");
  const caller = await signIn(url, anonKey, "caller1@parmar.test");

  const callerList = await timeMany(ITERATIONS, () =>
    queryLeads(caller.client, caller.userId, { page: 1, pageSize: 25, sort: "created_at:desc", filters: {} }),
  );
  report("/leads (My Day equivalent, 25 rows)", 500, callerList);

  let callerLeadId: string | undefined;
  if (callerList.samples.length) {
    const res = await queryLeads(caller.client, caller.userId, { page: 1, pageSize: 1, filters: {} });
    callerLeadId = res.ok ? res.data.rows[0]?.id : undefined;
  }
  if (callerLeadId) {
    const id = callerLeadId;
    const callerDetail = await timeMany(ITERATIONS, () => queryLead(caller.client, id));
    report("lead detail (caller)", 400, callerDetail);
  } else {
    console.log("SKIP lead detail (caller) — could not get a lead id.");
  }
  console.log("SKIP /dashboard for caller — not in caller's nav (lib/nav.ts); manager+ only.");

  // ---------------------------------------------------------------- export (admin only, ONE run)
  console.log("\n== admin1@parmar.test (export — admin-only; runs once, writes one real audit row) ==");
  const admin = await signIn(url, anonKey, "admin1@parmar.test");
  const actor: Actor = { id: admin.userId, role: "admin" };

  const startAll = performance.now();
  const all = await exportLeadsWithAudit(admin.client, actor, {});
  const allMs = performance.now() - startAll;
  if (all.ok) {
    if (allMs > 30_000) missed++;
    console.log(`${allMs <= 30_000 ? "OK  " : "OVER"} CSV export, unfiltered, ${all.data.rowCount} rows  budget 30000ms  actual ${allMs.toFixed(0)}ms`);
  } else {
    // Expected once the database has more leads than EXPORT_MAX_ROWS — see 10-performance.md
    // open decision #3. Not a bug in this script; a real, load-bearing product question.
    console.log(`REFUSED unfiltered export after ${allMs.toFixed(0)}ms — ${all.error}`);
    const startOne = performance.now();
    const one = await exportLeadsWithAudit(admin.client, actor, { projectId: ["22222222-0000-0000-0000-000000000001"] });
    const oneMs = performance.now() - startOne;
    if (one.ok) {
      if (oneMs > 30_000) missed++;
      console.log(`        filtered to one project instead: ${one.data.rowCount} rows in ${oneMs.toFixed(0)}ms`);
    } else {
      missed++;
      console.log(`        filtered export ALSO failed: ${one.error}`);
    }
  }

  console.log("\nNote: this measures DB + RLS round-trip time from this environment, not a Vercel");
  console.log("deployment. P0-1 (region) and P0-2 (duplicate auth calls) are not reproducible here —");
  console.log("they need measuring after a real deploy to bom1.");

  if (missed) {
    console.log(`\n${missed} budget(s) missed.`);
    process.exitCode = 1;
  } else {
    console.log("\nAll budgets met.");
  }
}

main();
