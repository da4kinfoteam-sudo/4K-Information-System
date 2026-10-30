-- Additive compatibility only. No business rows or historical snapshots are rewritten.
begin;
set local lock_timeout='5s';

do $$
declare t text; signatures jsonb:='{}'; signature jsonb;
begin
  foreach t in array array['activities','subprojects','financial_obligations','financial_disbursements',
    'subproject_accomplishments','budget_item_adjustment_history','budget_item_transfers',
    'activity_supplements','activity_supplement_revisions','activity_supplement_requests',
    'activity_financial_entry_state','activity_accomplishment_revisions','activity_accomplishment_requests',
    'subproject_financial_entry_state','subproject_accomplishment_revisions','subproject_accomplishment_requests'] loop
    execute format('lock table public.%I in share mode',t);
    execute format('select jsonb_build_object(''count'',count(*),''digest'',md5(coalesce(string_agg(md5(to_jsonb(r)::text),'''' order by md5(to_jsonb(r)::text)),''''))) from public.%I r',t) into signature;
    signatures:=signatures||jsonb_build_object(t,signature);
  end loop;
  perform set_config('app.independent_targets_install_signatures',signatures::text,true);
end; $$;

create or replace function public.budget_target_plan(p_line jsonb) returns jsonb
language plpgsql immutable set search_path=public,pg_temp as $$
declare stage text; entries jsonb; entry jsonb; ids text[]:='{}'; amount numeric; total numeric;
begin
  if coalesce(p_line->'targetScheduleVersion','null')='null'::jsonb
    and coalesce(p_line->'targetObligationSchedules','null')='null'::jsonb
    and coalesce(p_line->'targetDisbursementSchedules','null')='null'::jsonb then return '{}'::jsonb; end if;
  if p_line->'targetScheduleVersion' is distinct from '2'::jsonb then
    raise exception 'Unsupported target schedule version. Refresh before saving.' using errcode='22023';
  end if;
  foreach stage in array array['targetObligationSchedules','targetDisbursementSchedules'] loop
    entries:=p_line->stage; total:=0;
    if jsonb_typeof(entries) is distinct from 'array' then raise exception 'Each target stage requires an explicit schedule list.' using errcode='22023'; end if;
    for entry in select value from jsonb_array_elements(entries) loop
      if jsonb_typeof(entry) is distinct from 'object' then raise exception 'Invalid target entry.' using errcode='22023'; end if;
      if exists(select 1 from jsonb_object_keys(entry) k where k not in ('id','month','amount'))
        or jsonb_typeof(entry->'id') is distinct from 'string' or nullif(btrim(entry->>'id'),'') is null
        or (entry->>'id')=any(ids) then raise exception 'Target entries require unique identities and supported fields.' using errcode='22023'; end if;
      ids:=array_append(ids,entry->>'id');
      if jsonb_typeof(entry->'month') is distinct from 'string' or coalesce(entry->>'month','') !~ '^\d{4}-\d{2}-\d{2}$'
        or left(entry->>'month',4)::integer<1900 then raise exception 'A valid target month is required.' using errcode='22023'; end if;
      perform (entry->>'month')::date;
      if jsonb_typeof(entry->'amount') is distinct from 'number' then raise exception 'Target amounts must be numeric.' using errcode='22023'; end if;
      amount:=(entry->>'amount')::numeric;
      if amount<=0 or amount>9007199254740991 then raise exception 'Target amounts must be finite and positive.' using errcode='22023'; end if;
      total:=total+amount;
    end loop;
    if total>9007199254740991 then raise exception 'The target total is too large.' using errcode='22023'; end if;
  end loop;
  return jsonb_build_object('targetScheduleVersion',2,'targetObligationSchedules',p_line->'targetObligationSchedules','targetDisbursementSchedules',p_line->'targetDisbursementSchedules');
end; $$;

create or replace function public.check_budget_target_conversion(p_base jsonb,p_draft jsonb,p_latest jsonb) returns void
language plpgsql immutable set search_path=public,pg_temp as $$
declare field text;
begin
  if public.budget_target_plan(p_draft)='{}'::jsonb or public.budget_target_plan(p_base)<>'{}'::jsonb then return; end if;
  foreach field in array array['amount','pricePerUnit','numberOfUnits','obligationMonth','disbursementMonth'] loop
    if p_base->field is distinct from p_latest->field then
      raise exception 'The legacy target inputs changed while editing. Refresh before converting this target plan.' using errcode='40001';
    end if;
  end loop;
