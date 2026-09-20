# Shared core

The pieces all three portals consume. Built once, by Adish, in Phase 0. **If something here falls short, extend it so it still works for the other two. Never copy it into your own folder.**

Status: **complete as of 2026-09-19.** Verified against the real database with real users (`npm run db:test` → 14 checks, `npm run test:leads` → 45 checks).

## What exists

| Piece | Path | Use it like this |
|---|---|---|
| Server Supabase client | `src/lib/supabase/server.ts` | `const supabase = await createServerClient()` — session-bound, RLS applies |
| Browser Supabase client | `src/lib/supabase/client.ts` | Client components only. Anon key |
| Session proxy | `src/proxy.ts` | Redirects signed-out users, signs out deactivated ones. Don't touch |
| Current user | `src/lib/auth.ts` | `requireUser()` in a page → `{ id, fullName, email, role, parentId }` |
| Action result | `src/types/action.ts` | `ActionResult<T>`, `ok()`, `fail()`, `UserRole` |
| Role helpers | `src/lib/permissions.ts` | `can.export(role)` … what to **show**, never what is allowed |
| Formatting | `src/lib/format.ts` | `formatPhone`, `normalisePhone`, `telHref`, `formatDateTime`, `formatWhen`, `formatRupees` |
| **Lead actions** | `src/actions/leads.ts` | `getLeads`, `getLead`, `updateCallStatus`, `addRemark` — below |
| Lead schemas | `src/lib/schemas/lead.ts` | `callOutcomeSchema`, `addRemarkSchema`, `leadFiltersSchema`. Import into your forms |
| Audit | `src/lib/audit.ts` | `logAudit(supabase, actorId, action, entityType, entityId, meta?)` |
| **DataTable** | `src/components/shared/DataTable.tsx` | Server-driven table, sort + paging as links, skeleton, empty state |
| **Lead columns** | `src/components/shared/lead-columns.tsx` | `leadColumns.buyer / project / callStatus / temperature / stage / owner / lastActivity / nextCall / sla / created` |
| **Lead filters** | `src/components/shared/LeadFilters.tsx` | Search + status/temp/stage/project/owner + untouched/SLA. Edits the URL only |
| **LeadDetailShell** | `src/components/shared/LeadDetailShell.tsx` | Layout with four slots |
| Detail pieces | `LeadSummary`, `ActivityTimeline`, `LeadSources` in `components/shared/` | Default header, history, sources |
| URL params | `src/lib/leads/params.ts` | `parseLeadSearchParams(sp)`, `withParams(sp, patch)` |
| Status badge | `components/shared/StatusBadge.tsx` | The ONE badge for every status |
| Four states | `components/shared/states.tsx` | `EmptyState`, `ErrorState`, `NoAccess`, `LoadingSkeleton` |
| App shell + nav | `src/app/(app)/layout.tsx`, `src/lib/nav.ts` | Add your screen's link to `nav.ts` in the same PR that creates the route |
| **Reference screens** | `src/app/(app)/leads/page.tsx`, `leads/[id]/page.tsx`, `leads/loading.tsx` | Admin's all-leads list and detail. Copy the *shape* |

Two stub pages remain so the shell has somewhere to land: `dashboard/page.tsx` (Adish replaces it, D1.1) and `my-day/page.tsx` (Tanishka replaces it).

## The lead actions

```ts
getLeads({ page?, pageSize?, sort?, filters? })  → ActionResult<{ rows: LeadRow[]; total: number }>
getLead(leadId)                                  → ActionResult<LeadDetail>   // also writes the view_lead audit row
updateCallStatus({ leadId, callStatus, temperature?, remark, nextCallAt?, renurtureAt? }) → ActionResult<null>
addRemark({ leadId, remark })                    → ActionResult<null>
```

- **No role branching inside.** Every portal calls the same function and RLS returns each their own rows. `filters.assignedTo` (`"me"` / `"team"` / a user id) is a filter the user *chose*, not a permission.
- `filters`: `search` (buyer name or any part of the phone) · `callStatus[]` · `temperature[]` · `stage[]` · `projectId[]` · `assignedTo` (`me` / `team` / `none` / a user id) · `sourceCode[]` · `createdFrom/To` (`YYYY-MM-DD`, IST) · `slaBreached` · `untouched`.
- `sort`: `created_at | last_activity_at | next_call_at | sla_due_at | assigned_at`, as `column:asc` or `column:desc`. Default `created_at:desc`.
- `pageSize` defaults to 25, max 100.
- `LeadRow` and `LeadDetail` are in `src/types/leads.ts`.
- `updateCallStatus` enforces the mandatory-field rules from `05-lead-flow.md` through `callOutcomeSchema`. **Import that same schema in your form.** `callStatus` is `attempted | connected | lost` only — `new` is a default, never a choice. `renurtureAt` is optional and defaults to +6 months on `lost`.
- What it moves in the pipeline: `connected` + hot/warm → `qualified` (only from `enquiry`, so a lead further along is never pulled back); `lost` → `dropped`. Both write a `stage_change` activity. **It never sets `first_touch_at`** — the database trigger does, when the activity row lands.
- Errors are plain sentences. When RLS hides a lead the error is exactly `NO_ACCESS` (`src/types/leads.ts`) — render `<NoAccess />` for it.
- The outcome is two writes (the lead, then the activity row), not one transaction. If the second fails the message tells the caller to submit again. Say so if it becomes a problem and we will move it into a database function.

