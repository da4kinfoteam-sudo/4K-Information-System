import assert from 'node:assert/strict';
import { createServer } from 'vite';
import * as XLSX from 'xlsx';

const server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, entries: [] }, plugins: [{
    name: 'offline-funding', enforce: 'pre',
    resolveId(id) { if (id.endsWith('/supabaseClient')) return '\0offline'; },
    load(id) { if (id === '\0offline') return 'export const supabase=null;'; },
}] });
let passed = 0;
const test = async (name, run) => { await run(); console.log('PASS ' + name); passed++; };
try {
    const b = await server.ssrLoadModule('/lib/activitySupplementalBudget.ts');
    const f = await server.ssrLoadModule('/lib/activityFundingFilters.ts');
    const { buildActivityClonePayload } = await server.ssrLoadModule('/lib/recordCloning.ts');
    const { aggregateHomepagePhysicalStats } = await server.ssrLoadModule('/lib/physicalAggregation.ts');
    const { collectFinancialLineItems } = await server.ssrLoadModule('/lib/financialAggregation.ts');
    const line = (id, amount = 100) => ({ id, amount, objectType: 'MOOE', expenseParticular: 'Travel', uacsCode: '502', obligationMonth: '2026-01-01', disbursementMonth: '2026-02-01' });
    const base = { id: 1, uid: 'ACT-FUNDING', name: 'Fixture', type: 'Activity', status: 'Completed', workflow_status: 'APPROVED', operatingUnit: 'NPMO', fundingYear: 2026, participatingIpos: [], expenses: [line(1)] };
    const approved = { ...line(2, 20), fundingOrigin: 'Supplemental', supplementUid: 'ledger', supplementStatus: 'APPROVED', supplementalSource: 'Realignment' };
    await test('whole parent inherits source without changing expense data; ordinary child tags do not reclassify parent', () => {
        for (const source of ['Savings', 'Realignment']) {
            const record = { ...structuredClone(base), ['is' + source]: true }, before = structuredClone(record);
            assert.equal(b.getActivityBudgetSummary(record).target, 0);
            assert.equal(b.getActivityBudgetSummary(record).supplemental, 100);
            assert.equal(b.getActivityBudgetSummary(record).current, 100);
            assert.equal(b.getActivityExpenseFundingLabel(record.expenses[0], record), source);
            assert.deepEqual(record, before);
        }
        const ordinary = { ...base, isSavings: null, isRealignment: null, expenses: [{ ...line(1), isSavings: true }] };
        assert.equal(b.getActivityParentFundingLabel(ordinary), 'Regular');
        assert.equal(b.getActivityBudgetSummary(ordinary).supplemental, 100);
        assert(f.matchesActivityFundingFilter(ordinary, 'parentFundingOrigin', ['Regular']));
        assert(!f.matchesActivityFundingFilter(ordinary, 'parentFundingOrigin', ['Savings']));
    });
    const mixed = { ...base, isSavings: true, expenses: [line(1), approved, { ...line(3, 30), isRealignment: true }] };
    await test('modern source then legacy explicit tag then parent fallback; count amounts once', () => {
        const result = b.getActivityBudgetSummary(mixed);
        assert.equal(result.target, 0); assert.equal(result.savings, 100); assert.equal(result.realignment, 50);
        assert.equal(result.supplemental, 150); assert.equal(result.current, 150);
        assert.deepEqual(b.getActiveActivitySupplementalSources(mixed).sort(), ['Realignment', 'Savings']);
        assert.equal(b.getActivityExpenseFundingLabel({ ...approved, isSavings: true, isRealignment: true }, mixed), 'Realignment');
    });
    await test('conflicting legacy flags remain ambiguous without amount loss or source fabrication', () => {
        const record = { ...base, isSavings: true, isRealignment: true }, before = structuredClone(record);
        assert.equal(b.getActivityParentFundingLabel(record), 'Savings / Realignment');
        assert.equal(b.getActivityExpenseFundingLabel(line(1), record), 'Conflicting');
        const result = b.getActivityBudgetSummary(record);
        assert.equal(result.supplemental, 100); assert.equal(result.savings, 0); assert.equal(result.realignment, 0);
        assert.deepEqual(b.getActiveActivitySupplementalSources(record), []);
        assert(f.matchesActivityFundingFilter(record, 'parentFundingOrigin', ['Savings']));
        assert(f.matchesActivityFundingFilter(record, 'parentFundingOrigin', ['Realignment']));
        assert(!f.matchesActivityFundingFilter(record, 'parentFundingOrigin', ['Regular']));
        assert.deepEqual(record, before);
    });
    await test('approval/revision/cancellation/transfer activation gate supplemental filters and amounts together', () => {
        for (const status of ['DRAFT', 'PENDING', 'REJECTED', 'WITHDRAWN']) {
            const record = { ...base, expenses: [{ ...approved, supplementStatus: status }] };
            assert.equal(b.getActivityBudgetSummary(record).supplemental, 0);
            assert(!f.matchesActivityFundingFilter(record, 'supplementalFundingSource', ['Realignment']));
        }
        const pendingRevision = { ...base, expenses: [{ ...approved, supplementRevisionPending: true }] };
        assert.equal(b.getActivityBudgetSummary(pendingRevision).realignment, 20);
        assert(f.matchesActivityFundingFilter(pendingRevision, 'supplementalFundingSource', ['Realignment']));
        for (const record of [{ ...mixed, status: 'Cancelled' }, { ...mixed, expenses: mixed.expenses.map(row => ({ ...row, isCancelled: true })) }, { ...mixed, budgetItemTransferId: 'transfer', workflow_status: 'PENDING' }]) {
            assert.equal(b.getActivityBudgetSummary(record).supplemental, 0);
            assert.deepEqual(b.getActiveActivitySupplementalSources(record), []);
        }
        assert(f.matchesActivityFundingFilter({ ...base, isSavings: true, expenses: [] }, 'parentFundingOrigin', ['Savings']));
        assert(!f.matchesActivityFundingFilter({ ...base, isSavings: true, expenses: [] }, 'supplementalFundingSource', ['Savings']));
    });
    await test('filter normalization accepts old preferences safely and OR/AND composition narrows records', () => {
        for (const invalid of [null, [], 'invalid', 1]) assert.deepEqual(f.normalizeActivityColumnFilters(invalid), {});
        assert.deepEqual(f.normalizeActivityColumnFilters({ parentFundingOrigin: ['Savings', 'Savings', null, 'bad'], supplementalFundingSource: 'Savings', status: ['Completed'], operatingUnit: ['NPMO'], obsolete: ['yes'] }), { parentFundingOrigin: ['Savings'], status: ['Completed'] });
        assert.deepEqual(f.normalizeActivityColumnFilters({ supplementalFundingSource: ['Realignment'], parentFundingOrigin: ['Savings'] }), { parentFundingOrigin: ['Savings'] });
        assert(f.matchesActivityFundingFilter(base, 'parentFundingOrigin', ['Savings', 'Regular']));
        assert(f.matchesActivityFundingFilter(mixed, 'supplementalFundingSource', ['Savings', 'Realignment']));
        const matches = [base, mixed].filter(row => f.matchesActivityFundingFilter(row, 'parentFundingOrigin', ['Savings']) && f.matchesActivityFundingFilter(row, 'supplementalFundingSource', ['Realignment']));
        assert.deepEqual(matches.map(row => row.id), [mixed.id]);
    });
    await test('clone source precedence preserves original data and keeps supplemental copies unapproved', () => {
        const source = { ...mixed, expenses: [{ ...line(3), isRealignment: true, obligations: [{ id: 9, date: '2026-01-01', amount: 5 }] }] }, before = structuredClone(source);
        const clone = buildActivityClonePayload(source, { createdAt: '2026-11-10', encodedBy: 'Fixture', requiresApprover: true });
        assert.equal(clone.expenses[0].supplementalSource, 'Realignment');
        assert.equal(clone.expenses[0].supplementStatus, 'DRAFT');
        assert.equal(b.getActivityBudgetSummary(clone).supplemental, 0);
        assert.deepEqual(clone.expenses[0].obligations, []); assert.deepEqual(source, before);
    });
    await test('ordinary parents with some/all tagged items retain physical targets; financial targets/actual dates and IDs stay independent', () => {
        const actualLine = { ...line(1), obligations: [{ id: 41, date: '2026-01-05', amount: 75 }], disbursements: [{ id: 42, date: '2026-02-05', amount: 50 }] };
        for (const expenses of [[actualLine, { ...line(2, 20), isSavings: true }], [{ ...actualLine, isRealignment: true }]]) {
            const parent = { ...base, type: 'Training', actualDate: '2026-03-01', expenses }, before = structuredClone(parent);
            const input = { activities: [parent], subprojects: [], officeReqs: [], staffingReqs: [], otherProgramExpenses: [], ipos: [] };
            const filters = { year: '2026', actualYear: '2026', operatingUnit: 'NPMO', tier: 'All', fundType: 'All' };
            const physical = aggregateHomepagePhysicalStats(input, filters);
            assert.deepEqual(physical.trainings, { target: 1, actual: 1 });
            const financial = collectFinancialLineItems(input, filters);
            assert.equal(financial.reduce((sum, row) => sum + row.alloc, 0), expenses.length === 2 ? 100 : 0);
            assert.equal(financial.reduce((sum, row) => sum + row.obli, 0), 75);
            assert.equal(financial.reduce((sum, row) => sum + row.disb, 0), 50);
            assert.deepEqual(parent, before);
        }
    });
    let exported;
    const messages = [];
    globalThis.window = { XLSX: { ...XLSX, writeFile: book => { exported = book; } } };
    globalThis.XLSX = globalThis.window.XLSX; globalThis.alert = message => messages.push(message);
    const excel = await server.ssrLoadModule('/components/mainfunctions/ImportExportService.ts');
    await test('XLSX displays shared totals/source labels and exports parent flags without invented child tags', () => {
        excel.downloadActivitiesReport([mixed], []);
        const report = XLSX.utils.sheet_to_json(exported.Sheets['Activities Report'])[0];
        assert.equal(report['Funding Origin'], 'Savings'); assert.equal(report['Target Budget'], 0);
        assert.equal(report['Supplemental Budget'], 150); assert.equal(report['Current Active Budget'], 150);
        const schedules = XLSX.utils.sheet_to_json(exported.Sheets['Budget Schedules']);
        assert.deepEqual(schedules.map(row => row['Effective Funding Source']), ['Savings', 'Realignment', 'Realignment']);
        const planning = XLSX.utils.sheet_to_json(exported.Sheets['Activities Data']);
        assert(planning.every(row => row.isSavings === true)); assert.equal(planning[0].expense_supplementalSource, '');
        excel.downloadActivitiesTemplate([]);
        const headers = XLSX.utils.sheet_to_json(exported.Sheets['Activities Data'], { header: 1 })[0];
        assert(headers.includes('isSavings') && headers.includes('isRealignment'));
    });
    const importRows = async (extras, existing = []) => {
        const rows = extras.map(extra => ({ uid: 'ACT-IMPORT', type: 'Activity', component: 'Program Management', name: 'Fixture', date: '2026-01-01', expense_uacsCode: '502', expense_amount: 100, ...extra }));
        const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), 'Activities Data');
        const binary = XLSX.write(book, { type: 'array', bookType: 'xlsx' });
        globalThis.FileReader = class { readAsArrayBuffer() { globalThis.importResult = this.onload({ target: { result: binary } }); } };
        let records = structuredClone(existing);
        excel.handleActivitiesUpload({ target: { files: [{}] } }, records, update => { records = update(records); }, [], () => {}, () => {}, { MOOE: { Travel: { '502': 'Travel' } } }, { id: 1, role: 'Super Admin', fullName: 'Fixture', operatingUnit: 'NPMO' }, [{ uid: 'FS-000001', label: '4K Fund', is_active: true }], () => {});
        await globalThis.importResult;
        return records;
    };
    await test('legacy imports remain ordinary; new whole-origin flags survive without supplemental draft conversion', async () => {
        const ordinary = await importRows([{}]); assert.equal(ordinary.length, 1); assert(!ordinary[0].isSavings);
        const savings = await importRows([{ isSavings: 'TRUE', isRealignment: false }]);
        assert.equal(savings.length, 1); assert.equal(savings[0].isSavings, true);
        assert.equal(b.getActivityBudgetSummary(savings[0]).supplemental, 100);
        assert.equal(savings[0].expenses[0].fundingOrigin, undefined);
    });
    await test('new imports reject conflicting/invalid flags; existing UID skips cannot erase saved classifications or actuals', async () => {
        for (const rows of [[{ isSavings: 'yes' }], [{ isSavings: true, isRealignment: true }], [{ isSavings: true }, { isSavings: false }], [{ isSavings: true }, { isRealignment: true }]]) {
            assert.equal((await importRows(rows)).length, 0); assert.match(messages.at(-1), /TRUE or FALSE|either Savings|conflicting/);
        }
        const existing = { ...mixed, uid: 'ACT-IMPORT' }, before = structuredClone(existing);
        assert.deepEqual(await importRows([{ isSavings: false, isRealignment: true }], [existing]), [before]);
    });
    console.log(`${passed} offline funding classification/filter/Excel checks passed. No database or external requests.`);
} finally { await server.close(); }
