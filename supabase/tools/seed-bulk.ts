// seed-bulk.ts — Phase A, step zero (brain/10-performance.md). Nothing in that file is measured
// yet, because there is nothing to measure against: seed.sql leaves 42 leads, and 42 rows makes
// every query look instant regardless of whether the RLS policy or the indexes are any good.
//
// This adds MOCK leads on top of the existing seed — never touches or removes the original 42,
// never touches real data (D-009). Every row it creates is identifiable and reversible:
//   - phones start +9199 (seed.sql uses +9198, the admin import tests use +919750)
//   - emails are bulk-buyer-<n>@example.test
//   - persons.full_name starts "Bulk Buyer "
// `--clean` deletes exactly those rows (cascades to leads, lead_sources, lead_activities) and
// exits. Re-running without --clean on top of an existing bulk seed is refused, not silently
// doubled — this script cannot tell "no leads for this person yet" apart from "duplicate", so it
// asks first.
//
// No service_role key needed, and deliberately not used: leads_insert, persons_write and
// lead_sources_insert all grant to app.is_admin(), so this runs authenticated as super@parmar.test
// through the SAME row-level security every request goes through — never bypassing it, per
// 02-system-design.md's single most important rule. Needs .env.local (URL + anon key).
//
//   npx tsx supabase/tools/seed-bulk.ts [count]
//   npx tsx supabase/tools/seed-bulk.ts --clean
//
// [count] defaults to 20000. Runs in batches of 500 so no single request holds the lot in memory
// or trips a Postgres statement timeout.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const BULK_PHONE_PREFIX = "+9199";
const BULK_EMAIL_SUFFIX = "@example.test";
const BULK_NAME_PREFIX = "Bulk Buyer ";
const BATCH_SIZE = 500;
const DEFAULT_COUNT = 20_000;

const PROJECTS = [
  "22222222-0000-0000-0000-000000000001", // Raheja Imperia Worli
  "22222222-0000-0000-0000-000000000002", // Lodha Bellevue
  "22222222-0000-0000-0000-000000000003", // Runwal 7 Mahalaxmi
  "22222222-0000-0000-0000-000000000004", // Sattva Parel
  "22222222-0000-0000-0000-000000000005", // Lodha Aureus Sewri
  "22222222-0000-0000-0000-000000000006", // Supreme Rivana
];
const LOCATION_BY_PROJECT: Record<string, string> = {
  "22222222-0000-0000-0000-000000000001": "11111111-0000-0000-0000-000000000001",
  "22222222-0000-0000-0000-000000000002": "11111111-0000-0000-0000-000000000002",
  "22222222-0000-0000-0000-000000000003": "11111111-0000-0000-0000-000000000002",
  "22222222-0000-0000-0000-000000000004": "11111111-0000-0000-0000-000000000004",
  "22222222-0000-0000-0000-000000000005": "11111111-0000-0000-0000-000000000003",
  "22222222-0000-0000-0000-000000000006": "11111111-0000-0000-0000-000000000005",
};
const SOURCES = [
  "33333333-0000-0000-0000-000000000001",
  "33333333-0000-0000-0000-000000000002",
  "33333333-0000-0000-0000-000000000003",
  "33333333-0000-0000-0000-000000000004",
  "33333333-0000-0000-0000-000000000005",
];

const CALL_STATUSES = ["new", "attempted", "connected", "lost"] as const;
const TEMPERATURES = ["hot", "warm", "cold"] as const;
const STAGES = [
  "enquiry",
  "qualified",
  "site_visit_scheduled",
  "site_visit_done",
  "negotiation",
  "booked",
  "dropped",
] as const;

type Emails = {
  superAdmin: string;
  admin: string;
  mgrWorli: string;
  mgrPune: string;
  subWorli: string;
  caller1: string;
  caller2: string;
  caller3: string;
};

const EMAILS: Emails = {
  superAdmin: "super@parmar.test",
  admin: "admin1@parmar.test",
  mgrWorli: "mgr.worli@parmar.test",
  mgrPune: "mgr.pune@parmar.test",
  subWorli: "sub.worli@parmar.test",
  caller1: "caller1@parmar.test",
  caller2: "caller2@parmar.test",
  caller3: "caller3@parmar.test",
};

function readEnvLocal(): Record<string, string> {
  return Object.fromEntries(
    readFileSync(".env.local", "utf8")
      .split(/\r?\n/)
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
  );
}

