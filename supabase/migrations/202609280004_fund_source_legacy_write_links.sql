-- Older browser tabs can still write the legacy label without the new UID.
-- Fill only missing links; an existing UID remains authoritative.
create or replace function public.link_legacy_subproject_fund_source()
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
    -- Retain the identities of the original fixed choices after label edits.
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

create trigger subprojects_link_legacy_fund_source
before insert or update of "fundSource", "fundSourceUid" on public.subprojects
for each row execute function public.link_legacy_subproject_fund_source();

-- Link only unambiguous matches that arrived after the original backfill.
update public.subprojects s
set "fundSourceUid" = matched.uid
from (
  select lower(btrim(label)) as normalized_label, min(uid) as uid
  from public.ref_fund_sources
  group by lower(btrim(label))
  having count(*) = 1
) matched
where s."fundSourceUid" is null
  and nullif(btrim(coalesce(s."fundSource", '')), '') is not null
  and lower(btrim(s."fundSource")) = matched.normalized_label;
