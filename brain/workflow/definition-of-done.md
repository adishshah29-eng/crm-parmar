# Definition of done

A task is done when every line below is true. Not when it works on your machine.

## Every task

- [ ] Works for **every role that touches it** — not only the one you developed against
- [ ] If it reads or writes leads: tested as a caller, a manager, and an admin
- [ ] RLS proven **in both directions** — the right people can, the wrong people cannot
- [ ] Loading, empty, error and no-access states all exist
- [ ] Works at 375px width if it is a lead screen
- [ ] No TypeScript errors, no console errors
- [ ] Brain files updated in the same PR if behaviour or schema changed
- [ ] PR reviewed and approved by one other person
- [ ] Merged to `main`
- [ ] Logged in your `brain/team/<name>.md`

## If you touched the database

- [ ] Change is a migration file, never a dashboard edit
- [ ] `brain/03-data-model.md` updated in the same commit
- [ ] New tables have RLS enabled **and** explicit policies
- [ ] Foreign keys you filter on are indexed
- [ ] Adish applied it and posted the confirmation

## If you touched an RLS policy

- [ ] All six access tests in `04-access-control.md` re-run
- [ ] Which tests you ran is written in the PR description
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
