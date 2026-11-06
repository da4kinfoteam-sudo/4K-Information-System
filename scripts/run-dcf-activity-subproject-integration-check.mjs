import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import ts from 'typescript';

const fixture = {
    records: { activities: [], subprojects: [] }, calls: [], receipts: new Map(), nextId: 300,
    fail: false, loseResponse: false,
};
globalThis.dcfActivitySubprojectFixture = fixture;
const server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true },
    optimizeDeps: { noDiscovery: true, entries: [] }, plugins: [{
        name: 'dcf-activity-subproject-isolated-client', enforce: 'pre',
        resolveId(id) { if (id.endsWith('/supabaseClient')) return '\0dcf-activity-subproject-client'; },
        load(id) {
            if (id !== '\0dcf-activity-subproject-client') return;
            return `export const supabase = {
                from(table) {
                    const filters = []; const query = {
                        select() { return query; }, eq(key,value) { filters.push([key,value]); return query; }, maybeSingle() { return query; },
                        then(resolve,reject) {
                            const f = globalThis.dcfActivitySubprojectFixture;
                            f.calls.push({ action:'read', table, filters });
                            const data = (f.records[table] || []).find(row => filters.every(([key,value]) => row[key] === value)) || null;
                            return Promise.resolve({ data:structuredClone(data), error:null }).then(resolve,reject);
                        }
                    }; return query;
                },
                async rpc(name,payload) {
                    const f = globalThis.dcfActivitySubprojectFixture;
                    f.calls.push({ action:'rpc', name, payload:structuredClone(payload) });
                    if (name === 'budget_target_schedule_capability') return { data:2,error:null };
                    if (name !== 'commit_dcf_change') throw new Error('Unexpected RPC: ' + name);
                    if (f.fail) return { data:null,error:{message:'Synthetic rejected save'} };
                    if (f.receipts.has(payload.p_request_key)) return { data:structuredClone(f.receipts.get(payload.p_request_key)),error:null };
                    const table = f.records[payload.p_entity_type];
                    const index = table.findIndex(row => row.id === payload.p_parent_id);
                    const base = index >= 0 ? table[index] : {};
                    if (payload.p_parent_id && (!base.id || base.updated_at !== payload.p_base.updated_at)) return { data:null,error:{message:'Synthetic stale baseline'} };
                    const record = { ...base,...payload.p_changes,id:base.id || ++f.nextId,updated_at:'server-' + f.nextId };
                    if (index < 0) table.push(record); else table[index] = record;
                    const result = { record,financial:{obligations:[],disbursements:[]},revisionId:f.nextId };
                    f.receipts.set(payload.p_request_key,structuredClone(result));
                    if (f.loseResponse) { f.loseResponse = false; throw new Error('Synthetic transport loss after commit'); }
                    return { data:structuredClone(result),error:null };
                }
            };`;
        },
    }] });

