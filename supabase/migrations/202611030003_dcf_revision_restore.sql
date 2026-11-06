-- Guarded historical corrections. No restore is executed by installing this file.
begin;
set local lock_timeout='5s';

create or replace function public.dcf_restore_fields(p_type text) returns text[] language sql immutable set search_path=public,pg_temp as $$
  select array_agg(x) from unnest(public.dcf_field_names(p_type)) x where x<>all(array['id','uid','created_at','created_by','encodedBy','physical_accomplishment_submitted_at','original_budget_snapshot','budgetItemTransferId','isTransferTargetExcluded','workflow_status','approver_id','approved_by','approved_at','submitted_at','rejection_reason','status','hiringStatus'])
$$;

create or replace function public.dcf_restore_ipo(p_actor public.users,p_type text,p_id text) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare r jsonb; region_name text; begin
  if p_id is null or p_id !~ '^[1-9][0-9]*$' then raise exception 'A recorded IPO has no valid stable identity.' using errcode='22023'; end if;
  select to_jsonb(p) into r from public.ipos p where p.id=p_id::bigint;
  if r is null then raise exception 'A recorded IPO no longer exists.' using errcode='22023'; end if;
  -- Same fixed OU-to-region mapping used by workflow lookups; unknown scope fails closed.
  region_name:=('{"NPMO":"National Capital Region (NCR)","RPMO CAR":"Cordillera Administrative Region (CAR)","RPMO 1":"Region I (Ilocos Region)","RPMO 2":"Region II (Cagayan Valley)","RPMO 3":"Region III (Central Luzon)","RPMO 4A":"Region IV-A (CALABARZON)","RPMO 4B":"MIMAROPA Region","RPMO 5":"Region V (Bicol Region)","RPMO 6":"Region VI (Western Visayas)","RPMO 7":"Region VII (Central Visayas)","RPMO 8":"Region VIII (Eastern Visayas)","RPMO 9":"Region IX (Zamboanga Peninsula)","RPMO 10":"Region X (Northern Mindanao)","RPMO 11":"Region XI (Davao Region)","RPMO 12":"Region XII (SOCCSKSARGEN)","RPMO 13":"Region XIII (Caraga)","RPMO NIR":"Negros Island Region (NIR)"}'::jsonb)->>p_actor."operatingUnit";
  perform public.dcf_check_access(p_actor,p_type,jsonb_build_object('operatingUnit',case when region_name is not null and r->>'region'=region_name then p_actor."operatingUnit" else '__outside_ipo_scope__' end));
  return r;
end $$;

