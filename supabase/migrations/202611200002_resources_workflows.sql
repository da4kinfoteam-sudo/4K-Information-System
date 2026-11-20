begin;
set local lock_timeout='5s';
set local statement_timeout='90s';

create or replace function public.resource_entry_snapshot(p_id uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select to_jsonb(e)||jsonb_build_object('assignments',coalesce((select jsonb_agg(to_jsonb(a) order by a.operating_unit) from public.repository_assignments a where a.entry_id=e.id),'[]')) from public.repository_entries e where e.id=p_id
$$;

create or replace function public.resource_record_entry(p_actor jsonb,p_id uuid,p_reason text,p_event text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare e public.repository_entries%rowtype; begin
 select * into strict e from public.repository_entries where id=p_id;
 insert into public.repository_entry_revisions(entry_id,version,snapshot,actor_id,actor_name,reason) values(e.id,e.version,public.resource_entry_snapshot(e.id),(p_actor->>'id')::bigint,p_actor->>'name',p_reason);
 perform public.resource_audit(p_actor,'repository',p_id::text,p_event,jsonb_build_object('version',e.version,'reason',p_reason));
end $$;

create or replace function public.resource_period_lock(p_year integer,p_quarter text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$begin
 if p_year is not null and p_quarter is not null then perform pg_advisory_xact_lock(hashtextextended('resource-period:'||p_year||':'||p_quarter,0)); end if;
end $$;

create or replace function public.resource_check_retry(p_actor jsonb,p_module text,p_action text,p_data jsonb) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare e public.repository_entries%rowtype; a public.repository_assignments%rowtype; t public.resource_tickets%rowtype; begin
 if p_module='Submit Ticket' and p_action<>'ticket_create' then
   select * into t from public.resource_tickets where id=(p_data->>'id')::uuid;
   if not found or (not (p_actor->>'is_admin')::boolean and t.reporter_id<>(p_actor->>'id')::bigint) then raise exception 'Ticket is unavailable.' using errcode='42501'; end if;
 elsif p_action in ('file_reserve','submission_submit') then
   select * into e from public.repository_entries where id=(p_data->>'entry_id')::uuid;
   if not found or not public.resource_entry_visible(e,p_actor) then raise exception 'Entry is unavailable.' using errcode='42501'; end if;
   if nullif(p_data->>'assignment_id','') is not null then
     select * into a from public.repository_assignments where id=(p_data->>'assignment_id')::uuid and entry_id=e.id;
     if not found or a.waived or (not (p_actor->>'is_admin')::boolean and a.operating_unit<>p_actor->>'operatingUnit') then raise exception 'Submission authorization changed.' using errcode='42501'; end if;
   elsif not (p_actor->>'is_admin')::boolean then raise exception 'Access denied.' using errcode='42501'; end if;
 elsif p_action='submission_withdraw' then
   select assignment.* into a from public.repository_submission_versions v join public.repository_submissions s on s.id=v.submission_id join public.repository_assignments assignment on assignment.id=s.assignment_id where v.id=(p_data->>'receipt_id')::uuid;
   if not found or (not (p_actor->>'is_admin')::boolean and a.operating_unit<>p_actor->>'operatingUnit') then raise exception 'Submission authorization changed.' using errcode='42501'; end if;
 end if;
end $$;

create or replace function public.resource_assert_assignment(p_actor jsonb,p_entry uuid,p_assignment uuid,p_reason text default null) returns public.repository_assignments
language plpgsql security definer set search_path=public,pg_temp as $$
declare e public.repository_entries%rowtype; a public.repository_assignments%rowtype; begin
 select * into e from public.repository_entries where id=p_entry;
 if not found or not public.resource_entry_visible(e,p_actor) then raise exception 'Submission folder is unavailable.' using errcode='42501'; end if;
 if e.state<>'Published' or not e.required_submission then raise exception 'This folder is not accepting submissions.' using errcode='22023'; end if;
 select * into a from public.repository_assignments where id=p_assignment and entry_id=p_entry;
 if not found or a.waived then raise exception 'This OU is not assigned to submit.' using errcode='42501'; end if;
 if not public.resource_ou(p_actor->>'operatingUnit') then raise exception 'A valid assigned OU is required.' using errcode='42501'; end if;
 if a.operating_unit<>p_actor->>'operatingUnit' then
   if not (p_actor->>'is_admin')::boolean or length(btrim(coalesce(p_reason,'')))=0 then raise exception 'An administrator on-behalf reason is required.' using errcode='42501'; end if;
 end if;
 return a;
end $$;

create or replace function public.resource_reportorial_live(p_year integer,p_quarter text,p_cutoff timestamptz) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 with due as (
   select a.id assignment_id,a.operating_unit,a.waived,a.waiver_reason,e.id entry_id,e.subject,e.version entry_version,e.due_at
   from public.repository_entries e join public.repository_assignments a on a.entry_id=e.id
   where e.include_awards and e.required_submission and e.reporting_year=p_year and e.quarter=p_quarter
     and e.published_at is not null and e.published_at<=p_cutoff and a.created_at<=p_cutoff and e.due_at<=p_cutoff
 ), evidence as (
   select d.*,v.id receipt_id,v.version receipt_version,v.submitted_at,v.submitted_by_name,v.due_at receipt_due_at,
     v.file_ids,case when d.waived then null when v.id is null then 0::numeric when v.submitted_at<=d.due_at then 1::numeric else .5::numeric end credit
   from due d left join lateral (
     select r.* from public.repository_submissions s join public.repository_submission_versions r on r.submission_id=s.id
     where s.assignment_id=d.assignment_id and r.submitted_at<=p_cutoff and r.invalidated_at is null and r.withdrawn_at is null
     order by r.submitted_at,r.version limit 1
   ) v on true
 ), totals as (
   select operating_unit,count(*) filter(where not waived)::integer required,
      count(*) filter(where not waived and credit=1)::integer on_time,
      count(*) filter(where not waived and credit=.5)::integer late,
      count(*) filter(where not waived and credit=0)::integer missing,
      coalesce(sum(credit),0) credited_units,
      case when count(*) filter(where not waived)=0 then null else 100*coalesce(sum(credit),0)/(count(*) filter(where not waived)) end compliance
   from evidence group by operating_unit
 ) select jsonb_build_object('reporting_year',p_year,'quarter',p_quarter,'cutoff',p_cutoff,'rule_version','on-time-1-late-0.5-v1',
    'rows',coalesce((select jsonb_agg(to_jsonb(t) order by operating_unit) from totals t),'[]'),
    'evidence',coalesce((select jsonb_agg(to_jsonb(e) order by operating_unit,entry_id) from evidence e),'[]'))
$$;

create or replace function public.resource_mutate(p_session text,p_action text,p_data jsonb,p_request_id uuid,p_expected_version integer default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor jsonb; module_name text; permission_name text; saved public.resource_requests%rowtype; payload_hash text;
 e public.repository_entries%rowtype; old_entry public.repository_entries%rowtype; a public.repository_assignments%rowtype;
 s public.repository_submissions%rowtype; receipt public.repository_submission_versions%rowtype; t public.resource_tickets%rowtype; old_ticket public.resource_tickets%rowtype;
 period public.reportorial_periods%rowtype; response jsonb; values_ous text[]; assigned_ous text[]; files uuid[];
 new_id uuid; k text; reason text:=nullif(btrim(p_data->>'reason'),''); due timestamptz; part jsonb; affected integer;
 cutoff timestamptz; snapshot jsonb; end_at timestamptz; assigned_user public.users%rowtype; new_version integer;
begin
 if p_action is null or p_data is null or jsonb_typeof(p_data)<>'object' or p_request_id is null then raise exception 'A valid resource request is required.' using errcode='22023'; end if;
 if p_action=any(array['ticket_create','ticket_comment','ticket_update','ticket_reopen_request']) then module_name:='Submit Ticket';
 elsif p_action=any(array['entry_save','entry_publish','entry_state','assignment_waive','submission_submit','submission_return','submission_withdraw','file_reserve','reportorial_source','reportorial_finalize','reportorial_reopen','session_end']) then module_name:='Documentary Repository';
 else raise exception 'Unsupported resource operation.' using errcode='22023'; end if;
 permission_name:=case when p_action in ('entry_save','entry_publish','entry_state','assignment_waive','submission_return','reportorial_source','reportorial_finalize','reportorial_reopen') then 'manage' else 'edit' end;
 actor:=public.resource_actor(p_session,module_name,permission_name);
 payload_hash:=public.resource_digest(jsonb_build_object('action',p_action,'data',p_data,'expected_version',p_expected_version)::text);
 perform pg_advisory_xact_lock(hashtextextended('resource-request:'||(actor->>'id')||':'||p_request_id,0));
 -- Lock waits must not preserve an authorization decision made before revocation.
 actor:=public.resource_actor(p_session,module_name,permission_name);
 select * into saved from public.resource_requests where actor_id=(actor->>'id')::bigint and request_id=p_request_id;
 if found then
   if saved.action<>p_action or saved.payload_hash<>payload_hash then raise exception 'This request ID was already used for different changes.' using errcode='22023'; end if;
   perform public.resource_check_retry(actor,module_name,p_action,p_data);
   return saved.response;
 end if;

 if p_action='entry_save' then
   if p_data ? 'id' then
     select * into e from public.repository_entries where id=(p_data->>'id')::uuid for update;
     if not found then raise exception 'Folder or file not found.'; end if;
     if p_expected_version is distinct from e.version then raise exception 'This entry changed. Reload it before saving.' using errcode='40001'; end if;
     if e.state in ('Closed','Archived') then raise exception 'Reopen this entry before editing it.'; end if;
     if e.published_at is not null and reason is null then raise exception 'Explain changes to a published requirement.'; end if;
     old_entry:=e;
   else
     e.id:=gen_random_uuid(); e.kind:=p_data->>'kind'; e.state:='Draft'; e.version:=0;
     e.created_by:=(actor->>'id')::bigint; e.created_by_name:=actor->>'name'; e.created_at:=clock_timestamp();
   end if;
   if e.kind not in ('Folder','File') then raise exception 'Select Folder or File.'; end if;
   if p_data ? 'kind' and p_data->>'kind'<>e.kind then raise exception 'Entry kind cannot be changed.'; end if;
   p_data:=to_jsonb(e)||p_data;
   e.subject:=btrim(p_data->>'subject'); e.instructions:=coalesce(p_data->>'instructions','');
   e.parent_id:=nullif(p_data->>'parent_id','')::uuid;
   if e.parent_id is not null then
     perform 1 from public.repository_entries parent where parent.id=e.parent_id for share;
     if e.parent_id=e.id or not exists(select 1 from public.repository_entries parent where parent.id=e.parent_id and parent.kind='Folder' and parent.parent_id is null and parent.state<>'Archived') then raise exception 'Choose an available top-level parent folder.'; end if;
     if exists(select 1 from public.repository_entries child where child.parent_id=e.id) then raise exception 'A folder containing entries cannot be nested.'; end if;
   end if;
   e.required_submission:=coalesce((p_data->>'required_submission')::boolean,false);
   if e.required_submission and exists(select 1 from public.repository_entries child where child.parent_id=e.id) then raise exception 'Use a separate required folder instead of changing a folder that contains entries.'; end if;
   if e.published_at is not null and e.required_submission is distinct from old_entry.required_submission then raise exception 'Published entry purpose cannot be changed.'; end if;
   e.requires_signed:=coalesce((p_data->>'requires_signed')::boolean,true);
   e.include_awards:=coalesce((p_data->>'include_awards')::boolean,false);
   e.reporting_year:=nullif(p_data->>'reporting_year','')::integer; e.quarter:=nullif(p_data->>'quarter','');
   if old_entry.published_at is not null and (e.reporting_year is distinct from old_entry.reporting_year or e.quarter is distinct from old_entry.quarter or e.include_awards is distinct from old_entry.include_awards) then raise exception 'Create a new occurrence instead of changing a published reporting period or scoring purpose.'; end if;
   if p_data ? 'due_date' and nullif(p_data->>'due_date','') is not null then
      e.due_at:=(((p_data->>'due_date')::date+time '23:59:59.999999') at time zone 'Asia/Manila');
   else e.due_at:=nullif(p_data->>'due_at','')::timestamptz; end if;
   if p_data->'audience_ous' is null or p_data->'audience_ous'='null'::jsonb then e.audience_ous:=null;
   else
     select array_agg(distinct x) into values_ous from jsonb_array_elements_text(p_data->'audience_ous') x;
     if values_ous is null or exists(select 1 from unnest(values_ous) x where not public.resource_ou(x)) then raise exception 'Select valid audience OUs or All OUs.'; end if;
     e.audience_ous:=values_ous;
   end if;
   if p_data ? 'assigned_ous' then
     select array_agg(distinct x) into assigned_ous from jsonb_array_elements_text(p_data->'assigned_ous') x;
     if exists(select 1 from unnest(assigned_ous) x where not public.resource_ou(x)) then raise exception 'Select valid assigned OUs.'; end if;
     if e.required_submission and cardinality(coalesce(assigned_ous,'{}'))=0 then raise exception 'Choose at least one assigned OU.'; end if;
     if e.audience_ous is not null and not coalesce(assigned_ous,'{}')<@e.audience_ous then raise exception 'Every assigned OU must be in the audience.'; end if;
   end if;
   if e.audience_ous is not null and exists(select 1 from public.repository_assignments assignment where assignment.entry_id=e.id and not assignment.waived and not assignment.operating_unit=any(e.audience_ous) and (not (p_data ? 'assigned_ous') or assignment.operating_unit=any(coalesce(assigned_ous,'{}')))) then raise exception 'Every assigned OU must be in the audience.'; end if;
   if e.parent_id is not null and exists(select 1 from public.repository_entries parent where parent.id=e.parent_id and parent.audience_ous is not null and not coalesce(assigned_ous,(select array_agg(operating_unit) from public.repository_assignments where entry_id=e.id and not waived),'{}')<@parent.audience_ous) then raise exception 'Every assigned OU must be in the parent folder audience.'; end if;
   if e.audience_ous is not null and exists(select 1 from public.repository_entries child join public.repository_assignments assignment on assignment.entry_id=child.id where child.parent_id=e.id and not assignment.waived and not assignment.operating_unit=any(e.audience_ous)) then raise exception 'Resolve child folder assignments before narrowing this audience.'; end if;
   if e.required_submission and (e.kind<>'Folder' or e.due_at is null or e.reporting_year is null) then raise exception 'Required folders need a reporting year and deadline.'; end if;
   if e.include_awards and (not e.required_submission or e.quarter is null) then raise exception 'Awards requirements need an explicit quarter.'; end if;
   perform public.resource_period_lock(e.reporting_year,e.quarter);
   e.version:=e.version+1; e.updated_at:=clock_timestamp();
   insert into public.repository_entries select e.* on conflict(id) do update set subject=excluded.subject,instructions=excluded.instructions,parent_id=excluded.parent_id,
     requires_signed=excluded.requires_signed,required_submission=excluded.required_submission,include_awards=excluded.include_awards,
     reporting_year=excluded.reporting_year,quarter=excluded.quarter,due_at=excluded.due_at,audience_ous=excluded.audience_ous,version=excluded.version,updated_at=excluded.updated_at;
   if p_data ? 'assigned_ous' then
     update public.repository_assignments set waived=true,waiver_reason=coalesce(reason,'Draft assignment removed') where entry_id=e.id and not operating_unit=any(coalesce(assigned_ous,'{}')) and not waived;
     insert into public.repository_assignments(entry_id,operating_unit) select e.id,x from unnest(coalesce(assigned_ous,'{}')) x on conflict(entry_id,operating_unit) do update set waived=false,waiver_reason=null;
   end if;
   perform public.resource_record_entry(actor,e.id,reason,case when old_entry.id is null then 'Created' else 'Updated' end);
   response:=public.resource_entry_snapshot(e.id);

 elsif p_action in ('entry_publish','entry_state','assignment_waive') then
   select * into e from public.repository_entries where id=(p_data->>'id')::uuid for update;
   if not found then raise exception 'Folder or file not found.'; end if;
   if p_expected_version is distinct from e.version then raise exception 'This entry changed. Reload it before saving.' using errcode='40001'; end if;
   perform public.resource_period_lock(e.reporting_year,e.quarter);
   if p_action='entry_publish' then
     if e.state<>'Draft' then raise exception 'Only a draft can be published.'; end if;
     if e.parent_id is not null then perform 1 from public.repository_entries parent where parent.id=e.parent_id for share; end if;
     if e.parent_id is not null and not exists(select 1 from public.repository_entries parent where parent.id=e.parent_id and parent.state='Published') then raise exception 'Publish or reopen the parent folder first.'; end if;
     if e.required_submission and not exists(select 1 from public.repository_assignments where entry_id=e.id and not waived) then raise exception 'Assign at least one OU before publication.'; end if;
     if e.kind='File' and not exists(select 1 from public.repository_files where entry_id=e.id and storage_state='Ready' and assignment_id is null) then raise exception 'Upload the official file before publication.'; end if;
     e.state:='Published'; e.published_at:=clock_timestamp();
   elsif p_action='entry_state' then
     if reason is null then raise exception 'A reason is required.'; end if;
     if p_data->>'state' not in ('Published','Closed','Archived') or e.published_at is null then raise exception 'Unsupported publication transition.'; end if;
     e.state:=p_data->>'state';
   else
     if reason is null then raise exception 'Explain the assignment waiver or restoration.'; end if;
     update public.repository_assignments set waived=(p_data->>'waived')::boolean,waiver_reason=reason where id=(p_data->>'assignment_id')::uuid and entry_id=e.id;
     if not found then raise exception 'Assignment not found.'; end if;
   end if;
   update public.repository_entries set state=e.state,published_at=e.published_at,version=version+1,updated_at=clock_timestamp() where id=e.id;
   perform public.resource_record_entry(actor,e.id,reason,p_action);
   response:=public.resource_entry_snapshot(e.id);

 elsif p_action='file_reserve' then
   select * into e from public.repository_entries where id=(p_data->>'entry_id')::uuid for share;
   if not found then raise exception 'Folder or file not found.'; end if;
   new_id:=nullif(p_data->>'assignment_id','')::uuid;
   if new_id is null then
     perform public.resource_actor(p_session,module_name,'manage');
     if e.state in ('Closed','Archived') then raise exception 'This entry is not accepting uploads.'; end if;
   else a:=public.resource_assert_assignment(actor,e.id,new_id,reason); end if;
   if lower(coalesce(p_data->>'file_name','')) !~ '\.(docx|xlsx|xls|pdf|jpe?g|png)$' or p_data->>'mime_type' not in
      ('application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel','application/pdf','image/jpeg','image/png') then raise exception 'Select a supported document or image.'; end if;
   if (p_data->>'file_size')::bigint not between 1 and 10485760 then raise exception 'Files must be between 1 byte and 10 MiB.'; end if;
   if nullif(p_data->>'file_sha256','') is not null and p_data->>'file_sha256' !~ '^[a-f0-9]{64}$' then raise exception 'A valid file fingerprint is required.'; end if;
   insert into public.repository_files(entry_id,assignment_id,upload_request_id,file_name,mime_type,file_size,expected_sha256,uploaded_by,uploaded_by_name)
     values(e.id,new_id,p_request_id,p_data->>'file_name',p_data->>'mime_type',(p_data->>'file_size')::bigint,nullif(p_data->>'file_sha256',''),(actor->>'id')::bigint,actor->>'name') returning to_jsonb(repository_files) into part;
   response:=part-'upload_session_secret';

 elsif p_action='submission_submit' then
   select * into e from public.repository_entries where id=(p_data->>'entry_id')::uuid for share;
   a:=public.resource_assert_assignment(actor,e.id,(p_data->>'assignment_id')::uuid,reason);
   perform public.resource_period_lock(e.reporting_year,e.quarter);
   perform pg_advisory_xact_lock(hashtextextended('resource-submission:'||a.id,0));
   select * into s from public.repository_submissions where assignment_id=a.id for update;
   if not found then
     if coalesce(p_expected_version,0)<>0 then raise exception 'Submission changed. Reload before submitting.' using errcode='40001'; end if;
     insert into public.repository_submissions(assignment_id) values(a.id) returning * into s;
   elsif p_expected_version is distinct from s.version then raise exception 'Submission changed. Reload before submitting.' using errcode='40001'; end if;
   select array_agg(distinct x::uuid) into files from jsonb_array_elements_text(p_data->'file_ids') x;
   if coalesce(cardinality(files),0) not between 1 and 10 then raise exception 'Select between 1 and 10 uploaded files.'; end if;
   select count(*) into affected from public.repository_files where id=any(files) and entry_id=e.id and assignment_id=a.id and storage_state='Ready';
   if affected<>cardinality(files) then raise exception 'Every selected file must finish uploading to this OU assignment.'; end if;
   if e.requires_signed and not coalesce((p_data->>'signed_declared')::boolean,false) then raise exception 'Confirm that the required signed documents are included.'; end if;
   insert into public.repository_submission_versions(submission_id,version,submitted_by,submitted_by_name,submitted_for_ou,on_behalf_reason,signed_declared,file_ids,due_at,entry_version)
     values(s.id,s.version+1,(actor->>'id')::bigint,actor->>'name',a.operating_unit,reason,coalesce((p_data->>'signed_declared')::boolean,false),files,e.due_at,e.version) returning * into receipt;
   update public.repository_submissions set version=version+1,updated_at=clock_timestamp() where id=s.id;
   perform public.resource_audit(actor,'repository',e.id::text,'Submitted',jsonb_build_object('assignment_id',a.id,'receipt_id',receipt.id,'version',receipt.version,'on_behalf',a.operating_unit<>actor->>'operatingUnit','reason',reason));
   response:=to_jsonb(receipt);

 elsif p_action in ('submission_return','submission_withdraw') then
   if reason is null then raise exception 'A reason is required.'; end if;
   select * into receipt from public.repository_submission_versions where id=(p_data->>'receipt_id')::uuid;
   if not found then raise exception 'Submission receipt not found.'; end if;
   select * into s from public.repository_submissions where id=receipt.submission_id;
   select * into a from public.repository_assignments where id=s.assignment_id;
   select * into e from public.repository_entries where id=a.entry_id;
   if not public.resource_entry_visible(e,actor) then raise exception 'Submission is unavailable.' using errcode='42501'; end if;
   perform public.resource_period_lock(e.reporting_year,e.quarter);
   select * into s from public.repository_submissions where id=receipt.submission_id for update;
   select * into receipt from public.repository_submission_versions where id=receipt.id for update;
   if p_expected_version is distinct from s.version then raise exception 'Submission changed. Reload it first.' using errcode='40001'; end if;
   if p_action='submission_withdraw' and not (actor->>'is_admin')::boolean and a.operating_unit<>actor->>'operatingUnit' then raise exception 'Access denied.' using errcode='42501'; end if;
   if receipt.invalidated_at is not null or receipt.withdrawn_at is not null then raise exception 'This receipt is already inactive.'; end if;
   update public.repository_submission_versions set invalidated_at=case when p_action='submission_return' then clock_timestamp() end,invalidation_reason=reason,
     withdrawn_at=case when p_action='submission_withdraw' then clock_timestamp() end where id=receipt.id returning * into receipt;
   update public.repository_submissions set version=version+1,updated_at=clock_timestamp() where id=s.id;
   perform public.resource_audit(actor,'repository',a.entry_id::text,p_action,jsonb_build_object('receipt_id',receipt.id,'reason',reason));
   response:=to_jsonb(receipt);

 elsif p_action='ticket_create' then
   if not public.resource_ou(actor->>'operatingUnit') then raise exception 'A valid reporter OU is required.'; end if;
   insert into public.resource_tickets(subject,category,description,reporter_id,reporter_name,reporter_ou)
     values(btrim(p_data->>'subject'),p_data->>'category',btrim(p_data->>'description'),(actor->>'id')::bigint,actor->>'name',actor->>'operatingUnit') returning * into t;
   perform public.resource_audit(actor,'ticket',t.id::text,'Created',jsonb_build_object('code',t.code)); response:=to_jsonb(t);

 elsif p_action in ('ticket_comment','ticket_update','ticket_reopen_request') then
   select * into t from public.resource_tickets where id=(p_data->>'id')::uuid for update;
   if not found or (not (actor->>'is_admin')::boolean and t.reporter_id<>(actor->>'id')::bigint) then raise exception 'Ticket is unavailable.' using errcode='42501'; end if;
   if p_expected_version is distinct from t.version then raise exception 'This ticket changed. Reload it before saving.' using errcode='40001'; end if;
   old_ticket:=t;
   if p_action='ticket_update' then
     perform public.resource_actor(p_session,module_name,'manage');
     if length(btrim(coalesce(p_data->>'comment','')))=0 then raise exception 'Add a comment explaining this update.'; end if;
     if p_data->>'status' not in ('Open','In Progress','Awaiting User','Resolved','Closed') then raise exception 'Choose a valid ticket status.'; end if;
     if p_data->>'priority' not in ('Low','Normal','High','Urgent') then raise exception 'Choose a valid priority.'; end if;
     new_id:=null;
     if nullif(p_data->>'assigned_to','') is not null then
       select * into assigned_user from public.users where id=(p_data->>'assigned_to')::bigint;
       if not found or assigned_user.role not in ('Super Admin','Administrator') then raise exception 'Assign a current administrator.'; end if;
     else assigned_user.id:=null; end if;
     update public.resource_tickets set status=p_data->>'status',priority=p_data->>'priority',assigned_to=assigned_user.id where id=t.id;
   elsif p_action='ticket_reopen_request' and t.status not in ('Resolved','Closed') then raise exception 'Only resolved or closed tickets need a reopening request.';
   elsif p_action='ticket_comment' and t.status='Closed' then raise exception 'Request reopening before adding another comment.'; end if;
   insert into public.resource_ticket_comments(ticket_id,actor_id,actor_name,body) values(t.id,(actor->>'id')::bigint,actor->>'name',btrim(p_data->>'comment'));
   update public.resource_tickets set version=version+1,updated_at=clock_timestamp() where id=t.id returning * into t;
   perform public.resource_audit(actor,'ticket',t.id::text,p_action,jsonb_build_object('previous_status',old_ticket.status,'status',t.status,'previous_priority',old_ticket.priority,'priority',t.priority,'previous_assigned_to',old_ticket.assigned_to,'assigned_to',t.assigned_to,'version',t.version)); response:=to_jsonb(t);

 elsif p_action in ('reportorial_source','reportorial_finalize','reportorial_reopen') then
   if reason is null then raise exception 'Explain this reportorial period change.'; end if;
   if (p_data->>'reporting_year')::integer not between 1900 and 9999 or p_data->>'quarter' not in ('Q1','Q2','Q3','Q4') then raise exception 'Choose a valid reporting period.'; end if;
   perform pg_advisory_xact_lock(hashtextextended('resource-period:'||(p_data->>'reporting_year')||':'||(p_data->>'quarter'),0));
   select * into period from public.reportorial_periods where reporting_year=(p_data->>'reporting_year')::integer and quarter=p_data->>'quarter' for update;
   if not found then
     if coalesce(p_expected_version,0)<>0 then raise exception 'Period changed. Reload first.' using errcode='40001'; end if;
     insert into public.reportorial_periods(reporting_year,quarter) values((p_data->>'reporting_year')::integer,p_data->>'quarter') returning * into period;
   elsif p_expected_version is distinct from period.version then raise exception 'Period changed. Reload first.' using errcode='40001'; end if;
   if p_action='reportorial_source' then
     if period.state='Finalized' then raise exception 'Reopen reportorial inputs before changing their source.'; end if;
     if p_data->>'source' not in ('Manual','Repository') then raise exception 'Select a reportorial source.'; end if;
     period.source:=p_data->>'source';
   elsif p_action='reportorial_finalize' then
     if period.source<>'Repository' or period.state<>'Open' then raise exception 'Only an open repository-backed period can be finalized.'; end if;
     cutoff:=clock_timestamp(); end_at:=(make_date(period.reporting_year,substring(period.quarter,2)::integer*3,1)+interval '1 month') at time zone 'Asia/Manila';
     if cutoff<end_at or exists(select 1 from public.repository_entries future_entry where future_entry.include_awards and future_entry.reporting_year=period.reporting_year and future_entry.quarter=period.quarter and future_entry.published_at is not null and future_entry.due_at>cutoff and exists(select 1 from public.repository_assignments future_assignment where future_assignment.entry_id=future_entry.id and not future_assignment.waived)) then raise exception 'Wait until the period and all included deadlines have ended.'; end if;
     snapshot:=public.resource_reportorial_live(period.reporting_year,period.quarter,cutoff);
     select coalesce(max(version),0)+1 into new_version from public.reportorial_snapshots where reporting_year=period.reporting_year and quarter=period.quarter;
     insert into public.reportorial_snapshots(reporting_year,quarter,version,cutoff,evidence,actor_id,actor_name,reason) values(period.reporting_year,period.quarter,new_version,cutoff,snapshot,(actor->>'id')::bigint,actor->>'name',reason) returning id into period.snapshot_id;
     period.state:='Finalized';
   else
     if period.state<>'Finalized' then raise exception 'This reportorial period is not finalized.'; end if;
     period.state:='Open';
   end if;
   update public.reportorial_periods set source=period.source,state=period.state,snapshot_id=period.snapshot_id,version=version+1,updated_at=clock_timestamp() where reporting_year=period.reporting_year and quarter=period.quarter returning * into period;
   perform public.resource_audit(actor,'reportorial',period.reporting_year||':'||period.quarter,p_action,jsonb_build_object('reason',reason,'snapshot_id',period.snapshot_id,'version',period.version,'source',period.source)); response:=to_jsonb(period);
 elsif p_action='session_end' then
   update public.resource_sessions set revoked_at=clock_timestamp() where token_hash=public.resource_digest(p_session); response:=jsonb_build_object('signed_out',true);
 end if;

 if response is null then raise exception 'The resource operation did not return a result.'; end if;
 if p_action<>'session_end' then perform public.resource_actor(p_session,module_name,permission_name); end if;
 insert into public.resource_requests(actor_id,request_id,action,payload_hash,response) values((actor->>'id')::bigint,p_request_id,p_action,payload_hash,response);
 return response;
end $$;

create or replace function public.resource_file_ready(p_session text,p_file_id uuid,p_drive_file_id text,p_drive_folder_id text,p_connection_id text,p_sha256 text,p_lease_id uuid default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor jsonb; f public.repository_files%rowtype; e public.repository_entries%rowtype; a public.repository_assignments%rowtype; begin
 actor:=public.resource_actor(p_session,'Documentary Repository','edit');
 select * into f from public.repository_files where id=p_file_id for update;
 if not found or f.uploaded_by<>(actor->>'id')::bigint then raise exception 'Upload intent is unavailable.' using errcode='42501'; end if;
 select * into e from public.repository_entries where id=f.entry_id for share;
 if not public.resource_entry_visible(e,actor) then raise exception 'Upload authorization changed.' using errcode='42501'; end if;
 if f.storage_state<>'Ready' and e.state in ('Closed','Archived') then raise exception 'Reopen this entry before continuing its upload.'; end if;
 if f.assignment_id is null then perform public.resource_actor(p_session,'Documentary Repository','manage');
 else
   select * into a from public.repository_assignments where id=f.assignment_id;
   if e.state<>'Published' or a.waived or (not (actor->>'is_admin')::boolean and a.operating_unit<>actor->>'operatingUnit') then raise exception 'Upload authorization changed.' using errcode='42501'; end if;
 end if;
 if p_drive_file_id is null or length(p_drive_file_id) not between 1 and 256 or p_drive_folder_id is null or p_connection_id is null or p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'Confirmed storage metadata is required.'; end if;
 if (f.drive_file_id is not null and f.drive_file_id<>p_drive_file_id) or (f.connection_id is not null and f.connection_id<>p_connection_id) or (f.drive_folder_id is not null and f.drive_folder_id<>p_drive_folder_id) then raise exception 'Confirmed storage identity does not match this upload.'; end if;
 if f.storage_state='Ready' then
   if f.drive_file_id<>p_drive_file_id or f.sha256<>p_sha256 then raise exception 'This upload was already registered with different content.'; end if;
 else
   if nullif(to_jsonb(f)->>'upload_lease_id','') is not null and ((to_jsonb(f)->>'upload_lease_id')::uuid is distinct from p_lease_id or (to_jsonb(f)->>'upload_lease_expires_at')::timestamptz<=clock_timestamp()) then raise exception 'Upload lease expired. Check upload status before retrying.' using errcode='40001'; end if;
   if f.storage_state in ('Failed','CleanupRequired') then raise exception 'This upload cannot be registered until its storage issue is resolved.'; end if;
   update public.repository_files set storage_state='Ready',drive_file_id=p_drive_file_id,drive_folder_id=p_drive_folder_id,connection_id=p_connection_id,sha256=p_sha256,ready_at=clock_timestamp(),upload_session_secret=null,failure_reason=null where id=f.id returning * into f;
   perform public.resource_audit(actor,'repository',f.entry_id::text,'File uploaded',jsonb_build_object('file_id',f.id,'assignment_id',f.assignment_id));
 end if;
 return to_jsonb(f)-'upload_session_secret';
end $$;

create or replace function public.resource_immutable_history() returns trigger language plpgsql set search_path=public,pg_temp as $$begin
 raise exception 'Resource history is append-only.' using errcode='42501';
end $$;
create or replace function public.resource_guard_receipt() returns trigger language plpgsql set search_path=public,pg_temp as $$begin
 if tg_op='DELETE' then raise exception 'Submission receipts cannot be deleted.' using errcode='42501'; end if;
 if (to_jsonb(new)-array['invalidated_at','invalidation_reason','withdrawn_at']) is distinct from (to_jsonb(old)-array['invalidated_at','invalidation_reason','withdrawn_at']) then raise exception 'Submitted content and timestamps are immutable.' using errcode='42501'; end if;
 if old.invalidated_at is not null or old.withdrawn_at is not null then raise exception 'Inactive receipts cannot be rewritten.' using errcode='42501'; end if;
 if (new.invalidated_at is null and new.withdrawn_at is null) or (new.invalidated_at is not null and new.withdrawn_at is not null) or length(btrim(coalesce(new.invalidation_reason,'')))=0 then raise exception 'A reasoned return or withdrawal is required.'; end if;
 return new;
end $$;
create or replace function public.resource_guard_file() returns trigger language plpgsql set search_path=public,pg_temp as $$begin
 if tg_op='DELETE' then raise exception 'File metadata must be retained.' using errcode='42501'; end if;
 if old.storage_state='Ready' and (to_jsonb(new)-'display_name') is distinct from (to_jsonb(old)-'display_name') then raise exception 'Uploaded originals are immutable.' using errcode='42501'; end if;
 return new;
end $$;
do $$ declare n text; begin
 foreach n in array array['resource_events','repository_entry_revisions','reportorial_snapshots','resource_ticket_comments','resource_requests'] loop
   if not exists(select 1 from pg_trigger where tgrelid=('public.'||n)::regclass and tgname='resource_history_immutable') then
     execute format('create trigger resource_history_immutable before update or delete on public.%I for each row execute function public.resource_immutable_history()',n);
   end if;
 end loop;
 if not exists(select 1 from pg_trigger where tgrelid='public.repository_submission_versions'::regclass and tgname='resource_receipt_guard') then create trigger resource_receipt_guard before update or delete on public.repository_submission_versions for each row execute function public.resource_guard_receipt(); end if;
 if not exists(select 1 from pg_trigger where tgrelid='public.repository_files'::regclass and tgname='resource_file_guard') then create trigger resource_file_guard before update or delete on public.repository_files for each row execute function public.resource_guard_file(); end if;
end $$;

do $$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('resource_entry_snapshot','resource_record_entry','resource_assert_assignment','resource_reportorial_live','resource_mutate','resource_file_ready','resource_period_lock','resource_check_retry','resource_immutable_history','resource_guard_receipt','resource_guard_file') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
commit;