// A small deterministic PRNG (mulberry32) so a run can be reproduced from its logged seed,
// rather than a fresh random distribution every time someone re-runs this against a fresh project.
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20_000_925); // fixed seed: reproducible, not "random each run"
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));

async function main() {
  const args = process.argv.slice(2);
  const clean = args.includes("--clean");
  const count = Number(args.find((a) => /^\d+$/.test(a)) ?? DEFAULT_COUNT);

  const env = readEnvLocal();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url) { console.error("NEXT_PUBLIC_SUPABASE_URL missing from .env.local"); process.exit(1); }
  if (!anonKey) { console.error("NEXT_PUBLIC_SUPABASE_ANON_KEY missing from .env.local"); process.exit(1); }

  const db = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: signInErr } = await db.auth.signInWithPassword({ email: "super@parmar.test", password: "Test@12345" });
  if (signInErr) {
    console.error("Could not sign in as super@parmar.test:", signInErr.message);
    console.error("This script writes through RLS as super_admin, not with the service_role key — the seeded test users must exist first.");
    process.exit(1);
  }

  // Resolve the seeded users by email — never hard-code an id, the project may have been reseeded.
  const { data: users, error: usersErr } = await db
    .from("users")
    .select("id, email, role")
    .in("email", Object.values(EMAILS));
  if (usersErr) { console.error("Could not read users:", usersErr.message); process.exit(1); }
  const byEmail = new Map((users ?? []).map((u) => [u.email, u]));
  const need = Object.values(EMAILS).filter((e) => !byEmail.has(e));
  if (need.length) {
    console.error(`Missing seeded users: ${need.join(", ")}. Run supabase/seed.sql first (PHASE-0-RUNBOOK.md step 8).`);
    process.exit(1);
  }
  const owners = [
    byEmail.get(EMAILS.mgrWorli)!.id,
    byEmail.get(EMAILS.mgrPune)!.id,
    byEmail.get(EMAILS.subWorli)!.id,
    byEmail.get(EMAILS.caller1)!.id,
    byEmail.get(EMAILS.caller2)!.id,
    byEmail.get(EMAILS.caller3)!.id,
  ];

  if (clean) {
    console.log("Deleting bulk-seeded rows (leads cascade to lead_sources, lead_activities, site_visits)...");
    let totalDeleted = 0;
    for (;;) {
      // persons.phone like '+9199%' — delete in pages so one statement never holds 20,000 rows.
      const { data: page, error: pageErr } = await db
        .from("persons")
        .select("id")
        .like("phone", `${BULK_PHONE_PREFIX}%`)
        .limit(1000);
      if (pageErr) { console.error("Cleanup read failed:", pageErr.message); process.exit(1); }
      if (!page?.length) break;
      const ids = page.map((p) => p.id);
      const { error: delErr } = await db.from("persons").delete().in("id", ids);
      if (delErr) { console.error("Cleanup delete failed:", delErr.message); process.exit(1); }
      totalDeleted += ids.length;
      process.stdout.write(`\r  deleted ${totalDeleted}`);
    }
    console.log(`\nDone. ${totalDeleted} bulk persons removed (their leads went with them).`);
    return;
  }

  const { count: existing, error: existingErr } = await db
    .from("persons")
    .select("id", { count: "exact", head: true })
    .like("phone", `${BULK_PHONE_PREFIX}%`);
  if (existingErr) { console.error("Could not check for an existing bulk seed:", existingErr.message); process.exit(1); }
  if (existing && existing > 0) {
    console.error(
      `${existing} bulk-seeded persons already exist. Run with --clean first if you want a fresh set ` +
      `(this script cannot tell "add more" from "duplicate", so it refuses rather than guess).`,
    );
    process.exit(1);
  }

  console.log(`Seeding ${count} mock leads across ${PROJECTS.length} projects, owners: ${owners.length} (+ unassigned)...`);
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  let inserted = 0;
  for (let start = 0; start < count; start += BATCH_SIZE) {
    const batchSize = Math.min(BATCH_SIZE, count - start);

    const personsBatch = Array.from({ length: batchSize }, (_, j) => {
      const n = start + j + 1;
      return {
        phone: `${BULK_PHONE_PREFIX}${String(n).padStart(9, "0")}`,
        full_name: `${BULK_NAME_PREFIX}${n}`,
        email: `bulk-buyer-${n}${BULK_EMAIL_SUFFIX}`,
      };
    });
    const { data: insertedPersons, error: personsErr } = await db
      .from("persons")
      .insert(personsBatch)
      .select("id");
    if (personsErr) { console.error(`\nBatch at ${start} (persons) failed:`, personsErr.message); process.exit(1); }
    if (!insertedPersons || insertedPersons.length !== batchSize) {
      console.error(`\nBatch at ${start}: expected ${batchSize} persons, got ${insertedPersons?.length ?? 0}.`);
      process.exit(1);
    }

    const leadsBatch = insertedPersons.map((p) => {
      const project = pick(PROJECTS);
      const status = pick(CALL_STATUSES);
      const stage = pick(STAGES);
      // 80% created in the last 90 days (recent, exercises the default sort and date filters),
      // 20% spread over the last year (so "all time" totals are not just "last quarter").
      const createdAt = new Date(now - (rand() < 0.8 ? int(0, 90) : int(0, 365)) * dayMs - int(0, dayMs));
      const untouched = rand() < 0.25; // no first_touch_at yet — exercises the "Untouched" filter/index
      const firstTouchAt = untouched ? null : new Date(createdAt.getTime() + int(dayMs / 24, 5 * dayMs));
      // ~8% of touched leads are past due with no breach recorded yet, ~8% already breached —
      // enough rows on both sides of the partial indexes to be worth planning around.
      const slaRoll = rand();
      const slaDueAt = untouched ? new Date(createdAt.getTime() + int(45, 180) * 60_000) : null;
      const slaBreachedAt = untouched && slaRoll < 0.08 ? new Date((slaDueAt as Date).getTime() + int(0, 6 * 60) * 60_000) : null;
      const ownUnassigned = rand() < 0.15;
      return {
        person_id: p.id,
        project_id: project,
        location_id: LOCATION_BY_PROJECT[project],
        assigned_to: ownUnassigned ? null : pick(owners),
        call_status: status,
        temperature: status === "connected" ? pick(TEMPERATURES) : null,
        pipeline_stage: stage,
        is_live: rand() < 0.7,
        assigned_at: ownUnassigned ? null : createdAt.toISOString(),
        first_touch_at: firstTouchAt ? firstTouchAt.toISOString() : null,
        last_activity_at: firstTouchAt ? firstTouchAt.toISOString() : null,
        next_call_at: !untouched && rand() < 0.4 ? new Date(now + int(-2, 14) * dayMs).toISOString() : null,
        sla_due_at: slaDueAt ? slaDueAt.toISOString() : null,
        sla_breached_at: slaBreachedAt ? slaBreachedAt.toISOString() : null,
        budget_min: int(3000000, 15000000),
        budget_max: int(15000001, 40000000),
        created_at: createdAt.toISOString(),
      };
    });
    const { data: insertedLeads, error: leadsErr } = await db.from("leads").insert(leadsBatch).select("id");
    if (leadsErr) { console.error(`\nBatch at ${start} (leads) failed:`, leadsErr.message); process.exit(1); }
    if (!insertedLeads) { console.error(`\nBatch at ${start}: leads insert returned nothing.`); process.exit(1); }

    const sourcesBatch = insertedLeads.map((l) => ({
      lead_id: l.id,
      source_id: pick(SOURCES),
      campaign: `bulk-campaign-${int(1, 5)}`,
      received_at: new Date().toISOString(),
    }));
    const { error: srcErr } = await db.from("lead_sources").insert(sourcesBatch);
    if (srcErr) { console.error(`\nBatch at ${start} (lead_sources) failed:`, srcErr.message); process.exit(1); }

    inserted += insertedLeads.length;
    process.stdout.write(`\r  ${inserted} / ${count}`);
  }

  console.log(`\nDone. ${inserted} mock leads inserted on top of the existing seed.`);
  console.log("Next: measure signed in as a MANAGER or CALLER, not super_admin like this script.");
  console.log("      app.is_admin() short-circuits can_read_lead() before it ever reaches the");
  console.log("      descendant/scope subqueries P1-4 is about, so super_admin flatters the plan");
  console.log("      exactly the way the postgres role would (10-performance.md, step zero).");
  console.log("      Clean up later with: npx tsx supabase/tools/seed-bulk.ts --clean");
}

main();
