begin;
set local lock_timeout='5s';
set local statement_timeout='90s';

alter table public.repository_files add column if not exists upload_lease_id uuid;
alter table public.repository_files add column if not exists upload_lease_expires_at timestamptz;
alter table public.repository_files add column if not exists uploaded_bytes bigint not null default 0;

create or replace function public.resource_upload_claim(p_session text,p_file_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor jsonb; f public.repository_files%rowtype; e public.repository_entries%rowtype; lease uuid;
begin
 actor:=public.resource_actor(p_session,'Documentary Repository','edit');
 select * into f from public.repository_files where id=p_file_id for update;
 select * into e from public.repository_entries where id=f.entry_id;
 if f.id is null or f.uploaded_by<>(actor->>'id')::bigint or not public.resource_entry_visible(e,actor) then raise exception 'Upload is unavailable.' using errcode='42501'; end if;
 if f.assignment_id is not null then perform public.resource_assert_assignment(actor,e.id,f.assignment_id,case when (actor->>'is_admin')::boolean then 'Resume administrator upload' else null end);
 elsif not (actor->>'is_admin')::boolean then raise exception 'Access denied.' using errcode='42501';
 elsif e.state in ('Closed','Archived') and f.storage_state<>'Ready' then raise exception 'Reopen this entry before continuing its upload.'; end if;
 if f.storage_state='Ready' then return to_jsonb(f); end if;
 if f.upload_lease_expires_at>clock_timestamp() then raise exception 'Another upload request is still running. Retry shortly.' using errcode='40001'; end if;
 lease:=gen_random_uuid();
 update public.repository_files set upload_lease_id=lease,upload_lease_expires_at=clock_timestamp()+interval '120 seconds' where id=f.id returning * into f;
 return to_jsonb(f);
end $$;

create or replace function public.resource_upload_release(p_session text,p_file_id uuid,p_lease_id uuid,p_changes jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor jsonb; f public.repository_files%rowtype; k text;
begin
 actor:=public.resource_actor(p_session,'Documentary Repository','edit');
 select * into f from public.repository_files where id=p_file_id for update;
 if f.id is null or f.uploaded_by<>(actor->>'id')::bigint then raise exception 'Upload is unavailable.' using errcode='42501'; end if;
 if f.storage_state='Ready' then return jsonb_build_object('id',f.id,'storage_state','Ready','uploaded_bytes',f.file_size); end if;
 if f.upload_lease_id is distinct from p_lease_id or f.upload_lease_expires_at<=clock_timestamp() then raise exception 'Upload lease expired. Check upload status before retrying.' using errcode='40001'; end if;
 for k in select jsonb_object_keys(p_changes) loop
   if k not in ('upload_session_secret','drive_file_id','drive_folder_id','connection_id','uploaded_bytes','storage_state','failure_reason') then raise exception 'Unsupported upload metadata.'; end if;
 end loop;
 if p_changes ? 'storage_state' and p_changes->>'storage_state' not in ('Uploading','Failed','CleanupRequired') then raise exception 'Unsupported upload state.'; end if;
 if p_changes ? 'uploaded_bytes' and ((p_changes->>'uploaded_bytes')::bigint not between 0 and f.file_size) then raise exception 'Invalid uploaded byte count.'; end if;
 if f.drive_file_id is not null and p_changes ? 'drive_file_id' and p_changes->>'drive_file_id' is distinct from f.drive_file_id then raise exception 'The upload identity cannot change.'; end if;
 if f.connection_id is not null and p_changes ? 'connection_id' and p_changes->>'connection_id' is distinct from f.connection_id then raise exception 'The upload connection cannot change.'; end if;
 update public.repository_files set
   upload_session_secret=case when p_changes ? 'upload_session_secret' then p_changes->>'upload_session_secret' else upload_session_secret end,
   drive_file_id=coalesce(p_changes->>'drive_file_id',drive_file_id),drive_folder_id=coalesce(p_changes->>'drive_folder_id',drive_folder_id),connection_id=coalesce(p_changes->>'connection_id',connection_id),
   uploaded_bytes=coalesce((p_changes->>'uploaded_bytes')::bigint,uploaded_bytes),storage_state=coalesce(p_changes->>'storage_state',storage_state),
   failure_reason=case when p_changes ? 'failure_reason' then left(p_changes->>'failure_reason',500) else failure_reason end,
   upload_lease_id=null,upload_lease_expires_at=null where id=f.id;
 return jsonb_build_object('id',f.id,'storage_state',coalesce(p_changes->>'storage_state',f.storage_state),'uploaded_bytes',coalesce((p_changes->>'uploaded_bytes')::bigint,f.uploaded_bytes));
end $$;

create or replace function public.resource_folder_lease(p_key text,p_connection_id text,p_lease uuid,p_folder_id text default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare f public.repository_drive_folders%rowtype;
begin
 if length(p_key) not between 1 and 240 or length(p_connection_id) not between 1 and 240 then raise exception 'Invalid storage identity.'; end if;
 insert into public.repository_drive_folders(identity_key,connection_id) values(p_key,p_connection_id) on conflict do nothing;
 select * into f from public.repository_drive_folders where identity_key=p_key for update;
 if f.connection_id is distinct from p_connection_id then raise exception 'Storage connection changed. Ask an administrator to review storage.'; end if;
 if f.folder_id is not null then return jsonb_build_object('folder_id',f.folder_id); end if;
 if p_folder_id is not null then
   if f.lease_id is distinct from p_lease or f.lease_expires_at<=clock_timestamp() then raise exception 'Folder lease expired.' using errcode='40001'; end if;
   update public.repository_drive_folders set folder_id=p_folder_id,lease_id=null,lease_expires_at=null where identity_key=p_key;
   return jsonb_build_object('folder_id',p_folder_id);
 end if;
 if f.lease_expires_at>clock_timestamp() and f.lease_id is distinct from p_lease then raise exception 'The upload folder is being prepared. Retry shortly.' using errcode='40001'; end if;
 update public.repository_drive_folders set lease_id=p_lease,lease_expires_at=clock_timestamp()+interval '120 seconds' where identity_key=p_key;
 return jsonb_build_object('lease_id',p_lease);
end $$;

do $$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('resource_upload_claim','resource_upload_release','resource_folder_lease') loop
   execute format('revoke all on function %s from public,anon,authenticated',f.signature);
   execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
commit;
