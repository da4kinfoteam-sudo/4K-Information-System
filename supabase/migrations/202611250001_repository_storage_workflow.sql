begin;
set local lock_timeout='5s';
set local statement_timeout='90s';

alter table public.repository_entries add column if not exists storage_year integer check(storage_year between 1900 and 9999);
alter table public.repository_entries add column if not exists single_document boolean;
alter table public.repository_drive_folders add column if not exists entry_id uuid references public.repository_entries(id);
alter table public.repository_drive_folders add column if not exists master_folder_id text;
alter table public.repository_drive_folders add column if not exists parent_folder_id text;
alter table public.repository_drive_folders add column if not exists folder_year integer;
alter table public.repository_drive_folders add column if not exists desired_name text;
alter table public.repository_drive_folders add column if not exists confirmed_name text;
alter table public.repository_drive_folders add column if not exists rename_lease_id uuid;
alter table public.repository_drive_folders add column if not exists rename_lease_expires_at timestamptz;
create index if not exists repository_storage_entry_idx on public.repository_drive_folders(entry_id);

create or replace function public.resource_entry_storage_guard() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare placed integer;
begin
 if tg_op='INSERT' then
   if new.kind='File' and not exists(select 1 from public.repository_entries where id=new.id) then new.single_document:=true; end if;
 elsif new.reporting_year is distinct from old.reporting_year then
   placed:=old.storage_year;
   if placed is null and exists(select 1 from public.repository_files where entry_id=old.id and drive_folder_id is not null) then
     placed:=coalesce(old.reporting_year,extract(year from old.created_at at time zone 'Asia/Manila')::integer);
   end if;
   if placed is not null and new.reporting_year is distinct from placed then raise exception 'The storage year is fixed after folder placement. Create a new entry for another year.' using errcode='22023'; end if;
 end if;
 return new;
end $$;
create trigger repository_storage_entry_guard before insert or update of reporting_year on public.repository_entries for each row execute function public.resource_entry_storage_guard();

create or replace function public.resource_entry_storage_rename() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$begin
 if new.subject is distinct from old.subject then update public.repository_drive_folders set desired_name=new.subject where entry_id=new.id; end if;
 return new;
end $$;
create trigger repository_storage_name_queue after update of subject on public.repository_entries for each row execute function public.resource_entry_storage_rename();

create or replace function public.resource_single_document_guard() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare e public.repository_entries%rowtype;
begin
 select * into e from public.repository_entries where id=new.entry_id;
 if e.single_document and new.assignment_id is null then
   -- Reserving already holds a shared entry lock; avoid a competing lock upgrade.
   perform pg_advisory_xact_lock(hashtextextended('resource-single-document:'||e.id,0));
   if exists(select 1 from public.repository_files where entry_id=e.id and assignment_id is null and storage_state not in ('Failed','CleanupRequired')) then
     raise exception 'This document already has an upload. Resume the existing upload instead of adding another file.' using errcode='23505';
   end if;
 end if;
 return new;
end $$;
create trigger repository_single_document_guard before insert on public.repository_files for each row execute function public.resource_single_document_guard();

