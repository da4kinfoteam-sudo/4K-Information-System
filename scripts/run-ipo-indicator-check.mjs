import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'vite';
import * as XLSX from 'xlsx';

const require = createRequire(path.join(process.env.PGLITE_RUNTIME || path.join(tmpdir(), '4kis-supplement-sql-runtime'), 'package.json'));
const { PGlite } = require('@electric-sql/pglite');
const db = new PGlite();
const writes = [], confirmed = [], alerts = [], logs = [], exports = [];
globalThis.__ipoClient = { from(table) { return { insert(rows) { assert.equal(table, 'ipos'); writes.push(structuredClone(rows)); return { select: async () => ({ data: rows.map((row, index) => ({ id: 100 + index, ...row })), error: null }) }; } }; } };
const vite = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, include: [], entries: [] }, plugins: [{
    name: 'ipo-readonly-fixture', enforce: 'pre',
    resolveId(id) { if (id.endsWith('/supabaseClient')) return '\0ipo-client'; },
    load(id) { if (id === '\0ipo-client') return 'export const supabase=globalThis.__ipoClient;'; },
}] });
try {
    const helpers = await vite.ssrLoadModule('/lib/ipoProfileIndicators.ts');
    const { normalizeIpoIndicators: normalize, buildIpoProfilePatch: patch, parseImportedIpoIndicators: parse } = helpers;
    assert.deepEqual(normalize({}), {});
    const legacy = { id: 1, name: 'Legacy IPO', registrationDate: '2020-02-02', workflow_status: 'APPROVED', commodities: [{ particular: 'Rice' }], totalMembers: 50,
        isF2c2Cluster: null, isFfedisRegistered: null, ffedisRegistrationNumber: null, ffedisRegistrationDate: null };
    const original = structuredClone(legacy);
    assert.deepEqual(patch(legacy, { ...legacy, name: 'Edited IPO', workflow_status: 'PENDING', created_at: 'do-not-replay' }), { name: 'Edited IPO' });
    assert.deepEqual(legacy, original);
    const active = normalize({ isF2c2Cluster: true, isFfedisRegistered: true, ffedisRegistrationNumber: '  0007-F/2026  ', ffedisRegistrationDate: '2026-10-26' });
    assert.equal(active.ffedisRegistrationNumber, '0007-F/2026');
    assert.equal(active.ffedisRegistrationDate, '2026-10-26');
    assert.deepEqual(normalize({ ...active, isFfedisRegistered: false }), { ...active, isFfedisRegistered: false });
    assert.throws(() => normalize({ ...active, ffedisRegistrationNumber: '' }), /required/);
    assert.throws(() => normalize({ ...active, ffedisRegistrationDate: '2026-02-30' }), /valid/);
    assert.equal(helpers.isIpoRegistrationDate('2024-02-29'), true);
    assert.equal(helpers.isIpoRegistrationDate('2026-02-29'), false);
    assert.deepEqual(parse({}, () => ''), {});
    assert.throws(() => parse({ isF2c2Cluster: 'maybe' }, () => ''), /TRUE or FALSE/);
    assert.throws(() => parse({ isFfedisRegistered: true }, () => ''), /required/);
    assert.equal(parse({ isFfedisRegistered: 'true', ffedisRegistrationNumber: '001', ffedisRegistrationDate: 1 }, () => '2026-10-26').ffedisRegistrationDate, '2026-10-26');

    await db.exec(`create table ipos(id bigint primary key,name text,"registrationDate" date,commodities jsonb,"totalMembers" integer); alter table ipos enable row level security; create policy read_fixture on ipos for select using(true); insert into ipos values(1,'Historical IPO','2020-02-02','[{"particular":"Rice"}]',50);`);
    const before = (await db.query('select to_jsonb(i) as row from ipos i')).rows[0].row;
    const migration = await readFile('supabase/migrations/202610260001_ipo_profile_indicators.sql', 'utf8');
    await db.exec(migration);
    const after = (await db.query('select to_jsonb(i) as row from ipos i')).rows[0].row;
    for (const key of helpers.IPO_INDICATOR_FIELDS) { assert.equal(after[key], null); delete after[key]; }
    assert.deepEqual(after, before, 'Installation preserves every old value');
    const columns = (await db.query(`select column_name,is_nullable,column_default,data_type from information_schema.columns where table_name='ipos' and column_name in ('isF2c2Cluster','isFfedisRegistered','ffedisRegistrationNumber','ffedisRegistrationDate')`)).rows;
    assert.equal(columns.length, 4); assert(columns.every(column => column.is_nullable === 'YES' && column.column_default === null));
    await db.query(`update ipos set "isFfedisRegistered"=true,"ffedisRegistrationNumber"='0007-F/2026',"ffedisRegistrationDate"='2026-10-26' where id=1`);
    const saved = (await db.query('select to_jsonb(i) as row from ipos i')).rows[0].row;
    await db.exec(migration);
    assert.deepEqual((await db.query('select to_jsonb(i) as row from ipos i')).rows[0].row, saved, 'Idempotent rerun preserves recorded indicators');
    assert.equal((await db.query(`select relrowsecurity from pg_class where oid='ipos'::regclass`)).rows[0].relrowsecurity, true);
    assert.equal((await db.query(`select count(*)::integer as count from pg_policies where tablename='ipos'`)).rows[0].count, 1);

    globalThis.XLSX = { ...(XLSX.default || XLSX), writeFile: (workbook, filename) => exports.push({ workbook, filename }) };
    globalThis.window = { XLSX: globalThis.XLSX };
    globalThis.alert = message => alerts.push(message);
    const service = await vite.ssrLoadModule('/components/mainfunctions/ImportExportService.ts');
    service.downloadIposTemplate();
    const template = exports.pop().workbook;
    const templateHeaders = XLSX.utils.sheet_to_json(template.Sheets['IPO Data'], { header: 1 })[0];
    for (const key of helpers.IPO_INDICATOR_FIELDS) assert(templateHeaders.includes(key));
    service.downloadIposReport([{ ...legacy, ...active }]);
    const report = XLSX.utils.sheet_to_json(exports.pop().workbook.Sheets['IPO Report'])[0];
    assert.equal(report['FFEDIS Registration Number'], '0007-F/2026');
    assert.equal(report['FFEDIS Registration Date'], '2026-10-26');
    const upload = async (rows, date1904 = false) => {
        const workbook = XLSX.utils.book_new();
        workbook.Workbook = { WBProps: { date1904 } };
        const sheet = XLSX.utils.json_to_sheet(rows);
        XLSX.utils.book_append_sheet(workbook, sheet, 'IPO Data');
        const keys = Object.keys(rows[0]);
        const numberIndex = keys.indexOf('ffedisRegistrationNumber');
        if (numberIndex >= 0 && typeof rows[0].ffedisRegistrationNumber === 'number') sheet[XLSX.utils.encode_cell({ r: 1, c: numberIndex })].z = '000000';
        const binary = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
        globalThis.FileReader = class { readAsArrayBuffer() { globalThis.importPromise = this.onload({ target: { result: binary } }); } };
        service.handleIposUpload({ target: { files: [{}], value: 'fixture.xlsx' } }, [legacy], () => { throw Error('Unexpected database-writing setter'); }, (...args) => logs.push(args), () => {}, [], [], rows => confirmed.push(rows));
        await globalThis.importPromise;
    };
    const row = { name: 'Imported IPO', region: '1', province: 'Ilocos Norte', municipality: 'Laoag', commodities: '[]' };
    await upload([{ ...row, isF2c2Cluster: 'TRUE', isFfedisRegistered: true, ffedisRegistrationNumber: '000-007/F', ffedisRegistrationDate: '2026-10-26' }]);
    assert.equal(writes.length, 1); assert.equal(confirmed.length, 1);
    assert.equal(confirmed[0][0].ffedisRegistrationNumber, '000-007/F');
    await upload([{ ...row, isFfedisRegistered: true, ffedisRegistrationNumber: 7, ffedisRegistrationDate: 46321 }]);
    assert.equal(writes[1][0].ffedisRegistrationNumber, '000007', 'Formatted numeric identifiers retain displayed zeros');
    assert.equal(writes[1][0].ffedisRegistrationDate, '2026-10-26');
    await upload([row]);
    for (const key of helpers.IPO_INDICATOR_FIELDS) assert.equal(key in writes[2][0], false, 'Legacy columns are omitted, not overwritten');
    const validWrites = writes.length;
    await upload([{ ...row, isFfedisRegistered: true }]);
    await upload([{ ...row, isF2c2Cluster: 'invalid' }]);
    assert.equal(writes.length, validWrites, 'Invalid imports never write');
    assert.equal(logs.length, 3, 'Only confirmed imports are logged');
    assert(alerts.some(message => message.includes('required')));
    await upload([{ ...row, isFfedisRegistered: true, ffedisRegistrationNumber: '000-DATE', ffedisRegistrationDate: 44859 }], true);
    assert.equal(writes.at(-1)[0].ffedisRegistrationDate, '2026-10-26', '1904 Excel dates retain their calendar date');
    for (const outcome of ['onerror', 'onabort', 'throw']) {
        const busy = [];
        globalThis.FileReader = class {
            readAsArrayBuffer() {
                if (outcome === 'throw') throw new Error('Sample read failure');
                this[outcome]();
            }
        };
        const target = { files: [{}], value: 'sample.xlsx' };
        service.handleIposUpload({ target }, [], () => { throw Error('Unexpected setter'); }, () => {}, value => busy.push(value), [], [], () => { throw Error('Unconfirmed read'); });
        assert.deepEqual(busy, [true, false]);
        assert.equal(target.value, '');
    }
    const app = await readFile('App.tsx', 'utf8');
    assert.match(app, /const handleIposSaved[\s\S]*?iposSync\.upsertLocalData\(confirmed\)/);
    assert.match(app, /onIposSaved=\{handleIposSaved\}/);
    console.log('PASS: nullable legacy-safe indicators, strict conditional validation, identifiers/date-only import-export, omitted legacy columns, single confirmed import reconciliation, additive/idempotent SQL and unchanged historical values/RLS. Isolated fixtures only.');
} finally {
    for (const key of ['XLSX', 'window', 'alert', 'FileReader', 'importPromise', '__ipoClient']) delete globalThis[key];
    await vite.close(); await db.close();
}
