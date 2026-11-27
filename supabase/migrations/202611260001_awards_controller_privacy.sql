-- Apply only after the compatible protected Awards endpoint and frontend are available.
-- This changes access controls only; no existing settings or manual values are rewritten.
begin;
set local lock_timeout='5s';
do $$ begin
 if to_regclass('public.award_result_versions') is null or not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='award_commit_calculated') then
   raise exception 'Install the protected Awards versioning/source gateway before closing legacy browser access.';
 end if;
end $$;
alter table public.award_ranking_settings enable row level security;
alter table public.award_manual_scores enable row level security;
revoke all on table public.award_ranking_settings,public.award_manual_scores from public,anon,authenticated;
revoke all on sequence public.award_manual_scores_id_seq from public,anon,authenticated;
commit;
