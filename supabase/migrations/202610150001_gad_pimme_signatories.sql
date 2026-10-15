-- Optional annual signatories. No existing business values are rewritten.
alter table public.gad_pimme_assessments
  add column if not exists prepared_by_name text,
  add column if not exists prepared_by_position text,
  add column if not exists reviewed_by_name text,
  add column if not exists reviewed_by_position text,
  add column if not exists approved_by_name text,
  add column if not exists approved_by_position text;

-- Keep the five-argument function intact for old clients. The overload delegates
-- authorization/scoring to it, then saves optional fields in the same transaction.
create or replace function public.save_gad_pimme_assessment(
  p_operating_unit text,
  p_year integer,
  p_answers jsonb,
  p_actor_id bigint,
  p_actor_name text,
  p_signatories jsonb
)
returns public.gad_pimme_assessments
language plpgsql
security definer
set search_path = public
as $$
declare
  saved public.gad_pimme_assessments%rowtype;
  field_name text;
  fields jsonb := coalesce(p_signatories, '{}'::jsonb);
begin
  if jsonb_typeof(fields) <> 'object' then
    raise exception 'Signatories must be an object.';
  end if;
  for field_name in select jsonb_object_keys(fields) loop
    if field_name not in (
      'prepared_by_name', 'prepared_by_position', 'reviewed_by_name',
      'reviewed_by_position', 'approved_by_name', 'approved_by_position'
    ) then raise exception 'Unknown signatory field: %.', field_name; end if;
    if jsonb_typeof(fields->field_name) not in ('string', 'null') then
      raise exception 'Signatory fields must contain text or null.';
    end if;
  end loop;

  select * into saved from public.save_gad_pimme_assessment(
    p_operating_unit, p_year, p_answers, p_actor_id, p_actor_name
  );
  update public.gad_pimme_assessments set
    prepared_by_name = case when fields ? 'prepared_by_name' then nullif(trim(fields->>'prepared_by_name'), '') else prepared_by_name end,
    prepared_by_position = case when fields ? 'prepared_by_position' then nullif(trim(fields->>'prepared_by_position'), '') else prepared_by_position end,
    reviewed_by_name = case when fields ? 'reviewed_by_name' then nullif(trim(fields->>'reviewed_by_name'), '') else reviewed_by_name end,
    reviewed_by_position = case when fields ? 'reviewed_by_position' then nullif(trim(fields->>'reviewed_by_position'), '') else reviewed_by_position end,
    approved_by_name = case when fields ? 'approved_by_name' then nullif(trim(fields->>'approved_by_name'), '') else approved_by_name end,
    approved_by_position = case when fields ? 'approved_by_position' then nullif(trim(fields->>'approved_by_position'), '') else approved_by_position end
  where id = saved.id returning * into saved;
  return saved;
end;
$$;

revoke all on function public.save_gad_pimme_assessment(text, integer, jsonb, bigint, text, jsonb) from public;
grant execute on function public.save_gad_pimme_assessment(text, integer, jsonb, bigint, text, jsonb) to anon, authenticated;
