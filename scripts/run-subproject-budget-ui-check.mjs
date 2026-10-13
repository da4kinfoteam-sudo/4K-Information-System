import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || 'C:/Users/joelm/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules', 'playwright'));
const screenshots = await mkdtemp(path.join(tmpdir(), '4kis-budget-schedule-ui-'));
const servePreview = process.argv.includes('--serve');
const mocks = {
    'supabaseClient': `export const supabase = { from(table) { let action = 'read', payload; const q = {
        select() { return q; }, eq() { return q; }, is() { return q; }, order() { return q; }, maybeSingle() { return q; }, single() { return q; },
        insert(value) { action = 'insert'; payload = value; return q; }, update(value) { action = 'update'; payload = value; return q; }, delete() { action = 'delete'; return q; },
        then(resolve) { return new Promise(done => setTimeout(() => {
            const f = window.fixture;
            if (table !== 'subprojects') return done({ data: [], error: null });
            if (action === 'read') return done({ data: f.latest || f.stored || f.source, error: null });
            f.writes.push({ action, payload });
            if (f.fail) return done({ data: null, error: { message: 'Synthetic save failure' } });
            f.stored = { ...f.source, ...(Array.isArray(payload) ? payload[0] : payload), id: f.source.id, serverConfirmed: true };
            done({ data: f.stored, error: null });
        }, window.fixture.delay || 0)).then(resolve); }
    }; return q; } };`,
    'contexts/AuthContext': `const user = { id: 1, role: 'Super Admin', fullName: 'Fixture Admin', operatingUnit: 'NPMO' }; export const useAuth = () => ({ currentUser: user, hasAccess: () => !window.fixture.denied, getVisibilityScope: () => 'All' });`,
    'hooks/useDcfPolicyGuard': `export const normalizePolicyMonth = value => String(value || '').slice(0,7); export const useDcfPolicyGuard = () => ({ getStatusDecision: () => ({ allowed: !window.fixture.denied }), ensureDecisionAllowed: async decision => decision.allowed, getMonthDecision: () => ({ allowed: true }), getMonthLockMessage: () => '', isMonthSelectionAllowed: () => true });`,
    'hooks/useLogAction': `export const useLogAction = () => ({ logAction: () => {} });`,
    'hooks/useIpoHistory': `export const useIpoHistory = () => ({ addIpoHistory: async () => {} });`,
    'lib/financialObligationSync': `export const fetchFinancialObligationsForParent = async () => []; export const replaceFinancialObligationRecords = async () => {};`,
    'lib/googleDriveStorage': `export const getGoogleDriveStatus = async () => ({ connected: false }); export const listSubprojectDriveFiles = async () => []; export const formatFileSize = () => ''; export const getDriveFileDisplayName = file => file.name; export const getSubprojectDriveImageUrl = () => ''; export const deleteSubprojectDriveFile = async () => {}; export const uploadSubprojectDriveFile = async () => {}; export const updateSubprojectDriveFileMetadata = async () => {}; export const DRIVE_GALLERY_IMAGE_ACCEPT = ''; export const IPO_DRIVE_FILE_ACCEPT = ''; export const isAllowedDriveGalleryImage = () => true; export const isAllowedIpoDriveFile = () => true;`,
};
const harness = `import React, { useState } from 'react'; import { createRoot } from 'react-dom/client';
import { SubprojectBudgetEditor } from '/components/ui/SubprojectBudgetEditor.tsx';
import SubprojectEdit from '/components/SubprojectEdit.tsx'; import SubprojectDetail from '/components/SubprojectDetail.tsx';
import { philippineRegions } from '/constants.tsx';
import '/index.css'; import '/styles/main.css';
const refs = { particularTypes: { Equipment: ['Zebra Equipment', 'Coffee Roaster', 'Alpha Equipment'] }, uacsCodes: { CO: { Equipment: { '106': 'Equipment code', '107': 'Other equipment' } } } };
const rows = [10, 20, 15].map((units, index) => ({ id: index + 1, budgetItemGroupId: 'fixture-group', type: 'Equipment', particulars: 'Coffee Roaster', unitOfMeasure: 'pcs', objectType: 'CO', expenseParticular: 'Equipment', uacsCode: '106', pricePerUnit: 1000, numberOfUnits: units, deliveryDate: '2026-02-01', obligationMonth: '2026-01-01', disbursementMonth: '2026-03-01', obligations: [{ id: index + 20, date: '2025-12-01', amount: -100 }], actualObligationDate: '2025-12-01' }));
const base = { id: 11, uid: 'SP-11', name: 'Fixture Subproject', operatingUnit: 'NPMO', fundingYear: 2026, fundType: 'Current', tier: 'Tier 1', status: 'Proposed', workflow_status: 'APPROVED', details: rows, history: [], startDate: '2026-01-01', estimatedCompletionDate: '2026-12-01', indigenousPeopleOrganization: 'Fixture IPO', ipo_id: 1, packageType: 'Package 1', subprojectCommodities: [], updated_at: '2026-10-13T00:00:00Z' };
function Harness() {
    const [screen, setScreen] = useState('editor'), [record, setRecord] = useState(base), [version, setVersion] = useState(0);
    const [pending, setPending] = useState(false);
    window.loadFixture = (next = 'editor', options = {}) => { const source = { ...structuredClone(base), ...options }; window.fixture = { source, writes: [], saved: [], applies: 0, ...options }; setScreen(next); setRecord(source); setVersion(value => value + 1); };
    if (!window.fixture) window.fixture = { source: base, writes: [], saved: [], applies: 0 };
    const props = { ...refs, subproject: record, ipos: [{ id: 1, name: 'Fixture IPO', commodities: [], location: 'Fixture', region: philippineRegions[0] }], commodityCategories: {}, refCommodities: [{ id: 1, name: 'Coffee', category: 'Crop', target_yield_ha: 1 }], refLivestock: [], fundSources: [{ uid: 'FS-000001', label: '4K Fund', is_active: true }] };
    const saved = (row, options) => { window.fixture.saved.push({ row, options }); window.fixture.source = row; setRecord(row); };
    return <main className="form-page" style={{ maxWidth: 1200, margin: '0 auto', padding: 16 }} key={version}>
        <nav style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }} aria-label="Local test screens">
            <span style={{ alignSelf: 'center', marginRight: 8 }}>Local sample data</span>
            {[['editor', 'Schedule Editor'], ['create', 'Add Subproject'], ['parent', 'Edit Subproject'], ['detail', 'Subproject Details']].map(([key, label]) => <button key={key} type="button" className="btn btn-secondary" onClick={() => window.loadFixture(key)}>{label}</button>)}
        </nav>
        {screen === 'editor' ? <><SubprojectBudgetEditor items={record.details} parent={record} {...refs} allowTags onDraftChange={setPending} canEdit={() => true} canRemove={() => true}
            onRemove={id => setRecord(previous => ({ ...previous, details: previous.details.filter(row => row.id !== id) }))}
            onApply={async rows => { window.fixture.applies++; if (window.fixture.fail) throw new Error('Synthetic apply failure'); await new Promise(done => setTimeout(done, window.fixture.delay || 0)); setRecord(previous => ({ ...previous, details: [...previous.details.filter(row => !rows.some(item => item.id === row.id)), ...rows] })); }} /><output data-pending hidden>{String(pending)}</output></>
        : screen === 'parent' || screen === 'create' ? <SubprojectEdit {...props} subproject={screen === 'create' ? undefined : record} onBack={() => { window.fixture.back = true; }} setIpos={() => {}} onUpdateSubproject={saved} />
        : <SubprojectDetail {...props} onUpdateSubproject={saved} />}
    </main>;
}
createRoot(document.getElementById('root')).render(<Harness />);`;
const server = await createServer({ configFile: false, root: process.cwd(), cacheDir: path.join(screenshots, 'node_modules', '.vite'), appType: 'custom', resolve: { alias: { '@': process.cwd() } }, server: { host: '127.0.0.1', port: servePreview ? 3014 : 0, strictPort: servePreview }, optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom/client', 'lucide-react'], entries: [] }, plugins: [{
    name: 'budget-ui-isolated', enforce: 'pre',
    resolveId(id) { if (id === '/budget-harness.tsx') return '\0budget-harness.tsx'; for (const key of Object.keys(mocks)) if (id.replace(/\\/g, '/').endsWith('/' + key)) return '\0mock-' + key + '.ts'; },
    load(id) { if (id === '\0budget-harness.tsx') return transformWithEsbuild(harness, 'budget-harness.tsx', { loader: 'tsx', jsx: 'automatic' }); for (const [key, code] of Object.entries(mocks)) if (id === '\0mock-' + key + '.ts') return code; },
    configureServer(vite) { vite.middlewares.use(async (req, res, next) => { if (req.url !== '/fixture') return next(); res.setHeader('Content-Type', 'text/html'); res.end(await vite.transformIndexHtml('/fixture', '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>4KIS Budget Preview</title></head><body><div id="root"></div><script type="module" src="/budget-harness.tsx"></script></body></html>')); }); },
}, react(), tailwindcss()] });
let browser;
try {
    await server.listen();
    if (servePreview) {
        console.log('Isolated sample-data budget preview: http://127.0.0.1:3014/fixture');
        await new Promise(() => {});
    }
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [], dialogs = [];
    page.on('pageerror', error => errors.push(error.message)); page.on('dialog', dialog => { dialogs.push(dialog.message()); return dialog.accept(); });
    await page.route('https://**', route => route.fulfill({ contentType: 'application/json', body: '[]' }));
    await page.goto('http://127.0.0.1:' + server.httpServer.address().port + '/fixture');
    await page.waitForFunction(() => typeof window.loadFixture === 'function');
    await page.getByRole('button', { name: 'Edit shared item Coffee Roaster' }).click();
    await page.screenshot({ path: path.join(screenshots, 'desktop-draft.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);
    await page.screenshot({ path: path.join(screenshots, 'mobile-draft.png'), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('combobox', { name: 'Particulars', exact: true }).fill('unknown');
    await page.getByRole('button', { name: 'Apply Item', exact: true }).click();
    assert.equal(await page.locator('[role=alert]').count() > 0, true);
    await page.getByRole('combobox', { name: 'Particulars', exact: true }).fill('Coffee');
    await page.getByRole('option', { name: 'Coffee Roaster' }).click();
    await page.getByRole('combobox', { name: 'UACS Code', exact: true }).fill('Other');
    await page.getByRole('option', { name: '107 - Other equipment' }).click();
    await page.getByRole('button', { name: 'Apply Item', exact: true }).click();
    await page.waitForFunction(() => window.fixture.applies === 1);
    await page.waitForFunction(() => document.querySelector('[data-pending]').textContent === 'false');
    assert.equal(await page.locator('td[rowspan="3"]').count(), 6);
    await page.screenshot({ path: path.join(screenshots, 'desktop-grouped.png'), fullPage: true });
    await page.getByRole('button', { name: 'Add schedule to Coffee Roaster' }).click();
    for (const [field, month] of [['obligationMonth', 'Jan'], ['deliveryDate', 'Feb'], ['disbursementMonth', 'Mar']]) {
        await page.getByRole('button', { name: field + ' schedule 1', exact: true }).click();
        await page.getByRole('button', { name: month + ' 2026', exact: true }).click();
    }
    await page.getByRole('spinbutton', { name: 'Units schedule 1' }).fill('5');
    await page.getByRole('button', { name: 'Apply Item', exact: true }).click();
    await page.waitForFunction(() => window.fixture.applies === 2);
    await page.waitForFunction(() => document.querySelector('[data-pending]').textContent === 'false');
    assert.equal(await page.locator('td[rowspan="4"]').count(), 6);
    for (const width of [768, 390]) {
        await page.setViewportSize({ width, height: 844 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);
        await page.screenshot({ path: path.join(screenshots, width + '-grouped.png'), fullPage: true });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    for (const screen of ['parent', 'detail']) {
        await page.evaluate(screen => window.loadFixture(screen), screen);
        await page.getByRole('button', { name: screen === 'parent' ? 'Budget Items' : 'Edit Budget', exact: true }).click();
        await page.getByRole('button', { name: 'Add schedule to Coffee Roaster', exact: true }).click();
        await page.getByRole('button', { name: 'obligationMonth schedule 1', exact: true }).click();
        await page.getByRole('button', { name: 'Jan 2026', exact: true }).click();
        assert.equal(await page.evaluate(() => window.fixture.writes.length), 0);
        await page.getByRole('button', { name: 'Discard Draft', exact: true }).click();
        await page.getByRole('button', { name: 'Edit schedule 1', exact: true }).click();
        await page.getByRole('spinbutton', { name: 'Units schedule 1' }).fill('12');
        await page.getByRole('button', { name: 'Apply Item', exact: true }).click();
        await page.evaluate(() => { window.fixture.delay = 300; });
        const save = page.getByRole('button', { name: screen === 'parent' ? 'Update Subproject' : 'Save Changes', exact: true });
        await save.click(); await save.click({ force: true }).catch(() => {});
        await page.waitForFunction(() => window.fixture.saved.length === 1);
        const saved = await page.evaluate(() => window.fixture);
        assert.equal(saved.writes.length, 1); assert.equal(saved.saved[0].options.persisted, true);
        assert.equal(saved.saved[0].row.details[0].numberOfUnits, 12); assert.equal(saved.saved[0].row.details[0].budgetItemGroupId, 'fixture-group');
        assert.equal(saved.saved[0].row.details[0].actualObligationDate, '2025-12-01');
        assert.equal(saved.saved[0].row.details[0].obligations[0].amount, -100);
        await page.evaluate(screen => window.loadFixture(screen, { fail: true }), screen);
        await page.getByRole('button', { name: screen === 'parent' ? 'Budget Items' : 'Edit Budget', exact: true }).click();
        await page.getByRole('button', { name: screen === 'parent' ? 'Update Subproject' : 'Save Changes', exact: true }).click();
        await page.waitForTimeout(400);
        assert.equal(await page.evaluate(() => window.fixture.saved.length), 0);
        assert.equal(await page.locator('.subproject-budget-editor').count(), 1);
    }
    assert.equal(dialogs.some(message => message.includes('Synthetic save failure')), true);
    await page.evaluate(() => window.loadFixture('create'));
    await page.locator('input[name=name]').fill('New grouped Subproject');
    const region = page.locator('select').filter({ has: page.locator('option', { hasText: /^Select Region$/ }) });
    const regionValue = await region.locator('option').nth(1).getAttribute('value');
    await region.selectOption(regionValue);
    await page.locator('select[name=indigenousPeopleOrganization]').selectOption('Fixture IPO');
    await page.getByRole('button', { name: 'Subproject Commodity', exact: true }).click();
    await page.locator('select[name=typeName]').selectOption('Crop');
    await page.locator('select[name=name]').selectOption('Coffee');
    await page.locator('input[name=area]').fill('1');
    await page.getByRole('button', { name: 'Add to List', exact: true }).click();
    await page.getByRole('button', { name: 'Budget Items', exact: true }).click();
    await page.getByRole('button', { name: 'Add Item', exact: true }).click();
    await page.getByRole('combobox', { name: 'Item Type', exact: true }).selectOption('Equipment');
    await page.getByRole('combobox', { name: 'Particulars', exact: true }).fill('Coffee');
    await page.getByRole('option', { name: 'Coffee Roaster', exact: true }).click();
    await page.getByRole('combobox', { name: 'Object Type', exact: true }).selectOption('CO');
    await page.getByRole('combobox', { name: 'Expense Particular', exact: true }).selectOption('Equipment');
    await page.getByRole('combobox', { name: 'UACS Code', exact: true }).fill('106');
    await page.getByRole('option', { name: '106 - Equipment code', exact: true }).click();
    for (let i = 1; i <= 3; i++) {
        if (i > 1) await page.getByRole('button', { name: 'Add Schedule', exact: true }).click();
        for (const [field, month] of [['obligationMonth', 'Jan'], ['deliveryDate', 'Feb'], ['disbursementMonth', 'Mar']]) {
            await page.getByRole('button', { name: field + ' schedule ' + i, exact: true }).click();
            await page.getByRole('button', { name: month + ' 2026', exact: true }).click();
        }
        await page.getByRole('spinbutton', { name: 'Units schedule ' + i }).fill(String(i * 5));
        await page.getByRole('spinbutton', { name: 'Unit Price schedule ' + i }).fill('1000');
    }
    await page.getByRole('button', { name: 'Apply Item', exact: true }).click();
    await page.getByRole('button', { name: 'Summary', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm & Save Subproject', exact: true }).click();
    await page.waitForFunction(() => window.fixture.saved.length === 1);
    const created = await page.evaluate(() => window.fixture);
    assert.equal(created.writes.length, 1); assert.equal(created.writes[0].action, 'insert');
    assert.equal(created.saved[0].row.details.length, 3);
    assert.equal(new Set(created.saved[0].row.details.map(row => row.id)).size, 3);
    assert.equal(new Set(created.saved[0].row.details.map(row => row.budgetItemGroupId)).size, 1);
    assert.equal(created.saved[0].row.details.some(row => row.obligations?.length), false);
    assert.deepEqual(errors, []);
    console.log('PASS: shared reference selections, merged rows, Add Schedule, both budget save entrypoints, double-click prevention, failed drafts and contained mobile/tablet overflow. Screenshots: ' + screenshots);
} finally { await browser?.close(); await server.close(); }
