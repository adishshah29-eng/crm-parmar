-- 0011_rls_perf.sql — make the lead read rules fast at 20k+ leads. NO change to who can see what.
--
-- Problem: leads_select was `app.can_read_lead(id)`, a SECURITY DEFINER function taking the row id.
-- Postgres cannot inline it or hoist anything out of it, so every row ran is_admin() plus a lookup.
-- At 20,042 leads an exact count took 4.7 s and one 25-row page 6.9 s; the list hit the 8 s API
-- statement timeout (57014). Same story for every table that reads through can_read_lead().
--
-- Fix 1: leads_select spelled out in SQL. Anything that does not depend on the row is wrapped in
--        (select ...), which makes it a one-time InitPlan instead of a per-row call.
-- Fix 2: the other read policies try the one-time admin check first, so an admin never pays per row.
-- Fix 3: an index for the default list order.
--
-- Semantics are exactly app.can_read_lead():
--   admin / super_admin      -> every lead
--   caller                   -> only leads assigned to them
--   manager / sub_manager    -> assigned to them, or to anyone below them, or inside their territory
-- `(select app.my_role()) is distinct from 'caller'` matters: a caller inherits their manager's scope
-- rows in my_scope_projects()/my_scope_locations(), and must NOT see leads through them.

drop policy if exists leads_select on public.leads;
create policy leads_select on public.leads for select to authenticated
using (
  (select app.is_admin())
  or assigned_to = (select auth.uid())
  or (
    (select app.my_role()) is distinct from 'caller'
    and (
         assigned_to in (select app.my_descendants())
      or project_id  in (select app.my_scope_projects())
      or location_id in (select app.my_scope_locations())
    )
  )
);

drop policy if exists persons_select on public.persons;
create policy persons_select on public.persons for select to authenticated
using (
  (select app.is_admin()) or exists (
    select 1 from public.leads l where l.person_id = persons.id and app.can_read_lead(l.id)
  )
);

drop policy if exists lead_sources_select on public.lead_sources;
create policy lead_sources_select on public.lead_sources for select to authenticated
using ( (select app.is_admin()) or app.can_read_lead(lead_id) );

drop policy if exists activities_select on public.lead_activities;
create policy activities_select on public.lead_activities for select to authenticated
using ( (select app.is_admin()) or app.can_read_lead(lead_id) );

drop policy if exists assignments_select on public.assignments;
create policy assignments_select on public.assignments for select to authenticated
using ( (select app.is_admin()) or app.can_read_lead(lead_id) );

-- The lead list defaults to newest first (created_at desc, id).
create index if not exists leads_created_at_id_idx on public.leads (created_at desc, id);
