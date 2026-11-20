import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createResourcesHandler } from '../supabase/functions/_shared/resourcesHttp.ts';

const require = createRequire(path.join(process.env.PGLITE_RUNTIME || path.join(tmpdir(), '4kis-supplement-sql-runtime'), 'package.json'));
const { PGlite } = require('@electric-sql/pglite');
const db = new PGlite();
let passed = 0;
const check = async (name, run) => { await run(); passed++; console.log('PASS ' + name); };
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
const login = async name => (await one('select resource_start_session($1,$2) value', [name, 'fixture-password'])).value;
const mutate = async (token, action, data, version = null, request = randomUUID()) => (await one('select resource_mutate($1,$2,$3,$4,$5) value', [token, action, data, request, version])).value;
const read = async (token, resource, args = {}) => (await one('select resource_read($1,$2,$3) value', [token, resource, args])).value;
const denied = async (run, message) => { await assert.rejects(run, message); };
try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table users(id bigint primary key, username text, email text, password text, role text, "fullName" text, "operatingUnit" text, permissions_override jsonb);
      create table roles_config(id bigint generated always as identity primary key,role text,module text,can_view boolean,can_edit boolean,can_delete boolean,can_manage boolean,visibility_scope text,unique(role,module));
      insert into users values(1,'root','root@example.test','fixture-password','Super Admin','Root','NPMO',null),
       (2,'region1','r1@example.test','fixture-password','User','Region One','RPMO 1',null),
       (3,'region2','r2@example.test','fixture-password','User','Region Two','RPMO 2',null),
       (4,'admin','admin@example.test','fixture-password','Administrator','Administrator','NPMO',null),
       (5,'guest','guest@example.test','fixture-password','Guest','Guest','NPMO',null);
      insert into roles_config(role,module,can_view,can_edit) values('User','Activities',false,false);
      create table deadlines(id bigint primary key,name text,date date); insert into deadlines values(1,'Legacy deadline','2025-03-31');
      create table award_manual_scores(id bigint primary key,reportorial_required integer,reportorial_submitted integer); insert into award_manual_scores values(1,3,2);`);
    const baseline = await one(`select (select jsonb_agg(to_jsonb(d)) from deadlines d) deadlines,(select jsonb_agg(to_jsonb(a)) from award_manual_scores a) awards,(select jsonb_agg(to_jsonb(r)) from roles_config r) roles`);
    for (const name of ['202611200001_resources_foundation.sql', '202611200002_resources_workflows.sql', '202611200003_resources_reads.sql', '202611200004_resources_storage.sql']) {
        await db.exec(await readFile('supabase/migrations/' + name, 'utf8'));
    }
    await check('additive installation preserves legacy data and existing role rows', async () => {
        const now = await one(`select (select jsonb_agg(to_jsonb(d)) from deadlines d) deadlines,(select jsonb_agg(to_jsonb(a)) from award_manual_scores a) awards,(select jsonb_agg(to_jsonb(r)) from roles_config r where module='Activities') roles`);
        assert.deepEqual(now, baseline);
        assert.equal((await one(`select count(*)::integer count from roles_config where module in ('Documentary Repository','Submit Ticket')`)).count, 14);
    });
    const admin = (await login('root')).token, user = (await login('region1')).token, other = (await login('region2')).token;
    await check('credentials are verified, tokens are opaque, sessions are bounded, anonymous and guessed IDs are denied', async () => {
        assert.match(admin, /^[a-f0-9]{64}$/);
        assert((await one('select resource_start_session($1,$2) value', ['root', 'wrong'])).value.error);
        assert((await login('guest')).error);
        await denied(() => one(`select resource_actor($1,'Documentary Repository','view')`, ['1'.repeat(64)]), /session expired/);
        assert.equal((await one('select expires_at-created_at<=interval \'16 minutes\' bounded from resource_sessions where actor_id=1')).bounded, true);
    });
    await check('browser roles cannot read protected tables or execute service-only entry points', async () => {
        assert.equal((await one(`select has_table_privilege('anon','repository_entries','SELECT') allowed`)).allowed, false);
        assert.equal((await one(`select has_function_privilege('anon','resource_mutate(text,text,jsonb,uuid,integer)','EXECUTE') allowed`)).allowed, false);
        assert.equal((await one(`select has_function_privilege('service_role','resource_mutate(text,text,jsonb,uuid,integer)','EXECUTE') allowed`)).allowed, true);
    });
    let folder = await mutate(admin, 'entry_save', { kind: 'Folder', subject: 'Quarterly Signed Report', required_submission: true, reporting_year: 2025, quarter: 'Q1', include_awards: true, due_date: '2025-03-31', assigned_ous: ['RPMO 1', 'RPMO 2'] });
    await check('required folder has stable identity explicit assignments and Philippine end-of-day deadline', async () => {
        assert.equal(folder.assignments.length, 2);
        assert.match(folder.due_at, /^2025-03-31T15:59:59/);
        await denied(() => mutate(user, 'entry_save', { kind: 'Folder', subject: 'Not authorized' }), /Access denied/);
    });
    folder = await mutate(admin, 'entry_publish', { id: folder.id }, folder.version);
    const assignment = folder.assignments.find(item => item.operating_unit === 'RPMO 1');
    let file = await mutate(user, 'file_reserve', { entry_id: folder.id, assignment_id: assignment.id, file_name: 'signed.pdf', file_size: 12, mime_type: 'application/pdf' });
    await check('upload intent does not count and cannot be finalized until storage is confirmed', async () => {
        await denied(() => mutate(user, 'submission_submit', { entry_id: folder.id, assignment_id: assignment.id, file_ids: [file.id], signed_declared: true }, 0), /finish uploading/);
        const live = (await one(`select resource_reportorial_live(2025,'Q1',clock_timestamp()) value`)).value;
        assert.equal(live.rows.find(row => row.operating_unit === 'RPMO 1').credited_units, 0);
        await denied(() => mutate(other, 'file_reserve', { entry_id: folder.id, assignment_id: assignment.id, file_name: 'bad.pdf', file_size: 12, mime_type: 'application/pdf' }), /on-behalf/);
    });
    file = (await one('select resource_file_ready($1,$2,$3,$4,$5,$6) value', [user, file.id, 'synthetic-drive-id', 'synthetic-folder', 'synthetic-connection', 'a'.repeat(64)])).value;
    let receipt;
    await check('submit is versioned idempotent and requires signed attestation', async () => {
        await denied(() => mutate(user, 'submission_submit', { entry_id: folder.id, assignment_id: assignment.id, file_ids: [file.id], signed_declared: false }, 0), /signed documents/);
        const request = randomUUID(), payload = { entry_id: folder.id, assignment_id: assignment.id, file_ids: [file.id], signed_declared: true };
        receipt = await mutate(user, 'submission_submit', payload, 0, request);
        assert.deepEqual(await mutate(user, 'submission_submit', payload, 0, request), receipt);
        assert.equal((await one('select count(*)::integer count from repository_submission_versions')).count, 1);
        await denied(() => mutate(user, 'submission_submit', { ...payload, signed_declared: false }, 0, request), /different changes/);
        await denied(() => mutate(user, 'submission_submit', payload, 0), /changed/);
    });
    await check('late receipts give half credit once and returning them removes live credit', async () => {
        let live = (await one(`select resource_reportorial_live(2025,'Q1',clock_timestamp()) value`)).value;
        assert.equal(live.rows.find(row => row.operating_unit === 'RPMO 1').credited_units, .5);
        const returned = await mutate(admin, 'submission_return', { receipt_id: receipt.id, reason: 'Unsigned fixture' }, 1);
        assert(returned.invalidated_at);
        live = (await one(`select resource_reportorial_live(2025,'Q1',clock_timestamp()) value`)).value;
        assert.equal(live.rows.find(row => row.operating_unit === 'RPMO 1').credited_units, 0);
    });
    await check('ticket creates are idempotent and cross-user comments/status writes are denied', async () => {
        const request = randomUUID(), payload = { subject: 'Synthetic bug', category: 'Bug Report', description: 'A reproducible fixture.' };
        const ticket = await mutate(user, 'ticket_create', payload, null, request);
        assert.deepEqual(await mutate(user, 'ticket_create', payload, null, request), ticket);
        assert.match(ticket.code, /^TKT-\d{4}-\d{6}$/);
        await denied(() => mutate(other, 'ticket_comment', { id: ticket.id, comment: 'Other user' }, 1), /unavailable/);
        await denied(() => mutate(user, 'ticket_update', { id: ticket.id, comment: 'User escalation', status: 'Closed', priority: 'Urgent' }, 1), /Access denied/);
        const updated = await mutate(admin, 'ticket_update', { id: ticket.id, comment: 'Investigating', status: 'In Progress', priority: 'High', assigned_to: 4 }, 1);
        assert.equal(updated.reporter_id, 2);assert.equal(updated.status, 'In Progress');assert.equal(updated.version, 2);
        await denied(() => mutate(user, 'ticket_comment', { id: ticket.id, comment: 'Stale' }, 1), /changed/);
    });
    await check('reportorial modes are explicit and finalized evidence is retained on reopen', async () => {
        assert.equal((await one('select count(*)::integer count from reportorial_periods')).count, 0);
        let period = await mutate(admin, 'reportorial_source', { reporting_year: 2025, quarter: 'Q1', source: 'Repository', reason: 'Fixture activation' }, 0);
        period = await mutate(admin, 'reportorial_finalize', { reporting_year: 2025, quarter: 'Q1', reason: 'Fixture finalization' }, period.version);
        assert.equal(period.state, 'Finalized');assert(period.snapshot_id);
        period = await mutate(admin, 'reportorial_reopen', { reporting_year: 2025, quarter: 'Q1', reason: 'Correct fixture' }, period.version);
        assert.equal(period.state, 'Open');assert.equal((await one('select count(*)::integer count from reportorial_snapshots')).count, 1);
        await denied(() => mutate(admin, 'reportorial_source', { reporting_year: 9999, quarter: 'Q4', source: 'Repository', reason: 'Future' }, 0).then(p => mutate(admin, 'reportorial_finalize', { reporting_year: 9999, quarter: 'Q4', reason: 'Too early' }, p.version)), /period.*ended/);
    });
    await check('draft entries and unsubmitted files remain private while submitted files allow cross-OU reads', async () => {
        const draft = await mutate(admin, 'entry_save', {kind:'Folder',subject:'Private draft'});
        await denied(() => read(user,'entry',{id:draft.id}),/unavailable/);
        assert.equal((await read(user,'entries')).rows.some(row=>row.id===draft.id),false);
        const reserved = await mutate(user,'file_reserve',{entry_id:folder.id,assignment_id:assignment.id,file_name:'draft.pdf',mime_type:'application/pdf',file_size:12});
        assert.equal((await read(other,'files',{id:folder.id})).rows.some(row=>row.id===reserved.id),false);
        assert.equal((await read(user,'files',{id:folder.id})).rows.some(row=>row.id===reserved.id),true);
        const shared=(await read(other,'files',{id:folder.id})).rows.find(row=>row.id===file.id);
        assert(shared);assert.equal(shared.drive_file_id,undefined);assert.equal(shared.upload_session_secret,undefined);
        await denied(()=>one('select resource_file_authorize($1,$2)',[other,reserved.id]),/unavailable/);
        assert.equal((await one('select resource_file_authorize($1,$2) value',[other,file.id])).value.id,file.id);
        await denied(()=>read(other,'upload_intent',{file_id:reserved.id}),/unavailable/);
        assert.equal((await read(other,'assignments',{id:folder.id})).rows.find(row=>row.id===assignment.id).status,'Returned For Correction');
        assert.equal((await read(other,'versions',{id:folder.id,assignment_id:assignment.id})).total,1);
    });
    await check('entry audiences, inherited audiences, paging and allowed read keys are enforced',async()=>{
        let parent=await mutate(admin,'entry_save',{kind:'Folder',subject:'Restricted',audience_ous:['RPMO 1']});
        parent=await mutate(admin,'entry_publish',{id:parent.id},parent.version);
        let child=await mutate(admin,'entry_save',{kind:'Folder',subject:'Restricted child',parent_id:parent.id});
        child=await mutate(admin,'entry_publish',{id:child.id},child.version);
        assert.equal((await read(user,'entry',{id:child.id})).id,child.id);
        await denied(()=>read(other,'entry',{id:child.id}),/unavailable/);
        const page=await read(admin,'entries',{page_size:1});assert.equal(page.rows.length,1);assert(page.total>1);
        assert.equal((await read(admin,'entries',{page_size:10000})).page_size,100);
        await denied(()=>read(user,'users'),/Unsupported/);
    });
    await check('ticket reads and comments are owner-only even for another account in the same OU',async()=>{
        await db.exec("insert into users values(6,'sameou','same@example.test','fixture-password','User','Same OU','RPMO 1',null)");
        const peer=(await login('sameou')).token;
        const own=(await read(user,'tickets')).rows[0];assert(own);
        assert.equal((await read(peer,'tickets')).total,0);
        for(const resource of ['ticket','ticket_comments','ticket_events']) await denied(()=>read(peer,resource,{id:own.id}),/unavailable/);
        assert((await read(admin,'ticket_comments',{id:own.id})).total>=1);
        assert((await read(admin,'ticket_events',{id:own.id})).total>=1);
        await denied(()=>read(user,'administrators'),/Access denied/);
        const admins=await read(admin,'administrators');assert(admins.rows.length>=2);assert(admins.rows.every(row=>!('password' in row)));
    });
    await check('receipts, original files, audit history, comments and snapshots reject destructive edits',async()=>{
        await denied(()=>db.query('update repository_submission_versions set submitted_at=clock_timestamp() where id=$1',[receipt.id]),/immutable|cannot|receipt/i);
        await denied(()=>db.query('update repository_files set file_name=\'changed.pdf\' where id=$1',[file.id]),/immutable|cannot/i);
        await denied(()=>db.query('delete from repository_files where id=$1',[file.id]),/must be retained/i);
        for(const table of ['resource_events','repository_entry_revisions','reportorial_snapshots','resource_ticket_comments','resource_requests']) {
            await denied(()=>db.exec(`delete from ${table}`),/immutable|append.only|cannot/i);
        }
    });
    await check('live scoring retains fractional credit, N=0, waivers and immutable finalized evidence',async()=>{
        const frozen=(await one('select evidence from reportorial_snapshots limit 1')).evidence;
        const live=(await read(admin,'reportorial',{reporting_year:2025,ous:['RPMO 1']})).periods[0];
        assert.equal(live.source,'Repository');assert(live.summary.rows.every(row=>row.operating_unit==='RPMO 1'));
        const empty=(await one("select resource_reportorial_live(2090,'Q1',clock_timestamp()) value")).value;
        assert.deepEqual(empty.rows,[]);
        const preview=await read(admin,'entry_preview',{id:folder.id,due_date:'2027-12-31'});assert.equal(preview.rows.length,2);
        assert.equal(preview.entry_version,folder.version);
        await denied(()=>read(user,'entry_preview',{id:folder.id,due_date:'2027-12-31'}),/Access denied/);
        assert.deepEqual((await one('select evidence from reportorial_snapshots limit 1')).evidence,frozen);
        assert.equal((await read(admin,'reportorial_snapshots',{reporting_year:2025,quarter:'Q1'})).total,1);
        const deadlines=await read(other,'deadlines',{overdue_only:true});
        assert.equal(deadlines.rows.find(row=>row.id===folder.id).own_status,'Not Submitted');
        assert((await read(admin,'events',{id:folder.id})).total>=2);
    });
    await check('revoking administrator management removes cross-user privilege immediately',async()=>{
        const manager=(await login('admin')).token;
        assert((await read(manager,'tickets')).total>=1);
        await db.exec(`update users set permissions_override='{"Submit Ticket":{"can_manage":false}}' where id=4`);
        assert.equal((await read(manager,'tickets')).total,0);
        await denied(()=>read(manager,'administrators'),/Access denied/);
    });
    await check('HTTP gateway verifies credentials and routes only allowlisted actions into protected SQL',async()=>{
        const handler=createResourcesHandler({origins:['https://fixture.example'],rpc:async(name,args)=>{
            const names=Object.keys(args),query=`select ${name}(${names.map((key,i)=>`${key}=>$${i+1}`).join(',')}) value`;
            return (await one(query,Object.values(args))).value;
        }});
        const request=(body,token,origin='https://fixture.example')=>handler(new Request('https://local.test/resources',{method:'POST',headers:{'content-type':'application/json',origin,...(token?{'x-resource-session':token}:{})},body:JSON.stringify(body)}));
        const missing=await request({action:'read',resource:'entries',user_id:1});assert.equal(missing.status,401);
        assert.equal((await request({action:'session_start',identifier:'root',password:'wrong'})).status,401);
        const verified=await request({action:'session_start',identifier:'region2',password:'fixture-password'});
        assert.equal(verified.status,200);const token=(await verified.json()).token;
        assert.equal((await request({action:'read',resource:'entries'},token)).status,200);
        assert.equal((await request({action:'read',resource:'entries'},token,'https://hostile.example')).status,403);
        assert.equal((await request({action:'mutate',mutation:'resource_file_ready',data:{},request_id:randomUUID()},token)).status,400);
        assert.equal((await request({action:'mutate',mutation:'ticket_create',data:{subject:'Gateway test',description:'Disposable request',category:'Other'},request_id:randomUUID()},token)).status,200);
        const failure=await request({action:'read',resource:'ticket',args:{id:receipt.id}},token);
        assert.equal(failure.status,403);assert(!JSON.stringify(await failure.json()).includes('select '));
        assert.match(failure.headers.get('cache-control'),/no-store/);
    });
    await check('upload and folder leases serialize requests and protect identities and confirmed originals',async()=>{
        const reserved=await mutate(user,'file_reserve',{entry_id:folder.id,assignment_id:assignment.id,file_name:'lease.pdf',mime_type:'application/pdf',file_size:20});
        const claim=async token=>(await one('select resource_upload_claim($1,$2) value',[token,reserved.id])).value;
        await denied(()=>claim(other),/unavailable/);
        const first=await claim(user);assert(first.upload_lease_id);
        await denied(()=>claim(user),/still running/);
        await denied(()=>one('select resource_upload_release($1,$2,$3,$4)',[user,reserved.id,randomUUID(),{}]),/expired/);
        await one('select resource_upload_release($1,$2,$3,$4)',[user,reserved.id,first.upload_lease_id,{storage_state:'Uploading',drive_file_id:'preallocated-id',connection_id:'fixture-connection'}]);
        const second=await claim(user);
        await denied(()=>one('select resource_file_ready($1,$2,$3,$4,$5,$6)',[user,reserved.id,'preallocated-id','fixture-folder','fixture-connection','b'.repeat(64)]),/lease expired/);
        await denied(()=>one('select resource_upload_release($1,$2,$3,$4)',[user,reserved.id,second.upload_lease_id,{drive_file_id:'different-id'}]),/identity/);
        await denied(()=>one('select resource_upload_release($1,$2,$3,$4)',[user,reserved.id,second.upload_lease_id,{uploaded_bytes:21}]),/byte count/);
        await one('select resource_upload_release($1,$2,$3,$4)',[user,reserved.id,second.upload_lease_id,{}]);
        const readyClaim=(await one('select resource_upload_claim($1,$2) value',[user,file.id])).value;
        assert.equal(readyClaim.storage_state,'Ready');
        const lease=randomUUID(),key='fixture-folder';
        await one('select resource_folder_lease($1,$2,$3)',['fixture-folder','connection',lease]);
        await denied(()=>one('select resource_folder_lease($1,$2,$3)',[key,'connection',randomUUID()]),/being prepared/);
        await one('select resource_folder_lease($1,$2,$3,$4)',[key,'connection',lease,'canonical-folder']);
        assert.equal((await one('select resource_folder_lease($1,$2,$3) value',[key,'connection',randomUUID()])).value.folder_id,'canonical-folder');
        await denied(()=>one('select resource_folder_lease($1,$2,$3)',[key,'other-connection',randomUUID()]),/connection changed/);
    });
    await check('100/50/0 receipt evidence yields 50 percent without duplicate waiver or future credit and freezes on finalization',async()=>{
        // Controlled historical fixtures test the calculator's timestamp boundaries; no production/backdated workflow is used.
        let lateReceipt,futureEntry,futureAssignment;
        for(const [kind,submitted] of [['on-time','2024-09-30T15:59:59.999999Z'],['late','2024-10-01T00:00:00Z'],['missing',null],['waived',null],['future',null]]){
            const entry=randomUUID(),assignmentId=randomUUID(),submission=randomUUID(),fileId=randomUUID(),receiptId=randomUUID();
            const due=kind==='future'?'9999-12-31T15:59:59Z':'2024-09-30T15:59:59.999999Z';
            await db.query(`insert into repository_entries(id,kind,subject,state,required_submission,reporting_year,quarter,include_awards,due_at,created_by_name,published_at) values($1,'Folder',$2,'Published',true,2024,'Q3',true,$3,'Fixture','2024-09-01')`,[entry,kind,due]);
            await db.query(`insert into repository_assignments(id,entry_id,operating_unit,waived) values($1,$2,'RPMO 1',$3)`,[assignmentId,entry,kind==='waived']);
            if(kind==='future'){futureEntry=entry;futureAssignment=assignmentId;}
            if(submitted){
                await db.query(`insert into repository_files(id,entry_id,assignment_id,upload_request_id,file_name,mime_type,file_size,storage_state,drive_file_id,sha256,ready_at,uploaded_by,uploaded_by_name) values($1,$2,$3,$4,'signed.pdf','application/pdf',12,'Ready',$5,$6,'2024-09-01',2,'Fixture')`,[fileId,entry,assignmentId,randomUUID(),'fixture-'+fileId,'c'.repeat(64)]);
                await db.query(`insert into repository_submissions(id,assignment_id,version) values($1,$2,1)`,[submission,assignmentId]);
                await db.query(`insert into repository_submission_versions(id,submission_id,version,submitted_at,submitted_by,submitted_by_name,submitted_for_ou,signed_declared,file_ids,due_at,entry_version) values($1,$2,1,$3,2,'Fixture','RPMO 1',true,$4,$5,1)`,[receiptId,submission,submitted,[fileId],due]);
                if(kind==='late')lateReceipt=receiptId;
            }
        }
        const live=(await one(`select resource_reportorial_live(2024,'Q3',clock_timestamp()) value`)).value;
        assert.deepEqual(live.rows[0],{operating_unit:'RPMO 1',required:3,on_time:1,late:1,missing:1,credited_units:1.5,compliance:50});
        let period=await mutate(admin,'reportorial_source',{reporting_year:2024,quarter:'Q3',source:'Repository',reason:'Disposable verification'},0);
        await denied(()=>mutate(admin,'reportorial_finalize',{reporting_year:2024,quarter:'Q3',reason:'Future requirement is not yet due'},period.version),/deadlines have ended/);
        await mutate(admin,'assignment_waive',{id:futureEntry,assignment_id:futureAssignment,waived:true,reason:'Explicit fixture waiver'},1);
        period=await mutate(admin,'reportorial_finalize',{reporting_year:2024,quarter:'Q3',reason:'Freeze fixture evidence'},period.version);
        const frozen=(await one('select evidence from reportorial_snapshots where id=$1',[period.snapshot_id])).evidence;
        assert.equal(frozen.rows[0].compliance,50);
        await mutate(admin,'submission_return',{receipt_id:lateReceipt,reason:'Invalid fixture corrected after finalization'},1);
        const summary=(await read(admin,'reportorial',{reporting_year:2024})).periods.find(row=>row.quarter==='Q3');assert.equal(summary.summary.rows[0].compliance,50);
        assert.equal((await one(`select resource_reportorial_live(2024,'Q3',clock_timestamp()) value`)).value.rows[0].credited_units,1);
    });
    await check('current permissions and changed credentials revoke access including cached retries', async () => {
        const request=randomUUID(), data={subject:'Permission fixture',category:'Other',description:'No production data.'};
        await mutate(user,'ticket_create',data,null,request);
        await db.exec(`update users set permissions_override='{"Submit Ticket":{"can_edit":false}}' where id=2`);
        await denied(()=>mutate(user,'ticket_create',data,null,request),/Access denied/);
        await db.exec(`update users set password='changed' where id=2`);
        await denied(()=>one(`select resource_actor($1,'Documentary Repository','view')`,[user]),/no longer valid/);
    });
    console.log(`${passed} resources SQL checks passed. Disposable local database only.`);
} finally { await db.close(); }
