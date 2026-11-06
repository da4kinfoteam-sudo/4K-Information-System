import assert from 'node:assert/strict';
import {
    DCF_REVISION_ENTITY_TYPES, canRestoreDcfHistory, createDcfRevisionClient, dcfRevisionAuthorizationKey,
    formatDcfRevisionTime, legacyDcfHistory, projectDcfRevision, validateDcfRevisionPage, validateDcfSnapshot, validateDcfRestorePreview,
} from '../lib/dcfRevisionHistory.ts';

const actor = { id: 1, role: 'Super Admin', password: 'fixture-only', operatingUnit: 'NPMO' };
const snapshot = (entityType = 'activities') => ({ schemaVersion: 1, entityType, parentId: 7,
    record: { id: 7, name: 'Recorded name', status: 'Contractual', hiringStatus: 'Filled', equipment: 'Recorded printer', personnelPosition: 'Recorded position', particulars: 'Recorded rent',
        details: [{ id: 8, particulars: 'Seed', numberOfUnits: 4, pricePerUnit: 25, actualNumberOfUnits: 3, actualDeliveryDate: '2026-10-01' }],
        expenses: [{ id: 8, amount: 100, expenseParticular: 'Recorded expense', targetScheduleVersion: 2,
            targetObligationSchedules: [{ id: 'o1', month: '2026-10-01', amount: 70 }, { id: 'o2', month: '2026-11-01', amount: 30 }],
            targetDisbursementSchedules: [], actualObligationAmount: 999, obligations: [{ id: 'old', date: '2026-01-01', amount: 999 }] }],
        password: 'DO-NOT-RENDER', tokens: 'DO-NOT-RENDER' },
    financial: { obligations: [{ id: 50, item_id: 8, obligation_date: '2026-10-01', amount: 10 }, { id: 51, item_id: 8, obligation_date: '2026-10-01', amount: 10 }], disbursements: [], stages: {} },
    related: { activity_drive_files: [{ id: 22, file_name: 'Historical evidence.pdf', signed_url: 'DO-NOT-RENDER' }], fundSource: { uid: 'F1', label: 'Recorded fund' } }, physical: { actualPWD: 2 } });
const metadata = (id = 20) => ({ id, version: id - 1, recorded_at: '2026-11-03T01:00:00Z', actor_name: 'Recorded actor', source: 'details', kind: 'change', summary: 'Budget changed', restore_operation_id: null, can_undo: false });
const preview = { current: snapshot(), proposed: snapshot(), currentRevisionId: 20, currentHash: 'server-hash', canRestore: true, blockers: [], excludedFields: ['uid'], changes: [{ field: 'name', before: 'Current', after: 'Recorded name' }], requiresActualsAcknowledgement: true };

