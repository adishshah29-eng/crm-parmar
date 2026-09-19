-- 0001_init.sql — Parmar CRM base schema
-- Canonical structure. See brain/03-data-model.md.

create schema if not exists app;

-- ---------------------------------------------------------------- enums
create type user_role as enum ('super_admin','admin','manager','sub_manager','caller');
create type call_status as enum ('new','attempted','connected','lost');
create type temperature as enum ('hot','warm','cold');
create type pipeline_stage as enum ('enquiry','qualified','site_visit_scheduled','site_visit_done','negotiation','booked','dropped');
create type availability_status as enum ('available','on_site_visit','off');
create type visit_status as enum ('scheduled','done','no_show','cancelled');

-- ---------------------------------------------------------------- org
create table public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null,
  email       text not null unique,
  phone       text,
  role        user_role not null,
  parent_id   uuid references public.users(id),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create index on public.users(parent_id);
create index on public.users(role);

create table public.user_hierarchy (
  ancestor_id   uuid not null references public.users(id) on delete cascade,
  descendant_id uuid not null references public.users(id) on delete cascade,
  depth         int  not null,
  primary key (ancestor_id, descendant_id)
);
create index on public.user_hierarchy(descendant_id);

create table public.locations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  city       text not null,
  created_at timestamptz not null default now(),
  unique (name, city)
);

create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  location_id uuid not null references public.locations(id),
  developer   text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create index on public.projects(location_id);

create table public.user_scopes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  project_id  uuid references public.projects(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  created_at  timestamptz not null default now(),
  constraint one_target check (num_nonnulls(project_id, location_id) = 1)
);
create index on public.user_scopes(user_id);
create index on public.user_scopes(project_id);
create index on public.user_scopes(location_id);

create table public.user_availability (
  user_id     uuid primary key references public.users(id) on delete cascade,
  status      availability_status not null default 'available',
  delegate_to uuid references public.users(id),
  updated_at  timestamptz not null default now(),
  constraint delegate_required check (status <> 'on_site_visit' or delegate_to is not null)
);

-- ---------------------------------------------------------------- leads
create table public.persons (
  id         uuid primary key default gen_random_uuid(),
  phone      text not null unique,
  full_name  text,
  email      text,
  created_at timestamptz not null default now()
);

create table public.sources (
  id      uuid primary key default gen_random_uuid(),
  code    text not null unique,
  name    text not null,
  is_live boolean not null default false
);

create table public.leads (
  id              uuid primary key default gen_random_uuid(),
  person_id       uuid not null references public.persons(id) on delete cascade,
  project_id      uuid not null references public.projects(id),
  location_id     uuid not null references public.locations(id),
  assigned_to     uuid references public.users(id),
  call_status     call_status not null default 'new',
  temperature     temperature,
  pipeline_stage  pipeline_stage not null default 'enquiry',
  is_live         boolean not null default false,
  assigned_at     timestamptz,
  first_touch_at  timestamptz,
  last_activity_at timestamptz,
  next_call_at    timestamptz,
  sla_due_at      timestamptz,
  sla_breached_at timestamptz,
  renurture_at    timestamptz,
  budget_min      numeric,
  budget_max      numeric,
  notes           text,
  created_at      timestamptz not null default now(),
  constraint one_lead_per_person_project unique (person_id, project_id),
  constraint temp_only_when_connected check (temperature is null or call_status = 'connected')
);
create index on public.leads(assigned_to);
create index on public.leads(project_id);
create index on public.leads(location_id);
create index on public.leads(call_status);
create index on public.leads(pipeline_stage);
create index on public.leads(sla_due_at) where first_touch_at is null and sla_breached_at is null;

create table public.lead_sources (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references public.leads(id) on delete cascade,
  source_id   uuid not null references public.sources(id),
  campaign    text,
  received_at timestamptz not null default now(),
  raw_payload jsonb,
  created_at  timestamptz not null default now()
);
create index on public.lead_sources(lead_id);

create table public.lead_activities (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references public.leads(id) on delete cascade,
  user_id       uuid references public.users(id),
  activity_type text not null,
  remark        text,
  from_value    text,
  to_value      text,
  created_at    timestamptz not null default now()
);
create index on public.lead_activities(lead_id, created_at desc);

