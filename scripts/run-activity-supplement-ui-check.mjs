import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const require = createRequire(import.meta.url);
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || 'C:/Users/joelm/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules','playwright'));
const screenshots = await mkdtemp(path.join(tmpdir(),'4kis-supplement-ui-'));
const serve = process.argv.includes('--serve');
const mocks = {
    'contexts/AuthContext': `const user={id:1,password:'fixture-password',role:'Super Admin',fullName:'Fixture Admin',operatingUnit:'NPMO'};
        export const useAuth=()=>({currentUser:user,hasAccess:()=>!window.fixture.denied,getVisibilityScope:()=> 'All'});`,
    'hooks/useDcfPolicyGuard': `export const useDcfPolicyGuard=()=>({getStatusDecision:()=>({allowed:!window.fixture.denied,message:'Fixture policy'})});`,
    'supabaseClient': `export const supabase={async rpc(name,payload){
        const f=window.fixture;
        if(name==='read_activity_supplements'){f.reads++;await new Promise(resolve=>setTimeout(resolve,f.readDelay||0));return {data:structuredClone({activity:f.source,supplements:f.ledgers,revisions:f.revisions}),error:null};}
        f.calls.push(payload);await new Promise(resolve=>setTimeout(resolve,f.delay||0));
        if(f.fail)return {data:null,error:{message:'Synthetic failure: nothing saved'}};
        if(f.empty)return {data:null,error:null};
        if(payload.p_operation==='baseline'){
            f.source={...f.source,original_budget_snapshot:{kind:'legacy_confirmed',capturedAt:new Date().toISOString(),reason:payload.p_reason,expenses:f.source.expenses.filter(row=>!row.supplementUid&&!row.fundingOrigin&&!row.isSavings&&!row.isRealignment)},updated_at:new Date().toISOString()};
            return {data:structuredClone({activity:f.source,supplements:f.ledgers}),error:null};
        }
        if(!f.keys.includes(payload.p_request_key)){
            f.keys.push(payload.p_request_key);
            const ledger={uid:payload.p_uid,activity_id:f.source.id,source:payload.p_source,reference:payload.p_reference,authorization_date:payload.p_authorization_date,reason:payload.p_reason,status:payload.p_operation==='draft'?'DRAFT':'APPROVED',revision:1,created_by:1,updated_at:new Date().toISOString()};
            f.ledgers=[...f.ledgers.filter(item=>item.uid!==ledger.uid),ledger];
            const rows=payload.p_rows.map(row=>({...row,supplementUid:ledger.uid,fundingOrigin:'Supplemental',supplementStatus:ledger.status,supplementalSource:ledger.source,isSavings:ledger.source==='Savings',isRealignment:ledger.source==='Realignment'}));
            f.source={...f.source,expenses:[...f.source.expenses.filter(row=>row.supplementUid!==ledger.uid),...rows],updated_at:new Date().toISOString()};
        }
        return {data:structuredClone({activity:f.source,supplements:f.ledgers}),error:null};
    }};`,
};
const harness=`import React,{useState} from 'react';import{createRoot}from'react-dom/client';
import{ActivitySupplementalSection}from'/components/ui/ActivitySupplementalSection.tsx';
import{RecordDetailPage,RecordHeader,RecordPanel}from'/components/ui/RecordDetailLayout.tsx';
import{getActivityBudgetSummary}from'/lib/activitySupplementalBudget.ts';import'/index.css';import'/styles/main.css';
const uid='b8789288-2677-401a-a97b-3a168647a200';
const expense=(id,amount=1000)=>({id,amount,objectType:'MOOE',expenseParticular:'Travel',uacsCode:'502',obligationMonth:'2026-10-01',disbursementMonth:'2026-11-01'});
const base={id:100,uid:'ACT-FIXTURE',type:'Activity',name:'Supplemental Preview',status:'Ongoing',workflow_status:'APPROVED',fundingYear:2026,operatingUnit:'NPMO',expenses:[expense(1,10000),... [20,21].map(id=>({...expense(id,id===20?3000:2000),budgetItemGroupId:'supplement-group',fundingOrigin:'Supplemental',supplementUid:uid,supplementalSource:'Savings',supplementStatus:'APPROVED',isSavings:true,adjustmentReason:'Approved additional funding'}))],original_budget_snapshot:{expenses:[expense(1,10000)],kind:'initial',capturedAt:'2026-10-14'},updated_at:'2026-10-14T00:00:00Z'};
const initial=[{uid,activity_id:100,source:'Savings',reference:'Authorization letter 2026-001',authorization_date:'2026-10-14',reason:'Approved additional funding',status:'APPROVED',revision:1,created_by:1,updated_at:base.updated_at}];
function Harness(){const[record,setRecord]=useState(base),[version,setVersion]=useState(0);
window.loadFixture=(options={})=>{const source={...structuredClone(base),...options.source};window.fixture={ledgers:structuredClone(initial),revisions:[{id:1,operation:'submit',reason:'Approved additional funding',created_at:base.updated_at}],calls:[],keys:[],saved:[],reads:0,...options,source};setRecord(source);setVersion(value=>value+1);};
if(!window.fixture)window.fixture={source:structuredClone(base),ledgers:structuredClone(initial),revisions:[],calls:[],keys:[],saved:[],reads:0};
window.budgetSummary=getActivityBudgetSummary(record);
return <main style={{maxWidth:1400,margin:'0 auto',padding:16}}><RecordDetailPage key={version}><RecordHeader title={record.name}/><RecordPanel title="Budget Breakdown"><div>Original target: 10,000</div></RecordPanel>
<ActivitySupplementalSection activity={record} uacsCodes={{MOOE:{Travel:{'502':'Travel expenses'}}}} onUpdate={row=>{window.fixture.saved.push(row);setRecord(row);}}/>
<RecordPanel title="Accomplishment Report"><div>Local sample only</div></RecordPanel></RecordDetailPage></main>;}
createRoot(document.getElementById('root')).render(<Harness/>);`;
const server=await createServer({configFile:false,root:process.cwd(),cacheDir:path.join(screenshots,'node_modules','.vite'),appType:'custom',resolve:{alias:{'@':process.cwd()}},server:{host:'127.0.0.1',port:serve?3016:0,strictPort:serve},optimizeDeps:{noDiscovery:true,include:['react','react-dom/client','lucide-react'],entries:[]},plugins:[{
    name:'supplement-ui-offline',enforce:'pre',
    resolveId(id){if(id==='/supplement-harness.tsx')return '\0supplement-harness.tsx';for(const key of Object.keys(mocks))if(id.replace(/\\/g,'/').endsWith('/'+key))return '\0mock-'+key+'.ts';},
    load(id){if(id==='\0supplement-harness.tsx')return transformWithEsbuild(harness,'supplement-harness.tsx',{loader:'tsx',jsx:'automatic'});for(const[key,code]of Object.entries(mocks))if(id==='\0mock-'+key+'.ts')return code;},
    configureServer(vite){vite.middlewares.use(async(req,res,next)=>{if(req.url!=='/fixture')return next();res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml('/fixture','<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>4KIS Supplemental Preview</title></head><body><div id="root"></div><script type="module" src="/supplement-harness.tsx"></script></body></html>'));});},
},react(),tailwindcss()]});
let browser;
try{
    await server.listen();
    if(serve){console.log('Offline supplemental preview: http://127.0.0.1:3016/fixture');await new Promise(()=>{});}
    browser=await chromium.launch({channel:'msedge',headless:true});
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept('Fixture reason'));
    await page.route('https://**',route=>route.fulfill({contentType:'application/json',body:'[]'}));
    await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/fixture');
    await page.getByRole('button',{name:'Add supplement',exact:true}).waitFor();
    await page.waitForFunction(()=>window.fixture.reads===1&&window.fixture.saved.length===1);
    assert.equal(await page.evaluate(()=>window.budgetSummary.current),15000);
    assert.equal(await page.evaluate(()=>window.budgetSummary.target),10000);
    await page.getByRole('button',{name:'Add supplement',exact:true}).click();
    await page.getByLabel('Authorization Reference',{exact:true}).fill('New authorization');
    await page.getByLabel('Authorization Date',{exact:true}).fill('2026-10-14');
    await page.getByLabel('Supplement reason',{exact:true}).fill('Additional approved funding');
    const modal=page.getByRole('dialog');
    await modal.getByRole('button',{name:'Add Expense',exact:true}).click();
    await modal.getByRole('combobox',{name:'Expense Particular',exact:true}).fill('Travel');
    await page.getByRole('option',{name:'Travel',exact:true}).click();
    await modal.getByRole('combobox',{name:'UACS Code',exact:true}).fill('502');
    await page.getByRole('option',{name:'502 - Travel expenses',exact:true}).click();
    const draft=modal.locator('.subproject-budget-editor__draft');
    await draft.getByRole('button',{name:/Obligation month/}).click();
    await page.getByRole('button',{name:'Oct 2026',exact:true}).click();
    await draft.getByRole('button',{name:/Disbursement month/}).click();
    await page.getByRole('button',{name:'Nov 2026',exact:true}).click();
    await draft.getByRole('spinbutton').fill('2500');
    assert.equal(await modal.getByRole('button',{name:'Submit',exact:true}).isDisabled(),true);
    for(const width of [1440,814,390]){
        await page.setViewportSize({width,height:900});
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),true);
        const bounds=await modal.boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=width+1);
        await page.screenshot({path:path.join(screenshots,'supplement-modal-'+width+'.png'),fullPage:true});
    }
    await page.setViewportSize({width:1440,height:1000});
    await modal.getByRole('button',{name:'Apply',exact:true}).click();
    await modal.getByRole('button',{name:'Submit',exact:true}).dblclick();
    await page.waitForFunction(()=>window.fixture.calls.length===1&&window.budgetSummary.supplemental===7500);
    assert.equal(await page.getByRole('dialog').count(),0);
    assert.equal(await page.evaluate(()=>window.fixture.reads),1);
    await page.screenshot({path:path.join(screenshots,'supplement-section-desktop.png'),fullPage:true});
    await page.evaluate(()=>window.loadFixture({fail:true}));
    await page.getByRole('button',{name:/Edit supplement b878/}).click();
    await page.getByRole('dialog').getByRole('button',{name:'Submit',exact:true}).click();
    await page.getByRole('alert').last().waitFor();
    assert.equal(await page.getByRole('dialog').count(),1);
    const retryKey=await page.evaluate(()=>window.fixture.calls[0].p_request_key);
    await page.evaluate(()=>{window.fixture.fail=false;});
    await page.getByRole('dialog').getByRole('button',{name:'Submit',exact:true}).click();
    await page.waitForFunction(()=>window.fixture.calls.length===2);
    assert.equal(await page.evaluate(()=>window.fixture.calls[1].p_request_key),retryKey);
    await page.waitForFunction(()=>!document.querySelector('[role=dialog]'));
    await page.evaluate(()=>window.loadFixture());
    await page.getByRole('button',{name:'Add supplement',exact:true}).click();
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('dialog').count(),0);
    assert.equal(await page.getByRole('button',{name:'Add supplement',exact:true}).evaluate(node=>node===document.activeElement),true);
    await page.getByRole('button',{name:'Supplemental history',exact:true}).click();
    await page.getByRole('dialog',{name:'Supplemental history',exact:true}).waitFor();
    await page.keyboard.press('Escape');
    await page.evaluate(()=>window.loadFixture({source:{original_budget_snapshot:null}}));
    await page.getByRole('button',{name:'Confirm legacy original plan',exact:true}).click();
    await page.waitForFunction(()=>window.fixture.source.original_budget_snapshot?.kind==='legacy_confirmed');
    assert.equal(await page.evaluate(()=>window.fixture.ledgers.length),1);
    assert.equal(await page.evaluate(()=>window.fixture.calls[0].p_operation),'baseline');
    await page.evaluate(()=>window.loadFixture({denied:true}));
    await page.waitForFunction(()=>window.fixture.reads===1);
    assert.equal(await page.getByRole('button',{name:'Add supplement',exact:true}).isDisabled(),true);
    assert.deepEqual(errors,[]);
    console.log('PASS: real supplemental section/controls, calendar/reference popovers, Apply/Submit guards, confirmed updates, retry keys/failures, permissions, keyboard close/focus and desktop/tablet/mobile layouts. Mocked RPC only. Screenshots: '+screenshots);
}finally{if(browser)await browser.close();await server.close();}
