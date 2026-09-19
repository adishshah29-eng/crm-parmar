# Phase 0 runbook — Adish

Sat 20 Sep → Thu 25 Sep. Follow in order. Nobody else starts until step 12 passes.

> **Status 2026-09-19 — steps 4 and 10–11 are already done in code.** The Next.js app, shadcn, dependencies,
> Supabase clients, `src/proxy.ts`, login page, app shell and shared libs are in the repo and build clean.
> What is left for you is everything that needs an account: GitHub (steps 1–3), Supabase (5–9), then
> run the gate (12). See `brain/SHARED-CORE.md` for what exists and what is still to build.

Post progress in `brain/team/adish.md` at the end of each day so the other three can see whether the gate is on track.

---

## Day 1 (Sat 20 Sep) — repo and skeleton

### 1. Create the repo

On GitHub: new **private** repo named `parmar-crm`. Do not initialise with a README — the scaffold has one.

```bash
cd ~/projects
unzip parmar-crm-scaffold.zip
cd parmar-crm
git init
git add .
git commit -m "chore: brain, migrations and workflow scaffold"
git branch -M main
git remote add origin https://github.com/<you>/parmar-crm.git
git push -u origin main
```

### 2. Add collaborators

Settings → Collaborators → add Arisha, Tanishka, Sayli with **Write** access.

### 3. Protect main

Settings → Rules → New branch ruleset, target `main`:
- Require a pull request before merging, 1 approval
- Block force pushes
- Settings → General → Automatically delete head branches: on

### 4. Scaffold Next.js into the existing folder

```bash
npx create-next-app@latest . --typescript --tailwind --app --src-dir --eslint --import-alias "@/*"
```

Say **no** to overwriting when it asks — the scaffold files stay.

```bash
npx shadcn@latest init
npx shadcn@latest add button input label select table dialog dropdown-menu badge card tabs toast form textarea checkbox popover calendar skeleton alert
npm i @supabase/supabase-js @supabase/ssr zod react-hook-form @hookform/resolvers date-fns libphonenumber-js papaparse
npm i -D supabase
```

Commit on a branch, PR, merge. From here on everything goes through a PR — including yours.

---

## Day 2 (Sun 21 Sep) — database

### 5. Create the Supabase project

supabase.com → New project.

- Name `parmar-crm`
- Region **South Asia (Mumbai) ap-south-1** ← cannot be changed later, get it right
- Strong database password, save it in your password manager

### 6. Link and push migrations

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

This applies `0001_init.sql`, `0002_rls.sql`, `0003_routing_and_jobs.sql` and `0004_caller_column_guard.sql` in order.

Verify in the dashboard: Table Editor should show 19 tables, and each should show **RLS enabled**. If any table says RLS disabled, stop and fix it before continuing — that table is readable by every logged-in user.

### 7. Enable pg_cron and schedule the jobs

Dashboard → Database → Extensions → enable `pg_cron`.

Then in the SQL editor, once (this is the only exception to the never-touch-the-dashboard rule, because cron schedules are not schema):

```sql
select cron.schedule('release-night-queue', '0 5 * * *',   $$select app.release_night_queue()$$);
select cron.schedule('check-sla',           '*/5 * * * *', $$select app.check_sla_breaches()$$);
```

05:00 UTC = 10:30 IST. Confirm with `select * from cron.job;`.

### 8. Create the eight test auth users

Dashboard → Authentication → Users → Add user, **auto-confirm** each:

| Email | Password |
|---|---|
| super@parmar.test | Test@12345 |
| admin1@parmar.test | Test@12345 |
| mgr.worli@parmar.test | Test@12345 |
| mgr.pune@parmar.test | Test@12345 |
| sub.worli@parmar.test | Test@12345 |
| caller1@parmar.test | Test@12345 |
| caller2@parmar.test | Test@12345 |
| caller3@parmar.test | Test@12345 |

Then run the whole of `supabase/seed.sql` in the SQL editor. It looks the auth uuids up by email — nothing to paste —
and fails with a clear message if any of the eight auth users is missing. It also assigns leads to callers, which the
access tests depend on.

Sanity check:

```sql
select count(*) from public.users;          -- 8
select count(*) from public.leads;          -- 42
select count(*) from public.user_hierarchy; -- 27 (trigger built this)
select count(*) from public.leads where assigned_to is not null; -- > 0 (callers must own leads)
```

If `user_hierarchy` is empty, the trigger did not fire — run `select app.rebuild_hierarchy();`.

### 9. Keys and keepalive

```bash
cp .env.example .env.local
```

Fill in the URL and anon key from Settings → API. Share with the other three over a private channel, never in the repo.

GitHub → Settings → Secrets → Actions → add `SUPABASE_URL` and `SUPABASE_ANON_KEY`. Then Actions tab → Supabase keepalive → Run workflow. It must return HTTP 200.

---

## Day 3 (Mon 22 Sep) — auth

### 10. Supabase clients and types  ✅ clients done

`src/lib/supabase/server.ts`, `client.ts` and `proxy.ts` exist, using `@supabase/ssr`. The server client reads cookies so RLS sees the real user. **No service-role client anywhere in `src/`.** Still to do: run `npm run db:types` after the migrations are applied.

Add to `package.json`:

```json
"db:types": "supabase gen types typescript --linked > src/types/database.ts"
```

```bash
npm run db:types
```

### 11. Login and route protection

- `src/app/(auth)/login/page.tsx` — email + password form
- `src/proxy.ts` — **Next.js 16 renamed `middleware.ts` to `proxy.ts`.** Unauthenticated requests redirect to `/login`; deactivated users are signed out (✅ done)
- `src/app/(app)/layout.tsx` — loads the current user's row from `public.users`, puts role in context
- Sign-in writes an `audit_log` row with `action='login'`
- A deactivated user (`is_active = false`) is signed out immediately

Test all eight logins.

---

## Day 4–5 (Tue 23 – Wed 24 Sep) — the gate

### 12. Run the access tests

This is the real Phase 0 deliverable. Everything else is plumbing.

```bash
# from the repo root, with .env.local filled in
node supabase/tests/run-access-tests.mjs
```

All fourteen must pass (tests 1–6 are the six in `04-access-control.md`; 7–14 are extras that also prove the negative case). The script signs in as real users and queries through the anon key — exactly as an attacker would.

If a test fails, fix the policy in a new migration (`0005_fix_...`), never by editing `0002_rls.sql`.

### 13. Buffer day (Thu 25 Sep)

Something will have gone wrong. This day absorbs it.

---

## Gate — Thursday 25 Sep, evening

Call the other three. On a screen share:

1. Each of them clones, installs, fills `.env.local`, runs `npm run dev`
2. Each logs in as `caller1@parmar.test` and confirms they see **only that caller's leads**
3. You run the access test script live; all six pass
4. You post in `brain/team/adish.md`: "Phase 0 complete, Week 1 open"

Only then does Week 1 start.

---

## If you are running late

Drop in this order — these are recoverable later:

1. pg_cron scheduling (run the functions manually meanwhile)
2. Keepalive action (the database won't pause while four people use it daily)
3. Password reset flow

**Never drop:** the India region, RLS on every table, or the six access tests. Those three are not recoverable later without a rebuild.
