-- Read-only post-migration verification. Review unmapped values before any legacy
-- text compatibility field is retired in a future, separately approved change.

select
  subproject."fundSource" as legacy_fund_source,
  count(*) as unmapped_subproject_count
from public.subprojects as subproject
where nullif(btrim(coalesce(subproject."fundSource", '')), '') is not null
  and subproject."fundSourceUid" is null
group by subproject."fundSource"
order by subproject."fundSource";

select
  reference.uid,
  reference.label,
  count(subproject.id) as linked_subproject_count
from public.ref_fund_sources as reference
left join public.subprojects as subproject
  on subproject."fundSourceUid" = reference.uid
group by reference.uid, reference.label, reference.sort_order
order by reference.sort_order, reference.uid;

select
  count(*) filter (where nullif(btrim(coalesce("fundSource", '')), '') is null) as blank_legacy_count,
  count(*) filter (where nullif(btrim(coalesce("fundSource", '')), '') is not null and "fundSourceUid" is not null) as mapped_count,
  count(*) filter (where nullif(btrim(coalesce("fundSource", '')), '') is not null and "fundSourceUid" is null) as unmapped_nonblank_count
from public.subprojects;
