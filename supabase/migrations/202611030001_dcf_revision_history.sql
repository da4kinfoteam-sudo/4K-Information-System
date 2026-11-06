-- Additive history only at installation. No business backfill or baseline capture.
begin;
set local lock_timeout='5s';
set local statement_timeout='90s';

create temporary table dcf_history_install_check(table_name text primary key,signature text) on commit drop;
do $$ declare n text; begin
  -- Trigger DDL needs this lock strength. Acquire it before reading rows so a
  -- concurrent reader/writer cannot deadlock a later lock upgrade. Busy means retry.
  for n in select unnest(array['activities','subprojects','office_requirements','staffing_requirements','other_program_expenses',
    'financial_obligations','financial_disbursements','budget_item_transfers','activity_supplements','activity_drive_files',
    'subproject_drive_files','activity_monitoring_reports','activity_monitoring_actions','subproject_accomplishments','budget_item_adjustment_history']) order by 1 loop
    if to_regclass('public.'||n) is not null then execute format('lock table public.%I in access exclusive mode nowait',n); end if;
  end loop;
  foreach n in array array['activities','subprojects','office_requirements','staffing_requirements','other_program_expenses','financial_obligations','financial_disbursements'] loop
    execute format('insert into dcf_history_install_check select %L,md5(coalesce(string_agg(md5(to_jsonb(r)::text),'''' order by id),'''')) from public.%I r',n,n);
  end loop;
end $$;

create table if not exists public.dcf_revision_heads(
  entity_type text not null check(entity_type in ('activities','subprojects','office_requirements','staffing_requirements','other_program_expenses')),
  parent_id bigint not null,incarnation uuid not null default gen_random_uuid(),version bigint not null default 0,
  latest_revision_id bigint,deleted boolean not null default false,primary key(entity_type,parent_id)
);
create table if not exists public.dcf_record_revisions(
  id bigint generated always as identity primary key,entity_type text not null,parent_id bigint not null,
  incarnation uuid not null,version bigint not null,previous_revision_id bigint references public.dcf_record_revisions(id),
  recorded_at timestamptz not null,actor_id bigint,actor_name text not null,operation_id uuid not null,
  source text not null,kind text not null,reason text,changed_fields text[] not null,summary text not null,
  physical_changed boolean not null default false,snapshot jsonb not null,snapshot_hash text not null,
  unique(incarnation,version),unique(incarnation,operation_id,kind)
);
create index if not exists dcf_revisions_parent_idx on public.dcf_record_revisions(entity_type,parent_id,id desc);
create index if not exists dcf_revisions_cutoff_idx on public.dcf_record_revisions(incarnation,recorded_at desc,id desc);
create table if not exists public.dcf_mutation_requests(
  request_key uuid primary key,actor_id bigint not null,request_hash text not null,response jsonb not null,
  created_at timestamptz not null default clock_timestamp()
);
create table if not exists public.dcf_restore_operations(
  id uuid primary key,entity_type text not null,parent_id bigint not null,source_revision_id bigint not null references public.dcf_record_revisions(id),
  before_revision_id bigint not null references public.dcf_record_revisions(id),result_revision_id bigint not null references public.dcf_record_revisions(id),
  actor_id bigint not null,reason text not null,undo_of uuid references public.dcf_restore_operations(id),identity_map jsonb not null default '{}',
  created_at timestamptz not null default clock_timestamp(),unique(undo_of)
);
-- Only trusted definer functions write operation context. Browser GUCs are not attribution.
create table if not exists public.dcf_revision_context(
  transaction_id bigint primary key,actor_id bigint,actor_name text not null,operation_id uuid not null,
  source text not null,reason text,effective_at timestamptz not null default clock_timestamp()
);
alter table public.dcf_revision_context add column if not exists finalized_at timestamptz;
alter table public.dcf_revision_context add column if not exists correlation_id uuid;
alter table public.dcf_record_revisions add column if not exists correlation_id uuid;
alter table public.dcf_revision_context add column if not exists origin jsonb;
alter table public.dcf_record_revisions add column if not exists origin jsonb;
alter table public.dcf_restore_operations add column if not exists before_snapshot jsonb;
create index if not exists dcf_revisions_correlation_idx on public.dcf_record_revisions(correlation_id,id);
create table if not exists public.dcf_revision_pending(
  transaction_id bigint not null,entity_type text not null,parent_id bigint not null,before_snapshot jsonb,
  primary key(transaction_id,entity_type,parent_id)
);
alter table public.dcf_revision_pending add column if not exists before_legacy_keys jsonb not null default '[]';
alter table public.dcf_record_revisions add column if not exists legacy_keys jsonb not null default '[]';
create table if not exists public.dcf_financial_entry_state(
  entity_type text not null,parent_id bigint not null,item_id text not null,stage text not null check(stage in ('obligation','disbursement')),
  primary key(entity_type,parent_id,item_id,stage)
);
do $$ declare n text; begin
  foreach n in array array['dcf_revision_heads','dcf_record_revisions','dcf_mutation_requests','dcf_restore_operations','dcf_revision_context','dcf_revision_pending','dcf_financial_entry_state'] loop
    execute format('alter table public.%I enable row level security',n);
    execute format('revoke all on public.%I from public,anon,authenticated',n);
  end loop;
end $$;

create or replace function public.dcf_entity_table(p_type text) returns text language plpgsql immutable set search_path=public,pg_temp as $$
begin
  if p_type not in ('activities','subprojects','office_requirements','staffing_requirements','other_program_expenses') or p_type is null then raise exception 'Unsupported DCF entity.' using errcode='22023'; end if;
  return p_type;
end $$;

-- Backend support can precede the new frontend. Only the separately authorized
-- final activation migration closes old direct browser writers.
do $$ begin
  if to_regprocedure('public.dcf_browser_guard_enabled()') is null then
    execute 'create function public.dcf_browser_guard_enabled() returns boolean language sql immutable set search_path=public,pg_temp as ''select false''';
  end if;
end $$;

create or replace function public.dcf_field_names(p_type text) returns text[] language plpgsql immutable set search_path=public,pg_temp as $$
declare fields text[]:=array['id','uid','created_at','created_by','encodedBy','operatingUnit','fundYear','fundingYear','fundType','tier','fundSourceUid','fundSource','isSavings','isRealignment','status','workflow_status','approver_id','approved_by','approved_at','rejection_reason','submitted_at','physical_accomplishment_submitted_at','actualDate','actualEndDate','actualAmount','actualObligationDate','actualObligationAmount','actualDisbursementDate','actualDisbursementAmount','obligations','disbursements','actualPWD','actualMuslim','actualLGBTQ','actualSoloParent','actualSenior','actualYouth','catchUpPlanRemarks','lat','lng'];
begin
  perform public.dcf_entity_table(p_type);
  return fields||case p_type
    when 'activities' then array['type','reference_activity_id','name','activity_title','description','location','date','endDate','facilitator','participatingIpos','participating_ipo_ids','participantsMale','participantsFemale','expenses','component','actualParticipantsMale','actualParticipantsFemale','newTargetDate','original_budget_snapshot','isTransferTargetExcluded','budgetItemTransferId']
    when 'subprojects' then array['name','location','indigenousPeopleOrganization','ipo_id','details','subprojectCommodities','packageType','startDate','estimatedCompletionDate','actualCompletionDate','actualMaleBeneficiaries','actualFemaleBeneficiaries','actualFourPsBeneficiaries','remarks','accomplishmentRemarks','newTargetCompletionDate','isTransferTargetExcluded','budgetItemTransferId']
    when 'office_requirements' then array['equipment','specs','purpose','numberOfUnits','pricePerUnit','uacsCode','obligationDate','disbursementDate','physicalDeliveryDate']
    when 'staffing_requirements' then array['personnelPosition','position','component','salaryGrade','annualSalary','personnelType','expenses','hiringStatus','uacsCode','obligationDate','disbursementDate','physicalDeliveryDate']
    else array['particulars','amount','obligatedAmount','uacsCode','obligationDate','disbursementDate','physicalDeliveryDate'] end
    ||array['disbursementJan','disbursementFeb','disbursementMar','disbursementApr','disbursementMay','disbursementJun','disbursementJul','disbursementAug','disbursementSep','disbursementOct','disbursementNov','disbursementDec','actualDisbursementJan','actualDisbursementFeb','actualDisbursementMar','actualDisbursementApr','actualDisbursementMay','actualDisbursementJun','actualDisbursementJul','actualDisbursementAug','actualDisbursementSep','actualDisbursementOct','actualDisbursementNov','actualDisbursementDec'];
