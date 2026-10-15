import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { tmpdir } from 'node:os';

const require = createRequire(path.join(process.env.PGLITE_RUNTIME || path.join(tmpdir(), '4kis-supplement-sql-runtime'), 'package.json'));
const { PGlite } = require('@electric-sql/pglite');
const db = new PGlite();
const migrationPath = 'supabase/migrations/202610150002_activity_accomplishment_persistence.sql';
const planned = id => ({ id, objectType: 'MOOE', expenseParticular: 'Travel', uacsCode: '502', amount: 25000, obligationMonth: '2026-10-01', disbursementMonth: '2026-11-01' });
try {
    // Reuse the established isolated schema, never a connected Supabase client.
    const fixture = await readFile('scripts/run-activity-supplement-sql-check.mjs', 'utf8');
    const start = fixture.indexOf('await db.exec(`') + 'await db.exec(`'.length;
    const end = fixture.indexOf('`);', start);
    assert.ok(start > 15 && end > start, 'Isolated base schema must remain available');
    await db.exec(fixture.slice(start, end));
    await db.exec(`create role service_role;
      alter table activities add column physical_accomplishment_submitted_at timestamptz;
      alter table financial_disbursements add column created_at timestamptz default now();
      insert into roles_config(role,module,can_view,can_edit,visibility_scope) values
      ('User','Accomplishment - Financial',true,true,'Own OU'),('User','Accomplishment - Physical',true,true,'Own OU');`);
    for (const file of ['202610090001_activity_subproject_budget_item_transfers.sql', '202610120001_activity_transfer_status_allowlist.sql', '202610140001_activity_supplemental_budgets.sql']) {
        await db.exec(await readFile(`supabase/migrations/${file}`, 'utf8'));
    }
    const parent = async id => (await db.query('select to_jsonb(a) as row from activities a where id=$1', [id])).rows[0].row;
    const insert = async (expenses = [planned(10)], type = 'Activity') => (await db.query(`insert into activities(name,type,status,"operatingUnit",expenses,"actualParticipantsMale","actualDate") values('Fixture',$1,'Ongoing','RFO I',$2,29,'2026-09-09') returning id`, [type, JSON.stringify(expenses)])).rows[0].id;
    const central = async (id, item, amount = 17340) => (await db.query(`insert into financial_disbursements(entity_type,parent_id,item_id,amount,disbursement_date,remarks) values('activity_expense',$1,$2,$3,'2026-09-17','Original remarks') returning id`, [id, String(item), amount])).rows[0].id;
    const read = async (id, actor = 1, surface = 'activity', password = 'fixture-password') => (await db.query('select read_activity_accomplishments($1,$2,$3,$4) as data', [actor, password, [id], surface])).rows[0].data[0];
    const save = async (base, edits, { actor = 1, physical = {}, key = crypto.randomUUID(), reason = 'Authorized correction', surface = 'activity' } = {}) => (await db.query('select save_activity_accomplishment($1,$2,$3,$4,$5,$6,$7,$8,$9) as data', [actor, 'fixture-password', base.activity.id, surface, JSON.stringify(base), JSON.stringify(edits), JSON.stringify(physical), reason, key])).rows[0].data;
    const update = (snapshot, entry, amount, stage = 'disbursement', item = 10) => [{ itemId: String(item), stage, operations: [{ action: 'update', id: String(entry.id), value: { ...entry, amount } }] }];
    const entry = snapshot => snapshot.stages['10'].disbursement.entries[0];
    const legacyId = await insert([{ ...planned(10), actualDisbursementAmount: 17340, actualDisbursementDate: '2026-09-17' }]);
    const beforeInstall = await parent(legacyId);
    const preexistingParent = await insert();
    await central(preexistingParent, 10, 600);
    const beforeFinancialInstall = (await db.query('select * from financial_disbursements order by id')).rows;
    await db.exec(await readFile(migrationPath, 'utf8'));
    await db.exec(await readFile(migrationPath, 'utf8'));
    assert.deepEqual(await parent(legacyId), beforeInstall, 'Migration cannot rewrite business records');
    assert.deepEqual((await db.query('select * from financial_disbursements order by id')).rows, beforeFinancialInstall);
    const legacy = await read(legacyId);
    assert.equal(legacy.stages['10'].disbursement.source, 'legacy');
    const correctedLegacy = await save(legacy, update(legacy, entry(legacy), 18000));
    const stableLegacyId = entry(correctedLegacy).id;
    assert.equal(entry(correctedLegacy).amount, 18000);
    assert.equal(entry(correctedLegacy).date, '2026-09-17');
    assert.equal((await save(correctedLegacy, update(correctedLegacy, entry(correctedLegacy), 19000))).stages['10'].disbursement.entries[0].id, stableLegacyId);

    const id = await insert([{ ...planned(10), disbursements: [{ id: 999999, amount: 17340, date: '2026-09-17' }] }, planned(11)], 'Training');
    const first = await central(id, 10), duplicate = await central(id, 10), otherItem = await central(id, 11, 900);
    await db.query(`insert into financial_obligations(entity_type,parent_id,item_id,amount,obligation_date,remarks) values('activity_expense',$1,'10',20000,'2026-09-10','Do not change')`, [id]);
    const untouched = (await db.query('select * from financial_obligations where parent_id=$1', [id])).rows;
    const baseline = await read(id), originalParent = await parent(id);
    const firstBefore = (await db.query('select * from financial_disbursements where id=$1', [first])).rows[0];
    assert.notEqual(entry(baseline).id, '999999');
    const key = crypto.randomUUID(), edits = update(baseline, entry(baseline), 18000);
    const corrected = await save(baseline, edits, { key });
    assert.deepEqual(await save(baseline, edits, { key }), corrected, 'Identical request retry returns the confirmed result');
    await assert.rejects(() => save(baseline, update(baseline, entry(baseline), 18001), { key }), /different draft/);
    assert.deepEqual(corrected.stages['10'].disbursement.entries.map(e => e.id), [String(first), String(duplicate)]);
    assert.equal(corrected.activity.expenses[0].actualDisbursementAmount, 35340);
    assert.deepEqual((await db.query('select * from financial_disbursements where id=$1', [first])).rows[0], { ...firstBefore, amount: '18000' });
    assert.equal(corrected.activity.status, originalParent.status);
    for (const field of ['actualParticipantsMale', 'actualDate', 'physical_accomplishment_submitted_at', 'fundingYear', 'fundType', 'original_budget_snapshot']) assert.deepEqual(corrected.activity[field], originalParent[field], field);
    assert.deepEqual((await db.query('select * from financial_obligations where parent_id=$1', [id])).rows, untouched);
    assert.equal((await db.query('select amount from financial_disbursements where id=$1', [otherItem])).rows[0].amount, '900');
    assert.ok((await db.query('select created_at from financial_disbursements where id=$1', [first])).rows[0].created_at);

    await assert.rejects(() => save(baseline, update(baseline, entry(baseline), 17000)), /changed or was removed/);
    // Disjoint changes are merged from the current ledger, not stale parent arrays.
    const disjoint = await save(baseline, update(baseline, baseline.stages['10'].disbursement.entries[1], 20000));
    assert.deepEqual(disjoint.stages['10'].disbursement.entries.map(e => e.amount), [18000, 20000]);
    const snapshotBeforeFailure = await read(id);
    await db.exec(`create function reject_fixture_actual_update() returns trigger language plpgsql as $$begin raise exception 'Fixture forced parent failure'; end$$;
      create trigger reject_fixture_actual_update before update on activities for each row execute function reject_fixture_actual_update();`);
    await assert.rejects(() => save(snapshotBeforeFailure, update(snapshotBeforeFailure, entry(snapshotBeforeFailure), 42)), /forced parent failure/);
    await db.exec('drop trigger reject_fixture_actual_update on activities');
    assert.deepEqual(await read(id), snapshotBeforeFailure, 'Parent failure must roll back all financial writes');

    const adding = [{ itemId: '10', stage: 'disbursement', operations: [{ action: 'insert', id: 'local-new', value: { date: '2026-10-01', amount: 400, remarks: 'New' } }] }];
    const addKey = crypto.randomUUID();
    const added = await save(snapshotBeforeFailure, adding, { key: addKey });
    await save(snapshotBeforeFailure, adding, { key: addKey });
    assert.equal(added.stages['10'].disbursement.entries.length, 3);
    assert.equal((await read(id)).stages['10'].disbursement.entries.length, 3);
    const missing = [{ itemId: '10', stage: 'disbursement', operations: [{ action: 'delete', id: String(first) }] }];
    await assert.rejects(() => save(added, missing), /explicit removal/);
    const forged = update(added, { id: String(otherItem), date: '2026-09-17', amount: 900 }, 5);
    await assert.rejects(() => save(added, forged), /not in the baseline/);
    const clearId = await insert([{ ...planned(10), actualDisbursementAmount: 500, actualDisbursementDate: '2026-09-17' }]);
    await central(clearId, 10, 500);
    const clear = await read(clearId);
    const emptied = await save(clear, [{ itemId: '10', stage: 'disbursement', operations: [{ action: 'delete', id: entry(clear).id, explicit: true }] }]);
    assert.deepEqual(emptied.stages['10'].disbursement, { source: 'central', entries: [] });
    assert.deepEqual((await read(clearId)).stages['10'].disbursement.entries, []);
    await db.query(`update activities set expenses=jsonb_set(jsonb_set(expenses,'{0,actualDisbursementAmount}','500'),' {0,actualDisbursementDate}','"2026-09-17"') where id=$1`, [clearId]);
    assert.deepEqual((await read(clearId)).stages['10'].disbursement.entries, [], 'A stale parent summary cannot resurrect a managed-empty ledger');

    await assert.rejects(() => read(id, 1, 'activity', 'wrong'), /session could not/);
    const outside = await insert();
    await db.query(`update activities set "operatingUnit"='NPMO' where id=$1`, [outside]);
    await assert.rejects(() => read(outside, 3), /OU scope/);
    const userSnapshot = await read(id, 3, 'financial');
    await save(userSnapshot, update(userSnapshot, entry(userSnapshot), 18005), { actor: 3, surface: 'financial', reason: '' });
    const current = await read(id);
    await assert.rejects(() => save(current, adding, { actor: 3, surface: 'financial', reason: '', physical: { actualParticipantsMale: 99 } }), /Financial ACF cannot/);
    await assert.rejects(() => save(current, [], { actor: 4, physical: { actualParticipantsMale: 1 } }), /Guest/);
    await assert.rejects(() => save(current, [], { physical: { status: 'Completed' } }), /Only explicit physical/);
    await assert.rejects(() => save(current, update(current, entry(current), 100), { reason: '' }), /override reason/);
    const pastMonth = [{ itemId: '10', stage: 'disbursement', operations: [{ action: 'insert', id: 'past-month', value: { date: '2020-01-01', amount: 100 } }] }];
    await assert.rejects(() => save(current, pastMonth, { actor: 3, surface: 'financial', reason: '' }), /current accomplishment month/);
    await db.query(`update roles_config set can_edit=false where role='User' and module='Accomplishment - Financial'`);
    await assert.rejects(() => save(current, update(current, entry(current), 18006), { actor: 3, reason: '' }), /edit permission/);
    await db.query(`update roles_config set can_edit=true where role='User' and module='Accomplishment - Financial'`);
    await db.query(`update activities set status='Completed' where id=$1`, [id]);
    const completed = await read(id);
    await assert.rejects(() => save(completed, update(completed, entry(completed), 18006), { actor: 3, reason: '' }), /locked for this role and status/);
    const correctedCompleted = await save(completed, update(completed, entry(completed), 18006));
    assert.equal(correctedCompleted.activity.status, 'Completed');
    const obligations = [{ itemId: '10', stage: 'obligation', operations: [{ action: 'insert', id: 'signed-adjustment', value: { date: '2026-10-01', amount: -100, remarks: 'Authorized reversal' } }] }];
    const signed = await save(correctedCompleted, obligations);
    assert.equal(signed.stages['10'].obligation.entries.length, 2);
    assert.equal(signed.activity.expenses[0].actualObligationAmount, 19900);
    assert.equal(signed.activity.expenses[0].disbursements.length, correctedCompleted.activity.expenses[0].disbursements.length);

    const movedSource = await insert(); await central(movedSource, 10, 100);
    const beforeMove = await read(movedSource);
    const counts = Object.fromEntries(['actualParticipantsMale','actualParticipantsFemale','actualPWD','actualMuslim','actualLGBTQ','actualSoloParent','actualSenior','actualYouth'].map(field => [field, beforeMove.activity[field] ?? null]));
    const zeros = Object.fromEntries(Object.keys(counts).map(field => [field, counts[field] == null ? null : 0]));
    const transferred = (await db.query('select submit_budget_item_transfer($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as data', [1, 'fixture-password', 'activity', movedSource, ['10'], JSON.stringify({ name: 'Transferred fixture', status: 'Ongoing' }), JSON.stringify(zeros), JSON.stringify(counts), 'Fixture transfer', crypto.randomUUID()])).rows[0].data;
    await assert.rejects(() => save(beforeMove, update(beforeMove, entry(beforeMove), 101)), /removed, cancelled or superseded/);
    const transferredBase = await read(transferred.destination.id);
    const transferredSaved = await save(transferredBase, update(transferredBase, entry(transferredBase), 105));
    assert.equal(entry(transferredSaved).id, entry(transferredBase).id);
    assert.equal(transferredSaved.activity.isTransferTargetExcluded, true);

    const supplementParent = await insert();
    const supplementUid = crypto.randomUUID();
    const supplement = (await db.query('select save_activity_supplement($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) as data', [1, 'fixture-password', supplementParent, supplementUid, 'submit', 'Savings', 'Fixture letter', '2026-10-15', 'Fixture authorized supplement', JSON.stringify([planned(20)]), 0, (await parent(supplementParent)).updated_at, true, crypto.randomUUID()])).rows[0].data;
    assert.equal(supplement.supplements[0].status, 'APPROVED');
    const supplementBase = await read(supplementParent);
    const supplementalActual = await save(supplementBase, [{ itemId: '20', stage: 'disbursement', operations: [{ action: 'insert', id: 'supplement-actual', value: { date: '2026-10-01', amount: 200 } }] }]);
    assert.equal(supplementalActual.stages['20'].disbursement.entries[0].amount, 200);

    const plannedParent = (await db.query(`insert into activities(name,status,"operatingUnit",expenses) values('Planned fixture','Proposed','RFO I',$1) returning id`, [JSON.stringify([planned(10)])])).rows[0].id;
    const plannedBase = await read(plannedParent);
    const plannedSaved = (await db.query('select save_activity_accomplishment($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as data', [1, 'fixture-password', plannedParent, 'financial', JSON.stringify(plannedBase), '[]', '{}', 'Authorized target change', crypto.randomUUID(), JSON.stringify([{ itemId: '10', values: { amount: 26000 } }])])).rows[0].data;
    assert.equal(plannedSaved.activity.expenses[0].amount, 26000);
    assert.deepEqual(plannedSaved.stages['10'], plannedBase.stages['10']);
    // Frozen original budget protections remain active even after reverting status.
    await db.query(`update activities set status='Ongoing' where id=$1`, [plannedParent]);
    const running = await read(plannedParent);
    await assert.rejects(() => db.query('select save_activity_accomplishment($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [1, 'fixture-password', plannedParent, 'financial', JSON.stringify(running), '[]', '{}', 'Authorized target change', crypto.randomUUID(), JSON.stringify([{ itemId: '10', values: { amount: 12 } }])]), /Proposed budget flow/);
    const noBudgetId = (await db.query(`insert into activities(name,status,"operatingUnit",expenses) values('No budget legacy','Proposed','RFO I',null) returning id`)).rows[0].id;
    const noBudget = await read(noBudgetId);
    const physical = await save(noBudget, [], { physical: { actualParticipantsMale: 2 } });
    assert.equal(physical.activity.expenses, null);
    assert.equal(physical.activity.physical_accomplishment_submitted_at, null);
    await db.exec(`create or replace function auth.uid() returns uuid language sql as $$select '11111111-1111-4111-8111-111111111111'::uuid$$;
      update users set auth_id='11111111-1111-4111-8111-111111111111' where id=1;`);
    await read(id, 1, 'activity', 'not-used-with-matching-auth');
    await assert.rejects(() => read(id, 3), /session does not match/);
    await db.exec(`create or replace function auth.uid() returns uuid language sql as $$select null::uuid$$;`);
    assert.ok((await db.query('select count(*)::int as n from activity_accomplishment_revisions')).rows[0].n >= 7);
    await db.exec('set role anon');
    await assert.rejects(() => db.query('select * from activity_accomplishment_revisions'), /permission denied/);
    await assert.rejects(() => db.query('select activity_financial_stage($1,$2,$3)', [JSON.stringify(current.activity), '10', 'disbursement']), /permission denied/);
    await db.exec('reset role');
    console.log('PASS: isolated Activity/Training financial persistence: additive install, legacy and mismatched IDs, stable updates, duplicates, disjoint/conflicting edits, rollback, retries, explicit removals, scope and audit protection.');
} catch (error) {
    console.error({ message: error.message, code: error.code, detail: error.detail, where: error.where, stack: error.stack?.split('\n').slice(0, 6).join('\n') });
    process.exitCode = 1;
} finally { await db.close(); }
