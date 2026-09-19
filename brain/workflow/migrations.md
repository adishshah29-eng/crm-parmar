# Database migrations

Four developers share one Supabase project. This is the single biggest risk in the whole build, and this file is how we survive it.

## The rule

**Nobody changes the database from the Supabase dashboard. Ever.**

Not the table editor. Not the SQL editor. Not "just adding one column quickly."

Why: a dashboard change exists only in that one live database. It is not in git, the other three cannot see it, it cannot be reviewed, it cannot be rolled back, and it cannot be recreated when you eventually need a second project for production. Two weeks of dashboard edits and nobody knows what the schema actually is any more.

Every schema change is a numbered `.sql` file in `supabase/migrations/`, committed to git, reviewed in a PR.

## Who may apply migrations

**Adish only.** He owns the schema. Anyone can *write* a migration; only he applies it and only after the PR is merged.

## How to add a migration

```bash
git checkout main && git pull origin main
git checkout -b db/add-lead-budget-fields
```

Create `supabase/migrations/0004_add_lead_budget_fields.sql`. Numbering is sequential — check the folder first, and if someone else took your number, renumber yours rather than arguing about it.

Write forward-only SQL:

```sql
-- 0004_add_lead_budget_fields.sql
alter table public.leads add column if not exists possession_pref text;
```

Then:
1. Update `brain/03-data-model.md` **in the same commit**. A migration without the doc change does not get approved.
2. Open the PR, get it reviewed, merge.
3. Tell Adish in your `brain/team/<name>.md`. He applies it and notes it in his own file.

## Applying (Adish)

```bash
npx supabase db push
```

Then post in `brain/team/adish.md`: which migration, applied when. That line is how the other three know their local types are stale.

## After a migration lands

Everyone else:

```bash
git pull origin main
npm run db:types     # regenerates src/types/database.ts
```

Stale generated types are the most common "it works on my machine" cause in this project.

## Rules for writing migrations

- **Forward only.** Never edit an already-applied migration file. If `0003` was wrong, fix it in `0005`.
- **Additive first.** Add a column, backfill, then drop the old one in a later migration — not all at once.
- **`if not exists` / `if exists`** so re-running is safe.
- **RLS on every new table, in the same migration.** A table shipped without policies is readable by every authenticated user. This is not theoretical — it is the default.
- **Index every foreign key** you will filter or join on.
- **Never `drop table`** without asking the whole team.

## Changing an RLS policy

Higher risk than a schema change. On top of the above:

1. State in the PR which of the six access tests in `brain/04-access-control.md` you re-ran.
2. Get the review from Adish specifically, not just anyone.
3. Prove both directions — that the right people can see it *and* the wrong people cannot.

## Seed data

`supabase/seed.sql` holds the shared mock dataset. It is the same for all four of you, so a bug someone reports is reproducible on your machine.

To reset to a known state:

```bash
npx supabase db reset    # local only — never against the shared project
```

If you need new mock rows, add them to `seed.sql` in a PR so everyone gets them. Do not insert one-off test rows into the shared project — they show up in everyone else's screenshots.
