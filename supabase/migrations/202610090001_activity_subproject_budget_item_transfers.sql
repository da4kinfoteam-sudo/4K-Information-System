-- Additive schema and trusted transfer operations for Activity/Subproject budget lines.
-- This migration does not rewrite existing business records or execute any transfers.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Freeze writes briefly so concurrent user saves cannot invalidate the safety
-- comparison. Only hashes are retained; no production records are exported.
lock table public.subprojects, public.activities, public.financial_obligations,
  public.financial_disbursements, public.subproject_accomplishments,
  public.budget_item_adjustment_history in share row exclusive mode;

create temporary table budget_transfer_migration_baseline (
  table_name text primary key, row_count bigint, checksum text
) on commit drop;

do $$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'subprojects','activities','financial_obligations','financial_disbursements',
    'subproject_accomplishments','budget_item_adjustment_history'
  ] loop
    execute format(
      'insert into budget_transfer_migration_baseline select %L, count(*),
       md5(coalesce(string_agg(md5((to_jsonb(record_value) - ''isTransferTargetExcluded'' - ''budgetItemTransferId'')::text), '''' order by id), ''''))
       from public.%I record_value', relation_name, relation_name
    );
  end loop;
end;
$$;

alter table public.roles_config
  add column if not exists can_transfer_budget_items boolean not null default false;

update public.roles_config
set can_transfer_budget_items = true
where role = 'Super Admin'
  and module in ('Subprojects', 'Activities')
  and can_transfer_budget_items is distinct from true;

alter table public.subprojects
  add column if not exists "isTransferTargetExcluded" boolean default false,
  add column if not exists "budgetItemTransferId" uuid;

alter table public.activities
  add column if not exists "isTransferTargetExcluded" boolean default false,
  add column if not exists "budgetItemTransferId" uuid;

create table if not exists public.budget_item_transfers (
  id uuid primary key default gen_random_uuid(),
  request_key uuid not null,
  source_type text not null check (source_type in ('subproject', 'activity')),
  source_id bigint not null,
  destination_id bigint,
  selected_item_ids text[] not null,
  selected_items_snapshot jsonb not null,
  source_snapshot jsonb not null,
  source_actual_remainder jsonb not null default '{}'::jsonb,
  destination_actuals jsonb not null default '{}'::jsonb,
  destination_metadata jsonb not null default '{}'::jsonb,
  reason text not null,
  actor_id bigint not null references public.users(id) on delete restrict,
  actor_name text not null,
  assigned_approver_id bigint references public.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'applied', 'rejected')),
  resolved_by bigint references public.users(id) on delete set null,
  resolved_by_name text,
  resolution_reason text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (actor_id, request_key)
);

create index if not exists budget_item_transfers_source_idx
  on public.budget_item_transfers (source_type, source_id, created_at desc);
create index if not exists budget_item_transfers_destination_idx
  on public.budget_item_transfers (source_type, destination_id);

alter table public.budget_item_transfers enable row level security;
revoke all on public.budget_item_transfers from public, anon, authenticated;

-- The transfer log is intentionally not directly readable by application roles.
-- It stores immutable snapshots that can contain sensitive record details.
create or replace function public.insert_budget_item_transfer_parent(
  p_table_name text,
  p_record jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_relation regclass;
  insert_columns text;
  select_columns text;
  inserted_id bigint;
begin
  if p_table_name not in ('subprojects', 'activities') then
    raise exception using errcode = '22023', message = 'Unsupported transfer destination type.';
  end if;

  target_relation := to_regclass(format('public.%I', p_table_name));
  select
    string_agg(format('%I', column_info.attname), ', ' order by column_info.attnum),
    string_agg(format('record_value.%I', column_info.attname), ', ' order by column_info.attnum)
  into insert_columns, select_columns
  from pg_attribute column_info
  where column_info.attrelid = target_relation
    and column_info.attnum > 0
    and not column_info.attisdropped
    and column_info.attgenerated = ''
    and column_info.attidentity <> 'a'
    and column_info.attname <> 'id'
    and column_info.attname in (select jsonb_object_keys(coalesce(p_record, '{}'::jsonb)));

  if insert_columns is null then
    raise exception using errcode = '22023', message = 'The transfer destination has no insertable fields.';
  end if;

  execute format(
    'insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1) as record_value returning id',
    p_table_name,
    insert_columns,
    select_columns,
    p_table_name
  ) into inserted_id using p_record;

  return inserted_id;
end;
$$;

create or replace function public.apply_budget_item_transfer(
  p_transfer_id uuid,
  p_resolved_by bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  transfer_record public.budget_item_transfers%rowtype;
  source_record jsonb;
  current_source jsonb;
  source_lines jsonb;
  current_selected_lines jsonb;
  remaining_lines jsonb;
  source_history jsonb;
  source_updated jsonb;
  destination_record jsonb;
  line_record jsonb;
  line_id text;
  source_table text;
  financial_entity text;
  actual_keys text[];
  item_count integer;
  numeric_key text;
  source_row public.subprojects%rowtype;
  source_activity public.activities%rowtype;
  resolved_user public.users%rowtype;
begin
  select * into transfer_record
  from public.budget_item_transfers
  where id = p_transfer_id
  for update;

  if transfer_record.id is null then
    raise exception using errcode = 'P0002', message = 'Transfer request not found.';
  end if;
  if transfer_record.status = 'applied' then
    if transfer_record.source_type = 'subproject' then
      select to_jsonb(record_value) into current_source from public.subprojects record_value where id = transfer_record.source_id;
      select to_jsonb(record_value) into destination_record from public.subprojects record_value where id = transfer_record.destination_id;
    else
      select to_jsonb(record_value) into current_source from public.activities record_value where id = transfer_record.source_id;
      select to_jsonb(record_value) into destination_record from public.activities record_value where id = transfer_record.destination_id;
    end if;
    return jsonb_build_object('transfer_id', transfer_record.id, 'status', 'applied', 'source', current_source, 'destination', destination_record);
  end if;
  if transfer_record.status <> 'pending' then
    raise exception using errcode = '55000', message = 'This transfer request is no longer pending.';
  end if;

  select * into resolved_user from public.users where id = p_resolved_by;
  if resolved_user.id is null then
    raise exception using errcode = '42501', message = 'The approving user could not be verified.';
  end if;

  if transfer_record.source_type = 'subproject' then
    source_table := 'subprojects';
    financial_entity := 'subproject_detail';
    actual_keys := array['actualMaleBeneficiaries','actualFemaleBeneficiaries','actualFourPsBeneficiaries','actualPWD','actualMuslim','actualLGBTQ','actualSoloParent','actualSenior','actualYouth'];
    select * into source_row from public.subprojects where id = transfer_record.source_id for update;
    if source_row.id is null then raise exception using errcode = 'P0002', message = 'The source Subproject no longer exists.'; end if;
    source_record := to_jsonb(source_row);
    source_lines := coalesce(source_record->'details', '[]'::jsonb);
  else
    source_table := 'activities';
    financial_entity := 'activity_expense';
    actual_keys := array['actualParticipantsMale','actualParticipantsFemale','actualPWD','actualMuslim','actualLGBTQ','actualSoloParent','actualSenior','actualYouth'];
    select * into source_activity from public.activities where id = transfer_record.source_id for update;
    if source_activity.id is null then raise exception using errcode = 'P0002', message = 'The source Activity no longer exists.'; end if;
    source_record := to_jsonb(source_activity);
    source_lines := coalesce(source_record->'expenses', '[]'::jsonb);
  end if;

  if coalesce(source_record->>'status', '') = 'Cancelled'
    or coalesce(source_record->>'workflow_status', 'APPROVED') <> 'APPROVED' then
    raise exception using errcode = '55000', message = 'The source must remain active and approved when the transfer is finalized.';
  end if;
  if source_record->>'updated_at' is distinct from transfer_record.source_snapshot->>'updated_at' then
    raise exception using errcode = '40001', message = 'The source changed while this transfer was awaiting approval. Refresh the source and submit a new transfer.';
  end if;

  select count(*) into item_count
  from jsonb_array_elements(source_lines) as source_line(value)
  where source_line.value->>'id' = any(transfer_record.selected_item_ids);
  if item_count <> cardinality(transfer_record.selected_item_ids) then
    raise exception using errcode = '40001', message = 'One or more selected budget items changed or no longer exist.';
  end if;
  select coalesce(jsonb_agg(source_line.value order by source_line.ordinality), '[]'::jsonb)
  into current_selected_lines
  from jsonb_array_elements(source_lines) with ordinality as source_line(value, ordinality)
  where source_line.value->>'id' = any(transfer_record.selected_item_ids);
  if current_selected_lines is distinct from transfer_record.selected_items_snapshot then
    raise exception using errcode = '40001', message = 'One or more selected budget items changed while the transfer awaited approval. Refresh and submit a new request.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(source_lines) as source_line(value)
    where source_line.value->>'id' = any(transfer_record.selected_item_ids)
      and (coalesce((source_line.value->>'isCancelled')::boolean, false)
        or coalesce((source_line.value->>'isSuperseded')::boolean, false))
  ) then
    raise exception using errcode = '55000', message = 'Cancelled or replaced budget items cannot be transferred.';
  end if;

  select coalesce(jsonb_agg(source_line.value order by source_line.ordinality), '[]'::jsonb)
  into remaining_lines
  from jsonb_array_elements(source_lines) with ordinality as source_line(value, ordinality)
  where source_line.value->>'id' <> all(transfer_record.selected_item_ids);

  foreach numeric_key in array actual_keys loop
    if not (transfer_record.source_actual_remainder ? numeric_key)
      or not (transfer_record.destination_actuals ? numeric_key) then
      raise exception using errcode = '22023', message = format('%s must be allocated between source and destination.', numeric_key);
    end if;
    if coalesce((transfer_record.source_actual_remainder->>numeric_key)::numeric, 0) < 0 then
      raise exception using errcode = '22023', message = format('%s must be non-negative.', numeric_key);
    end if;
    if abs(
      coalesce((transfer_record.source_snapshot->>numeric_key)::numeric, 0)
      - coalesce((transfer_record.source_actual_remainder->>numeric_key)::numeric, 0)
      - coalesce((transfer_record.destination_actuals->>numeric_key)::numeric, 0)
    ) > 0.0001 then
      raise exception using errcode = '22023', message = format('%s must be allocated between the source and destination without changing the total.', numeric_key);
    end if;
  end loop;

  source_history := coalesce(source_record->'history', '[]'::jsonb)
    || jsonb_build_array(jsonb_build_object(
      'date', now(), 'event', 'Budget items transferred out', 'user', resolved_user."fullName",
      'transferId', transfer_record.id, 'destinationId', transfer_record.destination_id,
      'reason', transfer_record.reason
    ));
  source_updated := source_record || transfer_record.source_actual_remainder || jsonb_build_object(
    'updated_at', now(), 'history', source_history
  );

  perform set_config('app.allow_budget_item_transfer_resolution', 'on', true);
  if transfer_record.source_type = 'subproject' then
    source_updated := source_updated || jsonb_build_object('details', remaining_lines);
    source_row := jsonb_populate_record(null::public.subprojects, source_updated);
    update public.subprojects
    set details = source_row.details,
        "actualMaleBeneficiaries" = source_row."actualMaleBeneficiaries",
        "actualFemaleBeneficiaries" = source_row."actualFemaleBeneficiaries",
        "actualFourPsBeneficiaries" = source_row."actualFourPsBeneficiaries",
        "actualPWD" = source_row."actualPWD",
        "actualMuslim" = source_row."actualMuslim",
        "actualLGBTQ" = source_row."actualLGBTQ",
        "actualSoloParent" = source_row."actualSoloParent",
        "actualSenior" = source_row."actualSenior",
        "actualYouth" = source_row."actualYouth",
        history = source_row.history,
        updated_at = now()
    where id = transfer_record.source_id;
    update public.subprojects
    set workflow_status = 'APPROVED',
        "isTransferTargetExcluded" = true,
        history = coalesce(history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
          'date', now(), 'event', 'Budget items transferred in', 'user', resolved_user."fullName",
          'transferId', transfer_record.id, 'sourceId', transfer_record.source_id,
          'reason', transfer_record.reason
        )),
        updated_at = now()
    where id = transfer_record.destination_id;
  else
    source_updated := source_updated || jsonb_build_object('expenses', remaining_lines);
    source_activity := jsonb_populate_record(null::public.activities, source_updated);
    update public.activities
    set expenses = source_activity.expenses,
        "actualParticipantsMale" = source_activity."actualParticipantsMale",
        "actualParticipantsFemale" = source_activity."actualParticipantsFemale",
        "actualPWD" = source_activity."actualPWD",
        "actualMuslim" = source_activity."actualMuslim",
        "actualLGBTQ" = source_activity."actualLGBTQ",
        "actualSoloParent" = source_activity."actualSoloParent",
        "actualSenior" = source_activity."actualSenior",
        "actualYouth" = source_activity."actualYouth",
        history = source_activity.history,
        updated_at = now()
    where id = transfer_record.source_id;
    update public.activities
    set workflow_status = 'APPROVED',
        "isTransferTargetExcluded" = true,
        history = coalesce(history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
          'date', now(), 'event', 'Budget items transferred in', 'user', resolved_user."fullName",
          'transferId', transfer_record.id, 'sourceId', transfer_record.source_id,
          'reason', transfer_record.reason
        )),
        updated_at = now()
    where id = transfer_record.destination_id;
  end if;

  update public.financial_obligations
  set parent_id = transfer_record.destination_id
  where entity_type = financial_entity
    and parent_id = transfer_record.source_id
    and item_id = any(transfer_record.selected_item_ids);

  update public.financial_disbursements
  set parent_id = transfer_record.destination_id
  where entity_type = financial_entity
    and parent_id = transfer_record.source_id
    and item_id = any(transfer_record.selected_item_ids);

  if transfer_record.source_type = 'subproject' then
    update public.subproject_accomplishments
    set subproject_id = transfer_record.destination_id
    where subproject_id = transfer_record.source_id
      and detail_id::text = any(transfer_record.selected_item_ids);
  end if;

  for line_record in select value from jsonb_array_elements(transfer_record.selected_items_snapshot) loop
    line_id := line_record->>'id';
    insert into public.budget_item_adjustment_history (
      source_type, parent_id, item_id, action, source_item_id,
      before_snapshot, after_snapshot, reason, created_by, created_by_name, created_at
    ) values (
      case when transfer_record.source_type = 'subproject' then 'subproject_detail' else 'activity_expense' end,
      transfer_record.source_id, line_id, 'transfer_out', line_id,
      line_record, null, transfer_record.reason, resolved_user.username, resolved_user."fullName", now()
    );
    insert into public.budget_item_adjustment_history (
      source_type, parent_id, item_id, action, source_item_id,
      before_snapshot, after_snapshot, reason, created_by, created_by_name, created_at
    ) values (
      case when transfer_record.source_type = 'subproject' then 'subproject_detail' else 'activity_expense' end,
      transfer_record.destination_id, line_id, 'transfer_in', line_id,
      null, line_record, transfer_record.reason, resolved_user.username, resolved_user."fullName", now()
    );
  end loop;

  update public.budget_item_transfers
  set status = 'applied', resolved_by = resolved_user.id,
      resolved_by_name = resolved_user."fullName", resolved_at = now()
  where id = transfer_record.id;

  if transfer_record.source_type = 'subproject' then
    select to_jsonb(record_value) into current_source from public.subprojects record_value where id = transfer_record.source_id;
    select to_jsonb(record_value) into destination_record from public.subprojects record_value where id = transfer_record.destination_id;
  else
    select to_jsonb(record_value) into current_source from public.activities record_value where id = transfer_record.source_id;
    select to_jsonb(record_value) into destination_record from public.activities record_value where id = transfer_record.destination_id;
  end if;
  return jsonb_build_object('transfer_id', transfer_record.id, 'status', 'applied', 'source', current_source, 'destination', destination_record);
