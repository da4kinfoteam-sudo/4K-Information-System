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
const output = await mkdtemp(path.join(tmpdir(), '4kis-gad-list-ui-')), serve = process.argv.includes('--serve');
const mocks = {
    constants: `export const operatingUnits=['NPMO',...Array.from({length:16},(_,i)=>'RPMO '+(i+1))];export const ouToRegionMap=Object.fromEntries(operatingUnits.map(ou=>[ou,'Region with a deliberately long location description for '+ou]));`,
    'contexts/AuthContext': `export const useAuth=()=>({currentUser:window.fixture.userId==null?null:{id:window.fixture.userId,operatingUnit:window.fixture.userOu},getVisibilityScope:()=>window.fixture.scope});`,
    supabaseClient: `let sequence=0;window.replies=new Map();export const supabase={from(table){if(table!=='gad_pimme_assessments')throw Error('Unexpected table '+table);let columns,ous,year;const q={select(value){columns=value;return q},in(key,value){if(key!=='operating_unit')throw Error(key);ous=value;return q},lte(key,value){if(key!=='year')throw Error(key);year=value;return q},then(resolve,reject){const f=window.fixture,id=++sequence;f.requests.push({id,table,columns,ous,year});const response=f.responses.shift()||{};const rows=structuredClone(response.rows||f.rows).filter(row=>ous.includes(row.operating_unit)&&row.year<=year);const finish=()=>response.throws?reject(Error(response.throws)):resolve({data:response.error?null:rows,error:response.error?{message:response.error}:null});if(response.hold)window.replies.set(id,finish);else setTimeout(finish,response.delay||0)}};return q}};`,
};
const harness = `import React,{useState}from'react';import{createRoot}from'react-dom/client';import Page from'/components/GAD/GadPimmePage.tsx';import'/index.css';import'/styles/main.css';
function defaults(){const year=new Date().getFullYear();return{userId:1,userOu:'NPMO',scope:'All OUs',rows:[{id:1,operating_unit:'NPMO',year,status:'Completed',total_score:0},{id:2,operating_unit:'RPMO 1',year,status:'Incomplete',total_score:2},{id:3,operating_unit:'NPMO',year:year-1,status:'Completed',total_score:18},{id:4,operating_unit:'RPMO 1',year:year-1,status:'Completed',total_score:0},{id:5,operating_unit:'RPMO 2',year:year-1,status:'Incomplete',total_score:1},{id:6,operating_unit:'RPMO 3',year:year-2,status:'Incomplete',total_score:0}],requests:[],responses:[],navigation:[]}}
window.fixture=defaults();function Harness(){const[epoch,setEpoch]=useState(0),[,render]=useState(0);window.configure=(options={},preferences=undefined)=>{window.fixture={...defaults(),...options};if(preferences!==undefined)localStorage.setItem('gad-pimme-list:'+window.fixture.userId,JSON.stringify(preferences));else localStorage.removeItem('gad-pimme-list:'+window.fixture.userId);setEpoch(n=>n+1)};window.identity=options=>{Object.assign(window.fixture,options);render(n=>n+1)};window.reply=id=>{window.replies.get(id)?.();window.replies.delete(id)};return <main className="app-main" style={{margin:0,padding:16}}><Page key={epoch} onSelectAssessment={(ou,year)=>window.fixture.navigation.push({ou,year})}/></main>}createRoot(document.getElementById('root')).render(<Harness/>);`;
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
        if (req.url !== '/fixture') return next();
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
    const headings = () => page.locator('thead th').allTextContents();
    const counts = () => page.locator('.gad-pimme-list-kpi > strong').allTextContents();
    const ready = async () => { await page.waitForFunction(() => document.querySelector('.gad-pimme-list-kpis')?.getAttribute('aria-busy') === 'false'); };
    const configure = async (options = {}, preferences) => { await page.evaluate(({ options, preferences }) => window.configure(options, preferences), { options, preferences });await ready(); };
    const check = async (label, run) => { await run();passed++;console.log('PASS ' + label); };
    await ready();
    await check('current-year-only defaults, summary projection and zero-score completion', async () => {
        assert.deepEqual(await headings(), ['Operating Unit', '2026']);assert.deepEqual(await counts(), ['17', '1', '1', '15']);
        assert.equal(await summary().inputValue(), '2026');assert.deepEqual(await summary().locator('option').allTextContents(), ['2026', '2025', '2024']);
        assert.equal(await rows().first().locator('td').last().innerText(), '0.00 / 20');
        const request = await page.evaluate(() => window.fixture.requests[0]);assert.equal(request.table, 'gad_pimme_assessments');assert.equal(request.columns, 'id,operating_unit,year,box16_score,box17_score,total_score,answered_count,status,updated_at');assert.equal(request.ous.length, 17);
    });
    await check('multi-year checkboxes, reset, reload persistence and keyboard menu dismissal do not refetch', async () => {
        await page.getByRole('button', { name: 'Year columns', exact: true }).click();assert(await page.getByRole('checkbox', { name: 'Show 2026' }).isDisabled());
        await page.getByRole('checkbox', { name: 'Show 2025' }).check();await page.getByRole('checkbox', { name: 'Show 2024' }).check();await page.keyboard.press('Escape');
        assert.deepEqual(await headings(), ['Operating Unit', '2026', '2025', '2024']);assert.equal(await page.evaluate(() => window.fixture.requests.length), 1);
        await page.reload();await ready();assert.deepEqual(await headings(), ['Operating Unit', '2026', '2025', '2024']);
        await page.getByRole('button', { name: 'Year columns', exact: true }).click();await page.getByRole('button', { name: 'Reset Columns' }).click();await page.locator('h1').click();
        assert.deepEqual(await headings(), ['Operating Unit', '2026']);assert.equal(await page.getByRole('checkbox', { name: 'Show 2025' }).count(), 0);
    });
    await check('historical summaries, status scope and exact row/cell keyboard navigation remain independent', async () => {
        await configure();await summary().selectOption('2025');assert.deepEqual(await counts(), ['17', '2', '1', '14']);assert.deepEqual(await headings(), ['Operating Unit', '2026']);
        await page.getByRole('combobox', { name: 'Status for 2025' }).selectOption('Completed');assert.equal(await rows().count(), 2);
        await rows().first().focus();await page.keyboard.press('Enter');await rows().first().focus();await page.keyboard.press('Space');
        await rows().first().getByRole('button', { name: 'Open NPMO GAD PIMME assessment for 2026' }).focus();await page.keyboard.press('Enter');
        assert.deepEqual(await page.evaluate(() => window.fixture.navigation), [{ ou: 'NPMO', year: 2025 }, { ou: 'NPMO', year: 2025 }, { ou: 'NPMO', year: 2026 }]);
        await page.getByRole('button', { name: 'Year columns', exact: true }).click();await page.getByRole('checkbox', { name: 'Show 2024' }).check();await page.keyboard.press('Escape');
        await rows().first().getByRole('button', { name: 'Open NPMO GAD PIMME assessment for 2024' }).click();assert.deepEqual(await page.evaluate(() => window.fixture.navigation.at(-1)), { ou: 'NPMO', year: 2024 });
        assert.equal(await page.evaluate(() => window.fixture.requests.length), 1);
    });
    await check('summary totals ignore search/status/page; summary changes reset page while columns preserve filters', async () => {
        await configure();await page.getByRole('button', { name: 'Next', exact: true }).click();assert.match(await page.getByRole('navigation', { name: 'Table pagination' }).innerText(), /2 \/ 2/);
        await page.getByRole('button', { name: 'Year columns', exact: true }).click();await page.getByRole('checkbox', { name: 'Show 2025' }).check();await page.keyboard.press('Escape');assert.match(await page.getByRole('navigation').innerText(), /2 \/ 2/);
        await summary().selectOption('2025');assert.match(await page.getByRole('navigation').innerText(), /1 \/ 2/);
        await page.getByRole('searchbox', { name: 'Search operating units' }).fill('NPMO');assert.equal(await rows().count(), 1);assert.deepEqual(await counts(), ['17', '2', '1', '14']);
        await page.getByRole('combobox', { name: 'Status for 2025' }).selectOption('Incomplete');assert.equal(await rows().count(), 0);assert.deepEqual(await counts(), ['17', '2', '1', '14']);
        await page.getByRole('button', { name: 'Year columns', exact: true }).click();await page.getByRole('button', { name: 'Reset Columns' }).click();await page.keyboard.press('Escape');assert.equal(await page.getByRole('searchbox').inputValue(), 'NPMO');
    });
    await check('legacy/malformed storage is normalized and unavailable summary year falls back only on success', async () => {
        await configure({}, { search: 'RPMO', status: 'Incomplete', page: 900, pageSize: 10, additionalYears: [2025, 2025, 2027, 'bad'], summaryYear: 2023 });
        assert.equal(await summary().inputValue(), '2026');assert.deepEqual(await headings(), ['Operating Unit', '2026', '2025']);assert.equal(await rows().count(), 1);
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
        await configure();await page.clock.setSystemTime(new Date('2029-01-01T04:00:00Z'));await page.evaluate(() => window.dispatchEvent(new Event('focus')));await ready();assert.deepEqual(await headings(), ['Operating Unit', '2029']);
        await page.getByRole('button', { name: 'Year columns', exact: true }).click();assert(await page.getByRole('checkbox', { name: 'Show 2029' }).isDisabled());await page.getByRole('checkbox', { name: 'Show 2028' }).check();await page.keyboard.press('Escape');assert.deepEqual(await headings(), ['Operating Unit', '2029', '2028']);
        await page.clock.setSystemTime(new Date('2026-11-14T04:00:00Z'));await configure();
    });
    await check('one/many-year desktop tablet mobile layouts preserve padding, nowrap, sticky OU and bounded menus', async () => {
        await configure();for (const [width, height] of [[1440, 1000], [820, 1000], [390, 844], [320, 640]]) {
            await page.setViewportSize({ width, height });await page.getByRole('button', { name: 'Year columns', exact: true }).click();await page.getByRole('button', { name: 'Reset Columns' }).click();await page.keyboard.press('Escape');
            const single = await page.locator('.gad-pimme-table').boundingBox();if (width === 1440) assert(single.width < 1500);
            await page.screenshot({ path: path.join(output, 'list-single-' + width + '.png'), fullPage: true });
            await page.getByRole('button', { name: 'Year columns', exact: true }).click();const menu = await page.locator('.gad-pimme-year-columns-menu').boundingBox();assert(menu.x >= 0 && menu.x + menu.width <= width + 1 && menu.y >= 0 && menu.y + menu.height <= height + 1);
            await page.screenshot({ path: path.join(output, 'list-menu-' + width + '.png'), fullPage: true });
            for (const year of [2025, 2024, 2023, 2022, 2021, 2020, 2019]) await page.getByRole('checkbox', { name: 'Show ' + year }).check();await page.keyboard.press('Escape');
            assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
            const dimensions = await page.locator('.gad-pimme-table-scroll').evaluate(element => ({ client: element.clientWidth, scroll: element.scrollWidth }));assert(dimensions.scroll > dimensions.client);
            const styles = await page.locator('.gad-pimme-table td').evaluateAll(elements => elements.map(element => getComputedStyle(element).whiteSpace));assert(styles.every(style => style === 'nowrap'));
            const description = page.locator('td.gad-pimme-ou-column span').first();assert(await description.getAttribute('title'));assert.equal(await description.evaluate(element => getComputedStyle(element).textOverflow), 'ellipsis');
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
