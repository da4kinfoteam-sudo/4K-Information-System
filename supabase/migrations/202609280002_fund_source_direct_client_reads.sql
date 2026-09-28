-- The application uses its own login and reads reference data as the anon role.
-- Restore access to the existing global dictionary without changing any records.
grant select on public.ref_fund_sources to anon;

create policy ref_fund_sources_direct_client_view_policy
on public.ref_fund_sources
for select to anon
using (true);
