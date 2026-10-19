import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { createReleaseBuild, releaseBuildPlugin } from './helpers/release-build.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || 'C:/Users/joelm/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules', 'playwright'));
const screenshots = await mkdtemp(path.join(tmpdir(), '4kis-system-information-ui-'));
const serve = process.argv.includes('--serve');
const release = createReleaseBuild({ root: process.cwd(), env: {} });
const harness = `import React,{useState}from'react';import{createRoot}from'react-dom/client';import Settings from'/components/Settings.tsx';import{bundledReleases}from'/lib/buildInformation.ts';import'/index.css';import'/styles/main.css';
window.fixture={role:'Guest',restricted:[],syncCalls:0};
const empty=[],noop=()=>{},originalReleases=structuredClone(bundledReleases.releases);
function Harness(){const[version,setVersion]=useState(0);window.changeRole=(role)=>{window.fixture.role=role;setVersion(v=>v+1)};
window.setPatchHistorySize=size=>{bundledReleases.releases=size?Array.from({length:size},(_,index)=>({...structuredClone(originalReleases[index===0?0:1]),id:index===0?bundledReleases.currentReleaseId:'fixture-patch-'+index,version:index===0?'1.1.0':'1.0.'+(size-index-1),title:index===0?'A deliberately long synthetic patch title to verify compact single-line ellipsis without changing the application release catalog':'Synthetic patch '+index,pr:200+index})):structuredClone(originalReleases);setVersion(v=>v+1)};
return <main className="app-main" style={{padding:16}}><Settings key={version} onNavigate={page=>history.pushState({...history.state,page},'',location.pathname+'#'+page)}
isDarkMode={false} themePreference="light" onThemePreferenceChange={noop} deadlines={empty} setDeadlines={noop} subprojects={empty} setSubprojects={noop} activities={empty} setActivities={noop} ipos={empty} setIpos={noop} officeReqs={empty} setOfficeReqs={noop} staffingReqs={empty} setStaffingReqs={noop} otherProgramExpenses={empty} setOtherProgramExpenses={noop} fundSources={empty} onSelectSubproject={noop} onSelectActivity={noop} onSelectIpo={noop}/></main>};createRoot(document.getElementById('root')).render(<Harness/>);`;
const server = await createServer({ configFile: false, root: process.cwd(), cacheDir: path.join(screenshots, '.vite'), appType: 'custom',
    define: { __FOURKIS_BUILD__: JSON.stringify(release.manifest), __FOURKIS_RELEASES__: JSON.stringify(release.catalog) },
    server: { host: '127.0.0.1', port: serve ? Number(process.env.FOURKIS_PREVIEW_PORT || 3021) : 0, strictPort: serve },
    optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom/client', 'lucide-react'], entries: [] },
    plugins: [releaseBuildPlugin(release), {
        name: 'system-information-offline', enforce: 'pre',
        resolveId(id) {
            if (id === '/system-information-harness.tsx') return '\0system-information-harness.tsx';
            const normalized = id.replace(/\\/g, '/');
            if (normalized.endsWith('/contexts/AuthContext')) return '\0system-information-auth.ts';
            if (normalized.includes('/settings/') && !normalized.endsWith('/SystemInformationTab')) return '\0system-information-stub.tsx';
        },
        load(id) {
            if (id === '\0system-information-harness.tsx') return transformWithEsbuild(harness, 'system-information-harness.tsx', { loader: 'tsx', jsx: 'automatic' });
            if (id === '\0system-information-auth.ts') return `export const useAuth=()=>({currentUser:{id:1,role:window.fixture.role},hasAccess:()=>!!window.fixture.systemView});`;
            if (id === '\0system-information-stub.tsx') return `import React from'react';export default()=> React.createElement('div',{'data-testid':'existing-settings-tab'},'Existing Settings content');`;
        },
        configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
            if (req.url !== '/fixture') return next();
            res.setHeader('Content-Type', 'text/html');
            res.end(await vite.transformIndexHtml('/fixture', '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>4KIS System Information Preview</title></head><body><div id="root"></div><script type="module" src="/system-information-harness.tsx"></script></body></html>'));
        }); },
    }, react(), tailwindcss()] });
