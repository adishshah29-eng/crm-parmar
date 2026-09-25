-- 0013_search_trigram.sql — make the lead search fast at 20k+ leads. No change to access or behaviour.
--
-- The list search is `full_name ilike '%x%'` OR `phone ilike '%digits%'` on persons. A leading
-- wildcard cannot use a btree index, so every search scanned all persons (1.4 s as a manager at
-- 20,042 leads, budget 600 ms). Trigram (pg_trgm) GIN indexes serve ilike '%...%' directly.
--
-- pg_trgm lives in the `extensions` schema on Supabase, so the operator class is schema-qualified.

create extension if not exists pg_trgm with schema extensions;

create index if not exists persons_phone_trgm_idx
  on public.persons using gin (phone extensions.gin_trgm_ops);

create index if not exists persons_full_name_trgm_idx
  on public.persons using gin (full_name extensions.gin_trgm_ops);
