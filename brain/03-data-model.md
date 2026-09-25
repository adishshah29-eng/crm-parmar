# Data model

Authoritative list of tables. Canonical DDL is `supabase/migrations/0001_init.sql`. If code and this file disagree, this file wins and the code is a bug.

Conventions: `uuid` primary keys with `gen_random_uuid()`, `timestamptz` for all times stored in UTC, snake_case names, every table has `created_at`.

## Organisation

### `users`
Mirrors `auth.users`. `id` is the same uuid as the Supabase auth user.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | = `auth.users.id` |
| full_name | text | |
| email | text unique | |
| phone | text | |
| role | user_role | `super_admin \| admin \| manager \| sub_manager \| caller` |
| parent_id | uuid → users | null for super_admin |
| is_active | boolean | soft deactivate, never delete a user |
| created_at | timestamptz | |

### `user_hierarchy` (closure table)
Every ancestor→descendant pair, including self at depth 0. Maintained by trigger on `users`.

| ancestor_id | uuid → users |
| descendant_id | uuid → users |
| depth | int |

PK `(ancestor_id, descendant_id)`.

### `locations`
| id | uuid PK |
| name | text | e.g. Worli, Koregaon Park |
| city | text | Mumbai \| Pune |

### `projects`
| id | uuid PK |
| name | text |
| location_id | uuid → locations |
| developer | text |
| is_active | boolean |

### `user_scopes`
A user's territory. One row per project or location covered. **Only managers get rows here.** Sub_managers and callers inherit through `parent_id` at query time.

| id | uuid PK |
| user_id | uuid → users |
| project_id | uuid → projects | nullable |
| location_id | uuid → locations | nullable |

Exactly one of `project_id` / `location_id` must be non-null (CHECK constraint).

### `user_availability`
| user_id | uuid PK → users |
| status | availability_status | `available \| on_site_visit \| off` |
| delegate_to | uuid → users | nullable; required when `on_site_visit` |
| updated_at | timestamptz |

## Leads

### `persons`
One row per human. **Phone is the identity.**

| id | uuid PK |
| phone | text unique | E.164, e.g. `+919876543210` |
| full_name | text |
| email | text |
| created_at | timestamptz |

### `leads`
One row per (person, project).

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| person_id | uuid → persons | |
| project_id | uuid → projects | |
| location_id | uuid → locations | denormalised from project for fast territory checks |
| assigned_to | uuid → users | nullable while queued |
| call_status | call_status | default `new` |
| temperature | temperature | nullable; only when `call_status='connected'` |
| pipeline_stage | pipeline_stage | default `enquiry` |
| is_live | boolean | true for Meta/99acres/portal leads — only these escalate |
| assigned_at | timestamptz | |
| first_touch_at | timestamptz | set once, on first activity |
| last_activity_at | timestamptz | |
| next_call_at | timestamptz | mandatory when status set to attempted/connected |
| sla_due_at | timestamptz | assignment + 45 working minutes |
| sla_breached_at | timestamptz | set by the escalation job |
| renurture_at | timestamptz | set when lost; wakes the lead later |
| budget_min / budget_max | numeric | nullable |
| notes | text | |
| created_at | timestamptz | |

**UNIQUE `(person_id, project_id)`.** This is the rule that makes "1 lead = 1 person per project" real.

### `sources`
| id | uuid PK |
| code | text unique | `meta`, `99acres`, `magicbricks`, `housing`, `agent`, `walkin`, `referral` |
| name | text |
| is_live | boolean | live sources trigger the 45-minute SLA |

### `lead_sources`
Many per lead. Nothing is merged away.

| id | uuid PK |
| lead_id | uuid → leads |
| source_id | uuid → sources |
| received_at | timestamptz |
| campaign | text |
| raw_payload | jsonb |

### `lead_activities`
Append-only. Never updated, never deleted.

| id | uuid PK |
| lead_id | uuid → leads |
| user_id | uuid → users |
| activity_type | text | `call \| remark \| status_change \| stage_change \| assignment \| site_visit` |
| remark | text |
| from_value / to_value | text |
| created_at | timestamptz |

### `assignments`
Full ownership history.

| id | uuid PK |
| lead_id | uuid → leads |
| from_user_id | uuid → users | nullable |
| to_user_id | uuid → users |
| reason | text | `round_robin \| manual \| escalation \| delegation \| exit_transfer \| import` |
| created_by | uuid → users |
| created_at | timestamptz |

### `round_robin_state`
| scope_key | text PK | `project:<uuid>` or `location:<uuid>` |
| last_user_id | uuid → users |
| updated_at | timestamptz |

## Operations

### `site_visits`
| id | uuid PK |
| lead_id | uuid → leads |
| project_id | uuid → projects |
| scheduled_at | timestamptz |
| accompanied_by | uuid → users |
| status | visit_status | `scheduled \| done \| no_show \| cancelled` |
| outcome | text |
| remark | text |
| checkin_at | timestamptz |
| checkin_lat / checkin_lng | double precision |
| within_geofence | boolean |
| created_by | uuid → users |