create or replace function public.resource_storage_context(p_session text,p_file_id uuid,p_lease_id uuid default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor jsonb; f public.repository_files%rowtype; e public.repository_entries%rowtype; mapping public.repository_drive_folders%rowtype; legacy text;
begin
 if p_lease_id is null then perform public.resource_file_authorize(p_session,p_file_id); actor:=public.resource_actor(p_session,'Documentary Repository','view');
 else actor:=public.resource_actor(p_session,'Documentary Repository','edit'); end if;
 select * into f from public.repository_files where id=p_file_id;
 select * into e from public.repository_entries where id=f.entry_id;
 if f.id is null or not public.resource_entry_visible(e,actor) then raise exception 'Upload is unavailable.' using errcode='42501'; end if;
 if p_lease_id is not null then
   if f.uploaded_by<>(actor->>'id')::bigint or f.upload_lease_id is distinct from p_lease_id or f.upload_lease_expires_at<=clock_timestamp() then raise exception 'Upload lease expired.' using errcode='40001'; end if;
   if e.state in ('Closed','Archived') then raise exception 'Reopen this entry before continuing its upload.'; end if;
   if f.assignment_id is not null then perform public.resource_assert_assignment(actor,e.id,f.assignment_id,case when (actor->>'is_admin')::boolean then 'Resume administrator upload' else null end);
   elsif not (actor->>'is_admin')::boolean then raise exception 'Access denied.' using errcode='42501'; end if;
 end if;
 select * into mapping from public.repository_drive_folders where folder_id=f.drive_folder_id and connection_id=f.connection_id and master_folder_id is not null limit 1;
 if mapping.identity_key is null and f.drive_file_id is not null then select folder_id into legacy from public.repository_drive_folders where identity_key='resources-root:'||f.connection_id and connection_id=f.connection_id; end if;
 return jsonb_build_object('entry_id',e.id,'subject',e.subject,'entry_version',e.version,'year',coalesce(e.storage_year,e.reporting_year,extract(year from e.created_at at time zone 'Asia/Manila')::integer),
   'assignment_ou',(select operating_unit from public.repository_assignments where id=f.assignment_id),'master_folder_id',mapping.master_folder_id,'legacy_root_id',legacy);
end $$;

create or replace function public.resource_storage_mapping(p_session text,p_file_id uuid,p_upload_lease uuid,p_key text,p_connection_id text,p_folder_lease uuid,p_data jsonb,p_folder_id text default null,p_release boolean default false) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare context jsonb; e public.repository_entries%rowtype; result jsonb; k text:=p_data->>'kind';
begin
 context:=public.resource_storage_context(p_session,p_file_id,p_upload_lease);
 if p_key !~ '^repo:[a-f0-9]{64}$' or k not in ('branch','year','entry','ou') or nullif(p_data->>'master_folder_id','') is null or nullif(p_data->>'parent_folder_id','') is null then raise exception 'Invalid storage mapping.'; end if;
 if p_release then update public.repository_drive_folders set lease_id=null,lease_expires_at=null where identity_key=p_key and connection_id=p_connection_id and lease_id=p_folder_lease and folder_id is null; return '{}'; end if;
 if p_folder_id is not null and k='entry' then
   select * into e from public.repository_entries where id=(context->>'entry_id')::uuid for update;
   if e.version is distinct from (p_data->>'entry_version')::integer or e.subject is distinct from p_data->>'name' or (context->>'year')::integer is distinct from (p_data->>'year')::integer then raise exception 'Document details changed during folder preparation. Retry its current details.' using errcode='40001'; end if;
 end if;
 result:=public.resource_folder_lease(p_key,p_connection_id,p_folder_lease,p_folder_id);
 if p_folder_id is not null then
   update public.repository_drive_folders set master_folder_id=p_data->>'master_folder_id',parent_folder_id=p_data->>'parent_folder_id',folder_year=(context->>'year')::integer,
     entry_id=case when k='entry' then (context->>'entry_id')::uuid else null end,desired_name=p_data->>'name',confirmed_name=p_data->>'name' where identity_key=p_key and folder_id=p_folder_id;
   if k='entry' then update public.repository_entries set storage_year=(context->>'year')::integer where id=e.id and storage_year is null; end if;
 end if;
 return result;
end $$;

create or replace function public.resource_storage_renames(p_session text,p_entry_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor jsonb;
begin
 actor:=public.resource_actor(p_session,'Documentary Repository','manage');
 if not exists(select 1 from public.repository_entries e where e.id=p_entry_id and public.resource_entry_visible(e,actor)) then raise exception 'Entry is unavailable.' using errcode='42501'; end if;
 return jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object('key',identity_key)) from public.repository_drive_folders where entry_id=p_entry_id and folder_id is not null and desired_name is distinct from confirmed_name),'[]'));
end $$;

