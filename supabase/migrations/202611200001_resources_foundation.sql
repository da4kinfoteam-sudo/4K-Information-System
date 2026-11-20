-- New resources only. Existing business records, deadlines and award inputs are untouched.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '90s';

create table if not exists public.resource_sessions (
  token_hash text primary key, actor_id bigint not null references public.users(id) on delete cascade,
  credential_hash text not null, created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null, revoked_at timestamptz
);
create index if not exists resource_sessions_actor_idx on public.resource_sessions(actor_id, expires_at);
create table if not exists public.resource_auth_attempts (
  identifier_hash text primary key, window_started_at timestamptz not null, attempts integer not null
);
create table if not exists public.resource_requests (
  actor_id bigint not null, request_id uuid not null, action text not null, payload_hash text not null,
  response jsonb not null, created_at timestamptz not null default clock_timestamp(),
  primary key(actor_id, request_id)
);
create table if not exists public.repository_entries (
  id uuid primary key default gen_random_uuid(), parent_id uuid references public.repository_entries(id),
  kind text not null check(kind in ('Folder','File')), subject text not null check(length(btrim(subject)) between 1 and 240),
  instructions text not null default '' check(length(instructions)<=20000),
  state text not null default 'Draft' check(state in ('Draft','Published','Closed','Archived')),
  required_submission boolean not null default false, requires_signed boolean not null default true,
  reporting_year integer check(reporting_year between 1900 and 9999), quarter text check(quarter in ('Q1','Q2','Q3','Q4')),
  include_awards boolean not null default false, due_at timestamptz,
  audience_ous text[], created_by bigint, created_by_name text not null,
  created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
  published_at timestamptz, version integer not null default 1,
  check(not required_submission or (kind='Folder' and reporting_year is not null and due_at is not null)),
  check(not include_awards or (required_submission and quarter is not null)), check(parent_id is distinct from id)
);
create index if not exists repository_entries_list_idx on public.repository_entries(state, reporting_year, updated_at desc, id);
create index if not exists repository_entries_parent_idx on public.repository_entries(parent_id, updated_at desc);
create index if not exists repository_entries_due_idx on public.repository_entries(due_at) where required_submission;
create table if not exists public.repository_assignments (
  id uuid primary key default gen_random_uuid(), entry_id uuid not null references public.repository_entries(id),
  operating_unit text not null, waived boolean not null default false, waiver_reason text,
  created_at timestamptz not null default clock_timestamp(), unique(entry_id,operating_unit)
);
create table if not exists public.repository_files (
  id uuid primary key default gen_random_uuid(), entry_id uuid not null references public.repository_entries(id),
  assignment_id uuid references public.repository_assignments(id), upload_request_id uuid not null,
  file_name text not null check(length(file_name) between 1 and 255), display_name text,
  mime_type text not null, file_size bigint not null check(file_size>0), sha256 text,
  expected_sha256 text check(expected_sha256 is null or expected_sha256 ~ '^[a-f0-9]{64}$'),
  storage_state text not null default 'Reserved' check(storage_state in ('Reserved','Uploading','Ready','Failed','CleanupRequired')),
  drive_file_id text unique, drive_folder_id text, connection_id text, upload_session_secret text,
  uploaded_by bigint not null, uploaded_by_name text not null,
  created_at timestamptz not null default clock_timestamp(), ready_at timestamptz, failure_reason text,
  unique(uploaded_by,upload_request_id), check(storage_state<>'Ready' or (drive_file_id is not null and ready_at is not null and sha256 is not null))
);
create index if not exists repository_files_entry_idx on public.repository_files(entry_id,assignment_id,created_at desc);
create table if not exists public.repository_drive_folders (
  identity_key text primary key, folder_id text, connection_id text, lease_id uuid,
  lease_expires_at timestamptz, created_at timestamptz not null default clock_timestamp()
);
create table if not exists public.repository_submissions (
  id uuid primary key default gen_random_uuid(), assignment_id uuid not null unique references public.repository_assignments(id),
  version integer not null default 0, updated_at timestamptz not null default clock_timestamp()
);
create table if not exists public.repository_submission_versions (
  id uuid primary key default gen_random_uuid(), submission_id uuid not null references public.repository_submissions(id),
  version integer not null, submitted_at timestamptz not null default clock_timestamp(),
  submitted_by bigint not null, submitted_by_name text not null, submitted_for_ou text not null,
  on_behalf_reason text, signed_declared boolean not null, file_ids uuid[] not null check(cardinality(file_ids)>0),
  due_at timestamptz not null, entry_version integer not null,
  invalidated_at timestamptz, invalidation_reason text, withdrawn_at timestamptz,
  unique(submission_id,version)
);
create index if not exists repository_receipts_submission_idx on public.repository_submission_versions(submission_id,submitted_at,id);
create table if not exists public.repository_entry_revisions (
  id uuid primary key default gen_random_uuid(), entry_id uuid not null references public.repository_entries(id),
  version integer not null, snapshot jsonb not null, actor_id bigint not null, actor_name text not null,
  reason text, created_at timestamptz not null default clock_timestamp(), unique(entry_id,version)
);
create table if not exists public.reportorial_periods (
  reporting_year integer not null check(reporting_year between 1900 and 9999), quarter text not null check(quarter in ('Q1','Q2','Q3','Q4')),
  source text not null default 'Manual' check(source in ('Manual','Repository')),
  state text not null default 'Open' check(state in ('Open','Finalized')),
  version integer not null default 1, snapshot_id uuid, updated_at timestamptz not null default clock_timestamp(),
  primary key(reporting_year,quarter)
);
create table if not exists public.reportorial_snapshots (
  id uuid primary key default gen_random_uuid(), reporting_year integer not null, quarter text not null,
  version integer not null, cutoff timestamptz not null, rule_version text not null default 'on-time-1-late-0.5-v1',
  evidence jsonb not null, actor_id bigint not null, actor_name text not null, reason text,
  created_at timestamptz not null default clock_timestamp(), unique(reporting_year,quarter,version)
);
create sequence if not exists public.resource_ticket_code_seq;
create table if not exists public.resource_tickets (
  id uuid primary key default gen_random_uuid(), code text not null unique default ('TKT-'||to_char(clock_timestamp() at time zone 'Asia/Manila','YYYY')||'-'||lpad(nextval('public.resource_ticket_code_seq')::text,6,'0')),
  subject text not null check(length(btrim(subject)) between 1 and 240),
  category text not null check(category in ('Bug Report','Data Correction','System Change Request','Improvement Request','Other')),
  description text not null check(length(btrim(description)) between 1 and 20000),
  status text not null default 'Open' check(status in ('Open','In Progress','Awaiting User','Resolved','Closed')),
  priority text not null default 'Normal' check(priority in ('Low','Normal','High','Urgent')),
  reporter_id bigint not null, reporter_name text not null, reporter_ou text not null,
  assigned_to bigint references public.users(id) on delete set null, version integer not null default 1,
  created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp()
);
create index if not exists resource_tickets_owner_idx on public.resource_tickets(reporter_id,updated_at desc,id);
create index if not exists resource_tickets_list_idx on public.resource_tickets(status,updated_at desc,id);
create table if not exists public.resource_ticket_comments (
  id uuid primary key default gen_random_uuid(), ticket_id uuid not null references public.resource_tickets(id),
  actor_id bigint not null, actor_name text not null, body text not null check(length(btrim(body)) between 1 and 20000),
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists resource_comments_ticket_idx on public.resource_ticket_comments(ticket_id,created_at,id);
create table if not exists public.resource_events (
  id bigint generated always as identity primary key, entity_type text not null, entity_id text not null,
  event text not null, actor_id bigint not null, actor_name text not null, detail jsonb not null default '{}',
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists resource_events_entity_idx on public.resource_events(entity_type,entity_id,id desc);

-- Only missing permissions for these two modules are seeded. Existing rows are preserved.
insert into public.roles_config(role,module,can_view,can_edit,can_delete,can_manage,visibility_scope)
select r,m,r<>'Guest',r<>'Guest',r in ('Super Admin','Administrator'),r in ('Super Admin','Administrator'),'All OUs'
from unnest(array['Super Admin','Administrator','Management','Focal - User','RFO - User','User','Guest']) r
cross join unnest(array['Documentary Repository','Submit Ticket']) m
where not exists(select 1 from public.roles_config c where c.role=r and c.module=m);

create or replace function public.resource_digest(p_value text) returns text
language sql immutable strict set search_path=public,pg_temp as $$select encode(sha256(convert_to(p_value,'UTF8')),'hex')$$;

create or replace function public.resource_start_session(p_identifier text,p_password text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.users%rowtype; k text; attempts public.resource_auth_attempts%rowtype; token text; until_at timestamptz;
begin
  if length(coalesce(p_identifier,'')) not between 1 and 320 or length(coalesce(p_password,'')) not between 1 and 1024 then return jsonb_build_object('error','Unable to verify your account.'); end if;
  k:=public.resource_digest(lower(btrim(p_identifier)));
  perform pg_advisory_xact_lock(hashtextextended('resource-login:'||k,0));
  select * into attempts from public.resource_auth_attempts where identifier_hash=k for update;
  if found and attempts.window_started_at>clock_timestamp()-interval '15 minutes' and attempts.attempts>=10 then return jsonb_build_object('error','Too many attempts. Try again later.'); end if;
  insert into public.resource_auth_attempts values(k,clock_timestamp(),1)
  on conflict(identifier_hash) do update set window_started_at=case when resource_auth_attempts.window_started_at<=clock_timestamp()-interval '15 minutes' then clock_timestamp() else resource_auth_attempts.window_started_at end,
    attempts=case when resource_auth_attempts.window_started_at<=clock_timestamp()-interval '15 minutes' then 1 else resource_auth_attempts.attempts+1 end;
  select u.* into a from public.users u where lower(coalesce(to_jsonb(u)->>'username',''))=lower(btrim(p_identifier)) or lower(coalesce(to_jsonb(u)->>'email',''))=lower(btrim(p_identifier)) order by u.id limit 1;
  if not found or coalesce(to_jsonb(a)->>'password','')<>p_password or coalesce(to_jsonb(a)->>'is_active','true')='false' then return jsonb_build_object('error','Unable to verify your account.'); end if;
  if a.role='Guest' then return jsonb_build_object('error','This account cannot access Resources.'); end if;
  token:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
  until_at:=clock_timestamp()+interval '15 minutes';
  insert into public.resource_sessions(token_hash,actor_id,credential_hash,expires_at)
    values(public.resource_digest(token),a.id,public.resource_digest(p_password),until_at);
  delete from public.resource_auth_attempts where identifier_hash=k;
  return jsonb_build_object('token',token,'expires_at',until_at,'actor',jsonb_build_object('id',a.id,'name',coalesce(to_jsonb(a)->>'fullName',to_jsonb(a)->>'username'),'operatingUnit',to_jsonb(a)->>'operatingUnit','role',a.role));
end $$;

create or replace function public.resource_actor(p_session text,p_module text,p_action text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.users%rowtype; s public.resource_sessions%rowtype; permission jsonb; c public.roles_config%rowtype; allowed boolean;
begin
  if p_module not in ('Documentary Repository','Submit Ticket') or p_action not in ('view','edit','delete','manage') then raise exception 'Unsupported resource capability.' using errcode='22023'; end if;
  if p_session is null or length(p_session)<>64 then raise exception 'Verify your account to continue.' using errcode='28000'; end if;
  select * into s from public.resource_sessions where token_hash=public.resource_digest(p_session) and revoked_at is null and expires_at>clock_timestamp();
  if not found then raise exception 'Your Resources session expired. Verify your account again.' using errcode='28000'; end if;
  select * into a from public.users where id=s.actor_id;
  if not found or public.resource_digest(coalesce(to_jsonb(a)->>'password',''))<>s.credential_hash or coalesce(to_jsonb(a)->>'is_active','true')='false' then raise exception 'Your account session is no longer valid.' using errcode='28000'; end if;
  if a.role='Guest' then raise exception 'Access denied.' using errcode='42501'; end if;
  if a.role='Super Admin' then allowed:=true;
  else
    permission:=to_jsonb(a)->'permissions_override'->p_module;
    select * into c from public.roles_config where role=a.role and module=p_module;
    allowed:=case when jsonb_typeof(permission->('can_'||p_action))='boolean' then (permission->>('can_'||p_action))::boolean else coalesce((to_jsonb(c)->>('can_'||p_action))::boolean,false) end;
    if p_action<>'view' and not coalesce(case when jsonb_typeof(permission->'can_view')='boolean' then (permission->>'can_view')::boolean else c.can_view end,false) then allowed:=false; end if;
  end if;
  if not coalesce(allowed,false) or (p_action='manage' and a.role not in ('Super Admin','Administrator')) then raise exception 'Access denied.' using errcode='42501'; end if;
  return jsonb_build_object('id',a.id,'name',coalesce(nullif(to_jsonb(a)->>'fullName',''),to_jsonb(a)->>'username','User '||a.id),'operatingUnit',coalesce(to_jsonb(a)->>'operatingUnit',''),'role',a.role,
    'can_edit',a.role='Super Admin' or coalesce(case when jsonb_typeof(permission->'can_edit')='boolean' then (permission->>'can_edit')::boolean else c.can_edit end,false),
    'is_admin',a.role='Super Admin' or (a.role='Administrator' and coalesce(case when jsonb_typeof(permission->'can_manage')='boolean' then (permission->>'can_manage')::boolean else c.can_manage end,false)));
end $$;

create or replace function public.resource_ou(p_ou text) returns boolean
language sql immutable set search_path=public,pg_temp as $$select p_ou='NPMO' or p_ou=any(array['RPMO CAR','RPMO 1','RPMO 2','RPMO 3','RPMO 4A','RPMO 4B','RPMO 5','RPMO 6','RPMO 7','RPMO 8','RPMO 9','RPMO 10','RPMO 11','RPMO 12','RPMO 13','RPMO NIR'])$$;

create or replace function public.resource_entry_visible(p_entry public.repository_entries,p_actor jsonb) returns boolean
language sql stable set search_path=public,pg_temp as $$
  select (p_actor->>'is_admin')::boolean or (p_entry.published_at is not null and p_entry.state in ('Published','Closed','Archived') and (p_entry.audience_ous is null or p_actor->>'operatingUnit'=any(p_entry.audience_ous))
    and (p_entry.parent_id is null or exists(select 1 from public.repository_entries parent where parent.id=p_entry.parent_id and parent.published_at is not null and parent.state in ('Published','Closed','Archived') and (parent.audience_ous is null or p_actor->>'operatingUnit'=any(parent.audience_ous)))))
$$;

create or replace function public.resource_audit(p_actor jsonb,p_type text,p_id text,p_event text,p_detail jsonb default '{}') returns void
language sql security definer set search_path=public,pg_temp as $$
 insert into public.resource_events(entity_type,entity_id,event,actor_id,actor_name,detail) values(p_type,p_id,p_event,(p_actor->>'id')::bigint,p_actor->>'name',p_detail)
$$;

-- Tables, sessions, receipts and helper functions cannot be read or called by browser roles.
do $$ declare n text; f record; begin
  foreach n in array array['resource_sessions','resource_auth_attempts','resource_requests','repository_entries','repository_assignments','repository_files','repository_drive_folders','repository_submissions','repository_submission_versions','repository_entry_revisions','reportorial_periods','reportorial_snapshots','resource_tickets','resource_ticket_comments','resource_events'] loop
    execute format('alter table public.%I enable row level security',n);
    execute format('revoke all on public.%I from public,anon,authenticated',n);
    execute format('grant all on public.%I to service_role',n);
  end loop;
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('resource_digest','resource_start_session','resource_actor','resource_ou','resource_entry_visible','resource_audit') loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
revoke all on sequence public.resource_ticket_code_seq,public.resource_events_id_seq from public,anon,authenticated;
grant usage,select on sequence public.resource_ticket_code_seq,public.resource_events_id_seq to service_role;
commit;
