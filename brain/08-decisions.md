# Decisions

Append-only. Never rewrite an entry — supersede it with a new one. This file is why nobody has to re-argue a settled question.

Format: `D-NNN | date | decision | why | who`

---

**D-001 | 2026-09-19 | Single tenant, Parmar Properties only**
No `organization_id`, no tenant switching. Gautam confirmed this is internal, not a product.
*Consequence: if it is ever sold, that is a rewrite, not a feature.*

**D-002 | 2026-09-19 | Access control in Postgres RLS, not in React**
Supabase serves the database over HTTP; frontend filtering hides data, it does not protect it. `service_role` never enters application code.

**D-003 | 2026-09-19 | Two visibility axes, joined by OR**
Hierarchy (closure table) for supervision, territory (`user_scopes`) for coverage. A manager sees his territories *and* his descendants. Neither alone matches how the business works.

**D-004 | 2026-09-19 | Sub_managers inherit territory, never own it**
No `user_scopes` rows for sub_managers. Resolved upward at query time. Giving a manager a new project automatically gives it to his sub_managers.

**D-005 | 2026-09-19 | One lead = one person per project**
`persons` separate from `leads`, unique on `(person_id, project_id)`. One buyer enquiring on two projects makes two leads with possibly two owners, while the person record still shows everything.

**D-006 | 2026-09-19 | Duplicates add a source row, never a second lead, never a new owner**
Same phone + same project arriving again appends to `lead_sources`. The original owner keeps the lead. This is the rule that prevents internal ownership fights.

**D-007 | 2026-09-19 | `call_status` and `pipeline_stage` are separate fields**
`call_status` is what the caller picks (new/attempted/connected/lost, plus temperature). `pipeline_stage` is where the money is, moved by events. Conflating them was the original misunderstanding — see `09-glossary.md`.

**D-008 | 2026-09-19 | Working hours 10:30–19:30 IST for everyone**
All SLA arithmetic in working minutes via `app.add_working_minutes`. Leads arriving overnight queue for 10:30 rather than being assigned at 02:00 and breaching before anyone is awake.

**D-009 | 2026-09-19 | Free tier, one project, mock data only**
Supabase free tier allows two active projects, pauses after 7 days idle, and has **no backups**. We use one shared project with mock data.
*Consequence: real client leads must not be loaded until a second project exists on the Pro plan ($25/mo). A CRM losing its lead database has no undo. Revisit before go-live.*

**D-010 | 2026-09-19 | 45-minute SLA notifies, never reassigns**
Escalation writes notifications to the manager and super_admin. A human decides what happens. Automatic reassignment would move leads while a caller is mid-conversation.

**D-011 | 2026-09-19 | SLA applies to live leads only**
Meta, 99acres, MagicBricks, Housing, listing agents. Walk-ins and referrals never escalate.

**D-012 | 2026-09-19 | Manual calling in v1, no telephony**
Callers dial from personal phones. Activity logging is manual and will be imperfect. Mitigations: `next_call_at` is mandatory on attempted/connected, and each caller sees their own "not updated today" count.
*Revisit: cloud telephony (Exotel or similar) in v2 gives automatic call logs, recordings and number masking.*

**D-013 | 2026-09-19 | Export restricted to super_admin and admin, always audited**
Viewing cannot be locked down without telephony — callers need the number to dial. Export is the real leak path, so that is where the control sits.

**D-014 | 2026-09-19 | CSV ingestion only in v1**
Pipeline built so a webhook can be added later without changing anything downstream of `lead_sources`.

**D-015 | 2026-09-19 | Geofence prompts, never auto-switches**
Entering a project radius asks "Start site visit mode?". GPS drift and forgotten check-outs make automatic switching unreliable.

**D-016 | 2026-09-19 | Person-named folders hold documentation only, never code**
Code is organised by feature. `brain/team/*.md` holds status, logs and messages. Each person owns exactly one file, so four people report status with zero merge conflicts.