end; $$;

-- Retain the exact legacy projection (including JSON nulls) for frozen/pending fingerprints.
create or replace function public.activity_expense_plan(p_line jsonb) returns jsonb
language sql immutable set search_path=public,pg_temp as $$
  select jsonb_build_object('id',p_line->'id','objectType',p_line->'objectType','expenseParticular',p_line->'expenseParticular',
    'uacsCode',p_line->'uacsCode','amount',p_line->'amount','obligationMonth',p_line->'obligationMonth','disbursementMonth',p_line->'disbursementMonth',
    'budgetItemGroupId',p_line->'budgetItemGroupId','isCancelled',p_line->'isCancelled','isSavings',p_line->'isSavings','isRealignment',p_line->'isRealignment',
    'fundingOrigin',p_line->'fundingOrigin','supplementUid',p_line->'supplementUid','supplementStatus',p_line->'supplementStatus',
    'supplementalSource',p_line->'supplementalSource','supplementRevisionPending',p_line->'supplementRevisionPending')||public.budget_target_plan(p_line);
$$;

-- Change only the established field/serialization clauses in the installed routines.
-- Exact anchors and postconditions fail closed on a different installed function contract.
do $migration$
declare name text; definition text; original text; anchor text;
begin
  foreach name in array array['save_activity_accomplishment','patch_subproject_accomplishment','save_activity_supplement'] loop
    select pg_get_functiondef(p.oid) into strict original from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname=name;
    if position('-- independent-target-schedules-v2' in original)>0 then continue; end if;
    definition:=original;
    if name='save_activity_accomplishment' then
      anchor:=$a$if field not in ('amount','obligationMonth','disbursementMonth')$a$;
      if position(anchor in definition)=0 then raise exception 'Unexpected Activity target allowlist.'; end if;
      definition:=replace(definition,anchor,$a$if field not in ('amount','obligationMonth','disbursementMonth','targetScheduleVersion','targetObligationSchedules','targetDisbursementSchedules')$a$);
      anchor:=$a$    for field,physical_value in select * from jsonb_each(edit->'values') loop$a$;
      if position(anchor in definition)=0 then raise exception 'Unexpected Activity target merge boundary.'; end if;
      definition:=replace(definition,anchor,$a$    perform public.check_budget_target_conversion(target_base,line||(edit->'values'),line);
    for field,physical_value in select * from jsonb_each(edit->'values') loop$a$);
      anchor:=$a$elsif nullif(physical_value#>>'{}','') is not null then perform (physical_value#>>'{}')::date; end if;$a$;
      if position(anchor in definition)=0 then raise exception 'Unexpected Activity target validation.'; end if;
      definition:=replace(definition,anchor,$a$elsif field in ('targetScheduleVersion','targetObligationSchedules','targetDisbursementSchedules') then null;
      elsif nullif(physical_value#>>'{}','') is not null then perform (physical_value#>>'{}')::date; end if;$a$);
    elsif name='patch_subproject_accomplishment' then
      anchor:=$a$field not in ('deliveryDate','numberOfUnits','pricePerUnit','obligationMonth','disbursementMonth')$a$;
      if position(anchor in definition)=0 then raise exception 'Unexpected Subproject target amount boundary.'; end if;
      definition:=replace(definition,anchor,$a$field not in ('deliveryDate','numberOfUnits','pricePerUnit','amount','obligationMonth','disbursementMonth')$a$);
      anchor:=$a$if field in ('numberOfUnits','pricePerUnit') then$a$;
      if position(anchor in definition)=0 then raise exception 'Unexpected Subproject target amount validation.'; end if;
      definition:=replace(definition,anchor,$a$if field in ('numberOfUnits','pricePerUnit','amount') then$a$);
      anchor:=$a$item_id !~ '^\d+$'$a$;
      if position(anchor in definition)=0 then raise exception 'Unexpected Subproject addition identity validation.'; end if;
      definition:=replace(definition,anchor,$a$item_id !~ '^-?[0-9]+$'$a$);
      anchor:=$a$'obligationMonth','disbursementMonth'$a$;
      if position(anchor in definition)=0 then raise exception 'Unexpected Subproject target allowlists.'; end if;
      definition:=replace(definition,anchor,$a$'obligationMonth','disbursementMonth','targetScheduleVersion','targetObligationSchedules','targetDisbursementSchedules'$a$);
      anchor:=$a$    adjustment_changed:=false;$a$;
      if position(anchor in definition)=0 then raise exception 'Unexpected Subproject adjustment merge boundary.'; end if;
      definition:=replace(definition,anchor,$a$    if old_line is not null then perform public.check_budget_target_conversion(old_line,line||values_patch,line); end if;
    adjustment_changed:=false;$a$);
      anchor:=$a$    if line is null or old_line is null then raise exception 'Target item changed.' using errcode='40001'; end if;$a$;
      if position(anchor in definition)=0 then raise exception 'Unexpected Subproject target merge boundary.'; end if;
      definition:=replace(definition,anchor,$a$    if line is null or old_line is null then raise exception 'Target item changed.' using errcode='40001'; end if;
    if item_id<>'$parent' then perform public.check_budget_target_conversion(old_line,line||values_patch,line); end if;$a$);
      anchor:=$a$elsif nullif(value#>>'{}','') is not null then perform (value#>>'{}')::date; end if;$a$;
      if position(anchor in definition)=0 then raise exception 'Unexpected Subproject target validation.'; end if;
      definition:=replace(definition,anchor,$a$elsif field in ('targetScheduleVersion','targetObligationSchedules','targetDisbursementSchedules') then null;
      elsif nullif(value#>>'{}','') is not null then perform (value#>>'{}')::date; end if;$a$);
    else
      anchor:=$a$    amount:=(line->>'amount')::numeric;$a$;
      if position(anchor in definition)=0 then raise exception 'Unexpected supplemental plan-edit boundary.'; end if;
      definition:=replace(definition,anchor,$a$    if p_operation in ('draft','submit') and (public.budget_target_plan(line)<>'{}'::jsonb or public.budget_target_plan(previous)<>'{}'::jsonb) then
      if not (coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'x-client-info','') ~ '(^|[[:space:]])4kis-target-plan/2([[:space:]]|$)') then
        raise exception 'This client cannot change structured targets. Refresh the application before saving.' using errcode='40001';
      end if;
      if public.budget_target_plan(previous)<>'{}'::jsonb and public.budget_target_plan(line)='{}'::jsonb then
        raise exception 'A structured target plan is missing from this stale supplemental draft. Refresh before saving.' using errcode='40001';
      end if;
    end if;
    amount:=(line->>'amount')::numeric;$a$);
      anchor:=$a$    if coalesce(line->>'obligationMonth','') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(line->>'disbursementMonth','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Select valid schedule months.' using errcode='22023'; end if;
    perform (line->>'obligationMonth')::date; perform (line->>'disbursementMonth')::date;$a$;
      if position(anchor in definition)=0 then raise exception 'Unexpected supplemental target validation.'; end if;
      definition:=replace(definition,anchor,$a$    if public.budget_target_plan(line)='{}'::jsonb then
      if coalesce(line->>'obligationMonth','') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(line->>'disbursementMonth','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Select valid schedule months.' using errcode='22023'; end if;
      perform (line->>'obligationMonth')::date; perform (line->>'disbursementMonth')::date;
    end if;$a$);
      anchor:=$a$'isSavings',source_value='Savings','isRealignment',source_value='Realignment','isCancelled',false,'adjustmentReason',reason_value);$a$;
      if position(anchor in definition)=0 then raise exception 'Unexpected supplemental serializer.'; end if;
      definition:=replace(definition,anchor,$a$'isSavings',source_value='Savings','isRealignment',source_value='Realignment','isCancelled',false,'adjustmentReason',reason_value)||public.budget_target_plan(line);$a$);
    end if;
    if definition=original or (name='save_activity_supplement' and position('public.budget_target_plan(line)' in definition)=0)
      or (name<>'save_activity_supplement' and position('targetObligationSchedules' in definition)=0) then
      raise exception 'Target compatibility replacement failed for %.',name;
    end if;
    definition:=replace(definition,E'\nBEGIN',E'\nBEGIN\n-- independent-target-schedules-v2');
    if position('-- independent-target-schedules-v2' in definition)=0 then
      definition:=replace(definition,E'\nbegin',E'\nbegin\n-- independent-target-schedules-v2');
    end if;
    if position('-- independent-target-schedules-v2' in definition)=0 then raise exception 'Function body marker could not be installed for %.',name; end if;
    execute definition;
  end loop;
end; $migration$;

create or replace function public.guard_budget_target_plan() returns trigger
language plpgsql set search_path=public,pg_temp as $$
declare field text; lines jsonb; prior jsonb; line jsonb; previous jsonb; plan jsonb; previous_plan jsonb;
  modern boolean; trusted boolean; changed boolean;
begin
  field:=case when tg_table_name='activities' then 'expenses' else 'details' end;
  lines:=to_jsonb(new)->field;
  prior:=case when tg_op='UPDATE' then to_jsonb(old)->field else '[]'::jsonb end;
  -- A protocol marker identifies a capable client; it grants no permission or status override.
  modern:=coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'x-client-info','') ~ '(^|[[:space:]])4kis-target-plan/2([[:space:]]|$)';
  trusted:=coalesce(current_setting('app.allow_budget_item_transfer_resolution',true),'')='on'
    or (tg_table_name='activities' and coalesce(current_setting('app.activity_supplement_write',true),'')='on');
  if lines is not null and lines<>'null'::jsonb and jsonb_typeof(lines)<>'array' and lines is distinct from prior then
    raise exception 'Budget items must be a list.' using errcode='22023';
  end if;
  if jsonb_typeof(lines)='array' then
    for line in select value from jsonb_array_elements(lines) loop
      plan:=public.budget_target_plan(line);
      if plan<>'{}'::jsonb then
        if coalesce(line->>'id','') !~ '^-?[0-9]+$' or abs((line->>'id')::numeric)>9007199254740991
          or (select count(*) from jsonb_array_elements(lines) owner where owner->>'id'=line->>'id')<>1 then
          raise exception 'Structured targets require a unique stable budget-item identity.' using errcode='22023';
        end if;
      end if;
      previous:=null;
      if jsonb_typeof(prior)='array' then select value into previous from jsonb_array_elements(prior) where value->>'id'=line->>'id'; end if;
      previous_plan:=public.budget_target_plan(previous);
      if previous_plan<>'{}'::jsonb and plan='{}'::jsonb then
        raise exception 'A structured target plan cannot be replaced with scalar targets. Refresh before saving.' using errcode='40001';
      end if;
      changed:=plan is distinct from previous_plan;
      if (plan<>'{}'::jsonb or previous_plan<>'{}'::jsonb) and not modern and not trusted
        and (changed or (previous is not null and (line->'amount' is distinct from previous->'amount'
          or line->'pricePerUnit' is distinct from previous->'pricePerUnit' or line->'numberOfUnits' is distinct from previous->'numberOfUnits'
          or line->'obligationMonth' is distinct from previous->'obligationMonth' or line->'disbursementMonth' is distinct from previous->'disbursementMonth'))) then
        raise exception 'This client cannot change structured targets. Refresh the application before saving.' using errcode='40001';
      end if;
    end loop;
  end if;
  if jsonb_typeof(prior)='array' then
    for previous in select value from jsonb_array_elements(prior) loop
      if public.budget_target_plan(previous)='{}'::jsonb then continue; end if;
      if not exists(select 1 from jsonb_array_elements(case when jsonb_typeof(lines)='array' then lines else '[]'::jsonb end) e where e->>'id'=previous->>'id')
        and not modern and not trusted then
        raise exception 'A structured budget item is missing from this stale draft. Refresh before saving.' using errcode='40001';
      end if;
    end loop;
  end if;
  return new;
end; $$;

drop trigger if exists guard_budget_target_plan on public.activities;
create trigger guard_budget_target_plan before insert or update on public.activities for each row execute function public.guard_budget_target_plan();
drop trigger if exists guard_budget_target_plan on public.subprojects;
create trigger guard_budget_target_plan before insert or update on public.subprojects for each row execute function public.guard_budget_target_plan();

create or replace function public.budget_target_schedule_capability() returns integer
language sql stable set search_path=public,pg_temp as $$ select 2; $$;
revoke all on function public.budget_target_schedule_capability() from public;
grant execute on function public.budget_target_schedule_capability() to anon,authenticated;

do $$
declare t text; signature jsonb; signatures jsonb:='{}';
begin
  for t in select jsonb_object_keys(current_setting('app.independent_targets_install_signatures')::jsonb) loop
    execute format('select jsonb_build_object(''count'',count(*),''digest'',md5(coalesce(string_agg(md5(to_jsonb(r)::text),'''' order by md5(to_jsonb(r)::text)),''''))) from public.%I r',t) into signature;
    signatures:=signatures||jsonb_build_object(t,signature);
  end loop;
  if signatures is distinct from current_setting('app.independent_targets_install_signatures')::jsonb then
    raise exception 'Existing business records changed during installation. Migration rolled back.';
  end if;
end; $$;
commit;
