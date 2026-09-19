# Tanishka — task backlog

**Portal:** Caller workspace.

Five to ten people will spend their entire working day in these screens. Whether this CRM succeeds depends more on your portal than on anything else in the build — a CRM that callers find slow gets filled with blank fields within a month, and then the dashboards are lying.

**Build phone-first from week one.** Callers are not at desks. Every screen works at 375px before it works at 1440px, not the other way around.

Blocked on Adish's shared core. Read `brain/05-lead-flow.md` end to end first.

---

## Week 1 (26 Sep – 2 Oct) — my day

### C1.1 — My Day · `app/(app)/my-day/page.tsx`
The caller's only list. Their leads, ordered by what needs attention **now**:

1. New and untouched, SLA clock running
2. Follow-ups due today
3. Follow-ups overdue
4. Everything else

A caller sees nothing but their own leads and cannot browse the database — RLS guarantees it, so do not add role filters in the query.

### C1.2 — Lead detail, read path · `app/(app)/my-day/[id]/page.tsx`
Built on Adish's `LeadDetailShell`. Buyer name, **phone as a tap-to-dial link**, project, budget, source history, activity timeline.

Callers dial from their own phones, so the tap-to-dial link is the single most-used element on the screen. Make it large and unmissable.

### C1.3 — SLA countdown
Minutes remaining on an untouched lead, in working minutes. Amber under 15, red once breached. Use `app.add_working_minutes` — never client-side date arithmetic.

### C1.4 — Test on a real phone
Not the browser's device simulator. An actual phone, in week one, before the patterns set.

---

## Week 2 (3 – 9 Oct) — recording the call

### C2.1 — Call outcome · `components/caller/CallOutcomeForm.tsx`
The most important control in the product. Four choices, default `new`:

| Choice | Required |
|---|---|
| attempted | `next_call_at` |
| connected | `temperature` **and** `remark`, plus `next_call_at` unless moving to booked/dropped |
| lost | `remark`; sets `renurture_at` to +6 months, editable |

One zod schema, imported by both the form and Adish's server action. The rule lives in one place or it drifts.

**Three taps to finish a lead.** Outcome, temperature, next date — done. Every extra field is a field that will be left blank.

Every submit writes a `lead_activities` row, which trips the trigger that sets `first_touch_at` and stops the SLA clock. **Never set `first_touch_at` yourself.** The database does it.

### C2.2 — Activity timeline
Newest first: calls, remarks, status changes, reassignments, site visits. Append-only — there is deliberately no update or delete policy on that table. Do not add one.

### C2.3 — Quick remark
Add a note without changing status. Callers need this constantly and it must not require opening a form.

---

## Week 3 (10 – 16 Oct) — the working day

### C3.1 — Follow-ups
Today, tomorrow, overdue. Driven by `next_call_at`. This is the second screen a caller opens each morning.

### C3.2 — Buyer history
If the same phone number has enquired about another project, show it: which project, who owns it, what stage.

This is why `persons` and `leads` are separate tables (D-005), and it is what stops two of your people calling the same HNI in the same week.

### C3.3 — My performance
Calls logged today, connect rate, leads untouched, follow-ups missed.

Include a plain **"not updated today"** count. With manual calling this is the only lever on data quality — a caller who can see their own gap tends to close it.

### C3.4 — Notifications
New lead assigned, SLA warning, follow-up due. Feeds Adish's bell in the shell; you supply the caller-side triggers.

---

## Week 4 (17 – 20 Oct)
Sit with an actual caller and watch them work twenty real leads on a phone. Do not explain the screen — watch where they hesitate. Whatever is awkward gets fixed this week.

---

## Boundaries
- **You never write the assignment field.** A caller cannot give a lead away. That is Arisha's reassign action and Adish's admin assignment.
- **You own** call outcome, temperature, next call date, remarks. Everyone else displays them.
- **Sayli owns** site visits — you link to her create-visit flow, you do not build it.
- Never copy the shared table, badges or detail shell into your own folder.