**D-017 | 2026-09-19 | All schema changes through migration files, applied by Adish only**
Never the Supabase dashboard. Four developers on one database makes undocumented schema drift the single biggest project risk.

**D-018 | 2026-09-19 | Callers cannot change ownership, identity, territory or SLA columns**
`leads_update` allowed a caller to edit any column of their own lead, including `assigned_to`, contradicting the action matrix. Fixed with a BEFORE UPDATE trigger (`0004_caller_column_guard.sql`) rather than the policy, because a trigger sees OLD and NEW and RLS WITH CHECK does not. Updates issued by other triggers (`pg_trigger_depth() > 1`) are exempt so `first_touch_at` still gets set.
*Consequence: manager reassignment limits are still application-level until someone specifies them precisely.*

**D-019 | 2026-09-19 | Next.js 16: `proxy.ts`, not `middleware.ts`**
The scaffold installed Next 16, where `middleware.ts` is deprecated and renamed `proxy.ts`. Session refresh, login redirect and deactivated-user sign-out live in `src/proxy.ts` and `src/lib/supabase/proxy.ts`. shadcn's `toast` is now `sonner`, and there is no `form` component: forms use react-hook-form directly with the shared zod schema.

**D-020 | 2026-09-19 | Seed looks auth users up by email**
`seed.sql` reads `auth.users` by email instead of needing pasted uuids, and fails loudly if any of the eight test users is missing. It also assigns leads to callers, because access tests that run against unowned leads pass without proving anything.

**D-021 | 2026-09-19 | One-off local script may use the service_role key**
supabase/tools/create-test-users.mjs creates the eight mock auth users through the admin API. It lives outside src/, reads the key from a command-line env var (never .env.local, never committed), refuses non-@parmar.test emails, and touches auth users only. This is the same class of exception as migrations: local tooling run by Adish, never application code.

**D-022 | 2026-09-19 | Lead data layer is pure functions; actions are thin wrappers**
`src/lib/leads/queries.ts` takes a session-bound client and has no `next/*` imports; `src/actions/leads.ts` only adds the session, audit and `revalidatePath`. This lets `npm run test:leads` prove list, filter, paging, detail and call-outcome behaviour against the real database with real users. Validation uses `z.guid()` rather than `z.uuid()` because zod 4's `uuid()` rejects the seed's readable ids.
*Consequence: a call outcome is two writes (lead, then activity row), not one transaction. Move it into a database function if partial failures show up.*

**D-023 | 2026-09-20 | The service_role key is allowed in exactly one application file**
`src/lib/supabase/admin.ts` (`import "server-only"`, key from `SUPABASE_SERVICE_ROLE_KEY`, never `NEXT_PUBLIC_`) exposes only `createUser`, `deleteUser` and `updateUserById` of the auth admin API. Task A1.2 requires it: creating a login account needs the admin API, which the anon key cannot call. Every table read and write for user administration still goes through the session client, so `users_insert` / `users_update` (`app.is_super()`) remain the real permission check. The key lives only in Adish's local `.env.local` and in the Vercel project; teammates never need it, and user creation is simply unavailable on their machines.

**D-024 | 2026-09-20 | Deactivating a user: ban the login, transfer open leads, refuse if people still report to them**
Deactivation never deletes. Order: ban the auth user (`ban_duration`), move open leads, set `is_active = false`; a failure after the ban lifts it again. Without the ban a deactivated user's token still works against the API for up to an hour, because RLS does not check `is_active`. "Open" = `pipeline_stage` not in `booked`, `dropped`. Transfers are written to `assignments` with `reason = 'exit_transfer'` and deliberately NOT to `lead_activities`, because any activity row sets `first_touch_at` and would falsely stop a live lead's SLA clock.
*Assumptions made in the build, not stated in the brain — Adish to confirm or change:*
1. An **admin reports to the super_admin** (`PARENT_ROLES` in `lib/schemas/user.ts`).
2. **Nobody can create a second super_admin** (01-product.md says there is one).
3. **A user with active direct reports cannot be deactivated** until they are moved: routing skips callers whose manager is inactive, so leaving them attached would silently starve their leads.
4. Until A2.4 ships, the person who takes the open leads is **chosen by the super admin**, not derived from the territory holder.
*Known gap: a deactivated user's existing access token keeps working until it expires (about an hour). Closing it fully means making the RLS helpers check `is_active` — a separate, high-risk migration.*