for (const type of DCF_REVISION_ENTITY_TYPES) {
    const input = snapshot(type), original = structuredClone(input);
    const sections = projectDcfRevision(validateDcfSnapshot(input, type, 7));
    assert(sections.some(section => section.title === 'Details'));
    assert(sections.some(section => section.title === 'Financial actuals'));
    assert(!JSON.stringify(sections).includes('DO-NOT-RENDER'));
    assert.deepEqual(input, original, 'Projection must not mutate a snapshot');
    if (type === 'staffing_requirements') {
        const fields = sections.find(section => section.title === 'Details').fields;
        assert.equal(fields.find(field => field.label === 'Employment status').value, 'Contractual');
        assert.equal(fields.find(field => field.label === 'Hiring Status').value, 'Filled');
    }
}
const sections = projectDcfRevision(snapshot());
const related = snapshot();
related.related = { ...related.related,
    activity_monitoring_reports: [{ id: 1, findings: 'Recorded finding', issues: 'Recorded issue', recommendations: 'Recorded recommendation' }],
    activity_monitoring_actions: [{ id: 2, monitoring_report_id: 1, action_taken: 'Recorded corrective action' }],
    subproject_accomplishments: [{ id: 3, detail_id: 8, delivery_date: '2026-09-01', quantity: 4 }],
    activity_supplements: [{ uid: 'S1', status: 'Approved', pending_status: 'Pending', pending_proposal: { reason: 'Recorded pending reason', expenses: [{ id: 9, expenseParticular: 'Pending expense', amount: 200 }] } }],
    budget_item_adjustment_history: [{ id: 4, action: 'tag_savings', before_snapshot: { id: 8, amount: 100 }, after_snapshot: { id: 8, amount: 90, accomplishmentRemarks: 'Recorded adjustment remark' } }],
    transfers: [{ id: 'T1', source_actual_remainder: { actualParticipantsMale: 3 }, destination_actuals: { actualParticipantsMale: 2 } }],
};
const relatedProjection = projectDcfRevision(related), renderedRelated = JSON.stringify(relatedProjection);
for (const text of ['Recorded finding', 'Recorded issue', 'Recorded recommendation', 'Recorded corrective action', '2026-09-01', 'Recorded pending reason', 'Pending expense', 'Recorded adjustment remark']) assert(renderedRelated.includes(text), `Historical display must include ${text}`);
assert(relatedProjection.some(section => section.title === 'Transfer T1 source remainder'));
assert(relatedProjection.some(section => section.title === 'Transfer T1 destination actuals'));
assert.equal(sections.find(section => section.title === 'Financial actuals').rows.length, 2, 'Independent duplicate-looking ledger entries must be retained');
assert.equal(sections.find(section => section.title === 'Financial actuals').rows[0][3], '2026-10-01');
const schedules = sections.find(section => section.title === 'Target schedules');
assert.equal(schedules.rows.length, 3);
assert(schedules.rows.some(row => row.includes('Version 2 (explicitly empty)')));
const managed = snapshot();
managed.financial.stages = { 8: { obligation: { source: 'central', entries: [] }, disbursement: { source: 'central', entries: [] } } };
assert.equal(projectDcfRevision(managed).find(section => section.title === 'Financial actuals').rows.length, 0, 'Managed-empty stages never merge stale embedded/scalar actuals');
const parent = snapshot('office_requirements');
parent.financial = { obligations: [{ id: 4, item_id: null, amount: 12 }], disbursements: [], stages: { $parent: { obligation: { source: 'central', entries: [{ id: 4, date: '2026-10-01', amount: 12 }] }, disbursement: { source: 'central', entries: [] } } } };
assert.equal(projectDcfRevision(parent).find(section => section.title === 'Financial actuals').rows.length, 1, 'Parent stage and raw central rows are not counted twice');
assert.throws(() => validateDcfSnapshot({ ...snapshot(), schemaVersion: 2 }, 'activities', 7), /unsupported/);
assert.throws(() => validateDcfSnapshot(snapshot(), 'subprojects', 7), /different record/);
assert.throws(() => validateDcfSnapshot({ ...snapshot(), financial: {} }, 'activities', 7), /incomplete/);
assert.throws(() => validateDcfSnapshot({ ...snapshot(), financial: { obligations: [], disbursements: [], stages: { 8: {} } } }, 'activities', 7), /provenance/);
const page = validateDcfRevisionPage({ rows: [metadata(20), metadata(19)], total: 2, nextCursor: null }, 10);
assert.equal(page.revisions[0].version, 19);
assert.equal(page.revisions[0].snapshotAvailable, true);
assert.equal(page.totalCount, 2);
const linkedKey=['2026-11-03T01:00:00Z','Updated accomplishment','Recorded actor'];
const linkedPage=validateDcfRevisionPage({rows:[{...metadata(20),legacy_keys:[linkedKey]}],total:1,legacyTotal:2,nextCursor:null},10);
assert.deepEqual(linkedPage.revisions[0].legacyKeys,[JSON.stringify(linkedKey)]);
assert.equal(linkedPage.legacyTotalCount,2);
assert.equal(legacyDcfHistory([{date:linkedKey[0],event:linkedKey[1],user:linkedKey[2]},{date:linkedKey[0],event:linkedKey[1],user:'Different actor'}],new Set(linkedPage.revisions[0].legacyKeys)).length,1,'Similar wording or timestamps alone never hide a legacy event');
assert.throws(()=>validateDcfRevisionPage({rows:[],total:0,legacyTotal:-1},10),/legacy history count/);
assert.throws(() => validateDcfRevisionPage({ rows: [metadata(19), metadata(20)], total: 2 }, 10), /order/);
assert.throws(() => validateDcfRevisionPage({ rows: [metadata(20)], total: 2, nextCursor: 18 }, 10), /cursor/);
assert.equal(validateDcfRestorePreview(preview, 19).revisionId, 19);
assert.equal(validateDcfRestorePreview(preview, 19).changesActuals, true);
assert.throws(() => validateDcfRestorePreview({ ...preview, requiresActualsAcknowledgement: undefined }, 19), /incomplete/);
assert.match(formatDcfRevisionTime('2026-11-03T01:00:00Z'), /09:00:00/);
assert.equal(formatDcfRevisionTime('nonsense'), 'Unknown revision time');
assert.match(formatDcfRevisionTime('nonsense', false), /legacy date/);
const legacy = [{ date: 'bad', event: 'Old change', user: '' }];
assert.equal(legacyDcfHistory(legacy)[0].snapshotAvailable, false);
assert.deepEqual(legacyDcfHistory(legacy, new Set([JSON.stringify(['bad', 'Old change', ''])])), []);
assert.equal(canRestoreDcfHistory(actor), true);
assert.equal(canRestoreDcfHistory({ ...actor, role: 'Administrator' }), false);
assert.equal(canRestoreDcfHistory({ ...actor, role: 'Guest' }, { canRestore: true }), false);
assert.equal(canRestoreDcfHistory(actor, { canRestore: false }), false);
assert.equal(canRestoreDcfHistory({ ...actor, role: 'User' }, { canRestore: true }), true);
assert.notEqual(dcfRevisionAuthorizationKey(actor), dcfRevisionAuthorizationKey({ ...actor, visibility_scope: 'Own OU' }));
assert.notEqual(dcfRevisionAuthorizationKey(actor, { authorizationKey: 'A' }), dcfRevisionAuthorizationKey(actor, { authorizationKey: 'B' }));

