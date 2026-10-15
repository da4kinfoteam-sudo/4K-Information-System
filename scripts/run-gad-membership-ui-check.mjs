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
const screenshots = await mkdtemp(path.join(tmpdir(), '4kis-gad-membership-ui-'));
const serve = process.argv.includes('--serve');
const mocks = {
    'contexts/AuthContext': `const user={id:1,role:'Super Admin',fullName:'Fixture Admin',operatingUnit:'NPMO'};
        const hasAccess=(module)=>!window.fixture.denied?.includes(module);
        const getVisibilityScope=(module)=>window.fixture.scopes?.[module]||'All';
        export const useAuth=()=>({currentUser:user,hasAccess,getVisibilityScope});`,
    'supabaseClient': `export const supabase={from(name){window.fixture.reads.push(name);const query={select(){return query},in(){return query},gte(){return query},lte(){return Promise.resolve({data:window.fixture.pimme||[],error:null})}};return query}};`,
    'lib/gadAttributionExcel': `export const downloadGadAttributionWorkbook=async(payload)=>{window.fixture.exports.push(payload)};`,
};
const harness = `import React,{useState,useEffect}from'react';import{createRoot}from'react-dom/client';
import DashboardsPage from'/components/DashboardsPage.tsx';
import{resolveAppReturnContext,getDashboardSourceView}from'/lib/appNavigation.ts';import'/index.css';import'/styles/main.css';
const defaults={ipos:Array.from({length:24},(_,i)=>({id:i+1,name:i===0?'An exceptionally long IPO name for verifying ellipsis and native full-name tooltips without wrapped rows':'IPO '+String(i+1).padStart(2,'0'),totalMembers:100,totalMaleMembers:40,totalFemaleMembers:60,isWomenLed:i%2===0,region:'Region I'})),subprojects:Array.from({length:24},(_,i)=>({id:i+101,ipo_id:i+1,operatingUnit:i<12?'NPMO':'RPMO 1',fundingYear:2025,tier:'Tier 1',fundType:'Continuing',status:'Completed',workflow_status:'APPROVED',actualMaleBeneficiaries:i===0?30:i===1?900:null,actualFemaleBeneficiaries:i===0?70:i===1?800:null,details:[{id:i+201,particulars:'Sample budget',quantity:1,totalBudget:1000,isCompleted:true,actualDeliveryDate:i===0?'2025-08-01':'2026-08-01'}]})),activities:[{id:301,type:'Training',name:'Training',operatingUnit:'NPMO',fundingYear:2025,tier:'Tier 1',fundType:'Continuing',status:'Completed',actualDate:'2025-09-01',participantsMale:999,participantsFemale:888,actualParticipantsMale:8,actualParticipantsFemale:12,participating_ipo_ids:[1,2,1],expenses:[]},{id:302,type:'Activity',name:'Monitoring',operatingUnit:'NPMO',fundingYear:2025,tier:'Tier 1',fundType:'Continuing',status:'Completed',actualDate:'2025-09-01',actualParticipantsMale:999,actualParticipantsFemale:777,participating_ipo_ids:[1],expenses:[]}]};
function Harness(){const[version,setVersion]=useState(0),[route,setRoute]=useState(location.hash.slice(1)||'/dashboards/gad');
if(!window.fixture)window.fixture={...structuredClone(defaults),reads:[],exports:[]};
window.loadFixture=(options={})=>{window.fixture={...structuredClone(defaults),reads:[],exports:[],...options};setVersion(v=>v+1)};
useEffect(()=>{const update=()=>setRoute(location.hash.slice(1));window.addEventListener('hashchange',update);return()=>window.removeEventListener('hashchange',update)},[]);
const navigate=(value)=>{location.hash=value;setRoute(value)};
const params=new URLSearchParams(route.split('?')[1]),context=resolveAppReturnContext(params),record=window.fixture.ipos.find(ipo=>ipo.id===Number(params.get('id')));
return <main style={{maxWidth:1400,margin:'0 auto',padding:16}} key={version}>{route.startsWith('/ipo-detail')?<><button className="table-action-link" onClick={()=>navigate(context.path)}>{context.label}</button><h2>{record?.name}</h2></>:<DashboardsPage activePage="GAD" ipos={window.fixture.ipos} subprojects={window.fixture.subprojects} trainings={window.fixture.activities.filter(a=>a.type==='Training')} otherActivities={window.fixture.activities.filter(a=>a.type==='Activity')} officeReqs={[]} staffingReqs={[]} otherProgramExpenses={[]} marketingPartners={[]}
programDataLoading={window.fixture.loading} programDataError={window.fixture.error}
onSelectIpo={ipo=>{window.fixture.selected=ipo.id;navigate('/ipo-detail?id='+ipo.id+'&source=dashboard&sourceView='+getDashboardSourceView('/dashboards/gad'))}}/>}</main>}
if(!localStorage.getItem('dashboards_dcf_scope_1_applied'))localStorage.setItem('dashboards_dcf_scope_1_applied',JSON.stringify({selectedYear:'2025',selectedOu:'All',selectedTier:'Tier 1',selectedFundType:'Continuing'}));
createRoot(document.getElementById('root')).render(<Harness/>);`;
const server = await createServer({ configFile: false, root: process.cwd(), cacheDir: path.join(screenshots, 'node_modules', '.vite'), appType: 'custom',
    server: { host: '127.0.0.1', port: serve ? 3017 : 0, strictPort: serve }, optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom/client', 'lucide-react', 'recharts', 'date-fns'], entries: [] }, plugins: [{
        name: 'gad-membership-offline', enforce: 'pre',
        resolveId(id) {
            if (id === '/gad-membership-harness.tsx') return '\0gad-membership-harness.tsx';
            for (const key of Object.keys(mocks)) if (id.replace(/\\/g, '/').endsWith('/' + key)) return '\0mock-' + key + '.ts';
            if (/\.\/dashboards\//.test(id) && !id.endsWith('/GADDashboard')) return '\0unused-dashboard.ts';
        },
        load(id) {
            if (id === '\0gad-membership-harness.tsx') return transformWithEsbuild(harness, 'gad-membership-harness.tsx', { loader: 'tsx', jsx: 'automatic' });
            if (id === '\0unused-dashboard.ts') return 'export default ()=>null;';
            for (const [key, code] of Object.entries(mocks)) if (id === '\0mock-' + key + '.ts') return code;
        },
        configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
            if (req.url !== '/fixture') return next();
            res.setHeader('Content-Type', 'text/html');
            res.end(await vite.transformIndexHtml('/fixture', '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>4KIS GAD Membership Preview</title></head><body><div id="root"></div><script type="module" src="/gad-membership-harness.tsx"></script></body></html>'));
        }); },
    }, react(), tailwindcss()] });
