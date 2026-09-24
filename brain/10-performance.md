# Performance and scale

The CRM is being built against 42 seed leads. It will run against **10,000–20,000 leads** and
8–50 users. This file is the design for getting there, and the order to do it in.

Read `04-access-control.md` first. Half of this document is about row-level security, and every
change proposed here is subject to that file's rule: **a policy change is not done until the
fourteen access tests pass in both directions.** Speed is never bought with visibility.

## Targets

Measured server-side, p95, on a database holding 20,000 leads.

| Screen | Budget |
|---|---|
| `/leads` list (25 rows, filtered) | 500 ms |
| lead detail | 400 ms |
| search by name or phone | 600 ms |
| `/dashboard` | 800 ms |
| CSV export, 20,000 rows | 30 s, streamed |

## Step zero: you cannot tune 42 rows

Everything below is read off the code and the query plans it implies. **None of it is measured**,
because there is nothing yet to measure. Before any fix lands:

1. **Seed 20,000 leads** (`supabase/tools/seed-bulk.ts` — built, not yet run against the shared
   project). Mock data only, phones starting `+9199` so it is identifiable and reversible
   (`--clean` removes exactly those rows). Spread across projects, owners, dates, touched/untouched
   and SLA state, so the plans below are exercised rather than flattered. Needs the service_role
   key, same rule as `create-test-users.mjs`: a local tool, never deployed, never committed.
   `SUPABASE_SERVICE_ROLE_KEY=<key> npm run db:seed-bulk`. **Whoever runs this against the shared
   project should say so in their team file first** — it adds 20,000 rows four people's dev
   sessions will now see.
2. **Measure as a real user, not as `postgres`.** The `postgres` role bypasses RLS entirely and
   every query will look fast. Use `set local role authenticated` with the JWT claims set, then
   `explain (analyze, buffers)`.
3. **Measure `next build && next start`, never `next dev`.** Dev-mode recompilation is not app
   speed, and judging the app by it will send you chasing the wrong things.
4. Supabase dashboard → **Query Performance** shows the real top-N by total time. Start there
   each round rather than guessing which screen is slow.

Re-measure after every phase. A fix that does not move a number is not a fix.

---

## What is slow, ranked

Ranked by impact divided by cost. The first three have nothing to do with 20,000 rows — they are
why the app feels slow **today**, at 42.

### P0-1 · The app and the database are on opposite sides of the planet — done

There is no `vercel.json`, so Vercel puts the functions in its default region (`iad1`, Washington).
Supabase is in Mumbai, on purpose and unchangeably (`PHASE-0-RUNBOOK.md` step 5). Every database
round trip therefore crosses the Atlantic and the subcontinent: roughly **230 ms each way**.

A single `/leads` render makes at least six serialised round trips (see P0-2). That is over a
second of pure network before a byte of HTML exists, and no amount of SQL tuning touches it.

```json
// vercel.json
{ "regions": ["bom1"] }
```

One file. Almost certainly the single biggest production win available, and it is invisible in
local development — which is why nobody has noticed it yet.

**Done, 2026-09-24.** `vercel.json` added at the repo root. Takes effect on the next Vercel deploy;
nothing to measure locally, since region only matters once functions run on Vercel's infrastructure.

### P0-2 · Six serialised round trips before the first byte

Per request, today:

