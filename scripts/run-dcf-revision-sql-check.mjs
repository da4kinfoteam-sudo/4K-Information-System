import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createDcfRevisionFixture, domains, fingerprints, securityFingerprint, installDcfRevision,
    insertParent, plannedLine, quote, rows, root, rpc, transaction, mutationMigration, baselineMigrations } from './helpers/dcf-revision-fixture.mjs';
import { runActivityAccomplishmentRpc } from './helpers/activity-accomplishment-fixture.mjs';
import { runSubprojectAccomplishmentRpc } from './helpers/subproject-accomplishment-fixture.mjs';

const foundationOnly = process.argv.includes('--foundation-only');
const baselineOnly = process.argv.includes('--baseline-only');
const results = [];
const test = async (name, action) => {
    try { await action(); results.push({ name, status: 'PASS' }); console.log(`PASS ${name}`); }
    catch (error) { results.push({ name, status: 'FAIL', error: error.message }); console.error(`FAIL ${name}: ${error.message}`); }
};
const identity = (domain, id, actor = 1) => ({ p_actor_id: actor, p_actor_password: 'fixture-password', p_entity_type: domain.table, p_parent_id: id });
const state = (db, domain, id, actor = 1) => rpc(db, 'read_dcf_state', identity(domain, id, actor));
const history = (db, domain, id, actor = 1, extra = {}) => rpc(db, 'list_dcf_revisions', { ...identity(domain, id, actor), ...extra });
// Keep inspecting foundation semantics while separately asserting the exact UI contract.
const metadata = page => page.revisions ?? page.rows;
const versionId = row => row.revisionId ?? row.id;
const snapshot = async (db, domain, id, revision, actor = 1) => {
    const data = await rpc(db, 'read_dcf_revision', { ...identity(domain, id, actor), p_revision_id: revision });
    return data.snapshot ?? data;
};
const latest = async (db, domain, id) => versionId(metadata(await history(db, domain, id))[0]);
const revisions = (db, domain, id) => db.query('select * from dcf_record_revisions where entity_type=$1 and parent_id=$2 order by id', [domain.table, id]).then(r => r.rows);
const parent = (db, domain, id) => db.query(`select * from ${quote(domain.table)} where id=$1`, [id]).then(r => r.rows[0]);
const updateLabel = (db, domain, id, value) => db.query(`update ${quote(domain.table)} set ${quote(domain.label)}=$1 where id=$2`, [value, id]);
const entries = (s, domain, stage = 'obligation') => s.financial.stages[domain.lines ? '10' : '$parent'][stage].entries;

async function rejectsUnchanged(db, action, pattern) {
    const before = await fingerprints(db);
    await assert.rejects(action, pattern);
    assert.deepEqual(await fingerprints(db), before, 'Rejected operation must roll back every business/history/request row');
}
function assertSafe(value, location = '$') {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
        assert.doesNotMatch(key, /^(password|actor_password|p_actor_password|access_token|refresh_token|encrypted_refresh_token|history|source_snapshot|response|request_hash|preview_url|web_content_link)$/i, `${location}.${key} leaked`);
        assertSafe(child, `${location}.${key}`);
    }
    assert.doesNotMatch(JSON.stringify(value), /fixture-password|PRIVATE IPO PERSON|PRIVATE IPO PHONE/);
}

