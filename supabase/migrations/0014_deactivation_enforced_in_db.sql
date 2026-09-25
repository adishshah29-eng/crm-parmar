-- 0014_deactivation_enforced_in_db.sql — a deactivated user is locked out at the DATABASE, instantly.
--
-- Before: deactivating a person set users.is_active = false and banned the login, but the only thing
-- that noticed was the Next.js proxy. A signed-in user's access token stays valid for up to an hour, and
-- the anon key + that token can call the database API directly, so a deactivated person could keep
-- reading their leads for up to an hour. Requirement (Adish, 2026-09-25): deactivation is INSTANT.
--
-- Now: every table carries a RESTRICTIVE policy. Restrictive policies are ANDed with every other policy,
-- so an inactive user gets no rows and no writes anywhere, whatever the permissive policies say, and a
-- policy added later cannot accidentally open a table back up. The role helpers also stop returning a
-- role for an inactive user, which covers the SECURITY DEFINER functions (import, move, set scopes) that
-- authorise through them.
--
-- The one exception is the user's OWN row in public.users, readable so the proxy can see is_active =
-- false and sign them out with the "deactivated" message instead of a generic error.
--
-- Cost: one indexed lookup by primary key, evaluated once per query, not per row ((select ...) InitPlan).
-- Portability: only uses auth.uid(); on another host, point app.is_active_user() at that host's user id.

create or replace function app.is_active_user()
returns boolean language sql stable security definer set search_path = public, app as $$
  select coalesce((select is_active from public.users where id = auth.uid()), false);
$$;

create or replace function app.my_role()
returns user_role language sql stable security definer set search_path = public, app as $$
  select role from public.users where id = auth.uid() and is_active;
$$;

create or replace function app.is_admin()
returns boolean language sql stable security definer set search_path = public, app as $$
  select coalesce((select role in ('super_admin','admin') from public.users where id = auth.uid() and is_active), false);
$$;

create or replace function app.is_super()
returns boolean language sql stable security definer set search_path = public, app as $$
  select coalesce((select role = 'super_admin' from public.users where id = auth.uid() and is_active), false);
$$;

-- users: an inactive user may still read their own row (for the proxy), nothing else, and write nothing.
drop policy if exists users_active_select on public.users;
create policy users_active_select on public.users as restrictive for select to authenticated
  using ( (select app.is_active_user()) or id = (select auth.uid()) );
drop policy if exists users_active_insert on public.users;
create policy users_active_insert on public.users as restrictive for insert to authenticated
  with check ( (select app.is_active_user()) );
drop policy if exists users_active_update on public.users;
create policy users_active_update on public.users as restrictive for update to authenticated
  using ( (select app.is_active_user()) ) with check ( (select app.is_active_user()) );
drop policy if exists users_active_delete on public.users;
create policy users_active_delete on public.users as restrictive for delete to authenticated
  using ( (select app.is_active_user()) );

-- every other table
do $$
declare t text;
begin
  foreach t in array array[
    'user_hierarchy','locations','projects','user_scopes','user_availability','persons','sources',
    'leads','lead_sources','lead_activities','assignments','site_visits','attendance','geofences',
    'notifications','audit_log','imports','round_robin_state'
  ] loop
    execute format('drop policy if exists active_only on public.%I', t);
    execute format(
      'create policy active_only on public.%I as restrictive for all to authenticated using ((select app.is_active_user())) with check ((select app.is_active_user()))',
      t);
  end loop;
end $$;
