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
const serve = process.argv.includes('--serve');
const artifacts = await mkdtemp(path.join(tmpdir(), '4kis-activity-repeating-ui-'));
assert.match(await readFile('App.tsx','utf8'), /activity=\{effectiveEditMode === 'create' \? undefined : routeActivity \|\| undefined\}/, 'Creation must not receive the selected activity after a confirmed row callback');
// All client/auth/location/history dependencies are replaced; no production session or network data.
const mocks = {
    supabaseClient: `export const supabase = { async rpc(name){if(name==='budget_target_schedule_capability')return{data:2,error:null};throw Error('Unexpected RPC '+name);}, from(table) {
        let action='read',payload; const filters=[];
        const query={select(){return query;},eq(key,value){filters.push([key,value]);return query;},maybeSingle(){return query;},single(){return query;},
            insert(value){action='insert';payload=value[0];return query;},
            then(resolve,reject){const f=window.fixture;return new Promise(done=>setTimeout(()=>{
                f.calls.push({table,action,payload,filters});
                if(action==='read') { const uid=filters.find(([key])=>key==='uid')?.[1]; return done({data:f.hideRecovery?null:f.rows.find(row=>row.uid===uid)||null,error:f.failRead?{message:'Synthetic recovery failure'}:null}); }
                f.insertCount++;
                if(f.failureOn===f.insertCount) return done({data:null,error:{code:'23514',message:'Synthetic rejected insert'}});
                const row={...payload,id:500+f.insertCount};
                if(f.uncertainOn!==f.insertCount||f.uncertainCommit) f.rows.push(row);
                if(f.uncertainOn===f.insertCount) return done({data:null,error:{message:'Synthetic network timeout'}});
                return done({data:f.noRow?[]:[row],error:null});
            },f.delay||0)).then(resolve,reject);}
        };return query;
    } };`,
    'contexts/AuthContext': `export const useAuth=()=>({currentUser:window.fixture.actor,hasAccess:()=>!window.fixture.denied,getVisibilityScope:()=>window.fixture.scope||'All'});`,
    'hooks/useDcfPolicyGuard': `export const normalizePolicyMonth=value=>String(value||'').slice(0,7);export const useDcfPolicyGuard=()=>({getStatusDecision:()=>({allowed:!window.fixture.denied}),getMonthDecision:()=>({allowed:true}),getMonthLockMessage:()=>'',isMonthSelectionAllowed:()=>true,ensureDecisionAllowed:async decision=>decision.allowed});`,
    'hooks/useLogAction': `export const useLogAction=()=>({logAction:async (...args)=>{window.fixture.logs.push(args);if(window.fixture.failLog)throw new Error('Synthetic log failure');}});`,
    'hooks/useIpoHistory': `export const useIpoHistory=()=>({addIpoHistory:async (...args)=>{window.fixture.history.push(args);if(window.fixture.failHistory)throw new Error('Synthetic history failure');}});`,
    'LocationPicker': `import React from 'react';export default function LocationPicker({value,onChange}){return React.createElement('input',{'aria-label':'Location',className:'form-control',value,onChange:event=>onChange(event.target.value)});}`,
};
const harness = `import React,{useState}from 'react';import{createRoot}from'react-dom/client';import ActivityEdit from'/components/ActivityEdit.tsx';import{philippineRegions}from'/constants.tsx';import'/index.css';import'/styles/main.css';
const ipos=[{id:11,name:'Original IPO',region:philippineRegions[0]},{id:22,name:'Replacement IPO with a long organization name for responsive truncation',region:philippineRegions[1]}];
const references=[{id:1,activity_name:'Subproject Monitoring',component:'Program Management',type:'Activity'},{id:2,activity_name:'Program Management Training',component:'Program Management',type:'Training'}];
const defaultActor={id:1,role:'Super Admin',fullName:'Fixture Administrator',operatingUnit:'NPMO'};
const base={id:91,uid:'ACT-OLD',type:'Activity',name:'Subproject Monitoring',component:'Program Management',reference_activity_id:1,status:'Proposed',operatingUnit:'NPMO',fundingYear:2026,fundType:'Current',tier:'Tier 1',fundSourceUid:'FS-000001',fundSource:'4K Fund',date:'2026-01-01',endDate:'2026-01-01',location:'Fixture',expenses:[],participatingIpos:[],participating_ipo_ids:[],participantsMale:0,participantsFemale:0};
function reset(options={}){window.fixture={scope:'All',rows:[],calls:[],saved:[],history:[],logs:[],insertCount:0,mode:'create',...options,actor:{...defaultActor,...options.actor}};}
reset();function Harness(){const[version,setVersion]=useState(0);const[revision,setRevision]=useState(0);const[selected,setSelected]=useState(base);window.loadFixture=(options={})=>{reset(options);setSelected(base);setVersion(value=>value+1);};window.changeActor=(actor,scope)=>{Object.assign(window.fixture.actor,actor);window.fixture.scope=scope;setRevision(value=>value+1);};
return <main className="repeating-fixture" style={{maxWidth:1200,margin:'0 auto',padding:16,minWidth:0}}><ActivityEdit key={version} mode={window.fixture.mode} activity={window.fixture.mode==='create'?undefined:selected} ipos={ipos} onBack={()=>{window.fixture.back=true;}} onUpdateActivity={row=>{window.fixture.saved.push(row);setSelected(row);}} uacsCodes={{MOOE:{Travel:{'502':'Travel'}}}} referenceActivities={references} fundSources={[{id:1,uid:'FS-000001',label:'4K Fund',is_active:true,sort_order:0},{id:2,uid:'FS-2',label:'Corn',is_active:true,sort_order:1}]} /></main>;}
createRoot(document.getElementById('root')).render(<Harness/>);`;
const server = await createServer({ configFile:false, root:process.cwd(), cacheDir:path.join(artifacts,'.vite'), appType:'custom',
    resolve:{alias:{'@':process.cwd()}},
    server:{host:'127.0.0.1',port:serve?Number(process.env.FOURKIS_PREVIEW_PORT||3026):0,strictPort:true,hmr:serve},
    optimizeDeps:{noDiscovery:true,include:['react','react-dom/client','lucide-react'],entries:[]},
    plugins:[{name:'repeating-fixture',enforce:'pre',resolveId(source){
        if(source==='/repeating-harness.tsx')return '\0repeating-harness.tsx';
        for(const key of Object.keys(mocks))if(source.replace(/\\/g,'/').endsWith('/'+key))return '\0repeating-mock-'+key;
    },load(id){if(id==='\0repeating-harness.tsx')return transformWithEsbuild(harness,'repeating-harness.tsx',{loader:'tsx',jsx:'automatic'});
        for(const[key,code]of Object.entries(mocks))if(id==='\0repeating-mock-'+key)return code;
    },configureServer(vite){vite.middlewares.use(async(request,response,next)=>{if(request.url!=='/fixture')return next();response.setHeader('Content-Type','text/html');response.end(await vite.transformIndexHtml('/fixture','<html><meta name="viewport" content="width=device-width,initial-scale=1"><body><div id="root"></div><script type="module" src="/repeating-harness.tsx"></script></body></html>'));});}},react(),tailwindcss()],
});
let browser;
try {
    await server.listen();
    if(serve){console.log('Synthetic repeating Activity/Training preview: '+server.resolvedUrls.local[0]+'fixture');await new Promise(()=>{});}
    browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'msedge',headless:true});
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    const errors=[],dialogs=[];let acceptConfirm=true;
    page.on('pageerror',error=>errors.push(error.message));
    page.on('dialog',async dialog=>{dialogs.push(dialog.message());if(dialog.type()==='confirm'&&!acceptConfirm)await dialog.dismiss();else await dialog.accept();});
    await page.goto(server.resolvedUrls.local[0]+'fixture');
    await page.waitForFunction(()=>typeof window.loadFixture==='function').catch(async error=>{console.log('Fixture startup diagnostics:',errors,await page.locator('body').innerText());throw error;});
    const queue=()=>page.locator('.activity-repeating-table tbody tr').filter({has:page.locator('button')});
    const typeSelect=()=>page.locator('select').filter({has:page.locator('option[value="Subproject Monitoring"]')});
    const conduct=()=>page.locator('select').filter({has:page.locator('option[value="Repeating"]')});
    const reset=async(options={})=>{await page.evaluate(options=>window.loadFixture(options),options);await page.locator('input[name="activity_title"]').waitFor();};
    const setup=async({training=false,repeating=true}={})=>{
        await page.locator('select[name="component"]').selectOption('Program Management');
        await typeSelect().selectOption(training?'Program Management Training':'Subproject Monitoring');
        if(training)await page.locator('input[name="name"]').fill('Specific Training');
        await page.getByRole('textbox',{name:'Location',exact:true}).fill('Fixture location');
        if(repeating)await conduct().selectOption('Repeating');
    };
    const add=async(date='2027-01-03',ipo='11')=>{
        await page.getByLabel('Start Date',{exact:true}).fill(date);
        await page.getByLabel('Male',{exact:true}).fill('3');await page.getByLabel('Female',{exact:true}).fill('4');
        await page.locator('.activity-ipo-selector__filters select').selectOption('All');
        await page.getByLabel('Available IPOs',{exact:true}).selectOption([ipo]);await page.getByRole('button',{name:'Add',exact:true}).click();
        await page.getByRole('button',{name:'Add to Schedule',exact:true}).click();
    };
    const submit=async()=>{await page.getByRole('button',{name:'Create Activity',exact:true}).click();};
    const snapshot=()=>page.evaluate(()=>({rows:window.fixture.rows,saved:window.fixture.saved,calls:window.fixture.calls,back:window.fixture.back,history:window.fixture.history,logs:window.fixture.logs}));

    await setup();
    assert.equal(await page.locator('input[name="fundingYear"]').isVisible(),true);
    assert.equal(await page.locator('select[name="operatingUnit"]').isEnabled(),true);
    await add();await add('2027-03-04','22');assert.equal(await queue().count(),2);
    assert.match(await queue().nth(1).innerText(),/Replacement IPO/);
    assert.match(await queue().nth(1).locator('[title]').first().getAttribute('title')||'',/./);
    await page.getByRole('button',{name:'Edit schedule entry 1',exact:true}).click();
    assert.equal(await page.getByLabel('Start Date',{exact:true}).inputValue(),'2027-01-03');
    assert.match(await page.locator('.activity-ipo-selector__table').innerText(),/Original IPO/);
    await page.getByLabel('Male',{exact:true}).fill('20');await page.getByRole('button',{name:'Cancel Edit',exact:true}).click();
    assert.match(await queue().first().innerText(),/\b3\b/);
    await page.getByRole('button',{name:'Edit schedule entry 1',exact:true}).click();
    await page.getByLabel('Start Date',{exact:true}).fill('2027-01-06');
    await page.getByRole('button',{name:'Remove Original IPO',exact:true}).click();
    await page.locator('.activity-ipo-selector__filters select').selectOption('All');
    await page.getByLabel('Available IPOs',{exact:true}).selectOption(['22']);await page.getByRole('button',{name:'Add',exact:true}).click();
    await page.getByRole('button',{name:'Update Entry',exact:true}).click();
    assert.equal(await queue().count(),2);assert.match(await queue().first().innerText(),/2027-01-06/);
    assert.doesNotMatch(await queue().first().innerText(),/Original IPO/);
    await page.getByRole('button',{name:'Remove schedule entry 2',exact:true}).click();assert.equal(await queue().count(),1);
    await page.getByRole('button',{name:'Expenses',exact:true}).click();await page.getByRole('button',{name:'Basic Info',exact:true}).click();assert.equal(await queue().count(),1);
    acceptConfirm=false;await conduct().selectOption('Single');assert.equal(await conduct().inputValue(),'Repeating');assert.equal(await queue().count(),1);acceptConfirm=true;
    await page.getByLabel('Start Date',{exact:true}).fill('2027-04-01');await submit();assert.equal((await snapshot()).calls.length,0);
    await page.getByRole('alert').waitFor().catch(async error=>{console.log('Unapplied draft diagnostics:',dialogs,await page.evaluate(()=>({state:window.fixture,controls:[...document.querySelectorAll('input,select')].map(node=>({name:node.name,value:node.value,valid:node.validity.valid,validation:node.validationMessage}))})));throw error;});
    assert.match(await page.getByRole('alert').innerText(),/Apply or discard/);await page.getByRole('button',{name:'Discard Entry',exact:true}).click();
    await page.getByRole('button',{name:'Edit schedule entry 1',exact:true}).click();await submit();assert.equal((await snapshot()).calls.length,0);await page.getByRole('button',{name:'Cancel Edit',exact:true}).click();
    await page.locator('input[name="fundingYear"]').fill('2027');await page.locator('select[name="fundType"]').selectOption('Continuing');await page.locator('select[name="tier"]').selectOption('Tier 2');
    await page.locator('select[name="operatingUnit"]').selectOption('RPMO 1');
    await page.locator('select').filter({has:page.locator('option[value="FS-2"]')}).selectOption('FS-2');
    await add('2027-06-02','11');await submit();await page.waitForFunction(()=>window.fixture.saved.length===2);
    let result=await snapshot();assert.equal(result.back,true);assert.equal(result.rows.length,2);
    for(const row of result.rows){assert.equal(row.fundingYear,2027);assert.equal(row.fundType,'Continuing');assert.equal(row.tier,'Tier 2');assert.equal(row.fundSourceUid,'FS-2');assert.equal(row.operatingUnit,'RPMO 1');assert.equal(row.workflow_status,'APPROVED');}
    assert.deepEqual(result.rows.map(row=>row.participating_ipo_ids),[[22],[11]]);assert.equal(new Set(result.rows.map(row=>row.uid)).size,2);

    await reset();await setup({training:true});await add();await add('2027-04-01','22');await submit();await page.waitForFunction(()=>window.fixture.saved.length===2);
    result=await snapshot();assert.ok(result.rows.every(row=>row.type==='Training'&&row.name==='Specific Training'&&row.uid.startsWith('TRN-')));
    await reset({actor:{requires_approver:true}});await setup();await add();await submit();await page.waitForFunction(()=>window.fixture.saved.length===1);assert.equal((await snapshot()).rows[0].workflow_status,'PENDING');

    await reset();await setup();await page.getByRole('button',{name:'Add to Schedule',exact:true}).click();assert.match(await page.getByRole('alert').innerText(),/Start Date/);
    await page.getByLabel('Start Date',{exact:true}).fill('2027-01-03');await page.getByLabel('Is Multi-day?',{exact:true}).check();
    await page.getByLabel('End Date',{exact:true}).fill('');
    await page.getByRole('button',{name:'Add to Schedule',exact:true}).click();assert.match(await page.getByRole('alert').innerText(),/End Date/);
    await page.getByLabel('End Date',{exact:true}).fill('2027-01-02');await page.getByRole('button',{name:'Add to Schedule',exact:true}).click();assert.match(await page.getByRole('alert').innerText(),/End Date/);
    await page.getByLabel('End Date',{exact:true}).fill('2027-01-09');await page.getByLabel('Is Multi-day?',{exact:true}).uncheck();
    await page.getByLabel('Male',{exact:true}).fill('-1');await page.getByRole('button',{name:'Add to Schedule',exact:true}).click();assert.match(await page.getByRole('alert').innerText(),/whole numbers/);
    await page.getByLabel('Male',{exact:true}).fill('0.5');await page.getByRole('button',{name:'Add to Schedule',exact:true}).click();assert.match(await page.getByRole('alert').innerText(),/whole numbers/);
    await page.getByLabel('Male',{exact:true}).fill('0');await page.getByRole('button',{name:'Add to Schedule',exact:true}).click();assert.match(await queue().first().innerText(),/2027-01-03/);
    const dates=await queue().first().locator('td').allTextContents();assert.equal(dates[2],dates[3]);

    await reset({actor:{role:'Management',operatingUnit:'RPMO 1'},scope:'Own OU'});await setup();assert.equal(await page.locator('select[name="operatingUnit"]').isDisabled(),true);
    await page.evaluate(()=>window.changeActor({role:'Management'},'All'));assert.equal(await page.locator('select[name="operatingUnit"]').isEnabled(),true);
    await page.locator('select[name="operatingUnit"]').selectOption('RPMO 2');await page.evaluate(()=>window.changeActor({role:'Management'},'Own OU'));
    assert.equal(await page.locator('select[name="operatingUnit"]').inputValue(),'RPMO 1');await add();await submit();await page.waitForFunction(()=>window.fixture.saved.length===1);assert.equal((await snapshot()).rows[0].operatingUnit,'RPMO 1');
    await reset({actor:{role:'Management',operatingUnit:''},scope:'Own OU'});await setup();await add();await submit();assert.equal((await snapshot()).calls.length,0);assert.match(dialogs.at(-1),/Operating Unit/);
    await reset({denied:true,actor:{role:'Guest'}});assert.equal(await page.locator('select[name="operatingUnit"]').isDisabled(),true);
    await page.evaluate(()=>document.querySelector('form').requestSubmit());assert.equal((await snapshot()).calls.length,0);
    await reset({mode:'details',actor:{role:'Management',operatingUnit:'RPMO 1'},scope:'Own OU'});
    await page.getByRole('button',{name:'Save Changes',exact:true}).click();assert.equal((await snapshot()).calls.length,0);assert.match(dialogs.at(-1),/outside your allowed Operating Unit/);

    await reset({failureOn:2});await setup();await add();await add('2027-03-04','22');await submit();await page.waitForFunction(()=>window.fixture.saved.length===1);
    await page.getByRole('alert').waitFor();assert.equal(await queue().count(),1);assert.equal((await snapshot()).back,undefined);
    await page.getByRole('button',{name:'Edit schedule entry 1',exact:true}).click();await page.getByLabel('Female',{exact:true}).fill('8');await page.getByRole('button',{name:'Update Entry',exact:true}).click();
    await submit();await page.waitForFunction(()=>window.fixture.saved.length===2);result=await snapshot();assert.equal(result.rows.length,2);assert.equal(result.calls.filter(call=>call.action==='insert').length,3);assert.equal(result.rows[1].participantsFemale,8);

    await reset({uncertainOn:2,uncertainCommit:true,hideRecovery:true});await setup();await add();await add('2027-04-04','22');await submit();await page.getByRole('alert').waitFor();
    assert.equal(await queue().count(),1);assert.equal(await page.getByRole('button',{name:'Remove schedule entry 1',exact:true}).isDisabled(),true);
    await page.getByRole('button',{name:'Check Saved Entry',exact:true}).click();assert.match(await page.getByRole('alert').innerText(),/not confirmed/);assert.equal((await snapshot()).calls.filter(call=>call.action==='insert').length,2);
    await page.evaluate(()=>{window.fixture.hideRecovery=false;});await page.getByRole('button',{name:'Check Saved Entry',exact:true}).click();await page.waitForFunction(()=>window.fixture.saved.length===2);
    result=await snapshot();assert.equal(result.rows.length,2);assert.equal(result.calls.filter(call=>call.action==='insert').length,2);assert.equal(result.back,true);
    await reset({uncertainOn:1,uncertainCommit:false});await setup();await add();await submit();await page.getByRole('alert').waitFor();await page.getByRole('button',{name:'Check Saved Entry',exact:true}).click();assert.equal((await snapshot()).calls.filter(call=>call.action==='insert').length,1);

    await reset({failHistory:true});await setup();await add();await add('2027-05-04','22');await submit();await page.waitForFunction(()=>window.fixture.saved.length===2);assert.equal((await snapshot()).rows.length,2);assert.equal((await snapshot()).back,true);assert.match(dialogs.at(-1),/History follow-up/);
    await reset({delay:250});await setup();await add();await page.evaluate(()=>{const form=document.querySelector('form');form.requestSubmit();form.requestSubmit();});await page.waitForFunction(()=>window.fixture.saved.length===1);assert.equal((await snapshot()).rows.length,1);

    for(const multi of [false,true]){await reset();await setup({repeating:false});if(multi)await conduct().selectOption('Multi-day');await page.locator('input[name="date"]').fill('2027-01-03');if(multi)await page.locator('input[name="endDate"]').fill('2027-01-06');await submit();await page.waitForFunction(()=>window.fixture.saved.length===1);result=await snapshot();assert.equal(result.rows[0].endDate,multi?'2027-01-06':'2027-01-03');}

    await reset();await setup();await add();await add('2027-07-03','22');await page.locator('input[name="fundingYear"]').fill('2027');
    await page.getByRole('button',{name:'Expenses',exact:true}).click();await page.getByRole('button',{name:'Add Expense',exact:true}).click();
    const budgetDraft=page.locator('.subproject-budget-editor__draft');
    await page.getByRole('combobox',{name:'Expense Particular',exact:true}).fill('Travel');await page.getByRole('option',{name:'Travel',exact:true}).click();
    await page.getByRole('combobox',{name:'UACS Code',exact:true}).fill('502');await page.getByRole('option',{name:'502 - Travel',exact:true}).click();
    await budgetDraft.getByRole('spinbutton').fill('2500');
    const addTarget=async(stage,month,amount)=>{
        await budgetDraft.getByRole('button',{name:'Add '+stage+' Target',exact:true}).click();
        await budgetDraft.getByRole('button',{name:new RegExp(stage+' target month')}).last().click();
        await page.getByRole('button',{name:month,exact:true}).click();
        await budgetDraft.getByLabel(new RegExp(stage+' target amount')).last().fill(String(amount));
    };
    await addTarget('Obligation','Jan 2027',2000);await addTarget('Obligation','Apr 2027',500);
    await addTarget('Disbursement','Mar 2027',1500);await addTarget('Disbursement','Jun 2027',500);await addTarget('Disbursement','Sep 2027',500);
    await page.getByRole('button',{name:'Apply',exact:true}).click();
    await submit();await page.waitForFunction(()=>window.fixture.saved.length===2);result=await snapshot();
    for(const row of result.rows){
        assert.equal(row.expenses.length,1);assert.equal(row.expenses[0].amount,2500);
        assert.deepEqual(row.expenses[0].targetObligationSchedules.map(entry=>[entry.amount,entry.month]),[[2000,'2027-01-01'],[500,'2027-04-01']]);
        assert.deepEqual(row.expenses[0].targetDisbursementSchedules.map(entry=>[entry.amount,entry.month]),[[1500,'2027-03-01'],[500,'2027-06-01'],[500,'2027-09-01']]);
    }
    assert.equal(new Set(result.rows.flatMap(row=>row.expenses.map(expense=>expense.id))).size,2);
    assert.equal(new Set(result.rows.flatMap(row=>row.expenses.flatMap(expense=>[...expense.targetObligationSchedules,...expense.targetDisbursementSchedules].map(entry=>entry.id)))).size,10);
    assert.notEqual(result.rows[0].expenses[0].budgetItemGroupId,result.rows[1].expenses[0].budgetItemGroupId);
    await reset();await setup();await add();await add('2027-03-04','22');
    for(const width of [1440,814,390]){
        await page.setViewportSize({width,height:1000});await page.locator('.activity-repeating-table').scrollIntoViewIfNeeded();
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`page overflow at ${width}`);
        assert.equal(await page.locator('.activity-repeating-table').evaluate(node=>node.scrollWidth>node.clientWidth),true);
        const wraps=await page.locator('.activity-repeating-table th').evaluateAll(nodes=>nodes.every(node=>getComputedStyle(node).whiteSpace==='nowrap'));assert.equal(wraps,true);
        await page.screenshot({path:path.join(artifacts,`repeating-${width}.png`),fullPage:true});
        await page.locator('.activity-repeating-table').evaluate(node=>{node.scrollLeft=node.scrollWidth;});
        const actionsFit=await page.locator('.activity-repeating-table__row-actions').evaluateAll(nodes=>nodes.every(node=>{
            const cell=node.closest('td').getBoundingClientRect();return [...node.querySelectorAll('button')].every(button=>{const box=button.getBoundingClientRect();return box.left>=cell.left&&box.right<=cell.right&&box.top>=cell.top&&box.bottom<=cell.bottom;});
        }));assert.equal(actionsFit,true,`action bounds at ${width}`);
        if(width===390)assert.equal(await page.locator('.activity-repeating-table__row-actions button').evaluateAll(nodes=>nodes.every(node=>node.getBoundingClientRect().width>=44&&node.getBoundingClientRect().height>=44)),true);
        await page.screenshot({path:path.join(artifacts,`repeating-actions-${width}.png`),fullPage:true});
        await page.locator('.activity-repeating-table').evaluate(node=>{node.scrollLeft=0;});
    }
    assert.deepEqual(errors,[]);
    console.log('PASS: real Activity/Training repeating funding, editable queue/table/IPO links, draft guards, OU permissions, approval, partial and uncertain saves, history failures, duplicate submission, Single/Multi-Day creation and responsive layouts. Synthetic only. Artifacts: '+artifacts);
}finally{if(browser)await browser.close();await server.close();}
