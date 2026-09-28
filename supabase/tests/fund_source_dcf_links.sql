-- Exercise the DCF compatibility trigger without changing production records.
begin;

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
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = target_table
        and column_name = 'fundSource'
    ) or not exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = target_table
        and column_name = 'fundSourceUid'
    ) then
      raise exception 'Fund Source columns are missing from %.', target_table;
    end if;
    if not exists (
      select 1
      from pg_constraint constraint_row
      join pg_class table_row on table_row.oid = constraint_row.conrelid
      join pg_namespace schema_row on schema_row.oid = table_row.relnamespace
      where schema_row.nspname = 'public'
        and table_row.relname = target_table
        and constraint_row.conname = target_table || '_fund_source_uid_fkey'
        and constraint_row.contype = 'f'
    ) then
      raise exception 'Fund Source UID foreign key is missing from %.', target_table;
    end if;
  end loop;
end;
$$;

create temporary table fund_source_dcf_legacy_check (
  id integer,
  "fundSource" text,
  "fundSourceUid" text
);
create trigger link_fund_source_dcf_check
before insert or update of "fundSource", "fundSourceUid"
on fund_source_dcf_legacy_check
for each row execute function public.link_legacy_dcf_fund_source();
grant select, insert, update on fund_source_dcf_legacy_check to anon;
set local role anon;

insert into fund_source_dcf_legacy_check values
  (1, '4K Fund', null),
  (2, null, null),
  (3, '', null),
  (4, '__unknown_dcf_fund_source_check__', null),
  (5, 'Rice', 'FS-000001');
update fund_source_dcf_legacy_check set "fundSource" = 'Corn' where id = 2;

do $$
begin
  if (select "fundSourceUid" from fund_source_dcf_legacy_check where id = 1) is distinct from 'FS-000001' then
    raise exception 'Legacy label-only DCF insert did not receive its matching UID.';
  end if;
  if (select "fundSourceUid" from fund_source_dcf_legacy_check where id = 2) is distinct from 'FS-000003' then
    raise exception 'Legacy label-only DCF update did not receive its matching UID.';
  end if;
  if exists (select 1 from fund_source_dcf_legacy_check where id in (3, 4) and "fundSourceUid" is not null) then
    raise exception 'Blank or unknown DCF labels were assigned a Fund Source UID.';
  end if;
  if (select "fundSourceUid" from fund_source_dcf_legacy_check where id = 5) is distinct from 'FS-000001' then
    raise exception 'The DCF compatibility trigger replaced an existing UID.';
  end if;
end;
$$;

rollback;
select 'DCF Fund Source columns, foreign keys, legacy linking, blank/unknown preservation, and UID preservation passed.' as result;
