import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, entries: [] } });
let passed = 0;
const check = (name, run) => { run(); console.log('PASS ' + name); passed++; };
try {
    const list = await server.ssrLoadModule('/lib/gadPimmeList.ts');
    check('dynamic year range has no 2028 cap and includes the start/current years', () => {
        assert.deepEqual(list.getGadPimmeListYears(2026), [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019]);
        assert.equal(list.getGadPimmeListYears(2030)[0], 2030);
        assert.equal(list.getGadPimmeListYears(2030).at(-1), 2019);
    });
    check('missing, legacy and malformed preferences normalize safely without losing supported filters', () => {
        const defaults = { search: '', status: '', page: 1, pageSize: 10, summaryYear: 2026, additionalYears: [] };
        for (const value of [null, false, 42, [], 'bad']) assert.deepEqual(list.normalizeGadPimmeListState(value, 2026), defaults);
        assert.deepEqual(list.normalizeGadPimmeListState({ search: 'RPMO', status: 'Incomplete', page: 2, pageSize: 20 }, 2026), { ...defaults, search: 'RPMO', status: 'Incomplete', page: 2, pageSize: 20 });
        assert.deepEqual(list.normalizeGadPimmeListState({ search: {}, status: ['Completed'], page: -3, pageSize: 7, summaryYear: 2027, additionalYears: [2026, 2025, 2025, 2019, 1900, 2027, '2024', {}, null, 2024.5] }, 2026), { ...defaults, additionalYears: [2025, 2019] });
        assert.equal(list.normalizeGadPimmeListState({ page: Infinity, summaryYear: '2025' }, 2026).summaryYear, 2026);
    });
    const rows = [
        { operating_unit: 'NPMO', year: 2026, status: 'Completed', total_score: 0 },
        { operating_unit: 'RPMO 1', year: 2026, status: 'Incomplete' },
        { operating_unit: 'NPMO', year: 2025, status: null },
        { operating_unit: 'RPMO 1', year: 2024, status: 'Completed', total_score: 12 },
        { operating_unit: 'Outside', year: 2023, status: 'Completed' },
        { operating_unit: 'NPMO', year: 2027, status: 'Completed' },
        { operating_unit: 'NPMO', year: 1900, status: 'Completed' },
    ];
    check('summary year discovery uses only valid visible assessment rows, retaining current year', () => {
        const scoped = list.scopeGadPimmeListAssessments(rows, ['NPMO'], 2026);
        assert.deepEqual(list.getGadPimmeSummaryYears(scoped, 2026), [2026, 2025]);
        assert.deepEqual(list.getGadPimmeSummaryYears([], 2026), [2026]);
        assert.deepEqual(list.scopeGadPimmeListAssessments(rows, [], 2026), []);
    });
    check('zero scores, saved unknown status and missing records use shared status semantics and conserve OU totals', () => {
        const visible = ['NPMO', 'RPMO 1', 'RPMO 2'];
        const scoped = list.scopeGadPimmeListAssessments(rows, visible, 2026);
        const map = new Map(scoped.map(row => [`${row.operating_unit}:${row.year}`, row]));
        assert.deepEqual(list.summarizeGadPimmeList(visible, map, 2026), { Completed: 1, Incomplete: 1, 'For Assessment': 1 });
        assert.deepEqual(list.summarizeGadPimmeList(visible, map, 2025), { Completed: 0, Incomplete: 1, 'For Assessment': 2 });
        assert.deepEqual(list.summarizeGadPimmeList([], map, 2026), { Completed: 0, Incomplete: 0, 'For Assessment': 0 });
    });
    check('rollover retains explicit extra columns and does not persist the old default as an extra', () => {
        const state = list.normalizeGadPimmeListState(null, 2026);
        assert.deepEqual(list.normalizeGadPimmeListState(state, 2029).additionalYears, []);
        assert.deepEqual(list.normalizeGadPimmeListState({ ...state, additionalYears: [2025] }, 2029).additionalYears, [2025]);
    });
    console.log(`${passed} GAD list domain checks passed.`);
} finally { await server.close(); }
