import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const require = createRequire(import.meta.url);
const { chromium } = process.env.PLAYWRIGHT_NODE_MODULES
    ? require(path.join(process.env.PLAYWRIGHT_NODE_MODULES, 'playwright'))
    : require('playwright');
const screenshots = await mkdtemp(path.join(tmpdir(), '4kis-activity-ipo-ui-'));

// This server replaces all database/auth/save hooks with synthetic fixtures; it never imports the real client.
const mocks = {
    'supabaseClient': `export const supabase = { from(table) {
        let action = 'select', payload, id;
        const query = {
            insert(value) { action = 'insert'; payload = value[0]; return query; },
            update(value) { action = 'update'; payload = value; return query; },
            eq(key, value) { if (key === 'id') id = value; return query; },
            delete() { action = 'delete'; return query; },
            in() { return query; },
            select() { return query; }, single() { return query; },
            then(resolve, reject) { return new Promise(done => setTimeout(() => {
                if (window.fixture.fail) return done({ data: null, error: { message: 'Synthetic save failure' } });
                if (window.fixture.noRow) return done({ data: null, error: null });
                const row = { ...window.fixture.source, ...payload, id: id || 501 + window.fixture.writes.filter(write => write.table === 'activities').length, serverConfirmed: true };
                if (window.fixture.serverTitle !== undefined && !Object.hasOwn(payload || {}, 'activity_title')) row.activity_title = window.fixture.serverTitle;
                window.fixture.writes.push({ table, action, payload });
                if (table !== 'activities') return done({ data: [], error: null });
                window.fixture.stored = row;
                done({ data: action === 'insert' ? [row] : row, error: null });
            }, window.fixture.delay || 0)).then(resolve, reject); }
        }; return query;
    } };`,
    'contexts/AuthContext': `const user = { id: 1, role: 'Super Admin', fullName: 'Fixture Admin', operatingUnit: 'NPMO' };
        export const useAuth = () => ({ currentUser: user, hasAccess: () => !window.fixture.denied });`,
    'hooks/useDcfPolicyGuard': `export const normalizePolicyMonth = value => String(value || '').slice(0,7);
        export const useDcfPolicyGuard = () => ({
            getStatusDecision: () => ({ allowed: !window.fixture.denied }),
            getMonthDecision: () => ({ allowed: true }),
            getMonthLockMessage: () => '', isMonthSelectionAllowed: () => true,
            ensureDecisionAllowed: async decision => decision.allowed,
        });`,
    'hooks/useLogAction': `export const useLogAction = () => ({ logAction: () => {} });`,
    'hooks/useIpoHistory': `export const useIpoHistory = () => ({ addIpoHistory: async () => {} });`,
    'lib/financialObligationSync': `export const fetchFinancialObligationsForParent = async () => {
            window.fixture.fetches++; await new Promise(done => setTimeout(done, 250)); return [];
        };
        export const replaceFinancialObligationRecords = async () => { window.fixture.financialWrites++; };`,
};
const harness = `import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import ActivityEdit from '/components/ActivityEdit.tsx';
import { philippineRegions } from '/constants.tsx';
import { readScopedCache, writeScopedCache, updateCachedActivity } from '/lib/localScopedCache.ts';
import '/index.css';
import '/styles/main.css';
const ipos = [
    { id: 11, name: 'Original IPO', region: philippineRegions[0] },
    { id: 22, name: 'Replacement IPO with a long organization name for responsive truncation', region: philippineRegions[1] },
    { id: 33, name: 'Third IPO', region: philippineRegions[0] },
];
const base = { id: 101, uid: 'ACT-101', type: 'Activity', name: 'Subproject Monitoring', status: 'Proposed',
    reference_activity_id: 1, component: 'Program Management', date: '2026-08-01', endDate: '2026-08-01',
    description: '', location: 'Fixture location', operatingUnit: 'NPMO', fundingYear: 2026, fundType: 'Current', tier: 'Tier 1',
    fundSourceUid: 'FS-000001', fundSource: '4K Fund', participantsMale: 10, participantsFemale: 12,
    actualDate: '2026-08-01', actualParticipantsMale: 7, actualParticipantsFemale: 8,
    actualPWD: 0, actualMuslim: 0, actualLGBTQ: 0, actualSoloParent: 0, actualSenior: 0, actualYouth: 0,
    participating_ipo_ids: [11], participatingIpos: ['Original IPO'], workflow_status: 'APPROVED', history: [],
    expenses: [{ id: 901, amount: 1000, objectType: 'MOOE', expenseParticular: 'Training Expenses', uacsCode: '5020201000',
        obligations: [{ id: 1, date: '2026-08-01', amount: 200 }], disbursements: [{ id: 2, date: '2026-08-01', amount: 100 }] }],
};
window.checkActivityCache = async () => {
    const scope = { year: '2026', operatingUnit: 'NPMO', tier: 'Tier 1', fundType: 'Current', canViewAllOus: true, requestedBy: 1 };
    const otherScope = { ...scope, requestedBy: 2 };
    await writeScopedCache(scope, { activities: [base] });
    await writeScopedCache(otherScope, { activities: [base] });
    const updated = { ...base, participating_ipo_ids: [22], participatingIpos: [ipos[1].name] };
    await updateCachedActivity(1, updated);
    const current = await readScopedCache(scope);
    const other = await readScopedCache(otherScope);
    await updateCachedActivity(1, { ...updated, operatingUnit: 'RPMO 1' });
    const invalidated = await readScopedCache(scope);
    return { current: current.activities[0].participating_ipo_ids, other: other.activities[0].participating_ipo_ids, invalidated };
};
function Harness() {
    const [record, setRecord] = useState(base);
    const [mode, setMode] = useState('details');
    const [version, setVersion] = useState(0);
    window.loadFixture = (kind = 'ordinary', options = {}) => {
        const source = { ...structuredClone(base), ...options };
        if (kind === 'transferred') Object.assign(source, { status: 'Completed', budgetItemTransferId: 'fixture-transfer', isTransferTargetExcluded: true });
        if (kind === 'cloned') Object.assign(source, { uid: 'ACT-CLONE', actualDate: null, actualParticipantsMale: 0, actualParticipantsFemale: 0 });
        if (kind === 'training') Object.assign(source, { type: 'Training', name: 'Specific Training', reference_activity_id: 2 });
        window.fixture = { source, writes: [], saved: [], fetches: 0, financialWrites: 0, ...options };
        setRecord(source); setMode(options.mode || (kind === 'create' ? 'create' : 'details')); setVersion(value => value + 1);
    };
    if (!window.fixture) window.fixture = { source: base, writes: [], saved: [], fetches: 0, financialWrites: 0 };
    return <main style={{ maxWidth: 1100, margin: '0 auto', padding: 16 }}>
        <ActivityEdit key={version} mode={mode} activity={mode === 'create' ? undefined : record} ipos={ipos}
            onBack={() => { window.fixture.back = true; }}
            onUpdateActivity={row => { window.fixture.saved.push(row); }} uacsCodes={{}}
            referenceActivities={[{ id: 1, activity_name: 'Subproject Monitoring', component: 'Program Management', type: 'Activity' },
                { id: 2, activity_name: 'Program Management Training', component: 'Program Management', type: 'Training' }]}
            fundSources={[{ id: 1, uid: 'FS-000001', label: '4K Fund', is_active: true, sort_order: 0 }]} />
    </main>;
}
createRoot(document.getElementById('root')).render(<Harness />);`;
const server = await createServer({
    configFile: false, root: process.cwd(), appType: 'custom',
    resolve: { alias: { '@': process.cwd() } },
    server: { host: '127.0.0.1', port: 0 },
    optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom/client', 'lucide-react'], entries: [] },
    plugins: [{
        name: 'activity-ipo-synthetic-fixture', enforce: 'pre',
        resolveId(source) {
            if (source === '/activity-ipo-harness.tsx') return '\0activity-ipo-harness.tsx';
            for (const name of Object.keys(mocks)) {
                if (source.replace(/\\/g, '/').endsWith('/' + name)) return '\0mock-' + name + '.ts';
            }
        },
        load(id) {
            if (id === '\0activity-ipo-harness.tsx') return transformWithEsbuild(harness, 'activity-ipo-harness.tsx', { loader: 'tsx', jsx: 'automatic' });
            for (const [name, code] of Object.entries(mocks)) if (id === '\0mock-' + name + '.ts') return code;
        },
        configureServer(vite) {
            vite.middlewares.use(async (request, response, next) => {
                if (request.url !== '/fixture') return next();
                response.setHeader('Content-Type', 'text/html');
                response.end(await vite.transformIndexHtml('/fixture', '<html><body><div id="root"></div><script type="module" src="/activity-ipo-harness.tsx"></script></body></html>'));
            });
        },
    }, react(), tailwindcss()],
});
let browser;
try {
    await server.listen();
    browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    const dialogs = [];
    await page.route('https://psgc.gitlab.io/api/**', route => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify([{ code: 'fixture-region', name: 'Fixture Region', regionCode: 'fixture-region' }]),
    }));
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => { dialogs.push(dialog.message()); return dialog.accept(); });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/fixture`);
    await page.waitForFunction(() => typeof window.loadFixture === 'function');
    const cache = await page.evaluate(() => window.checkActivityCache());
    assert.deepEqual(cache.current, [22]);
    assert.deepEqual(cache.other, [11]);
    assert.equal(cache.invalidated, null);

    const replaceIpo = async () => {
        await page.getByRole('button', { name: 'Remove Original IPO', exact: true }).click();
        await page.getByLabel('Available IPOs', { exact: true }).selectOption(['22']);
        await page.getByRole('button', { name: 'Add', exact: true }).click();
    };
    for (const kind of ['ordinary', 'cloned', 'transferred', 'training']) {
        await page.evaluate(kind => window.loadFixture(kind), kind);
        await page.getByRole('button', { name: 'Remove Original IPO', exact: true }).waitFor();
        await replaceIpo();
        if (kind !== 'training') await page.getByLabel('Activity Title (optional)', { exact: true }).fill('  Fixture custom visit  ');
        else assert.equal(await page.locator('input[name="activity_title"]').count(), 0);
        await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
        await page.waitForFunction(() => window.fixture.saved.length === 1);
        const result = await page.evaluate(() => window.fixture);
        assert.equal(result.writes.length, 1);
        assert.deepEqual(result.stored.participating_ipo_ids, [22]);
        assert.equal(result.saved[0].serverConfirmed, true);
        assert.equal(result.financialWrites, 0);
        assert.equal(result.fetches, 0);
        assert.equal(result.stored.name, result.source.name);
        assert.equal(result.stored.activity_title ?? null, kind === 'training' ? null : 'Fixture custom visit');
        assert.deepEqual(result.stored.expenses, result.source.expenses);
        assert.equal(result.stored.actualDate, result.source.actualDate);
        assert.equal(result.source.participating_ipo_ids[0], 11);
        if (kind === 'transferred') assert.equal(result.stored.budgetItemTransferId, 'fixture-transfer');
        await page.evaluate(() => window.loadFixture('ordinary', window.fixture.stored));
        await page.getByRole('button', { name: /^Remove Replacement IPO/ }).waitFor();
        assert.equal(await page.getByRole('button', { name: 'Remove Original IPO', exact: true }).count(), 0);
    }
    await page.evaluate(() => window.loadFixture('ordinary', { activity_title: 'Clear me' }));
    await page.getByLabel('Activity Title (optional)', { exact: true }).fill('   ');
    await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
    await page.waitForFunction(() => window.fixture.saved.length === 1);
    assert.equal(await page.evaluate(() => window.fixture.stored.activity_title), null);

    await page.evaluate(() => window.loadFixture('training'));
    const typeSelect = page.locator('select').filter({ has: page.locator('option[value="Subproject Monitoring"]') });
    await typeSelect.selectOption('Subproject Monitoring');
    await page.getByLabel('Activity Title (optional)', { exact: true }).fill('Generic override');
    await typeSelect.selectOption('Program Management Training');
    assert.equal(await page.locator('input[name="name"]').inputValue(), 'Specific Training');
    assert.equal(await page.locator('input[name="activity_title"]').count(), 0);
    await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
    await page.waitForFunction(() => window.fixture.saved.length === 1);
    assert.equal(await page.evaluate(() => window.fixture.stored.name), 'Specific Training');
    for (const mode of ['details', 'expenses', 'accomplishment']) {
        await page.evaluate(mode => window.loadFixture('ordinary', { mode, activity_title: 'Stale draft', serverTitle: 'Latest saved title' }), mode);
        await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
        await page.waitForFunction(() => window.fixture.saved.length === 1);
        const actualOnly = await page.evaluate(() => window.fixture);
        assert.equal(Object.hasOwn(actualOnly.writes.find(write => write.table === 'activities').payload, 'activity_title'), false);
        assert.equal(actualOnly.stored.activity_title, 'Latest saved title');
    }
    await page.evaluate(() => window.loadFixture('ordinary', { fail: true }));
    await page.getByLabel('Activity Title (optional)', { exact: true }).fill('Keep failed draft');
    await replaceIpo();
    await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('button[type="submit"]').disabled);
    assert.equal(await page.evaluate(() => window.fixture.saved.length), 0);
    assert.equal(await page.getByLabel('Activity Title (optional)', { exact: true }).inputValue(), 'Keep failed draft');
    await page.getByRole('button', { name: /^Remove Replacement IPO/ }).waitFor();

    await page.evaluate(() => window.loadFixture('ordinary', { noRow: true }));
    await replaceIpo();
    await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('button[type="submit"]').disabled);
    assert.equal(await page.evaluate(() => window.fixture.saved.length), 0);
    await page.getByRole('button', { name: /^Remove Replacement IPO/ }).waitFor();

    await page.evaluate(() => window.loadFixture('ordinary', { denied: true }));
    await replaceIpo();
    await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('button[type="submit"]').disabled);
    assert.equal(await page.evaluate(() => window.fixture.writes.length), 0);

    await page.evaluate(() => window.loadFixture('ordinary', { delay: 300 }));
    await page.getByRole('button', { name: 'Remove Original IPO', exact: true }).click();
    await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Saving...', exact: true }).isDisabled(), true);
    await page.waitForFunction(() => window.fixture.saved.length === 1);
    assert.deepEqual(await page.evaluate(() => window.fixture.stored.participating_ipo_ids), []);
    assert.deepEqual(await page.evaluate(() => window.fixture.stored.participatingIpos), []);

    await page.evaluate(() => window.loadFixture('create'));
    await page.locator('select[name="component"]').selectOption('Program Management');
    await page.locator('select').filter({ has: page.locator('option[value="Subproject Monitoring"]') }).selectOption('Subproject Monitoring');
    await page.locator('select').filter({ has: page.locator('option[value="fixture-region"]') }).selectOption('fixture-region');
    await page.locator('select').filter({ has: page.locator('option[value="Repeating"]') }).selectOption('Repeating');
    await page.getByLabel('Activity Title (optional)', { exact: true }).fill('Repeat visit');
    await page.locator('.activity-ipo-selector__filters select').selectOption('All');
    await page.locator('input[name="date"]').fill('2026-10-15');
    await page.getByLabel('Available IPOs', { exact: true }).selectOption(['22']);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByRole('button', { name: 'Add to Schedule', exact: true }).click();
    await page.locator('input[name="date"]').fill('2026-10-16');
    await page.getByLabel('Available IPOs', { exact: true }).selectOption(['33']);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByRole('button', { name: 'Add to Schedule', exact: true }).click();
    await page.getByRole('button', { name: 'Create Activity', exact: true }).click();
    await page.waitForFunction(() => window.fixture.saved.length === 2).catch(async error => {
        console.log('Repeating fixture diagnostics:', dialogs, await page.evaluate(() => ({
            writes: window.fixture.writes, saved: window.fixture.saved,
            controls: Array.from(document.querySelectorAll('input,select')).map(element => ({ name: element.name, value: element.value, valid: element.validity.valid })),
        })));
        throw error;
    });
    const schedule = await page.evaluate(() => window.fixture.saved);
    assert.deepEqual(schedule.map(row => row.participating_ipo_ids), [[22], [33]]);
    assert.deepEqual(schedule.map(row => row.activity_title), ['Repeat visit', 'Repeat visit']);

    await page.evaluate(() => window.loadFixture('create'));
    await page.locator('select[name="component"]').selectOption('Program Management');
    await page.locator('select').filter({ has: page.locator('option[value="Subproject Monitoring"]') }).selectOption('Subproject Monitoring');
    await page.locator('input[name="date"]').fill('2026-10-15');
    await page.locator('select').filter({ has: page.locator('option[value="fixture-region"]') }).selectOption('fixture-region');
    await page.locator('.activity-ipo-selector__filters select').selectOption('All');
    await page.getByLabel('Available IPOs', { exact: true }).selectOption(['22']);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByRole('button', { name: 'Create Activity', exact: true }).click();
    await page.waitForFunction(() => window.fixture.saved.length === 1);
    assert.deepEqual(await page.evaluate(() => window.fixture.saved[0].participating_ipo_ids), [22]);
    assert.equal(await page.evaluate(() => window.fixture.saved[0].activity_title), null);

    await page.evaluate(() => window.loadFixture('create', { denied: true }));
    await page.locator('select[name="component"]').selectOption('Program Management');
    await page.locator('select').filter({ has: page.locator('option[value="Subproject Monitoring"]') }).selectOption('Subproject Monitoring');
    await page.locator('input[name="date"]').fill('2026-10-15');
    await page.locator('select').filter({ has: page.locator('option[value="fixture-region"]') }).selectOption('fixture-region');
    await page.getByRole('button', { name: 'Create Activity', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('button[type="submit"]').disabled);
    assert.equal(await page.evaluate(() => window.fixture.writes.length), 0);
    assert.equal(dialogs.at(-1), 'You do not have permission to create activities.');

    await page.evaluate(() => window.loadFixture('ordinary'));
    await page.getByLabel('Available IPOs', { exact: true }).selectOption(['22', '33']);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Select all participating IPOs', exact: true }).check();
    await page.getByRole('button', { name: 'Remove selected', exact: true }).click();
    await page.getByText('No participating IPOs', { exact: true }).waitFor();
    await page.getByLabel('Available IPOs', { exact: true }).selectOption(['22']);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByLabel('Search available IPOs').fill('Original IPO');
    await page.getByRole('button', { name: /^Remove Replacement IPO/ }).waitFor();
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(viewport);
        await page.getByLabel('Activity Title (optional)', { exact: true }).scrollIntoViewIfNeeded();
        assert.equal(await page.getByLabel('Activity Title (optional)', { exact: true }).getAttribute('placeholder'), null);
        await page.screenshot({ path: path.join(screenshots, `title-${viewport.width}.png`) });
        await page.locator('.activity-ipo-selector').scrollIntoViewIfNeeded();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'No page-wide horizontal overflow');
        await page.screenshot({ path: path.join(screenshots, `selector-${viewport.width}.png`) });
    }
    assert.deepEqual(errors, []);
    console.log('PASS: Mocked browser saves and title trim/clear/failure preservation for ordinary/cloned/completed transfer Activities, Training subtype roundtrip, single/repeating creation, stale-title isolation for expense/accomplishment writes, scoped cache isolation, permissions and desktop/mobile layout.');
    console.log(`Screenshots: ${screenshots}`);
} finally {
    await browser?.close();
    await server.close();
}
