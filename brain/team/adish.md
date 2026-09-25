# Adish

**Owns:** Foundation, auth, org, migrations, shared core, admin console, dashboards

This file belongs to Adish. Nobody else edits it. Everyone else reads it.

---

## Currently working on

Week 3, A3.1–A3.4 (import, export, audit viewer, password reset) — built. Waiting on `db push` of **0007 and 0008**, and on configuring Supabase email. Branch: `feat/org-user-management`.

## Blocked

_(what is stopping you, and who can unblock it. Empty is good.)_

## Asking

_(questions for a specific person. Write their name first so they see it.)_

Example:
- **@adish** — migration 0004 is merged, can you apply it?

## Answering

_(replies to things other people asked you)_

## Notes for the team

_(anything the other three should know: a pattern you established, a gotcha you hit, a file you touched that they also use)_

---

## Log

Newest at the top. One entry per working session.

### 2026-09-25 (perf) — Phase B done: lead read rules made fast (migrations 0011, 0012)
- `/leads` timed out (57014) at 20,042 leads from the bulk seed below. **0011:** `leads_select` written inline with `(select ...)` InitPlans instead of the per-row `can_read_lead(id)`; new index `leads(created_at desc, id)`. **0012:** persons / lead_sources / activities / assignments read as `EXISTS` on `leads` (RLS applies inside, so it is `leads_select` itself); new index `leads(person_id)`. **Apply both: `npx supabase db push`.** Access is unchanged; the caller trap in the performance branch's warning is handled (`my_role() is distinct from 'caller'` guards the scope branches). Decision: D-036.
- Measured as each role (20k leads): admin count 4.7 s to 73 ms; admin page 6.9 s to 1.8 s; caller page 1.5 s; manager page 8 s (timeout) before 0012. Caller1 sees exactly its 2,890 assigned leads, so no territory leak.
- **Tests made scale-safe:** `db:test` and `test:leads` assumed the 27-lead seed and the API's 1,000-row cap, so they failed once the bulk data was in (data, not a leak). They now page through every row and assert the real rule (a Pune lead is visible to Worli people only if it belongs to their team). `db:test` 14/14 and `test:leads` pass at 20,042 leads.
- **Answered the performance open decisions (D-037):** export cap stays 20,000 (narrow the filters, export in parts); counts stay exact for every role (37-73 ms now). The other two are still open.
- **Still to do from the handoff:** run `analyze public.leads;` and check `last_autoanalyze` (stale-statistics hypothesis), then re-run `npm run db:bench` to record the after numbers next to the baseline below.


