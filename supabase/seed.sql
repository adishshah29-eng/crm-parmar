-- seed.sql — shared mock dataset. Identical for all four developers.
-- MOCK DATA ONLY. Never load real client leads into the free-tier project (D-009).
--
-- Auth users must be created first (dashboard -> Authentication -> Users, auto-confirm)
-- with these exact emails. The seed looks their uuids up by email — nothing to paste.
--   super@parmar.test / admin1@parmar.test / mgr.worli@parmar.test
--   mgr.pune@parmar.test / sub.worli@parmar.test
--   caller1@parmar.test / caller2@parmar.test / caller3@parmar.test
-- Password for all: Test@12345

-- ---------------------------------------------------------------- locations
insert into public.locations (id, name, city) values
  ('11111111-0000-0000-0000-000000000001','Worli','Mumbai'),
  ('11111111-0000-0000-0000-000000000002','Mahalaxmi','Mumbai'),
  ('11111111-0000-0000-0000-000000000003','Sewri','Mumbai'),
  ('11111111-0000-0000-0000-000000000004','Parel','Mumbai'),
  ('11111111-0000-0000-0000-000000000005','Punawale','Pune')
on conflict do nothing;

-- ---------------------------------------------------------------- projects
insert into public.projects (id, name, location_id, developer) values
  ('22222222-0000-0000-0000-000000000001','Raheja Imperia Worli','11111111-0000-0000-0000-000000000001','K Raheja'),
  ('22222222-0000-0000-0000-000000000002','Lodha Bellevue','11111111-0000-0000-0000-000000000002','Lodha'),
  ('22222222-0000-0000-0000-000000000003','Runwal 7 Mahalaxmi','11111111-0000-0000-0000-000000000002','Runwal'),
  ('22222222-0000-0000-0000-000000000004','Sattva Parel','11111111-0000-0000-0000-000000000004','Sattva'),
  ('22222222-0000-0000-0000-000000000005','Lodha Aureus Sewri','11111111-0000-0000-0000-000000000003','Lodha'),
  ('22222222-0000-0000-0000-000000000006','Supreme Rivana','11111111-0000-0000-0000-000000000005','Supreme Universal')
on conflict do nothing;

-- ---------------------------------------------------------------- sources
insert into public.sources (id, code, name, is_live) values
  ('33333333-0000-0000-0000-000000000001','meta','Meta Lead Ads', true),
  ('33333333-0000-0000-0000-000000000002','99acres','99acres', true),
  ('33333333-0000-0000-0000-000000000003','magicbricks','MagicBricks', true),
  ('33333333-0000-0000-0000-000000000004','housing','Housing.com', true),
  ('33333333-0000-0000-0000-000000000005','agent','Listing agent', true),
  ('33333333-0000-0000-0000-000000000006','walkin','Walk-in', false),
  ('33333333-0000-0000-0000-000000000007','referral','Referral', false)
on conflict do nothing;

-- ---------------------------------------------------------------- geofences
insert into public.geofences (project_id, lat, lng, radius_m) values
  ('22222222-0000-0000-0000-000000000001', 19.0176, 72.8162, 200),
  ('22222222-0000-0000-0000-000000000002', 18.9826, 72.8199, 200),
  ('22222222-0000-0000-0000-000000000006', 18.6298, 73.7089, 300)
on conflict do nothing;

-- ---------------------------------------------------------------- users
-- Looks up the auth.users ids by email, so create the eight auth users first.
-- Fails loudly if any are missing rather than half-seeding.
do $$
declare
  emails text[] := array['super@parmar.test','admin1@parmar.test','mgr.worli@parmar.test',
    'mgr.pune@parmar.test','sub.worli@parmar.test','caller1@parmar.test','caller2@parmar.test','caller3@parmar.test'];
  found int;
  v_super uuid; v_admin uuid; v_mw uuid; v_mp uuid; v_sub uuid; v_c1 uuid; v_c2 uuid; v_c3 uuid;
begin
  select count(*) into found from auth.users where email = any(emails);
  if found <> 8 then
    raise exception 'Expected 8 auth users, found %. Create them first (see brain/PHASE-0-RUNBOOK.md step 8).', found;
  end if;

  select id into v_super from auth.users where email = 'super@parmar.test';
  select id into v_admin from auth.users where email = 'admin1@parmar.test';
  select id into v_mw    from auth.users where email = 'mgr.worli@parmar.test';
  select id into v_mp    from auth.users where email = 'mgr.pune@parmar.test';
  select id into v_sub   from auth.users where email = 'sub.worli@parmar.test';
  select id into v_c1    from auth.users where email = 'caller1@parmar.test';
  select id into v_c2    from auth.users where email = 'caller2@parmar.test';
  select id into v_c3    from auth.users where email = 'caller3@parmar.test';

  -- one statement, so the hierarchy trigger fires once after every row exists
  insert into public.users (id, full_name, email, role, parent_id) values
    (v_super, 'Gautam Parmar', 'super@parmar.test',     'super_admin', null),
    (v_admin, 'Admin One',     'admin1@parmar.test',    'admin',       v_super),
    (v_mw,    'Manager Worli', 'mgr.worli@parmar.test', 'manager',     v_admin),
    (v_mp,    'Manager Pune',  'mgr.pune@parmar.test',  'manager',     v_admin),
    (v_sub,   'Sub Worli',     'sub.worli@parmar.test', 'sub_manager', v_mw),
    (v_c1,    'Caller One',    'caller1@parmar.test',   'caller',      v_sub),
    (v_c2,    'Caller Two',    'caller2@parmar.test',   'caller',      v_sub),
    (v_c3,    'Caller Three',  'caller3@parmar.test',   'caller',      v_mp)
  on conflict (id) do nothing;

  -- territories: Worli manager holds two projects, Pune manager holds a location.
  -- Projects 3, 4, 5 (Runwal, Sattva, Aureus) deliberately have no manager: only admins see them.
  insert into public.user_scopes (user_id, project_id, location_id) values
    (v_mw, '22222222-0000-0000-0000-000000000001', null),
    (v_mw, '22222222-0000-0000-0000-000000000002', null),
    (v_mp, null, '11111111-0000-0000-0000-000000000005');

  insert into public.user_availability (user_id, status)
  select id, 'available' from public.users where role <> 'super_admin' and role <> 'admin'
  on conflict (user_id) do nothing;

  -- checked in today, so round robin has candidates. Re-run this insert on any later day.
  insert into public.attendance (user_id, work_date, check_in_at)
  select id, (now() at time zone 'Asia/Kolkata')::date, now()
  from public.users where role = 'caller'
  on conflict (user_id, work_date) do nothing;
