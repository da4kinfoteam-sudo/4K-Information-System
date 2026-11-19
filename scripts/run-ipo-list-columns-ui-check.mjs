import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || 'C:/Users/joelm/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules', 'playwright'));
const artifacts = await mkdtemp(path.join(tmpdir(), '4kis-ipo-list-columns-ui-'));
const serve = process.argv.includes('--serve');
// Keep the pre-customization stylesheet fixed even after this refinement is committed.
const baselineCommit = '93a98235ba05e40a61c6865ffaedaa870a1e5e9a';
const baselineCss = execFileSync('git', ['show', `${baselineCommit}:styles/main.css`], { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
const mocks = {
    'contexts/AuthContext': `export const useAuth=()=>({currentUser:window.fixture.userId==null?null:{id:window.fixture.userId,role:window.fixture.role,operatingUnit:window.fixture.ou,fullName:'Synthetic Reviewer'},hasAccess:(_module,action)=>action==='view'||window.fixture.canEdit,getVisibilityScope:()=>window.fixture.scope});`,
    'hooks/useLogAction': `export const useLogAction=()=>({logAction:(...args)=>window.fixture.logs.push(args)});`,
    'hooks/useSupabaseTable': `export const fetchAll=async()=>window.forbidden('fetchAll');`,
    'lib/lodDataSync': `export const subscribeToLodDataChanges=()=>()=>{};`,
    LocationPicker: `export const parseLocation=()=>({province:'Synthetic Province',municipality:'Synthetic Town',barangays:[]});export default function Location(){return null;}`,
    'mainfunctions/ImportExportService': `export const downloadIposReport=rows=>window.fixture.exports.push(structuredClone(rows));export const downloadIposTemplate=()=>window.forbidden('template');export const handleIposUpload=()=>window.forbidden('import');`,
    supabaseClient: `export const supabase={from(table){if(table!=='lod_assessments')return window.forbidden('table:'+table);const q={select(){return q},order(){return q},insert(){return window.forbidden('insert')},update(){return window.forbidden('update')},delete(){return window.forbidden('delete')},then(resolve,reject){window.fixture.reads.push(table);return Promise.resolve({data:structuredClone(window.fixture.levels),error:null}).then(resolve,reject)}};return q}};`,
};
const harness = `import React,{useState,useCallback}from'react';import{createRoot}from'react-dom/client';import IPOs from'/components/IPO.tsx';import{SortableTableHeader}from'/components/ui/enterprise.tsx';import{philippineRegions}from'/constants';import'/index.css';import'/styles/main.css';
const r1=philippineRegions.find(r=>r.startsWith('Region I (')),r2=philippineRegions.find(r=>r.startsWith('Region II ('));
const referenceRoot=document.createElement('div');referenceRoot.style.cssText='position:fixed;top:0;left:0;width:1px;height:1px;overflow:hidden;visibility:hidden;pointer-events:none';referenceRoot.setAttribute('aria-hidden','true');document.body.appendChild(referenceRoot);createRoot(referenceRoot).render(<div className="major-table-card ipo-subproject-header-reference"><table className="data-table"><thead><tr><SortableTableHeader label="Subproject Name" columnKey="name" sortConfig={null} onSort={()=>{}}/></tr></thead></table></div>);
const names=['Alpha Synthetic IPO','Birch Synthetic IPO','Cedar Synthetic IPO','Delta Synthetic IPO with a deliberately long organization name for title verification'];
function defaults(){return{userId:1,role:'Super Admin',ou:'NPMO',scope:'All',canEdit:true,blockStorage:false,reads:[],writes:[],exports:[],logs:[],navigation:[],cleared:0,regions:[r1,r2],levels:[{id:1,ipo_id:1,year:2026,computed_level:4,is_complete:true},{id:2,ipo_id:2,year:2026,manual_level:1,is_complete:false},{id:3,ipo_id:3,year:2026,carried_over_level:3,is_carried_over:true,is_complete:false},{id:4,ipo_id:4,year:2026,is_dropped:true},{id:5,ipo_id:5,year:2026,is_complete:false,answered_question_count:2},{id:6,ipo_id:6,year:2026,is_complete:false,answered_question_count:0}],rows:Array.from({length:24},(_,i)=>({id:i+1,name:names[i]||'Synthetic IPO '+String(i+1).padStart(2,'0'),location:i%2?'South Synthetic Town':'North Synthetic Town',region:i%2?r2:r1,indigenousCulturalCommunity:'ICC-ONLY-'+(i+1),ancestralDomainNo:'AD-SYN-'+(i+1),registeringBody:i%2?'CDA':'SEC',registrationDate:'2026-01-'+String(i+1).padStart(2,'0'),contactPerson:'Contact-SYN-'+(i+1),contactNumber:'0900-000-'+String(i+1).padStart(4,'0'),totalMembers:i===0?0:i===1?null:i===2?2:i===3?10:100+i,totalIpMembers:0,totalMaleMembers:0,totalFemaleMembers:0,totalYouthMembers:0,totalSeniorMembers:0,total4PsMembers:0,isWomenLed:[0,1,3].includes(i),isWithinGida:[0,2,3].includes(i),isWithinElcac:false,isWithScad:false,isF2c2Cluster:i===3,isFfedisRegistered:i===0?true:i===1?false:null,ffedisRegistrationNumber:i===0?'VISIBLE-FFEDIS':'HIDDEN-FFEDIS-'+(i+1),ffedisRegistrationDate:'2026-10-20',commodities:[{type:'Crop',particular:i%2?'Corn':'Rice'}],levelOfDevelopment:i===0?1:5,workflow_status:'APPROVED'}))}}
window.fixture=defaults();window.forbidden=operation=>{window.fixture.writes.push(operation);throw Error('Forbidden synthetic fixture operation: '+operation)};
const get=Storage.prototype.getItem,set=Storage.prototype.setItem;Storage.prototype.getItem=function(key){if(window.fixture.blockStorage)throw new DOMException('Synthetic blocked storage','SecurityError');return get.call(this,key)};Storage.prototype.setItem=function(key,value){if(window.fixture.blockStorage)throw new DOMException('Synthetic blocked storage','SecurityError');return set.call(this,key,value)};
const empty=[],noop=()=>{},forbidden=()=>window.forbidden('business setter');
function Harness(){const[epoch,setEpoch]=useState(0),[rows,setRows]=useState(window.fixture.rows),[external,setExternal]=useState(null),[,render]=useState(0);window.configure=(options={},preferences,legacy={})=>{window.fixture.blockStorage=false;localStorage.clear();window.fixture={...defaults(),...options};const blocked=window.fixture.blockStorage;window.fixture.blockStorage=false;if(preferences!==undefined)localStorage.setItem('4kis:ipo-list:1:v1',typeof preferences==='string'?preferences:JSON.stringify({version:1,...preferences}));for(const[key,value]of Object.entries(legacy))localStorage.setItem('ipos_1_'+key,JSON.stringify(value));window.fixture.blockStorage=blocked;setRows(window.fixture.rows);setExternal(null);setEpoch(n=>n+1)};window.identity=options=>{Object.assign(window.fixture,options);render(n=>n+1)};window.replaceRows=next=>{window.fixture.rows=next;setRows(next)};window.external=next=>setExternal(next);const clearExternal=useCallback(()=>{window.fixture.cleared++;setExternal(null)},[]);return <div className="app-shell"><div className="app-workspace"><main className="app-main" data-epoch={epoch}><IPOs key={epoch} ipos={rows} setIpos={forbidden} onIposSaved={forbidden} subprojects={window.fixture.subprojects||empty} activities={window.fixture.activities||empty} onSelectIpo={row=>window.fixture.navigation.push(row.id)} onSelectSubproject={noop} particularTypes={{}} commodityCategories={{}} gidaAreas={empty} elcacAreas={empty} externalFilters={external} onClearExternalFilters={clearExternal}/></main></div></div>};createRoot(document.getElementById('root')).render(<Harness/>);`;

const server = await createServer({
    configFile: false, root, appType: 'custom', cacheDir: path.join(artifacts, '.vite'), resolve: { alias: { '@': root } },
    server: { host: '127.0.0.1', port: serve ? Number(process.env.PORT || 3034) : 0, strictPort: serve, watch: { ignored: ['**/scripts/**'] } },
    optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom/client', 'lucide-react'], entries: [] },
    plugins: [{ name: 'ipo-list-offline', enforce: 'pre', resolveId(id, importer) {
        if ((importer || '').replace(/\\/g, '/').includes('/node_modules/')) return;
        if (id === '/ipo-list-harness.tsx') return '\0ipo-list-harness.tsx';
        if (id === '/ipo-list-canonical-harness.tsx') return '\0ipo-list-canonical-harness.tsx';
        if (id === '/canonical-main.css') return '\0canonical-main.css';
        for (const key of Object.keys(mocks)) if (id.replace(/\\/g, '/').endsWith('/' + key)) return '\0ipo-list-mock-' + key + '.ts';
    }, load(id) {
        if (id === '\0ipo-list-harness.tsx') return transformWithEsbuild(harness, 'ipo-list-harness.tsx', { loader: 'tsx', jsx: 'automatic' });
        if (id === '\0ipo-list-canonical-harness.tsx') return transformWithEsbuild(harness.replace("import'/styles/main.css'", "import'/canonical-main.css'"), 'ipo-list-canonical-harness.tsx', { loader: 'tsx', jsx: 'automatic' });
        if (id === '\0canonical-main.css') return baselineCss;
        for (const [key, value] of Object.entries(mocks)) if (id === '\0ipo-list-mock-' + key + '.ts') return value;
    }, transform(code, id) {
        // Keep the real application CSS while removing its sole remote font dependency.
        if (id.split('?')[0].endsWith('.css')) return code.replace(/^[ \t]*@import[^\r\n]*fonts\.googleapis\.com[^\r\n]*(?:\r?\n|$)/gm, '');
    }, configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
        if (req.url !== '/fixture' && req.url !== '/canonical-fixture') return next();
        const entry = req.url === '/canonical-fixture' ? '/ipo-list-canonical-harness.tsx' : '/ipo-list-harness.tsx';
        res.setHeader('Content-Type', 'text/html');res.end(await vite.transformIndexHtml(req.url, '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>4KIS Synthetic IPO List Review</title></head><body><div id="root"></div><script type="module" src="' + entry + '"></script></body></html>'));
    }); } }, react(), tailwindcss()],
});