**D-025 | 2026-09-20 | Migration 0006: rebuild_hierarchy() needs a WHERE clause**
Supabase runs `pg_safeupdate` for API sessions and rejects a bare `DELETE` (`21000`). `app.rebuild_hierarchy()` from 0001 was one, and it fires from the users trigger, so every API-side user insert or `parent_id` change failed. It went unnoticed because the seed runs in the SQL editor, which is exempt. Fixed forward in `0006_hierarchy_rebuild_where.sql` (`where true`). `updateUser` also now sends `parent_id` only when it changed, so editing a name never triggers a rebuild.

**D-026 | 2026-09-20 | Exit transfer: each open lead goes to the manager who covers its territory**
Decided by Adish. When someone is deactivated, every open lead goes to the ACTIVE manager whose territory covers its project or location. Several managers sharing it: spread evenly (leads in id order, co-holders in id order, so the plan is deterministic). Nobody covers it: the leaver's nearest active manager above them (a caller under a sub_manager falls back to the MANAGER, not the sub_manager); a manager with no manager above falls back to their nearest active superior. Naming one person is kept as an explicit override. Availability (`on_site_visit`, `off`) is ignored on purpose: this hands over a departing person's book, it is not routing of new leads. Replaces the "super admin chooses" behaviour from D-024, point 4.

**D-027 | 2026-09-20 | Lead moves go through one database function, `public.move_leads()`**
Migration 0007. One transaction per call: updates `assigned_to`/`assigned_at`, writes the `assignments` row (reason `manual`, `escalation` or `exit_transfer`, `created_by` = caller), and notifies the new owner. It writes NO `lead_activities` row, because any activity sets `first_touch_at` and would falsely stop a live lead's SLA clock. Manual assignment restarts the 45-minute SLA for live leads exactly as `app.assign_lead()` does; exit transfer leaves the SLA alone. Admins may call it for manual/escalation; only the super_admin for `exit_transfer`. Manual targets are limited to manager, sub_manager, caller; an exit transfer may fall back to an admin.
*Note for Arisha (B2.1):* the brain says to refuse a reassignment "if the target could not read the lead afterwards". For the person the lead is assigned TO that is always true, because `can_read_lead` includes `assigned_to = auth.uid()` for every role. The real risk is the opposite: a lead in a project no manager covers, given to a caller, is visible only to that caller and admins. The manager-scope rule ("within your own scope") and any such guard are still yours to specify with Adish; build them by reusing `lib/leads/assign.ts`, not by writing to `leads.assigned_to` directly.

**D-028 | 2026-09-20 | Territories: managers only, overlap is a warning, locations cover their projects**
Only managers hold `user_scopes` rows (D-004); `setScopes` refuses anyone else. A manager's whole territory is replaced in one transaction by `public.set_user_scopes()`. Ticking a location covers every project in it, including ones added later, so its projects are not stored separately. Overlap is legitimate (D-003), so the editor shows a live warning and never blocks Save; only ACTIVE other managers count. `leads.location_id` is denormalised from the project, so a trigger (`projects_sync_lead_location`) moves a project's leads whenever the project changes location. Projects and locations are never deleted; a project can be made inactive. City is free text, offered from the cities that already exist, and matched case-insensitively so "mumbai" and "Mumbai" never become two cities.

**D-029 | 2026-09-20 | Audit coverage (A2.5)**
See "Audit coverage" in `04-access-control.md`. New audit actions: `scope_change`, `project_create`, `project_update`, `location_create`, `location_update` (plus the `user_*` ones from D-024). Bulk assignment writes ONE audit row per batch with the count, not one per lead.

