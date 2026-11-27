import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createDcfRevisionFixture,domains,insertParent,fingerprints} from './helpers/dcf-revision-fixture.mjs';
import {defaultAnnualPolicy} from '../lib/awardAnnualPolicy.ts';
import {bundleAwardsCalculator} from './helpers/awards-calculator-bundle.mjs';
import {PARENT_ACTUAL_FIELDS} from '../lib/budgetItemTransferRules.ts';

const db=await createDcfRevisionFixture({seed:false});let passed=0;
const check=async(name,run)=>{await run();passed++;console.log('PASS '+name);};
const rpc=async(name,args)=>(await db.query(`select ${name}(${Object.keys(args).map((k,i)=>`${k}=>$${i+1}`).join(',')}) value`,Object.values(args))).rows[0].value;
const migrations=['202611030002_dcf_revision_mutations.sql','202611200001_resources_foundation.sql','202611200002_resources_workflows.sql','202611200003_resources_reads.sql','202606290001_award_rankings.sql','202611250002_awards_versioned_results.sql','202611250003_awards_source_capture.sql','202611260001_awards_controller_privacy.sql'];
const calculatorBundle=await bundleAwardsCalculator(),{calculateCapturedAwards}=await import('data:text/javascript;base64,'+Buffer.from(calculatorBundle.code).toString('base64'));
try{
    for(const name of migrations)await db.exec(await readFile('supabase/migrations/'+name,'utf8'));
    await db.exec(`update users set "operatingUnit"='RPMO 1' where id=2;`);
    const session=(await rpc('resource_start_session',{p_identifier:'admin',p_password:'fixture-password'})).token;
    const own=(await rpc('resource_start_session',{p_identifier:'requester',p_password:'fixture-password'})).token;
    const policy={...defaultAnnualPolicy(2026),mode:'Cutoff',transitionApproved:true};
    const scope={ous:['RPMO 1']};
    await rpc('award_save_controller',{p_session:session,p_year:2026,p_scope:scope,p_settings:{quarterlyRestPoints:1},p_manual:[],p_policy:policy,p_expected_version:0,p_request_id:randomUUID(),p_reason:'Disposable transition preview approved'});
    const base={operatingUnit:'RPMO 1',fundingYear:2025,tier:'Tier 1',status:'Completed',date:'2025-10-01',actualDate:'2026-11-14'};
    const activity=await insertParent(db,domains[1],{...base,expenses:[{id:10,amount:100,actualObligationAmount:777,actualDisbursementAmount:888,obligations:[{id:'stale',date:'2025-01-01',amount:777}],disbursements:[{id:'stale',date:'2025-01-01',amount:888}]}]});
    await db.query(`insert into dcf_financial_entry_state(entity_type,parent_id,item_id,stage) values('activities',$1,'10','obligation')`,[activity.id]);
    for(const amount of [10,10,20])await db.query(`insert into financial_disbursements(entity_type,parent_id,item_id,disbursement_date,amount) values('activity_expense',$1,'10','2026-10-14',$2)`,[activity.id,amount]);
    const subproject=await insertParent(db,domains[0],{operatingUnit:'RPMO 1',fundingYear:2024,status:'Ongoing',ipo_id:1,estimatedCompletionDate:'2025-11-01',details:[{id:11,numberOfUnits:1,pricePerUnit:70}]});
    const office=await insertParent(db,domains[2],{operatingUnit:'RPMO 1',fundYear:2026,numberOfUnits:1,pricePerUnit:30});
    await db.query(`insert into financial_obligations(entity_type,parent_id,item_id,obligation_date,amount) values('office_requirement',$1,null,'2026-10-01',5)`,[office.id]);
    const staffing=await insertParent(db,domains[3],{operatingUnit:'RPMO 1',fundYear:2025,annualSalary:100,expenses:[],actualDisbursementOct:20});
    const historical=await insertParent(db,domains[4],{operatingUnit:'RPMO 1',fundYear:2024,amount:100,obligations:[{id:1,date:'2024-01-01',amount:100}],disbursements:[{id:2,date:'2024-01-02',amount:100}]});
    const otherExpense=await insertParent(db,domains[4],{operatingUnit:'RPMO 1',fundYear:2026,amount:25});
    const otherOu=await insertParent(db,domains[1],{...base,operatingUnit:'RPMO 2'});
    const pending=await insertParent(db,domains[1],{...base,workflow_status:'PENDING'});
    const futurePlan=await insertParent(db,domains[1],{operatingUnit:'RPMO 1',fundingYear:2027,date:'2027-06-01',expenses:[{id:10,amount:100,obligationMonth:'2027-06-01'}]});
    const tables=[...domains.map(d=>d.table),'financial_obligations','financial_disbursements','dcf_record_revisions','award_manual_scores'];
    const baseline=await fingerprints(db,tables);
    const capture=(s=scope,token=session,year=2026)=>rpc('award_capture_sources',{p_session:token,p_year:year,p_scope:s});
    let first;
    const record=(c,type,id)=>c.inputs.records.find(p=>p.entityType===type&&Number(p.record.id)===Number(id));
    await check('scoped source capture includes relevant old-FY carry and all five DCF domains without cross-OU or pending data',async()=>{
        first=await capture();assert(first.inputs.records.every(r=>r.record.operatingUnit==='RPMO 1'));
        for(const [type,id] of [['activities',activity.id],['subprojects',subproject.id],['office_requirements',office.id],['staffing_requirements',staffing.id],['other_program_expenses',otherExpense.id]])assert(record(first,type,id));
        assert(!record(first,'other_program_expenses',historical.id));assert(!record(first,'activities',otherOu.id));assert(!record(first,'activities',pending.id));
        assert(!record(first,'activities',futurePlan.id));
        assert.equal(first.inputs.policy.mode,'Cutoff');assert.deepEqual(first.inputs.dependencies,[]);
        assert(record(first,'activities',activity.id).revision.revisionId);
        assert.deepEqual(await fingerprints(db,tables),baseline);
    });
    await check('central empty stages suppress stale embedded totals and independently identified identical transactions survive',()=>{
        const f=record(first,'activities',activity.id).financial[0];assert.equal(f.obligation.source,'central');assert.deepEqual(f.obligation.entries,[]);
        assert.equal(f.disbursement.source,'central');assert.equal(f.disbursement.entries.length,3);assert.equal(new Set(f.disbursement.entries.map(e=>e.id)).size,3);assert.equal(f.disbursement.entries.reduce((n,e)=>n+Number(e.amount),0),40);
        const single=record(first,'office_requirements',office.id).financial[0];assert.equal(single.itemId,null);assert.equal(single.obligation.source,'central');assert.equal(single.obligation.entries[0].amount,5);
    });
    await check('legacy monthly actuals retain amounts and month-of-year without inventing a day or an actual calendar year',()=>{
        const stage=record(first,'staffing_requirements',staffing.id).financial[0].disbursement;
        assert.equal(stage.source,'legacy-monthly');assert.equal(stage.calendarYearKnown,false);assert.equal(stage.entries[0].month,null);assert.equal(stage.entries[0].monthOfYear,10);assert.equal(stage.entries[0].fundYearContext,'2025');assert.equal(stage.entries[0].precision,'month');assert(!('date' in stage.entries[0]));assert.equal(stage.entries[0].amount,20);
    });
    await check('captured reference labels are stable evidence without pulling private IPO profiles',()=>{
        assert.equal(first.inputs.fundSourceReferences[0].uid,'FS-000001');assert.equal(first.inputs.fundSourceReferences[0].label,'4K Fund');
        assert.equal(first.inputs.ipoReferences.length,1);assert.equal(first.inputs.ipoReferences[0].name,'Frozen IPO Label');
        assert(!('contactPerson' in first.inputs.ipoReferences[0]));assert(!('contactNumber' in first.inputs.ipoReferences[0]));
    });
    await check('unchanged source captures have stable hashes while ledger edits invalidate previous previews',async()=>{
        const second=await capture();assert.equal(second.source_hash,first.source_hash);assert.notEqual(second.id,first.id);
        assert.equal((await rpc('award_refresh_capture',{p_session:session,p_capture_id:first.id})).matches,true);
        await db.query(`update financial_disbursements set amount=11 where id=(select min(id) from financial_disbursements where parent_id=$1 and entity_type='activity_expense')`,[activity.id]);
        assert.equal((await rpc('award_refresh_capture',{p_session:session,p_capture_id:first.id})).matches,false);
        const stored=(await db.query('select inputs from award_calculation_captures where id=$1',[first.id])).rows[0].inputs;
        assert.deepEqual(stored,first.inputs);
    });
    await check('every scope dimension including legacy unspecified and UID-based Fund Sources is applied before capture',async()=>{
        const matched=await capture({...scope,sourceFundYears:['2025'],tiers:['Tier 1'],fundTypes:['Current'],fundSources:['FS-000001']},session,2025);assert(record(matched,'activities',activity.id));assert(!record(matched,'subprojects',subproject.id));
        assert.equal((await capture({...scope,tiers:['Tier 2']},session,2025)).inputs.records.length,0);
        const unspecified=await insertParent(db,domains[1],{operatingUnit:'RPMO 1',fundingYear:2025,fundSourceUid:null,fundSource:null});
        assert(record(await capture({...scope,fundSources:['__unspecified_fund_source__']},session,2025),'activities',unspecified.id));
        assert(!record(await capture({...scope,fundSources:['FS-000001']},session,2025),'activities',unspecified.id));
        await db.query(`update ref_fund_sources set label='Renamed official fund' where uid='FS-000001'`);
        assert.equal((await db.query(`select award_source_fund_key('{"fundSource":"4K Fund"}') key`)).rows[0].key,'FS-000001');
        assert.equal((await db.query(`select award_source_fund_key('{"fundSourceUid":"fixed-id","fundSource":"4K Fund"}') key`)).rows[0].key,'fixed-id');
    });
    await check('Own OU permission is enforced and capture ownership prevents another administrator reading refreshed evidence',async()=>{
        const ownCapture=await capture({},own);assert.deepEqual(ownCapture.scope.ous,['RPMO 1']);
        await assert.rejects(()=>capture({ous:['RPMO 2']},own),/outside/);
        await assert.rejects(()=>rpc('award_refresh_capture',{p_session:own,p_capture_id:first.id}),/unavailable/);
        const grants=(await db.query(`select has_function_privilege('anon','award_source_document(integer,jsonb)','EXECUTE') allowed`)).rows[0];assert.equal(grants.allowed,false);
    });
    await check('live Repository evidence has stable source hashes and is narrowed to the official comparison cohort',async()=>{
        await db.exec(`insert into reportorial_periods(reporting_year,quarter,source) values(2026,'Q1','Repository');`);
        const a=await capture(),b=await capture();assert.equal(a.source_hash,b.source_hash);
        assert.equal(a.inputs.reportorialPeriods[0].source,'Repository');assert(!('cutoff' in a.inputs.reportorialPeriods[0].summary));
        assert.deepEqual(a.inputs.reportorialPeriods[0].summary.rows,[]);
        assert.deepEqual(a.inputs.reportorialPeriods[0].summary.evidence,[]);
    });
    await check('Awards admission does not bypass Documentary Repository evidence permissions',async()=>{
        const count=(await db.query('select count(*)::integer n from award_calculation_captures')).rows[0].n;
        await db.query('update users set permissions_override=$1 where id=2',[{'Documentary Repository':{can_view:false}}]);
        await assert.rejects(()=>capture({},own),/Access denied/);
        assert.equal((await db.query('select count(*)::integer n from award_calculation_captures')).rows[0].n,count);
        await db.query('update users set permissions_override=$1 where id=2',[{}]);
    });
    await check('unmatched actual ledger entries remain visible as evidence instead of silently disappearing',async()=>{
        await db.query(`insert into financial_obligations(entity_type,parent_id,item_id,obligation_date,amount) values('activity_expense',$1,'removed-item','2026-10-01',13)`,[activity.id]);
        const parent=record(await capture(),'activities',activity.id);assert.equal(parent.unmatchedFinancial.length,1);assert.equal(parent.unmatchedFinancial[0].amount,13);assert.equal(parent.unmatchedFinancial[0].item_id,'removed-item');
    });
    await check('legacy mode remains the default and does not activate annual cutoffs during source reads',async()=>{
        const c=await capture(scope,session,2025);assert.equal(c.inputs.policy.mode,'Legacy');assert(c.inputs.records.every(p=>Number(p.record.fundingYear??p.record.fundYear)===2025));
        assert.equal((await db.query('select count(*)::integer n from award_result_versions')).rows[0].n,0);
        assert.equal((await db.query('select count(*)::integer n from award_policy_versions')).rows[0].n,1);
    });
    await check('trusted calculation consumes actual SQL captures with no stale embedded resurrection or database writes',async()=>{
        const before=await fingerprints(db,tables),result=calculateCapturedAwards(first);
        const line=result.reconciliation.financial.find(r=>r.entityType==='activities'&&r.parentId===String(activity.id));
        assert.equal(line.obligations,0);assert.equal(line.disbursements,40);assert.equal(result.canFinalize,false);assert(result.reconciliation.issues.some(i=>i.code==='ambiguous_date'));
        assert.deepEqual(await fingerprints(db,tables),before);
    });
    await check('real calculated results finalize once, retain old amounts after correction and restore exact policy/results',async()=>{
        const cleanScope={ous:['RPMO 3']},rules={...policy},clean=await insertParent(db,domains[0],{operatingUnit:'RPMO 3',fundingYear:2025,status:'Completed',estimatedCompletionDate:'2025-12-01',actualCompletionDate:'2026-11-14',details:[{id:10,amount:100,numberOfUnits:1,pricePerUnit:100}]});
        await db.query(`insert into financial_obligations(entity_type,parent_id,item_id,obligation_date,amount) values('subproject_detail',$1,'10','2026-01-01',100)`,[clean.id]);
        const transaction=(await db.query(`insert into financial_disbursements(entity_type,parent_id,item_id,disbursement_date,amount) values('subproject_detail',$1,'10','2026-10-14',50) returning id`,[clean.id])).rows[0];
        const state=await rpc('award_read_controller',{p_session:session,p_year:2026,p_scope:cleanScope});
        await rpc('award_save_controller',{p_session:session,p_year:2026,p_scope:cleanScope,p_settings:state.settings,p_manual:[],p_policy:rules,p_expected_version:state.controller_version,p_request_id:randomUUID(),p_reason:'Reviewed clean disposable transition'});
        const c=await capture(cleanScope),snapshot=calculateCapturedAwards(c);assert.equal(snapshot.canFinalize,true);
        const args={p_session:session,p_capture_id:c.id,p_snapshot:snapshot,p_request_id:randomUUID(),p_reason:'Finalize calculated disposable result'};
        const firstResult=await rpc('award_commit_calculated',args);assert.equal(firstResult.version,1);
        await db.query('update financial_disbursements set amount=60 where id=$1',[transaction.id]);
        assert.deepEqual(await rpc('award_commit_calculated',args),firstResult);
        assert.deepEqual(await rpc('award_finalize_status',{p_session:session,p_capture_id:c.id,p_request_id:args.p_request_id,p_reason:args.p_reason}),firstResult);
        const frozen=await rpc('award_read_result',{p_session:session,p_result_id:firstResult.id});assert.deepEqual(frozen.snapshot,JSON.parse(JSON.stringify(snapshot)));assert.equal(frozen.snapshot.results.annual.overall[0].disbursement,50);
        const changed=await capture(cleanScope),changedCalculation=calculateCapturedAwards(changed);assert.equal(changedCalculation.results.annual.overall[0].disbursement,60);
        const controller=await rpc('award_read_controller',{p_session:session,p_year:2026,p_scope:cleanScope});
        await rpc('award_save_controller',{p_session:session,p_year:2026,p_scope:cleanScope,p_settings:controller.settings,p_manual:[],p_policy:{...rules,physicalCutoff:'2026-11-30'},p_expected_version:controller.controller_version,p_request_id:randomUUID(),p_reason:'Reviewed later cutoff amendment'});
        await assert.rejects(()=>rpc('award_commit_calculated',{...args,p_capture_id:changed.id,p_snapshot:changedCalculation,p_request_id:randomUUID()}),/Source data changed/);
        const amended=await capture(cleanScope),second=await rpc('award_commit_calculated',{...args,p_capture_id:amended.id,p_snapshot:calculateCapturedAwards(amended),p_request_id:randomUUID(),p_reason:'Confirm amended calculation'});
        const restored=await rpc('award_activate_result',{p_session:session,p_result_id:firstResult.id,p_expected_version:2,p_request_id:randomUUID(),p_reason:'Restore exact original calculated version'});assert.equal(restored.active_result_id,firstResult.id);
        const original=await rpc('award_read_result',{p_session:session,p_result_id:firstResult.id});assert.equal(original.snapshot.results.annual.overall[0].disbursement,50);assert.equal(original.snapshot.policy.physicalCutoff,'2026-11-15');
        const undo=await rpc('award_activate_result',{p_session:session,p_result_id:second.id,p_expected_version:3,p_request_id:randomUUID(),p_reason:'Undo mistaken restore'});assert.equal(undo.active_result_id,second.id);
        assert.equal((await rpc('award_read_result',{p_session:session,p_result_id:second.id})).snapshot.policy.physicalCutoff,'2026-11-30');
    });
    await check('all five actual DCF save paths materialize legacy transactions with conserved Awards identities and opening balances',async()=>{
        const cleanScope={ous:['RPMO 4A']},items=[];
        for(const domain of domains){
            const line={id:10,amount:100,numberOfUnits:1,pricePerUnit:100,obligations:[{id:'raw-o',date:'2026-01-01',amount:100}],disbursements:[{id:'raw-a',date:'2026-02-01',amount:10},{id:'raw-b',date:'2026-02-01',amount:10}]};
            const fields={operatingUnit:'RPMO 4A',fundingYear:2025,fundYear:2025,status:'Completed',estimatedCompletionDate:'2025-12-01',actualCompletionDate:'2026-11-14',physicalDeliveryDate:'2025-12-01',date:'2025-12-01',actualDate:'2026-11-14'};
            const columns=new Set((await db.query('select column_name from information_schema.columns where table_name=$1',[domain.table])).rows.map(row=>row.column_name));
            const data=Object.fromEntries(Object.entries({...fields,...(domain.lines?{[domain.lines]:[line]}:line)}).filter(([key])=>key!=='id'&&columns.has(key)));
            const p=await insertParent(db,domain,data);items.push({domain,p});
        }
        let state=await rpc('award_read_controller',{p_session:session,p_year:2026,p_scope:cleanScope});
        await rpc('award_save_controller',{p_session:session,p_year:2026,p_scope:cleanScope,p_settings:state.settings,p_manual:[],p_policy:policy,p_expected_version:state.controller_version,p_request_id:randomUUID(),p_reason:'Approve disposable materialization baseline'});
        const c=await capture(cleanScope),snapshot=calculateCapturedAwards(c);assert.equal(snapshot.canFinalize,true);
        const saved=await rpc('award_commit_calculated',{p_session:session,p_capture_id:c.id,p_snapshot:snapshot,p_request_id:randomUUID(),p_reason:'Freeze pre-materialization evidence'});
        for(const {domain,p} of items){
            const identity={p_actor_id:1,p_actor_password:'fixture-password',p_entity_type:domain.table,p_parent_id:p.id};
            for(const stage of ['obligation','disbursement']){
                const base=await rpc('read_dcf_state',identity);
                await rpc('commit_dcf_change',{...identity,p_base:base,p_changes:{},p_financial:[{itemId:domain.lines?'10':null,stage,operations:[{action:'insert',id:'new-current-'+stage,value:{date:stage==='obligation'?'2027-01-01':'2027-02-01',amount:5,remarks:'Disposable current-year actual'}}]}],p_request_key:randomUUID(),p_reason:'Materialize unchanged old actuals and add one new actual',p_source:'financial-acf'});
            }
        }
        const nextPolicy={...defaultAnnualPolicy(2027,{id:saved.id,policy}),mode:'Cutoff',transitionApproved:true};state=await rpc('award_read_controller',{p_session:session,p_year:2027,p_scope:cleanScope});
        await rpc('award_save_controller',{p_session:session,p_year:2027,p_scope:cleanScope,p_settings:state.settings,p_manual:[],p_policy:nextPolicy,p_expected_version:state.controller_version,p_request_id:randomUUID(),p_reason:'Review materialized current-year continuation'});
        const after=await capture(cleanScope,session,2027),result=calculateCapturedAwards(after);assert.equal(result.canFinalize,true,JSON.stringify(result.reconciliation.issues));
        assert.equal(result.reconciliation.financial.length,5);
        for(const row of result.reconciliation.financial){assert.equal(row.openingAllotment,80);assert.equal(row.openingUnpaidObligations,80);assert.equal(row.obligations,5);assert.equal(row.disbursements,5);assert.equal(row.closingAllotment,75);}
        const oldIds=new Set(snapshot.recognizedEvents.map(e=>e.id));assert.equal(result.recognizedEvents.filter(e=>!oldIds.has(e.id)).length,10);assert.equal(result.reconciliation.issues.some(i=>i.code==='late_prior_event'),false);
        assert.deepEqual((await rpc('award_read_result',{p_session:session,p_result_id:saved.id})).snapshot,JSON.parse(JSON.stringify(snapshot)));
    });
    await check('actual Completed Activity, Training and Subproject transfers conserve mapped financial carry without another target allocation',async()=>{
        const cleanScope={ous:['RPMO 6']},items=[];
        for(const [index,domain] of [domains[0],domains[1],domains[1]].entries()){
            const line={id:10,amount:100,numberOfUnits:1,pricePerUnit:100,obligations:[{id:'legacy-o',date:'2026-01-01',amount:100}],disbursements:[{id:'legacy-a',date:'2026-02-01',amount:10},{id:'legacy-b',date:'2026-02-01',amount:10}]};
            const fields={operatingUnit:'RPMO 6',fundingYear:2025,status:'Completed',[domain.lines]:[line],...(domain.table==='subprojects'?{estimatedCompletionDate:'2025-12-01',actualCompletionDate:'2026-11-14'}:{type:index===1?'Training':'Activity',date:'2025-12-01',actualDate:'2026-11-14'})};
            items.push({domain,p:await insertParent(db,domain,fields)});
        }
        const setPolicy=async(year,rules)=>{const state=await rpc('award_read_controller',{p_session:session,p_year:year,p_scope:cleanScope});await rpc('award_save_controller',{p_session:session,p_year:year,p_scope:cleanScope,p_settings:state.settings,p_manual:[],p_policy:rules,p_expected_version:state.controller_version,p_request_id:randomUUID(),p_reason:'Review disposable transfer carry policy'});};
        await setPolicy(2026,policy);const c=await capture(cleanScope),snapshot=calculateCapturedAwards(c);assert.equal(snapshot.canFinalize,true);
        const saved=await rpc('award_commit_calculated',{p_session:session,p_capture_id:c.id,p_snapshot:snapshot,p_request_id:randomUUID(),p_reason:'Freeze before expense transfer'});
        for(const {domain,p} of items){
            const identity={p_actor_id:1,p_actor_password:'fixture-password',p_entity_type:domain.table,p_parent_id:p.id};
            for(const stage of ['obligation','disbursement'])await rpc('commit_dcf_change',{...identity,p_base:await rpc('read_dcf_state',identity),p_changes:{},p_financial:[{itemId:'10',stage,operations:[{action:'insert',id:'new-'+stage,value:{date:'2026-10-16',amount:5,remarks:'New recognition cycle only'}}]}],p_request_key:randomUUID(),p_reason:'Materialize legacy actuals before transfer',p_source:'financial-acf'});
            const zero=Object.fromEntries(PARENT_ACTUAL_FIELDS[domain.type].map(({key})=>[key,null]));
            const result=await rpc('submit_budget_item_transfer',{p_actor_id:1,p_actor_password:'fixture-password',p_source_type:domain.type,p_source_id:p.id,p_selected_item_ids:['10'],p_destination_metadata:{status:'Completed'},p_destination_actuals:zero,p_source_actual_remainder:zero,p_reason:'Disposable approved item transfer',p_request_key:randomUUID()});
            assert.equal(result.status,'applied');assert.equal(result.destination.isTransferTargetExcluded,true);assert.equal(result.source.status,'Completed');assert.equal(result.source[domain.lines].length,0);if(domain.type==='activity')assert.equal(result.destination.type,p.type);items.find(row=>row.p.id===p.id&&row.domain===domain).destination=result.destination;
        }
        await setPolicy(2027,{...defaultAnnualPolicy(2027,{id:saved.id,policy}),mode:'Cutoff',transitionApproved:true});
        const after=await capture(cleanScope,session,2027),result=calculateCapturedAwards(after);assert.equal(after.inputs.transferLinks.length,3);assert.equal(result.canFinalize,true,JSON.stringify(result.reconciliation.issues));assert.equal(result.reconciliation.financial.length,3);
        for(const row of result.reconciliation.financial){assert.equal(row.openingAllotment,80);assert.equal(row.targetOpening,80);assert.equal(row.obligations,5);assert.equal(row.disbursements,5);assert.equal(row.closingAllotment,75);assert.equal(row.recordTargetEligible,false);assert(row.basisOriginKey);}
        assert.equal(result.results.annual.overall[0].allocation,240);assert.equal(result.results.annual.overall[0].disbursement,15);
        const beforeIds=new Set(snapshot.recognizedEvents.filter(e=>e.kind!=='physical').map(e=>e.id));assert.equal(result.recognizedEvents.filter(e=>e.kind!=='physical'&&!beforeIds.has(e.id)).length,6);
        assert.deepEqual((await rpc('award_read_result',{p_session:session,p_result_id:saved.id})).snapshot,JSON.parse(JSON.stringify(snapshot)));
        const narrower=await capture({...cleanScope,sourceFundYears:['2026']},session,2027);assert.equal(narrower.inputs.transferLinks.length,0);assert(narrower.inputs.records.every(p=>p.record.fundingYear===2026));
        const transferredActivity=items.find(row=>row.domain.type==='activity').destination;
        await db.query('update activities set workflow_status=null where id=$1',[transferredActivity.id]);
        const inactive=await capture(cleanScope,session,2027);assert(!inactive.inputs.records.some(row=>row.entityType==='activities'&&row.record.id===transferredActivity.id));assert.equal(calculateCapturedAwards(inactive).canFinalize,false);
        await db.query("update activities set workflow_status='APPROVED' where id=$1",[transferredActivity.id]);assert.equal(calculateCapturedAwards(await capture(cleanScope,session,2027)).canFinalize,true);
    });
    await check('replacement source projection retains reciprocal lineage, original basis and independent replacement actuals',async()=>{
        const cleanScope={ous:['RPMO 7']},p=await insertParent(db,domains[0],{operatingUnit:'RPMO 7',fundingYear:2025,status:'Completed',estimatedCompletionDate:'2025-12-01',actualCompletionDate:'2026-11-14',details:[
            {id:10,amount:100,numberOfUnits:1,pricePerUnit:100,originalPlannedAmount:100,isSuperseded:true,replacedByItemIds:[11,12],obligations:[{id:'old-o',date:'2026-01-01',amount:100}]},
            ...[11,12].map(id=>({id,amount:40,numberOfUnits:1,pricePerUnit:40,isAdjustmentItem:true,adjustmentType:'Replacement',adjustmentFundingSource:'Original Allocation',replacementOfItemId:10,disbursements:[{id:'d-'+id,date:'2026-02-01',amount:10}]})),
        ]});
        const state=await rpc('award_read_controller',{p_session:session,p_year:2026,p_scope:cleanScope});await rpc('award_save_controller',{p_session:session,p_year:2026,p_scope:cleanScope,p_settings:state.settings,p_manual:[],p_policy:policy,p_expected_version:state.controller_version,p_request_id:randomUUID(),p_reason:'Review explicit replacement proof'});
        const c=await capture(cleanScope),projected=record(c,'subprojects',p.id);assert.equal(projected.financial.length,3);assert.deepEqual(projected.financial[0].line.replacedByItemIds,[11,12]);
        const snapshot=calculateCapturedAwards(c),f=snapshot.reconciliation.financial[0];assert.equal(snapshot.canFinalize,true,JSON.stringify(snapshot.reconciliation.issues));assert.equal(snapshot.reconciliation.financial.length,1);assert.equal(f.targetOpening,100);assert.equal(f.disbursements,20);assert.equal(f.closingAllotment,80);assert.equal(snapshot.recognizedEvents.filter(e=>e.kind==='disbursement').length,2);
    });
    await check('closed financial markers do not force full historical parent downloads, but deleted reported entries are recaptured for review',async()=>{
        const cleanScope={ous:['RPMO 8']},p=await insertParent(db,domains[0],{operatingUnit:'RPMO 8',fundingYear:2025,status:'Completed',estimatedCompletionDate:'2025-12-01',actualCompletionDate:'2026-11-14',details:[{id:10,amount:100,numberOfUnits:1,pricePerUnit:100}]});
        await db.query(`insert into financial_obligations(entity_type,parent_id,item_id,obligation_date,amount) values('subproject_detail',$1,'10','2026-01-01',100)`,[p.id]);
        const transaction=(await db.query(`insert into financial_disbursements(entity_type,parent_id,item_id,disbursement_date,amount) values('subproject_detail',$1,'10','2026-02-01',100) returning id`,[p.id])).rows[0];
        const setPolicy=async(year,rules)=>{const state=await rpc('award_read_controller',{p_session:session,p_year:year,p_scope:cleanScope});await rpc('award_save_controller',{p_session:session,p_year:year,p_scope:cleanScope,p_settings:state.settings,p_manual:[],p_policy:rules,p_expected_version:state.controller_version,p_request_id:randomUUID(),p_reason:'Review closed cohort relevance'});};
        await setPolicy(2026,policy);const c=await capture(cleanScope),snapshot=calculateCapturedAwards(c),saved=await rpc('award_commit_calculated',{p_session:session,p_capture_id:c.id,p_snapshot:snapshot,p_request_id:randomUUID(),p_reason:'Freeze fully paid historical cohort'});
        await setPolicy(2027,{...defaultAnnualPolicy(2027,{id:saved.id,policy}),mode:'Cutoff',transitionApproved:true});const closed=await capture(cleanScope,session,2027);assert.equal(closed.inputs.records.length,0);assert.equal(calculateCapturedAwards(closed).canFinalize,true);
        await db.query('delete from financial_disbursements where id=$1',[transaction.id]);const changed=await capture(cleanScope,session,2027);assert.equal(changed.inputs.records.length,1);const review=calculateCapturedAwards(changed);assert.equal(review.canFinalize,false);assert(review.reconciliation.issues.some(i=>i.code==='historical_event_missing'));assert.equal(review.reconciliation.financial[0].openingAllotment,0);assert.deepEqual((await rpc('award_read_result',{p_session:session,p_result_id:saved.id})).snapshot,JSON.parse(JSON.stringify(snapshot)));
    });
    console.log(`${passed} Awards source-capture checks passed against disposable DCF, ledger, revision and Resources schemas. No production connection.`);
}catch(error){console.error(error.message);if(error.where)console.error(error.where);process.exitCode=1;}finally{await db.close();}
