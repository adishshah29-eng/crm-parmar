# Team playbook — how to build your part

For Arisha, Tanishka and Sayli (and anyone joining later). Read this after `00-START-HERE.md`, then start. It says **how** to work; your task file says **what** to build; `SHARED-CORE.md` says what already exists.

Adish built the foundation, so most of your work is *using* it correctly. A screen that lists leads is about 40 lines if you use the shared pieces, and 400 lines of risk if you don't.

---

## 1. Before you write any code (once, Day 1)

1. **Clone and install**
   ```bash
   git clone <repo-url> && cd parmar-crm
   npm install
   cp .env.example .env.local
   ```
   Fill `.env.local` with the Supabase **URL and anon key** Adish sends you privately. You never need, and must never ask for, the `service_role` key.
2. **Run it:** `npm run dev`, open http://localhost:3000.
3. **Log in as each role** (password for every test user is `Test@12345`):

   | Email | Role | Use it to check |
   |---|---|---|
   | `super@parmar.test` | super_admin | everything |
   | `admin1@parmar.test` | admin | company-wide, no user/territory admin |
   | `mgr.worli@parmar.test` | manager | Worli territory + his team |
   | `mgr.pune@parmar.test` | manager | Pune territory (should NOT see Worli-only leads) |
   | `sub.worli@parmar.test` | sub_manager | inherits Worli |
   | `caller1@parmar.test`, `caller2@…`, `caller3@…` | caller | only their own leads |

   Confirm `caller1` sees only their own leads. If not, stop and tell Adish: nothing else is safe to build.
4. **Read, in this order:** `02-system-design.md`, `04-access-control.md`, `05-lead-flow.md`, `07-ui-conventions.md`, `SHARED-CORE.md`, your `tasks/<name>-tasks.md`, then all four `team/*.md`.
5. **Phone testing** (Tanishka needs it in Week 1; everyone benefits): `npm run dev -- -H 0.0.0.0`, then open `http://<your-computer's-LAN-IP>:3000` on a phone on the same Wi-Fi.
6. **Your first PR is a warm-up.** Make a tiny real change (e.g. the empty page for your first screen plus its `nav.ts` link), and take it through the whole loop in section 3. Learning the PR flow on something harmless is the point.

**If you use an AI coding agent:** it reads `CLAUDE.md`/`AGENTS.md`. It must show you every git command before running it, never push, and never invent schema or business rules. If it says "I'll just add a column", the answer is no: see section 5.

---

## 2. The daily loop

```
morning   git checkout main && git pull origin main
          read all four brain/team/*.md            (2 minutes, prevents duplicate work)
work      one branch, one task
evening   push, open/refresh your PR, update your brain/team/<you>.md
```

- **Monday 10:30:** 15-minute standup. What you finished, what blocks you.
- **Thursday evening:** update your team file. The week's deliverable is either done or it is not.
- **Blocked?** Write it under `## Blocked` in your own file and tag the person under `## Asking`. Don't wait silently for a day.
- Your team file is the **only** one you edit. Everyone reads all four.

---

## 3. The loop for every task

**1. Branch.** Always from a fresh `main`.
```bash
git checkout main && git pull origin main
git checkout -b feat/<area>-<short-thing>      # areas: auth org leads engine ops ui db
```
One branch per task. If it will live longer than three days, split it.

**2. Look before you build.** Search `SHARED-CORE.md` and `src/components/shared/`, `src/lib/`. If a table, filter, badge, formatter or action exists, use it. If it *almost* fits, **extend it with a default** so other portals are unaffected. Never copy it into your own folder.

**3. Data first, screen second.**
- New logic goes in a **pure function** under `src/lib/<area>/` (no `next/*` or `react` imports). It takes a session-bound Supabase client.
- The server action in `src/actions/` is a thin wrapper: get the user, call the function, log audit, `revalidatePath`.
- Return `ActionResult` (`ok()` / `fail("plain sentence")`). Never surface a raw Postgres error.
- Validate input with a **zod schema in `src/lib/schemas/`** and import that same schema in your form.