create or replace function public.resource_storage_rename_claim(p_session text,p_entry_id uuid,p_key text,p_lease uuid,p_done_name text default null,p_release boolean default false) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor jsonb; m public.repository_drive_folders%rowtype; e public.repository_entries%rowtype;
begin
 actor:=public.resource_actor(p_session,'Documentary Repository','manage');
 select * into e from public.repository_entries where id=p_entry_id for update;
 if e.id is null or not public.resource_entry_visible(e,actor) then raise exception 'Entry is unavailable.' using errcode='42501'; end if;
 select * into m from public.repository_drive_folders where identity_key=p_key and entry_id=e.id and folder_id is not null for update;
 if not found then raise exception 'Storage mapping is unavailable.'; end if;
 if p_release then
   update public.repository_drive_folders set rename_lease_id=null,rename_lease_expires_at=null where identity_key=p_key and rename_lease_id=p_lease;
   return '{}';
 end if;
 if p_done_name is not null then
   if m.rename_lease_id is distinct from p_lease or m.rename_lease_expires_at<=clock_timestamp() then raise exception 'Folder rename lease expired.' using errcode='40001'; end if;
   update public.repository_drive_folders set confirmed_name=p_done_name,rename_lease_id=null,rename_lease_expires_at=null where identity_key=p_key;
   perform public.resource_audit(actor,'repository',e.id::text,'Storage Folder Name Synchronized',jsonb_build_object('entry_version',e.version));
   return jsonb_build_object('pending',m.desired_name is distinct from p_done_name);
 end if;
 if m.rename_lease_expires_at>clock_timestamp() and m.rename_lease_id is distinct from p_lease then raise exception 'Folder name synchronization is already running. Retry shortly.' using errcode='40001'; end if;
 update public.repository_drive_folders set rename_lease_id=p_lease,rename_lease_expires_at=clock_timestamp()+interval '120 seconds' where identity_key=p_key;
 return to_jsonb(m)||jsonb_build_object('desired_name',e.subject);
end $$;

