import assert from 'node:assert/strict';
import { createServer } from 'vite';
import * as XLSX from 'xlsx';

let captured;
globalThis.XLSX = { ...XLSX, writeFile: workbook => { captured = workbook; } };
globalThis.window = { XLSX: globalThis.XLSX };
globalThis.alert = message => globalThis.excelFixture.alerts.push(message);
globalThis.FileReader = class { readAsArrayBuffer(file) { globalThis.importPromise = this.onload({ target: { result: file.buffer } }); } };
const server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, entries: [] }, plugins: [{
    name: 'target-excel-offline', enforce: 'pre', resolveId(id) { if (id.endsWith('supabaseClient')) return '\0target-excel-client'; },
    load(id) {
        if (id === '\0target-excel-client') return `export const supabase={async rpc(name){const f=globalThis.excelFixture;f.capabilityCalls++;return {data:f.unsupported?null:2,error:f.unsupported?{message:'Missing migration'}:null};},from(table){const q={insert(rows){const f=globalThis.excelFixture;f.inserts.push({table,rows});q.rows=rows;return q;},select(){return q;},then(resolve){return Promise.resolve({data:q.rows.map((row,index)=>({...row,id:100+index})),error:null}).then(resolve);}};return q;}};`;
    },
}] });
const refs = [{ uid: 'FS-000001', label: '4K Fund', is_active: true }];
const uacs = { MOOE: { Travel: { '502': 'Travel expenses' } } };
const parent = { id: 11, uid: 'ACT-TARGET', type: 'Activity', component: 'Program Management', name: 'Subproject Monitoring', activity_title: 'Specific visit', date: '2026-01-01', location: 'Fixture location', description: 'Fixture', operatingUnit: 'NPMO', fundingYear: 2026, fundType: 'Current', tier: 'Tier 1', fundSourceUid: refs[0].uid, fundSource: refs[0].label, status: 'Completed', participatingIpos: [], participantsMale: 5, participantsFemale: 6, actualParticipantsMale: 4, actualDate: '2026-06-01' };
const first = { id: 10, budgetItemGroupId: 'group', objectType: 'MOOE', expenseParticular: 'Travel', uacsCode: '502', amount: 100, obligationMonth: '', disbursementMonth: '', type: 'Input', particulars: 'Same item', unitOfMeasure: 'pcs', pricePerUnit: 50, numberOfUnits: 2, deliveryDate: '2026-06-01', targetScheduleVersion: 2,
    targetObligationSchedules: [{ id: 'o1', month: '2026-01-01', amount: 40 }, { id: 'o2', month: '2026-03-01', amount: 60 }],
    targetDisbursementSchedules: [{ id: 'd1', month: '2026-02-01', amount: 20 }, { id: 'd2', month: '2026-04-01', amount: 30 }, { id: 'd3', month: '2026-06-01', amount: 50 }],
    obligations: [{ id: 71, date: '2026-02-20', amount: 25 }], disbursements: [{ id: 72, date: '2026-03-20', amount: 20 }], actualNumberOfUnits: 2, actualDeliveryDate: '2026-06-01' };
