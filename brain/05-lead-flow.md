# Lead flow

## Working hours

**10:30 – 19:30 IST, every user, every day.** Single source of truth: `app.WORKING_START = 10:30`, `app.WORKING_END = 19:30`, timezone `Asia/Kolkata`. Never hardcode these anywhere else.

All SLA arithmetic is in **working minutes**. A lead assigned at 19:15 with a 45-minute SLA is due at **10:00 the next morning… no** — it is due 45 working minutes after 19:15, which is 10:30 + 30 = **11:00 next day**. 15 minutes are consumed before close, 30 remain.

Helper: `app.add_working_minutes(from_ts, minutes)`. Every SLA calculation calls it. No exceptions.

## Ingestion (CSV, v1)

1. Admin or super_admin uploads a CSV. An `imports` row is created.
2. For each row: normalise the phone to E.164 (`+91` default). Reject rows with no valid phone.
3. Upsert `persons` by phone. Existing person → reuse, update blank name/email only.
4. Resolve project by name. Unknown project → row goes to the error report, never silently created.
5. Upsert `leads` by `(person_id, project_id)`:
   - **New pair** → insert lead, `call_status='new'`, `pipeline_stage='enquiry'`.
   - **Existing pair** → do **not** create a second lead and do **not** change its owner. Add a `lead_sources` row only.
6. Always insert a `lead_sources` row with source, campaign, received_at, raw payload.
7. New leads from a source with `is_live = true` get `is_live = true` and enter routing. Non-live leads are created unassigned for manual assignment.
8. Import summary shows inserted / duplicates / errors, and the error rows are downloadable.

**Duplicate rule, stated plainly:** same phone + same project = one lead, two source rows, original owner keeps it. Same phone + different project = two separate leads, possibly two different owners. Nothing is hidden or merged away — the lead detail page shows every source it ever arrived from.

## Routing

```
lead created (is_live)
  → resolve territory: project_id, and location_id from the project
  → find candidate managers: user_scopes matching project OR location
  → for each manager, resolve the effective owner:
        availability = on_site_visit  → his delegate (sub_manager)
        availability = off            → skip this manager
        otherwise                     → the manager
  → collect callers under the effective owners who are
        is_active AND checked in today AND availability = available
  → round robin over that candidate list, ordered by user id
  → if the candidate list is empty → leave unassigned, notify super_admin
```

`round_robin_state` holds the last-assigned user per scope key, so rotation survives restarts and does not restart from the top on every assignment.

### Outside working hours

A live lead arriving between 19:30 and 10:30 is **not** assigned on arrival. It is stored unassigned with `next_call_at` = the next 10:30. The `release_night_queue` job runs at 10:30, assigns the whole queue through the same round robin, and starts the SLA clocks then.

This is deliberate: assigning at 02:00 would breach the SLA before anyone could work it.

## The 45-minute rule

Applies to **live leads only** — Meta, 99acres, MagicBricks, Housing, other listing agents. Walk-ins and referrals never escalate.

- On assignment, `sla_due_at = app.add_working_minutes(assigned_at, 45)`.
- Any `lead_activities` row for that lead clears the obligation — set `first_touch_at` and stop tracking.
- `check_sla_breaches` runs every 5 minutes during working hours. For each lead with `sla_due_at < now()`, `first_touch_at is null`, `sla_breached_at is null`: set `sla_breached_at`, insert notifications for **the owner's manager and the super_admin**.
- Escalation **notifies only**. It never reassigns. A human decides.
- One notification per lead. Never re-notify the same breach.

## Caller's working loop

The caller opens a lead and picks a `call_status`:

| Choice | Then what |
|---|---|
| `attempted` | Remark optional. **`next_call_at` mandatory.** |
| `connected` | **`temperature` mandatory** (hot/warm/cold). Remark mandatory. `next_call_at` mandatory unless the stage moves to booked or dropped. |
| `lost` | Reason remark mandatory. `renurture_at` defaults to +6 months, editable. |

Every one of these writes a `lead_activities` row. The remark field on the lead is never overwritten — history is append-only.

## Pipeline stage

Moves on events, not dropdown choices:

| Event | Stage becomes |
|---|---|
| Lead created | `enquiry` |
| Caller marks connected + hot/warm | `qualified` |
| Site visit created | `site_visit_scheduled` |
| Site visit marked done | `site_visit_done` |
| Manager moves it manually | `negotiation` |
| Manager marks booked | `booked` (terminal) |
| Caller marks lost | `dropped` (terminal) |

## Lost and re-nurture

A lost lead keeps `assigned_to`. `renurture_at` defaults to six months out. A daily job surfaces due leads back on the **same caller's** list with `call_status` reset to `new` and a banner showing the earlier history. If that caller has left, it goes to whoever now holds the territory.

## Availability and delegation

- Manager sets `on_site_visit` and picks a delegate from his own sub_managers. Delegate is required.
- Only **new** leads route to the delegate. Existing ownership never changes on its own.
- Entering a project geofence raises a prompt — "Start site visit mode?" — and the manager confirms. GPS alone never flips it.
- Setting back to `available` restores normal routing immediately.

## Site visits

Created from a lead. Captures project, scheduled time, who is accompanying. On arrival the accompanying user checks in; the app compares the GPS fix against the project's `geofences` row and stores `within_geofence`. A visit can still be marked done outside the fence — the flag records it, it does not block.

Managers can create, edit and complete visits for any lead in their territory, not only their own.

## Reassignment on exit

When a user is deactivated, their open leads transfer to the person who now holds the territory — **not** to the user who replaced them personally. Every transfer writes an `assignments` row with `reason='exit_transfer'`.
