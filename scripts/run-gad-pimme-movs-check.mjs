import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithEsbuild } from 'vite';

const source = await readFile('supabase/functions/_shared/googleDrive.ts', 'utf8');
const endpoint = await readFile('supabase/functions/gad-pimme-files-list/index.ts', 'utf8');
const names = ['gadPimmePermission', 'assertGadPimmeOuAccess', 'assertGadPimmeIdentity', 'listGadPimmeAssessmentMovs', 'requireGadPimmeViewer'];
const isolatedSource = names.map(name => {
    const start = source.search(new RegExp(`(?:export )?(?:async )?function ${name}\\(`));
    assert(start >= 0, name);
    return source.slice(start, source.indexOf('\n}', start) + 2).replace(/^export /, '');
}).join('\n');
const { code } = await transformWithEsbuild(isolatedSource, 'gad-pimme-movs.ts', { loader: 'ts', target: 'es2022' });
let calls = [], records = [{ id: 7, operating_unit: 'RPMO 1', year: 2025 }], failFiles = false;
const users = {
    1: { role: 'Super Admin', operatingUnit: 'NPMO', visibility_scope: 'All OUs' },
    2: { role: 'User', operatingUnit: 'RPMO 1', visibility_scope: 'Own OU' },
    3: { role: 'Denied', operatingUnit: 'RPMO 1', visibility_scope: 'Own OU' },
};
const files = Array.from({ length: 1201 }, (_, i) => ({ id: i + 1, assessment_id: 7, question_key: 'box16-1.1', file_id: String(i + 1), file_name: `MOV ${i}.pdf`, deleted_at: null }));
files.push({ id: 9999, assessment_id: 7, deleted_at: '2026-01-01' }, { id: 10000, assessment_id: 99, deleted_at: null });
const client = { from(table) {
    const filters = {}, nulls = [];
    const query = { select(columns) { calls.push({ table, columns }); return query; }, eq(key, value) { filters[key] = value; return query; }, is(key) { nulls.push(key); return query; }, order() { return query; },
        async maybeSingle() {
            if (table === 'roles_config') return { data: { can_view: filters.role !== 'Denied', visibility_scope: 'Own OU' }, error: null };
            return { data: records.find(record => Object.entries(filters).every(([key, value]) => record[key] === value)) || null, error: null };
        }, async range(start, end) {
            calls.push({ table, start, end, filters: { ...filters }, nulls: [...nulls] });
            return { data: failFiles ? null : files.filter(file => Object.entries(filters).every(([key, value]) => file[key] === value) && nulls.every(key => file[key] === null)).slice(start, end + 1), error: failFiles ? { message: 'Metadata failure' } : null };
        },
    };
    return query;
} };
const helpers = new Function('adminClient', 'fetchUser', 'GAD_PIMME_DRIVE_MODULE', 'GAD_PIMME_QUESTION_KEYS', `${code};return {listGadPimmeAssessmentMovs,requireGadPimmeViewer};`)(() => client, async id => { if (!users[id]) throw new Error('No session'); return users[id]; }, 'Gender and Development', new Set(['box16-1.1']));
const list = async (actor, ou = 'RPMO 1', year = 2025) => helpers.listGadPimmeAssessmentMovs(ou, year, await helpers.requireGadPimmeViewer(actor));
assert.equal((await list(2)).length, 1201, 'All scoped metadata returned beyond Supabase page cap');
assert.equal(calls.filter(call => 'start' in call).length, 3);
assert(calls.filter(call => 'start' in call).every(call => call.filters.assessment_id === 7 && call.nulls.includes('deleted_at')));
assert(calls.filter(call => call.table === 'gad_pimme_files' && call.columns).every(call => !call.columns.includes('*')), 'Only export metadata is selected');
await assert.rejects(() => list(2, 'NPMO'), /outside.*visibility/);
await assert.rejects(() => list(3), /permission to view/);
await assert.rejects(() => list(99), /No session/);
await assert.rejects(() => list(1, '', 2025), /operating unit is required/);
await assert.rejects(() => list(1, 'RPMO 1', 2500), /supported.*year/);
assert.equal((await list(1)).length, 1201);
assert.deepEqual(await list(2, 'RPMO 1', 2024), []);
failFiles = true;
await assert.rejects(() => list(2), /Metadata failure/);
assert.match(endpoint, /await requireGadPimmeViewer\(body.user_id\)/);
assert.match(endpoint, /body.all_questions === true/);
assert.match(endpoint, /listGadPimmeFiles\(body.operating_unit, body.year, body.question_key, user\)/, 'Existing per-question list contract remains available');
console.log('GAD PIMME assessment-wide MOV metadata checks passed: viewer/OU/year guards, deleted/foreign exclusion, pagination, projection and failure handling.');