const second = { ...first, id: 12, amount: 160, targetObligationSchedules: [], targetDisbursementSchedules: [{ id: 'd4', month: '2027-01-01', amount: 50 }] };
const fresh = options => { globalThis.excelFixture = { alerts: [], inserts: [], setters: 0, reconciles: 0, capabilityCalls: 0, ...options }; };
try {
    const helpers = await server.ssrLoadModule('/lib/budgetTargetExcel.ts');
    const service = await server.ssrLoadModule('/components/mainfunctions/ImportExportService.ts');
    const activity = { ...parent, expenses: [first, second] };
    const subproject = { ...parent, uid: 'SP-TARGET', indigenousPeopleOrganization: 'IPO', ipo_id: 1, packageType: 'Package 1', estimatedCompletionDate: '2026-06-01', details: [first, second] };
    const sourceBefore = JSON.stringify([activity, subproject]);
    const upload = async (kind, workbook, options = {}) => {
        fresh(options);
        let records = [];
        const event = { target: { files: [{ buffer: XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) }] } };
        const setter = () => { globalThis.excelFixture.setters++; throw new Error('A database-writing setter must not receive confirmed imports.'); };
        const reconcile = rows => { globalThis.excelFixture.reconciles++; records = rows; };
        if (kind === 'activity') service.handleActivitiesUpload(event, [], setter, [], () => {}, () => {}, uacs, { fullName: 'Fixture', operatingUnit: 'NPMO' }, refs, reconcile);
        else service.handleSubprojectsUpload(event, [], setter, [{ id: 1, name: 'IPO', location: 'Fixture location' }], () => {}, () => {}, uacs, { fullName: 'Fixture', operatingUnit: 'NPMO' }, false, refs, reconcile);
        await globalThis.importPromise;
        return { records, ...globalThis.excelFixture };
    };
    fresh(); service.downloadActivitiesReport([activity], refs); const activityBook = captured;
    service.downloadSubprojectsReport([subproject], refs); const subprojectBook = captured;
    for (const workbook of [activityBook, subprojectBook]) {
        assert.equal(XLSX.utils.sheet_to_json(workbook.Sheets['Obligation Targets']).length, 2);
        assert.equal(XLSX.utils.sheet_to_json(workbook.Sheets['Disbursement Targets']).length, 4);
        assert.equal(XLSX.utils.sheet_to_json(workbook.Sheets['Budget Schedules']).length, 2, 'No Cartesian product or duplicate cost/physical rows');
    }
    const unsupported = await upload('activity', activityBook, { unsupported: true });
    assert.equal(unsupported.inserts.length, 0); assert.equal(unsupported.reconciles, 0); assert.match(unsupported.alerts.join(), /not enabled/);
    for (const [kind, workbook, field] of [['activity', activityBook, 'expenses'], ['subproject', subprojectBook, 'details']]) {
        const result = await upload(kind, workbook);
        assert.equal(result.inserts.length, 1); assert.equal(result.reconciles, 1); assert.equal(result.setters, 0);
        assert.equal(result.records.length, 1); assert.equal(result.records[0][field].length, 2);
        const rows = result.records[0][field];
        assert.deepEqual(rows.map(row => row.id), [10, 12]); assert.equal(rows[0].budgetItemGroupId, 'group');
        assert.deepEqual(rows[0].targetObligationSchedules, first.targetObligationSchedules);
        assert.deepEqual(rows[0].targetDisbursementSchedules, first.targetDisbursementSchedules);
        assert.deepEqual(rows[1].targetObligationSchedules, []);
        assert.deepEqual(rows[1].targetDisbursementSchedules, second.targetDisbursementSchedules);
        assert.deepEqual(rows.map(row => row.amount), [100, 160]);
        assert.ok(rows.every(row => !row.obligations?.length && !row.disbursements?.length && !row.actualDeliveryDate));
        assert.equal(result.records[0].actualDate, undefined); assert.equal(result.records[0].actualParticipantsMale, undefined);
        if (kind === 'subproject') assert.equal(result.records[0].status, 'Proposed');
    }
    const oldWorkbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(oldWorkbook, XLSX.utils.json_to_sheet([{ uid: 'OLD-ACT', type: 'Activity', component: 'Program Management', name: 'Subproject Monitoring', date: '2026-01-01', expense_uacsCode: '502', expense_amount: 100, expense_obligationMonth: '2026-01-01', expense_disbursementMonth: '2026-03-01' }]), 'Activities Data');
    const old = await upload('activity', oldWorkbook);
    assert.equal(old.inserts.length, 1); assert.equal(old.records[0].expenses[0].targetScheduleVersion, undefined); assert.equal(old.capabilityCalls, 0);
    service.downloadSubprojectsReport([{...subproject,details:[{...first,id:40,amount:null,targetScheduleVersion:undefined,targetObligationSchedules:undefined,targetDisbursementSchedules:undefined},{...first,id:41,amount:0}]}],refs);
    const precedence=await upload('subproject',captured);
    assert.deepEqual(precedence.records[0].details.map(row=>row.amount),[null,0],'Explicit null and zero amounts retain their historical precedence through real XLSX');
    assert.equal(precedence.records[0].details[0].targetScheduleVersion,undefined,'A legacy roundtrip must not materialize stored plans');
    const badBook = XLSX.read(XLSX.write(activityBook, { type: 'array', bookType: 'xlsx' }), { type: 'array' });
    badBook.Sheets['Disbursement Targets'] = XLSX.utils.json_to_sheet([{ uid: 'ACT-TARGET', item_id: 999, schedule_id: 'orphan', month: '2026-02-01', amount: 1 }]);
    const bad = await upload('activity', badBook);
    assert.equal(bad.inserts.length, 0); assert.match(bad.alerts.join(), /no matching budget owner/);
    for (const version of [3, '', undefined]) {
        const importer = helpers.targetWorkbookImporter({ obligation: [{ uid: 'X', item_id: 1, schedule_id: 'x', month: '2026-01-01', amount: 1 }], disbursement: [] });
        assert.throws(() => importer.read('X', 1, version), /targetScheduleVersion/);
    }
    const duplicate = helpers.targetWorkbookImporter({ obligation: [{ uid: 'X', item_id: 1, schedule_id: 'same', month: '2026-01-01', amount: 1 }], disbursement: [{ uid: 'X', item_id: 1, schedule_id: 'same', month: '2026-02-01', amount: 1 }] });
    assert.throws(() => duplicate.read('X', 1, 2), /unique identities/);
    for (const amount of [true, false, null, '', [], {}]) assert.throws(() => helpers.targetWorkbookImporter({ obligation: [{ uid: 'X', item_id: 1, schedule_id: 'x', month: '2026-01-01', amount }], disbursement: [] }), /positive number/);
    assert.throws(() => helpers.importedBudgetItemId(true, 0), /whole numbers/);
    assert.deepEqual(helpers.importedOptionalBudgetAmount(true, ''), { amount: null });
    assert.deepEqual(helpers.importedOptionalBudgetAmount(true, 0), { amount: 0 });
    assert.deepEqual(helpers.importedOptionalBudgetAmount(false, 200), {});
    assert.throws(() => helpers.importedOptionalBudgetAmount('unknown', 1), /true or false/);
    for (const amount of ['bad', true, Infinity]) assert.throws(() => helpers.importedOptionalBudgetAmount(true, amount), /finite numbers/);
    service.downloadSubprojectsTemplate(); assert.ok(captured.Sheets['Obligation Targets']); assert.ok(captured.Sheets['Disbursement Targets']);
    service.downloadActivitiesTemplate(refs); assert.ok(captured.Sheets['Obligation Targets']); assert.ok(captured.Sheets['Disbursement Targets']);
    assert.equal(JSON.stringify([activity, subproject]), sourceBefore);
    console.log('Independent targets Excel: real XLSX old/new round trips, stage/owner IDs, empty/cross-year stages, allocation/actual isolation, orphan/duplicate validation, capability failure and single confirmed local-only reconciliation passed.');
} finally { await server.close(); }
