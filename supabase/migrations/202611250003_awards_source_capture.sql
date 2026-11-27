-- Local preparation: reads existing business data; writes only private calculation captures.
begin;
set local lock_timeout='5s';
set local statement_timeout='90s';
do $$ begin
 if to_regclass('public.dcf_financial_lineage') is null then raise exception 'Apply the DCF revision mutations migration before Awards source capture.';end if;
end $$;
create index if not exists dcf_financial_lineage_awards_live_idx on public.dcf_financial_lineage(entity_type,stage,live_id);

create function public.award_source_date(p_value text) returns date
language plpgsql immutable set search_path=public,pg_temp as $$
begin
 if p_value is null or p_value !~ '^\d{4}-\d{2}-\d{2}$' then return null; end if;
 return p_value::date;
exception when invalid_datetime_format or datetime_field_overflow then return null;
end $$;

create function public.award_source_number(p_value text) returns numeric
language plpgsql immutable set search_path=public,pg_temp as $$
begin
 if p_value is null or p_value !~ '^-?\d+(\.\d+)?$' then return 0; end if;
 return p_value::numeric;
end $$;

create function public.award_source_fund_key(p_record jsonb) returns text
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare label_value text:=lower(btrim(coalesce(p_record->>'fundSource','')));matched text;matches integer;legacy_uid text;
begin
 if nullif(p_record->>'fundSourceUid','') is not null then return p_record->>'fundSourceUid'; end if;
 if label_value='' then return '__unspecified_fund_source__'; end if;
 select count(*),min(uid) into matches,matched from public.ref_fund_sources where lower(btrim(label))=label_value;
 if matches=1 then return matched; end if;
 if matches>1 then return '__legacy_fund_source__:'||label_value;end if;
 legacy_uid:=case label_value when '4k fund' then 'FS-000001' when 'high value crops' then 'FS-000002'
   when 'corn' then 'FS-000003' when 'rice' then 'FS-000004' when 'organic' then 'FS-000005' when 'livestock' then 'FS-000006' end;
 if legacy_uid is not null and exists(select 1 from public.ref_fund_sources where uid=legacy_uid) then return legacy_uid; end if;
 return '__legacy_fund_source__:'||label_value;
end $$;