**D-030 | 2026-09-20 | CSV import: browser reads, server cleans, one database function applies the rules**
Migration 0008, `public.import_leads_batch()`, implements `05-lead-flow.md` "Ingestion" exactly: persons upserted by phone with only BLANK name/email filled; unknown project = error row, never created; one lead per (person, project); a duplicate adds a `lead_sources` row and NEVER changes the owner; a source row is written for every row; a new lead from a live source enters round-robin routing during working hours, and outside them waits unassigned with `next_call_at` = the next 10:30 (`release_night_queue` assigns it then); non-live leads are created unassigned. The browser parses and previews the file (papaparse) and sends batches of 100; the server re-cleans every row (phone to E.164, Excel scientific notation, day-first dates read as IST); each batch is one transaction. This is why the contract's single `importLeads()` became `startImport` / `importBatch` / `finishImport`.
*Assumptions made in the build, not stated in the brain — Adish to confirm or change:*
1. **A row for an INACTIVE project is an error row** ("Project X is inactive"), like an unknown one.
2. Live leads are routed with reason `round_robin`, not `import` (the reason list has `import`, but the mechanism IS round robin; if `import` was meant for something else, say so).
3. Column mapping is remembered **per browser** (localStorage), because the data model has no table for it and we do not invent schema.
4. Limits: **5,000 rows and 5 MB per file**, 100 rows per database call. These are technical safeguards (request size, statement timeout), not business rules. Split larger files.
5. An imported live lead starts its 45-minute clock at import time, whatever its "received" date says, because the clock runs from assignment (D-008, D-010).

**D-031 | 2026-09-20 | Password reset: email link, and a forced change kept in app_metadata**
Self-service goes through `/auth/confirm` (token_hash flow, `recovery` only, same-site `next` only) to `/set-password`; see `brain/PASSWORD-RESET.md`. The super admin's forced change sets `app_metadata.must_reset_password` via the auth admin API (optionally with a temporary password); `proxy.ts` then holds that person on `/set-password` until they change it. It lives in `app_metadata`, not a table (no schema to invent), and not in `user_metadata`, which users can edit themselves. It is a process control, not a security boundary: an existing token still reaches the database until it expires. `admin.ts` now also sets a temporary password and the flag, and `setPassword` uses it to clear the caller's OWN flag; the file's rule is unchanged (login-account administration only, never a table).
*Email reset needs Supabase SMTP configured and the Reset Password template changed; the built-in sender will not deliver to callers and managers.*

**D-032 | 2026-09-20 | Export: audit first, refuse without it**
The audit row (`rowCount`, `filters`) is written BEFORE the CSV is returned, through `logAuditStrict`; if the write fails the export is refused and nothing is returned. An unaudited export must be impossible, not just unlikely, because this is the only control that protects the lead database (D-013). Also: the role check runs before any query; the filter logic is the same function as the table (`filteredLeads`), so "current filters" means one thing; cells that could run as spreadsheet formulas get a leading apostrophe (a buyer can type `=HYPERLINK(...)` into a form), except real phone numbers; the file is refused if leads changed while it was being read, so it can never disagree with its own audit row; one export is capped at 20,000 leads (a memory safeguard, narrow the filters to go beyond it). `notes` is deliberately not exported.

**D-033 | 2026-09-20 | Migration 0009: set_user_scopes is SECURITY DEFINER, with the check as the door**
0007 made it SECURITY INVOKER so RLS would decide. It failed on the real database: the function body calls §app.is_super()§ and the signed-in role has no USAGE on schema §app§ (RLS policies can call §app.*§ helpers; a plain function body cannot). Now SECURITY DEFINER, with the explicit §is_super()§ check as its first statement, so behaviour is unchanged (super_admin only, managers only, one transaction). Found by §run-territory-tests.ts§ before anyone relied on it. Lesson for migrations: a function that calls §app.*§ helpers directly must be SECURITY DEFINER, or the API role cannot run it.

