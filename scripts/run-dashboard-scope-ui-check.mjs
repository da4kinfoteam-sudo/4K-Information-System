import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const require = createRequire(import.meta.url);
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || 'C:/Users/joelm/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules', 'playwright'));
const artifacts = await mkdtemp(path.join(tmpdir(), '4kis-dashboard-filters-'));
const serve = process.argv.includes('--serve');
const mocks = {
    'contexts/AuthContext': `const hasAccess=()=>true,getVisibilityScope=module=>window.fixture.scopes[module]||'All';export const useAuth=()=>({currentUser:window.fixture.user,hasAccess,getVisibilityScope});`,
    'supabaseClient': `export const supabase={from(table){const filters=[];const query={select(){return query},order(){return query},maybeSingle(){return Promise.resolve({data:null,error:null})},eq(key,value){filters.push(row=>row[key]===value);return query},in(key,values){filters.push(row=>values.includes(row[key]));return query},gte(){return query},or(){filters.push(row=>!row.fundSourceUid);return query},range(){return Promise.resolve({data:(table==='activities'?window.fixture.activities:[]).filter(row=>filters.every(filter=>filter(row))),error:null})},lte(){return Promise.resolve({data:[],error:null})}};return query}};`,
    'lib/googleDriveStorage': `export const getDriveFileDisplayName=file=>file.name||'';export const getIpoDriveImageUrl=()=>'';export const listHomepageGalleryFeed=async(actor,scope)=>{window.fixture.gallery.push(scope);return []};`,
    'lib/gadAttributionExcel': `export const downloadGadAttributionWorkbook=async(payload)=>window.fixture.exports.push(payload);`,
};
const harness = `import React,{useState,useEffect}from'react';import{createRoot}from'react-dom/client';
import Home from'/components/Dashboard.tsx';import Dashboards from'/components/DashboardsPage.tsx';
import{DcfScopeFilterPanel,useDcfScopeFilters}from'/components/ui/DcfScopeFilters.tsx';
import{buildAuthorizedDataScope}from'/lib/appDataScope.ts';import{matchesDashboardScope,allSelection,selectedValues}from'/lib/dashboardScope.ts';
import{writeScopedCache,readScopedCache,updateCachedActivity,updateCachedSubproject}from'/lib/localScopedCache.ts';
import'/index.css';import'/styles/main.css';
const layer=()=>({addTo(){return this},bindPopup(){return this},remove(){}}),map={setView(){return this},stop(){},off(){},remove(){},fitBounds(){}};
window.L={map:()=>map,tileLayer:layer,Icon:class{},marker:layer,featureGroup:class{getBounds(){return{pad(){return []}}}}};
const parent=(id,year,source,ou='NPMO')=>({id,name:'Sample '+id,fundingYear:year,fundSourceUid:source,operatingUnit:ou,tier:'Tier 1',fundType:'Current',status:'Completed',workflow_status:'APPROVED',ipo_id:1,indigenousPeopleOrganization:'IPO 1',actualCompletionDate:'2026-02-01',details:[{id:id*10,particulars:'Inputs',pricePerUnit:1000,numberOfUnits:1,isCompleted:true,actualDeliveryDate:'2026-02-01'}]});
window.fixture={user:{id:1,role:'Super Admin',operatingUnit:'NPMO'},scopes:{},mode:'success',requests:[],pending:[],gallery:[],exports:[],guardCalls:0,dirty:false,
subprojects:[parent(101,2025,null),parent(102,2027,'FS-000004'),parent(103,2027,'FS-000003','RPMO 1'),parent(104,2026,'FS-000001')],
activities:[{id:201,type:'Training',name:'Training',operatingUnit:'NPMO',fundingYear:2027,tier:'Tier 1',fundType:'Current',fundSourceUid:'FS-000004',status:'Completed',workflow_status:'APPROVED',actualDate:'2027-02-02',expenses:[],participating_ipo_ids:[1]}],
ipos:[{id:1,name:'IPO 1',region:'Region I',registrationDate:'2025-01-01',location:'',totalMembers:10,totalMaleMembers:4,totalFemaleMembers:6}],
references:[{uid:'FS-000001',label:'4K Fund',is_active:true},{uid:'FS-000003',label:'Corn',is_active:false},{uid:'FS-000004',label:'Rice',is_active:true}]};
window.checkSourceCaches=async()=>{const scope={year:'2027',years:['2027'],operatingUnit:'NPMO',operatingUnits:['NPMO'],tier:'Tier 1',fundType:'Current',fundSourceValues:['FS-000004'],canViewAllOus:true,requestedBy:1,scopeOwner:'cache-fixture'},other={...scope,requestedBy:2};const data={subprojects:[window.fixture.subprojects[1]],activities:window.fixture.activities};await writeScopedCache(scope,data);await writeScopedCache(other,data);await updateCachedSubproject(1,{...data.subprojects[0],fundSourceUid:'FS-000003'});const subprojectInvalid=await readScopedCache(scope)===null,otherRetained=await readScopedCache(other)!==null;await writeScopedCache(scope,data);await updateCachedActivity(1,{...data.activities[0],fundSourceUid:'FS-000003'});return{subprojectInvalid,activityInvalid:await readScopedCache(scope)===null,otherRetained}};
const empty=()=>({subprojects:[],activities:[],ipos:[],officeReqs:[],staffingReqs:[],otherProgramExpenses:[]});let seq=0;
const onScope=async raw=>{const current=++seq;const f=window.fixture;const scope=buildAuthorizedDataScope(raw,f.user.id,f.user.operatingUnit,f.scopes.Dashboards!=='Own OU');f.requests.push(structuredClone(scope));
if(f.mode==='deferred')await new Promise((resolve,reject)=>f.pending.push({resolve,reject}));if(f.mode==='error')return{ok:false,error:'Synthetic scope failure'};if(current!==seq)return{ok:false,error:'Superseded'};
const model={years:scope.years?selectedValues(scope.years):scope.year==='All'?allSelection():selectedValues([String(scope.year)]),operatingUnits:scope.operatingUnits?selectedValues(scope.operatingUnits):scope.operatingUnit==='All'?allSelection():selectedValues([scope.operatingUnit]),tiers:scope.tiers?selectedValues(scope.tiers):scope.tier==='All'?allSelection():selectedValues([scope.tier]),fundTypes:scope.fundTypes?selectedValues(scope.fundTypes):scope.fundType==='All'?allSelection():selectedValues([scope.fundType]),fundSources:scope.fundSourceValues?selectedValues(scope.fundSourceValues):allSelection()};
const data={...empty(),ipos:f.ipos,subprojects:f.subprojects.filter(row=>matchesDashboardScope(row,model,f.references)),activities:f.activities.filter(row=>matchesDashboardScope(row,model,f.references))};f.lastData=data;window.receiveData(data);return{ok:true}};
function Dcf(){const filters=useDcfScopeFilters({storageKey:'scope_test_dcf',moduleName:'Subprojects',onDataScopeChange:onScope});return <><h2>DCF Filter Preview</h2><DcfScopeFilterPanel idPrefix="dcf-fixture" filters={filters} onBeforeApply={()=>{window.fixture.guardCalls++;return !window.fixture.dirty}}/><output aria-label="DCF rows">{filters.isDataReady?window.fixture.lastData?.subprojects.map(row=>row.id).join(','):'Unavailable'}</output></>}
function Harness(){const[route,setRoute]=useState(decodeURIComponent(location.hash.slice(1))||'home'),[data,setData]=useState(empty),[version,setVersion]=useState(0);window.fixture.route=route;window.receiveData=setData;window.updateUser=(user,scopes={})=>{window.fixture.user=user;window.fixture.scopes=scopes;setVersion(v=>v+1)};window.rename=()=>{window.fixture.references=window.fixture.references.map(source=>({...source,label:source.uid==='FS-000004'?'Renamed Rice':source.label}));setVersion(v=>v+1)};
useEffect(()=>{const update=()=>setRoute(decodeURIComponent(location.hash.slice(1))||'home');addEventListener('hashchange',update);return()=>removeEventListener('hashchange',update)},[]);
const props={...data,fundSources:window.fixture.references,onDataScopeChange:onScope,marketingPartners:[]};
return <main style={{padding:16,maxWidth:1500,margin:'auto'}}><nav aria-label="Fixture pages">{['home','dcf','Physical','Financial','GAD','SCAD','IPO Level of Development','Awards and Rankings','Farm Productivity and Income'].map(page=><button key={page} className="btn btn-secondary" onClick={()=>{location.hash=page}}>{page}</button>)}</nav>{route==='home'?<Home key="home" {...props} systemSettings={{deadlines:[]}}/>:route==='dcf'?<Dcf/>:route==='IPO Level of Development'?<Dashboards {...props} activePage="IPO Level of Development" trainings={data.activities.filter(row=>row.type==='Training')} otherActivities={[]}/>:<Dashboards {...props} activePage={route} trainings={data.activities.filter(row=>row.type==='Training')} otherActivities={[]}/>}</main>}
createRoot(document.getElementById('root')).render(<Harness/>);`;
const server = await createServer({ configFile: false, root: process.cwd(), cacheDir: path.join(artifacts, '.vite'), appType: 'custom',
    resolve: { alias: { '@': process.cwd() } },
    server: { host: '127.0.0.1', port: serve ? 3023 : 0, strictPort: serve },
    optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom/client', 'lucide-react', 'recharts', 'date-fns'], entries: [] }, plugins: [{
        name: 'dashboard-scope-offline', enforce: 'pre',
        resolveId(id) {
            if (id === '/dashboard-scope-harness.tsx') return '\0dashboard-scope-harness.tsx';
            for (const key of Object.keys(mocks)) if (id.replace(/\\/g, '/').endsWith('/' + key)) return '\0mock-' + key;
            if (id.endsWith('/IPOLevelDashboard')) return '\0lod-independent';
        },
        load(id) {
            if (id === '\0dashboard-scope-harness.tsx') return transformWithEsbuild(harness, 'dashboard-scope-harness.tsx', { loader: 'tsx', jsx: 'automatic' });
            if (id === '\0lod-independent') return 'import React from "react";export default()=>React.createElement("h2",null,"Independent LOD preview");';
            for (const [key, value] of Object.entries(mocks)) if (id === '\0mock-' + key) return value;
        },
        configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
            if (req.url !== '/fixture') return next();
            res.setHeader('Content-Type', 'text/html');
            res.end(await vite.transformIndexHtml('/fixture', '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>4KIS Multi-Select Filter Preview</title></head><body><div id="root"></div><script type="module" src="/dashboard-scope-harness.tsx"></script></body></html>'));
        }); },
    }, react(), tailwindcss()],
});
let browser, page;
try {
    await server.listen();
    if (serve) { console.log('Isolated filter preview: http://127.0.0.1:3023/fixture#home'); await new Promise(() => {}); }
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => { errors.push(error.message); console.error('Browser error:', error.message); });
    await page.route('https://**', route => route.abort());
    await page.addInitScript(() => {
        localStorage.setItem('homepage_scope_1_year', '"2025"');
        localStorage.setItem('dashboards_dcf_scope_1_applied', JSON.stringify({ selectedYear: '2025', selectedOu: 'All', selectedTier: 'Tier 1', selectedFundType: 'Current' }));
    });
    await page.goto('http://127.0.0.1:' + server.httpServer.address().port + '/fixture#home');
    const panel = page.getByRole('region', { name: 'Data scope filters', exact: true });
    const ready = () => page.waitForFunction(() => ![...document.querySelectorAll('[role="status"]')].some(node => /Loading homepage|Loading dashboard|Loading records/.test(node.textContent)));
    const choose = async (label, values) => {
        await panel.getByRole('button', { name: label, exact: true }).click();
        const group = page.getByRole('group', { name: label + ' choices', exact: true });
        await page.getByRole('button', { name: 'Clear', exact: true }).click();
        for (const value of values) await group.getByRole('checkbox', { name: value, exact: true }).check();
        await page.keyboard.press('Escape');
    };
    const apply = async () => { await panel.getByRole('button', { name: 'Apply', exact: true }).click(); await ready(); };
    const go = async name => { await page.getByRole('navigation', { name: 'Fixture pages' }).getByRole('button', { name, exact: true }).click(); await page.waitForFunction(name => window.fixture.route === name, name); await panel.waitFor(); await ready(); };
    await panel.waitFor(); await ready();
    assert.deepEqual(await page.evaluate(() => window.checkSourceCaches()), { subprojectInvalid: true, activityInvalid: true, otherRetained: true });
    assert.deepEqual(await page.evaluate(() => window.fixture.lastData.subprojects.map(row => row.id)), [101]);
    assert.equal(await panel.getByRole('button', { name: 'Fund Source', exact: true }).innerText(), 'All Fund Sources');
    const beforeDraft = await page.evaluate(() => window.fixture.requests.length);
    await choose('Fund Year', ['2025', '2027']);
    await choose('Fund Source', ['Corn (inactive)', 'Rice']);
    assert.equal(await page.evaluate(() => window.fixture.requests.length), beforeDraft, 'Draft changes never fetch');
    await apply();
    assert.equal(await page.evaluate(() => window.fixture.requests.length), beforeDraft + 1);
    assert.deepEqual(await page.evaluate(() => window.fixture.lastData.subprojects.map(row => row.id)), [102, 103]);
    await page.evaluate(() => window.rename());
    assert.match(await panel.getByRole('button', { name: 'Fund Source', exact: true }).innerText(), /Renamed Rice/);
    await choose('Fund Source', ['Not specified']); await apply();
    assert.deepEqual(await page.evaluate(() => window.fixture.lastData.subprojects.map(row => row.id)), [101]);
    await choose('Fund Source', []);
    assert.equal(await panel.getByRole('button', { name: 'Apply', exact: true }).isDisabled(), true);
    assert.equal(await page.evaluate(() => window.fixture.lastData.subprojects[0].id), 101);
    await panel.getByRole('button', { name: 'Fund Source', exact: true }).click();
    await page.getByRole('button', { name: 'Select All', exact: true }).click(); await page.keyboard.press('Escape'); await apply();
    await go('dcf');
    assert.equal(await panel.getByRole('combobox').count(), 4);
    assert.equal(await panel.getByRole('button', { name: 'Fund Source', exact: true }).count(), 0);
    const dcfRequest = await page.evaluate(() => window.fixture.requests.at(-1));
    assert.equal(dcfRequest.scopeOwner, 'scope_test_dcf');
    assert.equal(dcfRequest.year, String(new Date().getFullYear()));
    for (const field of ['years', 'operatingUnits', 'tiers', 'fundTypes', 'fundSourceValues']) assert.equal(dcfRequest[field], undefined);
    await panel.getByRole('combobox', { name: 'Fund Year', exact: true }).selectOption('2027');
    await page.evaluate(() => window.fixture.dirty = true);
    const guardedCount = await page.evaluate(() => window.fixture.requests.length);
    await panel.getByRole('button', { name: 'Apply', exact: true }).click();
    assert.equal(await page.evaluate(() => window.fixture.requests.length), guardedCount);
    await page.evaluate(() => window.fixture.dirty = false); await apply();
    assert.deepEqual(await page.evaluate(() => window.fixture.lastData.subprojects.map(row => row.id)), [102, 103]);
    await go('home');
    assert.equal(await panel.getByRole('button', { name: 'Fund Year', exact: true }).innerText(), '2025, 2027');
    await go('GAD');
    assert.equal(await panel.getByRole('button', { name: 'Fund Year', exact: true }).innerText(), '2025');
    await choose('Fund Year', ['2025', '2027']); await apply();
    const annual = page.getByRole('combobox', { name: 'Annual View', exact: true });
    await annual.selectOption('2025');
    await page.getByRole('heading', { name: 'Gender and Development Dashboard', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Download Excel', exact: true }).click();
    assert.equal(await page.evaluate(() => window.fixture.exports.at(-1).year), 2025);
    await go('SCAD');
    assert.equal(await panel.getByRole('button', { name: 'Fund Year', exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => window.fixture.requests.at(-1).registryOnly), true);
    await go('Financial');
    assert.equal(await panel.getByRole('button', { name: 'Fund Year', exact: true }).innerText(), '2025, 2027', 'Registry mode never overwrites saved funding choices');
    await page.getByRole('heading', { name: 'Financial Summary', exact: true }).waitFor();
    await go('Physical');
    await go('Farm Productivity and Income');
    await go('Awards and Rankings');
    await page.getByRole('combobox', { name: 'Annual View', exact: true }).selectOption('2027');
    await go('home');
    await page.evaluate(() => window.fixture.mode = 'error');
    await choose('Fund Year', ['2027']); await apply();
    await page.getByRole('alert').filter({ hasText: 'Synthetic scope failure' }).waitFor();
    assert.equal(await page.locator('.dashboard-metric-grid').count(), 0, 'Old data is not presented as a new scope');
    await page.evaluate(() => window.fixture.mode = 'success');
    await page.getByRole('button', { name: 'Retry', exact: true }).click(); await ready();
    assert.equal(await page.getByRole('alert').count(), 0);
    await page.evaluate(() => window.updateUser({ id: 2, role: 'User', operatingUnit: 'RPMO 1' }, { Dashboards: 'Own OU' })); await ready();
    assert.equal(await panel.getByRole('button', { name: 'Operating Unit', exact: true }).isDisabled(), true);
    assert.equal(await panel.getByRole('button', { name: 'Fund Year', exact: true }).innerText(), String(new Date().getFullYear()));
    await choose('Fund Year', ['2027']); await apply();
    assert.deepEqual(await page.evaluate(() => window.fixture.lastData.subprojects.map(row => row.id)), [103]);
    const ownScopeRequests = await page.evaluate(() => window.fixture.requests.length);
    await page.getByRole('combobox', { name: 'Activity period', exact: true }).selectOption('All');
    await page.getByRole('group', { name: 'Activity source', exact: true }).getByRole('button', { name: 'NPMO', exact: true }).click();
    await page.locator('.dashboard-activity-card__title').filter({ hasText: 'Training' }).waitFor();
    assert.equal(await page.evaluate(() => window.fixture.requests.length), ownScopeRequests, 'NPMO schedule never broadens the main dataset');
    assert.deepEqual(await page.evaluate(() => window.fixture.lastData.subprojects.map(row => row.id)), [103]);
    await page.evaluate(() => window.updateUser({ id: 1, role: 'Super Admin', operatingUnit: 'NPMO' })); await ready();
    assert.equal(await panel.getByRole('button', { name: 'Fund Year', exact: true }).innerText(), '2027');
    await page.evaluate(() => window.fixture.mode = 'deferred');
    await choose('Fund Year', ['2025']);
    await panel.getByRole('button', { name: 'Apply', exact: true }).click();
    await page.waitForFunction(() => window.fixture.pending.length === 1);
    await choose('Fund Year', ['2027']);
    await panel.getByRole('button', { name: 'Apply', exact: true }).click();
    await page.waitForFunction(() => window.fixture.pending.length === 2);
    await page.evaluate(() => window.fixture.pending[1].resolve()); await ready();
    await page.evaluate(() => window.fixture.pending[0].resolve());
    await page.waitForFunction(() => window.fixture.lastData.subprojects.every(row => row.fundingYear === 2027));
    assert.equal(await page.getByRole('alert').count(), 0, 'Out-of-order completion cannot replace the latest scope');
    await page.evaluate(() => window.fixture.mode = 'success');
    await page.reload(); await panel.waitFor(); await ready();
    assert.equal(await panel.getByRole('button', { name: 'Fund Year', exact: true }).innerText(), '2027', 'Refresh restores the applied preferences');
    await go('GAD');
    await page.evaluate(() => window.updateUser({ id: 1, role: 'Super Admin', operatingUnit: 'NPMO' }, { Dashboards: 'All', 'Gender and Development': 'Own OU' })); await ready();
    assert.equal(await panel.getByRole('button', { name: 'Operating Unit', exact: true }).isDisabled(), true);
    assert.deepEqual(await page.evaluate(() => window.fixture.requests.at(-1).operatingUnits), ['NPMO'], 'GAD intersects module and Dashboard access');
    await page.evaluate(() => window.updateUser({ id: 1, role: 'Super Admin', operatingUnit: 'NPMO' })); await ready();
    await go('home');
    await panel.getByRole('button', { name: 'Fund Year', exact: true }).click();
    const yearChoices = page.getByRole('group', { name: 'Fund Year choices', exact: true });
    await yearChoices.getByRole('checkbox').first().focus(); await page.keyboard.press('ArrowDown');
    assert.equal(await yearChoices.getByRole('checkbox').nth(1).evaluate(node => node === document.activeElement), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.dashboard-scope-menu').count(), 0);
    for (const width of [1440, 814, 390]) {
        await page.setViewportSize({ width, height: 950 });
        await panel.scrollIntoViewIfNeeded();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
        await panel.getByRole('button', { name: 'Fund Source', exact: true }).click();
        const menu = page.locator('.dashboard-scope-menu');
        const bounds = await menu.boundingBox();
        assert(bounds.x >= 0 && bounds.x + bounds.width <= width + 1);
        await menu.getByRole('searchbox').fill('rice');
        assert.equal(await menu.getByRole('checkbox').count(), 1);
        await page.screenshot({ path: path.join(artifacts, 'homepage-filter-' + width + '.png') });
        await page.keyboard.press('Escape');
        await go('Financial'); await panel.scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(artifacts, 'dashboard-filter-' + width + '.png') });
        await go('home');
    }
    const app = await readFile('App.tsx', 'utf8');
    assert.match(app, /pendingDataScopeKeyRef\.current !== nextScopeKey/);
    for (const file of ['components/Subprojects.tsx', 'components/Activities.tsx', 'components/ProgramManagement.tsx', 'components/accomplishment/PhysicalAccomplishment.tsx', 'components/accomplishment/FinancialAccomplishment.tsx']) assert.match(await readFile(file, 'utf8'), /!dcfFilters\.isDataReady/);
    assert.deepEqual(errors, []);
    console.log('PASS: real Homepage/dashboard multi-select controls, draft-only Apply, out-of-order responses, refresh persistence, source rename/blank/inactive data, independent guarded DCF state, annual GAD/Awards, registry-only SCAD, consumer rendering, failure/retry, account/intersected OU rules and responsive keyboard menus. Synthetic client/map/Drive only. Artifacts: ' + artifacts);
} catch (error) {
    if (page) { console.error('Page state:', await page.locator('body').innerText().catch(() => 'Unavailable')); await page.screenshot({ path: path.join(artifacts, 'failure.png'), fullPage: true }); }
    throw error;
} finally { await browser?.close(); await server.close(); }
