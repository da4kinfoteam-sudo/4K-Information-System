-- Extend the shared Fund Source dictionary to Activities and Program Management.
-- New columns remain nullable; existing rows are never assigned a default source.

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'activities',
    'office_requirements',
    'staffing_requirements',
    'other_program_expenses'
  ] loop
    execute format('alter table public.%I add column if not exists "fundSource" text', target_table);
    execute format('alter table public.%I add column if not exists "fundSourceUid" text', target_table);

    execute format('alter table public.%I drop constraint if exists %I', target_table, target_table || '_fund_source_uid_fkey');
    execute format(
      'alter table public.%I add constraint %I foreign key ("fundSourceUid") references public.ref_fund_sources(uid) on update restrict on delete restrict',
      target_table,
      target_table || '_fund_source_uid_fkey'
    );
    execute format(
      'create index if not exists %I on public.%I ("fundSourceUid")',
      target_table || '_fund_source_uid_idx',
      target_table
    );
  end loop;
end;
$$;

create or replace function public.link_legacy_dcf_fund_source()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  normalized_label text := lower(btrim(coalesce(new."fundSource", '')));
  matching_count integer;
  matched_uid text;
begin
  if new."fundSourceUid" is not null or normalized_label = '' then
    return new;
  end if;

  select count(*), min(uid) into matching_count, matched_uid
  from public.ref_fund_sources
  where lower(btrim(label)) = normalized_label;

  if matching_count = 1 then
    new."fundSourceUid" := matched_uid;
  elsif matching_count = 0 then
    matched_uid := case normalized_label
      when '4k fund' then 'FS-000001'
      when 'high value crops' then 'FS-000002'
      when 'corn' then 'FS-000003'
      when 'rice' then 'FS-000004'
      when 'organic' then 'FS-000005'
      when 'livestock' then 'FS-000006'
    end;
    if exists (select 1 from public.ref_fund_sources where uid = matched_uid) then
      new."fundSourceUid" := matched_uid;
    end if;
  end if;

  return new;
end;
$$;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'activities',
    'office_requirements',
    'staffing_requirements',
    'other_program_expenses'
  ] loop
    execute format('drop trigger if exists %I on public.%I', target_table || '_link_legacy_fund_source', target_table);
    execute format(
      'create trigger %I before insert or update of "fundSource", "fundSourceUid" on public.%I for each row execute function public.link_legacy_dcf_fund_source()',
      target_table || '_link_legacy_fund_source',
      target_table
    );

    -- Resolve only labels with exactly one matching reference. Unknown, ambiguous,
    -- and blank values stay unchanged and unlinked.
    execute format(
      'update public.%I as record set "fundSourceUid" = matched.uid from (select lower(btrim(label)) as normalized_label, min(uid) as uid from public.ref_fund_sources group by lower(btrim(label)) having count(*) = 1) as matched where record."fundSourceUid" is null and nullif(btrim(coalesce(record."fundSource", '''')), '''') is not null and lower(btrim(record."fundSource")) = matched.normalized_label',
      target_table
    );
  end loop;
end;
$$;

comment on column public.activities."fundSourceUid" is 'Canonical Fund Source relationship; legacy label remains for compatibility.';
comment on column public.office_requirements."fundSourceUid" is 'Canonical Fund Source relationship; legacy label remains for compatibility.';
comment on column public.staffing_requirements."fundSourceUid" is 'Canonical Fund Source relationship; legacy label remains for compatibility.';
comment on column public.other_program_expenses."fundSourceUid" is 'Canonical Fund Source relationship; legacy label remains for compatibility.';
