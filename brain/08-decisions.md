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