**D-034 | 2026-09-20 | The dashboards move from Sayli to Adish**
Decided by Adish. Tasks D1.1 (company dashboard), D1.2 (manager portfolio rows), D1.3 (role-scoped dashboards), D2.3 (live data via SQL) and D2.4 (engine panel) are now Adish's, under "Dashboards" in §tasks/adish-tasks.md§. Sayli keeps attendance, geofences and site visits. Her Week 1 was entirely the dashboard, so her first task is now attendance (D2.1, D2.2). Nobody else has started yet; the others begin after Adish finishes. Adish's dashboard READS Sayli's tables (§site_visits§, §attendance§, §geofences§), so she keeps their columns stable and says so in §team/sayli.md§ before changing one. §getDashboard§ moved from the Ops section of §06-api-contracts.md§ to a new Dashboard section (§src/actions/dashboard.ts§).
*Consequence: "site visits this week" and the engine panel read 0 until Sayli's flows that fill those tables ship.*

**D-035 | 2026-09-20 | Dashboard: what each number means, and what the toggle changes**
Decided by Adish for the toggle; the definitions below are the build's reading of Gautam's five numbers and are marked where they are assumptions. Migration 0010, two `SECURITY INVOKER` functions, so RLS gives each role its own scope.
- **The Today / All-time toggle changes ONLY "total leads" and the manager portfolios.** Today = leads RECEIVED today (`created_at`, IST day). The other three keep the window Gautam named and ignore the toggle.
- **Untouched right now:** `first_touch_at` is null and the lead is not `booked`/`dropped`, assigned or not (assumption: unassigned untouched leads count, shown as a sub-figure).
- **Escalations today:** `sla_breached_at` falls in today's IST day.
- **Site visits this week:** scheduled in the current IST week, **Monday to Sunday** (assumption), status not `cancelled`.
- **A manager's working portfolio** is every lead owned by them or anyone below them in `user_hierarchy` (assumption). It is deliberately NOT territory-based: two managers can share a territory, which would count the same lead twice. Unassigned leads belong to nobody's portfolio; they show in the engine panel.
- **Engine panel:** Unassigned; "Waiting for 10:30" = unassigned LIVE leads (exactly what `release_night_queue()` picks up); "Needs manual assignment" = the unassigned non-live rest.
- **Who sees what:** callers are redirected to My Day. Admins see the company and the engine panel. Managers see their territory and team, and only their own portfolio row (users RLS). A sub_manager gets the totals for their inherited territory and no portfolio rows.
- Default range is **Today** (assumption). The page links a portfolio row to `/leads?owner=team:<id>` (admins only; managers' lead list is Arisha's portal).
*Consequence: "site visits" and "visits booked" read 0 until Sayli's flows fill `site_visits`.*

**D-036 | 2026-09-25 | Lead read rules rewritten for speed (migration 0011). Access is unchanged.**
Found by Adish: `/leads` failed with statement timeout 57014. Measured at 20,042 leads (about 16,700 people, no import records: bulk data loaded outside the app): exact count 4.7 s, one 25-row page 6.9 s, page plus count over the 8 s API limit.
- **Cause:** `leads_select` was `app.can_read_lead(id)`, a SECURITY DEFINER function of the row id. It cannot be inlined, so every row ran `is_admin()` and a lookup, and the sort had to evaluate every row first.
- **Fix:** `leads_select` is spelled out in SQL with everything row-independent wrapped in `(select ...)` (evaluated once per query). The read policies on `persons`, `lead_sources`, `lead_activities`, `assignments` try `(select app.is_admin())` first. New index `leads(created_at desc, id)`.
- **Rule for new policies:** never call a function of the row id for the common case. Put the row-independent part in `(select ...)` and keep per-row calls as the fallback.
- **Trap kept:** a caller inherits their manager's territory rows in `my_scope_projects()`, so the scope branches carry `my_role() is distinct from 'caller'`. Without it callers would see territory leads.
*`can_read_lead()` still exists and still governs write policies. Update and detail paths are unchanged.*
- **Follow-up (migration 0012):** after 0011 a manager's page still timed out (8 s) because `persons_select` ran `can_read_lead()` per lead and `leads.person_id` had no index. Now "you see a person, source row, activity or assignment if you can see its lead" is an `EXISTS` on `leads` (RLS applies inside it, so it is `leads_select` itself and cannot drift), plus `leads(person_id)` index.

