import assert from 'node:assert/strict';
import { createServer } from 'vite';
const storage = new Map();
globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
const server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, entries: [] }, plugins: [{
    name: 'no-year-network', enforce: 'pre', resolveId(id) { if (id.endsWith('/supabaseClient')) return '\0offline'; }, load(id) { if (id === '\0offline') return 'export const supabase=null;'; },
}] });
let passed = 0;
const test = (name, run) => { run(); passed++; console.log('PASS ' + name); };
try {
    const y = await server.ssrLoadModule('/lib/fundYear.ts');
    const { rescheduleActivityTargets } = await server.ssrLoadModule('/lib/activityBudgetSchedules.ts');
    const { rescheduleBudgetTargets } = await server.ssrLoadModule('/lib/subprojectDraftPersistence.ts');
    const { buildActivityClonePayload, buildSubprojectClonePayload } = await server.ssrLoadModule('/lib/recordCloning.ts');
    const { aggregateHomepagePhysicalStats } = await server.ssrLoadModule('/lib/physicalAggregation.ts');
    test('strict year grammar, numeric/string payload compatibility and optional storage safety', () => {
        for (const value of [1000, 2027, '2028', 9999]) assert(y.isValidFundYear(value));
        for (const value of [null, undefined, '', '202', '0202', '0000', '10000', '2e03', '2027.0', '+2027', '-2027', '2027 ', '2027x', 2027.5]) assert(!y.isValidFundYear(value));
        assert(y.getFundYearOptions(1997, 2026).includes('1997')); assert(y.getFundYearOptions(null, 2026).includes('2031'));
        y.rememberFundYear(2042); assert(y.getFundYearOptions(null, 2026).includes('2042'));
        storage.set('dcf_fund_year_choices', 'invalid'); assert(y.getFundYearOptions(null, 2026).includes('2026'));
    });
    const line = { id: 1, amount: 100, pricePerUnit: 50, numberOfUnits: 2, deliveryDate: '2027-03-01', obligationMonth: '2026-11-01', disbursementMonth: '2027-02-01',
        targetScheduleVersion: 2, targetObligationSchedules: [{ id: 'o1', month: '2026-11-01', amount: 70 }, { id: 'o2', month: '2027-01-01', amount: 30 }],
        targetDisbursementSchedules: [{ id: 'd1', month: '2027-02-01', amount: 50 }, { id: 'd2', month: '2028-02-01', amount: 50 }],
        obligations: [{ id: 41, date: '2028-04-22', amount: 100 }], disbursements: [{ id: 42, date: '2028-05-13', amount: 90 }], actualDeliveryDate: '2028-06-01', actualNumberOfUnits: 2, isCompleted: true };
    test('explicit rescheduling keeps cross-year independent stage offsets, identities, amounts and actual dates', () => {
        const before = structuredClone(line);
        for (const change of [rescheduleActivityTargets, rescheduleBudgetTargets]) {
            const moved = change([line], 2027, 2026)[0];
            assert.equal(moved.obligationMonth, '2027-11-01'); assert.equal(moved.disbursementMonth, '2028-02-01');
            assert.deepEqual(moved.targetObligationSchedules, [{ id: 'o1', month: '2027-11-01', amount: 70 }, { id: 'o2', month: '2028-01-01', amount: 30 }]);
            assert.deepEqual(moved.targetDisbursementSchedules, [{ id: 'd1', month: '2028-02-01', amount: 50 }, { id: 'd2', month: '2029-02-01', amount: 50 }]);
            for (const key of ['id', 'amount', 'pricePerUnit', 'numberOfUnits', 'actualDeliveryDate', 'actualNumberOfUnits', 'isCompleted', 'obligations', 'disbursements']) assert.deepEqual(moved[key], line[key]);
        }
        assert.deepEqual(line, before);
        assert.equal(rescheduleBudgetTargets([{ ...line, isSuperseded: true }], 2027, 2026)[0].obligationMonth, line.obligationMonth);
    });
    test('calendar boundaries preserve precision, clamp leap days and fail atomically on year overflow', () => {
        assert.equal(y.shiftFundYearDate('2028-02-29', 2029, 2028), '2029-02-28');
        assert.equal(y.shiftFundYearDate('2027-04-25', 2028, 2027), '2028-04-25');
        assert.equal(y.shiftFundYearDate('', 2028, 2027), '');
        assert.throws(() => y.shiftFundYearDate('9999-12-01', 9999, 9998), /1000 to 9999/);
    });
    test('clones retain inherited Fund Year while clearing actuals; FY cohorts remain independent from actual CY', () => {
        const activity = { id: 1, uid: 'ACT', name: 'Training', type: 'Training', status: 'Completed', workflow_status: 'APPROVED', fundingYear: 2027, fundType: 'Continuing', operatingUnit: 'NPMO', actualDate: '2028-03-15', expenses: [line], participatingIpos: [] };
        const subproject = { ...activity, uid: 'SP', details: [line], actualCompletionDate: '2028-06-01' }, context = { createdAt: '2026-11-10', encodedBy: 'Fixture', requiresApprover: false };
        assert.equal(buildActivityClonePayload(activity, context).fundingYear, 2027); assert.equal(buildSubprojectClonePayload(subproject, context).fundingYear, 2027);
        const stats = aggregateHomepagePhysicalStats({ activities: [activity], subprojects: [], officeReqs: [], staffingReqs: [], otherProgramExpenses: [], ipos: [] }, { year: '2027', operatingUnit: 'NPMO', tier: 'All', fundType: 'Continuing' });
        assert.equal(stats.trainings.actual, 1); assert.equal(activity.actualDate, '2028-03-15');
    });
    console.log(`${passed} Fund Year domain checks passed. No database or external data.`);
} finally { await server.close(); }