let browser, page;
const results = [], errors = [], externalRequests = [];
try {
    await server.listen();
    const url = 'http://127.0.0.1:' + server.httpServer.address().port + '/fixture';
    if (serve) { console.log('Synthetic-only IPO list preview: ' + url + '\nIsolated cache/artifacts: ' + artifacts);await new Promise(() => {}); }
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
    page.setDefaultTimeout(7000);
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
        const address = new URL(route.request().url());
        if (address.origin === new URL(url).origin) return route.continue();
        externalRequests.push(address.href);return route.abort();
    });
    await page.goto(url);
    const rows = () => page.locator('.ipo-list-table tbody tr').filter({ has: page.locator('td.data-table__cell--primary') });
    const headings = () => page.locator('th[data-ipo-column]').evaluateAll(elements => elements.map(element => element.dataset.ipoColumn));
    const search = () => page.getByRole('searchbox', { name: 'Search table', exact: true });
    const columns = () => page.getByRole('button', { name: 'Edit Table', exact: true });
    const chooser = () => page.getByRole('dialog', { name: 'Edit IPO Table', exact: true });
    const popupLabel = label => (['Indicators', 'Commodities'].includes(label) ? 'Filter ' : 'Filter and sort ') + label;
    const trigger = label => page.getByRole('button', { name: popupLabel(label), exact: true });
    const menu = label => page.getByRole('dialog', { name: popupLabel(label), exact: true });
    const defaults = ['id', 'name', 'location', 'flags', 'commodities', 'levelOfDevelopment'];
    const settle = async () => { await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); };
    const ready = async () => { await page.waitForFunction(() => window.fixture?.reads.length > 0 && document.querySelector('th[data-ipo-column="name"]'));await settle(); };
    const configure = async (options = {}, preferences, legacy) => { await page.keyboard.press('Escape');await page.setViewportSize({ width: 1440, height: 1000 });await page.evaluate(({ options, preferences, legacy }) => window.configure(options, preferences, legacy), { options, preferences, legacy });await ready(); };
    const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('4kis:ipo-list:1:v1')));
    const ids = () => rows().evaluateAll(elements => elements.map(element => Number(element.querySelector('td.data-table__cell--mono').textContent)));
    const openFilter = async label => { await trigger(label).click();await menu(label).waitFor();await settle();return menu(label); };
    const filter = async (label, choices) => { const dialog = await openFilter(label);await dialog.getByRole('button', { name: 'Clear', exact: true }).click();for (const value of choices) await dialog.getByRole('checkbox', { name: value, exact: true }).check();await dialog.getByRole('button', { name: 'Apply', exact: true }).click();await settle(); };
    const showColumns = async labels => { await columns().click();for (const label of labels) await chooser().getByRole('checkbox', { name: label, exact: true }).check();await chooser().getByRole('button', { name: 'Apply', exact: true }).click();await settle(); };
    const counts = () => page.evaluate(() => ({ reads: window.fixture.reads.length, writes: window.fixture.writes.length }));
    const sort = async (label, direction = 'Ascending') => { const dialog = await openFilter(label);await dialog.getByRole('button', { name: direction, exact: true }).click();await dialog.getByRole('button', { name: 'Apply', exact: true }).click();await settle(); };
    const viewports = [[1440,1000],[820,1000],[390,844],[320,640]];
    const tableStyleMetrics = () => page.locator('.ipo-list-table').evaluate(table => {
        const properties = ['fontFamily','fontSize','fontWeight','lineHeight','paddingTop','paddingRight','paddingBottom','paddingLeft','borderTopWidth','borderBottomWidth','borderLeftWidth','borderRightWidth','borderBottomStyle','textAlign','verticalAlign','whiteSpace'];
        const style = element => Object.fromEntries(properties.map(key => [key, getComputedStyle(element)[key]]));
        const first = table.querySelector('tbody tr');
        const pagination = document.querySelector('.data-table-pagination');
        return { rowHeight: first.getBoundingClientRect().height, cells: [...first.cells].map(style), headerFont: Object.fromEntries(['fontFamily','fontSize','fontWeight'].map(key => [key,getComputedStyle(table.querySelector('th'))[key]])), pagination: pagination ? style(pagination) : null };
    });
    const canonicalMetrics = {};
    const assertSearchFocus = async (dialog, kind) => {
        const input = dialog.getByRole('searchbox');
        assert(await input.evaluate(element=>element===document.activeElement),`${kind}: search keeps focus`);
        const metrics = await input.evaluate(element=>{
            const style=getComputedStyle(element),rect=element.getBoundingClientRect(),menu=element.closest('[role="dialog"]'),box=menu.getBoundingClientRect(),menuStyle=getComputedStyle(menu);
            return{outlineWidth:parseFloat(style.outlineWidth),outlineOffset:parseFloat(style.outlineOffset),outlineStyle:style.outlineStyle,shadow:style.boxShadow,outlineColor:style.outlineColor,borderColor:style.borderTopColor,boxSizing:style.boxSizing,x:rect.x,right:rect.right,menuLeft:box.left+parseFloat(menuStyle.borderLeftWidth)+parseFloat(menuStyle.paddingLeft),menuRight:box.right-parseFloat(menuStyle.borderRightWidth)-parseFloat(menuStyle.paddingRight)};
        });
        assert.equal(metrics.outlineStyle,'solid');assert.equal(metrics.outlineWidth,2);assert.equal(metrics.outlineOffset,-2);assert.equal(metrics.shadow,'none');assert.equal(metrics.outlineColor,metrics.borderColor);assert.equal(metrics.boxSizing,'border-box');
        assert(metrics.outlineWidth+metrics.outlineOffset<=0,`${kind}: no focus paint outside the input`);assert(metrics.x>=metrics.menuLeft-1&&metrics.right<=metrics.menuRight+1,`${kind}: field stays within popup padding`);
    };
    const check = async (name, run) => {
        const start = Date.now(), errorOffset = errors.length;
        try { await run();assert.deepEqual(errors.slice(errorOffset), [], 'No React/runtime errors');assert.deepEqual(await page.evaluate(() => window.fixture.writes), [], 'No business writes or writing callbacks');results.push({ name, status: 'passed', ms: Date.now() - start });console.log('PASS ' + name); }
        catch (error) { const stem = 'failure-' + results.length;await page.screenshot({ path: path.join(artifacts, stem + '.png'), fullPage: true }).catch(() => {});await writeFile(path.join(artifacts, stem + '.txt'), await page.locator('body').innerText().catch(() => 'Unavailable'));await writeFile(path.join(artifacts, stem + '-menus.json'),JSON.stringify(await page.locator('[role="dialog"]').evaluateAll(elements=>elements.map(element=>({label:element.getAttribute('aria-label'),parts:[element,...element.children].map(part=>{const r=part.getBoundingClientRect();return{className:part.className,x:r.x,y:r.y,width:r.width,height:r.height,scrollHeight:part.scrollHeight}})}))),null,2));results.push({ name, status: 'failed', error: error.stack, ms: Date.now() - start });console.error('FAIL ' + name + '\n' + error.message); }
    };
    await page.goto(new URL('/canonical-fixture', url).href);await ready();
    for (const [width,height] of viewports) { await page.setViewportSize({width,height});await settle();canonicalMetrics[width] = await tableStyleMetrics(); }
    await writeFile(path.join(artifacts, 'canonical-table-styles.json'), JSON.stringify({baselineCommit,metrics:canonicalMetrics}, null, 2));
    await page.goto(url);await ready();
    await check('six unchanged defaults and settled initial read baseline', async () => {
        await configure();assert.deepEqual(await headings(), defaults);assert.equal(await rows().count(), 10);assert.deepEqual(await ids(), [24,23,22,21,20,19,18,17,16,15]);
        assert.deepEqual(await counts(), { reads: 1, writes: 0 });assert.equal(await page.locator('.app-main .major-table-toolbar').count(), 1);
    });
    await check('chooser grouping search locked defaults Cancel Apply Reset and no reads', async () => {
        await configure();const before = await counts();await columns().click();
        assert.deepEqual(await chooser().locator('legend').allTextContents(), ['Default','Profile','Membership','FFEDIS']);
        assert.equal(await chooser().getByRole('searchbox', { name: 'Search columns', exact: true }).count(), 1);
        assert.equal(await chooser().locator('input[type="checkbox"]:not(:disabled)').count(), 16);
        for (const label of ['IPO ID','IPO Name','Location','Indicators','Commodities','Level of Development']) { const box = chooser().getByRole('checkbox', { name: label, exact: true });assert(await box.isDisabled());assert(await box.isChecked()); }
        for (const label of ['Women-Led','GIDA','ELCAC','SCAD','F2C2 Cluster','FFEDIS Registered','Flags']) assert.equal(await chooser().getByRole('checkbox', { name: label, exact: true }).count(), 0);
        await chooser().getByRole('searchbox').fill('membership');assert.equal(await chooser().getByRole('checkbox').count(), 7);
        await chooser().getByRole('checkbox', { name: 'Total Members', exact: true }).check();await chooser().getByRole('button', { name: 'Cancel', exact: true }).click();assert.deepEqual(await headings(), defaults);
        await columns().click();assert.equal(await chooser().getByRole('searchbox').inputValue(), '');assert.equal(await chooser().getByRole('checkbox', { name: 'Total Members', exact: true }).isChecked(), false);
        await chooser().getByRole('searchbox').fill('no-such-column');assert.equal(await chooser().getByText('No matching columns.').count(), 1);await chooser().getByRole('searchbox').fill('');
        await chooser().getByRole('checkbox', { name: 'Total Members', exact: true }).check();await chooser().getByRole('button', { name: 'Apply', exact: true }).click();assert.deepEqual(await headings(), [...defaults,'totalMembers']);
        await columns().click();await chooser().getByRole('button', { name: 'Reset Columns', exact: true }).click();assert.deepEqual(await headings(), [...defaults,'totalMembers']);await chooser().getByRole('button', { name: 'Cancel', exact: true }).click();assert.deepEqual(await headings(), [...defaults,'totalMembers']);
        await columns().click();await chooser().getByRole('button', { name: 'Reset Columns', exact: true }).click();await chooser().getByRole('button', { name: 'Apply', exact: true }).click();assert.deepEqual(await headings(), defaults);assert.deepEqual(await counts(), before);
    });
    // Additional scenarios are deliberately independent so a regression preserves later evidence.
    await check('global search includes visible optional columns and legacy contact/domain fields', async () => {
        await configure();const before = await counts();await search().fill('ICC-ONLY-1');assert.equal(await rows().count(), 0);
        await showColumns(['Indigenous Cultural Community']);assert.equal(await rows().count(), 10);assert.match(await rows().first().innerText(), /Synthetic IPO/);
        await search().fill('Contact-SYN-2');assert.deepEqual(await ids(), [24,23,22,21,20,2]);
        await search().fill('AD-SYN-3');assert.deepEqual(await ids(), [3]);
        await search().fill('ICC-ONLY-3');assert.deepEqual(await ids(), [3]);
        await columns().click();await chooser().getByRole('checkbox', { name: 'Indigenous Cultural Community', exact: true }).uncheck();await chooser().getByRole('button', { name: 'Apply', exact: true }).click();assert.equal(await rows().count(), 0);assert.deepEqual(await counts(), before);
    });
    await check('header search and checkbox OR, across-column AND, Cancel and retained options', async () => {
        await configure();const before = await counts();let dialog = await openFilter('IPO Name');
        await dialog.getByRole('button', { name: 'Clear', exact: true }).click();await dialog.getByRole('searchbox').fill('alpha');assert.equal(await dialog.getByRole('checkbox').count(), 1);await dialog.getByRole('checkbox', { name: 'Alpha Synthetic IPO', exact: true }).check();
        await dialog.getByRole('searchbox').fill('birch');await dialog.getByRole('checkbox', { name: 'Birch Synthetic IPO', exact: true }).check();await dialog.getByRole('button', { name: 'Apply', exact: true }).click();assert.deepEqual(await ids(), [2,1]);
        await filter('Location', ['North Synthetic Town']);assert.deepEqual(await ids(), [1]);
        dialog = await openFilter('IPO Name');assert.equal(await dialog.getByRole('checkbox').count(), 24, 'Options are derived from the full prop set, not filtered rows');assert(await dialog.getByRole('checkbox', { name: 'Birch Synthetic IPO', exact: true }).isChecked());
        await dialog.getByRole('searchbox').fill('nothing-matches');assert.equal(await dialog.getByText('No matching options.').count(), 1);await dialog.getByRole('button', { name: 'Clear', exact: true }).click();await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();assert.deepEqual(await ids(), [1]);
        await page.getByRole('button', { name: 'Reset Filters', exact: true }).click();assert.equal(await rows().count(), 10);assert.deepEqual(await counts(), before);
    });
    await check('Indicators unrestricted first-check, AND, Select All AND and Reset unrestricted', async () => {
        await configure();const before = await counts();let dialog = await openFilter('Indicators');
        assert.equal(await dialog.getByRole('checkbox', { checked: true }).count(), 0);
        await dialog.getByRole('checkbox', { name: 'Women-Led', exact: true }).check();await dialog.getByRole('button', { name: 'Apply', exact: true }).click();assert.deepEqual(await ids(), [4,2,1]);assert.deepEqual((await saved()).filters.flags, ['Women-Led']);
        dialog = await openFilter('Indicators');await dialog.getByRole('checkbox', { name: 'GIDA', exact: true }).check();await dialog.getByRole('button', { name: 'Apply', exact: true }).click();assert.deepEqual(await ids(), [4,1]);
        await filter('Location', ['North Synthetic Town']);assert.deepEqual(await ids(), [1]);await page.getByRole('button', { name: 'Reset Filters', exact: true }).click();
        dialog = await openFilter('Indicators');await dialog.getByRole('button', { name: 'Select All', exact: true }).click();assert.equal(await dialog.getByRole('checkbox', { checked: true }).count(), 8);assert.equal(await dialog.getByRole('checkbox', { name: 'Not Recorded', exact: true }).isChecked(), false);await dialog.getByRole('button', { name: 'Apply', exact: true }).click();assert.equal(await rows().count(), 0);
        assert.equal((await saved()).filters.flags.length, 8);dialog = await openFilter('Indicators');await dialog.getByRole('button', { name: 'Reset Indicators filter', exact: true }).click();await dialog.getByRole('button', { name: 'Apply', exact: true }).click();assert.equal(await rows().count(), 10);assert.equal(Object.hasOwn((await saved()).filters, 'flags'), false);assert.deepEqual(await counts(), before);
    });
    await check('explicit none survives refresh and ordinary Select All is unrestricted including new data', async () => {
        await configure();await filter('Location', []);assert.equal(await rows().count(), 0);assert.deepEqual((await saved()).filters.location, []);
        await page.reload();await ready();assert.equal(await rows().count(), 0);assert.deepEqual((await saved()).filters.location, []);
        let dialog = await openFilter('Location');assert.equal(await dialog.getByRole('checkbox', { checked: true }).count(), 0);await dialog.getByRole('button', { name: 'Select All', exact: true }).click();await dialog.getByRole('button', { name: 'Apply', exact: true }).click();assert.equal(Object.hasOwn((await saved()).filters, 'location'), false);
        await page.evaluate(() => window.replaceRows([{...window.fixture.rows[0],id:99,name:'New Synthetic IPO',location:'New Synthetic Town'}]));await settle();assert.deepEqual(await ids(), [99]);
        dialog = await openFilter('Location');assert(await dialog.getByRole('checkbox', { name: 'New Synthetic Town', exact: true }).isChecked());await page.keyboard.press('Escape');
    });
    await check('selected filter values survive removal from the incoming prop options', async () => {
        await configure();await filter('IPO Name', ['Alpha Synthetic IPO']);await page.evaluate(() => window.replaceRows(window.fixture.rows.filter(row => row.id !== 1)));await settle();assert.equal(await rows().count(), 0);
        const dialog = await openFilter('IPO Name');const selected = dialog.getByRole('checkbox', { name: 'Alpha Synthetic IPO', exact: true });assert(await selected.isChecked());assert.equal(await dialog.getByRole('checkbox').count(), 24);await page.keyboard.press('Escape');
    });
    for (const dismissal of ['Cancel','Escape','outside']) {
        await check(`sort and checkbox drafts discard together on ${dismissal}`, async () => {
            await configure();await sort('IPO Name');await filter('Location',['North Synthetic Town']);
            const beforeIds = await ids(), beforeSaved = await saved(), beforeCounts = await counts();
            let dialog = await openFilter('IPO Name');assert.deepEqual(await ids(),beforeIds,'Opening a title does not sort');
            await dialog.getByRole('button',{name:'Descending',exact:true}).click();
            assert.equal(await dialog.getByRole('button',{name:'Descending',exact:true}).getAttribute('aria-pressed'),'true');
            assert.equal(await dialog.getByRole('button',{name:'Ascending',exact:true}).getAttribute('aria-pressed'),'false');
            await dialog.getByRole('button',{name:'Clear',exact:true}).click();await dialog.getByRole('checkbox',{name:'Alpha Synthetic IPO',exact:true}).check();
            assert.deepEqual(await ids(),beforeIds);assert.deepEqual(await saved(),beforeSaved);
            if (dismissal === 'Cancel') await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
            else if (dismissal === 'Escape') await page.keyboard.press('Escape');
            else await page.getByRole('heading',{name:'IPO Management',exact:true}).click();
            await dialog.waitFor({state:'hidden'});await settle();assert.deepEqual(await ids(),beforeIds);assert.deepEqual(await saved(),beforeSaved);
            assert.equal(await page.locator('th[data-ipo-column="name"]').getAttribute('aria-sort'),'ascending');
            dialog = await openFilter('IPO Name');assert.equal(await dialog.getByRole('button',{name:'Ascending',exact:true}).getAttribute('aria-pressed'),'true');assert.equal(await dialog.getByRole('checkbox',{checked:true}).count(),24);
            await page.keyboard.press('Escape');assert.deepEqual(await counts(),beforeCounts);
        });
    }
    await check('Apply commits sort and filter together; Default Order preserves all filters', async () => {
        await configure();const before = await counts();await filter('Location',['North Synthetic Town']);let dialog = await openFilter('IPO Name');
        await dialog.getByRole('button',{name:'Ascending',exact:true}).click();await dialog.getByRole('button',{name:'Clear',exact:true}).click();
        for (const label of ['Alpha Synthetic IPO','Cedar Synthetic IPO']) await dialog.getByRole('checkbox',{name:label,exact:true}).check();
        assert.deepEqual((await ids()).slice(0,2),[23,21]);await dialog.getByRole('button',{name:'Apply',exact:true}).click();await settle();assert.deepEqual(await ids(),[1,3]);
        const filters = (await saved()).filters;dialog = await openFilter('IPO Name');await dialog.getByRole('button',{name:'Default Order',exact:true}).click();
        assert.deepEqual(await ids(),[1,3]);assert.deepEqual((await saved()).filters,filters);await dialog.getByRole('button',{name:'Apply',exact:true}).click();await settle();assert.deepEqual(await ids(),[3,1]);assert.deepEqual((await saved()).filters,filters);
        assert.equal(await page.locator('th[data-ipo-column="name"]').getAttribute('aria-sort'),'none');assert.deepEqual(await counts(),before);
    });
    await check('Select All resets ordinary filters without altering committed or drafted sorting', async () => {
        await configure();await sort('IPO Name');await filter('IPO Name',['Alpha Synthetic IPO']);await filter('Location',['North Synthetic Town']);const before = await counts();
        let dialog = await openFilter('IPO Name');assert.equal(await dialog.getByRole('button',{name:'Reset IPO Name filter',exact:true}).count(),0);await dialog.getByRole('button',{name:'Select All',exact:true}).click();assert.deepEqual(await ids(),[1]);assert.equal(await dialog.getByRole('button',{name:'Ascending',exact:true}).getAttribute('aria-pressed'),'true');
        await dialog.getByRole('button',{name:'Apply',exact:true}).click();await settle();assert.deepEqual((await ids()).slice(0,2),[1,3]);assert.equal(Object.hasOwn((await saved()).filters,'name'),false);assert.deepEqual((await saved()).filters.location,['North Synthetic Town']);
        dialog = await openFilter('IPO Name');await dialog.getByRole('button',{name:'Descending',exact:true}).click();await dialog.getByRole('button',{name:'Clear',exact:true}).click();await dialog.getByRole('button',{name:'Select All',exact:true}).click();
        assert.equal(await dialog.getByRole('button',{name:'Descending',exact:true}).getAttribute('aria-pressed'),'true');await dialog.getByRole('button',{name:'Apply',exact:true}).click();await settle();assert.equal(await page.locator('th[data-ipo-column="name"]').getAttribute('aria-sort'),'descending');await page.getByRole('button',{name:'Next',exact:true}).click();assert.deepEqual(await ids(),[3,1]);assert.deepEqual(await counts(),before);
    });
    await check('footer resets are removed while Indicators retains its distinct unrestricted command', async () => {
        await configure();await sort('IPO Name');await filter('Indicators',['Women-Led']);const before = await counts();
        let dialog = await openFilter('Indicators');assert.equal(await dialog.locator('.ipo-list-menu-footer svg').count(),0);assert.deepEqual(await dialog.locator('.ipo-list-menu-footer button').allTextContents(),['Cancel','Apply']);
        assert.equal(await dialog.getByRole('button',{name:'Reset Indicators filter',exact:true}).innerText(),'Reset Filter');
        await dialog.getByRole('button',{name:'Select All',exact:true}).click();await dialog.getByRole('button',{name:'Apply',exact:true}).click();assert.equal(await rows().count(),0);
        dialog = await openFilter('Indicators');await dialog.getByRole('button',{name:'Reset Indicators filter',exact:true}).click();await dialog.getByRole('button',{name:'Apply',exact:true}).click();assert.equal(await rows().count(),10);assert.equal(await page.locator('th[data-ipo-column="name"]').getAttribute('aria-sort'),'ascending');assert.equal(Object.hasOwn((await saved()).filters,'flags'),false);
        dialog = await openFilter('IPO Name');assert.equal(await dialog.getByRole('button',{name:'Default Order',exact:true}).getAttribute('title'),'Default Order (reset sorting)');assert.equal(await dialog.locator('.ipo-list-menu-footer svg').count(),0);await page.keyboard.press('Escape');assert.deepEqual(await counts(),before);
    });
    await check('text numeric and calendar dates sort by values rather than formatted labels', async () => {
        await configure();await sort('IPO Name');assert.deepEqual((await ids()).slice(0,4),[1,2,3,4]);await sort('IPO Name','Descending');assert.deepEqual((await ids()).slice(0,3),[24,23,22]);
        const sample = await page.evaluate(() => window.fixture.rows.slice(0,3).map((row,index)=>({...row,registrationDate:['2025-12-31','2026-02-01','2026-01-15'][index],isFfedisRegistered:true,ffedisRegistrationDate:['2026-10-01','2025-12-31','2026-02-01'][index]})));
        await configure({rows:sample});await showColumns(['Registration Date','FFEDIS Registration Date']);const before = await counts();
        await sort('Registration Date');assert.deepEqual(await ids(),[1,3,2]);await sort('Registration Date','Descending');assert.deepEqual(await ids(),[2,3,1]);await sort('FFEDIS Registration Date');assert.deepEqual(await ids(),[2,3,1]);await sort('FFEDIS Registration Date','Descending');assert.deepEqual(await ids(),[1,3,2]);assert.deepEqual(await counts(),before);
    });
    await check('retired indicator IDs and false/null filters are removed without changing flags or other preferences', async () => {
        const retired = ['isWomenLed','isWithinGida','isWithinElcac','isWithScad','isF2c2Cluster','isFfedisRegistered'];
        for (const value of ['false','__not_recorded__','No','Not Recorded']) {
            await configure({}, {optionalColumns:['region','totalMembers',...retired],filters:{...Object.fromEntries(retired.map(key=>[key,[value]])),flags:['Women-Led'],location:['North Synthetic Town']},search:'Alpha',sort:{key:'isWomenLed',direction:'ascending'}});
            const preferences = await saved();assert.deepEqual(await headings(),[...defaults,'region','totalMembers']);assert.deepEqual(preferences.optionalColumns,['region','totalMembers']);assert.deepEqual(preferences.filters,{flags:['Women-Led'],location:['North Synthetic Town']});assert.equal(await search().inputValue(),'Alpha');assert.deepEqual(await ids(),[1]);
            await page.reload();await ready();assert.deepEqual(await saved(),preferences);assert.deepEqual(await ids(),[1]);
            await search().fill('');await page.getByRole('button',{name:'Reset Filters',exact:true}).click();assert.deepEqual(await ids(),[24,23,22,21,20,19,18,17,16,15]);
        }
    });
    await check('Indicators show only explicit true values and retain full native tooltips', async () => {
        await configure();await filter('IPO ID',['1','2','3','4']);
        const indicatorCells = rows().locator('td').filter({has:page.locator('[title]')});assert(await indicatorCells.count()>0);
        for (const [id,expected] of [[1,['Women-Led','GIDA','FFEDIS Registered']],[2,['Women-Led']],[3,['GIDA']],[4,['Women-Led','GIDA','F2C2 Cluster']]]) {
            const row = rows().filter({has:page.locator('td.data-table__cell--mono',{hasText:new RegExp(`^${id}$`)})});const cell = row.locator('td').nth(3);const title = await cell.locator('[title]').getAttribute('title');
            for (const label of expected) assert(title.includes(label));for (const label of ['ELCAC','SCAD']) assert(!title.includes(label));assert.equal(await cell.evaluate(element=>getComputedStyle(element).whiteSpace),'nowrap');
        }
        await filter('Indicators',[]);assert.equal(await rows().count(),0);assert.deepEqual((await saved()).filters.flags,[]);
        const keys = ['isWomenLed','isWithinGida','isWithinElcac','isWithScad','isF2c2Cluster','isFfedisRegistered'];
        const samples = await page.evaluate(keys=>window.fixture.rows.slice(0,3).map((row,index)=>({...row,...Object.fromEntries(keys.map(key=>[key,[true,false,null][index]]))})),keys);
        await configure({rows:samples});const positive = rows().filter({has:page.locator('td.data-table__cell--mono',{hasText:/^1$/})}).locator('td').nth(3);const title = await positive.locator('[title]').getAttribute('title');
        for(const label of ['Women-Led','GIDA','ELCAC','SCAD','F2C2 Cluster','FFEDIS Registered']) { assert(title.includes(label));await filter('Indicators',[label]);assert.deepEqual(await ids(),[1]); }
        await page.getByRole('button',{name:'Reset Filters',exact:true}).click();for(const id of [2,3]) { await filter('IPO ID',[String(id)]);assert.equal(await rows().first().locator('td').nth(3).innerText(),'\u2014'); }
    });
    await check('Indicators retain relationship filters without adding relationship columns', async () => {
        await configure({subprojects:[{id:101,indigenousPeopleOrganization:'Alpha Synthetic IPO'},{id:102,indigenousPeopleOrganization:'Birch Synthetic IPO'}],activities:[{id:201,type:'Training',participatingIpos:['Alpha Synthetic IPO','Cedar Synthetic IPO']},{id:202,type:'Activity',participatingIpos:['Birch Synthetic IPO']}]});const before = await counts();
        await filter('Indicators',['With Subprojects']);assert.deepEqual(await ids(),[2,1]);await filter('Indicators',['With Trainings']);assert.deepEqual(await ids(),[3,1]);await filter('Indicators',['With Subprojects','With Trainings','Women-Led']);assert.deepEqual(await ids(),[1]);assert.deepEqual(await headings(),defaults);assert.deepEqual(await counts(),before);
    });
    await check('hiding optional columns clears their filter and active sort', async () => {
        await configure();await showColumns(['Total Members']);await sort('Total Members');assert.equal(await page.locator('th[data-ipo-column="totalMembers"]').getAttribute('aria-sort'), 'ascending');await filter('Total Members', ['0']);assert.deepEqual(await ids(), [1]);
        const before = await counts();await columns().click();await chooser().getByRole('checkbox', { name: 'Total Members', exact: true }).uncheck();await chooser().getByRole('button', { name: 'Apply', exact: true }).click();assert.deepEqual(await headings(), defaults);assert.equal(Object.hasOwn((await saved()).filters, 'totalMembers'), false);assert.deepEqual(await ids(), [24,23,22,21,20,19,18,17,16,15]);
        await showColumns(['Total Members']);assert.equal(await page.locator('th[data-ipo-column="totalMembers"]').getAttribute('aria-sort'), 'none');assert.deepEqual(await counts(), before);
    });
    await check('preferences refresh and same-mounted A to B to A and anonymous isolation', async () => {
        await configure();await showColumns(['Region']);await search().fill('Alpha');await filter('Location', ['North Synthetic Town']);const a = await saved();await page.reload();await ready();assert.deepEqual(await saved(), a);assert.deepEqual(await ids(), [1]);
        const epoch = await page.locator('main').getAttribute('data-epoch'), before = await counts();await page.evaluate(() => window.identity({userId:2}));await settle();assert.deepEqual(await headings(), defaults);assert.equal(await search().inputValue(), '');assert.equal(await rows().count(), 10);
        await showColumns(['Total Members']);await search().fill('Birch');await page.evaluate(() => window.identity({userId:1}));await settle();assert.deepEqual(await headings(), [...defaults,'region']);assert.equal(await search().inputValue(), 'Alpha');assert.deepEqual(await saved(), a);
        await page.evaluate(() => window.identity({userId:null}));await settle();assert.deepEqual(await headings(), defaults);assert.equal(await search().inputValue(), '');await search().fill('Cedar');await showColumns(['Registering Body']);
        assert.equal(await page.evaluate(() => localStorage.getItem('4kis:ipo-list:undefined:v1')), null);await page.evaluate(() => window.identity({userId:2}));await settle();assert.equal(await search().inputValue(), 'Birch');assert.deepEqual(await headings(), [...defaults,'totalMembers']);
        await page.evaluate(() => window.identity({userId:1}));await settle();assert.deepEqual(await saved(), a);assert.equal(await page.locator('main').getAttribute('data-epoch'), epoch);assert.deepEqual(await counts(), {reads:before.reads+5,writes:0}, 'Each account-key remount performs one initial LOD read; ordinary controls do not');
    });
    await check('account transition resets transient selection sort and open chooser drafts', async () => {
        await configure();await sort('IPO Name');await page.getByRole('button', { name: 'Delete multiple IPOs', exact: true }).click();await page.getByRole('checkbox', { name: 'Select Alpha Synthetic IPO', exact: true }).check();await columns().click();await chooser().getByRole('checkbox', { name: 'Total Members', exact: true }).check();
        await page.evaluate(() => window.identity({userId:2}));await settle();assert.equal(await chooser().count(), 0);assert.equal(await page.getByRole('region', { name: 'delete selection mode' }).count(), 0);assert.equal(await page.locator('th[data-ipo-column="name"]').getAttribute('aria-sort'), 'none');assert.deepEqual(await headings(), defaults);
        await page.evaluate(() => window.identity({userId:1}));await settle();await columns().click();assert.equal(await chooser().getByRole('checkbox', { name: 'Total Members', exact: true }).isChecked(), false);await page.keyboard.press('Escape');
    });
    await check('malformed and blocked storage remain usable and normalize unsafe preferences', async () => {
        for (const raw of ['{broken','null','[]','42','{"version":99,"optionalColumns":["region"]}']) { await configure({}, raw);assert.deepEqual(await headings(), defaults);assert.equal(await rows().count(), 10); }
        await configure({}, { optionalColumns:['region','region','name','unknown'],filters:{region:[],totalMembers:['0'],name:[42],unknown:['x']},search:17 });assert.deepEqual(await headings(), [...defaults,'region']);assert.deepEqual((await saved()).filters, {region:[]});assert.equal(await search().inputValue(), '');
        await configure({blockStorage:true});await showColumns(['Total Members']);await search().fill('Alpha');assert.deepEqual(await ids(), [1]);await filter('Total Members',['0']);assert.deepEqual(await ids(), [1]);await page.evaluate(() => window.identity({userId:2}));await settle();assert.deepEqual(await headings(), defaults);assert.equal(await search().inputValue(), '');
    });
    await check('legacy filters migrate and external Region replaces a conflicting saved Region', async () => {
        await configure();const [r1,r2] = await page.evaluate(() => window.fixture.regions);
        await configure({}, undefined, {regionFilter:r1,columnFilters:{region:[r2]},flagFilter:{womenLed:false},searchTerm:''});assert.deepEqual(await headings(), [...defaults,'region']);assert.deepEqual((await saved()).filters.region, []);assert.equal(await rows().count(), 0);
        const before = await counts();await page.evaluate(region => window.external({region}),r2);await settle();assert.deepEqual((await saved()).filters.region,[r2]);assert.equal(await rows().count(),10);assert.equal(await page.evaluate(() => window.fixture.cleared),1);
        await page.evaluate(region => window.external({region}),r1);await settle();assert.deepEqual((await saved()).filters.region,[r1]);assert.equal(await page.evaluate(() => window.fixture.cleared),2);assert.deepEqual(await counts(),before);
    });
    await check('numeric zero differs from missing; numeric sort and FFEDIS metadata gating', async () => {
        await configure();await showColumns(['Total Members','FFEDIS Registration Number','FFEDIS Registration Date']);const before = await counts();
        await sort('Total Members');assert.deepEqual((await ids()).slice(0,4),[1,3,4,5]);
        const memberIndex = (await headings()).indexOf('totalMembers');assert.equal(await rows().first().locator('td').nth(memberIndex).innerText(),'0');
        await sort('Total Members','Descending');await page.getByRole('button', {name:'Next',exact:true}).click();await page.getByRole('button', {name:'Next',exact:true}).click();assert.equal((await ids()).at(-1),2);assert.equal(await rows().last().locator('td').nth(memberIndex).innerText(),'\u2014');
        await filter('Total Members',['0']);assert.deepEqual(await ids(),[1]);await filter('Total Members',['Not Recorded']);assert.deepEqual(await ids(),[2]);
        const numberIndex = (await headings()).indexOf('ffedisRegistrationNumber');assert.equal(await rows().first().locator('td').nth(numberIndex).innerText(),'\u2014');
        await page.getByRole('button',{name:'Reset Filters',exact:true}).click();await filter('Indicators',['FFEDIS Registered']);assert.deepEqual(await ids(),[1]);assert.equal(await rows().first().locator('td').nth(numberIndex).innerText(),'VISIBLE-FFEDIS');
        await page.getByRole('button',{name:'Reset Filters',exact:true}).click();await search().fill('HIDDEN-FFEDIS');assert.equal(await rows().count(),0);await search().fill('VISIBLE-FFEDIS');assert.deepEqual(await ids(),[1]);
        const dialog = await openFilter('FFEDIS Registration Number');assert.deepEqual(await dialog.getByRole('checkbox').allTextContents(),['','']);assert.equal(await dialog.getByRole('checkbox',{name:/HIDDEN/}).count(),0);assert.equal(await dialog.getByRole('checkbox',{name:'Not Recorded',exact:true}).count(),1);await page.keyboard.press('Escape');assert.deepEqual(await counts(),before);
    });
    await check('LOD sorting and filtering use displayed computed manual carried-over and status labels', async () => {
        await configure();const before = await counts();await sort('Level of Development');assert.deepEqual((await ids()).slice(0,3),[2,3,1]);
        assert.deepEqual((await rows().locator('td').filter({has:page.locator('.data-table-level')}).allTextContents()).slice(0,3),['Level 1','Level 3','Level 4']);
        await filter('Level of Development',['Level 4']);assert.deepEqual(await ids(),[1]);await filter('Level of Development',['Dropped']);assert.deepEqual(await ids(),[4]);await filter('Level of Development',['Incomplete']);assert.deepEqual(await ids(),[5]);await filter('Level of Development',['For Assessment']);assert.equal(await rows().count(),10);
        await search().fill('Level 5');assert.equal(await rows().count(),0,'Stale IPO.levelOfDevelopment does not override the displayed assessment');assert.deepEqual(await counts(),before);
    });
    await check('complete filtered export is independent of page and selected columns', async () => {
        await configure();await filter('Location',['North Synthetic Town']);await showColumns(['Region','Total Members']);const before = await counts();assert.equal(await rows().count(),10);await page.getByRole('button',{name:'Next',exact:true}).click();assert.equal(await rows().count(),2);
        await page.getByRole('button',{name:'Export',exact:true}).click();const exported = await page.evaluate(() => window.fixture.exports.at(-1));assert.deepEqual(exported.map(row=>row.id),[23,21,19,17,15,13,11,9,7,5,3,1]);assert.equal(exported[0].contactNumber,'0900-000-0023');assert.equal(exported[0].totalMembers,122);assert.equal(exported[0].ffedisRegistrationNumber,'HIDDEN-FFEDIS-23','The existing full-record export contract is retained; visible columns do not trim the payload');
        assert.deepEqual(await counts(),before);await search().fill('no-such-ipo');await page.getByRole('button',{name:'Export',exact:true}).click();assert.deepEqual(await page.evaluate(() => window.fixture.exports.at(-1)),[]);
    });
    await check('page preservation on harmless column Apply and clamp after incoming data shrinks', async () => {
        await configure();await page.getByRole('button',{name:'Next',exact:true}).click();const second = await ids(), before = await counts();assert.deepEqual(second,[14,13,12,11,10,9,8,7,6,5]);await columns().click();await chooser().getByRole('button',{name:'Cancel',exact:true}).click();assert.deepEqual(await ids(),second);
        await showColumns(['Region']);assert.deepEqual(await ids(),second);assert.deepEqual(await counts(),before);await page.getByRole('button',{name:'Next',exact:true}).click();assert.deepEqual(await ids(),[4,3,2,1]);
        await page.evaluate(() => window.replaceRows(window.fixture.rows.slice(0,4)));await settle();assert.deepEqual(await ids(),[4,3,2,1]);assert(await page.getByRole('button',{name:'Next',exact:true}).isDisabled());assert(await page.getByRole('button',{name:'Previous',exact:true}).isDisabled());
        await page.evaluate(() => window.replaceRows([]));await settle();assert.equal(await rows().count(),0);assert.equal(await page.getByText('No IPOs match the current filters.',{exact:true}).count(),1);assert(await page.getByRole('button',{name:'Previous',exact:true}).isDisabled());
    });
    await check('bulk-delete selection UI supports page selection pruning and cancelled confirmation without writes', async () => {
        await configure();const before = await counts();await page.getByRole('button',{name:'Delete multiple IPOs',exact:true}).click();const bar = page.getByRole('region',{name:'delete selection mode'});assert(await bar.getByRole('button',{name:'Delete',exact:true}).isDisabled());
        await page.getByRole('checkbox',{name:'Select all IPOs on this page',exact:true}).check();assert.equal(await bar.getByText('10 selected',{exact:true}).count(),1);await bar.getByRole('button',{name:'Delete (10)',exact:true}).click();const confirm = page.getByRole('alertdialog');await confirm.waitFor();assert.equal(await confirm.getByRole('button',{name:'Delete',exact:true}).count(),1);await confirm.getByRole('button',{name:'Cancel',exact:true}).click();
        await page.getByRole('button',{name:'Next',exact:true}).click();await page.getByRole('checkbox',{name:'Select Synthetic IPO 14',exact:true}).check();assert.equal(await bar.getByText('11 selected',{exact:true}).count(),1);await page.getByRole('button',{name:'Previous',exact:true}).click();await page.getByRole('checkbox',{name:'Select all IPOs on this page',exact:true}).uncheck();assert.equal(await bar.getByText('1 selected',{exact:true}).count(),1);
        await search().fill('Alpha');assert.equal(await bar.getByText('Select rows to delete',{exact:true}).count(),1);assert.equal(await page.evaluate(() => window.fixture.navigation.length),0);await bar.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(await page.getByRole('checkbox').count(),0);assert.deepEqual(await counts(),before);
    });
    await check('read-only Own OU and anonymous lists consume only the supplied synthetic subset', async () => {
        await configure();const subset = await page.evaluate(() => window.fixture.rows.filter(row=>row.region===window.fixture.regions[1]));
        await configure({userId:7,role:'Viewer',canEdit:false,scope:'Own OU',ou:'RPMO 2',rows:subset});const before = await counts();assert.equal(await page.getByRole('button',{name:'Add New IPO',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Delete multiple IPOs',exact:true}).count(),0);assert.equal(await page.getByText('Import',{exact:true}).count(),0);
        await showColumns(['Region']);await page.getByRole('button',{name:'Export',exact:true}).click();assert.equal(await page.evaluate(() => window.fixture.exports.at(-1).length),12);assert(await page.evaluate(() => window.fixture.exports.at(-1).every(row=>row.region===window.fixture.regions[1])));assert.deepEqual(await counts(),before);
        await configure({userId:null,role:'Viewer',canEdit:false,rows:subset.slice(0,2)});assert.equal(await rows().count(),2);assert.deepEqual(await ids(),[4,2]);
    });
    await check('keyboard menus Escape outside dismissal focus return checkbox navigation and row navigation', async () => {
        await configure();const before = await counts();await columns().focus();await page.keyboard.press('Enter');assert.equal(await chooser().getByRole('searchbox').evaluate(element=>element===document.activeElement),true);await page.keyboard.press('Escape');await settle();assert.equal(await columns().evaluate(element=>element===document.activeElement),true);
        await columns().click();await chooser().getByRole('checkbox',{name:'Region',exact:true}).check();await page.mouse.click(4,4);await chooser().waitFor({state:'hidden'});assert.deepEqual(await headings(),defaults);await settle();assert.equal(await columns().evaluate(element=>element===document.activeElement),true);
        const locationTrigger = trigger('Location');await locationTrigger.focus();await page.keyboard.press('Enter');let dialog = menu('Location');assert.equal(await dialog.getByRole('searchbox').evaluate(element=>element===document.activeElement),true);
        const first = dialog.getByRole('checkbox').first(), last = dialog.getByRole('checkbox').last();await first.focus();await page.keyboard.press('ArrowDown');assert(await last.evaluate(element=>element===document.activeElement));await page.keyboard.press('Home');assert(await first.evaluate(element=>element===document.activeElement));await page.keyboard.press('End');assert(await last.evaluate(element=>element===document.activeElement));await page.keyboard.press('ArrowDown');assert(await first.evaluate(element=>element===document.activeElement));
        await page.keyboard.press('Escape');await settle();assert(await locationTrigger.evaluate(element=>element===document.activeElement));dialog = await openFilter('Location');await dialog.getByRole('button',{name:'Clear',exact:true}).click();await page.getByRole('heading',{name:'IPO Management',exact:true}).click();await dialog.waitFor({state:'hidden'});assert.equal(await rows().count(),10);
        await rows().first().focus();await page.keyboard.press('Enter');await rows().first().focus();await page.keyboard.press('Space');assert.deepEqual(await page.evaluate(() => window.fixture.navigation),[24,24]);assert.deepEqual(await counts(),before);
    });
    for (const [width,height] of viewports) {
        await check(`search focus ${width}: single inset highlight fits for pointer and keyboard`, async () => {
            await configure();await page.setViewportSize({width,height});const before=await counts();
            for(const label of ['Edit Table','Filter and sort IPO Name']) {
                const button=page.getByRole('button',{name:label,exact:true});
                const dialog=label==='Edit Table'?chooser():menu('IPO Name');
                await button.focus();await page.keyboard.press('Enter');await dialog.waitFor();await settle();await page.waitForTimeout(160);await assertSearchFocus(dialog,'keyboard');
                await page.keyboard.press('Escape');await button.click();await dialog.getByRole('searchbox').click();await settle();await page.waitForTimeout(160);await assertSearchFocus(dialog,'pointer');
                await page.screenshot({path:path.join(artifacts,`ipo-search-focus-${label==='Edit Table'?'chooser':'filter'}-${width}.png`)});
                await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
            }
            assert.deepEqual(await counts(),before);
        });
        await check(`layout ${width}: all headers fit titles remain menus bounded and no document overflow`, async () => {
            await configure();await page.setViewportSize({width,height});const before = await counts();
            await settle();const currentMetrics = await tableStyleMetrics();await writeFile(path.join(artifacts,`table-styles-${width}.json`),JSON.stringify(currentMetrics,null,2));
            assert.deepEqual(currentMetrics,canonicalMetrics[width],'Body font, row height, borders, alignment and pagination match the committed canonical stylesheet');
            assert.equal(await columns().getAttribute('title'),'Edit Table');
            const defaultWidth = await page.locator('.ipo-list-table').evaluate(element=>element.getBoundingClientRect().width);assert(defaultWidth<=Math.max(1151,await page.locator('.data-table-scroll').evaluate(element=>element.clientWidth))+1,'Default widths reclaim obsolete header control space');
            await page.screenshot({path:path.join(artifacts,`ipo-default-${width}.png`),fullPage:true});
            await columns().click();const dialog = chooser();await settle();const menuBox = await dialog.boundingBox();assert(menuBox.x>=0 && menuBox.y>=0 && menuBox.x+menuBox.width<=width+1 && menuBox.y+menuBox.height<=height+1,'Chooser stays in the viewport');
            await page.screenshot({path:path.join(artifacts,`ipo-chooser-${width}.png`),fullPage:true});
            const optional = dialog.locator('input[type="checkbox"]:not(:disabled)');for(let index=0;index<await optional.count();index++) await optional.nth(index).check();await dialog.getByRole('button',{name:'Apply',exact:true}).click();await settle();
            const headerMetrics = await page.locator('th[data-ipo-column]').evaluateAll(elements=>elements.map(element=>{
                const button=element.querySelector('.ipo-list-header__trigger'),rect=element.getBoundingClientRect(),r=button?.getBoundingClientRect(),style=button&&getComputedStyle(button),cellStyle=getComputedStyle(element);
                return{key:element.dataset.ipoColumn,label:button?.textContent,accessible:button?.getAttribute('aria-label'),buttons:element.querySelectorAll('button').length,icons:element.querySelectorAll('svg,img,[role="img"]').length,width:element.clientWidth,scroll:element.scrollWidth,height:rect.height,triggerWidth:r?.width,triggerHeight:r?.height,triggerScroll:button?.scrollWidth,triggerClient:button?.clientWidth,inside:r&&r.left>=rect.left-1&&r.right<=rect.right+1&&r.top>=rect.top-1&&r.bottom<=rect.bottom+1,fullHitArea:r&&Math.abs(r.left-(rect.left+parseFloat(cellStyle.paddingLeft)))<=1&&Math.abs(r.right-(rect.right-parseFloat(cellStyle.paddingRight)))<=1,background:style?.backgroundColor,backgroundImage:style?.backgroundImage,whiteSpace:style?.whiteSpace,fontFamily:style?.fontFamily,fontSize:style?.fontSize,fontWeight:style?.fontWeight};
            }));
            await writeFile(path.join(artifacts,`headers-${width}.json`),JSON.stringify(headerMetrics,null,2));assert.equal(headerMetrics.length,22);
            for (const header of headerMetrics) {
                assert.equal(header.buttons,1,`${header.key}: one title trigger`);assert.equal(header.icons,0,`${header.key}: no header icons`);assert.equal(header.accessible,popupLabel(header.label));
                assert(header.inside&&header.fullHitArea,`${header.key}: complete title hit area inside header`);assert(header.scroll<=header.width+1&&header.triggerScroll<=header.triggerClient+1,`${header.key}: no clipped title`);
                const referenceHeight = await page.locator('.ipo-subproject-header-reference thead tr').evaluate(element=>element.getBoundingClientRect().height);
                assert(Math.abs(header.height-referenceHeight)<=0.5,`${header.key}: ${header.height}px matches Subprojects ${referenceHeight}px`);assert(header.triggerHeight>=24,`${header.key}: full-width title target remains accessible`);
                assert.equal(header.background,'rgba(0, 0, 0, 0)');assert.equal(header.backgroundImage,'none');assert.equal(header.whiteSpace,'nowrap');
                for(const property of ['fontFamily','fontSize','fontWeight']) assert.equal(header[property],canonicalMetrics[width].headerFont[property],`${header.key}: canonical ${property}`);
            }
            assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));const scroll = await page.locator('.data-table-scroll').evaluate(element=>({width:element.clientWidth,scroll:element.scrollWidth}));assert(scroll.scroll>scroll.width,'Wide table scrolls locally');
            const cellMetrics = await rows().first().locator('td').evaluateAll(elements=>elements.map(element=>({nowrap:getComputedStyle(element).whiteSpace,title:element.querySelector('[title]')?.getAttribute('title')})));assert(cellMetrics.every(cell=>cell.nowrap==='nowrap'&&cell.title),'Every displayed value has its full-value title');
            await page.screenshot({path:path.join(artifacts,`ipo-all-columns-${width}.png`),fullPage:true});
            for (const label of ['Indicators','Commodities']) {
                const noSort = await openFilter(label);for(const command of ['Ascending','Descending','Default Order']) assert.equal(await noSort.getByRole('button',{name:command,exact:true}).count(),0);await page.keyboard.press('Escape');
                assert.equal(await trigger(label).getAttribute('aria-expanded'),'false');
            }
            if (height<=640) {
                const beforeIds = await ids(), beforeSaved = await saved(), shortMenu = await openFilter('IPO ID');
                const body = shortMenu.locator('.ipo-column-filter__body');assert.equal(await body.count(),1);assert(await body.evaluate(element=>element.scrollHeight>element.clientHeight),'Short-screen popup has one scrollable content body');
                const last = shortMenu.getByRole('checkbox').last();await last.scrollIntoViewIfNeeded();await last.focus();assert(await last.evaluate(element=>element===document.activeElement));await last.uncheck();assert.equal(await last.isChecked(),false);await last.check();assert(await last.isChecked());
                const target = await last.boundingBox(), bodyBox = await body.boundingBox();assert(target.y>=bodyBox.y-1&&target.y+target.height<=bodyBox.y+bodyBox.height+1,'Scrolled checkbox is reachable inside the body');
                for(const label of ['Cancel','Apply']) { const box = await shortMenu.getByRole('button',{name:label,exact:true}).boundingBox();assert(box.y>=0&&box.y+box.height<=height+1,'Footer stays visible while scrolling checkbox choices'); }
                await page.screenshot({path:path.join(artifacts,`ipo-short-menu-scrolled-${width}.png`),fullPage:true});await page.keyboard.press('Escape');assert.deepEqual(await ids(),beforeIds);assert.deepEqual(await saved(),beforeSaved);
            }
            await filter('IPO ID',['4']);const longName = rows().first().locator('td.data-table__cell--primary [title]');assert.match(await longName.getAttribute('title'),/deliberately long organization name/);await page.getByRole('button',{name:'Reset Filters',exact:true}).click();
            await trigger('IPO ID').hover();assert.equal(await trigger('IPO ID').evaluate(element=>getComputedStyle(element).backgroundColor),'rgba(0, 0, 0, 0)','Hover does not add header chrome');
            await filter('IPO ID',['4']);assert.match(await trigger('IPO ID').getAttribute('title'),/filter active/i);await trigger('IPO ID').hover();assert.equal(await trigger('IPO ID').evaluate(element=>getComputedStyle(element).backgroundColor),'rgba(0, 0, 0, 0)','Applied filters keep transparent titles');await page.getByRole('button',{name:'Reset Filters',exact:true}).click();
            await openFilter('FFEDIS Registration Date');const filterMenu = menu('FFEDIS Registration Date');await settle();const filterBox = await filterMenu.boundingBox();assert(filterBox.x>=0&&filterBox.y>=0&&filterBox.x+filterBox.width<=width+1&&filterBox.y+filterBox.height<=height+1,'Header filter stays in viewport');
            assert.equal(await trigger('FFEDIS Registration Date').getAttribute('aria-expanded'),'true');
            const inputBox = await filterMenu.getByRole('searchbox').boundingBox();
            for(const command of ['Ascending','Descending','Default Order']) { const button = filterMenu.getByRole('button',{name:command,exact:true}),box = await button.boundingBox();assert(box.y+box.height<=inputBox.y+1,'Sort actions precede value search');assert(box.x>=filterBox.x&&box.x+box.width<=filterBox.x+filterBox.width+1);assert(await button.evaluate(element=>element.scrollWidth<=element.clientWidth+1));if(width<768) assert(box.height>=44);assert.equal(await button.getAttribute('aria-pressed'),command==='Default Order'?null:'false'); }
            const commandMetrics = await filterMenu.getByRole('group',{name:'Sort FFEDIS Registration Date',exact:true}).evaluate(group=>{
                const bounds=group.getBoundingClientRect();return{width:group.clientWidth,scroll:group.scrollWidth,buttons:[...group.querySelectorAll('button')].map(button=>{const r=button.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,inside:r.left>=bounds.left-1&&r.right<=bounds.right+1,nowrap:getComputedStyle(button).whiteSpace,clipped:button.scrollWidth>button.clientWidth+1};})};
            });
            await writeFile(path.join(artifacts,`sort-command-row-${width}.json`),JSON.stringify(commandMetrics,null,2));assert.equal(commandMetrics.buttons.length,3);assert(commandMetrics.scroll<=commandMetrics.width+1,'Sort row fits even with the body scrollbar');
            const [ascending,descending,reset] = commandMetrics.buttons;assert(commandMetrics.buttons.every(button=>button.inside&&!button.clipped&&button.nowrap==='nowrap'&&Math.abs(button.y-ascending.y)<=1),'All three sort commands fit on one line');assert(ascending.right<=descending.x+1&&descending.right<=reset.x+1,'Sort commands do not overlap');
            const defaultOrder = filterMenu.getByRole('button',{name:'Default Order',exact:true});assert.equal(await defaultOrder.getAttribute('title'),'Default Order (reset sorting)');assert.equal((await defaultOrder.innerText()).trim(),'');assert.equal(await defaultOrder.locator('svg').count(),1);if(width<768) assert(reset.width>=44,'Icon-only reset retains a 44px mobile target');
            assert.deepEqual(await filterMenu.locator('.ipo-list-menu-footer button').allTextContents(),['Cancel','Apply']);assert.equal(await filterMenu.locator('.ipo-list-menu-footer svg').count(),0,'No duplicate reset icon in footer');
            const footer = await filterMenu.locator('.ipo-list-menu-footer').evaluate(element=>{const r=element.getBoundingClientRect();return[...element.querySelectorAll('button')].every(button=>{const b=button.getBoundingClientRect();return b.left>=r.left-1&&b.right<=r.right+1&&b.bottom<=r.bottom+1&&button.scrollWidth<=button.clientWidth+1})});assert(footer,'Menu footer actions fit');
            await page.screenshot({path:path.join(artifacts,`ipo-filter-${width}.png`),fullPage:true});await page.keyboard.press('Escape');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(await counts(),before);
        });
    }
    await check('no production requests or runtime errors across the complete suite', async () => { assert.deepEqual(externalRequests, []);assert.deepEqual(errors, []); });
    const failed = results.filter(result => result.status === 'failed');
    await writeFile(path.join(artifacts, 'results.json'), JSON.stringify({ url, artifacts, baselineCommit, results, errors, externalRequests, limitations: ['Synthetic prop-scoped data only; no backend authorization or production data exercised.', 'Canonical stylesheet is pinned to the pre-customization production commit, not the working stylesheet.', 'Export helper arguments are verified; Excel workbook generation is covered by other suites.', 'Bulk delete confirmation is cancelled; business write handlers are never invoked.'] }, null, 2));
    console.log(`${results.length - failed.length}/${results.length} IPO list UI checks passed. Artifacts: ${artifacts}`);
    if (failed.length) process.exitCode = 1;
} finally { if (browser) await browser.close();await server.close(); }
