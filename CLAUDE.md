# Parmar CRM — agent entry point

You are working on an in-house real estate CRM for Parmar Properties.

## Before you write any code

Read these, in this order, every session:

1. `brain/00-START-HERE.md` — rules for how you work in this repo
2. `brain/02-system-design.md` — the architecture
3. `brain/04-access-control.md` — who sees what (most dangerous area)
4. `brain/tasks/<your-name>-tasks.md` — the tickets you are working through
5. `brain/team/<your-name>.md` — current status and messages from the team

## Hard rules

- **Never invent schema.** If a table or column is not in `brain/03-data-model.md`, it does not exist. Ask.
- **Never change the database from the Supabase dashboard.** All schema changes are migration files in `supabase/migrations/`. See `brain/workflow/migrations.md`.
- **Never bypass row-level security.** No `service_role` key in application code. Ever.
- **Never guess business rules.** Working hours, SLA timings, role permissions and status values are all written down. If something is not written down, stop and ask the human — do not decide for them.
- **One feature branch per task.** See `brain/workflow/git-practices.md`. Always pull `main` before branching.

## When you finish a piece of work

Append a dated entry to `brain/team/<your-name>.md` under `## Log`. That file is how the other three developers know what happened.

## If you disagree with the brain

The brain is the source of truth. If you believe a document is wrong, say so to the human and propose the edit — do not silently build something different.

## Next.js version

This repo is on **Next.js 16**, which has breaking changes from older versions: `middleware.ts` is now `proxy.ts`, `cookies()` and `searchParams` are async, and some shadcn components were renamed. Before writing framework code, read the relevant guide in `node_modules/next/dist/docs/`.
