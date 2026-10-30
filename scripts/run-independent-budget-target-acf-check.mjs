import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { createSubprojectAccomplishmentFixture, runSubprojectAccomplishmentRpc } from './helpers/subproject-accomplishment-fixture.mjs';
import { runActivityAccomplishmentRpc } from './helpers/activity-accomplishment-fixture.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || 'C:/Users/joelm/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules', 'playwright'));
const db = await createSubprojectAccomplishmentFixture();
const screenshots = await mkdtemp(path.join(tmpdir(), '4kis-target-acf-ui-'));
await db.exec('alter table subprojects add column "fundingYear" integer, add column "fundType" text, add column tier text;');
await db.exec(await readFile('supabase/migrations/202610300001_independent_budget_target_schedules.sql', 'utf8'));
await db.query('select set_config($1,$2,false)', ['request.headers', JSON.stringify({ 'x-client-info': 'supabase-js-web/2.39.0 4kis-target-plan/2' })]);
const line = { id: 10, type: 'Equipment', particulars: 'Delivery item', unitOfMeasure: 'unit', numberOfUnits: 2, pricePerUnit: 50, objectType: 'MOOE', expenseParticular: 'Travel', uacsCode: '502', amount: 100, deliveryDate: '2026-10-01', obligationMonth: '2026-01-01', disbursementMonth: '2026-02-01' };
const ids = {};
for (const table of ['activities', 'subprojects']) {
    const field = table === 'activities' ? 'expenses' : 'details';
    ids[table] = (await db.query(`insert into ${table}(name,status,"operatingUnit","fundingYear","fundType",tier,${field}) values($1,'Proposed','RFO I',2026,'Current','Tier 1',$2) returning id`, [`Fixture ${table}`, JSON.stringify([line])])).rows[0].id;
    await db.query(`insert into financial_disbursements(entity_type,parent_id,item_id,amount,disbursement_date,remarks) values($1,$2,'10',17.34,'2026-09-17','Reported actual')`, [table === 'activities' ? 'activity_expense' : 'subproject_detail', ids[table]]);
}
const parents = async () => Object.fromEntries(await Promise.all(Object.entries(ids).map(async ([table, id]) => [table, (await db.query(`select to_jsonb(t) as data from ${table} t where id=$1`, [id])).rows[0].data])));
const actuals = async () => (await db.query('select to_jsonb(t) as data from financial_disbursements t order by id')).rows;
const originalActuals = await actuals();
const mocks = {
    supabaseClient: `export const supabase={async rpc(name,args){window.fixture.calls.push({name,args});if(window.fixture.fail&&name.startsWith('save_'))return{data:null,error:{message:'Fixture target save failure'}};if(window.fixture.delay&&name.startsWith('save_'))await new Promise(r=>setTimeout(r,250));return fetch('/fixture-rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,args})}).then(r=>r.json());},from(){const q={select(){return q},eq(){return q},in(){return q},order(){return q},then(resolve){return Promise.resolve({data:[],error:null}).then(resolve)},insert(){throw Error('Unexpected insert')},update(){throw Error('Unexpected update')}};return q}};`,
    'contexts/AuthContext': `export const useAuth=()=>({currentUser:{id:1,password:'fixture-password',role:'Super Admin',fullName:'Fixture',operatingUnit:'NPMO'},rolesConfigs:[],hasAccess:()=>true,getVisibilityScope:()=> 'All'});`,
    'hooks/useDcfPolicyGuard': `export const normalizePolicyMonth=v=>String(v||'').slice(0,7);export const getDcfModuleKeyForSourceType=t=>t==='Subproject'?'subprojects':'activities';export const useDcfPolicyGuard=()=>({getStatusDecision:()=>({allowed:!window.fixture.denied}),ensureDecisionAllowed:async d=>d.allowed,getLastOverrideReason:()=> 'Fixture correction',getMonthDecision:()=>({allowed:true}),getMonthLockMessage:()=>'',isMonthSelectionAllowed:()=>true});`,
    'hooks/useLogAction': `export const useLogAction=()=>({logAction:()=>{}});`,
};
const harness = `import React,{useState}from'react';import{createRoot}from'react-dom/client';import FinancialAccomplishment from '/components/accomplishment/FinancialAccomplishment.tsx';import '/index.css';import '/styles/main.css';const empty=[],noop=()=>{},unexpected=()=>{throw Error('Confirmed save used database-writing setter')};window.fixture={calls:[],saved:[],denied:false};function Harness(){const[rows,setRows]=useState(null),[version,setVersion]=useState(0);window.openFixture=async()=>{setRows(await fetch('/fixture-parents').then(r=>r.json()));setVersion(v=>v+1)};window.refreshFixture=async()=>setRows(await fetch('/fixture-parents').then(r=>r.json()));const saved=table=>row=>{window.fixture.saved.push({table,row});setRows(old=>({...old,[table]:row}))};return <main style={{padding:16}} key={version}>{!rows?<button onClick={()=>window.openFixture()}>Open fixture</button>:<FinancialAccomplishment subprojects={[rows.subprojects]} setSubprojects={unexpected} onSubprojectSaved={saved('subprojects')} activities={[rows.activities]} setActivities={unexpected} onActivitySaved={saved('activities')} officeReqs={empty} setOfficeReqs={noop} staffingReqs={empty} setStaffingReqs={noop} otherProgramExpenses={empty} setOtherProgramExpenses={noop} uacsCodes={{MOOE:{Travel:{'502':'Travel expenses'}}}} onSelectSubproject={noop} onSelectActivity={noop} onSelectOfficeReq={noop} onSelectStaffingReq={noop} onSelectOtherExpense={noop}/>}</main>}createRoot(document.getElementById('root')).render(<Harness/>);`;
const server = await createServer({ configFile: false, root: process.cwd(), resolve: { alias: { '@': process.cwd() } }, appType: 'custom', cacheDir: path.join(screenshots, '.vite'), server: { host: '127.0.0.1', port: 0 }, optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom/client', 'lucide-react'], entries: [] }, plugins: [{
    name: 'target-acf-offline', enforce: 'pre',
    resolveId(id) { if (id === '/target-harness.tsx') return '\0target-harness.tsx'; for (const key of Object.keys(mocks)) if (id.replace(/\\/g, '/').endsWith('/' + key)) return '\0mock-' + key + '.ts'; },
    load(id) { if (id === '\0target-harness.tsx') return transformWithEsbuild(harness, 'target-harness.tsx', { loader: 'tsx', jsx: 'automatic' }); for (const [key, value] of Object.entries(mocks)) if (id === '\0mock-' + key + '.ts') return value; },
    configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
        try {
            if (req.url === '/fixture') { res.setHeader('Content-Type', 'text/html'); return res.end(await vite.transformIndexHtml('/fixture', '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/target-harness.tsx"></script></body></html>')); }
            if (req.url === '/fixture-parents') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(await parents())); }
            if (req.url === '/fixture-rpc') {
                let body = ''; for await (const chunk of req) body += chunk;
                const { name, args } = JSON.parse(body);
                res.setHeader('Content-Type', 'application/json');
                try { const data = name === 'budget_target_schedule_capability' ? 2 : await (name.includes('subproject') ? runSubprojectAccomplishmentRpc : runActivityAccomplishmentRpc)(db, name, args); return res.end(JSON.stringify({ data, error: null })); }
                catch (error) { return res.end(JSON.stringify({ data: null, error: { message: error.message } })); }
            }
            next();
        } catch (error) { next(error); }
    }); },
}, react(), tailwindcss()] });
let browser;
try {
    await server.listen();
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), errors = [], alerts = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', async dialog => { alerts.push(dialog.message()); await dialog.accept(); });
    await page.route('https://**', route => route.abort());
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/fixture`);
    await page.getByRole('button', { name: 'Open fixture', exact: true }).click();
    const search = page.getByLabel('Search particulars, UACS code, or parent item', { exact: true });
    for (const table of ['activities', 'subprojects']) {
        await search.fill(`Fixture ${table}`);
        const open = page.getByRole('button', { name: `Edit disbursement targets for Fixture ${table}`, exact: true });
        await open.click();
        const dialog = page.getByRole('dialog', { name: /Budget Targets:/ });
        assert.equal(await dialog.getByLabel('Allocation', { exact: true }).inputValue(), '100');
        await dialog.getByLabel('Disbursement target amount 10-1', { exact: true }).fill('20');
        await dialog.getByRole('button', { name: 'Add Disbursement Target', exact: true }).click();
        await dialog.getByRole('button', { name: 'Apply Targets', exact: true }).click();
        assert.ok(await dialog.getByRole('alert').count());
        await dialog.getByRole('button', { name: 'Disbursement target month 10-2', exact: true }).click();
        await page.getByRole('button', { name: 'Apr 2026', exact: true }).click();
        await dialog.getByLabel('Disbursement target amount 10-2', { exact: true }).fill('30');
        await dialog.getByRole('button', { name: 'Add Disbursement Target', exact: true }).click();
        await dialog.getByRole('button', { name: 'Disbursement target month 10-3', exact: true }).click();
        await page.getByRole('button', { name: 'Jun 2026', exact: true }).click();
        await dialog.getByLabel('Disbursement target amount 10-3', { exact: true }).fill('50');
        for (const width of [1440, 814, 390]) {
            await page.setViewportSize({ width, height: 1000 });
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
            await page.screenshot({ path: path.join(screenshots, `${table}-${width}.png`), fullPage: true });
        }
        await page.setViewportSize({ width: 1440, height: 1000 });
        await dialog.getByRole('button', { name: 'Apply Targets', exact: true }).click();
        assert.equal((await parents())[table][table === 'activities' ? 'expenses' : 'details'][0].targetScheduleVersion, undefined, 'Applying a draft is not a database write');
        await page.evaluate(() => { window.fixture.fail = true; });
        await page.getByRole('button', { name: 'Save', exact: true }).click();
        await page.waitForFunction(() => window.fixture.calls.some(call => call.name.startsWith('save_')));
        await page.waitForFunction(() => !document.querySelector('.fac-col-action button')?.disabled);
        assert.equal((await parents())[table][table === 'activities' ? 'expenses' : 'details'][0].targetScheduleVersion, undefined);
        await page.evaluate(() => { window.fixture.fail = false; window.fixture.delay = true; });
        const beforeCount = await page.evaluate(() => window.fixture.saved.length);
        await page.getByRole('button', { name: 'Save', exact: true }).dblclick();
        await page.waitForFunction(count => window.fixture.saved.length === count + 1, beforeCount);
        const saved = (await parents())[table][table === 'activities' ? 'expenses' : 'details'][0];
        assert.equal(saved.amount, 100); assert.equal(saved.numberOfUnits, 2); assert.equal(saved.deliveryDate, line.deliveryDate);
        assert.equal(saved.targetObligationSchedules.length, 1); assert.equal(saved.targetObligationSchedules[0].amount, 100);
        assert.deepEqual(saved.targetDisbursementSchedules.map(row => [row.month, row.amount]), [['2026-02-01', 20], ['2026-04-01', 30], ['2026-06-01', 50]]);
        assert.deepEqual(await actuals(), originalActuals);
        await open.click();
        await dialog.getByLabel('Allocation', { exact: true }).fill('120');
        await dialog.getByRole('button', { name: 'Apply Targets', exact: true }).click();
        await page.getByRole('button', { name: 'Save', exact: true }).click();
        await page.waitForFunction(count => window.fixture.saved.length === count + 2, beforeCount);
        const resized = (await parents())[table][table === 'activities' ? 'expenses' : 'details'][0];
        assert.equal(resized.amount, 120); assert.deepEqual(resized.targetDisbursementSchedules, saved.targetDisbursementSchedules);
        assert.equal(resized.numberOfUnits, 2); assert.equal(resized.pricePerUnit, table === 'subprojects' ? 60 : 50);
        await open.click();
        await dialog.getByLabel('Disbursement target amount 10-1', { exact: true }).fill('1');
        await page.keyboard.press('Escape');
        await dialog.waitFor({ state: 'hidden' });
        assert.deepEqual((await parents())[table][table === 'activities' ? 'expenses' : 'details'][0], resized);
        await open.click();
        await dialog.getByLabel('Disbursement target amount 10-1', { exact: true }).fill('2');
        await dialog.getByRole('button', { name: 'Apply Targets', exact: true }).click();
        await page.getByRole('button', { name: 'Discard Changes', exact: true }).click();
        await open.click();
        assert.equal(await dialog.getByLabel('Disbursement target amount 10-1', { exact: true }).inputValue(), '20');
        await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
        await open.click();
        await dialog.getByLabel('Disbursement target amount 10-1', { exact: true }).fill('25');
        const field=table==='activities'?'expenses':'details';
        const concurrent={...resized,targetObligationSchedules:resized.targetObligationSchedules.map(row=>({...row,amount:80}))};
        await db.query(`update ${table} set ${field}=$1 where id=$2`,[JSON.stringify([concurrent]),ids[table]]);
        await page.evaluate(()=>window.refreshFixture());
        assert.equal(await dialog.getByLabel('Disbursement target amount 10-1', { exact: true }).inputValue(), '25','A background read must retain the open draft');
        await dialog.getByRole('button', { name: 'Apply Targets', exact: true }).click();
        await page.getByRole('button', { name: 'Save', exact: true }).click();
        await page.waitForFunction(count => window.fixture.saved.length === count + 3, beforeCount);
        const merged=(await parents())[table][field][0];
        assert.equal(merged.targetObligationSchedules[0].amount,80,'Disjoint stage changes must merge from the authoritative response');
        assert.equal(merged.targetDisbursementSchedules[0].amount,25);
        await open.click();
        assert.equal(await dialog.getByLabel('Obligation target amount 10-1', { exact: true }).inputValue(),'80');
        await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
    }
    await page.evaluate(()=>{window.fixture.denied=true;return window.openFixture()});
    await search.fill('Fixture subprojects');
    assert.equal(await page.getByRole('button',{name:'Edit disbursement targets for Fixture subprojects',exact:true}).isDisabled(),true);
    assert.deepEqual(errors, []);
    assert.ok(alerts.some(message => message.includes('Fixture target save failure')));
    assert.deepEqual(await actuals(), originalActuals);
    console.log(`Independent targets Financial ACF: browser -> real persistence -> disposable PostgreSQL, unequal stages, explicit allocation, actual isolation, failure retention, single-write saves, cancel/discard and responsive controls passed. Screenshots: ${screenshots}`);
} finally { await browser?.close(); await server.close(); await db.close(); }