let browser;
try {
    await server.listen();
    if (serve) { console.log('Offline GAD preview: http://127.0.0.1:3017/fixture'); await new Promise(() => {}); }
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
    await page.route('https://**', route => route.abort());
    await page.addInitScript(() => { if (!localStorage.getItem('dashboards_dcf_scope_1_applied')) localStorage.setItem('dashboards_dcf_scope_1_applied', JSON.stringify({ selectedYear: '2025', selectedOu: 'All', selectedTier: 'Tier 1', selectedFundType: 'Continuing' })); });
    await page.goto('http://127.0.0.1:' + server.httpServer.address().port + '/fixture');
    // The outer section is named through aria-label; use its scoped class for shared pagination.
    const section = page.locator('.gad-membership'), table = section.locator('table');
    const membershipPie = section.locator('.gad-sex-chart').first();
    await table.waitFor();
    assert.equal(await section.locator('.gad-dashboard-kpi strong').allTextContents().then(values => values.join(',')), '2,400,1,440,960');
    assert.equal(await table.locator('tbody tr').count(), 10);
    assert.equal(await table.locator('tfoot td').nth(4).innerText(), '24');
    assert.equal(await table.locator('tfoot td').nth(6).innerText(), '1');
    assert.equal(await table.locator('tfoot td').nth(7).innerText(), '1');
    await page.waitForFunction(() => Number.parseFloat(document.querySelector('.gad-membership-table-card .data-table-scroll')?.style.maxHeight) > 0);
    const originalTableHeight = await section.locator('.data-table-scroll').evaluate(node => node.getBoundingClientRect().height);
    await section.getByRole('button', { name: 'Next', exact: true }).click();
    assert.match(await section.locator('.data-table-pagination__full-range').innerText(), /11 to 20 of 24/);
    await section.getByRole('combobox', { name: 'Rows per page' }).selectOption('50');
    assert.equal(await table.locator('tbody tr').count(), 24);
    assert(Math.abs(await section.locator('.data-table-scroll').evaluate(node => node.getBoundingClientRect().height) - originalTableHeight) <= 2, 'Page size does not expand the IPO viewport');
    assert.equal(await section.locator('.data-table-scroll').evaluate(node => node.scrollHeight > node.clientHeight), true);
    assert.equal(await section.locator('.gad-dashboard-kpi strong').first().innerText(), '2,400');
    await page.locator('.gad-dashboard-classification-filter select').selectOption('Gender-Responsive');
    assert.equal(await table.locator('tbody tr').count(), 24, 'PIMME classification does not gate membership');
    await page.getByRole('button', { name: 'Download Excel', exact: true }).click();
    assert.equal(await page.evaluate(() => window.fixture.exports.length), 1);
    const female = section.getByRole('button', { name: /^Female: 1,440/ });
    await female.focus();
    assert.equal(await membershipPie.locator('output').innerText(), 'Female: 1,440 (60.0%)');
    assert.equal(await membershipPie.locator('output').evaluate(node => node.getBoundingClientRect().height <= 1), true, 'No duplicate visible count output');
    assert.equal(await membershipPie.locator('.gad-sex-chart__label').first().evaluate(node => getComputedStyle(node).borderWidth), '0px');
    await membershipPie.locator('.recharts-pie-sector').first().hover();
    await page.waitForFunction(() => document.querySelector('.recharts-tooltip-wrapper')?.textContent.includes('1,440'));
    assert.equal(await membershipPie.locator('.recharts-pie-sector').count(), 2);
    await page.locator('.gad-dashboard-classification-filter select').selectOption('All');
    assert.equal(await section.locator('.gad-sex-chart').count(), 3);
    const subprojectPie = section.locator('.gad-sex-chart').nth(1), trainingPie = section.locator('.gad-sex-chart').nth(2);
    assert.match(await subprojectPie.locator('.gad-sex-chart__legend').innerText(), /70 \(70\.0%\)/);
    assert.match(await subprojectPie.locator('.gad-sex-chart__legend').innerText(), /30 \(30\.0%\)/);
    assert.match(await trainingPie.locator('.gad-sex-chart__legend').innerText(), /12 \(60\.0%\)/);
    assert.match(await trainingPie.locator('.gad-sex-chart__legend').innerText(), /8 \(40\.0%\)/);
    assert.equal(await trainingPie.locator('.recharts-pie-sector').count(), 2, 'One parent contributes actual participants once, not once per IPO');
    for (const card of await page.locator('.gad-dashboard-table-card').all()) {
        const viewport = card.locator('.data-table-scroll');
        await page.waitForFunction(() => [...document.querySelectorAll('.gad-dashboard-table-card .data-table-scroll')].every(node => Number.parseFloat(node.style.maxHeight) > 0));
        const height = await viewport.evaluate(node => node.getBoundingClientRect().height);
        await card.getByRole('combobox', { name: 'Rows per page' }).selectOption('50');
        assert(Math.abs(await viewport.evaluate(node => node.getBoundingClientRect().height) - height) <= 2, 'OU viewport stays fixed when the page grows');
        assert.equal(await viewport.evaluate(node => node.scrollHeight > node.clientHeight), true);
        await viewport.evaluate(node => { node.scrollTop = node.scrollHeight; });
        assert.equal(await viewport.evaluate(node => node.scrollTop > 0), true);
        await card.getByRole('combobox', { name: 'Rows per page' }).selectOption('10');
    }
    for (const width of [1440, 814, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await section.scrollIntoViewIfNeeded();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'No page-level overflow at ' + width);
        for (const card of await page.locator('.gad-dashboard-table-card').all()) {
            const viewport = card.locator('.data-table-scroll');
            const height = await viewport.evaluate(node => node.getBoundingClientRect().height);
            await card.getByRole('combobox', { name: 'Rows per page' }).selectOption('50');
            assert(Math.abs(await viewport.evaluate(node => node.getBoundingClientRect().height) - height) <= 2, 'Fixed expanded table height at ' + width);
            assert.equal(await viewport.evaluate(node => node.scrollHeight > node.clientHeight), true);
        }
        const styles = await table.locator('tbody td').first().evaluate(node => ({ nowrap: getComputedStyle(node).whiteSpace, height: node.getBoundingClientRect().height }));
        assert.equal(styles.nowrap, 'nowrap');
        assert(styles.height > 25 && styles.height < 70);
        const tableSections = await page.locator('.gad-dashboard-table-card').evaluateAll(cards => cards.map(card => {
            const scroll = card.querySelector('.data-table-scroll'), footer = card.querySelector('.data-table-pagination');
            const sc = getComputedStyle(scroll), fc = getComputedStyle(footer), cc = getComputedStyle(card);
            const controls = footer.querySelectorAll('select, button');
            const bounds = card.getBoundingClientRect();
            return { padding: cc.padding, radius: sc.borderTopLeftRadius, leftBorder: sc.borderLeftWidth, rightBorder: sc.borderRightWidth,
                margin: fc.margin, footerPadding: parseFloat(fc.paddingLeft), bottomPadding: parseFloat(fc.paddingBottom),
                contained: [...controls].every(node => { const box = node.getBoundingClientRect(); return box.left >= bounds.left + 8 && box.right <= bounds.right - 8 && box.bottom <= bounds.bottom - 8; }) };
        }));
        assert.equal(tableSections.length, 3);
        for (const card of tableSections) {
            assert.equal(card.padding, '0px');
            assert.equal(card.radius, '0px');
            assert.equal(card.leftBorder, '0px');
            assert.equal(card.rightBorder, '0px');
            assert.equal(card.margin, '0px');
            assert(card.footerPadding >= 12 && card.bottomPadding >= 10 && card.contained, 'Pagination stays inset at ' + width);
        }
        assert.equal(await table.locator('tbody tr').first().locator('td').first().getByRole('button').getAttribute('title'), await table.locator('tbody tr').first().locator('td').first().innerText());
        await section.screenshot({ path: path.join(screenshots, 'gad-membership-' + width + '.png') });
        await page.locator('.gad-dashboard-table-card').last().screenshot({ path: path.join(screenshots, 'gad-summary-table-' + width + '.png') });
        for (const card of await page.locator('.gad-dashboard-table-card').all()) await card.getByRole('combobox', { name: 'Rows per page' }).selectOption('10');
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await table.locator('tbody td').first().click({ position: { x: 340, y: 10 } });
    assert.equal(await page.evaluate(() => window.fixture.selected), undefined, 'Cell whitespace is not a link');
    await table.locator('tbody td').first().getByRole('button').click();
    assert.match(page.url(), /ipo-detail\?id=1&source=dashboard&sourceView=gad/);
    await page.reload();
    await page.getByRole('button', { name: 'Return to GAD Dashboard', exact: true }).click();
    await table.waitFor();
    assert.equal(await page.getByLabel('Fund Year', { exact: true }).inputValue(), '2025');
    await page.getByLabel('Operating Unit', { exact: true }).selectOption('NPMO');
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.gad-membership-kpis strong')?.textContent === '1,200');
    assert.match(await section.locator('.data-table-pagination__full-range').innerText(), /1 to 10 of 12/);
    await table.locator('tbody td').first().getByRole('button').click();
    await page.reload();
    await page.getByRole('button', { name: 'Return to GAD Dashboard', exact: true }).click();
    await table.waitFor();
    assert.equal(await page.getByLabel('Operating Unit', { exact: true }).inputValue(), 'NPMO');
    assert.equal(await section.locator('.gad-dashboard-kpi strong').first().innerText(), '1,200');
    await page.evaluate(() => window.loadFixture({ denied: ['IPO Management'] }));
    await table.waitFor();
    assert.equal(await table.locator('tbody .table-action-link').count(), 0);
    await page.evaluate(() => window.loadFixture({ scopes: { 'Gender and Development': 'Own OU' } }));
    await page.waitForFunction(() => document.querySelector('.gad-membership-kpis strong')?.textContent === '1,200');
    await page.evaluate(() => window.loadFixture({ scopes: { Dashboards: 'Own OU' } }));
    await page.waitForFunction(() => document.querySelector('.gad-membership-kpis strong')?.textContent === '1,200');
    assert.equal(await page.getByLabel('Operating Unit', { exact: true }).isDisabled(), true);
    await page.evaluate(() => window.loadFixture({ ipos: [{ ...window.fixture.ipos[0], totalMembers: 2 }, { ...window.fixture.ipos[1], totalMembers: 10 }] }));
    await table.waitFor();
    await table.getByRole('button', { name: 'Total Members, not sorted', exact: true }).click();
    assert.equal(await table.locator('tbody td').nth(1).innerText(), '2', 'Numeric sorting is not lexicographic');
    await table.getByRole('button', { name: 'Total Members, sorted ascending', exact: true }).click();
    assert.equal(await table.locator('tbody td').nth(1).innerText(), '10');
    await page.evaluate(() => window.loadFixture({ ipos: window.fixture.ipos.map(ipo => ({ ...ipo, totalMaleMembers: null })) }));
    await table.waitFor();
    await section.getByRole('button', { name: /^Male: No Data/ }).focus();
    assert.equal(await membershipPie.locator('output').innerText(), 'Male: No Data');
    await page.evaluate(() => window.loadFixture({ error: 'Synthetic scoped load failure' }));
    await page.getByRole('alert').filter({ hasText: 'Synthetic scoped load failure' }).waitFor();
    assert.equal(await section.count(), 0);
    const touchContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const touch = await touchContext.newPage();
    await touch.addInitScript(() => localStorage.setItem('dashboards_dcf_scope_1_applied', JSON.stringify({ selectedYear: '2025', selectedOu: 'All', selectedTier: 'Tier 1', selectedFundType: 'Continuing' })));
    await touch.route('https://**', route => route.abort());
    await touch.goto('http://127.0.0.1:' + server.httpServer.address().port + '/fixture');
    await touch.locator('.gad-membership').getByRole('button', { name: /^Male: 960/ }).tap();
    assert.equal(await touch.locator('.gad-sex-chart').first().locator('output').innerText(), 'Male: 960 (40.0%)');
    await touch.locator('.gad-membership .recharts-pie-sector').first().tap();
    assert.equal(await touch.locator('.gad-sex-chart').first().locator('output').innerText(), 'Female: 1,440 (60.0%)');
    assert.equal(await touch.locator('.gad-sex-chart__label').first().evaluate(node => node.getBoundingClientRect().height >= 44), true);
    await touchContext.close();
    await page.evaluate(() => window.loadFixture({ loading: true }));
    await page.getByText('Loading IPO membership', { exact: true }).waitFor();
    assert.equal(await section.count(), 0);
    await page.evaluate(() => window.loadFixture({ ipos: window.fixture.ipos.map(ipo => ({ ...ipo, totalMembers: null, totalMaleMembers: null, totalFemaleMembers: null })) }));
    await table.waitFor();
    assert.equal(await section.locator('.gad-dashboard-kpi strong').first().innerText(), 'No Data');
    assert.equal(await membershipPie.locator('.recharts-pie-sector').count(), 0);
    await page.evaluate(() => window.loadFixture({ ipos: window.fixture.ipos.map(ipo => ({ ...ipo, totalMembers: 0, totalMaleMembers: 0, totalFemaleMembers: 0 })) }));
    await table.waitFor();
    assert.equal(await section.locator('.gad-dashboard-kpi strong').first().innerText(), '0');
    assert.equal(await membershipPie.locator('.recharts-pie-sector').count(), 0);
    await page.evaluate(() => window.loadFixture({ subprojects: [], activities: [] }));
    await table.waitFor();
    assert.equal(await table.locator('tbody tr').count(), 1);
    assert.match(await table.locator('tbody').innerText(), /No targeted IPOs/);
    assert.match(await section.locator('.data-table-pagination__full-range').innerText(), /0 to 0 of 0/);
    await page.evaluate(() => window.loadFixture({ denied: ['Gender and Development'] }));
    await page.getByText('You need both Dashboard and Gender and Development view access to open this dashboard.').waitFor();
    assert.equal(await section.count(), 0);
    await page.evaluate(() => window.loadFixture({ denied: ['Dashboards'] }));
    await page.getByText('You need both Dashboard and Gender and Development view access to open this dashboard.').waitFor();
    assert.equal(await section.count(), 0);
    const app = await readFile('App.tsx', 'utf8'), dashboards = await readFile('components/DashboardsPage.tsx', 'utf8');
    assert.match(app, /onSelectIpo=\{handleSelectIpo\}/);
    assert.match(app, /navigateTo\(buildContextualRecordPath\('\/ipo-detail', ipo.id, origin\)\)/);
    assert.match(dashboards, /<GADDashboard[\s\S]*?onSelectIpo=\{props.onSelectIpo\}/);
    assert.deepEqual(errors, []);
    console.log('PASS: real GAD/dashboard filters and membership UI, aggregate/card/table consistency, pagination, classification independence, chart hover/focus, responsive no-wrap tables, name-only links, contextual return/refresh/filter contract, permissions and loading/error/unknown states. Mocked source data only. Screenshots: ' + screenshots);
} finally { if (browser) await browser.close(); await server.close(); }
