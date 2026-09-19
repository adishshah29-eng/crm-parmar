# Sayli — task backlog

**Portal:** Not a portal. Attendance, geofencing, site visits and the company dashboard — things every role touches, owned in one place so three portals do not each build their own.

Blocked on Adish's shared core.

---

## Week 1 (26 Sep – 2 Oct) — the company dashboard

### D1.1 — Dashboard · `app/(app)/dashboard/page.tsx`
What Gautam sees on opening the app, in his own words:

1. **Total leads**
2. **Working portfolio of every manager** — a row per manager, lead count split by stage
3. Untouched leads right now
4. Escalations today
5. Site visits this week

Plus the **today / all-time toggle** he asked for specifically — a control at the top, not a filter buried in a menu.

Static numbers this week; wire them up in Week 2.

### D1.2 — Manager portfolio rows
Per manager: total, by stage, untouched, site visits booked, callers under them. Click through to that manager's leads.

### D1.3 — Role-scoped dashboards
Same page, different scope, decided by RLS rather than by branching in your code: super_admin and admin see the company, a manager sees their territory, a caller is redirected to My Day.

---

## Week 2 (3 – 9 Oct) — attendance and live data

### D2.1 — Check in / out · `actions/ops.ts`
Browser geolocation with the timestamp. One row per person per day — the unique constraint exists, so handle the repeat gracefully rather than showing a Postgres error.

> **Attendance feeds lead routing.** A caller who has not checked in is skipped when leads are distributed. Say this on the screen, or people will wonder why they are getting no work.

### D2.2 — Attendance views
Own for everyone, team for managers and sub_managers, everything for admins. RLS scopes it — do not filter by role in the query.

### D2.3 — Dashboard on live data
`getDashboard({ range: 'today' | 'all' })`.

Aggregate in **SQL**, not JavaScript. Pulling every lead into Node to count them is slow and burns the 5 GB egress allowance. Write `app.dashboard_counts(range)` if the query gets long.

### D2.4 — Engine panel
Unassigned count, escalations today, leads queued for 10:30. Show the night queue explicitly as "waiting for 10:30" so nobody thinks those leads are lost.

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
The dashboard is the first thing the business sees every morning. Spend the week on it: ₹ formatted in lakhs and crores rather than raw digits, clean alignment, skeletons rather than spinners. Then test everything at 375px.

---

## Boundaries
- **You own** attendance, availability records, geofences, site visits.
- **Arisha owns** the availability *switch* in the manager top bar; you own what it writes and how routing reads it. Agree the shape in Week 1.
- **Tanishka and Arisha** display your site visits on their lead screens; you build the objects and the flows.
- Dashboard counts come from your own SQL, not from three portals each computing their own.
