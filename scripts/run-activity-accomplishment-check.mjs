import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { createActivityAccomplishmentFixture, runActivityAccomplishmentRpc } from './helpers/activity-accomplishment-fixture.mjs';

const db = await createActivityAccomplishmentFixture();
const server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, entries: [] }, plugins: [{
    name: 'isolated-activity-actuals', enforce: 'pre',
    resolveId(id) { if (id.endsWith('supabaseClient')) return '\0isolated-actuals-client'; },
    load(id) { if (id === '\0isolated-actuals-client') return `export const supabase = { rpc: (...args) => globalThis.activityActualRpc(...args) };`; },
}] });
const actor = { id: 1, password: 'fixture-password' };
const calls = [];
globalThis.activityActualRpc = async (name, args) => {
    calls.push({ name, args });
    try { return { data: await runActivityAccomplishmentRpc(db, name, args), error: null }; }
    catch (error) { return { data: null, error: { message: error.message } }; }
};
try {
    const lib = await server.ssrLoadModule('/lib/activityAccomplishmentPersistence.ts');
    const finance = await server.ssrLoadModule('/lib/financialAggregation.ts');
    const actuals = await server.ssrLoadModule('/lib/financialActualSummary.ts');
    const expense = { id: 10, expenseParticular: 'Travel', objectType: 'MOOE', uacsCode: '502', amount: 25000, obligationMonth: '2026-01-01', disbursementMonth: '2026-02-01', actualDisbursementAmount: 17340, actualDisbursementDate: '2026-09-17' };
    const id = (await db.query(`insert into activities(name,status,type,"operatingUnit","fundingYear","fundType",tier,expenses) values('Fixture','Ongoing','Training','RFO I',2026,'Current','Tier 1',$1) returning id`, [JSON.stringify([expense])])).rows[0].id;
    const [base] = await lib.readActivityAccomplishments([id], actor);
    const draft = lib.hydrateActivityAccomplishment(base);
    assert.equal(draft.expenses[0].disbursements[0].amount, 17340);
    const reordered = Object.fromEntries(Object.entries(draft).reverse());
    assert.ok(lib.sameActivityActualValue(draft, reordered));
    assert.deepEqual(lib.buildActivityActualEdits(base, reordered), []);
    draft.expenses[0].disbursements[0].amount = 18000;
    draft.expenses[0].disbursements[0].date = '2026-09-01'; // Month picker must retain encoded day.
    const request = {};
    const saved = await lib.saveActivityAccomplishment({ base, draft, actor, request, reason: 'Authorized correction' });
    assert.equal(saved.stages['10'].disbursement.entries[0].date, '2026-09-17');
    const firstKey = request.key;
    assert.deepEqual(await lib.saveActivityAccomplishment({ base, draft, actor, request, reason: 'Second prompt on retry' }), saved);
    assert.equal(request.key, firstKey);
    const reopened = lib.hydrateActivityAccomplishment((await lib.readActivityAccomplishments([id], actor, 'financial'))[0]);
    const stableId = reopened.expenses[0].disbursements[0].id;
    reopened.expenses[0].disbursements[0].amount = 19000;
    const next = await lib.saveActivityAccomplishment({ base: saved, draft: reopened, actor, request: {}, reason: 'Authorized correction', surface: 'financial', onlyItem: '10', onlyStage: 'disbursement' });
    assert.equal(lib.hydrateActivityAccomplishment(next).expenses[0].disbursements[0].id, stableId);
    assert.equal(actuals.getActualDisbursementSummary(next.activity.expenses[0]).amount, 19000);
    assert.equal(finance.getActualDisbursementsByMonth(next.activity.expenses[0], { year: '2026' })[8], 19000);
    assert.deepEqual(next.activity.expenses[0].obligations, undefined);
    const missing = lib.hydrateActivityAccomplishment(next);
    missing.expenses[0].disbursements = [];
    assert.throws(() => lib.buildActivityActualEdits(next, missing), /without an explicit removal/);
    const remove = lib.buildActivityActualEdits(next, missing, { '10:disbursement': [String(stableId)] });
    assert.equal(remove[0].operations[0].explicit, true);
    const centralId = (await db.query(`insert into financial_disbursements(entity_type,parent_id,item_id,amount,disbursement_date) values('activity_expense',$1,'10',19000,'2026-09-17') returning id`, [id])).rows[0].id;
    const [duplicateBase] = await lib.readActivityAccomplishments([id], actor);
    const duplicateDraft = lib.hydrateActivityAccomplishment(duplicateBase);
    duplicateDraft.expenses[0].disbursements[0].amount = 19500;
    const duplicates = await lib.saveActivityAccomplishment({ base: duplicateBase, draft: duplicateDraft, actor, request: {}, reason: 'Authorized correction' });
    assert.equal(duplicates.stages['10'].disbursement.entries.length, 2);
    assert.equal(duplicates.stages['10'].disbursement.entries[1].id, String(centralId));
    const failedDraft = lib.hydrateActivityAccomplishment(duplicates);
    failedDraft.expenses[0].disbursements[0].amount = 20000;
    await db.query('update financial_disbursements set amount=21000 where id=$1', [stableId]);
    await assert.rejects(() => lib.saveActivityAccomplishment({ base: duplicates, draft: failedDraft, actor, request: {}, reason: 'Authorized correction' }), /changed or was removed/);
    assert.equal(failedDraft.expenses[0].disbursements[0].amount, 20000, 'Failed save retains caller draft');
    const [retryBase] = await lib.readActivityAccomplishments([id], actor);
    const retryDraft = lib.hydrateActivityAccomplishment(retryBase);
    retryDraft.expenses[0].disbursements.push({ id: 'local-retry', date: '2026-10-01', amount: 100, remarks: 'New actual' });
    const transport = globalThis.activityActualRpc;
    let loseResponse = true;
    globalThis.activityActualRpc = async (...args) => {
        const result = await transport(...args);
        if (loseResponse && args[0] === 'save_activity_accomplishment' && !result.error) { loseResponse = false; return { data: null, error: { message: 'Fixture response lost after commit' } }; }
        return result;
    };
    const retryRequest = {};
    await assert.rejects(() => lib.saveActivityAccomplishment({ base: retryBase, draft: retryDraft, actor, request: retryRequest, reason: 'Initial override' }), /response lost/);
    const beforeRetry = (await db.query('select count(*)::int as n from financial_disbursements where parent_id=$1', [id])).rows[0].n;
    await lib.saveActivityAccomplishment({ base: retryBase, draft: retryDraft, actor, request: retryRequest, reason: 'New prompt on retry' });
    assert.equal((await db.query('select count(*)::int as n from financial_disbursements where parent_id=$1', [id])).rows[0].n, beforeRetry);
    globalThis.activityActualRpc = async () => ({ data: [], error: null });
    await assert.rejects(() => lib.readActivityAccomplishments([id], actor), /incomplete/);
    globalThis.activityActualRpc = transport;
    for (const bad of [null, { activity: { id, expenses: [{}] }, stages: {} }]) assert.throws(() => lib.validateActivityAccomplishmentSnapshot(bad));
    assert.ok(calls.every(call => !('from' in call)));
    console.log('PASS: real persistence helper + isolated SQL roundtrip, canonical baselines, legacy edits, stable IDs, exact date preservation, safe retry/removal/conflict, details and monthly report totals.');
} finally { await server.close(); await db.close(); delete globalThis.activityActualRpc; }