end $$;

create or replace function public.dcf_safe_json(p_value jsonb) returns jsonb language plpgsql immutable set search_path=public,pg_temp as $$
declare result jsonb; begin
  if jsonb_typeof(p_value)='object' then
    select coalesce(jsonb_object_agg(key,public.dcf_safe_json(value)),'{}') into result from jsonb_each(p_value)
    where lower(key) not in ('password','token','access_token','refresh_token','actor_password','p_actor_password','history','source_snapshot','response','request_hash','preview_url','web_content_link');
    return result;
  elsif jsonb_typeof(p_value)='array' then
    select coalesce(jsonb_agg(public.dcf_safe_json(value) order by ordinality),'[]') into result from jsonb_array_elements(p_value) with ordinality;
    return result;
  end if;
  return p_value;
end $$;

create or replace function public.dcf_project_embedded(p_kind text,p_value jsonb) returns jsonb language plpgsql immutable set search_path=public,pg_temp as $$
declare allowed text[]; k text; v jsonb; result jsonb:='{}'; begin
  if p_value is null or p_value='null'::jsonb then return p_value; end if;
  if jsonb_typeof(p_value)='array' then
    select coalesce(jsonb_agg(public.dcf_project_embedded(p_kind,value) order by ordinality),'[]') into result from jsonb_array_elements(p_value) with ordinality;
    return result;
  end if;
  if jsonb_typeof(p_value)<>'object' then return p_value; end if;
  if p_kind='adjustment-snapshot' then
    return public.dcf_project_embedded('budget',p_value)||coalesce((select jsonb_object_agg(key,value) from jsonb_each(p_value) where key in ('accomplishmentRemarks','catchUpPlanRemarks')),'{}');
  end if;
  allowed:=case p_kind
    when 'budget' then array['id','budgetItemGroupId','type','particulars','deliveryDate','unitOfMeasure','pricePerUnit','numberOfUnits','objectType','expenseParticular','uacsCode','obligationMonth','disbursementMonth','obligationDate','amount','targetScheduleVersion','targetObligationSchedules','targetDisbursementSchedules','actualDeliveryDate','actualNumberOfUnits','actualObligationDate','actualDisbursementDate','actualAmount','actualObligationAmount','actualDisbursementAmount','obligations','disbursements','isCompleted','isCancelled','isSavings','isRealignment','originalPlannedAmount','originalPricePerUnit','originalNumberOfUnits','originalCapturedAt','sourceItemId','adjustmentReason','adjustmentType','adjustmentFundingSource','isAdjustmentItem','isSuperseded','replacementOfItemId','replacedByItemIds','replacementReason','itemRemarks','fundingOrigin','supplementUid','supplementStatus','supplementalSource','supplementRevisionPending',
      'disbursementJan','disbursementFeb','disbursementMar','disbursementApr','disbursementMay','disbursementJun','disbursementJul','disbursementAug','disbursementSep','disbursementOct','disbursementNov','disbursementDec','actualDisbursementJan','actualDisbursementFeb','actualDisbursementMar','actualDisbursementApr','actualDisbursementMay','actualDisbursementJun','actualDisbursementJul','actualDisbursementAug','actualDisbursementSep','actualDisbursementOct','actualDisbursementNov','actualDisbursementDec']
    when 'schedule' then array['id','month','amount']
    when 'entry' then array['id','date','amount','remarks']
    when 'baseline' then array['expenses','capturedAt','kind','reason']
    when 'commodity' then array['typeName','name','area','averageYield','actualYield','marketingPercentage','foodSecurityPercentage','income']
    when 'ledger' then array['id','entity_type','parent_id','item_id','obligation_date','disbursement_date','amount','remarks','created_at','updated_at']
    when 'activity_supplements' then array['uid','activity_id','source','reference','authorization_date','reason','status','revision','created_by','approver_id','origin_uid','pending_proposal','pending_status','created_at','updated_at']
    when 'supplement-proposal' then array['source','reference','authorization_date','reason','status','expenses']
    when 'activity_monitoring_reports' then array['id','activity_id','ipo_id','status','findings','issues','recommendations','reported_by','reported_by_name','created_at','updated_at','deleted_at','deleted_by','deleted_by_name']
    when 'activity_monitoring_actions' then array['id','monitoring_report_id','action_taken','created_by','created_by_name','created_at','updated_at','edited_by','edited_by_name','edited_at','deleted_by','deleted_by_name','deleted_at']
    when 'subproject_accomplishments' then array['id','subproject_id','detail_id','delivery_date','quantity','remarks','created_by','created_at']
    when 'budget_item_adjustment_history' then array['id','source_type','parent_id','item_id','action','source_item_id','before_snapshot','after_snapshot','amount_delta','reason','created_by','created_by_name','created_at']
    when 'transfers' then array['id','source_type','source_id','destination_id','selected_item_ids','source_actual_remainder','destination_actuals','reason','actor_id','actor_name','assigned_approver_id','status','resolved_by','resolved_by_name','resolution_reason','created_at','resolved_at']
    when 'parent-actuals' then array['actualDate','actualEndDate','actualCompletionDate','actualMaleBeneficiaries','actualFemaleBeneficiaries','actualFourPsBeneficiaries','actualParticipantsMale','actualParticipantsFemale','actualPWD','actualMuslim','actualLGBTQ','actualSoloParent','actualSenior','actualYouth']
    when 'fundSource' then array['id','uid','label','is_active','sort_order']
    when 'ipo-reference' then array['id','uid','name','operatingUnit']
    when 'activity-reference' then array['id','activity_name','component','type']
    when 'uacs-reference' then array['id','objectType','particular','uacsCode','description']
    when 'activity_drive_files' then array['id','activity_id','file_id','file_name','mime_type','file_size','folder_id','folder_name','module','folder_year','operating_unit','component','activity_name','activity_type','upload_section','display_name','caption','uploaded_at','uploaded_by','uploaded_by_name','created_at','updated_at','deleted_at','deleted_by','deleted_by_name','web_view_link']
    when 'subproject_drive_files' then array['id','subproject_id','file_id','file_name','mime_type','file_size','folder_id','folder_name','module','folder_year','operating_unit','ipo_name','subproject_name','upload_section','display_name','caption','uploaded_at','uploaded_by','uploaded_by_name','created_at','updated_at','deleted_at','deleted_by','deleted_by_name','web_view_link']
    else null end;
  if allowed is null then raise exception 'Unsupported historical nested schema: %',p_kind; end if;
  for k,v in select * from jsonb_each(p_value) where key=any(allowed) loop
    v:=case when k='expenses' then public.dcf_project_embedded('budget',v)
      when k in ('before_snapshot','after_snapshot') then public.dcf_project_embedded('adjustment-snapshot',v)
      when k in ('targetObligationSchedules','targetDisbursementSchedules') then public.dcf_project_embedded('schedule',v)
      when k in ('obligations','disbursements') then public.dcf_project_embedded('entry',v)
      when k='pending_proposal' then public.dcf_project_embedded('supplement-proposal',v)
      when k in ('source_actual_remainder','destination_actuals') then public.dcf_project_embedded('parent-actuals',v) else v end;
    result:=result||jsonb_build_object(k,v);
  end loop;
  return public.dcf_safe_json(result);
