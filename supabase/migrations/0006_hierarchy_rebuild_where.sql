-- 0006_hierarchy_rebuild_where.sql
-- Fixes a bug in 0001_init.sql found while building user management (task A1.2).
--
-- Supabase enables the pg_safeupdate extension for API sessions: any DELETE or UPDATE
-- without a WHERE clause is rejected with "DELETE requires a WHERE clause" (SQLSTATE 21000).
-- app.rebuild_hierarchy() ran a bare `delete from public.user_hierarchy`, and it fires from the
-- users trigger. Result: every INSERT into users, and every change of parent_id, made through
-- the API (i.e. every real createUser / re-parent) failed. It went unnoticed because the seed
-- runs in the SQL editor, which is not subject to pg_safeupdate.
--
-- Fix: an explicit `where true`. Same behaviour, but the statement now carries a WHERE clause.
-- Forward-only, per brain/workflow/migrations.md: 0001 is not edited.

create or replace function app.rebuild_hierarchy()
returns void language plpgsql security definer set search_path = public, app as $$
begin
  delete from public.user_hierarchy where true;
  with recursive tree as (
    select id as ancestor_id, id as descendant_id, 0 as depth from public.users
    union all
    select t.ancestor_id, u.id, t.depth + 1
    from tree t join public.users u on u.parent_id = t.descendant_id
  )
  insert into public.user_hierarchy select * from tree;
end $$;