### 2026-09-25 — restyle: shell and dashboard (Workroom look)
- New look from the Figma "CRM Workroom" reference: pale blue-grey page, white rounded cards, one blue accent, floating rounded sidebar with icons, welcome line and user chip in the top bar.
- **All colours and the corner radius are tokens in `src/app/globals.css`**, so every screen (yours too) picks up the new blue and rounder corners with no change. The status-badge palette in `07-ui-conventions.md` is untouched.
- Sidebar icons are keyed by route inside `SidebarNav.tsx`; adding a line to `NAV` needs no change there (unknown routes get a fallback icon). Only the longest matching route is highlighted now, so `/team` no longer lights up on `/team/leads`.
- For new cards use `rounded-2xl bg-card p-5 shadow-sm` (see `StatCard`), not `border`.
- tsc and lint pass. **Not looked at in a browser** (the pane can't open localhost): check `/dashboard`, `/leads`, `/users` and a phone-width view.

### 2026-09-25 (later) — baseline budgets measured: it's worse than "slow"
- **`supabase/tools/bench.ts`** (`npm run db:bench`) built and run against the live 20,042-lead
  database, signed in as `mgr.worli` and `caller1` (never `super_admin` — see why in the file).
  Results are written up in full in `10-performance.md` under **Baseline measurements**. Short
  version:
- **The `/leads` list for a manager timed out 20/20 times** on the first run — Postgres killed the
  statement at 8.3-9.2s (error 57014), right after the bulk seed landed. A few minutes later the
  same query took 1,362ms. **Not confirmed why** (no raw SQL access from here to check
  `pg_stat_user_tables` for autovacuum timing), but the honest read is stale planner stats right
  after a 20,000-row write. **Worth a line in the CSV-import runbook** when A3.1's real path is
  hardened — the same thing could happen after a large real import.
- **Isolated the cause precisely: it's the exact count, more than the policy alone.** Same query
  without `count: "exact"`: 280ms, under budget, ~5x faster than the 1,362ms counted version. This
  is P2-8, and it might be worth landing **before or separately from** the RLS migration (P1-4) —
  smaller, safer change, no caller/manager leak risk, recovers most of the win on its own. Needs
  open decision #2 (approximate counts) answered first.
- **Lead detail is slow even for a single row:** 976ms vs. 400ms budget. Not a scan problem — it's
  `persons_select`/`lead_sources_select`/`activities_select` each re-calling `can_read_lead()`
  again per joined row. First real number on the "quieter cost" I flagged under P1-4 originally.
- **Dashboard is fine for now:** 343ms vs 800ms budget, as manager. Softens P2-10's urgency, doesn't
  remove it — single-pass aggregate, will get worse as leads and managers grow.
- **The export cap is not hypothetical anymore.** `EXPORT_MAX_ROWS` (20,000) and the actual row
  count (20,042) crossed the moment the bulk seed landed — an unfiltered export is refused outright
  today, in 2.1s, not merely slow. **Open decision #3 just became urgent**, not a Phase C
  nice-to-have. A filtered export (one project, 3,279 rows) took 4,902ms, well inside the 30s
  budget — extrapolating that to 20k isn't trustworthy since cost is partly per-page, not linear.
- Consolidated three scratch scripts (a broad sweep, a cause-isolating probe, an export-only check)
  into the one `bench.ts` committed here — smaller iteration count on purpose (5, not 20) with an
  early-stop after 2 failures, so a future re-run after Phase B doesn't hammer the shared project
  the way the first sweep did if something regresses.
- `10-performance.md` updated throughout: a new **Baseline measurements** section, the Targets
  table points to it, decision #3 marked urgent, and a note in the Phase B plan about landing P2-8
  separately.

### 2026-09-25 — bulk seed run against the shared project
- **The shared database now holds 20,042 leads** (the original 42 + 20,000 mock). Everyone's
  `/leads`, `/dashboard` etc. will look very different next time you pull and run — this is
  expected, not a bug. Bulk rows are `Bulk Buyer <n>` / phones `+9199…` / `bulk-buyer-<n>@example.test`,
  easy to tell apart from the real seed.
- **Changed the script's approach before running it**: it no longer wants the service_role key.
  `leads_insert`/`persons_write`/`lead_sources_insert` already grant to `app.is_admin()`, so it
  signs in as `super@parmar.test` and writes through ordinary RLS instead — no reason to reach for
  the key that bypasses it when admin can already do the insert the normal way.
- Did a 50-row dry run first (first time this script had touched a live database), verified the
  distribution and the `--clean` round-trip, then ran the real 20,000. Final counts match the
  intended distribution: ~25% untouched with an SLA clock, ~15% unassigned, ~8% of the untouched
  already breached.
- `.env.local` is in place on this machine (gitignored, not committed, not shared here).
- **What's still not done: no baseline numbers.** Seeding is step zero, not the measurement.
  Whoever picks up Phase B needs to measure the five budgets in `10-performance.md` **signed in as
  a manager or caller** — `super_admin`'s `is_admin()` short-circuit flatters the RLS cost the same
  way the `postgres` role does, so it would silently hide exactly what P1-4 is about.
- `10-performance.md` step zero and the Phase A checklist updated to reflect all of the above.

### 2026-09-24 (later) — Phase A of the performance plan
- **`vercel.json`** added, pinning Vercel functions to `bom1` (Mumbai) instead of the default
  `iad1` (Washington). Takes effect on the next deploy; nothing to measure locally.
- **`revalidatePath("/", "layout")` removed** from `src/actions/leads.ts` and
  `src/actions/assignment.ts` — it was purging the whole app's router cache on every saved call
  outcome, remark, reassign and bulk assign. Both now narrow to `/leads` (layout, covers
  `/leads/[id]`), `/dashboard`, `/my-day` (layout). `org.ts`'s two refresh functions were already
  scoped correctly and needed no change. **For Arisha:** when `/team/leads` (B1.1) lands, add it to
  the `refresh()` list in both files — it's shared by every portal on purpose, don't add a third copy.
- **Reference-data caching (projects/sources/users) investigated, not built.** `"use cache"` and
  `unstable_cache` both refuse to read `cookies()` inside the cached scope, and our Supabase client
  needs the session cookie even for the `using (true)` tables, so the honest version caches
  per-session, not cross-user — a fraction of the win it looks like. The real version wants the
  JWT-claims work already queued in `10-performance.md` Phase C. Written up in P2-7 so nobody
  rediscovers this mid-sprint. Small session-scoped version is still available if anyone wants it
  sooner, at the cost of a bit of complexity for a partial win — I'd rather wait for Phase C.
- **`supabase/tools/seed-bulk.ts` built** (`npm run db:seed-bulk`, needs `SUPABASE_SERVICE_ROLE_KEY`
  same as `create-test-users.mjs`). Inserts up to 20,000 mock leads on top of the existing seed —
  phones start `+9199` so they're identifiable and reversible (`--clean` removes them). Spreads
  across all 6 projects, the 6 non-admin seeded users as owners plus 15% unassigned, dates over the
  last year (80% recent), and a realistic mix of touched/untouched/SLA-breached so the indexes and
  filters in Phase B actually get exercised rather than flattered. **Not run yet against the shared
  project** — whoever runs it, say so here first, it's 20,000 rows everyone's dev session will see.
- `npx tsc --noEmit`, `eslint` on the touched files, and `next build` all clean.
- Baseline numbers for the five budgets in `10-performance.md` are still outstanding — need the
  bulk seed run first, then measured as `authenticated`, not as `postgres` (P0's own step zero).

### 2026-09-24 — performance design for 20,000 leads
- New brain file: **`10-performance.md`** (added to the read order in `00-START-HERE.md`). What is
  slow, why, and the order to fix it in. Read it before Week 2 work — Phase B changes the RLS
  policies everyone's screens sit on.
- **The three biggest causes are not about data volume**, which is why the app already feels slow
  at 42 leads: (1) no `vercel.json`, so functions run in Washington while the database is in
  Mumbai — ~230 ms per round trip, six round trips a page; (2) the proxy and the page each fetch
  the user twice over, four trips for two facts; (3) `revalidatePath("/", "layout")` on every
  saved outcome purges the whole app's cache.
- **The 20,000-row killer is the `leads_select` policy.** `can_read_lead(id)` is SECURITY DEFINER,
  so it is never inlined, and it re-reads by primary key the row Postgres already has, calling
  three more SECURITY DEFINER helpers inside. Six sub-plans a row, run across the whole filtered
  set because we ask for `count: "exact"`. It also stops the planner using the `assigned_to`,
  `project_id` and `location_id` indexes at all.
- **Warning for whoever writes migration 0011** (proposed SQL is in the file, nothing applied):
  flattening that policy naively **leaks every caller their manager's whole territory**.
  `my_scope_projects()` resolves upward through ancestors, and today only the `caller` branch in
  `can_read_lead` stops it being consulted. Carry that branch across or the caller role is gone.
  Gate: all fourteen access tests, the six manual ones, plus a new negative test for exactly this.
- Also found: **no index on `leads.created_at`**, which is the default sort — every list query
  sorts the whole visible set for 25 rows. And search is `ilike '%x%'`, which no btree can serve;
  `pg_trgm` GIN indexes fix it with no application change.
- **Four decisions I need from Gautam** before Phase C (listed at the end of the file): JWT
  staleness vs. instant deactivation, exact vs. approximate row counts, the 20,000 export cap now
  that it is the whole database, and page size.
- Nothing measured yet, and that is the first task: we have 42 leads. Step zero in the file is a
  20,000-row seed, because measuring as `postgres` bypasses RLS and will tell you everything is fast.
- Installed the `system-design` skill at `.claude/skills/system-design/`.

### 2026-09-20 (final) — dashboards built
- **D1.1–D2.4 built:** `/dashboard` with the four headline numbers, a Today / All-time toggle at the top, the lead-routing panel (admins), and every manager's portfolio by stage. Counted in SQL: **migration 0010** (`dashboard_counts`, `dashboard_portfolios`). **Apply it, then `npm run db:types`.**
- Meaning of every number, and what the toggle changes: **D-035**. Assumptions to confirm are marked there (Monday week start, portfolio = own + team leads, default range Today, unassigned untouched leads counted).
- Tests: `npm run test:dashboard` recomputes every number independently from raw rows and checks each role's scope. SKIPS until 0010 is applied. I could only check the SQL parses (offline), not run it.
- New lead filter `owner=team:<managerId>` (a manager's whole book), used by the portfolio links.
- Found in passing: the `03-data-model.md` functions table had a row outside the table; fixed.
- **Gotcha for everyone writing tests:** a developer machine's clock can be hours off the database's (mine was 8 hours behind, on a different IST calendar day). "Today", "this week" and working hours are decided by the DATABASE, so tests must not use `new Date()` for them. Use `dbNow()` from `supabase/tests/db-clock.ts`; it reads the server's `Date` header.
- `0009` is applied and `npm run test:territory` passes in full (assign, exit transfer, territory editor).

### 2026-09-20 (last) — dashboards moved to me
- The company dashboard (D1.1, D1.2, D1.3, D2.3, D2.4) moved from Sayli to me (D-034). Tasks are in `tasks/adish-tasks.md` under Dashboards; `getDashboard` is in its own section of the API contracts. I build them after Week 3, before the Week 4 hardening.
- **Sayli:** your dashboard tasks are gone. When you start, your first task is attendance (D2.1, D2.2); it feeds lead routing. Please update your own `team/sayli.md` (the Owns line says dashboard). My dashboard reads `site_visits`, `attendance` and `geofences`, so tell me here before you change their columns.

### 2026-09-20 (night) — migrations 0007 and 0008 applied; one fix needed
- `test:admin` passes in full on the real database, including the 1,200-row import (1.3 s) and the re-import (1,200 duplicates, 0 new).
- `test:territory` found a real bug in 0007: `set_user_scopes` failed with "permission denied for schema app". **New migration 0009 fixes it (D-033). Apply it, then re-run `npm run test:territory`.**

### 2026-09-20 (evening) — Week 3 built: A3.1–A3.4
- **A3.1** `/import`: choose source + file, map columns (guessed, then remembered per browser), preview, import in batches with progress, summary, downloadable error report, and a history table. **A3.2** "Export CSV" on `/leads`: audited BEFORE it returns data, refused if the audit write fails. **A3.3** `/audit`: exports first, then the filterable log. **A3.4** `/reset-password` + `/auth/confirm` + `/set-password`, and "Require password change" (optionally with a temporary password) on a user's page.
- **Migrations to apply: 0007 and 0008.** Then `npm run db:types`.
- **Configure Supabase email before go-live** (SMTP, redirect URLs, Reset Password template): `brain/PASSWORD-RESET.md`. Until then use the temporary-password route.
- Assumptions to confirm are in D-030 (inactive project = error row; routing reason `round_robin`; limits 5,000 rows / 5 MB; mapping remembered per browser).
- Tests: `npm run test:admin` — 68 checks pass; the 1,200-row import cycle SKIPS until 0008 is applied. Run it with `SUPABASE_SERVICE_ROLE_KEY` on the command line to include the real forced-password cycle.
- **For everyone:** `lib/csv.ts` (`toCsv`, formula-safe) and `filteredLeads()` in `lib/leads/queries.ts` (the one place "the current filters" is defined) are shared.
- Found and fixed while refactoring: an async function that returns a query builder AWAITS it (runs the query). `filteredLeads` now returns `{ query }`. Worth knowing before anyone writes a similar helper.

### 2026-09-20 (later) — Week 2 built: A2.1–A2.5
- **A2.1** `/territories` (coverage by city, gaps flagged) and `/territories/[managerId]` (editor with a LIVE overlap warning that never blocks Save). **A2.2** `/territories/projects`: create/edit locations and projects, deactivate not delete. **A2.3** `/leads` now has every filter, multi-select and bulk assign; lead detail has assign/reassign. **A2.4** exit transfer follows your rule (D-026), with a preview before you confirm. **A2.5** audit coverage table in `04-access-control.md`.
- **Migration 0007 to apply:** `set_user_scopes`, `move_leads`, and a trigger that moves a project's leads when its location changes. Then `npm run db:types`.
- Tests: `npm run test:territory` (pure rules + live). Everything that needs 0007 SKIPS until it is applied; nothing that needs it has been run yet.
- **For Arisha:** bulk selection is in `components/shared/selection.tsx` and the assignment core is `lib/leads/assign.ts` + `public.move_leads()`. Read D-027 before B2.1 — the "target must be able to read the lead" guard is trivially true and the real risk is different.
- **For everyone:** `callRpc()` in `lib/supabase/rpc.ts` is how to call a database function before the types know it.

### 2026-09-20 — user management (A1.1–A1.4)
- Built: `/users` list (role filter, name search, deactivated greyed), `/users/new`, `/users/[id]` (edit, deactivate with open-lead count first, reactivate), `/users/hierarchy` (tree with rolled-up lead counts). Actions in `actions/org.ts`; logic in `lib/org/` (pure, tested).
- **Migrations to apply: `0005_lead_counts_by_owner` and `0006_hierarchy_rebuild_where`. Then everyone runs `npm run db:types`.**
- **Bug found and fixed (D-025):** `app.rebuild_hierarchy()` from 0001 does a bare DELETE, which Supabase's pg_safeupdate rejects for API sessions — so any real createUser or re-parent would have failed. Only worked in the seed because the SQL editor is exempt.
- The service key is now allowed in ONE file (D-023). It goes in your `.env.local` only; nobody else needs it.
- Assumptions to confirm are listed in D-024 (admin reports to super_admin; no second super_admin; can't deactivate someone with active reports; transfer target chosen by you until A2.4).
- Tests: `npm run test:org` — 59 pass, 3 skipped until 0005/0006 are applied and the service key is supplied.
- Next: apply migrations, run the real create/ban test, then Week 2 (A2.1 territory editor).

### 2026-09-19 (evening) — shared core landed
- **Migrations 0001–0004 applied, seed loaded, 8 test users created.** `npm run db:types` done — pull `main` and run it (or take `src/types/database.ts` from `main`).
- **Shared core is finished and tested.** `actions/leads.ts` (getLeads, getLead, updateCallStatus, addRemark), `DataTable`, `leadColumns`, `LeadFilters`, `LeadDetailShell`, `LeadSummary`, `ActivityTimeline`, `LeadSources`, URL param helpers. Read `brain/SHARED-CORE.md` — it has the exact contracts and a recipe for building a list + detail screen.
- Reference screens: `/leads` and `/leads/[id]` (admin). Copy the shape.
- Tests: `npm run db:test` (14 access checks) and `npm run test:leads` (45 data-layer checks) both pass against the shared project.
- Fixed a real bug on the way: zod 4 `uuid()` rejected the seed project ids, which would have broken every project filter.
- Not done: row selection for bulk reassign (Arisha, B2.2), SLA countdown (Arisha B2.4 / Tanishka C1.3).
- Next: gate call Thu 25 Sep, then Week 1 (A1.1 user list).

### 2026-09-19
- Unpacked the scaffold; created the Next.js 16 app, shadcn, all runbook dependencies. Builds clean.
- Built: Supabase clients, `src/proxy.ts` (session + login redirect + deactivated sign-out), login page and `signIn`/`signOut`/`requestPasswordReset`, app shell with role-aware nav, `StatusBadge`, the four states, `permissions.ts`, `format.ts`. See `brain/SHARED-CORE.md`.
- Fixed the scaffold: `seed.sql` now looks auth users up by email and assigns leads to callers; new migration `0004_caller_column_guard.sql` (callers could reassign their own leads); access test script rewritten to 14 checks that can't pass vacuously. Decisions D-018 to D-020.
- Next: GitHub repo + branch protection, Supabase project (Mumbai), apply migrations, load seed, run `npm run db:test`.
- **Not applied to any database yet** — 0004 and the new seed are untested against real Postgres.
