-- 0016_rls_perf_for_all_policies.sql — the per-row function calls 0011/0012 missed. NO change to who can see what.
--
-- Found by the search benchmark (1.5 s against a 600 ms budget). The slow part was not the search: an
-- unfiltered COUNT of the persons table took 1.9 s (20,041 rows) while the same count on leads took
-- 74 ms. Cause: `persons_write` is a FOR ALL policy, and FOR ALL also applies to SELECT. Permissive
-- policies are OR-ed, so every read of persons also evaluated `app.is_admin()` once per row (a
-- SECURITY DEFINER lookup that Postgres cannot hoist). Trigram indexes could not help: the time was in
-- the policy, not the match.
--
-- The same unwrapped pattern sat on the tables that will grow: audit_log (~1.5 M rows a year, read by
-- the audit viewer), notifications, attendance, site_visits. Each is rewritten with the row-independent
-- part inside (select ...), which Postgres evaluates once per query.
--
-- Rule (playbook trap): a FOR ALL policy filters reads too. Never leave a function call that does not
-- depend on the row unwrapped in any policy on a table that can grow.

drop policy if exists persons_write on public.persons;
create policy persons_write on public.persons for all to authenticated
  using ( (select app.is_admin()) ) with check ( (select app.is_admin()) );

drop policy if exists audit_select on public.audit_log;
create policy audit_select on public.audit_log for select to authenticated
  using ( (select app.is_admin()) );

drop policy if exists visits_select on public.site_visits;
create policy visits_select on public.site_visits for select to authenticated
  using ( (select app.is_admin()) or app.can_read_lead(lead_id) );

drop policy if exists visits_write on public.site_visits;
create policy visits_write on public.site_visits for all to authenticated
  using ( (select app.is_admin()) or app.can_write_lead(lead_id) )
  with check ( (select app.is_admin()) or app.can_write_lead(lead_id) );

drop policy if exists attendance_select on public.attendance;
create policy attendance_select on public.attendance for select to authenticated
  using ( (select app.is_admin()) or user_id = (select auth.uid()) or user_id in (select app.my_descendants()) );

drop policy if exists attendance_write on public.attendance;
create policy attendance_write on public.attendance for all to authenticated
  using ( user_id = (select auth.uid()) ) with check ( user_id = (select auth.uid()) );

drop policy if exists notif_select on public.notifications;
create policy notif_select on public.notifications for select to authenticated
  using ( user_id = (select auth.uid()) );

drop policy if exists notif_update on public.notifications;
create policy notif_update on public.notifications for update to authenticated
  using ( user_id = (select auth.uid()) ) with check ( user_id = (select auth.uid()) );