**4. Test it against the real database, as real users.** Add a script `supabase/tests/run-<area>-tests.ts` and an npm script (copy the shape of `run-lead-tests.ts`). A test is only real if it:
- proves **both directions**: the right person *can* and the wrong person *cannot*;
- has a **positive control** (so "sees nothing" isn't just an empty table);
- recomputes expected numbers **independently** from raw rows;
- **restores** whatever it changed, or uses clearly marked temporary rows.

**5. Build the screen** from the shared pieces (recipe in `SHARED-CORE.md`). Every screen needs four states: loading (skeleton, not a spinner), empty (say what to do next), error (what failed and what to try), and no-access. Lead screens must work at **375px**.

**6. Check it as every role that touches it**, not only the one you built for. Sign in as each seeded user and look.

**7. Update the brain in the same PR** if behaviour, schema, a contract or a decision changed. Append to `08-decisions.md`; never rewrite it.

**8. Open the PR.**
```bash
git add -p                                   # review what you stage; do not blind-add
git commit -m "<area>: <what changed, lowercase>"
git push -u origin feat/<area>-<short-thing>
```
In the description: what it does in two lines, which brain files changed, which tests you ran, anything the others need to know.
- **Reviewer pairs:** Adish ↔ Arisha, Tanishka ↔ Sayli. If yours is away, ask anyone.
- **Merge** with *Squash and merge*, then delete the branch. Never merge your own PR.
- Anything touching an RLS policy: Adish reviews it, and the PR lists which access tests you re-ran.

**9. Log it** in your `team/<you>.md` under `## Log`.

The task is **done** only when `definition-of-done.md` is true: works for every role, RLS proven both ways, states exist, brain updated, PR merged. Not "works on my branch".

---

## 4. Running the tests (read this before you run them)

All four of you share **one** database. Some suites briefly change shared mock data (then restore it), so two people running them at once can cause confusing failures.

| Command | Changes data? | Who runs it |
|---|---|---|
| `npm run db:test` | trivially (one audit row) | anyone, any time |
| `npm run test:leads` | edits one lead, restores it | say so in the team file first |
| `npm run test:org`, `test:territory`, `test:admin`, `test:dashboard` | temporary users/leads/visits, restored | Adish, or ask |
| your own `test:<area>` | yours | announce before running |

When a test fails, read the message before rerunning. And **never run any of these against real data** (they are for the mock database only).

---

## 5. When you need the database changed

Nobody changes the database from the Supabase dashboard, ever. You **write** a migration; only Adish **applies** it.

1. Check `supabase/migrations/` for the next number (renumber yours if someone took it).
2. Forward-only SQL. Never edit an applied migration; fix it in a new one.
3. Update `brain/03-data-model.md` **in the same commit**. A migration without the doc change is not approved.
4. Rules that have already bitten this project:
   - **RLS on every new table, in the same migration**, with explicit policies. A table with none is readable by every logged-in user.
   - **Every `DELETE`/`UPDATE` needs a `WHERE`** (Supabase blocks bare ones for API calls; even `where true` works).
   - A function that calls `app.*` helpers directly must be **`SECURITY DEFINER`** with its permission check as the first statement, or the API role can't run it.
   - `SECURITY INVOKER` is right for read-only counting: RLS then decides what each role counts.
   - Index the foreign keys you filter on.
5. Say it in your team file (`Asking: @adish migration 0011 is merged, please apply`). He applies it and posts; then everyone runs `git pull` and `npm run db:types`.
6. Until the generated types know a new function, call it with `callRpc()` from `src/lib/supabase/rpc.ts`.

---

## 6. Traps already found (each cost time once)

1. **Access control lives in the database.** Never write `if (role === ...)` in a query. If the wrong rows appear, the bug is one layer down: tell Adish.
2. **Never put the `service_role` key in your code.** There is exactly one file allowed to touch it (`src/lib/supabase/admin.ts`).
3. **Business rules are written down.** If timings, permissions or statuses aren't in `brain/`, stop and ask; don't decide.
4. **Time.** Store UTC, show `Asia/Kolkata`, and count SLA time in *working minutes* with `app.add_working_minutes`, never client-side date arithmetic. In **tests**, never use `new Date()` for "today" or "working hours": a laptop clock can be hours off (Adish's was 8). Use `dbNow()` from `supabase/tests/db-clock.ts`.
5. **`z.guid()`, not `z.uuid()`.** Zod 4's `uuid()` rejects the seed's readable ids.
6. **Never return a Supabase query builder from an `async` function.** The builder is a thenable, so `await`-ing on return *runs the query*. Return `{ query }`.
7. **Self-joins in Supabase selects:** `parent:parent_id(full_name)`, not `users!parent_id(...)` (that resolves the reverse direction and silently returns `[]`).
8. **A blocked write can look like success.** RLS often returns zero rows instead of an error. Always check the affected row count (`.select("id")` on updates) and tell the user plainly.
9. **`lead_activities` is append-only, and any activity row sets `first_touch_at`**, which stops the 45-minute SLA clock. Never write an activity for bookkeeping (assignments, transfers). Only real touches.
10. **Callers may not change ownership, territory or SLA columns** (a trigger enforces it). Don't build UI that pretends they can.
11. **Next.js 16:** `proxy.ts` not `middleware.ts`; `cookies()` and `searchParams` are async. Read `node_modules/next/dist/docs/` before writing framework code.
12. **No `useEffect` for data fetching.** Server Components and server actions.
13. **Status colours are fixed** (`07-ui-conventions.md`). One `StatusBadge`; no new colours; no private badges or tables.
14. **Never commit** `.env.local`, `node_modules`, `.csv` files, or anything with a real phone number.
15. **Editing files with regexes or backslashes through shell one-liners can silently drop the backslashes.** Use your editor (or the file tool) and re-read the result.

---

## 7. Your first days, task by task

### Arisha — manager & sub_manager portal

**Day 1–2, B1.1 territory lead list** (`feat/leads-team-list`)
1. `src/app/(app)/team/leads/page.tsx`, following the recipe in `SHARED-CORE.md` (`parseLeadSearchParams` → `getLeads` → `<DataTable>`), with `<LeadFilters showOwnerScope … />`. The nav link already exists in `lib/nav.ts`.
2. **Do not filter by role.** RLS already returns the manager's territory plus team. That's what "one query, three correct answers" means.
3. Detail route `/team/leads/[id]` using `LeadDetailShell`; put your controls in the `actions` slot.
4. Verify as `mgr.worli` (sees Worli + team, not Pune-only leads) and `mgr.pune`. `npm run db:test` already proves the visibility rules; don't duplicate them.

**B1.2 mine / team / territory toggle:** the `LeadFilters` owner control already offers *My leads / My team*. Extend it with a default if you need a third option.

**B1.3 team roster:** counts per caller. Per-owner counts already exist (`public.lead_counts_by_owner()`); anything more (untouched, follow-ups due) belongs in **one SQL function** via a migration, not in JavaScript. Link each row to `/team/leads?owner=<callerId>`.

**B1.4 sub_manager:** use `sub.worli`. It should see Worli's territory and never Pune's.

**Week 2, B2.1 reassign: needs a decision first.** Read `D-027` in `08-decisions.md`. Two facts:
- `public.move_leads()` currently **refuses everyone but admins**. Your manager version needs an SQL change (a migration Adish reviews), plus the scope rule, which is **not written down yet**. Propose it to Adish in your team file *before* coding.
- Extend `lib/leads/assign.ts` and `actions/assignment.ts`; do not write to `leads.assigned_to` any other way.

**B2.2 bulk reassign:** use `components/shared/selection.tsx` (`SelectionProvider`, `selectable` on `DataTable`); build only your own bulk bar (see `components/admin/AssignLeadsBar.tsx` for the shape).

**B2.4 SLA countdown:** `sla_due_at` is already stored. Remaining *working* minutes across nights can't be done with plain subtraction; write a small SQL function for it (a migration) instead of client date maths.

### Tanishka — caller portal (phone first)

**Day 1–2, C1.1 My Day** (`feat/leads-my-day`)
1. Replace the stub `src/app/(app)/my-day/page.tsx`. Use `getLeads` as-is; a caller only ever receives their own rows.
2. The ordering (new & untouched with SLA running → follow-ups due today → overdue → rest) is not a sort column. A caller has at most a few hundred leads, so fetch a page and order it in a **pure, tested function** under `src/lib/leads/`. Don't add role branches to the shared query.
3. Detail at `/my-day/[id]` with `LeadDetailShell`; `LeadSummary` already has the big tap-to-dial number.
4. **Test on a real phone in Week 1**, before the patterns set.

**Week 2, C2.1 call outcome form** (`components/caller/CallOutcomeForm.tsx`)
- Import `callOutcomeSchema` from `lib/schemas/lead.ts` into your react-hook-form form and call `updateCallStatus`. The mandatory-field rules already live in that schema; do not re-implement them.
- **Trap:** the schema wants `nextCallAt` as an ISO string **with an offset**. A `datetime-local` input has none, and the phone's timezone may not be IST. Convert explicitly to `+05:30`.
- Three taps to finish a lead: outcome, temperature, next date.
- Never set `first_touch_at` yourself. The database does it when the activity lands.

**C2.2 timeline** and **C2.3 quick remark:** `ActivityTimeline` and `addRemark` exist. Wire them.

**Week 3, C3.2 buyer history: needs a decision first.** The brain wants "same buyer on another project: which project, who owns it, what stage". But RLS **hides other callers' leads from a caller**, by design. Showing them means a narrow `SECURITY DEFINER` function that returns only project, owner name and stage. That deliberately crosses RLS, so **agree it with Adish before building.**

### Sayli — attendance, geofences, site visits

**Day 1–2, D2.1 check-in / check-out** (`feat/ops-attendance`)
1. `src/actions/ops.ts`: `checkIn`, `checkOut`. One row per person per day is enforced (`unique(user_id, work_date)`); handle the repeat gracefully with an upsert, not a Postgres error.
2. **Critical:** `work_date` must be the **IST date**. Lead routing looks for `work_date = today in Asia/Kolkata`. Use the server's clock, not the browser's, or callers who did check in get skipped and receive no leads.
3. Handle "location permission denied" with a plain message.
4. Say on the screen that **attendance feeds lead routing** (people will wonder why they got no work).

**D2.2 attendance views:** own for everyone, team for managers, all for admins. RLS scopes it; don't branch on role.

**Week 3, D3.4 arrival check-in:** compute `within_geofence` on the **server** (Haversine, as a pure tested function) from the `geofences` row. Never trust a flag from the browser. The flag records; it never blocks completing a visit.
**D3.2:** it *prompts*, it never switches availability by itself (D-015).
**Your tables feed Adish's dashboard** (`site_visits`, `attendance`, `geofences`): tell him in your team file before changing a column.

---

## 8. Week 4 (17–20 Oct): hardening only

No new features. Anything unfinished on 17 Oct is v2.
- **Fri 17:** full-team bug bash, every role, every screen, written up as issues.
- **Sat 18:** fix P1s. Adish re-runs the access tests one last time.
- **Sun 19:** deploy to Vercel, real user list, still mock leads.
- **Mon 20:** walkthrough with Gautam, then hand over.

**Real client leads must not be loaded** until a separate production Supabase project exists on the Pro plan (D-009). There are no backups on the free tier.