end $$;

create or replace function public.dcf_project_record(p_type text,p_record jsonb) returns jsonb language sql immutable set search_path=public,pg_temp set timezone='UTC' as $$
  select case when p_record is null then null else public.dcf_safe_json(coalesce((select jsonb_object_agg(key,
    case when key in ('created_at','submitted_at','approved_at','physical_accomplishment_submitted_at') and jsonb_typeof(value)='string' then to_jsonb((value#>>'{}')::timestamptz)
      when key in ('details','expenses') then public.dcf_project_embedded('budget',value)
      when key='original_budget_snapshot' then public.dcf_project_embedded('baseline',value)
      when key='subprojectCommodities' then public.dcf_project_embedded('commodity',value)
      when key in ('obligations','disbursements') then public.dcf_project_embedded('entry',value) else value end)
    from jsonb_each(p_record) where key=any(public.dcf_field_names(p_type))),'{}')) end
$$;

create or replace function public.dcf_response_record(p_type text,p_record jsonb) returns jsonb language sql immutable set search_path=public,pg_temp as $$
  select public.dcf_project_record(p_type,p_record)||jsonb_build_object('updated_at',p_record->'updated_at','history',coalesce(nullif(p_record->'history','null'),'[]'))
$$;

create or replace function public.dcf_authenticate(p_id bigint,p_password text) returns public.users language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.users%rowtype; begin
  select * into a from public.users where id=p_id;
  if a.id is null or a.role is null then raise exception 'Your session could not be verified.' using errcode='42501'; end if;
  if auth.uid() is not null then
    if a.auth_id is distinct from auth.uid() then raise exception 'Your session does not match this request.' using errcode='42501'; end if;
  elsif nullif(p_password,'') is null or a.password is distinct from p_password then raise exception 'Your session could not be verified.' using errcode='42501'; end if;
  return a;
end $$;

create or replace function public.dcf_check_access(p_actor public.users,p_type text,p_record jsonb,p_write boolean default false,p_module text default null) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare module_name text; r public.roles_config%rowtype; v jsonb; scope_value text; allowed boolean; begin
  perform public.dcf_entity_table(p_type);
  if p_record is null then raise exception 'This record is no longer available.' using errcode='P0002'; end if;
  module_name:=coalesce(p_module,case p_type when 'activities' then 'Activities' when 'subprojects' then 'Subprojects' else 'Program Management' end);
  select * into r from public.roles_config where role=p_actor.role and module=module_name limit 1;
  v:=p_actor.permissions_override->module_name->case when p_write then 'can_edit' else 'can_view' end;
  allowed:=case when p_actor.role in ('Super Admin','Administrator') then true when p_write and p_actor.role='Guest' then false when jsonb_typeof(v)='boolean' then (v#>>'{}')::boolean else case when p_write then coalesce(r.can_edit,false) else coalesce(r.can_view,true) end end;
  if not allowed then raise exception 'You do not have permission for this record.' using errcode='42501'; end if;
  scope_value:=case when p_actor.visibility_scope in ('Own OU','All OUs') then p_actor.visibility_scope when r.visibility_scope in ('Own OU','All OUs') then r.visibility_scope when p_actor.role in ('Super Admin','Administrator','Management') then 'All OUs' else 'Own OU' end;
  if scope_value<>'All OUs' and (nullif(p_actor."operatingUnit",'') is null or p_record->>'operatingUnit' is distinct from p_actor."operatingUnit") then raise exception 'This record is outside your OU visibility scope.' using errcode='42501'; end if;
end $$;

create or replace function public.dcf_begin_operation(p_actor_id bigint,p_actor_password text,p_source text,p_operation_id uuid default null,p_reason text default null) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.users%rowtype; begin
  a:=public.dcf_authenticate(p_actor_id,p_actor_password);
  insert into public.dcf_revision_context(transaction_id,actor_id,actor_name,operation_id,source,reason,effective_at)
    values(txid_current(),a.id,coalesce(a."fullName",a.username,'Unknown'),coalesce(p_operation_id,gen_random_uuid()),left(p_source,100),p_reason,clock_timestamp())
    on conflict(transaction_id) do update set actor_id=excluded.actor_id,actor_name=excluded.actor_name,operation_id=excluded.operation_id,source=excluded.source,reason=excluded.reason,
      effective_at=case when dcf_revision_context.operation_id=excluded.operation_id then dcf_revision_context.effective_at else excluded.effective_at end,
      finalized_at=case when dcf_revision_context.operation_id=excluded.operation_id then dcf_revision_context.finalized_at else null end,
      correlation_id=case when dcf_revision_context.operation_id=excluded.operation_id then dcf_revision_context.correlation_id else null end,
      origin=case when dcf_revision_context.operation_id=excluded.operation_id then dcf_revision_context.origin else null end;
end $$;

create or replace function public.dcf_financial_type(p_type text) returns text language sql immutable set search_path=public,pg_temp as $$
  select case public.dcf_entity_table(p_type) when 'activities' then 'activity_expense' when 'subprojects' then 'subproject_detail' when 'staffing_requirements' then 'staffing_expense' when 'office_requirements' then 'office_requirement' else 'other_program_expense' end
$$;

create or replace function public.dcf_financial_stage(p_type text,p_record jsonb,p_item text,p_stage text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare arr jsonb; line jsonb; amount_key text; date_key text; months text[]:=array['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; i integer; begin
  if p_type='activities' then return public.activity_financial_stage(p_record,p_item,p_stage); end if;
  if p_type='subprojects' then return public.subproject_financial_stage(p_record,p_item,p_stage); end if;
  if p_stage='obligation' then select jsonb_agg(jsonb_build_object('id',id::text,'date',obligation_date::text,'amount',amount,'remarks',coalesce(remarks,'')) order by id) into arr from public.financial_obligations where entity_type=public.dcf_financial_type(p_type) and parent_id=(p_record->>'id')::bigint and coalesce(item_id::text,'')=coalesce(p_item,'');
  else select jsonb_agg(jsonb_build_object('id',id::text,'date',disbursement_date::text,'amount',amount,'remarks',coalesce(remarks,'')) order by id) into arr from public.financial_disbursements where entity_type=public.dcf_financial_type(p_type) and parent_id=(p_record->>'id')::bigint and coalesce(item_id::text,'')=coalesce(p_item,''); end if;
  if arr is not null or exists(select 1 from public.dcf_financial_entry_state where entity_type=p_type and parent_id=(p_record->>'id')::bigint and item_id=coalesce(p_item,'') and stage=p_stage) then return jsonb_build_object('source','central','entries',coalesce(arr,'[]')); end if;
  line:=p_record;
  if p_type='staffing_requirements' and p_item is not null then select value into line from jsonb_array_elements(coalesce(p_record->'expenses','[]')) where value->>'id'=p_item; end if;
  arr:=coalesce(nullif(line->case when p_stage='obligation' then 'obligations' else 'disbursements' end,'null'),'[]');
  if p_stage='disbursement' and jsonb_array_length(arr)=0 then
    for i in 1..12 loop
      if coalesce((line->>('actualDisbursement'||months[i]))::numeric,0)<>0 then arr:=arr||jsonb_build_array(jsonb_build_object('date',make_date(coalesce((p_record->>'fundYear')::integer,extract(year from current_date)::integer),i,1)::text,'amount',(line->>('actualDisbursement'||months[i]))::numeric,'remarks','Legacy monthly record')); end if;
    end loop;
  end if;
  amount_key:=case when p_stage='obligation' then 'actualObligationAmount' else 'actualDisbursementAmount' end;
  date_key:=case when p_stage='obligation' then 'actualObligationDate' else 'actualDisbursementDate' end;
  if jsonb_array_length(arr)=0 and coalesce((line->>amount_key)::numeric,0)<>0 then arr:=jsonb_build_array(jsonb_build_object('date',coalesce(line->>date_key,''),'amount',(line->>amount_key)::numeric,'remarks','Legacy Record')); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id','legacy:'||p_stage||':'||coalesce(p_item,'')||':'||(ordinality-1)::text,'date',coalesce(value->>'date',''),'amount',coalesce((value->>'amount')::numeric,0),'remarks',coalesce(value->>'remarks','')) order by ordinality),'[]') into arr from jsonb_array_elements(arr) with ordinality;
  return jsonb_build_object('source','legacy','entries',arr);
end $$;

create or replace function public.dcf_snapshot(p_type text,p_id bigint,p_record jsonb default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp set timezone='UTC' as $$
declare r jsonb:=p_record; obligations jsonb; disbursements jsonb; stages jsonb:='{}'; related jsonb:='{}'; physical jsonb; prior_physical jsonb; names text[]; n text; rows jsonb; line jsonb; item text; ids jsonb; begin
  perform public.dcf_entity_table(p_type);
  if r is null then execute format('select to_jsonb(r) from public.%I r where id=$1',p_type) into r using p_id; end if;
  select coalesce(jsonb_agg(public.dcf_project_embedded('ledger',to_jsonb(f)) order by id),'[]') into obligations from public.financial_obligations f where entity_type=public.dcf_financial_type(p_type) and parent_id=p_id;
  select coalesce(jsonb_agg(public.dcf_project_embedded('ledger',to_jsonb(f)) order by id),'[]') into disbursements from public.financial_disbursements f where entity_type=public.dcf_financial_type(p_type) and parent_id=p_id;
  if r is not null then
    if p_type in ('activities','subprojects','staffing_requirements') then
      for line in select value from jsonb_array_elements(coalesce(nullif(r->case when p_type='subprojects' then 'details' else 'expenses' end,'null'),'[]')) loop
        item:=line->>'id'; if item is null then continue; end if;
        stages:=stages||jsonb_build_object(item,jsonb_build_object('obligation',public.dcf_financial_stage(p_type,r,item,'obligation'),'disbursement',public.dcf_financial_stage(p_type,r,item,'disbursement')));
      end loop;
    end if;
    if p_type in ('office_requirements','other_program_expenses') or (p_type='staffing_requirements' and stages='{}') then stages:=jsonb_build_object('$parent',jsonb_build_object('obligation',public.dcf_financial_stage(p_type,r,null,'obligation'),'disbursement',public.dcf_financial_stage(p_type,r,null,'disbursement'))); end if;
    select coalesce(jsonb_object_agg(key,value),'{}') into physical from jsonb_each(r) where key=any(array['actualDate','actualEndDate','actualCompletionDate','actualMaleBeneficiaries','actualFemaleBeneficiaries','actualFourPsBeneficiaries','actualParticipantsMale','actualParticipantsFemale','actualPWD','actualMuslim','actualLGBTQ','actualSoloParent','actualSenior','actualYouth']);
    if p_type in ('office_requirements','staffing_requirements') then physical:=physical||jsonb_build_object('effectiveDate',coalesce(nullif(r->'actualDate','null'),nullif(r->'actualObligationDate','null')),'effectiveCount',case when coalesce(nullif(r->>'actualDate',''),nullif(r->>'actualObligationDate','')) is null then null when p_type='staffing_requirements' then '1'::jsonb else to_jsonb(coalesce(nullif((r->>'numberOfUnits')::numeric,0),1)) end); end if;
    if p_type='office_requirements' and nullif(physical->'effectiveDate','null') is not null then
      select before_snapshot->'physical' into prior_physical from public.dcf_revision_pending where transaction_id=txid_current() and entity_type=p_type and parent_id=p_id;
      if prior_physical is null then select v.snapshot->'physical' into prior_physical from public.dcf_record_revisions v join public.dcf_revision_heads h on h.latest_revision_id=v.id where h.entity_type=p_type and h.parent_id=p_id and not h.deleted; end if;
      -- Office has no separate actual-unit field. Preserve the quantity observed
      -- at encoding, rather than silently re-encoding later target-only edits.
      if prior_physical->'effectiveDate'=physical->'effectiveDate' and nullif(prior_physical->'effectiveCount','null') is not null then physical:=physical||jsonb_build_object('effectiveCount',prior_physical->'effectiveCount'); end if;
    end if;
    if p_type='subprojects' then select coalesce(jsonb_agg(jsonb_build_object('id',value->'id','actualDeliveryDate',value->'actualDeliveryDate','actualNumberOfUnits',value->'actualNumberOfUnits','isCompleted',value->'isCompleted','isCancelled',value->'isCancelled','isSuperseded',value->'isSuperseded') order by value->>'id'),'[]') into rows from jsonb_array_elements(coalesce(nullif(r->'details','null'),'[]')) where nullif(value->>'actualDeliveryDate','') is not null or nullif(value->'actualNumberOfUnits','null') is not null or value->'isCompleted'='true'::jsonb; physical:=physical||jsonb_build_object('items',rows); end if;
  end if;
  names:=case p_type when 'activities' then array['activity_supplements','activity_drive_files','activity_monitoring_reports'] when 'subprojects' then array['subproject_drive_files','subproject_accomplishments'] else array[]::text[] end;
  foreach n in array names loop
    if to_regclass('public.'||n) is null then continue; end if;
    execute format('select coalesce(jsonb_agg(public.dcf_project_embedded(%L,to_jsonb(x)) order by to_jsonb(x)->>''id''),''[]'') from public.%I x where (to_jsonb(x)->>%L)::bigint=$1',n,n,case when p_type='activities' then 'activity_id' else 'subproject_id' end) into rows using p_id;
    related:=related||jsonb_build_object(n,rows);
  end loop;
  if p_type='activities' and to_regclass('public.activity_monitoring_actions') is not null then
    execute 'select coalesce(jsonb_agg(public.dcf_project_embedded(''activity_monitoring_actions'',to_jsonb(a)) order by a.id),''[]'') from public.activity_monitoring_actions a join public.activity_monitoring_reports r on r.id=a.monitoring_report_id where r.activity_id=$1' into rows using p_id;
    related:=related||jsonb_build_object('activity_monitoring_actions',rows);
  end if;
  if p_type='subprojects' then physical:=coalesce(physical,'{}')||jsonb_build_object('deliveryEvidence',coalesce(related->'subproject_accomplishments','[]')); end if;
  if to_regclass('public.budget_item_adjustment_history') is not null then
    execute 'select coalesce(jsonb_agg(public.dcf_project_embedded(''budget_item_adjustment_history'',to_jsonb(a)) order by a.id),''[]'') from public.budget_item_adjustment_history a where a.parent_id=$1 and a.source_type=any($2)' into rows using p_id,case p_type when 'subprojects' then array['subproject','subproject_detail'] when 'activities' then array['activity','activity_expense'] when 'staffing_requirements' then array['staffing','staffing_requirement','staffing_expense'] else array[p_type] end;
    related:=related||jsonb_build_object('budget_item_adjustment_history',rows);
  end if;
  if to_regclass('public.budget_item_transfers') is not null and p_type in ('activities','subprojects') then
    select coalesce(jsonb_agg(public.dcf_project_embedded('transfers',to_jsonb(t)) order by created_at,id),'[]') into rows from public.budget_item_transfers t where source_type=case when p_type='activities' then 'activity' else 'subproject' end and (source_id=p_id or destination_id=p_id);
    related:=related||jsonb_build_object('transfers',rows);
    physical:=coalesce(physical,'{}')||jsonb_build_object('transferActivation',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'status',status,'resolvedAt',resolved_at) order by id),'[]') from public.budget_item_transfers where destination_id=p_id and source_type=case when p_type='activities' then 'activity' else 'subproject' end));
  end if;
  if to_regclass('public.ref_fund_sources') is not null and nullif(r->>'fundSourceUid','') is not null then
    execute 'select public.dcf_project_embedded(''fundSource'',to_jsonb(x)) from public.ref_fund_sources x where to_jsonb(x)->>''uid''=$1' into rows using r->>'fundSourceUid'; related:=related||jsonb_build_object('fundSource',rows);
  end if;
  if r is not null and p_type in ('activities','subprojects') then
    select coalesce(jsonb_agg(public.dcf_project_embedded('ipo-reference',to_jsonb(x)) order by x.id),'[]') into rows from public.ipos x
      where (p_type='subprojects' and x.id::text=r->>'ipo_id') or (p_type='activities' and exists(select 1 from jsonb_array_elements_text(coalesce(nullif(r->'participating_ipo_ids','null'),'[]')) i where i=x.id::text));
    related:=related||jsonb_build_object('ipos',rows);
    if p_type='activities' then
      select public.dcf_project_embedded('activity-reference',to_jsonb(x)) into rows from public.reference_activities x where x.id::text=r->>'reference_activity_id';
      related:=related||jsonb_build_object('referenceActivity',rows);
    end if;
  end if;
  return jsonb_build_object('schemaVersion',1,'entityType',p_type,'parentId',p_id,'record',public.dcf_project_record(p_type,r),'financial',jsonb_build_object('obligations',obligations,'disbursements',disbursements,'stages',stages),'related',related,'physical',coalesce(physical,'{}'),
    'coverage',jsonb_build_object('serializerVersion',1,'complete',not exists(select 1 from public.dcf_revision_context where transaction_id=txid_current() and source='legacy-browser-write'),'sections',jsonb_build_array('record','financial','physical','related'),
      'recordFields',(select coalesce(jsonb_agg(key order by key),'[]') from jsonb_each(coalesce(public.dcf_project_record(p_type,r),'{}')))));
end $$;

create or replace function public.dcf_assert_snapshot(p_type text,p_id bigint,p_snapshot jsonb) returns void language plpgsql stable security definer set search_path=public,pg_temp as $$
declare expected jsonb; captured jsonb; line_key text; lines jsonb; item jsonb; stage jsonb; key text; expected_stage_keys text[]; begin
  perform public.dcf_entity_table(p_type);
  if jsonb_typeof(p_snapshot) is distinct from 'object' or p_snapshot->>'schemaVersion' is distinct from '1'
    or p_snapshot->>'entityType' is distinct from p_type or p_snapshot->>'parentId' is distinct from p_id::text
    or jsonb_typeof(p_snapshot->'record') is distinct from 'object' or p_snapshot->'record'->>'id' is distinct from p_id::text then
    raise exception 'The selected snapshot identity or schema is incomplete.' using errcode='22023';
  end if;
  if p_snapshot->'coverage'->>'serializerVersion' is distinct from '1' or p_snapshot->'coverage'->'complete' is distinct from 'true'::jsonb
    or p_snapshot->'coverage'->'sections' is distinct from '["record","financial","physical","related"]'::jsonb then
    raise exception 'This version has no verified complete snapshot coverage.' using errcode='22023';
  end if;
  select coalesce(jsonb_agg(x.attname order by x.attname),'[]') into expected from pg_attribute x
    where x.attrelid=to_regclass('public.'||p_type) and x.attnum>0 and not x.attisdropped and x.attname=any(public.dcf_field_names(p_type));
  select coalesce(jsonb_agg(x.key order by x.key),'[]') into captured from jsonb_each(p_snapshot->'record') x;
  if expected is distinct from captured or p_snapshot->'coverage'->'recordFields' is distinct from captured then
    raise exception 'The saved record fields are incomplete or this module schema has changed. Restore requires a compatible snapshot.' using errcode='22023';
  end if;
  if jsonb_typeof(p_snapshot->'related') is distinct from 'object' or jsonb_typeof(p_snapshot->'physical') is distinct from 'object'
    or jsonb_typeof(p_snapshot->'financial') is distinct from 'object' or jsonb_typeof(p_snapshot->'financial'->'obligations') is distinct from 'array'
    or jsonb_typeof(p_snapshot->'financial'->'disbursements') is distinct from 'array' or jsonb_typeof(p_snapshot->'financial'->'stages') is distinct from 'object' then
    raise exception 'The saved snapshot sections are incomplete.' using errcode='22023';
  end if;
  expected_stage_keys:=array[]::text[];
  if p_type in ('activities','subprojects','staffing_requirements') then
    line_key:=case when p_type='subprojects' then 'details' else 'expenses' end;
    lines:=coalesce(nullif(p_snapshot->'record'->line_key,'null'),'[]');
    if jsonb_typeof(lines) is distinct from 'array' then raise exception 'The historical budget-item section is incomplete.' using errcode='22023'; end if;
    for item in select value from jsonb_array_elements(lines) loop
      key:=item->>'id';
      if jsonb_typeof(item) is distinct from 'object' or nullif(key,'') is null or key=any(expected_stage_keys) then raise exception 'The saved budget identities are incomplete or ambiguous.' using errcode='22023'; end if;
      expected_stage_keys:=array_append(expected_stage_keys,key);
    end loop;
  end if;
  if p_type in ('office_requirements','other_program_expenses') or (p_type='staffing_requirements' and cardinality(expected_stage_keys)=0) then expected_stage_keys:=array['$parent']; end if;
  if (select count(*) from jsonb_each(p_snapshot->'financial'->'stages'))<>cardinality(expected_stage_keys) then raise exception 'The saved financial-stage coverage is incomplete.' using errcode='22023'; end if;
  foreach key in array expected_stage_keys loop
    item:=p_snapshot->'financial'->'stages'->key;
    if jsonb_typeof(item) is distinct from 'object' then raise exception 'A saved item financial stage is missing.' using errcode='22023'; end if;
    for stage in select item->'obligation' union all select item->'disbursement' loop
      if jsonb_typeof(stage) is distinct from 'object' or coalesce(stage->>'source','') not in ('central','legacy') or jsonb_typeof(stage->'entries') is distinct from 'array' then
        raise exception 'The saved financial-stage provenance is incomplete.' using errcode='22023';
      end if;
      if exists(select 1 from jsonb_array_elements(stage->'entries') e where jsonb_typeof(e) is distinct from 'object' or nullif(e->>'id','') is null or jsonb_typeof(e->'date') is distinct from 'string' or jsonb_typeof(e->'amount') is distinct from 'number')
        or exists(select 1 from jsonb_array_elements(stage->'entries') e group by e->>'id' having count(*)>1) then
        raise exception 'Saved financial entry identities or values are incomplete or ambiguous.' using errcode='22023';
      end if;
    end loop;
  end loop;
end $$;

create or replace function public.dcf_business_identity(p_value jsonb) returns jsonb language plpgsql immutable set search_path=public,pg_temp as $$
declare result jsonb; begin
  if jsonb_typeof(p_value)='object' then
    select coalesce(jsonb_object_agg(key,public.dcf_business_identity(value)),'{}') into result from jsonb_each(p_value) where key not in ('updated_at','edited_at');
    return result;
  elsif jsonb_typeof(p_value)='array' then
    select coalesce(jsonb_agg(public.dcf_business_identity(value) order by ordinality),'[]') into result from jsonb_array_elements(p_value) with ordinality;
    return result;
  end if;
  return p_value;
end $$;

create or replace function public.dcf_snapshot_hash(p_snapshot jsonb) returns text language sql immutable set search_path=public,pg_temp as $$
  select md5(public.dcf_business_identity((p_snapshot-'revisionId'-'hash') #- '{record,physical_accomplishment_submitted_at}' #- '{record,history}')::text)
$$;

create or replace function public.dcf_legacy_keys(p_history jsonb) returns jsonb language sql immutable set search_path=public,pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_array(x->>'date',x->>'event',x->>'user')),'[]') from jsonb_array_elements(case when jsonb_typeof(p_history)='array' then p_history else '[]' end) x
    where jsonb_typeof(x->'date')='string' and jsonb_typeof(x->'event')='string' and jsonb_typeof(x->'user')='string'
$$;

create or replace function public.dcf_queue_revision(p_type text,p_id bigint,p_old_record jsonb default null,p_insert boolean default false) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare before_value jsonb; old_history jsonb; begin
  perform public.dcf_entity_table(p_type);
  if exists(select 1 from public.dcf_revision_pending where transaction_id=txid_current() and entity_type=p_type and parent_id=p_id) then return; end if;
  execute format('select id from public.%I where id=$1 for update',p_type) using p_id;
  before_value:=case when p_insert then null else public.dcf_snapshot(p_type,p_id,p_old_record) end;
  insert into public.dcf_revision_context(transaction_id,actor_name,operation_id,source) values(txid_current(),'System / unverified actor',gen_random_uuid(),'database') on conflict do nothing;
  if p_old_record is not null then old_history:=p_old_record->'history';
  elsif not p_insert then execute format('select to_jsonb(r)->''history'' from public.%I r where id=$1',p_type) into old_history using p_id; end if;
  insert into public.dcf_revision_pending(transaction_id,entity_type,parent_id,before_snapshot,before_legacy_keys)
    values(txid_current(),p_type,p_id,before_value,public.dcf_legacy_keys(old_history)) on conflict do nothing;
end $$;

create or replace function public.dcf_finalize_revision(p_type text,p_id bigint) returns bigint language plpgsql security definer set search_path=public,pg_temp as $$
declare q public.dcf_revision_pending%rowtype; c public.dcf_revision_context%rowtype; h public.dcf_revision_heads%rowtype; after_value jsonb; before_hash text; after_hash text; new_id bigint; fields text[]; kind_value text; prior_time timestamptz; current_history jsonb; captured_legacy_keys jsonb; begin
  select * into q from public.dcf_revision_pending where transaction_id=txid_current() and entity_type=p_type and parent_id=p_id;
  if not found then return (select latest_revision_id from public.dcf_revision_heads where entity_type=p_type and parent_id=p_id); end if;
  select * into c from public.dcf_revision_context where transaction_id=txid_current();
  after_value:=public.dcf_snapshot(p_type,p_id); after_hash:=public.dcf_snapshot_hash(after_value); before_hash:=public.dcf_snapshot_hash(q.before_snapshot);
  delete from public.dcf_revision_pending where transaction_id=txid_current() and entity_type=p_type and parent_id=p_id;
  if q.before_snapshot is not null and before_hash=after_hash then return (select latest_revision_id from public.dcf_revision_heads where entity_type=p_type and parent_id=p_id); end if;
  insert into public.dcf_revision_heads(entity_type,parent_id) values(p_type,p_id) on conflict do nothing;
  select * into h from public.dcf_revision_heads where entity_type=p_type and parent_id=p_id for update;
  if c.finalized_at is null then
    -- Context creation precedes lock waits. Seal the operation's shared effective
    -- time only once the queued parents are locked and their writes are complete.
    select max(v.recorded_at) into prior_time from public.dcf_revision_heads x join public.dcf_record_revisions v on v.id=x.latest_revision_id
      where (x.entity_type=p_type and x.parent_id=p_id) or exists(select 1 from public.dcf_revision_pending p where p.transaction_id=txid_current() and p.entity_type=x.entity_type and p.parent_id=x.parent_id);
    update public.dcf_revision_context set effective_at=greatest(clock_timestamp(),prior_time+interval '1 microsecond'),finalized_at=clock_timestamp()
      where transaction_id=txid_current() returning * into c;
  end if;
  if h.deleted and q.before_snapshot is null then h.incarnation:=gen_random_uuid(); h.version:=0; h.latest_revision_id:=null; end if;
  if h.version=0 and q.before_snapshot->'record'<>'null'::jsonb then
    insert into public.dcf_record_revisions(entity_type,parent_id,incarnation,version,recorded_at,actor_id,actor_name,operation_id,correlation_id,source,kind,reason,changed_fields,summary,snapshot,snapshot_hash)
    values(p_type,p_id,h.incarnation,1,c.effective_at,c.actor_id,c.actor_name,c.operation_id,coalesce(c.correlation_id,c.operation_id),c.source,'baseline','State observed immediately before the first tracked mutation',array[]::text[],'Opening state (coverage starts here)',q.before_snapshot,before_hash) returning id into h.latest_revision_id;
    h.version:=1;
  end if;
  select coalesce(array_agg(k order by k),array[]::text[]) into fields from (
    select key k from jsonb_each(coalesce(nullif(after_value->'record','null'),'{}')||coalesce(nullif(q.before_snapshot->'record','null'),'{}'))
    where (after_value->'record'->key) is distinct from (q.before_snapshot->'record'->key) and key<>'physical_accomplishment_submitted_at'
    union select 'financial' where public.dcf_business_identity(after_value->'financial') is distinct from public.dcf_business_identity(q.before_snapshot->'financial')
    union select 'related' where public.dcf_business_identity(after_value->'related') is distinct from public.dcf_business_identity(q.before_snapshot->'related')
  ) changed;
  kind_value:=case when after_value->'record'='null'::jsonb then 'delete' when q.before_snapshot is null then 'create' when c.source='history-restore' then 'history-restore' when c.source='undo-restore' then 'undo-restore' else 'update' end;
  execute format('select to_jsonb(r)->''history'' from public.%I r where id=$1',p_type) into current_history using p_id;
  select coalesce(jsonb_agg(x),'[]') into captured_legacy_keys from jsonb_array_elements(public.dcf_legacy_keys(current_history)) x
    where not exists(select 1 from jsonb_array_elements(q.before_legacy_keys) b where b=x) and c.source<>'archive-recovery';
  insert into public.dcf_record_revisions(entity_type,parent_id,incarnation,version,previous_revision_id,recorded_at,actor_id,actor_name,operation_id,correlation_id,origin,source,kind,reason,changed_fields,summary,physical_changed,snapshot,snapshot_hash,legacy_keys)
  values(p_type,p_id,h.incarnation,h.version+1,h.latest_revision_id,c.effective_at,c.actor_id,c.actor_name,c.operation_id,coalesce(c.correlation_id,c.operation_id),c.origin,c.source,kind_value,c.reason,fields,
    case kind_value when 'create' then case when c.origin->>'kind'='clone' then 'Cloned from '||coalesce(c.origin->>'uid',c.origin->>'parentId') else 'Created record' end when 'delete' then 'Deleted record' when 'history-restore' then 'Restored historical version' when 'undo-restore' then 'Undid historical restore'
      else case when 'workflow_status'=any(fields) then case after_value->'record'->>'workflow_status' when 'APPROVED' then 'Approved record' when 'REJECTED' then 'Rejected record' when 'PENDING' then 'Submitted for approval' else 'Updated workflow status' end else 'Updated '||array_to_string(fields,', ') end end,
    after_value->'physical' is distinct from coalesce(q.before_snapshot->'physical','{}'),after_value,after_hash,captured_legacy_keys) returning id into new_id;
  update public.dcf_revision_heads set incarnation=h.incarnation,version=h.version+1,latest_revision_id=new_id,deleted=(after_value->'record'='null'::jsonb) where entity_type=p_type and parent_id=p_id;
  return new_id;
end $$;

create or replace function public.dcf_require_browser_operation() returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare caller_role text:=current_setting('role',true); claims jsonb:=coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb; begin
  if (caller_role in ('anon','authenticated') or claims->>'role' in ('anon','authenticated'))
    and not exists(select 1 from public.dcf_revision_context where transaction_id=txid_current() and actor_id is not null) then
    if public.dcf_browser_guard_enabled() then
      raise exception 'This DCF save requires the current transactional client. Refresh the application before saving; keep your draft for reference.' using errcode='42501';
    end if;
    insert into public.dcf_revision_context(transaction_id,actor_name,operation_id,source)
      values(txid_current(),'System / unverified actor',gen_random_uuid(),'legacy-browser-write') on conflict do nothing;
  end if;
end $$;

create or replace function public.dcf_capture_parent() returns trigger language plpgsql security definer set search_path=public,pg_temp set timezone='UTC' as $$
begin
  if tg_op='UPDATE' and public.dcf_project_record(tg_table_name,to_jsonb(old)) is not distinct from public.dcf_project_record(tg_table_name,to_jsonb(new)) then return new; end if;
  perform public.dcf_require_browser_operation();
  if tg_op='INSERT' then perform public.dcf_queue_revision(tg_table_name,new.id,null,true); return new; end if;
  perform public.dcf_queue_revision(tg_table_name,old.id,to_jsonb(old));
  if tg_op='DELETE' then return old; end if; return new;
end $$;
create or replace function public.dcf_finish_pending() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.dcf_finalize_revision(new.entity_type,new.parent_id);
  if not exists(select 1 from public.dcf_revision_pending where transaction_id=txid_current()) then delete from public.dcf_revision_context where transaction_id=txid_current(); end if;
  return null;
end $$;
drop trigger if exists dcf_finish_pending on public.dcf_revision_pending;
create constraint trigger dcf_finish_pending after insert on public.dcf_revision_pending deferrable initially deferred for each row execute function public.dcf_finish_pending();

create or replace function public.dcf_cleanup_context() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from public.dcf_revision_pending where transaction_id=new.transaction_id) then delete from public.dcf_revision_context where transaction_id=new.transaction_id; end if;
  return null;
end $$;
drop trigger if exists dcf_cleanup_context on public.dcf_revision_context;
create constraint trigger dcf_cleanup_context after insert on public.dcf_revision_context deferrable initially deferred for each row execute function public.dcf_cleanup_context();

create or replace function public.dcf_capture_child() returns trigger language plpgsql security definer set search_path=public,pg_temp set timezone='UTC' as $$
declare row_value jsonb; entity text; parent_value bigint; item text; stage_value text; i integer; begin
  for i in 1..2 loop
    if i=1 and tg_op='INSERT' or i=2 and tg_op='DELETE' then continue; end if;
    row_value:=case when i=1 then to_jsonb(old) else to_jsonb(new) end; entity:=null; parent_value:=null;
    if tg_table_name in ('financial_obligations','financial_disbursements') then
      entity:=case row_value->>'entity_type' when 'activity_expense' then 'activities' when 'subproject_detail' then 'subprojects' when 'staffing_expense' then 'staffing_requirements' when 'office_requirement' then 'office_requirements' when 'other_program_expense' then 'other_program_expenses' end;
      parent_value:=(row_value->>'parent_id')::bigint;
    elsif tg_table_name='budget_item_transfers' then
      entity:=case row_value->>'source_type' when 'activity' then 'activities' when 'subproject' then 'subprojects' end;
      if entity is not null then
        perform public.dcf_queue_revision(entity,(row_value->>'source_id')::bigint);
        if row_value->>'destination_id' is not null then perform public.dcf_queue_revision(entity,(row_value->>'destination_id')::bigint); end if;
      end if;
    elsif tg_table_name='activity_monitoring_actions' then
      entity:='activities'; select activity_id into parent_value from public.activity_monitoring_reports where id=(row_value->>'monitoring_report_id')::bigint;
    elsif tg_table_name='budget_item_adjustment_history' then
      entity:=case row_value->>'source_type' when 'subproject' then 'subprojects' when 'subproject_detail' then 'subprojects' when 'activity' then 'activities' when 'activity_expense' then 'activities' when 'staffing' then 'staffing_requirements' when 'staffing_requirement' then 'staffing_requirements' when 'staffing_expense' then 'staffing_requirements' end;
      parent_value:=(row_value->>'parent_id')::bigint;
    elsif row_value ? 'activity_id' then entity:='activities'; parent_value:=(row_value->>'activity_id')::bigint;
    elsif row_value ? 'subproject_id' then entity:='subprojects'; parent_value:=(row_value->>'subproject_id')::bigint;
    end if;
    if entity is not null and parent_value is not null then
      if tg_table_name in ('financial_obligations','financial_disbursements','budget_item_adjustment_history') then perform public.dcf_require_browser_operation(); end if;
      perform public.dcf_queue_revision(entity,parent_value);
      if tg_table_name in ('financial_obligations','financial_disbursements') and entity not in ('activities','subprojects') then
        stage_value:=case when tg_table_name='financial_obligations' then 'obligation' else 'disbursement' end;
        insert into public.dcf_financial_entry_state values(entity,parent_value,coalesce(row_value->>'item_id',''),stage_value) on conflict do nothing;
      end if;
    end if;
  end loop;
  if tg_op='DELETE' then return old; end if; return new;
end $$;

do $$ declare n text; begin
  foreach n in array array['activities','subprojects','office_requirements','staffing_requirements','other_program_expenses'] loop
    execute format('drop trigger if exists aaa_dcf_capture on public.%I',n);
    execute format('create trigger aaa_dcf_capture before insert or update or delete on public.%I for each row execute function public.dcf_capture_parent()',n);
  end loop;
  foreach n in array array['financial_obligations','financial_disbursements','budget_item_transfers','activity_supplements','activity_drive_files','subproject_drive_files','activity_monitoring_reports','activity_monitoring_actions','subproject_accomplishments','budget_item_adjustment_history'] loop
    if to_regclass('public.'||n) is null then continue; end if;
    execute format('drop trigger if exists aaa_dcf_capture on public.%I',n);
    execute format('create trigger aaa_dcf_capture before insert or update or delete on public.%I for each row execute function public.dcf_capture_child()',n);
  end loop;
end $$;

-- Existing authenticated transactions establish attribution internally. Signatures,
-- original validation, grants and retry receipts remain intact.
do $$ declare f record; definition text; marker text; start_at integer; injected text; begin
  for f in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('save_activity_accomplishment','save_subproject_accomplishment','save_activity_supplement','submit_budget_item_transfer','resolve_budget_item_transfer') loop
    definition:=replace(pg_get_functiondef(f.oid),E'\r','');
    if definition like '%dcf_begin_operation(%' then continue; end if;
    marker:=E'\nbegin\n'; start_at:=strpos(definition,marker);
    if start_at=0 then raise exception 'The verified % body boundary changed; history installation stopped.',f.proname; end if;
    injected:=format(E'\n  perform public.dcf_begin_operation(p_actor_id,p_actor_password,%L,%s,%s);',f.proname,case when definition like '%p_request_key uuid%' then 'p_request_key' else 'gen_random_uuid()' end,case when definition like '%p_reason text%' then 'p_reason' else 'null' end);
    definition:=overlay(definition placing marker||injected from start_at for length(marker));
    execute definition;
  end loop;
end $$;

create or replace function public.read_dcf_state(p_actor_id bigint,p_actor_password text,p_entity_type text,p_parent_id bigint) returns jsonb language plpgsql security definer set search_path=public,pg_temp set timezone='UTC' as $$
declare a public.users%rowtype; s jsonb; rid bigint; current_record jsonb; begin
  a:=public.dcf_authenticate(p_actor_id,p_actor_password); s:=public.dcf_snapshot(p_entity_type,p_parent_id);
  perform public.dcf_check_access(a,p_entity_type,nullif(s->'record','null'));
  select latest_revision_id into rid from public.dcf_revision_heads where entity_type=p_entity_type and parent_id=p_parent_id and not deleted;
  execute format('select to_jsonb(r) from public.%I r where id=$1',p_entity_type) into current_record using p_parent_id;
  return s||jsonb_build_object('record',public.dcf_response_record(p_entity_type,current_record),'revisionId',rid,'hash',public.dcf_snapshot_hash(s));
end $$;

create or replace function public.list_dcf_revisions(p_actor_id bigint,p_actor_password text,p_entity_type text,p_parent_id bigint,p_limit integer default 10,p_before_revision bigint default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s jsonb; h public.dcf_revision_heads%rowtype; rows jsonb; total bigint; legacy_total bigint; a public.users%rowtype; settings jsonb; status_value text; can_restore boolean:=false; begin
  perform public.dcf_entity_table(p_entity_type);
  a:=public.dcf_authenticate(p_actor_id,p_actor_password);
  execute format('select to_jsonb(r) from public.%I r where id=$1',p_entity_type) into s using p_parent_id;
  perform public.dcf_check_access(a,p_entity_type,s);
  if p_limit not in (10,20,50) then raise exception 'Unsupported history page size.'; end if;
  select * into h from public.dcf_revision_heads where entity_type=p_entity_type and parent_id=p_parent_id;
  select count(*) into total from public.dcf_record_revisions where incarnation=h.incarnation;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.version desc),'[]') into rows from (
    select r.id,r.version,r.recorded_at,r.actor_name,r.source,r.kind,r.summary,r.changed_fields,r.reason,r.physical_changed,r.legacy_keys,
      (select o.id from public.dcf_restore_operations o where o.result_revision_id=r.id) restore_operation_id,
      r.id=h.latest_revision_id and exists(select 1 from public.dcf_restore_operations o where o.result_revision_id=r.id and not exists(select 1 from public.dcf_restore_operations u where u.undo_of=o.id)) can_undo
    from public.dcf_record_revisions r where r.entity_type=p_entity_type and r.parent_id=p_parent_id and r.incarnation=h.incarnation and (p_before_revision is null or r.id<p_before_revision) order by r.version desc limit p_limit
  ) x;
  select count(*) into legacy_total from jsonb_array_elements(case when jsonb_typeof(s->'history')='array' then s->'history' else '[]' end) e
    where not exists(select 1 from public.dcf_record_revisions r where r.entity_type=p_entity_type and r.parent_id=p_parent_id and r.incarnation=h.incarnation
      and r.legacy_keys @> jsonb_build_array(jsonb_build_array(e->>'date',e->>'event',e->>'user')));
  select x.settings into settings from public.dcf_policy_settings x where settings_key='dcf_editing_policy';
  status_value:=case when p_entity_type='staffing_requirements' then coalesce(s->>'hiringStatus','Proposed') else coalesce(s->>'status','Proposed') end;
  can_restore:=a.role='Super Admin' or (a.role<>'Guest' and coalesce(settings->'roleRules'->a.role->p_entity_type->status_value->'restoreHistory','false')='true'::jsonb);
  begin perform public.dcf_check_access(a,p_entity_type,s,true); exception when others then can_restore:=false; end;
  return jsonb_build_object('rows',rows,'total',total,'legacyTotal',legacy_total,'latestRevisionId',h.latest_revision_id,'canRestore',can_restore,'nextCursor',case when jsonb_array_length(rows)=p_limit then rows->-1->'id' else null end);