let browser, page;
try {
    await server.listen();
    if (serve) { console.log(`Isolated System Information preview: http://127.0.0.1:${server.config.server.port}/fixture#/settings?tab=system_information`); await new Promise(() => {}); }
    const origin = server.resolvedUrls.local[0].replace(/\/$/, '');
    const raw = await fetch(origin + '/release-manifest.json');
    assert.equal(raw.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await raw.json(), release.manifest);
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    let latest = release.manifest, invalid = false, checks = 0, businessRequests = [];
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (/supabase|\/rest\/v1|\/rpc\//.test(request.url())) businessRequests.push(request.url()); });
    await page.route(/\/release-manifest\.json/, async route => { checks++; await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(invalid ? {} : latest) }); });
    await page.goto(origin + '/fixture#/settings?tab=system_information');
    const status = page.getByRole('status');
    await status.filter({ hasText: 'Up to date' }).waitFor();
    assert.equal(await page.getByRole('tab').count(), 2, 'Guest gets only Profile and System Information');
    for (const role of ['Super Admin', 'Administrator', 'Management', 'Focal - User', 'RFO - User', 'User', 'Guest']) {
        await page.evaluate(role => window.changeRole(role), role);
        await status.filter({ hasText: 'Up to date' }).waitFor();
        assert.equal(await page.getByRole('tab', { name: 'System Information', exact: true }).getAttribute('aria-selected'), 'true');
        if (['Management', 'Focal - User', 'RFO - User', 'User', 'Guest'].includes(role)) assert.equal(await page.getByRole('tab').count(), 2, role + ' gets no restricted tabs');
        if (role === 'Super Admin') assert.equal(await page.getByRole('tab').count(), 10);
        if (role === 'Administrator') assert.equal(await page.getByRole('tab').count(), 8);
    }
    await page.evaluate(() => { window.fixture.systemView = true; window.changeRole('User'); });
    assert.equal(await page.getByRole('tab', { name: 'System Management', exact: true }).count(), 1);
    await page.evaluate(() => window.changeRole('Guest'));
    assert.equal(await page.getByRole('tab').count(), 2, 'Guest does not gain System Management through the new tab');
    await page.goto(origin + '/fixture#/settings?tab=management');
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#settings-tab-profile')?.getAttribute('aria-selected') === 'true');
    await page.getByRole('tab', { name: 'System Information', exact: true }).click(); await status.filter({ hasText: 'Up to date' }).waitFor();
    const notes = page.getByRole('textbox', { name: 'Patch notes for version 1.1.0', exact: true });
    assert.equal(await notes.getAttribute('readonly'), '');
    assert.match(await notes.inputValue(), /Added/); assert(!/Action Required/.test(await notes.inputValue()));
    const patchTable = page.getByRole('table', { name: 'Patch history', exact: true });
    assert.deepEqual(await patchTable.getByRole('columnheader').allTextContents(), ['Details', 'Version', 'Patch', 'Release Date', 'PR']);
    assert.equal(await page.getByRole('button', { name: 'Collapse patch 1.1.0', exact: true }).getAttribute('aria-expanded'), 'true');
    assert.equal(await page.getByText('Not promoted', { exact: true }).count(), 0);
    assert.equal(await page.getByText('Tracking baseline', { exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Expand patch 1.0.0', exact: true }).focus(); await page.keyboard.press('Enter');
    await page.getByRole('textbox', { name: 'Patch notes for version 1.0.0', exact: true }).waitFor();
    await patchTable.locator('.system-information__patch-row').last().locator('td').nth(2).click();
    assert.equal(await page.getByRole('button', { name: 'Expand patch 1.0.0', exact: true }).getAttribute('aria-expanded'), 'false');
    await page.getByRole('tab', { name: 'User Profile', exact: true }).click();
    assert.match(page.url(), /tab=profile/);
    await page.goBack(); await status.filter({ hasText: 'Up to date' }).waitFor();
    assert.equal(await page.getByRole('tab', { name: 'System Information', exact: true }).getAttribute('aria-selected'), 'true');
    await page.reload(); await status.filter({ hasText: 'Up to date' }).waitFor();
    await page.getByRole('tab', { name: 'System Information', exact: true }).focus(); await page.keyboard.press('ArrowLeft');
    assert.match(page.url(), /tab=profile/); await page.keyboard.press('ArrowRight'); await status.filter({ hasText: 'Up to date' }).waitFor();
    const initialChecks = checks;
    await page.evaluate(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForTimeout(150); assert.equal(checks, initialChecks, 'Focus checks are throttled');
    latest = { ...release.manifest, version: '1.0.0', buildId: 'rollback-build' };
    await page.getByRole('button', { name: 'Check for Updates', exact: true }).click(); await status.filter({ hasText: 'Refresh required' }).waitFor();
    assert.equal(await page.locator('.system-information__fields > div').first().locator('dd').innerText(), 'v1.1.0');
    const stored = await page.evaluate(() => { localStorage.setItem('system-information-draft-proof', 'preserved'); return localStorage.length; });
    page.once('dialog', dialog => { assert.match(dialog.message(), /Unsaved changes/); dialog.dismiss(); });
    await page.getByRole('button', { name: 'Refresh to Update', exact: true }).click();
    assert.equal(await page.evaluate(() => localStorage.getItem('system-information-draft-proof')), 'preserved');
    assert.equal(await page.evaluate(() => localStorage.length), stored);
    invalid = true; await page.getByRole('button', { name: 'Check for Updates', exact: true }).click(); await status.filter({ hasText: 'Unable to check' }).waitFor();
    assert.equal(await notes.isVisible(), true, 'Bundled notes survive failed update checks');
    invalid = false; latest = { ...release.manifest, channel: '4kistest' }; await page.getByRole('button', { name: 'Check for Updates', exact: true }).click(); await status.filter({ hasText: 'Unable to check' }).waitFor();
    await page.context().setOffline(true); await page.getByRole('button', { name: 'Check for Updates', exact: true }).click(); await status.filter({ hasText: 'Unable to check' }).waitFor();
    await page.context().setOffline(false); latest = release.manifest;
    await page.getByRole('button', { name: 'Check for Updates', exact: true }).click(); await status.filter({ hasText: 'Up to date' }).waitFor();
    for (const width of [1440, 814, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'No page overflow at ' + width);
        const fields = page.locator('.system-information__fields > div');
        for (const field of await fields.all()) assert.equal(await field.evaluate(node => node.scrollWidth <= node.clientWidth + 1), true);
        for (const button of await page.locator('.system-information__actions button').all()) assert((await button.boundingBox()).height >= 44);
        await page.screenshot({ path: path.join(screenshots, `system-information-${width}.png`), fullPage: true });
    }
    await page.evaluate(() => window.setPatchHistorySize(50));
    await page.getByRole('button', { name: 'Collapse patch 1.1.0', exact: true }).waitFor();
    const viewport = page.getByRole('region', { name: 'Patch history', exact: true });
    for (const width of [1440, 814, 390]) {
        await page.setViewportSize({ width, height: 900 });
        const metrics = await viewport.evaluate(node => ({ height: node.getBoundingClientRect().height, max: parseFloat(getComputedStyle(node).maxHeight), scrollHeight: node.scrollHeight, clientHeight: node.clientHeight }));
        assert(metrics.height <= metrics.max + 1 && metrics.scrollHeight > metrics.clientHeight, 'Long history is capped and scrollable at '+width);
        for (const row of await patchTable.locator('.system-information__patch-row').all()) assert((await row.boundingBox()).height <= 46, 'Patch summary rows remain compact');
        assert((await notes.boundingBox()).width <= (await viewport.boundingBox()).width - 23, 'Expanded notes fit the visible table viewport');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await viewport.evaluate(node => { node.scrollTop = 300; });
        const headerTop = (await patchTable.getByRole('columnheader').first().boundingBox()).y;
        assert(Math.abs(headerTop - (await viewport.boundingBox()).y) <= 2, 'Headers remain visible during internal scrolling');
        await viewport.evaluate(node => { node.scrollTop = 0; node.scrollLeft = 0; });
        await viewport.scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(screenshots, `patch-history-long-${width}.png`), fullPage: true });
    }
    const lastToggle = patchTable.getByRole('button', { name: 'Expand patch 1.0.0', exact: true });
    await lastToggle.scrollIntoViewIfNeeded(); await lastToggle.click();
    assert.equal(await page.getByRole('textbox', { name: 'Patch notes for version 1.0.0', exact: true }).getAttribute('readonly'), '');
    await page.evaluate(() => window.setPatchHistorySize(0));
    latest = { ...release.manifest, buildId: 'same-version-rebuild' };
    await page.getByRole('button', { name: 'Check for Updates', exact: true }).click(); await status.filter({ hasText: 'Refresh required' }).waitFor();
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Refresh to Update', exact: true }).click();
    await page.waitForLoadState('networkidle'); await status.filter({ hasText: 'Refresh required' }).waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('system-information-draft-proof')), 'preserved');
    assert.deepEqual(errors, []); assert.deepEqual(businessRequests, []);
    console.log(`PASS: real Settings/manifest flow, all roles, tab history/refresh, compact expandable patch table, capped 50-patch scrolling/sticky headers, removed labels, read-only notes, update failures and safe refresh. Responsive artifacts: ${screenshots}`);
} catch (error) {
    if (page) {
        console.error('Fixture state at failure:', await page.evaluate(() => ({ url: location.href, role: window.fixture.role, tabs: [...document.querySelectorAll('[role="tab"]')].map(node => [node.id, node.getAttribute('aria-selected')]) })));
        await page.screenshot({ path: path.join(screenshots, 'failure.png'), fullPage: true });
    }
    throw error;
} finally { if (browser) await browser.close(); await server.close(); }
