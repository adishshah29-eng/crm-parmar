# Arisha — task backlog

**Portal:** Manager and sub_manager workspace.

A manager sees every lead in their territories **plus** every lead belonging to their team. A sub_manager sees the same through their manager and steps in when the manager is out on a site visit.

Blocked on Adish's shared core. Read `brain/04-access-control.md` and `05-lead-flow.md` first.

---

## Week 1 (26 Sep – 2 Oct) — the manager's home

### B1.1 — Territory lead list · `app/(app)/team/leads/page.tsx`
Built on Adish's `DataTable` and `getLeads`. Columns: buyer, phone, project, stage, call status, temperature, owner, last activity, SLA flag.

Filters: status, temperature, stage, project, caller, source, date range. Search matches a **partial phone number** — that is how the team actually looks people up.

**Do not filter by role in the query.** RLS already returns the right rows. If you catch yourself writing `if (role === 'manager')` in a query, something is wrong one layer down — tell Adish rather than patching it here.

### B1.2 — Mine vs team toggle
A manager both supervises and carries their own leads. One control: My leads / My team / Everything in my territory.

### B1.3 — Team roster · `app/(app)/team/page.tsx`
Each caller under this manager with live counts: assigned, untouched, follow-ups due today, site visits booked. Click through to that caller's leads.

### B1.4 — Sub_manager view
Same screens, resolved through the parent manager's territory. Verify a sub_manager sees their manager's territory and not a sibling manager's.

---

## Week 2 (3 – 9 Oct) — moving work around

### B2.1 — Reassign · `actions/assignment.ts → reassign`
Managers reassign **within their own scope only**. Callers never reassign.

**Critical guard:** refuse if the target could not read the lead afterwards. Check `app.can_read_lead` for the target before committing. Without this, a manager can move a lead somewhere nobody but an admin can see it, and it is effectively lost.

### B2.2 — Bulk reassign
Multi-select on the list, assign to one user, same guard, one `assignments` row per lead.

### B2.3 — Escalation inbox · `app/(app)/team/escalations/page.tsx`
Leads past 45 working minutes with no activity. This is the screen a manager will live in.

Per lead: who owns it, how long overdue, one-click reassign, one-click call.

The escalation itself is a notification, never an automatic reassignment (D-010). This screen is where a human acts on it.

### B2.4 — SLA countdown in the list
Amber at 15 minutes left, red once breached. **Use `app.add_working_minutes` — never client-side date maths.** A lead assigned at 19:15 is due at 11:00 next morning, not 20:00.

---

## Week 3 (10 – 16 Oct) — delegation and oversight

### B3.1 — Availability switch
Available / On site visit / Off, in the top bar.

"On site visit" **requires** naming a delegate from their own sub_managers — the database enforces it, so surface a clear message rather than a raw Postgres error.

Say on screen that this affects **new** leads only. Nothing already owned moves. Managers will otherwise assume their whole book transfers.

### B3.2 — Delegation status
Who is currently covering for whom, visible to the manager, their sub_managers and admins.

### B3.3 — Team performance
Per caller: calls logged, connect rate, leads untouched, follow-ups missed, site visits booked, bookings. Today / this week / all time.

Aggregate in **SQL**, not JavaScript.

### B3.4 — Pipeline stage control
Managers move leads to negotiation and booked. Callers cannot — they move the pipeline indirectly, by booking a site visit or marking a lead lost.

---

## Week 4 (17 – 20 Oct)
Managers are the most senior daily users. Spend the week on their screens: sensible defaults, fast filters, nothing needing more than two clicks.

---

## Boundaries
- **You own the assignment field** — with Adish, who assigns at admin level. Tanishka's caller screens never change ownership.
- **Tanishka owns** call outcome, temperature, next call date, remarks. You display them, you do not write them.
- **Sayli owns** site visits and attendance. You show her data on the team roster.
- Never copy the shared table or badges into your own folder. Extend the shared one.
