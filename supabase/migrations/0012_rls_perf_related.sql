-- 0012_rls_perf_related.sql — finish what 0011 started: the tables read THROUGH a lead.
-- NO change to who can see what.
--
-- After 0011 an admin's list took 1.8 s and a caller's 1.5 s, but a manager's page of 25 still hit the
-- 8 s statement timeout at 20k leads. The list joins persons (inner), and persons_select ran
-- app.can_read_lead() per lead per person, with no index on leads.person_id to find them.
--
-- "You can see a person / source row / activity / assignment if you can see its lead" is now written
-- as an EXISTS on leads. Row level security applies inside that subquery too, as the same user, so it
-- is exactly leads_select (== can_read_lead) and cannot drift from it. The lookups are by primary key
-- or by the new person_id index.

create index if not exists leads_person_id_idx on public.leads (person_id);

drop policy if exists persons_select on public.persons;
create policy persons_select on public.persons for select to authenticated
using (
  (select app.is_admin())
  or exists (select 1 from public.leads l where l.person_id = persons.id)
);

drop policy if exists lead_sources_select on public.lead_sources;
create policy lead_sources_select on public.lead_sources for select to authenticated
using (
  (select app.is_admin())
  or exists (select 1 from public.leads l where l.id = lead_sources.lead_id)
);

drop policy if exists activities_select on public.lead_activities;
create policy activities_select on public.lead_activities for select to authenticated
using (
  (select app.is_admin())
  or exists (select 1 from public.leads l where l.id = lead_activities.lead_id)
);

drop policy if exists assignments_select on public.assignments;
create policy assignments_select on public.assignments for select to authenticated
using (
  (select app.is_admin())
  or exists (select 1 from public.leads l where l.id = assignments.lead_id)
);