end $$;

create or replace function public.read_dcf_revision(p_actor_id bigint,p_actor_password text,p_entity_type text,p_parent_id bigint,p_revision_id bigint) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s jsonb; r public.dcf_record_revisions%rowtype; a public.users%rowtype; current_revision bigint; begin
  perform public.dcf_entity_table(p_entity_type);
  a:=public.dcf_authenticate(p_actor_id,p_actor_password);
  execute format('select to_jsonb(r) from public.%I r where id=$1',p_entity_type) into s using p_parent_id;
  perform public.dcf_check_access(a,p_entity_type,s);
  select * into r from public.dcf_record_revisions where id=p_revision_id and entity_type=p_entity_type and parent_id=p_parent_id and incarnation=(select incarnation from public.dcf_revision_heads where entity_type=p_entity_type and parent_id=p_parent_id);
  if not found then raise exception 'This version is unavailable.' using errcode='P0002'; end if;
  select latest_revision_id into current_revision from public.dcf_revision_heads where entity_type=p_entity_type and parent_id=p_parent_id;
  return to_jsonb(r)||jsonb_build_object('currentRevisionId',current_revision);
end $$;

-- Internal helpers stay private, including actor/context setters and snapshots.
do $$ declare f record; begin
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'dcf\_%' escape '\' or p.proname in ('read_dcf_state','list_dcf_revisions','read_dcf_revision')) loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  end loop;
end $$;
grant execute on function public.read_dcf_state(bigint,text,text,bigint),public.list_dcf_revisions(bigint,text,text,bigint,integer,bigint),public.read_dcf_revision(bigint,text,text,bigint,bigint) to anon,authenticated;

do $$ declare n text; actual text; expected text; begin
  for n,expected in select table_name,signature from dcf_history_install_check loop
    execute format('select md5(coalesce(string_agg(md5(to_jsonb(r)::text),'''' order by id),'''')) from public.%I r',n) into actual;
    if actual is distinct from expected then raise exception 'History installation changed business records in %',n; end if;
  end loop;
end $$;
commit;
