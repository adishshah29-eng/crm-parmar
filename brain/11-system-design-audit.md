# System design audit and plan

2026-09-25. Method: the `system-design` skills (proyecto26/system-design-skills, installed at user level): clarify, estimate, audit the design, trade-offs, failure modes, then a phased plan. Complements `10-performance.md`, which is the deep dive on database speed and is not repeated here.

**Verdict in one line:** the architecture is right-sized for this business and needs no new infrastructure. What stands between us and "good, fast, responsive" is not scale. It is four things: nothing catches failures, nobody would know the site is slow or down, the phone experience has never been looked at, and the free database has no backups and a size ceiling we will hit within a year.

## 1. Problem and scope (what "good, fast, responsive" means here)

| Word | Testable target |
|---|---|
| **Fast** | Budgets in `10-performance.md` Targets, measured as a manager and a caller, never as super_admin. First byte for a list page under 500 ms from Mumbai. |
| **Responsive** | Every screen usable at 375 px wide with one thumb. Callers dial from personal phones and managers use the portal on site, so phone is a primary device, not a fallback. Tap targets 44 px, no horizontal page scroll, tables become cards or scroll inside their own box. |
| **Good** | A failure shows a useful message and a way back, never a blank page. We find out about a problem before Gautam does. Nothing is lost silently. |

Out of scope (unchanged, `01-product.md`): multi-tenancy, telephony, WhatsApp, native mobile app.

## 2. Estimates (assumptions in bold; confirm them)

| Quantity | Number | How |
|---|---|---|
| Users | ~41 (1 + 3 + 7 + 20 + 10) | `01-product.md` |
| Peak concurrent | ~25 | 60% of staff, working hours only (10:30-19:30 IST) |
| Page loads at peak | ~2.5 / s | 25 users x one page per 10 s |
| Database calls at peak | ~15 / s | ~5 per page today (see P0-2) |
| Leads | **~14,000-15,000 new per year** (Adish, D-038) | the 20k mock set is a safe upper bound |
| Activity rows | ~150,000 / yr | ~10 per lead x 0.3 KB = ~45 MB |
| **audit_log growth** | **~1.5 M rows / yr, ~450 MB** | `getLead` logs `view_lead`: **~100 views per user per day** x 41 users x 365 |

What the numbers force: **nothing exotic.** 15 database calls a second is trivial for one Postgres. No cache server, no queue, no read replica, no sharding, no microservices. The one number that bites is the last one: the audit log alone would outgrow the free tier's 500 MB in about a year (see F-5).

## 3. Current design (as built)

Browser -> Vercel (`bom1`, Mumbai) -> Next.js Server Components and server actions -> Supabase Postgres (Mumbai) with row-level security; Supabase Auth; `pg_cron` for the night queue and SLA escalation; GitHub Action keepalive. Access control lives in the database (`04-access-control.md`). 18 routes, all server-rendered on demand, 29 of 70 components are client components, ~400 KB gzip of JavaScript across all routes (fine). Fits the "single server, split tiers" rung of the scaling ladder, which is the correct rung for 41 users.

## 4. Score (skill rubric, 0-5)

| Dimension | Score | Weakest point |
|---|---|---|
| Requirements | 4 | Phone/desktop split and real lead volume are assumptions, not written down |
| Numbers | 3 | Only the database was measured; nothing measured on a real deploy or a phone |
| Building blocks | 4 | Right blocks, right size. Known-slow parts fixed (`0011`, `0012`) |
| Trade-offs | 4 | Well recorded in `08-decisions.md`; JWT-staleness decision still open |
| **Failure and degradation** | **1** | **No error boundaries, no monitoring, no backups, free tier pauses** |
| Scale evolution | 4 | Ladder is clear and nothing is over-built |
| **Responsive / UX** | **2** | **Never viewed in a browser; only 2 of 17 pages have a loading state** |
| **Total** | **22 / 35** | **Weakest: failure handling** |

## 5. Findings, ranked

**F-1 (High). Nothing catches a failure.** No `error.tsx`, `global-error.tsx` or `not-found.tsx` anywhere. A thrown error in a Server Component shows Next's bare error page, and a caller mid-call loses their screen. Fix: root `error.tsx` and `global-error.tsx` with "Try again" and a way home, `not-found.tsx`, and a route-level `error.tsx` for `/leads`, `/leads/[id]`, `/my-day`.

