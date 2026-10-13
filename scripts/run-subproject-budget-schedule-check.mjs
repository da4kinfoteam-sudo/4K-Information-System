import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as XLSX from 'xlsx';

const vite = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, entries: [] }, plugins: [{
    name: 'schedule-check-no-production', enforce: 'pre',
    resolveId(id) { if (id.endsWith('supabaseClient')) return '\0schedule-client'; },
    load(id) { if (id === '\0schedule-client') return `export const supabase = { from() {
        const fixture = globalThis.scheduleFixture; let action = 'read', payload; const filters = [];
        const q = { select() { return q; }, update(value) { action = 'write'; payload = value; return q; }, insert(value) { action = 'insert'; payload = value; return q; },
            eq(key, value) { filters.push([key, value]); return q; }, is(key, value) { filters.push([key, value]); return q; }, maybeSingle() { return q; },
            then(resolve) { fixture.calls.push({ action, payload, filters }); return Promise.resolve({ data: action === 'read' ? fixture.latest : action === 'insert' ? payload.map((row, index) => ({ ...row, id: index + 100 })) : fixture.conflict ? null : { ...fixture.latest, ...payload }, error: fixture.fail ? { message: 'Synthetic failure' } : null }).then(resolve); }
        }; return q;
    } };`; },
}] });
try {
    const schedules = await vite.ssrLoadModule('/lib/subprojectBudgetSchedules.ts');
    const { getChangedSubprojectActualIds, mergeSubprojectDraft, persistSubprojectDraft, rescheduleBudgetTargets } = await vite.ssrLoadModule('/lib/subprojectDraftPersistence.ts');
    const { resolveSubprojectCompletionRollup } = await vite.ssrLoadModule('/lib/subprojectCompletion.ts');
    const { getBudgetLineAmount } = await vite.ssrLoadModule('/lib/budgetLineAdjustments.ts');
    const { getSubprojectBudgetItemRemovalAction } = await vite.ssrLoadModule('/lib/subprojectBudgetItemLifecycleRules.ts');
    const { collectFinancialLineItems, aggregateHomepageFinancials } = await vite.ssrLoadModule('/lib/financialAggregation.ts');
    const { buildSubprojectClonePayload } = await vite.ssrLoadModule('/lib/recordCloning.ts');
    const references = { particularTypes: { Equipment: ['Coffee Roaster'] }, uacsCodes: { CO: { Equipment: { '106': 'Equipment code' } } } };
    const rows = [
        { id: 1, numberOfUnits: 10, obligationMonth: '2026-01-01', deliveryDate: '2026-02-01', disbursementMonth: '2026-03-01' },
        { id: 2, numberOfUnits: 20, obligationMonth: '2026-03-01', deliveryDate: '2026-04-01', disbursementMonth: '2026-05-01' },
        { id: 3, numberOfUnits: 15, obligationMonth: '2026-07-01', deliveryDate: '2026-08-01', disbursementMonth: '2026-09-01' },
    ].map(row => ({ ...row, type: 'Equipment', particulars: 'Coffee Roaster', unitOfMeasure: 'pcs', objectType: 'CO', expenseParticular: 'Equipment', uacsCode: '106', pricePerUnit: 1000 }));
    const parent = { id: 11, uid: 'SP-11', name: 'Fixture', fundingYear: 2026, operatingUnit: 'NPMO', fundType: 'Current', tier: 'Tier 1', status: 'Ongoing', workflow_status: 'APPROVED', details: rows, history: [], updated_at: '2026-10-13T00:00:00Z' };
    const grouped = { ...parent, details: rows.map(row => ({ ...row, budgetItemGroupId: 'group-1' })) };
    assert.equal(schedules.groupBudgetSchedules(rows).length, 3);
    assert.equal(schedules.groupBudgetSchedules(grouped.details).length, 1);
    assert.equal(schedules.groupBudgetSchedules([...grouped.details, { ...rows[0], id: 4, budgetItemGroupId: 'other-group' }]).length, 2);
    const data = subproject => ({ subprojects: [subproject], activities: [], officeReqs: [], staffingReqs: [], otherProgramExpenses: [] });
    const filters = { year: '2026', actualYear: '2026', operatingUnit: 'NPMO', tier: 'Tier 1', fundType: 'Current' };
    const lines = collectFinancialLineItems(data(grouped), filters);
    assert.equal(lines.length, 3);
    assert.deepEqual(lines.map(line => [line.line.id, line.targetMonth, line.alloc]), [[1, 0, 10000], [2, 2, 20000], [3, 6, 15000]]);
    assert.deepEqual(lines.map(line => [line.line.disbursementMonth, line.alloc]), [['2026-03-01', 10000], ['2026-05-01', 20000], ['2026-09-01', 15000]]);
    assert.deepEqual(rows.map(row => [row.deliveryDate, row.numberOfUnits]), [['2026-02-01', 10], ['2026-04-01', 20], ['2026-08-01', 15]]);
    assert.equal(rows.reduce((sum, row) => sum + getBudgetLineAmount(row), 0), 45000);
    assert.deepEqual(aggregateHomepageFinancials(data(grouped), filters), aggregateHomepageFinancials(data(parent), filters));
    const repeated = { ...grouped, details: grouped.details.map(row => ({ ...row, obligationMonth: '2026-01-01' })) };
    assert.equal(collectFinancialLineItems(data(repeated), filters).reduce((sum, line) => sum + line.alloc, 0), 45000);
    const acrossYears = { ...grouped, details: grouped.details.map((row, index) => index === 2 ? { ...row, obligationMonth: '2027-07-01', disbursementMonth: '2027-09-01' } : row) };
    assert.equal(collectFinancialLineItems(data(acrossYears), filters)[2].line.obligationMonth, '2027-07-01');
    const partial = grouped.details.map((row, index) => ({ ...row, isCompleted: index < 2, actualDeliveryDate: index < 2 ? '2026-09-01' : null }));
    assert.equal(resolveSubprojectCompletionRollup(partial, 'Ongoing').isComplete, false);
    assert.equal(resolveSubprojectCompletionRollup([], 'Ongoing').isComplete, false);
    const complete = partial.map((row, index) => ({ ...row, isCompleted: true, actualDeliveryDate: index === 2 ? '2026-10-01' : row.actualDeliveryDate }));
    assert.equal(resolveSubprojectCompletionRollup(complete, 'Ongoing').actualCompletionDate, '2026-10-01');
    assert.equal(resolveSubprojectCompletionRollup([...partial.slice(0, 2), { ...partial[2], isCancelled: true }], 'Ongoing').isComplete, true);
    assert.equal(getSubprojectBudgetItemRemovalAction('Proposed', true, true), 'delete');
    assert.equal(getSubprojectBudgetItemRemovalAction('Ongoing', true, false), 'cancel');
    for (const row of grouped.details) assert.equal(schedules.validateBudgetSchedule(row, references), null);
    assert.match(schedules.validateBudgetSchedule({ ...rows[0], particulars: 'Free text' }, references), /listed Particular/);
    assert.match(schedules.validateBudgetSchedule({ ...rows[0], uacsCode: 'invalid' }, references), /listed UACS/);
    const obsolete = { ...rows[0], particulars: 'Obsolete', uacsCode: 'old-code' };
    assert.equal(schedules.validateBudgetSchedule({ ...obsolete, numberOfUnits: 12 }, references, obsolete), null);
    assert.notEqual(schedules.validateBudgetSchedule({ ...obsolete, particulars: 'Unknown' }, references, obsolete), null);
    assert.equal(schedules.validateBudgetSchedule({ ...rows[0], deliveryDate: '2026-02-30' }, references) !== null, true);
    assert.equal(schedules.validateBudgetSchedule({ ...rows[0], numberOfUnits: 0 }, references) !== null, true);
    const actual = { ...grouped.details[0], actualObligationDate: '2025-01-01', obligations: [{ id: 10, date: '2025-01-01', amount: -100 }], actualDeliveryDate: '2025-03-01', actualDisbursementDate: '2025-04-01' };
    const changedObligation = { ...actual, obligations: [{ id: 10, date: '2025-01-01', amount: -200 }] };
    assert.deepEqual([...getChangedSubprojectActualIds([actual], [changedObligation], 'obligation')], ['1']);
    assert.equal(getChangedSubprojectActualIds([actual], [changedObligation], 'disbursement').size, 0);
    const changedDisbursement = { ...actual, disbursements: [{ id: 11, date: '2025-04-01', amount: 20 }] };
    assert.equal(getChangedSubprojectActualIds([actual], [changedDisbursement], 'obligation').size, 0);
    assert.deepEqual([...getChangedSubprojectActualIds([actual], [changedDisbursement], 'disbursement')], ['1']);
    const changedYear = rescheduleBudgetTargets([actual], 2027)[0];
    assert.equal(changedYear.obligationMonth, '2027-01-01');
    assert.deepEqual(changedYear.obligations, actual.obligations);
    for (const field of ['actualObligationDate', 'actualDeliveryDate', 'actualDisbursementDate']) assert.equal(changedYear[field], actual[field]);
    const reserved = new Set(rows.map(row => String(row.id)));
    assert.notEqual(schedules.createBudgetScheduleId(reserved), schedules.createBudgetScheduleId(reserved));
    const prepared = schedules.prepareBudgetScheduleRows([{ ...actual, numberOfUnits: 2 }], [{ ...actual, amount: 10000 }])[0];
    assert.equal(prepared.amount, 2000); assert.deepEqual(prepared.obligations, actual.obligations);
    const clone = buildSubprojectClonePayload({ ...grouped, details: [actual, ...grouped.details.slice(1)] }, { createdAt: '2026-10-13T00:00:00Z', encodedBy: 'Fixture', requiresApprover: false });
    assert.equal(new Set(clone.details.map(row => row.budgetItemGroupId)).size, 1);
    assert.notEqual(clone.details[0].budgetItemGroupId, 'group-1');
    assert.equal(clone.details[0].obligations.length, 0);
    assert.equal(schedules.groupBudgetSchedules(grouped.details.slice(1)).length, 1);
    assert.equal(schedules.groupBudgetSchedules(grouped.details.slice(0, 1)).length, 1);
    const draft = { ...grouped, details: grouped.details.map((row, index) => index === 0 ? { ...row, actualNumberOfUnits: 5 } : row) };
    const latest = { ...grouped, details: [...grouped.details.map(row => ({ ...row, budgetItemGroupId: 'newer-group' })), { ...rows[0], id: 4 }], updated_at: 'newer' };
    const merged = mergeSubprojectDraft(grouped, draft, latest);
    assert.equal(merged.details.length, 4); assert.equal(merged.details[0].budgetItemGroupId, 'newer-group'); assert.equal(merged.details[0].actualNumberOfUnits, 5);
    assert.throws(() => mergeSubprojectDraft(grouped, draft, { ...latest, details: latest.details.map(row => ({ ...row, actualNumberOfUnits: 8 })) }), /changed while/);
    const deleted = mergeSubprojectDraft(grouped, { ...grouped, details: grouped.details.slice(1) }, grouped);
    assert.equal(deleted.details.length, 2);
    assert.throws(() => mergeSubprojectDraft(grouped, { ...grouped, details: grouped.details.slice(1) }, latest), /changed while/);
    globalThis.scheduleFixture = { latest, calls: [] };
    const confirmed = await persistSubprojectDraft(grouped, draft, 'accomplishment');
    assert.equal(confirmed.details.length, 4);
    assert.equal(globalThis.scheduleFixture.calls.filter(call => call.action === 'write').length, 1);
    assert.equal(globalThis.scheduleFixture.calls[1].filters.some(([key, value]) => key === 'updated_at' && value === 'newer'), true);
    globalThis.scheduleFixture.conflict = true;
    await assert.rejects(() => persistSubprojectDraft(grouped, draft, 'accomplishment'), /changed while/);
    for (const [file, token] of [['components/reports/BEDSReport.tsx', 'item.line.obligationMonth'], ['components/reports/BEDSReport.tsx', 'item.line.disbursementMonth'], ['components/reports/WFPReport.tsx', 'detail.obligationMonth']]) assert.equal((await readFile(file, 'utf8')).includes(token), true);
    const transfer = await readFile('supabase/migrations/202610090001_activity_subproject_budget_item_transfers.sql', 'utf8');
    assert.match(transfer, /jsonb_agg\(source_line.value/);
    globalThis.XLSX = XLSX; globalThis.window = { XLSX }; globalThis.alert = () => {};
    const { default: BEDSReport } = await vite.ssrLoadModule('/components/reports/BEDSReport.tsx');
    const reportProps = { selectedYear: '2026', selectedReportingYear: '2026', selectedOu: 'NPMO', selectedTier: 'Tier 1', selectedFundType: 'Current' };
    const renderBeds = record => renderToStaticMarkup(React.createElement(BEDSReport, { ...reportProps, data: { subprojects: [record], trainings: [], otherActivities: [], officeReqs: [], staffingReqs: [], otherProgramExpenses: [] } }));
    assert.equal(renderBeds(parent), renderBeds(grouped));
    assert.match(renderBeds(grouped), /45,000/);
    globalThis.XLSX = XLSX; globalThis.window = { XLSX }; globalThis.alert = () => {};
    const { handleSubprojectsUpload } = await vite.ssrLoadModule('/components/mainfunctions/ImportExportService.ts');
    const importRows = async hasGroups => {
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows.map(row => ({
            uid: 'SP-IMPORT', name: 'Imported item', status: 'Proposed', fundingYear: 2026,
            detail_type: row.type, detail_particulars: row.particulars, detail_uacsCode: row.uacsCode,
            detail_unitOfMeasure: row.unitOfMeasure, detail_pricePerUnit: row.pricePerUnit, detail_numberOfUnits: row.numberOfUnits,
            detail_deliveryDate: row.deliveryDate, detail_obligationMonth: row.obligationMonth, detail_disbursementMonth: row.disbursementMonth,
            ...(hasGroups ? { detail_budgetItemGroupId: 'import-group' } : {}),
        }))), 'Subprojects');
        const binary = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
        globalThis.FileReader = class { readAsArrayBuffer() { globalThis.importPromise = this.onload({ target: { result: binary } }); } };
        globalThis.scheduleFixture = { calls: [] }; let records = [];
        handleSubprojectsUpload({ target: { files: [{}] } }, [], updater => { records = updater(records); }, [], () => {}, () => {}, references.uacsCodes, { fullName: 'Fixture', operatingUnit: 'NPMO' }, false, [{ uid: 'FS-000001', label: '4K Fund', is_active: true }]);
        await globalThis.importPromise; return records;
    };
    const imported = await importRows(true);
    assert.equal(imported[0].details.length, 3);
    assert.equal(schedules.groupBudgetSchedules(imported[0].details).length, 1);
    assert.deepEqual(imported[0].details.map(row => row.obligationMonth), rows.map(row => row.obligationMonth));
    assert.equal(schedules.groupBudgetSchedules((await importRows(false))[0].details).length, 3);
    console.log('PASS: grouping, independent monthly targets, totals, completion, references, lifecycle, clone, transfer contract and confirmed stale-safe saves. No production connections.');
} finally { await vite.close(); }
