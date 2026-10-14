import assert from 'node:assert/strict';
import { createServer } from 'vite';

const vite = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [], entries: [] } });
try {
    const { aggregateGadIpoMembership: aggregate, reportedMembershipCount } = await vite.ssrLoadModule('/lib/gadIpoMembership.ts');
    const scope = { year: '2025', operatingUnits: ['NPMO'], tier: 'Tier 1', fundType: 'Continuing' };
    const ipo = (id, name = 'IPO ' + id, overrides = {}) => ({ id, name, totalMembers: 100, totalMaleMembers: 40, totalFemaleMembers: 60, isWomenLed: false, ...overrides });
    const ipos = [ipo(1, 'Renamed IPO', { isWomenLed: true }), ipo(2, 'Duplicate'), ipo(3, 'Duplicate'), ipo(4, 'Generic only')];
    const parent = (id, overrides = {}) => ({ id, operatingUnit: 'NPMO', fundingYear: 2025, tier: 'Tier 1', fundType: 'Continuing', status: 'Completed', workflow_status: 'APPROVED', ...overrides });
    const subproject = (id, overrides = {}) => parent(id, { ipo_id: 1, indigenousPeopleOrganization: 'Old name', details: [{ id: id * 10, isCompleted: true, actualDeliveryDate: '2026-08-01' }], ...overrides });
    const training = (id, overrides = {}) => parent(id, { type: 'Training', participating_ipo_ids: [1, 1], actualDate: '2026-09-01', ...overrides });
    const input = { ipos, subprojects: [subproject(10), subproject(11), subproject(10)], activities: [training(20), training(21), training(22), training(20)] };
    const before = JSON.stringify(input);
    let result = aggregate(input, scope);
    assert.equal(result.rows.length, 1);
    assert.deepEqual(result.total, { value: 100, reported: 1 });
    assert.equal(result.rows[0].subprojectsLinked, 2);
    assert.equal(result.rows[0].subprojectsCompleted, 2);
    assert.equal(result.rows[0].trainingsLinked, 3);
    assert.equal(result.rows[0].trainingsConducted, 3);
    assert.equal(JSON.stringify(input), before, 'No input mutation');
    assert.equal(aggregate(input, { ...scope, year: '2026' }).rows.length, 0);
    for (const change of [{ operatingUnits: [] }, { operatingUnits: ['RPMO 1'] }, { tier: 'Tier 2' }, { fundType: 'Current' }]) {
        assert.equal(aggregate(input, { ...scope, ...change }).rows.length, 0);
    }
    assert.equal(aggregate(input, { ...scope, tier: 'All', fundType: 'All' }).rows.length, 1);
    result = aggregate({ ipos, subprojects: [], activities: [training(30, { participating_ipo_ids: [1, 2, 3, 1] }), training(31, { type: 'Activity', participating_ipo_ids: [4] })] }, scope);
    assert.equal(result.rows.length, 4, 'Distinct same-named IDs and generic-only IPO are retained');
    assert.equal(result.total.value, 400);
    assert.equal(result.programs.trainingsLinked, 1, 'Unique-parent totals are not per-IPO relationship sums');
    assert.equal(result.rows.reduce((sum, row) => sum + row.trainingsLinked, 0), 3);
    assert.equal(result.rows.find(row => row.ipo.id === 4).trainingsLinked, 0);
    result = aggregate({ ipos, subprojects: [subproject(40, { ipo_id: 999, indigenousPeopleOrganization: 'Renamed IPO' }), subproject(41, { ipo_id: null, indigenousPeopleOrganization: 'Duplicate' }), subproject(42, { ipo_id: null, indigenousPeopleOrganization: ' renamed ipo ' })], activities: [training(43, { participating_ipo_ids: ['bad'], participatingIpos: ['Renamed IPO'] }), training(44, { participating_ipo_ids: [], participatingIpos: ['Generic only', 'Generic only'] })] }, scope);
    assert.deepEqual(result.rows.map(row => row.ipo.id).sort(), [1, 4]);
    assert.equal(result.diagnostics.unresolvedLinks, 3);
    assert.equal(result.diagnostics.ambiguousNames, 1);
    for (const excluded of [{ status: 'Cancelled' }, { workflow_status: 'PENDING' }, { isSavings: true }, { isRealignment: true }, { isTransferTargetExcluded: true }]) {
        assert.equal(aggregate({ ipos, subprojects: [subproject(50, excluded)], activities: [training(51, excluded)] }, scope).rows.length, 0);
    }
    assert.equal(aggregate({ ipos, subprojects: [], activities: [training(52, { workflow_status: undefined, expenses: [{ isSavings: true }, { supplementUid: 'sample' }] })] }, scope).total.value, 100);
    for (const status of ['Proposed', 'Ongoing', 'Completed']) {
        assert.equal(aggregate({ ipos, subprojects: [subproject(53, { status })], activities: [] }, scope).rows.length, 1);
    }
    for (const date of [null, '', 'not-a-date', '2026-02-30', '2026-09']) {
        result = aggregate({ ipos, subprojects: [subproject(60, { details: [{ id: 1, isCompleted: true, actualDeliveryDate: date }, { id: 2, isCompleted: true, actualDeliveryDate: '2026-08-01' }] })], activities: [training(61, { actualDate: date })] }, scope);
        assert.equal(result.programs.subprojectsCompleted, 0);
        assert.equal(result.programs.trainingsConducted, 0);
    }
    result = aggregate({ ipos, subprojects: [subproject(62, { details: [{ id: 1, actualDeliveryDate: '2026-08-01' }, { id: 2, isCompleted: false }] })], activities: [training(63, { status: 'Ongoing' })] }, scope);
    assert.equal(result.programs.subprojectsCompleted, 0);
    assert.equal(result.programs.trainingsConducted, 0);
    for (const invalid of [null, undefined, '', ' ', NaN, Infinity, -1, 1.5, false, {}, 'text']) assert.equal(reportedMembershipCount(invalid), null);
    assert.equal(reportedMembershipCount(0), 0);
    assert.equal(reportedMembershipCount('12'), 12);
    result = aggregate({ ipos: [ipo(1, 'Missing', { totalMembers: null, totalMaleMembers: null, totalFemaleMembers: null, isWomenLed: null })], subprojects: [subproject(70)], activities: [] }, scope);
    assert.equal(result.total.value, null);
    assert.equal(result.rows[0].womenLed, null);
    result = aggregate({ ipos: [ipo(1, 'Zero', { totalMembers: 0, totalMaleMembers: 0, totalFemaleMembers: 0 })], subprojects: [subproject(70)], activities: [] }, scope);
    assert.equal(result.total.value, 0);
    result = aggregate({ ipos: [ipo(1, 'Mismatch', { totalMembers: 120 })], subprojects: [subproject(70)], activities: [] }, scope);
    assert.equal(result.total.value, 120);
    assert.equal(result.male.value + result.female.value, 100);
    assert.equal(result.diagnostics.mismatchedTotals, 1);
    assert.equal(aggregate({ ipos, subprojects: [], activities: [] }, scope).total.value, 0);
    console.log('PASS: scoped membership, ID/name safety, deduplication, target exclusions, generic links, unique program totals, FY/CY completion evidence, unknown/zero/mismatched counts, immutable inputs.');
} finally { await vite.close(); }
