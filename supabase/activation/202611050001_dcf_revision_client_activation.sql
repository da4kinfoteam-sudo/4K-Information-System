-- Deliberately outside migrations: a routine db push must NOT activate this.
-- FINAL ACTIVATION ONLY: apply after support migrations, frontend publication
-- and the separately approved old-client transition. No business rows are changed.
begin;
set local lock_timeout='5s';
do $$ begin
  if to_regprocedure('public.commit_dcf_change(bigint,text,text,bigint,jsonb,jsonb,jsonb,uuid,text,text,uuid)') is null
    or to_regprocedure('public.apply_dcf_restore(bigint,text,text,bigint,bigint,bigint,text,text,boolean,uuid,uuid)') is null then
    raise exception 'Install compatible DCF transactional and restore support before client activation.';
  end if;
end $$;
create or replace function public.dcf_browser_guard_enabled() returns boolean
language sql immutable set search_path=public,pg_temp as $$ select true $$;
revoke all on function public.dcf_browser_guard_enabled() from public,anon,authenticated;
commit;
