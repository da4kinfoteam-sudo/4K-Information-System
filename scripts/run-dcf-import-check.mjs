import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import * as XLSX from 'xlsx';
import { createDcfRevisionFixture, installDcfRevision, rpc, transaction, plannedLine, rows } from './helpers/dcf-revision-fixture.mjs';

// No live client is constructed: all imports resolve to this in-memory bridge.
const bridge = { calls: [], handler: null };
globalThis.dcfImportTest = bridge;
const server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true },
    optimizeDeps: { noDiscovery: true, entries: [] }, plugins: [{
        name: 'isolated-dcf-import-client', enforce: 'pre',
        resolveId(id) { if (id.endsWith('/supabaseClient')) return '\0dcf-import-client'; },
        load(id) {
            if (id !== '\0dcf-import-client') return;
            return `export const supabase = { async rpc(name, args) {
                const test = globalThis.dcfImportTest;
                test.calls.push({ name, args: structuredClone(args) });
                return test.handler(name, args);
            }, from() { throw new Error('Direct import table writes are forbidden'); } };`;
        },
    }] });
const memoryStorage = () => {
    const data = new Map();
    return { getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); }, data };
};
let passed = 0;
let failed = 0;
async function check(name, action) {
    try { await action(); passed++; console.log('PASS ' + name); }
    catch (error) { failed++; console.error('FAIL ' + name + ': ' + error.message); }
}
let db;
try {
    const imports = await server.ssrLoadModule('/lib/dcfImportPersistence.ts');
    const actor = { id: 1, password: 'fixture-password' };
    const row = { uid: 'IMPORT-A', type: 'Training', component: 'Program Management', name: 'Imported Training', operatingUnit: 'RFO I', status: 'Proposed',
        fundSourceUid: 'FS-000001', fundSource: '4K Fund', fundingYear: 2026, participantsMale: 4,
        participatingIpos: ['Frozen IPO Label'], participating_ipo_ids: [1], expenses: [{ ...plannedLine(201), obligations: [], actualObligationAmount: 0 }] };
    const args = (storage, overrides = {}) => ({ entityType: 'activities', fileIdentity: 'file-A', rows: [row], actor,
        reason: 'Deliberate fixture import', onConfirmed() {}, storage, ...overrides });
    await check('business projection excludes snapshot/workflow/server fields and preserves independent plans', () => {
        const changes = imports.dcfImportBusinessChanges('activities', { ...row, id: 99, created_at: 'yesterday', updated_at: 'today',
            encodedBy: 'Forged actor', workflow_status: 'APPROVED', approver_id: 900, revision: 8, physical_accomplishment_submitted_at: '2001-01-01',
            references: { snapshot: true }, original_budget_snapshot: {}, budgetItemTransferId: 'foreign' });
        assert.deepEqual(changes, imports.dcfImportBusinessChanges('activities', row));
        assert.deepEqual(changes.expenses[0].targetObligationSchedules, row.expenses[0].targetObligationSchedules);
        assert.notDeepEqual(changes.expenses[0].targetObligationSchedules, changes.expenses[0].targetDisbursementSchedules);
        assert.deepEqual(changes.participating_ipo_ids, [1]);
    });
    await check('file identity depends on bytes, not filename; synchronous upload guard', async () => {
        const bytes = new TextEncoder().encode('same workbook').buffer;
        assert.equal(await imports.dcfImportFileIdentity(bytes), await imports.dcfImportFileIdentity(bytes.slice(0)));
        assert.notEqual(await imports.dcfImportFileIdentity(bytes), await imports.dcfImportFileIdentity(new ArrayBuffer(1)));
        const release = imports.claimDcfImportUpload('activities', 1);
        assert.equal(imports.claimDcfImportUpload('activities', 1), undefined);
        const other = imports.claimDcfImportUpload('subprojects', 1);
        assert.equal(typeof other, 'function');
        release(); other();
    });
    await check('Program Management row UIDs survive file retry and remain scoped by actor, module and row',()=>{
        const storage=memoryStorage();
        assert.equal(imports.dcfImportRowUid('office_requirements',1,'file-content',0,'OR-FIRST',storage),'OR-FIRST');
        assert.equal(imports.dcfImportRowUid('office_requirements',1,'file-content',0,'OR-REGENERATED',storage),'OR-FIRST');
        assert.equal(imports.dcfImportRowUid('staffing_requirements',1,'file-content',0,'SR-FIRST',storage),'SR-FIRST');
        assert.equal(imports.dcfImportRowUid('office_requirements',2,'file-content',0,'OR-OTHER-ACTOR',storage),'OR-OTHER-ACTOR');
        assert.equal(imports.dcfImportRowUid('office_requirements',1,'file-content',1,'OR-SECOND',storage),'OR-SECOND');
    });

    const receipts = new Map();
    const records = new Map();
    let lose = false;
    let rejectUid;
    let next = 1000;
    bridge.handler = async (name, payload) => {
        if (name === 'read_dcf_state') return { data: { record: records.get(payload.p_parent_id), financial: { obligations: [], disbursements: [] } }, error: null };
        assert.equal(name, 'commit_dcf_change');
        if (payload.p_changes.uid === rejectUid) return { data: null, error: { message: 'Fixture denied' } };
        if (!receipts.has(payload.p_request_key)) {
            const record = { ...payload.p_changes, id: ++next, encodedBy: 'Server actor' };
            const result = { record, financial: { obligations: [], disbursements: [] }, revisionId: next };
            receipts.set(payload.p_request_key, result); records.set(record.id, record);
        }
        if (lose) { lose = false; throw new Error('Response lost after commit'); }
        return { data: structuredClone(receipts.get(payload.p_request_key)), error: null };
    };
    await check('response loss persists exact UUID/payload before dispatch and survives regenerated row values', async () => {
        const storage = memoryStorage();
        lose = true;
        await assert.rejects(() => imports.persistDcfImportRows(args(storage)), /0 row\(s\) confirmed.*Response lost/);
        const first = bridge.calls.at(-1).args;
        assert.match(first.p_correlation_id, /^[0-9a-f-]{36}$/);
        const persisted = JSON.parse([...storage.data].find(([key]) => !key.includes(':batch:'))[1]);
        assert.equal(first.p_request_key, persisted.request.key);
        assert.equal(first.p_actor_id, 1);
        assert.equal(first.p_actor_password, actor.password);
        assert.equal(first.p_source, 'spreadsheet-import');
        assert.equal(JSON.stringify(persisted).includes(actor.password), false);
        const saved = await imports.persistDcfImportRows(args(storage, { rows: [{ ...row, expenses: [{ id: Date.now(), amount: 999 }] }], reason: 'New prompt text' }));
        assert.equal(bridge.calls.at(-1).args.p_request_key, first.p_request_key);
        assert.equal(bridge.calls.at(-1).args.p_correlation_id, first.p_correlation_id);
        assert.deepEqual(bridge.calls.at(-1).args.p_changes, first.p_changes);
        assert.equal(bridge.calls.at(-1).args.p_reason, first.p_reason);
        const count = receipts.size;
        records.set(saved[0].id, { ...saved[0], name: 'Later legitimate edit' });
        const repeated = await imports.persistDcfImportRows(args(storage));
        assert.equal(repeated[0].name, 'Later legitimate edit');
        assert.equal(bridge.calls.at(-1).name, 'read_dcf_state');
        assert.equal(receipts.size, count);
    });
    await check('partial batch reconciles each confirmed row and retries only unconfirmed rows', async () => {
        const storage = memoryStorage(); const reconciled = [];
        const batch = args(storage, { fileIdentity: 'partial', rows: [{ ...row, uid: 'PART-1' }, { ...row, uid: 'PART-2' }], onConfirmed: value => reconciled.push(value.uid) });
        rejectUid = 'PART-2';
        await assert.rejects(() => imports.persistDcfImportRows(batch), /1 row\(s\) confirmed.*PART-2.*Fixture denied/);
        assert.deepEqual(reconciled, ['PART-1']);
        const firstKey = bridge.calls.at(-1).args.p_request_key;
        const correlationId = bridge.calls.at(-1).args.p_correlation_id;
        rejectUid = undefined;
        await imports.persistDcfImportRows(batch);
        assert.equal(bridge.calls.at(-1).args.p_request_key, firstKey);
        assert.equal(bridge.calls.at(-1).args.p_correlation_id, correlationId);
        assert.equal([...records.values()].filter(value => value.uid === 'PART-1').length, 1);
        assert.equal([...records.values()].filter(value => value.uid === 'PART-2').length, 1);
    });
    await check('unknown operation cannot be replaced by changed file or explicit new operation', async () => {
        const storage = memoryStorage(); lose = true;
        await assert.rejects(() => imports.persistDcfImportRows(args(storage)), /Response lost/);
        const calls = bridge.calls.length;
        await assert.rejects(() => imports.persistDcfImportRows(args(storage, { fileIdentity: 'changed-file' })), /unknown outcome/);
        await assert.rejects(() => imports.persistDcfImportRows(args(storage, { operationId: crypto.randomUUID() })), /unknown outcome/);
        assert.equal(bridge.calls.length, calls);
        await imports.persistDcfImportRows(args(storage));
        const previous = bridge.calls.at(-1).args.p_request_key;
        await imports.persistDcfImportRows(args(storage, { operationId: crypto.randomUUID() }));
        assert.notEqual(bridge.calls.at(-1).args.p_request_key, previous);
    });
    await check('storage failure, missing actor/reason, duplicate UID and corrupted retry fail before sending', async () => {
        const before = bridge.calls.length;
        await assert.rejects(() => imports.persistDcfImportRows(args({ getItem() {}, setItem() { throw new Error('Storage full'); } })), /Storage full/);
        await assert.rejects(() => imports.persistDcfImportRows(args(memoryStorage(), { actor: null })), /signed-in/);
        await assert.rejects(() => imports.persistDcfImportRows(args(memoryStorage(), { reason: ' ' })), /reason is required/);
        await assert.rejects(() => imports.persistDcfImportRows(args(memoryStorage(), { rows: [row, row] })), /unique/);
        const storage = memoryStorage(); storage.setItem('4kis:dcf-import:v1:1:activities:IMPORT-A', '{');
        await assert.rejects(() => imports.persistDcfImportRows(args(storage)), /unreadable/);
        assert.equal(bridge.calls.length, before);
    });

    // These are actual installed PostgreSQL functions in disposable memory-only
    // PGlite, not mocked SQL. Failures identify parent-owned migration blockers.
    db = await createDcfRevisionFixture();
    await installDcfRevision(db, { mutations: true });
    let sqlLose = false;
    bridge.handler = async (name, payload) => {
        try {
            if (name === 'budget_target_schedule_capability') return { data: (await db.query('select budget_target_schedule_capability() value')).rows[0].value, error: null };
            const data = await transaction(db, () => rpc(db, name, payload));
            if (sqlLose) { sqlLose = false; throw new Error('SQL response lost after commit'); }
            return { data, error: null };
        } catch (error) { return { data: null, error: { message: error.message } }; }
    };
    const seedRows = await rows(db, 'activities');
    for(const entityType of ['office_requirements','staffing_requirements','other_program_expenses'])await check(`${entityType}: durable import retries preserve generated UID, plans and one independent revision`,async()=>{
        const source=(await rpc(db,'read_dcf_state',{p_actor_id:1,p_actor_password:actor.password,p_entity_type:entityType,p_parent_id:1})).record;
        const planned=Object.fromEntries(Object.entries(source).filter(([key])=>!/^actual|^obligations$|^disbursements$/.test(key)));
        if(planned.expenses)planned.expenses=planned.expenses.map(line=>Object.fromEntries(Object.entries(line).filter(([key])=>!/^actual|^obligations$|^disbursements$/.test(key))));
        const storage=memoryStorage(),fileIdentity=`pm-${entityType}`;
        const uid=imports.dcfImportRowUid(entityType,1,fileIdentity,0,`PM-IMPORT-${entityType}`,storage);
        const input=args(storage,{entityType,fileIdentity,rows:[{...planned,uid}]});
        sqlLose=true;
        await assert.rejects(()=>imports.persistDcfImportRows(input),/SQL response lost/);
        const request=bridge.calls.at(-1).args;
        const retryUid=imports.dcfImportRowUid(entityType,1,fileIdentity,0,'DIFFERENT-GENERATED-UID',storage);
        assert.equal(retryUid,uid);
        const [saved]=await imports.persistDcfImportRows({...input,rows:[{...planned,uid:retryUid}]});
        assert.equal(saved.uid,uid);assert.equal(bridge.calls.at(-1).args.p_request_key,request.p_request_key);
        const versions=(await db.query('select snapshot from dcf_record_revisions where entity_type=$1 and parent_id=$2',[entityType,saved.id])).rows;
        assert.equal(versions.length,1);assert.equal(versions[0].snapshot.record.uid,uid);
        assert.equal((await db.query(`select count(*)::int n from ${entityType} where uid=$1`,[uid])).rows[0].n,1);
    });
    const sqlRecord = { ...row, uid: 'SQL-IMPORT', expenses: [{ ...plannedLine(321), actualObligationAmount: 0, obligations: [] }] };
    let sqlSaved;
    await check('SQL import commits one full revision, retains UID/reference labels/targets and existing business rows', async () => {
        const storage = memoryStorage(); sqlLose = true;
        const input = args(storage, { fileIdentity: 'sql', rows: [sqlRecord] });
        await assert.rejects(() => imports.persistDcfImportRows(input), /SQL response lost/);
        const firstKey = bridge.calls.at(-1).args.p_request_key;
        [sqlSaved] = await imports.persistDcfImportRows(input);
        assert.equal(bridge.calls.at(-1).args.p_request_key, firstKey);
        assert.equal(sqlSaved.uid, sqlRecord.uid);
        assert.deepEqual(sqlSaved.expenses[0].targetObligationSchedules, sqlRecord.expenses[0].targetObligationSchedules);
        assert.deepEqual(sqlSaved.expenses[0].targetDisbursementSchedules, sqlRecord.expenses[0].targetDisbursementSchedules);
        assert.equal(sqlSaved.encodedBy, 'Fixture Admin');
        assert.deepEqual((await rows(db, 'activities')).filter(record => seedRows.some(seed => seed.id === record.id)), seedRows);
        const list = await rpc(db, 'list_dcf_revisions', { p_actor_id: 1, p_actor_password: actor.password, p_entity_type: 'activities', p_parent_id: sqlSaved.id, p_limit: 10 });
        assert.equal(list.total, 1);
        const revision = (await db.query('select operation_id,correlation_id from dcf_record_revisions where parent_id=$1 and entity_type=$2',[sqlSaved.id,'activities'])).rows[0];
        assert.equal(revision.operation_id, firstKey);
        assert.equal(revision.correlation_id, bridge.calls.find(call=>call.args.p_request_key===firstKey).args.p_correlation_id);
        assert.equal((await db.query(`select count(*)::int n from activities where uid='SQL-IMPORT'`)).rows[0].n, 1);
    });
    await check('SQL batch correlation persists across parents and rejects request reassignment without business writes', async () => {
        const firstCall = bridge.calls.length;
        const saved = await imports.persistDcfImportRows(args(memoryStorage(), { fileIdentity: 'correlated-sql',
            rows: [{ ...sqlRecord, uid:'CORRELATED-1' }, { ...sqlRecord, uid:'CORRELATED-2' }] }));
        const calls = bridge.calls.slice(firstCall).filter(call=>call.name==='commit_dcf_change');
        assert.equal(calls.length,2);
        assert.equal(calls[0].args.p_correlation_id,calls[1].args.p_correlation_id);
        assert.notEqual(calls[0].args.p_request_key,calls[1].args.p_request_key);
        const versions=(await db.query('select operation_id,correlation_id from dcf_record_revisions where entity_type=$1 and parent_id=any($2::bigint[])',['activities',saved.map(row=>row.id)])).rows;
        assert.equal(versions.length,2);
        assert.deepEqual(new Set(versions.map(row=>row.correlation_id)),new Set([calls[0].args.p_correlation_id]));
        const before=await rows(db,'activities');
        await assert.rejects(()=>transaction(db,()=>rpc(db,'commit_dcf_change',{...calls[0].args,p_correlation_id:crypto.randomUUID()})),/different operation/);
        assert.deepEqual(await rows(db,'activities'),before);
    });
    await check('SQL blocks another request/device importing an existing UID without updating it [SERVER CONTRACT]', async () => {
        const before = await rows(db, 'activities');
        await assert.rejects(() => imports.persistDcfImportRows(args(memoryStorage(), { fileIdentity: 'different-device', rows: [{ ...sqlRecord, name: 'Must not overwrite' }] })), /UID|already exists|duplicate/i);
        assert.deepEqual(await rows(db, 'activities'), before);
    });
    await check('SQL intentionally imported Subproject completion/counts survive with new server encoding [SERVER CONTRACT]', async () => {
        const [saved] = await imports.persistDcfImportRows(args(memoryStorage(), { entityType: 'subprojects', fileIdentity: 'sp-actual', rows: [{ uid: 'SP-IMPORT-ACTUAL',
            name: 'Legacy actual import', operatingUnit: 'RFO I', status: 'Completed', fundSourceUid: 'FS-000001', fundSource: '4K Fund',
            actualCompletionDate: '2025-02-01', actualMaleBeneficiaries: 3, actualFemaleBeneficiaries: 4, actualFourPsBeneficiaries: 2,
            details: [{ id: 700, particulars: 'Planned item', numberOfUnits: 2, pricePerUnit: 20 }] }] }));
        assert.equal(saved.actualCompletionDate, '2025-02-01');
        assert.equal(saved.actualMaleBeneficiaries, 3);
        assert.ok(Date.parse(saved.physical_accomplishment_submitted_at) > Date.parse('2026-01-01'));
    });
    await check('SQL import actuals require physical module and current period permission [SERVER CONTRACT]', async () => {
        await db.exec(`update roles_config set can_edit=false where role='User' and module='Accomplishment - Physical'`);
        const before = await rows(db, 'subprojects');
        await assert.rejects(() => imports.persistDcfImportRows(args(memoryStorage(), { entityType: 'subprojects', fileIdentity: 'denied-physical', actor: { id: 3, password: actor.password },
            rows: [{ uid: 'SP-DENIED-ACTUAL', name: 'Denied', operatingUnit: 'RFO I', status: 'Ongoing', actualCompletionDate: '2025-01-01', actualMaleBeneficiaries: 8, details: [] }] })), /permission|access|month|period|allowed/i);
        assert.deepEqual(await rows(db, 'subprojects'), before);
    });
    await check('SQL foreign OU and invalid credentials fail atomically', async () => {
        const before = await rows(db, 'activities');
        await assert.rejects(() => imports.persistDcfImportRows(args(memoryStorage(), { fileIdentity: 'foreign-ou', actor: { id: 3, password: actor.password }, rows: [{ ...row, uid: 'SQL-FOREIGN', operatingUnit: 'RFO II' }] })));
        await assert.rejects(() => imports.persistDcfImportRows(args(memoryStorage(), { fileIdentity: 'bad-auth', actor: { id: 1, password: 'wrong' }, rows: [{ ...row, uid: 'SQL-BAD-AUTH' }] })));
        assert.deepEqual(await rows(db, 'activities'), before);
    });
    await check('SQL revision failure rolls back parent, snapshot and receipt together; same request can retry', async () => {
        await db.exec(`create function fixture_fail_import_revision() returns trigger language plpgsql as $$ begin
            if new.snapshot->'record'->>'uid'='SQL-ROLLBACK' then raise exception 'Fixture revision failure'; end if; return new; end $$;
            create trigger fixture_fail_import_revision before insert on dcf_record_revisions for each row execute function fixture_fail_import_revision()`);
        const before = await rows(db, 'activities'); const receiptsBefore = await rows(db, 'dcf_mutation_requests');
        const storage = memoryStorage(); const input = args(storage, { rows: [{ ...row, uid: 'SQL-ROLLBACK' }] });
        try {
            await assert.rejects(() => imports.persistDcfImportRows(input), /Fixture revision failure/);
            assert.deepEqual(await rows(db, 'activities'), before);
            assert.deepEqual(await rows(db, 'dcf_mutation_requests'), receiptsBefore);
        } finally { await db.exec('drop trigger fixture_fail_import_revision on dcf_record_revisions; drop function fixture_fail_import_revision()'); }
        const key = bridge.calls.at(-1).args.p_request_key;
        await imports.persistDcfImportRows(input);
        assert.equal(bridge.calls.at(-1).args.p_request_key, key);
    });
    await check('real XLSX service -> mutation -> disposable SQL -> local-only confirmation, targets/legacy/partial retry', async () => {
        const service = await server.ssrLoadModule('/components/mainfunctions/ImportExportService.ts');
        const alerts = []; const storage = memoryStorage();
        const originals = Object.fromEntries(['XLSX', 'window', 'alert', 'prompt', 'FileReader', 'localStorage'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
        let captured;
        Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
        globalThis.XLSX = { ...XLSX, writeFile: book => { captured = book; } };
        globalThis.window = { XLSX: globalThis.XLSX };
        globalThis.alert = message => alerts.push(message);
        globalThis.prompt = () => 'Explicit fixture import reason';
        let uploadPromise;
        globalThis.FileReader = class { readAsArrayBuffer(file) { uploadPromise = this.onload({ target: { result: file.buffer } }); } };
        const refs = [{ uid: 'FS-000001', label: '4K Fund', is_active: true }];
        const uacs = { MOOE: { Travel: { '502': 'Travel expenses' } } };
        const ipos = [{ id: 1, name: 'Frozen IPO Label', location: 'Fixture town', lat: 1, lng: 2 }];
        const user = { ...actor, fullName: 'Fixture Admin', operatingUnit: 'NPMO', role: 'Super Admin' };
        const upload = async (type, workbook, existing = []) => {
            let saved = existing; let reconciliation = 0;
            const event = { target: { files: [{ buffer: XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) }] } };
            const setter = () => { throw new Error('Writing setter replay'); };
            const reconcile = records => { reconciliation++; saved = type === 'activities' ? [...saved.filter(value => !records.some(row => row.id === value.id)), ...records] : records; };
            const invoke = () => type === 'activities'
                ? service.handleActivitiesUpload(event, existing, setter, ipos, () => {}, () => {}, uacs, user, refs, reconcile)
                : service.handleSubprojectsUpload(event, existing, setter, ipos, () => {}, () => {}, uacs, user, false, refs, reconcile);
            invoke(); invoke(); // repeated event before the first read resolves
            await uploadPromise;
            return { saved, reconciliation };
        };
        try {
            const targetLine = { ...plannedLine(555), actualDeliveryDate: undefined };
            service.downloadActivitiesReport([{ ...row, id: 500, uid: 'XLSX-ACTIVITY', date: '2026-11-01', expenses: [targetLine] }], refs);
            const activityBook = captured;
            const activity = await upload('activities', activityBook);
            assert.equal(activity.reconciliation, 1, alerts.join('\n'));
            assert.deepEqual(activity.saved[0].expenses[0].targetObligationSchedules, targetLine.targetObligationSchedules);
            assert.deepEqual(activity.saved[0].expenses[0].targetDisbursementSchedules, targetLine.targetDisbursementSchedules);
            assert.deepEqual(activity.saved[0].participating_ipo_ids, [1]);
            const beforeRepeat = (await rows(db, 'dcf_record_revisions')).length;
            const repeated = await upload('activities', activityBook, activity.saved);
            assert.equal(repeated.saved.length, 1);
            assert.equal((await rows(db, 'dcf_record_revisions')).length, beforeRepeat);
            service.downloadSubprojectsReport([{ id: 501, uid: 'XLSX-SUBPROJECT', name: 'XLSX Subproject', operatingUnit: 'RFO I', fundingYear: 2026,
                indigenousPeopleOrganization: ipos[0].name, fundSourceUid: refs[0].uid, fundSource: refs[0].label,
                status: 'Proposed', details: [targetLine], subprojectCommodities: [] }], refs);
            const subproject = await upload('subprojects', captured);
            assert.equal(subproject.reconciliation, 1, alerts.join('\n'));
            assert.equal(subproject.saved[0].ipo_id, 1);
            assert.equal(subproject.saved[0].operatingUnit, 'NPMO');
            assert.deepEqual(subproject.saved[0].details[0].targetDisbursementSchedules, targetLine.targetDisbursementSchedules);
            const legacy = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(legacy, XLSX.utils.json_to_sheet([
                { uid: 'XLSX-LEGACY-1', type: 'Training', component: 'Program Management', name: 'Old format', date: '2026-11-01', expense_amount: 100, expense_obligationMonth: '2026-10-01' },
                { uid: 'XLSX-LEGACY-2', type: 'Activity', component: 'Program Management', name: 'Old format 2', date: '2026-11-02' },
            ]), 'Activities Data');
            const realHandler = bridge.handler;
            bridge.handler = async (name, payload) => payload?.p_changes?.uid === 'XLSX-LEGACY-2' ? { data: null, error: { message: 'Partial import fixture rejection' } } : realHandler(name, payload);
            const partial = await upload('activities', legacy);
            assert.equal(partial.saved.length, 1);
            assert.equal(partial.saved[0].expenses[0].targetScheduleVersion, undefined);
            assert.match(alerts.join('\n'), /1 row\(s\) confirmed.*Partial import fixture rejection/);
            bridge.handler = realHandler;
            const complete = await upload('activities', legacy, partial.saved);
            assert.equal(complete.saved.length, 2);
            assert.equal((await db.query(`select count(*)::int n from activities where uid='XLSX-LEGACY-1'`)).rows[0].n, 1);
        } finally {
            for (const [key, descriptor] of Object.entries(originals)) {
                if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
            }
        }
    });
    await check('legacy Training/Other Activity modules are nonwriters; imports do not directly insert DCF parents', async () => {
        for (const name of ['Trainings', 'OtherActivities']) assert.match(await readFile(new URL('../components/' + name + '.tsx', import.meta.url), 'utf8'), /^\s*export\s*\{\};\s*$/);
        const source = await readFile(new URL('../components/mainfunctions/ImportExportService.ts', import.meta.url), 'utf8');
        assert.doesNotMatch(source, /\.from\(['"](?:activities|subprojects)['"]\)\.insert/);
        assert.equal((source.match(/persistDcfImportRows</g) || []).length, 2);
        assert.match(source, /upsertActivitiesLocally\(\[row\]\)/);
    });
} finally {
    await db?.close();
    await server.close();
    delete globalThis.dcfImportTest;
}
console.log(`DCF import checks: ${passed} passed, ${failed} failed. SQL is memory-only; no production access.`);
if (failed) process.exitCode = 1;
