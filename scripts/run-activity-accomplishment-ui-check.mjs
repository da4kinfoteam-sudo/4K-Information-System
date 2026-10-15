import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { createActivityAccomplishmentFixture, runActivityAccomplishmentRpc } from './helpers/activity-accomplishment-fixture.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || 'C:/Users/joelm/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules', 'playwright'));
const db = await createActivityAccomplishmentFixture();
const servePreview = process.argv.includes('--serve');
const screenshots = await mkdtemp(path.join(tmpdir(), '4kis-activity-actuals-ui-'));
const expense = { id: 10, objectType: 'MOOE', expenseParticular: 'Travel', uacsCode: '502', amount: 25000, obligationMonth: '2026-10-01', disbursementMonth: '2026-11-01', actualDisbursementAmount: 17340, actualDisbursementDate: '2026-09-17' };
const id = (await db.query(`insert into activities(uid,name,type,status,"operatingUnit","fundingYear","fundType",tier,expenses,"actualDate","actualParticipantsMale",location,component) values('ACT-FIXTURE','Subproject Monitoring','Activity','Ongoing','RFO I',2026,'Current','Tier 1',$1,'2026-09-09',29,'Fixture location','Program Management') returning id`, [JSON.stringify([expense])])).rows[0].id;
const parent = async () => (await db.query('select to_jsonb(a) as data from activities a where id=$1', [id])).rows[0].data;
const mocks = {
    'supabaseClient': `export const supabase = { rpc: async (name,args) => {
      window.fixture.calls.push({name,args});
      if(window.fixture.fail && name==='save_activity_accomplishment') return {data:null,error:{message:'Fixture save failure'}};
      if(window.fixture.delay && name==='save_activity_accomplishment') await new Promise(resolve=>setTimeout(resolve,300));
      return fetch('/fixture-rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,args})}).then(response=>response.json());
    }, from(table) { const q={select(){return q;},eq(){return q;},in(){return q;},order(){return q;},then(resolve){return Promise.resolve({data:[],error:null}).then(resolve);},insert(){throw Error('Unexpected direct insert '+table);},update(){throw Error('Unexpected direct update '+table);},delete(){throw Error('Unexpected direct delete '+table);}};return q;} };`,
    'contexts/AuthContext': `const user={id:1,password:'fixture-password',role:'Super Admin',fullName:'Fixture Admin',operatingUnit:'NPMO'}; export const useAuth=()=>({currentUser:user,hasAccess:()=>true,getVisibilityScope:()=> 'All'});`,
    'hooks/useDcfPolicyGuard': `export const normalizePolicyMonth=value=>String(value||'').slice(0,7);export const getDcfModuleKeyForSourceType=()=> 'activities'; export const useDcfPolicyGuard=()=>({getStatusDecision:()=>({allowed:true}),ensureDecisionAllowed:async()=>true,getLastOverrideReason:()=> 'Fixture authorized correction',getMonthDecision:()=>({allowed:true}),getMonthLockMessage:()=>'',isMonthSelectionAllowed:()=>true});`,
    'hooks/useLogAction': `export const useLogAction=()=>({logAction:()=>{}});`,
    'hooks/useIpoHistory': `export const useIpoHistory=()=>({addIpoHistory:async()=>{}});`,
};
const harness = `import React,{useState} from 'react';import{createRoot}from'react-dom/client';
import ActivityEdit from '/components/ActivityEdit.tsx';import FinancialAccomplishment from '/components/accomplishment/FinancialAccomplishment.tsx';import '/index.css';import '/styles/main.css';
const empty=[],noop=()=>{},refs={MOOE:{Travel:{'502':'Travel expenses'}}};
function Harness(){const[record,setRecord]=useState(null),[screen,setScreen]=useState('editor'),[version,setVersion]=useState(0);
window.fixture ||= {calls:[],saved:[],back:0};
window.openFixture=async(next='editor')=>{const row=await fetch('/fixture-parent').then(response=>response.json());setRecord(row);setScreen(next);setVersion(value=>value+1);};
const saved=row=>{window.fixture.saved.push(row);setRecord(row);};
return <main style={{padding:16}} key={version}><nav aria-label="Isolated test screens"><button className="btn btn-secondary" onClick={()=>window.openFixture('editor')}>Edit Accomplishment</button><button className="btn btn-secondary" onClick={()=>window.openFixture('financial')}>Financial ACF</button></nav>{!record?<button onClick={()=>window.openFixture()}>Open fixture</button>:screen==='editor'?<ActivityEdit mode="accomplishment" activity={record} ipos={empty} uacsCodes={refs} onBack={()=>{window.fixture.back++;}} onUpdateActivity={saved}/>:<FinancialAccomplishment subprojects={empty} setSubprojects={noop} activities={[record]} setActivities={()=>{throw Error('Confirmed save must not use database-writing setter');}} onActivitySaved={saved} officeReqs={empty} setOfficeReqs={noop} staffingReqs={empty} setStaffingReqs={noop} otherProgramExpenses={empty} setOtherProgramExpenses={noop} uacsCodes={refs} onSelectSubproject={noop} onSelectActivity={noop} onSelectOfficeReq={noop} onSelectStaffingReq={noop} onSelectOtherExpense={noop}/>}</main>}
createRoot(document.getElementById('root')).render(<Harness/>);`;
const server = await createServer({ configFile: false, root: process.cwd(), resolve: { alias: { '@': process.cwd() } }, cacheDir: path.join(screenshots, '.vite'), appType: 'custom', server: { host: '127.0.0.1', port: servePreview ? 3019 : 0, strictPort: servePreview }, optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom/client', 'lucide-react'], entries: [] }, plugins: [{
    name: 'isolated-activity-actuals-ui', enforce: 'pre',
    resolveId(id) { if (id === '/actuals-harness.tsx') return '\0actuals-harness.tsx'; for (const key of Object.keys(mocks)) if (id.replace(/\\/g, '/').endsWith('/' + key)) return '\0mock-' + key + '.ts'; },
    load(id) { if (id === '\0actuals-harness.tsx') return transformWithEsbuild(harness, 'actuals-harness.tsx', { loader: 'tsx', jsx: 'automatic' }); for (const [key, code] of Object.entries(mocks)) if (id === '\0mock-' + key + '.ts') return code; },
    configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
        try {
            if (req.url === '/fixture') { res.setHeader('Content-Type', 'text/html'); return res.end(await vite.transformIndexHtml('/fixture', '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Isolated Activity Accomplishment</title></head><body><div id="root"></div><script type="module" src="/actuals-harness.tsx"></script></body></html>')); }
            if (req.url === '/fixture-parent') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(await parent())); }
            if (req.url === '/fixture-rpc' && req.method === 'POST') {
                let body = ''; for await (const chunk of req) body += chunk;
                const { name, args } = JSON.parse(body);
                res.setHeader('Content-Type', 'application/json');
                try { return res.end(JSON.stringify({ data: await runActivityAccomplishmentRpc(db, name, args), error: null })); }
                catch (error) { return res.end(JSON.stringify({ data: null, error: { message: error.message } })); }
            }
            next();
        } catch (error) { next(error); }
    }); },
}, react(), tailwindcss()] });
let browser;
try {
    await server.listen();
    if (servePreview) { console.log('Isolated Activity accomplishment preview: http://127.0.0.1:3019/fixture'); await new Promise(() => {}); }
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [], dialogs = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.accept(); });
    await page.route('https://**', route => route.abort());
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/fixture`);
    await page.getByRole('button', { name: 'Open fixture', exact: true }).click();
    const saveButton = page.getByRole('button', { name: 'Save Changes', exact: true });
    await page.waitForFunction(() => document.querySelector('.budget-record-editor--disbursement input')?.value === '17,340.00');
    await page.locator('.budget-record-editor--disbursement input').first().fill('18000');
    await page.evaluate(() => { window.fixture.delay = true; });
    await saveButton.dblclick();
    await page.waitForFunction(() => window.fixture.saved.length === 1);
    assert.equal(await page.evaluate(() => window.fixture.calls.filter(call => call.name === 'save_activity_accomplishment').length), 1);
    const first = (await db.query('select * from financial_disbursements where parent_id=$1', [id])).rows[0];
    assert.equal(first.amount, '18000'); assert.equal(first.disbursement_date.toISOString().slice(0, 10), '2026-09-17');
    assert.equal((await parent()).status, 'Ongoing'); assert.equal((await parent()).actualParticipantsMale, 29);
    await page.evaluate(() => window.openFixture('editor'));
    await page.locator('.budget-record-editor--disbursement input').first().fill('19000');
    await saveButton.click();
    await page.waitForFunction(() => window.fixture.saved.length === 2);
    assert.equal((await db.query('select id from financial_disbursements where parent_id=$1', [id])).rows[0].id, first.id);
    await page.evaluate(() => window.openFixture('editor'));
    await page.locator('.budget-record-editor--disbursement input').first().fill('19500');
    await page.evaluate(() => { window.fixture.fail = true; });
    await saveButton.click();
    await page.waitForFunction(() => !document.querySelector('button[type=submit]')?.disabled);
    assert.equal(await page.locator('.budget-record-editor--disbursement input').first().inputValue(), '19,500.00');
    assert.equal((await db.query('select amount from financial_disbursements where id=$1', [first.id])).rows[0].amount, '19000');
    await page.evaluate(() => { window.fixture.fail = false; });
    await page.evaluate(() => window.openFixture('financial'));
    await page.getByLabel('Search particulars, UACS code, or parent item', { exact: true }).fill('Subproject Monitoring');
    await page.getByRole('button', { name: /Manage actual disbursements/i }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(/disbursement 1 amount/).fill('20000');
    await dialog.getByRole('button', { name: 'Save Changes', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal((await db.query('select id,amount from financial_disbursements where parent_id=$1', [id])).rows[0].id, first.id);
    assert.equal((await db.query('select amount from financial_disbursements where id=$1', [first.id])).rows[0].amount, '20000');
    await page.evaluate(() => window.openFixture('editor'));
    await page.waitForFunction(() => document.querySelector('.budget-record-editor--disbursement input')?.value === '20,000.00');
    for (const width of [1440, 814, 390]) {
        await page.setViewportSize({ width, height: 900 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);
        await page.screenshot({ path: path.join(screenshots, `activity-actuals-${width}.png`), fullPage: true });
    }
    assert.deepEqual(errors, []);
    assert.ok(dialogs.some(message => message.includes('Fixture save failure')));
    console.log('PASS: browser -> real helper -> isolated SQL -> confirmed state across Activity editor and Financial ACF, stable IDs, retry guard, failure draft retention and responsive layouts. Screenshots: ' + screenshots);
} finally { await browser?.close(); await server.close(); await db.close(); }
