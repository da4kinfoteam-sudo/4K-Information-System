import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import * as XLSX from 'xlsx';

const vite = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [], entries: [] }, plugins: [{
    name: 'title-check-no-database', enforce: 'pre',
    resolveId(source) {
        if (source.endsWith('supabaseClient')) return '\0title-check-supabase';
        if (source.endsWith('/_shared/googleDrive.ts')) return '\0title-check-drive';
    },
    load(id) {
        if (id === '\0title-check-supabase') return 'export const supabase = null;';
        if (id === '\0title-check-drive') return `
            export const handleOptions = () => null;
            export const requireUser = async () => globalThis.galleryFixture.user;
            export const operatingUnitFromRegion = () => 'NPMO';
            export const jsonResponse = value => new Response(JSON.stringify(value));
            export const errorResponse = (message, status) => new Response(JSON.stringify({ message }), { status });
            export const adminClient = () => ({ from(table) {
                const fixture = globalThis.galleryFixture; fixture.queries.push(table);
                let key, ids, single = false;
                const query = {
                    select() { return query; }, eq() { return query; }, is() { return query; }, or() { return query; }, order() { return query; },
                    in(field, values) { key = field; ids = values; return query; },
                    maybeSingle() { single = true; return query; },
                    then(resolve) { const rows = (fixture.tables[table] || []).filter(row => !ids || ids.includes(row[key]));
                        return Promise.resolve({ data: single ? rows[0] : rows, error: null }).then(resolve); }
                }; return query;
            } });`;
    },
}] });
globalThis.window = { XLSX };
try {
    const { getActivityDisplayTitle, normalizeActivityTitle, resolveActivitySelection, escapeActivityHtml } = await vite.ssrLoadModule('/lib/activityTitles.ts');
    const { buildActivityDetailsPayload } = await vite.ssrLoadModule('/lib/activityIpoLinks.ts');
    const { buildActivityClonePayload } = await vite.ssrLoadModule('/lib/recordCloning.ts');
    const { calculateBAR1ReportData } = await vite.ssrLoadModule('/components/reports/BAR1Calculation.ts');
    const { collectFinancialLineItems, aggregateHomepageFinancials } = await vite.ssrLoadModule('/lib/financialAggregation.ts');
    const base = {
        id: 11, uid: 'ACT-2026-001', name: 'Subproject Monitoring', type: 'Activity', reference_activity_id: 9,
        component: 'Program Management', operatingUnit: 'NPMO', fundingYear: 2026, fundType: 'Current', tier: 'Tier 1',
        date: '2026-08-01', actualDate: '2026-08-10', status: 'Completed', workflow_status: 'APPROVED',
        participatingIpos: ['Fixture IPO'], participating_ipo_ids: [1], location: 'Fixture location',
        actualParticipantsMale: 3, actualParticipantsFemale: 4, history: [],
        expenses: [{ id: 99, amount: 1000, objectType: 'MOOE', obligations: [{ id: 1, date: '2026-08-01', amount: -100 }], disbursements: [{ id: 2, date: '2026-08-01', amount: 50 }] }],
    };
    for (const value of [undefined, null, '', '  \n ']) {
        assert.equal(normalizeActivityTitle(value), null);
        assert.equal(getActivityDisplayTitle({ ...base, activity_title: value }), base.name);
    }
    const titled = { ...base, activity_title: '  Monitoring visit to Fixture IPO  ' };
    assert.equal(getActivityDisplayTitle(titled), 'Monitoring visit to Fixture IPO');
    assert.equal(getActivityDisplayTitle({ ...titled, type: 'Training', name: 'Specific Training' }), 'Specific Training');
    assert.equal(resolveActivitySelection([titled, { ...titled, id: 22 }], 'Monitoring visit to Fixture IPO'), undefined);
    assert.equal(resolveActivitySelection([titled, { ...titled, id: 22 }], base.uid), undefined);
    assert.equal(resolveActivitySelection([titled, { ...titled, id: 22 }], '22').id, 22);
    assert.equal(escapeActivityHtml('<img src="x" onerror=\'bad\'>&'), '&lt;img src=&quot;x&quot; onerror=&#39;bad&#39;&gt;&amp;');
    const details = buildActivityDetailsPayload({ ...titled, activity_title: normalizeActivityTitle(titled.activity_title), budgetItemTransferId: 'transfer-1', isTransferTargetExcluded: true });
    assert.equal(details.activity_title, 'Monitoring visit to Fixture IPO');
    for (const field of ['expenses', 'actualDate', 'actualParticipantsMale', 'physical_accomplishment_submitted_at', 'workflow_status', 'budgetItemTransferId', 'isTransferTargetExcluded']) assert.equal(field in details, false, field);
    const snapshot = structuredClone(titled);
    const clone = buildActivityClonePayload(titled, { createdAt: '2026-10-13T00:00:00Z', encodedBy: 'Fixture', requiresApprover: false });
    assert.equal(clone.activity_title, normalizeActivityTitle(titled.activity_title));
    assert.equal(clone.status, 'Proposed');
    assert.equal(clone.actualDate == null, true);
    assert.equal(clone.expenses[0].obligations.length, 0);
    assert.deepEqual(titled, snapshot);

    const reportInput = activities => ({ subprojects: [], trainings: [], otherActivities: activities, officeReqs: [], staffingReqs: [], otherProgramExpenses: [], ipos: [] });
    const withoutRecordLabels = value => Array.isArray(value) ? value.map(withoutRecordLabels) : value && typeof value === 'object'
        ? Object.fromEntries(Object.entries(value).filter(([key]) => !key.endsWith('_items') && !key.endsWith('_records')).map(([key, child]) => [key, withoutRecordLabels(child)])) : value;
    const reportBefore = calculateBAR1ReportData(reportInput([base, { ...base, id: 22 }]), '2026', 'All');
    const reportAfter = calculateBAR1ReportData(reportInput([titled, { ...titled, id: 22, activity_title: 'Another visit' }]), '2026', 'All');
    assert.deepEqual(withoutRecordLabels(reportAfter), withoutRecordLabels(reportBefore));
    assert.ok(JSON.stringify(reportAfter).includes('Monitoring visit to Fixture IPO'));
    const financialInput = activities => ({ subprojects: [], activities, officeReqs: [], staffingReqs: [], otherProgramExpenses: [] });
    const filters = { year: '2026', operatingUnit: 'All', fundType: 'All', tier: 'All' };
    assert.deepEqual(collectFinancialLineItems(financialInput([titled]), filters), collectFinancialLineItems(financialInput([base]), filters));
    assert.deepEqual(aggregateHomepageFinancials(financialInput([titled]), filters), aggregateHomepageFinancials(financialInput([base]), filters));

    const { handleActivitiesUpload } = await vite.ssrLoadModule('/components/mainfunctions/ImportExportService.ts');
    globalThis.XLSX = XLSX;
    const messages = [];
    globalThis.alert = message => messages.push(message);
    const importRows = async rows => {
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Activities Data');
        const binary = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
        globalThis.FileReader = class { readAsArrayBuffer() { globalThis.importPromise = this.onload({ target: { result: binary } }); } };
        let records = [];
        handleActivitiesUpload({ target: { files: [{}] } }, [], updater => { records = updater(records); }, [], () => {}, () => {}, {}, { fullName: 'Fixture', operatingUnit: 'NPMO' }, [{ uid: 'FS-000001', label: '4K Fund', is_active: true }]);
        await globalThis.importPromise;
        return records;
    };
    const importBase = { uid: 'ACT-IMPORT', type: 'Activity', component: 'Program Management', name: base.name, date: '2026-08-01' };
    assert.equal((await importRows([importBase]))[0].activity_title, null);
    const imported = await importRows([{ ...importBase, activity_title: '  Import visit  ', expense_amount: 5 }, { ...importBase, activity_title: 'Import visit', expense_amount: 10 }]);
    assert.equal(imported.length, 1);
    assert.equal(imported[0].name, base.name);
    assert.equal(imported[0].activity_title, 'Import visit');
    assert.equal(imported[0].expenses.length, 2);
    assert.equal((await importRows([{ ...importBase, activity_title: 'Single shared title', expense_amount: 5 }, { ...importBase, expense_amount: 10 }]))[0].activity_title, 'Single shared title');
    assert.equal((await importRows([{ ...importBase, activity_title: 123 }]))[0].activity_title, '123');
    assert.deepEqual(await importRows([{ ...importBase, activity_title: 'First' }, { ...importBase, activity_title: 'Second' }]), []);
    assert.match(messages.at(-1), /conflicting Activity Titles/);

    globalThis.Deno = { serve(handler) { globalThis.galleryHandler = handler; } };
    await vite.ssrLoadModule('/supabase/functions/homepage-gallery-feed/index.ts');
    const galleryRecords = [base, { ...titled, id: 22 }, { ...titled, id: 33, type: 'Training', name: 'Specific Training' }];
    globalThis.galleryFixture = {
        user: { id: 1, role: 'Super Admin', operatingUnit: 'NPMO' }, queries: [],
        tables: { activities: galleryRecords,
            activity_drive_files: galleryRecords.map((row, index) => ({ id: index + 1, activity_id: row.id, file_id: 'image-' + row.id, file_name: 'original.jpg', upload_section: 'gallery', uploaded_at: '2026-10-13T00:00:00Z' })),
            roles_config: [{ can_view: true, visibility_scope: 'Own OU' }],
        },
    };
    const loadGallery = async () => {
        const response = await globalThis.galleryHandler(new Request('http://fixture.test/gallery', { method: 'POST', body: JSON.stringify({ user_id: 1, activity_ids: [11, 22, 33] }) }));
        assert.equal(response.status, 200);
        return (await response.json()).items;
    };
    const gallery = await loadGallery();
    assert.deepEqual(gallery.map(item => item.entityName), [base.name, 'Monitoring visit to Fixture IPO', 'Specific Training']);
    assert.deepEqual(gallery.map(item => item.files[0].file_id), ['image-11', 'image-22', 'image-33']);
    assert.deepEqual(globalThis.galleryFixture.queries, ['activities', 'activity_drive_files']);
    globalThis.galleryFixture.user = { id: 2, role: 'User', operatingUnit: 'RPMO 1' };
    assert.deepEqual(await loadGallery(), []);

    // Remaining formal report keys intentionally keep the generic name.
    for (const [file, expression] of [
        ['components/reports/PICSReport.tsx', '`${activity.name} conducted`'],
        ['components/reports/DetailedAccomplishmentDataReport.tsx', '`${activity.name} conducted`'],
        ['components/reports/MonthlyReportMatrix.tsx', "createRow(act.name, 'Number'"],
        ['components/reports/BPFormsReport.tsx', 'a.name === item.activityName'],
        ['components/reports/BudgetUtilizationReport.tsx', 'a.name === item.activityName'],
    ]) assert.ok((await readFile(file, 'utf8')).includes(expression), file);
    const form = await readFile('components/ActivityEdit.tsx', 'utf8');
    assert.ok(form.includes('delete sanitizedPayload.activity_title;'));
    const migration = await readFile('supabase/migrations/202610130001_optional_activity_titles.sql', 'utf8');
    assert.ok(migration.includes('add column if not exists activity_title text'));
    assert.ok(!/\b(?:update|delete from|insert into)\s+public\.activities/i.test(migration));
    console.log('PASS: title fallback/trim/Training/identity/escaping, cloning/details isolation, BAR1 and financial invariants, legacy XLSX imports, mocked gallery edge labels/file identity/OU scope, formal report boundaries and additive migration contract.');
} finally {
    await vite.close();
    delete globalThis.window;
    delete globalThis.XLSX;
    delete globalThis.FileReader;
    delete globalThis.alert;
    delete globalThis.importPromise;
    delete globalThis.Deno;
    delete globalThis.galleryHandler;
    delete globalThis.galleryFixture;
}
