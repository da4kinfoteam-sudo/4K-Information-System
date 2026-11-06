-- Local preparation only. Requires the real trash_bin schema and revisions 0001-0003.
-- No legacy archive backfill, business DML, baseline, or remote-file operation.
begin;
set local lock_timeout='5s';
set local statement_timeout='90s';

create table if not exists public.dcf_archive_evidence(
  trash_id bigint primary key,entity_type text not null,parent_id bigint not null,
  delete_operation_id uuid not null,archived_record jsonb not null,source_snapshot jsonb not null,
  children jsonb not null,financial_state jsonb not null,actor_id bigint not null,
  captured_at timestamptz not null default clock_timestamp()
);
create table if not exists public.dcf_archive_recoveries(
  operation_id uuid primary key,trash_id bigint not null unique references public.dcf_archive_evidence(trash_id),
  entity_type text not null,parent_id bigint not null,incarnation uuid not null,
  deleted_revision_id bigint not null references public.dcf_record_revisions(id),
  result_revision_id bigint references public.dcf_record_revisions(id),actor_id bigint not null,
  transaction_id bigint not null,created_at timestamptz not null default clock_timestamp()
);
alter table public.dcf_archive_evidence enable row level security;
alter table public.dcf_archive_recoveries enable row level security;
revoke all on public.dcf_archive_evidence,public.dcf_archive_recoveries from public,anon,authenticated;

create or replace function public.dcf_archive_type(p_type text) returns text
language sql immutable set search_path=public,pg_temp as $$
  select case p_type when 'activity' then 'activities' when 'subproject' then 'subprojects'
    when 'office_requirement' then 'office_requirements' when 'staffing_requirement' then 'staffing_requirements'
    when 'other_program_expense' then 'other_program_expenses' end
$$;

create or replace function public.dcf_archive_children(p_type text,p_id bigint) returns jsonb
language plpgsql security definer set search_path=public,pg_temp set timezone='UTC' as $$
declare n text; result jsonb:='{}'; value_rows jsonb; begin
  foreach n in array case p_type when 'subprojects' then
    array['subproject_drive_folders','subproject_drive_files','subproject_accomplishments']
    when 'activities' then array['activity_drive_folders','activity_drive_files','activity_monitoring_reports','activity_monitoring_actions']
    else array[]::text[] end loop
    if n='activity_monitoring_actions' then
      select coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]') into value_rows
      from public.activity_monitoring_actions a join public.activity_monitoring_reports r on r.id=a.monitoring_report_id where r.activity_id=p_id;
    else
      execute format('select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)->>''id''),''[]'') from public.%I r where %I=$1',n,
        case when p_type='subprojects' then 'subproject_id' else 'activity_id' end) into value_rows using p_id;
    end if;
    result:=result||jsonb_build_object(n,value_rows);
  end loop;
  return result;
end $$;

-- Capture while the authoritative parent and cascade-owned children still exist.
-- A browser-submitted trash JSON is never sufficient recovery provenance.
create or replace function public.dcf_capture_archive_evidence() returns trigger
language plpgsql security definer set search_path=public,pg_temp set timezone='UTC' as $$
declare t text:=public.dcf_archive_type(new.entity_type); r jsonb; c public.dcf_revision_context%rowtype; states jsonb; begin
  if t is null then return new; end if;
  select * into c from public.dcf_revision_context where transaction_id=txid_current();
  if c.source is distinct from 'delete' or c.actor_id is null then
    raise exception 'Use the verified DCF archive operation.' using errcode='42501';
  end if;
  execute format('select to_jsonb(r) from public.%I r where id=$1 for update',t) into r using new.original_id;
  if r is null or r is distinct from new.data or (new.data->>'id')::bigint is distinct from new.original_id then
    raise exception 'Archive identity does not match the current record.' using errcode='22023';
  end if;
  select coalesce(jsonb_agg(to_jsonb(s) order by item_id,stage),'[]') into states
    from public.dcf_financial_entry_state s where entity_type=t and parent_id=new.original_id;
  insert into public.dcf_archive_evidence(trash_id,entity_type,parent_id,delete_operation_id,archived_record,source_snapshot,children,financial_state,actor_id)
    values(new.id,t,new.original_id,c.operation_id,r,public.dcf_snapshot(t,new.original_id),public.dcf_archive_children(t,new.original_id),states,c.actor_id);
  return new;
