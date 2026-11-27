-- Keep delete conflicts terminal at the HTTP boundary, without retrying a
-- deterministic stale baseline as a PostgreSQL serialization failure.
begin;
set local lock_timeout='5s';
set local statement_timeout='90s';

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
    if r is not null or not exists(select 1 from public.dcf_revision_heads where entity_type=p_entity_type and parent_id=p_parent_id and deleted and latest_revision_id=(cached.response->>'revisionId')::bigint) then raise exception 'The record changed after deletion. Reload before continuing.' using errcode='PT409'; end if;
    return cached.response;
  end if;
  execute format('select to_jsonb(r) from public.%I r where id=$1 for update',p_entity_type) into r using p_parent_id;
  perform public.dcf_check_access(a,p_entity_type,r,true); perform public.dcf_check_action(a,p_entity_type,r,'delete',p_reason);
  if public.dcf_project_record(p_entity_type,coalesce(p_base->'record',p_base)) is distinct from public.dcf_project_record(p_entity_type,r) then raise exception 'This record changed. Reopen before deleting.' using errcode='PT409'; end if;
  -- New clients confirm a complete authoritative snapshot. Old raw-parent
  -- clients retain their existing comparison; no stale checks are bypassed.
  if p_base ? 'hash' and (p_base->>'hash' is null or p_base->>'hash' is distinct from public.dcf_snapshot_hash(public.dcf_snapshot(p_entity_type,p_parent_id))) then
    raise exception 'This record or its accomplishments changed. Reopen before deleting.' using errcode='PT409';
  end if;
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

-- CREATE OR REPLACE retains the existing owner and execution grants.
commit;