| # | Where | Call |
|---|---|---|
| 1 | `proxy.ts` | `auth.getUser()` — a remote HTTP call to the auth server, not a cookie read |
| 2 | `proxy.ts` | `select is_active from users` |
| 3 | page | `auth.getUser()` **again** |
| 4 | page | `select … from users` **again** |
| 5 | page | `getLeads()` |
| 6 | page | `projects`, `sources`, `queryActiveUsers` (parallel, so one trip's worth) |

`getCurrentUser()` is wrapped in React `cache()`, which correctly dedupes 3 and 4 *within* the page
render — but the proxy runs in a different invocation, so 1 and 2 are paid again regardless. Rows
1–4 are the same two facts fetched twice.

The real fix is to stop asking the database who the user is on every request: a Supabase
**custom access token hook** that stamps `role` and `is_active` into the JWT. The proxy then needs
zero queries, `getCurrentUser()` needs zero, and — see P1-4 — RLS itself can read the role from the
token instead of hitting `public.users` on every row.

**This needs a human decision before it is built.** A JWT is valid until it refreshes (one hour by
default), so a deactivated user could keep working for up to an hour. Today that is instant. That
is a business call about risk, not an engineering one: see *Open decisions* below.

Cheap interim step, no decision required: narrow the proxy matcher so it does not run its
`is_active` query on paths that cannot leak anything.

### P0-3 · Every write throws away the entire cache — done

`src/actions/leads.ts` and `src/actions/assignment.ts` both had:

```ts
const refresh = () => revalidatePath("/", "layout");
```

That purges the router cache for the **whole application** on every saved call outcome, remark,
reassignment and bulk assign. A caller logging forty outcomes a day re-fetches every screen forty
times. The app behaves as though caching does not exist, which is exactly how "it feels slow" is
described.

**Done, 2026-09-24.** Both narrowed to `revalidatePath("/leads", "layout")` (covers `/leads/[id]`),
`revalidatePath("/dashboard")`, `revalidatePath("/my-day", "layout")`. `org.ts`'s two refresh
functions were already scoped correctly (`/users`, `/territories`, `/leads` — not `/`) and did not
need this; `"/", "layout"` was the only actual instance of the bug.

One coordination note for whoever builds the next lead-visible route: `refresh()` in both files is
explicitly shared by every portal, so extend the list there — don't add a third copy. `/team/leads`
(Arisha, B1.1) doesn't exist yet, so it isn't in the list yet; add it in the same PR that creates
the route.

### P1-4 · The RLS policy re-reads the row it was handed, 20,000 times

This is the one that turns 20,000 rows into a stalled page. The policy is:

```sql
create policy leads_select on public.leads for select to authenticated
using ( app.can_read_lead(id) );
```

`can_read_lead` is `SECURITY DEFINER`, and **Postgres never inlines a SECURITY DEFINER function**.
So it is a genuine function call per candidate row, and each call:

1. calls `app.is_admin()` — another SECURITY DEFINER call, another lookup on `users`;
2. calls `app.my_role()` — a third;
3. runs `exists (select 1 from leads l where l.id = p_lead …)` — **looks the row up by primary key
   again, the row Postgres already has in its hand**;
4. inside that, evaluates `my_descendants()`, `my_scope_projects()` and `my_scope_locations()`,
   each re-scanning `user_hierarchy`, `users` and `user_scopes`.

Roughly six sub-plans per row. And because `queryLeads` asks for `count: "exact"`, the policy is
evaluated across the **entire filtered set**, not merely the 25 rows displayed — `limit` cannot
short-circuit a count. At 20,000 leads that is on the order of 120,000 index lookups to render one
page of a table.

There is a second, quieter cost: a policy expressed as an opaque function call **cannot drive an
index scan**. The planner has no idea the qual relates to `assigned_to`, so the indexes on
`leads(assigned_to)`, `(project_id)` and `(location_id)` sit unused on exactly the queries that
need them most.

The fix is to state the rule as a predicate over the row's own columns, and to wrap each
scalar/set helper in `(select …)` so Postgres evaluates it **once per statement as an InitPlan**
instead of once per row:

```sql
create policy leads_select on public.leads for select to authenticated
using (
  (select app.is_admin())
  or assigned_to = (select auth.uid())
  or (
    (select app.my_role()) <> 'caller'
    and (
         assigned_to  in (select app.my_descendants())
      or project_id   in (select app.my_scope_projects())
      or location_id  in (select app.my_scope_locations())
    )
  )
);
```

> **Read this before you write that migration.** The `my_role() <> 'caller'` guard is not
> decoration and it is not an optimisation — it is the whole security of the caller role.
> `app.my_scope_projects()` resolves *upward*: for a caller it returns **their parent manager's
> projects**, because the function selects scope rows belonging to any ancestor with role
> `manager`. Today that never matters, because `can_read_lead` branches on `caller` and returns
> before scope is ever consulted. Flatten the policy without carrying that branch across and
> **every caller silently gains sight of their manager's entire territory.** That is the exact
> failure `04-access-control.md` exists to prevent.
>
> The same flattening is needed on `persons_select`, `lead_sources_select`, `activities_select`
> and `visits_select`, which all call `can_read_lead` per row — `persons_select` nests it inside
> an `exists` over `leads`, and the list query inner-joins `persons`, so it pays that cost twice.

Gate on this migration: `npm run db:test` (all fourteen), plus tests 1–6 in `04-access-control.md`
re-run by hand, plus a new negative test proving a caller sees nothing of their manager's
territory. Adish applies it; nobody else.

### P1-5 · The default sort has no index

`queryLeads` defaults to `created_at:desc, id`. There is **no index on `leads.created_at`**
(`0001_init.sql` indexes `assigned_to`, `project_id`, `location_id`, `call_status`,
`pipeline_stage`, and a partial on `sla_due_at`). Every list query therefore sorts the whole
visible set to return 25 rows.

```sql
create index on public.leads (created_at desc, id);
create index on public.leads (assigned_to, created_at desc);
create index on public.leads (assigned_to, next_call_at) where next_call_at is not null;
create index on public.leads (sla_breached_at) where sla_breached_at is not null;
create index on public.leads (first_touch_at) where first_touch_at is null;
```

The last two match the "SLA breached" and "Untouched" filters, which are the two the managers will
actually live in.

### P1-6 · Search cannot use an index at all

```ts
terms.push(`full_name.ilike.%${name}%`);
terms.push(`phone.ilike.%${digits}%`);
```

A leading `%` makes a btree index useless, so every search scans all 20,000 `persons` rows. Fix it
in the database, not the query — trigram indexes serve `ilike '%x%'` directly and no application
code changes:

```sql
create extension if not exists pg_trgm;
create index on public.persons using gin (full_name gin_trgm_ops);
create index on public.persons using gin (phone     gin_trgm_ops);
```

Trigram indexes need three characters to work with, which is already what `filteredLeads` enforces
(`digits.length >= 3`). That was a lucky accident; keep it deliberately.

### P2-7 · Reference data is re-fetched on every render — investigated, not done

`/leads` loads all projects, all sources and every active user on each page view, to fill three
dropdowns that change perhaps weekly. Smaller than it looks once measured (a few dozen rows,
against a 20,000-row leads query on the same page), which is why it is P2 — but worth writing down
why the obvious fix doesn't drop in cleanly, so nobody re-discovers this the hard way mid-sprint.

**The obvious tool doesn't fit.** Next 16's `"use cache"` directive, and its predecessor
`unstable_cache`, both refuse to read `cookies()`/`headers()` inside the cached function — the
call fails outright (`next-request-in-use-cache`), not silently. Our Supabase server client reads
the session cookie to authenticate, and even `projects`/`sources`/`locations` — whose RLS policy is
`using (true)`, same result for every signed-in user — still require *some* valid session token to
hit PostgREST as `authenticated` rather than `anon`. So the token has to be read outside the cached
scope and passed in as an argument — and because a token is part of the cache key by default,
that produces one cache entry **per session**, not one shared across all 8–50 users. Real, but a
fraction of the win it looks like.

**The bigger tool doesn't fit either.** `"use cache"` requires `cacheComponents: true` in
`next.config.ts`, which is not a local flag — it turns on Partial Prerendering as the default for
every route in the app. That is a whole-app behavioural change needing its own testing pass across
every portal, not a Phase A drive-by.

**Left for later, on purpose:** once the JWT-claims work in P0-2 exists, the access token stops
being a moving target (it is populated once per login, not re-derived per request), and caching
this reference data cross-user stops fighting the same constraint. Do it then, not now.

If someone wants the interim, session-scoped version sooner: it is a real, if partial, win — say so
in your team file before building it, since it touches the same files (`org.ts`) as ongoing
territory work.

### P2-8 · `OFFSET` paging and exact counts

`.range(from, …)` is `OFFSET`, so page 200 makes Postgres walk 5,000 rows to discard them. Once
P1-4 lands this is tolerable to roughly page 100, which covers real use of a filtered list.

Two things still deserve a decision. Exact counts force the policy across the full set on every
page; and on the caller portal, where the screen is a phone, "load more" keyset paging (fetch
`where (created_at, id) < (last seen)`) is both faster and the better interaction than numbered
pages. Keyset paging is the right answer for `/my-day`; see *Open decisions* on counts.

### P2-9 · Export holds the whole CSV in memory

`lib/leads/export.ts` pages 1,000 rows at a time — twenty sequential round trips at 20,000 rows,
each re-running the policy, with the finished CSV assembled in memory and returned through a server
action payload. Move it to a Route Handler returning a `ReadableStream`, paged by keyset rather
than offset.

**What does not change:** the audit row is still written before any data is returned, and the
export is still refused if that write fails (D-013). Streaming changes how bytes leave, never
whether they were logged.

### P2-10 · The dashboard scans the whole lead table

`dashboard_counts` runs six filtered aggregates over all of `leads`; `dashboard_portfolios` adds
three lateral joins per manager. These are headline numbers on a wall, not live counters — cache
them for 60 seconds. A materialised summary table refreshed by `pg_cron` is the next step after
that, but 20,000 rows does not justify that machinery yet. Do not build it pre-emptively.

### P3-11 · The free tier is part of the performance story

One shared project, shared CPU, 500 MB, and it **pauses when idle** — the first request after a
pause takes seconds, which will read as "the app is slow" to anyone who tries it on a Monday
morning. The keepalive action covers that, so confirm it is actually green rather than assuming.
`08-decisions.md` D-009 already says real leads wait for a Pro project; 20,000 rows of real data
plus `lead_activities` growth is also the point where 500 MB stops being roomy.

---

## The plan

**Phase A — no schema, no decisions, half a day.** Do this first; it is most of the felt slowness.

1. ~~`vercel.json` pinning `bom1`.~~ **Done, 2026-09-24.**
2. ~~Narrow `revalidatePath` to the routes that changed.~~ **Done, 2026-09-24.**
3. ~~Cache projects / sources / users behind tags.~~ **Investigated, not done** — see P2-7. The
   real cross-user version needs the JWT work in Phase C; doing the session-scoped interim version
   is optional and small, not blocking.
4. ~~Build the 20,000-row seed.~~ **Script built** (`supabase/tools/seed-bulk.ts`), **not yet run**
   against the shared project — needs the service_role key, so whoever runs it should say so in
   their team file first. Baseline numbers for all five budgets are still outstanding until it is.

**Phase B — migration 0011, Adish only, gated on the access tests.** The 20,000-row work.

5. Flat RLS policies on `leads`, `persons`, `lead_sources`, `lead_activities`, `site_visits`.
6. The indexes in P1-5.
7. `pg_trgm` and the two GIN indexes.
8. Update `03-data-model.md` in the same commit; append the outcome to `08-decisions.md`.

**Phase C — needs the decisions below settled first.**

9. JWT role claims and the auth-hook (kills P0-2 entirely, and lets RLS drop its `users` lookups).
10. Keyset paging on `/my-day`, and the count decision applied to `/leads`.
11. Streaming export.
12. Dashboard caching.

Phase B is where Arisha's and Tanishka's screens stop being the bottleneck, so it should land
before their Week 2 work, not after.

## Open decisions — do not guess these

Per `00-START-HERE.md` rule 3, these are the human's to make. Written here so they are asked, not
assumed; they become a `D-0xx` entry in `08-decisions.md` once answered.

1. **JWT staleness.** If role and `is_active` ride in the token, a deactivated user keeps working
   until it refreshes — up to an hour. Acceptable, or must deactivation stay instant? (If it must
   stay instant, P0-2 is solved by the interim step only, and P0-1 carries that phase.)
2. **Exact row counts.** May the list show an approximate total ("about 4,300") for non-admins, or
   is an exact number required on every page?
3. **Export cap.** `EXPORT_MAX_ROWS` is 20,000 — which is now the whole database. Is exporting
   everything in one file intended, or should the cap force a narrower filter?
4. **Page size.** 25 rows. On a manager's desktop screen 50 costs nothing extra once P1-4 lands.

## Validation

No change here is accepted on "it feels faster".

- Every phase: re-run the five budgets against the 20,000-row seed, before and after, and put both
  numbers in the PR.
- Phase B additionally: `npm run db:test` all fourteen green, the six manual tests in
  `04-access-control.md`, and the new caller-vs-manager-territory negative test. A plan that
  passes only the positive direction is not a test, and for this migration it is a leak.
- `explain (analyze, buffers)` output for the `/leads` query, as `authenticated`, pasted into the
  PR for both the manager and the caller case.
