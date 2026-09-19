-- Additive Subproject Fund Source metadata and OU write-scope enforcement.
-- Existing Subproject rows are not updated or backfilled.

alter table public.subprojects
  add column if not exists "fundSource" text;

alter table public.subprojects
  drop constraint if exists subprojects_fund_source_check;

alter table public.subprojects
  add constraint subprojects_fund_source_check
  check (
    "fundSource" is null
    or "fundSource" in (
      '4K Fund',
      'High Value Crops',
      'Corn',
      'Rice',
      'Organic',
      'Livestock'
    )
  ) not valid;

create or replace function public.can_write_subproject_ou(target_operating_unit text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.users%rowtype;
  role_scope text;
begin
  select * into actor
  from public.users
  where auth_id = auth.uid()
  limit 1;

  if actor.id is null or nullif(trim(coalesce(target_operating_unit, '')), '') is null then
    return false;
  end if;

  if actor.role = 'Super Admin' then
    return true;
  end if;

  select rc.visibility_scope into role_scope
  from public.roles_config rc
  where rc.role = actor.role
    and rc.module = 'Subprojects'
  limit 1;

  if actor.visibility_scope = 'All OUs'
    or (actor.visibility_scope is null and role_scope = 'All OUs')
    or (actor.visibility_scope is null and role_scope is null and actor.role in ('Administrator', 'Management')) then
    return true;
  end if;

  return target_operating_unit = actor."operatingUnit";
end;
$$;

drop policy if exists subprojects_insert_policy on public.subprojects;
create policy subprojects_insert_policy on public.subprojects
for insert to authenticated
with check (public.can_write_subproject_ou("operatingUnit"));

drop policy if exists subprojects_update_policy on public.subprojects;
create policy subprojects_update_policy on public.subprojects
for update to authenticated
using (public.can_write_subproject_ou("operatingUnit"))
with check (public.can_write_subproject_ou("operatingUnit"));
