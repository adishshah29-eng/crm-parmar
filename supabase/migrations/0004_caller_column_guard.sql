-- 0004_caller_column_guard.sql
-- Callers may update their own leads (call status, temperature, next call, remarks…)
-- but must never change ownership, identity, territory or SLA bookkeeping.
--
-- Why a trigger and not the policy: leads_update lets a caller update ANY column of a
-- lead they own, including assigned_to. RLS WITH CHECK cannot compare old and new
-- values, and a STABLE helper called from WITH CHECK is not guaranteed to see the
-- post-update row. A BEFORE UPDATE trigger sees both OLD and NEW, so the rule is exact.
--
-- Rule source: brain/04-access-control.md ("Reassign lead: caller = no") and
-- brain/tasks/tanishka-tasks.md ("A caller cannot give a lead away").

create or replace function app.guard_lead_columns()
returns trigger language plpgsql security definer set search_path = public, app as $$
begin
  -- Updates made by other triggers (e.g. app.on_activity setting first_touch_at)
  -- run at depth > 1 and are system bookkeeping, not the caller acting.
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  -- cron jobs and admin tooling have no auth.uid(); only signed-in callers are restricted
  if app.my_role() = 'caller' then
    if new.assigned_to      is distinct from old.assigned_to
    or new.assigned_at      is distinct from old.assigned_at
    or new.person_id        is distinct from old.person_id
    or new.project_id       is distinct from old.project_id
    or new.location_id      is distinct from old.location_id
    or new.is_live          is distinct from old.is_live
    or new.sla_due_at       is distinct from old.sla_due_at
    or new.sla_breached_at  is distinct from old.sla_breached_at
    or new.first_touch_at   is distinct from old.first_touch_at
    then
      raise exception 'callers cannot change lead ownership, territory or SLA fields'
        using errcode = '42501';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists leads_guard_columns on public.leads;
create trigger leads_guard_columns
before update on public.leads
for each row execute function app.guard_lead_columns();
