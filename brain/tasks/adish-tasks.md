# Adish — task backlog

**Portal:** Foundation and shared core, then the super_admin & admin console.

Phase 0 is in `brain/PHASE-0-RUNBOOK.md`. This file covers the shared core and Weeks 1–4.

---

## Phase 0 addition — the shared core

On top of the runbook, Phase 0 must deliver the pieces all three portals consume. **Three people are about to build three screens showing leads. If these do not exist first, you get three of everything.**

- `src/app/(app)/layout.tsx` — shell: sidebar, top bar, role-aware nav, notification bell
- `components/shared/DataTable.tsx` — server-side paging, sorting, filtering, row click
- `components/shared/StatusBadge.tsx` — every call status, temperature, stage, SLA flag
- `components/shared/LeadDetailShell.tsx` — the detail layout each portal fills differently
- `actions/leads.ts` — `getLeads`, `getLead`, `updateCallStatus`, `addRemark`
- `components/shared/{EmptyState,LoadingSkeleton,ErrorState,NoAccess}.tsx`
- `lib/permissions.ts` — `can.export(role)`, `can.manageUsers(role)`, `can.reassign(role)`…
- `lib/format.ts` — phone and date formatting

Announce in `brain/team/adish.md` the moment each lands. The other three are blocked on them.

`actions/leads.ts` deserves care: all three portals call the same functions and get different rows because RLS decides. **One query, three correct answers.** Three hand-written queries would be three chances to leak.

---

## Week 1 (26 Sep – 2 Oct) — users and hierarchy

### A1.1 — User list · `app/(app)/users/page.tsx` · super_admin only
Name, email, role, reports-to, territory count, active. Filter by role, search by name. Deactivated shown greyed, not hidden.

**Done when:** an admin opening `/users` gets a clear "not available for your role" page, not a crash.

### A1.2 — Create user · `actions/org.ts → createUser`
Creates the auth record **and** the `public.users` row in one action.

Parent rules the form enforces: required for every role except super_admin; a caller's parent is a manager or sub_manager; a sub_manager's parent is a manager; a manager's parent is an admin or super_admin.

**Watch out:** this needs the Supabase admin API and the service key, in a **server-only** env var, never `NEXT_PUBLIC_`. It is the one legitimate use in the codebase. Record it in `08-decisions.md`.

### A1.3 — Edit and deactivate
Deactivating asks where the open leads go and shows the count first.

### A1.4 — Hierarchy tree
Read-only tree from `user_hierarchy` with lead counts per node. This is what Gautam checks the org against.

**Week 1 done when:** Gautam creates all the real users himself, without SQL.

---

## Week 2 (3 – 9 Oct) — territories and the all-leads view

### A2.1 — Territory editor
Assign projects and locations to managers, grouped by city. Show an **overlap warning, not an error** — overlap is allowed by design (D-003), the warning makes it deliberate.

### A2.2 — Projects and locations
Create and edit. Never hardcode a project list anywhere.

### A2.3 — All-leads view
The admin's main working screen: every lead, every filter, built on the shared table. This is where an admin assigns leads down to managers.

### A2.4 — Exit transfer
Open leads move to the current **territory holder**, not a named replacement. Writes `assignments` rows with `reason='exit_transfer'`, returns the count.

### A2.5 — Audit logging
`logAudit(action, entityType, entityId, meta)`. Wire into login, lead detail open, lead edit, reassign, export, user create and deactivate.

**Do not** log list queries — on a 500 MB tier that table would outgrow the leads.

---

## Week 3 (10 – 16 Oct) — import, export, audit viewer

### A3.1 — CSV import
Upload, preview, column mapping remembered per source. Then, per `05-lead-flow.md`:

1. Normalise the phone to E.164 (+91 default). Invalid → error row.
2. Upsert `persons` by phone; fill blank name/email only, never overwrite.
3. Resolve the project by name. **Unknown project → error row, never auto-create.**
4. Upsert lead by `(person_id, project_id)` — existing pair adds a `lead_sources` row only, **no second lead, no owner change**.
5. Always write a `lead_sources` row.
6. Live source → `is_live = true`, then `app.assign_lead`.

Batch the inserts. Test with ~1,200 rows, then re-import the same file: expect 1,200 duplicates and zero new leads.

### A3.2 — CSV export · super_admin and admin only
Respects current filters. Every export writes an `audit_log` row with row count and filter. **This is the control that protects the database** (D-013).

### A3.3 — Audit viewer
Filter by actor, action, date. Exports listed first — that is the view that answers "did someone take the database".

### A3.4 — Password reset, plus a forced reset for any user.

---

## Week 4 (17 – 20 Oct)
Bug bash, Vercel deploy, create the real users, re-run `run-access-tests.mjs` against the finished app, walkthrough with Gautam.

---

## Standing duties
- Only you apply migrations. Post in `brain/team/adish.md` so the others run `npm run db:types`.
- Review **every** RLS change, whoever wrote it.
- Keep the keepalive action green.