end;
$$;

create or replace function public.submit_budget_item_transfer(
  p_actor_id bigint,
  p_actor_password text,
  p_source_type text,
  p_source_id bigint,
  p_selected_item_ids text[],
  p_destination_metadata jsonb,
  p_destination_actuals jsonb,
  p_source_actual_remainder jsonb,
  p_reason text,
  p_request_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor public.users%rowtype;
  role_permission public.roles_config%rowtype;
  existing_transfer public.budget_item_transfers%rowtype;
  source_row public.subprojects%rowtype;
  activity_row public.activities%rowtype;
  source_record jsonb;
  source_lines jsonb;
  selected_lines jsonb;
  destination_record jsonb;
  source_table text;
  module_name text;
  item_column text;
  transfer_id uuid;
  new_destination_id bigint;
  role_scope text;
  allowed_edit boolean;
  allowed_transfer boolean;
  override_value jsonb;
  destination_ou text;
  actor_requires_approver boolean;
  metadata_key text;
  metadata_allowlist text[];
  actual_keys text[];
  selected_count integer;
  matching_count integer;
  original_actual numeric;
  destination_actual numeric;
  source_remainder numeric;
  actual_key text;
  new_uid text;
  history_event jsonb;
begin
  if p_source_type not in ('subproject', 'activity') then
    raise exception using errcode = '22023', message = 'Transfers are supported only for Subprojects and Activities.';
  end if;
  if p_source_id is null or p_source_id <= 0 or p_request_key is null then
    raise exception using errcode = '22023', message = 'The source or request identity is invalid.';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception using errcode = '22023', message = 'A transfer reason is required.';
  end if;
  if coalesce(array_length(p_selected_item_ids, 1), 0) < 1
    or exists (select 1 from unnest(p_selected_item_ids) selected_id where nullif(btrim(selected_id), '') is null)
    or cardinality(p_selected_item_ids) <> (select count(distinct btrim(selected_id)) from unnest(p_selected_item_ids) selected_id) then
    raise exception using errcode = '22023', message = 'Select one or more unique budget items.';
  end if;

  select * into actor from public.users where id = p_actor_id for share;
  if actor.id is null then
    raise exception using errcode = '42501', message = 'Please sign in again before transferring budget items.';
  end if;
  if auth.uid() is not null then
    if actor.auth_id is distinct from auth.uid() then
      raise exception using errcode = '42501', message = 'The signed-in user does not match this request.';
    end if;
  elsif nullif(p_actor_password, '') is null or actor.password is distinct from p_actor_password then
    raise exception using errcode = '42501', message = 'Please sign in again before transferring budget items.';
  end if;

  module_name := case when p_source_type = 'subproject' then 'Subprojects' else 'Activities' end;
  select * into role_permission from public.roles_config where role = actor.role and module = module_name limit 1;
  override_value := actor.permissions_override -> module_name -> 'can_transfer_budget_items';
  allowed_transfer := actor.role = 'Super Admin'
    or case
      when jsonb_typeof(override_value) = 'boolean' then (override_value #>> '{}')::boolean
      else coalesce(role_permission.can_transfer_budget_items, false)
    end;
  if not allowed_transfer then
    raise exception using errcode = '42501', message = 'You do not have permission to transfer budget items.';
  end if;

  if actor.role in ('Super Admin', 'Administrator') then
    allowed_edit := true;
  elsif actor.role = 'Guest' then
    allowed_edit := false;
  else
    override_value := actor.permissions_override -> module_name -> 'can_edit';
    if jsonb_typeof(override_value) = 'boolean' then
      allowed_edit := (override_value #>> '{}')::boolean;
    else
      allowed_edit := coalesce(role_permission.can_edit, false);
    end if;
  end if;
  if not allowed_edit then
    raise exception using errcode = '42501', message = 'You also need edit permission for this module.';
  end if;

  role_scope := case
    when actor.visibility_scope in ('All OUs', 'Own OU') then actor.visibility_scope
    when role_permission.visibility_scope in ('All OUs', 'Own OU') then role_permission.visibility_scope
    when actor.role in ('Super Admin', 'Administrator', 'Management') then 'All OUs'
    else 'Own OU'
  end;

  if p_source_type = 'subproject' then
    source_table := 'subprojects';
    item_column := 'details';
    actual_keys := array['actualMaleBeneficiaries','actualFemaleBeneficiaries','actualFourPsBeneficiaries','actualPWD','actualMuslim','actualLGBTQ','actualSoloParent','actualSenior','actualYouth'];
    metadata_allowlist := array[
      'name','location','indigenousPeopleOrganization','ipo_id','status','packageType','startDate','estimatedCompletionDate','actualCompletionDate',
      'lat','lng','fundingYear','fundType','fundSource','fundSourceUid','tier','operatingUnit','remarks','accomplishmentRemarks',
      'catchUpPlanRemarks','newTargetCompletionDate','subprojectCommodities'
    ];
    select * into source_row from public.subprojects where id = p_source_id for update;
    if source_row.id is null then raise exception using errcode = 'P0002', message = 'Source Subproject not found.'; end if;
    source_record := to_jsonb(source_row);
  else
    source_table := 'activities';
    item_column := 'expenses';
    actual_keys := array['actualParticipantsMale','actualParticipantsFemale','actualPWD','actualMuslim','actualLGBTQ','actualSoloParent','actualSenior','actualYouth'];
    metadata_allowlist := array[
      'name','date','endDate','description','location','facilitator','participatingIpos','participating_ipo_ids','lat','lng',
      'participantsMale','participantsFemale','component','actualDate','actualEndDate','fundingYear','fundType','fundSource','fundSourceUid',
      'tier','operatingUnit','catchUpPlanRemarks','newTargetDate','remarks'
    ];
    select * into activity_row from public.activities where id = p_source_id for update;
    if activity_row.id is null then raise exception using errcode = 'P0002', message = 'Source Activity not found.'; end if;
    source_record := to_jsonb(activity_row);
  end if;

  destination_ou := coalesce(p_destination_metadata->>'operatingUnit', source_record->>'operatingUnit');
  if role_scope <> 'All OUs' and source_record->>'operatingUnit' is distinct from actor."operatingUnit" then
    raise exception using errcode = '42501', message = 'The source record is outside your Operating Unit scope.';
  end if;
  if role_scope <> 'All OUs' and destination_ou is distinct from source_record->>'operatingUnit' then
    raise exception using errcode = '42501', message = 'You cannot transfer a record to a different Operating Unit.';
  end if;

  select * into existing_transfer
  from public.budget_item_transfers
  where actor_id = actor.id and request_key = p_request_key;
  if existing_transfer.id is not null then
    if existing_transfer.source_type is distinct from p_source_type
      or existing_transfer.source_id is distinct from p_source_id
      or existing_transfer.selected_item_ids is distinct from p_selected_item_ids
      or existing_transfer.destination_metadata is distinct from coalesce(p_destination_metadata, '{}'::jsonb)
      or existing_transfer.destination_actuals is distinct from coalesce(p_destination_actuals, '{}'::jsonb)
      or existing_transfer.source_actual_remainder is distinct from coalesce(p_source_actual_remainder, '{}'::jsonb)
      or existing_transfer.reason is distinct from btrim(p_reason) then
      raise exception using errcode = '22023', message = 'This request key was already used for a different transfer. Refresh and submit again.';
    end if;
    if existing_transfer.source_type = 'subproject' then
      select to_jsonb(row_value) into source_record from public.subprojects row_value where id = existing_transfer.source_id;
      select to_jsonb(row_value) into destination_record from public.subprojects row_value where id = existing_transfer.destination_id;
    else
      select to_jsonb(row_value) into source_record from public.activities row_value where id = existing_transfer.source_id;
      select to_jsonb(row_value) into destination_record from public.activities row_value where id = existing_transfer.destination_id;
    end if;
    return jsonb_build_object('transfer_id', existing_transfer.id, 'status', existing_transfer.status, 'source', source_record, 'destination', destination_record);
  end if;

  if source_record->>'status' = 'Cancelled' then
    raise exception using errcode = '55000', message = 'Cancelled source records cannot be transferred.';
  end if;
  if coalesce(source_record->>'workflow_status', 'APPROVED') <> 'APPROVED' then
    raise exception using errcode = '55000', message = 'Only approved source records can be transferred.';
  end if;
  if jsonb_typeof(coalesce(source_record->item_column, '[]'::jsonb)) <> 'array' then
    raise exception using errcode = '22023', message = 'The source budget items are not in a valid format.';
  end if;
  if jsonb_typeof(coalesce(p_destination_metadata, '{}'::jsonb)) <> 'object'
    or jsonb_typeof(coalesce(p_destination_actuals, '{}'::jsonb)) <> 'object'
    or jsonb_typeof(coalesce(p_source_actual_remainder, '{}'::jsonb)) <> 'object' then
    raise exception using errcode = '22023', message = 'Transfer metadata and actual allocations must be objects.';
  end if;
  for metadata_key in select jsonb_object_keys(coalesce(p_destination_metadata, '{}'::jsonb)) loop
    if not metadata_key = any(metadata_allowlist) then
      raise exception using errcode = '22023', message = format('Destination field %s cannot be edited in a transfer.', metadata_key);
    end if;
  end loop;
  for metadata_key in select jsonb_object_keys(coalesce(p_destination_actuals, '{}'::jsonb)) loop
    if not metadata_key = any(actual_keys) then
      raise exception using errcode = '22023', message = format('Parent actual field %s cannot be allocated in a transfer.', metadata_key);
    end if;
  end loop;
  for metadata_key in select jsonb_object_keys(coalesce(p_source_actual_remainder, '{}'::jsonb)) loop
    if not metadata_key = any(actual_keys) then
      raise exception using errcode = '22023', message = format('Source actual field %s cannot be allocated in a transfer.', metadata_key);
    end if;
  end loop;
  foreach actual_key in array actual_keys loop
    if not (coalesce(p_destination_actuals, '{}'::jsonb) ? actual_key)
      or not (coalesce(p_source_actual_remainder, '{}'::jsonb) ? actual_key) then
      raise exception using errcode = '22023', message = format('%s must be allocated between source and destination.', actual_key);
    end if;
  end loop;
  if coalesce(p_destination_metadata->>'status', source_record->>'status') not in ('Proposed','Ongoing','Completed') then
    raise exception using errcode = '22023', message = 'The destination must be Proposed, Ongoing, or Completed.';
  end if;
  if p_source_type = 'activity'
    and coalesce(p_destination_metadata->>'type', source_record->>'type') <> source_record->>'type' then
    raise exception using errcode = '22023', message = 'A transfer must preserve the source Activity subtype.';
  end if;

  source_lines := source_record->item_column;
  select count(*) into selected_count from unnest(p_selected_item_ids) selected_id where nullif(btrim(selected_id), '') is not null;
  select count(*) into matching_count
  from jsonb_array_elements(source_lines) as source_line(value)
  where source_line.value->>'id' = any(p_selected_item_ids);
  if matching_count <> selected_count then
    raise exception using errcode = '40001', message = 'One or more selected budget items changed or no longer exist.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(source_lines) as source_line(value)
    where source_line.value->>'id' = any(p_selected_item_ids)
      and (coalesce((source_line.value->>'isCancelled')::boolean, false)
        or coalesce((source_line.value->>'isSuperseded')::boolean, false))
  ) then
    raise exception using errcode = '55000', message = 'Cancelled or replaced budget items cannot be transferred.';
  end if;
  if exists (
    select 1 from public.budget_item_transfers pending_transfer
    where pending_transfer.source_type = p_source_type
      and pending_transfer.source_id = p_source_id
      and pending_transfer.status = 'pending'
      and pending_transfer.selected_item_ids && p_selected_item_ids
  ) then
    raise exception using errcode = '55000', message = 'One or more selected items already have a pending transfer request.';
  end if;
  select coalesce(jsonb_agg(source_line.value order by source_line.ordinality), '[]'::jsonb)
  into selected_lines
  from jsonb_array_elements(source_lines) with ordinality as source_line(value, ordinality)
  where source_line.value->>'id' = any(p_selected_item_ids);

  foreach actual_key in array actual_keys loop
    original_actual := coalesce((source_record->>actual_key)::numeric, 0);
    destination_actual := coalesce((p_destination_actuals->>actual_key)::numeric, 0);
    source_remainder := coalesce((p_source_actual_remainder->>actual_key)::numeric, 0);
    if destination_actual < 0 or source_remainder < 0
      or trunc(destination_actual) <> destination_actual
      or trunc(source_remainder) <> source_remainder then
      raise exception using errcode = '22023', message = format('%s must use non-negative whole-number counts.', actual_key);
    end if;
    if abs(original_actual - destination_actual - source_remainder) > 0.0001 then
      raise exception using errcode = '22023', message = format('%s must be allocated between source and destination without changing the total.', actual_key);
    end if;
  end loop;

  insert into public.budget_item_transfers (
    request_key, source_type, source_id, selected_item_ids, selected_items_snapshot,
    source_snapshot, source_actual_remainder, destination_actuals, destination_metadata,
    reason, actor_id, actor_name, assigned_approver_id
  ) values (
    p_request_key, p_source_type, p_source_id, p_selected_item_ids, selected_lines,
    source_record, coalesce(p_source_actual_remainder, '{}'::jsonb), coalesce(p_destination_actuals, '{}'::jsonb),
    coalesce(p_destination_metadata, '{}'::jsonb), btrim(p_reason), actor.id, actor."fullName",
    case when coalesce(actor.requires_approver, false) then actor.approver_id else null end
  ) returning id into transfer_id;

  if p_source_type = 'activity' then
    foreach actual_key in array array['participantsMale','participantsFemale'] loop
      if coalesce((p_destination_metadata->>actual_key)::numeric, 0) < 0
        or trunc(coalesce((p_destination_metadata->>actual_key)::numeric, 0)) <> coalesce((p_destination_metadata->>actual_key)::numeric, 0) then
        raise exception using errcode = '22023', message = format('%s must be a non-negative whole number.', actual_key);
      end if;
    end loop;
  end if;
  if p_destination_metadata ? 'lat' and p_destination_metadata->>'lat' is not null
    and ((p_destination_metadata->>'lat')::numeric < -90 or (p_destination_metadata->>'lat')::numeric > 90) then
    raise exception using errcode = '22023', message = 'Latitude must be between -90 and 90.';
  end if;
  if p_destination_metadata ? 'lng' and p_destination_metadata->>'lng' is not null
    and ((p_destination_metadata->>'lng')::numeric < -180 or (p_destination_metadata->>'lng')::numeric > 180) then
    raise exception using errcode = '22023', message = 'Longitude must be between -180 and 180.';
  end if;

  new_uid := case when p_source_type = 'subproject' then 'SP-TFR-' else 'ACT-TFR-' end
    || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  history_event := jsonb_build_array(jsonb_build_object(
    'date', now(), 'event', 'Created by budget item transfer', 'user', actor."fullName",
    'transferId', transfer_id, 'sourceId', p_source_id
  ));
  destination_record := (source_record - 'id' - 'uid' - 'created_at' - 'updated_at' - 'workflow_status')
    || coalesce(p_destination_metadata, '{}'::jsonb)
    || coalesce(p_destination_actuals, '{}'::jsonb)
    || jsonb_build_object(
      'uid', new_uid,
      item_column, selected_lines,
      'isTransferTargetExcluded', true,
      'budgetItemTransferId', transfer_id,
      'workflow_status', case when coalesce(actor.requires_approver, false) then 'PENDING' else 'APPROVED' end,
      'encodedBy', actor."fullName",
      'history', history_event,
      'updated_at', now()
    );
  destination_record := destination_record - 'id' - 'created_at';
  perform set_config('app.allow_budget_item_transfer_resolution', 'on', true);
  new_destination_id := public.insert_budget_item_transfer_parent(source_table, destination_record);

  update public.budget_item_transfers
  set destination_id = new_destination_id
  where id = transfer_id;

  if not coalesce(actor.requires_approver, false) then
    perform public.apply_budget_item_transfer(transfer_id, actor.id);
  end if;

  select * into existing_transfer from public.budget_item_transfers where id = transfer_id;
  if p_source_type = 'subproject' then
    select to_jsonb(row_value) into source_record from public.subprojects row_value where id = p_source_id;
    select to_jsonb(row_value) into destination_record from public.subprojects row_value where id = new_destination_id;
  else
    select to_jsonb(row_value) into source_record from public.activities row_value where id = p_source_id;
    select to_jsonb(row_value) into destination_record from public.activities row_value where id = new_destination_id;
  end if;
  return jsonb_build_object('transfer_id', transfer_id, 'status', existing_transfer.status, 'source', source_record, 'destination', destination_record);
end;
$$;

create or replace function public.resolve_budget_item_transfer(
  p_actor_id bigint,
  p_actor_password text,
  p_transfer_id uuid,
  p_decision text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor public.users%rowtype;
  role_permission public.roles_config%rowtype;
  transfer_record public.budget_item_transfers%rowtype;
  source_record jsonb;
  destination_record jsonb;
  module_name text;
  role_scope text;
  source_ou text;
  override_value jsonb;
  can_view boolean;
begin
  if p_decision not in ('approve', 'reject') then
    raise exception using errcode = '22023', message = 'Choose approve or reject.';
  end if;
  select * into actor from public.users where id = p_actor_id for share;
  if actor.id is null then
    raise exception using errcode = '42501', message = 'Please sign in again before resolving transfer requests.';
  end if;
  if auth.uid() is not null then
    if actor.auth_id is distinct from auth.uid() then
      raise exception using errcode = '42501', message = 'The signed-in user does not match this request.';
    end if;
  elsif nullif(p_actor_password, '') is null or actor.password is distinct from p_actor_password then
    raise exception using errcode = '42501', message = 'Please sign in again before resolving transfer requests.';
  end if;
  if actor.role not in ('Super Admin', 'Administrator', 'Focal - User', 'Management') then
    raise exception using errcode = '42501', message = 'You are not authorized to resolve transfer requests.';
  end if;
  select * into transfer_record from public.budget_item_transfers where id = p_transfer_id for update;
  if transfer_record.id is null then raise exception using errcode = 'P0002', message = 'Transfer request not found.'; end if;
  if transfer_record.status <> 'pending' then
    raise exception using errcode = '55000', message = 'This transfer request has already been resolved.';
  end if;
  if transfer_record.assigned_approver_id is not null and transfer_record.assigned_approver_id <> actor.id then
    raise exception using errcode = '42501', message = 'This transfer is assigned to a different approver.';
  end if;

  module_name := case when transfer_record.source_type = 'subproject' then 'Subprojects' else 'Activities' end;
  select * into role_permission from public.roles_config where role = actor.role and module = module_name limit 1;
  if actor.role not in ('Super Admin', 'Administrator') then
    override_value := actor.permissions_override -> module_name -> 'can_view';
    can_view := case
      when jsonb_typeof(override_value) = 'boolean' then (override_value #>> '{}')::boolean
      else coalesce(role_permission.can_view, true)
    end;
    if not can_view then
      raise exception using errcode = '42501', message = 'You do not have view access to this transfer module.';
    end if;
  end if;

  role_scope := case
    when actor.visibility_scope in ('All OUs', 'Own OU') then actor.visibility_scope
    when role_permission.visibility_scope in ('All OUs', 'Own OU') then role_permission.visibility_scope
    when actor.role in ('Super Admin', 'Administrator', 'Management') then 'All OUs'
    else 'Own OU'
  end;
  if transfer_record.source_type = 'subproject' then
    select "operatingUnit" into source_ou from public.subprojects where id = transfer_record.source_id;
  else
    select "operatingUnit" into source_ou from public.activities where id = transfer_record.source_id;
  end if;
  if role_scope <> 'All OUs' and source_ou is distinct from actor."operatingUnit" then
    raise exception using errcode = '42501', message = 'The source record is outside your Operating Unit scope.';
  end if;

  if p_decision = 'approve' then
    return public.apply_budget_item_transfer(p_transfer_id, actor.id);
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception using errcode = '22023', message = 'A rejection reason is required.';
  end if;

  perform set_config('app.allow_budget_item_transfer_resolution', 'on', true);
  if transfer_record.source_type = 'subproject' then
    perform set_config('app.allow_budget_item_transfer_resolution', 'on', true);
    update public.subprojects
    set workflow_status = 'REJECTED',
        history = coalesce(history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
          'date', now(), 'event', 'Budget item transfer rejected', 'user', actor."fullName",
          'transferId', transfer_record.id, 'sourceId', transfer_record.source_id,
          'reason', btrim(p_reason)
        )),
        updated_at = now()
    where id = transfer_record.destination_id;
    select to_jsonb(row_value) into source_record from public.subprojects row_value where id = transfer_record.source_id;
    select to_jsonb(row_value) into destination_record from public.subprojects row_value where id = transfer_record.destination_id;
  else
    perform set_config('app.allow_budget_item_transfer_resolution', 'on', true);
    update public.activities
    set workflow_status = 'REJECTED',
        history = coalesce(history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
          'date', now(), 'event', 'Budget item transfer rejected', 'user', actor."fullName",
          'transferId', transfer_record.id, 'sourceId', transfer_record.source_id,
          'reason', btrim(p_reason)
        )),
        updated_at = now()
    where id = transfer_record.destination_id;
    select to_jsonb(row_value) into source_record from public.activities row_value where id = transfer_record.source_id;
    select to_jsonb(row_value) into destination_record from public.activities row_value where id = transfer_record.destination_id;
  end if;
  update public.budget_item_transfers
  set status = 'rejected', resolved_by = actor.id, resolved_by_name = actor."fullName",
      resolution_reason = btrim(p_reason), resolved_at = now()
  where id = p_transfer_id;
  return jsonb_build_object('transfer_id', p_transfer_id, 'status', 'rejected', 'source', source_record, 'destination', destination_record);
end;
$$;

create or replace function public.guard_pending_budget_item_transfer()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  transfer_id uuid;
  transfer_status text;
begin
  if current_setting('app.allow_budget_item_transfer_resolution', true) = 'on' then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if tg_op = 'INSERT' then
    if coalesce(new."isTransferTargetExcluded", false) or new."budgetItemTransferId" is not null then
      raise exception using errcode = '42501', message = 'Transfer destination classification can only be set by the transfer operation.';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    transfer_id := old."budgetItemTransferId";
    if transfer_id is null then return old; end if;
    select status into transfer_status from public.budget_item_transfers where id = transfer_id;
    if transfer_status in ('pending', 'applied') then
      raise exception using errcode = '42501', message = 'Pending or applied transfer destinations cannot be deleted directly.';
    end if;
    return old;
  end if;

  transfer_id := old."budgetItemTransferId";
  if transfer_id is null then
    if coalesce(new."isTransferTargetExcluded", false) or new."budgetItemTransferId" is not null then
      raise exception using errcode = '42501', message = 'Transfer destination classification can only be set by the transfer operation.';
    end if;
    return new;
  end if;

  select status into transfer_status from public.budget_item_transfers where id = transfer_id;
  if transfer_status = 'pending' then
    raise exception using errcode = '42501', message = 'Pending transfer destinations cannot be edited directly.';
  end if;
  if transfer_status is null
    or new."isTransferTargetExcluded" is distinct from old."isTransferTargetExcluded"
    or new."budgetItemTransferId" is distinct from old."budgetItemTransferId" then
    raise exception using errcode = '42501', message = 'Transfer destination classification is immutable.';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_subproject_budget_item_transfer on public.subprojects;
create trigger guard_subproject_budget_item_transfer
before insert or update or delete on public.subprojects
for each row execute function public.guard_pending_budget_item_transfer();

drop trigger if exists guard_activity_budget_item_transfer on public.activities;
create trigger guard_activity_budget_item_transfer
before insert or update or delete on public.activities
for each row execute function public.guard_pending_budget_item_transfer();

alter table public.budget_item_adjustment_history
  drop constraint if exists budget_item_adjustment_history_action_check;
alter table public.budget_item_adjustment_history
  add constraint budget_item_adjustment_history_action_check
  check (action in (
    'cancel','restore','tag_realignment','tag_savings','clear_tag','create_adjustment_item',
    'edit_adjustment_item','delete_adjustment_item','replace_item','deactivate_adjustment_item',
    'funding_source_changed','update_accomplishment_remarks','transfer_out','transfer_in'
  )) not valid;

revoke all on function public.insert_budget_item_transfer_parent(text, jsonb) from public, anon, authenticated;
revoke all on function public.apply_budget_item_transfer(uuid, bigint) from public, anon, authenticated;
revoke all on function public.submit_budget_item_transfer(bigint, text, text, bigint, text[], jsonb, jsonb, jsonb, text, uuid) from public, anon;
revoke all on function public.resolve_budget_item_transfer(bigint, text, uuid, text, text) from public, anon;
revoke all on function public.guard_pending_budget_item_transfer() from public, anon, authenticated;
grant execute on function public.submit_budget_item_transfer(bigint, text, text, bigint, text[], jsonb, jsonb, jsonb, text, uuid) to anon, authenticated;
grant execute on function public.resolve_budget_item_transfer(bigint, text, uuid, text, text) to anon, authenticated;

do $$
declare
  baseline record;
  current_count bigint;
  current_checksum text;
begin
  for baseline in select * from budget_transfer_migration_baseline loop
    execute format(
      'select count(*), md5(coalesce(string_agg(md5((to_jsonb(record_value) - ''isTransferTargetExcluded'' - ''budgetItemTransferId'')::text), '''' order by id), ''''))
       from public.%I record_value', baseline.table_name
    ) into current_count, current_checksum;
    if current_count is distinct from baseline.row_count
      or current_checksum is distinct from baseline.checksum then
      raise exception 'Migration changed existing % business records; rolling back.', baseline.table_name;
    end if;
  end loop;
  raise notice 'Verified: existing business-record counts and checksums are unchanged.';
end;
$$;

commit;
