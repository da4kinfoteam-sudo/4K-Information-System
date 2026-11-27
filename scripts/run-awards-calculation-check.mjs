import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {bundleAwardsCalculator,root} from './helpers/awards-calculator-bundle.mjs';
const load=async(options)=>{const b=await bundleAwardsCalculator(options);return import('data:text/javascript;base64,'+Buffer.from(b.code).toString('base64'));};
const current=await load(),legacy=await load({source:execFileSync('git',['show','HEAD:lib/awardRankings.ts'],{cwd:root,encoding:'utf8',windowsHide:true})});
const ranking=await load({entry:'lib/awardRankings.ts'}),policyModule=await load({entry:'lib/awardAnnualPolicy.ts'});
const calculate=current.calculateCapturedAwards;let passed=0;
const check=async(name,run)=>{await run();passed++;console.log('PASS '+name);};
const scope={ous:['RPMO 1','RPMO 2'],tiers:null,fundTypes:null,fundSources:null,sourceFundYears:null};
const policy=(year=2026)=>({...policyModule.defaultAnnualPolicy(year),mode:'Cutoff',transitionApproved:true});
const manualPeriods=()=>['Q1','Q2','Q3','Q4'].map(quarter=>({quarter,source:'Manual',state:'Open',version:0,snapshotId:null}));
function parent(id,{entityType='subprojects',year=2025,ou='RPMO 1',actual='2026-11-14',target='2025-12-01',line={},...extra}={}){
    const record={id,uid:`FIXTURE-${entityType}-${id}`,name:'Fixture '+id,operatingUnit:ou,workflow_status:'APPROVED',status:actual?'Completed':'Ongoing',fundingYear:year,fundType:'Continuing',tier:'Tier 1',fundSourceUid:null,fundSource:null,isSavings:false,isRealignment:false,...extra};
    if(entityType==='subprojects')Object.assign(record,{estimatedCompletionDate:target,actualCompletionDate:actual,ipo_id:1});
    else if(entityType==='activities')Object.assign(record,{type:extra.type||'Training',component:'Production and Livelihood',date:target,actualDate:actual,participating_ipo_ids:[1],participatingIpos:['Fixture IPO']});
    else Object.assign(record,{fundYear:year,physicalDeliveryDate:target,actualDate:actual});
    const raw={id:10,amount:100,numberOfUnits:1,pricePerUnit:100,...line};
    record[entityType==='subprojects'?'details':'expenses']=[raw];
    const stage=(kind)=>({source:'central',entries:(line[kind+'s']||[]).map(e=>({precision:'day',...e}))});
    return {entityType,record,financial:[{itemId:'10',line:raw,obligation:stage('obligation'),disbursement:stage('disbursement')}],revision:{incarnation:'fixture-'+id,version:1,revisionId:id},unmatchedFinancial:[]};
}
function capture(records,{year=2026,rules=policy(year),baseline=null,scopeValue=scope}={}){
    const capturedScope=structuredClone(scopeValue);
    return {id:randomUUID(),awards_year:year,source_hash:'disposable-source-hash',source_data_as_of:`${year}-11-26T00:00:00Z`,scope:capturedScope,
        inputs:{schemaVersion:1,awardsYear:year,scope:capturedScope,policy:rules,settings:structuredClone(ranking.DEFAULT_AWARD_SETTINGS),manual:[],records,fundSourceReferences:[],ipoReferences:[{id:1,name:'Fixture IPO'}],reportorialPeriods:manualPeriods(),dependencies:[],baseline}};
}
const baseline=(snapshot,id=randomUUID())=>({id,awardsYear:snapshot.awardsYear,policy:snapshot.policy,carryHash:'fixture-carry-hash',carry:structuredClone(snapshot.carry),recognizedEvents:structuredClone(snapshot.recognizedEvents)});
const nextCapture=(records,previous,year=2027)=>capture(records,{year,baseline:previous,rules:{...policyModule.defaultAnnualPolicy(year,{id:previous.id,policy:previous.policy}),mode:'Cutoff',transitionApproved:true}});
const entry=(id,date,amount)=>({id:String(id),date,amount});
const financialLine={obligations:[entry(1,'2025-12-01',70),entry(2,'2026-08-01',20)],disbursements:[entry(1,'2025-12-20',40),entry(2,'2026-09-01',30),entry(3,'2026-10-16',10)]};
let first,firstCapture;
await check('shared formula extraction preserves every legacy quarterly/annual value across representative cohorts',()=>{
    for(let i=0;i<24;i++){
        const year=2024+i%3,ou=i%2?'RPMO 1':'RPMO 2';
        const data={operatingUnitScope:scope.ous,subprojects:[{id:1,name:'Legacy SP',operatingUnit:ou,fundingYear:year,status:'Completed',estimatedCompletionDate:`${year}-06-01`,actualCompletionDate:`${year}-06-30`,indigenousPeopleOrganization:'One',details:[{id:10,amount:100+i,obligationMonth:`${year}-01-01`,obligations:[entry(1,`${year}-02-01`,80)],disbursements:[entry(2,`${year}-03-01`,40+i)]}],isSavings:i%4===0}],trainings:[],otherActivities:[],officeReqs:[],staffingReqs:[],otherProgramExpenses:[],ipos:[]};
        for(const [index,component] of ['Social Preparation','Production and Livelihood','Marketing and Enterprise','Program Management'].entries()){
            const activity={id:index+10,name:'Legacy activity '+index,type:index%2?'Activity':'Training',component,operatingUnit:ou,fundingYear:year,status:i%6===0?'Cancelled':'Completed',date:`${year}-03-01`,actualDate:`${year}-03-20`,participatingIpos:['One','Two'],isRealignment:i%5===0,expenses:[{id:20+index,amount:50,obligationMonth:`${year}-01-01`,obligations:[entry(5,`${year}-02-01`,40)],disbursements:[entry(6,`${year}-03-02`,20)]}]};
            (activity.type==='Training'?data.trainings:data.otherActivities).push(activity);
        }
        data.officeReqs.push({id:31,equipment:'Equipment',operatingUnit:ou,fundYear:year,status:'Completed',numberOfUnits:2,pricePerUnit:25,physicalDeliveryDate:`${year}-06-01`,actualDate:`${year}-06-12`,obligationDate:`${year}-04-01`,obligations:[entry(7,`${year}-05-01`,40)],disbursements:[entry(8,`${year}-06-01`,20)]});
        data.staffingReqs.push({id:32,personnelPosition:'Staff',operatingUnit:ou,fundYear:year,status:'Contractual',physicalDeliveryDate:`${year}-02-01`,actualDate:`${year}-02-12`,expenses:[{id:30,amount:100,obligationDate:`${year}-01-01`,obligations:[entry(9,`${year}-01-01`,100)],disbursements:[entry(10,`${year}-02-01`,20)]}]});
        data.otherProgramExpenses.push({id:33,particulars:'Other',operatingUnit:ou,fundYear:year,amount:30,obligationDate:`${year}-01-01`,obligations:[entry(11,`${year}-01-01`,30)],disbursements:[entry(12,`${year}-02-01`,10)]});
        const manual=[{fund_year:year,period:'Q1',operating_unit:ou,reportorial_required:5,reportorial_submitted:i%6,national_activities_required:2,national_activities_attended:i%3}];
        assert.deepEqual(ranking.calculateAwardsDashboardData(data,String(year),ranking.DEFAULT_AWARD_SETTINGS,manual),legacy.calculateAwardsDashboardData(data,String(year),ranking.DEFAULT_AWARD_SETTINGS,manual));
    }
});
await check('a prior-FY completion and independently dated transactions use matched annual bases without changing normal quarterly results',()=>{
    firstCapture=capture([parent(1,{line:financialLine})]);const untouched=structuredClone(firstCapture);first=calculate(firstCapture);
    const row=first.results.annual.overall.find(r=>r.ou==='RPMO 1'),f=first.reconciliation.financial[0];
    assert.equal(row.physicalCompletionRate,100);assert.equal(row.allocation,60);assert.equal(row.obligation,50);assert.equal(row.disbursement,30);assert.equal(row.disbursementVsAllotmentRate,50);assert.equal(row.disbursementVsObligationRate,60);
    assert.equal(f.closingAllotment,30);assert.equal(f.closingUnpaidObligations,20);assert.equal(first.canFinalize,true);assert.deepEqual(firstCapture,untouched);
    assert(first.results.quarters.every(q=>q.financial.every(r=>r.allocation===0&&r.obligation===0&&r.disbursement===0)));
    assert.equal(first.consistencyQuarters[3].physicalComponents.productionLivelihood.find(r=>r.ou==='RPMO 1').completionRate,100);
});
await check('cutoff days are inclusive and late encoding is not a second eligibility date',()=>{
    const p1=parent(1,{actual:'2026-11-15'}),p2=parent(2,{actual:'2026-11-16'});p1.record.created_at='2026-11-25T10:00:00Z';
    const result=calculate(capture([p1,p2]));assert.equal(result.results.annual.overall.find(r=>r.ou==='RPMO 1').physicalCompletionRate,50);
    assert.equal(result.reconciliation.physical.filter(r=>r.includedActual).length,1);assert.equal(result.carry.filter(r=>r.kind==='physical').length,1);
});
await check('the next Awards Year carries only remaining bases and recognizes October 16 transactions once',()=>{
    const previous=baseline(first),result=calculate(nextCapture([parent(1,{line:financialLine})],previous));
    const f=result.reconciliation.financial[0],row=result.results.annual.overall.find(r=>r.ou==='RPMO 1');
    assert.equal(f.openingAllotment,30);assert.equal(f.openingUnpaidObligations,20);assert.equal(f.obligations,0);assert.equal(f.disbursements,10);assert.equal(f.closingAllotment,20);assert.equal(f.closingUnpaidObligations,10);
    assert.equal(row.allocation,30);assert.equal(row.disbursement,10);assert.equal(result.reconciliation.physical[0].includedTarget,false);assert.equal(result.reconciliation.physical[0].includedActual,false);
    assert.equal(result.recognizedEvents.filter(e=>e.id==='disbursement:central:3').length,1);assert.equal(result.canFinalize,true);
});
await check('late prior-window records stay out of new-year actuals without rewriting or halting an unaffected finalized baseline',()=>{
    const result=calculate(nextCapture([parent(1,{line:financialLine}),parent(2,{actual:'2026-11-14'})],baseline(first)));
    assert(result.reconciliation.issues.some(i=>i.code==='late_prior_event'&&i.severity==='warning'));assert.equal(result.canFinalize,true);assert.equal(result.reconciliation.physical.find(r=>r.parentId==='2').includedActual,false);
    assert.equal(result.recognizedEvents.find(e=>e.id==='physical:subprojects:2').basisOnly,true);
});
await check('snapshots do not share mutable settings, scope, references or records with their capture input',()=>{
    const input=capture([parent(1)]),result=calculate(input),saved=structuredClone(result);input.inputs.settings.quarterlyRestPoints=999;input.inputs.ipoReferences[0].name='Changed later';input.scope.ous.push('RPMO 3');input.inputs.records[0].record.actualCompletionDate='2026-11-30';
    assert.deepEqual(result,saved);
});
await check('ambiguous legacy monthly amounts remain evidence and cannot silently finalize as zero',()=>{
    const p=parent(1);p.financial[0].disbursement={source:'legacy-monthly',calendarYearKnown:false,entries:[{id:'month:10',precision:'month',month:null,monthOfYear:10,amount:20}]};
    const result=calculate(capture([p]));assert.equal(result.canFinalize,false);assert(result.reconciliation.issues.some(i=>i.code==='ambiguous_date'));assert.equal(result.reconciliation.unresolvedEvents[0].amount,20);
});
await check('parent and line supplemental exclusions retain actuals without adding target allocation',()=>{
    const regular=parent(1,{line:{obligations:[entry(10,'2026-01-01',100)],disbursements:[entry(10,'2026-02-01',50)]}});
    const saved=parent(2,{isSavings:true,line:{obligations:[entry(11,'2026-01-01',100)],disbursements:[entry(11,'2026-02-01',50)]}});
    const pending=parent(3,{workflow_status:'PENDING',isTransferTargetExcluded:true,budgetItemTransferId:randomUUID()});
    const result=calculate(capture([regular,saved,pending])),row=result.results.annual.overall.find(r=>r.ou==='RPMO 1');
    assert.equal(row.allocation,100);assert.equal(row.obligation,200);assert.equal(row.disbursement,100);assert.equal(result.reconciliation.physical.filter(r=>r.includedTarget).length,1);assert.equal(result.results.annual.mostSubprojects.find(r=>r.ou==='RPMO 1').score,2);
    assert(!result.sourceReferences.some(r=>r.parentId==='3'));
});
await check('transfer destinations require explicit approval while ordinary legacy workflow defaults remain compatible',()=>{
    const transferred=parent(1,{budgetItemTransferId:randomUUID(),isTransferTargetExcluded:true,line:{obligations:[entry(1,'2026-01-01',100)],disbursements:[entry(1,'2026-02-01',50)]}});delete transferred.record.workflow_status;
    const ordinary=parent(2);delete ordinary.record.workflow_status;const result=calculate(capture([transferred,ordinary]));assert(!result.sourceReferences.some(row=>row.parentId==='1'));assert(result.sourceReferences.some(row=>row.parentId==='2'));assert.equal(result.results.annual.mostSubprojects.find(row=>row.ou==='RPMO 1').score,1);
    transferred.record.workflow_status='APPROVED';const approved=calculate(capture([transferred]));assert.equal(approved.reconciliation.financial[0].targetOpening,0);assert.equal(approved.reconciliation.financial[0].disbursements,50);assert.equal(approved.reconciliation.physical[0].includedActual,true);
});
await check('missing outstanding source records preserve the frozen target and money basis until reconciliation',()=>{
    const before=calculate(capture([parent(1,{actual:null,line:{obligations:[entry(1,'2026-01-01',100)]}})]));
    const result=calculate(nextCapture([],baseline(before))),row=result.results.annual.overall.find(r=>r.ou==='RPMO 1');
    assert.equal(row.allocation,100);assert.equal(row.obligation,100);assert.equal(row.physicalCompletionRate,0);assert.equal(result.reconciliation.physical.filter(r=>r.includedTarget).length,1);assert.equal(result.canFinalize,false);
});
await check('editing a previously recognized amount requires an earlier-year amendment and never mutates that baseline',()=>{
    const previous=baseline(first),unchanged=structuredClone(previous),edited=structuredClone(financialLine);edited.disbursements[1].amount=35;
    const result=calculate(nextCapture([parent(1,{line:edited})],previous));assert(result.reconciliation.issues.some(i=>i.code==='historical_event_changed'));assert.equal(result.canFinalize,false);assert.equal(result.reconciliation.financial[0].openingAllotment,30);assert.deepEqual(previous,unchanged);
    const amended=calculate(capture([parent(1,{line:edited})])),fixed=calculate(nextCapture([parent(1,{line:edited})],baseline(amended)));assert.equal(fixed.reconciliation.financial[0].openingAllotment,25);assert.equal(fixed.canFinalize,true);
});
await check('legitimate identical-looking entries keep separate identities while duplicate identities block finalization',()=>{
    const p=parent(1,{line:{obligations:[entry(1,'2026-01-01',100)],disbursements:[entry(1,'2026-02-01',10),entry(2,'2026-02-01',10)]}}),valid=calculate(capture([p]));assert.equal(valid.results.annual.overall.find(r=>r.ou==='RPMO 1').disbursement,20);assert.equal(valid.canFinalize,true);
    p.financial[0].disbursement.entries[1].id='1';const invalid=calculate(capture([p]));assert.equal(invalid.canFinalize,false);assert(invalid.reconciliation.issues.some(i=>i.code==='duplicate_event'));
});
await check('durable legacy-to-central lineage preserves independent recognized events and never recounts them',()=>{
    const legacy=parent(1,{line:{obligations:[entry('old-o','2026-01-01',100)],disbursements:[entry('old-a','2026-02-01',10),entry('old-b','2026-02-01',10)]}});
    for(const stage of ['obligation','disbursement']){legacy.financial[0][stage].source='embedded';legacy.financial[0][stage].entries.forEach((entry,index)=>entry.historicalId=`legacy:${stage}:10:${index}`);}
    const saved=calculate(capture([legacy])),prior=baseline(saved),unchanged=structuredClone(prior),central=structuredClone(legacy);
    for(const stage of ['obligation','disbursement']){central.financial[0][stage].source='central';central.financial[0][stage].entries.forEach((entry,index)=>{entry.id=String(100+index);entry.historicalIds=[entry.historicalId];delete entry.historicalId;});}
    const result=calculate(nextCapture([central],prior)),line=result.reconciliation.financial[0];assert.equal(line.openingAllotment,80);assert.equal(line.openingUnpaidObligations,80);assert.equal(line.obligations,0);assert.equal(line.disbursements,0);assert.equal(result.canFinalize,true);assert.deepEqual(result.recognizedEvents.map(e=>e.id),saved.recognizedEvents.map(e=>e.id));assert.deepEqual(prior,unchanged);
    central.financial[0].disbursement.entries[0].amount=11;const corrected=calculate(nextCapture([central],prior));assert.equal(corrected.canFinalize,false);assert(corrected.reconciliation.issues.some(i=>i.code==='historical_event_changed'));assert.equal(corrected.reconciliation.financial[0].openingAllotment,80);
});
await check('ambiguous financial lineage blocks finalization without merging equal-looking actual entries',()=>{
    const legacy=parent(1,{line:{disbursements:[entry('a','2026-02-01',10),entry('b','2026-02-01',10)]}});legacy.financial[0].disbursement.source='embedded';legacy.financial[0].disbursement.entries.forEach((entry,index)=>entry.historicalId=`legacy:disbursement:10:${index}`);
    const saved=calculate(capture([legacy])),central=structuredClone(legacy);central.financial[0].disbursement={source:'central',entries:[{...entry(99,'2026-02-01',20),historicalIds:['legacy:disbursement:10:0','legacy:disbursement:10:1']}]};
    const result=calculate(nextCapture([central],baseline(saved)));assert.equal(result.canFinalize,false);assert(result.reconciliation.issues.some(i=>i.code==='ambiguous_financial_lineage'));assert.equal(result.recognizedEvents.filter(e=>e.kind==='disbursement').length,2);
});
await check('applied transfer chains move a finalized remaining basis exactly once without creating a new allocation',()=>{
    const source=parent(1,{line:financialLine});source.financial=[];source.record.details=[];
    const middle=parent(2,{line:financialLine,isTransferTargetExcluded:true});middle.financial=[];middle.record.details=[];
    const destination=parent(3,{line:financialLine,isTransferTargetExcluded:true});
    const c=nextCapture([source,middle,destination],baseline(first));c.inputs.transferLinks=[
        {id:randomUUID(),entityType:'subprojects',sourceId:'1',destinationId:'2',itemIds:['10'],sourceOu:'RPMO 1',destinationOu:'RPMO 1',resolvedAt:'2026-11-26T00:00:00Z'},
        {id:randomUUID(),entityType:'subprojects',sourceId:'2',destinationId:'3',itemIds:['10'],sourceOu:'RPMO 1',destinationOu:'RPMO 1',resolvedAt:'2026-11-26T01:00:00Z'},
    ];
    const result=calculate(c),f=result.reconciliation.financial[0];assert.equal(result.reconciliation.financial.length,1);assert.equal(f.openingAllotment,30);assert.equal(f.targetOpening,30);assert.equal(f.disbursements,10);assert.equal(f.closingAllotment,20);assert.equal(f.recordTargetEligible,false);assert.equal(f.basisOriginKey,'subprojects:1:line:10');assert.equal(f.transferIds.length,2);assert.equal(result.canFinalize,true,JSON.stringify(result.reconciliation.issues));
    const later=calculate(nextCapture([source,middle,destination],baseline(result),2028));assert.equal(later.reconciliation.financial[0].targetOpening,20);assert.equal(later.reconciliation.financial[0].disbursements,0);assert.equal(later.canFinalize,true);
    const unproven=structuredClone(c);unproven.inputs.transferLinks=[];assert.equal(calculate(unproven).canFinalize,false);
});
await check('unproved cross-scope or cyclic transfer lineage cannot silently consume an opening balance',()=>{
    const destination=parent(2,{line:financialLine,isTransferTargetExcluded:true}),source=parent(1,{line:financialLine});source.financial=[];source.record.details=[];
    const c=nextCapture([source,destination],baseline(first)),link={id:randomUUID(),entityType:'subprojects',sourceId:'1',destinationId:'2',itemIds:['10'],sourceOu:'RPMO 1',destinationOu:'RPMO 1',resolvedAt:'2026-11-26T00:00:00Z'};c.inputs.transferLinks=[link,{...link,id:randomUUID(),sourceId:'2',destinationId:'1'}];
    const result=calculate(c);assert.equal(result.canFinalize,false);assert(result.reconciliation.issues.some(i=>i.code==='ambiguous_transfer_lineage'));
    c.inputs.transferLinks=[{...link,sourceOu:'RPMO 3'}];assert.throws(()=>calculate(c),/outside the validated/);
});
await check('scope mismatch is rejected and displayed IPO counts deduplicate stable linked identities',()=>{
    assert.throws(()=>calculate(capture([parent(1,{ou:'RPMO 3'})])),/outside/);
    const result=calculate(capture([parent(1),parent(2,{entityType:'activities'})]));assert.equal(result.results.annual.mostIposAssisted.find(r=>r.ou==='RPMO 1').score,1);
});
await check('original-allocation replacements retain one original cash basis and independently dated actuals',()=>{
    const before=parent(1,{line:{obligations:[entry(1,'2026-01-01',100)],disbursements:[entry(1,'2026-02-01',20)]}}),saved=calculate(capture([before]));
    const changed=structuredClone(before),root=changed.financial[0];Object.assign(root.line,{isSuperseded:true,replacedByItemIds:[11,12],originalPlannedAmount:100});
    for(const [id,amount] of [[11,40],[12,40]])changed.financial.push({itemId:String(id),line:{id,amount,isAdjustmentItem:true,adjustmentType:'Replacement',adjustmentFundingSource:'Original Allocation',replacementOfItemId:10},obligation:{source:'embedded',entries:[]},disbursement:{source:'embedded',entries:[{...entry('paid-'+id,'2026-11-01',10),historicalId:`legacy:disbursement:${id}:0`}]}});
    const result=calculate(nextCapture([changed],baseline(saved))),f=result.reconciliation.financial[0];
    assert.equal(result.reconciliation.financial.length,1);assert.equal(f.openingAllotment,80);assert.equal(f.targetOpening,80);assert.equal(f.disbursements,20);assert.equal(f.closingAllotment,60);assert.equal(f.recordTargetEligible,false);assert.deepEqual(f.replacementItemIds,['10','11','12']);assert.equal(result.canFinalize,true,JSON.stringify(result.reconciliation.issues));
    const materialized=structuredClone(changed);for(const child of materialized.financial.slice(1))child.disbursement={source:'central',entries:child.disbursement.entries.map((e,index)=>({...e,id:'central-'+child.itemId+'-'+index,historicalLinks:[{parentId:'1',itemId:child.itemId,historicalId:e.historicalId}]}))};
    const later=calculate(nextCapture([materialized],baseline(result),2028));assert.equal(later.reconciliation.financial[0].targetOpening,60);assert.equal(later.reconciliation.financial[0].disbursements,0);assert.equal(later.canFinalize,true,JSON.stringify(later.reconciliation.issues));assert.deepEqual(later.recognizedEvents.map(e=>e.id),result.recognizedEvents.map(e=>e.id));
    const initial=calculate(capture([changed]));assert.equal(initial.reconciliation.financial[0].originalBasis,100);assert.equal(initial.reconciliation.financial[0].targetOpening,100);assert.equal(initial.results.quarters[0].financial.find(r=>r.ou==='RPMO 1').allocation,0);
});
await check('replacement proof is explicit and supplemental replacement funding remains separate',()=>{
    const p=parent(1),root=p.financial[0];Object.assign(root.line,{isSuperseded:true,replacedByItemIds:[11]});
    p.financial.push({itemId:'11',line:{id:11,amount:50,isAdjustmentItem:true,isSavings:true,adjustmentType:'Replacement',adjustmentFundingSource:'Savings',replacementOfItemId:10},obligation:{source:'embedded',entries:[]},disbursement:{source:'embedded',entries:[entry('new','2026-02-01',10)]}});
    let result=calculate(capture([p]));assert.equal(result.reconciliation.financial.length,2);assert.equal(result.results.annual.overall.find(r=>r.ou==='RPMO 1').allocation,0);assert.equal(result.results.annual.overall.find(r=>r.ou==='RPMO 1').disbursement,10);
    Object.assign(p.financial[1].line,{isSavings:false,adjustmentFundingSource:'Original Allocation',replacementOfItemId:999});result=calculate(capture([p]));assert.equal(result.canFinalize,false);assert(result.reconciliation.issues.some(i=>i.code==='ambiguous_replacement_lineage'));
});
await check('missing reported actual entries cannot silently change a frozen financial lineage',()=>{
    const previous=baseline(first),frozen=structuredClone(previous),p=parent(1,{line:financialLine});p.financial[0].disbursement.entries=p.financial[0].disbursement.entries.filter(e=>e.id!=='2');
    const result=calculate(nextCapture([p],previous));assert.equal(result.canFinalize,false);assert(result.reconciliation.issues.some(i=>i.code==='historical_event_missing'&&i.key==='disbursement:central:2'));assert.equal(result.reconciliation.financial[0].openingAllotment,30);assert(result.reconciliation.unresolvedEvents.some(e=>e.id==='disbursement:central:2'&&e.amount===30));assert.deepEqual(previous,frozen);
    const missingClosed=structuredClone(previous);missingClosed.carry.forEach(row=>{if(row.kind==='financial')Object.assign(row,{closingAllotment:0,closingUnpaidObligations:0,targetClosing:0});});assert.equal(calculate(nextCapture([],missingClosed)).canFinalize,true);
});
await check('future planning budgets do not inflate the current Awards Year, while actual early delivery remains date-scoped',()=>{
    const planned=parent(1,{year:2027,target:'2027-06-01',actual:null}),early=parent(2,{year:2027,target:'2027-06-01',actual:'2026-11-14'});
    assert.equal(calculate(capture([planned])).results.annual.overall.find(r=>r.ou==='RPMO 1').allocation,0);
    const result=calculate(capture([planned,early]));assert.equal(result.results.annual.overall.find(r=>r.ou==='RPMO 1').allocation,0);assert.equal(result.reconciliation.physical.length,1);assert.equal(result.reconciliation.physical[0].includedActual,true);
});
await check('late prior-period actuals affecting a frozen carried target still require explicit reconciliation',()=>{
    const before=calculate(capture([parent(1,{actual:null})])),result=calculate(nextCapture([parent(1,{actual:'2026-11-14'})],baseline(before)));
    assert.equal(result.canFinalize,false);assert(result.reconciliation.issues.some(i=>i.code==='late_prior_event'&&i.severity==='blocking'));assert.equal(result.reconciliation.physical[0].includedTarget,true);
});
await check('an inactive supplemental draft cannot erase a previously finalized outstanding basis',()=>{
    const p=parent(1,{line:financialLine});Object.assign(p.financial[0].line,{fundingOrigin:'SupplementalDraft',supplementUid:randomUUID(),supplementStatus:'DRAFT'});
    const result=calculate(nextCapture([p],baseline(first)));
    assert.equal(result.results.annual.overall.find(r=>r.ou==='RPMO 1').allocation,30);assert.equal(result.reconciliation.financial[0].openingUnpaidObligations,20);
    assert.equal(result.canFinalize,false);assert(result.reconciliation.issues.some(i=>i.code==='missing_opening_source'));
});
await check('fractional reported amounts are totaled before display rounding and do not create false negative balances',()=>{
    const result=calculate(capture([parent(1,{line:{amount:0.3,obligations:[entry(1,'2026-01-01',0.3)],disbursements:[entry(1,'2026-02-01',0.1),entry(2,'2026-02-02',0.2)]}})]));
    assert.equal(result.reconciliation.financial[0].closingAllotment,0);assert.equal(result.reconciliation.financial[0].closingUnpaidObligations,0);assert.equal(result.reconciliation.issues.length,0);
    const rows=Array.from({length:10},(_,i)=>parent(i+1,{line:{amount:0.01,obligations:[entry(i+1,'2026-01-01',0.01)],disbursements:[entry(i+1,'2026-02-01',0.001)]}}));
    const combined=calculate(capture(rows)).results.annual.overall.find(r=>r.ou==='RPMO 1');assert.equal(combined.disbursement,0.01);assert.equal(combined.allocation,0.1);assert.equal(combined.disbursementVsAllotmentRate,10);
});
await check('a later cutoff can change the actual calculated winner while the earlier snapshot stays exact',()=>{
    const records=[parent(1,{ou:'RPMO 1',line:{obligations:[entry(1,'2026-01-01',100)],disbursements:[entry(1,'2026-02-01',50)]}}),
        parent(2,{ou:'RPMO 2',actual:'2026-11-20',line:{amount:50,obligations:[entry(2,'2026-01-01',50)],disbursements:[entry(2,'2026-02-01',45)]}}),
        parent(3,{ou:'RPMO 2',actual:'2026-11-25',line:{amount:50,obligations:[entry(3,'2026-01-01',50)],disbursements:[entry(3,'2026-02-01',45)]}})];
    const original=capture(records);Object.assign(original.inputs.settings,{annualConsistencyPoints:{0:0,1:0,2:0,3:0,4:0},annualAttendanceMissedPoints:{0:0,1:0,2:0},annualFinancialCompletionBands:[{min:0,points:0}],annualPhysicalCompletionBands:[{min:100,points:100},{min:0,points:0}]});
    const first=calculate(original),frozen=structuredClone(first),changed=structuredClone(original);changed.inputs.policy.physicalCutoff='2026-11-30';const second=calculate(changed);
    assert.equal(first.results.annual.overall[0].ou,'RPMO 1');assert.equal(second.results.annual.overall[0].ou,'RPMO 2');assert.deepEqual(first,frozen);assert.equal(first.policy.physicalCutoff,'2026-11-15');
});
await check('a five-thousand-record cohort retains every target and independently identified transaction',()=>{
    const records=Array.from({length:5000},(_,i)=>parent(i+1,{ou:i%2?'RPMO 1':'RPMO 2',line:{obligations:[entry(i+1,'2026-01-01',100)],disbursements:[entry(i+1,'2026-02-01',50)]}}));
    const started=performance.now(),result=calculate(capture(records));
    for(const row of result.results.annual.overall){assert.equal(row.allocation,250000);assert.equal(row.obligation,250000);assert.equal(row.disbursement,125000);assert.equal(row.physicalCompletionRate,100);}
    assert.equal(result.recognizedEvents.length,15000);assert.equal(result.canFinalize,true);console.log(`Scale diagnostic: 5000 parents, 10000 financial transactions, ${Math.round(performance.now()-started)}ms.`);
});
console.log(`${passed} captured Awards calculation checks passed, including 24 unchanged-production formula comparisons. No database or network connection.`);