const db = await createDcfRevisionFixture({ install: false });
try {
    await test('baseline: five real domain scopes, Training, duplicate central identities and seeded policy', async () => {
        for (const domain of domains) {
            assert.ok((await rows(db, domain.table)).length);
            for (const ledger of ['financial_obligations', 'financial_disbursements']) assert.equal((await db.query(`select count(*)::int n from ${ledger} where entity_type=$1`, [domain.ledger])).rows[0].n, 2);
        }
        assert.ok((await rows(db, 'activities')).some(r => r.type === 'Training'));
        const settings = (await rows(db, 'dcf_policy_settings'))[0].settings;
        assert.ok(JSON.stringify(settings).includes('staffing_requirements'));
        assert.equal((await db.query(`select count(*)::int n from information_schema.columns where table_name='staffing_requirements' and column_name like 'actualDisbursement%'`)).rows[0].n, 14);
        console.log(`INFO ${baselineMigrations.length} real setup/migration files loaded; legacy base DDL is source-modeled, not production catalog parity`);
    });
    if (!baselineOnly) {
        const before = await fingerprints(db), security = await securityFingerprint(db);
        await installDcfRevision(db);
        await test('install: ALL preexisting business, child, audit, configuration and retry rows unchanged', async () => {
            assert.deepEqual(await fingerprints(db, Object.keys(before)), before);
            assert.equal((await rows(db, 'dcf_record_revisions')).length, 0, 'Installation must not manufacture baselines');
        });
        await test('install: preexisting table/sequence ACLs, RLS, policies and function security unchanged', async () => {
            const after = await securityFingerprint(db);
            for (const key of Object.keys(security)) {
                const serialize = row => JSON.stringify(key === 'functions' ? [row.proname, row.args] : key === 'tables' ? row.relname : [row.tablename, row.policyname]);
                const old = new Set(security[key].map(serialize));
                assert.deepEqual(after[key].filter(row => old.has(serialize(row))), security[key]);
            }
        });
        await test('install: reapplication is additive and history-free', async () => {
            const before = await fingerprints(db);
            await installDcfRevision(db);
            assert.deepEqual(await fingerprints(db), before);
        });

        for (const domain of domains) {
            const prefix = domain.table;
            await test(`${prefix}: deferred grouping, immutable A->B->C, complete child ledgers and NOOP suppression`, async () => {
                const p = (await rows(db, domain.table))[0], a = await state(db, domain, p.id);
                await transaction(db, async () => {
                    await updateLabel(db, domain, p.id, 'B');
                    await updateLabel(db, domain, p.id, 'B-final');
                    await db.query(`update financial_obligations set amount=21 where entity_type=$1 and parent_id=$2`, [domain.ledger, p.id]);
                    assert.equal((await revisions(db, domain, p.id)).length, 0, 'No intermediate complete history before deferred commit');
                });
                let revs = await revisions(db, domain, p.id);
                assert.equal(revs.length, 2, 'One observed opening baseline plus ONE complete after-state');
                assert.equal(revs[0].kind, 'baseline');
                const { history: _history, updated_at: _updatedAt, ...businessRecord } = a.record;
                assert.deepEqual(revs[0].snapshot.record, businessRecord, 'Snapshot excludes recursive text history and mutable refresh timestamps');
                assert.equal(revs[1].snapshot.record[domain.label], 'B-final');
                assert.equal(revs[1].snapshot.financial.obligations.length, 2);
                assert.ok(revs[1].snapshot.financial.obligations.every(e => Number(e.amount) === 21));
                assert.deepEqual(revs[1].snapshot.financial.disbursements, a.financial.disbursements);
                assert.equal(revs[1].physical_changed, false, 'Financial/metadata edits are not physical encodings');
                const old = structuredClone(revs);
                await updateLabel(db, domain, p.id, 'C');
                revs = await revisions(db, domain, p.id);
                assert.equal(revs.length, 3);
                assert.deepEqual(revs.slice(0, 2), old);
                assert.equal(revs[2].previous_revision_id, revs[1].id);
                await transaction(db, async () => {
                    await updateLabel(db, domain, p.id, 'Temporary');
                    await updateLabel(db, domain, p.id, 'C');
                    await db.query(`update ${quote(domain.table)} set updated_at=clock_timestamp(),history='[{"event":"Churn"}]' where id=$1`, [p.id]);
                });
                assert.deepEqual(await revisions(db, domain, p.id), revs, 'A->temporary->A in one transaction and history/timestamp churn are NOOPs');
                const current = await state(db, domain, p.id);
                assert.equal(entries(current, domain).length, 2, 'Duplicate-looking independently identified actuals remain separate');
                assert.ok(entries(current, domain).every(e => Number(e.amount) !== 777), 'Central stage excludes stale embedded fallback');
                for (const rev of revs) assertSafe(rev.snapshot);
            });
            await test(`${prefix}: child-only update/delete/managed-empty, physical evidence and transaction rollback`, async () => {
                const p = (await rows(db, domain.table))[0];
                let count = (await revisions(db, domain, p.id)).length;
                const original = (await state(db, domain, p.id)).financial.obligations;
                await db.query(`update financial_obligations set remarks='Child-only correction' where id=$1`, [original[0].id]);
                assert.equal((await revisions(db, domain, p.id)).length, ++count);
                await db.query(`delete from financial_obligations where entity_type=$1 and parent_id=$2`, [domain.ledger, p.id]);
                assert.equal((await revisions(db, domain, p.id)).length, ++count);
                const cleared = await state(db, domain, p.id);
                assert.deepEqual(entries(cleared, domain), [], 'Managed-empty must never resurrect stale embedded 777');
                await rejectsUnchanged(db, () => transaction(db, async () => {
                    await updateLabel(db, domain, p.id, 'Must roll back');
                    await db.query(`update financial_disbursements set amount=99 where entity_type=$1 and parent_id=$2`, [domain.ledger, p.id]);
                    throw new Error('Injected after parent and ledger');
                }), /Injected/);
                await db.query(`update ${quote(domain.table)} set "actualDate"='2026-11-03' where id=$1`, [p.id]).catch(async error => {
                    if (domain.type !== 'subproject') throw error;
                    await db.query('update subprojects set "actualCompletionDate"=\'2026-11-03\' where id=$1', [p.id]);
                });
                assert.equal((await revisions(db, domain, p.id)).at(-1).physical_changed, true);
            });
            await test(`${prefix}: source module, current OU, Guest read-only, forged auth, unknown entities and revision IDs`, async () => {
                const p = (await rows(db, domain.table))[0];
                const rid = await latest(db, domain, p.id);
                await state(db, domain, p.id, 3); await history(db, domain, p.id, 4);
                await snapshot(db, domain, p.id, rid, 4);
                await rejectsUnchanged(db, () => state(db, domain, p.id, 5), /scope|OU|permission/i);
                await rejectsUnchanged(db, () => state(db, domain, p.id, 6), /scope|OU|permission/i);
                await rejectsUnchanged(db, () => rpc(db, 'read_dcf_state', { ...identity(domain, p.id), p_actor_password: 'forged' }), /session|sign/i);
                await rejectsUnchanged(db, () => rpc(db, 'read_dcf_state', { ...identity(domain, p.id), p_entity_type: 'users' }), /Unsupported/i);
                await rejectsUnchanged(db, () => snapshot(db, domain, p.id, 999999), /unavailable|version/i);
                await db.query(`update roles_config set can_view=false where role='User' and module=$1`, [domain.module]);
                await rejectsUnchanged(db, () => snapshot(db, domain, p.id, rid, 3), /permission|view/i);
                await db.query(`update roles_config set can_view=true where role='User' and module=$1`, [domain.module]);
                const foreign = await insertParent(db, domain, { operatingUnit: 'RFO II' });
                await rejectsUnchanged(db, () => snapshot(db, domain, foreign.id, rid), /unavailable|version/i);
            });
            await test(`${prefix}: create, final tombstone, no cascading history loss, ID-reuse incarnation isolation`, async () => {
                const p = await insertParent(db, domain);
                assert.equal((await revisions(db, domain, p.id)).length, 1);
                const create = (await revisions(db, domain, p.id))[0];
                assert.equal(create.kind, 'create');
                await db.query(`delete from ${quote(domain.table)} where id=$1`, [p.id]);
                const deleted = await revisions(db, domain, p.id);
                assert.equal(deleted.length, 2);
                assert.equal(deleted[1].kind, 'delete');
                assert.equal(deleted[1].previous_revision_id, create.id);
                assert.deepEqual(deleted[0], create, 'Opening state retained after permitted parent delete');
                await rejectsUnchanged(db, () => snapshot(db, domain, p.id, create.id, 4), /available|permission|deleted/i);
                const recovered = await insertParent(db, domain, { id: p.id, [domain.label]: 'New incarnation' });
                const after = await revisions(db, domain, p.id);
                assert.notEqual(after.at(-1).incarnation, create.incarnation);
                await rejectsUnchanged(db, () => snapshot(db, domain, recovered.id, create.id), /unavailable|version/i);
            });
        }

        await test('all domains: metadata list and one-snapshot RPC match UI validation contract; bounded stable pagination', async () => {
            for (const domain of domains) {
                const p = (await rows(db, domain.table))[0];
                for (let i = 0; i < 11; i++) await updateLabel(db, domain, p.id, `Page ${i}`);
                const first = await history(db, domain, p.id, 1, { p_limit: 10 });
                assert.ok(Array.isArray(first.rows), 'SQL metadata envelope must match the client rows[] adapter');
                assert.ok(first.nextCursor);
                assert.equal(first.rows.length, 10);
                assert.ok(first.total >= 12);
                for (const row of first.rows) {
                    assert.ok(row.id); assert.equal(typeof row.recorded_at, 'string'); assert.equal(typeof row.actor_name, 'string');
                    assert.equal(typeof row.kind, 'string');
                    assert.equal('snapshot' in row, false, 'Metadata list must not ship full versions');
                }
                const next = await history(db, domain, p.id, 1, { p_limit: 10, p_before_revision: first.nextCursor });
                assert.equal(first.rows.some(a => next.rows.some(b => a.id === b.id)), false);
                const raw = await rpc(db, 'read_dcf_revision', { ...identity(domain, p.id), p_revision_id: first.rows[0].id });
                assert.equal(raw.snapshot.schemaVersion, 1, 'Client accepts the authenticated revision/snapshot envelope');
                assert.equal(raw.snapshot.entityType, domain.table); assert.equal(raw.snapshot.parentId, p.id);
                for (const size of [20, 50]) assert.ok(metadata(await history(db, domain, p.id, 1, { p_limit: size })).length <= size);
                await rejectsUnchanged(db, () => history(db, domain, p.id, 1, { p_limit: 10000 }), /page|size/i);
            }
        });
        await test('related: monitoring ACTION child-only insert/update/delete revisions and frozen content', async () => {
            const d = domains[1], report = (await rows(db, 'activity_monitoring_reports'))[0];
            const before = (await revisions(db, d, report.activity_id)).length;
            const action = (await db.query(`insert into activity_monitoring_actions(monitoring_report_id,action_taken,created_by) values($1,'New field action',1) returning id`, [report.id])).rows[0];
            assert.equal((await revisions(db, d, report.activity_id)).length, before + 1, 'Monitoring actions must route via report to parent');
            const frozen = await snapshot(db, d, report.activity_id, await latest(db, d, report.activity_id));
            assert.ok(JSON.stringify(frozen).includes('New field action'));
            await db.query('update activity_monitoring_actions set action_taken=\'Corrected action\' where id=$1', [action.id]);
            await db.query('delete from activity_monitoring_actions where id=$1', [action.id]);
            assert.equal((await revisions(db, d, report.activity_id)).length, before + 3);
            assert.ok(JSON.stringify(frozen).includes('New field action'));
        });
        await test('related: budget adjustment ledger child-only revision and displayed reason', async () => {
            for (const d of domains.filter(d => d.lines)) {
                const p = (await rows(db, d.table))[0], before = (await revisions(db, d, p.id)).length;
                await db.query(`insert into budget_item_adjustment_history(source_type,parent_id,item_id,action,reason) values($1,$2,'10','cancel','Frozen cancellation reason')`, [d.ledger, p.id]);
                assert.equal((await revisions(db, d, p.id)).length, before + 1);
                assert.ok(JSON.stringify(await snapshot(db, d, p.id, await latest(db, d, p.id))).includes('Frozen cancellation reason'));
            }
        });
        await test('related: Subproject delivery ledger is physical, not metadata-only history', async () => {
            const d = domains[0], row = (await rows(db, 'subproject_accomplishments'))[0];
            await db.query('update subproject_accomplishments set quantity=2 where id=$1', [row.id]);
            const rev = (await revisions(db, d, row.subproject_id)).at(-1);
            assert.equal(rev.physical_changed, true, 'Delivery quantity/date/remarks affect physical evidence');
            assert.ok(JSON.stringify(rev.snapshot.physical).includes('2'));
        });
        await test('related: media metadata child-only changes freeze; soft delete retains historical file evidence', async () => {
            for (const [table, d, fk] of [['activity_drive_files', domains[1], 'activity_id'], ['subproject_drive_files', domains[0], 'subproject_id']]) {
                const file = (await rows(db, table))[0], before = (await revisions(db, d, file[fk])).length;
                await db.query(`update ${table} set caption='Frozen attachment caption',preview_url='SECRET SIGNED LINK' where id=$1`, [file.id]);
                const oldId = await latest(db, d, file[fk]);
                assert.equal((await revisions(db, d, file[fk])).length, before + 1);
                const frozen = await snapshot(db, d, file[fk], oldId);
                assert.ok(JSON.stringify(frozen).includes('Frozen attachment caption')); assertSafe(frozen);
                await db.query(`update ${table} set deleted_at=clock_timestamp(),caption='Removed' where id=$1`, [file.id]);
                assert.deepEqual(await snapshot(db, d, file[fk], oldId), frozen);
                assert.ok(JSON.stringify(await snapshot(db, d, file[fk], await latest(db, d, file[fk]))).includes(file.file_id));
            }
        });
        await test('reference-only rename creates no fanout; recorded labels and snapshots stay frozen', async () => {
            const before = await rows(db, 'dcf_record_revisions');
            await db.exec(`update ref_fund_sources set label='Renamed fund' where uid='FS-000001';update ipos set name='Renamed IPO' where id=1;update reference_activities set activity_name='Renamed activity' where id=1;`);
            assert.deepEqual(await rows(db, 'dcf_record_revisions'), before);
            for (const r of before) assertSafe(r.snapshot);
        });
        await test('privilege boundaries: all protected tables/internal context helpers inaccessible to browser roles', async () => {
            const tables = (await db.query(`select tablename from pg_tables where schemaname='public' and tablename like 'dcf_%' and tablename<>'dcf_policy_settings'`)).rows;
            for (const role of ['anon', 'authenticated']) {
                await db.exec(`set role ${role}`);
                try {
                    for (const { tablename } of tables) {
                        await assert.rejects(() => db.query(`select * from ${quote(tablename)}`), /permission denied/);
                        await assert.rejects(() => db.query(`delete from ${quote(tablename)}`), /permission denied/);
                    }
                    await assert.rejects(() => db.query(`select dcf_begin_operation(1,'fixture-password','Forged',null,null)`), /permission denied/);
                    await assert.rejects(() => db.query(`select dcf_snapshot('activities',1)`), /permission denied/);
                    await state(db, domains[1], 1, 4);
                } finally { await db.exec('reset role'); }
            }
        });
        await test('untrusted actor GUC is ignored; authenticated user mismatch rejected', async () => {
            await db.exec(`select set_config('app.actor_id','1',false);select set_config('app.actor_name','Forged Admin',false);`);
            await updateLabel(db, domains[1], 1, 'Unverified backend mutation');
            const last = (await revisions(db, domains[1], 1)).at(-1);
            assert.equal(last.actor_id, null); assert.notEqual(last.actor_name, 'Forged Admin');
            await db.exec(`update users set auth_id='11111111-1111-4111-8111-111111111111' where id=1;select set_config('fixture.auth_uid','11111111-1111-4111-8111-111111111111',false);`);
            await state(db, domains[1], 1, 1);
            await rejectsUnchanged(db, () => state(db, domains[1], 1, 3), /session.*match/i);
            await db.exec(`select set_config('fixture.auth_uid','',false)`);
        });

        await test('existing Activity/Subproject accomplishment RPC: trusted actor, one finalized revision, retries and conflicts', async () => {
            for (const d of domains.slice(0, 2)) {
                const run = d.type === 'activity' ? runActivityAccomplishmentRpc : runSubprojectAccomplishmentRpc;
                const p = await insertParent(db, d, d.type === 'activity' ? { actualParticipantsMale: 1 } : { actualMaleBeneficiaries: 1 });
                const readName = `read_${d.type}_accomplishments`, saveName = `save_${d.type}_accomplishment`;
                const ids = d.type === 'activity' ? 'p_activity_ids' : 'p_subproject_ids';
                const id = d.type === 'activity' ? 'p_activity_id' : 'p_subproject_id';
                const base = (await run(db, readName, { p_actor_id: 1, p_actor_password: 'fixture-password', [ids]: [p.id], p_surface: d.type }))[0];
                const count = (await revisions(db, d, p.id)).length;
                const key = crypto.randomUUID(), physical = d.type === 'activity' ? { actualParticipantsMale: 2 } : { parent: { actualMaleBeneficiaries: 2 } };
                const args = { p_actor_id: 1, p_actor_password: 'fixture-password', [id]: p.id, p_surface: d.type, p_base: base, p_edits: [], p_physical: physical, p_reason: 'Fixture authorized correction', p_request_key: key, p_targets: [] };
                const saved = await run(db, saveName, args);
                assert.equal((await revisions(db, d, p.id)).length, count + 1);
                assert.equal((await revisions(db, d, p.id)).at(-1).actor_id, 1, 'Existing verified RPC must establish trusted context');
                const stored=await parent(db,d,p.id),lastEvent=stored.history.at(-1);
                assert.deepEqual((await revisions(db,d,p.id)).at(-1).legacy_keys,[[lastEvent.date,lastEvent.event,lastEvent.user]],'Only the exact text event added by this confirmed RPC is linked');
                const listed=await history(db,d,p.id);
                assert.equal(listed.legacyTotal,stored.history.length-1,'Exact linked event is excluded from legacy counts');
                assert.equal((await snapshot(db,d,p.id,listed.rows[0].id)).record.history,undefined,'No recursive text history in snapshot');
                assert.deepEqual(await run(db, saveName, args), saved);
                assert.equal((await revisions(db, d, p.id)).length, count + 1);
                await rejectsUnchanged(db, () => run(db, saveName, { ...args, p_physical: {} }), /retry|request|key/i);
            }
        });

        if (!foundationOnly) {
            await access(path.join(root, 'supabase/migrations', mutationMigration));
            await db.exec(await readFile(path.join(root, 'supabase/migrations', mutationMigration), 'utf8'));
            await db.exec(await readFile(path.join(root, 'supabase/migrations', '202611030003_dcf_revision_restore.sql'), 'utf8'));
            await mutationChecks(db);
        }
    }
} catch (error) {
    results.push({ name: 'suite setup/installation', status: 'FAIL', error: error.message });
    console.error(JSON.stringify({ message: error.message, code: error.code, detail: error.detail, where: error.where }));
} finally { await db.close(); }
const failed = results.filter(r => r.status === 'FAIL');
console.log(JSON.stringify({ mode: baselineOnly ? 'baseline-only' : foundationOnly ? 'foundation-only (mutations/restore NOT claimed)' : 'full SQL fixture', passed: results.length - failed.length, failed: failed.length, failures: failed,
    limitations: ['Source-modeled legacy DDL, not a production catalog export', 'Single-connection PGlite does not prove multi-session lock or commit ordering', 'No browser, real Drive, live DB, or production operations'] }, null, 2));
