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
const artifacts = await mkdtemp(path.join(tmpdir(), '4kis-ipo-indicators-ui-'));
const serve = process.argv.includes('--serve');
const mocks = {
    'contexts/AuthContext': `const user={id:1,role:'Super Admin',fullName:'Sample Administrator',operatingUnit:'NPMO'};export const useAuth=()=>({currentUser:user,hasAccess:(module,action)=>action==='view'||window.fixture.canEdit,getVisibilityScope:()=> 'All'});`,
    'hooks/useLogAction': `export const useLogAction=()=>({logAction:(...args)=>window.fixture.logs.push(args)});`,
    'hooks/useIpoHistory': `const history=[];export const useIpoHistory=()=>({history,addIpoHistory:async(id,event)=>window.fixture.history.push({id,event}),refreshHistory:()=>{}});`,
    'LocationPicker': `import React from'react';export const parseLocation=()=>({province:'Sample Province',municipality:'Sample City',barangays:[]});export default function Location({value,onChange,required}){return React.createElement('input',{'aria-label':'Location',className:'form-control',value,onChange:event=>onChange(event.target.value),required})}`,
    'lib/googleDriveStorage': `export const DRIVE_GALLERY_IMAGE_ACCEPT='image/*',IPO_DRIVE_FILE_ACCEPT='*';export const formatFileSize=()=>'';export const getDriveFileDisplayName=file=>file.name||'';export const isAllowedDriveGalleryImage=()=>true,isAllowedIpoDriveFile=()=>true;export const getGoogleDriveStatus=async()=>({connected:false,configured:false});export const listIpoDriveFiles=async()=>[];export const getIpoDriveImageUrl=()=>'';export const deleteIpoDriveFile=async()=>{},uploadIpoDriveFile=async()=>{},updateIpoDriveFileMetadata=async()=>{};`,
    'supabaseClient': `export const supabase={from(table){let operation='read',payload,recordId;const query={select(){return query},order(){return query},is(){return query},in(){return query},eq(key,value){if(key==='id')recordId=value;return query},insert(value){operation='insert';payload=value;return query},update(value){operation='update';payload=value;return query},async single(){const result=await execute();return{...result,data:result.data?.[0]||null}},then(resolve,reject){return execute().then(resolve,reject)}};async function execute(){const f=window.fixture;if(operation==='read'){f.reads.push(table);return{data:table==='ipos'?f.rows:[],error:null}}if(table!=='ipos')throw Error('Unexpected write '+table);f.writes.push({operation,payload:structuredClone(payload),recordId});if(f.delay)await new Promise(resolve=>setTimeout(resolve,350));if(f.fail)return{data:null,error:{message:'Sample save failure'}};if(!f.canEdit)return{data:null,error:{message:'Sample permission denial'}};let rows;if(operation==='insert'){rows=payload.map((row,index)=>({id:Math.max(0,...f.rows.map(ipo=>ipo.id))+index+1,...row}));f.rows.push(...rows)}else{const row=f.rows.find(ipo=>ipo.id===recordId);if(!row)return{data:null,error:{message:'Missing sample IPO'}};Object.assign(row,payload);rows=[row]}localStorage.setItem('ipo-indicator-sample-rows',JSON.stringify(f.rows));return{data:structuredClone(rows),error:null}}return query}};`,
};
const harness = `import React,{useState,useEffect}from'react';import{createRoot}from'react-dom/client';import*as XLSX from'xlsx';
import IPOs from'/components/IPO.tsx';import Detail from'/components/IPODetail.tsx';import{writeScopedCache,readScopedCache,updateCachedIpos}from'/lib/localScopedCache.ts';import'/index.css';import'/styles/main.css';
window.XLSX=XLSX.default||XLSX;const empty=[],noop=()=>{},unexpected=()=>{throw Error('Already-confirmed data passed through a database-writing setter')};
const legacy={id:1,name:'Legacy IPO',location:'Sample City, Sample Province',region:'Region I (Ilocos Region)',indigenousCulturalCommunity:'Sample ICC',ancestralDomainNo:'AD-SAMPLE',registeringBody:'SEC',contactPerson:'Sample Contact',contactNumber:'',registrationDate:'2020-01-15',isWomenLed:false,isWithinGida:false,isWithinElcac:false,isWithScad:false,commodities:[],levelOfDevelopment:1,totalMembers:20,totalIpMembers:20,totalMaleMembers:8,totalFemaleMembers:12,totalYouthMembers:2,totalSeniorMembers:2,total4PsMembers:3,isF2c2Cluster:null,isFfedisRegistered:null,ffedisRegistrationNumber:null,ffedisRegistrationDate:null,workflow_status:'APPROVED'};
window.fixture={canEdit:true,fail:false,delay:false,writes:[],reads:[],confirmed:[],logs:[],history:[],rows:JSON.parse(localStorage.getItem('ipo-indicator-sample-rows')||'null')||[legacy,{...legacy,id:2,name:'Cluster IPO',isF2c2Cluster:true},{...legacy,id:3,name:'Registered IPO',isFfedisRegistered:true,ffedisRegistrationNumber:'0003-F/2026',ffedisRegistrationDate:'2026-10-20'}]};
window.makeImport=values=>{const workbook=window.XLSX.utils.book_new();window.XLSX.utils.book_append_sheet(workbook,window.XLSX.utils.json_to_sheet([{name:'Imported IPO',region:'1',province:'Sample Province',municipality:'Sample City',commodities:'[]',...values}]),'IPO Data');return Array.from(new Uint8Array(window.XLSX.write(workbook,{type:'array',bookType:'xlsx'})))};
window.checkCache=async()=>{const record=window.fixture.rows[0],scope={year:'All',operatingUnit:'All',tier:'All',fundType:'All',canViewAllOus:true,requestedBy:1},other={...scope,requestedBy:2};await writeScopedCache(scope,{ipos:[record]});await writeScopedCache(other,{ipos:[record]});await updateCachedIpos(1,[{...record,isF2c2Cluster:true}]);const cache=await readScopedCache(scope),otherCache=await readScopedCache(other);await updateCachedIpos(1,[{...record,id:999}]);return{updated:cache.ipos[0].isF2c2Cluster,otherUnchanged:otherCache.ipos[0].isF2c2Cluster===record.isF2c2Cluster,newRecordInvalidates:await readScopedCache(scope)===null}};
function Harness(){const[rows,setRows]=useState(()=>structuredClone(window.fixture.rows)),[route,setRoute]=useState(location.hash.slice(1)||'list'),[version,setVersion]=useState(0);window.refreshFixture=()=>setRows(structuredClone(window.fixture.rows));window.setPermission=value=>{window.fixture.canEdit=value;setVersion(v=>v+1)};
useEffect(()=>{const listener=()=>setRoute(location.hash.slice(1)||'list');addEventListener('hashchange',listener);return()=>removeEventListener('hashchange',listener)},[]);
const saved=confirmed=>{window.fixture.confirmed.push(...confirmed);setRows(previous=>[...new Map([...previous,...confirmed].map(row=>[row.id,row])).values()])};const id=Number(route.split('/')[1]||1);return <main style={{padding:16,maxWidth:1440,margin:'auto'}}><nav><button className="btn btn-secondary" onClick={()=>location.hash='list'}>IPO list</button></nav>{route==='list'?<IPOs ipos={rows} setIpos={unexpected} onIposSaved={saved} subprojects={empty} activities={empty} onSelectIpo={row=>location.hash='detail/'+row.id} onSelectSubproject={noop} particularTypes={{}} commodityCategories={{}} gidaAreas={empty} elcacAreas={empty}/>:<Detail key={id} ipo={rows.find(row=>row.id===id)||rows[0]} subprojects={empty} trainings={empty} monitoringActivities={empty} cachedMonitoringReports={empty} cachedMonitoringActions={empty} marketingPartners={empty} onUpdateIpo={row=>saved([row])} onSelectSubproject={noop} onSelectActivity={noop} onSelectMarketingPartner={noop} particularTypes={{}} commodityCategories={{}}/>}</main>}
createRoot(document.getElementById('root')).render(<Harness/>);`;
const server = await createServer({ configFile: false, root: process.cwd(), appType: 'custom', resolve: { alias: { '@': process.cwd() } }, cacheDir: path.join(artifacts, '.vite'), server: { host: '127.0.0.1', port: serve ? 3024 : 0, strictPort: serve }, optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom/client', 'lucide-react', 'xlsx'], entries: [] }, plugins: [{
    name: 'ipo-indicator-samples', enforce: 'pre',
    resolveId(id) { if (id === '/ipo-indicator-harness.tsx') return '\0ipo-harness'; for (const key of Object.keys(mocks)) if (id.replace(/\\/g, '/').endsWith('/' + key)) return '\0ipo-mock-' + key; },
    load(id) { if (id === '\0ipo-harness') return transformWithEsbuild(harness, 'ipo-indicator-harness.tsx', { loader: 'tsx', jsx: 'automatic' }); for (const [key, code] of Object.entries(mocks)) if (id === '\0ipo-mock-' + key) return code; },
    configureServer(vite) { vite.middlewares.use(async (request, response, next) => {
        if (request.url !== '/fixture') return next();
        response.setHeader('Content-Type', 'text/html');
        response.end(await vite.transformIndexHtml('/fixture', '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>4KIS IPO Profile Sample Preview</title></head><body><div id="root"></div><script type="module" src="/ipo-indicator-harness.tsx"></script></body></html>'));
    }); },
}, react(), tailwindcss()] });
let browser, page;
try {
    await server.listen();
    if (serve) { console.log('Sample-only IPO preview: http://127.0.0.1:3024/fixture'); await new Promise(() => {}); }
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [], alerts = [];
    page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
    page.on('dialog', async dialog => { alerts.push(dialog.message()); await dialog.accept(); });
    await page.route('https://**', route => route.abort());
    await page.addInitScript(() => { if (!localStorage.getItem('ipos_1_flagFilter')) localStorage.setItem('ipos_1_flagFilter', JSON.stringify({womenLed:false,withinGida:false,withinElcac:false,withScad:false,withSubprojects:false,withTrainings:false})); });
    await page.goto('http://127.0.0.1:' + server.httpServer.address().port + '/fixture');
    await page.getByRole('cell', { name: 'Legacy IPO', exact: true }).waitFor();
    assert.equal(await page.locator('tbody tr').count(), 3);
    const filter = async value => {
        await page.getByRole('button', { name: /^Filter/ }).click();
        await page.getByRole('dialog').getByRole('combobox', { name: 'Flags', exact: true }).selectOption(value);
        await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
    };
    await filter('F2C2 Cluster'); assert.equal(await page.locator('tbody tr').count(), 1);
    assert.match(await page.locator('tbody').innerText(), /Cluster IPO/);
    await filter('FFEDIS Registered'); assert.match(await page.locator('tbody').innerText(), /Registered IPO/);
    await page.reload(); await page.getByRole('cell', { name: 'Registered IPO', exact: true }).waitFor();
    await filter(''); await page.getByRole('cell', { name: 'Legacy IPO', exact: true }).click();
    await page.getByRole('button', { name: 'Edit IPO', exact: true }).click();
    assert.equal(await page.getByRole('checkbox', { name: 'F2C2 Cluster', exact: true }).isChecked(), false);
    await page.getByRole('textbox', { name: 'Contact Person', exact: true }).fill('Updated Contact');
    const save = async () => { await page.getByRole('button', { name: 'Save Changes', exact: true }).click(); await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm', exact: true }).click(); await page.getByRole('button', { name: 'Edit IPO', exact: true }).waitFor(); };
    await save();
    assert.deepEqual(await page.evaluate(() => Object.keys(window.fixture.writes[0].payload).sort()), ['contactPerson','updated_at']);
    assert.equal(await page.evaluate(() => window.fixture.rows[0].isFfedisRegistered), null);
    await page.getByRole('button', { name: 'Edit IPO', exact: true }).click();
    await page.getByRole('checkbox', { name: 'FFEDIS Registered', exact: true }).check();
    assert.equal(await page.getByRole('textbox', { name: 'FFEDIS Registration Number', exact: true }).getAttribute('placeholder'), null);
    await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
    assert.equal(await page.getByRole('alertdialog').count(), 0, 'Missing required FFEDIS details cannot open confirmation');
    await page.getByRole('textbox', { name: 'FFEDIS Registration Number', exact: true }).fill('000-17/F');
    await page.getByLabel('FFEDIS Registration Date', { exact: true }).fill('2026-10-26');
    await page.getByRole('checkbox', { name: 'FFEDIS Registered', exact: true }).uncheck();
    assert.equal(await page.getByRole('textbox', { name: 'FFEDIS Registration Number', exact: true }).count(), 0);
    await page.getByRole('checkbox', { name: 'FFEDIS Registered', exact: true }).check();
    assert.equal(await page.getByRole('textbox', { name: 'FFEDIS Registration Number', exact: true }).inputValue(), '000-17/F');
    await page.evaluate(() => { window.fixture.fail = true; window.fixture.delay = true; });
    await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm', exact: true }).dblclick();
    await page.waitForFunction(() => !document.querySelector('form[aria-busy="true"]'));
    assert.equal(await page.evaluate(() => window.fixture.writes.length), 2, 'Double confirm sends one request');
    assert.equal(await page.getByRole('textbox', { name: 'FFEDIS Registration Number', exact: true }).inputValue(), '000-17/F');
    assert.equal(await page.evaluate(() => window.fixture.rows[0].isFfedisRegistered), null);
    await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.evaluate(() => { window.fixture.fail = false; window.fixture.rows[0].totalMembers = 25; window.refreshFixture(); });
    assert.equal(await page.getByRole('textbox', { name: 'FFEDIS Registration Number', exact: true }).inputValue(), '000-17/F', 'Background refresh retains the open draft');
    await save();
    assert.equal(await page.evaluate(() => window.fixture.rows[0].totalMembers), 25, 'Unchanged membership is not replayed');
    await page.reload(); await page.getByText('000-17/F', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Edit IPO', exact: true }).click();
    await page.getByRole('checkbox', { name: 'FFEDIS Registered', exact: true }).uncheck(); await save();
    assert.equal(await page.evaluate(() => window.fixture.rows[0].ffedisRegistrationNumber), '000-17/F');
    assert.equal(await page.getByText('000-17/F', { exact: true }).count(), 0, 'Unregistered details are hidden, not erased');
    await page.getByRole('button', { name: 'Edit IPO', exact: true }).click();
    await page.getByRole('checkbox', { name: 'FFEDIS Registered', exact: true }).check();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.equal(await page.evaluate(() => window.fixture.rows[0].isFfedisRegistered), false);
    assert.deepEqual(await page.evaluate(() => window.checkCache()), { updated:true,otherUnchanged:true,newRecordInvalidates:true });
    await page.getByRole('button', { name: 'IPO list', exact: true }).click();
    await page.getByRole('button', { name: 'Add New IPO', exact: true }).click();
    await page.getByRole('textbox', { name: 'IPO Name', exact: true }).fill('Created IPO');
    await page.getByRole('textbox', { name: 'Location', exact: true }).fill('Sample City, Sample Province');
    await page.getByRole('checkbox', { name: 'F2C2 Cluster', exact: true }).check();
    const beforeCreate = await page.evaluate(() => window.fixture.writes.length);
    await page.evaluate(() => { window.fixture.fail = true; });
    await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('form[aria-busy="true"]'));
    assert.equal(await page.getByRole('textbox', { name: 'IPO Name', exact: true }).inputValue(), 'Created IPO');
    await page.evaluate(() => { window.fixture.fail = false; });
    await page.getByRole('button', { name: 'Save Changes', exact: true }).dblclick();
    await page.getByRole('cell', { name: 'Created IPO', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.fixture.writes.length), beforeCreate + 2, 'One failed create and one successful create, no setter reinsert');
    const binary = Buffer.from(await page.evaluate(() => window.makeImport({ isFfedisRegistered:true,ffedisRegistrationNumber:'000-EXCEL',ffedisRegistrationDate:'2026-10-26' })));
    const beforeImport = await page.evaluate(() => window.fixture.writes.length);
    await page.locator('#ipo-upload-major').setInputFiles({ name:'sample.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:binary });
    await page.getByRole('cell', { name: 'Imported IPO', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.fixture.writes.length), beforeImport + 1);
    for (const width of [1440,814,390]) {
        await page.setViewportSize({ width,height:1000 });
        await page.getByRole('cell', { name: 'Registered IPO', exact: true }).click();
        await page.getByRole('button', { name: 'Edit IPO', exact: true }).click();
        await page.getByLabel('FFEDIS Registration Number', { exact:true }).scrollIntoViewIfNeeded();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
        await page.screenshot({path:path.join(artifacts,`ipo-edit-${width}.png`)});
        await page.getByRole('button', { name:'Cancel',exact:true }).click();
        await page.locator('.ipo-profile-panel').scrollIntoViewIfNeeded();
        await page.screenshot({path:path.join(artifacts,`ipo-profile-${width}.png`)});
        await page.getByRole('button', { name:'IPO list',exact:true }).click();
    }
    await page.setViewportSize({ width:1440,height:1000 });
    await page.evaluate(() => {
        const row = window.fixture.rows[0];
        window.fixture.rows.push(...Array.from({length:12}, (_, index) => ({...row,id:100+index,name:'Pagination IPO '+index})));
        window.refreshFixture();
    });
    await page.getByRole('button', { name:'Next',exact:true }).click();
    await page.getByText('Showing 11 to 17 of 17 entries', { exact:true }).waitFor();
    await page.getByRole('button', { name:/^Filter/ }).click();
    assert.equal(await page.getByText('Showing 11 to 17 of 17 entries', { exact:true }).count(), 1, 'Opening filters retains the page');
    await page.getByRole('dialog').getByRole('button', { name:'Cancel',exact:true }).click();
    await page.getByRole('button', { name:'Previous',exact:true }).click();
    await page.evaluate(() => window.setPermission(false));
    assert.equal(await page.getByRole('button', { name:'Add New IPO',exact:true }).count(), 0);
    await page.getByRole('cell', { name:'Registered IPO',exact:true }).click();
    assert.equal(await page.getByRole('button', { name:'Edit IPO',exact:true }).count(), 0);
    assert.equal(await page.getByText('0003-F/2026',{exact:true}).count(), 1);
    assert(alerts.some(message=>message.includes('Sample save failure')));
    assert.deepEqual(errors, []);
    console.log('PASS: actual IPO create/edit/detail/filter/import UI, legacy NULL preservation, conditional validation, hidden metadata retention, failed drafts, double-submit guards, narrow confirmed saves, cache isolation, read-only access and responsive layouts. Sample-only client/Drive/location. Artifacts: '+artifacts);
} catch(error) {
    if(page){console.error('Page state:',await page.locator('body').innerText());await page.screenshot({path:path.join(artifacts,'failure.png'),fullPage:true});}
    throw error;
} finally { await browser?.close();await server.close(); }