**D-037 | 2026-09-25 | Performance open decisions #2 and #3 answered (Adish)**
- **Export cap stays at 20,000; an export over it must be narrowed** (by project, date, owner) and taken in parts. The refusal message already says so. It is a deliberate limit on how much customer data leaves in one audited export, not a bug. Streaming export (P2-9) is not needed for this reason. `EXPORT_MAX_ROWS` in `lib/leads/export.ts` is unchanged.
- **Row counts stay exact for every role** (`count: "exact"`). After 0011/0012 the exact count takes 37-73 ms for admin, manager and caller at 20,042 leads, so there is nothing to trade away. Revisit only if the count is measured slow again at a much larger size.
- Still open (Gautam / later): #1 JWT staleness vs instant deactivation, #4 page size. They gate Phase C only.
- **Statistics after a big load (found 2026-09-25):** `leads` had `last_autoanalyze` = 2026-09-25 07:55 UTC and `last_analyze` = never. The manager list timed out right after the 20,000-row bulk load and recovered once autoanalyze ran, which fits stale planner statistics (likely, not proven). **After any large import or bulk load, run `analyze public.leads;` in the SQL editor** instead of waiting for autovacuum. Ran it by hand on 2026-09-25.
- **Rules that came out of the 20k measurements (2026-09-25):** (1) Do not pass `nullsFirst` when ordering by a NOT NULL column: it stops Postgres using an index built with the default null order. (2) Embed `persons` as an inner join only when filtering on it (search); otherwise a plain join, or the exact count visits `persons` for every lead. (3) Run `analyze public.leads;` after a large load. Manager list at 20k leads went from timing out to 67 ms. Search still needs the trigram indexes in migration 0013.