end $$;
drop trigger if exists dcf_capture_archive_evidence on public.trash_bin;
create trigger dcf_capture_archive_evidence after insert on public.trash_bin
for each row execute function public.dcf_capture_archive_evidence();

create or replace function public.dcf_archive_recovery_matches(p_type text,p_record jsonb) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.dcf_archive_recoveries r
    join public.dcf_archive_evidence e on e.trash_id=r.trash_id
    join public.dcf_revision_context c on c.transaction_id=r.transaction_id
    join public.dcf_revision_heads h on h.entity_type=r.entity_type and h.parent_id=r.parent_id
    where r.transaction_id=txid_current() and r.result_revision_id is null
      and c.source='archive-recovery' and c.operation_id=r.operation_id and c.actor_id=r.actor_id
      and r.entity_type=p_type and r.parent_id=(p_record->>'id')::bigint
      and h.deleted and h.incarnation=r.incarnation and h.latest_revision_id=r.deleted_revision_id
      and p_record=e.archived_record)
$$;

-- Extend the installed bodies at explicit, fail-closed anchors. Do not replace
-- parent migrations or relax ordinary create/edit/transfer/supplement guards.
do $patch$
declare definition text; anchor text; replacement text; begin
  select pg_get_functiondef('public.dcf_finalize_revision(text,bigint)'::regprocedure) into definition;
  if position('public.dcf_archive_recoveries ar' in definition)=0 then
    anchor:='if h.deleted and q.before_snapshot is null then';
    -- Use a projected receipt match below; the full-row match was already checked by the RPC.
    replacement:='if h.deleted and q.before_snapshot is null and not (c.source=''archive-recovery'' and exists(select 1 from public.dcf_archive_recoveries ar join public.dcf_archive_evidence ae on ae.trash_id=ar.trash_id where ar.transaction_id=txid_current() and ar.operation_id=c.operation_id and ar.actor_id=c.actor_id and ar.entity_type=p_type and ar.parent_id=p_id and ar.incarnation=h.incarnation and ar.deleted_revision_id=h.latest_revision_id and ar.result_revision_id is null and public.dcf_project_record(p_type,ae.archived_record)=after_value->''record'')) then';
    if position(anchor in definition)=0 then raise exception 'Unsupported DCF finalizer: recovery incarnation anchor missing.'; end if;
    definition:=replace(definition,anchor,replacement);
    anchor:='when q.before_snapshot is null then ''create''';
    if position(anchor in definition)=0 then raise exception 'Unsupported DCF finalizer: recovery kind anchor missing.'; end if;
    definition:=replace(definition,anchor,'when c.source=''archive-recovery'' and exists(select 1 from public.dcf_archive_recoveries ar where ar.operation_id=c.operation_id and ar.transaction_id=txid_current() and ar.entity_type=p_type and ar.parent_id=p_id) then ''archive-recovery'' '||anchor);
    definition:=replace(definition,'when ''create'' then ''Created record''','when ''archive-recovery'' then ''Recovered archived record'' when ''create'' then ''Created record''');
    execute definition;
  end if;
  select pg_get_functiondef('public.guard_activity_budget_separation()'::regprocedure) into definition;
  if position('dcf_archive_recovery_matches' in definition)=0 then
    anchor:='trusted:=coalesce(current_setting(''app.activity_supplement_write'',true),'''')=''on'';';
    if position(anchor in definition)=0 then raise exception 'Unsupported Activity guard: archive anchor missing.'; end if;
    definition:=replace(definition,anchor,'if tg_op=''INSERT'' and public.dcf_archive_recovery_matches(''activities'',to_jsonb(new)) then return new; end if; '||anchor);
    execute definition;
  end if;
end $patch$;

create or replace function public.dcf_archive_insert_exact(p_table text,p_row jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp set timezone='UTC' as $$
declare columns_value text; values_value text; result jsonb; begin
  if p_table<>all(array['activities','subprojects','office_requirements','staffing_requirements','other_program_expenses',
    'subproject_drive_folders','subproject_drive_files','subproject_accomplishments','activity_drive_folders','activity_drive_files','activity_monitoring_reports','activity_monitoring_actions']) then
    raise exception 'Unsupported archive child table.';
  end if;
  if nullif(p_row->>'id','') is null then raise exception 'Archived identity is missing.' using errcode='22023'; end if;
  select string_agg(format('%I',attname),',' order by attnum),string_agg(format('r.%I',attname),',' order by attnum)
    into columns_value,values_value from pg_attribute where attrelid=to_regclass('public.'||p_table)
      and attnum>0 and not attisdropped and attgenerated='' and p_row ? attname;
  execute format('insert into public.%I(%s) overriding system value select %s from jsonb_populate_record(null::public.%I,$1) r returning to_jsonb(%I)',p_table,columns_value,values_value,p_table,p_table)
    into result using p_row;
  if result is distinct from p_row then raise exception 'Archived schema or reference values changed. Recovery requires review.' using errcode='40001'; end if;
  return result;
end $$;

create or replace function public.recover_dcf_archive(p_trash_id bigint,p_request_key uuid,p_actor_id bigint,p_actor_password text default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp set timezone='UTC' as $$
declare a public.users%rowtype; e public.dcf_archive_evidence%rowtype; h public.dcf_revision_heads%rowtype;
  tombstone public.dcf_record_revisions%rowtype; cached public.dcf_mutation_requests%rowtype;
  archive_row jsonb; live_row jsonb; fingerprint text; states jsonb; child jsonb; n text; snapshot_value jsonb; rid bigint; result jsonb;
begin
  a:=public.dcf_authenticate(p_actor_id,p_actor_password);
  if a.role not in ('Super Admin','Administrator') then raise exception 'Archive Management requires an administrator.' using errcode='42501'; end if;
  if p_request_key is null or p_trash_id is null then raise exception 'Archive request identity is required.' using errcode='22023'; end if;
  fingerprint:=md5(jsonb_build_array('archive-recovery',p_trash_id)::text);
  perform pg_advisory_xact_lock(hashtextextended(p_request_key::text,0));
  select * into e from public.dcf_archive_evidence where trash_id=p_trash_id for update;
  if not found then raise exception 'This legacy archive has no verified recovery evidence; manual review is required.' using errcode='55000'; end if;
  perform public.dcf_check_access(a,e.entity_type,e.archived_record,true);
  select * into cached from public.dcf_mutation_requests where request_key=p_request_key;
  if found then
    if cached.actor_id<>a.id or cached.request_hash<>fingerprint then raise exception 'This request identity belongs to a different operation.' using errcode='22023'; end if;
    return cached.response;
  end if;
  select to_jsonb(t) into archive_row from public.trash_bin t where id=p_trash_id for update;
  if archive_row is null then raise exception 'This archive was already recovered or removed.' using errcode='P0002'; end if;
  if public.dcf_archive_type(archive_row->>'entity_type') is distinct from e.entity_type
    or (archive_row->>'original_id')::bigint is distinct from e.parent_id or archive_row->'data' is distinct from e.archived_record
    or (e.archived_record->>'id')::bigint is distinct from e.parent_id or nullif(e.archived_record->>'uid','') is null then
    raise exception 'The archived identity or data changed; recovery is blocked.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('dcf-archive:'||e.entity_type||':'||e.parent_id,0));
  -- Archive recovery is rare. Short table locks also exclude phantom child rows
  -- from old supported writers that do not take the archive advisory lock.
  execute format('lock table public.%I in share row exclusive mode',e.entity_type);
  lock table public.financial_obligations,public.financial_disbursements,public.dcf_financial_entry_state,
    public.budget_item_transfers,public.activity_supplements in share row exclusive mode;
  select * into h from public.dcf_revision_heads where entity_type=e.entity_type and parent_id=e.parent_id for update;
  select * into tombstone from public.dcf_record_revisions where id=h.latest_revision_id;
  if not coalesce(h.deleted,false) or tombstone.kind is distinct from 'delete' or tombstone.operation_id is distinct from e.delete_operation_id
    or tombstone.incarnation is distinct from h.incarnation or tombstone.entity_type is distinct from e.entity_type or tombstone.parent_id is distinct from e.parent_id then
    raise exception 'The original deleted incarnation is no longer current; recovery cannot overwrite later work.' using errcode='40001';
  end if;
  execute format('select to_jsonb(r) from public.%I r where id=$1 or uid=$2 for update',e.entity_type)
    into live_row using e.parent_id,e.archived_record->>'uid';
  if live_row is not null then raise exception 'The archived ID or UID is already in use.' using errcode='23505'; end if;
  -- Keep independent ledgers and transfer/approval ownership intact. A multi-parent
  -- transfer reversal is not archive recovery, even for administrators.
  if coalesce(e.source_snapshot->'related'->'transfers','[]')<>'[]'::jsonb or (e.entity_type in ('activities','subprojects') and exists(
    select 1 from public.budget_item_transfers where source_type=case when e.entity_type='activities' then 'activity' else 'subproject' end
      and (source_id=e.parent_id or destination_id=e.parent_id))) then
    raise exception 'Transfer-linked archives require the transfer workflow; ownership cannot be recovered here.' using errcode='55000';
  end if;
  if nullif(e.archived_record->>'budgetItemTransferId','') is not null or coalesce((e.archived_record->>'isTransferTargetExcluded')::boolean,false) then
    raise exception 'Transfer destination classification cannot be recovered directly.' using errcode='55000';
  end if;
  if e.entity_type='activities' and (coalesce(e.source_snapshot->'related'->'activity_supplements','[]')<>'[]'::jsonb
    or exists(select 1 from jsonb_array_elements(coalesce(e.archived_record->'expenses','[]')) x where nullif(x->>'supplementUid','') is not null or x->>'fundingOrigin' in ('Supplemental','SupplementalDraft'))) then
    raise exception 'Supplement-linked archives require approval and ownership review.' using errcode='55000';
  end if;
  select coalesce(jsonb_agg(to_jsonb(s) order by item_id,stage),'[]') into states from public.dcf_financial_entry_state s
    where entity_type=e.entity_type and parent_id=e.parent_id;
  if states is distinct from e.financial_state then raise exception 'Financial ownership changed after archival.' using errcode='40001'; end if;
  perform public.dcf_begin_operation(a.id,p_actor_password,'archive-recovery',p_request_key,'Recovered verified archive '||p_trash_id);
  insert into public.dcf_archive_recoveries(operation_id,trash_id,entity_type,parent_id,incarnation,deleted_revision_id,actor_id,transaction_id)
    values(p_request_key,p_trash_id,e.entity_type,e.parent_id,h.incarnation,h.latest_revision_id,a.id,txid_current());
  live_row:=public.dcf_archive_insert_exact(e.entity_type,e.archived_record);
  foreach n in array case e.entity_type when 'subprojects' then array['subproject_drive_folders','subproject_drive_files','subproject_accomplishments']
    when 'activities' then array['activity_drive_folders','activity_drive_files','activity_monitoring_reports','activity_monitoring_actions'] else array[]::text[] end loop
    execute format('lock table public.%I in share row exclusive mode',n);
    for child in select value from jsonb_array_elements(e.children->n) loop
      execute format('select to_jsonb(r) from public.%I r where id::text=$1 for update',n) into live_row using child->>'id';
      if live_row is not null then
        if live_row is distinct from child then raise exception 'Archived child identity is now changed or owned elsewhere.' using errcode='40001'; end if;
      elsif n='subproject_accomplishments' then
        raise exception 'Retained physical evidence is missing; recovery cannot recreate posted identities.' using errcode='40001';
      else perform public.dcf_archive_insert_exact(n,child);
      end if;
    end loop;
  end loop;
  snapshot_value:=public.dcf_snapshot(e.entity_type,e.parent_id);
  if public.dcf_snapshot_hash(snapshot_value) is distinct from public.dcf_snapshot_hash(e.source_snapshot)
    or public.dcf_archive_children(e.entity_type,e.parent_id) is distinct from e.children then
    raise exception 'Archived ledger, references, or dependent state changed; no recovery was applied.' using errcode='40001';
  end if;
  rid:=public.dcf_finalize_revision(e.entity_type,e.parent_id);
  if not exists(select 1 from public.dcf_record_revisions where id=rid and incarnation=h.incarnation and kind='archive-recovery' and operation_id=p_request_key) then
    raise exception 'Recovery lineage could not be verified.';
  end if;
  update public.dcf_archive_recoveries set result_revision_id=rid where operation_id=p_request_key;
  delete from public.trash_bin where id=p_trash_id;
  result:=snapshot_value||jsonb_build_object('record',public.dcf_response_record(e.entity_type,e.archived_record),'revisionId',rid,'operationId',p_request_key);
  insert into public.dcf_mutation_requests(request_key,actor_id,request_hash,response) values(p_request_key,a.id,fingerprint,result);
  return result;
end $$;

revoke all on function public.dcf_archive_type(text),public.dcf_archive_children(text,bigint),public.dcf_capture_archive_evidence(),
  public.dcf_archive_recovery_matches(text,jsonb),public.dcf_archive_insert_exact(text,jsonb),public.recover_dcf_archive(bigint,uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.recover_dcf_archive(bigint,uuid,bigint,text) to anon,authenticated;
commit;