-- Preserve precision: monthly legacy totals must not acquire a fictitious day.
create function public.award_source_stage(p_type text,p_parent bigint,p_item text,p_line jsonb,p_stage text,p_year text) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare entries jsonb;date_key text;amount_key text;month_key text;month_index integer:=0;amount_value numeric;
begin
 if p_stage not in ('obligation','disbursement') then raise exception 'Invalid financial stage.' using errcode='22023'; end if;
 if p_stage='obligation' then
   select jsonb_agg(jsonb_build_object('id',o.id::text,'date',o.obligation_date::text,'amount',o.amount,'remarks',o.remarks,'precision','day',
     'historicalLinks',coalesce((select jsonb_agg(jsonb_build_object('parentId',f.parent_id::text,'itemId',f.item_id,'historicalId',f.historical_id) order by f.parent_id,f.item_id,f.historical_id) from public.dcf_financial_lineage f where f.entity_type=p_type and f.stage=p_stage and f.live_id=o.id),'[]')) order by o.id) into entries
   from public.financial_obligations o where o.entity_type=public.dcf_financial_type(p_type) and o.parent_id=p_parent and coalesce(o.item_id::text,'')=coalesce(p_item,'');
 else
   select jsonb_agg(jsonb_build_object('id',d.id::text,'date',d.disbursement_date::text,'amount',d.amount,'remarks',d.remarks,'precision','day',
     'historicalLinks',coalesce((select jsonb_agg(jsonb_build_object('parentId',f.parent_id::text,'itemId',f.item_id,'historicalId',f.historical_id) order by f.parent_id,f.item_id,f.historical_id) from public.dcf_financial_lineage f where f.entity_type=p_type and f.stage=p_stage and f.live_id=d.id),'[]')) order by d.id) into entries
   from public.financial_disbursements d where d.entity_type=public.dcf_financial_type(p_type) and d.parent_id=p_parent and coalesce(d.item_id::text,'')=coalesce(p_item,'');
 end if;
 if entries is not null or exists(select 1 from public.dcf_financial_entry_state where entity_type=p_type and parent_id=p_parent and item_id=coalesce(p_item,'') and stage=p_stage) then
   return jsonb_build_object('source','central','entries',coalesce(entries,'[]'));
 end if;
 if jsonb_typeof(p_line->(p_stage||'s'))='array' and jsonb_array_length(p_line->(p_stage||'s'))>0 then
   select jsonb_agg(public.dcf_project_embedded('entry',value)||jsonb_build_object('precision','day',
     'id',coalesce(value->>'id','legacy:'||p_stage||':'||coalesce(p_item,'')||':'||(ordinality-1)::text),
     'historicalId','legacy:'||p_stage||':'||coalesce(p_item,'')||':'||(ordinality-1)::text) order by ordinality) into entries from jsonb_array_elements(p_line->(p_stage||'s')) with ordinality;
   return jsonb_build_object('source','embedded','entries',entries);
 end if;
 entries:='[]';
 if p_stage='disbursement' then
   foreach month_key in array array['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'] loop
     month_index:=month_index+1;amount_value:=public.award_source_number(p_line->>('actualDisbursement'||month_key));
     if amount_value<>0 then entries:=entries||jsonb_build_array(jsonb_build_object('id','month:'||month_index,'month',null,'monthOfYear',month_index,'fundYearContext',p_year,'precision','month','amount',amount_value));end if;
   end loop;
   if jsonb_array_length(entries)>0 then return jsonb_build_object('source','legacy-monthly','calendarYearKnown',false,'entries',entries);end if;
 end if;
 date_key:=case p_stage when 'obligation' then 'actualObligationDate' else 'actualDisbursementDate' end;
 amount_key:=case p_stage when 'obligation' then 'actualObligationAmount' else 'actualDisbursementAmount' end;
 amount_value:=public.award_source_number(p_line->>amount_key);
 if amount_value<>0 then entries:=jsonb_build_array(jsonb_build_object('id','legacy:'||p_stage,'historicalId','legacy:'||p_stage||':'||coalesce(p_item,'')||':0','date',p_line->>date_key,'amount',amount_value,'precision','day'));end if;
 return jsonb_build_object('source','legacy-scalar','entries',entries);
end $$;

create function public.award_source_parent(p_type text,p_record jsonb) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare record_value jsonb;lines jsonb;line jsonb;financial jsonb:='[]';item text;revision_value jsonb;year_value text;has_items boolean;
 orphaned jsonb;physical jsonb;supplied jsonb;
