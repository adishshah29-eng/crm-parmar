# Parmar CRM

In-house real estate CRM for Parmar Properties — South Mumbai and Pune.

**Read `brain/00-START-HERE.md` first.** Everything about this project is
documented in `brain/`, which is the source of truth for humans and AI agents alike.

## Quick start

```bash
git clone <repo-url> && cd parmar-crm
npm install
cp .env.example .env.local     # keys from Adish
npm run dev
npm run db:test                # access tests; needs the seed loaded
```

## Layout

| Path | What |
|---|---|
| `brain/` | The project's documented truth — architecture, rules, plan |
| `brain/team/` | One status/log file per developer |
| `brain/workflow/` | Git, migrations, definition of done |
| `supabase/migrations/` | Every schema change, in order |
| `supabase/seed.sql` | Shared mock dataset |
| `src/` | Application code, organised by feature |

## Team

Adish (foundation, auth, org, migrations) · Arisha (leads) ·
Tanishka (engine) · Sayli (ops and insight)

## Ground rules

1. Pull `main` before you branch.
2. Schema changes are migration files, applied by Adish. Never the dashboard.
3. Access control lives in Postgres RLS, never in React.
4. Update the brain in the same PR as the behaviour change.
5. Mock data only until a production project exists on the Pro plan.