### `attendance`
| id | uuid PK |
| user_id | uuid → users |
| work_date | date |
| check_in_at / check_out_at | timestamptz |
| check_in_lat / check_in_lng | double precision |
| check_out_lat / check_out_lng | double precision |

UNIQUE `(user_id, work_date)`.

### `geofences`
| id | uuid PK |
| project_id | uuid → projects |
| lat / lng | double precision |
| radius_m | int | default 200 |

### `notifications`
| id | uuid PK |
| user_id | uuid → users |
| type | text | `sla_breach \| assignment \| mention` |
| lead_id | uuid → leads |
| title / body | text |
| is_read | boolean |
| created_at | timestamptz |

### `audit_log`
| id | uuid PK |
| actor_id | uuid → users |
| action | text | `view_lead \| edit_lead \| reassign \| export \| login \| user_create \| user_update \| user_reactivate \| user_deactivate \| scope_change \| project_create \| project_update \| location_create \| location_update \| import \| password_force_reset \| password_change` (plain text, so new actions need no migration) |
| entity_type / entity_id | text / uuid |
| meta | jsonb |
| created_at | timestamptz |

Every export writes a row here with the row count and filter used.

### `imports`
| id | uuid PK |
| uploaded_by | uuid → users |
| filename | text |
| total_rows / inserted / duplicates / errors | int |
| error_report | jsonb |
| created_at | timestamptz |

## Enums

```
user_role:        super_admin, admin, manager, sub_manager, caller
call_status:      new, attempted, connected, lost
temperature:      hot, warm, cold
pipeline_stage:   enquiry, qualified, site_visit_scheduled, site_visit_done,
                  negotiation, booked, dropped
availability_status: available, on_site_visit, off
visit_status:     scheduled, done, no_show, cancelled
```

## Functions exposed through the API

| Function | Migration | What |
|---|---|---|
| `public.lead_counts_by_owner()` | 0005 | `(owner_id, total, open)` per lead owner. SECURITY INVOKER, so RLS decides which leads are counted. "Open" = stage is not `booked` or `dropped`. Authenticated users only |
| `public.set_user_scopes(user, projects[], locations[])` | 0007, fixed in 0009 | Replaces a manager's whole territory in one transaction. SECURITY DEFINER; its first statement refuses everyone but the super_admin (that check is the permission boundary) |
| `public.move_leads(moves jsonb, reason, restart_sla)` | 0007 | Moves leads between owners in one transaction, writing `assignments` and a notification per move. Admins for manual/escalation, super_admin for exit_transfer |
| `public.import_leads_batch(import, source, campaign, rows jsonb)` | 0008 | Applies the ingestion rules of `05-lead-flow.md` to up to 500 rows in one transaction, each row in its own subtransaction so one bad row is an error and never poisons the batch. Updates the `imports` counters and `error_report`. Admins only |
| `public.dashboard_counts(range)` | 0010 | jsonb of the dashboard numbers (`total_leads`, `untouched`, `escalations_today`, `unassigned`, `unassigned_live`, `site_visits_week`). SECURITY INVOKER, so RLS decides what each role counts. `range` = `today` or `all` and changes ONLY `total_leads` (D-035) |
| `public.dashboard_portfolios(range)` | 0010 | jsonb array, one entry per ACTIVE manager the caller may see: leads owned by them or anyone below them (split by stage), untouched, callers, visits booked. SECURITY INVOKER |

Trigger `projects_sync_lead_location` (0007): when `projects.location_id` changes, every lead of that project gets the new `location_id`.

## Access rules added after the first RLS migration (0011-0015)

| What | Migration | Behaviour |
|---|---|---|
| Policy `leads_select` | 0011 | Same visibility as `app.can_read_lead()`, written inline with `(select ...)` so it is evaluated once per query, not per row. Scope branches are guarded by `my_role() is distinct from 'caller'` |
| Policies `persons_select`, `lead_sources_select`, `activities_select`, `assignments_select` | 0011, 0012 | A row is visible if you are an admin, or if you can see its lead (`EXISTS` on `leads`, so RLS applies inside it) |
| Indexes `leads(created_at desc, id)`, `leads(person_id)`, `persons` trigram on `phone` and `full_name` | 0011, 0012, 0013 | List order, joins, and `ilike '%x%'` search. 0013 uses `pg_trgm` in the `extensions` schema |
| `app.is_active_user()` and restrictive policy `active_only` on EVERY table | 0014 | An inactive user gets no rows and no writes, instantly, whatever their token says. `users` lets them read only their own row, for the proxy. `app.my_role()`, `is_admin()`, `is_super()` return nothing for an inactive user. **Every new table must add `active_only`** |
| Trigger `audit_view_once_per_day` on `audit_log` (function `app.audit_view_once_per_day`), index `audit_log_view_lead_idx` | 0015 | Drops a `view_lead` row if the same person already viewed the same lead on the same IST day. Other actions untouched |
| Policies `persons_write`, `audit_select`, `visits_select`, `visits_write`, `attendance_select`, `attendance_write`, `notif_select`, `notif_update` | 0016 | Same access as before, rewritten with `(select ...)` so the admin and `auth.uid()` checks run once per query instead of once per row. A FOR ALL policy also filters reads (D-041) |
