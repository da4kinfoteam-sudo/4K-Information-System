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
const artifacts = await mkdtemp(path.join(tmpdir(), '4kis-gad-resilience-'));
const serve = process.argv.includes('--serve');
const mocks = {
    'contexts/AuthContext': `const user={id:1,role:'Super Admin',operatingUnit:'NPMO'};
        const hasAccess=()=>true,getVisibilityScope=()=> 'All';
        export const useAuth=()=>({currentUser:user,hasAccess,getVisibilityScope});`,
    'supabaseClient': `export const supabase={from(table){const request={table},query={
        select(fields){request.fields=fields;return query},in(field,values){request.ous=[...values];return query},
        gte(field,value){request.min=value;return query},lte(field,value){request.max=value;
            window.audit.requests.push(request);
            if(window.audit.mode==='deferred')return new Promise((resolve,reject)=>window.audit.pending.push({request,resolve,reject}));
            if(window.audit.mode==='throw')return Promise.reject(new Error('Synthetic network failure'));
            if(window.audit.mode==='error')return Promise.resolve({data:null,error:{message:'Synthetic query failure'}});
            const data=window.audit.data;
            return Promise.resolve({data:Array.isArray(data)?data.filter(row=>request.ous.includes(row.operating_unit)&&Number(row.year)>=request.min&&Number(row.year)<=request.max):data,error:null});
        }};return query}};`,
    'lib/gadAttributionExcel': `export const downloadGadAttributionWorkbook=async(payload)=>window.audit.exports.push(payload);`,
};
const harness = `import React,{useState}from'react';import{createRoot}from'react-dom/client';
import GADDashboard from'/components/dashboards/GADDashboard.tsx';import'/index.css';import'/styles/main.css';
window.audit={data:[{operating_unit:'NPMO',year:2024,total_score:15.67,answered_count:22,status:'Completed'}],mode:'success',requests:[],pending:[],exports:[]};
function Harness(){const[scope,setScope]=useState({selectedYear:'2025',selectedOu:'NPMO'}),[fault,setFault]=useState(false),[show,setShow]=useState(true);
window.setScope=patch=>setScope(old=>({...old,...patch}));window.setFault=setFault;window.setShow=setShow;
window.setRows=(data,mode='success')=>{window.audit.data=data;window.audit.mode=mode;dispatchEvent(new Event('gad-pimme-data-changed'))};
return <main style={{maxWidth:1400,margin:'auto',padding:16}}><h1>Isolated GAD preview</h1>{show&&<GADDashboard {...scope} selectedTier="All" selectedFundType="All" subprojects={[]} trainings={[]} otherActivities={[]} officeReqs={[]} staffingReqs={[]} otherProgramExpenses={[]} ipos={fault?null:[]}/>}</main>}
createRoot(document.getElementById('root')).render(<Harness/>);`;
const server = await createServer({ configFile: false, root: process.cwd(), cacheDir: path.join(artifacts, 'node_modules/.vite'), appType: 'custom',
    server: { host: '127.0.0.1', port: serve ? 3022 : 0, strictPort: serve },
    optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom/client', 'lucide-react', 'recharts', 'date-fns'], entries: [] },
    plugins: [{ name: 'gad-resilience-offline', enforce: 'pre',
        resolveId(id) {
            if (id === '/gad-resilience.tsx') return '\0gad-resilience.tsx';
            for (const key of Object.keys(mocks)) if (id.replace(/\\/g, '/').endsWith('/' + key)) return '\0mock-' + key;
        },
        load(id) {
            if (id === '\0gad-resilience.tsx') return transformWithEsbuild(harness, 'gad-resilience.tsx', { loader: 'tsx', jsx: 'automatic' });
            for (const [key, code] of Object.entries(mocks)) if (id === '\0mock-' + key) return code;
        },
        configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
            if (req.url !== '/fixture') return next();
            res.setHeader('Content-Type', 'text/html');
            res.end(await vite.transformIndexHtml('/fixture', '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>GAD Dashboard Resilience Preview</title></head><body><div id="root"></div><script type="module" src="/gad-resilience.tsx"></script></body></html>'));
        }); },
    }, react(), tailwindcss()],
});