## How to build a portal screen (the recipe)

```tsx
// src/app/(app)/team/leads/page.tsx
export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const { page, sort, filters } = parseLeadSearchParams(sp);
  const result = await getLeads({ page, pageSize: 25, sort, filters });
  if (!result.ok) return <ErrorState message={result.error} />;
  return (
    <DataTable
      columns={[leadColumns.buyer, leadColumns.callStatus, leadColumns.owner /* … */]}
      rows={result.data.rows} total={result.data.total} page={page} sort={sort}
      searchParams={sp}
      rowHref={(r) => `/team/leads/${r.id}`}
      toolbar={<LeadFilters projects={projects} showOwnerScope />}
    />
  );
}
```

Detail: `getLead(id)` → `<LeadDetailShell header={<LeadSummary/>} actions={…yours…} timeline={<ActivityTimeline/>} aside={<LeadSources/>} />`. Put your own controls in `actions`.

## Rules for extending

1. Need a new column, filter, sort key or prop? Add it to the shared piece **with a default** so the other portals are unaffected. A new column goes in `lead-columns.tsx`; a new filter goes in `leadFiltersSchema` + `queryLeads` + `LeadFilters` + `params.ts`.
2. If a cell contains its own link or button, give it `relative z-10` so it sits above the row-stretching link.
3. Open a PR with Adish as reviewer. Say which other portals it touches.
4. Add a line to `team/<you>.md`.
5. The data layer is `src/lib/leads/queries.ts` — pure functions with no `next/*` imports, which is why `npm run test:leads` can test them directly. Keep it that way, and add a check to `supabase/tests/run-lead-tests.ts` for anything you add.

## Known gaps, handed to the owners

- **Row selection** — built in Week 2 (see below). Arisha's B2.2 uses it; she only needs to write her own bulk bar.
- **Pipeline colours** — only `booked` and `dropped` have a fixed colour in `07-ui-conventions.md`; every other stage renders slate until the team agrees more.
- **SLA countdown** — the list shows the breach flag and a "Due …" time only. The amber-under-15-minutes countdown is Arisha's B2.4 and Tanishka's C1.3, and must use `app.add_working_minutes`.
- **Owner name** — `LeadRow.ownerName` is `null` when the owner is outside what the viewer may see (e.g. another manager's lead). Columns show "Another team". This is RLS working, not a bug.
- **Seed** — the two "Multi Project Buyer" leads have no source rows, so `LeadSources` must handle an empty list (it does).

## Added in Week 2 (2026-09-20)

| Piece | Path | What |
|---|---|---|
| Row selection | `components/shared/selection.tsx` | `<SelectionProvider>` + `useSelection()`. Pass `selectable` and `rowLabel` to `<DataTable>`. Selection clears when the URL (filters, page, sort) changes, so a bulk action can never touch rows you can no longer see. **Arisha: build B2.2 bulk reassign on this, do not copy the table.** |
| More filters | `LeadFilters` props `owners`, `sources`, `showUnassigned`, `showDates` | All optional, off by default. New filter values: `owner=none` (unassigned) in the URL and `assignedTo: "none"` in `getLeads` |
| Assignment core | `lib/leads/assign.ts`, `actions/assignment.ts` | `bulkAssign` / `reassign` (admin). One database function, `public.move_leads()`, so it is atomic, writes history, notifies, and restarts the live-lead SLA. **The manager version (B2.1) belongs in the same files** — see D-027 for what the visibility guard does and does not mean |
| Typed RPC helper | `lib/supabase/rpc.ts` | `callRpc<T>(supabase, "fn", args)`. Works before and after `npm run db:types` knows the function |
| Admin bulk bar | `components/admin/AssignLeadsBar.tsx`, `AssignLeadPanel.tsx` | Reference for a bulk-action bar built on `useSelection()` |

## Added in Week 3 (2026-09-20)

| Piece | Path | What |
|---|---|---|
| The one definition of "the current filters" | `filteredLeads()` in `lib/leads/queries.ts` | Used by the list and the export. Returns `{ query }`, not the builder: an async function returning a Supabase builder would AWAIT it and run the query |
| CSV writer | `lib/csv.ts` | `toCsv(rows)`, `safeCell()` (neutralises spreadsheet formulas), `CSV_BOM`. Use it for ANY CSV that leaves the system |
| CSV download | `components/import/error-report.ts` | `downloadCsv(filename, text)` |
| Strict audit | `logAuditStrict()` in `lib/audit.ts` | Returns whether the row was written. Use it where the audit row IS the control |
| Audit labels | `lib/audit-log/labels.ts` | `actionLabel(action)` |
| Table item label | `<DataTable itemLabel="entries">` | The "0 leads" count line; audit uses it |

## Added with the dashboards (2026-09-20)

| Piece | Path | What |
|---|---|---|
| Dashboard data | `lib/dashboard/queries.ts`, `actions/dashboard.ts` | `getDashboard({ range })`. Counted in SQL as the signed-in user, so RLS decides scope. Not for callers |
| A manager's whole book | `getLeads({ filters: { assignedTo: "team:<userId>" } })`, URL `?owner=team:<id>` | That person and everyone below them. How the dashboard's portfolios are counted; Arisha's team roster (B1.3) can link to it |
| Stat card, toggle | `components/dashboard/` | `StatCard`, `RangeToggle`, `PortfolioTable`, `EnginePanel`. Server components |
