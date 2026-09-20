-- 0007_territory_and_assignment.sql
-- Week 2 (tasks A2.1 to A2.4). Three things that must be atomic or consistent in the database,
-- not stitched together from several API calls:
--
--   1. leads.location_id is denormalised from projects.location_id "for fast territory checks"
--      (brain/03-data-model.md). Change a project's location and every one of its leads must
--      follow, or territory visibility silently goes wrong. A trigger keeps them in step.
--   2. public.set_user_scopes()  replace a manager's whole territory in ONE transaction.
--   3. public.move_leads()       assign / transfer leads in ONE transaction, writing the ownership
--                                history (assignments) and the notification for each move.

-- ---------------------------------------------------------------- 1. keep leads.location_id in step

create or replace function app.sync_lead_location()
returns trigger language plpgsql security definer set search_path = public, app as $$
begin
  if new.location_id is distinct from old.location_id then
    -- runs as a nested trigger, so leads_guard_columns (depth > 1) lets it through
    update public.leads set location_id = new.location_id where project_id = new.id;
  end if;
  return null;
end $$;

drop trigger if exists projects_sync_lead_location on public.projects;
create trigger projects_sync_lead_location
after update of location_id on public.projects
for each row execute function app.sync_lead_location();

-- ---------------------------------------------------------------- 2. set a manager's territory

-- SECURITY INVOKER: RLS still applies, so only the super_admin (scopes_write policy) can change
-- anything. The explicit check below just turns a silent no-op into a clear error.
create or replace function public.set_user_scopes(p_user uuid, p_projects uuid[], p_locations uuid[])
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  projs uuid[] := coalesce(p_projects, '{}');
  locs  uuid[] := coalesce(p_locations, '{}');
begin
  if not app.is_super() then
    raise exception 'only the super admin can change territories' using errcode = '42501';
  end if;
  if not exists (select 1 from public.users where id = p_user and role = 'manager') then
    raise exception 'territories can only be set for a manager' using errcode = '22023';
  end if;

  -- remove what is no longer selected
  delete from public.user_scopes
   where user_id = p_user
     and ((project_id  is not null and project_id  <> all(projs))
       or (location_id is not null and location_id <> all(locs)));

  -- add what is new; existing rows are left alone
  insert into public.user_scopes (user_id, project_id)
  select p_user, x from unnest(projs) as x
   where not exists (select 1 from public.user_scopes s where s.user_id = p_user and s.project_id = x);

  insert into public.user_scopes (user_id, location_id)
  select p_user, x from unnest(locs) as x
   where not exists (select 1 from public.user_scopes s where s.user_id = p_user and s.location_id = x);
end $$;

revoke all on function public.set_user_scopes(uuid, uuid[], uuid[]) from public;
grant execute on function public.set_user_scopes(uuid, uuid[], uuid[]) to authenticated;

-- ---------------------------------------------------------------- 3. move leads between owners

-- p_moves: [{"lead": "<uuid>", "to": "<uuid>"}, ...]   p_reason: manual | escalation | exit_transfer
--
-- Every move in the call succeeds or none does. For each lead that actually changes owner it:
--   * updates leads.assigned_to / assigned_at
--   * writes an assignments row (from -> to, reason, created_by = the caller)
--   * notifies the new owner
--   * optionally restarts the 45-minute SLA, exactly as app.assign_lead() does (live leads only)
-- It deliberately writes NO lead_activities row: any activity sets first_touch_at and would
-- falsely stop a live lead's SLA clock.
--
-- Who may call it: admins for manual/escalation; only the super_admin for exit_transfer.
-- SECURITY DEFINER because assignments and notifications have no client write policy for
-- other users; the checks below are the permission boundary.
create or replace function public.move_leads(p_moves jsonb, p_reason text, p_restart_sla boolean default false)
returns int
language plpgsql
security definer
set search_path = public, app
as $$
declare
  m      record;
  l      public.leads%rowtype;
  tgt    public.users%rowtype;
  moved  int := 0;
begin
  if p_reason not in ('manual', 'escalation', 'exit_transfer') then
    raise exception 'invalid reason %', p_reason using errcode = '22023';
  end if;
  if p_reason = 'exit_transfer' then
    if not app.is_super() then raise exception 'not allowed' using errcode = '42501'; end if;
  elsif not app.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_moves is null or jsonb_typeof(p_moves) <> 'array' or jsonb_array_length(p_moves) > 2000 then
    raise exception 'invalid moves' using errcode = '22023';
  end if;

  for m in
    select (e ->> 'lead')::uuid as lead_id, (e ->> 'to')::uuid as to_id
      from jsonb_array_elements(p_moves) as e
  loop
    select * into tgt from public.users where id = m.to_id;
    if not found or not tgt.is_active then
      raise exception 'target user is not active' using errcode = '22023';
    end if;
    -- manual assignment goes to someone who works leads; an exit transfer may fall back to an admin
    if p_reason <> 'exit_transfer' and tgt.role not in ('manager', 'sub_manager', 'caller') then
      raise exception 'leads can only be assigned to a manager, sub manager or caller' using errcode = '22023';
    end if;

    select * into l from public.leads where id = m.lead_id for update;
    if not found or l.assigned_to is not distinct from m.to_id then
      continue; -- unknown lead, or already theirs: nothing to do
    end if;

    update public.leads
       set assigned_to = m.to_id,
           assigned_at = now(),
           sla_due_at  = case
                           when p_restart_sla then
                             case when l.is_live then app.add_working_minutes(now(), 45) else null end
                           else l.sla_due_at
                         end
     where id = m.lead_id;

    insert into public.assignments (lead_id, from_user_id, to_user_id, reason, created_by)
    values (m.lead_id, l.assigned_to, m.to_id, p_reason, auth.uid());

    insert into public.notifications (user_id, type, lead_id, title, body)
    values (
      m.to_id, 'assignment', m.lead_id,
      case when p_reason = 'exit_transfer' then 'Lead transferred to you' else 'Lead assigned to you' end,
      case when p_reason = 'exit_transfer'
           then 'A lead was transferred to you because its previous owner left.'
           else 'A lead was assigned to you.' end
    );

    moved := moved + 1;
  end loop;

  return moved;
end $$;

revoke all on function public.move_leads(jsonb, text, boolean) from public;
grant execute on function public.move_leads(jsonb, text, boolean) to authenticated;
