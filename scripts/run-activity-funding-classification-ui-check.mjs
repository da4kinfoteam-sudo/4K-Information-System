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
const artifacts = await mkdtemp(path.join(tmpdir(), '4kis-funding-list-ui-'));
const serve = process.argv.includes('--serve');
const mocks = {
    'contexts/AuthContext': `export const useAuth=()=>({currentUser:window.actor,hasAccess:()=>window.actor.role==='Super Admin',getVisibilityScope:()=>window.actor.role==='Super Admin'?'All':'Own'});`,
    'supabaseClient': `export const supabase={rpc(){window.writes++;throw Error('Unexpected RPC')},from(){window.writes++;throw Error('Unexpected table request')}};`,
    'hooks/useLogAction': `export const useLogAction=()=>({logAction:()=>{}});`,
    'hooks/useIpoHistory': `export const useIpoHistory=()=>({addIpoHistory:()=>{}});`,
    'hooks/useDcfPolicyGuard': `export const useDcfPolicyGuard=()=>({getDeleteDecision:()=>({allowed:false}),ensureDecisionAllowed:async()=>false,getLastOverrideReason:()=>''});`,
};
const harness = `import React,{useState}from'react';import{createRoot}from'react-dom/client';import * as XLSX from 'xlsx';
import{ActivitiesComponent}from'/components/Activities.tsx';import'/index.css';import'/styles/main.css';
window.writes=0;window.scopes=[];window.actor={id:1,role:'Super Admin',operatingUnit:'NPMO',fullName:'Fixture'};
window.exports=[];window.XLSX={...XLSX,writeFile:book=>window.exports.push(XLSX.utils.sheet_to_json(book.Sheets['Activities Report']))};
const line=(id,amount=100)=>({id,amount,objectType:'MOOE',expenseParticular:'Travel',uacsCode:'502',obligationMonth:'2026-01-01',disbursementMonth:'2026-02-01'});
const base={type:'Activity',name:'Subproject Monitoring',component:'Social Preparation',status:'Completed',workflow_status:'APPROVED',operatingUnit:'NPMO',date:'2026-11-01',location:'Fixture',description:'Fixture description',fundingYear:2026,fundType:'Current',tier:'Tier 1',fundSourceUid:'FS-1',participatingIpos:[],participantsMale:0,participantsFemale:0};
const record=(id,title,extra={})=>({...base,id,uid:'ACT-'+id,activity_title:title,expenses:[line(id)],...extra});
const modern={...line(20,20),fundingOrigin:'Supplemental',supplementUid:'ledger',supplementStatus:'APPROVED',supplementalSource:'Realignment'};
const rows=[record(1,'Regular'),record(2,'Whole Savings',{isSavings:true}),record(3,'Whole Realignment',{isRealignment:true}),record(4,'Mixed Savings',{isSavings:true,expenses:[line(4,400),modern]}),record(5,'Regular With Savings',{expenses:[line(5),{...line(50,50),isSavings:true}]}),record(6,'Zero Savings',{isSavings:true,expenses:[]}),record(7,'Legacy Regular',{isSavings:null,isRealignment:null}),record(8,'Pending Supplement',{expenses:[{...modern,supplementStatus:'PENDING'}]}),record(9,'Foreign OU',{operatingUnit:'RPMO 1',isSavings:true}),record(10,'Outside FY',{fundingYear:2025,isSavings:true}),record(11,'Outside Tier',{tier:'Tier 2',isSavings:true}),record(12,'Outside Type',{fundType:'Continuing',isSavings:true}),record(13,'Training Savings',{type:'Training',name:'Training Savings',isSavings:true}),record(14,'Cancelled Savings',{isSavings:true,status:'Cancelled'}),record(15,'Other Fund Source',{fundSourceUid:'FS-2',isSavings:true}),record(16,'Inactive Transfer',{isSavings:true,budgetItemTransferId:'transfer',workflow_status:'PENDING'})];
window.samples=rows;const noop=()=>{},scope=s=>window.scopes.push(s);
function Harness(){const[epoch,setEpoch]=useState(0),[forced,setForced]=useState(undefined);window.configure=options=>{if(options.actor)window.actor=options.actor;if('forced'in options)setForced(options.forced);setEpoch(n=>n+1)};
return <main style={{padding:16,minWidth:0}}><ActivitiesComponent key={epoch} activities={rows} ipos={[]} setActivities={()=>{window.writes++;throw Error('Unexpected save')}} onSelectActivity={row=>window.selected=row.uid} onSelectIpo={noop} onCreateActivity={noop} uacsCodes={{}} fundSources={[{uid:'FS-1',label:'4K Fund',is_active:true},{uid:'FS-2',label:'Rice',is_active:true}]} forcedType={forced} onDataScopeChange={scope}/></main>}
createRoot(document.getElementById('root')).render(<Harness/>);`;
const server = await createServer({ configFile: false, root: process.cwd(), cacheDir: path.join(artifacts, '.vite'), appType: 'custom', resolve: { alias: { '@': process.cwd() } }, server: { host: '127.0.0.1', port: serve ? Number(process.env.PORT || 3030) : 0, strictPort: serve }, optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom/client', 'lucide-react', 'xlsx'], entries: [] }, plugins: [{
    name: 'funding-list-fixture', enforce: 'pre',
    resolveId(id) { if (id === '/funding-harness.tsx') return '\0funding-harness.tsx'; for (const key of Object.keys(mocks)) if (id.replace(/\\/g, '/').endsWith('/' + key)) return '\0mock-' + key + '.ts'; },
    load(id) { if (id === '\0funding-harness.tsx') return transformWithEsbuild(harness, 'funding-harness.tsx', { loader: 'tsx', jsx: 'automatic' }); for (const [key, code] of Object.entries(mocks)) if (id === '\0mock-' + key + '.ts') return code; },
    configureServer(vite) { vite.middlewares.use(async (req, res, next) => { if (req.url !== '/fixture') return next(); res.setHeader('Content-Type', 'text/html'); res.end(await vite.transformIndexHtml('/fixture', '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Activity Funding Review</title></head><body><div id="root"></div><script type="module" src="/funding-harness.tsx"></script></body></html>')); }); },
}, react(), tailwindcss()] });
let browser, passed = 0;
const test = async (name, run) => { await run(); passed++; console.log('PASS ' + name); };
try {
    await server.listen();
    const url = 'http://127.0.0.1:' + server.httpServer.address().port + '/fixture';
    if (serve) { console.log('Sample-only funding list review: ' + url); await new Promise(() => {}); }
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), errors = [], external = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => { const host = new URL(route.request().url()).hostname; if (host === 'fonts.googleapis.com' || host === 'fonts.gstatic.com') return route.fulfill({ contentType: 'text/css', body: '' }); if (!host.match(/^(127\.0\.0\.1|localhost)$/)) { external.push(route.request().url()); return route.abort(); } return route.continue(); });
    await page.goto(url); await page.getByRole('heading', { name: 'Activities Management' }).waitFor();
    const rows = () => page.locator('tbody tr:not(:has(.data-table__empty-cell))');
    const names = () => rows().evaluateAll(elements => elements.map(row => row.children[1].textContent.trim()));
    const open = () => page.getByRole('button', { name: /^Filter/ }).click();
    const modal = () => page.getByRole('dialog', { name: 'Filter columns' });
    const selectSources = async (label, values) => {
        await modal().getByRole('button', { name: label, exact: true }).click();
        const menu = page.locator('.dashboard-scope-menu');
        await menu.getByRole('button', { name: 'Clear', exact: true }).click();
        for (const value of values) await menu.getByRole('checkbox', { name: value, exact: true }).check();
        await page.keyboard.press('Escape'); await menu.waitFor({ state: 'hidden' });
        assert.equal(await modal().isVisible(), true, 'Escape must close only the inner popover');
    };
    const apply = () => modal().getByRole('button', { name: 'Apply filters', exact: true }).click();
    const reset = async () => { await open(); await modal().getByRole('button', { name: 'Reset', exact: true }).click(); await apply(); };
    await test('labels, parent classification, funding totals, numeric sorting and scoped pagination', async () => {
        await page.getByRole('columnheader', { name: /^Target Budget,/ }).waitFor();
        await page.getByRole('columnheader', { name: 'Funding Origin', exact: true }).waitFor();
        assert.equal(await page.getByText(/Parent Funding Origin/).count(), 0);
        assert.equal(await rows().count(), 10);
        assert(!(await names()).includes('Outside FY')); assert(!(await names()).includes('Outside Tier')); assert(!(await names()).includes('Outside Type'));
        await page.getByRole('button', { name: /^Target Budget,/ }).click();
        const targets = await rows().evaluateAll(elements => elements.map(row => Number(row.children[9].textContent.replace(/[^\d.-]/g, ''))));
        assert.deepEqual(targets, [...targets].sort((a, b) => a - b));
        await page.getByRole('button', { name: /^Supplemental Budget,/ }).click();
        let amounts = await rows().evaluateAll(elements => elements.map(row => Number(row.children[10].textContent.replace(/[^\d.-]/g, ''))));
        assert.deepEqual(amounts, [...amounts].sort((a, b) => a - b));
        await page.getByRole('button', { name: /^Supplemental Budget,/ }).click();
        amounts = await rows().evaluateAll(elements => elements.map(row => Number(row.children[10].textContent.replace(/[^\d.-]/g, ''))));
        assert.deepEqual(amounts, [...amounts].sort((a, b) => b - a));
        assert.equal((await names())[0], 'Mixed Savings');
        await page.getByRole('button', { name: 'Next', exact: true }).click();
        assert.equal(await rows().count(), 3);
    });
    await test('OR within origins and AND with existing status; cancel leaves applied state unchanged', async () => {
        const allOrigins = ['Whole Savings', 'Whole Realignment', 'Mixed Savings', 'Zero Savings', 'Foreign OU', 'Training Savings', 'Cancelled Savings', 'Other Fund Source', 'Inactive Transfer'].sort();
        const completedOrigins = allOrigins.filter(name => name !== 'Cancelled Savings');
        await open();
        assert.equal(await modal().getByRole('button', { name: 'Supplemental Funding Source', exact: true }).count(), 0);
        assert.equal(await modal().getByText(/Parent/).count(), 0);
        await selectSources('Funding Origin', ['Savings', 'Realignment']);
        await apply(); assert.deepEqual((await names()).sort(), allOrigins);
        assert.equal(await page.getByRole('button', { name: 'Previous', exact: true }).isDisabled(), true);
        await open(); await selectSources('Funding Origin', ['Regular']);
        await modal().getByRole('button', { name: 'Cancel', exact: true }).click();
        assert.deepEqual((await names()).sort(), allOrigins);
        await page.reload(); await page.getByRole('heading', { name: 'Activities Management' }).waitFor();
        assert.deepEqual((await names()).sort(), allOrigins);
        await open(); await modal().getByRole('combobox', { name: /^Status/ }).selectOption('Completed'); await apply();
        assert.deepEqual((await names()).sort(), completedOrigins);
        await page.getByRole('button', { name: 'Export', exact: true }).click();
        assert.deepEqual((await page.evaluate(() => window.exports.at(-1))).map(row => row['Activity Name']).sort(), completedOrigins);
    });
    await test('Funding Origin includes zero-expense and inactive tagged activities without reclassifying ordinary activities', async () => {
        await reset(); await open(); await selectSources('Funding Origin', ['Savings']); await apply();
        assert((await names()).includes('Zero Savings')); assert((await names()).includes('Cancelled Savings')); assert((await names()).includes('Inactive Transfer'));
        assert(!(await names()).includes('Regular With Savings'));
        await reset(); await open(); await selectSources('Funding Origin', ['Regular']); await apply();
        assert((await names()).includes('Legacy Regular')); assert((await names()).includes('Regular With Savings'));
    });
    await test('Fund Source AND filter and Own OU restrictions remain effective; funding filters never fetch data', async () => {
        await reset(); await open(); await selectSources('Funding Origin', ['Savings']);
        await modal().getByRole('combobox', { name: /^Fund Source/ }).selectOption('FS-2'); await apply();
        assert.deepEqual(await names(), ['Other Fund Source']);
        await reset();
        await page.evaluate(() => window.configure({ actor: { id: 2, role: 'User', operatingUnit: 'NPMO', fullName: 'Fixture User' } }));
        await page.waitForFunction(() => document.querySelector('select[disabled]'));
        assert(!(await names()).includes('Foreign OU'));
        const count = await page.evaluate(() => window.scopes.length);
        await open(); await selectSources('Funding Origin', ['Savings']); await apply();
        assert(!(await names()).includes('Foreign OU')); assert.equal(await page.evaluate(() => window.scopes.length), count);
        assert.equal(await page.evaluate(() => window.writes), 0);
    });
    await test('malformed saved preferences normalize safely; forced Training mode remains scoped', async () => {
        await page.evaluate(() => localStorage.setItem('activities_1_columnFilters', JSON.stringify({ parentFundingOrigin: ['Savings', 'bad'], supplementalFundingSource: ['Realignment'], status: 'invalid', operatingUnit: ['RPMO 1'] })));
        await page.reload(); await page.getByRole('heading', { name: 'Activities Management' }).waitFor();
        assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('activities_1_columnFilters'))), { parentFundingOrigin: ['Savings'] });
        assert((await names()).includes('Zero Savings'), 'Removed source filter must not silently hide records');
        await page.evaluate(() => window.configure({ forced: 'Training' }));
        await page.getByRole('heading', { name: 'Trainings Management' }).waitFor();
        assert.deepEqual(await names(), ['Training Savings']);
        await page.evaluate(() => window.configure({ forced: 'Activity' }));
        await page.getByRole('heading', { name: 'Activities Management' }).waitFor();
        assert(!(await names()).includes('Training Savings'));
    });
    await test('desktop/tablet/mobile menu bounds, keyboard/outside dismissal and no page overflow', async () => {
        for (const width of [1440, 820, 390]) {
            await page.setViewportSize({ width, height: 1000 }); await open();
            await modal().getByRole('button', { name: 'Funding Origin', exact: true }).click();
            const menu = page.locator('.dashboard-scope-menu'); await menu.waitFor();
            const bounds = await menu.boundingBox(); assert(bounds.x >= 0 && bounds.x + bounds.width <= width + 1);
            assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
            await page.screenshot({ path: path.join(artifacts, 'funding-filter-' + width + '.png'), fullPage: true });
            await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await modal().waitFor({ state: 'hidden' });
            assert(await page.getByRole('button', { name: /^Filter/ }).evaluate(button => button === document.activeElement));
            await page.screenshot({ path: path.join(artifacts, 'funding-list-' + width + '.png'), fullPage: true });
        }
        await open(); await page.locator('.modal-backdrop').click({ position: { x: 1, y: 1 } }); await modal().waitFor({ state: 'hidden' });
        assert.equal(await page.evaluate(() => window.writes), 0); assert.deepEqual(errors, []); assert.deepEqual(external, []);
    });
    console.log(`${passed} real Activities list UI checks passed. Screenshots: ${artifacts}. No production connection.`);
} finally { if (browser) await browser.close(); await server.close(); }
