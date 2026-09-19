# Implementation plan — to 20 October 2026

Start: Sat 20 Sep. Ship: Mon 20 Oct. Four developers, each doing frontend **and** backend of their own vertical.

## Ownership

Work is split by **who uses the screen**, not by frontend and backend. Each person builds their portal end to end.

| Developer | Builds for | Owns |
|---|---|---|
| **Adish** | Foundation, then super_admin + admin | Repo, schema, RLS, migrations, login, **the shared core**, users, hierarchy, territories, all-leads view, import, export, audit |
| **Arisha** | Manager + sub_manager | Territory lead list, team roster, reassignment, escalation inbox, availability & delegation, team performance |
| **Tanishka** | Caller | My Day, lead detail, call outcomes, follow-ups, buyer history, own performance — mobile first |
| **Sayli** | Everyone, cross-cutting | Company dashboard, attendance, geofencing, site visits |

Sayli's work is deliberately not a portal: attendance, geofencing and site visits are used by every role, so one person owns them across the system.

Adish also owns migrations for everyone: anyone may write one, only he applies it.

### The shared core — built once, in Phase 0

Three portals all show leads. Without this, you get three lead tables, three badge sets and three ways of loading data.

Adish delivers before anyone else starts: the app shell, `DataTable`, `StatusBadge`, the lead detail shell, `actions/leads.ts`, the empty/loading/error/no-access states, `lib/permissions.ts` and `lib/format.ts`.

**The rule:** if the shared version falls short, extend it so it still works for the other two. Never copy it into your own folder.

Why it matters beyond tidiness: permissions live in the database, so all three portals run the same query and each gets the right rows automatically. Three hand-written queries is three chances to leak.

---

## Phase 0 — foundation (Sat 20 Sep → Thu 25 Sep) · Adish alone

**Nobody else can start their vertical until this is merged.** The other three spend this week on the prep list below.

Adish:
- [ ] GitHub repo, private, three collaborators added, branch protection on `main`
- [x] Next.js 16 + TypeScript + Tailwind + shadcn/ui scaffold (done 2026-09-19)
- [ ] Supabase project, **India region** (cannot be changed later)
- [ ] Apply `0001_init.sql`, `0002_rls.sql`, `0003_routing_and_jobs.sql`, `0004_caller_column_guard.sql`
- [ ] Load `seed.sql` — 8 users, 6 projects, 42 leads (leads pre-assigned to callers)
- [ ] Supabase Auth wired, login page, session middleware, route protection
- [ ] **The shared core** (see Ownership above) — the other three are blocked on it
- [ ] `npm run db:types` generating `src/types/database.ts`
- [ ] **All access tests passing (`npm run db:test`, 14 checks incl. the six in `04-access-control.md`)** ← the real gate
- [ ] Keepalive GitHub Action running
- [ ] `.env.example` committed, keys shared privately

Arisha, Tanishka, Sayli this week:
- [ ] Read the whole `brain/` folder
- [ ] Get Next.js + Supabase running locally against the seed data
- [ ] Anyone new to the stack: build one throwaway CRUD page to learn it
- [ ] Sketch your own screens on paper, post photos in your `team/` file
- [ ] Fill in your `team/<name>.md`

**Gate, Thu 25 Sep evening:** everyone clones, logs in as a caller, and confirms they see only that caller's leads. If this fails, nothing else starts.

---

## Week 1 — Fri 26 Sep → Thu 2 Oct

| Who | Deliverable by Thu 2 Oct |
|---|---|
| **Adish** | User management: create/edit/deactivate, assign parent. Hierarchy tree. Super_admin only. |
| **Arisha** | Territory lead list, mine-vs-team toggle, team roster with live counts. Sub_manager view verified. |
| **Tanishka** | My Day list ordered by what needs attention now. Lead detail read-only, tap-to-dial, SLA countdown. Tested on a real phone. |
| **Sayli** | Company dashboard with the five numbers and the today/all-time toggle, static data. Manager portfolio rows. |

Shared: agree component patterns in `07-ui-conventions.md` by Mon 29 Sep so four people do not invent four button styles.

---

## Week 2 — Fri 3 Oct → Thu 9 Oct

| Who | Deliverable by Thu 9 Oct |
|---|---|
| **Adish** | Territory editor with overlap warnings. All-leads admin view. Exit transfer. Audit logging wired in. |
| **Arisha** | Reassign with the visibility guard, bulk reassign, escalation inbox, SLA countdown in the list. |
| **Tanishka** | Call outcome form with all mandatory-field rules. Activity timeline. Quick remark. |
| **Sayli** | Attendance check-in/out with GPS, role-scoped attendance views, dashboard on live SQL counts. |

**Mid-point review, Thu 9 Oct:** all four demo on the shared database. Anything more than three days behind gets cut from v1 here, not in the last week.

---

## Week 3 — Fri 10 Oct → Thu 16 Oct

| Who | Deliverable by Thu 16 Oct |
|---|---|
| **Adish** | CSV import with dedupe and error report. CSV export, admin-only, audited. Audit viewer. Password reset. |
| **Arisha** | Availability switch and delegation. Delegation status view. Team performance. Pipeline stage control. |
| **Tanishka** | Follow-ups today/tomorrow/overdue. Buyer history across projects. My performance with the not-updated-today count. |
| **Sayli** | Geofence management. Site visit mode prompt. Site visits end to end with arrival check-in. Visits calendar. |

---

## Week 4 — Fri 17 Oct → Mon 20 Oct · hardening only

No new features. Anything unfinished on 17 Oct is v2.

- [ ] Fri 17: full team bug bash. Every role, every screen, written up as issues.
- [ ] Sat 18: fix P1s. Adish re-runs the access tests one final time.
- [ ] Sun 19: deploy to Vercel. Load the real user list. Still mock leads.
- [ ] Mon 20: walkthrough with Gautam, then hand over.

---

## Weekly rhythm

- **Monday 10:30** — 15 minutes, four voices, what you finished and what is blocking you.
- **Thursday evening** — everyone updates `team/<name>.md`. The week's deliverable is either done or it is not.
- **Daily** — read all four `team/` files before you start.

## Definition of done

A deliverable is done when it works for every role that touches it, has RLS proven in both directions, the brain file is updated, and the PR is merged to `main`. Not when it works on your branch.

## Known risks

| Risk | Mitigation |
|---|---|
| Phase 0 slips | Everything slips. Adish protects this week — no other tasks. |
| Four people, one database | Migrations through Adish only, never the dashboard. |
| Three portals rebuild the same lead screen | Shared core built first by one person; Monday review catches duplication in week one. |
| Free tier pause | Keepalive action from day one. |
| No backups | Mock data only until a Pro production project exists. See D-009. |
| Someone is new to the stack | Prep week exists for this. Say so on day one, not in week 3. |
| Scope creep | Anything not in `01-product.md` is v2. Gautam decides, nobody else. |
