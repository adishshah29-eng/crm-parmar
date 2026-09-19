# Shared core

The pieces all three portals consume. Built once, by Adish, in Phase 0. **If something here falls short, extend it so it still works for the other two. Never copy it into your own folder.**

Status is kept current here. Adish also announces each landing in `team/adish.md`.

## What exists now (2026-09-19)

| Piece | Path | Use it like this |
|---|---|---|
| Server Supabase client | `src/lib/supabase/server.ts` | `const supabase = await createServerClient()` — session-bound, RLS applies |
| Browser Supabase client | `src/lib/supabase/client.ts` | Client components only. Anon key |
| Session proxy | `src/proxy.ts` | Already redirects signed-out users and signs out deactivated ones. Don't touch |
| Current user | `src/lib/auth.ts` | `requireUser()` in a page/layout → `{ id, fullName, email, role, parentId }`. `getCurrentUser()` if null is acceptable |
| Action result | `src/types/action.ts` | `ActionResult<T>`, `ok(data)`, `fail("message")`, `UserRole` |
| Role helpers | `src/lib/permissions.ts` | `can.export(role)`, `can.reassign(role)`… What to **show**, never what is allowed |
| Formatting | `src/lib/format.ts` | `formatPhone`, `normalisePhone`, `telHref`, `formatDateTime`, `formatWhen`, `formatRupees` |
| Status badge | `src/components/shared/StatusBadge.tsx` | `<StatusBadge kind="call_status" value="connected" />`, also `temperature`, `pipeline_stage`, `sla_breached` |
| Four states | `src/components/shared/states.tsx` | `EmptyState`, `ErrorState`, `NoAccess`, `LoadingSkeleton` |
| App shell | `src/app/(app)/layout.tsx` | Sidebar, top bar, bell placeholder. Everything under `(app)/` renders inside it |
| Nav | `src/lib/nav.ts` | Add your screen's link here **in the same PR that creates the route** |
| Login | `src/app/(auth)/login/` | Email + password, writes the `login` audit row |
| shadcn primitives | `src/components/ui/` | button, input, label, select, table, dialog, dropdown-menu, badge, card, tabs, sonner (toasts), textarea, checkbox, popover, calendar, skeleton, alert. Unmodified — add more with `npx shadcn@latest add <name>` |

Two stub pages exist so the shell has somewhere to land: `dashboard/page.tsx` (Sayli replaces it) and `my-day/page.tsx` (Tanishka replaces it).

## Still to build — with the contract, so you can code against it now

### `actions/leads.ts` — Adish

```ts
type LeadFilters = {
  search?: string;            // partial match on person name OR phone digits
  callStatus?: CallStatus[];
  temperature?: Temperature[];
  stage?: PipelineStage[];
  projectId?: string[];
  assignedTo?: "me" | "team" | string; // "me" = my own, "team" = my descendants, uuid = one person
  sourceCode?: string[];
  createdFrom?: string; createdTo?: string; // ISO
  slaBreached?: boolean;
  untouched?: boolean;        // first_touch_at is null
};

getLeads({ page, pageSize = 25, sort?, filters }) → ActionResult<{ rows: LeadRow[]; total: number }>
getLead(leadId) → ActionResult<LeadDetail>   // also writes the view_lead audit row
updateCallStatus({ leadId, callStatus, temperature?, remark, nextCallAt? }) → ActionResult<null>
addRemark({ leadId, remark }) → ActionResult<null>
```

`LeadRow` carries what every list needs: `id, personName, phone, projectName, callStatus, temperature, pipelineStage, ownerName, lastActivityAt, nextCallAt, slaDueAt, slaBreachedAt, isLive`.

**No role branching inside.** All portals call the same function and RLS returns each their own rows. `assignedTo` is a *filter the user chose*, not a permission.

### `components/shared/DataTable.tsx` — Adish

Server-driven: the page reads `searchParams` (`page`, `sort`, and filter keys), calls `getLeads`, and passes rows in.

```tsx
<DataTable
  columns={ColumnDef<LeadRow>[]}   // pick from leadColumns.* or supply your own
  rows={rows} total={total} page={page} pageSize={25}
  rowHref={(r) => `/leads/${r.id}`} // row click navigates; never a modal
  selectable                        // optional, for bulk reassign (Arisha)
  toolbar={<LeadFilters />}
/>
```

Sticky header, skeleton while loading, `EmptyState` when `total === 0`, works at 375px.

### `components/shared/LeadDetailShell.tsx` — Adish

Layout only. Each portal fills the slots differently.

```tsx
<LeadDetailShell lead={lead}
  header={...}      // buyer, phone, project, badges
  actions={...}     // caller: outcome form · manager: reassign · admin: everything
  timeline={...}    // activity list
  aside={...}       // sources, site visits, buyer history
/>
```

## Rules for extending

1. Need a new column, filter or prop? Add it to the shared piece, with a default so the other two are unaffected.
2. Open a PR with Adish as reviewer. Say in the description which other portals it touches.
3. Add a line to `team/<you>.md` so the other three know.

## Timeline

| By | Lands |
|---|---|
| Sat 20 Sep | Everything in "What exists now" — done |
| Mon 22 Sep | Supabase project up, migrations 0001–0004 applied, seed loaded, `npm run db:types` |
| Wed 24 Sep | `actions/leads.ts`, `DataTable`, `LeadDetailShell` |
| Thu 25 Sep | Access tests green, gate call |
