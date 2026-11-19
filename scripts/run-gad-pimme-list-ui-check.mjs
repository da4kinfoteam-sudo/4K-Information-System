import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const require = createRequire(import.meta.url);
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || 'C:/Users/joelm/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules', 'playwright'));
const output = await mkdtemp(path.join(tmpdir(), '4kis-gad-list-ui-')), serve = process.argv.includes('--serve');
const mocks = {
    constants: `export const operatingUnits=['NPMO',...Array.from({length:16},(_,i)=>'RPMO '+(i+1))];export const ouToRegionMap=Object.fromEntries(operatingUnits.map(ou=>[ou,'Region with a deliberately long location description for '+ou]));`,
    'contexts/AuthContext': `export const useAuth=()=>({currentUser:window.fixture.userId==null?null:{id:window.fixture.userId,operatingUnit:window.fixture.userOu},getVisibilityScope:()=>window.fixture.scope});`,
    supabaseClient: `let sequence=0;window.replies=new Map();export const supabase={from(table){if(table!=='gad_pimme_assessments')throw Error('Unexpected table '+table);let columns,ous,year;const q={select(value){columns=value;return q},in(key,value){if(key!=='operating_unit')throw Error(key);ous=value;return q},lte(key,value){if(key!=='year')throw Error(key);year=value;return q},then(resolve,reject){const f=window.fixture,id=++sequence;f.requests.push({id,table,columns,ous,year});const response=f.responses.shift()||{};const rows=structuredClone(response.rows||f.rows).filter(row=>ous.includes(row.operating_unit)&&row.year<=year);const finish=()=>response.throws?reject(Error(response.throws)):resolve({data:response.error?null:rows,error:response.error?{message:response.error}:null});if(response.hold)window.replies.set(id,finish);else setTimeout(finish,response.delay||0)}};return q}};`,
};
const harness = `import React,{useState}from'react';import{createRoot}from'react-dom/client';import Page from'/components/GAD/GadPimmePage.tsx';import{IpoColumnHeader,IpoColumnsControl}from'/components/IPO/IpoListControls.tsx';import{IPO_LIST_COLUMNS}from'/lib/ipoListColumns.ts';import'/index.css';import'/styles/main.css';
const reference=document.createElement('div');reference.style.cssText='position:fixed;top:0;left:0;width:1px;height:1px;overflow:hidden;visibility:hidden;pointer-events:none';reference.setAttribute('aria-hidden','true');document.body.appendChild(reference);createRoot(reference).render(<div className="ipo-list-page"><div className="major-table-card gad-ipo-header-reference"><table className="data-table ipo-list-table"><thead><tr><IpoColumnHeader column={IPO_LIST_COLUMNS[0]} options={[]} selected={undefined} sort={null} onApply={()=>{}}/></tr></thead></table></div></div>);
function defaults(){const year=new Date().getFullYear();return{userId:1,userOu:'NPMO',scope:'All OUs',rows:[{id:1,operating_unit:'NPMO',year,status:'Completed',answered_count:22,total_score:0},{id:2,operating_unit:'RPMO 1',year,status:'Incomplete',total_score:2},{id:3,operating_unit:'NPMO',year:year-1,status:'Completed',answered_count:22,total_score:18},{id:4,operating_unit:'RPMO 1',year:year-1,status:'Completed',answered_count:22,total_score:0},{id:5,operating_unit:'RPMO 2',year:year-1,status:'Incomplete',total_score:1},{id:6,operating_unit:'RPMO 3',year:year-2,status:'Incomplete',total_score:0}],requests:[],responses:[],navigation:[]}}
window.fixture=defaults();function Harness(){const[epoch,setEpoch]=useState(0),[,render]=useState(0);window.configure=(options={},preferences=undefined)=>{window.fixture={...defaults(),...options};if(preferences!==undefined)localStorage.setItem('gad-pimme-list:'+window.fixture.userId,JSON.stringify(preferences));else localStorage.removeItem('gad-pimme-list:'+window.fixture.userId);setEpoch(n=>n+1)};window.identity=options=>{Object.assign(window.fixture,options);render(n=>n+1)};window.reply=id=>{window.replies.get(id)?.();window.replies.delete(id)};return <main className="app-main" style={{margin:0,padding:16}}>{location.pathname==='/ipo-reference'?<IpoColumnsControl selected={[]} onApply={()=>{}}/>:<Page key={epoch} onSelectAssessment={(ou,year)=>window.fixture.navigation.push({ou,year})}/>}</main>}createRoot(document.getElementById('root')).render(<Harness/>);`;
const server = await createServer({ configFile: false, root: process.cwd(), cacheDir: path.join(output, '.vite'), appType: 'custom', resolve: { alias: { '@': process.cwd() } },
    server: { host: '127.0.0.1', port: serve ? Number(process.env.PORT || 3033) : 0, strictPort: serve }, optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom/client', 'lucide-react'], entries: [] },
    plugins: [{ name: 'gad-list-offline', enforce: 'pre', resolveId(id, importer) {
        if ((importer || '').replace(/\\/g, '/').includes('/node_modules/')) return;
        if (id === '/gad-list-harness.tsx') return '\0gad-list-harness.tsx';
        for (const key of Object.keys(mocks)) if (id.replace(/\\/g, '/').endsWith('/' + key)) return '\0mock-' + key + '.ts';
    }, load(id) {
        if (id === '\0gad-list-harness.tsx') return transformWithEsbuild(harness, 'gad-list-harness.tsx', { loader: 'tsx', jsx: 'automatic' });
        for (const [key, value] of Object.entries(mocks)) if (id === '\0mock-' + key + '.ts') return value;
    }, configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
        if (req.url !== '/fixture' && req.url !== '/ipo-reference') return next();
        res.setHeader('Content-Type', 'text/html');res.end(await vite.transformIndexHtml('/fixture', '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>4KIS GAD List Review</title></head><body><div id="root"></div><script type="module" src="/gad-list-harness.tsx"></script></body></html>'));
    }); } }, react(), tailwindcss()],
});
let browser, passed = 0;
try {
    await server.listen();const url = 'http://127.0.0.1:' + server.httpServer.address().port + '/fixture';
    if (serve) { console.log('Sample-only GAD list preview: ' + url);await new Promise(() => {}); }
    browser = await chromium.launch({ channel: 'msedge', headless: true });const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    await page.clock.install({ time: new Date('2026-11-14T04:00:00Z') });
    const errors = [], external = [];page.on('pageerror', error => { errors.push(error.message);console.error(error.message); });await page.route('https://**', route => { if (!route.request().url().includes('fonts.')) external.push(route.request().url());return route.abort(); });
    await page.goto(url);
    const summary = () => page.getByRole('combobox', { name: 'Summary Year', exact: true });
    const rows = () => page.locator('tbody tr[role="link"]');
    const headings = () => page.locator('.gad-pimme-table thead th').allTextContents();
    const edit = () => page.getByRole('button', { name: 'Edit Table', exact: true });
    const chooser = () => page.getByRole('dialog', { name: 'Edit GAD Table', exact: true });
    const apply = () => chooser().getByRole('button', { name: 'Apply', exact: true }).click();
    const counts = () => page.locator('.gad-pimme-list-kpi > strong').allTextContents();
    const ready = async () => { await page.waitForFunction(() => document.querySelector('.gad-pimme-list-kpis')?.getAttribute('aria-busy') === 'false'); };
    const configure = async (options = {}, preferences) => { await page.evaluate(({ options, preferences }) => window.configure(options, preferences), { options, preferences });await ready(); };
    const check = async (label, run) => { await run();passed++;console.log('PASS ' + label); };
    await ready();
    await check('current-year-only defaults, summary projection and zero-score completion', async () => {
        assert.equal(await page.locator('.gad-pimme-list-meta').count(), 0);
        assert(!(await page.locator('.gad-pimme-list-header').innerText()).includes('Assessment cycle'));
        assert.deepEqual(await headings(), ['Operating Unit', 'Latest PIMME', '2026']);assert.deepEqual(await counts(), ['17', '1', '1', '15']);
        assert.equal(await summary().inputValue(), '2026');assert.deepEqual(await summary().locator('option').allTextContents(), ['2026', '2025', '2024']);
        assert.equal(await rows().first().locator('td').last().innerText(), '0.00 / 20');
        const request = await page.evaluate(() => window.fixture.requests[0]);assert.equal(request.table, 'gad_pimme_assessments');assert.equal(request.columns, 'id,operating_unit,year,box16_score,box17_score,total_score,answered_count,status,updated_at');assert.equal(request.ous.length, 17);
    });
    await check('shared chooser pins defaults and uses draft apply/cancel/escape/reset with persisted columns and no refetch', async () => {
        await edit().click();for(const name of ['Operating Unit','Latest PIMME','2026']) assert(await chooser().getByRole('checkbox', { name, exact:true }).isDisabled());
        await chooser().getByRole('checkbox', { name: '2025', exact:true }).check();await page.keyboard.press('Escape');
        assert.deepEqual(await headings(), ['Operating Unit', 'Latest PIMME', '2026']);assert(await edit().evaluate(element=>element===document.activeElement));
        await edit().click();assert(!(await chooser().getByRole('checkbox', { name:'2025',exact:true }).isChecked()));
        await chooser().getByRole('checkbox', { name:'2025',exact:true }).check();await chooser().getByRole('button', {name:'Cancel',exact:true}).click();
        await edit().click();for(const name of ['2025','2024']) await chooser().getByRole('checkbox', {name,exact:true}).check();await apply();
        assert.deepEqual(await headings(), ['Operating Unit', 'Latest PIMME', '2026', '2025', '2024']);assert.equal(await page.evaluate(() => window.fixture.requests.length), 1);
        await page.reload();await ready();assert.deepEqual(await headings(), ['Operating Unit', 'Latest PIMME', '2026', '2025', '2024']);
        await edit().click();await chooser().getByRole('button', { name: 'Reset Columns' }).click();await page.keyboard.press('Escape');assert.deepEqual(await headings(), ['Operating Unit', 'Latest PIMME', '2026', '2025', '2024']);
        await edit().click();await chooser().getByRole('button', { name: 'Reset Columns' }).click();await apply();
        assert.deepEqual(await headings(), ['Operating Unit', 'Latest PIMME', '2026']);assert.equal(await page.getByRole('checkbox', { name: '2025',exact:true }).count(), 0);
    });
    await check('historical summaries, status scope and exact row/cell keyboard navigation remain independent', async () => {
        await configure();await summary().selectOption('2025');assert.deepEqual(await counts(), ['17', '2', '1', '14']);assert.deepEqual(await headings(), ['Operating Unit', 'Latest PIMME', '2026']);
        await page.getByRole('combobox', { name: 'Status for 2025' }).selectOption('Completed');assert.equal(await rows().count(), 2);
        await rows().first().focus();await page.keyboard.press('Enter');await rows().first().focus();await page.keyboard.press('Space');
        await rows().first().getByRole('button', { name: 'Open NPMO GAD PIMME assessment for 2026' }).focus();await page.keyboard.press('Enter');
        assert.deepEqual(await page.evaluate(() => window.fixture.navigation), [{ ou: 'NPMO', year: 2025 }, { ou: 'NPMO', year: 2025 }, { ou: 'NPMO', year: 2026 }]);
        await edit().click();await chooser().getByRole('checkbox', { name: '2024',exact:true }).check();await apply();
        await rows().first().getByRole('button', { name: 'Open NPMO GAD PIMME assessment for 2024' }).click();assert.deepEqual(await page.evaluate(() => window.fixture.navigation.at(-1)), { ou: 'NPMO', year: 2024 });
        assert.equal(await page.evaluate(() => window.fixture.requests.length), 1);
    });
    await check('summary totals ignore search/status/page; summary changes reset page while columns preserve filters', async () => {
        await configure();await page.getByRole('button', { name: 'Next', exact: true }).click();assert.match(await page.getByRole('navigation', { name: 'Table pagination' }).innerText(), /2 \/ 2/);
        await edit().click();await chooser().getByRole('checkbox', { name: '2025',exact:true }).check();await apply();assert.match(await page.getByRole('navigation').innerText(), /2 \/ 2/);
        await summary().selectOption('2025');assert.match(await page.getByRole('navigation').innerText(), /1 \/ 2/);
        await page.getByRole('searchbox', { name: 'Search operating units' }).fill('NPMO');assert.equal(await rows().count(), 1);assert.deepEqual(await counts(), ['17', '2', '1', '14']);
        await page.getByRole('combobox', { name: 'Status for 2025' }).selectOption('Incomplete');assert.equal(await rows().count(), 0);assert.deepEqual(await counts(), ['17', '2', '1', '14']);
        await edit().click();await page.getByRole('button', { name: 'Reset Columns' }).click();await apply();assert.equal(await page.getByRole('searchbox').inputValue(), 'NPMO');
    });
    await check('legacy/malformed storage is normalized and unavailable summary year falls back only on success', async () => {
        await configure({}, { search: 'RPMO', status: 'Incomplete', page: 900, pageSize: 10, additionalYears: [2025, 2025, 2027, 'bad'], summaryYear: 2023 });
        assert.equal(await summary().inputValue(), '2026');assert.deepEqual(await headings(), ['Operating Unit', 'Latest PIMME', '2026', '2025']);assert.equal(await rows().count(), 1);
        const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('gad-pimme-list:1')));assert.equal(stored.page, 1);assert.equal(stored.summaryYear, 2026);assert.deepEqual(stored.additionalYears, [2025]);
    });
    await check('valid saved pagination survives initial loading and clamps after a successful filtered refresh', async () => {
        await configure({}, { status: 'For Assessment', page: 2, pageSize: 10 });assert.match(await page.getByRole('navigation').innerText(), /2 \/ 2/);
        await page.evaluate(() => { window.fixture.rows=Array.from({length:17},(_,index)=>({operating_unit:index?'RPMO '+index:'NPMO',year:2026,status:'Incomplete',total_score:0}));window.dispatchEvent(new Event('gad-pimme-data-changed')); });await ready();
        assert.equal(await rows().count(), 0);assert.match(await page.getByRole('navigation').innerText(), /1 \/ 1/);assert.deepEqual(await counts(), ['17', '0', '17', '0']);
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('gad-pimme-list:1')).page), 1);
    });
    await check('refresh failures preserve the last successful historical summary and preferences', async () => {
        await configure();await summary().selectOption('2025');await page.evaluate(() => { window.fixture.responses.push({ error: 'Synthetic refresh failure' });window.dispatchEvent(new Event('gad-pimme-data-changed')); });await ready();
        await page.getByRole('alert').filter({ hasText: 'Synthetic refresh failure' }).waitFor();assert.equal(await summary().inputValue(), '2025');assert.deepEqual(await counts(), ['17', '2', '1', '14']);
        await page.evaluate(() => { window.fixture.responses.push({ throws: 'Synthetic network failure' });window.dispatchEvent(new Event('gad-pimme-data-changed')); });await ready();assert.equal(await summary().inputValue(), '2025');
        await page.evaluate(() => { window.fixture.rows=window.fixture.rows.filter(row=>row.year!==2025);window.dispatchEvent(new Event('gad-pimme-data-changed')); });await ready();assert.equal(await summary().inputValue(), '2026');assert.deepEqual(await summary().locator('option').allTextContents(), ['2026', '2024']);
    });
    await check('latest overlapping refresh wins and late responses cannot reintroduce removed years', async () => {
        await configure();await page.evaluate(() => { window.fixture.responses.push({ hold: true });window.dispatchEvent(new Event('gad-pimme-data-changed')); });
        await page.waitForFunction(() => window.replies.size === 1);const id = await page.evaluate(() => [...window.replies.keys()][0]);
        await page.evaluate(() => { window.fixture.rows=[];window.dispatchEvent(new Event('gad-pimme-data-changed')); });await ready();await page.evaluate(id => window.reply(id), id);
        assert.deepEqual(await counts(), ['17', '0', '0', '17']);assert.deepEqual(await summary().locator('option').allTextContents(), ['2026']);
    });
    await check('account/scope transitions clear old data immediately and preserve separate preferences', async () => {
        await configure();await summary().selectOption('2025');await page.evaluate(() => { window.fixture.responses.push({ hold: true });window.identity({ userId: 2, userOu: 'RPMO 3', scope: 'Own OU' }); });
        await page.waitForFunction(() => window.replies.size === 1);assert.equal(await rows().count(), 0);assert.deepEqual(await counts(), ['1', '\u2014', '\u2014', '\u2014']);
        const pending = await page.evaluate(() => [...window.replies.keys()][0]);await page.evaluate(id => window.reply(id), pending);await ready();assert.deepEqual(await summary().locator('option').allTextContents(), ['2026', '2024']);assert.equal(await rows().count(), 1);assert.match(await rows().first().innerText(), /RPMO 3/);
        await summary().selectOption('2024');await page.evaluate(() => window.identity({ userId: 1, userOu: 'NPMO', scope: 'All OUs' }));await ready();assert.equal(await summary().inputValue(), '2025');
        await page.evaluate(() => { window.fixture.responses.push({ hold: true });window.dispatchEvent(new Event('gad-pimme-data-changed')); });await page.waitForFunction(() => window.replies.size === 1);const old = await page.evaluate(() => [...window.replies.keys()][0]);
        await page.evaluate(() => window.identity({ scope: 'Own OU', userOu: 'NPMO' }));await ready();await page.evaluate(id => window.reply(id), old);assert.equal(await rows().count(), 1);assert.deepEqual(await summary().locator('option').allTextContents(), ['2026', '2025']);
        await page.evaluate(() => window.identity({ userOu: '' }));await ready();assert.equal(await rows().count(), 0);assert.deepEqual(await counts(), ['0', '0', '0', '0']);
        await page.evaluate(() => window.identity({ userId: null }));await ready();assert.equal(await rows().count(), 0);assert(await summary().isDisabled());
    });
    await check('initial load failures keep saved historical selection without showing invented assessment counts', async () => {
        await configure({ responses: [{ error: 'Unavailable' }] }, { summaryYear: 2025, additionalYears: [2024] });assert.equal(await summary().inputValue(), '2025');assert.deepEqual(await counts(), ['17', '\u2014', '\u2014', '\u2014']);assert.equal(await rows().count(), 0);
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('gad-pimme-list:1')).summaryYear), 2025);
    });
    await check('year rollover pins the new current year, generates beyond 2028 and keeps default columns minimal', async () => {
        await configure();await page.clock.setSystemTime(new Date('2029-01-01T04:00:00Z'));await page.evaluate(() => window.dispatchEvent(new Event('focus')));await ready();assert.deepEqual(await headings(), ['Operating Unit', 'Latest PIMME', '2029']);
        await edit().click();assert(await chooser().getByRole('checkbox', { name: '2029',exact:true }).isDisabled());await chooser().getByRole('checkbox', { name: '2028',exact:true }).check();await apply();assert.deepEqual(await headings(), ['Operating Unit', 'Latest PIMME', '2029', '2028']);
        await page.clock.setSystemTime(new Date('2026-11-14T04:00:00Z'));await configure();
    });
    await check('latest classification uses complete valid scores through current year independently of summary and visible columns', async () => {
        const completed = (operating_unit,year,total_score,extra={})=>({operating_unit,year,total_score,answered_count:22,status:'Completed',...extra});
        await configure({rows:[completed('NPMO',2026,19,{status:'Incomplete'}),completed('NPMO',2025,'17.33'),completed('NPMO',2027,20),
            completed('RPMO 1',2026,20),completed('RPMO 1',2025,2),completed('RPMO 2',2026,0),
            completed('RPMO 3',2026,null),completed('RPMO 3',2019,8),completed('RPMO 4',2026,20,{answered_count:21}),completed('RPMO 4',2024,4),
            completed('RPMO 5',2026,12,{status:'Incomplete'}),completed('RPMO 6',2026,'bad'),completed('RPMO 6',2025,14.99),
            completed('RPMO 7',2026,'',{answered_count:'22'}),completed('RPMO 7',2025,7.99),completed('RPMO 8',2026,15),completed('RPMO 9',2026,3.99),completed('Outside',2026,20)]});
        const latest = ()=>page.locator('td.gad-pimme-latest-column span').allTextContents();
        const expected=['Gender-Responsive (2025)','Gender-Responsive (2026)','GAD-Invisible (2026)','Gender-Sensitive (2019)','Promising GAD Prospects (2024)','No Completed Assessment','Gender-Sensitive (2025)','Promising GAD Prospects (2025)','Gender-Responsive (2026)','GAD-Invisible (2026)'];
        assert.deepEqual(await latest(),expected);
        assert.equal(await rows().first().locator('.gad-pimme-latest-column span').getAttribute('title'),'Gender-Responsive (2025) - 17.33 / 20');
        await summary().selectOption('2019');assert.deepEqual(await latest(),expected);assert.deepEqual(await headings(),['Operating Unit','Latest PIMME','2026']);
        await rows().first().locator('.gad-pimme-latest-column').click();assert.deepEqual(await page.evaluate(()=>window.fixture.navigation.at(-1)),{ou:'NPMO',year:2019});
        await rows().first().getByRole('button',{name:'Open NPMO GAD PIMME assessment for 2026'}).click();assert.deepEqual(await page.evaluate(()=>window.fixture.navigation.at(-1)),{ou:'NPMO',year:2026});
        assert.equal(await page.evaluate(()=>window.fixture.requests.length),1);
    });
    await check('year clicks sort numerically across pages with zero valid missing-last ties stable and keyboard third-click reset', async () => {
        const values=[10,2,0,10,19,null,20,'15',8,4,1,19,20,'bad','',true,17];
        await configure({rows:values.map((total_score,index)=>({operating_unit:index?'RPMO '+index:'NPMO',year:2026,status:index===4?'Incomplete':'Completed',answered_count:index===6?21:22,total_score}))});
        const names=()=>rows().locator('td.gad-pimme-ou-column strong').allTextContents();
        const sort=()=>page.getByRole('button',{name:'Sort 2026 score',exact:true});
        const header=()=>page.locator('.gad-pimme-table th').last();
        const original=await names(),initialCounts=await counts();
        await page.getByRole('button',{name:'Next',exact:true}).click();await sort().click();
        assert.equal(await header().getAttribute('aria-sort'),'ascending');assert.match(await page.getByRole('navigation').innerText(),/1 \/ 2/);
        assert.deepEqual(await names(),['RPMO 2','RPMO 10','RPMO 1','RPMO 9','RPMO 8','NPMO','RPMO 3','RPMO 7','RPMO 16','RPMO 11']);
        await sort().focus();await page.keyboard.press('Space');assert.equal(await header().getAttribute('aria-sort'),'descending');
        assert.equal((await names())[0],'RPMO 12','sort reaches a record originally on page two');
        await page.getByRole('combobox',{name:'Rows per page',exact:true}).selectOption('20');
        assert.deepEqual(await names(),['RPMO 12','RPMO 11','RPMO 16','RPMO 7','NPMO','RPMO 3','RPMO 8','RPMO 9','RPMO 1','RPMO 10','RPMO 2','RPMO 4','RPMO 5','RPMO 6','RPMO 13','RPMO 14','RPMO 15']);
        assert.deepEqual(await counts(),initialCounts);
        await sort().focus();await page.keyboard.press('Enter');assert.equal(await header().getAttribute('aria-sort'),'none');assert.deepEqual((await names()).slice(0,10),original);
        assert.equal(await page.evaluate(()=>window.fixture.requests.length),1);
    });
    await check('sort preferences persist normalize safely and reset only when their optional year is removed', async () => {
        await configure({}, {additionalYears:[2025],sort:{year:2025,direction:'descending'},page:2});
        assert.equal(await page.locator('.gad-pimme-table th').last().getAttribute('aria-sort'),'descending');
        await page.reload();await ready();assert.equal(await page.locator('.gad-pimme-table th').last().getAttribute('aria-sort'),'descending');
        await edit().click();await chooser().getByRole('checkbox',{name:'2025',exact:true}).uncheck();await chooser().getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(await page.locator('.gad-pimme-table th').last().getAttribute('aria-sort'),'descending');
        await edit().click();await chooser().getByRole('checkbox',{name:'2025',exact:true}).uncheck();await apply();
        assert.equal(await page.locator('.gad-pimme-table th').last().getAttribute('aria-sort'),'none');assert.match(await page.getByRole('navigation').innerText(),/1 \/ 2/);
        assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('gad-pimme-list:1')).sort),null);
        await configure({}, {sort:{year:2025,direction:'ascending'}});assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('gad-pimme-list:1')).sort),null);
        await page.getByRole('button',{name:'Sort 2026 score'}).click();await page.getByRole('searchbox',{name:'Search operating units',exact:true}).fill('RPMO');assert.equal(await page.locator('.gad-pimme-table th').last().getAttribute('aria-sort'),'ascending');
    });
    const metrics = [], viewports=[[1440,1000],[820,1000],[390,844],[320,640]];
    const chooserMetrics=()=>page.locator('.edit-table-menu').evaluate(menu=>{
        const style=getComputedStyle(menu),search=menu.querySelector('input[type="search"]'),focus=getComputedStyle(search),options=menu.querySelector('.edit-table-menu__options'),footer=menu.querySelector('.table-control-menu-footer');
        const box=element=>element.getBoundingClientRect().toJSON(), bounds=box(menu), input=box(search);
        return{width:bounds.width,padding:style.padding,fontSize:style.fontSize,fontWeight:style.fontWeight,radius:style.borderRadius,border:style.borderWidth,gap:style.gap,outline:focus.outlineWidth,offset:focus.outlineOffset,shadow:focus.boxShadow,searchPadding:focus.padding,footerPadding:getComputedStyle(footer).paddingTop,buttonHeights:[...footer.querySelectorAll('button')].map(button=>box(button).height),bounded:bounds.left>=0&&bounds.right<=innerWidth+1&&bounds.top>=0&&bounds.bottom<=innerHeight+1,focusInside:input.left>=bounds.left+parseFloat(style.paddingLeft)-1&&input.right<=bounds.right-parseFloat(style.paddingRight)+1,scrollable:options.scrollHeight>options.clientHeight};
    });
    await check('shared GAD and real IPO chooser styling matches across desktop tablet and phone with inset focus and reachable footer',async()=>{
        await configure();
        for(const[width,height]of viewports){
            await page.setViewportSize({width,height});await edit().click();
            assert(await chooser().getByRole('searchbox',{name:'Search columns'}).evaluate(element=>element===document.activeElement));
            await chooser().getByRole('searchbox').fill('2025');assert.equal(await chooser().getByRole('checkbox').count(),1);await chooser().getByRole('searchbox').fill('no-such-column');assert(await chooser().getByText('No matching columns.').isVisible());await chooser().getByRole('searchbox').fill('');
            const gad=await chooserMetrics();assert(gad.bounded&&gad.focusInside);assert.equal(gad.outline,'2px');assert.equal(gad.offset,'-2px');assert.equal(gad.shadow,'none');
            if(width<=390){assert(gad.scrollable);assert(gad.buttonHeights.every(value=>value>=44));await chooser().getByRole('checkbox',{name:'2019',exact:true}).check();}
            await page.screenshot({path:path.join(output,'chooser-gad-'+width+'.png')});await page.keyboard.press('Escape');
            await page.goto(new URL('/ipo-reference',url).href);await edit().click();const ipo=await chooserMetrics();
            const keys=['width','padding','fontSize','fontWeight','radius','border','gap','outline','offset','shadow','searchPadding','footerPadding','buttonHeights'];for(const key of keys)assert.deepEqual(gad[key],ipo[key],key+' parity at '+width);
            await page.screenshot({path:path.join(output,'chooser-ipo-'+width+'.png')});await page.keyboard.press('Escape');await page.goto(url);await ready();
        }
    });
    await check('inline Summary Year and actual IPO header have matching compact metrics without changing GAD body alignment',async()=>{
        await configure();for(const[width,height]of viewports){
            await page.setViewportSize({width,height});
            const result=await page.evaluate(()=>{
                const reference=document.querySelector('.gad-ipo-header-reference th'),header=document.querySelector('.gad-pimme-table th'),style=element=>{const s=getComputedStyle(element);return{fontFamily:s.fontFamily,fontSize:s.fontSize,fontWeight:s.fontWeight,lineHeight:s.lineHeight,height:element.getBoundingClientRect().height}};
                const title=document.querySelector('h1').getBoundingClientRect(),select=document.querySelector('select[aria-label="Summary Year"]').getBoundingClientRect();
                return{width:innerWidth,ipo:style(reference),gad:style(header),headers:[...document.querySelectorAll('.gad-pimme-table th')].map(element=>element.getBoundingClientRect().height),sameLine:select.top<title.bottom&&select.bottom>title.top,noOldRow:!document.querySelector('.gad-pimme-summary-controls'),bodyAlign:[...document.querySelector('.gad-pimme-table tbody tr').cells].map(element=>getComputedStyle(element).textAlign)};
            });
            for(const key of ['fontFamily','fontSize','fontWeight','lineHeight'])assert.equal(result.gad[key],result.ipo[key],key+' at '+width);
            assert(Math.abs(result.gad.height-result.ipo.height)<0.5,JSON.stringify(result));assert(result.headers.every(height=>Math.abs(height-result.ipo.height)<0.5));assert(result.noOldRow);if(width>=820)assert(result.sameLine);
            assert.deepEqual(result.bodyAlign,['left','center','center']);metrics.push(result);
        }
        await writeFile(path.join(output,'header-metrics.json'),JSON.stringify(metrics,null,2));
    });
    await check('one/many-year desktop tablet mobile layouts preserve padding, nowrap, sticky OU and bounded menus', async () => {
        await configure();for (const [width, height] of [[1440, 1000], [820, 1000], [390, 844], [320, 640]]) {
            await page.setViewportSize({ width, height });await edit().click();await page.getByRole('button', { name: 'Reset Columns' }).click();await apply();
            const single = await page.locator('.gad-pimme-table').boundingBox();if (width === 1440) assert(single.width < 1500);
            await page.screenshot({ path: path.join(output, 'list-single-' + width + '.png'), fullPage: true });
            await edit().click();const menu = await chooser().boundingBox();assert(menu.x >= 0 && menu.x + menu.width <= width + 1 && menu.y >= 0 && menu.y + menu.height <= height + 1);
            await page.screenshot({ path: path.join(output, 'list-menu-' + width + '.png'), fullPage: true });
            for (const year of [2025, 2024, 2023, 2022, 2021, 2020, 2019]) await chooser().getByRole('checkbox', { name: String(year),exact:true }).check();await apply();
            assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
            const dimensions = await page.locator('.gad-pimme-table-scroll').evaluate(element => ({ client: element.clientWidth, scroll: element.scrollWidth }));assert(dimensions.scroll > dimensions.client);
            const styles = await page.locator('.gad-pimme-table td').evaluateAll(elements => elements.map(element => getComputedStyle(element).whiteSpace));assert(styles.every(style => style === 'nowrap'));
            assert.equal(await page.locator('td.gad-pimme-ou-column span').count(),0,'OU descriptions must not reserve a second line');
            const ouName=page.locator('td.gad-pimme-ou-column strong').first();assert(await ouName.getAttribute('title'));assert.equal(await ouName.evaluate(element=>getComputedStyle(element).textOverflow),'ellipsis');
            const rowHeights=await rows().evaluateAll(elements=>elements.map(element=>element.getBoundingClientRect().height));assert(rowHeights.every(height=>height<=44),'Single-line OU rows remain compact');
            assert.equal(await page.locator('td.gad-pimme-ou-column').first().evaluate(element => getComputedStyle(element).position), 'sticky');
            const footer = await page.getByRole('navigation').evaluate(element => ({ margin: getComputedStyle(element).margin, padding: parseFloat(getComputedStyle(element).paddingLeft), bounds: element.getBoundingClientRect().toJSON(), controls: [...element.querySelectorAll('button,select')].map(control=>control.getBoundingClientRect().toJSON()) }));
            assert.equal(footer.margin, '0px');assert(footer.padding >= 10);assert(footer.controls.every(control => control.x > footer.bounds.x && control.right < footer.bounds.right && control.bottom < footer.bounds.bottom));
            await page.screenshot({ path: path.join(output, 'list-many-' + width + '.png'), fullPage: true });
        }
        assert.deepEqual(errors, []);assert.deepEqual(external, []);
    });
    console.log(`${passed} GAD list UI checks passed. Artifacts: ${output}`);
} catch (error) {
    const page = browser?.contexts()[0]?.pages()[0];
    if (page) { console.error(await page.locator('body').innerText());await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }); }
    console.error('Failure artifacts: ' + output);throw error;
} finally { if (browser) await browser.close();await server.close(); }
