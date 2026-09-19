# System design

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript | Server Components by default |
| Database | Supabase Postgres, India region | Free tier, one project |
| Auth | Supabase Auth, email + password | No OAuth, no phone OTP |
| Access control | Postgres row-level security | Enforced in the database, not in React |
| UI | Tailwind CSS + shadcn/ui | |
| Background jobs | Supabase `pg_cron` + Postgres functions | SLA escalation, night-queue release |
| Hosting | Vercel | |
| Repo | One GitHub repo, private, collaborators | |

## The single most important rule

**Access control lives in the database.**

Supabase exposes Postgres over HTTP. Anyone holding the anon key can query any table directly, bypassing your React code entirely. If a caller's browser can only see their own leads because a `.filter()` runs in a component, the data is not protected — it is merely hidden.

Therefore:

- Every table has RLS enabled.
- Every table has explicit policies.
- The application uses the **anon key** only. The `service_role` key never appears in application code, never in a Next.js route handler, never in an environment variable that ships to the client.
- Permission logic lives in `SECURITY DEFINER` SQL functions, called from policies.

## Two independent access axes

This is the part people get wrong. Visibility is not one tree — it is two systems joined by OR.

**Axis 1 — hierarchy (supervision).** Who reports to whom. Stored as `users.parent_id` plus a closure table `user_hierarchy` for fast descendant lookups. A manager can see the leads of everyone below him, even outside his territory.

**Axis 2 — territory (coverage).** Which projects and locations a user covers. Stored in `user_scopes`. A manager sees every lead in his territory regardless of who owns it.

A manager's visible set = (leads in my territories) ∪ (leads owned by my descendants) ∪ (my own leads).

Sub_managers do not get their own `user_scopes` rows. They inherit their parent manager's scopes at query time.

Full detail in `04-access-control.md`.

## Two independent status fields

Also commonly confused. See `09-glossary.md`.

- `call_status` — what the caller picks after a call. `new | attempted | connected | lost`. Default `new`.
- `temperature` — `hot | warm | cold`. Only meaningful when `call_status = 'connected'`.
- `pipeline_stage` — where the deal is. Moves on events, not on dropdown choices. `enquiry | qualified | site_visit_scheduled | site_visit_done | negotiation | booked | dropped`.

A caller marking a lead `connected + hot` does not move the pipeline. Scheduling a site visit does.

## Identity model

- `persons` — one row per human being, keyed by phone number.
- `leads` — one row per (person, project). Unique constraint on `(person_id, project_id)`.

So one person enquiring about two projects produces two leads, possibly owned by two different callers — which is what the business wants. The `persons` row is what lets you pull up a buyer and see everything they have ever enquired about.

- `lead_sources` — many rows per lead. The same lead arriving from Meta and later from 99acres records two source rows on one lead. **Nothing is merged away and nothing is hidden.**

## Data flow

```
CSV upload
  → parse + validate
  → normalise phone to E.164
  → upsert person by phone
  → upsert lead by (person, project)   [existing lead gets a new lead_sources row]
  → resolve territory from project + location
  → working hours check
      inside  → round robin assign now
      outside → queue, next_call_at = next 10:30
  → SLA clock starts on assignment (working minutes only)
  → 45 working minutes untouched → notify manager + super_admin
```

Escalation notifies. It does **not** reassign. A human decides what to do.

## Availability and delegation

A manager sets himself `on_site_visit` and nominates a delegate (his sub_manager). From that moment **new** leads in his territory route to the delegate. Existing leads stay where they are. Entering a project geofence raises a prompt asking whether to switch — it never switches automatically.

## Background jobs

| Job | Schedule | What it does |
|---|---|---|
| `release_night_queue` | 10:30 IST daily | Assigns queued overnight leads, starts their SLA clocks |
| `check_sla_breaches` | every 5 min, working hours | Finds leads past `sla_due_at` with no activity, writes notifications |
| Supabase keepalive | every 3 days | GitHub Action pings the project so the free tier does not pause |

## Environments

Free tier allows 2 active projects total. We use **one**, shared by all four developers, holding mock data only.

Consequence, stated plainly: there is no staging and there are no backups. Real client leads must not be loaded until a separate production project exists on the Pro plan. See `08-decisions.md` D-009.