**F-2 (High). We would not know it is broken.** No error tracking, no uptime check, no speed measurement. Supabase and Vercel logs exist but nobody reads them. Fix, all free or already included: Vercel Speed Insights for real-user timings (this is how "fast" is measured after launch), an uptime ping on `/login` from the existing GitHub Action, and an error tracker (Sentry free tier) or, at minimum, `console.error` with a request id so Vercel logs are searchable.

**F-3 (High). The phone experience is unverified.** The in-app browser cannot open localhost, so no screen has ever been checked at phone width; the restyle is also unseen. Only 2 of 17 pages have a `loading.tsx`, so most navigations show nothing until the server answers. Fix: a phone-width check of every screen (below), `loading.tsx` skeletons for the list and detail pages, tables that reflow on small screens.

**F-4 (High). No backups, and the free database pauses when idle** (D-009). Fine for mock data. **Production will be on AWS, not Supabase Pro (D-038).** The gate is unchanged: no real lead is loaded until there is a production database with automated backups and point-in-time recovery (RDS gives both) and no idle pausing. This is a go-live gate, not an optimisation. How we get there is section 11.

**F-5 (Medium, decided and built 2026-09-25). `audit_log` would have grown about 450 MB a year from viewing leads alone.** Decision D-039: one `view_lead` row per person per lead per day, enforced by a trigger (migration `0015`). Growth drops to roughly a tenth. Check 17 in `db:test` guards it.

**F-6 (Medium). Two database calls per request just to learn who the user is** (P0-2). The proxy and the page each ask the auth server and read `users`. **`is_active` cannot go in the token (deactivation must be instant, D-038), so the JWT route is closed for that fact.** Fix: narrow the proxy matcher, and let the page reuse the proxy's answer instead of asking again. Role claims alone remain possible later.

**F-10 (High, found and fixed 2026-09-25). Deactivation was not instant.** The proxy signed the person out of the portal, but the database kept serving them for the life of their token (up to an hour) to anyone calling the API directly. Reproduced by a test, fixed by migration `0014` (restrictive policy on every table, role helpers return nothing for an inactive user). Checks 15 and 16 in `db:test` guard it.

**F-7 (Medium). Search and export at the edges.** Search is 1.4 s until migration `0013` (trigram) is applied. Export is capped at 20,000 by decision (D-037), so no work needed.

**F-8 (Low). No security headers** (`Content-Security-Policy`, `X-Frame-Options`, `Strict-Transport-Security`, `Referrer-Policy`) in `next.config.ts`. Cheap, and a CRM full of phone numbers should have them.

**F-9 (Low). Reference data and the dashboard are recomputed on every request.** `10-performance.md` P2-7 and P2-10. Fine at 25 concurrent users; do not build a cache pre-emptively.

**Not findings, on purpose:** a Redis cache, a message queue, a read replica, sharding, microservices, multi-region. The numbers in section 2 do not justify any of them. The skill's rule is to add the next rung only when a measured number says so; the triggers are in section 7.

## 6. The plan

Ship date is Mon 20 Oct 2026. Today is Thu 25 Sep (gate call).

### Phase 1: Safety net, this week (Adish, 1-2 days, no schema): BUILT 2026-09-25, needs a look on a real phone

Status of each item below: 1 done, 2 done, 3 done, 4 partly (0013 is yours to apply; the proxy change is deferred on purpose, see the note), 5 done in code (switch-on steps in the team log), 6 code-level pass done, visual pass is yours. Not done on purpose: a Content-Security-Policy (it can break the app in ways only a browser shows; do it in report-only mode after the first deploy). Phase 2 (playbook and definition of done) is not started.

