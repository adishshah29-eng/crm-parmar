-- 0008_import_leads_batch.sql
-- CSV import (task A3.1), the database half. Implements brain/05-lead-flow.md "Ingestion" exactly:
--
--   * upsert persons by phone; an existing person is reused and only BLANK name/email are filled
--   * resolve the project by name; an unknown project is an error row, never auto-created
--   * upsert the lead by (person, project):
--       new pair      -> insert the lead (call_status new, stage enquiry)
--       existing pair -> NO second lead and NO owner change; the source row is added only
--   * ALWAYS write a lead_sources row (source, campaign, received_at, raw payload)
--   * a new lead from a LIVE source enters routing (app.assign_lead) during working hours; outside
--     working hours it is stored unassigned with next_call_at = the next 10:30 and the
--     release_night_queue job assigns it then. Non-live leads are created unassigned.
--
-- Why one database function instead of many API calls: a 1,200-row file would be thousands of
-- round trips and blow the API's statement timeout. The app sends rows in batches of ~100; each
-- call is one transaction, and each ROW runs in its own subtransaction, so one bad row is recorded
-- as an error and never poisons the batch.

create or replace function public.import_leads_batch(p_import uuid, p_source text, p_campaign text, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  src        public.sources%rowtype;
  j          jsonb;
  v_row      int;
  v_phone    text;
  v_project  public.projects%rowtype;
  v_person   uuid;
  v_lead     uuid;
  v_received timestamptz;
  v_campaign text;
  v_created  boolean;
  n_inserted int := 0;
  n_dups     int := 0;
  errs       jsonb := '[]'::jsonb;
  in_hours   boolean := app.is_working_hours();
begin
  if not app.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then
    raise exception 'invalid rows' using errcode = '22023';
  end if;
  select * into src from public.sources where code = p_source;
  if not found then
    raise exception 'unknown source' using errcode = '22023';
  end if;
  if not exists (select 1 from public.imports where id = p_import) then
    raise exception 'unknown import' using errcode = '22023';
  end if;

  for j in select value from jsonb_array_elements(p_rows) loop
    v_row := coalesce((j ->> 'row')::int, 0);
    v_lead := null;
    v_created := false;

    begin
      -- rows the app already rejected (bad phone, bad date, no project) are only recorded
      if coalesce(j ->> 'error', '') <> '' then
        errs := errs || jsonb_build_object('row', v_row, 'reason', j ->> 'error', 'raw', j -> 'raw');
        continue;
      end if;

      v_phone := j ->> 'phone';
      if v_phone is null or v_phone !~ '^\+[1-9][0-9]{7,14}$' then
        raise exception 'No valid phone number';
      end if;

      select * into v_project from public.projects
       where lower(name) = lower(btrim(coalesce(j ->> 'project', '')))
       limit 1;
      if not found then
        raise exception 'Unknown project "%"', coalesce(j ->> 'project', '');
      end if;
      if not v_project.is_active then
        raise exception 'Project "%" is inactive', v_project.name;
      end if;

      -- person: reuse by phone, fill BLANK name/email only, never overwrite
      insert into public.persons (phone, full_name, email)
      values (v_phone, nullif(btrim(j ->> 'name'), ''), nullif(btrim(j ->> 'email'), ''))
      on conflict (phone) do update
        set full_name = coalesce(nullif(persons.full_name, ''), excluded.full_name),
            email     = coalesce(nullif(persons.email, ''),     excluded.email)
      returning id into v_person;

      -- lead: one per (person, project)
      insert into public.leads (person_id, project_id, location_id, is_live, next_call_at)
      values (
        v_person, v_project.id, v_project.location_id, src.is_live,
        case when src.is_live and not in_hours then app.add_working_minutes(now(), 0) else null end
      )
      on conflict (person_id, project_id) do nothing
      returning id into v_lead;

      v_created := v_lead is not null;
      if not v_created then
        select id into v_lead from public.leads where person_id = v_person and project_id = v_project.id;
      end if;

      -- the source row is written for EVERY row, new lead or duplicate: nothing is merged away
      v_received := nullif(j ->> 'received_at', '')::timestamptz;
      v_campaign := coalesce(nullif(btrim(j ->> 'campaign'), ''), nullif(btrim(p_campaign), ''));
      insert into public.lead_sources (lead_id, source_id, campaign, received_at, raw_payload)
      values (v_lead, src.id, v_campaign, coalesce(v_received, now()), j -> 'raw');

      -- live + new + working hours -> round robin now. Outside hours the lead waits for 10:30.
      if v_created and src.is_live and in_hours then
        perform app.assign_lead(v_lead, 'round_robin');
      end if;

      -- counted only once every statement for the row has succeeded
      if v_created then n_inserted := n_inserted + 1; else n_dups := n_dups + 1; end if;

    exception when others then
      errs := errs || jsonb_build_object(
        'row', v_row,
        -- our own messages (raise exception) are safe to show; anything else stays generic
        'reason', case when sqlstate = 'P0001' then sqlerrm else 'Could not import this row' end,
        'raw', j -> 'raw'
      );
    end;
  end loop;

  update public.imports
     set inserted     = inserted   + n_inserted,
         duplicates   = duplicates + n_dups,
         errors       = errors     + jsonb_array_length(errs),
         error_report = coalesce(error_report, '[]'::jsonb) || errs
   where id = p_import;

  return jsonb_build_object('inserted', n_inserted, 'duplicates', n_dups, 'errors', errs);
end $$;

revoke all on function public.import_leads_batch(uuid, text, text, jsonb) from public;
grant execute on function public.import_leads_batch(uuid, text, text, jsonb) to authenticated;
