import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createNativePostgresFixture} from './helpers/dcf-native-postgres-fixture.mjs';
import {createDcfRevisionFixture,insertParent,domains} from './helpers/dcf-revision-fixture.mjs';
import {defaultAnnualPolicy} from '../lib/awardAnnualPolicy.ts';
import {bundleAwardsCalculator} from './helpers/awards-calculator-bundle.mjs';

const runtime=process.env.NATIVE_PG_DRIVER_RUNTIME||path.join(tmpdir(),'4kis-resources-native-driver');
const calculatorBundle=await bundleAwardsCalculator(),{calculateCapturedAwards}=await import('data:text/javascript;base64,'+Buffer.from(calculatorBundle.code).toString('base64'));
const native=await createNativePostgresFixture({driverRuntime:runtime,postgresRuntime:runtime}),db=native.primary;
let a,b,passed=0;
const call=async(client,name,args)=>(await client.query(`select ${name}(${Object.keys(args).map((k,i)=>`${k}=>$${i+1}`).join(',')}) value`,Object.values(args).map(v=>v!==null&&typeof v==='object'?JSON.stringify(v):v))).rows[0].value;
const outcome=p=>p.then(value=>({ok:true,value}),error=>({ok:false,error}));
const waiting=async()=>{const until=Date.now()+6000;while(Date.now()<until){const row=(await db.query('select state,wait_event_type from pg_stat_activity where pid=$1',[b.pid])).rows[0];if(row?.state==='active'&&row.wait_event_type==='Lock')return;await delay(20);}throw new Error('Expected native backend did not reach a lock wait.');};
const check=async(name,run)=>{try{await run();passed++;console.log('PASS '+name);}finally{await a.exec('rollback');await b.exec('rollback');}};
try{
    await createDcfRevisionFixture({seed:false,database:db});
    for(const name of ['202611030002_dcf_revision_mutations.sql','202611200001_resources_foundation.sql','202611200002_resources_workflows.sql','202611200003_resources_reads.sql','202606290001_award_rankings.sql','202611250002_awards_versioned_results.sql','202611250003_awards_source_capture.sql','202611260001_awards_controller_privacy.sql'])await db.exec(await readFile('supabase/migrations/'+name,'utf8'));
    a=await native.connect();b=await native.connect();b.pid=(await b.query('select pg_backend_pid() pid')).rows[0].pid;
    assert.equal(new Set([native.server.pid,b.pid,(await a.query('select pg_backend_pid() pid')).rows[0].pid]).size,3);
    console.log(JSON.stringify({server:native.server,artifacts:native.artifacts}));
    const token=(await call(db,'resource_start_session',{p_identifier:'admin',p_password:'fixture-password'})).token;
    const policy={...defaultAnnualPolicy(2026),mode:'Cutoff',transitionApproved:true},scope={ous:['RPMO 1']};
    const save={p_session:token,p_year:2026,p_scope:scope,p_settings:{quarterlyRestPoints:1},p_manual:[],p_policy:policy,p_expected_version:0,p_request_id:randomUUID(),p_reason:'Native fixture reviewed opening policy'};
    const parent=await insertParent(db,domains[1],{operatingUnit:'RPMO 1',fundingYear:2026,name:'Before concurrent change',expenses:[{id:10,amount:100}]});
    const monthly=await insertParent(db,domains[3],{operatingUnit:'RPMO 1',fundYear:2025,annualSalary:100,expenses:[],actualDisbursementOct:20});
    await db.query(`insert into financial_obligations(entity_type,parent_id,item_id,obligation_date,amount) values('activity_expense',$1,'10','2026-10-01',10)`,[parent.id]);
    await check('competing controller changes commit one policy and reject the stale draft after a real lock wait',async()=>{
        await a.exec('begin');await call(a,'award_save_controller',save);
        const pending=outcome(call(b,'award_save_controller',{...save,p_request_id:randomUUID(),p_settings:{quarterlyRestPoints:2}}));
        try{await waiting();await a.exec('commit');const result=await pending;assert(!result.ok);assert.equal(result.error.code,'40001');assert.equal((await db.query('select count(*)::integer n from award_policy_versions')).rows[0].n,1);assert.equal((await db.query('select version from award_controller_state')).rows[0].version,1);}finally{await a.exec('rollback');await pending;}
    });
    await check('response-loss retries on independent backends commit one controller mutation and return the same receipt',async()=>{
        const args={...save,p_expected_version:1,p_policy:null,p_settings:{quarterlyRestPoints:3},p_request_id:randomUUID()};await a.exec('begin');const first=await call(a,'award_save_controller',args);const pending=outcome(call(b,'award_save_controller',args));
        try{await waiting();await a.exec('commit');const result=await pending;assert(result.ok,result.error?.message);assert.deepEqual(result.value,first);assert.equal((await db.query('select version from award_controller_state')).rows[0].version,2);}finally{await a.exec('rollback');await pending;}
    });
    // A test-only lock barrier surrounds the actual STABLE helper. It changes no
    // source values and lets another backend commit between parent and ledger reads.
    await db.exec(`alter function award_source_stage(text,bigint,text,jsonb,text,text) rename to fixture_award_source_stage_actual;
      create function award_source_stage(p_type text,p_parent bigint,p_item text,p_line jsonb,p_stage text,p_year text) returns jsonb
      language plpgsql stable security definer set search_path=public,pg_temp as $$begin
        perform pg_advisory_xact_lock(90342617);
        return fixture_award_source_stage_actual(p_type,p_parent,p_item,p_line,p_stage,p_year);
      end $$;`);
    let captured;
    const captureArgs={p_session:token,p_year:2026,p_scope:scope};
    await check('one MVCC capture cannot mix an old parent with newly committed financial amounts',async()=>{
        await a.exec('begin');await a.exec('select pg_advisory_xact_lock(90342617)');const pending=outcome(call(b,'award_capture_sources',captureArgs));
        try{
            await waiting();await db.exec('begin');await db.query(`update activities set name='After concurrent change' where id=$1`,[parent.id]);await db.query(`update financial_obligations set amount=25 where parent_id=$1 and entity_type='activity_expense'`,[parent.id]);await db.exec('commit');await a.exec('commit');
            const result=await pending;assert(result.ok,result.error?.message);captured=result.value;
            const record=captured.inputs.records.find(r=>r.entityType==='activities'&&r.record.id===parent.id);assert.equal(record.record.name,'Before concurrent change');assert.equal(record.financial[0].obligation.entries[0].amount,10);
            const legacy=captured.inputs.records.find(r=>r.entityType==='staffing_requirements'&&r.record.id===monthly.id).financial[0].disbursement;assert.equal(legacy.entries[0].month,null);assert.equal(legacy.entries[0].monthOfYear,10);assert.equal(legacy.entries[0].amount,20);assert(!('date' in legacy.entries[0]));
            assert.equal((await call(db,'award_refresh_capture',{p_session:token,p_capture_id:captured.id})).matches,false);
            const fresh=await call(db,'award_capture_sources',captureArgs);const latest=fresh.inputs.records.find(r=>r.entityType==='activities'&&r.record.id===parent.id);assert.equal(latest.record.name,'After concurrent change');assert.equal(latest.financial[0].obligation.entries[0].amount,25);
        }finally{await a.exec('rollback');await db.exec('rollback');await pending;}
    });
    await check('role revocation during capture prevents both evidence disclosure and capture persistence',async()=>{
        const before=(await db.query('select count(*)::integer n from award_calculation_captures')).rows[0].n;
        await a.exec('begin');await a.exec('select pg_advisory_xact_lock(90342617)');const pending=outcome(call(b,'award_capture_sources',captureArgs));
        try{await waiting();await db.exec(`update users set role='User' where id=1`);await a.exec('commit');const result=await pending;assert(!result.ok);assert.equal(result.error.code,'42501');assert.equal((await db.query('select count(*)::integer n from award_calculation_captures')).rows[0].n,before);}finally{await a.exec('rollback');await pending;await db.exec(`update users set role='Super Admin' where id=1`);}
    });
    await check('role revocation during an idempotent retry is checked before returning its cached controller response',async()=>{
        const args={...save,p_expected_version:2,p_policy:null,p_request_id:randomUUID()};await call(db,'award_save_controller',args);
        await a.exec('begin');await a.query(`select pg_advisory_xact_lock(hashtextextended('award-request:1:'||$1,0))`,[args.p_request_id]);const pending=outcome(call(b,'award_save_controller',args));
        try{await waiting();await db.exec(`update users set role='User' where id=1`);await a.exec('commit');const result=await pending;assert(!result.ok);assert.equal(result.error.code,'42501');}finally{await a.exec('rollback');await pending;await db.exec(`update users set role='Super Admin' where id=1`);}
    });
    const cleanScope={ous:['RPMO 2']},clean=await insertParent(db,domains[0],{operatingUnit:'RPMO 2',fundingYear:2025,status:'Completed',estimatedCompletionDate:'2025-12-01',actualCompletionDate:'2026-11-14',details:[{id:10,amount:100,numberOfUnits:1,pricePerUnit:100}]});
    await db.query(`insert into financial_obligations(entity_type,parent_id,item_id,obligation_date,amount) values('subproject_detail',$1,'10','2026-01-01',100)`,[clean.id]);
    await db.query(`insert into financial_disbursements(entity_type,parent_id,item_id,disbursement_date,amount) values('subproject_detail',$1,'10','2026-10-14',50)`,[clean.id]);
    const controller=(year=2026)=>call(db,'award_read_controller',{p_session:token,p_year:year,p_scope:cleanScope});
    const savePolicy=async(p)=>{const c=await controller(p.awardsYear);return call(db,'award_save_controller',{...save,p_year:p.awardsYear,p_scope:cleanScope,p_settings:c.settings,p_policy:p,p_expected_version:c.controller_version,p_request_id:randomUUID(),p_reason:'Reviewed native calculated policy'});};
    const preview=async(year=2026)=>call(db,'award_capture_sources',{p_session:token,p_year:year,p_scope:cleanScope});
    const commitArgs=(c)=>{const snapshot=calculateCapturedAwards(c);assert.equal(snapshot.canFinalize,true,JSON.stringify(snapshot.reconciliation.issues));return {p_session:token,p_capture_id:c.id,p_snapshot:snapshot,p_request_id:randomUUID(),p_reason:'Confirm native trusted calculation'};};
    const history=(year=2026)=>call(db,'award_history',{p_session:token,p_year:year,p_scope:cleanScope});
    await savePolicy(policy);
    let first,second;
    await check('concurrent finalization of one capture/request stores one calculated result and one activation',async()=>{
        const args=commitArgs(await preview());await a.exec('begin');first=await call(a,'award_commit_calculated',args);const pending=outcome(call(b,'award_commit_calculated',args));
        try{await waiting();await a.exec('commit');const result=await pending;assert(result.ok,result.error?.message);assert.deepEqual(result.value,first);assert.equal((await history()).rows.length,1);}finally{await a.exec('rollback');await pending;}
    });
    await check('different concurrent finalizations from the same head reject the stale capture without a third version',async()=>{
        const left=commitArgs(await preview()),right=commitArgs(await preview());await a.exec('begin');second=await call(a,'award_commit_calculated',left);const pending=outcome(call(b,'award_commit_calculated',right));
        try{await waiting();await a.exec('commit');const result=await pending;assert(!result.ok);assert.equal(result.error.code,'40001');assert.equal((await history()).rows.length,2);assert.equal((await history()).head.active_result_id,second.id);}finally{await a.exec('rollback');await pending;}
    });
    await check('a waiting batch restore cannot overwrite a newly confirmed single-year restore',async()=>{
        await a.exec('begin');const restored=await call(a,'award_activate_result',{p_session:token,p_result_id:first.id,p_expected_version:2,p_request_id:randomUUID(),p_reason:'Native restore first version'});
        const pending=outcome(call(b,'award_activate_result_batch',{p_session:token,p_selections:[{resultId:second.id,expectedVersion:2}],p_request_id:randomUUID(),p_reason:'Must lose stale native batch'}));
        try{await waiting();await a.exec('commit');const result=await pending;assert(!result.ok);assert.equal(result.error.code,'40001');assert.equal((await history()).head.version,restored.version);assert.equal((await history()).head.active_result_id,first.id);}finally{await a.exec('rollback');await pending;}
    });
    await check('dependent calculated years prepare without circular activation and switch atomically against a competing restore',async()=>{
        const previous=(await call(db,'award_read_result',{p_session:token,p_result_id:first.id}));
        await savePolicy({...defaultAnnualPolicy(2027,{id:first.id,policy:previous.snapshot.policy}),mode:'Cutoff',transitionApproved:true});
        const oldNext=await call(db,'award_commit_calculated',commitArgs(await preview(2027)));assert.equal(oldNext.activation_pending,false);
        await savePolicy({...policy,physicalCutoff:'2026-11-30'});
        const pending26=await call(db,'award_commit_calculated',commitArgs(await preview()));assert.equal(pending26.activation_pending,true);
        const candidate=await call(db,'award_read_result',{p_session:token,p_result_id:pending26.id});
        await savePolicy({...defaultAnnualPolicy(2027,{id:pending26.id,policy:candidate.snapshot.policy}),mode:'Cutoff',transitionApproved:true});
        const pending27=await call(db,'award_commit_calculated',commitArgs(await preview(2027)));assert.equal(pending27.activation_pending,true);
        const before26=(await history()).head,before27=(await history(2027)).head;
        assert.equal(before26.active_result_id,first.id);assert.equal(before27.active_result_id,oldNext.id);
        await a.exec('begin');const activated=await call(a,'award_activate_result_batch',{p_session:token,p_selections:[{resultId:pending26.id,expectedVersion:before26.version},{resultId:pending27.id,expectedVersion:before27.version}],p_request_id:randomUUID(),p_reason:'Confirm paired calculated native reconciliation'});
        const pending=outcome(call(b,'award_activate_result',{p_session:token,p_result_id:first.id,p_expected_version:before26.version,p_request_id:randomUUID(),p_reason:'Must not overwrite paired activation'}));
        try{await waiting();await a.exec('commit');const result=await pending;assert(!result.ok);assert.equal(result.error.code,'40001');assert.deepEqual(activated.heads.map(h=>h.active_result_id),[pending26.id,pending27.id]);assert.equal((await history()).head.active_result_id,pending26.id);assert.equal((await history(2027)).head.active_result_id,pending27.id);}finally{await a.exec('rollback');await pending;}
    });
    console.log(`${passed} native PostgreSQL Awards concurrency checks passed, including trusted calculated finalization and dependent-year activation. UI/export integration remains outstanding.`);
}catch(error){console.error(error.message);if(error.where)console.error(error.where);process.exitCode=1;}finally{await native.close();}
