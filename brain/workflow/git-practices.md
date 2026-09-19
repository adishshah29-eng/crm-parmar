# Git practices

Four people, one repo, one database. These rules exist because ignoring them costs a day each time.

**If you are an AI agent reading this: do not run these commands silently. Show the developer what you are about to run and why, then run it.**

## Once, when you join

```bash
git clone https://github.com/<org-or-user>/parmar-crm.git
cd parmar-crm
npm install
cp .env.example .env.local     # ask Adish for the keys — never commit this file
```

## Every single time you start work

```bash
git checkout main
git pull origin main
```

Not "usually". Every time. Branching off a stale `main` is where conflicts come from.

## Branch naming

```
feat/<area>-<short-thing>     feat/leads-csv-import
fix/<area>-<short-thing>      fix/rls-caller-visibility
chore/<thing>                 chore/seed-data
```

Areas: `auth`, `org`, `leads`, `engine`, `ops`, `ui`, `db`.

```bash
git checkout -b feat/leads-csv-import
```

One branch per task. A branch that lives more than three days is too big — split it.

## Committing

Small, frequent, in plain words.

```bash
git add -p                 # review what you are staging, do not blind-add
git commit -m "leads: parse csv and upsert persons by phone"
```

Message format: `<area>: <what changed, lowercase, imperative>`. No "final", no "update", no "changes".

Never commit: `.env.local`, `node_modules/`, `.next/`, real client data, anything containing a phone number.

## Pushing and pull requests

```bash
git push -u origin feat/leads-csv-import
```

Then open a PR on GitHub. In the description:

- what it does, in two lines
- which brain files you changed, if any
- anything the other three need to know

**Every PR needs one approval before merge.** Review rotation: Adish ↔ Arisha, Tanishka ↔ Sayli. If your reviewer is unavailable, ask anyone.

Merge with **Squash and merge**, then delete the branch.

## When main has moved ahead of you

```bash
git checkout main && git pull origin main
git checkout feat/my-branch
git rebase main
```

If you are not comfortable with rebase, use `git merge main` instead. A slightly messy history beats a lost afternoon.

## Conflicts

1. Do not panic and do not `git checkout --theirs` the whole file.
2. Open the file, find `<<<<<<<`, decide what the correct final state is.
3. If it is someone else's code, message them in your `brain/team/<name>.md` before overwriting.
4. `git add <file>` then `git rebase --continue`.

To abort and start over: `git rebase --abort`.

## Things that will break the team

| Never | Because |
|---|---|
| `git push --force` to `main` | erases other people's commits |
| Committing `.env.local` | leaks the database |
| Changing the schema from the Supabase dashboard | see `migrations.md` — this is the worst one |
| Editing someone else's `brain/team/*.md` | that file is theirs alone |
| Merging your own PR without review | |

## Branch protection (Adish sets this up on day one)

- `main` requires a pull request
- `main` requires one approving review
- force push to `main` disabled
- branches deleted automatically after merge