**D-038 | 2026-09-25 | Deactivation is instant and enforced in the database (Adish); phones are a primary device; volume; production host**
- **Deactivation must lock the person out at once** (answer to open decision #1 in `10-performance.md`). Found while checking: it was NOT instant. Only the Next.js proxy noticed `is_active = false`; the database did not, and a signed-in user's token stays valid up to an hour, so anyone with the anon key and that token could keep reading their leads. Reproduced by a test (a deactivated caller still saw leads and people). **Migration 0014** adds a RESTRICTIVE `active_only` policy to every table (ANDed with all other policies, so a future policy cannot reopen a table) and makes `app.my_role()`, `app.is_admin()`, `app.is_super()` return nothing for an inactive user, which also covers the SECURITY DEFINER functions. The one exception is a user's own `users` row, so the proxy can still sign them out with the "deactivated" message. Checks 15 and 16 in `db:test`.
- **Consequence for performance work:** `is_active` can NOT ride in the JWT (a token would keep saying "active" until it refreshes). If we ever add JWT claims for `role` (P0-2), `is_active` still has to be checked live. **New rule: every new table gets an `active_only` restrictive policy, and `db:test` check 15 must still pass.**
- **Phones are a primary device** for callers and managers: every screen is designed and checked at 375 px first (`11-system-design-audit.md` section 9).
- **Volume:** about 14,000-15,000 new leads a year, below the 20,000 used for the load tests, so the 20k dataset stays a safe upper bound.
- **Production will not be a Supabase Pro project; it will run on AWS.** Supabase is the development host. The doc D-009 gate ("a separate production project before real leads") still stands, now as "a production database on AWS with automated backups and point-in-time recovery before any real lead is loaded". **What is Supabase-specific and must be rebuilt or reproduced on AWS:** (1) Supabase Auth (login, password reset email, create/ban/unban, the forced-change flag); (2) PostgREST, the HTTP layer `supabase-js` `.from()` and `.rpc()` talk to; (3) `auth.uid()` and the `authenticated`/`anon` roles that every RLS policy uses; (4) the `extensions` schema (migration 0013), `auth.users` in seed and tests, and `pg_cron`. **Not yet decided:** how (options and a recommendation are in `11-system-design-audit.md` section 11) and when. Until decided, build only in ways that keep the migration path open (see the portability rules there).

**D-039 | 2026-09-25 | Lead views are audited once per person per lead per day (Adish)**
- Answer to F-5 in `11-system-design-audit.md`. Logging every open of a lead would grow `audit_log` by about 450 MB a year (41 people, ~100 opens a day each), past the free tier and slower every audit query. **Rule:** the first time someone opens a lead on an IST day writes one `view_lead` row; further opens by the same person of the same lead the same day write none.
- Still answers "who saw this customer, and on which days". Does NOT affect any other action: edits, reassigns, exports, logins are still one row per event (D-013 stands: an export's row is still written before the file leaves).
- **Enforced in the database** by a `BEFORE INSERT` trigger (`app.audit_view_once_per_day`, migration 0015, SECURITY DEFINER because callers cannot read `audit_log`), so no code path can bypass it. The insert still succeeds for the caller; the duplicate row is simply dropped. `db:test` check 17.
- Not chosen: logging only non-owner views (loses an owner's own views), or every open (450 MB a year).

**D-040 | 2026-09-25 | AWS production can come after go-live; real leads wait for it (Adish)**
- The AWS production database does NOT have to be ready on 20 Oct. The team goes live on the tested Supabase development setup, **with mock data only**, and the move to AWS is done deliberately afterwards.
- **Hard rule that does not move:** no real lead, phone number or client data is loaded anywhere until the AWS production database exists with automated backups and point-in-time recovery (D-009, D-038). Until then the CRM is a rehearsal, not the system of record.
- **Consequence to say out loud:** on 20 Oct the business does not yet run on this system. The date the real work starts is the date AWS production is ready, so that date needs an owner and a plan (options A and B in `11-system-design-audit.md` section 11). Ask for it to be chosen by the end of Week 2.
- Meanwhile every change stays portable (rules in section 11), so the move changes the host, not the code.

**D-041 | 2026-09-25 | A FOR ALL policy also filters reads; no unwrapped per-row function on any growing table (migration 0016)**
- Search was over budget (1.5 s, budget 600 ms) even after the trigram indexes (0013) were applied. Isolated with probes: counting ALL people took 1.9 s (20,041 rows) versus 74 ms for leads. Cause: `persons_write` is `FOR ALL`, which also applies to SELECT, and it called `app.is_admin()` once per row. Not the search, and not the index.
- **Fix (0016, access unchanged):** `persons_write`, `audit_select`, `visits_select`, `visits_write`, `attendance_*`, `notif_*` rewritten with `(select ...)` for everything that does not depend on the row. `audit_log` matters most: about 1.5 million rows a year would have made the audit viewer unusable.
- **Honest note on 0013:** under row-level security the database will not use a GIN trigram index for `ilike` (the operator is not "leakproof", so it cannot be evaluated before the policy). Expect search to be a scan of persons filtered by the policy, which is fast once the policy is cheap (tens of ms at 20,000 people). 0013 is harmless and stays; do not count on it. If search is over budget again at a much larger size, the answer is a normalised search column with a btree prefix index, not more trigram indexes.
- **Rules:** (1) a `FOR ALL` policy filters reads; (2) any function call that does not depend on the row goes inside `(select ...)`; (3) check every new policy on a table that can exceed a few thousand rows by counting it unfiltered as admin and as a manager: it should cost about what counting `leads` costs.