Note on item 4: with `0014` the database now refuses a deactivated user by itself, so the proxy's `is_active` lookup is only there to sign them out politely. Removing it needs the page to reuse the proxy's answer, otherwise a deactivated person is bounced between `/` and `/login`. That is F-6 and stays with Phase 4, where it can be measured on the real deployment instead of guessed at.
1. F-1: `error.tsx`, `global-error.tsx`, `not-found.tsx`, route-level errors.
2. F-3: `loading.tsx` for `/leads`, `/leads/[id]`, `/users`, `/territories`, `/my-day`, `/audit`, `/import`.
3. F-8: security headers in `next.config.ts`.
4. Apply `0013`; proxy matcher narrowed (F-6, interim).
5. F-2: Speed Insights + uptime ping; confirm the keepalive Action is actually green.
6. **Mobile pass** (section 9) over every existing screen; fix what breaks in the shared components once, so the three portals inherit it.

### Phase 2: Bake it into how the team builds, before portals start (Adish, half a day): BUILT 2026-09-25

Done: playbook step 5b (measure it), section 4 (tests table and the 20k data note), section 5 (migration rules: `active_only`, index order, no function-of-row-id policies), traps 16-24, the Week 4 wording (AWS, D-040); `definition-of-done.md` (phone, loading/error, a speed section, database and RLS lines, three new "not done" excuses); a pull request template (`.github/pull_request_template.md`); and `db:bench` is now a real gate: it exits 1 if any budget is missed, discards a warm-up call so one cold request cannot fail it, and its header says how to add a screen. Result of the last run (after migration `0016`): **all budgets met**, `db:test` 17/17, `test:leads` pass.
7. Add a **"Performance and phone rules"** page to the playbook (start from D-036 and the "rules that came out of the 20k measurements"): no `nullsFirst` on NOT NULL sorts, embed `persons` as an inner join only when filtering on it, no function-of-row-id in a policy, never page through more than 1,000 rows without `range`, tests must not assume the seed size.
8. Add to `definition-of-done.md`: screen checked at 375 px and 1280 px; a `loading.tsx`; an `error.tsx` if the route fetches; a list query checked with `npm run db:bench`.
9. `db:bench` is the regression gate: re-run after every phase, both numbers in the PR.

### Phase 3: While the portals are built (Arisha, Tanishka, Sayli, Weeks 1-3)
10. Arisha and Tanishka reuse `DataTable`, `leadColumns` and `listSelect`; they do not write their own list queries.
11. Tanishka's `/my-day`: keyset paging (Phase C in `10-performance.md`), because it is the screen used all day.
12. Sayli's check-in and geofence screens are phone-first by design; test on a real phone.
13. Decide F-5 (audit growth) before the audit UI is finished.

### Phase 4: Hardening and go-live, Week 4 (Adish, Oct 13-20)
14. Deploy to Vercel `bom1`; measure P0-1 and P0-2 on the real deployment for the first time; record numbers next to the baseline.
15. **Go live on 20 Oct on the tested Supabase setup with mock data only (D-040).** The AWS production database (automated backups and point-in-time recovery, section 11) comes next, is owned by someone with a date, and gates every real lead (F-4). Run `analyze` after the first real import.
16. Deactivation is instant (D-038, migration `0014`, done). Remove the duplicate identity lookups by reusing the proxy's answer in the page; no token hook for `is_active`.
17. Bug-bash with all four on real phones; fix by severity; freeze.

### Phase 5: After launch, only when a number says so
| Trigger (measured) | Next move |
|---|---|
| Dashboard over 800 ms | 60-second cache, then a summary table refreshed by `pg_cron` |
| Database CPU above 70% at peak, or 8 s timeouts return | Read replica, then index review, then compute upgrade |
| `audit_log` above 5 GB | Partition by month, archive old partitions |
| Sustained 100+ req/s | A cache in front of reference data; only then reconsider a queue for imports |
| Anything in the tenancy or region rows of `01-product.md` changes | Revisit this whole document |

## 7. Trade-offs of the big choices

| Decision | Solves | Worsens | Change it when |
|---|---|---|---|
| Access control in the database (RLS) | Data is safe even from a buggy screen | Every read pays the policy; needs the performance rules above | Never for safety; tune the policy, not the model |
| Server-rendered pages, direct database from the server | Simple, no API layer to keep in sync | Every navigation waits on the server, so loading states matter | Consistently slow at the p95 even after fixes |
| One shared free Supabase project | Zero cost while mock | No backups, pauses, 500 MB, shared CPU, no staging | Before real leads (Phase 4) |
| Exact counts everywhere (D-037) | Honest totals | Costs a scan at large sizes | Count exceeds 500 ms again at 10x data |
| No cache layer | Nothing to invalidate wrongly | Repeat reads hit the database | Numbers in Phase 5 |

