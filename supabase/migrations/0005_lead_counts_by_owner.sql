-- 0005_lead_counts_by_owner.sql
-- Per-owner lead counts for the hierarchy tree (task A1.4) and, later, dashboards.
--
-- Aggregated in SQL on purpose: pulling every lead into Node just to count them is slow and
-- burns the free tier's egress allowance (see brain/tasks/sayli-tasks.md D2.3).
--
-- SECURITY INVOKER (the default, stated explicitly): the function runs as the caller, so RLS
-- still decides which leads are counted. A caller gets their own count, a manager the leads
-- they may read, an admin everything. There is no privilege escalation here.
--
-- "Open" = pipeline stage is not terminal. booked and dropped are the two terminal stages
-- (brain/05-lead-flow.md).

create or replace function public.lead_counts_by_owner()
returns table(owner_id uuid, total bigint, open bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select l.assigned_to,
         count(*),
         count(*) filter (where l.pipeline_stage not in ('booked', 'dropped'))
  from public.leads l
  where l.assigned_to is not null
  group by l.assigned_to;
$$;

-- Signed-in users only; never anon.
revoke all on function public.lead_counts_by_owner() from public;
grant execute on function public.lead_counts_by_owner() to authenticated;