create table public.assignments (
  id           uuid primary key default gen_random_uuid(),
  lead_id      uuid not null references public.leads(id) on delete cascade,
  from_user_id uuid references public.users(id),
  to_user_id   uuid not null references public.users(id),
  reason       text not null,
  created_by   uuid references public.users(id),
  created_at   timestamptz not null default now()
);
create index on public.assignments(lead_id, created_at desc);

create table public.round_robin_state (
  scope_key    text primary key,
  last_user_id uuid references public.users(id),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------- ops
create table public.site_visits (
  id              uuid primary key default gen_random_uuid(),
  lead_id         uuid not null references public.leads(id) on delete cascade,
  project_id      uuid not null references public.projects(id),
  scheduled_at    timestamptz not null,
  accompanied_by  uuid references public.users(id),
  status          visit_status not null default 'scheduled',
  outcome         text,
  remark          text,
  checkin_at      timestamptz,
  checkin_lat     double precision,
  checkin_lng     double precision,
  within_geofence boolean,
  created_by      uuid references public.users(id),
  created_at      timestamptz not null default now()
);
create index on public.site_visits(lead_id);
create index on public.site_visits(scheduled_at);

create table public.attendance (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users(id) on delete cascade,
  work_date      date not null,
  check_in_at    timestamptz,
  check_in_lat   double precision,
  check_in_lng   double precision,
  check_out_at   timestamptz,
  check_out_lat  double precision,
  check_out_lng  double precision,
  created_at     timestamptz not null default now(),
  unique (user_id, work_date)
);

create table public.geofences (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  lat        double precision not null,
  lng        double precision not null,
  radius_m   int not null default 200
);

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  type       text not null,
  lead_id    uuid references public.leads(id) on delete cascade,
  title      text not null,
  body       text,
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.notifications(user_id, is_read, created_at desc);

create table public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.users(id),
  action      text not null,
  entity_type text,
  entity_id   uuid,
  meta        jsonb,
  created_at  timestamptz not null default now()
);
create index on public.audit_log(actor_id, created_at desc);
create index on public.audit_log(action, created_at desc);

create table public.imports (
  id           uuid primary key default gen_random_uuid(),
  uploaded_by  uuid references public.users(id),
  filename     text not null,
  total_rows   int not null default 0,
  inserted     int not null default 0,
  duplicates   int not null default 0,
  errors       int not null default 0,
  error_report jsonb,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------- hierarchy maintenance
create or replace function app.rebuild_hierarchy()
returns void language plpgsql security definer set search_path = public, app as $$
begin
  delete from public.user_hierarchy;
  with recursive tree as (
    select id as ancestor_id, id as descendant_id, 0 as depth from public.users
    union all
    select t.ancestor_id, u.id, t.depth + 1
    from tree t join public.users u on u.parent_id = t.descendant_id
  )
  insert into public.user_hierarchy select * from tree;
end $$;

create or replace function app.on_user_change()
returns trigger language plpgsql security definer set search_path = public, app as $$
begin
  perform app.rebuild_hierarchy();
  return null;
end $$;

create trigger users_hierarchy_sync
after insert or update of parent_id or delete on public.users
for each statement execute function app.on_user_change();

-- ---------------------------------------------------------------- working hours
create or replace function app.add_working_minutes(from_ts timestamptz, mins int)
returns timestamptz language plpgsql immutable set search_path = public, app as $$
declare
  tz       text := 'Asia/Kolkata';
  cur      timestamp := from_ts at time zone tz;
  open_t   time := time '10:30';
  close_t  time := time '19:30';
  left_min int := mins;
  avail    int;
begin
  loop
    if cur::time < open_t then
      cur := date_trunc('day', cur) + open_t;
    elsif cur::time >= close_t then
      cur := date_trunc('day', cur) + interval '1 day' + open_t;
    end if;

    avail := extract(epoch from ((date_trunc('day', cur) + close_t) - cur)) / 60;

    if left_min <= avail then
      return (cur + make_interval(mins => left_min)) at time zone tz;
    end if;

    left_min := left_min - avail;
    cur := date_trunc('day', cur) + interval '1 day' + open_t;
  end loop;
end $$;

create or replace function app.is_working_hours(ts timestamptz default now())
returns boolean language sql immutable set search_path = public, app as $$
  select (ts at time zone 'Asia/Kolkata')::time >= time '10:30'
     and (ts at time zone 'Asia/Kolkata')::time <  time '19:30';
$$;