begin
 record_value:=public.dcf_project_record(p_type,p_record);
 year_value:=coalesce(record_value->>'fundingYear',record_value->>'fundYear');
 lines:=case p_type when 'subprojects' then record_value->'details' when 'activities' then record_value->'expenses' when 'staffing_requirements' then record_value->'expenses' else null end;
 if jsonb_typeof(lines) is distinct from 'array' then
   lines:=case when p_type in ('subprojects','activities') then '[]'::jsonb else jsonb_build_array(record_value) end;
 elsif p_type='staffing_requirements' and jsonb_array_length(lines)=0 then lines:=jsonb_build_array(record_value);
 end if;
 has_items:=p_type in ('subprojects','activities') or (p_type='staffing_requirements' and lines<>jsonb_build_array(record_value));
 for line in select * from jsonb_array_elements(lines) loop
   item:=case when has_items then line->>'id' else null end;
   financial:=financial||jsonb_build_array(jsonb_build_object('itemId',item,'line',line,
     'obligation',public.award_source_stage(p_type,(record_value->>'id')::bigint,item,line,'obligation',year_value),
     'disbursement',public.award_source_stage(p_type,(record_value->>'id')::bigint,item,line,'disbursement',year_value)));
 end loop;
 select jsonb_build_object('incarnation',incarnation,'version',version,'revisionId',latest_revision_id,'deleted',deleted) into revision_value
 from public.dcf_revision_heads where entity_type=p_type and parent_id=(record_value->>'id')::bigint;
 select coalesce(jsonb_agg(v order by v->>'stage',v->>'id'),'[]') into orphaned from (
   select public.dcf_project_embedded('ledger',to_jsonb(o))||jsonb_build_object('stage','obligation') v from public.financial_obligations o
   where entity_type=public.dcf_financial_type(p_type) and parent_id=(record_value->>'id')::bigint and not exists(select 1 from jsonb_array_elements(financial) f where coalesce(f->>'itemId','')=coalesce(o.item_id::text,''))
   union all select public.dcf_project_embedded('ledger',to_jsonb(d))||jsonb_build_object('stage','disbursement') from public.financial_disbursements d
   where entity_type=public.dcf_financial_type(p_type) and parent_id=(record_value->>'id')::bigint and not exists(select 1 from jsonb_array_elements(financial) f where coalesce(f->>'itemId','')=coalesce(d.item_id::text,''))
 ) x;
 if p_type='subprojects' then select coalesce(jsonb_agg(public.dcf_project_embedded('subproject_accomplishments',to_jsonb(a)) order by id),'[]') into physical from public.subproject_accomplishments a where subproject_id=(record_value->>'id')::bigint;end if;
 if p_type='activities' then select coalesce(jsonb_agg(public.dcf_project_embedded('activity_supplements',to_jsonb(s)) order by uid),'[]') into supplied from public.activity_supplements s where activity_id=(record_value->>'id')::bigint;end if;
 return jsonb_build_object('entityType',p_type,'record',record_value,'financial',financial,'revision',revision_value,'unmatchedFinancial',orphaned,'physicalEntries',coalesce(physical,'[]'),'supplements',coalesce(supplied,'[]'));
end $$;

-- This is only a conservative read selector. The calculator decides eligibility.
create function public.award_source_relevant(p_parent jsonb,p_year integer,p_policy jsonb) returns boolean
language plpgsql immutable set search_path=public,pg_temp as $$
declare r jsonb:=p_parent->'record';line jsonb;entry jsonb;stage text;d date;
 prior_o numeric;prior_d numeric;basis numeric;date_value text;target_value date;actual_value date;
begin
 if p_policy->>'mode'='Legacy' then return coalesce(r->>'fundingYear',r->>'fundYear')=p_year::text;end if;
 if jsonb_array_length(p_parent->'unmatchedFinancial')>0 then return true;end if;
 if coalesce(r->>'fundingYear',r->>'fundYear')=p_year::text then return true;end if;
 target_value:=public.award_source_date(coalesce(r->>'estimatedCompletionDate',r->>'endDate',r->>'date',r->>'physicalDeliveryDate'));
 actual_value:=public.award_source_date(coalesce(r->>'actualCompletionDate',r->>'actualEndDate',r->>'actualDate'));
 if actual_value between (p_policy->>'physicalStart')::date and (p_policy->>'physicalCutoff')::date then return true;end if;
 if target_value is not null and target_value<=(p_policy->>'physicalCutoff')::date and (actual_value is null or actual_value>=(p_policy->>'physicalStart')::date) then return true;end if;
 for line in select * from jsonb_array_elements(p_parent->'financial') loop
   prior_o:=0;prior_d:=0;
   foreach stage in array array['obligation','disbursement'] loop
     for entry in select * from jsonb_array_elements(line->stage->'entries') loop
       if entry->>'precision'='month' then
         -- A boundary month remains in the capture for explicit ambiguity review.
         date_value:=entry->>'month';d:=public.award_source_date(date_value||'-01');
         if d is null then return true;end if;
         if d+(interval '1 month')>(p_policy->>'financialStart')::date and d<=(p_policy->>'financialCutoff')::date then return true;end if;
       else d:=public.award_source_date(entry->>'date');end if;
       if d is null then return true;end if;
       if d between (p_policy->>'financialStart')::date and (p_policy->>'financialCutoff')::date then return true;end if;
       if d<(p_policy->>'financialStart')::date then
         if stage='obligation' then prior_o:=prior_o+public.award_source_number(entry->>'amount');else prior_d:=prior_d+public.award_source_number(entry->>'amount');end if;
       end if;
     end loop;
   end loop;
   basis:=coalesce(public.award_source_number(line->'line'->>'amount'),0);
   if not (line->'line' ? 'amount') or line->'line'->'amount'='null'::jsonb then
     basis:=case when p_parent->>'entityType'='staffing_requirements' and line->'itemId'='null'::jsonb then public.award_source_number(r->>'annualSalary') else public.award_source_number(line->'line'->>'numberOfUnits')*public.award_source_number(line->'line'->>'pricePerUnit') end;
   end if;
   if (basis>prior_d or prior_o<>prior_d) and (coalesce(r->>'fundingYear',r->>'fundYear') is null or public.award_source_number(coalesce(r->>'fundingYear',r->>'fundYear'))<=p_year) then return true;end if;
 end loop;
 -- Unknown dates/year cannot be silently interpreted as a completed historical cohort.
 return coalesce(r->>'fundingYear',r->>'fundYear') is null;
