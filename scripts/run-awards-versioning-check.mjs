import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createResourcesFixture} from './resources-sql-fixture.mjs';
import {awardDate,awardDateInWindow,awardEntryWindowPosition,defaultAnnualPolicy,reconcileAwardFinancialLine,validateAnnualPolicy} from '../lib/awardAnnualPolicy.ts';
const {db,rpc}=await createResourcesFixture();let passed=0;
const check=async(name,run)=>{await run();passed++;console.log('PASS '+name);};
const policy={...defaultAnnualPolicy(2026),mode:'Cutoff',transitionApproved:true};
try{
    await check('strict dates and inclusive recognition windows never enable cutoff mode implicitly',()=>{
        assert.equal(defaultAnnualPolicy(2026).mode,'Legacy');assert.equal(awardDate('2026-02-30'),null);assert.equal(awardDate('2026-11-15T20:00:00Z'),null);
        assert(awardDateInWindow('2026-11-15',policy.physicalStart,policy.physicalCutoff));assert(!awardDateInWindow('2026-11-16',policy.physicalStart,policy.physicalCutoff));
        assert.throws(()=>validateAnnualPolicy({...policy,transitionApproved:false}),/approve/);assert.throws(()=>validateAnnualPolicy({...policy,awardsYear:null}),/invalid/);
        const next=defaultAnnualPolicy(2027,{id:randomUUID(),policy});assert.equal(next.physicalStart,'2026-11-16');assert.equal(next.financialStart,'2026-10-16');
    });
    await check('independent actual dates conserve financial opening and closing balances',()=>{
        const p={...policy,financialStart:'2026-01-01'};
        const value=reconcileAwardFinancialLine(100,[{id:'old-o',date:'2025-12-01',amount:70},{id:'new-o',date:'2026-01-01',amount:20}],[{id:'old-d',date:'2025-12-20',amount:40},{id:'new-d-1',date:'2026-01-02',amount:10},{id:'new-d-2',date:'2026-10-15',amount:20},{id:'next-year',date:'2026-10-16',amount:10}],p);
        assert.equal(value.openingAllotment,60);assert.equal(value.openingUnpaidObligations,30);assert.equal(value.obligations,20);assert.equal(value.disbursements,30);assert.equal(value.obligationBasis,50);assert.equal(value.closingAllotment,30);assert.equal(value.closingUnpaidObligations,20);assert.equal(value.disbursementVsAllotmentRate,50);assert.equal(value.disbursementVsObligationRate,60);assert.deepEqual(value.includedDisbursementIds,['new-d-1','new-d-2']);assert.deepEqual(value.issues,[]);
        assert(reconcileAwardFinancialLine(10,[],[{id:'bad',amount:5}],p).issues.some(issue=>issue.includes('actual disbursement date')));
    });
    await check('monthly legacy totals classify only whole months without inventing an exact transaction date',()=>{
        const previous={id:'previous',precision:'month',month:'2025-12',amount:10};
        const september={id:'inside',precision:'month',month:'2026-09',amount:20};
        const october={id:'boundary',precision:'month',month:'2026-10',amount:30};
        assert.equal(awardEntryWindowPosition(previous,policy.financialStart,policy.financialCutoff),'prior');
        assert.equal(awardEntryWindowPosition(september,policy.financialStart,policy.financialCutoff),'current');
        assert.equal(awardEntryWindowPosition(october,policy.financialStart,policy.financialCutoff),'ambiguous');
        assert.equal(awardEntryWindowPosition({...october,month:'2026-11'},policy.financialStart,policy.financialCutoff),'future');
        assert.equal(awardEntryWindowPosition({...october,month:'2026-13'},policy.financialStart,policy.financialCutoff),'invalid');
        const undatedMonth=reconcileAwardFinancialLine(100,[],[{id:'unknown-year',precision:'month',month:null,amount:20}],policy);assert(undatedMonth.issues.some(i=>i.includes('Fund Year is not evidence')));
        const result=reconcileAwardFinancialLine(100,[{id:'obligation',date:'2026-09-01',amount:100}],[previous,september,october],policy);
        assert.equal(result.priorDisbursements,10);assert.equal(result.disbursements,20);assert.equal(result.issues.filter(i=>i.includes('crosses a recognition boundary')).length,1);
        assert(!('date' in october));
        const next={...policy,awardsYear:2027,financialStart:'2026-10-16',financialCutoff:'2027-10-15'};
        assert.equal(awardEntryWindowPosition(october,next.financialStart,next.financialCutoff),'ambiguous');
    });
    await db.exec(await readFile('supabase/migrations/202606290001_award_rankings.sql','utf8'));
    await db.exec("insert into award_ranking_settings(settings_key,settings) values('awards_and_rankings','{\"quarterlyRestPoints\":1}');insert into award_manual_scores(fund_year,period,operating_unit,reportorial_required,reportorial_submitted) values(2026,'Q1','RPMO 1',5,4),(2026,'Q1','RPMO 2',7,6);");
    const baseline=await db.query('select (select jsonb_agg(to_jsonb(t) order by settings_key) from award_ranking_settings t) settings,(select jsonb_agg(to_jsonb(t) order by id) from award_manual_scores t) manual');
    await db.exec(await readFile('supabase/migrations/202611250002_awards_versioned_results.sql','utf8'));
    await check('carry dependencies include recognition policy and event identities rather than balances alone',async()=>{
        const hash=async(snapshot)=>(await db.query(`select award_carry_fingerprint($1,$2) hash`,[snapshot,[{id:'line',remaining:10}]])).rows[0].hash;
        const snapshot={policy,recognizedEvents:['activity:1:physical']};
        const original=await hash(snapshot);assert.notEqual(await hash({...snapshot,policy:{...policy,physicalCutoff:'2026-11-30'}}),original);
        assert.notEqual(await hash({...snapshot,recognizedEvents:['activity:2:physical']}),original);
        assert.equal(await hash(structuredClone(snapshot)),original);
    });
    const session=(await rpc('resource_start_session',{p_identifier:'root',p_password:'fixture-password'})).token;
    const user=(await rpc('resource_start_session',{p_identifier:'region1',p_password:'fixture-password'})).token;
    const read=(year=2026,scope={})=>rpc('award_read_controller',{p_session:session,p_year:year,p_scope:scope});
    const manual={fund_year:2026,period:'Q1',operating_unit:'RPMO 1',reportorial_required:5,reportorial_submitted:4,national_activities_required:2,national_activities_attended:1,remarks:'Fixture only'};
    const saveArgs={p_session:session,p_year:2026,p_scope:{},p_settings:{quarterlyRestPoints:2},p_manual:[manual],p_policy:policy,p_expected_version:0,p_request_id:randomUUID(),p_reason:'First cutoff policy after reviewed transition'};
    let controller,first,second;
    await check('installation preserves all legacy manual/settings rows and creates no result or policy',async()=>{
        const now=await db.query('select (select jsonb_agg(to_jsonb(t) order by settings_key) from award_ranking_settings t) settings,(select jsonb_agg(to_jsonb(t) order by id) from award_manual_scores t) manual');assert.deepEqual(now.rows,baseline.rows);
        assert.equal((await db.query('select count(*)::integer count from award_result_versions')).rows[0].count,0);assert.equal((await read()).policy,null);
    });
    await check('verified roles and own-OU scope remain authoritative',async()=>{
        await assert.rejects(()=>rpc('award_read_controller',{p_session:user,p_year:2026,p_scope:{}}),/Access denied/);
        await assert.rejects(()=>rpc('award_read_controller',{p_session:'0'.repeat(64),p_year:2026,p_scope:{}}),/expired/);
        await db.exec('alter table users add column visibility_scope text');await db.exec("insert into users(id,username,password,role,\"fullName\",\"operatingUnit\",visibility_scope) values(4,'ownadmin','fixture-password','Administrator','Own Admin','RPMO 1','Own OU')");
        const own=(await rpc('resource_start_session',{p_identifier:'ownadmin',p_password:'fixture-password'})).token;
        const result=await rpc('award_read_controller',{p_session:own,p_year:2026,p_scope:{}});assert.deepEqual(result.scope.ous,['RPMO 1']);assert(result.manual.every(row=>row.operating_unit==='RPMO 1'));
        await assert.rejects(()=>rpc('award_read_controller',{p_session:own,p_year:2026,p_scope:{ous:['RPMO 2']}}),/outside/);
    });
    await check('controller policy and manual/settings updates commit once or roll back together',async()=>{
        await assert.rejects(()=>rpc('award_save_controller',{...saveArgs,p_manual:[{...manual,national_activities_attended:-1}]}),/nonnegative/);assert.equal((await read()).controller_version,0);assert.equal((await read()).settings.quarterlyRestPoints,1);
        controller=await rpc('award_save_controller',saveArgs);assert.equal(controller.controller_version,1);assert.equal(controller.policy.version,1);assert.deepEqual(await rpc('award_save_controller',saveArgs),controller);
        assert.equal((await db.query("select reportorial_required from award_manual_scores where operating_unit='RPMO 2'")).rows[0].reportorial_required,7);
        await assert.rejects(()=>rpc('award_save_controller',{...saveArgs,p_reason:'Changed request'}),/reused/);
        await assert.rejects(()=>rpc('award_save_controller',{...saveArgs,p_request_id:randomUUID()}),/controller changed/);
    });
    const capture=async(year=2026,dependencies=[],override={})=>{
        const state=await read(year),rules=state.policy?.policy||defaultAnnualPolicy(year),id=randomUUID();
        const inputs={policy:rules,settings:state.settings,records:[{id:'activity-1',actualDate:'2026-11-14',recordedAt:'2026-11-25'}]};
        const sourceHash=(await db.query('select resource_digest($1) hash',[JSON.stringify(inputs)])).rows[0].hash;
        const head=(await rpc('award_history',{p_session:session,p_year:year,p_scope:{}})).head;
        await db.query('insert into award_calculation_captures(id,awards_year,scope_key,scope,actor_id,policy_id,controller_version,result_head_version,inputs,source_hash,dependencies,expires_at) values($1,$2,$3,$4,1,$5,$6,$7,$8,$9,$10,$11)',[id,year,state.scope_key,state.scope,state.policy?.id||null,state.controller_version,head.version,inputs,sourceHash,dependencies,override.expires_at||'2090-01-01']);
        return {id,state,inputs,sourceHash,year};
    };
    const finalize=async(c,winner,carry=[])=>{
        const row={ou:winner,rank:1,totalPoints:10};const results={effectiveYear:c.year,annual:{overall:[row],financial:[row],physical:[row]},quarters:[]};
        const snapshot={schemaVersion:1,formulaVersion:'awards-v2',awardsYear:c.year,scope:c.state.scope,policy:c.inputs.policy,settings:c.inputs.settings,sourceHash:c.sourceHash,results};
        const args={p_session:session,p_capture_id:c.id,p_snapshot:snapshot,p_carry:carry,p_current_source_hash:c.sourceHash,p_request_id:randomUUID(),p_reason:'Confirmed local calculation'};
        return {value:await rpc('award_commit_result',args),args,snapshot};
    };
    await check('first finalized snapshot stores the exact winner and supports response-loss retry',async()=>{
        first=await finalize(await capture(),'RPMO 1',[{id:'line-1',remaining:30}]);assert.equal(first.value.version,1);assert.equal(first.value.activation_pending,false);assert.deepEqual(await rpc('award_commit_result',first.args),first.value);
        const stored=await rpc('award_read_result',{p_session:session,p_result_id:first.value.id});assert.deepEqual(stored.snapshot,first.snapshot);assert.equal(stored.policy_id,controller.policy.id);
    });
    await check('cutoff amendment retains both the original policy and the original finalized winner',async()=>{
        controller=await rpc('award_save_controller',{...saveArgs,p_expected_version:1,p_request_id:randomUUID(),p_policy:{...policy,physicalCutoff:'2026-11-30'},p_reason:'Extended physical cutoff after impact review'});assert.equal(controller.policy.version,2);
        second=await finalize(await capture(),'RPMO 2',[{id:'line-1',remaining:20}]);assert.equal(second.value.version,2);
        assert.equal((await rpc('award_read_result',{p_session:session,p_result_id:first.value.id})).snapshot.results.annual.overall[0].ou,'RPMO 1');
    });
    await check('Restore and undo append activations and retrieve exact earlier results without recalculation',async()=>{
        const restored=await rpc('award_activate_result',{p_session:session,p_result_id:first.value.id,p_expected_version:2,p_request_id:randomUUID(),p_reason:'Restore original approved result'});assert.equal(restored.version,3);assert.equal(restored.active_result_id,first.value.id);
        const undone=await rpc('award_activate_result',{p_session:session,p_result_id:second.value.id,p_expected_version:3,p_request_id:randomUUID(),p_reason:'Undo mistaken restore'});assert.equal(undone.version,4);assert.equal(undone.active_result_id,second.value.id);
        assert.equal((await db.query('select count(*)::integer count from award_result_versions')).rows[0].count,2);assert.equal((await db.query('select count(*)::integer count from award_result_activations')).rows[0].count,4);
    });
    await check('snapshots, policies, inputs, activation events and request receipts reject destructive edits',async()=>{
        for(const table of ['award_policy_versions','award_result_versions','award_calculation_captures','award_result_activations','award_mutation_requests'])await assert.rejects(()=>db.exec('delete from '+table),/immutable/);
        await assert.rejects(()=>db.query('update award_result_versions set snapshot=$1 where id=$2',[{},first.value.id]),/immutable/);
        const grants=(await db.query("select c.relname,c.relrowsecurity,has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') allowed from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('award_policy_versions','award_result_versions','award_result_activations')")).rows;assert(grants.every(row=>row.relrowsecurity&&!row.allowed));
        assert.equal((await db.query("select has_function_privilege('anon','award_commit_result(text,uuid,jsonb,jsonb,text,uuid,text)','EXECUTE') allowed")).rows[0].allowed,false);
    });
    await check('expired/source-changed previews and stale activation heads cannot finalize or restore',async()=>{
        const c=await capture(2026,[],{expires_at:'2000-01-01'});await assert.rejects(()=>finalize(c,'RPMO 1'),/expired/);
        await assert.rejects(()=>rpc('award_activate_result',{p_session:session,p_result_id:first.value.id,p_expected_version:1,p_request_id:randomUUID(),p_reason:'Stale restore'}),/active result changed/);
        await db.exec("update users set role='User' where id=1");await assert.rejects(()=>rpc('award_commit_result',first.args),/Access denied/);await db.exec("update users set role='Super Admin' where id=1");
    });
    await check('a later finalized year prevents silent carry-forward changes during restoration',async()=>{
        const previous=await rpc('award_read_result',{p_session:session,p_result_id:second.value.id});await finalize(await capture(2027,[{awardsYear:2026,carryHash:previous.carry_hash,resultId:previous.id}]),'RPMO 2');
        await assert.rejects(()=>rpc('award_activate_result',{p_session:session,p_result_id:first.value.id,p_expected_version:4,p_request_id:randomUUID(),p_reason:'Would change opening balance'}),/subsequent finalized year/);
        const active=await rpc('award_history',{p_session:session,p_year:2026,p_scope:{}});assert.equal(active.head.active_result_id,second.value.id);
    });
    await check('Repository mode preserves old manual counts and never inserts derived credited totals',async()=>{
        await db.exec("insert into reportorial_periods(reporting_year,quarter,source) values(2026,'Q1','Repository')");
        const state=await read();const saved=await rpc('award_save_controller',{...saveArgs,p_policy:null,p_expected_version:state.controller_version,p_request_id:randomUUID(),p_manual:[{...manual,reportorial_required:999,reportorial_submitted:998},{...manual,operating_unit:'RPMO 3',reportorial_required:9,reportorial_submitted:8}]});
        assert.equal(saved.manual.find(row=>row.operating_unit==='RPMO 1').reportorial_required,5);assert.equal(saved.manual.find(row=>row.operating_unit==='RPMO 1').reportorial_submitted,4);assert.equal(saved.manual.find(row=>row.operating_unit==='RPMO 3').reportorial_submitted,0);
        assert.equal((await rpc('award_read_result',{p_session:session,p_result_id:first.value.id})).snapshot.results.annual.overall[0].ou,'RPMO 1');
    });
    await check('a changed source or controller invalidates a pending calculation without altering history',async()=>{
        const c=await capture();const row={ou:'RPMO 1',rank:1,totalPoints:10};const snapshot={schemaVersion:1,awardsYear:2026,scope:c.state.scope,policy:c.inputs.policy,settings:c.inputs.settings,sourceHash:c.sourceHash,results:{effectiveYear:2026,annual:{overall:[row]},quarters:[]}};
        const args={p_session:session,p_capture_id:c.id,p_snapshot:snapshot,p_carry:[],p_current_source_hash:'changed-source',p_request_id:randomUUID(),p_reason:'Should not commit'};
        await assert.rejects(()=>rpc('award_commit_result',args),/Source data changed/);
        await rpc('award_save_controller',{...saveArgs,p_policy:null,p_manual:[],p_expected_version:c.state.controller_version,p_request_id:randomUUID()});
        await assert.rejects(()=>rpc('award_commit_result',{...args,p_current_source_hash:c.sourceHash,p_request_id:randomUUID()}),/controller or cutoff policy changed/);
        assert.equal((await db.query('select count(*)::integer count from award_result_versions')).rows[0].count,3);
    });
    let pending26,pending27,previous27,head26,head27,batchArgs,batch;
    await check('dependent years can prepare immutable amendments without changing either active result',async()=>{
        previous27=(await rpc('award_history',{p_session:session,p_year:2027,p_scope:{}})).head.active_result_id;
        head26=(await rpc('award_history',{p_session:session,p_year:2026,p_scope:{}})).head;
        head27=(await rpc('award_history',{p_session:session,p_year:2027,p_scope:{}})).head;
        pending26=await finalize(await capture(),'RPMO 1',[{id:'line-1',remaining:7}]);assert.equal(pending26.value.activation_pending,true);
        const prior=await rpc('award_read_result',{p_session:session,p_result_id:pending26.value.id});
        pending27=await finalize(await capture(2027,[{awardsYear:2026,resultId:prior.id,carryHash:prior.carry_hash}]),'RPMO 1',[{id:'line-1',remaining:1}]);assert.equal(pending27.value.activation_pending,true);
        assert.deepEqual((await rpc('award_history',{p_session:session,p_year:2026,p_scope:{}})).head,head26);
        assert.deepEqual((await rpc('award_history',{p_session:session,p_year:2027,p_scope:{}})).head,head27);
        batchArgs={p_session:session,p_selections:[{resultId:pending27.value.id,expectedVersion:head27.version},{resultId:pending26.value.id,expectedVersion:head26.version}],p_request_id:randomUUID(),p_reason:'Reviewed paired carry-forward reconciliation'};
    });
    await check('incomplete or stale reconciliation rolls back every year and appends no activation',async()=>{
        const count=(await db.query('select count(*)::integer n from award_result_activations')).rows[0].n;
        await assert.rejects(()=>rpc('award_activate_result_batch',{...batchArgs,p_selections:[batchArgs.p_selections[1]],p_request_id:randomUUID()}),/affected subsequent/);
        await assert.rejects(()=>rpc('award_activate_result_batch',{...batchArgs,p_selections:[{...batchArgs.p_selections[0],expectedVersion:999},batchArgs.p_selections[1]],p_request_id:randomUUID()}),/active result changed/);
        assert.equal((await db.query('select count(*)::integer n from award_result_activations')).rows[0].n,count);
        assert.deepEqual((await rpc('award_history',{p_session:session,p_year:2026,p_scope:{}})).head,head26);
        assert.deepEqual((await rpc('award_history',{p_session:session,p_year:2027,p_scope:{}})).head,head27);
    });
    await check('confirmed reconciliation atomically activates the consistent lineage and retries return one audited operation',async()=>{
        batch=await rpc('award_activate_result_batch',batchArgs);assert.deepEqual(batch.heads.map(h=>h.awards_year),[2026,2027]);
        assert.deepEqual(batch.heads.map(h=>h.active_result_id),[pending26.value.id,pending27.value.id]);
        assert.deepEqual(await rpc('award_activate_result_batch',batchArgs),batch);
        assert.equal((await db.query('select count(*)::integer n from award_result_activations where operation_id=$1',[batchArgs.p_request_id])).rows[0].n,2);
    });
    await check('a mistaken multi-year amendment can be undone by reactivating the exact earlier versions together',async()=>{
        const count=(await db.query('select count(*)::integer n from award_result_versions')).rows[0].n;
        const undo=await rpc('award_activate_result_batch',{p_session:session,p_selections:[{resultId:second.value.id,expectedVersion:batch.heads[0].version},{resultId:previous27,expectedVersion:batch.heads[1].version}],p_request_id:randomUUID(),p_reason:'Undo mistaken paired amendment after review'});
        assert.deepEqual(undo.heads.map(h=>h.active_result_id),[second.value.id,previous27]);
        assert.equal((await rpc('award_read_result',{p_session:session,p_result_id:second.value.id})).snapshot.results.annual.overall[0].ou,'RPMO 2');
        assert.equal((await db.query('select count(*)::integer n from award_result_versions')).rows[0].n,count);
    });
    console.log(`${passed} Awards versioning foundation checks passed. Disposable SQL only; trusted calculator/UI integration remains separate.`);
}finally{await db.close();}
