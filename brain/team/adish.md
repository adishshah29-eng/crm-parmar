# Adish

**Owns:** Foundation, auth, org, migrations, shared core, admin console

This file belongs to Adish. Nobody else edits it. Everyone else reads it.

---

## Currently working on

Phase 0 — foundation. Next: Supabase project + migrations (runbook steps 5–9), then `actions/leads.ts`, `DataTable`, `LeadDetailShell`.

## Blocked

_(what is stopping you, and who can unblock it. Empty is good.)_

## Asking

_(questions for a specific person. Write their name first so they see it.)_

Example:
- **@adish** — migration 0004 is merged, can you apply it?

## Answering

_(replies to things other people asked you)_

## Notes for the team

_(anything the other three should know: a pattern you established, a gotcha you hit, a file you touched that they also use)_

---

## Log

Newest at the top. One entry per working session.

### 2026-09-19
- Unpacked the scaffold; created the Next.js 16 app, shadcn, all runbook dependencies. Builds clean.
- Built: Supabase clients, `src/proxy.ts` (session + login redirect + deactivated sign-out), login page and `signIn`/`signOut`/`requestPasswordReset`, app shell with role-aware nav, `StatusBadge`, the four states, `permissions.ts`, `format.ts`. See `brain/SHARED-CORE.md`.
- Fixed the scaffold: `seed.sql` now looks auth users up by email and assigns leads to callers; new migration `0004_caller_column_guard.sql` (callers could reassign their own leads); access test script rewritten to 14 checks that can't pass vacuously. Decisions D-018 to D-020.
- Next: GitHub repo + branch protection, Supabase project (Mumbai), apply migrations, load seed, run `npm run db:test`.
- **Not applied to any database yet** — 0004 and the new seed are untested against real Postgres.
