-- 0002_rls.sql — row level security
-- Read brain/04-access-control.md before changing anything here.
-- Every helper is SECURITY DEFINER so it reads base tables without RLS,
-- which is what keeps users policies from recursing infinitely.

-- ---------------------------------------------------------------- helpers
create or replace function app.my_role()
returns user_role language sql stable security definer set search_path = public, app as $$
  select role from public.users where id = auth.uid();
$$;

create or replace function app.is_admin()
returns boolean language sql stable security definer set search_path = public, app as $$
  select coalesce((select role in ('super_admin','admin') from public.users where id = auth.uid()), false);
$$;

create or replace function app.is_super()
returns boolean language sql stable security definer set search_path = public, app as $$
  select coalesce((select role = 'super_admin' from public.users where id = auth.uid()), false);
$$;

-- everyone at or below me, including me
create or replace function app.my_descendants()
returns setof uuid language sql stable security definer set search_path = public, app as $$
  select descendant_id from public.user_hierarchy where ancestor_id = auth.uid();
$$;

-- the user whose territory applies to me: managers use their own,
-- sub_managers and callers inherit upward until a scope owner is found
create or replace function app.my_scope_owner()
returns uuid language plpgsql stable security definer set search_path = public, app as $$
declare
  uid uuid := auth.uid();
  r   user_role;
  p   uuid;
begin
  select role, parent_id into r, p from public.users where id = uid;
  if r = 'manager' then return uid; end if;
  if r in ('sub_manager','caller') then
    -- walk up to the nearest manager
    while p is not null loop
      select role, parent_id into r, p from public.users where id = p;
      if r = 'manager' then
        return (select id from public.users where id = (
          select u.id from public.users u where u.role = 'manager'
            and u.id in (select ancestor_id from public.user_hierarchy where descendant_id = uid)
          limit 1));
      end if;
    end loop;
  end if;
  return null;
end $$;

create or replace function app.my_scope_projects()
returns setof uuid language sql stable security definer set search_path = public, app as $$
  select s.project_id from public.user_scopes s
  where s.project_id is not null
    and s.user_id in (
      select u.id from public.users u
      where u.role = 'manager'
        and u.id in (select ancestor_id from public.user_hierarchy where descendant_id = auth.uid())
    );
$$;

create or replace function app.my_scope_locations()
returns setof uuid language sql stable security definer set search_path = public, app as $$
  select s.location_id from public.user_scopes s
  where s.location_id is not null
    and s.user_id in (
      select u.id from public.users u
      where u.role = 'manager'
        and u.id in (select ancestor_id from public.user_hierarchy where descendant_id = auth.uid())
    );
$$;

-- the full visibility rule
create or replace function app.can_read_lead(p_lead uuid)
returns boolean language sql stable security definer set search_path = public, app as $$
  select case
    when app.is_admin() then true
    when app.my_role() = 'caller' then exists (
      select 1 from public.leads l where l.id = p_lead and l.assigned_to = auth.uid()
    )
    else exists (
      select 1 from public.leads l
      where l.id = p_lead
        and (
             l.assigned_to = auth.uid()
          or l.assigned_to in (select app.my_descendants())
          or l.project_id  in (select app.my_scope_projects())
          or l.location_id in (select app.my_scope_locations())
        )
    )
  end;
$$;

create or replace function app.can_write_lead(p_lead uuid)
returns boolean language sql stable security definer set search_path = public, app as $$
  select case
    when app.is_admin() then true
    when app.my_role() = 'caller' then exists (
      select 1 from public.leads l where l.id = p_lead and l.assigned_to = auth.uid()
    )
    else app.can_read_lead(p_lead)
  end;
$$;

-- ---------------------------------------------------------------- enable RLS everywhere
alter table public.users             enable row level security;
alter table public.user_hierarchy    enable row level security;
alter table public.locations         enable row level security;
alter table public.projects          enable row level security;
alter table public.user_scopes       enable row level security;
alter table public.user_availability enable row level security;
alter table public.persons           enable row level security;
alter table public.sources           enable row level security;
alter table public.leads             enable row level security;
alter table public.lead_sources      enable row level security;
alter table public.lead_activities   enable row level security;
alter table public.assignments       enable row level security;
alter table public.site_visits       enable row level security;
alter table public.attendance        enable row level security;
alter table public.geofences         enable row level security;
alter table public.notifications     enable row level security;
alter table public.audit_log         enable row level security;
alter table public.imports           enable row level security;
alter table public.round_robin_state enable row level security;

