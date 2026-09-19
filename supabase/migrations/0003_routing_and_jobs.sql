-- 0003_routing_and_jobs.sql — round robin, SLA escalation, night queue
-- Logic is described in brain/05-lead-flow.md.

-- Candidate callers for a lead's territory, honouring availability and delegation.
create or replace function app.candidate_callers(p_project uuid, p_location uuid)
returns table(user_id uuid) language sql stable security definer set search_path = public, app as $$
  with managers as (
    select distinct s.user_id
    from public.user_scopes s
    join public.users u on u.id = s.user_id and u.is_active and u.role = 'manager'
    where s.project_id = p_project or s.location_id = p_location
  ),
  effective_owners as (
    select case
             when a.status = 'on_site_visit' then a.delegate_to
             else m.user_id
           end as owner_id,
           coalesce(a.status, 'available') as status
    from managers m
    left join public.user_availability a on a.user_id = m.user_id
  ),
  active_owners as (
    select owner_id from effective_owners where status <> 'off' and owner_id is not null
  )
  select u.id
  from public.users u
  join public.user_hierarchy h on h.descendant_id = u.id
  left join public.user_availability av on av.user_id = u.id
  where h.ancestor_id in (select owner_id from active_owners)
    and u.role = 'caller'
    and u.is_active
    and coalesce(av.status, 'available') = 'available'
    and exists (
      select 1 from public.attendance att
      where att.user_id = u.id
        and att.work_date = (now() at time zone 'Asia/Kolkata')::date
        and att.check_in_at is not null
    )
  order by u.id;
$$;

-- Pick the next caller in rotation for a scope and remember the position.
create or replace function app.next_in_rotation(p_project uuid, p_location uuid)
returns uuid language plpgsql security definer set search_path = public, app as $$
declare
  key   text := 'project:' || coalesce(p_project::text, 'none');
  last  uuid;
  pick  uuid;
begin
  select last_user_id into last from public.round_robin_state where scope_key = key;

  select user_id into pick from app.candidate_callers(p_project, p_location)
   where last is null or user_id > last
   order by user_id limit 1;

  if pick is null then
    select user_id into pick from app.candidate_callers(p_project, p_location)
     order by user_id limit 1;
  end if;

  if pick is not null then
    insert into public.round_robin_state(scope_key, last_user_id, updated_at)
    values (key, pick, now())
    on conflict (scope_key) do update set last_user_id = excluded.last_user_id, updated_at = now();
  end if;

  return pick;
end $$;

-- Assign one lead. Starts the SLA clock only for live leads.
create or replace function app.assign_lead(p_lead uuid, p_reason text default 'round_robin')
returns uuid language plpgsql security definer set search_path = public, app as $$
declare
  l      public.leads%rowtype;
  target uuid;
begin
  select * into l from public.leads where id = p_lead;
  if not found then raise exception 'lead % not found', p_lead; end if;

  target := app.next_in_rotation(l.project_id, l.location_id);
  if target is null then
    insert into public.notifications(user_id, type, lead_id, title, body)
    select u.id, 'assignment', p_lead, 'No caller available',
           'A live lead could not be assigned — no checked-in caller in this territory.'
    from public.users u where u.role = 'super_admin';
    return null;
  end if;

  update public.leads
     set assigned_to = target,
         assigned_at = now(),
         sla_due_at  = case when l.is_live then app.add_working_minutes(now(), 45) else null end
   where id = p_lead;

  insert into public.assignments(lead_id, from_user_id, to_user_id, reason)
  values (p_lead, l.assigned_to, target, p_reason);

  insert into public.notifications(user_id, type, lead_id, title, body)
  values (target, 'assignment', p_lead, 'New lead assigned', 'A new lead is waiting for your first call.');

  return target;
end $$;

-- 10:30 IST — release everything that arrived overnight.
create or replace function app.release_night_queue()
returns int language plpgsql security definer set search_path = public, app as $$
declare
  n int := 0;
  r record;
begin
  for r in select id from public.leads
            where assigned_to is null and is_live
            order by created_at loop
    perform app.assign_lead(r.id, 'round_robin');
    n := n + 1;
  end loop;
  return n;
end $$;

-- Every 5 minutes during working hours — escalate untouched live leads.
create or replace function app.check_sla_breaches()
returns int language plpgsql security definer set search_path = public, app as $$
declare
  n int := 0;
  r record;
begin
  if not app.is_working_hours() then return 0; end if;

  for r in
    select l.id, l.assigned_to, p.name as project_name, pe.full_name, pe.phone
    from public.leads l
    join public.projects p on p.id = l.project_id
    join public.persons  pe on pe.id = l.person_id
    where l.is_live
      and l.sla_due_at is not null
      and l.sla_due_at < now()
      and l.first_touch_at is null
      and l.sla_breached_at is null
  loop
    update public.leads set sla_breached_at = now() where id = r.id;

    insert into public.notifications(user_id, type, lead_id, title, body)
    select u.id, 'sla_breach', r.id,
           'Lead untouched for 45 minutes',
           coalesce(r.full_name, r.phone) || ' — ' || r.project_name
    from public.users u
    where u.role = 'super_admin'
       or u.id in (
            select h.ancestor_id from public.user_hierarchy h
            join public.users m on m.id = h.ancestor_id
            where h.descendant_id = r.assigned_to and m.role in ('manager','sub_manager')
          );
    n := n + 1;
  end loop;
  return n;
end $$;

-- Record first touch whenever any activity lands on a lead.
create or replace function app.on_activity()
returns trigger language plpgsql security definer set search_path = public, app as $$
begin
  update public.leads
     set first_touch_at   = coalesce(first_touch_at, now()),
         last_activity_at = now()
   where id = new.lead_id;
  return new;
end $$;

create trigger activity_touches_lead
after insert on public.lead_activities
for each row execute function app.on_activity();

-- Schedules. Requires pg_cron enabled on the project.
-- select cron.schedule('release-night-queue', '0 5 * * *',  $$select app.release_night_queue()$$);
-- select cron.schedule('check-sla',           '*/5 * * * *', $$select app.check_sla_breaches()$$);
-- 05:00 UTC = 10:30 IST.
