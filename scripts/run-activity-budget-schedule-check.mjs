import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as XLSX from 'xlsx';

const server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, entries: [] }, plugins: [{
    name: 'activity-schedules-offline', enforce: 'pre',
    resolveId(id) { if (id.endsWith('supabaseClient')) return '\0offline-client'; },
    load(id) { if (id === '\0offline-client') return `export const supabase = { from(table) {
        let action = 'read', payload; const filters = []; const q = { select() { return q; }, eq(key,value) { filters.push([key,value]); return q; }, is(key,value) { filters.push([key,value]); return q; }, maybeSingle() { return q; }, update(value) { action='write'; payload=value; return q; }, insert(value) { action='insert'; payload=value; return q; },
            then(resolve) { const f=globalThis.activityFixture; f.calls.push({table,action,payload,filters}); return Promise.resolve({data:f.fail?null:action==='read'?f.latest:action==='insert'?payload.map((row,index)=>({...row,id:100+index})):f.conflict?null:{...f.latest,...payload},error:f.fail?{message:'Synthetic failure'}:null}).then(resolve); }
        }; return q;
    } };`; },
}] });
try {
    const { groupActivityExpenses, validateActivitySchedule, rescheduleActivityTargets } = await server.ssrLoadModule('/lib/activityBudgetSchedules.ts');
    const { mergeActivityExpenses, getChangedActivityActualIds, persistActivityDraft } = await server.ssrLoadModule('/lib/activityDraftPersistence.ts');
    const { buildActivityClonePayload } = await server.ssrLoadModule('/lib/recordCloning.ts');
    const { collectFinancialLineItems, aggregateHomepageFinancials } = await server.ssrLoadModule('/lib/financialAggregation.ts');
    const references = { uacsCodes: { MOOE: { Travel: { '502': 'Travel expenses' } } } };
    const rows = [10000, 20000, 15000].map((amount,index) => ({ id:index+1, objectType:'MOOE', expenseParticular:'Travel', uacsCode:'502', amount, obligationMonth:['2026-01-01','2026-03-01','2026-07-01'][index], disbursementMonth:['2026-03-01','2026-05-01','2026-09-01'][index] }));
    const base = { id:11, uid:'ACT-11', type:'Activity', component:'Program Management', name:'Subproject Monitoring', participatingIpos:[], status:'Completed', date:'2026-01-01', actualDate:'2026-10-01', fundingYear:2026, operatingUnit:'NPMO', fundType:'Current', tier:'Tier 1', workflow_status:'APPROVED', history:[], expenses:rows, updated_at:'2026-10-13T00:00:00Z' };
    const grouped = { ...base, expenses:rows.map(row=>({...row,budgetItemGroupId:'fixture-group'})) };
    assert.equal(groupActivityExpenses(rows).length,3);
    assert.equal(groupActivityExpenses(grouped.expenses).length,1);
    assert.equal(groupActivityExpenses([...grouped.expenses,{...grouped.expenses[0],id:4,uacsCode:'different'}]).length,2);
    const actual = { ...grouped.expenses[0], obligations:[{id:20,date:'2025-01-01',amount:-100}], actualObligationAmount:-100, actualObligationDate:'2025-01-01', disbursements:[{id:21,date:'2025-02-01',amount:25}], actualDisbursementAmount:25, actualDisbursementDate:'2025-02-01' };
    for (const row of rows) assert.equal(validateActivitySchedule(row,references),null);
    assert.match(validateActivitySchedule({...rows[0],uacsCode:'free text'},references),/listed UACS/);
    assert.equal(validateActivitySchedule({...rows[0],uacsCode:'obsolete'},references,{...rows[0],uacsCode:'obsolete'}),null);
    assert.notEqual(validateActivitySchedule({...rows[0],amount:NaN},references),null);
    assert.notEqual(validateActivitySchedule({...rows[0],obligationMonth:'2026-02-30'},references),null);
    assert.notEqual(validateActivitySchedule({...rows[0],isSavings:true},references),null);
    const rescheduled=rescheduleActivityTargets([actual],2027)[0];
    assert.equal(rescheduled.obligationMonth,'2027-01-01'); assert.equal(rescheduled.disbursementMonth,'2027-03-01');
    assert.deepEqual(rescheduled.obligations,actual.obligations); assert.equal(rescheduled.actualObligationDate,actual.actualObligationDate);
    const changed={...actual,amount:12345,actualObligationAmount:0,obligations:[]};
    const latest={...actual,disbursements:[{id:22,date:'2026-10-01',amount:80}]};
    const merged=mergeActivityExpenses([actual],[changed],[latest],true)[0];
    assert.equal(merged.amount,12345); assert.deepEqual(merged.obligations,actual.obligations); assert.deepEqual(merged.disbursements,latest.disbursements);
    assert.throws(()=>mergeActivityExpenses([actual],[changed],[{...latest,amount:22}],true),/changed while/);
    assert.throws(()=>mergeActivityExpenses([actual],[],[latest],true),/changed while/);
    assert.equal(getChangedActivityActualIds([actual],[{...actual,amount:9}],'obligation').size,0);
    assert.equal(getChangedActivityActualIds([actual],[{...actual,obligations:[]}],'disbursement').size,0);
    assert.deepEqual([...getChangedActivityActualIds([actual],[{...actual,obligations:[]}],'obligation')],['1']);
    const record={...grouped,expenses:[actual,...grouped.expenses.slice(1)]};
    globalThis.activityFixture={latest:{...record,activity_title:'Concurrent title',expenses:[latest,...record.expenses.slice(1)]},calls:[]};
    const confirmed=await persistActivityDraft(record,{...record,expenses:[changed,...record.expenses.slice(1)]},'expenses');
    assert.equal(confirmed.status,'Completed'); assert.equal(confirmed.activity_title,'Concurrent title');
    assert.equal(globalThis.activityFixture.calls.length,2); assert.equal(globalThis.activityFixture.calls[1].payload.activity_title,undefined);
    assert.deepEqual(confirmed.expenses[0].obligations,actual.obligations);
    globalThis.activityFixture.conflict=true; await assert.rejects(()=>persistActivityDraft(record,record,'expenses'),/changed while/);
    globalThis.activityFixture={latest:{...record,status:'Cancelled'},calls:[]}; await assert.rejects(()=>persistActivityDraft(record,record,'expenses'),/changed while/);
    const sourceSnapshot=JSON.stringify(record);
    const first=buildActivityClonePayload(record,{createdAt:'2026-10-13T00:00:00Z',encodedBy:'Fixture',requiresApprover:false});
    const second=buildActivityClonePayload(record,{createdAt:'2026-10-13T00:00:00Z',encodedBy:'Fixture',requiresApprover:true});
    assert.notEqual(first.expenses[0].budgetItemGroupId,'fixture-group'); assert.notEqual(first.expenses[0].budgetItemGroupId,second.expenses[0].budgetItemGroupId);
    assert.equal(new Set(first.expenses.map(row=>row.budgetItemGroupId)).size,1); assert.equal(first.expenses[0].obligations.length,0); assert.equal(JSON.stringify(record),sourceSnapshot);
    const data=activity=>({subprojects:[],activities:[activity],officeReqs:[],staffingReqs:[],otherProgramExpenses:[]});
    const filters={year:'2026',actualYear:'2026',operatingUnit:'NPMO',tier:'Tier 1',fundType:'Current'};
    const lines=collectFinancialLineItems(data(grouped),filters);
    assert.deepEqual(lines.map(line=>[line.line.id,line.targetMonth,line.alloc]),[[1,0,10000],[2,2,20000],[3,6,15000]]);
    assert.deepEqual(lines.map(line=>line.line.disbursementMonth),rows.map(row=>row.disbursementMonth));
    assert.deepEqual(aggregateHomepageFinancials(data(base),filters),aggregateHomepageFinancials(data(grouped),filters));
    globalThis.XLSX=XLSX; globalThis.window={XLSX};
    const {default:BEDSReport}=await server.ssrLoadModule('/components/reports/BEDSReport.tsx');
    const render=activity=>renderToStaticMarkup(React.createElement(BEDSReport,{selectedYear:'2026',selectedReportingYear:'2026',selectedOu:'NPMO',selectedTier:'Tier 1',selectedFundType:'Current',data:{subprojects:[],trainings:[],otherActivities:[activity],officeReqs:[],staffingReqs:[],otherProgramExpenses:[]}}));
    assert.equal(render(base),render(grouped)); assert.match(render(grouped),/45,000/);
    const form=await readFile('components/ActivityEdit.tsx','utf8');
    assert.match(form,/mode === 'accomplishment'\) \{\s+const obligationIds/); assert.match(form,/eq\('item_id', String\(exp.id\)\)/);
    assert.doesNotMatch(form,/actualObligationDate = `\$\{numValue\}/);
    let exported;
    globalThis.window={XLSX:{...XLSX,writeFile:workbook=>{exported=workbook;}}}; globalThis.XLSX=globalThis.window.XLSX; globalThis.alert=()=>{};
    const {downloadActivitiesReport}=await server.ssrLoadModule('/components/mainfunctions/ImportExportService.ts');
    downloadActivitiesReport([grouped],[]);
    assert.equal(XLSX.utils.sheet_to_json(exported.Sheets['Budget Schedules']).length,3);
    const {handleActivitiesUpload}=await server.ssrLoadModule('/components/mainfunctions/ImportExportService.ts');
    const importRows=async withGroups=>{
        const workbook=XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook,XLSX.utils.json_to_sheet(rows.map(row=>({
            uid:'ACT-IMPORT',type:'Activity',component:'Program Management',name:base.name,date:base.date,
            expense_uacsCode:row.uacsCode,expense_amount:row.amount,expense_obligationMonth:row.obligationMonth,expense_disbursementMonth:row.disbursementMonth,
            ...(withGroups?{expense_budgetItemGroupId:'import-group'}:{}),
        }))),'Activities Data');
        const binary=XLSX.write(workbook,{type:'array',bookType:'xlsx'});
        globalThis.FileReader=class{readAsArrayBuffer(){globalThis.importPromise=this.onload({target:{result:binary}});}};
        globalThis.activityFixture={calls:[]};let records=[];
        handleActivitiesUpload({target:{files:[{}]}},[],updater=>{records=updater(records);},[],()=>{},()=>{},references.uacsCodes,{fullName:'Fixture',operatingUnit:'NPMO'},[{uid:'FS-000001',label:'4K Fund',is_active:true}]);
        await globalThis.importPromise;return records[0];
    };
    const imported=await importRows(true);
    assert.equal(groupActivityExpenses(imported.expenses).length,1);
    assert.deepEqual(imported.expenses.map(row=>row.obligationMonth),rows.map(row=>row.obligationMonth));
    assert.equal(groupActivityExpenses((await importRows(false)).expenses).length,3);
    console.log('PASS: Activity grouping, independent months/BEDS, totals, actual preservation, stale-save guards, clone identity and export. Offline fixtures only.');
} finally { await server.close(); }
