# Glossary

Words we use, and exactly what they mean. When two people mean different things by the same word, bugs follow.

**person** — a human being, identified by phone number. One row in `persons`. Mr. Shah is one person forever.

**lead** — one person's interest in one project. Mr. Shah enquiring about Bellevue and Aureus is **two leads**, one person. Unique on `(person_id, project_id)`.

**call_status** — what the caller picks after a call. `new` (default, untouched) · `attempted` (tried, no answer) · `connected` (spoke) · `lost` (not interested). Four options, a dropdown.

**temperature** — `hot` / `warm` / `cold`. Only set when `call_status = 'connected'`. It is *not* a fifth call status.

**pipeline_stage** — how close the deal is to money. `enquiry → qualified → site_visit_scheduled → site_visit_done → negotiation → booked | dropped`. Moves on events, never by a caller picking from a dropdown. Marking a lead connected+hot does not move it; booking a site visit does.

> The distinction in one line: **call_status = did we reach him. pipeline_stage = how close is the money.** Caller screens use status. Dashboards use stage.

**live lead** — a lead from Meta, 99acres, MagicBricks, Housing or a listing agent. Only these are subject to the 45-minute rule. Walk-ins and referrals are not live.

**territory** — a project, a location, or both, that a manager covers. Stored in `user_scopes`. Two managers may share one.

**scope owner** — the manager whose territory applies to you. Managers are their own. Sub_managers and callers resolve upward to the nearest manager.

**descendant** — anyone at or below you in the hierarchy, including yourself. From `user_hierarchy`.

**effective owner** — who actually receives new leads for a territory right now. Normally the manager; his delegate while he is `on_site_visit`; nobody while he is `off`.

**delegation** — a manager marking himself `on_site_visit` and naming a sub_manager. Only **new** leads route to the delegate. Existing ownership never moves on its own.

**working minutes** — elapsed time counted only between 10:30 and 19:30 IST. All SLA maths uses these, never wall-clock minutes.

**night queue** — live leads that arrived after 19:30. Held unassigned until 10:30, then assigned and their SLA clocks started.

**SLA breach** — a live lead assigned and left with no activity for 45 working minutes. Notifies the manager and super_admin. Does not reassign.

**first touch** — the first `lead_activities` row on a lead. Stops the SLA clock.

**re-nurture** — a lost lead waking up later (default six months) on the same caller's list, with its old history visible.

**round robin** — rotation across checked-in, available callers under the effective owners of a territory. Position is remembered in `round_robin_state`, so it does not restart from the top each time.

**escalation** — a notification, not a reassignment. Always.

**brain** — the `brain/` folder. The project's source of truth. Code that disagrees with it is a bug in the code.