const assessment = (year, total_score, extra = {}) => ({ operating_unit: 'NPMO', year, total_score, answered_count: 22, status: 'Completed', ...extra });
let browser;
try {
    await server.listen();
    if (serve) { console.log('Offline GAD preview: http://127.0.0.1:3022/fixture'); await new Promise(() => {}); }
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://**', route => route.abort());
    await page.goto('http://127.0.0.1:' + server.httpServer.address().port + '/fixture');
    const table = page.getByRole('region', { name: 'Attribution by OU table', exact: true });
    const row = ou => table.locator('tbody tr').filter({ has: page.getByRole('button', { name: ou, exact: true }) });
    const cell = (index, ou = 'NPMO') => row(ou).locator('td').nth(index);
    const waitLoaded = async () => {
        await table.waitFor();
        assert.equal(await page.getByText('Unable to display the GAD dashboard.', { exact: true }).count(), 0);
    };
    const load = async (data, mode = 'success') => {
        const count = await page.evaluate(() => window.audit.requests.length);
        await page.evaluate(({ data, mode }) => window.setRows(data, mode), { data, mode });
        await page.waitForFunction(count => window.audit.requests.length === count + 1, count);
        await waitLoaded();
    };
    await waitLoaded();
    assert.equal(await cell(1).innerText(), 'For Assessment');
    assert.equal(await cell(9).innerText(), '15.67 (\u2014)');

    await load([]);
    assert.equal(await cell(9).innerText(), 'No baseline');
    await load([assessment(2024, 15.67), assessment(2025, 3, { status: 'Incomplete', answered_count: 5 })]);
    assert.equal(await cell(1).innerText(), 'Incomplete');
    assert.equal(await cell(9).innerText(), '15.67 (\u2014)');
    await load([assessment(2021, 10), assessment(2023, 12), assessment(2024, 15.67), assessment(2025, 16)]);
    assert.equal(await cell(1).innerText(), '16.00 / 20');
    assert.equal(await cell(9).innerText(), '15.67 (+0.33)');
    await load([assessment(2025, 16)]);
    assert.equal(await cell(9).innerText(), 'No baseline');
    await load([assessment(2024, 0), assessment(2025, 0)]);
    assert.equal(await cell(1).innerText(), '0.00 / 20');
    assert.equal(await cell(9).innerText(), '0.00 (+0.00)');

    for (const value of [null, '', '  ', 'invalid', 'Infinity', 'NaN', true, {}, [], -1, 21]) {
        await load([assessment(2024, 15), assessment(2025, value)]);
        assert.equal(await cell(1).innerText(), 'Incomplete', 'Invalid score must not become zero: ' + JSON.stringify(value));
        assert.equal(await cell(9).innerText(), '15.00 (\u2014)');
    }
    await load([assessment(2024, 15), assessment(2025, 16, { answered_count: null })]);
    assert.equal(await cell(1).innerText(), 'Incomplete');
    await load([assessment('2024', '15.67', { answered_count: '22' }), assessment('2025', '16', { answered_count: '22' })]);
    assert.equal(await cell(9).innerText(), '15.67 (+0.33)');
    await load([assessment(2024, 0), assessment(2025, '0', { answered_count: '22' })]);
    assert.equal(await cell(1).innerText(), '0.00 / 20');

    const mixed = [assessment(2025, '10.00'), assessment(2025, '20.00', { operating_unit: 'RPMO 1' }),
        assessment(2024, 15, { operating_unit: 'RPMO 2' }), assessment(2025, 3, { operating_unit: 'RPMO 2', status: 'Incomplete', answered_count: 5 })];
    await page.evaluate(data => { window.audit.data = data; window.setScope({ selectedOu: 'All' }); }, mixed);
    await waitLoaded();
    await page.waitForFunction(() => document.querySelector('.gad-dashboard-kpis')?.textContent.includes('15.00 / 20'));
    assert.equal(await cell(9, 'RPMO 2').innerText(), '15.00 (\u2014)');
    const trend = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Five-Year PIMME Trend', exact: true }) });
    await trend.scrollIntoViewIfNeeded();
    const tick = await trend.locator('.recharts-xAxis .recharts-cartesian-axis-tick').last().boundingBox();
    const chart = await trend.locator('.recharts-wrapper').boundingBox();
    await page.mouse.move(tick.x + tick.width / 2, chart.y + chart.height / 2);
    await page.waitForFunction(() => [...document.querySelectorAll('.recharts-tooltip-wrapper')].some(node => /Average score/.test(node.textContent) && /15/.test(node.textContent)));
    await page.getByRole('button', { name: 'Download Excel', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.audit.exports.at(-1).rows.filter(row => row.pimmeScore !== null).map(row => row.pimmeScore).sort((a, b) => a - b)), [10, 20]);

    // Failed new scopes must not inherit previously loaded assessment summaries.
    await page.evaluate(() => { window.audit.mode = 'error'; window.setScope({ selectedYear: '2026', selectedOu: 'NPMO' }); });
    await page.getByRole('alert').filter({ hasText: 'Synthetic query failure' }).waitFor();
    await waitLoaded();
    assert.equal(await cell(9).innerText(), 'No baseline');
    await load([], 'throw');
    await page.getByRole('alert').filter({ hasText: 'Synthetic network failure' }).waitFor();
    await load({ invalid: true });
    await page.getByRole('alert').filter({ hasText: 'Invalid PIMME assessment summary response' }).waitFor();
    await load([assessment(2026, 17)]);
    assert.equal(await page.getByRole('alert').count(), 0);

    // Older successful or failed requests must not settle a newer request's state.
    await page.evaluate(() => { window.audit.mode = 'deferred'; window.setScope({ selectedYear: '2027' }); });
    await page.waitForFunction(() => window.audit.pending.length === 1);
    await page.getByText('Loading GAD dashboard', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Download Excel', exact: true }).isDisabled(), true);
    await page.evaluate(() => window.setScope({ selectedYear: '2028', selectedOu: 'RPMO 1' }));
    await page.waitForFunction(() => window.audit.pending.length === 2);
    await page.evaluate(() => window.audit.pending[0].resolve({ data: [{ operating_unit: 'NPMO', year: 2027, total_score: 19, answered_count: 22, status: 'Completed' }], error: null }));
    await page.waitForTimeout(100);
    await page.getByText('Loading GAD dashboard', { exact: true }).waitFor();
    assert.equal(await table.count(), 0);
    await page.evaluate(() => window.audit.pending[1].resolve({ data: [{ operating_unit: 'RPMO 1', year: 2028, total_score: 18.5, answered_count: 22, status: 'Completed' }], error: null }));
    await waitLoaded();
    assert.equal(await cell(1, 'RPMO 1').innerText(), '18.50 / 20');
    await page.evaluate(() => { window.audit.pending = []; dispatchEvent(new Event('gad-pimme-data-changed')); dispatchEvent(new Event('app-data-refreshed')); });
    await page.waitForFunction(() => window.audit.pending.length === 2);
    await page.evaluate(() => window.audit.pending[0].reject(new Error('Superseded failure')));
    await page.waitForTimeout(100);
    await page.getByText('Loading GAD dashboard', { exact: true }).waitFor();
    assert.equal(await page.getByRole('alert').count(), 0);
    await page.evaluate(() => window.audit.pending[1].resolve({ data: [], error: null }));
    await waitLoaded();
    await page.evaluate(() => { window.audit.pending = []; dispatchEvent(new Event('gad-pimme-data-changed')); });
    await page.waitForFunction(() => window.audit.pending.length === 1);
    await page.evaluate(() => window.setShow(false));
    await table.waitFor({ state: 'detached' });
    await page.evaluate(() => window.audit.pending[0].reject(new Error('Unmounted failure')));
    await page.evaluate(() => { window.audit.mode = 'success'; window.setShow(true); });
    await waitLoaded();

    const recoveryRows = [assessment(2024, 15.67), assessment(2025, 3, { status: 'Incomplete', answered_count: 5 })];
    await page.evaluate(data => { window.audit.data = data; window.setScope({ selectedYear: '2025', selectedOu: 'NPMO' }); }, recoveryRows);
    await waitLoaded();
    for (const width of [1440, 814, 390]) {
        await page.setViewportSize({ width, height: 950 });
        await table.scrollIntoViewIfNeeded();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
        await page.screenshot({ path: path.join(artifacts, 'historical-incomplete-' + width + '.png'), fullPage: true });
    }
    await page.evaluate(() => window.setFault(true));
    await page.getByText('Unable to display the GAD dashboard.', { exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Isolated GAD preview', exact: true }).waitFor();
    const beforeRetry = await page.evaluate(() => window.audit.requests.length);
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => window.audit.requests.length), beforeRetry, 'No automatic retry loop');
    await page.screenshot({ path: path.join(artifacts, 'contained-error-mobile.png'), fullPage: true });
    await page.evaluate(() => window.setFault(false));
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await waitLoaded();
    assert.equal(await page.evaluate(() => window.audit.requests.length), beforeRetry + 1);
    assert.equal(await cell(9).innerText(), '15.67 (\u2014)');
    assert.equal(await page.getByRole('alert').count(), 0);
    assert.deepEqual(errors, []);
    const requests = await page.evaluate(() => window.audit.requests);
    for (const request of requests) {
        assert.equal(request.table, 'gad_pimme_assessments');
        assert.equal(request.fields, 'id,operating_unit,year,total_score,answered_count,status');
        assert.equal(request.max - request.min, 4);
        assert(request.ous.length > 0);
    }
    console.log('PASS: historical/current/incomplete/zero/mixed PIMME states, numeric normalization and trend average, scoped failures, request races/unmounts, contained rendering/retry and responsive layouts. Synthetic read-only client only. Screenshots: ' + artifacts);
} finally { await browser?.close(); await server.close(); }