const calls = []; let failApply = true;
const rpc = async (name, params) => {
    calls.push({ name, params });
    if (name === 'list_dcf_revisions') return { data: { rows: [metadata()], total: 1, nextCursor: null }, error: null };
    if (name === 'read_dcf_revision') return { data: { id: 20, snapshot: snapshot() }, error: null };
    if (name === 'preview_dcf_restore') return { data: preview, error: null };
    if (failApply) { failApply = false; throw new Error('Lost response'); }
    return { data: { record: { id: 7, name: 'Confirmed' }, financial: snapshot().financial, revisionId: 21, restoreOperationId: 'durable-operation' }, error: null };
};
const client = createDcfRevisionClient(actor, 'activities', 7, rpc);
assert.equal(calls.length, 0, 'Creating a client does not read or write');
await client.list(); await client.list(); assert.equal(calls.length, 1);
await client.read(20); await client.read(20); assert.equal(calls.length, 2);
await assert.rejects(() => client.read('legacy-0'), /legacy/);
await assert.rejects(() => client.list(100), /Invalid/);
const loaded = await client.preview(19, 'restore-being-undone');
assert.equal(calls.at(-1).params.p_undo_operation_id, 'restore-being-undone');
const request = {};
await assert.rejects(() => client.apply(loaded, '', true, request), /reason/);
await assert.rejects(() => client.apply(loaded, 'Correction', false, request), /acknowledgement/);
await assert.rejects(() => client.apply(loaded, 'Correction', true, request), /Lost response/);
const key = request.key;
const confirmed = await client.apply(loaded, 'Correction', true, request);
assert.equal(request.key, key, 'Uncertain retries preserve the request UUID');
assert.equal(confirmed.confirmed, true); assert.equal(confirmed.operationId, 'durable-operation');
assert.equal(calls.at(-1).params.p_expected_hash, 'server-hash');
assert.equal('p_snapshot' in calls.at(-1).params, false, 'The browser never sends historical business JSON to apply');
await client.apply(loaded, 'Different correction', true, request); assert.notEqual(request.key, key);
client.dispose(); await assert.rejects(() => client.read(20), /authorization changed/);
let release;
const pending = createDcfRevisionClient(actor, 'activities', 7, () => new Promise(resolve => { release = resolve; }));
const read = pending.read(20); pending.dispose(); release({ data: { id: 20, snapshot: snapshot() }, error: null });
await assert.rejects(() => read, /authorization changed/);
const denied = createDcfRevisionClient(actor, 'activities', 7, async () => ({ data: null, error: { message: 'Permission denied' } }));
await assert.rejects(() => denied.list(), /Permission denied/);
console.log('DCF revision domain: five-module projection, SQL0001 envelopes, identity/provenance, fail-closed reads, scoped cache, restore guards and stable retries passed. No server or database used.');
