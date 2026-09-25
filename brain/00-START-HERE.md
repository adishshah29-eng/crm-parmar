# Start here

This folder is the brain of the project. Everything an AI agent or a new developer needs to know is written down here, so nobody has to guess and nobody invents their own version of the truth.

## Read order

| File | What it answers |
|---|---|
| `01-product.md` | What are we building and for whom |
| `02-system-design.md` | How the system is put together |
| `03-data-model.md` | Every table and column |
| `04-access-control.md` | Who can see and do what |
| `05-lead-flow.md` | How a lead travels through the system |
| `06-api-contracts.md` | Server action signatures |
| `07-ui-conventions.md` | Component patterns, naming, styling |
| `08-decisions.md` | Decisions already made, and why |
| `09-glossary.md` | Words we use and exactly what they mean |
| `10-performance.md` | What is slow, why, and the order to fix it in at 20,000 leads |
| `SHARED-CORE.md` | What the shared core already provides, and the contracts for what is still coming |
| `IMPLEMENTATION-PLAN.md` | Who builds what, in which week |
| `PHASE-0-RUNBOOK.md` | Adish's step-by-step setup, blocks everyone |
| `tasks/<name>-tasks.md` | Your ticket-level backlog |
| `workflow/team-playbook.md` | **Start here if you are building a portal:** setup, the daily loop, the per-task loop, traps already hit, and your first days |
| `workflow/git-practices.md` | How to branch, commit, push, review |
| `workflow/migrations.md` | How to change the database safely |
| `workflow/definition-of-done.md` | When a task is actually finished |
| `team/<name>.md` | Each developer's status, log, and messages |

## Rules for agents

1. **The brain is the truth.** Code disagreeing with the brain is a bug in the code.
2. **Do not hallucinate structure.** No table, column, role, status value or endpoint exists unless this folder says it does.
3. **Do not decide business rules.** Timings, permissions, statuses and hierarchy rules are decisions the humans made. Look them up. If missing, ask.
4. **Update the brain when the design changes.** A design change is not done until the brain file is updated in the same pull request.
5. **Append to `08-decisions.md`, never rewrite it.** It is a history, not a summary.

## Rules for humans

1. If you change something in the brain, say so in your `team/<name>.md` file so the other three see it.
2. If you are blocked, write it under `## Blocked` in your own file and tag the person you need in `## Asking`.
3. Read all four `team/` files at the start of your working day. It takes two minutes and prevents most duplicate work.

## The one file you own

You edit `brain/team/<your-name>.md` and nobody else does. Everyone reads all four. This is deliberate — it means four people can report status in one repo without ever hitting a merge conflict.
