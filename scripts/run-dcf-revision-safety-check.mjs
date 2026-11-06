import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createDcfRevisionFixture, domains, insertParent, installDcfRevision,
    fingerprints, securityFingerprint, root, rpc } from './helpers/dcf-revision-fixture.mjs';

// Independent adversarial checks. PGlite is single-session: this suite makes NO
// concurrency or production-catalog claim. Failed safety assertions stay failed.
const db = await createDcfRevisionFixture({ install: false });
const results = [];
const identity = (type, id = 1, actor = 1) => ({ p_actor_id: actor, p_actor_password: 'fixture-password', p_entity_type: type, p_parent_id: id });
const state = (type, id = 1, actor = 1) => rpc(db, 'read_dcf_state', identity(type, id, actor));
const commit = (type, base, changes, financial = [], actor = 1, source = 'dcf', key = crypto.randomUUID()) => rpc(db, 'commit_dcf_change', {
    ...identity(type, base?.record?.id ?? null, actor), p_base: base || {}, p_changes: changes,
    p_financial: financial, p_request_key: key, p_reason: 'Disposable security regression', p_source: source,
});
const preview = (type, id, revision, actor = 1) => rpc(db, 'preview_dcf_restore', {
    ...identity(type, id, actor), p_revision_id: revision,
});
const apply = (type, id, revision, plan, acknowledged = true) => rpc(db, 'apply_dcf_restore', {
    ...identity(type, id), p_revision_id: revision, p_expected_revision_id: plan.currentRevisionId,
    p_expected_hash: plan.currentHash, p_reason: 'Disposable restoration regression',
    p_acknowledged_actuals: acknowledged, p_request_key: crypto.randomUUID(),
});
async function setupRecord(type, patch) {
    const base = await state(type);
    return commit(type, base, patch);
}
async function partialPhysicalVersions() {
    const base = await state('subprojects');
    // A new planned line must not accidentally clone the fixture's financial
    // accomplishments; only the later explicit physical edit is under test.
    const extra = Object.fromEntries(Object.entries({ ...base.record.details[0], id: 11 })
        .filter(([key]) => !/^actual|^obligations$|^disbursements$|^isCompleted$/.test(key)));
    const twoLines = await commit('subprojects', base, { details: [...base.record.details, extra] });
    const encoded = await commit('subprojects', twoLines, { details: twoLines.record.details.map(x => x.id === 10
        ? { ...x, actualDeliveryDate: '2026-11-01', actualNumberOfUnits: 1, isCompleted: true } : x) });
    await commit('subprojects', encoded, { details: encoded.record.details.map(x => x.id === 10
        ? { ...x, actualDeliveryDate: null, actualNumberOfUnits: null, isCompleted: false } : x) });
    return encoded;
}
async function directOperation() {
    // Each external operation would have its own transaction/context. The outer
    // rollback isolates test data; renew context rather than reuse an RPC UUID.
    await db.query(`select dcf_begin_operation(1,'fixture-password','disposable-direct-check',$1::uuid,'Disposable regression')`, [crypto.randomUUID()]);
}
async function check(name, action) {
    await db.exec('begin');
    try {
        await action();
        results.push({ name, status: 'PASS' });
        console.log(`PASS ${name}`);
    } catch (error) {
        results.push({ name, status: 'FAIL', error: error.message });
        console.error(`FAIL ${name}: ${error.message}`);
    } finally { await db.exec('rollback'); }
}
const denied = /permission|locked|month|actual|protected|identity|changed|stale|unavailable|adapter|operation|scope/i;
const migrations = ['supabase/migrations/202611030001_dcf_revision_history.sql', 'supabase/migrations/202611030002_dcf_revision_mutations.sql', 'supabase/migrations/202611030003_dcf_revision_restore.sql','supabase/activation/202611050001_dcf_revision_client_activation.sql'];
async function migrationHashes() {
    const result = {};
    for (const file of migrations) result[file] = createHash('sha256').update(await readFile(path.join(root, file))).digest('hex');
    return result;
}
const sourceHashes = await migrationHashes();
async function preparedRestoreRequest() {
    await db.query(`update dcf_policy_settings set settings=jsonb_set(settings,'{roleRules,User,office_requirements,Proposed,restoreHistory}','true',true) where settings_key='dcf_editing_policy'`);
    const a = await setupRecord('office_requirements', { purpose: 'Purpose A before retry test' });
    await commit('office_requirements', a, { purpose: 'Purpose B before retry test' });
    const plan = await preview('office_requirements', 1, a.revisionId, 3);
    assert.equal(plan.canRestore, true, `Fixture must allow first restore: ${JSON.stringify(plan.blockers)}`);
    const args = { ...identity('office_requirements', 1, 3), p_revision_id: a.revisionId,
        p_expected_revision_id: plan.currentRevisionId, p_expected_hash: plan.currentHash,
        p_reason: 'Disposable restore retry authorization', p_acknowledged_actuals: true, p_request_key: crypto.randomUUID() };
    await rpc(db, 'apply_dcf_restore', args);
    return args;
}

