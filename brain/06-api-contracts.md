# API contracts

No REST layer. Next.js **server actions** talk to Supabase using the user's own session, so RLS applies to every call. Reads that need no mutation go directly through the Supabase client in Server Components.

## Rules

1. Every action starts with `const supabase = await createServerClient()` — the session-bound client. Never a service-role client.
2. Every action validates input with a zod schema before touching the database.
3. Return shape is always `{ ok: true, data }` or `{ ok: false, error: string }`. Never throw raw Postgres errors at the UI — they leak column names.
4. RLS is the permission check. Application-level role checks are a second layer for better error messages, never the only layer.
5. Mutating actions call `revalidatePath()` for the affected route.

```ts
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };
```

## Auth — `src/actions/auth.ts` (Adish)

| Action | Signature |
|---|---|
| `signIn` | `(email, password) → ActionResult<{ userId }>` |
| `signOut` | `() → ActionResult<null>` |
| `requestPasswordReset` | `(email) → ActionResult<null>` — always succeeds, never reveals whether the email has an account |
| `setPassword` | `({ password, confirm }) → ActionResult<null>` — the signed-in user; clears a forced-change flag only after the password really changed |

`signIn` writes an `audit_log` row with `action='login'`.

## Org — `src/actions/org.ts` (Adish)

| Action | Signature | Who |
|---|---|---|
| `createUser` | `({ fullName, email, password, role, parentId }) → ActionResult<{ userId }>` | super_admin |
| `forcePasswordReset` | `({ userId, temporaryPassword? }) → ActionResult<{ temporary }>` — flags `app_metadata.must_reset_password`; not on yourself or a deactivated user | super_admin |
| `updateUser` | `({ userId, fullName, phone, parentId, isActive? }) → ActionResult<null>` — `isActive` accepts only `true` (reactivate); deactivating is `deactivateUser` | super_admin |
| `deactivateUser` | `({ userId, transferTo? }) → ActionResult<{ transferred: number }>` — open leads go automatically to the manager whose territory covers each one (D-026); `transferTo` is an optional override that sends them all to one person; refused while active people report to them | super_admin |
| `getDeactivationPreview` | `(userId) → ActionResult<{ openLeads, activeReports, receivers, planError }>` — shown before the confirm button, including where each lead would go | super_admin |
| `setScopes` | `({ userId, projectIds, locationIds }) → ActionResult<null>` | super_admin |
| `createProject` | `({ name, locationId, developer? }) → ActionResult<{ projectId }>` | super_admin |
| `updateProject` | `({ projectId, name, locationId, developer?, isActive }) → ActionResult<null>` — moving it moves its leads | super_admin |
| `createLocation` | `({ name, city }) → ActionResult<{ locationId }>` | super_admin |
| `updateLocation` | `({ locationId, name, city }) → ActionResult<null>` | super_admin |

`deactivateUser` moves open leads to the current territory holder and writes `assignments` rows with `reason='exit_transfer'`.

## Leads — `src/actions/leads.ts` (Adish, shared core — Arisha and Tanishka add to it through PRs)

| Action | Signature |
|---|---|
| `getLeads` | `({ page, pageSize, filters }) → ActionResult<{ rows, total }>` |
| `getLead` | `(leadId) → ActionResult<LeadDetail>` — also logs `view_lead` |
| `updateCallStatus` | `({ leadId, callStatus, temperature?, remark, nextCallAt? }) → ActionResult<null>` |
| `updatePipelineStage` | `({ leadId, stage, remark? }) → ActionResult<null>` |
| `addRemark` | `({ leadId, remark }) → ActionResult<null>` |
| `getPersonTimeline` | `(personId) → ActionResult<{ person, leads[] }>` |

`updateCallStatus` enforces, before writing:
- `connected` requires `temperature` and `remark`
- `attempted` requires `nextCallAt`
- `lost` requires `remark`, sets `renurture_at` to +6 months
- always inserts a `lead_activities` row, which trips the `first_touch_at` trigger

## Import / export — `src/actions/import.ts` and `export.ts` (Adish)

