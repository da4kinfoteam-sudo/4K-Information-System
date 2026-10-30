import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as XLSX from 'xlsx';

// Pin the approved production baseline, not the working tree or a future HEAD.
const baseline = 'adbd06f46e979d610d4a9eab057534f4f63de071';
const baselineFiles = {
    financial: 'lib/financialAggregation.ts',
    audit: 'lib/financialAudit.ts',
    beds: 'components/reports/BEDSReport.tsx',
    wfp: 'components/reports/WFPReport.tsx',
    awards: 'lib/awardRankings.ts',
};
const server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, entries: [] }, plugins: [{
    name: 'independent-targets-offline', enforce: 'pre',
    resolveId(id) {
        if (id.endsWith('supabaseClient')) return '\0offline-client';
        if (id.endsWith('/contexts/AuthContext')) return '\0offline-auth';
        if (id.startsWith('/__baseline__/')) return id;
    },
    load(id) {
        if (id === '\0offline-client') return 'export const supabase = {};';
        if (id === '\0offline-auth') return "export const useAuth=()=>({currentUser:{id:1,role:'Super Admin',operatingUnit:'NPMO'},hasAccess:()=>true,getVisibilityScope:()=> 'All'});";
        const key = id.match(/^\/__baseline__\/(\w+)\.tsx?$/)?.[1];
        if (!key) return;
        const file = baselineFiles[key];
        return execFileSync('git', ['show', `${baseline}:${file}`], { encoding: 'utf8' })
            .replace(/from (['"])(\.{1,2}\/[^'"]+)\1/g, (_, quote, specifier) => {
                const resolved = path.posix.resolve('/', path.posix.dirname(file), specifier);
                return `from ${quote}${resolved === '/lib/financialAggregation' ? '/__baseline__/financial.ts' : resolved}${quote}`;
            });
    },
}] });

