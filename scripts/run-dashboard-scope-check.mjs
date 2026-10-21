import assert from 'node:assert/strict';
import { createServer } from 'vite';

const references = [
    { uid: 'FS-000001', label: '4K Fund', is_active: true },
    { uid: 'FS-000003', label: 'Corn', is_active: false },
    { uid: 'FS-000004', label: 'Renamed Rice', is_active: true },
];
const base = { operatingUnit: 'RPMO 1', fundingYear: 2025, tier: 'Tier 1', fundType: 'Continuing', status: 'Completed', actualCompletionDate: '2026-01-02', details: [] };
const rows = [
    { ...base, id: 1, fundSourceUid: 'FS-000004', fundSource: 'Rice' },
    { ...base, id: 2, fundSourceUid: null, fundSource: 'Rice' },
    { ...base, id: 3, fundSourceUid: null, fundSource: '   ' },
    { ...base, id: 4, fundingYear: 2027, fundSourceUid: 'FS-000003' },
    { ...base, id: 5, fundingYear: 2027, fundSource: 'Unmapped old source' },
    { ...base, id: 6, operatingUnit: 'RPMO 2', fundSourceUid: 'FS-000004' },
];
const before = JSON.stringify(rows);
const requests = [];
const tables = { ref_fund_sources: references, subprojects: rows, activities: rows.map(row => ({ ...row, type: 'Training', actualDate: '2026-01-02', expenses: [] })) };
tables.office_requirements = rows.map(({ fundingYear, ...row }) => ({ ...row, fundYear: fundingYear }));
globalThis.__filterClient = { from(table) {
    const filters = [];
    const query = {
        select() { return query; }, order() { return query; },
        eq(field, value) { filters.push({ type: 'eq', field, value }); return query; },
        is(field, value) { filters.push({ type: 'eq', field, value }); return query; },
        in(field, values) { filters.push({ type: 'in', field, values }); return query; },
        or(expression) { assert.equal(expression, 'fundSourceUid.is.null,fundSourceUid.eq.""'); filters.push({ type: 'legacy' }); return query; },
        range(start, end) {
            requests.push({ table, filters: structuredClone(filters) });
            const data = (tables[table] || []).filter(row => filters.every(filter => filter.type === 'legacy'
                ? row.fundSourceUid == null || row.fundSourceUid === ''
                : filter.type === 'in' ? filter.values.includes(row[filter.field]) : row[filter.field] === filter.value));
            return Promise.resolve({ data: data.slice(start, end + 1), error: null });
        },
    };
    return query;
} };
const vite = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, include: [], entries: [] }, plugins: [{
    name: 'scope-readonly-client', enforce: 'pre',
    resolveId(id) { if (id.replace(/\\/g, '/').endsWith('/supabaseClient')) return '\0scope-client'; },
    load(id) { if (id === '\0scope-client') return 'export const supabase=globalThis.__filterClient;'; },
}] });
try {
    const selection = await vite.ssrLoadModule('/lib/dashboardScope.ts');
    const sources = await vite.ssrLoadModule('/lib/fundSources.ts');
    const loader = await vite.ssrLoadModule('/lib/scopedDataFetch.ts');
    const { buildAuthorizedDataScope, getDataScopeModule } = await vite.ssrLoadModule('/lib/appDataScope.ts');
    const { aggregateHomepagePhysicalStats } = await vite.ssrLoadModule('/lib/physicalAggregation.ts');
    const { calculateAwardsDashboardData } = await vite.ssrLoadModule('/lib/awardRankings.ts');
    const { allSelection: all, selectedValues: selected } = selection;
    const defaults = { years: selected(['2025']), operatingUnits: selected(['RPMO 1']), tiers: all(), fundTypes: all(), fundSources: all() };
    const scope = { ...defaults, years: selected(['2027', '2025']), fundSources: selected(['FS-000003', 'FS-000004']) };
    assert.equal(selection.selectionMatches(selected([]), '2025'), false);
    assert.equal(selection.isValidDashboardScope({ ...defaults, years: selected([]) }), false);
    assert.deepEqual(selection.normalizeDashboardScope({ selectedYear: '2025', selectedOu: 'RPMO 1', selectedTier: 'All', selectedFundType: 'Continuing' }, defaults, {}).fundTypes, selected(['Continuing']));
    assert.deepEqual(selection.normalizeDashboardScope({ operatingUnits: all() }, defaults, {}, 'RPMO 2').operatingUnits, selected(['RPMO 2']));
    assert.deepEqual(selection.normalizeDashboardScope({}, defaults, {}, '').operatingUnits, selected([]));
    assert.equal(selection.dashboardScopeKey(scope), selection.dashboardScopeKey({ ...scope, years: selected(['2025', '2027']) }));
    assert.equal(sources.getFundSourceFilterValue(rows[2], references), sources.UNSPECIFIED_FUND_SOURCE_FILTER);
    assert.notEqual(sources.getFundSourceFilterValue(rows[4], references), sources.UNSPECIFIED_FUND_SOURCE_FILTER);
    const request = buildAuthorizedDataScope(selection.dashboardDataScope(scope, 'homepage_scope', true, 1), 1, 'NPMO', true);
    let result = await loader.loadScopedAppData(request);
    assert.deepEqual(result.subprojects.map(row => row.id), [1, 4, 2]);
    assert.deepEqual(result.officeReqs.map(row => row.id), [1, 4, 2]);
    for (const table of ['subprojects', 'activities', 'office_requirements']) {
        assert.equal(requests.filter(request => request.table === table).length, 2, 'UID branch plus bounded legacy branch, not Cartesian fetches');
        for (const query of requests.filter(request => request.table === table)) {
            assert(query.filters.some(filter => filter.type === 'in' && filter.field === 'operatingUnit' && filter.values.join() === 'RPMO 1'));
            assert(query.filters.some(filter => filter.type === 'in' && filter.field === (table === 'office_requirements' ? 'fundYear' : 'fundingYear') && filter.values.join() === '2025,2027'));
        }
    }
    result = await loader.loadScopedAppData({ ...request, fundSourceValues: [sources.UNSPECIFIED_FUND_SOURCE_FILTER] });
    assert.deepEqual(result.subprojects.map(row => row.id), [3]);
    result = await loader.loadScopedAppData({ ...request, fundSourceValues: undefined });
    assert.deepEqual(result.subprojects.map(row => row.id), [1, 2, 3, 4, 5]);
    const filtered = result.subprojects.filter(row => selection.matchesDashboardScope(row, scope, references));
    assert.deepEqual(filtered.map(row => row.id), [1, 2, 4]);
    const dcf = buildAuthorizedDataScope({ year: '2025', operatingUnit: 'RPMO 1', tier: 'All', fundType: 'All', scopeOwner: 'subprojects_dcf_scope' }, 1, 'NPMO', true);
    assert.equal(getDataScopeModule(dcf.scopeOwner), 'Subprojects');
    assert.equal(getDataScopeModule('physical_accomplishment_dcf_scope'), 'Accomplishment - Physical');
    assert.equal(getDataScopeModule('homepage_scope'), 'Dashboards');
    const moduleScopes = { Subprojects: true, Dashboards: false };
    assert.equal(buildAuthorizedDataScope(dcf, 1, 'NPMO', moduleScopes[getDataScopeModule(dcf.scopeOwner)]).canViewAllOus, true, 'DCF does not inherit Dashboard OU permissions');
    for (const field of ['years', 'operatingUnits', 'tiers', 'fundTypes', 'fundSourceValues']) assert.equal(dcf[field], undefined, 'DCF never inherits Homepage arrays');
    assert.notEqual(loader.getDataScopeKey(dcf), loader.getDataScopeKey(request));
    assert.equal(loader.getDataScopeKey(request), loader.getDataScopeKey({ ...request, years: ['2027', '2025'], fundSourceValues: ['FS-000004', 'FS-000003'] }));
    result = await loader.loadScopedAppData(dcf);
    assert.deepEqual(result.subprojects.map(row => row.id), [1, 2, 3]);
    const locked = buildAuthorizedDataScope({ ...request, canViewAllOus: false, operatingUnits: ['NPMO', 'RPMO 1'] }, 2, 'RPMO 2', true);
    assert.deepEqual(locked.operatingUnits, ['RPMO 2']);
    assert.deepEqual((await loader.loadScopedAppData(locked)).subprojects.map(row => row.id), [6]);
    const missingOu = buildAuthorizedDataScope({ ...request, canViewAllOus: false }, 2, undefined, true);
    assert.deepEqual(missingOu.operatingUnits, []);
    assert.equal((await loader.loadScopedAppData(missingOu)).subprojects.length, 0);
    const beforeEmpty = requests.length;
    assert.equal((await loader.loadScopedAppData({ ...request, fundSourceValues: [] })).subprojects.length, 0);
    assert.equal(requests.slice(beforeEmpty).filter(query => ['subprojects', 'activities'].includes(query.table)).length, 0);
    const registry = { ...request, registryOnly: true };
    const beforeRegistry = requests.length;
    assert.equal((await loader.loadScopedAppData(registry)).subprojects.length, 0);
    assert.equal(requests.slice(beforeRegistry).filter(query => ['subprojects', 'activities'].includes(query.table)).length, 0);
    assert.notEqual(loader.getDataScopeKey(registry), loader.getDataScopeKey(request));
    const actual = aggregateHomepagePhysicalStats({ subprojects: [rows[2]], activities: [], ipos: [] }, { year: '2025', operatingUnit: 'RPMO 1', tier: 'All', fundType: 'All' });
    assert.equal(actual.subprojects.actual, 1, 'Continuing FY 2025 completed CY 2026 remains a Homepage actual');
    const awardInput = { subprojects: [], trainings: [], otherActivities: [], officeReqs: [], staffingReqs: [], otherProgramExpenses: [], ipos: [], operatingUnitScope: ['RPMO 1', 'RPMO 2'] };
    const awards = calculateAwardsDashboardData(awardInput, '2025', {}, []);
    assert.deepEqual(awards.annual.overall.map(row => row.ou).sort(), ['RPMO 1', 'RPMO 2']);
    assert(awards.quarters.every(quarter => quarter.financial.every(row => awardInput.operatingUnitScope.includes(row.ou))));
    assert.equal(JSON.stringify(rows), before, 'Read-only filtering never changes source records');
    console.log('PASS: normalized selections, UID/legacy/blank historical sources, bounded multi-value queries, independent DCF scope, cache identity, OU clamps, registry-only reads, cross-year Homepage completion and selected-OU awards. Mocked Supabase reads only.');
} finally { delete globalThis.__filterClient; await vite.close(); }
