import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createDcfRevisionFixture,insertParent,domains} from './helpers/dcf-revision-fixture.mjs';
import {createResourcesHandler} from '../supabase/functions/_shared/resourcesHttp.ts';
import {createAwardsGateway} from '../supabase/functions/_shared/awardsGateway.ts';
import {defaultAnnualPolicy} from '../lib/awardAnnualPolicy.ts';
import {bundleAwardsCalculator} from './helpers/awards-calculator-bundle.mjs';
const clientBundle=await bundleAwardsCalculator({entry:'lib/resources.ts'}),{createResourcesClient}=await import('data:text/javascript;base64,'+Buffer.from(clientBundle.code).toString('base64'));
const db=await createDcfRevisionFixture({seed:false});let passed=0;
const check=async(name,run)=>{await run();passed++;console.log('PASS '+name);};
const calls=[];
const rpc=async(name,args)=>{calls.push(name);return (await db.query(`select ${name}(${Object.keys(args).map((k,i)=>`${k}=>$${i+1}`).join(',')}) value`,Object.values(args))).rows[0].value;};
try{
    for(const file of ['202611030002_dcf_revision_mutations.sql','202611200001_resources_foundation.sql','202611200002_resources_workflows.sql','202611200003_resources_reads.sql','202606290001_award_rankings.sql','202611250002_awards_versioned_results.sql','202611250003_awards_source_capture.sql','202611260001_awards_controller_privacy.sql'])await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
    const handler=createResourcesHandler({origins:['https://allowed.test'],rpc,awards:createAwardsGateway({rpc})});
    let dropNextFinalize=false;
    const fetcher=async(url,init)=>{
        const request=new Request(url,{...init,headers:{...init.headers,origin:'https://allowed.test'}}),body=JSON.parse(init.body),response=await handler(request);
        if(dropNextFinalize&&body.action==='awards'&&body.operation==='finalize'&&response.ok){dropNextFinalize=false;throw new Error('Simulated response loss after confirmed commit');}
        return response;
    };
    const client=createResourcesClient({url:'https://allowed.test/resources',apiKey:'disposable-anon-key',credentials:()=>({identifier:'admin',password:'fixture-password'}),fetcher});
    const scope={ous:['RPMO 1']},year=2026,rules={...defaultAnnualPolicy(year),mode:'Cutoff',transitionApproved:true};
    const sp=await insertParent(db,domains[0],{operatingUnit:'RPMO 1',fundingYear:2025,status:'Completed',estimatedCompletionDate:'2025-12-01',actualCompletionDate:'2026-11-14',details:[{id:10,amount:100,numberOfUnits:1,pricePerUnit:100,actualObligationAmount:777,actualDisbursementAmount:888}]});
    await db.query(`insert into financial_obligations(entity_type,parent_id,item_id,obligation_date,amount) values('subproject_detail',$1,'10','2026-01-01',100)`,[sp.id]);
    const disbursement=(await db.query(`insert into financial_disbursements(entity_type,parent_id,item_id,disbursement_date,amount) values('subproject_detail',$1,'10','2026-10-14',50) returning id`,[sp.id])).rows[0];
    const invoke=(operation,args)=>client.awards(operation,args);
    let initialPreview,first,second;
    await check('unsafe origins, unverified sessions and ordinary roles cannot reach Awards data',async()=>{
        const request=(headers)=>new Request('https://allowed.test/resources',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify({action:'awards',operation:'controller',args:{year,scope}})});
        assert.equal((await handler(request({origin:'https://wrong.test'}))).status,403);assert.equal((await handler(request({origin:'https://allowed.test'}))).status,401);
        const user=createResourcesClient({url:'https://allowed.test/resources',apiKey:'fixture',credentials:()=>({identifier:'editor',password:'fixture-password'}),fetcher});
        await assert.rejects(()=>user.awards('controller',{year,scope}),e=>e.status===403);user.dispose();
    });
    await check('controller saves and previews use protected RPCs and trusted source calculation',async()=>{
        const before=await invoke('controller',{year,scope});assert.equal(before.controller_version,0);
        await invoke('save_controller',{year,scope,settings:before.settings,manual:[],policy:rules,expectedVersion:0,requestId:randomUUID(),reason:'Approve disposable initial cutoff preview'});
        initialPreview=await invoke('preview',{year,scope});assert.equal(initialPreview.calculation.results.annual.overall[0].disbursement,50);assert.equal(initialPreview.calculation.results.annual.overall[0].obligation,100);assert.equal(initialPreview.calculation.canFinalize,true);
        assert(!('inputs' in initialPreview));assert(!('records' in initialPreview.calculation));
    });
    await check('malformed nested scoring rules cannot partially save controller data',async()=>{
        const before=await invoke('controller',{year,scope});
        const invalid=[{quarterlyFinancialWeights:5},{quarterlyPhysicalWeights:{socialPrep:[1,2]}},{quarterlyPhysicalWeights:{unknown:{completionRate:100}}},{quarterlyFinancialWeights:{unexpected:10}},{quarterlyRankPoints:{1:{points:5}}},{annualRankPoints:{rest:1}},{annualFinancialCompletionBands:[]},{annualPhysicalCompletionBands:[{min:90,unexpected:5}]},{annualAttendanceMissedPoints:{0:-1}}];
        const count=(await db.query('select count(*)::int n from award_mutation_requests')).rows[0].n;
        for(const settings of invalid)await assert.rejects(()=>invoke('save_controller',{year,scope,settings,manual:[],policy:rules,expectedVersion:before.controller_version,requestId:randomUUID(),reason:'Invalid disposable scoring payload'}),e=>e.status===400);
        assert.deepEqual(await invoke('controller',{year,scope}),before);assert.equal((await db.query('select count(*)::int n from award_mutation_requests')).rows[0].n,count);
    });
    await check('legacy browser table writes are closed without changing stored manual/settings data',async()=>{
        const before=(await db.query("select jsonb_build_object('settings',(select jsonb_agg(to_jsonb(t)) from award_ranking_settings t),'manual',(select jsonb_agg(to_jsonb(t) order by id) from award_manual_scores t)) value")).rows[0].value;
        await db.exec(await readFile('supabase/migrations/202611260001_awards_controller_privacy.sql','utf8'));
        assert.deepEqual((await db.query("select jsonb_build_object('settings',(select jsonb_agg(to_jsonb(t)) from award_ranking_settings t),'manual',(select jsonb_agg(to_jsonb(t) order by id) from award_manual_scores t)) value")).rows[0].value,before);
        for(const table of ['award_ranking_settings','award_manual_scores'])for(const role of ['anon','authenticated']){
            const row=(await db.query("select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') allowed,(select relrowsecurity from pg_class where oid=$2::regclass) rls",[role,table])).rows[0];assert.equal(row.allowed,false);assert.equal(row.rls,true);
        }
        assert.equal((await db.query("select has_sequence_privilege('anon','award_manual_scores_id_seq','USAGE,SELECT') allowed")).rows[0].allowed,false);
        assert.equal((await invoke('controller',{year,scope})).controller_version,1);
    });
    await check('arbitrary result JSON and unexpected operation fields are rejected before a database write',async()=>{
        const count=(await db.query('select count(*)::integer n from award_result_versions')).rows[0].n;
        await assert.rejects(()=>invoke('finalize',{captureId:initialPreview.captureId,requestId:randomUUID(),reason:'Attempt forged result',snapshot:{winner:'forged'}}),e=>e.status===400);
        await assert.rejects(()=>invoke('preview',{year,scope,results:{}}),e=>e.status===400);
        await assert.rejects(()=>invoke('unknown_rpc',{year,scope}),e=>e.status===400);
        assert.equal((await db.query('select count(*)::integer n from award_result_versions')).rows[0].n,count);
    });
    await check('repeated submission is deduplicated in the client and finalizes one database-confirmed version',async()=>{
        const args={captureId:initialPreview.captureId,requestId:randomUUID(),reason:'Confirm original calculated version'},before=calls.filter(n=>n==='award_commit_calculated').length;
        const responses=await Promise.all([invoke('finalize',args),invoke('finalize',args)]);assert.deepEqual(responses[0],responses[1]);first=responses[0];
        assert.equal(calls.filter(n=>n==='award_commit_calculated').length-before,1);assert.equal((await db.query('select count(*)::integer n from award_result_versions')).rows[0].n,1);
    });
    await check('a lost finalization response can retry the same intent after the head changes without another result',async()=>{
        await db.query('update financial_disbursements set amount=60 where id=$1',[disbursement.id]);
        const state=await invoke('controller',{year,scope});await invoke('save_controller',{year,scope,settings:state.settings,manual:[],policy:{...rules,physicalCutoff:'2026-11-30'},expectedVersion:state.controller_version,requestId:randomUUID(),reason:'Reviewed later cutoff'});
        const preview=await invoke('preview',{year,scope}),args={captureId:preview.captureId,requestId:randomUUID(),reason:'Confirm amended calculation'};dropNextFinalize=true;
        await assert.rejects(()=>invoke('finalize',args),/response loss/);second=await invoke('finalize',args);assert.equal(second.version,2);
        assert.equal((await db.query('select count(*)::integer n from award_result_versions')).rows[0].n,2);
    });
    await check('source edits after preview return a conflict and leave all finalized versions intact',async()=>{
        const preview=await invoke('preview',{year,scope});await db.query('update financial_disbursements set amount=70 where id=$1',[disbursement.id]);
        await assert.rejects(()=>invoke('finalize',{captureId:preview.captureId,requestId:randomUUID(),reason:'Must conflict'}),e=>e.status===409&&e.code==='AWARDS_CONFLICT');
        assert.equal((await db.query('select count(*)::integer n from award_result_versions')).rows[0].n,2);
    });
    await check('history and restore load exact retained snapshots, and undo does not recalculate current amounts',async()=>{
        const history=await invoke('history',{year,scope});assert.equal(history.rows.length,2);
        const restored=await invoke('restore',{resultId:first.id,expectedVersion:history.head.version,requestId:randomUUID(),reason:'Restore original exact result'});assert.equal(restored.active_result_id,first.id);
        const old=await invoke('result',{resultId:first.id});assert.equal(old.snapshot.results.annual.overall[0].disbursement,50);assert.equal(old.snapshot.policy.physicalCutoff,'2026-11-15');
        await invoke('restore',{resultId:second.id,expectedVersion:restored.version,requestId:randomUUID(),reason:'Undo mistaken restore'});
        assert.equal((await invoke('result',{resultId:second.id})).snapshot.results.annual.overall[0].disbursement,60);
        assert.equal((await invoke('preview',{year,scope})).calculation.results.annual.overall[0].disbursement,70);
    });
    await check('calculation warnings need explicit acknowledgement rather than a silent zero or unintended rejection',async()=>{
        const other={ous:['RPMO 2']};const warning=await insertParent(db,domains[0],{operatingUnit:'RPMO 2',fundingYear:2025,status:'Completed',estimatedCompletionDate:'2025-12-01',actualCompletionDate:'2026-11-14',details:[{id:10,amount:100,numberOfUnits:1,pricePerUnit:100}]});
        await db.query(`insert into financial_disbursements(entity_type,parent_id,item_id,disbursement_date,amount) values('subproject_detail',$1,'10','2026-10-14',10)`,[warning.id]);
        const state=await invoke('controller',{year,scope:other});await invoke('save_controller',{year,scope:other,settings:state.settings,manual:[],policy:rules,expectedVersion:state.controller_version,requestId:randomUUID(),reason:'Reviewed separate warning fixture'});
        const preview=await invoke('preview',{year,scope:other}),args={captureId:preview.captureId,requestId:randomUUID(),reason:'Reviewed reported disbursement with missing obligation basis'};
        await assert.rejects(()=>invoke('finalize',args),e=>e.status===409&&e.code==='AWARDS_REVIEW_REQUIRED');
        const result=await invoke('finalize',{...args,acknowledgeWarnings:true});assert(result.id);
    });
    client.dispose();
    console.log(`${passed} Awards HTTP/client/trusted-calculator/database checks passed. Disposable SQL only; no hosted endpoint.`);
}catch(error){console.error(error.message);if(error.where)console.error(error.where);process.exitCode=1;}finally{await db.close();}
