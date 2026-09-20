# Access control

The most dangerous file in the repo. Read it fully before touching any policy.

## Principle

Supabase serves Postgres over HTTP. Any holder of the anon key can query tables directly with `curl`, bypassing every line of React you write. **Filtering in the frontend is not security — it is decoration.** All access rules are enforced by row-level security in the database.

The `service_role` key bypasses RLS entirely. It must never appear in application code, in a Next.js server action, in a route handler, or in any env var prefixed `NEXT_PUBLIC_`. Its legitimate uses are local migration/test tooling and ONE server-only file, `src/lib/supabase/admin.ts` (D-023), which can only create, ban and unban login accounts, set a temporary password, and set or clear the forced-password-change flag (D-023, D-031). It is never used to read or write a table — those go through the session client so RLS applies. `import "server-only"` makes the build fail if a client component ever imports it.

## Visibility matrix

| Role | Which leads they can read |
|---|---|
| super_admin | all |
| admin | all |
| manager | leads in his territories **OR** leads owned by anyone below him **OR** his own |
| sub_manager | leads in his parent manager's territories **OR** leads owned by his callers **OR** his own |
| caller | only leads where `assigned_to = self` |

Two managers sharing a territory see each other's leads **in that shared territory only**. Outside it they are blind to one another. Two admins see everything, including each other.

## Action matrix

| Action | super_admin | admin | manager | sub_manager | caller |
|---|---|---|---|---|---|
| View lead (in scope) | yes | yes | yes | yes | own only |
| See full phone number | yes | yes | yes | yes | own only |
| Edit lead fields | yes | yes | in scope | in scope | own only |
| Set call_status / remark | yes | yes | yes | yes | own only |
| Move pipeline_stage | yes | yes | in scope | in scope | own only |
| Reassign lead | yes | yes | within own scope | within own scope | no |
| Delete lead | yes | no | no | no | no |
| **Export CSV** | yes | yes | no | no | no |
| Import CSV | yes | yes | no | no | no |
| Create users | yes | no | no | no | no |
| Edit territories | yes | no | no | no | no |
| View attendance | yes | yes | own team | own team | own only |
| View audit log | yes | yes | no | no | no |
| Set own availability | yes | yes | yes | yes | yes |

**Export is the real leak risk**, not viewing. Callers dial from personal phones so they must see the number to work. What stops the database walking out is that only two roles can export, and every export writes an `audit_log` row with row count and filter.

## Helper functions

All `SECURITY DEFINER`, schema-qualified, with `search_path` pinned. Defined in `0002_rls.sql`.

| Function | Returns |
|---|---|
| `app.my_role()` | the caller's `user_role` |
| `app.is_admin()` | true for super_admin and admin |
| `app.my_descendants()` | setof uuid — everyone at or below me in `user_hierarchy` |
| `app.my_scope_projects()` | setof uuid — project ids I cover, resolving sub_manager inheritance |
| `app.my_scope_locations()` | setof uuid — location ids I cover, same resolution |
| `app.can_read_lead(lead_id)` | boolean — the full OR rule |
| `app.can_write_lead(lead_id)` | boolean — narrower than read |

`my_scope_projects()` resolves inheritance: if my role is `sub_manager`, it returns my **parent's** scope rows, not my own (I have none).

## Policy shape

Every table: `ENABLE ROW LEVEL SECURITY`, then explicit policies per command. There is no default-allow anywhere.

```sql
create policy leads_select on public.leads
for select to authenticated
using ( app.can_read_lead(id) );

create policy leads_update on public.leads
for update to authenticated
using ( app.can_write_lead(id) )
with check ( app.can_write_lead(id) );
```

`with check` matters on update: without it a user could edit a row they can see into a state they cannot see — for example reassigning a lead out of their own territory and losing it.

## Recursion trap

`users` policies must not call a function that reads `users` through RLS — Postgres will error with infinite recursion. All helper functions are `SECURITY DEFINER` so they read the base tables with RLS bypassed, and are therefore safe to call from a `users` policy. Never write a `users` policy containing a subquery on `users`.

## How to test a policy

For every policy, prove both directions. A test that only shows the allowed case is not a test.

1. Sign in as a caller. Confirm `select * from leads` returns only their own rows.
2. Sign in as caller A, take a lead id belonging to caller B, request it by id directly. Must return zero rows, not an error.
3. Sign in as manager A with territory Worli. Confirm a Pune lead is invisible.
4. Sign in as manager A. Confirm a Worli lead assigned to manager B **is** visible.
5. Sign in as a manager and attempt an export. Must fail.
6. Sign in as a sub_manager. Confirm the parent's territory is visible.

These six are the acceptance tests for Phase 0. Nobody starts Phase 1 until all six pass.

`npm run db:test` runs them (plus eight more that also prove the negative case) against the shared project.
One caveat on test 5: **export is not a database operation** — a manager can already `select` every lead in their
scope through the API. What stops export is the `exportLeads` server action refusing non-admin roles and writing the
audit row. The script therefore tests the database half (a manager cannot insert leads) and the export half must be
re-checked by hand once `exportLeads` exists. This limit is accepted in D-013.

### Column guard on leads

`leads_update` lets a user update any column of a lead they can write. Callers must not change ownership, identity,
territory or SLA fields, so `0004_caller_column_guard.sql` adds a BEFORE UPDATE trigger that rejects those changes when
the actor is a caller. Managers' reassign limits ("within own scope", and the target must be able to read the lead)
are **not** enforced in the database yet — they live in the `reassign` server action (Arisha, B2.1). Adish reviews it.

## Audit

Log `view_lead` on detail-page open, not on list queries — logging every list row would swamp the table on the free tier's 500 MB limit. Log every `export`, `reassign`, `delete` and `login` without exception.

## Audit coverage (task A2.5)

`logAudit(supabase, actorId, action, entityType, entityId, meta?)` in `src/lib/audit.ts`. It never throws: an audit failure must not break the action, but it is logged. **Never log list queries** — that table would outgrow the leads on a 500 MB tier.

| Action | Written when | entity | meta |
|---|---|---|---|
| `login` | successful sign-in | user | — |
| `view_lead` | lead detail opened (only if the lead is readable) | lead | — |
| `edit_lead` | call outcome saved, remark added | lead | `change` |
| `reassign` | one lead assigned or reassigned; ONE row per bulk batch | lead | `to`, `reason`, and `bulk`, `requested`, `moved` for batches |
| `user_create` / `user_update` / `user_reactivate` / `user_deactivate` | user administration | user | role, parent, or transfer count |
| `scope_change` | a manager's territory saved | user (the manager) | project and location ids |
| `project_create` / `project_update` | project created or edited | project | name, location, active |
| `location_create` / `location_update` | location created or edited | location | name, city |
| `export` | leads exported to CSV. Written BEFORE any data is returned; if it cannot be written the export is refused | leads (no id) | `rowCount`, `filters` |
| `import` | a CSV import finished (or was stopped) | import | `filename`, `totalRows`, `inserted`, `duplicates`, `errors` |
| `password_force_reset` | super admin required a password change | user | `temporary` (never the password) |
| `password_change` | someone changed their own password | user | — |
| `delete` | **not built yet** — no delete action exists | — | — |

The viewer is `/audit` (A3.3): exports first, then the whole log filterable by actor, action and date.
