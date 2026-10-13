-- Add display-only metadata and narrowly extend the reviewed transfer contract.
-- No backfill, business-row writes, folder changes or permission changes.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.activities add column if not exists activity_title text;
comment on column public.activities.activity_title is
  'Optional generic Activity display title. NULL uses name; Training continues using name. Not an identity or classification key.';

do $migration$
declare
  transfer_function regprocedure := to_regprocedure(
    'public.submit_budget_item_transfer(bigint,text,text,bigint,text[],jsonb,jsonb,jsonb,text,uuid)'
  );
  function_definition text;
  old_activity_fields constant text := $fields$'name','status','date','endDate','description','location','facilitator','participatingIpos','participating_ipo_ids','lat','lng'$fields$;
  corrected_activity_fields constant text := $fields$'name','activity_title','status','date','endDate','description','location','facilitator','participatingIpos','participating_ipo_ids','lat','lng'$fields$;
  occurrence_count integer;
begin
  if transfer_function is null then
    raise exception 'Apply the budget transfer and status correction prerequisites first.';
  end if;
  function_definition := pg_get_functiondef(transfer_function);
  occurrence_count := (length(function_definition) - length(replace(function_definition, old_activity_fields, ''))) / length(old_activity_fields);
  if occurrence_count = 0 and strpos(function_definition, corrected_activity_fields) > 0 then
    raise notice 'Optional activity title is already allowed; no function replacement required.';
    return;
  end if;
  if occurrence_count <> 1 then
    raise exception 'Activity transfer allowlist differs from the reviewed definition; refusing replacement.';
  end if;
  -- Preserve the deployed function body, signature, security configuration, owner and grants.
  execute replace(function_definition, old_activity_fields, corrected_activity_fields);
end;
$migration$;
commit;