if (failed.length) process.exitCode = 1;

async function mutationChecks(db) {
    const commit = (d, id, base, changes = {}, financial = [], key = crypto.randomUUID(), actor = 1) => rpc(db, 'commit_dcf_change', {
        ...identity(d, id, actor), p_base: base, p_changes: changes, p_financial: financial, p_source: 'fixture-dcf', p_reason: 'Fixture authorized correction', p_request_key: key,
    });
    const preview = (d, id, rid, actor = 1, undo = null) => rpc(db, 'preview_dcf_restore', { ...identity(d, id, actor), p_revision_id: rid, p_undo_operation_id: undo });
    const apply = (d, id, view, options = {}) => rpc(db, 'apply_dcf_restore', {
        ...identity(d, id, options.actor ?? 1), p_revision_id: view.revisionId,
        p_expected_revision_id: view.currentRevisionId, p_expected_hash: view.currentHash,
        p_reason: options.reason ?? 'Fixture intentional restore', p_acknowledged_actuals: options.ack ?? true,
        p_undo_operation_id: options.undo ?? null, p_request_key: options.key ?? crypto.randomUUID(),
    });
    for (const d of domains) {
        await test(`${d.table}: typed save, trusted attribution, stable actual IDs, retry/hash/actor isolation and sequential corrections`, async () => {
            const p = await insertParent(db, d), a = await state(db, d, p.id), key = crypto.randomUUID();
            const saved = await commit(d, p.id, a, { [d.label]: 'B' }, [], key);
            assert.equal(saved.record[d.label], 'B'); assert.ok(saved.revisionId);
            const rev = (await revisions(db, d, p.id)).at(-1);
            assert.equal(rev.actor_id, 1); assert.equal(rev.actor_name, 'Fixture Admin');
            assert.deepEqual(await commit(d, p.id, a, { [d.label]: 'B' }, [], key), saved);
            await rejectsUnchanged(db, () => commit(d, p.id, a, { [d.label]: 'Other payload' }, [], key), /request|retry|key/i);
            await rejectsUnchanged(db, () => commit(d, p.id, a, { [d.label]: 'B' }, [], key, 3), /request|retry|actor|key/i);
            const noopCount = (await revisions(db, d, p.id)).length;
            await commit(d, p.id, saved, { [d.label]: 'B' });
            assert.equal((await revisions(db, d, p.id)).length, noopCount);
            const itemId = d.lines ? '10' : null;
            const financial = [{ itemId, stage: 'obligation', operations: [{ action: 'insert', id: 'fixture-new', value: { date: '2026-11-03', amount: 10, remarks: 'New central record' } }] }];
            const inserted = await commit(d, p.id, await state(db, d, p.id), {}, financial);
            const original = entries(inserted, d).at(-1), before = await state(db, d, p.id);
            const edits = amount => [{ itemId, stage: 'obligation', operations: [{ action: 'update', id: original.id, expected: original, value: { ...original, amount } }] }];
            const corrected = await commit(d, p.id, before, {}, edits(20));
            assert.equal(entries(corrected, d).at(-1).id, original.id); assert.equal(entries(corrected, d).at(-1).date, original.date);
            await rejectsUnchanged(db, () => commit(d, p.id, before, {}, edits(30)), /conflict|changed|stale/i);
            await rejectsUnchanged(db, () => commit(d, p.id, corrected, { [d.label]: 'Must roll back' }, [{ itemId, stage: 'obligation', operations: [{ action: 'update', id: '999999', value: { amount: 1, date: '2026-11-03' } }] }]), /missing|changed|conflict|entry/i);
            await rejectsUnchanged(db, () => commit(d, p.id, corrected, { workflow_status: 'APPROVED', id: 999 }), /field|protected|invalid/i);
            await rejectsUnchanged(db, () => commit(d, p.id, corrected, { [d.label]: 'Guest edit' }, [], crypto.randomUUID(), 4), /permission|Guest|edit/i);
        });
        await test(`${d.table}: preview zero writes; C->B produces D; refresh-safe Undo produces E without changing any old version`, async () => {
            const p = await insertParent(db, d);
            const b = await commit(d, p.id, await state(db, d, p.id), { [d.label]: 'Restore B' });
            const c = await commit(d, p.id, b, { [d.label]: 'Restore C' });
            const old = await revisions(db, d, p.id), all = await fingerprints(db);
            const view = await preview(d, p.id, b.revisionId);
            assert.deepEqual(await fingerprints(db), all, 'Preview and cancellation are pure reads');
            assert.equal(view.canRestore, true); assert.deepEqual(view.blockers, []);
            const key = crypto.randomUUID(), restored = await apply(d, p.id, view, { key });
            assert.equal(restored.confirmed, true); assert.equal(restored.record[d.label], 'Restore B');
            assert.notEqual(restored.revisionId, b.revisionId); assert.notEqual(restored.revisionId, c.revisionId);
            assert.ok(restored.operationId);
            assert.deepEqual((await revisions(db, d, p.id)).slice(0, old.length), old);
            assert.deepEqual(await apply(d, p.id, view, { key }), restored, 'Lost-response retry returns durable receipt');
            const refreshed = await state(db, d, p.id);
            assert.equal(refreshed.record[d.label], 'Restore B');
            const undoView = await preview(d, p.id, c.revisionId, 1, restored.operationId);
            const undoKey = crypto.randomUUID(), undone = await apply(d, p.id, undoView, { undo: restored.operationId, key: undoKey });
            assert.equal(undone.confirmed, true); assert.equal(undone.record[d.label], 'Restore C');
            assert.notEqual(undone.revisionId, restored.revisionId);
            assert.deepEqual(await apply(d, p.id, undoView, { undo: restored.operationId, key: undoKey }), undone);
            assert.deepEqual((await revisions(db, d, p.id)).slice(0, old.length), old);
            assert.equal((await revisions(db, d, p.id)).length, old.length + 2);
            await rejectsUnchanged(db, () => apply(d, p.id, undoView, { undo: restored.operationId }), /undo|already|stale|changed/i);
        });
        await test(`${d.table}: stale child changes, current permission revocation, invalid reference and no-op restore guarded`, async () => {
            const p = await insertParent(db, d), b = await commit(d, p.id, await state(db, d, p.id), { [d.label]: 'Blocked B' });
            await commit(d, p.id, b, { [d.label]: 'Blocked C' });
            const stale = await preview(d, p.id, b.revisionId);
            await db.query(`insert into financial_obligations(entity_type,parent_id,item_id,amount,obligation_date) values($1,$2,$3,1,'2026-11-03')`, [d.ledger, p.id, d.lines ? '10' : null]);
            await rejectsUnchanged(db, () => apply(d, p.id, stale), /stale|changed|conflict|refresh/i);
            const denied = await preview(d, p.id, b.revisionId, 4);
            assert.equal(denied.canRestore, false);
            await rejectsUnchanged(db, () => apply(d, p.id, stale, { actor: 4 }), /permission|Guest|restore/i);
            const current = await state(db, d, p.id), noop = await preview(d, p.id, current.revisionId);
            const count = (await revisions(db, d, p.id)).length;
            if (noop.canRestore) await apply(d, p.id, noop);
            assert.equal((await revisions(db, d, p.id)).length, count, 'Restoring identical current state creates no duplicate revision');
        });
        await test(`${d.table}: financial restore and UI-style undo preserve posted IDs, duplicate entries, targets and immutable versions`, async () => {
            const p = await insertParent(db, d, d.table === 'staffing_requirements' ? { hiringStatus: 'Filled' } : { status: 'Ongoing' });
            const itemId = d.lines ? '10' : null;
            const b = await commit(d, p.id, await state(db, d, p.id), {}, [{ itemId, stage: 'obligation', operations: [
                { action: 'insert', value: { date: '2026-11-03', amount: 10, remarks: 'Independent actual' } },
                { action: 'insert', value: { date: '2026-11-03', amount: 10, remarks: 'Independent actual' } },
            ] }]);
            const original = entries(b, d).at(-1), untouched = entries(b, d).slice(0, -1);
            const c = await commit(d, p.id, b, {}, [{ itemId, stage: 'obligation', operations: [
                { action: 'update', id: original.id, expected: original, value: { ...original, amount: 30 } },
            ] }]);
            const oldVersions = await revisions(db, d, p.id), before = await fingerprints(db);
            const view = await preview(d, p.id, b.revisionId);
            assert.equal(view.requiresActualsAcknowledgement, true);
            assert.deepEqual(await fingerprints(db), before);
            assert.equal(view.canRestore, true, JSON.stringify(view.blockers));
            await rejectsUnchanged(db, () => apply(d, p.id, view, { ack: false }), /confirm|acknowledge|actual/i);
            const restored = await apply(d, p.id, view);
            assert.equal(entries(restored, d).at(-1).id, original.id);
            assert.equal(entries(restored, d).at(-1).amount, 10);
            assert.deepEqual(entries(restored, d).slice(0, -1), untouched);
            assert.deepEqual((await revisions(db, d, p.id)).slice(0, oldVersions.length), oldVersions);
            if (d.lines) assert.deepEqual(restored.record[d.lines].map(({ id, amount, numberOfUnits, pricePerUnit, targetObligationSchedules, targetDisbursementSchedules }) => ({ id, amount, numberOfUnits, pricePerUnit, targetObligationSchedules, targetDisbursementSchedules })), b.record[d.lines].map(({ id, amount, numberOfUnits, pricePerUnit, targetObligationSchedules, targetDisbursementSchedules }) => ({ id, amount, numberOfUnits, pricePerUnit, targetObligationSchedules, targetDisbursementSchedules })));
            const undoView = await preview(d, p.id, restored.revisionId, 1, restored.operationId);
            const undone = await apply(d, p.id, undoView, { undo: restored.operationId });
            assert.equal(entries(undone, d).at(-1).id, original.id);
            assert.equal(entries(undone, d).at(-1).amount, 30);
            assert.deepEqual(entries(undone, d).slice(0, -1), untouched);
        });
    }
}