try {
    const { persistActivityDraft } = await server.ssrLoadModule('/lib/activityDraftPersistence.ts');
    const { persistSubprojectDraft } = await server.ssrLoadModule('/lib/subprojectDraftPersistence.ts');
    const { persistRepeatingActivity } = await server.ssrLoadModule('/lib/activityRepeatingPersistence.ts');
    const { dcfChangedFields, persistDcfMutation } = await server.ssrLoadModule('/lib/dcfMutation.ts');
    const { buildActivityClonePayload, buildSubprojectClonePayload } = await server.ssrLoadModule('/lib/recordCloning.ts');
    const actor = { id: 7, password: 'fixture-only', fullName: 'Fixture actor', role: 'Super Admin' };
    const actuals = { obligations: [{ id: 41, date: '2025-03-04', amount: -20 }], disbursements: [{ id: 42, date: '2025-04-06', amount: 9 }], actualObligationAmount: -20, actualDisbursementAmount: 9 };
    const activity = { id: 11, uid: 'ACT-11', type: 'Training', name: 'Saved training', status: 'Proposed', workflow_status: 'APPROVED', operatingUnit: 'NPMO',
        updated_at: 'base', history: [], expenses: [{ id: 21, amount: 100, ...actuals }] };
    const draftActivity = { ...structuredClone(activity), history: [{ date: 'client', event: 'Updated' }], expenses: [{ ...activity.expenses[0], amount: 200, obligations: [] }] };
    fixture.records.activities = [{ ...structuredClone(activity), activity_title: 'Concurrent title', expenses: [{ ...activity.expenses[0], disbursements: [...actuals.disbursements, { id: 43, date: '2025-06-01', amount: 3 }] }] }];
    const request = {};
    const savedActivity = await persistActivityDraft(activity, draftActivity, 'expenses', actor, { request, reason: 'Allowed override', source: 'activity-edit-expenses' });
    assert.equal(savedActivity.activity_title, 'Concurrent title');
    assert.equal(savedActivity.expenses[0].amount, 200);
    assert.deepEqual(savedActivity.expenses[0].obligations, actuals.obligations);
    assert.equal(savedActivity.expenses[0].disbursements.length, 2);
    const expenseCall = fixture.calls.at(-1).payload;
    assert.deepEqual(Object.keys(expenseCall.p_changes), ['expenses']);
    assert.equal(expenseCall.p_reason, 'Allowed override');
    assert.equal(expenseCall.p_source, 'activity-edit-expenses');
    assert.equal(expenseCall.p_actor_id, actor.id);
    assert.ok(request.key);
    assert.deepEqual(expenseCall.p_financial, []);
    fixture.records.activities[0].status = 'Ongoing';
    await assert.rejects(() => persistActivityDraft(activity, draftActivity, 'expenses', actor), /changed while/);
    fixture.records.activities[0] = { ...activity, expenses: [{ ...activity.expenses[0], amount: 333 }] };
    await assert.rejects(() => persistActivityDraft(activity, draftActivity, 'expenses', actor), /changed while/);
    const countBeforeDenied = fixture.calls.length;
    await assert.rejects(() => persistActivityDraft(activity, draftActivity, 'expenses'), /signed-in user/);
    assert.equal(fixture.calls.length, countBeforeDenied);

    const subproject = { id: 12, uid: 'SP-12', name: 'Saved subproject', description: 'Original', status: 'Proposed', workflow_status: 'APPROVED',
        updated_at: 'base', actualCompletionDate: null, history: [], details: [{ id: 22, numberOfUnits: 1, pricePerUnit: 50, ...actuals }] };
    fixture.records.subprojects = [{ ...structuredClone(subproject), remarks: 'Concurrent remarks' }];
    const draftSubproject = { ...structuredClone(subproject), description: 'Changed', updated_at: 'client', history: [{ event: 'Updated' }] };
    const savedSubproject = await persistSubprojectDraft(subproject, draftSubproject, 'full', undefined, actor,
        { request: {}, source: 'subproject-edit', reason: 'Saved reason' });
    assert.equal(savedSubproject.description, 'Changed');
    assert.equal(savedSubproject.remarks, 'Concurrent remarks');
    assert.deepEqual(savedSubproject.details, subproject.details);
    assert.deepEqual(fixture.calls.at(-1).payload.p_changes, { description: 'Changed' });
    fixture.records.subprojects[0] = { ...structuredClone(subproject), description: 'Other edit' };
    await assert.rejects(() => persistSubprojectDraft(subproject, draftSubproject, 'full', undefined, actor), /changed while/);
    await assert.rejects(() => persistSubprojectDraft(subproject, draftSubproject, 'full'), /signed-in user/);
    fixture.records.subprojects[0] = { ...structuredClone(subproject), status: 'Ongoing' };
    await assert.rejects(() => persistSubprojectDraft(subproject, draftSubproject, 'budget', 'Proposed', actor), /changed while/);
    fixture.records.subprojects[0] = structuredClone(subproject);
    fixture.fail = true;
    await assert.rejects(() => persistSubprojectDraft(subproject, draftSubproject, 'full', undefined, actor), /rejected save/);
    assert.equal(fixture.records.subprojects[0].description, 'Original');
    assert.equal(draftSubproject.description, 'Changed');
    fixture.fail = false;

    const context = { createdAt: '2026-11-03T00:00:00Z', encodedBy: actor.fullName, requiresApprover: true };
    for (const [entityType, source, build, childKey] of [['activities', activity, buildActivityClonePayload, 'expenses'], ['subprojects', subproject, buildSubprojectClonePayload, 'details']]) {
        const before = structuredClone(source);
        const clone = build({ ...source, budgetItemTransferId: 'protected', isTransferTargetExcluded: true }, context);
        const changes = dcfChangedFields({}, clone);
        assert.equal(changes.id, undefined);
        assert.equal(changes.history, undefined);
        assert.equal(changes.updated_at, undefined);
        assert.equal(changes.created_at, undefined);
        assert.equal(changes.budgetItemTransferId, undefined);
        assert.equal(changes.isTransferTargetExcluded, undefined);
        assert.equal(changes.workflow_status, 'PENDING');
        assert.notEqual(changes.uid, source.uid);
        assert.notEqual(changes[childKey][0].id, source[childKey][0].id);
        assert.deepEqual(changes[childKey][0].obligations, []);
        assert.deepEqual(changes[childKey][0].disbursements, []);
        const retry = {};
        fixture.loseResponse = true;
        await assert.rejects(() => persistDcfMutation({ entityType, changes, actor, request: retry, source: entityType + '-clone' }), /transport loss/);
        const key = retry.key;
        const confirmed = await persistDcfMutation({ entityType, changes, actor, request: retry, source: entityType + '-clone' });
        assert.equal(retry.key, key);
        assert.equal(confirmed.record.uid, clone.uid);
        assert.equal(fixture.records[entityType].filter(row => row.uid === clone.uid).length, 1);
        assert.deepEqual(source, before);
    }

    const attempt = { payload: { ...dcfChangedFields({}, activity), uid: 'ACT-repeat-stable', expenses: [] }, uncertain: false };
    const missingActor = { ...attempt, payload: { ...attempt.payload, uid: 'ACT-denied' } };
    await assert.rejects(() => persistRepeatingActivity(missingActor), /signed-in user/);
    assert.equal(missingActor.uncertain, false);
    fixture.loseResponse = true;
    await assert.rejects(() => persistRepeatingActivity(attempt, actor), /transport loss/);
    assert.equal(attempt.uncertain, true);
    const callsAfterUncertain = fixture.calls.length;
    const recovered = await persistRepeatingActivity(attempt, actor);
    assert.equal(recovered.uid, attempt.payload.uid);
    assert.equal(attempt.uncertain, false);
    assert.equal(fixture.calls.length, callsAfterUncertain + 1);
    assert.equal(fixture.calls.at(-1).action, 'read');
    await persistRepeatingActivity(attempt, actor);
    assert.equal(fixture.calls.length, callsAfterUncertain + 1);
    const unavailable = { payload: { ...attempt.payload, uid: 'ACT-missing' }, uncertain: true };
    await assert.rejects(() => persistRepeatingActivity(unavailable, actor), /not confirmed/);
    assert.equal(unavailable.uncertain, true);

    for (const file of ['ActivityDetail', 'SubprojectDetail', 'ActivityEdit', 'SubprojectEdit', 'Activities', 'Subprojects']) {
        const source = await readFile(new URL('../components/' + file + '.tsx', import.meta.url), 'utf8');
        const tree = ts.createSourceFile(file + '.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
        const calls = [];
        const visit = node => { if (ts.isCallExpression(node)) calls.push(node.getText(tree)); ts.forEachChild(node, visit); };
        visit(tree);
        assert.equal(calls.some(call => /supabase\s*\.\s*from\(['"](?:activities|subprojects|trash_bin)['"]\)[\s\S]*?\.(?:insert|update|delete)\(/.test(call)), false, file + ' must not write parent/archive tables directly');
        if (file.endsWith('Detail')) {
            assert.equal((source.match(/<DcfRevisionHistory\b/g) || []).length, 1);
            assert.doesNotMatch(source, /<RecordPanel[^>]*title="History"/);
            assert.match(source, /onRevisionRestored\(record, confirmedFinancial\)/);
        }
    }
    console.log('DCF Activity/Subproject integration checks passed: scoped mutations, field diffs, actual preservation, stale/denied/failed saves, clean clones, stable retries, uncertain repeating recovery, shared History contracts.');
} finally {
    delete globalThis.dcfActivitySubprojectFixture;
    await server.close();
}
