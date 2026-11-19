import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, entries: [] } });
let passed = 0;
const check = (name, run) => { run(); console.log('PASS ' + name); passed++; };
try {
    const list = await server.ssrLoadModule('/lib/gadPimmeList.ts');
    const scoring = await server.ssrLoadModule('/lib/gadPimmeScoring.ts');
    check('dynamic year range has no 2028 cap and includes the start/current years', () => {
        assert.deepEqual(list.getGadPimmeListYears(2026), [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019]);
        assert.equal(list.getGadPimmeListYears(2030)[0], 2030);
        assert.equal(list.getGadPimmeListYears(2030).at(-1), 2019);
    });
    check('missing, legacy and malformed preferences normalize safely without losing supported filters', () => {
        const defaults = { search: '', status: '', page: 1, pageSize: 10, summaryYear: 2026, additionalYears: [], sort: null };
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
    const completed = (total_score, extra = {}) => ({ status: 'Completed', answered_count: 22, total_score, ...extra });
    check('completed score validation matches the dashboard including zero and numeric strings', () => {
        for (const [input, expected] of [[0, 0], [20, 20], [' 17.25 ', 17.25], ['0', 0]]) {
            assert.equal(scoring.getGadPimmeCompletedScore(completed(input)), expected);
        }
        assert.equal(scoring.getGadPimmeCompletedScore(completed('8', { answered_count: '22' })), 8);
    });
    check('blank malformed incomplete and out-of-range scores cannot invent classifications or sort values', () => {
        for (const value of [null, undefined, '', ' ', 'bad', true, false, [], {}, NaN, Infinity, -1, 20.01, 'NaN']) {
            assert.equal(scoring.getGadPimmeCompletedScore(completed(value)), null);
        }
        for (const extra of [{ status: 'Incomplete' }, { status: null }, { answered_count: 21 }, { answered_count: null }, { answered_count: '' }, { answered_count: true }]) {
            assert.equal(scoring.getGadPimmeCompletedScore(completed(20, extra)), null);
        }
        assert.equal(scoring.getGadPimmeCompletedScore(), null);
    });
    check('classification boundaries retain the four exact dashboard labels', () => {
        for (const [score, label] of [[0, 'GAD-Invisible'], [3.99, 'GAD-Invisible'], [4, 'Promising GAD Prospects'], [7.99, 'Promising GAD Prospects'], [8, 'Gender-Sensitive'], [14.99, 'Gender-Sensitive'], [15, 'Gender-Responsive'], [20, 'Gender-Responsive']]) {
            assert.equal(scoring.getGadPimmeClassification(score), label);
        }
    });
    check('latest classification falls back past incomplete or invalid years without a five-year cutoff', () => {
        const historical = [
            { operating_unit: 'NPMO', year: 2019, ...completed(17) },
            { operating_unit: 'NPMO', year: 2025, ...completed(null) },
            { operating_unit: 'NPMO', year: 2026, ...completed(19, { status: 'Incomplete' }) },
            { operating_unit: 'NPMO', year: 2027, ...completed(20) },
            { operating_unit: 'RPMO 1', year: 2025, ...completed(18) },
            { operating_unit: 'RPMO 1', year: 2026, ...completed(0) },
            { operating_unit: 'RPMO 2', year: 2026, ...completed(18, { answered_count: 21 }) },
            { operating_unit: 'Outside', year: 2026, ...completed(20) },
        ];
        const before = structuredClone(historical);
        const scoped = list.scopeGadPimmeListAssessments(historical, ['NPMO', 'RPMO 1', 'RPMO 2'], 2026);
        const latest = list.getLatestGadPimmeAssessments(scoped.reverse(), 2026);
        assert.equal(latest.get('NPMO').year, 2019);
        assert.equal(latest.get('RPMO 1').total_score, 0);
        assert.equal(latest.get('RPMO 1').year, 2026);
        assert(!latest.has('RPMO 2'));assert(!latest.has('Outside'));
        assert.deepEqual(historical, before, 'readers never mutate stored data');
    });
    check('sort normalization preserves supported old preferences and drops malformed or hidden years', () => {
        const valid = { year: 2025, direction: 'descending' };
        assert.deepEqual(list.normalizeGadPimmeListState({ additionalYears: [2025], sort: valid }, 2026).sort, valid);
        for (const sort of [[], true, 'bad', { year: 2025, direction: 'ascending' }, { year: 2027, direction: 'ascending' }, { year: '2026', direction: 'ascending' }, { year: 2026, direction: 'random' }]) {
            assert.equal(list.normalizeGadPimmeListState({ sort }, 2026).sort, null);
        }
        assert.equal(list.normalizeGadPimmeListState({ sort: { year: 2026, direction: 'ascending' } }, 2029).sort, null);
    });
    check('score ordering is numeric stable missing-last in both directions and never changes its input', () => {
        const ous = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
        const values = [completed('10'), completed(2), completed(0), completed(20, { status: 'Incomplete' }), completed(null), completed(10), completed(20, { answered_count: 21 })];
        const byYear = new Map(ous.map((ou, index) => [ou + ':2026', values[index]]));
        assert.deepEqual(list.sortGadPimmeOperatingUnits(ous, byYear, { year: 2026, direction: 'ascending' }), ['C', 'B', 'A', 'F', 'D', 'E', 'G']);
        assert.deepEqual(list.sortGadPimmeOperatingUnits(ous, byYear, { year: 2026, direction: 'descending' }), ['A', 'F', 'B', 'C', 'D', 'E', 'G']);
        assert.deepEqual(list.sortGadPimmeOperatingUnits(ous, byYear, null), ous);
        assert.deepEqual(ous, ['A', 'B', 'C', 'D', 'E', 'F', 'G']);
    });
    console.log(`${passed} GAD list domain checks passed.`);
} finally { await server.close(); }