## 8. Decisions

Answered 2026-09-25 (D-038, D-039): phones are primary; about 14-15k leads a year; production on AWS; deactivation is instant; lead views are logged once per person per lead per day.

Still open:
1. **Production on AWS: how (A or B).** When is decided: it comes after go-live, and no real lead is loaded until it is ready (D-038, D-040). Pick A or B by the end of Week 2 and give the AWS work an owner and a date, because the real work starts the day it is ready (section 11).

## 9. Mobile check (repeat for every screen)

At 375 x 812 and 768 x 1024, signed in as the role that owns the screen:
- No horizontal scroll on the page; a wide table scrolls inside its own box or becomes cards.
- Every button, link and row action is at least 44 px tall.
- Forms: correct input type (`tel`, `email`), label visible, primary action reachable without scrolling past the keyboard.
- Text is at least 16 px in inputs (smaller makes iOS zoom in).
- Loading state appears within 100 ms; an error offers a retry.

## 11. Production on AWS (decision D-038 says AWS; how and when are open)

**What our code depends on that is Supabase-specific:** Supabase Auth (login, reset email, create/ban, forced-change flag); PostgREST (the HTTP layer behind `supabase-js`); `auth.uid()` and the `authenticated` role in every security rule; the `extensions` schema (0013), `auth.users` in seed/tests, `pg_cron`.

| Option | What it is | Code change | Effort and risk |
|---|---|---|---|
| **A. Supabase stack on AWS** | Amazon RDS Postgres plus the open-source Supabase pieces (PostgREST, GoTrue auth, gateway) in containers | None. Same `supabase-js`, same policies | Medium. You run and patch the containers and the email sender |
| **B. RDS plus PostgREST plus AWS Cognito** | Cognito replaces Supabase Auth; a small function maps its token to `auth.uid()` | Rewrite the auth layer: `lib/supabase/*`, `actions/auth`, user create/ban/reset, `middleware` | Medium-high. About a week; every login path re-tested |
| **C. Direct database connections** | Drop `supabase-js`; connect straight to Postgres and set the user per request | Rewrite the data layer everywhere | High. Not recommended |

**Recommendation:** decide by the end of Week 2. If AWS must be production on 20 Oct, choose **A**: it changes no application code, which is the safest way to ship in four weeks. If production can follow the first weeks of internal use, launch on the same stack you tested and do the move deliberately (B or A) with real data still absent. Managed RDS gives you the backups and recovery F-4 needs either way.

**Portability rules, starting now (they cost nothing):**
1. Keep all identity in `auth.uid()` and the role helpers; never read a Supabase-specific claim in policies.
2. Only `src/lib/supabase/*` creates a client; everywhere else imports only the `SupabaseClient` type (true today, checked 2026-09-25). The query-builder calls in `lib/*` keep working on any PostgREST-compatible host, which is why option A needs no code change.
3. Every migration is plain Postgres. Anything Supabase-specific (the `extensions` schema) is one clearly marked line, so the AWS variant is a one-line change.
4. Login, reset and user administration stay in `actions/auth.ts` and `lib/org/*`; screens never call the auth API.
5. Keep `db:test` and `db:bench` running against whichever database is current; they are the proof the move did not change behaviour.

## 10. Validation (skill checklist)
- [x] Each finding has a fix and a place in the plan.
- [x] Estimates carry units and assumptions (section 2).
- [x] Failure path stated per dependency: database down or paused (F-1, F-4), slow query (F-2), lost session (F-6).
- [x] Coverage sweep: media (none, deferred), IDs (UUIDs, fine), search (0013), logs and SLOs (F-2), background jobs (`pg_cron`, exists), counters (not needed at this rate).
- [ ] Not verified: real-phone behaviour, deployed timings, database size today. First two are Phase 1 and Phase 4; for the third run `select pg_size_pretty(pg_database_size(current_database()));` and paste the result.
