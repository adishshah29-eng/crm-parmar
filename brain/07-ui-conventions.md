# UI conventions

Four people building screens in parallel will produce four design languages unless this file is agreed in week 1. Agree it by **Mon 29 Sep**.

## Folder structure

Code is organised by **feature**, never by developer name.

```
src/
  app/
    (auth)/login/
    (app)/
      dashboard/
      leads/          [id]/     ← admin all-leads (Adish)
      my-day/         [id]/     ← caller (Tanishka)
      team/                     ← manager portal (Arisha): leads, escalations
      import/
      people/         [id]/
      users/
      territories/
      attendance/
      visits/
      audit/
      layout.tsx      ← shell: sidebar, topbar, notification bell
  components/
    ui/               ← shadcn primitives, unmodified
    shared/           ← used by 2+ features: DataTable, StatusBadge, EmptyState
    admin/  manager/  caller/  ops/   ← one folder per portal; shared things go in shared/
  actions/            ← server actions, one file per area
  lib/
    supabase/server.ts  client.ts
    permissions.ts    ← role helpers for UI affordances only, never for security
    format.ts         ← phone, currency, dates
  types/database.ts   ← generated, never hand-edited
```

Anything used by two features moves to `components/shared/` in the same PR that creates the second use.

## Naming

- Components `PascalCase.tsx`, everything else `kebab-case.ts`
- Server actions are verbs: `updateCallStatus`, not `callStatusUpdate`
- Booleans read as questions: `isActive`, `canExport`, `hasBreached`

## Roles in the UI

`lib/permissions.ts` decides what to *show*. It never decides what is *allowed* — RLS does that.

```ts
if (can.export(user.role)) return <ExportButton />;
```

Hide what a role cannot do rather than showing a disabled control, except where the absence would be confusing.

## Status colours — fixed, do not improvise

| Value | Colour |
|---|---|
| new | slate |
| attempted | amber |
| connected | blue |
| lost | slate, muted |
| hot | red |
| warm | amber |
| cold | slate |
| booked | green |
| dropped | slate, muted |
| SLA breached | red, with an alert icon |

One `<StatusBadge>` component renders all of these. Nobody writes their own badge.

## Tables

One `<DataTable>` in `components/shared/`. Server-side pagination always — never fetch all leads and filter in the browser. Default page size 25. Sticky header. Row click opens the detail page; it is not a modal.

## Forms

`react-hook-form` + `zod`, with the **same zod schema imported by the server action**. One definition, validated twice.

Mandatory fields from `05-lead-flow.md` — `temperature` on connected, `next_call_at` on attempted — are enforced in the schema, so the rule lives in one place.

## Dates and phones

- Display: `19 Sep 2026, 3:45 pm` · relative under 24h (`2 hours ago`)
- Store UTC, display `Asia/Kolkata`, always
- Phones stored E.164 (`+919876543210`), displayed `+91 98765 43210`
- One `formatPhone` / `formatDateTime` in `lib/format.ts`

## States every screen needs

Loading (skeleton, not a spinner), empty (say what to do next, not "No data"), error (what failed and what to try), and the permission case — if RLS returns nothing, say "You don't have access to this lead", never a blank page.

## Mobile

Web first, but callers will open this on a phone. Lead list and lead detail must work at 375px from day one. The rest can be desktop-first and get responsive later.

## What not to do

- No `useEffect` for data fetching — Server Components or server actions
- No client-side role filtering of lead lists
- No new colour outside the palette above
- No one-off table or badge implementations


## Phone rules (added 2026-09-25, D-038: phones are a primary device)

- **Touch targets:** the shared `Button`, `Input`, `Select`, dropdown items and tabs grow on touch screens by themselves (`pointer-coarse:` variants in `components/ui/*`). Use them; do not hard-code `h-8` on your own control. A native `<select>` or date input must carry `h-8 pointer-coarse:h-11 pointer-coarse:text-base` (16 px text stops iOS zooming the page when the field is focused).
- **Cards** are `rounded-2xl bg-card p-5 shadow-sm`, not `rounded-lg border`. Coloured status boxes (amber warning, red error) keep their coloured border.
- **Every route that fetches** has a `loading.tsx` (use `ListPageSkeleton` or `DetailPageSkeleton` from `components/shared/PageSkeletons.tsx`). Errors are handled by `app/(app)/error.tsx`, so a thrown error keeps the sidebar and offers "Try again"; do not catch errors just to show a blank state.
- **Error boundaries in Next 16.3 receive `retry`, not `reset`.**
- **Check every screen at 375 px and 768 px** (checklist: `11-system-design-audit.md` section 9).
