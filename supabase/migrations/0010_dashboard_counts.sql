-- 0010_dashboard_counts.sql
-- The dashboards (tasks D1.1, D1.2, D2.3, D2.4). Two functions, so every number is counted in SQL:
-- pulling leads into Node just to count them is slow and burns the 5 GB egress allowance.
--
-- SECURITY INVOKER on purpose: they run as the signed-in user, so RLS decides what each role
-- counts. An admin gets the company, a manager gets their territory and team, a caller only their
-- own leads. There is no role branching and no privilege escalation in here.
--
-- Definitions (decided with Adish, D-035):
--   * The Today / All-time toggle (p_range) changes ONLY total_leads and the manager portfolios:
--     'today' = leads RECEIVED today (created_at, IST day), 'all' = every lead.
--   * The other numbers keep the window Gautam named and ignore the toggle:
--       untouched     "right now"   first_touch_at is null and the lead is not booked/dropped
--       escalations   "today"       sla_breached_at falls in today's IST day
--       site visits   "this week"   scheduled in the current IST week (Monday start), not cancelled
--   * A manager's portfolio is every lead owned by that manager or anyone below them in the hierarchy
--     (user_hierarchy). It is not territory based, because two managers can share a territory and
--     that would count the same lead twice. Unassigned leads belong to no manager's portfolio.
--   * Days and weeks are Asia/Kolkata. Weeks start on Monday.

create or replace function public.dashboard_counts(p_range text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  day_start  timestamptz := date_trunc('day',  now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
  week_start timestamptz := date_trunc('week', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
begin
  if p_range is null or p_range not in ('today', 'all') then
    raise exception 'range must be today or all' using errcode = '22023';
  end if;

  return (
    select jsonb_build_object(
      'total_leads',
        count(*) filter (where p_range = 'all' or l.created_at >= day_start),
      'untouched',
        count(*) filter (where l.first_touch_at is null and l.pipeline_stage not in ('booked', 'dropped')),
      'untouched_unassigned',
        count(*) filter (where l.first_touch_at is null and l.pipeline_stage not in ('booked', 'dropped') and l.assigned_to is null),
      'escalations_today',
        count(*) filter (where l.sla_breached_at >= day_start),
      'unassigned',
        count(*) filter (where l.assigned_to is null and l.pipeline_stage not in ('booked', 'dropped')),
      -- unassigned live leads are exactly what release_night_queue() picks up at 10:30
      'unassigned_live',
        count(*) filter (where l.assigned_to is null and l.is_live and l.pipeline_stage not in ('booked', 'dropped')),
      'site_visits_week',
        (select count(*) from public.site_visits sv
          where sv.scheduled_at >= week_start
            and sv.scheduled_at <  week_start + interval '7 days'
            and sv.status <> 'cancelled')
    )
    from public.leads l
  );
end $$;

-- One entry per ACTIVE manager the caller may see, ordered by name.
create or replace function public.dashboard_portfolios(p_range text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  day_start timestamptz := date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
begin
  if p_range is null or p_range not in ('today', 'all') then
    raise exception 'range must be today or all' using errcode = '22023';
  end if;

  return coalesce((
    select jsonb_agg(p.j order by p.name)
    from (
      select m.full_name as name,
             jsonb_build_object(
               'manager_id',    m.id,
               'name',          m.full_name,
               'leads',         coalesce(s.leads, 0),
               'untouched',     coalesce(s.untouched, 0),
               'by_stage',      coalesce(s.by_stage, '{}'::jsonb),
               'callers',       coalesce(c.callers, 0),
               'visits_booked', coalesce(v.visits, 0)
             ) as j
      from public.users m
      -- the manager's book: leads owned by them or anyone below them, split by pipeline stage
      left join lateral (
        select sum(t.n)::bigint as leads,
               sum(t.u)::bigint as untouched,
               jsonb_object_agg(t.stage::text, t.n) as by_stage
        from (
          select l.pipeline_stage as stage,
                 count(*) as n,
                 count(*) filter (where l.first_touch_at is null) as u
          from public.user_hierarchy h
          join public.leads l on l.assigned_to = h.descendant_id
          where h.ancestor_id = m.id
            and (p_range = 'all' or l.created_at >= day_start)
          group by l.pipeline_stage
        ) t
      ) s on true
      -- callers under them
      left join lateral (
        select count(*) as callers
        from public.user_hierarchy h
        join public.users cu on cu.id = h.descendant_id
        where h.ancestor_id = m.id and cu.role = 'caller' and cu.is_active
      ) c on true
      -- site visits booked (scheduled, not yet done) on their book
      left join lateral (
        select count(*) as visits
        from public.site_visits sv
        join public.leads l on l.id = sv.lead_id
        join public.user_hierarchy h on h.descendant_id = l.assigned_to
        where h.ancestor_id = m.id and sv.status = 'scheduled'
      ) v on true
      where m.role = 'manager' and m.is_active
    ) p
  ), '[]'::jsonb);
end $$;

revoke all on function public.dashboard_counts(text) from public;
revoke all on function public.dashboard_portfolios(text) from public;
grant execute on function public.dashboard_counts(text) to authenticated;
grant execute on function public.dashboard_portfolios(text) to authenticated;
