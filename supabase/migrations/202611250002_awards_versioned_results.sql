-- Local preparation only. No source backfill, scoring activation or historical-result fabrication.
begin;
set local lock_timeout='5s';
set local statement_timeout='90s';

create table public.award_controller_state (
 singleton boolean primary key default true check(singleton),version bigint not null,
 updated_by bigint not null,updated_at timestamptz not null default clock_timestamp()
);
create table public.award_policy_versions (
 id uuid primary key default gen_random_uuid(),awards_year integer not null check(awards_year between 1900 and 9999),
 scope_key text not null,scope jsonb not null,version bigint not null,policy jsonb not null,
 previous_policy_id uuid references public.award_policy_versions(id),created_by bigint not null,
 created_by_name text not null,reason text not null,created_at timestamptz not null default clock_timestamp(),unique(awards_year,scope_key,version)
);
create table public.award_policy_heads (
 awards_year integer not null,scope_key text not null,policy_id uuid not null references public.award_policy_versions(id),
 primary key(awards_year,scope_key)
);
create table public.award_calculation_captures (
 id uuid primary key default gen_random_uuid(),awards_year integer not null,scope_key text not null,scope jsonb not null,
 actor_id bigint not null,policy_id uuid references public.award_policy_versions(id),
 controller_version bigint not null,result_head_version bigint not null,inputs jsonb not null,source_hash text not null,
 dependencies jsonb not null default '[]',source_data_as_of timestamptz not null default clock_timestamp(),
 created_at timestamptz not null default clock_timestamp(),expires_at timestamptz not null default clock_timestamp()+interval '15 minutes'
);
create table public.award_result_versions (
 id uuid primary key default gen_random_uuid(),awards_year integer not null,scope_key text not null,scope jsonb not null,
 version bigint not null,policy_id uuid references public.award_policy_versions(id),capture_id uuid not null unique references public.award_calculation_captures(id),
 previous_result_id uuid references public.award_result_versions(id),snapshot jsonb not null,snapshot_hash text not null,
 source_hash text not null,source_data_as_of timestamptz not null,dependencies jsonb not null,carry_hash text not null,
 finalized_by bigint not null,finalized_by_name text not null,reason text not null,
 finalized_at timestamptz not null default clock_timestamp(),unique(awards_year,scope_key,version)
);
create table public.award_result_heads (
 awards_year integer not null,scope_key text not null,version bigint not null default 0,
 active_result_id uuid references public.award_result_versions(id),primary key(awards_year,scope_key)
);
create table public.award_result_activations (
 id uuid primary key default gen_random_uuid(),awards_year integer not null,scope_key text not null,
 previous_result_id uuid references public.award_result_versions(id),result_id uuid not null references public.award_result_versions(id),
 action text not null check(action in ('Finalized','Restored','Reconciled')),actor_id bigint not null,actor_name text not null,
 operation_id uuid not null default gen_random_uuid(),head_version bigint not null,
 reason text not null,created_at timestamptz not null default clock_timestamp(),unique(awards_year,scope_key,head_version)
);
create table public.award_mutation_requests (
 actor_id bigint not null,request_id uuid not null,payload_hash text not null,response jsonb not null,
 created_at timestamptz not null default clock_timestamp(),primary key(actor_id,request_id)
);
create index award_result_history_idx on public.award_result_versions(awards_year,scope_key,version desc);
create index award_activation_history_idx on public.award_result_activations(awards_year,scope_key,created_at desc,id);

