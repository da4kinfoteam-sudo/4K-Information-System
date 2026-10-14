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
const screenshots = await mkdtemp(path.join(tmpdir(), '4kis-budget-schedule-ui-'));
const servePreview = process.argv.includes('--serve');
const mocks = {
    'LocationPicker': `import React from 'react'; export default function LocationPicker({value,onChange}) { return React.createElement('input',{ 'aria-label':'Fixture location',value,onChange:event=>onChange(event.target.value)}); }`,
    'supabaseClient': `export const supabase = { from(table) { let action = 'read', payload; const filters = []; const q = {
        select() { return q; }, eq(key,value) { filters.push([key,value]); return q; }, is() { return q; }, order() { return q; }, maybeSingle() { return q; }, single() { return q; },
        insert(value) { action = 'insert'; payload = value; return q; }, update(value) { action = 'update'; payload = value; return q; }, delete() { action = 'delete'; return q; },
        then(resolve) { return new Promise(done => setTimeout(() => {
            const f = window.fixture;
            if (table !== 'activities') { if (action !== 'read') { f.financialWrites = (f.financialWrites || 0) + 1; (f.financialOps ||= []).push({table,action,filters}); } return done({ data: [], error: null }); }
            if (action === 'read') return done({ data: f.latest || f.stored || f.source, error: null });
            f.writes.push({ action, payload });
            if (f.fail) return done({ data: null, error: { message: 'Synthetic save failure' } });
            f.stored = { ...f.source, ...(Array.isArray(payload) ? payload[0] : payload), id: f.source.id, serverConfirmed: true };
            done({ data: action === 'insert' ? [f.stored] : f.noRow ? null : f.stored, error: null });
        }, window.fixture.delay || 0)).then(resolve); }
    }; return q; } };`,
    'contexts/AuthContext': `const user = { id: 1, role: 'Super Admin', fullName: 'Fixture Admin', operatingUnit: 'NPMO' }; export const useAuth = () => ({ currentUser: user, hasAccess: () => !window.fixture.denied, getVisibilityScope: () => 'All' });`,
    'hooks/useDcfPolicyGuard': `export const normalizePolicyMonth = value => String(value || '').slice(0,7); export const useDcfPolicyGuard = () => ({ getStatusDecision: () => ({ allowed: !window.fixture.denied }), ensureDecisionAllowed: async decision => decision.allowed, getMonthDecision: () => ({ allowed: true }), getMonthLockMessage: () => '', isMonthSelectionAllowed: () => true });`,
    'hooks/useLogAction': `export const useLogAction = () => ({ logAction: () => {} });`,
    'hooks/useIpoHistory': `export const useIpoHistory = () => ({ addIpoHistory: async () => {} });`,
    'lib/financialObligationSync': `export const fetchFinancialObligationsForParent = async () => []; export const replaceFinancialObligationRecords = async () => { window.fixture.obligationWrites=(window.fixture.obligationWrites||0)+1; };`,
    'lib/googleDriveStorage': `export const getGoogleDriveStatus = async () => ({ connected: false }); export const listSubprojectDriveFiles = async () => []; export const formatFileSize = () => ''; export const getDriveFileDisplayName = file => file.name; export const getSubprojectDriveImageUrl = () => ''; export const deleteSubprojectDriveFile = async () => {}; export const uploadSubprojectDriveFile = async () => {}; export const updateSubprojectDriveFileMetadata = async () => {}; export const DRIVE_GALLERY_IMAGE_ACCEPT = ''; export const IPO_DRIVE_FILE_ACCEPT = ''; export const isAllowedDriveGalleryImage = () => true; export const isAllowedIpoDriveFile = () => true;`,
};
const harness = "import React, { useState } from 'react'; import { createRoot } from 'react-dom/client';\nimport { ActivityBudgetEditor } from '/components/ui/ActivityBudgetEditor.tsx';\nimport ActivityEdit from '/components/ActivityEdit.tsx'; import '/index.css'; import '/styles/main.css';\nconst refs={uacsCodes:{MOOE:{Travel:{'502':'Travel expenses','503':'Other travel'},'Training Expenses':{'504':'Training expenses'}}}};\nconst rows=[10000,20000,15000].map((amount,index)=>({id:index+1,budgetItemGroupId:'fixture-group',objectType:'MOOE',expenseParticular:'Travel',uacsCode:'502',amount,obligationMonth:['2026-01-01','2026-03-01','2026-07-01'][index],disbursementMonth:['2026-03-01','2026-05-01','2026-09-01'][index],obligations:[{id:index+20,date:'2025-12-01',amount:-100,remarks:'Fixture adjustment'}],actualObligationAmount:-100,actualObligationDate:'2025-12-01',disbursements:[{id:index+30,date:'2026-09-01',amount:200}],actualDisbursementAmount:200}));\nconst base={id:11,uid:'ACT-11',type:'Activity',name:'Subproject Monitoring',component:'Program Management',reference_activity_id:1,date:'2026-01-01',endDate:'2026-01-01',location:'Fixture location',description:'Fixture',operatingUnit:'NPMO',fundingYear:2026,fundType:'Current',tier:'Tier 1',fundSourceUid:'FS-000001',fundSource:'4K Fund',status:'Proposed',workflow_status:'APPROVED',participatingIpos:[],participating_ipo_ids:[],participantsMale:0,participantsFemale:0,expenses:rows,history:[],updated_at:'2026-10-13T00:00:00Z'};\nfunction Harness(){\n const [screen,setScreen]=useState('expenses'),[record,setRecord]=useState(base),[version,setVersion]=useState(0),[pending,setPending]=useState(false);\n window.loadFixture=(next='expenses',options={})=>{const source={...structuredClone(base),...options};window.fixture={source,writes:[],saved:[],financialWrites:0,...options};setScreen(next);setRecord(source);setVersion(value=>value+1);};\n if(!window.fixture)window.fixture={source:base,writes:[],saved:[],financialWrites:0};\n return <main className=\"form-page\" style={{maxWidth:1200,margin:'0 auto',padding:16}} key={version}>\n <nav className=\"form-action-row\" style={{marginBottom:16}} aria-label=\"Local test screens\">{[['editor','Schedule Editor'],['create','Add Activity'],['expenses','Edit Expenses'],['accomplishment','Accomplishment']].map(([key,label])=><button className=\"btn btn-secondary\" key={key} onClick={()=>window.loadFixture(key)}>{label}</button>)}</nav>\n {screen==='editor'?<><ActivityBudgetEditor items={record.expenses} parent={record} {...refs} onDraftChange={setPending} onRemove={row=>setRecord(previous=>({...previous,expenses:previous.expenses.filter(item=>item.id!==row.id)}))} onApply={rows=>{window.fixture.applies=(window.fixture.applies||0)+1;setRecord(previous=>({...previous,expenses:[...previous.expenses.filter(item=>!rows.some(row=>row.id===item.id)),...rows]}));}}/><output hidden data-pending>{String(pending)}</output></>\n :<ActivityEdit {...refs} mode={screen} activity={screen==='create'?undefined:record} ipos={[]} fundSources={[{uid:'FS-000001',label:'4K Fund',is_active:true}]} referenceActivities={[{id:1,activity_name:'Subproject Monitoring',type:'Activity',component:'Program Management'},{id:2,activity_name:'Program Management Training',type:'Training',component:'Program Management'}]} onBack={()=>{window.fixture.back=true;}} onUpdateActivity={row=>{window.fixture.saved.push(row);}}/>}\n </main>;\n}createRoot(document.getElementById('root')).render(<Harness/>);";
const server = await createServer({ configFile: false, root: process.cwd(), cacheDir: path.join(screenshots, 'node_modules', '.vite'), appType: 'custom', resolve: { alias: { '@': process.cwd() } }, server: { host: '127.0.0.1', port: servePreview ? 3015 : 0, strictPort: servePreview }, optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom/client', 'lucide-react'], entries: [] }, plugins: [{
    name: 'budget-ui-isolated', enforce: 'pre',
    resolveId(id) { if (id === '/activity-budget-harness.tsx') return '\0activity-budget-harness.tsx'; for (const key of Object.keys(mocks)) if (id.replace(/\\/g, '/').endsWith('/' + key)) return '\0mock-' + key + '.ts'; },
    load(id) { if (id === '\0activity-budget-harness.tsx') return transformWithEsbuild(harness, 'activity-budget-harness.tsx', { loader: 'tsx', jsx: 'automatic' }); for (const [key, code] of Object.entries(mocks)) if (id === '\0mock-' + key + '.ts') return code; },
    configureServer(vite) { vite.middlewares.use(async (req, res, next) => { if (req.url !== '/fixture') return next(); res.setHeader('Content-Type', 'text/html'); res.end(await vite.transformIndexHtml('/fixture', '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>4KIS Activity Budget Preview</title></head><body><div id="root"></div><script type="module" src="/activity-budget-harness.tsx"></script></body></html>')); }); },
}, react(), tailwindcss()] });
let browser;
try {
 await server.listen();
 if(servePreview){console.log('Offline Activity budget preview: http://127.0.0.1:3015/fixture');await new Promise(()=>{});}
 browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[],dialogs=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('dialog',dialog=>{dialogs.push(dialog.message());return dialog.accept();});
 await page.route('https://**',route=>route.fulfill({contentType:'application/json',body:'[]'}));
 await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/fixture');
 await page.waitForFunction(()=>typeof window.loadFixture==='function');
 await page.getByRole('button',{name:'Edit expense group 1',exact:true}).click();
 await page.getByLabel('Amount 1',{exact:true}).fill('12000');
 await page.screenshot({path:path.join(screenshots,'activity-desktop-draft.png'),fullPage:true});
 for(const width of [814,390]){
  await page.setViewportSize({width,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),true);
  await page.screenshot({path:path.join(screenshots,'activity-'+width+'-draft.png'),fullPage:true});
 }
 await page.setViewportSize({width:1440,height:1000});
 await page.getByRole('combobox',{name:'UACS Code',exact:true}).fill('invalid');
 await page.getByRole('button',{name:'Apply',exact:true}).click();
 assert.equal(await page.locator('[role=alert]').count()>0,true);
 await page.getByRole('combobox',{name:'UACS Code',exact:true}).fill('Travel expenses');
 await page.getByRole('option',{name:'502 - Travel expenses',exact:true}).click();
 await page.getByRole('button',{name:'Apply',exact:true}).click();
 await page.getByRole('button',{name:'Save Changes',exact:true}).click();
 await page.waitForFunction(()=>window.fixture.saved.length===1);
 let f=await page.evaluate(()=>window.fixture);
 assert.equal(f.writes.length,1);assert.equal(f.financialWrites,0);
 assert.equal(f.saved[0].expenses[0].amount,12000);assert.equal(f.saved[0].expenses[0].obligations[0].amount,-100);
 assert.equal(f.saved[0].expenses[0].originalPlannedAmount,10000);
 assert.equal(f.saved[0].expenses[0].disbursements[0].amount,200);
 await page.evaluate(()=>window.loadFixture('expenses',{fail:true}));
 await page.getByRole('button',{name:'Save Changes',exact:true}).click();
 await page.waitForFunction(()=>window.fixture.writes.length===1);
 assert.equal(await page.evaluate(()=>window.fixture.saved.length),0);
 await page.evaluate(()=>window.loadFixture('expenses',{delay:250}));
 await page.getByRole('button',{name:'Save Changes',exact:true}).dblclick();
 await page.waitForFunction(()=>window.fixture.saved.length===1);
 assert.equal(await page.evaluate(()=>window.fixture.writes.length),1);
 await page.evaluate(()=>window.loadFixture('expenses'));
 await page.getByRole('button',{name:'Add schedule to Travel',exact:true}).click();
 await page.getByRole('button',{name:'Save Changes',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.fixture.writes.length),0);
 const draft=page.locator('.subproject-budget-editor__draft');
 await draft.getByRole('button',{name:/Obligation month/}).click();await page.getByRole('button',{name:'Nov 2026',exact:true}).click();
 await draft.getByRole('button',{name:/Disbursement month/}).click();await page.getByRole('button',{name:'Dec 2026',exact:true}).click();
 await draft.getByRole('spinbutton').fill('5000');
 await page.getByRole('button',{name:'Apply',exact:true}).click();
 await page.getByRole('button',{name:'Save Changes',exact:true}).click();
 await page.waitForFunction(()=>window.fixture.saved.length===1);
 f=await page.evaluate(()=>window.fixture);
 assert.equal(f.saved[0].expenses.length,4);
 assert.equal(f.saved[0].expenses[3].obligationMonth,'2026-11-01');
 assert.equal(f.saved[0].expenses[3].disbursementMonth,'2026-12-01');
 assert.equal(f.financialWrites,0);
 await page.evaluate(()=>window.loadFixture('create'));
 await page.locator('select[name="component"]').selectOption('Program Management');
 await page.locator('select').filter({has:page.locator('option[value="Subproject Monitoring"]')}).selectOption('Subproject Monitoring');
 await page.locator('input[name="date"]').fill('2026-10-15');
 await page.getByRole('button',{name:'Expenses',exact:true}).click();
 await page.getByRole('button',{name:'Add Expense',exact:true}).click();
 await page.getByRole('combobox',{name:'Expense Particular',exact:true}).fill('Travel');
 await page.getByRole('option',{name:'Travel',exact:true}).click();
 await page.getByRole('combobox',{name:'UACS Code',exact:true}).fill('502');
 await page.getByRole('option',{name:'502 - Travel expenses',exact:true}).click();
 await draft.getByRole('button',{name:/Obligation month/}).click();await page.getByRole('button',{name:'Jan 2026',exact:true}).click();
 await draft.getByRole('button',{name:/Disbursement month/}).click();await page.getByRole('button',{name:'Mar 2026',exact:true}).click();
 await draft.getByRole('spinbutton').fill('2500');
 await draft.getByRole('combobox',{name:/Tag/}).selectOption('Savings');
 await draft.getByRole('textbox',{name:/Reason/}).fill('Fixture savings');
 await page.getByRole('button',{name:'Basic Info',exact:true}).click();
 assert.equal(await page.locator('.subproject-budget-editor__draft').count(),1);
 await page.getByRole('button',{name:'Apply',exact:true}).click();
 await page.getByRole('button',{name:'Basic Info',exact:true}).click();
 assert.equal(await page.locator('input[name="activity_title"]').count(),1);
 await page.getByRole('textbox',{name:'Fixture location',exact:true}).fill('Local sample location');
 await page.getByRole('button',{name:'Create Activity',exact:true}).click();
 await page.waitForFunction(()=>window.fixture.saved.length===1);
 f=await page.evaluate(()=>window.fixture);
 assert.equal(f.saved[0].expenses.length,1);assert.equal(f.saved[0].expenses[0].isSavings,true);
 assert.equal(f.financialWrites,0);assert.equal(f.writes.length,1);
 await page.evaluate(()=>window.loadFixture('expenses',{type:'Training',name:'Specific Training',reference_activity_id:2}));
 await page.getByRole('button',{name:'Edit schedule 1',exact:true}).click();
 await page.getByLabel('Amount 1',{exact:true}).fill('12500');
 await page.getByRole('button',{name:'Apply',exact:true}).click();
 await page.getByRole('button',{name:'Save Changes',exact:true}).click();
 await page.waitForFunction(()=>window.fixture.saved.length===1);
 assert.equal(await page.evaluate(()=>window.fixture.saved[0].type),'Training');
 await page.evaluate(()=>window.loadFixture('accomplishment'));
 await page.locator('.budget-record-editor--disbursement input').first().fill('250');
 await page.getByRole('button',{name:'Save Changes',exact:true}).click();
 await page.waitForFunction(()=>window.fixture.saved.length===1);
 f=await page.evaluate(()=>window.fixture);
 assert.equal(f.saved[0].expenses[0].disbursements[0].amount,250);
 assert.equal(f.saved[0].expenses[1].disbursements[0].amount,200);
 assert.equal(f.obligationWrites||0,0);
 assert.equal(f.financialOps.length,2);
 for(const op of f.financialOps)if(op.action==='delete')assert.equal(op.filters.some(([key,value])=>key==='item_id'&&value==='1'),true);
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('PASS: Activity edit save, independent schedule addition, actual preservation, failure/double-submit guards, selection-only references, creation/tag controls and responsive layouts. Screenshots: '+screenshots);
} finally {await browser?.close();await server.close();}

