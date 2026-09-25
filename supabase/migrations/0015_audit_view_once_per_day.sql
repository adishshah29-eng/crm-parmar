-- 0015_audit_view_once_per_day.sql — one 'view_lead' audit row per person per lead per (IST) day.
--
-- Decision D-039 (Adish, 2026-09-25). Logging every open of a lead grew audit_log by about 450 MB a year
-- (41 people, ~100 opens a day each), past the free tier and slower every audit query. The record that
-- matters ("who looked at this customer, and on which days") survives: opening the same lead ten times
-- in a day writes one row, the first.
--
-- Enforced here, not in the app, so no code path can bypass it. Only 'view_lead' is affected: edits,
-- reassigns, exports, logins and everything else are still one row per event.
-- SECURITY DEFINER because callers cannot read audit_log (RLS), so an invoker trigger could never see
-- the earlier row and would let every duplicate through.

create index if not exists audit_log_view_lead_idx
  on public.audit_log (actor_id, entity_id, created_at desc) where action = 'view_lead';

create or replace function app.audit_view_once_per_day()
returns trigger language plpgsql security definer set search_path = public, app as $$
begin
  if new.action = 'view_lead'
     and new.actor_id is not null
     and new.entity_id is not null
     and exists (
       select 1 from public.audit_log a
       where a.action = 'view_lead'
         and a.actor_id = new.actor_id
         and a.entity_id = new.entity_id
         and (a.created_at at time zone 'Asia/Kolkata')::date = (new.created_at at time zone 'Asia/Kolkata')::date
     )
  then
    return null;  -- already recorded today: skip this row, the insert still succeeds for the caller
  end if;
  return new;
end $$;

drop trigger if exists audit_view_once_per_day on public.audit_log;
create trigger audit_view_once_per_day
  before insert on public.audit_log
  for each row execute function app.audit_view_once_per_day();
