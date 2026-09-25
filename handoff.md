# Handoff — performance work, branch `claude/repo-review-g73yf2`

2026-09-25. What this branch did, what state it left things in, and what to do next. Read
`brain/10-performance.md` for the full design and the real measured numbers — this is the short
version, and it supersedes the version of this file from earlier today (the "nothing measured yet"
line below is no longer true; measurements are in).

## Why this branch exists

Adish asked for a system design pass on performance: the CRM is being built against 42 seed leads
but will run against 10,000–20,000, and the app already felt slow. The findings, the plan, and now
real measured numbers live in `brain/10-performance.md`, added to the read order in
`brain/00-START-HERE.md`.

## What's done (commits `df36b79` → `1607955`, all pushed)

1. **`brain/10-performance.md`** — the design doc, and now a **Baseline measurements** section
   with real numbers, not predictions.
2. **`vercel.json`** — pins Vercel functions to `bom1` (Mumbai). Takes effect on the next deploy.
3. **`revalidatePath` narrowed** in `src/actions/leads.ts` and `src/actions/assignment.ts` — no
   longer purges the whole app's router cache on every write.
4. **`supabase/tools/seed-bulk.ts`** — built and run against the shared project. Signs in as
   `super@parmar.test`, writes through ordinary RLS (no service_role key needed). **The shared
   database now holds 20,042 leads.** `--clean` reverses it.
5. **`supabase/tools/bench.ts`** (`npm run db:bench`) — built and run. Measures the five budgets
   signed in as a manager and a caller (never `super_admin` — it short-circuits the RLS cost the
   same way `postgres` would).

`tsc --noEmit`, `eslint`, and a full `next build` all pass clean throughout.

## What the measurements found — read this before doing anything else

**This is not a "slow app" problem at 20k rows. It's an outage.**

- The manager `/leads` list **timed out 20/20 times** on first measurement (Postgres killed it at
  8.3–9.2s, error 57014), right after the bulk seed landed. A few minutes later, same query, same
  data: 1,362ms — still 2.7× over the 500ms budget, no longer a hard failure. **Why it changed is
  not confirmed** (no raw SQL access from this environment to check autovacuum/`ANALYZE` timing on
  `leads`) — the honest hypothesis is stale planner statistics right after a 20,000-row write, but
  that is a hypothesis, not a proven cause.
- **Isolated the fix that matters most**: removing `count: "exact"` from that same query drops it
  to 280ms — under budget, ~5× faster, with none of the RLS-policy risk the full migration carries.
- Lead detail: 976ms for **one row** (400ms budget) — not a scan-size problem, it's
  `persons_select`/`lead_sources_select`/`activities_select` each re-evaluating `can_read_lead()`
  per joined row.
- `/dashboard`: 343ms, under its 800ms budget — fine for now, not a reason to skip Phase B.
- **CSV export is currently impossible, not just slow.** `EXPORT_MAX_ROWS` (20,000) and the actual
  row count (20,042) have crossed. An unfiltered export is refused in 2.1s. This turned open
  decision #3 from a someday-question into something actively blocking a real admin task today.

Full numbers, caveats, and reasoning: `10-performance.md`, section "Baseline measurements —
2026-09-25, pre-migration".

## What I would do next, in order

1. **Get the export-cap decision (open decision #3) answered first — it's the fastest, lowest-risk,
   highest-visibility fix available**, and it's already broken in production-shaped terms. Raise
   the cap, require a narrower filter, or fast-track the streaming export (P2-9). Doesn't touch
   RLS, doesn't need Adish specifically, low risk to ship.
2. **Try dropping `count: "exact"` (P2-8) as its own small change, decoupled from migration 0011.**
   The baseline measurement shows this alone recovers most of the list-query budget (1,362ms →
   280ms) with none of the caller/manager leak risk the RLS flattening carries. It needs open
   decision #2 (approximate row counts acceptable?) answered first — that's a five-minute ask, not
   a design problem.
3. **Get someone with Supabase dashboard/SQL access to check `pg_stat_user_tables.last_autoanalyze`
   on `leads`**, to actually confirm or rule out the stale-statistics hypothesis for the timeout
   storm. If confirmed, add `analyze public.leads;` as a documented step after large imports —
   worth a line in the CSV-import runbook (task A3.1's real path), since a genuine 20k-row import
   would hit the same wall.
4. **Only then, migration 0011** (flatten `leads_select` and friends onto `assigned_to`/
   `project_id`/`location_id` predicates) — Adish only, per `04-access-control.md`. The proposed
   SQL is in `10-performance.md` P1-4, along with the specific way to get it wrong: flattening
   `can_read_lead()` without carrying the `caller` branch across leaks every caller their manager's
   whole territory, because `my_scope_projects()` resolves upward through ancestors. Gated on all
   fourteen access tests, the six manual ones in `04-access-control.md`, plus a new negative test
   proving a caller still can't see their manager's territory. Re-run `bench.ts` after, both
   before/after numbers go in the PR.
5. **Reference-data caching (P2-7) — still deliberately not built.** `"use cache"` and
   `unstable_cache` both refuse `cookies()` inside the cached scope, and the RLS client needs the
   session cookie even for `using (true)` tables, so a cache built today would key per session, not
   cross-user. Wants the JWT-claims work in step 6, not before.
6. **JWT role claims / auth hook (P0-2)** — needs open decision #1 (JWT staleness vs. instant
   deactivation) answered first. Unlocks P2-7 properly and removes the duplicate `auth.getUser()` /
   `users` lookups in the proxy and every page.

## Loose ends

- `.env.local` exists on this machine only (gitignored, never committed, never shared here). Any
  session that needs to run `db:bench` or `db:seed-bulk` again needs its own copy of the URL +
  anon key — ask Adish, never the service_role key for these two tools specifically (neither needs
  it; see their file headers for why).
- Four open decisions remain in `10-performance.md`: JWT staleness, approximate row counts, the
  export cap (now urgent, see above), and page size. All are the human's to make, not to guess.
- Everyone's `/leads`, `/dashboard` etc. now show a very different row count than before this
  branch (20,042 vs. 42). Expected, not a regression.
- `supabase/tools/bench.ts` is built to be re-run after every phase, with a small iteration count
  and an early-stop after repeated failures on purpose — it's a shared database, and the first run
  already proved that hammering it with 20 iterations of a timing-out query wastes everyone's
  shared CPU for no new information once the answer is clear.