end $$;

create function public.award_source_document(p_year integer,p_scope jsonb) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare k text:=public.resource_digest(p_scope::text);policy_value jsonb;policy_id uuid;controller_version bigint;head_version bigint;transfers jsonb;
 records jsonb;settings_value jsonb;manual_value jsonb;fund_references jsonb;ipo_references jsonb;periods jsonb:='[]';q text;period public.reportorial_periods%rowtype;ev jsonb;
 baseline public.award_result_versions%rowtype;baseline_value jsonb;dependencies jsonb:='[]';document jsonb;
begin
 if p_year is null or p_year not between 1900 and 9999 then raise exception 'Choose an Awards Year.' using errcode='22023';end if;
 select v.policy,v.id into policy_value,policy_id from public.award_policy_heads h join public.award_policy_versions v on v.id=h.policy_id where h.awards_year=p_year and h.scope_key=k;
 if policy_value is null then policy_value:=jsonb_build_object('schemaVersion',1,'mode','Legacy','awardsYear',p_year,'physicalStart',p_year::text||'-01-01','physicalCutoff',p_year::text||'-11-15','financialStart',p_year::text||'-01-01','financialCutoff',p_year::text||'-10-15','transitionApproved',false,'baselineResultId',null,'formulaVersion','awards-v2');end if;
 perform public.award_validate_policy(p_year,policy_value);
 if policy_value->>'mode'='Cutoff' and policy_value->'baselineResultId'='null'::jsonb and exists(select 1 from public.award_result_heads h join public.award_result_versions r on r.id=h.active_result_id where h.awards_year=p_year-1 and h.scope_key=k and r.snapshot->'policy'->>'mode'='Cutoff') then
   raise exception 'Select the preceding finalized baseline before continuing the annual recognition cycle.' using errcode='22023';
 end if;
 if policy_value->'baselineResultId'<>'null'::jsonb then
   select r.* into baseline from public.award_result_versions r where r.awards_year=p_year-1 and r.scope_key=k and r.id=(policy_value->>'baselineResultId')::uuid;
   if not found then raise exception 'The selected finalized baseline is unavailable. Review the annual policy.' using errcode='40001';end if;
   if baseline.snapshot->'policy'->>'mode' is distinct from 'Cutoff' then raise exception 'Review the opening transition instead of carrying a legacy calculation as a cutoff baseline.' using errcode='22023';end if;
   if (policy_value->>'physicalStart')::date<>(baseline.snapshot->'policy'->>'physicalCutoff')::date+1 or (policy_value->>'financialStart')::date<>(baseline.snapshot->'policy'->>'financialCutoff')::date+1 then raise exception 'Recognition windows must continue from the selected baseline without gaps or overlap.' using errcode='22023';end if;
   baseline_value:=jsonb_build_object('id',baseline.id,'awardsYear',baseline.awards_year,'policy',baseline.snapshot->'policy','carryHash',baseline.carry_hash,'carry',coalesce(baseline.snapshot->'carry','[]'),'recognizedEvents',coalesce(baseline.snapshot->'recognizedEvents','[]'),'sourceDataAsOf',baseline.source_data_as_of);
   dependencies:=jsonb_build_array(jsonb_build_object('awardsYear',baseline.awards_year,'carryHash',baseline.carry_hash,'resultId',baseline.id));
 end if;
 select coalesce(version,0) into controller_version from public.award_controller_state;
 select coalesce(version,0) into head_version from public.award_result_heads where awards_year=p_year and scope_key=k;
 select coalesce(settings,'{}') into settings_value from public.award_ranking_settings where settings_key='awards_and_rankings';
 select coalesce(jsonb_agg(to_jsonb(m) order by m.period,m.operating_unit),'[]') into manual_value from public.award_manual_scores m where m.fund_year=p_year and p_scope->'ous' ? m.operating_unit;
 with raw as (
   select 'subprojects' entity_type,to_jsonb(t) body from public.subprojects t where p_scope->'ous' ? t."operatingUnit"
   union all select 'activities',to_jsonb(t) from public.activities t where p_scope->'ous' ? t."operatingUnit"
   union all select 'office_requirements',to_jsonb(t) from public.office_requirements t where p_scope->'ous' ? t."operatingUnit"
   union all select 'staffing_requirements',to_jsonb(t) from public.staffing_requirements t where p_scope->'ous' ? t."operatingUnit"
   union all select 'other_program_expenses',to_jsonb(t) from public.other_program_expenses t where p_scope->'ous' ? t."operatingUnit"
 ), scoped as (
   select * from raw where coalesce(body->>'workflow_status','APPROVED')='APPROVED'
     and (nullif(body->>'budgetItemTransferId','') is null or body->>'workflow_status'='APPROVED')
     and (p_scope->'tiers'='null'::jsonb or p_scope->'tiers' ? (body->>'tier'))
     and (p_scope->'fundTypes'='null'::jsonb or p_scope->'fundTypes' ? (body->>'fundType'))
     and (p_scope->'fundSources'='null'::jsonb or p_scope->'fundSources' ? public.award_source_fund_key(body))
     and (p_scope->'sourceFundYears'='null'::jsonb or p_scope->'sourceFundYears' ? coalesce(body->>'fundingYear',body->>'fundYear'))
 ), bundled as materialized (select public.award_source_parent(entity_type,body) value from scoped), selected as (
   select value from bundled where public.award_source_relevant(value,p_year,policy_value)
     or exists(select 1 from jsonb_array_elements(coalesce(baseline_value->'carry','[]')) c where c->>'entityType'=value->>'entityType' and c->>'parentId'=value->'record'->>'id'
       and (c->>'kind'='physical' or coalesce((c->>'closingAllotment')::numeric,0)<>0 or coalesce((c->>'closingUnpaidObligations')::numeric,0)<>0 or coalesce((c->>'targetClosing')::numeric,0)<>0))
   order by value->>'entityType',(value->'record'->>'id')::bigint limit 10001
 ) select coalesce((select jsonb_agg(value order by value->>'entityType',(value->'record'->>'id')::bigint) from selected),'[]'),
   coalesce((select jsonb_agg(link order by link->>'resolvedAt',link->>'id') from (
     select jsonb_build_object('id',t.id,'entityType',s.entity_type,'sourceId',t.source_id::text,'destinationId',t.destination_id::text,'itemIds',to_jsonb(t.selected_item_ids),
       'sourceOu',s.body->>'operatingUnit','destinationOu',d.body->>'operatingUnit','resolvedAt',t.resolved_at) link
     from public.budget_item_transfers t join scoped s on s.entity_type=case t.source_type when 'activity' then 'activities' else 'subprojects' end and s.body->>'id'=t.source_id::text
     join scoped d on d.entity_type=s.entity_type and d.body->>'id'=t.destination_id::text
     where t.status='applied' order by t.resolved_at,t.id limit 20001
   ) edges),'[]') into records,transfers;
 if jsonb_array_length(records)>10000 then raise exception 'The Awards source scope is too large. Select a narrower comparison scope.' using errcode='54000';end if;
 if jsonb_array_length(transfers)>20000 then raise exception 'The Awards transfer lineage exceeds the capture limit. Narrow the comparison scope.' using errcode='54000';end if;
 select coalesce(jsonb_agg(public.dcf_project_embedded('fundSource',to_jsonb(f)) order by f.uid),'[]') into fund_references from public.ref_fund_sources f
 where p_scope->'fundSources' ? f.uid or exists(select 1 from jsonb_array_elements(records) p where public.award_source_fund_key(p->'record')=f.uid);
 select coalesce(jsonb_agg(public.dcf_project_embedded('ipo-reference',to_jsonb(i)) order by i.id),'[]') into ipo_references from public.ipos i
 where exists(select 1 from jsonb_array_elements(records) p where
   (p->>'entityType'='subprojects' and p->'record'->>'ipo_id'=i.id::text) or
   (p->>'entityType'='activities' and exists(select 1 from jsonb_array_elements_text(case when jsonb_typeof(p->'record'->'participating_ipo_ids')='array' then p->'record'->'participating_ipo_ids' else '[]'::jsonb end) id_value where id_value=i.id::text)));
 foreach q in array array['Q1','Q2','Q3','Q4'] loop
   select * into period from public.reportorial_periods where reporting_year=p_year and quarter=q;
   ev:=null;
   if period.source='Repository' then
     if period.state='Finalized' then select evidence into ev from public.reportorial_snapshots where id=period.snapshot_id;
       if ev is null then raise exception 'Finalized Repository evidence is unavailable.' using errcode='55000';end if;
     else ev:=public.resource_reportorial_live(p_year,q,statement_timestamp())-'cutoff';end if;
     ev:=ev||jsonb_build_object('rows',coalesce((select jsonb_agg(v order by v->>'operating_unit') from jsonb_array_elements(coalesce(ev->'rows','[]')) v where p_scope->'ous' ? (v->>'operating_unit')),'[]'),
       'evidence',coalesce((select jsonb_agg(v order by v->>'operating_unit',v->>'entry_id') from jsonb_array_elements(coalesce(ev->'evidence','[]')) v where p_scope->'ous' ? (v->>'operating_unit')),'[]'));
   end if;
   periods:=periods||jsonb_build_array(jsonb_build_object('quarter',q,'source',coalesce(period.source,'Manual'),'state',coalesce(period.state,'Open'),'version',coalesce(period.version,0),'snapshotId',period.snapshot_id,'summary',ev));
 end loop;
 document:=jsonb_build_object('schemaVersion',1,'awardsYear',p_year,'scope',p_scope,'scopeKey',k,'policy',policy_value,'policyId',policy_id,'policyVersion',(select version from public.award_policy_versions where id=policy_id),'controllerVersion',coalesce(controller_version,0),'headVersion',coalesce(head_version,0),'settings',coalesce(settings_value,'{}'),'manual',manual_value,'records',records,'transferLinks',transfers,'fundSourceReferences',fund_references,'ipoReferences',ipo_references,'reportorialPeriods',periods,'baseline',baseline_value,'dependencies',dependencies);
 if octet_length(document::text)>20000000 then raise exception 'The Awards source evidence exceeds the safe capture size. Narrow the scope.' using errcode='54000';end if;
 return document;
