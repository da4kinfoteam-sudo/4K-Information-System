import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { createSubprojectAccomplishmentFixture, runSubprojectAccomplishmentRpc } from './helpers/subproject-accomplishment-fixture.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || 'C:/Users/joelm/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules', 'playwright'));
const db = await createSubprojectAccomplishmentFixture();
const servePreview = process.argv.includes('--serve');
const screenshots = await mkdtemp(path.join(tmpdir(), '4kis-subproject-actuals-ui-'));
await db.exec(`alter table subprojects add column uid text, add column "fundingYear" integer default 2026, add column "fundType" text default 'Current', add column tier text default 'Tier 1', add column location text, add column "indigenousPeopleOrganization" text, add column "startDate" date, add column "subprojectCommodities" jsonb default '[]';`.replace(', add column "subprojectCommodities" jsonb default \'[]\'',''));
const expense = { id:10, type:'Equipment', particulars:'Fixture delivery item', unitOfMeasure:'unit', numberOfUnits:1, pricePerUnit:25000, objectType:'MOOE',expenseParticular:'Travel',uacsCode:'502',deliveryDate:'2026-10-01',obligationMonth:'2026-10-01',disbursementMonth:'2026-11-01',actualDisbursementAmount:17340,actualDisbursementDate:'2026-09-17' };
const id = (await db.query(`insert into subprojects(uid,name,status,"operatingUnit",details,location,"indigenousPeopleOrganization") values('SP-FIXTURE','Fixture Subproject','Ongoing','RFO I',$1,'Fixture location','Fixture IPO') returning id`,[JSON.stringify([expense])])).rows[0].id;
const parent = async()=> (await db.query('select to_jsonb(s) as data from subprojects s where id=$1',[id])).rows[0].data;
const mocks = {
    'supabaseClient': `export const supabase = { rpc: async (name,args) => {
      window.fixture.calls.push({name,args});
      if(window.fixture.failRead && name==='read_subproject_accomplishments') return {data:null,error:{message:'Fixture incomplete read'}};
      if(window.fixture.fail && name==='save_subproject_accomplishment') return {data:null,error:{message:'Fixture save failure'}};
      if(window.fixture.delay && name==='save_subproject_accomplishment') await new Promise(resolve=>setTimeout(resolve,300));
      return fetch('/fixture-rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,args})}).then(response=>response.json());
    }, from(table) { const q={select(){return q;},eq(){return q;},in(){return q;},order(){return q;},then(resolve){return Promise.resolve({data:[],error:null}).then(resolve);},insert(){throw Error('Unexpected direct insert '+table);},update(){throw Error('Unexpected direct update '+table);},delete(){throw Error('Unexpected direct delete '+table);}};return q;} };`,
    'contexts/AuthContext': `const user={id:1,password:'fixture-password',role:'Super Admin',fullName:'Fixture Admin',operatingUnit:'NPMO'}; export const useAuth=()=>({currentUser:user,rolesConfigs:[],hasAccess:()=>true,getVisibilityScope:()=> 'All'});`,
    'hooks/useDcfPolicyGuard': `export const normalizePolicyMonth=value=>String(value||'').slice(0,7);export const getDcfModuleKeyForSourceType=()=> 'activities'; export const useDcfPolicyGuard=()=>({getStatusDecision:()=>({allowed:true}),ensureDecisionAllowed:async()=>true,getLastOverrideReason:()=> 'Fixture authorized correction',getMonthDecision:()=>({allowed:true}),getMonthLockMessage:()=>'',isMonthSelectionAllowed:()=>true});`,
    'hooks/useLogAction': `export const useLogAction=()=>({logAction:()=>{}});`,
    'hooks/useIpoHistory': `export const useIpoHistory=()=>({addIpoHistory:async()=>{}});`,
};
const harness = `import React,{useState} from 'react';import{createRoot}from'react-dom/client';
import SubprojectDetail from '/components/SubprojectDetail.tsx';import FinancialAccomplishment from '/components/accomplishment/FinancialAccomplishment.tsx';import PhysicalAccomplishment from '/components/accomplishment/PhysicalAccomplishment.tsx';import {writeScopedCache,readScopedCache,updateCachedSubproject} from '/lib/localScopedCache.ts';import '/index.css';import '/styles/main.css';
const empty=[],noop=()=>{},refs={MOOE:{Travel:{'502':'Travel expenses'}}},unexpected=()=>{throw Error('Confirmed save must not use a database-writing setter');};
function Harness(){const[record,setRecord]=useState(null),[screen,setScreen]=useState('editor'),[version,setVersion]=useState(0);
window.fixture ||= {calls:[],saved:[]};
window.openFixture=async(next='editor')=>{const row=await fetch('/fixture-parent').then(response=>response.json());setRecord(row);setScreen(next);setVersion(value=>value+1);};
window.refreshFixture=async()=>setRecord(await fetch('/fixture-parent').then(response=>response.json()));
const saved=(row,snapshot)=>{window.fixture.saved.push(row);window.fixture.lastSnapshot=snapshot;setRecord(row);};
window.fixture.checkCache=async()=>{const snapshot=window.fixture.lastSnapshot,row=snapshot.subproject,confirmed=snapshot.confirmedFinancial[0].rows[0],scope={year:2026,operatingUnit:'All',tier:'All',fundType:'All',canViewAllOus:true,requestedBy:1},otherScope={...scope,requestedBy:2};const old={...confirmed,amount:17340},unrelated={...confirmed,id:999,entity_type:'activity_expense'};await writeScopedCache(scope,{subprojects:[row],financialDisbursements:[old,unrelated]});await writeScopedCache(otherScope,{subprojects:[row],financialDisbursements:[old]});await updateCachedSubproject(1,row,snapshot.confirmedFinancial);const result=await readScopedCache(scope),other=await readScopedCache(otherScope);await updateCachedSubproject(1,row,[{itemId:'10',stage:'disbursement',rows:[]}]);const cleared=await readScopedCache(scope);return{result,other,cleared,confirmed};};
const common={subprojects:record?[record]:empty,setSubprojects:unexpected,onSubprojectSaved:saved,activities:empty,setActivities:noop,officeReqs:empty,setOfficeReqs:noop,staffingReqs:empty,setStaffingReqs:noop,onSelectSubproject:noop,onSelectActivity:noop,onSelectOfficeReq:noop,onSelectStaffingReq:noop};
return <main style={{padding:16}} key={version}>{!record?<button onClick={()=>window.openFixture()}>Open fixture</button>:screen==='editor'?<SubprojectDetail subproject={record} ipos={empty} fundSources={empty} uacsCodes={refs} particularTypes={{Equipment:['Fixture delivery item']}} commodityCategories={{}} refCommodities={empty} refLivestock={empty} onUpdateSubproject={unexpected} onAccomplishmentSaved={saved}/>:screen==='financial'?<FinancialAccomplishment {...common} otherProgramExpenses={empty} setOtherProgramExpenses={noop} uacsCodes={refs} onSelectOtherExpense={noop}/>:<PhysicalAccomplishment {...common}/>}</main>}
createRoot(document.getElementById('root')).render(<Harness/>);`;
const server = await createServer({ configFile: false, root: process.cwd(), resolve: { alias: { '@': process.cwd() } }, cacheDir: path.join(screenshots, '.vite'), appType: 'custom', server: { host: '127.0.0.1', port: servePreview ? 3020 : 0, strictPort: servePreview }, optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom/client', 'lucide-react'], entries: [] }, plugins: [{
    name: 'isolated-subproject-actuals-ui', enforce: 'pre',
    resolveId(id) { if (id === '/actuals-harness.tsx') return '\0actuals-harness.tsx'; for (const key of Object.keys(mocks)) if (id.replace(/\\/g, '/').endsWith('/' + key)) return '\0mock-' + key + '.ts'; },
    load(id) { if (id === '\0actuals-harness.tsx') return transformWithEsbuild(harness, 'actuals-harness.tsx', { loader: 'tsx', jsx: 'automatic' }); for (const [key, code] of Object.entries(mocks)) if (id === '\0mock-' + key + '.ts') return code; },
    configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
        try {
            if (req.url === '/fixture') { res.setHeader('Content-Type', 'text/html'); return res.end(await vite.transformIndexHtml('/fixture', '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Isolated Subproject Accomplishment</title></head><body><div id="root"></div><script type="module" src="/actuals-harness.tsx"></script></body></html>')); }
            if (req.url === '/fixture-parent') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(await parent())); }
            if (req.url === '/fixture-rpc' && req.method === 'POST') {
                let body = ''; for await (const chunk of req) body += chunk;
                const { name, args } = JSON.parse(body);
                res.setHeader('Content-Type', 'application/json');
                try { return res.end(JSON.stringify({ data: await runSubprojectAccomplishmentRpc(db, name, args), error: null })); }
                catch (error) { return res.end(JSON.stringify({ data: null, error: { message: error.message } })); }
            }
            next();
        } catch (error) { next(error); }
    }); },
}, react(), tailwindcss()] });
let browser;
try {
    await server.listen();
    if (servePreview) { console.log('Isolated Subproject accomplishment preview: http://127.0.0.1:3020/fixture'); await new Promise(() => {}); }
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [], dialogs = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.accept(); });
    await page.route('https://**', route => route.abort());
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/fixture`);
    await page.getByRole('button', { name: 'Open fixture', exact: true }).click();
    await page.getByRole('button', { name: 'Edit Accomplishment', exact: true }).first().click();
    const saveButton = page.getByRole('button', { name: 'Save Changes', exact: true });
    await page.waitForFunction(() => document.querySelector('.budget-record-editor--disbursement input')?.value === '17,340.00');
    await page.locator('.budget-record-editor--disbursement input').first().fill('18000');
    await page.evaluate(() => { window.fixture.delay = true; });
    await saveButton.dblclick();
    await page.waitForFunction(() => window.fixture.saved.length === 1);
    assert.equal(await page.evaluate(() => window.fixture.calls.filter(call => call.name === 'save_subproject_accomplishment').length), 1);
    const first = (await db.query('select * from financial_disbursements where parent_id=$1', [id])).rows[0];
    assert.equal(first.amount, '18000'); assert.equal(first.disbursement_date.toISOString().slice(0,10), '2026-09-17');
    const cache = await page.evaluate(()=>window.fixture.checkCache());
    assert.deepEqual(cache.result.financialDisbursements.find(row=>row.entity_type==='subproject_detail'),cache.confirmed);
    assert.equal(cache.result.financialDisbursements.length,2);
    assert.equal(cache.other.financialDisbursements[0].amount,17340);
    assert.deepEqual(cache.cleared.financialDisbursements.map(row=>row.id),[999]);
    assert.equal((await parent()).status, 'Ongoing');
    await page.getByRole('button', { name: 'Edit Accomplishment', exact: true }).first().click();
    await page.locator('.budget-record-editor--disbursement input').first().fill('19000');
    await saveButton.click();
    await page.waitForFunction(() => window.fixture.saved.length === 2);
    assert.equal((await db.query('select id from financial_disbursements where parent_id=$1',[id])).rows[0].id, first.id);
    await page.getByRole('button', { name: 'Edit Accomplishment', exact: true }).first().click();
    await page.locator('.budget-record-editor--disbursement input').first().fill('19500');
    await page.evaluate(() => { window.fixture.fail = true; });
    await saveButton.click();
    await page.waitForFunction(() => !document.querySelector('button[type=submit]')?.disabled);
    assert.equal(await page.locator('.budget-record-editor--disbursement input').first().inputValue(), '19,500.00');
    await page.evaluate(() => { window.fixture.fail = false; });
    await page.evaluate(() => window.openFixture('financial'));
    await page.getByLabel('Search particulars, UACS code, or parent item', { exact: true }).fill('Fixture Subproject');
    await page.getByRole('button', { name: /Manage actual disbursements/i }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(/disbursement 1 amount/).fill('20000');
    await dialog.getByRole('button', { name:'Save Changes',exact:true }).click();
    await dialog.waitFor({state:'hidden'});
    assert.equal((await db.query('select amount from financial_disbursements where id=$1',[first.id])).rows[0].amount, '20000');
    await page.getByRole('button', { name: /Manage actual disbursements/i }).first().click();
    await dialog.getByLabel(/disbursement 1 amount/).fill('20500');
    await db.query('update financial_disbursements set amount=20600 where id=$1',[first.id]);
    const readsBefore = await page.evaluate(()=>window.fixture.calls.filter(call=>call.name==='read_subproject_accomplishments').length);
    await page.evaluate(()=>window.refreshFixture());
    await page.waitForFunction(count=>window.fixture.calls.filter(call=>call.name==='read_subproject_accomplishments').length>count,readsBefore);
    await dialog.getByRole('button',{name:'Save Changes',exact:true}).click();
    await dialog.getByText(/changed or was removed while editing/).waitFor();
    assert.equal(await dialog.getByLabel(/disbursement 1 amount/).inputValue(),'20,500.00');
    assert.equal((await db.query('select amount from financial_disbursements where id=$1',[first.id])).rows[0].amount,'20600');
    await page.evaluate(() => window.openFixture('physical'));
    await page.getByLabel('Search physical items by title', { exact: true }).fill('Fixture Subproject');
    const actualDate = page.getByLabel('Actual date for Fixture delivery item', { exact: true });
    if (!await actualDate.isVisible()) await page.getByRole('button', { name:'Expand row',exact:true }).first().click();
    await actualDate.fill('2026-10-16');
    await page.getByLabel('Actual units for Fixture delivery item', { exact: true }).fill('1');
    await db.query('update financial_disbursements set amount=21000 where id=$1',[first.id]);
    await page.getByRole('button', { name:'Save All Changes',exact:true }).click();
    await page.getByRole('button', { name:'Confirm Save',exact:true }).click();
    await page.getByText('All changes saved successfully!',{exact:true}).waitFor();
    assert.equal((await parent()).status,'Completed');
    assert.equal((await parent()).actualCompletionDate,'2026-10-16');
    assert.equal((await db.query('select amount from financial_disbursements where id=$1',[first.id])).rows[0].amount,'21000');
    await page.screenshot({path:path.join(screenshots,'physical-smoke.png'),fullPage:true});
    for (const width of [1440,814,390]) {
        await page.setViewportSize({width,height:900});
        await page.screenshot({path:path.join(screenshots,`subproject-physical-${width}.png`),fullPage:true});
    }
    await page.evaluate(()=>{window.fixture.failRead=true;return window.openFixture('editor');});
    await page.getByRole('button',{name:'Edit Accomplishment',exact:true}).first().click();
    await page.getByText('Fixture incomplete read',{exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Save Changes',exact:true}).count(),0);
    await page.evaluate(()=>{window.fixture.failRead=false;});
    await page.getByRole('button',{name:'Retry',exact:true}).click();
    await saveButton.waitFor();
    assert.deepEqual(errors, []);
    assert.ok(dialogs.some(message=>message.includes('Fixture save failure')));
    console.log('PASS: browser -> helper -> isolated SQL across Details, Financial and Physical ACF; stable IDs/dates, double-submit guard, failed-save drafts, fail-closed reads/retry, open-dialog concurrency, scoped cache reconciliation and concurrent financial preservation. Screenshots: '+screenshots);
} finally { await browser?.close(); await server.close(); await db.close(); }