create function public.award_verified_actor(p_session text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.resource_sessions%rowtype;u public.users%rowtype;r public.roles_config%rowtype;visibility text;
begin
 if p_session is null or p_session !~ '^[a-f0-9]{64}$' then raise exception 'Verify your account to continue.' using errcode='28000'; end if;
 select * into s from public.resource_sessions where token_hash=public.resource_digest(p_session) and revoked_at is null and expires_at>clock_timestamp();
 if not found then raise exception 'Your session expired. Verify your account again.' using errcode='28000'; end if;
 select * into u from public.users where id=s.actor_id;
 if not found or public.resource_digest(coalesce(to_jsonb(u)->>'password',''))<>s.credential_hash or coalesce(to_jsonb(u)->>'is_active','true')='false' then raise exception 'Your account session changed.' using errcode='28000'; end if;
 -- The existing Awards page permits these two roles. This does not grant Repository management.
 if u.role not in ('Super Admin','Administrator') then raise exception 'Access denied.' using errcode='42501'; end if;
 select * into r from public.roles_config where role=u.role and module='Dashboards';
 visibility:=coalesce(nullif(to_jsonb(u)->>'visibility_scope',''),nullif(r.visibility_scope,''),'All OUs');
 if visibility not in ('All OUs','Own OU') then visibility:='Own OU'; end if;
 if visibility='Own OU' and not coalesce(public.resource_ou(u."operatingUnit"),false) then raise exception 'Your operating unit is unavailable.' using errcode='42501'; end if;
 return jsonb_build_object('id',u.id,'name',coalesce(nullif(to_jsonb(u)->>'fullName',''),to_jsonb(u)->>'username'),'role',u.role,'operatingUnit',u."operatingUnit",'visibility',visibility);
end $$;

create function public.award_normalize_scope(p_actor jsonb,p_scope jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare k text;v jsonb;normalized jsonb:='{}';ous text[];
begin
 if p_scope is null or jsonb_typeof(p_scope)<>'object' or exists(select 1 from jsonb_object_keys(p_scope) x where x not in ('ous','tiers','fundTypes','fundSources','sourceFundYears')) then raise exception 'Invalid Awards scope.' using errcode='22023'; end if;
 foreach k in array array['ous','tiers','fundTypes','fundSources','sourceFundYears'] loop
   v:=p_scope->k;
   if v is not null and v<>'null'::jsonb then
     if jsonb_typeof(v)<>'array' then raise exception 'Invalid Awards selection.' using errcode='22023'; end if;
     if jsonb_array_length(v)>100 or exists(select 1 from jsonb_array_elements(v) x where jsonb_typeof(x)<>'string' or length(x#>>'{}') not between 1 and 200) then raise exception 'Invalid Awards selection.' using errcode='22023'; end if;
     select coalesce(jsonb_agg(x order by x),'[]') into v from (select distinct value x from jsonb_array_elements_text(v)) q;
   else v:='null'; end if;
   normalized:=normalized||jsonb_build_object(k,v);
 end loop;
 if normalized->'ous'='null'::jsonb then
   select array_agg(x order by x) into ous from unnest(array['NPMO','RPMO CAR','RPMO 1','RPMO 2','RPMO 3','RPMO 4A','RPMO 4B','RPMO 5','RPMO 6','RPMO 7','RPMO 8','RPMO 9','RPMO 10','RPMO 11','RPMO 12','RPMO 13','RPMO NIR']) x;
 else select array_agg(x order by x) into ous from jsonb_array_elements_text(normalized->'ous') x; end if;
 if ous is null or exists(select 1 from unnest(ous) x where not public.resource_ou(x)) then raise exception 'Choose valid operating units.' using errcode='22023'; end if;
 if p_actor->>'visibility'='Own OU' then
   if p_scope->'ous' is not null and p_scope->'ous'<>'null'::jsonb and (cardinality(ous)<>1 or ous[1]<>p_actor->>'operatingUnit') then raise exception 'The selection is outside your OU scope.' using errcode='42501'; end if;
   ous:=array[p_actor->>'operatingUnit'];
 end if;
 return normalized||jsonb_build_object('ous',to_jsonb(ous));
end $$;

create function public.award_validate_policy(p_year integer,p_policy jsonb) returns void
language plpgsql set search_path=public,pg_temp as $$
declare stage text;start_value date;end_value date;
begin
 if p_year is null or p_year not between 1900 and 9999 or jsonb_typeof(p_policy) is distinct from 'object' or p_policy->'schemaVersion' is distinct from '1'::jsonb or p_policy->>'formulaVersion' is distinct from 'awards-v2' or p_policy->'awardsYear' is distinct from to_jsonb(p_year) or coalesce(p_policy->>'mode','') not in ('Legacy','Cutoff') or jsonb_typeof(p_policy->'mode') is distinct from 'string' then raise exception 'Invalid annual policy.' using errcode='22023'; end if;
 if (select count(*) from jsonb_object_keys(p_policy))<>10 or exists(select 1 from jsonb_object_keys(p_policy) x where x not in ('schemaVersion','mode','awardsYear','physicalStart','physicalCutoff','financialStart','financialCutoff','transitionApproved','baselineResultId','formulaVersion')) then raise exception 'Invalid policy fields.' using errcode='22023'; end if;
 foreach stage in array array['physical','financial'] loop
   if jsonb_typeof(p_policy->(stage||'Start')) is distinct from 'string' or jsonb_typeof(p_policy->(stage||'Cutoff')) is distinct from 'string' or coalesce(p_policy->>(stage||'Start'),'') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(p_policy->>(stage||'Cutoff'),'') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Choose complete recognition dates.' using errcode='22023'; end if;
   start_value:=(p_policy->>(stage||'Start'))::date;end_value:=(p_policy->>(stage||'Cutoff'))::date;
   if start_value>end_value or extract(year from end_value)<>p_year or extract(year from start_value)<p_year-1 then raise exception 'Recognition dates are inconsistent.' using errcode='22023'; end if;
 end loop;
 if jsonb_typeof(p_policy->'transitionApproved') is distinct from 'boolean' or (p_policy->>'mode'='Cutoff' and p_policy->>'transitionApproved'<>'true') then raise exception 'Approve the opening transition before enabling annual cutoffs.' using errcode='22023'; end if;
 if p_policy->'baselineResultId'<>'null'::jsonb then
   if jsonb_typeof(p_policy->'baselineResultId') is distinct from 'string' then raise exception 'Choose a valid finalized baseline.' using errcode='22023';end if;
   perform (p_policy->>'baselineResultId')::uuid;
 end if;
end $$;

create function public.award_request_cached(p_session text,p_request uuid,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor jsonb;saved public.award_mutation_requests%rowtype;
begin
 actor:=public.award_verified_actor(p_session);
 if p_request is null then raise exception 'A request identity is required.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('award-request:'||(actor->>'id')||':'||p_request,0));
 actor:=public.award_verified_actor(p_session);
 select * into saved from public.award_mutation_requests where actor_id=(actor->>'id')::bigint and request_id=p_request;
 if found then
   if saved.payload_hash<>public.resource_digest(jsonb_build_object('action',p_action,'data',p_data)::text) then raise exception 'A request identity cannot be reused for different changes.' using errcode='22023'; end if;
   return saved.response;
 end if;
 return null;
end $$;
create function public.award_request_record(p_session text,p_request uuid,p_action text,p_data jsonb,p_response jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor jsonb;
begin
 actor:=public.award_verified_actor(p_session);
 insert into public.award_mutation_requests(actor_id,request_id,payload_hash,response) values((actor->>'id')::bigint,p_request,public.resource_digest(jsonb_build_object('action',p_action,'data',p_data)::text),p_response);
 return p_response;
end $$;

create function public.award_read_controller(p_session text,p_year integer,p_scope jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor jsonb;scope_value jsonb;k text;settings_value jsonb;manual_value jsonb;policy_value jsonb;
begin
 actor:=public.award_verified_actor(p_session);scope_value:=public.award_normalize_scope(actor,p_scope);k:=public.resource_digest(scope_value::text);
 if p_year is null or p_year not between 1900 and 9999 then raise exception 'Choose an Awards Year.' using errcode='22023'; end if;
 select settings into settings_value from public.award_ranking_settings where settings_key='awards_and_rankings';
 select coalesce(jsonb_agg(to_jsonb(m) order by period,operating_unit),'[]') into manual_value from public.award_manual_scores m where fund_year=p_year and operating_unit in (select jsonb_array_elements_text(scope_value->'ous'));
 select to_jsonb(v) into policy_value from public.award_policy_heads h join public.award_policy_versions v on v.id=h.policy_id where h.awards_year=p_year and h.scope_key=k;
 return jsonb_build_object('controller_version',coalesce((select version from public.award_controller_state),0),'scope',scope_value,'scope_key',k,'settings',coalesce(settings_value,'{}'),'manual',manual_value,'policy',policy_value);
end $$;

create function public.award_numeric_settings(p_value jsonb) returns boolean language plpgsql immutable set search_path=public,pg_temp as $$
declare value jsonb;begin
 if jsonb_typeof(p_value)='number' then return (p_value#>>'{}')::numeric between 0 and 1000000000; end if;
 if jsonb_typeof(p_value)='object' then for value in select v from jsonb_each(p_value) x(k,v) loop if not public.award_numeric_settings(value) then return false; end if;end loop;return true;end if;
 if jsonb_typeof(p_value)='array' then for value in select * from jsonb_array_elements(p_value) loop if not public.award_numeric_settings(value) then return false; end if;end loop;return true;end if;
 return false;
end $$;

-- Partial historical settings remain valid, but every supplied branch must match its schema.
create function public.award_valid_settings(p_value jsonb) returns boolean language plpgsql immutable set search_path=public,pg_temp as $$
declare k text;v jsonb;component text;weights jsonb;allowed text[];band jsonb;
begin
 if jsonb_typeof(p_value) is distinct from 'object' or not public.award_numeric_settings(p_value) then return false;end if;
 for k,v in select key,value from jsonb_each(p_value) loop
   if k in ('quarterlyRestPoints','quarterlyZeroCompletionPoints') then
     if jsonb_typeof(v)<>'number' then return false;end if;
   elsif k in ('quarterlyRankPoints','annualRankPoints','annualConsistencyPoints','annualAttendanceMissedPoints') then
     if jsonb_typeof(v)<>'object' then return false;end if;
     if exists(select 1 from jsonb_each(v) x where x.key !~ '^\d{1,3}$' or jsonb_typeof(x.value)<>'number') then return false;end if;
   elsif k='quarterlyFinancialWeights' then
     if jsonb_typeof(v)<>'object' then return false;end if;
     if exists(select 1 from jsonb_each(v) x where x.key not in ('disbursementVsAllotment','obligationVsAllotment') or jsonb_typeof(x.value)<>'number') then return false;end if;
   elsif k='quarterlyPhysicalWeights' then
     if jsonb_typeof(v)<>'object' then return false;end if;
     for component,weights in select key,value from jsonb_each(v) loop
       allowed:=case component when 'socialPrep' then array['activitiesConducted','iposTrained','completionRate'] when 'productionLivelihood' then array['trainingsConducted','subprojectsProvided','iposAssisted','completionRate'] when 'marketingEnterprise' then array['activitiesConducted','iposAssisted','completionRate'] when 'programManagement' then array['reportorialCompliance','nationalAttendance','completionRate'] else null end;
       if allowed is null or jsonb_typeof(weights)<>'object' then return false;end if;
       if exists(select 1 from jsonb_each(weights) x where not x.key=any(allowed) or jsonb_typeof(x.value)<>'number') then return false;end if;
     end loop;
   elsif k in ('annualFinancialCompletionBands','annualPhysicalCompletionBands') then
     if jsonb_typeof(v)<>'array' then return false;end if;
     if jsonb_array_length(v) not between 1 and 50 then return false;end if;
     for band in select value from jsonb_array_elements(v) loop
       if jsonb_typeof(band)<>'object' then return false;end if;
       if (select count(*) from jsonb_object_keys(band))<>2 or jsonb_typeof(band->'min') is distinct from 'number' or jsonb_typeof(band->'points') is distinct from 'number' then return false;end if;
     end loop;
   else return false;
   end if;
 end loop;
 return true;
end $$;

create function public.award_save_controller(p_session text,p_year integer,p_scope jsonb,p_settings jsonb,p_manual jsonb,p_policy jsonb,p_expected_version bigint,p_request_id uuid,p_reason text default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor jsonb;scope_value jsonb;k text;data jsonb;cached jsonb;current_version bigint;row_value jsonb;policy_head public.award_policy_versions%rowtype;policy_id uuid;revision bigint;
begin
 actor:=public.award_verified_actor(p_session);scope_value:=public.award_normalize_scope(actor,p_scope);k:=public.resource_digest(scope_value::text);
 data:=jsonb_build_object('year',p_year,'scope',scope_value,'settings',p_settings,'manual',p_manual,'policy',p_policy,'expected',p_expected_version,'reason',p_reason);
 cached:=public.award_request_cached(p_session,p_request_id,'controller',data);if cached is not null then return cached; end if;
 perform pg_advisory_xact_lock(hashtextextended('award-controller',0));actor:=public.award_verified_actor(p_session);perform public.award_normalize_scope(actor,scope_value);
 current_version:=coalesce((select version from public.award_controller_state),0);
 if p_expected_version is distinct from current_version then raise exception 'The Awards controller changed. Reload before saving.' using errcode='40001'; end if;
 if p_year is null or p_year not between 1900 and 9999 or jsonb_typeof(p_settings) is distinct from 'object' or octet_length(p_settings::text)>65536 or jsonb_typeof(p_manual) is distinct from 'array' then raise exception 'Invalid controller changes.' using errcode='22023'; end if;
 if not public.award_valid_settings(p_settings) then raise exception 'Use valid nonnegative numeric scoring settings with the expected rule fields.' using errcode='22023'; end if;
 if jsonb_array_length(p_manual)>85 then raise exception 'Too many manual input rows.' using errcode='22023'; end if;
 if exists(select 1 from jsonb_array_elements(p_manual) x group by x->>'period',x->>'operating_unit' having count(*)>1) then raise exception 'Duplicate manual input rows.' using errcode='22023'; end if;
 for row_value in select * from jsonb_array_elements(p_manual) loop
   if coalesce(row_value->>'period','') not in ('Q1','Q2','Q3','Q4','Year End') or not (scope_value->'ous' ? coalesce(row_value->>'operating_unit','')) or coalesce((row_value->>'fund_year')::integer,p_year)<>p_year then raise exception 'Manual inputs are outside the selected year or OU scope.' using errcode='42501'; end if;
   if exists(select 1 from unnest(array['reportorial_required','reportorial_submitted','national_activities_required','national_activities_attended']) x where coalesce(row_value->>x,'') !~ '^\d{1,9}$') then raise exception 'Manual counts must be nonnegative integers.' using errcode='22023'; end if;
 end loop;
 if p_policy is not null and p_policy<>'null'::jsonb then
   perform public.award_validate_policy(p_year,p_policy);
   select v.* into policy_head from public.award_policy_heads h join public.award_policy_versions v on v.id=h.policy_id where h.awards_year=p_year and h.scope_key=k;
   if policy_head.policy is distinct from p_policy then
     if nullif(btrim(p_reason),'') is null then raise exception 'Explain the annual policy change.' using errcode='22023'; end if;
     if p_policy->'baselineResultId'<>'null'::jsonb and not exists(select 1 from public.award_result_versions r where r.id=(p_policy->>'baselineResultId')::uuid and r.awards_year=p_year-1 and r.scope_key=k) then raise exception 'Choose a preceding finalized result in the same comparison scope.' using errcode='22023'; end if;
     revision:=coalesce(policy_head.version,0)+1;
     insert into public.award_policy_versions(awards_year,scope_key,scope,version,policy,previous_policy_id,created_by,created_by_name,reason) values(p_year,k,scope_value,revision,p_policy,policy_head.id,(actor->>'id')::bigint,actor->>'name',btrim(p_reason)) returning id into policy_id;
     insert into public.award_policy_heads values(p_year,k,policy_id) on conflict(awards_year,scope_key) do update set policy_id=excluded.policy_id;
   end if;
 end if;
 insert into public.award_ranking_settings(settings_key,settings,updated_by,updated_by_name) values('awards_and_rankings',p_settings,(actor->>'id')::bigint,actor->>'name') on conflict(settings_key) do update set settings=excluded.settings,updated_by=excluded.updated_by,updated_by_name=excluded.updated_by_name;
 for row_value in select * from jsonb_array_elements(p_manual) loop
   if exists(select 1 from public.reportorial_periods where reporting_year=p_year and quarter=row_value->>'period' and source='Repository') then
     row_value:=row_value||jsonb_build_object('reportorial_required',coalesce((select reportorial_required from public.award_manual_scores where fund_year=p_year and period=row_value->>'period' and operating_unit=row_value->>'operating_unit'),0),'reportorial_submitted',coalesce((select reportorial_submitted from public.award_manual_scores where fund_year=p_year and period=row_value->>'period' and operating_unit=row_value->>'operating_unit'),0));
   end if;
   insert into public.award_manual_scores(fund_year,period,operating_unit,reportorial_required,reportorial_submitted,national_activities_required,national_activities_attended,remarks,updated_by,updated_by_name)
   values(p_year,row_value->>'period',row_value->>'operating_unit',(row_value->>'reportorial_required')::integer,(row_value->>'reportorial_submitted')::integer,(row_value->>'national_activities_required')::integer,(row_value->>'national_activities_attended')::integer,row_value->>'remarks',(actor->>'id')::bigint,actor->>'name')
   on conflict(fund_year,period,operating_unit) do update set
    reportorial_required=case when exists(select 1 from public.reportorial_periods where reporting_year=p_year and quarter=excluded.period and source='Repository') then award_manual_scores.reportorial_required else excluded.reportorial_required end,
    reportorial_submitted=case when exists(select 1 from public.reportorial_periods where reporting_year=p_year and quarter=excluded.period and source='Repository') then award_manual_scores.reportorial_submitted else excluded.reportorial_submitted end,
    national_activities_required=excluded.national_activities_required,national_activities_attended=excluded.national_activities_attended,remarks=excluded.remarks,updated_by=excluded.updated_by,updated_by_name=excluded.updated_by_name;
 end loop;
 insert into public.award_controller_state values(true,current_version+1,(actor->>'id')::bigint,clock_timestamp()) on conflict(singleton) do update set version=excluded.version,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
 return public.award_request_record(p_session,p_request_id,'controller',data,public.award_read_controller(p_session,p_year,scope_value));
end $$;

create function public.award_assert_evidence_access(p_session text,p_inputs jsonb) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if exists(select 1 from jsonb_array_elements(coalesce(p_inputs->'reportorialPeriods','[]')) p where p->>'source'='Repository') then
   perform public.resource_actor(p_session,'Documentary Repository','view');
 end if;
end $$;

create function public.award_history(p_session text,p_year integer,p_scope jsonb,p_before bigint default null,p_limit integer default 10) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor jsonb;scope_value jsonb;k text;
begin
 actor:=public.award_verified_actor(p_session);scope_value:=public.award_normalize_scope(actor,p_scope);k:=public.resource_digest(scope_value::text);
 return jsonb_build_object('head',coalesce((select to_jsonb(h) from public.award_result_heads h where awards_year=p_year and scope_key=k),jsonb_build_object('version',0,'active_result_id',null)),
  'activation', (select to_jsonb(a) from public.award_result_activations a where awards_year=p_year and scope_key=k order by head_version desc limit 1),
  'activation_group',coalesce((select jsonb_agg(to_jsonb(a) order by a.awards_year) from public.award_result_activations a where a.scope_key=k and a.operation_id=(select operation_id from public.award_result_activations where awards_year=p_year and scope_key=k order by head_version desc limit 1)),'[]'),
  'rows',coalesce((select jsonb_agg((to_jsonb(r)-'snapshot')||jsonb_build_object('policy_version',(select version from public.award_policy_versions where id=r.policy_id),'policy',r.snapshot->'policy','winners',jsonb_build_object(
    'overall',(select coalesce(jsonb_agg(v->>'ou' order by v->>'ou'),'[]') from jsonb_array_elements(coalesce(r.snapshot->'results'->'annual'->'overall','[]')) v where v->>'rank'='1'),
    'financial',(select coalesce(jsonb_agg(v->>'ou' order by v->>'ou'),'[]') from jsonb_array_elements(coalesce(r.snapshot->'results'->'annual'->'financial','[]')) v where v->>'rank'='1'),
    'physical',(select coalesce(jsonb_agg(v->>'ou' order by v->>'ou'),'[]') from jsonb_array_elements(coalesce(r.snapshot->'results'->'annual'->'physical','[]')) v where v->>'rank'='1'))) order by r.version desc) from (select * from public.award_result_versions where awards_year=p_year and scope_key=k and (p_before is null or version<p_before) order by version desc limit least(50,greatest(1,p_limit))) r),'[]'));
end $$;
create function public.award_read_capture(p_session text,p_capture_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor jsonb;c public.award_calculation_captures%rowtype;
begin
 actor:=public.award_verified_actor(p_session);select * into c from public.award_calculation_captures where id=p_capture_id and actor_id=(actor->>'id')::bigint;
 if not found then raise exception 'The calculation preview is unavailable.' using errcode='42501';end if;
 perform public.award_normalize_scope(actor,c.scope);perform public.award_assert_evidence_access(p_session,c.inputs);
 return to_jsonb(c);
end $$;

create function public.award_finalize_status(p_session text,p_capture_id uuid,p_request_id uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare cached jsonb;
begin
 perform public.award_read_capture(p_session,p_capture_id);
 cached:=public.award_request_cached(p_session,p_request_id,'finalize',jsonb_build_object('capture',p_capture_id,'reason',p_reason));
 perform public.award_read_capture(p_session,p_capture_id);
 return cached;
end $$;

create function public.award_read_result(p_session text,p_result_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor jsonb;r public.award_result_versions%rowtype;captured_inputs jsonb;
begin
 actor:=public.award_verified_actor(p_session);select * into r from public.award_result_versions where id=p_result_id;
 if not found then raise exception 'The finalized result is unavailable.' using errcode='42501'; end if;
 if public.award_normalize_scope(actor,r.scope) is distinct from r.scope then raise exception 'The result is outside your visibility scope.' using errcode='42501'; end if;
 select inputs into captured_inputs from public.award_calculation_captures where id=r.capture_id;
 perform public.award_assert_evidence_access(p_session,captured_inputs);
 return to_jsonb(r)||jsonb_build_object('policy_version',(select version from public.award_policy_versions where id=r.policy_id));
end $$;

create function public.award_activate_result(p_session text,p_result_id uuid,p_expected_version bigint,p_request_id uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor jsonb;r public.award_result_versions%rowtype;h public.award_result_heads%rowtype;cached jsonb;data jsonb;response jsonb;
begin
 actor:=public.award_verified_actor(p_session);perform public.award_read_result(p_session,p_result_id);select * into r from public.award_result_versions where id=p_result_id;
 data:=jsonb_build_object('result',p_result_id,'expected',p_expected_version,'reason',p_reason);cached:=public.award_request_cached(p_session,p_request_id,'activate',data);if cached is not null then return cached; end if;
 if nullif(btrim(p_reason),'') is null then raise exception 'Explain the restoration.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('award-results:'||r.scope_key,0));perform public.award_read_result(p_session,p_result_id);
 select * into h from public.award_result_heads where awards_year=r.awards_year and scope_key=r.scope_key for update;
 if not found or h.version is distinct from p_expected_version then raise exception 'The active result changed. Review its current version.' using errcode='40001'; end if;
 if exists(select 1 from jsonb_array_elements(r.dependencies) d where not exists(select 1 from public.award_result_heads prior join public.award_result_versions baseline on baseline.id=prior.active_result_id where prior.scope_key=r.scope_key and prior.awards_year=(d->>'awardsYear')::integer and baseline.id::text=d->>'resultId' and baseline.carry_hash=d->>'carryHash')) then raise exception 'The opening baseline changed. Reconcile its finalized version before restoring this result.' using errcode='40001'; end if;
 if exists(select 1 from public.award_result_heads later join public.award_result_versions target on target.id=later.active_result_id where later.scope_key=r.scope_key and later.awards_year>r.awards_year and exists(select 1 from jsonb_array_elements(target.dependencies) d where (d->>'awardsYear')::integer=r.awards_year and d->>'carryHash' is distinct from r.carry_hash)) then raise exception 'A subsequent finalized year needs explicit carry-forward reconciliation before activation.' using errcode='40001'; end if;
 actor:=public.award_verified_actor(p_session);
 insert into public.award_result_activations(awards_year,scope_key,previous_result_id,result_id,action,actor_id,actor_name,head_version,reason) values(r.awards_year,r.scope_key,h.active_result_id,r.id,'Restored',(actor->>'id')::bigint,actor->>'name',h.version+1,btrim(p_reason));
 update public.award_result_heads set active_result_id=r.id,version=version+1 where awards_year=r.awards_year and scope_key=r.scope_key returning to_jsonb(award_result_heads) into response;
 return public.award_request_record(p_session,p_request_id,'activate',data,response);
end $$;

create function public.award_carry_fingerprint(p_snapshot jsonb,p_carry jsonb) returns text
language sql immutable set search_path=public,pg_temp as $$
 select public.resource_digest(jsonb_build_object('policy',(p_snapshot->'policy')-'transitionApproved'-'baselineResultId',
   'balances',p_carry,'recognizedEvents',coalesce(nullif(p_snapshot->'recognizedEvents','null'::jsonb),'[]'::jsonb))::text)
$$;

create function public.award_activate_result_batch(p_session text,p_selections jsonb,p_request_id uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor jsonb;selection jsonb;chosen public.award_result_versions%rowtype;head public.award_result_heads%rowtype;
 scope_key_value text;selected_rows jsonb:='[]';selected_years integer[]:='{}';response jsonb:='[]';cached jsonb;data jsonb;dependency jsonb;baseline public.award_result_versions%rowtype;
begin
 actor:=public.award_verified_actor(p_session);
 if jsonb_typeof(p_selections) is distinct from 'array' then raise exception 'Choose the finalized versions to reconcile.' using errcode='22023';end if;
 if jsonb_array_length(p_selections) not between 1 and 20 or nullif(btrim(p_reason),'') is null or length(p_reason)>4000 then raise exception 'Choose up to twenty years and explain the reconciliation.' using errcode='22023';end if;
 for selection in select * from jsonb_array_elements(p_selections) loop
   if jsonb_typeof(selection) is distinct from 'object' or (select count(*) from jsonb_object_keys(selection))<>2 or not (selection ?& array['resultId','expectedVersion']) or jsonb_typeof(selection->'resultId') is distinct from 'string' or jsonb_typeof(selection->'expectedVersion') is distinct from 'number' or selection->>'expectedVersion' !~ '^\d{1,18}$' then raise exception 'Invalid reconciliation selection.' using errcode='22023';end if;
   perform public.award_read_result(p_session,(selection->>'resultId')::uuid);
   select * into chosen from public.award_result_versions where id=(selection->>'resultId')::uuid;
   if chosen.awards_year=any(selected_years) or (scope_key_value is not null and chosen.scope_key<>scope_key_value) then raise exception 'Choose one result per year in the same comparison scope.' using errcode='22023';end if;
   scope_key_value:=chosen.scope_key;selected_years:=array_append(selected_years,chosen.awards_year);
   selected_rows:=selected_rows||jsonb_build_array(jsonb_build_object('year',chosen.awards_year,'resultId',chosen.id,'expectedVersion',(selection->>'expectedVersion')::bigint));
 end loop;
 select jsonb_agg(v order by (v->>'year')::integer) into selected_rows from jsonb_array_elements(selected_rows) v;
 data:=jsonb_build_object('selections',selected_rows,'reason',p_reason);
 cached:=public.award_request_cached(p_session,p_request_id,'activate_batch',data);
 if cached is not null then
   for selection in select * from jsonb_array_elements(selected_rows) loop perform public.award_read_result(p_session,(selection->>'resultId')::uuid);end loop;
   return cached;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('award-results:'||scope_key_value,0));
 for selection in select * from jsonb_array_elements(selected_rows) loop
   perform public.award_read_result(p_session,(selection->>'resultId')::uuid);
   select * into chosen from public.award_result_versions where id=(selection->>'resultId')::uuid;
   select * into head from public.award_result_heads where awards_year=chosen.awards_year and scope_key=scope_key_value for update;
   if not found or head.version is distinct from (selection->>'expectedVersion')::bigint then raise exception 'An active result changed. Review the complete reconciliation again.' using errcode='40001';end if;
   for dependency in select * from jsonb_array_elements(chosen.dependencies) loop
     select r.* into baseline from public.award_result_versions r where r.scope_key=scope_key_value and r.awards_year=(dependency->>'awardsYear')::integer and r.id::text=dependency->>'resultId' and r.carry_hash=dependency->>'carryHash'
       and (exists(select 1 from jsonb_array_elements(selected_rows) s where (s->>'year')::integer=r.awards_year and s->>'resultId'=r.id::text)
         or (not r.awards_year=any(selected_years) and exists(select 1 from public.award_result_heads h where h.scope_key=scope_key_value and h.awards_year=r.awards_year and h.active_result_id=r.id)));
     if not found then raise exception 'The selected years do not form a consistent opening-balance lineage.' using errcode='40001';end if;
   end loop;
 end loop;
 if exists(select 1 from public.award_result_heads later join public.award_result_versions target on target.id=later.active_result_id,
   lateral jsonb_array_elements(target.dependencies) d join public.award_result_versions replacement on replacement.scope_key=scope_key_value and replacement.awards_year=(d->>'awardsYear')::integer
   where later.scope_key=scope_key_value and not later.awards_year=any(selected_years)
     and exists(select 1 from jsonb_array_elements(selected_rows) s where s->>'resultId'=replacement.id::text)
     and d->>'carryHash' is distinct from replacement.carry_hash) then raise exception 'Include the affected subsequent finalized years before activating this reconciliation.' using errcode='40001';end if;
 for selection in select * from jsonb_array_elements(selected_rows) loop
   actor:=public.award_verified_actor(p_session);perform public.award_read_result(p_session,(selection->>'resultId')::uuid);
   select * into chosen from public.award_result_versions where id=(selection->>'resultId')::uuid;
   select * into head from public.award_result_heads where awards_year=chosen.awards_year and scope_key=scope_key_value;
   insert into public.award_result_activations(awards_year,scope_key,previous_result_id,result_id,action,actor_id,actor_name,operation_id,head_version,reason)
   values(chosen.awards_year,scope_key_value,head.active_result_id,chosen.id,'Reconciled',(actor->>'id')::bigint,actor->>'name',p_request_id,head.version+1,btrim(p_reason));
   update public.award_result_heads set active_result_id=chosen.id,version=version+1 where awards_year=chosen.awards_year and scope_key=scope_key_value returning * into head;
   response:=response||jsonb_build_array(to_jsonb(head));
 end loop;
 return public.award_request_record(p_session,p_request_id,'activate_batch',data,jsonb_build_object('operationId',p_request_id,'heads',response));
end $$;

-- Only the trusted calculator calls this; no HTTP action accepts browser-computed results.
create function public.award_commit_result(p_session text,p_capture_id uuid,p_snapshot jsonb,p_carry jsonb,p_current_source_hash text,p_request_id uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor jsonb;c public.award_calculation_captures%rowtype;h public.award_result_heads%rowtype;r public.award_result_versions%rowtype;
 data jsonb;cached jsonb;carry_fingerprint text;blocked boolean;next_version bigint;
begin
 actor:=public.award_verified_actor(p_session);
 select * into c from public.award_calculation_captures where id=p_capture_id and actor_id=(actor->>'id')::bigint;
 if not found then raise exception 'The calculation preview is unavailable.' using errcode='42501'; end if;
 perform public.award_normalize_scope(actor,c.scope);
 perform public.award_assert_evidence_access(p_session,c.inputs);
 data:=jsonb_build_object('capture',p_capture_id,'reason',p_reason);
 cached:=public.award_request_cached(p_session,p_request_id,'finalize',data);if cached is not null then return cached; end if;
 if nullif(btrim(p_reason),'') is null or length(p_reason)>4000 then raise exception 'Explain the finalization.' using errcode='22023'; end if;
 if c.expires_at<=clock_timestamp() or c.source_hash is distinct from p_current_source_hash then raise exception 'Source data changed or the preview expired. Review a fresh calculation.' using errcode='40001'; end if;
 if jsonb_typeof(p_snapshot) is distinct from 'object' or p_snapshot->'schemaVersion' is distinct from '1'::jsonb or p_snapshot->'awardsYear' is distinct from to_jsonb(c.awards_year) or p_snapshot->'scope' is distinct from c.scope or p_snapshot->'policy' is distinct from c.inputs->'policy' or p_snapshot->'settings' is distinct from c.inputs->'settings' or p_snapshot->>'sourceHash' is distinct from c.source_hash or jsonb_typeof(p_snapshot->'results') is distinct from 'object' or jsonb_typeof(p_carry) is distinct from 'array' then raise exception 'The calculated snapshot does not match its captured inputs.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('award-controller',0));
 perform pg_advisory_xact_lock(hashtextextended('award-results:'||c.scope_key,0));
 actor:=public.award_verified_actor(p_session);perform public.award_normalize_scope(actor,c.scope);
 perform public.award_assert_evidence_access(p_session,c.inputs);
 if c.controller_version is distinct from coalesce((select version from public.award_controller_state),0) or c.policy_id is distinct from (select policy_id from public.award_policy_heads where awards_year=c.awards_year and scope_key=c.scope_key) then raise exception 'The controller or cutoff policy changed. Review a fresh calculation.' using errcode='40001'; end if;
 if exists(select 1 from jsonb_array_elements(c.dependencies) d where not exists(select 1 from public.award_result_versions baseline where baseline.scope_key=c.scope_key and baseline.awards_year=(d->>'awardsYear')::integer and baseline.id::text=d->>'resultId' and baseline.carry_hash=d->>'carryHash')) then raise exception 'The opening baseline is unavailable. Review a fresh calculation.' using errcode='40001'; end if;
 insert into public.award_result_heads(awards_year,scope_key) values(c.awards_year,c.scope_key) on conflict do nothing;
 select * into h from public.award_result_heads where awards_year=c.awards_year and scope_key=c.scope_key for update;
 if h.version is distinct from c.result_head_version then raise exception 'The active result changed. Compare the current version before finalizing.' using errcode='40001'; end if;
 carry_fingerprint:=public.award_carry_fingerprint(p_snapshot,p_carry);
 select coalesce(max(version),0)+1 into next_version from public.award_result_versions where awards_year=c.awards_year and scope_key=c.scope_key;
 insert into public.award_result_versions(awards_year,scope_key,scope,version,policy_id,capture_id,previous_result_id,snapshot,snapshot_hash,source_hash,source_data_as_of,dependencies,carry_hash,finalized_by,finalized_by_name,reason)
 values(c.awards_year,c.scope_key,c.scope,next_version,c.policy_id,c.id,h.active_result_id,p_snapshot,public.resource_digest(p_snapshot::text),c.source_hash,c.source_data_as_of,c.dependencies,carry_fingerprint,(actor->>'id')::bigint,actor->>'name',btrim(p_reason)) returning * into r;
 blocked:=exists(select 1 from public.award_result_heads later join public.award_result_versions target on target.id=later.active_result_id where later.scope_key=c.scope_key and later.awards_year>c.awards_year and exists(select 1 from jsonb_array_elements(target.dependencies) d where (d->>'awardsYear')::integer=c.awards_year and d->>'carryHash' is distinct from carry_fingerprint))
   or exists(select 1 from jsonb_array_elements(c.dependencies) d where not exists(select 1 from public.award_result_heads prior where prior.scope_key=c.scope_key and prior.awards_year=(d->>'awardsYear')::integer and prior.active_result_id::text=d->>'resultId'));
 if not blocked then
   insert into public.award_result_activations(awards_year,scope_key,previous_result_id,result_id,action,actor_id,actor_name,head_version,reason) values(r.awards_year,r.scope_key,h.active_result_id,r.id,'Finalized',(actor->>'id')::bigint,actor->>'name',h.version+1,btrim(p_reason));
   update public.award_result_heads set active_result_id=r.id,version=version+1 where awards_year=r.awards_year and scope_key=r.scope_key;
 end if;
 return public.award_request_record(p_session,p_request_id,'finalize',data,jsonb_build_object('id',r.id,'version',r.version,'activation_pending',blocked,'head_version',h.version+case when blocked then 0 else 1 end));
end $$;

create function public.award_immutable_version() returns trigger language plpgsql set search_path=public,pg_temp as $$begin raise exception 'Awards evidence is immutable. Create a new version or activation event.' using errcode='42501';end $$;
do $$ declare n text;f record;begin
 foreach n in array array['award_controller_state','award_policy_versions','award_policy_heads','award_calculation_captures','award_result_versions','award_result_heads','award_result_activations','award_mutation_requests'] loop
   execute format('alter table public.%I enable row level security',n);execute format('revoke all on public.%I from public,anon,authenticated',n);
 end loop;
 foreach n in array array['award_policy_versions','award_calculation_captures','award_result_versions','award_result_activations','award_mutation_requests'] loop
   execute format('create trigger award_immutable before update or delete on public.%I for each row execute function public.award_immutable_version()',n);
 end loop;
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'award_%' loop
   execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
commit;
