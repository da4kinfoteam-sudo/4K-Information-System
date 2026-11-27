begin;
set local lock_timeout='5s';
set local statement_timeout='90s';

-- Only resource_read supplies the freshly verified actor. This helper has no browser grant.
create or replace function public.resource_repository_entries(p_actor jsonb,p_args jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
 keys text[]:=array['subject','kind','state','year','due','assigned','own','updated'];
 filters jsonb:=coalesce(p_args->'filters','{}'); f record; item jsonb;
 sort_key text:=coalesce(p_args->>'sort_key','updated');
 direction text:=coalesce(p_args->>'sort_direction','descending');
 facet text:=p_args->>'facet_key'; result jsonb;
 page_number integer:=greatest(1,coalesce((p_args->>'page')::integer,1));
 page_size integer:=least(case when facet is null then 100 else 50 end,greatest(1,coalesce((p_args->>'page_size')::integer,10)));
begin
 if jsonb_typeof(filters)<>'object' or octet_length(filters::text)>65536 then raise exception 'Invalid repository filters.' using errcode='22023'; end if;
 if not sort_key=any(keys) or direction not in ('ascending','descending') or (facet is not null and not facet=any(keys)) then
   raise exception 'Unsupported repository column or sort order.' using errcode='22023';
 end if;
 for f in select * from jsonb_each(filters) loop
   if not f.key=any(keys) or jsonb_typeof(f.value)<>'object' or coalesce(f.value->>'mode','') not in ('include','exclude') or jsonb_typeof(f.value->'values') is distinct from 'array' then
     raise exception 'Invalid repository filter.' using errcode='22023';
   end if;
   if jsonb_array_length(f.value->'values')>100 then raise exception 'Choose at most 100 individual filter values.' using errcode='22023'; end if;
   for item in select * from jsonb_array_elements(f.value->'values') loop
     if jsonb_typeof(item)<>'string' or length(item#>>'{}')>240 then raise exception 'Invalid repository filter value.' using errcode='22023'; end if;
   end loop;
 end loop;
 with scoped as materialized (
   select r.*,
     (select count(*) from public.repository_assignments a where a.entry_id=r.id and not a.waived) assigned_count,
     (select case when a.waived then 'Waived' when exists(
       select 1 from public.repository_submissions s join public.repository_submission_versions v on v.submission_id=s.id
       where s.assignment_id=a.id and v.invalidated_at is null and v.withdrawn_at is null
     ) then 'Submitted' else 'Not Submitted' end from public.repository_assignments a where a.entry_id=r.id and a.operating_unit=p_actor->>'operatingUnit') own_status
   from public.repository_entries r
   where public.resource_entry_visible(r,p_actor)
     and (coalesce(p_args->>'search','')='' or r.subject ilike '%'||left(p_args->>'search',240)||'%')
     and (nullif(p_args->>'state','') is null or r.state=p_args->>'state')
     and (nullif(p_args->>'year','') is null or r.reporting_year=(p_args->>'year')::integer)
     and (not coalesce((p_args->>'required_only')::boolean,false) or r.required_submission)
     and (not coalesce((p_args->>'overdue_only')::boolean,false) or r.due_at<clock_timestamp())
     and (not coalesce((p_args->>'upcoming_only')::boolean,false) or r.due_at>=clock_timestamp())
     and (not coalesce((p_args->>'pending_only')::boolean,false) or exists(
       select 1 from public.repository_assignments a where a.entry_id=r.id and a.operating_unit=p_actor->>'operatingUnit' and not a.waived
       and not exists(select 1 from public.repository_submissions s join public.repository_submission_versions v on v.submission_id=s.id where s.assignment_id=a.id and v.invalidated_at is null and v.withdrawn_at is null)))
     and (not (p_args ? 'parent_id') or r.parent_id is not distinct from nullif(p_args->>'parent_id','')::uuid
       or (facet in ('kind','due','own') and p_args->'parent_id'='null'::jsonb and r.required_submission))
 ), projected as (
   select scoped.*,jsonb_build_object(
     'subject',subject,'kind',case when required_submission then 'Required Folder' else kind end,'state',state,
     'year',coalesce(reporting_year::text,'__blank__'),'assigned',assigned_count::text,
     'own',case when own_status='Not Submitted' then 'Pending My Submission' else coalesce(own_status,'Not Assigned') end,
     'due',case when due_at is null then 'No Deadline' when due_at<clock_timestamp() then 'Overdue' else 'Upcoming' end,
     'updated',to_char(updated_at at time zone 'Asia/Manila','YYYY-MM-DD')) _columns
   from scoped
 ), filtered as materialized (
   select * from projected p where not exists(
     select 1 from jsonb_each(filters) ff where ff.key is distinct from facet
       and (case when ff.value->>'mode'='include' then not ((ff.value->'values') ? (p._columns->>ff.key)) else (ff.value->'values') ? (p._columns->>ff.key) end)
   )
 ), choices as (
   select distinct _columns->>facet value from filtered
   where facet is not null and (coalesce(p_args->>'facet_search','')='' or
     (case when _columns->>facet='__blank__' then 'Not Recorded' else _columns->>facet end) ilike '%'||left(p_args->>'facet_search',240)||'%')
 ), choice_page as (
   select value,case when value='__blank__' then 'Not Recorded' else value end label from choices
   order by case when facet in ('year','assigned') and value<>'__blank__' then value::numeric end asc nulls last,lower(value),value
   limit page_size offset (page_number-1)*page_size
 ), record_page as (
   select * from filtered
   order by
     case when sort_key='subject' and direction='ascending' then lower(subject) end asc nulls last,
     case when sort_key='subject' and direction='descending' then lower(subject) end desc nulls last,
     case when sort_key in ('kind','state','own') and direction='ascending' then _columns->>sort_key end asc nulls last,
     case when sort_key in ('kind','state','own') and direction='descending' then _columns->>sort_key end desc nulls last,
     case when sort_key='year' and direction='ascending' then reporting_year end asc nulls last,
     case when sort_key='year' and direction='descending' then reporting_year end desc nulls last,
     case when sort_key='assigned' and direction='ascending' then assigned_count end asc nulls last,
     case when sort_key='assigned' and direction='descending' then assigned_count end desc nulls last,
     case when sort_key='due' and direction='ascending' then due_at end asc nulls last,
     case when sort_key='due' and direction='descending' then due_at end desc nulls last,
     case when sort_key='updated' and direction='ascending' then updated_at end asc nulls last,
     case when sort_key='updated' and direction='descending' then updated_at end desc nulls last,
     id asc
   limit page_size offset (page_number-1)*page_size
 )
 select case when facet is not null then jsonb_build_object(
   'rows',coalesce((select jsonb_agg(to_jsonb(c)) from choice_page c),'[]'),'total',(select count(*) from choices))
 else jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(r)-'_columns') from record_page r),'[]'),'total',(select count(*) from filtered)) end into result;
 return result;
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
   data:=to_jsonb(e)||jsonb_build_object('parent_subject',(select subject from public.repository_entries where id=e.parent_id),'supporting_file_count',(select count(*) from public.repository_files where entry_id=e.id and assignment_id is null and storage_state='Ready'),'can_manage',(actor->>'is_admin')::boolean,'can_submit',(actor->>'can_edit')::boolean and e.state='Published' and exists(select 1 from public.repository_assignments where entry_id=e.id and operating_unit=actor->>'operatingUnit' and not waived));
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

revoke all on function public.resource_repository_entries(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.resource_repository_entries(jsonb,jsonb) to service_role;
-- CREATE OR REPLACE preserves the existing resource_read signature, security and grants.
commit;

