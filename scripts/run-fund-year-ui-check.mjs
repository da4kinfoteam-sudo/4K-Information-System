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
const artifacts = await mkdtemp(path.join(tmpdir(), '4kis-fund-year-ui-')), serve = process.argv.includes('--serve');
const harness = `import React,{useState,useRef}from'react';import{createRoot}from'react-dom/client';
import{FundYearField}from'/components/ui/FundYearField.tsx';import{ActualDatePicker}from'/components/ui/ActualDatePicker.tsx';import{MonthYearPicker}from'/components/ui/MonthYearPicker.tsx';
import{validateDcfForm}from'/lib/dcfFormDrafts.ts';import{shiftFundYearDate,getFundYearOptions}from'/lib/fundYear.ts';import'/index.css';import'/styles/main.css';
window.saved=[];function Form({options}){const[year,setYear]=useState('year'in options?options.year:new Date().getFullYear()),[date,setDate]=useState(options.date||''),[plans,setPlans]=useState(['2026-11-01','2027-02-01']),[version,setVersion]=useState(0);const saving=useRef(false);
window.state={year,date,plans};return <form onSubmit={async e=>{e.preventDefault();if(!(await validateDcfForm(e.currentTarget))||saving.current)return;saving.current=true;window.saved.push({year,date,plans});setTimeout(()=>{saving.current=false},20)}} className="form-card" style={{padding:20}}>
<div className="form-grid form-grid--four"><FundYearField name="fundYear" value={year} disabled={options.disabled} blockedReason={options.blocked} reschedule={options.reschedule} onChange={(next,move)=>{const shifted=move?plans.map(date=>shiftFundYearDate(date,next,year)):plans;setPlans(shifted);setYear(next)}}/>
<div><label className="form-label">Actual Date</label><ActualDatePicker ariaLabel="Actual Date" value={date} defaultYear={year} onChange={async value=>{await new Promise(resolve=>setTimeout(resolve,options.delay||0));if(options.fail)throw Error('Synthetic date failure');setDate(value)}}/></div>
<div><label className="form-label">Month Actual</label><MonthYearPicker ariaLabel="Month Actual" value="" defaultYear={year} onChange={value=>window.monthSelected=value}/></div>
<label>Scope Year<select aria-label="Scope Year" key={version}>{getFundYearOptions().map(year=><option key={year}>{year}</option>)}</select></label></div>
<button type="submit" className="btn btn-primary">Save</button><button type="button" className="btn btn-secondary" onClick={()=>setVersion(n=>n+1)}>Reload Choices</button></form>}
function Harness(){const[options,setOptions]=useState({}),[epoch,setEpoch]=useState(0);window.configure=next=>{setOptions(next);window.saved=[];setEpoch(n=>n+1)};return <main style={{maxWidth:1200,padding:16,margin:'0 auto'}}><h2 className="data-list-title">Fund Year Review</h2><Form key={epoch} options={options}/></main>}createRoot(document.getElementById('root')).render(<Harness/>);`;
const server = await createServer({ configFile: false, root: process.cwd(), cacheDir: path.join(artifacts, '.vite'), appType: 'custom', resolve: { alias: { '@': process.cwd() } }, server: { host: '127.0.0.1', port: serve ? Number(process.env.PORT || 3031) : 0, strictPort: serve }, optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom/client', 'lucide-react', 'date-fns'], entries: [] }, plugins: [{
    name: 'year-fixture', enforce: 'pre', resolveId(id) { if (id === '/year-harness.tsx') return '\0year-harness.tsx'; },
    load(id) { if (id === '\0year-harness.tsx') return transformWithEsbuild(harness, 'year-harness.tsx', { loader: 'tsx', jsx: 'automatic' }); },
    configureServer(vite) { vite.middlewares.use(async (req, res, next) => { if (req.url !== '/fixture') return next(); res.setHeader('Content-Type', 'text/html'); res.end(await vite.transformIndexHtml('/fixture', '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fund Year Review</title></head><body><div id="root"></div><script type="module" src="/year-harness.tsx"></script></body></html>')); }); },
}, react(), tailwindcss()] });
let browser, passed = 0;
try {
    await server.listen(); const url = 'http://127.0.0.1:' + server.httpServer.address().port + '/fixture';
    if (serve) { console.log('Sample-only Fund Year review: ' + url); await new Promise(() => {}); }
    browser = await chromium.launch({ channel: 'msedge', headless: true }); const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [], dialogs = [], external = []; page.on('pageerror', error => errors.push(error.message)); page.on('dialog', dialog => { dialogs.push(dialog.message()); return dialog.dismiss(); });
    await page.route('https://**', route => { if (!route.request().url().includes('fonts.')) external.push(route.request().url()); return route.fulfill({ contentType: 'text/css', body: '' }); });
    await page.goto(url); const year = () => page.getByRole('combobox', { name: 'Fund Year', exact: true });
    const configure = async options => { await page.evaluate(options => window.configure(options), options); await year().waitFor(); };
    const test = async (label, run) => { await run(); passed++; console.log('PASS ' + label); };
    await test('current-year default, single selection, invalid drafts and submission use latest text', async () => {
        assert.equal(await year().inputValue(), String(new Date().getFullYear()));
        for (const value of ['', '20', '0000', '20270', '2e03', '2027.0', '-2027', '2027x']) {
            await year().fill(value); await year().press('Tab'); await page.getByRole('button', { name: 'Save', exact: true }).click(); assert.equal(await page.evaluate(() => window.saved.length), 0);
        }
        await year().fill('2037'); await year().press('Enter'); await page.getByRole('button', { name: 'Save', exact: true }).click();
        await page.waitForFunction(() => window.saved.length === 1); assert.equal(await page.evaluate(() => window.saved[0].year), 2037);
        await page.getByRole('button', { name: 'Reload Choices', exact: true }).click(); assert(await page.getByRole('combobox', { name: 'Scope Year' }).locator('option[value="2037"],option').filter({ hasText: /^2037$/ }).count());
        await year().fill('2028'); await year().press('Escape'); assert.equal(await year().inputValue(), '2037');
    });
    await test('app-owned three-way dialog: no keystroke reschedule, cancel/keep/move preserve offsets and actual dates', async () => {
        await configure({ year: 2026, date: '2028-03-12', reschedule: true }); await year().fill('202'); assert.equal(await page.getByRole('alertdialog').count(), 0);
        await year().fill('2027'); await year().press('Enter'); await page.getByRole('button', { name: 'Cancel', exact: true }).click();
        assert.equal(await page.evaluate(() => window.state.year), 2026);
        await year().fill('2027'); await year().press('Enter'); await page.getByRole('button', { name: 'Keep Existing Dates', exact: true }).click();
        assert.deepEqual(await page.evaluate(() => window.state), { year: 2027, date: '2028-03-12', plans: ['2026-11-01', '2027-02-01'] });
        await year().fill('2028'); await year().press('Enter'); await page.getByRole('button', { name: 'Reschedule Planned Dates', exact: true }).click();
        assert.deepEqual(await page.evaluate(() => window.state), { year: 2028, date: '2028-03-12', plans: ['2027-11-01', '2028-02-01'] });
    });
    await test('legacy missing year remains blank on unrelated save; disabled and blocked year changes do not mutate', async () => {
        await configure({ year: null }); assert.equal(await year().inputValue(), ''); await page.getByRole('button', { name: 'Save', exact: true }).click(); await page.waitForFunction(() => window.saved.length === 1); assert.equal(await page.evaluate(() => window.saved[0].year), null);
        await configure({ year: null }); await year().fill('202'); await year().press('Escape'); await page.getByRole('button', { name: 'Save', exact: true }).click(); await page.waitForFunction(() => window.saved.length === 1); assert.equal(await page.evaluate(() => window.saved[0].year), null);
        await configure({ year: 2027, blocked: 'Apply the schedule draft first.' }); await year().fill('2028'); await year().press('Enter'); assert.equal(await page.evaluate(() => window.state.year), 2027); await page.getByRole('alert').filter({ hasText: 'Apply the schedule draft first.' }).waitFor();
        await configure({ year: 2027, disabled: true }); assert(await year().isDisabled());
    });
    await test('blank actual calendar defaults to FY without accomplishment; alternate CY persists and existing date wins', async () => {
        await configure({ year: 2028 }); await page.getByRole('button', { name: 'Open Actual Date calendar', exact: true }).click();
        assert.equal(await page.getByRole('combobox', { name: 'Actual Date year', exact: true }).inputValue(), '2028'); assert.equal(await page.evaluate(() => window.state.date), '');
        await page.getByRole('combobox', { name: 'Actual Date year', exact: true }).fill('2029'); await page.getByRole('combobox', { name: 'Actual Date year', exact: true }).press('Enter');
        await page.getByRole('combobox', { name: 'Actual Date month', exact: true }).selectOption('2'); await page.getByRole('button', { name: '2029-03-15', exact: true }).click();
        await page.waitForFunction(() => window.state.date === '2029-03-15'); await page.getByRole('button', { name: 'Open Actual Date calendar', exact: true }).click();
        assert.equal(await page.getByRole('combobox', { name: 'Actual Date year', exact: true }).inputValue(), '2029'); await page.keyboard.press('Escape');
        await page.getByRole('button', { name: 'Month Actual', exact: true }).click(); await page.getByRole('button', { name: 'Jan 2028', exact: true }).waitFor(); await page.keyboard.press('Escape');
    });
    await test('immediate save flushes async date validation once rather than saving an old state closure', async () => {
        await configure({ year: 2027, delay: 100 }); await page.getByRole('textbox', { name: 'Actual Date', exact: true }).fill('2028-02-29'); await page.getByRole('button', { name: 'Save', exact: true }).click();
        await page.waitForFunction(() => window.saved.length === 1); assert.equal(await page.evaluate(() => window.saved[0].date), '2028-02-29');
        await configure({ year: 2027 }); await page.getByRole('textbox', { name: 'Actual Date', exact: true }).fill('2027-02-29'); await page.getByRole('button', { name: 'Save', exact: true }).click(); assert.equal(await page.evaluate(() => window.saved.length), 0);
    });
    await test('mobile/tablet/desktop bounds, keyboard and no browser dialogs or runtime/network errors', async () => {
        await configure({ year: 2027, reschedule: true });
        for (const width of [1440, 820, 390, 320]) {
            await page.setViewportSize({ width, height: 1000 }); await year().fill('2028'); await year().press('Enter'); const dialog = page.getByRole('alertdialog'); await dialog.waitFor();
            const buttons = await dialog.locator('footer button').evaluateAll(elements => elements.map(button => {
                const bounds = button.getBoundingClientRect(); return { y: bounds.y, x: bounds.x, right: bounds.right, width: bounds.width, scroll: button.scrollWidth, client: button.clientWidth };
            }));
            assert.equal(buttons.length, 3); assert(buttons.every(button => Math.abs(button.y - buttons[0].y) <= 1), 'All Fund Year actions must stay on one row');
            assert(buttons.every(button => button.x >= 0 && button.right <= width + 1 && button.scroll <= button.client + 1));
            assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); await page.screenshot({ path: path.join(artifacts, 'year-dialog-' + width + '.png'), fullPage: true });
            await page.getByRole('button', { name: 'Cancel', exact: true }).click(); await page.getByRole('button', { name: 'Open Actual Date calendar', exact: true }).click();
            const box = await page.locator('.actual-date-popover').boundingBox(); assert(box.x >= 0 && box.x + box.width <= width + 1); await page.screenshot({ path: path.join(artifacts, 'actual-calendar-' + width + '.png'), fullPage: true }); await page.keyboard.press('Escape');
        }
        assert.deepEqual(dialogs, []); assert.deepEqual(errors, []); assert.deepEqual(external, []);
    });
    console.log(`${passed} shared Fund Year/date UI checks passed. Artifacts: ${artifacts}`);
} finally { if (browser) await browser.close(); await server.close(); }
