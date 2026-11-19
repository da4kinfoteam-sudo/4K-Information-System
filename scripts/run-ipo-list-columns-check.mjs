import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, entries: [] } });
let passed = 0;
const failures = [];
const check = (name, run) => {
    try { run(); console.log('PASS ' + name); passed++; }
    catch (error) { failures.push({ name, error }); console.error('FAIL ' + name + '\n' + error.stack); }
};
const freeze = value => {
    if (value && typeof value === 'object') {
        Object.values(value).forEach(freeze);
        Object.freeze(value);
    }
    return value;
};

try {
    const list = await server.ssrLoadModule('/lib/ipoListColumns.ts');
    const {
        IPO_DEFAULT_COLUMNS, IPO_LIST_COLUMNS, IPO_FLAG_FIELDS, IPO_FLAG_OPTIONS, IPO_NOT_RECORDED,
        ipoColumnByKey, isDefaultIpoColumn, visibleIpoColumns, createIpoColumnContext,
        ipoColumnLabel, ipoColumnValues, ipoColumnDisplay, ipoColumnOptions,
        processIpoList, normalizeIpoListPreferences: normalize, migrateIpoListPreferences: migrate,
        IPO_DEFAULT_SORT, normalizeIpoListSort, isIpoSortableColumn,
    } = list;
    const defaults = ['id', 'name', 'location', 'flags', 'commodities', 'levelOfDevelopment'];
    const optional = [
        'region', 'indigenousCulturalCommunity', 'ancestralDomainNo', 'registeringBody', 'registrationDate',
        'contactPerson', 'contactNumber', 'totalMembers', 'totalIpMembers', 'totalMaleMembers',
        'totalFemaleMembers', 'totalYouthMembers', 'totalSeniorMembers', 'total4PsMembers',
        'ffedisRegistrationNumber', 'ffedisRegistrationDate',
    ];
    const column = key => {
        assert(ipoColumnByKey.has(key), 'Missing registry column: ' + key);
        return ipoColumnByKey.get(key);
    };
    const row = (id, patch = {}) => ({
        id, name: 'Synthetic IPO ' + id, location: 'Sample City', region: 'Region A',
        indigenousCulturalCommunity: 'Sample ICC', ancestralDomainNo: 'AD-' + id,
        registeringBody: 'SEC', contactPerson: 'Contact ' + id, contactNumber: '000-' + id,
        registrationDate: '2024-02-29', commodities: [], levelOfDevelopment: 5,
        totalMembers: null, isWomenLed: false, isWithinGida: false, isWithinElcac: false,
        isWithScad: false, isF2c2Cluster: null, isFfedisRegistered: null,
        ffedisRegistrationNumber: null, ffedisRegistrationDate: null, ...patch,
    });
    const rows = freeze([
        row(1, { name: 'Alpha', isWomenLed: true, isWithinGida: true, totalMembers: 0,
            commodities: [{ particular: 'Rice', type: 'Crop' }, { particular: 'Secret Mango', type: 'Orchard' }, { particular: 'Rice', type: 'Crop' }] }),
        row(2, { name: 'Beta', region: 'Region B', isWomenLed: true, totalMembers: 12,
            isF2c2Cluster: true, isFfedisRegistered: true, ffedisRegistrationNumber: '0007-F/2026', ffedisRegistrationDate: '2024-02-29',
            contactPerson: 'Hidden Contact Needle', ancestralDomainNo: 'AD-LEGACY-NEEDLE', commodities: [{ particular: 'Rice', type: 'Crop' }] }),
        row(3, { name: 'Gamma', isWithinGida: true, totalMembers: 2, isFfedisRegistered: false,
            ffedisRegistrationNumber: 'HIDDEN-METADATA', ffedisRegistrationDate: '1999-12-31' }),
        row(4, { name: 'Delta', region: 'Region C', totalMembers: null, isWomenLed: null,
            ffedisRegistrationNumber: 'NULL-GATED-METADATA', ffedisRegistrationDate: '1998-12-31' }),
    ]);
    const levels = freeze({
        1: { ipo_id: 1, computed_level: 2, is_complete: true },
        2: { ipo_id: 2, manual_level: 1, is_complete: false, computed_level: 5 },
        3: { ipo_id: 3, is_carried_over: true, carried_over_level: 5, is_complete: false },
    });
    const subprojects = freeze([{ indigenousPeopleOrganization: 'Alpha' }, { indigenousPeopleOrganization: 'Alpha' }]);
    const activities = freeze([
        { type: 'Training', participatingIpos: ['Alpha', 'Beta', 'Alpha'] },
        { type: 'Activity', participatingIpos: ['Gamma'] },
        { type: 'Training', participatingIpos: null },
    ]);
    const context = createIpoColumnContext(levels, subprojects, activities);
    const visible = visibleIpoColumns([]);
    const ids = result => result.map(item => item.id);
    const process = (filters = {}, search = '', sort = null, columns = visible, source = rows, ctx = context) =>
        processIpoList(source, columns, ctx, filters, search, sort);
    const empty = { version: 1, optionalColumns: [], filters: {}, search: '' };

    check('registry includes every supported column once with usable metadata', () => {
        assert.deepEqual(IPO_DEFAULT_COLUMNS, defaults);
        assert.deepEqual(IPO_LIST_COLUMNS.map(item => item.key), [...defaults, ...optional]);
        assert.equal(ipoColumnByKey.size, defaults.length + optional.length);
        for (const item of IPO_LIST_COLUMNS) {
            assert.equal(ipoColumnByKey.get(item.key), item);
            assert(item.label && item.group && Number.isFinite(item.width) && item.width > 0);
            assert.equal(typeof item.value, 'function');
            assert.equal(isDefaultIpoColumn(item.key), defaults.includes(item.key));
        }
        assert.equal(isDefaultIpoColumn('obsolete'), false);
        assert.deepEqual(IPO_FLAG_FIELDS.map(([, label]) => label), ['Women-Led', 'GIDA', 'ELCAC', 'SCAD', 'F2C2 Cluster', 'FFEDIS Registered']);
        assert.deepEqual(IPO_FLAG_OPTIONS, ['Women-Led', 'GIDA', 'ELCAC', 'SCAD', 'F2C2 Cluster', 'FFEDIS Registered', 'With Subprojects', 'With Trainings']);
        assert.equal(column('flags').label, 'Indicators');
        assert.equal(IPO_LIST_COLUMNS.some(item => item.group === 'Indicators'), false);
        assert.equal(visible.reduce((sum, item) => sum + item.width, 0), 1150);
    });
    check('defaults stay visible and optional columns are deduplicated in registry order', () => {
        assert.deepEqual(visible.map(item => item.key), defaults);
        assert.deepEqual(visibleIpoColumns(['totalMembers', 'region', 'id', 'region', 'obsolete']).map(item => item.key), [...defaults, 'region', 'totalMembers']);
        assert.deepEqual(visibleIpoColumns(optional).map(item => item.key), [...defaults, ...optional]);
        assert.deepEqual(visibleIpoColumns([]).map(item => item.key), defaults);
    });
    check('missing, primitive and malformed preference roots safely yield defaults', () => {
        for (const value of [undefined, null, false, true, 0, 42, '', 'bad JSON', [], [1]]) assert.deepEqual(normalize(value), empty);
        for (const value of [null, false, 42, 'region', {}, []]) {
            assert.deepEqual(normalize({ optionalColumns: value, filters: value, search: {} }), empty);
        }
        assert.deepEqual(normalize({ version: 0, page: 99, regionFilter: 'Region A', flagFilter: { womenLed: true } }), empty);
    });
    check('normalization rejects malformed filters and hidden keys while preserving explicit empty selections', () => {
        const input = freeze({ optionalColumns: ['totalMembers', 'region', 'region', 'name', null, {}, 'obsolete'],
            filters: { name: ['Alpha', 'Alpha'], region: [], totalMembers: ['0'], contactPerson: ['hidden'],
                flags: ['Women-Led', 'GIDA'], commodities: ['Rice', 1], id: '1', location: null, levelOfDevelopment: {}, obsolete: ['bad'] }, search: ' Alpha ' });
        const expected = { version: 1, optionalColumns: ['region', 'totalMembers'],
            filters: { name: ['Alpha'], region: [], totalMembers: ['0'], flags: ['Women-Led', 'GIDA'] }, search: ' Alpha ' };
        assert.deepEqual(normalize(input), expected);
        assert.deepEqual(normalize(JSON.parse(JSON.stringify(expected))), expected);
        assert.deepEqual(normalize(expected), expected);
    });
    check('linked context deduplicates names and excludes non-Training activities', () => {
        assert.deepEqual([...context.withSubprojects], ['Alpha']);
        assert.deepEqual([...context.withTrainings], ['Alpha', 'Beta']);
        assert.equal(context.levels, levels);
        assert.deepEqual([...createIpoColumnContext({}, [], []).withTrainings], []);
    });
    check('ordinary values OR within a column and AND across columns; flags require every selected flag', () => {
        assert.deepEqual(ids(process({ region: ['Region A', 'Region B'] })), [1, 2, 3]);
        assert.deepEqual(ids(process({ region: ['Region A', 'Region B'], commodities: ['Rice', 'Secret Mango'] })), [1, 2]);
        assert.deepEqual(ids(process({ flags: ['Women-Led', 'GIDA'] })), [1]);
        assert.deepEqual(ids(process({ flags: ['Women-Led', 'With Subprojects', 'With Trainings'] })), [1]);
        assert.deepEqual(ids(process({ flags: ['With Trainings'], region: ['Region B'] })), [2]);
        assert.deepEqual(ids(process({ flags: ['F2C2 Cluster', 'FFEDIS Registered'] })), [2]);
        assert.deepEqual(ids(process({ flags: ['GIDA', 'With Trainings'] })), [1]);
        assert.deepEqual(ids(process({ obsolete: [] })), [1, 2, 3, 4]);
    });
    check('absent filter means all; explicit empty means none and survives serialization', () => {
        assert.deepEqual(ids(process()), [1, 2, 3, 4]);
        for (const key of ['name', 'region', 'flags', 'commodities', 'levelOfDevelopment']) {
            const preference = normalize(JSON.parse(JSON.stringify({ optionalColumns: ['region'], filters: { [key]: [] } })));
            assert.deepEqual(preference.filters[key], []);
            assert.deepEqual(process(preference.filters), []);
        }
    });
    check('search uses full arrays, raw and formatted values, trimming and legacy hidden search fields', () => {
        assert.deepEqual(ipoColumnDisplay(column('commodities'), rows[0], context), { text: 'Rice +1', fullText: 'Rice, Secret Mango' });
        assert.deepEqual(ids(process({}, '  SECRET MANGO  ')), [1]);
        assert.deepEqual(ids(process({}, 'orchard')), [1]);
        assert.deepEqual(ids(process({}, 'gida')), [1, 3]);
        assert.deepEqual(ids(process({}, 'hidden contact needle')), [2]);
        assert.deepEqual(ids(process({}, 'ad-legacy-needle')), [2]);
        assert.deepEqual(ids(process({ flags: ['GIDA'] }, 'Beta')), []);
        assert.deepEqual(ids(process({}, 'sample icc')), []);
        assert.deepEqual(ids(process({}, 'sample icc', null, visibleIpoColumns(['indigenousCulturalCommunity']))), [1, 2, 3, 4]);
    });
    check('null numeric values are distinct from zero in labels, options, filters, search and sorting', () => {
        const number = column('totalMembers');
        assert.equal(ipoColumnDisplay(number, rows[0], context).text, '0');
        assert.deepEqual(ipoColumnValues(number, rows[3], context), [IPO_NOT_RECORDED]);
        assert.equal(ipoColumnLabel(number, IPO_NOT_RECORDED), 'Not Recorded');
        assert.deepEqual(ipoColumnOptions(number, rows, context), [
            { value: '0', label: '0' }, { value: '2', label: '2' }, { value: '12', label: '12' }, { value: IPO_NOT_RECORDED, label: 'Not Recorded' },
        ]);
        assert.deepEqual(ids(process({ totalMembers: ['0'] })), [1]);
        assert.deepEqual(ids(process({ totalMembers: [IPO_NOT_RECORDED] })), [4]);
        assert.deepEqual(ids(process({}, '0', null, visibleIpoColumns(['totalMembers']))), [1]);
        assert.deepEqual(ids(process({}, '12', null, visibleIpoColumns(['totalMembers']))), [2]);
        assert.deepEqual(ids(process({}, '', { key: 'totalMembers', direction: 'ascending' })), [1, 3, 2, 4]);
        assert.deepEqual(ids(process({}, '', { key: 'totalMembers', direction: 'descending' })), [2, 3, 1, 4]);
    });
    check('consolidated indicators show only explicit true and preserve full previews and FFEDIS matching', () => {
        const indicators = column('flags');
        assert.deepEqual(indicators.value(rows[0], context), ['Women-Led', 'GIDA']);
        assert.equal(ipoColumnDisplay(indicators, rows[0], context).text, 'Women-Led +1');
        assert.equal(ipoColumnDisplay(indicators, rows[0], context).fullText, 'Women-Led, GIDA');
        assert.deepEqual(indicators.value(rows[3], context), []);
        assert.deepEqual(indicators.value(row(10, { isWomenLed: 'true', isFfedisRegistered: false }), context), []);
        assert.deepEqual(ids(process({ flags: ['Women-Led'] })), [1, 2]);
        assert.deepEqual(ids(process({ flags: ['FFEDIS Registered'] })), [2]);
        assert.deepEqual(ids(process({}, 'FFEDIS Registered')), [2]);
    });
    check('retired individual indicator preferences disappear without changing consolidated or unrelated filters', () => {
        const retired = IPO_FLAG_FIELDS.map(([key]) => key);
        const filters = Object.fromEntries(retired.map((key, index) => [key, index % 3 === 0 ? ['true'] : index % 3 === 1 ? ['false'] : [IPO_NOT_RECORDED]]));
        const input = freeze({ optionalColumns: [...retired, 'region', 'totalMembers', 'ffedisRegistrationNumber'],
            filters: { ...filters, flags: ['GIDA', 'FFEDIS Registered'], region: ['Region B'], totalMembers: ['0'] }, search: 'unchanged' });
        const expected = { version: 1, optionalColumns: ['region', 'totalMembers', 'ffedisRegistrationNumber'],
            filters: { flags: ['GIDA', 'FFEDIS Registered'], region: ['Region B'], totalMembers: ['0'] }, search: 'unchanged' };
        assert.deepEqual(normalize(input), expected);
        for (const key of retired) {
            assert.equal(ipoColumnByKey.has(key), false);
            assert.equal(isIpoSortableColumn(key), false);
            assert.deepEqual(normalizeIpoListSort({ key, direction: 'ascending' }), IPO_DEFAULT_SORT);
        }
        assert.deepEqual(normalize({ optionalColumns: retired, filters }), empty, 'No negative/unknown predicate is reinterpreted as a positive indicator');
        assert.equal(normalizeIpoListSort(null), IPO_DEFAULT_SORT);
        assert.equal(isIpoSortableColumn('flags'), false);
        assert.equal(isIpoSortableColumn('commodities'), false);
        assert.deepEqual(normalizeIpoListSort({ key: 'name', direction: 'ascending' }), { key: 'name', direction: 'ascending' });
    });
    check('FFEDIS metadata is gated by explicit true without erasing retained source values', () => {
        const cols = visibleIpoColumns(['ffedisRegistrationNumber', 'ffedisRegistrationDate']);
        for (const key of ['ffedisRegistrationNumber', 'ffedisRegistrationDate']) {
            assert.notEqual(column(key).value(rows[1], context), null);
            for (const item of [rows[0], rows[2], rows[3]]) {
                assert.equal(column(key).value(item, context), null);
                assert.deepEqual(ipoColumnValues(column(key), item, context), [IPO_NOT_RECORDED]);
            }
        }
        assert.deepEqual(ids(process({}, '0007-F/2026', null, cols)), [2]);
        for (const search of ['HIDDEN-METADATA', 'NULL-GATED-METADATA', '1999-12-31', '1998-12-31']) assert.deepEqual(process({}, search, null, cols), []);
        assert.deepEqual(ids(process({ ffedisRegistrationNumber: [IPO_NOT_RECORDED] })), [1, 3, 4]);
        assert.equal(column('ffedisRegistrationNumber').value(row(5, { isFfedisRegistered: 'true', ffedisRegistrationNumber: 'NOT-A-BOOLEAN' }), context), null);
        assert.equal(rows[2].ffedisRegistrationNumber, 'HIDDEN-METADATA');
    });
    check('date option values and persisted filters round trip without replacing ISO values with display labels', () => {
        const dates = freeze([row(10, { registrationDate: '2024-02-29' }), row(11, { registrationDate: '2026-01-01' }), row(12, { registrationDate: null })]);
        const date = column('registrationDate');
        const options = ipoColumnOptions(date, dates, context);
        assert(options.some(option => option.value === '2024-02-29' && option.label === 'Feb 29, 2024'));
        assert(options.some(option => option.value === '2026-01-01' && option.label === 'Jan 1, 2026'));
        for (const option of options) {
            const prefs = normalize(JSON.parse(JSON.stringify({ optionalColumns: ['registrationDate'], filters: { registrationDate: [option.value] } })));
            const matching = process(prefs.filters, '', null, visibleIpoColumns(prefs.optionalColumns), dates);
            assert.equal(matching.length, 1);
            assert.deepEqual(ipoColumnValues(date, matching[0], context), [option.value]);
        }
        assert.deepEqual(ids(process({}, 'Feb 29, 2024', null, visibleIpoColumns(['registrationDate']), dates)), [10]);
        assert.deepEqual(ids(process({}, '2024-02-29', null, visibleIpoColumns(['registrationDate']), dates)), [10]);
        const ffedis = normalize(JSON.parse(JSON.stringify({ optionalColumns: ['ffedisRegistrationDate'], filters: { ffedisRegistrationDate: ['2024-02-29'] } })));
        const ffedisColumns = visibleIpoColumns(ffedis.optionalColumns);
        assert.deepEqual(ids(process(ffedis.filters, 'Feb 29, 2024', null, ffedisColumns)), [2]);
        assert.deepEqual(ipoColumnOptions(column('ffedisRegistrationDate'), rows, context).map(option => option.value), ['2024-02-29', IPO_NOT_RECORDED]);
        assert.equal(ipoColumnLabel(date, '2026-02-30'), '2026-02-30');
    });
    check('options retain selected absent values and full commodity values rather than previews', () => {
        const selected = freeze(['No longer present']);
        const options = ipoColumnOptions(column('commodities'), rows, context, selected);
        assert.deepEqual(options.map(option => option.value), ['No longer present', 'Rice', 'Secret Mango', IPO_NOT_RECORDED]);
        assert(ipoColumnOptions(column('flags'), [], context).every(option => IPO_FLAG_OPTIONS.includes(option.value)));
        assert.deepEqual(selected, ['No longer present']);
    });
    check('effective LOD overrides stale row levels for values, filters, search and numeric sort', () => {
        assert.deepEqual(rows.map(item => column('levelOfDevelopment').value(item, context)), ['Level 2', 'Level 1', 'Level 5', 'For Assessment']);
        assert.deepEqual(ids(process({ levelOfDevelopment: ['Level 1', 'Level 2'] })), [1, 2]);
        assert.deepEqual(ids(process({}, 'level 1')), [2]);
        assert.deepEqual(ids(process({}, '', { key: 'levelOfDevelopment', direction: 'ascending' }, visible, rows.slice(0, 3))), [2, 1, 3]);
        assert.deepEqual(ids(process({}, '', { key: 'levelOfDevelopment', direction: 'descending' }, visible, rows.slice(0, 3))), [3, 1, 2]);
        const specialContext = createIpoColumnContext({ 1: { is_dropped: true, computed_level: 5 }, 2: { is_complete: false, answered_question_count: 2 }, 3: { is_complete: false, answered_question_count: 0 } }, [], []);
        assert.deepEqual(rows.map(item => column('levelOfDevelopment').value(item, specialContext)), ['Dropped', 'Incomplete', 'For Assessment', 'For Assessment']);
        assert.deepEqual(ids(process({ levelOfDevelopment: ['Dropped', 'Incomplete'] }, '', null, visible, rows, specialContext)), [1, 2]);
    });
    check('legacy migration retains search, all positive AND flags, commodity OR and effective LOD labels', () => {
        const legacy = freeze({ search: ' rice ', region: 'All', flags: { womenLed: true, withinGida: true, withinElcac: false, withScad: false,
            f2c2Cluster: false, ffedisRegistered: false, withSubprojects: true, withTrainings: true, obsolete: true },
        filters: { region: ['Region A', 'Region B'], commodities: ['Rice', 'Secret Mango'], levelOfDevelopment: ['1', '2', 'Dropped', 'Incomplete', 'For Assessment'], obsolete: ['x'] } });
        const prefs = migrate(legacy);
        assert.deepEqual(prefs, { version: 1, optionalColumns: ['region'], search: ' rice ', filters: {
            region: ['Region A', 'Region B'], commodities: ['Rice', 'Secret Mango'], levelOfDevelopment: ['Level 1', 'Level 2', 'Dropped', 'Incomplete', 'For Assessment'],
            flags: ['Women-Led', 'GIDA', 'With Subprojects', 'With Trainings'],
        } });
        assert.deepEqual(ids(process(prefs.filters, prefs.search, null, visibleIpoColumns(prefs.optionalColumns))), [1]);
        assert.deepEqual(normalize(JSON.parse(JSON.stringify(prefs))), prefs);
        assert.deepEqual(migrate({ flags: Object.fromEntries(IPO_FLAG_FIELDS.map(([, , key]) => [key, true])) }).filters.flags, IPO_FLAG_FIELDS.map(([, label]) => label));
    });
    check('legacy region migration preserves intersection, conflicting none and old empty-as-all semantics', () => {
        assert.deepEqual(migrate({ region: 'Region A', filters: { region: ['Region A', 'Region B'] } }).filters.region, ['Region A']);
        const conflict = migrate({ region: 'Region C', filters: { region: ['Region A', 'Region B'] } });
        assert.deepEqual(conflict.optionalColumns, ['region']);
        assert.deepEqual(conflict.filters.region, []);
        assert.deepEqual(process(conflict.filters), []);
        assert.deepEqual(migrate({ region: 'Region A' }).filters.region, ['Region A']);
        assert.deepEqual(migrate({ region: 'All', filters: { region: [], commodities: [], levelOfDevelopment: [] } }), empty);
        assert.deepEqual(migrate({ filters: { region: [null, 1, 'Region B'], commodities: [null, 'Rice'], levelOfDevelopment: ['5', null] } }).filters,
            { region: ['Region B'], commodities: ['Rice'], levelOfDevelopment: ['Level 5'] });
        for (const value of [null, [], 'bad', 42]) assert.deepEqual(migrate({ search: {}, region: {}, flags: value, filters: value }), empty);
        assert.equal(migrate({ search: 'Unmatched historical search' }).search, 'Unmatched historical search');
        assert.deepEqual(migrate({ flags: { womenLed: 'true', withinGida: 1, ffedisRegistered: false } }), empty);
    });
    check('processing and projection never mutate rows, nested arrays, filters or context inputs', () => {
        const before = structuredClone({ rows, levels, subprojects, activities });
        const filters = freeze({ commodities: ['Rice'], flags: ['Women-Led'] });
        const selected = freeze(['Retained value']);
        for (const item of IPO_LIST_COLUMNS) {
            rows.forEach(record => { ipoColumnValues(item, record, context); ipoColumnDisplay(item, record, context); });
            ipoColumnOptions(item, rows, context, selected);
            for (const direction of ['ascending', 'descending']) process({}, '', { key: item.key, direction }, IPO_LIST_COLUMNS);
        }
        process(filters, 'orchard');
        assert.deepEqual({ rows, levels, subprojects, activities }, before);
        const result = process({}, '', { key: 'name', direction: 'descending' });
        assert.notEqual(result, rows);
        assert.equal(result[0], rows[2]);
        assert.deepEqual(ids(rows), [1, 2, 3, 4]);
        assert.deepEqual(filters, { commodities: ['Rice'], flags: ['Women-Led'] });
        assert.deepEqual([...context.withSubprojects], ['Alpha']);
        assert.deepEqual([...context.withTrainings], ['Alpha', 'Beta']);
        assert.deepEqual(ids(process({}, '', { key: 'obsolete', direction: 'ascending' })), [1, 2, 3, 4]);
    });
    console.log(`${passed} IPO list column domain checks passed; ${failures.length} failed. Synthetic data only.`);
    if (failures.length) globalThis.process.exitCode = 1;
} finally { await server.close(); }