end $$;

create function public.award_capture_sources(p_session text,p_year integer,p_scope jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor jsonb;scope_value jsonb;inputs_value jsonb;captured public.award_calculation_captures%rowtype;
begin
 actor:=public.award_verified_actor(p_session);scope_value:=public.award_normalize_scope(actor,p_scope);
 -- STABLE source_document and all its source helpers share this SELECT's MVCC snapshot.
 select public.award_source_document(p_year,scope_value) into inputs_value;
 actor:=public.award_verified_actor(p_session);perform public.award_normalize_scope(actor,scope_value);
 perform public.award_assert_evidence_access(p_session,inputs_value);
 insert into public.award_calculation_captures(awards_year,scope_key,scope,actor_id,policy_id,controller_version,result_head_version,inputs,source_hash,dependencies,source_data_as_of)
 values(p_year,inputs_value->>'scopeKey',scope_value,(actor->>'id')::bigint,(inputs_value->>'policyId')::uuid,(inputs_value->>'controllerVersion')::bigint,(inputs_value->>'headVersion')::bigint,inputs_value,public.resource_digest(inputs_value::text),inputs_value->'dependencies',statement_timestamp()) returning * into captured;
 return to_jsonb(captured);
end $$;

-- A fresh source read and the result commit share this transaction and lock order.
-- Caller-computed hashes are not accepted at the external calculator boundary.
create function public.award_commit_calculated(p_session text,p_capture_id uuid,p_snapshot jsonb,p_request_id uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.award_calculation_captures%rowtype;cached jsonb;current_inputs jsonb;
begin
 cached:=public.award_finalize_status(p_session,p_capture_id,p_request_id,p_reason);if cached is not null then return cached;end if;
 select * into c from public.award_calculation_captures where id=p_capture_id;
 perform pg_advisory_xact_lock(hashtextextended('award-controller',0));
 perform pg_advisory_xact_lock(hashtextextended('award-results:'||c.scope_key,0));
 perform public.award_read_capture(p_session,p_capture_id);
 if c.expires_at<=clock_timestamp() then raise exception 'The preview expired. Review a fresh calculation.' using errcode='40001';end if;
 if p_snapshot->'canFinalize' is distinct from 'true'::jsonb or p_snapshot->'policy'->>'mode' is distinct from 'Cutoff' or jsonb_typeof(p_snapshot->'carry') is distinct from 'array' or jsonb_typeof(p_snapshot->'recognizedEvents') is distinct from 'array' then raise exception 'Resolve the calculation issues and approve the cutoff policy before finalizing.' using errcode='22023';end if;
 select public.award_source_document(c.awards_year,c.scope) into current_inputs;
 if public.resource_digest(current_inputs::text)<>c.source_hash then raise exception 'Source data changed. Review a fresh calculation before finalizing.' using errcode='40001';end if;
 return public.award_commit_result(p_session,p_capture_id,p_snapshot,p_snapshot->'carry',public.resource_digest(current_inputs::text),p_request_id,p_reason);
end $$;

create function public.award_refresh_capture(p_session text,p_capture_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor jsonb;c public.award_calculation_captures%rowtype;inputs_value jsonb;
begin
 actor:=public.award_verified_actor(p_session);select * into c from public.award_calculation_captures where id=p_capture_id and actor_id=(actor->>'id')::bigint;
 if not found then raise exception 'The calculation preview is unavailable.' using errcode='42501';end if;
 perform public.award_normalize_scope(actor,c.scope);
 if c.expires_at<=clock_timestamp() then raise exception 'The calculation preview expired.' using errcode='40001';end if;
 select public.award_source_document(c.awards_year,c.scope) into inputs_value;
 actor:=public.award_verified_actor(p_session);perform public.award_normalize_scope(actor,c.scope);
 perform public.award_assert_evidence_access(p_session,inputs_value);
 return jsonb_build_object('sourceHash',public.resource_digest(inputs_value::text),'matches',public.resource_digest(inputs_value::text)=c.source_hash);
end $$;

do $$ declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('award_source_date','award_source_number','award_source_fund_key','award_source_stage','award_source_parent','award_source_relevant','award_source_document','award_assert_evidence_access','award_capture_sources','award_commit_calculated','award_refresh_capture') loop
   execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
commit;
