import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createNativePostgresFixture} from './helpers/dcf-native-postgres-fixture.mjs';
import {createResourcesFixture} from './resources-sql-fixture.mjs';
import {seedReportorialAwards} from './resources-awards-fixture.mjs';
const runtime=process.env.NATIVE_PG_DRIVER_RUNTIME||path.join(tmpdir(),'4kis-resources-native-driver');
const native=await createNativePostgresFixture({driverRuntime:runtime,postgresRuntime:runtime}),db=native.primary;let a,b,passed=0;
const call=async(client,name,args)=>(await client.query(`select ${name}(${Object.keys(args).map((key,index)=>`${key}=>$${index+1}`).join(',')}) value`,Object.values(args))).rows[0].value;
const mutate=(client,token,action,data,version=null,id=randomUUID())=>call(client,'resource_mutate',{p_session:token,p_action:action,p_data:data,p_expected_version:version,p_request_id:id});
const outcome=promise=>promise.then(value=>({ok:true,value}),error=>({ok:false,error}));
const waiting=async()=>{const until=Date.now()+6000;while(Date.now()<until){const row=(await db.query('select state,wait_event_type from pg_stat_activity where pid=$1',[b.pid])).rows[0];if(row?.state==='active'&&row.wait_event_type==='Lock')return;await delay(20);}throw Error('Second backend did not reach an observable lock wait.');};
const check=async(name,run)=>{try{await run();passed++;console.log('PASS '+name);}finally{await a.exec('rollback');await b.exec('rollback');}};
try{
    const {rpc}=await createResourcesFixture({database:db}),seed=await seedReportorialAwards(db,rpc);a=await native.connect();b=await native.connect();b.pid=(await b.query('select pg_backend_pid() pid')).rows[0].pid;
    assert.equal(new Set([native.server.pid,b.pid,(await a.query('select pg_backend_pid() pid')).rows[0].pid]).size,3);console.log(JSON.stringify({server:native.server,artifacts:native.artifacts}));
    const root=seed.token,user=(await rpc('resource_start_session',{p_identifier:'region1',p_password:'fixture-password'})).token;
    let ticket,period,missing,after,submitted;
    await check('same request on two real backends commits one ticket and returns the identical confirmed result',async()=>{
        const id=randomUUID(),data={subject:'Native duplicate request',category:'Other',description:'Disposable native fixture'};await a.exec('begin');ticket=await mutate(a,user,'ticket_create',data,null,id);const pending=outcome(mutate(b,user,'ticket_create',data,null,id));
        try{await waiting();await a.exec('commit');const result=await pending;assert(result.ok,result.error?.message);assert.deepEqual(result.value,ticket);assert.equal((await db.query('select count(*)::int n from resource_tickets')).rows[0].n,1);}finally{await a.exec('rollback');await pending;}
    });
    await check('competing ticket edits reject the stale version and preserve the first comment and status',async()=>{
        await a.exec('begin');await mutate(a,root,'ticket_update',{id:ticket.id,status:'In Progress',priority:'High',comment:'First native update'},ticket.version);const pending=outcome(mutate(b,root,'ticket_update',{id:ticket.id,status:'Resolved',priority:'Low',comment:'Stale native update'},ticket.version));
        try{await waiting();await a.exec('commit');const result=await pending;assert(!result.ok);assert.equal(result.error.code,'40001');assert.equal((await db.query('select status from resource_tickets where id=$1',[ticket.id])).rows[0].status,'In Progress');assert.equal((await db.query('select count(*)::int n from resource_ticket_comments where ticket_id=$1',[ticket.id])).rows[0].n,1);}finally{await a.exec('rollback');await pending;}
    });
    const ready=async(subject)=>{const row=(await db.query('select e.id entry_id,a.id assignment_id from repository_entries e join repository_assignments a on a.entry_id=e.id where e.subject=$1',[subject])).rows[0],id=randomUUID();await db.query(`insert into repository_files(id,entry_id,assignment_id,upload_request_id,file_name,mime_type,file_size,storage_state,drive_file_id,sha256,ready_at,uploaded_by,uploaded_by_name) values($1,$2,$3,$4,'native.pdf','application/pdf',12,'Ready',$5,$6,clock_timestamp(),2,'Native Fixture')`,[id,row.entry_id,row.assignment_id,randomUUID(),'native-'+id,'c'.repeat(64)]);return {...row,file_ids:[id],signed_declared:true,reason:'Native on-behalf test'};};
    await check('submission committed before a waiting finalization is included once in its frozen evidence',async()=>{
        period=await seed.mutate('reportorial_source',{reporting_year:2024,quarter:'Q3',source:'Repository',reason:'Native locking verification'},0);missing=await ready('Missing Report');await a.exec('begin');submitted=await mutate(a,root,'submission_submit',missing,0);const pending=outcome(mutate(b,root,'reportorial_finalize',{reporting_year:2024,quarter:'Q3',reason:'Wait for committed submission'},period.version));
        try{await waiting();await a.exec('commit');const result=await pending;assert(result.ok,result.error?.message);period=result.value;const snapshot=(await db.query('select evidence from reportorial_snapshots where id=$1',[period.snapshot_id])).rows[0].evidence;assert.equal(snapshot.rows[0].credited_units,2);assert(snapshot.evidence.some(row=>row.receipt_id===submitted.id));}finally{await a.exec('rollback');await pending;}
    });
    await check('submission committed after a first finalization is stored but cannot change the frozen snapshot',async()=>{
        let entry=await seed.mutate('entry_save',{kind:'Folder',subject:'Post-Finalization Requirement',required_submission:true,reporting_year:2024,quarter:'Q3',include_awards:true,due_date:'2024-09-30',assigned_ous:['RPMO 1']});entry=await seed.mutate('entry_publish',{id:entry.id},entry.version);after=await ready(entry.subject);period=await seed.mutate('reportorial_reopen',{reporting_year:2024,quarter:'Q3',reason:'Include new disposable requirement'},period.version);
        await a.exec('begin');period=await mutate(a,root,'reportorial_finalize',{reporting_year:2024,quarter:'Q3',reason:'Freeze before competing upload'},period.version);const pending=outcome(mutate(b,root,'submission_submit',after,0));
        try{await waiting();await a.exec('commit');const result=await pending;assert(result.ok,result.error?.message);const frozen=(await seed.read()).periods[2];assert.equal(frozen.summary.rows[0].credited_units,2);const live=(await db.query(`select resource_reportorial_live(2024,'Q3',clock_timestamp()) value`)).rows[0].value;assert.equal(live.rows[0].credited_units,2.5);assert(!frozen.summary.evidence.some(row=>row.receipt_id===result.value.id));}finally{await a.exec('rollback');await pending;}
    });
    await check('return and simultaneous re-submit serialize without deadlock or accepting a stale submission head',async()=>{
        await a.exec('begin');await mutate(a,root,'submission_return',{receipt_id:submitted.id,reason:'Native correction'},1);const pending=outcome(mutate(b,root,'submission_submit',missing,1));
        try{await waiting();await a.exec('commit');const result=await pending;assert(!result.ok);assert.equal(result.error.code,'40001');assert.equal((await db.query('select count(*)::int n from repository_submission_versions where submission_id=$1',[submitted.submission_id])).rows[0].n,1);}finally{await a.exec('rollback');await pending;}
    });
    await check('two upload claims cannot obtain concurrent active leases for one original',async()=>{
        const file=await seed.mutate('file_reserve',{entry_id:missing.entry_id,assignment_id:missing.assignment_id,file_name:'lease.pdf',mime_type:'application/pdf',file_size:12,reason:'Native on-behalf upload'});await a.exec('begin');const lease=await call(a,'resource_upload_claim',{p_session:root,p_file_id:file.id});const pending=outcome(call(b,'resource_upload_claim',{p_session:root,p_file_id:file.id}));
        try{await waiting();await a.exec('commit');const result=await pending;assert(!result.ok);assert.equal(result.error.code,'40001');assert.equal((await db.query('select upload_lease_id from repository_files where id=$1',[file.id])).rows[0].upload_lease_id,lease.upload_lease_id);}finally{await a.exec('rollback');await pending;}
    });
    await check('permission revocation while a retry waits is rechecked before exposing its cached result',async()=>{
        const id=randomUUID(),data={subject:'Revoked retry',category:'Other',description:'Disposable cache proof'};await mutate(db,user,'ticket_create',data,null,id);await a.exec('begin');await a.query("select pg_advisory_xact_lock(hashtextextended('resource-request:2:'||$1,0))",[id]);const pending=outcome(mutate(b,user,'ticket_create',data,null,id));
        try{await waiting();await db.query('update users set permissions_override=$1 where id=2',[{'Submit Ticket':{can_edit:false}}]);await a.exec('commit');const result=await pending;assert(!result.ok,'A cached response must not bypass a permission change during the lock wait');assert.equal(result.error.code,'42501');}finally{await a.exec('rollback');await pending;}
    });
    await check('permission revocation during a ticket-row wait rolls the entire new comment and request back',async()=>{
        await db.query('update users set permissions_override=null where id=2');const id=randomUUID(),version=(await db.query('select version from resource_tickets where id=$1',[ticket.id])).rows[0].version;
        await a.exec('begin');await a.query('select id from resource_tickets where id=$1 for update',[ticket.id]);const pending=outcome(mutate(b,user,'ticket_comment',{id:ticket.id,comment:'Must not be committed after revocation'},version,id));
        try{await waiting();await db.query('update users set permissions_override=$1 where id=2',[{'Submit Ticket':{can_edit:false}}]);await a.exec('commit');const result=await pending;assert(!result.ok);assert.equal(result.error.code,'42501');assert.equal((await db.query('select count(*)::int n from resource_ticket_comments where ticket_id=$1',[ticket.id])).rows[0].n,1);assert.equal((await db.query('select count(*)::int n from resource_requests where request_id=$1',[id])).rows[0].n,0);}finally{await a.exec('rollback');await pending;}
    });
    console.log(`${passed} native PostgreSQL Resources concurrency checks passed. Disposable cluster ${native.artifacts}`);
}finally{await native.close();}
