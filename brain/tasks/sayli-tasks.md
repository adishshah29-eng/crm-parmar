# Sayli — task backlog

**Portal:** Not a portal. Attendance, geofencing and site visits — things every role touches, owned in one place so three portals do not each build their own.

Blocked on Adish's shared core.

> **Changed 2026-09-20 (D-034): the company dashboard moved to Adish.** Tasks D1.1, D1.2, D1.3, D2.3 and D2.4 are no longer yours; they are in `adish-tasks.md` under "Dashboards". Your Week 1 was entirely the dashboard, so it is now free: **your first task is attendance (D2.1, D2.2)**, ahead of the Week 2 date. It feeds lead routing, so it is the most useful thing to have early. Adish builds the dashboards during the prep week, before your work starts.

---

## Week 1 (26 Sep – 2 Oct) — attendance (was the dashboard)

Start with D2.1 and D2.2 below. Nothing else is assigned to this week.

---

## Week 2 (3 – 9 Oct) — attendance

### D2.1 — Check in / out · `actions/ops.ts`
Browser geolocation with the timestamp. One row per person per day — the unique constraint exists, so handle the repeat gracefully rather than showing a Postgres error.

> **Attendance feeds lead routing.** A caller who has not checked in is skipped when leads are distributed. Say this on the screen, or people will wonder why they are getting no work.

### D2.2 — Attendance views
Own for everyone, team for managers and sub_managers, everything for admins. RLS scopes it — do not filter by role in the query.

---

## Week 3 (10 – 16 Oct) — geofencing and site visits

### D3.1 — Geofence management
Super_admin sets latitude, longitude and radius per project. A small map picker if time allows; two number fields if not. Haversine distance is plenty — no PostGIS at this scale.

### D3.2 — Site visit mode prompt
When a manager's device is inside a project's radius: *"You're at Raheja Imperia. Start site visit mode?"* with their delegate pre-filled.

**It prompts. It never switches by itself** (D-015). Location drifts and people forget to check out.

### D3.3 — Create a site visit
From a lead: project, date and time, who accompanies. Moves the lead to `site_visit_scheduled`.

Managers create visits for **any lead in their territory**, not only their own — Gautam was explicit: "manager also update — all".

### D3.4 — Arrival check-in
Compares the GPS fix to the project geofence, stores `within_geofence`.

A visit can still be completed from outside the radius. The flag **records** the fact; it does not block. Someone standing across the road is not committing fraud.

### D3.5 — Complete a visit
Done / no-show / cancelled, plus outcome and remark. `done` moves the lead to `site_visit_done` and writes a `lead_activities` row so it appears on the caller's and manager's timelines.

### D3.6 — Visits calendar
Week view, scoped by role. Managers see their territory's visits.

---

## Week 4 (17 – 20 Oct)
Hardening only. Test attendance, the site visit flows and the geofence prompt at 375px, on a real phone, with a real GPS fix — location behaves differently indoors and in a desktop simulator. Fix whatever is awkward.

---

## Boundaries
- **You own** attendance, availability records, geofences, site visits.
- **Arisha owns** the availability *switch* in the manager top bar; you own what it writes and how routing reads it. Agree the shape in Week 1.
- **Tanishka and Arisha** display your site visits on their lead screens; you build the objects and the flows.
- **Adish's dashboard reads your data.** "Site visits this week", site visits booked per manager, and the engine panel come from the `site_visits`, `attendance` and `geofences` tables. Keep their columns stable, and tell Adish in `team/sayli.md` before you change one.
