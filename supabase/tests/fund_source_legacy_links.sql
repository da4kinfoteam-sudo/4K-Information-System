-- Use a temporary table to exercise the compatibility trigger without changing
-- any production subproject or reference row.
begin;
create temporary table fund_source_legacy_check (
  id integer,
  "fundSource" text,
  "fundSourceUid" text
);
create trigger link_fund_source_check
before insert or update of "fundSource", "fundSourceUid" on fund_source_legacy_check
for each row execute function public.link_legacy_subproject_fund_source();
grant select, insert, update on fund_source_legacy_check to anon;
set local role anon;

insert into fund_source_legacy_check values
  (1, '4K Fund', null),
  (2, null, null),
  (3, '', null),
  (4, '__unknown_fund_source_check__', null),
  (5, 'Rice', 'FS-000001');
update fund_source_legacy_check set "fundSource" = 'Corn' where id = 2;

do $$
begin
  if (select "fundSourceUid" from fund_source_legacy_check where id = 1) is distinct from 'FS-000001' then
    raise exception 'Label-only inserts did not receive the matching UID.';
  end if;
  if (select "fundSourceUid" from fund_source_legacy_check where id = 2) is distinct from 'FS-000003' then
    raise exception 'Label-only updates did not receive the matching UID.';
  end if;
  if exists (select 1 from fund_source_legacy_check where id in (3, 4) and "fundSourceUid" is not null) then
    raise exception 'Blank or unknown labels were assigned an unrelated UID.';
  end if;
  if (select "fundSourceUid" from fund_source_legacy_check where id = 5) is distinct from 'FS-000001' then
    raise exception 'An existing UID was replaced.';
  end if;
end;
$$;
rollback;
select 'Legacy label-only inserts/updates, blank/unknown values, and existing UID preservation passed.' as result;
