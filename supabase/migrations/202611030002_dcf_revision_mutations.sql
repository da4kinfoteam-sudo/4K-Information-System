-- Transactional saves and reversible history operations. No install-time business DML.
begin;
set local lock_timeout='5s';

create table if not exists public.dcf_financial_lineage(
  entity_type text not null,parent_id bigint not null,item_id text not null,stage text not null,
  historical_id text not null,live_id bigint not null,operation_id uuid not null,
  primary key(entity_type,parent_id,item_id,stage,historical_id)
);
alter table public.dcf_financial_lineage enable row level security;
revoke all on public.dcf_financial_lineage from public,anon,authenticated;

create or replace function public.dcf_line_plans(p_lines jsonb) returns jsonb language sql immutable set search_path=public,pg_temp as $$
  select coalesce(jsonb_agg((select coalesce(jsonb_object_agg(key,value),'{}') from jsonb_each(x.value) where key not like 'actual%' and key not in ('obligations','disbursements','isCompleted')) order by x.ordinality),'[]') from jsonb_array_elements(coalesce(nullif(p_lines,'null'),'[]')) with ordinality x
$$;

create or replace function public.dcf_actual_fragment(p_record jsonb,p_part text) returns jsonb language sql immutable set search_path=public,pg_temp as $$
  select coalesce(jsonb_object_agg(key,value),'{}') from jsonb_each(coalesce(nullif(p_record,'null'),'{}'))
  where (case when p_part='physical' then key in ('actualDeliveryDate','actualNumberOfUnits','isCompleted')
    else (key like 'actual%' and key not in ('actualDeliveryDate','actualNumberOfUnits')) or key in ('obligations','disbursements') end)
    and value not in ('null'::jsonb,'0'::jsonb,'false'::jsonb,'""'::jsonb,'[]'::jsonb)
$$;

create or replace function public.dcf_line_actuals(p_lines jsonb,p_part text) returns jsonb language sql immutable set search_path=public,pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',x.value->'id')||public.dcf_actual_fragment(x.value,p_part) order by x.ordinality),'[]')
  from jsonb_array_elements(coalesce(nullif(p_lines,'null'),'[]')) with ordinality x
  where public.dcf_actual_fragment(x.value,p_part)<>'{}'::jsonb
$$;

create or replace function public.dcf_financial_fields() returns text[] language sql immutable set search_path=public,pg_temp as $$
  select array['actualAmount','actualObligationDate','actualObligationAmount','actualDisbursementDate','actualDisbursementAmount','obligations','disbursements',
    'actualDisbursementJan','actualDisbursementFeb','actualDisbursementMar','actualDisbursementApr','actualDisbursementMay','actualDisbursementJun','actualDisbursementJul','actualDisbursementAug','actualDisbursementSep','actualDisbursementOct','actualDisbursementNov','actualDisbursementDec']
$$;

create or replace function public.dcf_preserve_financial(p_target jsonb,p_current jsonb) returns jsonb language sql immutable set search_path=public,pg_temp as $$
  select (p_target-public.dcf_financial_fields())||coalesce((select jsonb_object_agg(key,value) from jsonb_each(coalesce(p_current,'{}')) where key=any(public.dcf_financial_fields())),'{}')
$$;

create or replace function public.dcf_merge_lines(p_current jsonb,p_proposed jsonb) returns jsonb language sql immutable set search_path=public,pg_temp as $$
  select coalesce(jsonb_agg((coalesce(old.value,'{}')-coalesce(array(select key from jsonb_each(public.dcf_project_embedded('budget',coalesce(old.value,'{}')))),array[]::text[]))||n.value order by n.ordinality),'[]')
  from jsonb_array_elements(coalesce(p_proposed,'[]')) with ordinality n
  left join lateral (select x.value from jsonb_array_elements(coalesce(nullif(p_current,'null'),'[]')) x where x.value->>'id'=n.value->>'id' limit 1) old on true
$$;

create or replace function public.dcf_derived_physical(p_type text,p_record jsonb) returns jsonb language plpgsql immutable set search_path=public,pg_temp as $$
declare active_count integer; completed_count integer; last_date text; begin
  if p_record->>'status'='Cancelled' then return p_record; end if;
  if p_type='activities' then
    return p_record||jsonb_build_object('status',case when nullif(p_record->>'actualDate','') is not null then 'Completed' when p_record->>'status'='Proposed' then 'Proposed' else 'Ongoing' end);
  elsif p_type='subprojects' then
    select count(*),count(*) filter(where nullif(value->>'actualDeliveryDate','') is not null and coalesce((value->>'isCompleted')::boolean,not(value ? 'isCompleted'))),max(nullif(value->>'actualDeliveryDate','')) into active_count,completed_count,last_date
      from jsonb_array_elements(coalesce(nullif(p_record->'details','null'),'[]')) where (p_record->>'status'='Proposed' or not coalesce((value->>'isCancelled')::boolean,false)) and not coalesce((value->>'isSuperseded')::boolean,false);
    return p_record||jsonb_build_object('actualCompletionDate',case when active_count>0 and completed_count=active_count then last_date else null end,'status',case when p_record->>'status'='Proposed' then 'Proposed' when active_count>0 and completed_count=active_count then 'Completed' else 'Ongoing' end);
  end if;
  return p_record;
end $$;