| Action | Signature | Who |
|---|---|---|
| `startImport` | `({ filename, totalRows, sourceCode }) → ActionResult<{ importId }>` | admin+ |
| `importBatch` | `({ importId, sourceCode, campaign?, rows[≤200] }) → ActionResult<{ inserted, duplicates, errors[] }>` — one atomic database call per batch | admin+ |
| `finishImport` | `(importId) → ActionResult<ImportSummary>` — logs the import and returns the durable totals | admin+ |
| `getImportErrors` | `(importId) → ActionResult<ImportErrorRow[]>` — every rejected row with its original values | admin+ |
| `exportLeads` | `({ filters }) → ActionResult<{ csv, rowCount, filename }>` | admin+ |

`ImportSummary = { importId, filename, totalRows, inserted, duplicates, errors, createdAt, uploadedBy }`. **The single `importLeads` call in the original contract became three (`startImport`, `importBatch` repeated, `finishImport`)** because a real file cannot go through one request: size limit and the API statement timeout (D-030).
`exportLeads` writes `audit_log` with `action='export'` and the row count and filter in `meta` **before** returning the CSV; if that write fails, nothing is returned (D-032).

## Assignment — `src/actions/assignment.ts` (Arisha; `autoAssign` just wraps `app.assign_lead`, Adish)

| Action | Signature |
|---|---|
| `autoAssign` | `(leadId) → ActionResult<{ assignedTo }>` — calls `app.assign_lead` |
| `reassign` | `({ leadId, toUserId, reason }) → ActionResult<null>` |
| `bulkAssign` | `({ leadIds, toUserId, reason? }) → ActionResult<{ moved, skipped }>` — `skipped` = already theirs or gone. Admin version built (A2.3); the manager version adds the scope rule |
| `setAvailability` | `({ status, delegateTo? }) → ActionResult<null>` |

`reassign` refuses if the target user cannot read the lead afterwards — otherwise leads vanish into a territory nobody covers.

## Notifications — `src/actions/notifications.ts` (Adish for the bell; Tanishka adds caller-side triggers)

| Action | Signature |
|---|---|
| `getUnread` | `() → ActionResult<Notification[]>` |
| `markRead` | `(ids) → ActionResult<null>` |

## Ops — `src/actions/ops.ts` (Sayli)

| Action | Signature |
|---|---|
| `checkIn` | `({ lat, lng }) → ActionResult<null>` |
| `checkOut` | `({ lat, lng }) → ActionResult<null>` |
| `createSiteVisit` | `({ leadId, scheduledAt, accompaniedBy }) → ActionResult<{ visitId }>` |
| `checkInToVisit` | `({ visitId, lat, lng }) → ActionResult<{ withinGeofence }>` |
| `completeSiteVisit` | `({ visitId, status, outcome, remark }) → ActionResult<null>` |

`createSiteVisit` moves the lead to `site_visit_scheduled`; `completeSiteVisit` with `status='done'` moves it to `site_visit_done`.

## Dashboard — `src/actions/dashboard.ts` (Adish; moved from Sayli, D-034)

| Action | Signature |
|---|---|
| `getDashboard` | `({ range }) → ActionResult<DashboardData>` — `range: 'today' \| 'all'` |

`DashboardData = { range, totalLeads, untouchedLeads, untouchedUnassigned, slaBreaches, siteVisitsThisWeek, managerPortfolios, engine }`, with `managerPortfolios: [{ managerId, name, leadCount, untouched, byStage, callers, visitsBooked }]` and `engine: { unassigned, waitingFor1030, needsManualAssignment, escalationsToday }`. The original contract had no `untouched`, `callers`, `visitsBooked` or `engine`; D1.2 and D2.4 required them.

Counts come from SQL (`public.dashboard_counts` and `public.dashboard_portfolios`, migration 0010), not from pulling leads into Node. RLS decides the scope, so the same call gives an admin the company and a manager their territory and team. `range` changes only `totalLeads` and the portfolios (D-035). Portfolio rows link to `/leads?owner=team:<managerId>`.
