import assert from 'node:assert/strict';
import { createServer } from 'vite';
import * as XLSX from 'xlsx';
const server=await createServer({configFile:false,appType:'custom',server:{middlewareMode:true},optimizeDeps:{noDiscovery:true,entries:[]},plugins:[{
    name:'supplement-offline',enforce:'pre',
    resolveId(id){if(id.endsWith('supabaseClient'))return '\0offline';},
    load(id){if(id==='\0offline')return `export const supabase={rpc:async(name,payload)=>{globalThis.fixture.calls.push({name,payload});return globalThis.fixture.result;},from(){let payload;const q={insert(rows){payload=rows;return q;},select(){return q;},then(resolve){globalThis.fixture.inserts.push(payload);return Promise.resolve({data:payload.map((row,index)=>({...row,id:100+index})),error:null}).then(resolve);}};return q;}};`;},
}]});
try{
    const {getActivityBudgetSummary,isActivityExpenseActualEligible,isOriginalActivityBudgetLocked}=await server.ssrLoadModule('/lib/activitySupplementalBudget.ts');
    const {collectFinancialLineItems,aggregateHomepageFinancials}=await server.ssrLoadModule('/lib/financialAggregation.ts');
    const {buildActivityClonePayload}=await server.ssrLoadModule('/lib/recordCloning.ts');
    const {getTransferEligibleLines}=await server.ssrLoadModule('/lib/budgetItemTransfer.ts');
    const {canEditDcfSection,DEFAULT_DCF_POLICY_SETTINGS}=await server.ssrLoadModule('/lib/dcfPolicy.ts');
    const expense=(id,amount=1000)=>({id,amount,objectType:'MOOE',expenseParticular:'Travel',uacsCode:'502',obligationMonth:'2026-10-01',disbursementMonth:'2026-11-01'});
    const source={id:1,uid:'ACT-1',type:'Training',component:'Program Management',name:'Fixture Training',status:'Ongoing',workflow_status:'APPROVED',fundingYear:2026,operatingUnit:'NPMO',participantsMale:5,participantsFemale:5,participatingIpos:[],expenses:[
        expense(1,10000),{...expense(2,2000),fundingOrigin:'Supplemental',supplementUid:'supplement-approved',supplementStatus:'APPROVED',supplementalSource:'Savings',obligations:[{id:20,date:'2026-10-01',amount:500},{id:21,date:'2026-10-10',amount:-100}],disbursements:[{id:30,date:'2026-11-01',amount:200}]},
        {...expense(3,3000),fundingOrigin:'Supplemental',supplementUid:'supplement-pending',supplementStatus:'PENDING',supplementalSource:'Realignment'},
        {...expense(4,4000),isSavings:true,actualObligationAmount:600},
        {...expense(5,1000),fundingOrigin:'SupplementalDraft',supplementStatus:'DRAFT',supplementalSource:'Realignment'},
    ],original_budget_snapshot:{kind:'initial',capturedAt:'2026-10-14',expenses:[expense(1,10000)]}};
    assert.deepEqual(getActivityBudgetSummary(source),{original:10000,target:10000,savings:6000,realignment:0,supplemental:6000,current:16000,obligated:1000,disbursed:200,unobligated:15000});
    assert.equal(getActivityBudgetSummary({...source,original_budget_snapshot:null}).original,null);
    assert.equal(getActivityBudgetSummary({...source,status:'Proposed',original_budget_snapshot:null}).original,10000);
    assert.equal(getActivityBudgetSummary({...source,isTransferTargetExcluded:true}).target,0);
    assert.equal(getActivityBudgetSummary({...source,budgetItemTransferId:'transfer',workflow_status:'PENDING'}).current,0);
    assert.equal(getActivityBudgetSummary({...source,expenses:source.expenses.map(row=>row.id===2?{...row,supplementStatus:'WITHDRAWN'}:row)}).supplemental,4000);
    assert.equal(isActivityExpenseActualEligible(source.expenses[2]),false);
    assert.equal(isOriginalActivityBudgetLocked(source),true);
    assert.equal(isOriginalActivityBudgetLocked({...source,status:'Proposed'}),true);
    assert.deepEqual(getTransferEligibleLines('activity',source).map(row=>row.id),[1,2,4]);
    assert.deepEqual(getTransferEligibleLines('activity',{...source,expenses:source.expenses.map(row=>({...row,supplementRevisionPending:true}))}).map(row=>row.id),[1,4]);
    const context={user:{role:'Super Admin'},hasModuleAccess:true,policy:DEFAULT_DCF_POLICY_SETTINGS,moduleKey:'activities',status:'Ongoing'};
    assert.equal(canEditDcfSection({...context,action:'editBudget'}).allowed,false);
    assert.equal(canEditDcfSection({...context,action:'editSupplementalBudget'}).allowed,true);
    assert.equal(canEditDcfSection({...context,status:'Cancelled',action:'editSupplementalBudget'}).allowed,false);
    assert.equal(canEditDcfSection({...context,status:'Completed',user:{role:'User'},action:'editSupplementalBudget'}).allowed,false);
    const data={subprojects:[],activities:[source],officeReqs:[],staffingReqs:[],otherProgramExpenses:[]},filters={year:'2026',actualYear:'2026'};
    const lines=collectFinancialLineItems(data,filters);
    assert.deepEqual(lines.map(row=>[row.line.id,row.alloc,row.obli,row.disb]),[[1,10000,0,0],[2,0,400,200],[4,0,600,0]]);
    const totals=aggregateHomepageFinancials(data,filters);assert.equal(totals.total.alloc,10000);assert.equal(totals.total.obli,1000);assert.equal(totals.total.disb,200);
    const snapshot=JSON.stringify(source),clone=buildActivityClonePayload(source,{createdAt:'2026-10-14',encodedBy:'Fixture',requiresApprover:true});
    assert.equal(JSON.stringify(source),snapshot);assert.equal(clone.original_budget_snapshot,undefined);assert.equal(clone.workflow_status,'PENDING');
    assert.equal(clone.expenses[0].fundingOrigin,undefined);
    assert(clone.expenses.slice(1).every(row=>!row.supplementUid&&row.supplementStatus==='DRAFT'&&row.fundingOrigin==='SupplementalDraft'&&row.obligations.length===0&&row.disbursements.length===0));
    assert.equal(getActivityBudgetSummary(clone).current,10000);
    const {readActivitySupplements,saveActivitySupplement}=await server.ssrLoadModule('/lib/activitySupplementalPersistence.ts');
    globalThis.fixture={calls:[],result:{data:{activity:source,supplements:[]},error:null},inserts:[]};
    const actor={id:1,password:'fixture-password'};
    await readActivitySupplements(1,actor);assert.equal(globalThis.fixture.calls[0].payload.p_history,false);
    const args={activity:source,actor,uid:'fixture',operation:'submit',source:'Savings',reference:'Letter',authorizationDate:'2026-10-14',reason:'Fixture',rows:[expense(10)],revision:0,establishBaseline:false,requestKey:'fixture-key'};
    await saveActivitySupplement(args);assert.equal(globalThis.fixture.calls.length,2);assert.equal(globalThis.fixture.calls[1].payload.p_activity_id,1);
    globalThis.fixture.result={data:null,error:{message:'Synthetic failure'}};await assert.rejects(()=>saveActivitySupplement(args),/Synthetic failure/);
    globalThis.fixture.result={data:{activity:source},error:null};await assert.rejects(()=>saveActivitySupplement(args),/confirmed/);
    let exported;globalThis.XLSX={...XLSX,writeFile:book=>{exported=book;}};globalThis.window={XLSX:globalThis.XLSX};const messages=[];globalThis.alert=message=>messages.push(message);
    const {downloadActivitiesReport,handleActivitiesUpload}=await server.ssrLoadModule('/components/mainfunctions/ImportExportService.ts');
    downloadActivitiesReport([source],[]);const report=XLSX.utils.sheet_to_json(exported.Sheets['Activities Report'])[0];
    assert.equal(report['Total Budget'],10000);assert.equal(report['Supplemental Budget'],6000);assert.equal(report['Current Active Budget'],16000);
    const importRow=async extras=>{
        const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.json_to_sheet([{uid:'ACT-IMPORT',type:'Activity',component:'Program Management',name:'Fixture',date:'2026-10-14',expense_uacsCode:'502',expense_amount:2000,expense_obligationMonth:'2026-10-01',expense_disbursementMonth:'2026-11-01',expense_supplementalSource:'Savings',...extras}]),'Activities Data');
        const binary=XLSX.write(book,{type:'array',bookType:'xlsx'});globalThis.FileReader=class{readAsArrayBuffer(){globalThis.importPromise=this.onload({target:{result:binary}});}};
        let records=[];handleActivitiesUpload({target:{files:[{}]}},[],updater=>{records=updater(records);},[],()=>{},()=>{},{MOOE:{Travel:{'502':'Travel'}}},{fullName:'Fixture',operatingUnit:'NPMO'},[{uid:'FS-000001',label:'4K Fund',is_active:true}],rows=>{records=[...records,...rows];});await globalThis.importPromise;return records;
    };
    const imported=await importRow({});assert.equal(imported[0].expenses[0].fundingOrigin,'SupplementalDraft');assert.equal(getActivityBudgetSummary({...imported[0],status:'Proposed'}).current,0);
    const before=globalThis.fixture.inserts.length;await importRow({expense_supplementUid:'protected'});assert.equal(globalThis.fixture.inserts.length,before);assert.match(messages.at(-1),/cannot be imported/);
    console.log('PASS: target/active/original/legacy totals, signed approved actuals, pending exclusions, transfers/clones, DCF policy, confirmed scoped RPC, and XLSX draft-only import/export. Offline fixtures only.');
}finally{await server.close();}
