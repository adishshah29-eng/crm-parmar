-- 0009_set_user_scopes_definer.sql
-- Fixes public.set_user_scopes() from 0007 (found by run-territory-tests.ts on the real database).
--
-- 0007 made it SECURITY INVOKER so RLS would do the permission check. But the body calls
-- app.is_super() directly, and the signed-in role has no USAGE on schema app: every call failed
-- with "permission denied for schema app" (42501). RLS policies can call app.* helpers; a plain
-- function body cannot.
--
-- Fix: SECURITY DEFINER, with the explicit is_super() check as its FIRST statement and the only
-- door in. Nothing is broadened: the function still refuses everyone except the super_admin, still
-- refuses any target who is not a manager, and still replaces the whole territory in one
-- transaction. Forward-only: 0007 is not edited.

create or replace function public.set_user_scopes(p_user uuid, p_projects uuid[], p_locations uuid[])
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare
  projs uuid[] := coalesce(p_projects, '{}');
  locs  uuid[] := coalesce(p_locations, '{}');
begin
  -- the permission boundary: this runs with the owner's rights, so this check is what protects it
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