create or replace function public.dcf_check_action(p_actor public.users,p_type text,p_record jsonb,p_action text,p_reason text,p_month text default null) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare settings jsonb; overrides jsonb; status_value text; allowed boolean; v jsonb; module_name text; begin
  if p_actor.role='Guest' then raise exception 'Guest users do not have write permission for DCF records.' using errcode='42501'; end if;
  module_name:=case when p_action='editFinancialAccomplishment' then 'Accomplishment - Financial' when p_action='editPhysicalAccomplishment' then 'Accomplishment - Physical' else null end;
  perform public.dcf_check_access(p_actor,p_type,p_record,true,module_name);
  status_value:=case when p_type='staffing_requirements' then coalesce(p_record->>'hiringStatus','Proposed') else coalesce(p_record->>'status','Proposed') end;
  select s.settings into settings from public.dcf_policy_settings s where settings_key='dcf_editing_policy'; settings:=coalesce(settings,'{}');
  overrides:=coalesce(settings->'monthLock'->'overrideRoles','["Super Admin","Administrator"]');
  if p_action='restoreHistory' then
    v:=settings->'roleRules'->p_actor.role->p_type->status_value->p_action;
    if p_actor.role<>'Super Admin' and (jsonb_typeof(v) is distinct from 'boolean' or v<>'true'::jsonb) then raise exception 'Restore History permission is required.' using errcode='42501'; end if;
    return;
  end if;
  if p_type='activities' and p_action='editBudget' and (status_value<>'Proposed' or nullif(p_record->'original_budget_snapshot','null') is not null) then raise exception 'The original Activity budget is frozen. Use Supplemental Information.' using errcode='42501'; end if;
  if overrides ? p_actor.role then
    if coalesce((settings->'monthLock'->>'requireOverrideReason')::boolean,true) and nullif(btrim(p_reason),'') is null then raise exception 'An override reason is required.' using errcode='42501'; end if;
    return;
  end if;
  v:=settings->'roleRules'->p_actor.role->p_type->status_value->p_action;
  allowed:=case when jsonb_typeof(v)='boolean' then (v#>>'{}')::boolean else case when p_action in ('editDetails','editBudget','delete') then status_value='Proposed' else status_value='Ongoing' end end;
  if not allowed then raise exception 'This action is locked for your role and the current record status.' using errcode='42501'; end if;
  if p_month is not null and coalesce((settings->'monthLock'->>'enabled')::boolean,true) then
    if p_month !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'A valid actual date is required.'; end if;
    if date_trunc('month',p_month::date)<>date_trunc('month',now() at time zone 'Asia/Manila') then raise exception 'Only the current accomplishment month is open.' using errcode='42501'; end if;
  end if;
end $$;

-- A mixed nested payload must satisfy every changed section, not just the first
-- category found. Posted financial entries use their identity-aware adapter.
create or replace function public.dcf_check_field_change(p_actor public.users,p_type text,p_record jsonb,p_field text,p_value jsonb,p_reason text,p_source text,p_create boolean default false) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare action_name text; old_value jsonb:=case when p_create then null else public.dcf_project_record(p_type,p_record)->p_field end; old_line jsonb; line jsonb; month_value text; financial_changed boolean; physical_date boolean; begin
  if p_field in ('details','expenses') then
    if jsonb_typeof(p_value) is distinct from 'array' then raise exception 'Budget items must be an array.'; end if;
    if exists(select 1 from jsonb_array_elements(p_value) x where nullif(x->>'id','') is null)
      or exists(select 1 from jsonb_array_elements(p_value) x group by x->>'id' having count(*)>1) then raise exception 'Budget item identities must be unique and nonempty.'; end if;
    if public.dcf_project_embedded('budget',p_value) is distinct from p_value then raise exception 'Unsupported budget-item fields cannot be changed through this operation.' using errcode='42501'; end if;
    if p_create or public.dcf_line_plans(p_value) is distinct from public.dcf_line_plans(old_value) then
      -- The ordinary create gate allows its initial plan even when imported as Ongoing.
      if not p_create then perform public.dcf_check_action(p_actor,p_type,p_record,'editBudget',p_reason); end if;
    end if;
    if public.dcf_line_actuals(p_value,'physical') is distinct from public.dcf_line_actuals(old_value,'physical') then
      perform public.dcf_check_action(p_actor,p_type,p_record,'editPhysicalAccomplishment',p_reason);
      for line in select value from jsonb_array_elements(p_value) loop
        select value into old_line from jsonb_array_elements(coalesce(nullif(old_value,'null'),'[]')) where value->>'id'=line->>'id';
        if public.dcf_actual_fragment(line,'physical') is distinct from public.dcf_actual_fragment(old_line,'physical') then
          month_value:=coalesce(nullif(line->>'actualDeliveryDate',''),nullif(old_line->>'actualDeliveryDate',''));
          perform public.dcf_check_action(p_actor,p_type,p_record,'editPhysicalAccomplishment',p_reason,month_value);
        end if;
      end loop;
    end if;
    for line in select value from jsonb_array_elements(p_value) loop
      select value into old_line from jsonb_array_elements(coalesce(nullif(old_value,'null'),'[]')) where value->>'id'=line->>'id';
      financial_changed:=public.dcf_actual_fragment(line,'financial') is distinct from public.dcf_actual_fragment(old_line,'financial');
      if financial_changed then
        perform public.dcf_check_action(p_actor,p_type,p_record,'editFinancialAccomplishment',p_reason);
        if not p_create then raise exception 'Financial actuals must use explicit entry operations, not a budget-item replacement.' using errcode='42501'; end if;
        foreach month_value in array array[nullif(line->>'actualObligationDate',''),nullif(line->>'actualDisbursementDate','')] loop
          if month_value is not null then perform public.dcf_check_action(p_actor,p_type,p_record,'editFinancialAccomplishment',p_reason,month_value); end if;
        end loop;
        for month_value in select value->>'date' from jsonb_array_elements(coalesce(nullif(line->'obligations','null'),'[]')||coalesce(nullif(line->'disbursements','null'),'[]')) loop
          perform public.dcf_check_action(p_actor,p_type,p_record,'editFinancialAccomplishment',p_reason,month_value);
        end loop;
      end if;
    end loop;
    return;
  end if;
  physical_date:=p_field='actualObligationDate' and p_type in ('office_requirements','staffing_requirements') and p_source in ('physical','physical-acf','physical-accomplishment');
  financial_changed:=p_field in ('obligations','disbursements','actualAmount','actualObligationAmount','actualDisbursementAmount','actualDisbursementDate') or p_field like 'actualDisbursement%' or (p_field='actualObligationDate' and not physical_date);
  if financial_changed then
    if p_create and p_value in ('null'::jsonb,'0'::jsonb,'""'::jsonb,'[]'::jsonb) then return; end if;
    perform public.dcf_check_action(p_actor,p_type,p_record,'editFinancialAccomplishment',p_reason);
    if not p_create then raise exception 'Financial actuals must use explicit entry operations.' using errcode='42501'; end if;
    if p_field in ('actualObligationDate','actualDisbursementDate') then perform public.dcf_check_action(p_actor,p_type,p_record,'editFinancialAccomplishment',p_reason,nullif(p_value#>>'{}','')); end if;
    if p_field in ('obligations','disbursements') then
      for month_value in select value->>'date' from jsonb_array_elements(p_value) loop perform public.dcf_check_action(p_actor,p_type,p_record,'editFinancialAccomplishment',p_reason,month_value); end loop;
    end if;
    return;
  end if;
  action_name:=case when p_field like 'actual%' or p_field in ('accomplishmentRemarks','catchUpPlanRemarks') then 'editPhysicalAccomplishment'
    when p_field in ('fundYear','fundingYear','fundType','tier','fundSource','fundSourceUid','numberOfUnits','pricePerUnit','amount','annualSalary','obligationDate','disbursementDate','physicalDeliveryDate') or p_field like 'disbursement%' then 'editBudget' else 'editDetails' end;
  if p_create and (action_name<>'editPhysicalAccomplishment' or p_value in ('null'::jsonb,'0'::jsonb,'""'::jsonb,'false'::jsonb)) then return; end if;
  if p_source in ('physical','physical-acf','physical-accomplishment') and p_field in ('date','endDate','participantsMale','participantsFemale') then action_name:='editBudget'; end if;
  month_value:=case when action_name='editPhysicalAccomplishment' and p_field in ('actualDate','actualEndDate','actualCompletionDate','actualObligationDate') then coalesce(nullif(p_value#>>'{}',''),nullif(old_value#>>'{}','')) else null end;
  perform public.dcf_check_action(p_actor,p_type,p_record,action_name,p_reason,month_value);
end $$;

create or replace function public.dcf_update_record(p_type text,p_id bigint,p_changes jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare assignments text; result jsonb; begin
  perform public.dcf_entity_table(p_type);
  select string_agg(format('%I=(jsonb_populate_record(null::public.%I,$1)).%I',a.attname,p_type,a.attname),',') into assignments
  from pg_attribute a where a.attrelid=to_regclass('public.'||p_type) and a.attnum>0 and not a.attisdropped and a.attgenerated='' and a.attidentity='' and a.attname<>'id' and p_changes ? a.attname;
  if assignments is null then execute format('select to_jsonb(r) from public.%I r where id=$1',p_type) into result using p_id;
  else execute format('update public.%I set %s where id=$2 returning to_jsonb(%I)',p_type,assignments,p_type) into result using p_changes,p_id; end if;
  return result;
end $$;

create or replace function public.dcf_insert_record(p_type text,p_changes jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare columns_value text; values_value text; result jsonb; begin
  perform public.dcf_entity_table(p_type);
  select string_agg(format('%I',a.attname),','),string_agg(format('r.%I',a.attname),',') into columns_value,values_value from pg_attribute a
  where a.attrelid=to_regclass('public.'||p_type) and a.attnum>0 and not a.attisdropped and a.attgenerated='' and a.attidentity='' and a.attname<>'id' and p_changes ? a.attname;
  execute format('insert into public.%I(%s) select %s from jsonb_populate_record(null::public.%I,$1) r returning to_jsonb(%I)',p_type,columns_value,values_value,p_type,p_type) into result using p_changes;
  return result;
end $$;

create or replace function public.dcf_apply_financial(p_actor public.users,p_type text,p_record jsonb,p_base jsonb,p_edits jsonb,p_reason text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r jsonb:=p_record; edit jsonb; op jsonb; baseline jsonb; current_stage jsonb; entry jsonb; current_entry jsonb; intended jsonb; line jsonb; lines jsonb; item text; stage_value text; table_value text; date_column text; new_id bigint; mapped_id bigint; maps jsonb; entry_date text; item_ids text[]; total numeric; last_date text; arr jsonb; month_names text[]:=array['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; i integer; begin
  if jsonb_typeof(p_edits) is distinct from 'array' then raise exception 'Invalid financial operations.'; end if;
  if exists(select 1 from jsonb_array_elements(p_edits) x group by x->>'itemId',x->>'stage' having count(*)>1) then raise exception 'Each financial stage may be changed only once per save.'; end if;
  for edit in select value from jsonb_array_elements(p_edits) loop
    stage_value:=edit->>'stage'; item:=nullif(edit->>'itemId','');
    if stage_value not in ('obligation','disbursement') or jsonb_typeof(edit->'operations') is distinct from 'array' then raise exception 'Invalid financial stage.'; end if;
    if jsonb_array_length(edit->'operations')=0 then continue; end if;
    perform public.dcf_check_action(p_actor,p_type,r,'editFinancialAccomplishment',p_reason);
    if p_type in ('activities','subprojects','staffing_requirements') and item is not null then
      select value into line from jsonb_array_elements(coalesce(r->case when p_type='subprojects' then 'details' else 'expenses' end,'[]')) where value->>'id'=item;
      if line is null or coalesce((line->>'isCancelled')::boolean,false) or coalesce((line->>'isSuperseded')::boolean,false) then raise exception 'The financial item is unavailable, cancelled or superseded.' using errcode='40001'; end if;
      if line->>'fundingOrigin'='SupplementalDraft' or (nullif(line->>'supplementUid','') is not null and line->>'supplementStatus' is distinct from 'APPROVED') then raise exception 'The supplement is not approved.' using errcode='42501'; end if;
    elsif p_type in ('activities','subprojects') or item is not null then raise exception 'The financial item identity is invalid.'; end if;
    baseline:=p_base->'financial'->'stages'->coalesce(item,'$parent')->stage_value;
    if baseline is null and item is not null and not exists(select 1 from jsonb_array_elements(coalesce(p_base->'record'->case when p_type='subprojects' then 'details' else 'expenses' end,'[]')) where value->>'id'=item) then baseline:='{"source":"legacy","entries":[]}'::jsonb; end if;
    current_stage:=public.dcf_financial_stage(p_type,r,item,stage_value);
    if baseline is null then raise exception 'The financial baseline is missing. Reopen before saving.' using errcode='40001'; end if;
    if baseline->>'source' is distinct from current_stage->>'source' then raise exception 'Financial storage changed. Reopen before saving.' using errcode='40001'; end if;
    table_value:=case when stage_value='obligation' then 'financial_obligations' else 'financial_disbursements' end; date_column:=case when stage_value='obligation' then 'obligation_date' else 'disbursement_date' end;
    maps:='{}';
    if current_stage->>'source'='legacy' then
      if baseline is distinct from current_stage then raise exception 'Legacy actuals changed. Reopen before saving.' using errcode='40001'; end if;
      for entry in select value from jsonb_array_elements(current_stage->'entries') loop
        entry_date:=nullif(entry->>'date','');
        if entry_date is null then select value->'value'->>'date' into entry_date from jsonb_array_elements(edit->'operations') where value->>'id'=entry->>'id' and value->>'action'='update'; end if;
        if entry_date is null then raise exception 'An existing legacy actual needs its date corrected before saving.'; end if;
        execute format('insert into public.%I(entity_type,parent_id,item_id,%I,amount,remarks) values($1,$2,$3,$4::date,$5,$6) returning id',table_value,date_column) into new_id using public.dcf_financial_type(p_type),(r->>'id')::bigint,item,entry_date,(entry->>'amount')::numeric,coalesce(entry->>'remarks','');
        maps:=maps||jsonb_build_object(entry->>'id',new_id);
        insert into public.dcf_financial_lineage values(p_type,(r->>'id')::bigint,coalesce(item,''),stage_value,entry->>'id',new_id,(select operation_id from public.dcf_revision_context where transaction_id=txid_current())) on conflict do nothing;
      end loop;
    end if;
    for op in select value from jsonb_array_elements(edit->'operations') loop
      if op->>'action' not in ('insert','update','delete') then raise exception 'Unsupported financial operation.'; end if;
      intended:=op->'value';
      if op->>'action'<>'insert' then
        if jsonb_typeof(op->'expected') is distinct from 'object' then raise exception 'The expected actual entry is required before an update or removal.' using errcode='40001'; end if;
        select value into entry from jsonb_array_elements(current_stage->'entries') where value->>'id'=op->>'id';
        if entry is null then raise exception 'This actual entry no longer exists. Reopen before saving.' using errcode='40001'; end if;
        if op ? 'expected' and jsonb_build_object('date',coalesce(entry->>'date',''),'amount',coalesce((entry->>'amount')::numeric,0),'remarks',coalesce(entry->>'remarks','')) is distinct from jsonb_build_object('date',coalesce(op->'expected'->>'date',''),'amount',coalesce((op->'expected'->>'amount')::numeric,0),'remarks',coalesce(op->'expected'->>'remarks','')) then raise exception 'This actual entry changed. Reopen before saving.' using errcode='40001'; end if;
        mapped_id:=coalesce((maps->>(op->>'id'))::bigint,case when op->>'id' ~ '^\d+$' then (op->>'id')::bigint end);
        if mapped_id is null then raise exception 'The actual entry identity is invalid.'; end if;
      end if;
      if op->>'action'<>'delete' then
        if nullif(intended->>'date','') is null or coalesce((intended->>'amount')::numeric,0)=0 then raise exception 'Actual entries require a valid date and nonzero amount.'; end if;
        if stage_value='disbursement' and (intended->>'amount')::numeric<0 then raise exception 'Disbursements cannot be negative.'; end if;
        if op->>'action'='insert' or intended->>'date' is distinct from entry->>'date' then perform public.dcf_check_action(p_actor,p_type,r,'editFinancialAccomplishment',p_reason,intended->>'date'); end if;
      end if;
      if op->>'action'='delete' then
        perform public.dcf_check_action(p_actor,p_type,r,'editFinancialAccomplishment',p_reason,entry->>'date');
        execute format('delete from public.%I where id=$1 and entity_type=$2 and parent_id=$3 and item_id::text is not distinct from $4',table_value) using mapped_id,public.dcf_financial_type(p_type),(r->>'id')::bigint,item;
      elsif op->>'action'='insert' then
        execute format('insert into public.%I(entity_type,parent_id,item_id,%I,amount,remarks) values($1,$2,$3,$4::date,$5,$6) returning id',table_value,date_column) into new_id using public.dcf_financial_type(p_type),(r->>'id')::bigint,item,intended->>'date',(intended->>'amount')::numeric,coalesce(intended->>'remarks','');
        if nullif(op->>'historicalId','') is not null then
          insert into public.dcf_financial_lineage values(p_type,(r->>'id')::bigint,coalesce(item,''),stage_value,op->>'historicalId',new_id,(select operation_id from public.dcf_revision_context where transaction_id=txid_current())) on conflict(entity_type,parent_id,item_id,stage,historical_id) do update set live_id=excluded.live_id,operation_id=excluded.operation_id;
        end if;
      else
        execute format('update public.%I set %I=$1::date,amount=$2,remarks=$3 where id=$4 and entity_type=$5 and parent_id=$6 and item_id::text is not distinct from $7',table_value,date_column) using intended->>'date',(intended->>'amount')::numeric,coalesce(intended->>'remarks',''),mapped_id,public.dcf_financial_type(p_type),(r->>'id')::bigint,item;
      end if;
    end loop;
    if p_type='activities' then insert into public.activity_financial_entry_state values((r->>'id')::bigint,item,stage_value) on conflict do nothing;
    elsif p_type='subprojects' then insert into public.subproject_financial_entry_state values((r->>'id')::bigint,item,stage_value) on conflict do nothing;
    else insert into public.dcf_financial_entry_state values(p_type,(r->>'id')::bigint,coalesce(item,''),stage_value) on conflict do nothing; end if;
    current_stage:=public.dcf_financial_stage(p_type,r,item,stage_value); arr:=current_stage->'entries';
    select coalesce(sum((value->>'amount')::numeric),0),max(nullif(value->>'date','')) into total,last_date from jsonb_array_elements(arr);
    intended:=jsonb_build_object(case when stage_value='obligation' then 'obligations' else 'disbursements' end,arr,case when stage_value='obligation' then 'actualObligationAmount' else 'actualDisbursementAmount' end,total,case when stage_value='obligation' then 'actualObligationDate' else 'actualDisbursementDate' end,last_date);
    if p_type not in ('activities','subprojects') and stage_value='disbursement' then
      for i in 1..12 loop select coalesce(sum((value->>'amount')::numeric),0) into total from jsonb_array_elements(arr) where extract(month from (value->>'date')::date)=i; intended:=intended||jsonb_build_object('actualDisbursement'||month_names[i],total); end loop;
    end if;
    if item is null then r:=r||intended;
    else
      select jsonb_agg(case when value->>'id'=item then value||intended else value end order by ordinality) into lines from jsonb_array_elements(r->case when p_type='subprojects' then 'details' else 'expenses' end) with ordinality;
      r:=r||jsonb_build_object(case when p_type='subprojects' then 'details' else 'expenses' end,lines);
    end if;
  end loop;
  if p_type='staffing_requirements' and coalesce(jsonb_array_length(r->'expenses'),0)>0 then
    select coalesce(sum((value->>'actualObligationAmount')::numeric),0)
      into total from jsonb_array_elements(r->'expenses');
    -- Financial totals belong to the parent, but its date-hired field remains
    -- physical data; changing a financial month must not change hiring history.
    r:=r||jsonb_build_object('actualObligationAmount',total,'actualDisbursementAmount',(select coalesce(sum((value->>'actualDisbursementAmount')::numeric),0) from jsonb_array_elements(r->'expenses')));
  end if;
  return r;
end $$;

create or replace function public.dcf_check_retry_access(p_actor public.users,p_type text,p_current jsonb,p_base jsonb,p_changes jsonb,p_financial jsonb,p_create boolean) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare k text; v jsonb; needs_source boolean:=p_create; needs_physical boolean:=false; needs_financial boolean:=coalesce(p_financial,'[]')<>'[]'::jsonb; begin
  perform public.dcf_check_access(p_actor,p_type,p_current,false);
  if p_actor.role='Guest' then raise exception 'Write permission is no longer available.' using errcode='42501'; end if;
  for k,v in select * from jsonb_each(p_changes) loop
    if k in ('history','updated_at','created_at') then continue; end if;
    if k='workflow_status' and p_actor.role not in ('Super Admin','Administrator','Management') then raise exception 'Approval permission is no longer available.' using errcode='42501'; end if;
    if k in ('details','expenses') then
      needs_source:=needs_source or public.dcf_line_plans(v) is distinct from public.dcf_line_plans(coalesce(p_base->'record',p_base)->k);
      needs_physical:=needs_physical or public.dcf_line_actuals(v,'physical') is distinct from public.dcf_line_actuals(coalesce(p_base->'record',p_base)->k,'physical');
      needs_financial:=needs_financial or public.dcf_line_actuals(v,'financial') is distinct from public.dcf_line_actuals(coalesce(p_base->'record',p_base)->k,'financial');
    elsif k=any(public.dcf_financial_fields()) then needs_financial:=true;
    elsif k like 'actual%' then needs_physical:=true;
    else needs_source:=true; end if;
  end loop;
  if needs_source or (not needs_physical and not needs_financial) then perform public.dcf_check_access(p_actor,p_type,p_current,true); end if;
  if needs_physical then perform public.dcf_check_access(p_actor,p_type,p_current,true,'Accomplishment - Physical'); end if;
  if needs_financial then perform public.dcf_check_access(p_actor,p_type,p_current,true,'Accomplishment - Financial'); end if;
end $$;

create or replace function public.dcf_budget_tag(p_type text,p_parent jsonb,p_line jsonb) returns text language sql immutable set search_path=public,pg_temp as $$
  select case when coalesce((p_line->>'isCancelled')::boolean,false) and (p_type<>'subprojects' or p_parent->>'status'<>'Proposed') then 'Cancelled'
    when coalesce((p_line->>'isRealignment')::boolean,false) then 'Realignment' when coalesce((p_line->>'isSavings')::boolean,false) then 'Savings' else '' end
$$;

create or replace function public.dcf_write_budget_adjustments(p_actor public.users,p_type text,p_before jsonb,p_after jsonb,p_reason text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare source_value text; old_lines jsonb; new_lines jsonb; old_line jsonb; line jsonb; old_tag text; new_tag text; action_value text; reason_value text; item_value text; amount_delta numeric; begin
  if p_type not in ('subprojects','activities','staffing_requirements') then return; end if;
  source_value:=case p_type when 'subprojects' then 'subproject_detail' when 'activities' then 'activity_expense' else 'staffing_expense' end;
  old_lines:=coalesce(nullif(p_before->case when p_type='subprojects' then 'details' else 'expenses' end,'null'),'[]');
  new_lines:=coalesce(nullif(p_after->case when p_type='subprojects' then 'details' else 'expenses' end,'null'),'[]');
  for item_value in select x.value->>'id' from jsonb_array_elements(old_lines||new_lines) x group by x.value->>'id' loop
    select x.value into old_line from jsonb_array_elements(old_lines) x where x.value->>'id'=item_value;
    select x.value into line from jsonb_array_elements(new_lines) x where x.value->>'id'=item_value;
    old_tag:=public.dcf_budget_tag(p_type,p_before,old_line); new_tag:=public.dcf_budget_tag(p_type,p_after,line); action_value:=null;
    if old_line is null and (new_tag<>'' or coalesce((line->>'isAdjustmentItem')::boolean,false)) then action_value:=case when line->>'adjustmentType'='Replacement' then 'replace_item' else 'create_adjustment_item' end;
    elsif line is null and (old_tag<>'' or coalesce((old_line->>'isAdjustmentItem')::boolean,false)) then action_value:='delete_adjustment_item';
    elsif not coalesce((old_line->>'isSuperseded')::boolean,false) and coalesce((line->>'isSuperseded')::boolean,false) then action_value:='replace_item';
    elsif old_tag is distinct from new_tag then action_value:=case new_tag when 'Cancelled' then 'cancel' when 'Realignment' then 'tag_realignment' when 'Savings' then 'tag_savings' else case when old_tag='Cancelled' then 'restore' else 'clear_tag' end end;
    elsif (new_tag<>'' or coalesce((line->>'isAdjustmentItem')::boolean,false))
      and public.dcf_line_plans(jsonb_build_array(public.dcf_project_embedded('budget',old_line))) is distinct from public.dcf_line_plans(jsonb_build_array(public.dcf_project_embedded('budget',line))) then action_value:=case when old_line->>'adjustmentFundingSource' is distinct from line->>'adjustmentFundingSource' then 'funding_source_changed' else 'edit_adjustment_item' end;
    end if;
    if action_value is null then continue; end if;
    reason_value:=coalesce(nullif(btrim(line->>'adjustmentReason'),''),nullif(btrim(line->>'replacementReason'),''),nullif(btrim(p_reason),''),'Budget item classification changed.');
    amount_delta:=coalesce(nullif(line->>'amount','')::numeric,(line->>'pricePerUnit')::numeric*(line->>'numberOfUnits')::numeric,0)-coalesce(nullif(old_line->>'amount','')::numeric,(old_line->>'pricePerUnit')::numeric*(old_line->>'numberOfUnits')::numeric,0);
    insert into public.budget_item_adjustment_history(source_type,parent_id,item_id,action,source_item_id,before_snapshot,after_snapshot,amount_delta,reason,created_by,created_by_name)
      values(source_value,(p_after->>'id')::bigint,item_value,action_value,coalesce(line->>'sourceItemId',line->>'replacementOfItemId',old_line->>'sourceItemId'),
        public.dcf_project_embedded('budget',old_line),public.dcf_project_embedded('budget',line),amount_delta,reason_value,p_actor.id::text,coalesce(p_actor."fullName",p_actor.username));
  end loop;
  if p_type='subprojects' and p_before is not null and p_before->>'accomplishmentRemarks' is distinct from p_after->>'accomplishmentRemarks' then
    insert into public.budget_item_adjustment_history(source_type,parent_id,item_id,action,before_snapshot,after_snapshot,reason,created_by,created_by_name)
      values(source_value,(p_after->>'id')::bigint,p_after->>'id','update_accomplishment_remarks',jsonb_build_object('accomplishmentRemarks',p_before->'accomplishmentRemarks'),jsonb_build_object('accomplishmentRemarks',p_after->'accomplishmentRemarks'),'Updated subproject accomplishment remarks.',p_actor.id::text,coalesce(p_actor."fullName",p_actor.username));
  end if;
end $$;

create or replace function public.commit_dcf_change(p_actor_id bigint,p_actor_password text,p_entity_type text,p_parent_id bigint,p_base jsonb,p_changes jsonb,p_financial jsonb,p_request_key uuid,p_reason text,p_source text,p_correlation_id uuid default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp set timezone='UTC' as $$
declare a public.users%rowtype; r jsonb; original jsonb; base_record jsonb; field text; value jsonb; changes jsonb:='{}'; result jsonb; fingerprint text; cached public.dcf_mutation_requests%rowtype; rid bigint; is_create boolean:=p_parent_id is null; action_name text; other_line jsonb; line jsonb; array_key text; begin
  perform public.dcf_entity_table(p_entity_type); a:=public.dcf_authenticate(p_actor_id,p_actor_password);
  if p_request_key is null or jsonb_typeof(p_changes) is distinct from 'object' then raise exception 'A request identity and explicit changes are required.'; end if;
  if p_source in ('history-restore','undo-restore') and not exists(select 1 from public.dcf_revision_context where transaction_id=txid_current() and source=p_source and operation_id=p_request_key and actor_id=a.id) then raise exception 'Use the guarded history restore operation.' using errcode='42501'; end if;
  fingerprint:=md5(jsonb_build_array(p_entity_type,p_parent_id,p_base,p_changes,p_financial,p_reason,p_source)::text);
  if p_correlation_id is not null then fingerprint:=md5(jsonb_build_array(fingerprint,p_correlation_id)::text); end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_key::text,0));
  select * into cached from public.dcf_mutation_requests where request_key=p_request_key;
  if found then
    if cached.actor_id<>a.id or cached.request_hash<>fingerprint then raise exception 'This request identity belongs to a different operation.'; end if;
    execute format('select to_jsonb(r) from public.%I r where id=$1',p_entity_type) into r using coalesce(p_parent_id,(cached.response->'record'->>'id')::bigint);
    perform public.dcf_check_retry_access(a,p_entity_type,r,p_base,p_changes,p_financial,is_create);
    perform public.dcf_check_access(a,p_entity_type,cached.response->'record',false);
    if cached.response->>'revisionId' is not null and not exists(select 1 from public.dcf_revision_heads h join public.dcf_record_revisions v on v.id=(cached.response->>'revisionId')::bigint and v.incarnation=h.incarnation where h.entity_type=p_entity_type and h.parent_id=(cached.response->'record'->>'id')::bigint and not h.deleted) then
      raise exception 'The original record incarnation is no longer current. Reload before continuing.' using errcode='40001';
    end if;
    return cached.response;
  end if;
  perform public.dcf_begin_operation(a.id,p_actor_password,p_source,p_request_key,p_reason);
  update public.dcf_revision_context set correlation_id=p_correlation_id where transaction_id=txid_current();
  if is_create then
    if p_base ? 'cloneSourceId' then
      if coalesce(p_base->>'cloneSourceId','') !~ '^[1-9][0-9]*$' then raise exception 'A valid clone source identity is required.'; end if;
      execute format('select to_jsonb(r) from public.%I r where id=$1',p_entity_type) into result using (p_base->>'cloneSourceId')::bigint;
      perform public.dcf_check_access(a,p_entity_type,result,false);
      update public.dcf_revision_context set origin=jsonb_build_object('kind','clone','entityType',p_entity_type,'parentId',(result->>'id')::bigint,'uid',result->'uid',
        'incarnation',(select incarnation from public.dcf_revision_heads where entity_type=p_entity_type and parent_id=(result->>'id')::bigint)) where transaction_id=txid_current();
    end if;
    r:=p_changes; perform public.dcf_check_access(a,p_entity_type,r,true);
    if a.role='Guest' then raise exception 'Guest users cannot create DCF records.' using errcode='42501'; end if;
    if nullif(btrim(r->>'uid'),'') is null then raise exception 'A new DCF record requires a UID identity.'; end if;
    -- Serialize competing creates without imposing a new uniqueness constraint
    -- on untouched legacy rows that might already contain duplicate UIDs.
    perform pg_advisory_xact_lock(hashtextextended('dcf-create:'||p_entity_type||':'||(r->>'uid'),0));
    execute format('select to_jsonb(r) from public.%I r where uid=$1 limit 1',p_entity_type) into result using r->>'uid';
    if result is not null then raise exception 'This UID already exists. Reconcile the original request instead of creating a duplicate.' using errcode='23505'; end if;
  else
    execute format('select to_jsonb(r) from public.%I r where id=$1 for update',p_entity_type) into r using p_parent_id;
    perform public.dcf_check_access(a,p_entity_type,r,false); original:=r; base_record:=coalesce(p_base->'record',p_base);
    if a.role='Guest' then raise exception 'Guest users do not have write permission for DCF records.' using errcode='42501'; end if;
    if p_changes='{}'::jsonb and coalesce(p_financial,'[]')='[]'::jsonb then perform public.dcf_check_access(a,p_entity_type,r,true); end if;
    if r->>'budgetItemTransferId' is not null and r->>'workflow_status' is distinct from 'APPROVED' then raise exception 'This transfer is not approved.' using errcode='42501'; end if;
  end if;
  for field,value in select * from jsonb_each(p_changes) loop
    if field='id' then raise exception 'The record identity is protected.' using errcode='42501'; end if;
    if field in ('history','created_at','updated_at') then continue; end if;
    if not field=any(public.dcf_field_names(p_entity_type)) then raise exception 'Unsupported DCF field: %',field; end if;
    if field in ('created_by','encodedBy','original_budget_snapshot','budgetItemTransferId','isTransferTargetExcluded','physical_accomplishment_submitted_at','approved_by','approved_at','submitted_at','approver_id') then
      if not is_create and r->field is distinct from value then raise exception 'Protected field % cannot be supplied.',field using errcode='42501'; end if; continue;
    end if;
    if not is_create and field='uid' and r->field is distinct from value then raise exception 'The record UID identity is protected.' using errcode='42501'; end if;
    if not exists(select 1 from pg_attribute x where x.attrelid=to_regclass('public.'||p_entity_type) and x.attnum>0 and not x.attisdropped and x.attname=field and x.attgenerated='' and x.attidentity='') then raise exception 'The % field is unavailable for this DCF module.',field using errcode='22023'; end if;
    if not is_create and public.dcf_project_record(p_entity_type,r)->field is not distinct from value then continue; end if;
    if not is_create and public.dcf_project_record(p_entity_type,base_record)->field is distinct from public.dcf_project_record(p_entity_type,r)->field then raise exception 'The % field changed while you were editing. Reopen before saving.',field using errcode='40001'; end if;
    if not is_create then
      if field='workflow_status' then
        perform public.dcf_check_access(a,p_entity_type,r,true);
        if a.role not in ('Super Admin','Administrator','Management') or (nullif(r->>'approver_id','') is not null and (r->>'approver_id')::bigint<>a.id and a.role<>'Super Admin') then raise exception 'You are not the assigned approver.' using errcode='42501'; end if;
        if value#>>'{}' not in ('APPROVED','REJECTED','PENDING') then raise exception 'Invalid approval state.'; end if;
      else
        if p_source in ('physical','physical-acf','physical-accomplishment') and field='status' and p_changes ? 'actualDate' then
            if (value#>>'{}') is distinct from (case when nullif(p_changes->>'actualDate','') is not null then 'Completed' else 'Ongoing' end) then raise exception 'The physical status does not match the actual date.'; end if;
            perform public.dcf_check_action(a,p_entity_type,r,'editPhysicalAccomplishment',p_reason);
        else perform public.dcf_check_field_change(a,p_entity_type,r,field,value,p_reason,p_source); end if;
      end if;
    else
      perform public.dcf_check_field_change(a,p_entity_type,r,field,value,p_reason,p_source,true);
    end if;
    if not is_create and field in ('details','expenses') then value:=public.dcf_merge_lines(r->field,value); end if;
    changes:=changes||jsonb_build_object(field,value);
  end loop;
  if is_create then
    changes:=changes||jsonb_build_object('encodedBy',coalesce(a."fullName",a.username),'workflow_status',case when coalesce(a.requires_approver,false) then 'PENDING' else 'APPROVED' end);
    if a.approver_id is not null then changes:=changes||jsonb_build_object('approver_id',a.approver_id); end if;
    r:=public.dcf_insert_record(p_entity_type,changes); p_parent_id:=(r->>'id')::bigint;
  else
    r:=public.dcf_update_record(p_entity_type,p_parent_id,changes);
  end if;
  if coalesce(p_financial,'[]')<>'[]'::jsonb then
    r:=public.dcf_apply_financial(a,p_entity_type,r,p_base,p_financial,p_reason);
    r:=public.dcf_update_record(p_entity_type,p_parent_id,(select coalesce(jsonb_object_agg(x.key,x.value),'{}') from jsonb_each(r) x where x.key in ('details','expenses') or x.key=any(public.dcf_financial_fields())));
  end if;
  if (p_entity_type='activities' and changes ? 'actualDate') or (p_entity_type='subprojects' and changes ? 'details' and not (is_create and nullif(changes->>'actualCompletionDate','') is not null)) then
    r:=public.dcf_derived_physical(p_entity_type,r);
    r:=public.dcf_update_record(p_entity_type,p_parent_id,jsonb_build_object('status',r->'status')||case when p_entity_type='subprojects' then jsonb_build_object('actualCompletionDate',r->'actualCompletionDate') else '{}'::jsonb end);
  end if;
  if changes ?| array['actualDate','actualEndDate','actualParticipantsMale','actualParticipantsFemale','actualCompletionDate','actualMaleBeneficiaries','actualFemaleBeneficiaries','actualFourPsBeneficiaries','actualPWD','actualMuslim','actualLGBTQ','actualSoloParent','actualSenior','actualYouth']
    or (p_entity_type='subprojects' and changes ? 'details' and public.dcf_line_actuals(original->'details','physical') is distinct from public.dcf_line_actuals(r->'details','physical')) then
    r:=public.dcf_update_record(p_entity_type,p_parent_id,jsonb_build_object('physical_accomplishment_submitted_at',clock_timestamp()));
  end if;
  if changes ?| array['details','expenses','accomplishmentRemarks'] then perform public.dcf_write_budget_adjustments(a,p_entity_type,original,r,p_reason); end if;
  if changes<>'{}'::jsonb or coalesce(p_financial,'[]')<>'[]'::jsonb then
    r:=public.dcf_update_record(p_entity_type,p_parent_id,jsonb_build_object('updated_at',clock_timestamp()));
  else
    perform public.dcf_check_retry_access(a,p_entity_type,r,p_base,p_changes,p_financial,is_create);
  end if;
  rid:=public.dcf_finalize_revision(p_entity_type,p_parent_id);
  result:=public.dcf_snapshot(p_entity_type,p_parent_id)||jsonb_build_object('record',public.dcf_response_record(p_entity_type,r),'revisionId',rid);
  result:=result||jsonb_build_object('hash',public.dcf_snapshot_hash(result-'revisionId'));
  insert into public.dcf_mutation_requests(request_key,actor_id,request_hash,response) values(p_request_key,a.id,fingerprint,result);
  return result;
end $$;

create or replace function public.delete_dcf_record(p_actor_id bigint,p_actor_password text,p_entity_type text,p_parent_id bigint,p_base jsonb,p_reason text,p_request_key uuid,p_correlation_id uuid default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp set timezone='UTC' as $$
declare a public.users%rowtype; r jsonb; cached public.dcf_mutation_requests%rowtype; fingerprint text; rid bigint; begin
  perform public.dcf_entity_table(p_entity_type); a:=public.dcf_authenticate(p_actor_id,p_actor_password);
  fingerprint:=md5(jsonb_build_array('delete',p_entity_type,p_parent_id,p_base,p_reason)::text);
  if p_correlation_id is not null then fingerprint:=md5(jsonb_build_array(fingerprint,p_correlation_id)::text); end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_key::text,0)); select * into cached from public.dcf_mutation_requests where request_key=p_request_key;
  if found then
    if cached.actor_id<>a.id or cached.request_hash<>fingerprint then raise exception 'This request identity belongs to a different operation.'; end if;
    perform public.dcf_check_access(a,p_entity_type,coalesce(p_base->'record',p_base),true);
    perform public.dcf_check_action(a,p_entity_type,coalesce(p_base->'record',p_base),'delete',p_reason);
    execute format('select to_jsonb(r) from public.%I r where id=$1',p_entity_type) into r using p_parent_id;
    if r is not null or not exists(select 1 from public.dcf_revision_heads where entity_type=p_entity_type and parent_id=p_parent_id and deleted and latest_revision_id=(cached.response->>'revisionId')::bigint) then raise exception 'The record changed after deletion. Reload before continuing.' using errcode='40001'; end if;
    return cached.response;
  end if;
  execute format('select to_jsonb(r) from public.%I r where id=$1 for update',p_entity_type) into r using p_parent_id;
  perform public.dcf_check_access(a,p_entity_type,r,true); perform public.dcf_check_action(a,p_entity_type,r,'delete',p_reason);
  if public.dcf_project_record(p_entity_type,coalesce(p_base->'record',p_base)) is distinct from public.dcf_project_record(p_entity_type,r) then raise exception 'This record changed. Reopen before deleting.' using errcode='40001'; end if;
  perform public.dcf_begin_operation(a.id,p_actor_password,'delete',p_request_key,p_reason);
  update public.dcf_revision_context set correlation_id=p_correlation_id where transaction_id=txid_current();
  if to_regclass('public.trash_bin') is not null then
    execute 'insert into public.trash_bin(entity_type,original_id,data,deleted_by,deleted_at) values($1,$2,$3,$4,clock_timestamp())'
      using case p_entity_type when 'activities' then 'activity' when 'subprojects' then 'subproject' when 'office_requirements' then 'office_requirement' when 'staffing_requirements' then 'staffing_requirement' else 'other_program_expense' end,p_parent_id,r,coalesce(a."fullName",a.username);
  end if;
  execute format('delete from public.%I where id=$1',p_entity_type) using p_parent_id;
  rid:=public.dcf_finalize_revision(p_entity_type,p_parent_id);
  insert into public.dcf_mutation_requests(request_key,actor_id,request_hash,response) values(p_request_key,a.id,fingerprint,jsonb_build_object('deleted',true,'revisionId',rid));
  return jsonb_build_object('deleted',true,'revisionId',rid);
end $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'dcf\_%' escape '\' or p.proname in ('commit_dcf_change','delete_dcf_record')) loop execute format('revoke all on function %s from public,anon,authenticated',f.signature); end loop;
end $$;
grant execute on function public.commit_dcf_change(bigint,text,text,bigint,jsonb,jsonb,jsonb,uuid,text,text,uuid),public.delete_dcf_record(bigint,text,text,bigint,jsonb,text,uuid,uuid) to anon,authenticated;
commit;