try {
    const before = await fingerprints(db);
    const aclBefore = await securityFingerprint(db);
    await installDcfRevision(db, { mutations: true });
    await db.exec(await readFile(path.join(root, 'supabase/migrations/202611030003_dcf_revision_restore.sql'), 'utf8'));
    assert.deepEqual(await fingerprints(db, Object.keys(before)), before, 'All three installs preserve every preexisting row');
    const aclAfter = await securityFingerprint(db);
    for (const kind of Object.keys(aclBefore)) {
        const key = r => kind === 'functions' ? `${r.proname}:${r.args}` : kind === 'tables' ? r.relname : `${r.tablename}:${r.policyname}`;
        const oldKeys = new Set(aclBefore[kind].map(key));
        assert.deepEqual(aclAfter[kind].filter(r => oldKeys.has(key(r))), aclBefore[kind], `${kind}: existing security remains unchanged`);
    }
    console.log('PASS all-three installation business fingerprints and preexisting security');
    const installed = await fingerprints(db);
    await installDcfRevision(db, { mutations: true });
    await db.exec(await readFile(path.join(root, 'supabase/migrations/202611030003_dcf_revision_restore.sql'), 'utf8'));
    assert.deepEqual(await fingerprints(db), installed, 'All three reapplications preserve business/history rows');
    console.log('PASS all-three reinstallation business/history fingerprints');

    await check('preactivation old browser writes remain compatible but cannot masquerade as complete restore points',async()=>{
        await db.exec(`grant select,update on activities to anon;set local role anon;update activities set description='Old client transition write' where id=1;reset role;`);
        const rid=(await db.query("select dcf_finalize_revision('activities',1) id")).rows[0].id;
        const saved=(await db.query('select source,snapshot from dcf_record_revisions where id=$1',[rid])).rows[0];
        assert.equal(saved.source,'legacy-browser-write');assert.equal(saved.snapshot.coverage.complete,false);
        await assert.rejects(()=>rpc(db,'preview_dcf_restore',{...identity('activities'),p_revision_id:rid}),/coverage|incomplete/i);
    });
    const preactivation=await fingerprints(db),preactivationSecurity=await securityFingerprint(db);
    const activation=await readFile(path.join(root,'supabase/activation/202611050001_dcf_revision_client_activation.sql'),'utf8');
    await db.exec(activation);await db.exec(activation);
    assert.deepEqual(await fingerprints(db),preactivation,'Final activation/reapplication does not modify existing business/history records');
    assert.deepEqual(await securityFingerprint(db),preactivationSecurity,'Final activation preserves all existing ACL, RLS and function security settings');

    await check('browser direct parent/ledger writes require a verified transaction while the current adapter remains usable', async () => {
        const base=await state('activities');
        // Fixture-only grants model the broad deployed table ACLs; production ACLs are not changed.
        await db.exec(`grant select,update on activities,financial_disbursements to anon;
          grant insert on budget_item_adjustment_history to anon;
          grant usage on sequence budget_item_adjustment_history_id_seq to anon;
          create policy disposable_fixture_audit on budget_item_adjustment_history for insert to anon with check(true);
          create policy disposable_fixture_read on financial_disbursements for select to anon using(true);
          create policy disposable_fixture_update on financial_disbursements for update to anon using(true) with check(true);
          set local role anon`);
        assert.equal((await db.query("select current_setting('role') role")).rows[0].role,'anon');
        assert.equal((await db.query("select count(*)::int n from financial_disbursements where entity_type='activity_expense' and parent_id=1")).rows[0].n,2);
        for (const sql of [`update activities set description='Old direct client' where id=1`, `update financial_disbursements set amount=9 where entity_type='activity_expense' and parent_id=1`, `insert into budget_item_adjustment_history(source_type,parent_id,item_id,action,reason) values('activity_expense',1,'10','cancel','Standalone browser audit')`]) {
            await db.exec('savepoint rejected_direct_write');
            await assert.rejects(()=>db.exec(sql),/current transactional client/i,sql);
            await db.exec('rollback to savepoint rejected_direct_write');
        }
        const confirmed=await commit('activities',base,{description:'Confirmed current adapter'});
        assert.equal(confirmed.record.description,'Confirmed current adapter');
        await db.exec('reset role');
        assert.equal((await db.query('select actor_id from dcf_record_revisions where id=$1',[confirmed.revisionId])).rows[0].actor_id,1);
    });

    await check('mixed budget/physical patch requires physical permission', async () => {
        await db.query(`update roles_config set can_edit=false where role='User' and module='Accomplishment - Physical'`);
        const base = await state('subprojects', 1, 3);
        const details = base.record.details.map(x => ({ ...x, amount: 101, actualDeliveryDate: '2001-01-01', actualNumberOfUnits: 1, isCompleted: true }));
        await assert.rejects(() => commit('subprojects', base, { details }, [], 3), denied);
    });

    await check('mixed budget/financial patch requires financial permission', async () => {
        await db.query(`update roles_config set can_edit=false where role='User' and module='Accomplishment - Financial'`);
        const base = await state('staffing_requirements', 1, 3);
        const expenses = base.record.expenses.map(x => ({ ...x, amount: 101, actualObligationAmount: 999, obligations: [{ date: '2001-01-01', amount: 999 }] }));
        await assert.rejects(() => commit('staffing_requirements', base, { expenses }, [], 3), denied);
    });

    await check('create cannot inject financial actuals without accomplishment permission', async () => {
        await db.query(`update roles_config set can_edit=false where role='User' and module='Accomplishment - Financial'`);
        await assert.rejects(() => commit('office_requirements', null, {
            uid: 'SECURITY-CREATE', equipment: 'Fixture only', operatingUnit: 'RFO I', status: 'Proposed',
            actualObligationDate: '2001-01-01', actualObligationAmount: 999,
        }, [], 3), denied);
    });

    await check('scalar financial fields cannot bypass current-month entry adapter', async () => {
        await setupRecord('office_requirements', { status: 'Ongoing' });
        const base = await state('office_requirements', 1, 3);
        await assert.rejects(() => commit('office_requirements', base, {
            actualDisbursementDate: '2001-01-01', actualDisbursementAmount: 999,
        }, [], 3), denied);
    });

    await check('managed-empty stage cannot accept contradictory scalar financial actuals', async () => {
        let base = await state('office_requirements');
        base = await commit('office_requirements', base, {}, [{ itemId: null, stage: 'disbursement',
            operations: base.financial.stages.$parent.disbursement.entries.map(e => ({ action: 'delete', id: e.id, expected: e })) }]);
        assert.deepEqual(base.financial.stages.$parent.disbursement.entries, []);
        await assert.rejects(() => commit('office_requirements', base, { actualDisbursementAmount: 999 }), denied);
    });

    await check('immutable UID cannot be replaced by generic details mutation', async () => {
        const base = await state('office_requirements');
        await assert.rejects(() => commit('office_requirements', base, { uid: 'FORGED-IDENTITY' }), denied);
    });

    await check('stale financial update cannot omit expected entry to overwrite newer amount', async () => {
        const base = await state('office_requirements');
        const entry = base.financial.stages.$parent.obligation.entries[0];
        await commit('office_requirements', base, {}, [{ itemId: null, stage: 'obligation', operations: [
            { action: 'update', id: entry.id, expected: entry, value: { ...entry, amount: 22 } },
        ] }]);
        await assert.rejects(() => commit('office_requirements', base, {}, [{ itemId: null, stage: 'obligation', operations: [
            { action: 'update', id: entry.id, value: { ...entry, amount: 33 } },
        ] }]), denied);
    });

    await check('stale financial update with explicit expected is rejected', async () => {
        const base = await state('office_requirements');
        const entry = base.financial.stages.$parent.obligation.entries[0];
        await commit('office_requirements', base, {}, [{ itemId: null, stage: 'obligation', operations: [
            { action: 'update', id: entry.id, expected: entry, value: { ...entry, amount: 22 } },
        ] }]);
        await assert.rejects(() => commit('office_requirements', base, {}, [{ itemId: null, stage: 'obligation', operations: [
            { action: 'update', id: entry.id, expected: entry, value: { ...entry, amount: 33 } },
        ] }]), denied);
    });

    await check('same unchanged state hashes identically in UTC and Asia/Manila', async () => {
        await db.exec(`set local time zone 'UTC'`);
        const utc = await state('activities');
        await db.exec(`set local time zone 'Asia/Manila'`);
        const manila = await state('activities');
        assert.equal(manila.hash, utc.hash, 'JSON timestamptz serialization must be canonical, not session-dependent');
    });

    await check('child ledger, monitoring and media timestamp churn creates no revision or stale business fingerprint',async()=>{
        const a=await setupRecord('activities',{description:'Timestamp churn checkpoint'});
        const before=await rpc(db,'list_dcf_revisions',{...identity('activities'),p_limit:10});
        await db.exec(`update financial_disbursements set updated_at=clock_timestamp() where entity_type='activity_expense' and parent_id=1;
          update activity_monitoring_reports set updated_at=clock_timestamp() where activity_id=1;
          update activity_monitoring_actions set edited_at=clock_timestamp() where monitoring_report_id in(select id from activity_monitoring_reports where activity_id=1);
          update activity_drive_files set updated_at=clock_timestamp() where activity_id=1;`);
        await db.query("select dcf_finalize_revision('activities',1)");
        assert.equal((await state('activities')).hash,a.hash);
        const after=await rpc(db,'list_dcf_revisions',{...identity('activities'),p_limit:10});
        assert.deepEqual(after,before);
    });

    await check('restore nested physical actuals requires deliberate actuals acknowledgement', async () => {
        const a = await partialPhysicalVersions();
        const plan = await preview('subprojects', 1, a.revisionId);
        assert.equal(plan.canRestore, true, JSON.stringify(plan.blockers));
        assert.equal(plan.requiresActualsAcknowledgement, true, 'Nested physical restoration changes reported actuals');
    });

    await check('restored Subproject physical correction records fresh submission provenance', async () => {
        const a = await partialPhysicalVersions();
        const plan = await preview('subprojects', 1, a.revisionId);
        const result = await apply('subprojects', 1, a.revisionId, plan);
        assert.ok(result.record.physical_accomplishment_submitted_at, 'Newly encoded physical correction needs server-time provenance');
    });

    await check('restore uses current reference labels for unchanged stable reference ID', async () => {
        const a = await setupRecord('subprojects', { indigenousPeopleOrganization: 'Historical IPO label',name:'Historical parent detail' });
        await db.query(`update ipos set name='Current authorized IPO label' where id=1`);
        await commit('subprojects', a, { indigenousPeopleOrganization: 'Current authorized IPO label',name:'Current parent detail' });
        const plan = await preview('subprojects', 1, a.revisionId);
        const restored = await apply('subprojects', 1, a.revisionId, plan);
        assert.equal(restored.record.ipo_id, 1);
        assert.equal(restored.record.indigenousPeopleOrganization, 'Current authorized IPO label');
    });

    await check('child-only physical evidence restore is either complete or explicitly blocked', async () => {
        const a = await setupRecord('subprojects', { name: 'Version containing delivery evidence' });
        await directOperation();
        await db.query(`delete from subproject_accomplishments where subproject_id=1`);
        await db.query(`select dcf_finalize_revision('subprojects',1)`);
        const plan = await preview('subprojects', 1, a.revisionId);
        assert.ok(plan.canRestore || plan.blockers.length, 'Changed physical evidence cannot silently become an unblocked no-op');
    });

    await check('generic financial entry corrections update parent Staffing actual rollups', async () => {
        const base = await state('staffing_requirements');
        const entry = base.financial.stages['10'].obligation.entries[0];
        const result = await commit('staffing_requirements', base, {}, [{ itemId: '10', stage: 'obligation', operations: [
            { action: 'update', id: entry.id, expected: entry, value: { ...entry, amount: 40 } },
        ] }]);
        const total = result.financial.stages['10'].obligation.entries.reduce((sum, e) => sum + Number(e.amount), 0);
        assert.equal(Number(result.record.actualObligationAmount), total, 'Parent totals must agree with authoritative child stages');
    });

    await check('financial restore removal/recreation retains original lineage across a second restore', async () => {
        const base = await state('office_requirements');
        const a = await commit('office_requirements', base, { purpose: 'Version retaining original posted identity' });
        const entry = a.financial.stages.$parent.obligation.entries[0];
        const b = await commit('office_requirements', a, {}, [{ itemId: null, stage: 'obligation', operations: [
            { action: 'delete', id: entry.id, expected: entry },
        ] }]);
        const restored = await apply('office_requirements', 1, a.revisionId, await preview('office_requirements', 1, a.revisionId));
        const mapped = restored.financial.stages.$parent.obligation.entries.find(e => e.id !== entry.id && Number(e.amount) === Number(entry.amount));
        assert.ok(mapped, 'Recreated posted row gets a fresh database ID');
        const back = await preview('office_requirements', 1, b.revisionId);
        await apply('office_requirements', 1, b.revisionId, back);
        const again = await preview('office_requirements', 1, a.revisionId);
        assert.equal(again.canRestore, true, JSON.stringify(again.blockers));
        const second = await apply('office_requirements', 1, a.revisionId, again);
        assert.equal(second.financial.stages.$parent.obligation.entries.length, a.financial.stages.$parent.obligation.entries.length);
    });

    await check('historical financial ID now owned by another parent is blocked', async () => {
        const base = await state('office_requirements');
        const a = await commit('office_requirements', base, { purpose: 'Posted identity owner' });
        const entry = a.financial.stages.$parent.obligation.entries[0];
        await directOperation();
        const other = await insertParent(db, domains[2]);
        await db.query(`update financial_obligations set parent_id=$1 where id=$2`, [other.id, entry.id]);
        await db.query(`select dcf_finalize_revision('office_requirements',1)`);
        const plan = await preview('office_requirements', 1, a.revisionId);
        assert.equal(plan.canRestore, false);
        assert.match(plan.blockers.join(' '), /another item or parent/i);
    });

    await check('non-Super Admin missing restore capability stays denied', async () => {
        const a = await setupRecord('office_requirements', { purpose: 'First saved purpose' });
        await commit('office_requirements', a, { purpose: 'Second saved purpose' });
        const plan = await preview('office_requirements', 1, a.revisionId, 2);
        assert.equal(plan.canRestore, false);
        assert.match(plan.blockers.join(' '), /Restore History permission/i);
    });

    await check('physical-only permission cannot mutate financial fields via default source', async () => {
        await setupRecord('office_requirements', { status: 'Ongoing' });
        await db.query(`update roles_config set can_edit=false where role='User' and module='Accomplishment - Financial'`);
        const base = await state('office_requirements', 1, 3);
        await assert.rejects(() => commit('office_requirements', base, { actualObligationAmount: 99 }, [], 3), denied);
    });

    await check('generic empty mutation requires write access, not only source view', async () => {
        await db.query(`update roles_config set can_edit=false where role='Guest'`);
        const base = await state('office_requirements', 1, 4);
        await assert.rejects(() => commit('office_requirements', base, {}, [], 4), denied);
    });

    await check('delete receipt retry rechecks the current role without deleting or recreating anything',async()=>{
        const base=await state('activities'),args={...identity('activities'),p_base:base,p_reason:'Disposable delete retry',p_request_key:crypto.randomUUID()};
        const confirmed=await rpc(db,'delete_dcf_record',args);assert.equal(confirmed.deleted,true);
        assert.deepEqual(await rpc(db,'delete_dcf_record',args),confirmed);
        await db.exec("update users set role='Guest' where id=1");
        await assert.rejects(()=>rpc(db,'delete_dcf_record',args),/permission|Guest/i);
    });
    await check('an old delete receipt cannot remove a recovered or reused live record from the UI',async()=>{
        const base=await state('activities'),args={...identity('activities'),p_base:base,p_reason:'Disposable incarnation retry',p_request_key:crypto.randomUUID()};
        await rpc(db,'delete_dcf_record',args);
        await db.exec(`insert into activities(id,uid,name,"operatingUnit") values(1,'NEW-INCARNATION','Independent new parent','RFO I')`);
        await assert.rejects(()=>rpc(db,'delete_dcf_record',args),/changed after deletion/i);
    });

    for (const [label, revoke] of [
        ['source view', `update roles_config set can_view=false where role='User' and module='Program Management'`],
        ['source edit', `update roles_config set can_edit=false where role='User' and module='Program Management'`],
        ['role', `update users set role='Guest' where id=3`],
        ['OU scope', `update users set "operatingUnit"='RFO II',visibility_scope='Own OU' where id=3`],
    ]) {
        await check(`save retry rechecks current ${label} after revocation`, async () => {
            const base = await state('office_requirements', 1, 3);
            const key = crypto.randomUUID();
            const changes = { purpose: 'Successful save before authorization revocation' };
            await commit('office_requirements', base, changes, [], 3, 'dcf', key);
            await db.query(revoke);
            await assert.rejects(() => commit('office_requirements', base, changes, [], 3, 'dcf', key), denied);
        });
    }

    for (const [label, revoke] of [
        ['Restore History capability', `update dcf_policy_settings set settings=jsonb_set(settings,'{roleRules,User,office_requirements,Proposed,restoreHistory}','false',true) where settings_key='dcf_editing_policy'`],
        ['source view', `update roles_config set can_view=false where role='User' and module='Program Management'`],
        ['source edit', `update roles_config set can_edit=false where role='User' and module='Program Management'`],
        ['role', `update users set role='Guest' where id=3`],
        ['OU scope', `update users set "operatingUnit"='RFO II',visibility_scope='Own OU' where id=3`],
    ]) {
        await check(`restore retry rechecks current ${label} after revocation`, async () => {
            const args = await preparedRestoreRequest();
            await db.query(revoke);
            await assert.rejects(() => rpc(db, 'apply_dcf_restore', args), denied);
        });
    }

    await check('linked contact/credential records are not included in snapshots', async () => {
        for (const domain of domains) {
            const saved = await state(domain.table);
            assert.doesNotMatch(JSON.stringify(saved), /PRIVATE IPO PERSON|PRIVATE IPO PHONE|fixture-password|encrypted_refresh_token/);
        }
    });

    await check('explicit nested snapshot schemas exclude arbitrary metadata without rewriting untouched legacy JSON', async () => {
        await db.query(`update subprojects set details=jsonb_set(details,'{0,internalCredential}','"PRIVATE NESTED METADATA"') where id=1`);
        let base=await state('subprojects');
        assert.doesNotMatch(JSON.stringify(base),/PRIVATE NESTED METADATA|internalCredential/);
        const entry=base.financial.stages['10'].obligation.entries[0];
        base=await commit('subprojects',base,{},[{itemId:'10',stage:'obligation',operations:[{action:'update',id:entry.id,expected:entry,value:{...entry,amount:35}}]}]);
        assert.equal((await db.query(`select details->0->>'internalCredential' value from subprojects where id=1`)).rows[0].value,'PRIVATE NESTED METADATA');
        const edited=base.record.details.map(row=>({...row,particulars:'Supported budget correction'}));
        await commit('subprojects',base,{details:edited});
        assert.equal((await db.query(`select details->0->>'internalCredential' value from subprojects where id=1`)).rows[0].value,'PRIVATE NESTED METADATA');
        assert.doesNotMatch(JSON.stringify(await state('subprojects')),/PRIVATE NESTED METADATA|internalCredential/);
    });

    const endingHashes = await migrationHashes();
    assert.deepEqual(endingHashes, sourceHashes, 'Migration files changed while this fixture was running; rerun against stable inputs');
    console.log(JSON.stringify({ engine: 'memory-only PGlite', multiSessionVerified: false, sourceHashes,
        passed: results.filter(r => r.status === 'PASS').length, failed: results.filter(r => r.status === 'FAIL').length, results }, null, 2));
    if (results.some(r => r.status === 'FAIL')) process.exitCode = 1;
} finally { await db.close(); }