try {
    globalThis.window = { XLSX };
    globalThis.XLSX = XLSX;
    const helpers = await server.ssrLoadModule('/lib/budgetTargetSchedules.ts');
    const current = await server.ssrLoadModule('/lib/financialAggregation.ts');
    const old = await server.ssrLoadModule('/__baseline__/financial.ts');
    const currentAudit = (await server.ssrLoadModule('/lib/financialAudit.ts')).buildFinancialAudit;
    const oldAudit = (await server.ssrLoadModule('/__baseline__/audit.ts')).buildFinancialAudit;
    const newAwards = (await server.ssrLoadModule('/lib/awardRankings.ts')).calculateAwardsDashboardData;
    const oldAwards = (await server.ssrLoadModule('/__baseline__/awards.ts')).calculateAwardsDashboardData;
    const entries = (stage, values) => values.map(([month, amount], index) => ({ id: `${stage}-${index}`, month, amount }));
    const structured = {
        targetScheduleVersion: 2,
        targetObligationSchedules: entries('o', [['2026-01-01', 40], ['2026-03-01', 60]]),
        targetDisbursementSchedules: entries('d', [['2026-02-01', 20], ['2026-04-01', 30], ['2026-06-01', 50]]),
    };
    const line = { id: 1, objectType: 'MOOE', expenseParticular: 'Travel', uacsCode: '502', amount: 100, obligationMonth: '2026-01-01', disbursementMonth: '2026-02-01' };
    const parent = { id: 11, uid: 'ACT-11', type: 'Training', component: 'Production and Livelihood', name: 'Fixture activity', participatingIpos: [], status: 'Ongoing', date: '2026-01-01', fundingYear: 2026, operatingUnit: 'NPMO', fundType: 'Current', tier: 'Tier 1', workflow_status: 'APPROVED', history: [], expenses: [line] };
    const data = expenses => ({ subprojects: [], activities: [{ ...parent, expenses }], officeReqs: [], staffingReqs: [], otherProgramExpenses: [] });
    const filters = { year: '2026', actualYear: '2026', operatingUnit: 'NPMO', tier: 'Tier 1', fundType: 'Current' };
    const one = { ...line, ...structured, obligations: [{ id: 71, date: '2026-01-20', amount: 30 }, { id: 72, date: '2026-02-20', amount: -5 }], disbursements: [{ id: 73, date: '2026-02-21', amount: 20 }] };
    const snapshot = JSON.stringify(one);
    const { mergeActivityExpenses } = await server.ssrLoadModule('/lib/activityDraftPersistence.ts');
    const { mergeSubprojectDraft } = await server.ssrLoadModule('/lib/subprojectDraftPersistence.ts');
    assert.throws(() => mergeActivityExpenses([line], [{ ...line, ...structured }], [{ ...line, obligationMonth: '2026-04-01' }], true), /legacy target inputs changed/);
    assert.throws(() => mergeSubprojectDraft({ details: [line] }, { details: [{ ...line, ...structured }] }, { details: [{ ...line, amount: 120 }] }), /legacy target inputs changed/);
    const disbursementEdit = { ...one, targetDisbursementSchedules: entries('new-d', [['2026-02-01', 80]]) };
    const concurrentObligation = { ...one, targetObligationSchedules: entries('new-o', [['2026-03-01', 120]]) };
    const disjoint = mergeActivityExpenses([one], [disbursementEdit], [concurrentObligation], true)[0];
    assert.deepEqual(disjoint.targetObligationSchedules, concurrentObligation.targetObligationSchedules);
    assert.deepEqual(disjoint.targetDisbursementSchedules, disbursementEdit.targetDisbursementSchedules);
    assert.equal(disjoint.amount, 100); assert.deepEqual(disjoint.obligations, one.obligations);
    const normalized = current.collectFinancialLineItems(data([one]), filters);
    assert.equal(normalized.length, 1);
    assert.equal(normalized[0].alloc, 100);
    assert.equal(normalized[0].targetObligationTotal, 100);
    assert.equal(normalized[0].targetDisbursementTotal, 100);
    assert.equal(normalized[0].obli, 25);
    assert.equal(normalized[0].disb, 20);
    assert.deepEqual(helpers.targetScheduleMonths(normalized[0].targetObligationSchedules, '2026'), [40, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    assert.deepEqual(helpers.targetScheduleMonths(normalized[0].targetDisbursementSchedules, '2026'), [0, 20, 0, 30, 0, 50, 0, 0, 0, 0, 0, 0]);
    const due = currentAudit(data([one]), filters, { auditAsOfMonth: 3 });
    assert.equal(due.summary.totalTargetObligationDue, 100);
    assert.equal(due.summary.totalTargetDisbursementDue, 50);
    assert.ok(!due.issues.some(issue => ['Target obligation due mismatch', 'Target disbursement due mismatch'].includes(issue.issueType)));
    assert.equal(JSON.stringify(one), snapshot);
    const awardsInput = input => ({ ...input, trainings: input.activities.filter(item => item.type === 'Training'), otherActivities: [], ipos: [], operatingUnitScope: ['NPMO'] });
    const quarterPlan = { ...one, targetObligationSchedules: entries('o', [['2026-01-01', 40], ['2026-07-01', 60]]) };
    const awards = newAwards(awardsInput(data([quarterPlan])), '2026', null, []);
    assert.equal(awards.quarters[0].financial[0].allocation, 40);
    assert.equal(awards.quarters[2].financial[0].allocation, 60);
    assert.equal(awards.annual.overall[0].allocation, 100);

    const empty = { ...one, targetObligationSchedules: [], targetDisbursementSchedules: [] };
    const none = current.collectFinancialLineItems(data([empty]), filters)[0];
    assert.equal(none.alloc, 100); assert.equal(none.targetObligationTotal, 0); assert.equal(none.targetDisbursementTotal, 0);
    assert.equal(currentAudit(data([empty]), filters, { auditAsOfMonth: 11 }).summary.totalTargetObligationDue, 0);
    assert.equal(helpers.validateTargetPlan(empty), null);
    assert.equal(helpers.hasStructuredTargets({ targetScheduleVersion: null, targetObligationSchedules: null }), false);
    const invalid = [
        { ...structured, targetScheduleVersion: 3 }, { ...structured, targetDisbursementSchedules: null },
        { ...structured, targetObligationSchedules: [{ id: 'x', month: '2026-02-30', amount: 5 }] },
        { ...structured, targetObligationSchedules: [{ id: 'x', month: '2026-01-01', amount: NaN }] },
        { ...structured, targetObligationSchedules: [{ id: 'x', month: '2026-01-01', amount: '5' }] },
        { ...structured, targetObligationSchedules: [{ id: 'd-0', month: '2026-01-01', amount: 5 }] },
        { targetObligationSchedules: [] },
    ];
    for (const plan of invalid) {
        assert.ok(helpers.validateTargetPlan(plan));
        assert.throws(() => helpers.readTargetSchedules(plan, 'obligation', { amount: 100 }));
    }
    const duplicateMonths = { ...one, targetObligationSchedules: entries('o', [['2026-01-01', 12.34], ['2026-01-01', 7.66], ['2027-02-01', 80]]) };
    assert.equal(helpers.targetScheduleMonths(duplicateMonths.targetObligationSchedules, '2026')[0], 20);
    assert.equal(helpers.targetScheduleMonths(duplicateMonths.targetObligationSchedules, '2027')[1], 80);
    assert.equal(helpers.targetScheduleTotal(duplicateMonths.targetObligationSchedules), 100);
    const cloned = helpers.cloneTargetPlan(one);
    assert.notEqual(cloned.targetObligationSchedules[0].id, one.targetObligationSchedules[0].id);
    assert.equal(cloned.targetObligationSchedules[0].amount, 40);
    assert.deepEqual(cloned.obligations, one.obligations);
    const rescheduled = helpers.rescheduleTargetPlan(one, 2028);
    assert.equal(rescheduled.targetDisbursementSchedules[2].month, '2028-06-01');
    assert.deepEqual(rescheduled.disbursements, one.disbursements);
    const stageOnly = { ...one, amount: 0, obligations: [], disbursements: [] };
    assert.equal(current.collectFinancialLineItems(data([stageOnly]), filters).length, 1);
    for (const tag of [{ isSavings: true }, { isRealignment: true }, { isCancelled: true }, { isSuperseded: true }, { fundingOrigin: 'Supplemental', supplementUid: 'supp', supplementStatus: 'APPROVED' }]) {
        const result = current.collectFinancialLineItems(data([{ ...one, ...tag }]), { ...filters, includeTaggedExclusions: true })[0];
        assert.equal(result.alloc, 0); assert.equal(result.targetObligationTotal, 0); assert.equal(result.targetDisbursementTotal, 0);
        assert.equal(result.obli, 25); assert.equal(result.disb, 20);
    }

    const oldReports = { beds: (await server.ssrLoadModule('/__baseline__/beds.tsx')).default, wfp: (await server.ssrLoadModule('/__baseline__/wfp.tsx')).default };
    const newReports = { beds: (await server.ssrLoadModule('/components/reports/BEDSReport.tsx')).default, wfp: (await server.ssrLoadModule('/components/reports/WFPReport.tsx')).default };
    const props = input => ({ data: { ...input, trainings: input.activities.filter(item => item.type === 'Training'), otherActivities: input.activities.filter(item => item.type !== 'Training') }, selectedYear: '2026', selectedReportingYear: '2026', selectedOu: 'NPMO', selectedFundType: 'Current', selectedTier: 'Tier 1', uacsCodes: {}, onPrintReport() {}, onExportReport() {} });
    let goldenComparisons = 0;
    for (const amount of [100, 0, null, undefined, '', 12.34]) {
        for (const dates of [['2026-01-01', '2026-02-01'], ['', ''], ['2025-12-01', '2027-03-01']]) {
            const expense = { ...line, amount, pricePerUnit: 20, numberOfUnits: 5, obligationMonth: dates[0], disbursementMonth: dates[1], actualObligationAmount: 35, actualDisbursementAmount: 22 };
            const input = data([expense]);
            input.subprojects = [{ ...parent, id: 12, name: 'Fixture subproject', packageType: 'Crop', estimatedCompletionDate: '2026-04-01', details: [{ ...expense, particulars: 'Seed', type: 'Input', deliveryDate: '2026-04-01' }] }];
            input.officeReqs = [{ id: 13, equipment: 'Desk', fundYear: 2026, operatingUnit: 'NPMO', fundType: 'Current', tier: 'Tier 1', workflow_status: 'APPROVED', objectType: 'CO', amount: 90, obligationDate: '2026-02-01', disbursementDate: '', disbursementJan: 10, disbursementMar: 80 }];
            const before = JSON.stringify(input);
            for (const year of ['2026', '2025', 'All']) {
                const scope = { ...filters, year };
                const prior = old.collectFinancialLineItems(input, scope);
                const after = current.collectFinancialLineItems(input, scope);
                assert.deepEqual(after.map(({ targetObligationSchedules, targetDisbursementSchedules, targetObligationTotal, targetDisbursementTotal, ...rest }) => rest), prior);
                assert.deepEqual(current.aggregateHomepageFinancials(input, scope), old.aggregateHomepageFinancials(input, scope));
                assert.deepEqual(currentAudit(input, scope, { auditAsOfMonth: 5 }), oldAudit(input, scope, { auditAsOfMonth: 5 }));
                assert.deepEqual(newAwards(awardsInput(input), year, null, []), oldAwards(awardsInput(input), year, null, []));
                for (const key of ['beds', 'wfp']) {
                    const reportProps = { ...props(input), selectedYear: year, selectedReportingYear: year };
                    assert.equal(renderToStaticMarkup(React.createElement(newReports[key], reportProps)), renderToStaticMarkup(React.createElement(oldReports[key], reportProps)), `${key} legacy mismatch amount=${amount} dates=${dates} year=${year}`);
                }
                goldenComparisons++;
            }
            assert.equal(JSON.stringify(input), before);
        }
    }
    // Stage-aware report markup must match an equivalent legacy monthly plan, with one physical owner.
    const equivalent = structured.targetObligationSchedules.map((entry, index) => ({ ...line, id: index + 1, amount: entry.amount, obligationMonth: entry.month, disbursementMonth: '2026-02-01' }));
    const wfpExpected = renderToStaticMarkup(React.createElement(oldReports.wfp, props(data(equivalent))));
    assert.equal(renderToStaticMarkup(React.createElement(newReports.wfp, props(data([one])))), wfpExpected);
    const reportInput = expense => ({ ...data([expense]), subprojects: [{ ...parent, id:12, name:'Fixture subproject', estimatedCompletionDate:'2026-04-01', details:[{...expense,particulars:'Seed',type:'Input',deliveryDate:'2026-04-01',numberOfUnits:2,pricePerUnit:50}] }] });
    const legacyActualLine = { ...line, obligations:one.obligations, disbursements:one.disbursements };
    for (const name of ['BPFormsReport','BudgetUtilizationReport','MonthlyReportMatrix','PICSReport','BAR1Report','DetailedAccomplishmentDataReport']) {
        const Component=(await server.ssrLoadModule(`/components/reports/${name}.tsx`)).default;
        const fullProps = expense => { const base=props(reportInput(expense));base.data.ipos=[];return {...base,financialData:base.data,selectedMonth:5,selectedQuarter:'All',deadlines:[],selectedAsOfDate:'2026-06-30'}; };
        assert.equal(renderToStaticMarkup(React.createElement(Component,fullProps(one))),renderToStaticMarkup(React.createElement(Component,fullProps(legacyActualLine))),`${name}: independent financial schedules must not multiply allocation or physical/actual output`);
    }
    console.log(`Independent targets: domain, allocation/actual isolation, audit, exclusions, child IDs and ${goldenComparisons} exact production-baseline aggregation/report comparisons passed.`);
} finally {
    await server.close();
}
