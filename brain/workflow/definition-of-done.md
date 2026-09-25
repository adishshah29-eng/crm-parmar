# Definition of done

A task is done when every line below is true. Not when it works on your machine.

## Every task

- [ ] Works for **every role that touches it** — not only the one you developed against
- [ ] If it reads or writes leads: tested as a caller, a manager, and an admin
- [ ] RLS proven **in both directions** — the right people can, the wrong people cannot
- [ ] Loading, empty, error and no-access states all exist
- [ ] Works at **375px and 768px** (phones are a primary device): no sideways page scroll, tap targets 44 px (shared controls do this), inputs at 16 px
- [ ] The route has a `loading.tsx`; errors are left to `app/(app)/error.tsx` (no blank fallbacks); `error.message` is never shown
- [ ] No TypeScript errors, no console errors
- [ ] Brain files updated in the same PR if behaviour or schema changed
- [ ] PR reviewed and approved by one other person
- [ ] Merged to `main`
- [ ] Logged in your `brain/team/<name>.md`

## If you added or changed a screen or query that lists, searches or counts

- [ ] Measured as a **manager and a caller** (not only admin) against the 20,000-lead database with `npm run db:bench`, before and after, numbers in the PR
- [ ] Within budget: **list 500 ms, detail 400 ms, search 600 ms, dashboard 800 ms** (p95)
- [ ] Paged on the server (`range()`); nothing fetches "all leads"; no join is an inner join unless you filter on it
- [ ] You can name the index that serves the sort and the filter
- [ ] Your screen's query is added to `supabase/tools/bench.ts`

## If you touched the database

- [ ] Change is a migration file, never a dashboard edit
- [ ] `brain/03-data-model.md` updated in the same commit
- [ ] New tables have RLS enabled **and** explicit policies **and** the `active_only` restrictive policy (see `0014`)
- [ ] Foreign keys you filter on are indexed
- [ ] Adish applied it and posted the confirmation

## If you touched an RLS policy

- [ ] All six access tests in `04-access-control.md` re-run
- [ ] Which tests you ran is written in the PR description
- [ ] No policy or helper is a function of the row id for the common case (use `(select ...)` and `exists`, see the playbook)
- [ ] `npm run db:test` all green, including check 15 (deactivated user locked out) and check 3 (no leak between territories)
- [ ] Adish specifically reviewed it

## If you touched the lead flow

- [ ] Working-hours maths uses `app.add_working_minutes` — no wall-clock arithmetic anywhere
- [ ] Tested with a lead created **after 19:30** (queues for 10:30) and one **during hours**
- [ ] Non-live leads confirmed not to escalate

## Not done

- "It works, I just haven't tested the manager view"
- "The RLS is there, I didn't check it blocks anything"
- "I'll update the brain file later"
- "It's on my branch"
- "It's fast on my machine" (the shared database has 20,000 leads; measure it)
- "I only tried it as admin"
- "It looks fine on my laptop" (open it at 375px)
