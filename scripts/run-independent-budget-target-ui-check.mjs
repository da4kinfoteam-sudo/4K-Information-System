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
const screenshots = await mkdtemp(path.join(tmpdir(), '4kis-independent-target-ui-'));
const harness = `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BudgetTargetPlanEditor, BudgetTargetSummary } from '/components/ui/BudgetTargetPlanEditor.tsx';
import { validateTargetPlan } from '/lib/budgetTargetSchedules.ts';
import BEDSReport from '/components/reports/BEDSReport.tsx';
import WFPReport from '/components/reports/WFPReport.tsx';
import '/index.css'; import '/styles/main.css';
const entry=(id,month,amount)=>({id,month,amount});
const legacy={id:1,objectType:'MOOE',expenseParticular:'Travel',uacsCode:'502',amount:100,obligationMonth:'2026-01-01',disbursementMonth:'2026-02-01',obligations:[{id:71,date:'2026-01-20',amount:25}],disbursements:[{id:72,date:'2026-02-21',amount:20}]};
const base={...legacy,targetScheduleVersion:2,targetObligationSchedules:[entry('o1','2026-01-01',40),entry('o2','2026-03-01',60)],targetDisbursementSchedules:[entry('d1','2026-02-01',20),entry('d2','2026-04-01',30),entry('d3','2026-06-01',50)]};
const parent={id:11,uid:'ACT-11',type:'Training',component:'Production and Livelihood',name:'Fixture activity',participatingIpos:[],status:'Ongoing',date:'2026-01-01',fundingYear:2026,operatingUnit:'NPMO',fundType:'Current',tier:'Tier 1',workflow_status:'APPROVED',history:[]};
function Harness(){
 const [source,setSource]=useState(base),[draft,setDraft]=useState(base),[error,setError]=useState(''),[screen,setScreen]=useState('editor');
 window.fixture={source,draft};
 window.loadFixture=(mode='structured')=>{const value=structuredClone(mode==='legacy'?legacy:base);setSource(value);setDraft(value);setError('');setScreen('editor');};
 const input={subprojects:[],trainings:[{...parent,expenses:[source]}],otherActivities:[],officeReqs:[],staffingReqs:[],otherProgramExpenses:[]};
 const props={data:input,selectedYear:'2026',selectedReportingYear:'2026',selectedOu:'NPMO',selectedFundType:'Current',selectedTier:'Tier 1',uacsCodes:{},onExportReport:request=>window.exported=request,onPrintReport:request=>window.printed=request};
 return <main className="form-page" style={{maxWidth:1200,margin:'0 auto',padding:16}}>
 <nav className="form-action-row" aria-label="Fixture views"><button className="btn btn-secondary" onClick={()=>setScreen('editor')}>Editor</button><button className="btn btn-secondary" onClick={()=>setScreen('beds')}>BEDS</button><button className="btn btn-secondary" onClick={()=>setScreen('wfp')}>WFP</button></nav>
 {screen==='editor'?<><h2>Budget Targets</h2><BudgetTargetPlanEditor line={draft} allocation={draft.amount} defaultYear={2026} onChange={plan=>setDraft(previous=>({...previous,...plan}))}/>
 {error&&<p role="alert" className="form-error">{error}</p>}<div className="form-action-row"><button className="btn btn-primary" onClick={()=>{const issue=validateTargetPlan(draft);if(issue)setError(issue);else{setSource(structuredClone(draft));setError('');}}}>Apply</button><button className="btn btn-secondary" onClick={()=>{setDraft(structuredClone(source));setError('');}}>Discard</button></div>
 <BudgetTargetSummary line={source} allocation={source.amount} stage="disbursement"/></>:screen==='beds'?<BEDSReport {...props}/>:<WFPReport {...props}/>}
 </main>;
}createRoot(document.getElementById('root')).render(<Harness/>);`;
const server = await createServer({ configFile: false, root: process.cwd(), cacheDir: path.join(screenshots, 'node_modules', '.vite'), appType: 'custom', resolve: { alias: { '@': process.cwd() } }, server: { host: '127.0.0.1', port: 0, hmr: false }, optimizeDeps: { noDiscovery: true, entries: [], include: ['react', 'react-dom/client', 'lucide-react'] }, plugins: [{
    name: 'independent-target-ui-offline', enforce: 'pre',
    resolveId(id) {
        if (id === '/independent-target-harness.tsx') return '\0independent-target-harness.tsx';
        if (id.endsWith('supabaseClient')) return '\0offline-client';
    },
    load(id) {
        if (id === '\0offline-client') return 'export const supabase = {};';
        if (id === '\0independent-target-harness.tsx') return transformWithEsbuild(harness, 'independent-target-harness.tsx', { loader: 'tsx', jsx: 'automatic' });
    },
    configureServer(vite) {
        vite.middlewares.use(async (req, res, next) => {
            if (req.url !== '/fixture') return next();
            res.setHeader('Content-Type', 'text/html');
            res.end(await vite.transformIndexHtml('/fixture', '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Independent Target Fixture</title></head><body><div id="root"></div><script type="module" src="/independent-target-harness.tsx"></script></body></html>'));
        });
    },
}, react(), tailwindcss()] });
let browser;
try {
    await server.listen();
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [], remoteRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
        const host = new URL(route.request().url()).hostname;
        if (['localhost', '127.0.0.1'].includes(host)) return route.continue();
        remoteRequests.push(route.request().url());
        return route.abort();
    });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/fixture`);
    await page.waitForFunction(() => typeof window.loadFixture === 'function');
    const original = await page.evaluate(() => window.fixture.source);
    for (const width of [1440, 814, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Page overflow at ${width}`);
        const smallButtons = await page.locator('.budget-target-plan .table-action').evaluateAll(elements => elements.some(element => { const box = element.getBoundingClientRect(); return box.width < 44 || box.height < 44; }));
        if (width === 390) assert.equal(smallButtons, false);
        await page.screenshot({ path: path.join(screenshots, `editor-${width}.png`), fullPage: true });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('button', { name: 'Add Disbursement Target', exact: true }).click();
    assert.equal(await page.getByLabel(/Disbursement target amount/).count(), 4);
    assert.equal(await page.getByLabel(/Obligation target amount/).count(), 2);
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    assert.ok(await page.getByRole('alert').count());
    assert.deepEqual(await page.evaluate(() => window.fixture.source), original);
    await page.getByRole('button', { name: 'Disbursement target month 1-4', exact: true }).click();
    await page.getByRole('button', { name: 'Jul 2026', exact: true }).click();
    await page.getByLabel('Disbursement target amount 1-4', { exact: true }).fill('12.34');
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    const saved = await page.evaluate(() => window.fixture.source);
    assert.equal(saved.amount, 100); assert.equal(saved.targetDisbursementSchedules[3].amount, 12.34);
    assert.deepEqual(saved.targetObligationSchedules, original.targetObligationSchedules);
    assert.deepEqual(saved.obligations, original.obligations); assert.deepEqual(saved.disbursements, original.disbursements);
    await page.getByRole('button', { name: 'Remove obligation target 1-1', exact: true }).click();
    await page.getByRole('button', { name: 'Discard', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.fixture.draft), saved);
    await page.evaluate(() => window.loadFixture('legacy'));
    assert.equal(await page.evaluate(() => window.fixture.source.targetScheduleVersion), undefined);
    await page.getByLabel('Disbursement target amount 1-1', { exact: true }).fill('80');
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    const converted = await page.evaluate(() => window.fixture.source);
    assert.equal(converted.targetScheduleVersion, 2); assert.equal(converted.targetObligationSchedules[0].amount, 100);
    assert.equal(converted.targetObligationSchedules[0].month, '2026-01-01'); assert.equal(converted.targetDisbursementSchedules[0].amount, 80);
    assert.equal(converted.amount, 100); assert.deepEqual(converted.obligations, original.obligations);
    await page.evaluate(() => window.loadFixture());
    for (const name of ['Remove obligation target 1-2', 'Remove obligation target 1-1']) await page.getByRole('button', { name, exact: true }).click();
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.fixture.source.targetObligationSchedules), []);
    await page.evaluate(() => window.loadFixture());
    await page.getByRole('button', { name: 'BEDS', exact: true }).click();
    await page.getByRole('button', { name: 'Download XLSX', exact: true }).click();
    let exported = await page.evaluate(() => window.exported);
    const bed1 = exported.sheets.find(sheet => sheet.sheetName === 'BED 1').rows.find(row => String(row[0]).trim() === 'Fixture activity');
    assert.equal(bed1[4], 100); assert.equal(bed1[5], 100); assert.equal(bed1[6], 0);
    const bed3 = exported.sheets.find(sheet => sheet.sheetName === 'BED 3').rows.find(row => String(row[0]).trim() === 'Fixture activity');
    assert.deepEqual(bed3.slice(1, 9), [0, 20, 0, 20, 30, 0, 50, 80]); assert.equal(bed3[17], 100);
    await page.getByRole('button', { name: 'Print Table', exact: true }).first().click();
    assert.ok(await page.evaluate(() => !!document.getElementById(window.printed.tableElementId)));
    await page.getByRole('button', { name: 'WFP', exact: true }).click();
    await page.getByRole('button', { name: /Download XLSX/ }).click();
    exported = await page.evaluate(() => window.exported);
    const wfp = exported.sheets[0].rows.find(row => String(row[0]).trim() === 'Fixture activity');
    assert.equal(wfp[1], 1); assert.equal(wfp[4], 100); assert.equal(wfp[10], 100); assert.equal(wfp[11], 0);
    assert.deepEqual(errors, []);
    assert.deepEqual(remoteRequests.filter(url => !['fonts.googleapis.com', 'fonts.gstatic.com'].includes(new URL(url).hostname)), [], 'Only the existing stylesheet font requests may be attempted; all remote requests were blocked.');
    console.log(`Independent target controls and BEDS/WFP export/print fixtures passed. Screenshots: ${screenshots}`);
} finally {
    await browser?.close();
    await server.close();
}