create or replace function public.resource_entry_snapshot(p_id uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select to_jsonb(e)||jsonb_build_object('assignments',coalesce((select jsonb_agg(to_jsonb(a) order by a.operating_unit) from public.repository_assignments a where a.entry_id=e.id),'[]'),
 'storage_sync_pending',exists(select 1 from public.repository_drive_folders where entry_id=e.id and desired_name is distinct from confirmed_name)) from public.repository_entries e where e.id=p_id
$$;

do $$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in
 ('resource_entry_storage_guard','resource_entry_storage_rename','resource_single_document_guard','resource_storage_context','resource_storage_mapping','resource_storage_renames','resource_storage_rename_claim') loop
   execute format('revoke all on function %s from public,anon,authenticated',f.signature); execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
create or replace function public.resource_read(p_session text,p_resource text,p_args jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor jsonb; module_name text; page_number integer:=greatest(1,coalesce((p_args->>'page')::integer,1));
 page_size integer:=least(100,greatest(1,coalesce((p_args->>'page_size')::integer,10))); start_at integer;
 search_text text:=left(coalesce(p_args->>'search',''),240); data jsonb; e public.repository_entries%rowtype;
 selected_assignment public.repository_assignments%rowtype; selected_ticket public.resource_tickets%rowtype; period public.reportorial_periods%rowtype;
 y integer; q text; periods jsonb:='[]'; one_period jsonb; ev jsonb; ous text[]; prospective_due timestamptz;
begin
 if p_resource in ('tickets','ticket','ticket_comments','ticket_events','administrators') then module_name:='Submit Ticket';
 elsif p_resource in ('entries','entry','assignments','versions','files','file','events','deadlines','reportorial','reportorial_snapshots','entry_preview','upload_intent') then module_name:='Documentary Repository';
 else raise exception 'Unsupported resource query.' using errcode='22023'; end if;
 actor:=public.resource_actor(p_session,module_name,'view'); start_at:=(page_number-1)*page_size;
 if p_resource in ('entry','assignments','versions','files','file','events','entry_preview') then
   select * into e from public.repository_entries where id=(p_args->>'id')::uuid;
   if not found or not public.resource_entry_visible(e,actor) then raise exception 'Folder or file is unavailable.' using errcode='42501'; end if;
 end if;
 if p_resource in ('ticket','ticket_comments','ticket_events') then
   select * into selected_ticket from public.resource_tickets where id=(p_args->>'id')::uuid;
   if not found or (not (actor->>'is_admin')::boolean and selected_ticket.reporter_id<>(actor->>'id')::bigint) then raise exception 'Ticket is unavailable.' using errcode='42501'; end if;
 end if;

 if p_resource='entries' then
   data:=public.resource_repository_entries(actor,p_args);
 elsif p_resource='entry' then
   data:=to_jsonb(e)||jsonb_build_object('storage_sync_pending',exists(select 1 from public.repository_drive_folders where entry_id=e.id and desired_name is distinct from confirmed_name),'parent_subject',(select subject from public.repository_entries where id=e.parent_id),'supporting_file_count',(select count(*) from public.repository_files where entry_id=e.id and assignment_id is null and storage_state='Ready'),'can_manage',(actor->>'is_admin')::boolean,'can_submit',(actor->>'can_edit')::boolean and e.state='Published' and exists(select 1 from public.repository_assignments where entry_id=e.id and operating_unit=actor->>'operatingUnit' and not waived));
 elsif p_resource='assignments' then
   with filtered as (
     select a.id,a.entry_id,a.operating_unit,a.waived,a.waiver_reason,coalesce(s.version,0) version,
       last_receipt.id receipt_id,last_receipt.submitted_at,last_receipt.submitted_by_name,last_receipt.version receipt_version,last_receipt.file_ids receipt_file_ids,
       case when a.waived then 'Waived' when last_receipt.invalidated_at is not null then 'Returned For Correction'
        when last_receipt.withdrawn_at is not null then 'Not Submitted' when last_receipt.id is not null then 'Submitted'
        when ((actor->>'is_admin')::boolean or ((actor->>'can_edit')::boolean and a.operating_unit=actor->>'operatingUnit')) and exists(select 1 from public.repository_files f where f.assignment_id=a.id) then 'Draft' else 'Not Submitted' end status,
       case when a.waived then null when valid_receipt.id is not null then case when valid_receipt.submitted_at<=e.due_at then 'On Time' else 'Late' end when e.due_at<clock_timestamp() then 'Overdue' else 'Pending' end timeliness,
       valid_receipt.id qualifying_receipt_id,valid_receipt.submitted_at qualifying_submitted_at
     from public.repository_assignments a left join public.repository_submissions s on s.assignment_id=a.id
     left join lateral(select * from public.repository_submission_versions v where v.submission_id=s.id order by version desc limit 1) last_receipt on true
     left join lateral(select * from public.repository_submission_versions v where v.submission_id=s.id and invalidated_at is null and withdrawn_at is null order by submitted_at,version limit 1) valid_receipt on true
     where a.entry_id=e.id and (search_text='' or a.operating_unit ilike '%'||search_text||'%')
   ) select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(x)) from(select * from filtered order by operating_unit limit page_size offset start_at) x),'[]'),'total',(select count(*) from filtered),
       'summary',(select jsonb_build_object('required',count(*),'submitted',count(*) filter(where exists(select 1 from public.repository_submissions sub join public.repository_submission_versions receipt on receipt.submission_id=sub.id where sub.assignment_id=assignment.id and receipt.invalidated_at is null and receipt.withdrawn_at is null))) from public.repository_assignments assignment where assignment.entry_id=e.id and not assignment.waived)) into data;
 elsif p_resource='files' then
   with filtered as (
     select to_jsonb(f)-array['upload_session_secret','drive_file_id','drive_folder_id','connection_id'] metadata,f.created_at,f.id
     from public.repository_files f where f.entry_id=e.id and public.resource_file_visible(f,e,actor)
       and (not (p_args ? 'assignment_id') or f.assignment_id is not distinct from nullif(p_args->>'assignment_id','')::uuid)
       and (not (p_args ? 'file_ids') or f.id in (select x::uuid from jsonb_array_elements_text(p_args->'file_ids') x))
   ) select jsonb_build_object('rows',coalesce((select jsonb_agg(x.metadata) from(select * from filtered order by created_at desc,id limit page_size offset start_at) x),'[]'),'total',(select count(*) from filtered)) into data;
 elsif p_resource='file' then
   select to_jsonb(f)-array['upload_session_secret','drive_file_id','drive_folder_id','connection_id','upload_lease_id','upload_lease_expires_at'] into data from public.repository_files f where f.id=(p_args->>'file_id')::uuid and f.entry_id=e.id and public.resource_file_visible(f,e,actor);
   if data is null then raise exception 'File is unavailable.' using errcode='42501'; end if;
   data:=data||jsonb_build_object('breadcrumb_entry',jsonb_build_object('id',e.id,'subject',e.subject,'kind',e.kind,'parent_id',e.parent_id,'parent_subject',(select subject from public.repository_entries where id=e.parent_id)));
 elsif p_resource='versions' then
   select * into selected_assignment from public.repository_assignments where id=(p_args->>'assignment_id')::uuid and entry_id=e.id;
   if not found then raise exception 'Assignment is unavailable.'; end if;
   with filtered as(select v.* from public.repository_submission_versions v join public.repository_submissions s on s.id=v.submission_id where s.assignment_id=selected_assignment.id)
   select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(x)) from(select * from filtered order by submitted_at desc,version desc limit page_size offset start_at) x),'[]'),'total',(select count(*) from filtered)) into data;
 elsif p_resource in ('events','ticket_events') then
   with filtered as(select * from public.resource_events where entity_type=case when p_resource='events' then 'repository' else 'ticket' end and entity_id=coalesce(e.id,selected_ticket.id)::text)
   select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(x)) from(select * from filtered order by id desc limit page_size offset start_at) x),'[]'),'total',(select count(*) from filtered)) into data;
 elsif p_resource='deadlines' then
   with filtered as(
     select r.id,r.subject,r.due_at,r.reporting_year,r.state,a.id assignment_id,a.waived,
      case when a.id is null then null when a.waived then 'Waived' when exists(select 1 from public.repository_submissions s join public.repository_submission_versions v on v.submission_id=s.id where s.assignment_id=a.id and v.invalidated_at is null and v.withdrawn_at is null) then 'Submitted' else 'Not Submitted' end own_status
     from public.repository_entries r left join public.repository_assignments a on a.entry_id=r.id and a.operating_unit=actor->>'operatingUnit'
     where public.resource_entry_visible(r,actor) and r.required_submission and r.state='Published'
       and (not coalesce((p_args->>'upcoming_only')::boolean,false) or r.due_at>=clock_timestamp())
       and (not coalesce((p_args->>'overdue_only')::boolean,false) or r.due_at<clock_timestamp())
   ) select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(x)) from(select * from filtered order by due_at,id limit page_size offset start_at) x),'[]'),'total',(select count(*) from filtered)) into data;
 elsif p_resource='entry_preview' then
   perform public.resource_actor(p_session,module_name,'manage');
   if nullif(p_args->>'due_date','') is null then raise exception 'Choose the prospective due date.'; end if;
   prospective_due:=(((p_args->>'due_date')::date+time '23:59:59.999999') at time zone 'Asia/Manila');
   with impact as (
     select a.operating_unit,a.waived,v.id receipt_id,v.submitted_at,
       case when a.waived then null when v.id is null then 0 when v.submitted_at<=e.due_at then 1 else .5 end old_credit,
       case when a.waived then null when v.id is null then 0 when v.submitted_at<=prospective_due then 1 else .5 end proposed_credit
     from public.repository_assignments a
     left join lateral(select r.* from public.repository_submissions s join public.repository_submission_versions r on r.submission_id=s.id where s.assignment_id=a.id and r.invalidated_at is null and r.withdrawn_at is null order by r.submitted_at,r.version limit 1) v on true
     where a.entry_id=e.id
   ) select jsonb_build_object('current_due_at',e.due_at,'proposed_due_at',prospective_due,'entry_version',e.version,'rows',coalesce(jsonb_agg(to_jsonb(impact) order by operating_unit),'[]')) into data from impact;
 elsif p_resource='upload_intent' then
   select to_jsonb(f)-array['upload_session_secret','drive_file_id','drive_folder_id','connection_id'] into data from public.repository_files f join public.repository_entries r on r.id=f.entry_id
     where f.id=(p_args->>'file_id')::uuid and f.uploaded_by=(actor->>'id')::bigint and public.resource_entry_visible(r,actor);
   if data is null then raise exception 'Upload intent is unavailable.' using errcode='42501'; end if;
 elsif p_resource='reportorial' then
   if actor->>'role' not in ('Super Admin','Administrator') then raise exception 'Access denied.' using errcode='42501'; end if;
   y:=(p_args->>'reporting_year')::integer;
   if y is null or y not between 1900 and 9999 then raise exception 'Select a valid reporting year.'; end if;
   if p_args ? 'ous' then
     select array_agg(distinct x) into ous from jsonb_array_elements_text(p_args->'ous') x;
     if exists(select 1 from unnest(ous) x where not public.resource_ou(x)) then raise exception 'Select valid OUs.'; end if;
   end if;
   foreach q in array array['Q1','Q2','Q3','Q4'] loop
     select * into period from public.reportorial_periods where reporting_year=y and quarter=q;
     one_period:=case when period.reporting_year is null then jsonb_build_object('reporting_year',y,'quarter',q,'source','Manual','state','Open','version',0) else to_jsonb(period) end;
     if period.source='Repository' then
       if period.state='Finalized' then select evidence into ev from public.reportorial_snapshots where id=period.snapshot_id;
       else ev:=public.resource_reportorial_live(y,q,clock_timestamp()); end if;
       if ev is null then raise exception 'The finalized evidence is unavailable.'; end if;
       if ous is not null then ev:=ev||jsonb_build_object('rows',coalesce((select jsonb_agg(x) from jsonb_array_elements(ev->'rows') x where x->>'operating_unit'=any(ous)),'[]'),'evidence',coalesce((select jsonb_agg(x) from jsonb_array_elements(ev->'evidence') x where x->>'operating_unit'=any(ous)),'[]')); end if;
       one_period:=one_period||jsonb_build_object('summary',ev);
     end if;
     periods:=periods||jsonb_build_array(one_period);
   end loop;
   data:=jsonb_build_object('periods',periods);
 elsif p_resource='reportorial_snapshots' then
   if actor->>'role' not in ('Super Admin','Administrator') then raise exception 'Access denied.' using errcode='42501'; end if;
   with filtered as(select id,reporting_year,quarter,version,cutoff,rule_version,actor_name,reason,created_at from public.reportorial_snapshots where reporting_year=(p_args->>'reporting_year')::integer and quarter=p_args->>'quarter')
   select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(x)) from(select * from filtered order by version desc limit page_size offset start_at) x),'[]'),'total',(select count(*) from filtered)) into data;
 elsif p_resource='tickets' then
   with filtered as(select t.*,(select coalesce(nullif(to_jsonb(u)->>'fullName',''),to_jsonb(u)->>'username') from public.users u where u.id=t.assigned_to) assigned_to_name from public.resource_tickets t where ((actor->>'is_admin')::boolean or t.reporter_id=(actor->>'id')::bigint)
     and (search_text='' or t.subject ilike '%'||search_text||'%' or t.code ilike '%'||search_text||'%')
     and (nullif(p_args->>'status','') is null or t.status=p_args->>'status') and (nullif(p_args->>'category','') is null or t.category=p_args->>'category'))
   select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(x)) from(select * from filtered order by updated_at desc,id limit page_size offset start_at) x),'[]'),'total',(select count(*) from filtered)) into data;
 elsif p_resource='ticket' then data:=to_jsonb(selected_ticket)||jsonb_build_object('can_manage',(actor->>'is_admin')::boolean,'assigned_to_name',(select coalesce(nullif(to_jsonb(u)->>'fullName',''),to_jsonb(u)->>'username') from public.users u where u.id=selected_ticket.assigned_to));
 elsif p_resource='ticket_comments' then
   with filtered as(select * from public.resource_ticket_comments where ticket_id=selected_ticket.id)
   select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(x)) from(select * from filtered order by created_at,id limit page_size offset start_at) x),'[]'),'total',(select count(*) from filtered)) into data;
 elsif p_resource='administrators' then
   perform public.resource_actor(p_session,module_name,'manage');
   select jsonb_build_object('rows',coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',coalesce(to_jsonb(u)->>'fullName',to_jsonb(u)->>'username')) order by u.id),'[]')) into data from public.users u where u.role in ('Super Admin','Administrator');
 end if;
 return coalesce(data,'{}')||jsonb_build_object('page',page_number,'page_size',page_size);
end $$;
commit;
