# Handoff — performance work, branch `claude/repo-review-g73yf2`

2026-09-25. What this branch did, what state it left things in, and what the next person should
do first. Read `brain/10-performance.md` for the full design — this is the short version.

## Why this branch exists

Adish asked for a system design pass on performance: the CRM is being built against 42 seed leads
but will run against 10,000–20,000, and the app already felt slow. The findings and the plan live
in `brain/10-performance.md`, added to the read order in `brain/00-START-HERE.md`.

## What's done

1. **`brain/10-performance.md`** — the design doc. Ranked findings (`P0`/`P1`/`P2`/`P3`), a phased
   plan (A/B/C), performance budgets, and four decisions listed for Gautam rather than guessed.
2. **`vercel.json`** — pins Vercel functions to `bom1` (Mumbai), next to the Supabase project
   instead of the default Washington region. Takes effect on the next deploy.
3. **`revalidatePath` narrowed** in `src/actions/leads.ts` and `src/actions/assignment.ts` — they
   used to purge the whole app's router cache (`revalidatePath("/", "layout")`) on every saved
   call outcome, remark, reassign and bulk assign. Now scoped to `/leads`, `/dashboard`, `/my-day`.
4. **`supabase/tools/seed-bulk.ts`** built and run against the shared project. Signs in as
   `super@parmar.test` and writes through ordinary RLS (no service_role key needed — admin already
   has insert permission on the tables involved). **The shared database now holds 20,042 leads**
   (42 original + 20,000 mock, phones starting `+9199`, reversible with `--clean`).

Everything above is committed on this branch (`df36b79` → `2ddf8b2`) and pushed. `tsc --noEmit`,
`eslint`, and a full `next build` all pass clean.

## What's deliberately NOT done

**Reference-data caching** (projects/sources/users, `10-performance.md` P2-7) was investigated and
skipped on purpose. Both `"use cache"` and `unstable_cache` refuse to read `cookies()` inside the
cached scope, and the RLS-scoped Supabase client needs the session cookie even for tables everyone
reads identically — so a cache built today would key per-session, not cross-user, for a fraction of
the intended win. The real version wants the JWT-claims work already queued for Phase C. Don't
build the interim version without saying so in your team file first — it touches `org.ts`.

**The RLS migration itself (Phase B, migration 0011) was not written.** The design doc has the
proposed SQL, but flattening `can_read_lead()` naively **leaks every caller their manager's whole
territory** (`my_scope_projects()` resolves upward through ancestors; only the `caller` branch in
the current function stops it being consulted). Read `10-performance.md` P1-4 in full before
touching that policy — the warning is not decoration.

## What the next person should do first

**Nothing has been measured yet.** The bulk seed inserted data; it did not benchmark anything.
Before Phase B starts:

1. Sign in as a **manager or caller** — not `super_admin` and not `postgres`. `app.is_admin()`
   short-circuits `can_read_lead()` before it reaches the expensive subqueries, so measuring as
   `super_admin` hides exactly what P1-4 is about.
2. Record the five budgets in `10-performance.md` (`/leads` list, lead detail, search, `/dashboard`,
   export) as they stand today, RLS un-migrated. Nothing to compare Phase B against without this.
3. `explain (analyze, buffers)` on the `/leads` query, both as a manager and as a caller — paste
   both into whichever PR does Phase B.

Only after that does migration 0011 get written, and only by Adish, gated on all fourteen access
tests plus the six manual ones in `04-access-control.md` plus a new negative test proving a caller
still can't see their manager's territory.

## Loose ends

- `.env.local` exists on this machine only (gitignored, not committed, not shared here). The next
  session that needs to run anything against the live project will need its own copy.
- The four open decisions in `10-performance.md` (JWT staleness vs. instant deactivation, exact vs.
  approximate row counts, the export cap now that it equals the whole database, page size) are
  still open. They gate Phase C, not Phase B.
- Everyone's `/leads`, `/dashboard` etc. now show a very different row count than before this
  branch. Expected, not a regression — say so if anyone asks.
