import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSubprojectAccomplishmentFixture, runSubprojectAccomplishmentRpc } from './helpers/subproject-accomplishment-fixture.mjs';
import { runActivityAccomplishmentRpc } from './helpers/activity-accomplishment-fixture.mjs';

const db = await createSubprojectAccomplishmentFixture();
const migration = await readFile('supabase/migrations/202610300001_independent_budget_target_schedules.sql', 'utf8');
const legacy = { id: 10, objectType: 'MOOE', expenseParticular: 'Travel', uacsCode: '502', amount: 100,
    particulars: 'Item', numberOfUnits: 2, pricePerUnit: 50, deliveryDate: '2026-10-01', obligationMonth: '2026-01-01', disbursementMonth: '2026-02-01' };
const plan = { targetScheduleVersion: 2,
    targetObligationSchedules: [{ id: 'o1', month: '2026-01-01', amount: 40 }, { id: 'o2', month: '2026-03-01', amount: 60 }],
    targetDisbursementSchedules: [{ id: 'd1', month: '2026-02-01', amount: 20 }, { id: 'd2', month: '2026-04-01', amount: 30 }, { id: 'd3', month: '2026-06-01', amount: 50 }] };
const tables = ['activities', 'subprojects', 'financial_obligations', 'financial_disbursements', 'subproject_accomplishments', 'budget_item_adjustment_history', 'budget_item_transfers', 'activity_supplements', 'activity_supplement_revisions', 'activity_supplement_requests', 'activity_financial_entry_state', 'activity_accomplishment_revisions', 'activity_accomplishment_requests', 'subproject_financial_entry_state', 'subproject_accomplishment_revisions', 'subproject_accomplishment_requests'];
const allRows = async () => Object.fromEntries(await Promise.all(tables.map(async table => [table, (await db.query(`select to_jsonb(t) as row from ${table} t order by to_jsonb(t)::text`)).rows])));
const security = async () => (await db.query(`select p.proname,p.prosecdef,p.provolatile,p.proconfig,p.proacl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('save_activity_accomplishment','patch_subproject_accomplishment','save_activity_supplement','activity_expense_plan') order by p.proname`)).rows;
const insert = async (table, lines = [legacy], status = 'Proposed') => (await db.query(`insert into ${table}(name,status,"operatingUnit",${table === 'activities' ? 'expenses' : 'details'}) values('Disposable target fixture',$1,'RFO I',$2) returning id`, [status, JSON.stringify(lines)])).rows[0].id;
const parent = async (table, id) => (await db.query(`select to_jsonb(t) as row from ${table} t where id=$1`, [id])).rows[0].row;
const modern = async enabled => db.query('select set_config($1,$2,false)', ['request.headers', JSON.stringify(enabled ? { 'x-client-info': 'supabase-js-web/2.39.0 4kis-target-plan/2' } : {})]);
const read = async (table, id, surface = 'financial', actor = 1) => (await (table === 'activities' ? runActivityAccomplishmentRpc(db, 'read_activity_accomplishments', { p_actor_id: actor, p_actor_password: 'fixture-password', p_activity_ids: [id], p_surface: surface }) : runSubprojectAccomplishmentRpc(db, 'read_subproject_accomplishments', { p_actor_id: actor, p_actor_password: 'fixture-password', p_subproject_ids: [id], p_surface: surface })))[0];
const save = async (table, base, { targets = [], edits = [], physical = {}, surface = 'financial', actor = 1, key = crypto.randomUUID() } = {}) => {
    const common = { p_actor_id: actor, p_actor_password: 'fixture-password', p_surface: surface, p_base: base, p_edits: edits, p_physical: physical, p_targets: targets, p_reason: 'Authorized fixture correction', p_request_key: key };
    return table === 'activities'
        ? runActivityAccomplishmentRpc(db, 'save_activity_accomplishment', { ...common, p_activity_id: base.activity.id })
        : runSubprojectAccomplishmentRpc(db, 'save_subproject_accomplishment', { ...common, p_subproject_id: base.subproject.id });
};
const submitSupplement = async (id, options = {}) => {
    const current = await parent('activities', id);
    const values = { actor: 1, uid: crypto.randomUUID(), operation: 'submit', source: 'Savings', rows: [{ ...legacy, id: 20 }], revision: 0, key: crypto.randomUUID(), ...options };
    return (await db.query('select save_activity_supplement($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) as data', [values.actor, 'fixture-password', id, values.uid, values.operation, values.source, 'Fixture authorization', '2026-10-01', 'Fixture reason', JSON.stringify(values.rows), values.revision, current.updated_at, false, values.key])).rows[0].data;
};
try {
    const a = await insert('activities'), s = await insert('subprojects');
    await db.query(`insert into financial_disbursements(entity_type,parent_id,item_id,amount,disbursement_date,remarks) values('activity_expense',$1,'10',17.34,'2026-09-17','Historical actual')`, [a]);
    await db.query(`insert into financial_obligations(entity_type,parent_id,item_id,amount,obligation_date,remarks) values('subproject_detail',$1,'10',35,'2026-09-09','Historical actual')`, [s]);
    const supplementParent = await insert('activities', [legacy], 'Ongoing');
    const pending = await submitSupplement(supplementParent, { actor: 2 });
    assert.equal(pending.supplements[0].status, 'PENDING');
    const beforeRows = await allRows(), beforeSecurity = await security();
    const legacyFingerprint = (await db.query('select activity_expense_plan($1) as plan', [JSON.stringify(legacy)])).rows[0].plan;
    await db.exec(migration);
    assert.deepEqual(await allRows(), beforeRows, 'Installation must not change any existing business, actual, pending, audit or retry rows');
    assert.deepEqual(await security(), beforeSecurity, 'Existing function security/volatility/search paths/grants must remain identical');
    assert.deepEqual((await db.query('select activity_expense_plan($1) as plan', [JSON.stringify(legacy)])).rows[0].plan, legacyFingerprint);
    assert.equal((await db.query('select budget_target_schedule_capability() as version')).rows[0].version, 2);
    assert.deepEqual((await db.query('select budget_target_plan($1) as plan', [JSON.stringify({ ...legacy, ...plan })])).rows[0].plan, plan);
    assert.deepEqual((await db.query('select budget_target_plan($1) as plan', [JSON.stringify({ targetScheduleVersion: null, targetDisbursementSchedules: null })])).rows[0].plan, {});
    for (const invalid of [
        { ...plan, targetScheduleVersion: 3 }, { ...plan, targetScheduleVersion: '2' }, { ...plan, targetDisbursementSchedules: null },
        { ...plan, targetObligationSchedules: [{ id: 'o1', month: '2026-02-30', amount: 20 }] },
        { ...plan, targetObligationSchedules: [{ id: 'o1', month: '2026-02-01', amount: '20' }] },
        { ...plan, targetObligationSchedules: [{ id: 'o1', month: '2026-02-01', amount: -20 }] },
        { ...plan, targetObligationSchedules: [{ id: 'd1', month: '2026-02-01', amount: 20 }] },
        { ...plan, targetObligationSchedules: [{ id: 'o1', month: '2026-02-01', amount: 20, arbitrary: true }] },
        { targetDisbursementSchedules: [] },
    ]) await assert.rejects(() => db.query('select budget_target_plan($1)', [JSON.stringify(invalid)]));

    for (const [table, id] of [['activities', a], ['subprojects', s]]) {
        const field = table === 'activities' ? 'expenses' : 'details';
        const base = await read(table, id);
        await assert.rejects(() => save(table, base, { targets: [{ itemId: '10', values: plan }] }), /Refresh|refresh/, 'Old clients cannot activate structured targets');
        await modern(true);
        const key = crypto.randomUUID();
        const saved = await save(table, base, { targets: [{ itemId: '10', values: plan }], key });
        const record = saved[table === 'activities' ? 'activity' : 'subproject'];
        assert.equal(record[field][0].amount, 100); assert.deepEqual(record[field][0].targetObligationSchedules, plan.targetObligationSchedules);
        assert.deepEqual(record[field][0].targetDisbursementSchedules, plan.targetDisbursementSchedules);
        assert.deepEqual(saved.stages, base.stages, 'Target edits preserve every existing actual stage');
        assert.deepEqual(await save(table, base, { targets: [{ itemId: '10', values: plan }], key }), saved, 'Retry remains idempotent');
        const before = await parent(table, id);
        await assert.rejects(() => save(table, saved, { targets: [{ itemId: '10', values: { arbitrary: 1 } }] }), /Invalid target field/);
        await modern(false);
        await assert.rejects(() => db.query(`update ${table} set ${field}=$1 where id=$2`, [JSON.stringify([legacy]), id]), /structured target plan|Refresh/);
        await assert.rejects(() => db.query(`update ${table} set ${field}='[]' where id=$1`, [id]), /stale draft/);
        await assert.rejects(() => db.query(`update ${table} set ${field}=$1 where id=$2`, [JSON.stringify([{ ...before[field][0], amount: 999 }]), id]), /client cannot change/);
        await db.query(`update ${table} set name='Unrelated metadata correction' where id=$1`, [id]);
        assert.deepEqual((await parent(table, id))[field], before[field]);
        const current = await read(table, id);
        const stage = table === 'activities' ? 'disbursement' : 'obligation';
        const original = current.stages['10'][stage].entries[0];
        const corrected = await save(table, current, { edits: [{ itemId: '10', stage, operations: [{ action: 'update', id: original.id, value: { ...original, amount: 25 } }] }] });
        assert.equal(corrected.stages['10'][stage].entries[0].id, original.id);
        assert.equal(corrected.stages['10'][stage].entries[0].date, original.date);
        assert.equal(corrected.stages['10'][stage].entries[0].amount, 25);
        assert.deepEqual(corrected[table === 'activities' ? 'activity' : 'subproject'][field][0].targetDisbursementSchedules, plan.targetDisbursementSchedules);
        await modern(true);
        const empty = await save(table, corrected, { targets: [{ itemId: '10', values: { targetDisbursementSchedules: [] } }] });
        assert.deepEqual(empty[table === 'activities' ? 'activity' : 'subproject'][field][0].targetDisbursementSchedules, []);
        assert.deepEqual(empty[table === 'activities' ? 'activity' : 'subproject'][field][0].targetObligationSchedules, plan.targetObligationSchedules);
        await assert.rejects(() => save(table, empty, { actor: 4, targets: [{ itemId: '10', values: plan }] }), /Guest/);
        await assert.rejects(() => save(table, empty, { targets: [{ itemId: '10', values: { targetObligationSchedules: [{ id: 'bad', month: '', amount: 1 }] } }] }), /valid target month/);
        await modern(false);
    }

    // A legacy pending approval remains resolvable after installing the compatibility definitions.
    const approved = await submitSupplement(supplementParent, { uid: pending.supplements[0].uid, operation: 'approve', revision: pending.supplements[0].revision, rows: [] });
    assert.equal(approved.supplements[0].status, 'APPROVED');
    await modern(true);
    const structuredSupplement = await submitSupplement(supplementParent, { rows: [{ ...legacy, ...plan, id: 21, obligationMonth: '', disbursementMonth: '' }] });
    const row = structuredSupplement.activity.expenses.find(item => item.id === 21);
    assert.deepEqual(row.targetObligationSchedules, plan.targetObligationSchedules);
    assert.deepEqual(row.targetDisbursementSchedules, plan.targetDisbursementSchedules);
    const structuredLedger = structuredSupplement.supplements.find(ledger => ledger.uid === row.supplementUid);
    await modern(false);
    await assert.rejects(() => submitSupplement(supplementParent, { uid: structuredLedger.uid, revision: structuredLedger.revision, rows: [{ ...legacy, id: 21 }] }), /client cannot change structured targets/);
    await modern(true);
    await assert.rejects(() => submitSupplement(supplementParent, { uid: structuredLedger.uid, revision: structuredLedger.revision, rows: [{ ...legacy, id: 21 }] }), /stale supplemental draft/);
    const pendingStructured = await submitSupplement(supplementParent, { actor: 2, rows: [{ ...legacy, ...plan, id: 22 }] });
    const pendingStructuredLedger = pendingStructured.supplements.find(ledger => ledger.status === 'PENDING');
    await modern(false);
    const resolvedStructured = await submitSupplement(supplementParent, { uid: pendingStructuredLedger.uid, revision: pendingStructuredLedger.revision, operation: 'approve', rows: [] });
    assert.deepEqual(resolvedStructured.activity.expenses.find(item => item.id === 22).targetDisbursementSchedules, plan.targetDisbursementSchedules);
    await modern(true);
    const structuredParent = await insert('activities', [{ ...legacy, ...plan }], 'Ongoing');
    const frozen = await parent('activities', structuredParent);
    assert.deepEqual(frozen.original_budget_snapshot.expenses[0].targetObligationSchedules, plan.targetObligationSchedules);
    await assert.rejects(() => db.query('update activities set expenses=$1 where id=$2', [JSON.stringify([{ ...legacy, ...plan, targetObligationSchedules: [] }]), structuredParent]), /original budget is locked/);
    const lockedSubproject = await insert('subprojects', [{ ...legacy, ...plan }], 'Ongoing');
    // Subproject DCF policy permits configured administrator budget overrides; do not add Activity's hard freeze here.
    await db.query('update subprojects set details=$1 where id=$2', [JSON.stringify([{ ...legacy, ...plan, targetDisbursementSchedules: [] }]), lockedSubproject]);
    const runningSnapshot = await read('subprojects', lockedSubproject);
    await assert.rejects(() => save('subprojects', runningSnapshot, { targets: [{ itemId: '10', values: plan }] }), /Proposed budget flow/);
    const adjustmentBase = await read('subprojects', lockedSubproject, 'subproject');
    const { amount: allocation, ...physicalLine } = legacy;
    const addition = { ...physicalLine, ...plan, id: -20, type: 'Input', unitOfMeasure: 'pcs', isAdjustmentItem: true, adjustmentType: 'Additional Item', adjustmentFundingSource: 'Savings', adjustmentReason: 'Authorized additional delivery', isSavings: true };
    const adjusted = await save('subprojects', adjustmentBase, { surface: 'subproject', physical: { additions: [addition] } });
    assert.deepEqual(adjusted.subproject.details[0], adjustmentBase.subproject.details[0]);
    assert.deepEqual(adjusted.subproject.details.find(item => item.id === -20).targetDisbursementSchedules, plan.targetDisbursementSchedules);
    assert.equal(adjusted.subproject.details.find(item => item.id === -20).numberOfUnits, 2);
    // Genuine transfers preserve owner and schedule identities, not cloned financial children.
    const transferSource = await insert('subprojects', [{ ...legacy, ...plan }, { ...legacy, id: 11 }], 'Completed');
    const beforeTransfer = await parent('subprojects', transferSource);
    const counts = Object.fromEntries(['actualMaleBeneficiaries','actualFemaleBeneficiaries','actualFourPsBeneficiaries','actualPWD','actualMuslim','actualLGBTQ','actualSoloParent','actualSenior','actualYouth'].map(field => [field, beforeTransfer[field] ?? null]));
    const transferred = (await db.query('select submit_budget_item_transfer($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as data', [1, 'fixture-password', 'subproject', transferSource, ['10'], JSON.stringify({ name: 'Transferred target fixture', status: 'Completed' }), JSON.stringify(counts), JSON.stringify(counts), 'Authorized fixture transfer', crypto.randomUUID()])).rows[0].data;
    assert.deepEqual(transferred.destination.details[0].targetObligationSchedules, plan.targetObligationSchedules);
    assert.deepEqual(transferred.destination.details[0].targetDisbursementSchedules, plan.targetDisbursementSchedules);
    assert.equal(transferred.destination.isTransferTargetExcluded, true);
    assert.deepEqual((await parent('subprojects', transferSource)).details.map(item => item.id), [11]);
    const preReinstall = await allRows();
    for (const table of ['activities', 'subprojects']) {
        const field = table === 'activities' ? 'expenses' : 'details';
        const legacyId = await insert(table);
        const staleBase = await read(table, legacyId);
        await db.query(`update ${table} set ${field}=$1 where id=$2`, [JSON.stringify([{ ...legacy, obligationMonth: '2026-05-01' }]), legacyId]);
        const beforeConflict = await allRows();
        await assert.rejects(() => save(table, staleBase, { targets: [{ itemId: '10', values: plan }] }), /legacy target inputs changed/);
        assert.deepEqual(await allRows(), beforeConflict, 'A stale conversion cannot alter plans, actuals, retries or history');
        const structuredId = await insert(table, [{ ...legacy, ...plan }]);
        const baseline = await read(table, structuredId);
        const newObligation = [{ id: 'o-new', month: '2026-07-01', amount: 90 }];
        await save(table, baseline, { targets: [{ itemId: '10', values: { targetObligationSchedules: newObligation } }] });
        const newDisbursement = [{ id: 'd-new', month: '2026-08-01', amount: 80 }];
        const result = await save(table, baseline, { targets: [{ itemId: '10', values: { targetDisbursementSchedules: newDisbursement } }] });
        const line = result[table === 'activities' ? 'activity' : 'subproject'][field][0];
        assert.deepEqual(line.targetObligationSchedules, newObligation); assert.deepEqual(line.targetDisbursementSchedules, newDisbursement);
        assert.equal(line.amount, 100); assert.deepEqual(result.stages, baseline.stages);
    }
    const beforeFinalInstall = await allRows();
    await db.exec(migration);
    assert.deepEqual(await allRows(), beforeFinalInstall, 'Idempotent installation also preserves structured and pending data');
    assert.deepEqual(await security(), beforeSecurity);
    console.log('Independent targets SQL: additive/idempotent installation, legacy fingerprints/pending approval, narrow validation, stage-only RPCs, actual IDs/dates, retries, stale clients and frozen budgets passed in disposable PostgreSQL.');
} catch (error) {
    console.error(error.message, error.detail || '', error.where || '');
    process.exitCode = 1;
} finally { await db.close(); }