end $$;

-- ---------------------------------------------------------------- mock leads
-- 40 persons, spread across projects, statuses and stages.
do $$
declare
  i int;
  pid uuid;
  proj uuid;
  loc uuid;
  projects uuid[] := array[
    '22222222-0000-0000-0000-000000000001','22222222-0000-0000-0000-000000000002',
    '22222222-0000-0000-0000-000000000003','22222222-0000-0000-0000-000000000004',
    '22222222-0000-0000-0000-000000000005','22222222-0000-0000-0000-000000000006'];
  statuses call_status[] := array['new','attempted','connected','lost']::call_status[];
  stages pipeline_stage[] := array['enquiry','qualified','site_visit_scheduled','site_visit_done','negotiation','booked','dropped']::pipeline_stage[];
begin
  for i in 1..40 loop
    insert into public.persons (phone, full_name, email)
    values ('+9198' || lpad((10000000 + i)::text, 8, '0'),
            'Mock Buyer ' || i,
            'buyer' || i || '@example.test')
    returning id into pid;

    proj := projects[1 + (i % 6)];
    select location_id into loc from public.projects where id = proj;

    insert into public.leads (person_id, project_id, location_id, call_status, temperature, pipeline_stage, is_live, budget_min, budget_max)
    values (
      pid, proj, loc,
      statuses[1 + (i % 4)],
      case when statuses[1 + (i % 4)] = 'connected'
           then (array['hot','warm','cold']::temperature[])[1 + (i % 3)] else null end,
      stages[1 + (i % 7)],
      (i % 3) <> 0,
      50000000 + (i * 5000000),
      90000000 + (i * 5000000)
    );

    insert into public.lead_sources (lead_id, source_id, campaign)
    select l.id,
           (select id from public.sources offset (i % 7) limit 1),
           'mock-campaign-' || (1 + (i % 3))
    from public.leads l where l.person_id = pid;
  end loop;

  -- one person enquiring on two projects, to exercise the person-360 view
  insert into public.persons (phone, full_name, email)
  values ('+919899999999','Multi Project Buyer','multi@example.test')
  returning id into pid;

  insert into public.leads (person_id, project_id, location_id, is_live)
  values (pid,'22222222-0000-0000-0000-000000000002','11111111-0000-0000-0000-000000000002', true),
         (pid,'22222222-0000-0000-0000-000000000005','11111111-0000-0000-0000-000000000003', true);
end $$;

-- ---------------------------------------------------------------- assignments
-- Give the access tests something real to prove. Without owners, "a caller sees only
-- their own leads" passes on zero rows and proves nothing.
--   Raheja + Bellevue  -> Worli callers, alternating
--   Supreme Rivana     -> caller3 (Pune)
--   Runwal/Sattva/Aureus -> left unassigned; visible to admins only
--   one Raheja lead    -> owned directly by mgr.pune (a manager who owns a lead outside his own
--                         territory, which mgr.worli must still see through the shared project)
do $$
declare
  v_c1 uuid; v_c2 uuid; v_c3 uuid; v_mp uuid; special uuid;
begin
  select id into v_c1 from public.users where email = 'caller1@parmar.test';
  select id into v_c2 from public.users where email = 'caller2@parmar.test';
  select id into v_c3 from public.users where email = 'caller3@parmar.test';
  select id into v_mp from public.users where email = 'mgr.pune@parmar.test';

  with ranked as (
    select id, row_number() over (order by created_at, id) rn
    from public.leads
    where project_id in ('22222222-0000-0000-0000-000000000001','22222222-0000-0000-0000-000000000002')
  )
  update public.leads l
     set assigned_to = case when r.rn % 2 = 0 then v_c1 else v_c2 end, assigned_at = now()
    from ranked r where l.id = r.id;

  update public.leads set assigned_to = v_c3, assigned_at = now()
   where project_id = '22222222-0000-0000-0000-000000000006';

  select id into special from public.leads
   where project_id = '22222222-0000-0000-0000-000000000001' order by created_at, id limit 1;
  update public.leads set assigned_to = v_mp, assigned_at = now() where id = special;
end $$;
