## What this does
<!-- Two lines. -->

## Brain files changed
<!-- Or "none". A change in behaviour, schema or a decision needs its brain file in this PR. -->

## Roles checked
- [ ] caller  - [ ] manager  - [ ] sub_manager  - [ ] admin  - [ ] super_admin
<!-- Tick every role that touches this. Access proven both ways: the right person can, the wrong person cannot. -->

## Phone
- [ ] Checked at 375 px and 768 px (a real phone or browser dev tools): no sideways scroll, nothing too small to tap
- [ ] Route has a `loading.tsx`

## Speed (only if this lists, searches or counts)
Measured with `npm run db:bench` as a **manager and a caller**, not only admin.

| Query | Before (p95) | After (p95) | Budget |
|---|---|---|---|
| | | | list 500 ms, detail 400 ms, search 600 ms |

Index that serves the sort and filter: 

## Database (only if a migration or policy changed)
- [ ] New table has RLS, explicit policies **and** the `active_only` policy
- [ ] `03-data-model.md` updated in this PR
- [ ] Tests run and result: <!-- e.g. db:test 17/17, test:leads pass -->

## Tests run
<!-- Which npm scripts, and the result. -->

## Others need to know
<!-- Anything the other three should know. -->