-- Financial identity, not equal-looking amounts, determines whether rows correspond.
create or replace function public.dcf_restore_financial_diff(p_type text,p_id bigint,p_current jsonb,p_target jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
#variable_conflict use_variable
declare result jsonb:='[]'; item text; stage text; before_rows jsonb; after_rows jsonb; operations jsonb; entry jsonb; current_entry jsonb; target_entry jsonb; actual_id text; historical_id text; used_ids text[]; live_id bigint; ledger_name text; owner_row jsonb; begin
  for item in select key from jsonb_each((p_current->'financial'->'stages')||(p_target->'financial'->'stages')) loop
    foreach stage in array array['obligation','disbursement'] loop
      before_rows:=coalesce(p_current->'financial'->'stages'->item->stage->'entries','[]');
      after_rows:=coalesce(p_target->'financial'->'stages'->item->stage->'entries','[]');
      operations:='[]'; used_ids:=array[]::text[];
      for target_entry in select value from jsonb_array_elements(after_rows) loop
        historical_id:=target_entry->>'id'; actual_id:=historical_id;
        select l.live_id into live_id from public.dcf_financial_lineage l where entity_type=p_type and parent_id=p_id and item_id=case when item='$parent' then '' else item end and l.stage=stage and l.historical_id=historical_id;
        if live_id is not null then actual_id:=live_id::text; end if;
        select value into current_entry from jsonb_array_elements(before_rows) where value->>'id'=actual_id;
        if current_entry is null and historical_id like 'legacy:%' and p_current->'financial'->'stages'->item->stage->>'source'='central' then raise exception 'Legacy financial identity cannot be reconstructed safely for this version.' using errcode='55000'; end if;
        if current_entry is null then
          if historical_id ~ '^\d+$' then
            ledger_name:=case when stage='obligation' then 'financial_obligations' else 'financial_disbursements' end;
            execute format('select to_jsonb(x) from public.%I x where id=$1',ledger_name) into owner_row using historical_id::bigint;
            if owner_row is not null then raise exception 'A historical financial entry now belongs to another item or parent.' using errcode='55000'; end if;
          end if;
          operations:=operations||jsonb_build_array(jsonb_build_object('action','insert','historicalId',historical_id,'value',target_entry-'id'));
        else
          used_ids:=used_ids||actual_id;
          if (current_entry-'id') is distinct from (target_entry-'id') then operations:=operations||jsonb_build_array(jsonb_build_object('action','update','id',actual_id,'expected',current_entry-'id','value',target_entry-'id')); end if;
        end if;
      end loop;
      for entry in select value from jsonb_array_elements(before_rows) loop
        if not (entry->>'id'=any(used_ids)) then operations:=operations||jsonb_build_array(jsonb_build_object('action','delete','id',entry->>'id','expected',entry-'id')); end if;
      end loop;
      if operations<>'[]'::jsonb then result:=result||jsonb_build_array(jsonb_build_object('itemId',case when item='$parent' then null else item end,'stage',stage,'operations',operations)); end if;
    end loop;
  end loop;
  return result;
end $$;

create or replace function public.dcf_restore_display(p_current jsonb,p_changes jsonb,p_financial jsonb,p_target jsonb) returns jsonb language plpgsql immutable set search_path=public,pg_temp as $$
declare result jsonb:='[]'; field_name text; field_value jsonb; item_id text; before_line jsonb; after_line jsonb; line_field text; section_name text; stage_change jsonb; operation jsonb; stage_name text; before_total numeric; after_total numeric; begin
  for field_name,field_value in select * from jsonb_each(p_changes) loop
    if field_name not in ('details','expenses') then
      result:=result||jsonb_build_array(jsonb_build_object('section',case when field_name like 'actual%' then 'Physical accomplishments' else 'Details' end,'field',field_name,'before',p_current->'record'->field_name,'after',field_value)); continue;
    end if;
    for item_id in select distinct x->>'id' from jsonb_array_elements(coalesce(nullif(p_current->'record'->field_name,'null'),'[]')||coalesce(nullif(field_value,'null'),'[]')) x order by 1 loop
      select x into before_line from jsonb_array_elements(coalesce(nullif(p_current->'record'->field_name,'null'),'[]')) x where x->>'id'=item_id;
      select x into after_line from jsonb_array_elements(coalesce(nullif(field_value,'null'),'[]')) x where x->>'id'=item_id;
      section_name:='Budget item '||item_id;
      if before_line is null or after_line is null then result:=result||jsonb_build_array(jsonb_build_object('section',section_name,'field','Item availability','before',case when before_line is null then 'Absent' else 'Present' end,'after',case when after_line is null then 'Absent' else 'Present' end)); end if;
      for line_field in select key from jsonb_each(coalesce(before_line,'{}')||coalesce(after_line,'{}')) order by key loop
        if before_line->line_field is distinct from after_line->line_field then
          result:=result||jsonb_build_array(jsonb_build_object('section',section_name,'field',line_field,'before',before_line->line_field,'after',after_line->line_field));
        end if;
      end loop;
    end loop;
  end loop;
  for stage_change in select * from jsonb_array_elements(p_financial) loop
    for operation in select * from jsonb_array_elements(stage_change->'operations') loop
      result:=result||jsonb_build_array(jsonb_build_object('section','Financial actuals','field',concat_ws(' / ',stage_change->>'stage','item '||coalesce(stage_change->>'itemId','$parent'),operation->>'action','entry '||coalesce(operation->>'id',operation->>'historicalId')),'before',operation->'expected','after',operation->'value'));
    end loop;
  end loop;
  if p_financial<>'[]'::jsonb then
    foreach stage_name in array array['obligation','disbursement'] loop
      select coalesce(sum((entry->>'amount')::numeric),0) into before_total from jsonb_each(p_current->'financial'->'stages') item cross join lateral jsonb_array_elements(item.value->stage_name->'entries') entry;
      select coalesce(sum((entry->>'amount')::numeric),0) into after_total from jsonb_each(p_target->'financial'->'stages') item cross join lateral jsonb_array_elements(item.value->stage_name->'entries') entry;
      if before_total is distinct from after_total then result:=result||jsonb_build_array(jsonb_build_object('section','Financial totals','field',stage_name,'before',before_total,'after',after_total)); end if;
    end loop;
  end if;
  return result;
end $$;

create or replace function public.dcf_restore_plan(p_actor public.users,p_type text,p_id bigint,p_revision bigint,p_undo uuid default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
#variable_conflict use_column
declare current_state jsonb; target_state jsonb; proposed jsonb; r public.dcf_record_revisions%rowtype; h public.dcf_revision_heads%rowtype; o public.dcf_restore_operations%rowtype;
  changes jsonb:='{}'; display_changes jsonb:='[]'; financial_changes jsonb:='[]'; blockers text[]:=array[]::text[]; excluded text[]:=array[]::text[]; field text; value jsonb; action_name text; reference_row jsonb; reference_ids jsonb; reference_names jsonb; actuals boolean:=false; n text; line jsonb; before_line jsonb; clean_lines jsonb; begin
  current_state:=public.dcf_snapshot(p_type,p_id); perform public.dcf_check_access(p_actor,p_type,nullif(current_state->'record','null'));
  perform public.dcf_assert_snapshot(p_type,p_id,current_state);
  select * into h from public.dcf_revision_heads where entity_type=p_type and parent_id=p_id;
  select * into r from public.dcf_record_revisions where id=p_revision and entity_type=p_type and parent_id=p_id and incarnation=h.incarnation;
  if not found or r.snapshot->>'schemaVersion' is distinct from '1' or r.snapshot->'record'='null'::jsonb then raise exception 'The selected version is unavailable or incomplete.' using errcode='P0002'; end if;
  target_state:=r.snapshot;
  if p_undo is null then perform public.dcf_assert_snapshot(p_type,p_id,target_state); end if;
  if p_undo is not null then
    select * into o from public.dcf_restore_operations where id=p_undo and entity_type=p_type and parent_id=p_id;
    if not found or p_revision not in (o.before_revision_id,o.result_revision_id) then raise exception 'This undo target does not match the saved pre-restore version.'; end if;
    select * into r from public.dcf_record_revisions where id=o.before_revision_id and incarnation=h.incarnation;
    if not found then raise exception 'The pre-restore state is unavailable.'; end if;
    target_state:=coalesce(nullif(o.before_snapshot,'null'),r.snapshot);
    perform public.dcf_assert_snapshot(p_type,p_id,target_state);
    if exists(select 1 from public.dcf_restore_operations where undo_of=p_undo) then blockers:=array_append(blockers,'This restore was already undone.'); end if;
    if h.latest_revision_id is distinct from o.result_revision_id or public.dcf_snapshot_hash(current_state) is distinct from (select snapshot_hash from public.dcf_record_revisions where id=o.result_revision_id) then blockers:=array_append(blockers,'The record changed after restoration. Direct undo would overwrite later work.'); end if;
  end if;
  begin perform public.dcf_check_action(p_actor,p_type,current_state->'record','restoreHistory','Historical restore preview'); exception when others then blockers:=blockers||sqlerrm; end;
  proposed:=current_state;
  for field,value in select * from jsonb_each(target_state->'record') loop
    if not field=any(public.dcf_restore_fields(p_type)) then
      if value is distinct from current_state->'record'->field then excluded:=excluded||field; end if; continue;
    end if;
    if field=any(public.dcf_financial_fields()) then continue; end if;
    if field in ('details','expenses') then
      clean_lines:='[]';
      for line in select x.value from jsonb_array_elements(coalesce(nullif(value,'null'),'[]')) x loop
        select x.value into before_line from jsonb_array_elements(coalesce(current_state->'record'->field,'[]')) x where x.value->>'id'=line->>'id';
        clean_lines:=clean_lines||jsonb_build_array(public.dcf_preserve_financial(line,before_line));
      end loop;
      value:=clean_lines;
    end if;
    if value is not distinct from current_state->'record'->field then continue; end if;
    changes:=changes||jsonb_build_object(field,value);
    if field like 'actual%' then actuals:=true; end if;
    if field in ('details','expenses') and public.dcf_line_actuals(value,'physical') is distinct from public.dcf_line_actuals(current_state->'record'->field,'physical') then actuals:=true; end if;
  end loop;
  -- Historical scalar/embedded summaries are evidence; central stages decide actual writes.
  changes:=changes-'obligations'-'disbursements';
  if changes ?| array['fundSourceUid','fundSource'] and nullif(case when changes ? 'fundSourceUid' then changes->>'fundSourceUid' else current_state->'record'->>'fundSourceUid' end,'') is not null then
    if to_regclass('public.ref_fund_sources') is not null then
      execute 'select to_jsonb(x) from public.ref_fund_sources x where uid=$1' into reference_row using case when changes ? 'fundSourceUid' then changes->>'fundSourceUid' else current_state->'record'->>'fundSourceUid' end;
      if reference_row is null then blockers:=array_append(blockers,'The recorded Fund Source no longer exists.');
      elsif reference_row->'is_active'='false'::jsonb and changes ? 'fundSourceUid' then blockers:=array_append(blockers,'The recorded Fund Source is inactive and cannot be newly assigned.');
      else changes:=changes||jsonb_build_object('fundSource',reference_row->'label'); end if;
    else blockers:=array_append(blockers,'Fund Source references are unavailable.'); end if;
  end if;
  if p_type='subprojects' and changes ?| array['ipo_id','indigenousPeopleOrganization'] then
    begin
      reference_row:=public.dcf_restore_ipo(p_actor,p_type,case when changes ? 'ipo_id' then changes->>'ipo_id' else current_state->'record'->>'ipo_id' end);
      changes:=changes||jsonb_build_object('indigenousPeopleOrganization',reference_row->'name');
    exception when others then blockers:=blockers||sqlerrm; end;
  elsif p_type='activities' and changes ?| array['participating_ipo_ids','participatingIpos'] then
    reference_ids:=case when changes ? 'participating_ipo_ids' then changes->'participating_ipo_ids' else current_state->'record'->'participating_ipo_ids' end;
    reference_names:='[]';
    begin
      if jsonb_typeof(reference_ids) is distinct from 'array' then raise exception 'The recorded participating IPO identities are incomplete.' using errcode='22023'; end if;
      if jsonb_array_length(reference_ids)=0 and jsonb_array_length(coalesce(nullif(target_state->'record'->'participatingIpos','null'),'[]'))>0 then raise exception 'Legacy IPO labels have no stable identities. Historical restoration cannot guess their links.' using errcode='22023'; end if;
      for n in select jsonb_array_elements_text(reference_ids) loop
        reference_row:=public.dcf_restore_ipo(p_actor,p_type,n);
        reference_names:=reference_names||jsonb_build_array(reference_row->'name');
      end loop;
      changes:=changes||jsonb_build_object('participatingIpos',reference_names);
    exception when others then blockers:=blockers||sqlerrm; end;
  end if;
  if p_type='activities' and changes ?| array['reference_activity_id','name','component','type']
    and nullif(case when changes ? 'reference_activity_id' then changes->>'reference_activity_id' else current_state->'record'->>'reference_activity_id' end,'') is not null then
    select to_jsonb(x) into reference_row from public.reference_activities x where id=(case when changes ? 'reference_activity_id' then changes->>'reference_activity_id' else current_state->'record'->>'reference_activity_id' end)::bigint;
    if reference_row is null then blockers:=array_append(blockers,'The recorded Activity reference no longer exists.');
    elsif coalesce(changes->>'type',current_state->'record'->>'type')<>'Training' then
      changes:=changes||jsonb_build_object('name',reference_row->'activity_name');
    end if;
  end if;
  if changes ? 'uacsCode' and nullif(changes->>'uacsCode','') is not null and not exists(select 1 from public.reference_uacs u where u."uacsCode"=changes->>'uacsCode') then blockers:=blockers||'The recorded UACS selection no longer exists.'; end if;
  foreach field in array array['details','expenses'] loop
    if not changes ? field then continue; end if;
    for line in select x.value from jsonb_array_elements(coalesce(nullif(changes->field,'null'),'[]')) x loop
      select x.value into before_line from jsonb_array_elements(coalesce(nullif(current_state->'record'->field,'null'),'[]')) x where x.value->>'id'=line->>'id';
      if nullif(line->>'uacsCode','') is not null and (before_line is null or line->'uacsCode' is distinct from before_line->'uacsCode' or line->'objectType' is distinct from before_line->'objectType' or line->'expenseParticular' is distinct from before_line->'expenseParticular')
        and not exists(select 1 from public.reference_uacs u where u."uacsCode"=line->>'uacsCode' and (nullif(line->>'objectType','') is null or u."objectType"=line->>'objectType') and (nullif(line->>'expenseParticular','') is null or u.particular=line->>'expenseParticular')) then
        blockers:=blockers||('The recorded UACS selection for budget item '||(line->>'id')||' no longer exists.');
      end if;
    end loop;
  end loop;
  -- Build the user preview from the exact normalized payload that will be applied.
  for field,value in select * from jsonb_each(changes) loop
    if value is not distinct from current_state->'record'->field then changes:=changes-field; continue; end if;
    begin perform public.dcf_check_field_change(p_actor,p_type,current_state->'record',field,value,'Historical restore preview','history-restore'); exception when others then blockers:=blockers||sqlerrm; end;
  end loop;
  if target_state->'physical'->'deliveryEvidence' is distinct from current_state->'physical'->'deliveryEvidence' then blockers:=array_append(blockers,'Delivery evidence changed independently. Restore cannot rewind its separately managed records.'); end if;
  if p_type='activities' and changes ? 'expenses' and public.activity_original_plan(changes->'expenses') is distinct from public.activity_original_plan(current_state->'record'->'expenses') and (current_state->'record'->>'status'<>'Proposed' or nullif(current_state->'record'->'original_budget_snapshot','null') is not null) then blockers:=array_append(blockers,'The original Activity budget is frozen.'); end if;
  if changes ?| array['details','expenses'] and (current_state->'record'->>'budgetItemTransferId' is not null or exists(select 1 from public.budget_item_transfers t where t.source_id=p_id and t.source_type=case when p_type='activities' then 'activity' when p_type='subprojects' then 'subproject' else '' end)) then blockers:=array_append(blockers,'Budget items affected by a transfer cannot be reversed through record restore.'); end if;
  if p_type='activities' and changes ? 'expenses' then
    for line in select value from jsonb_array_elements(coalesce(changes->'expenses','[]')) loop
      if nullif(line->>'supplementUid','') is null then continue; end if;
      select value into before_line from jsonb_array_elements(coalesce(current_state->'record'->'expenses','[]')) where value->>'id'=line->>'id';
      if before_line is null or public.activity_expense_plan(line) is distinct from public.activity_expense_plan(before_line) then blockers:=array_append(blockers,'Supplemental funding must use its own approval workflow.'); end if;
    end loop;
  end if;
  begin financial_changes:=public.dcf_restore_financial_diff(p_type,p_id,current_state,target_state); exception when others then blockers:=blockers||sqlerrm; end;
  if financial_changes<>'[]'::jsonb then
    actuals:=true;
    begin perform public.dcf_check_action(p_actor,p_type,current_state->'record','editFinancialAccomplishment','Historical restore preview'); exception when others then blockers:=blockers||sqlerrm; end;
  end if;
  for field in select key from jsonb_each(coalesce(current_state->'related','{}')||coalesce(target_state->'related','{}')) loop
    if current_state->'related'->field is distinct from target_state->'related'->field then excluded:=excluded||('related.'||field); end if;
  end loop;
  display_changes:=public.dcf_restore_display(current_state,changes,financial_changes,target_state);
  begin perform public.dcf_check_access(p_actor,p_type,current_state->'record'||changes,true); exception when others then blockers:=blockers||sqlerrm; end;
  proposed:=jsonb_set(proposed,'{record}',public.dcf_derived_physical(p_type,current_state->'record'||changes));
  proposed:=jsonb_set(proposed,'{financial}',target_state->'financial');
  return jsonb_build_object('revisionId',p_revision,'sourceRevisionId',r.id,'currentRevisionId',h.latest_revision_id,'currentHash',md5(jsonb_build_array(public.dcf_snapshot_hash(current_state),changes,financial_changes,to_jsonb(blockers),to_jsonb(excluded))::text),'current',current_state,'proposed',proposed,'changes',display_changes,'blockers',to_jsonb(blockers),'excludedFields',to_jsonb(excluded),'requiresActualsAcknowledgement',actuals,'changesActuals',actuals,'canRestore',cardinality(blockers)=0 and (changes<>'{}'::jsonb or financial_changes<>'[]'::jsonb),'parentChanges',changes,'financialChanges',financial_changes);
end $$;

create or replace function public.preview_dcf_restore(p_actor_id bigint,p_actor_password text,p_entity_type text,p_parent_id bigint,p_revision_id bigint,p_undo_operation_id uuid default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.users%rowtype; result jsonb; begin
  a:=public.dcf_authenticate(p_actor_id,p_actor_password);
  result:=public.dcf_restore_plan(a,p_entity_type,p_parent_id,p_revision_id,p_undo_operation_id);
  return result-'parentChanges'-'financialChanges';
end $$;

create or replace function public.apply_dcf_restore(p_actor_id bigint,p_actor_password text,p_entity_type text,p_parent_id bigint,p_revision_id bigint,p_expected_revision_id bigint,p_expected_hash text,p_reason text,p_acknowledged_actuals boolean,p_request_key uuid,p_undo_operation_id uuid default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.users%rowtype; result jsonb; plan jsonb; cached public.dcf_mutation_requests%rowtype; fingerprint text; operation uuid:=gen_random_uuid(); before_id bigint; restore_source text; receipt_hash text; begin
  perform public.dcf_entity_table(p_entity_type); a:=public.dcf_authenticate(p_actor_id,p_actor_password);
  if p_request_key is null then raise exception 'A restore request identity is required.'; end if;
  fingerprint:=md5(jsonb_build_array('restore',p_entity_type,p_parent_id,p_revision_id,p_expected_revision_id,p_expected_hash,p_reason,p_acknowledged_actuals,p_undo_operation_id)::text);
  perform pg_advisory_xact_lock(hashtextextended(p_request_key::text,0));
  select * into cached from public.dcf_mutation_requests where request_key=p_request_key;
  if found then
    if cached.actor_id<>a.id or cached.request_hash<>fingerprint then raise exception 'This request identity belongs to another operation.'; end if;
    execute format('select to_jsonb(r) from public.%I r where id=$1',p_entity_type) into result using p_parent_id;
    perform public.dcf_check_access(a,p_entity_type,result,false);
    perform public.dcf_check_action(a,p_entity_type,result,'restoreHistory',p_reason);
    perform public.dcf_check_access(a,p_entity_type,cached.response->'record',false);
    if not exists(select 1 from public.dcf_revision_heads h join public.dcf_record_revisions v on v.id=(cached.response->>'revisionId')::bigint and v.incarnation=h.incarnation where h.entity_type=p_entity_type and h.parent_id=p_parent_id and not h.deleted) then raise exception 'The restored record incarnation is no longer current. Reload before continuing.' using errcode='40001'; end if;
    return cached.response;
  end if;
  if p_undo_operation_id is not null then
    perform id from public.dcf_restore_operations where id=p_undo_operation_id for update;
    if not found then raise exception 'The restore operation is unavailable.'; end if;
  end if;
  execute format('select id from public.%I where id=$1 for update',p_entity_type) using p_parent_id;
  perform public.dcf_check_action(a,p_entity_type,public.dcf_snapshot(p_entity_type,p_parent_id)->'record','restoreHistory',p_reason);
  plan:=public.dcf_restore_plan(a,p_entity_type,p_parent_id,p_revision_id,p_undo_operation_id);
  if plan->>'currentRevisionId' is distinct from p_expected_revision_id::text or plan->>'currentHash' is distinct from p_expected_hash then raise exception 'This record changed after the preview. Refresh the preview before restoring.' using errcode='40001'; end if;
  if not coalesce((plan->>'canRestore')::boolean,false) then raise exception 'Restore is blocked: %',plan->'blockers' using errcode='42501'; end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'A restore reason is required.'; end if;
  if coalesce((plan->>'requiresActualsAcknowledgement')::boolean,false) and not coalesce(p_acknowledged_actuals,false) then raise exception 'Confirm the changes to reported actuals before restoring.'; end if;
  before_id:=(plan->>'currentRevisionId')::bigint;
  restore_source:=case when p_undo_operation_id is null then 'history-restore' else 'undo-restore' end;
  perform public.dcf_begin_operation(a.id,p_actor_password,restore_source,p_request_key,p_reason);
  -- The internal mutation has a separate retry key; the public restore receipt is
  -- written only after the pre-state/result linkage succeeds in this transaction.
  result:=public.commit_dcf_change(a.id,p_actor_password,p_entity_type,p_parent_id,plan->'current',plan->'parentChanges',plan->'financialChanges',p_request_key,p_reason,restore_source);
  insert into public.dcf_restore_operations(id,entity_type,parent_id,source_revision_id,before_revision_id,before_snapshot,result_revision_id,actor_id,reason,undo_of,identity_map)
  values(operation,p_entity_type,p_parent_id,(plan->>'sourceRevisionId')::bigint,before_id,plan->'current',(result->>'revisionId')::bigint,a.id,p_reason,p_undo_operation_id,
    (select coalesce(jsonb_agg(to_jsonb(l)),'[]') from public.dcf_financial_lineage l where entity_type=p_entity_type and parent_id=p_parent_id and operation_id=p_request_key));
  result:=result||jsonb_build_object('confirmed',true,'operationId',operation,'restoreOperationId',operation,'beforeRevisionId',before_id);
  update public.dcf_mutation_requests set request_hash=fingerprint,response=result where request_key=p_request_key and actor_id=a.id;
  return result;
end $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'dcf\_%' escape '\' or p.proname in ('preview_dcf_restore','apply_dcf_restore')) loop execute format('revoke all on function %s from public,anon,authenticated',f.signature); end loop;
end $$;
grant execute on function public.preview_dcf_restore(bigint,text,text,bigint,bigint,uuid),public.apply_dcf_restore(bigint,text,text,bigint,bigint,bigint,text,text,boolean,uuid,uuid) to anon,authenticated;
commit;
