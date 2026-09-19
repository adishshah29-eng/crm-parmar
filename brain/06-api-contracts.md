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
| `requestPasswordReset` | `(email) → ActionResult<null>` |

`signIn` writes an `audit_log` row with `action='login'`.

## Org — `src/actions/org.ts` (Adish)

| Action | Signature | Who |
|---|---|---|
| `createUser` | `({ fullName, email, password, role, parentId }) → ActionResult<{ userId }>` | super_admin |
| `updateUser` | `({ userId, fullName, phone, parentId, isActive }) → ActionResult<null>` | super_admin |
| `deactivateUser` | `({ userId, transferTo? }) → ActionResult<{ transferred: number }>` | super_admin |
| `setScopes` | `({ userId, projectIds, locationIds }) → ActionResult<null>` | super_admin |
| `createProject` | `({ name, locationId, developer }) → ActionResult<{ projectId }>` | super_admin |

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
| `importLeads` | `({ file, mapping, sourceCode, campaign? }) → ActionResult<ImportSummary>` | admin+ |
| `exportLeads` | `({ filters }) → ActionResult<{ csv, rowCount }>` | admin+ |

`ImportSummary = { totalRows, inserted, duplicates, errors, errorReport }`.
`exportLeads` writes `audit_log` with `action='export'` and the row count and filter in `meta`.

## Assignment — `src/actions/assignment.ts` (Arisha; `autoAssign` just wraps `app.assign_lead`, Adish)

| Action | Signature |
|---|---|
| `autoAssign` | `(leadId) → ActionResult<{ assignedTo }>` — calls `app.assign_lead` |
| `reassign` | `({ leadId, toUserId, reason }) → ActionResult<null>` |
| `bulkAssign` | `({ leadIds, toUserId }) → ActionResult<{ count }>` |
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
| `getDashboard` | `({ range }) → ActionResult<DashboardData>` — `range: 'today' \| 'all'` |

`createSiteVisit` moves the lead to `site_visit_scheduled`; `completeSiteVisit` with `status='done'` moves it to `site_visit_done`.

`DashboardData = { totalLeads, untouchedLeads, slaBreaches, siteVisitsThisWeek, managerPortfolios: [{ managerId, name, leadCount, byStage }] }`
