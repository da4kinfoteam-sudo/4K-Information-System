import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const require = createRequire(import.meta.url);
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || 'C:/Users/joelm/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules', 'playwright'));
const output = await mkdtemp(path.join(tmpdir(), '4kis-gad-pimme-ui-'));
const serve = process.argv.includes('--serve');
const mocks = {
    'constants': `export const operatingUnits=['NPMO','RPMO 1'];export const filterYears=['2026','2025','2024'];`,
    'contexts/AuthContext': `export const useAuth=()=>({currentUser:{id:1,fullName:'Fixture User',operatingUnit:window.fixture.userOu||'NPMO'},hasAccess:(module,action)=>action==='view'?!window.fixture.denyView:!window.fixture.readOnly,getVisibilityScope:()=>window.fixture.scope||'All OUs'});`,
    'hooks/useLogAction': `export const useLogAction=()=>({logAction:async(...args)=>window.fixture.logs.push(args)});`,
    'lib/googleDriveStorage': `export const IPO_DRIVE_FILE_ACCEPT='image/*,.pdf,.docx,.pptx';export const formatFileSize=n=>n+' B';export const isAllowedIpoDriveFile=()=>true;`,
    'supabaseClient': `import{calculateGadPimmeScore}from'/lib/gadPimmeScoring.ts';
      export const supabase={from(table){let filters={};const q={select(){return q},eq(k,v){filters[k]=v;return q},async maybeSingle(){if(window.fixture.loadError)return{data:null,error:{message:'Fixture load failed'}};return{data:window.fixture.records[filters.operating_unit+':'+filters.year]||null,error:null}},then(resolve){const a=Object.values(window.fixture.records).find(r=>r.id===filters.assessment_id);resolve({data:window.fixture.answerError?null:(a?.answers||[]),error:window.fixture.answerError?{message:'Fixture answers failed'}:null})}};return q},
      async rpc(name,payload){window.fixture.saves.push(payload);await new Promise(r=>setTimeout(r,180));if(window.fixture.saveError)return{data:null,error:{message:'Fixture save failed'}};
        const key=payload.p_operating_unit+':'+payload.p_year,previous=window.fixture.records[key]||{};
        const score=calculateGadPimmeScore(payload.p_answers.map(a=>({questionKey:a.question_key,response:a.response,remarks:a.remarks})));
        const saved={...previous,...payload.p_signatories,id:previous.id||19,operating_unit:payload.p_operating_unit,year:payload.p_year,answers:payload.p_answers,status:score.status,answered_count:score.answeredCount,total_score:score.totalScore,updated_at:'2026-10-15T02:00:00Z'};window.fixture.records[key]=saved;return{data:saved,error:null}},
      functions:{async invoke(name,{body}){window.fixture.movRequests.push(body);if(window.fixture.movError)return{data:null,error:{message:'Fixture MOVs failed'}};return{data:{files:window.fixture.movs.filter(f=>body.all_questions||f.question_key===body.question_key)},error:null}}}};`,
};
const harness = `import React,{useState}from'react';import{createRoot}from'react-dom/client';import Route from'/components/GAD/GadPimmeDetailsRoute.tsx';import'/index.css';import'/styles/main.css';
const defaults={records:{'NPMO:2026':{id:7,operating_unit:'NPMO',year:2026,status:'Incomplete',updated_at:'2026-10-14T01:00:00Z',answers:[{question_key:'box16-1.1',response:'No',remarks:'Saved remark'}]}},saves:[],movRequests:[],logs:[],movs:[{id:1,assessment_id:7,question_key:'box16-1.1',file_id:'file-1',file_name:'Saved MOV.pdf',web_view_link:'https://drive.google.com/file/d/file-1/view',uploaded_at:'2026-10-14T00:00:00Z'}]};
window.fixture=structuredClone(defaults);
function Harness(){const[version,setVersion]=useState(0),[year,setYear]=useState(2026),[ou,setOu]=useState('NPMO');window.loadFixture=(options={})=>{window.fixture={...structuredClone(defaults),...options};setYear(2026);setOu(options.targetOu||'NPMO');setVersion(v=>v+1)};window.reloadFixture=()=>setVersion(v=>v+1);window.selectFixtureOu=value=>setOu(value);
return <main className="app-main" style={{margin:0,padding:16}}><Route key={version} operatingUnit={ou} year={year} onBack={()=>{if(confirm('Leave?'))setVersion(v=>v+1)}} onSelectYear={value=>{if(!document.querySelector('.gad-pimme-assessment-actions')?.textContent.includes('Unsaved')||confirm('Leave without saving?'))setYear(value)}}/></main>}
createRoot(document.getElementById('root')).render(<Harness/>);`;
const server = await createServer({ configFile: false, root: process.cwd(), cacheDir: path.join(output, 'node_modules/.vite'), appType: 'custom',
    server: { host: '127.0.0.1', port: serve ? 3018 : 0, strictPort: serve },
    optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom/client', 'lucide-react', 'exceljs'], entries: [] },
    plugins: [{ name: 'gad-pimme-offline', enforce: 'pre', resolveId(id) {
        if (id === '/gad-pimme-harness.tsx') return '\0gad-pimme-harness.tsx';
        for (const key of Object.keys(mocks)) if (id.replace(/\\/g, '/').endsWith('/' + key)) return '\0mock-' + key + '.ts';
    }, load(id) {
        if (id === '\0gad-pimme-harness.tsx') return transformWithEsbuild(harness, 'gad-pimme-harness.tsx', { loader: 'tsx', jsx: 'automatic' });
        for (const [key, code] of Object.entries(mocks)) if (id === '\0mock-' + key + '.ts') return code;
    }, configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
        if (req.url !== '/fixture') return next();
        res.setHeader('Content-Type', 'text/html');
        res.end(await vite.transformIndexHtml('/fixture', '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>4KIS PIMME Preview</title></head><body><div id="root"></div><script type="module" src="/gad-pimme-harness.tsx"></script></body></html>'));
    }); } }, react(), tailwindcss()],
});
let browser;
try {
    await server.listen();
    if (serve) { console.log('Offline PIMME preview: http://127.0.0.1:3018/fixture'); await new Promise(() => {}); }
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    const errors = [];
    page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
    await page.route('https://**', route => route.abort());
    await page.goto('http://127.0.0.1:' + server.httpServer.address().port + '/fixture');
    const prepared = page.getByRole('textbox', { name: 'Prepared by name', exact: true });
    await prepared.waitFor();
    assert.equal(await prepared.inputValue(), '');
    assert.equal(await prepared.getAttribute('placeholder'), null);
    assert.equal(await page.locator('th').last().textContent(), 'MOVs');
    assert.equal(await page.locator('.gad-pimme-signatories header p').count(), 0);
    await prepared.fill('Prepared Person');
    assert.equal(await page.evaluate(() => window.dispatchEvent(new Event('beforeunload', { cancelable: true }))), false, 'Unsaved signatory changes protect refresh');
    page.once('dialog', dialog => dialog.dismiss());
    assert.equal(await page.evaluate(() => window.dispatchEvent(new CustomEvent('app-before-navigation', { cancelable: true, detail: { from: '/gender-and-development/detail', to: '/' } }))), false, 'Unsaved signatory changes protect app navigation');
    await page.getByRole('textbox', { name: 'Prepared by position' }).fill('GAD Officer');
    await page.getByRole('textbox', { name: 'Reviewed by name' }).fill('Reviewed Person');
    await page.getByRole('textbox', { name: 'Approved by name' }).fill('Approved Person');
    assert.match(await page.locator('.gad-pimme-assessment-actions').innerText(), /Unsaved changes/);
    await page.getByRole('button', { name: 'Download Excel', exact: true }).click();
    await page.getByRole('alertdialog').waitFor();
    assert.equal(await page.evaluate(() => window.fixture.movRequests.length), 0);
    await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('button', { name: 'Save assessment', exact: true }).evaluate(node => { node.click(); node.click(); });
    await page.getByRole('status').filter({ hasText: 'assessment saved' }).waitFor();
    assert.equal(await page.evaluate(() => window.fixture.saves.length), 1);
    assert.equal(await page.evaluate(() => window.fixture.saves[0].p_signatories.prepared_by_name), 'Prepared Person');
    await page.evaluate(() => window.reloadFixture());
    await prepared.waitFor();
    assert.equal(await prepared.inputValue(), 'Prepared Person', 'Persisted signatories reload');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download Excel', exact: true }).click();
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), 'PIMME_NPMO_2026.xlsx');
    const filePath = path.join(output, download.suggestedFilename());
    await download.saveAs(filePath);
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.readFile(filePath);
    assert.equal(workbook.getWorksheet('Box 16 and 17').getCell('B71').value, 'Prepared Person');
    assert.equal(workbook.getWorksheet('Box 16 and 17').getCell('C9').value, 0);
    assert.equal(await page.evaluate(() => window.fixture.movRequests.length), 1, 'One assessment-wide metadata request');
    assert.equal(await page.evaluate(() => window.fixture.movRequests[0].all_questions), true);
    assert.equal(await page.evaluate(() => window.fixture.saves.length), 1, 'Export does not save');
    await prepared.fill('Unsaved Person');
    const discardDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download Excel', exact: true }).click();
    await page.getByRole('button', { name: 'Discard and download' }).click();
    await discardDownload;
    assert.equal(await prepared.inputValue(), 'Prepared Person');
    await page.getByRole('button', { name: 'Clear all', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Clear all', exact: true }).click();
    assert.equal(await prepared.inputValue(), 'Prepared Person', 'Clear answers preserves signatories');
    assert.equal(await page.getByRole('radio', { checked: true }).count(), 0);
    await prepared.fill('');
    await page.getByRole('button', { name: 'Save assessment', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'assessment saved' }).waitFor();
    assert.equal(await page.evaluate(() => window.fixture.saves.at(-1).p_signatories.prepared_by_name), null);
    assert.equal(await page.evaluate(() => window.fixture.movs.length), 1);
    await page.getByRole('combobox').selectOption('2025');
    await prepared.waitFor();
    assert.equal(await prepared.inputValue(), '');
    assert.equal(await page.getByRole('button', { name: 'Download Excel', exact: true }).isDisabled(), true);

    for (const width of [1440, 814, 390]) {
        await page.evaluate(() => window.loadFixture());
        await prepared.waitFor();
        await page.setViewportSize({ width, height: 1000 });
        await page.locator('.gad-pimme-signatories').scrollIntoViewIfNeeded();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'No page overflow at ' + width);
        const inputs = await page.locator('.gad-pimme-signatories input').evaluateAll(nodes => nodes.map(node => ({ width: node.clientWidth, parent: node.parentElement.clientWidth, height: node.clientHeight })));
        assert(inputs.every(input => input.width <= input.parent && input.height >= 30));
        await page.screenshot({ path: path.join(output, 'signatories-' + width + '.png') });
        await page.locator('.gad-pimme-detail-header').scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(output, 'header-' + width + '.png') });
    }
    await page.evaluate(() => window.loadFixture({ readOnly: true }));
    await prepared.waitFor();
    assert.equal(await prepared.isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Save assessment', exact: true }).count(), 0);
    const readOnlyDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download Excel', exact: true }).click(); await readOnlyDownload;
    assert.equal(await page.evaluate(() => window.fixture.saves.length), 0);
    await page.evaluate(() => window.loadFixture({ scope: 'Own OU', userOu: 'RPMO 1' }));
    await page.getByText('GAD PIMME record unavailable').waitFor();
    assert.equal(await page.getByRole('button', { name: 'Download Excel' }).count(), 0);
    await page.evaluate(() => window.loadFixture({ denyView: true }));
    await page.getByText('GAD PIMME record unavailable').waitFor();
    await page.evaluate(() => window.loadFixture({ saveError: true }));
    await prepared.waitFor(); await prepared.fill('Retained after failure');
    await page.getByRole('button', { name: 'Save assessment', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Fixture save failed' }).waitFor();
    assert.equal(await prepared.inputValue(), 'Retained after failure');
    assert.match(await page.locator('.gad-pimme-assessment-actions').innerText(), /Unsaved changes/);
    await page.evaluate(() => window.loadFixture({ movError: true }));
    await page.getByRole('button', { name: 'Download Excel', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Fixture MOVs failed' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Download Excel', exact: true }).isEnabled(), true);
    await page.evaluate(() => window.loadFixture());
    await prepared.waitFor();
    await page.route('**/templates/gad-pimme-box-16-and-17.xlsx', route => route.fulfill({ status: 503, body: 'Unavailable' }));
    await page.getByRole('button', { name: 'Download Excel', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Unable to load the PIMME Excel template' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Download Excel', exact: true }).isEnabled(), true);
    await page.unroute('**/templates/gad-pimme-box-16-and-17.xlsx');
    await page.evaluate(() => window.loadFixture({ answerError: true }));
    await page.getByRole('alert').filter({ hasText: 'Fixture answers failed' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Download Excel', exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Save assessment', exact: true }).isDisabled(), true);
    assert.deepEqual(errors, []);
    console.log('GAD PIMME browser checks passed: saved/reloaded/cleared signatories, dirty/save/discard/export, real XLSX download, scoped metadata, read-only/OU denial, failures, 1440/814/390 screenshots. Evidence: ' + output);
} finally { await browser?.close(); await server.close(); }