-- ---------------------------------------------------------------- users
create policy users_select on public.users for select to authenticated
using ( app.is_admin() or id = auth.uid() or id in (select app.my_descendants()) );

create policy users_insert on public.users for insert to authenticated
with check ( app.is_super() );

create policy users_update on public.users for update to authenticated
using ( app.is_super() ) with check ( app.is_super() );

-- ---------------------------------------------------------------- reference data
create policy hierarchy_select on public.user_hierarchy for select to authenticated using ( true );
create policy locations_select on public.locations for select to authenticated using ( true );
create policy projects_select  on public.projects  for select to authenticated using ( true );
create policy sources_select   on public.sources   for select to authenticated using ( true );

create policy locations_write on public.locations for all to authenticated
using ( app.is_super() ) with check ( app.is_super() );
create policy projects_write  on public.projects  for all to authenticated
using ( app.is_super() ) with check ( app.is_super() );

create policy scopes_select on public.user_scopes for select to authenticated
using ( app.is_admin() or user_id = auth.uid() or user_id in (select app.my_descendants()) );
create policy scopes_write on public.user_scopes for all to authenticated
using ( app.is_super() ) with check ( app.is_super() );

-- ---------------------------------------------------------------- availability
create policy avail_select on public.user_availability for select to authenticated
using ( app.is_admin() or user_id = auth.uid() or user_id in (select app.my_descendants()) );
create policy avail_upsert on public.user_availability for all to authenticated
using ( user_id = auth.uid() or app.is_admin() )
with check ( user_id = auth.uid() or app.is_admin() );

-- ---------------------------------------------------------------- leads
create policy leads_select on public.leads for select to authenticated
using ( app.can_read_lead(id) );

create policy leads_insert on public.leads for insert to authenticated
with check ( app.is_admin() );

create policy leads_update on public.leads for update to authenticated
using ( app.can_write_lead(id) ) with check ( app.can_write_lead(id) );

create policy leads_delete on public.leads for delete to authenticated
using ( app.is_super() );

-- persons are visible only through a lead the user can already read
create policy persons_select on public.persons for select to authenticated
using (
  app.is_admin() or exists (
    select 1 from public.leads l where l.person_id = persons.id and app.can_read_lead(l.id)
  )
);
create policy persons_write on public.persons for all to authenticated
using ( app.is_admin() ) with check ( app.is_admin() );

create policy lead_sources_select on public.lead_sources for select to authenticated
using ( app.can_read_lead(lead_id) );
create policy lead_sources_insert on public.lead_sources for insert to authenticated
with check ( app.is_admin() );

create policy activities_select on public.lead_activities for select to authenticated
using ( app.can_read_lead(lead_id) );
create policy activities_insert on public.lead_activities for insert to authenticated
with check ( app.can_write_lead(lead_id) and user_id = auth.uid() );
-- deliberately no update or delete policy: the timeline is append-only

create policy assignments_select on public.assignments for select to authenticated
using ( app.can_read_lead(lead_id) );
create policy assignments_insert on public.assignments for insert to authenticated
with check ( app.can_write_lead(lead_id) and app.my_role() <> 'caller' );

-- ---------------------------------------------------------------- ops
create policy visits_select on public.site_visits for select to authenticated
using ( app.can_read_lead(lead_id) );
create policy visits_write on public.site_visits for all to authenticated
using ( app.can_write_lead(lead_id) ) with check ( app.can_write_lead(lead_id) );

create policy attendance_select on public.attendance for select to authenticated
using ( app.is_admin() or user_id = auth.uid() or user_id in (select app.my_descendants()) );
create policy attendance_write on public.attendance for all to authenticated
using ( user_id = auth.uid() ) with check ( user_id = auth.uid() );

create policy geofences_select on public.geofences for select to authenticated using ( true );
create policy geofences_write on public.geofences for all to authenticated
using ( app.is_super() ) with check ( app.is_super() );

create policy notif_select on public.notifications for select to authenticated
using ( user_id = auth.uid() );
create policy notif_update on public.notifications for update to authenticated
using ( user_id = auth.uid() ) with check ( user_id = auth.uid() );

create policy audit_select on public.audit_log for select to authenticated
using ( app.is_admin() );
create policy audit_insert on public.audit_log for insert to authenticated
with check ( actor_id = auth.uid() );

create policy imports_select on public.imports for select to authenticated
using ( app.is_admin() );
create policy imports_write on public.imports for all to authenticated
using ( app.is_admin() ) with check ( app.is_admin() );

create policy rr_admin on public.round_robin_state for all to authenticated
using ( app.is_admin() ) with check ( app.is_admin() );
