-- Function-only correction; no transfers, backfills, or business-row mutations.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $migration$
declare
  transfer_function regprocedure := to_regprocedure(
    'public.submit_budget_item_transfer(bigint,text,text,bigint,text[],jsonb,jsonb,jsonb,text,uuid)'
  );
  function_definition text;
  old_activity_fields constant text := $fields$'name','date','endDate','description','location','facilitator','participatingIpos','participating_ipo_ids','lat','lng'$fields$;
  corrected_activity_fields constant text := $fields$'name','status','date','endDate','description','location','facilitator','participatingIpos','participating_ipo_ids','lat','lng'$fields$;
  occurrence_count integer;
begin
  if transfer_function is null then
    raise exception 'The budget transfer function is missing; apply its prerequisite migration first.';
  end if;

  function_definition := pg_get_functiondef(transfer_function);
  occurrence_count := (
    length(function_definition)
    - length(replace(function_definition, old_activity_fields, ''))
  ) / length(old_activity_fields);

  if occurrence_count = 0 and strpos(function_definition, corrected_activity_fields) > 0 then
    raise notice 'Activity transfer status is already allowed; no function change required.';
    return;
  end if;
  if occurrence_count <> 1 then
    raise exception 'The Activity transfer allowlist differs from the reviewed definition; refusing an unverified replacement.';
  end if;

  -- CREATE OR REPLACE retains the signature, owner and existing grants. The
  -- rest of the deployed body, including Completed eligibility, stays intact.
  execute replace(function_definition, old_activity_fields, corrected_activity_fields);
  raise notice 'Activity/Training transfer metadata now accepts the validated status field. Existing business records are untouched.';
end;
$migration$;

commit;
