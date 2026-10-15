select 'activities' as table_name,count(*) as record_count,
  md5(coalesce(string_agg(md5(to_jsonb(r)::text),'' order by id),'')) as digest
from public.activities r
union all
select 'financial_obligations',count(*),
  md5(coalesce(string_agg(md5(to_jsonb(r)::text),'' order by id),''))
from public.financial_obligations r
union all
select 'financial_disbursements',count(*),
  md5(coalesce(string_agg(md5(to_jsonb(r)::text),'' order by id),''))
from public.financial_disbursements r;
