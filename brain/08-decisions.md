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
