import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';

// Static in-memory browser fixture: no dev server, environment files, backend or real credentials.
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || 'C:/Users/joelm/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules', 'playwright'));
const screenshots = await mkdtemp(path.join(tmpdir(), '4kis-dcf-revision-ui-'));
const harness = `
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import DcfRevisionHistory from './components/shared/DcfRevisionHistory';
window.rpcCalls=[];window.confirmations=[];window.fixtureMode='normal';
const line={id:8,expenseParticular:'Recorded budget line',particulars:'Recorded seedlings',objectType:'MOOE',amount:100,numberOfUnits:4,pricePerUnit:25,targetScheduleVersion:2,targetObligationSchedules:[{id:'o1',month:'2026-10-01',amount:40},{id:'o2',month:'2026-11-01',amount:60}],targetDisbursementSchedules:[],actualDeliveryDate:'2026-10-01',actualNumberOfUnits:3};
window.fixtureSnapshot=()=>({schemaVersion:window.fixtureMode==='schema'?9:1,entityType:window.fixtureEntity,parentId:7,record:{id:7,uid:'DCF-7',name:'Recorded historical name',type:'Training',equipment:'Recorded printer',personnelPosition:'Recorded position',status:'Contractual',hiringStatus:'Filled',particulars:'Recorded rent',operatingUnit:'NPMO',fundingYear:2026,fundType:'Current',fundSource:'Recorded funding label',details:[line],expenses:[line],actualPWD:2,password:'SECRET-NOT-FOR-VIEWER'},financial:{obligations:[{id:50,item_id:8,obligation_date:'2026-10-01',amount:20}],disbursements:[],stages:{}},physical:{actualPWD:2},related:{activity_drive_files:[{id:91,file_name:'Recorded evidence.pdf',signed_url:'SECRET-NOT-FOR-VIEWER'}]}});
window.fixtureRpc=async(name,params)=>{
 window.rpcCalls.push({name,params});
 if(window.fixtureMode==='denied')return {data:null,error:{message:'Permission denied by server'}};
 if(window.fixtureMode==='delayed')await new Promise(resolve=>setTimeout(resolve,250));
 if(name==='list_dcf_revisions'){
  const all=Array.from({length:25},(_,i)=>({id:25-i,version:25-i,recorded_at:'2026-11-03T01:00:00Z',actor_name:'Recorded actor '+('long name '.repeat(8)),source:'details',kind:'change',summary:'Budget and details '+('long summary '.repeat(12)),changed_fields:['name'],restore_operation_id:i===0?'durable-restore':null,can_undo:i===0}));
  const rows=all.filter(row=>params.p_before_revision==null||row.id<params.p_before_revision).slice(0,params.p_limit);
  return {data:{rows,total:25,latestRevisionId:25,nextCursor:rows.length===params.p_limit?rows.at(-1).id:null},error:null};
 }
 if(name==='read_dcf_revision')return {data:{id:params.p_revision_id,snapshot:window.fixtureSnapshot()},error:null};
 if(name==='preview_dcf_restore')return {data:{current:window.fixtureSnapshot(),proposed:window.fixtureSnapshot(),currentRevisionId:25,currentHash:'server-hash',changes:[{field:'Actual obligation',before:20,after:10}],blockers:window.fixtureMode==='blocked'?['A transfer prevents restoration']:[],excludedFields:['uid','workflow_status'],requiresActualsAcknowledgement:true,canRestore:window.fixtureMode!=='blocked'},error:null};
 if(name==='apply_dcf_restore'){
  if(window.fixtureMode==='uncertain'){window.fixtureMode='normal';throw new Error('Response lost; retry the same request');}
  return {data:{record:{id:7,name:'Confirmed restored record'},financial:window.fixtureSnapshot().financial,revisionId:26,restoreOperationId:'new-durable-restore'},error:null};
 }
 throw new Error('Unexpected RPC '+name);
};
function Harness(){
 const [config,setConfig]=useState({mode:'normal',entity:'activities',role:'Super Admin',scope:0});
 const [liveVersion,setLiveVersion]=useState(0);window.bumpLiveVersion=()=>setLiveVersion(value=>value+1);
 window.loadFixture=(mode='normal',entity='activities',role='Super Admin')=>{window.fixtureMode=mode;window.fixtureEntity=entity;setConfig(previous=>({mode,entity,role,scope:previous.scope+1}));};
 window.fixtureEntity=config.entity;
 const user=config.mode==='loggedout'?null:{id:1,role:config.role,password:'fixture-only',fullName:'Fixture User',operatingUnit:'NPMO',permissions_override:{}};
 return <main style={{maxWidth:1100,margin:'0 auto',padding:16}}><DcfRevisionHistory entityType={config.entity} parentId={7} currentUser={user} currentVersionKey={liveVersion} permissions={{authorizationKey:String(config.scope)}} legacyHistory={[{date:'Unverified date',event:'Legacy record',user:'Legacy actor'}]} onRestored={response=>{window.confirmations.push(response);if(config.mode==='callback-failure')throw new Error('Local cache failure');}}/></main>;
}createRoot(document.getElementById('root')).render(<React.StrictMode><Harness/></React.StrictMode>);
`;
const bundle = await build({ stdin: { contents: harness, resolveDir: process.cwd(), sourcefile: 'dcf-revision-ui-fixture.tsx', loader: 'tsx' }, bundle: true, write: false, format: 'iife', platform: 'browser', define: { 'process.env.NODE_ENV': '"development"' }, plugins: [{ name: 'offline-dcf-revision', setup(api) {
    api.onResolve({ filter: /supabaseClient$/ }, () => ({ path: 'offline-client', namespace: 'fixture' }));
    api.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const supabase={rpc:(...args)=>window.fixtureRpc(...args)};', loader: 'js' }));
} } ] });
const css = await readFile(new URL('../styles/main.css', import.meta.url), 'utf8');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => route.abort());
    await page.route('https://dcf-fixture.invalid/', route => route.fulfill({ contentType: 'text/html', body: `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div></body></html>` }));
    await page.goto('https://dcf-fixture.invalid/');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const toggle = () => page.getByRole('button', { name: 'History', exact: true });
    const table = () => page.getByRole('region', { name: 'Revision history', exact: true });
    const load = async (mode = 'normal', entity = 'activities', role = 'Super Admin') => {
        await page.evaluate(({ mode, entity, role }) => window.loadFixture(mode, entity, role), { mode, entity, role });
        await toggle().click();
        if (mode !== 'loggedout') await page.waitForFunction(() => !document.querySelector('[aria-label="Revision history"]')?.getAttribute('aria-busy') || document.querySelector('[aria-label="Revision history"]')?.getAttribute('aria-busy') === 'false');
    };
    assert.equal(await page.evaluate(() => window.rpcCalls.length), 0, 'Collapsed history does not read');
    await page.evaluate(()=>window.bumpLiveVersion());
    assert.equal(await page.evaluate(()=>window.rpcCalls.length),0,'Confirmed changes do not eagerly load collapsed history');
    await toggle().click();
    await page.getByTitle('View version', { exact: true }).first().waitFor();
    assert.equal(await table().locator('tbody tr').count(), 10);
    const metadataReads=await page.evaluate(()=>window.rpcCalls.filter(call=>call.name==='list_dcf_revisions').length);
    await page.evaluate(()=>window.bumpLiveVersion());
    await page.waitForFunction(count=>window.rpcCalls.filter(call=>call.name==='list_dcf_revisions').length===count+1,metadataReads);
    await page.getByTitle('View version', { exact: true }).first().waitFor();
    assert.equal(await table().locator('tbody tr').count(),10,'Confirmed live changes reload metadata without expanding history');
    assert.equal(await page.evaluate(() => window.rpcCalls.filter(call => call.name === 'read_dcf_revision').length), 0);
    for (const width of [1440, 820, 390]) {
        await page.setViewportSize({ width, height: 900 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Table page overflow ${width}`);
        await page.screenshot({ path: path.join(screenshots, `history-${width}.png`), fullPage: true });
    }
    await page.getByLabel('History entries per page').selectOption('50');
    await page.waitForFunction(() => document.querySelectorAll('.dcf-revision-history__table tbody tr').length === 26);
    assert.ok(await table().evaluate(node => node.clientHeight <= 401), '50 entries remain bounded');
    assert.equal(await page.getByLabel('Saved version unavailable', { exact: true }).count(), 1);
    assert.match(await table().innerText(), /Unverified date \(legacy date\)/);
    await page.getByTitle('View version', { exact: true }).first().click();
    await page.getByRole('heading', { name: 'Expenses & Budget', exact: true }).waitFor();
    assert.equal(await page.locator('body').innerText().then(text => text.includes('SECRET-NOT-FOR-VIEWER')), false);
    assert.equal(await page.locator('[role="dialog"] input,[role="dialog"] textarea').count(), 0, 'Historical viewer has no editable controls');
    for (const width of [1440, 820, 390]) {
        await page.setViewportSize({ width, height: 900 });
        assert.ok(await page.getByRole('dialog').evaluate(node => { const b = node.getBoundingClientRect(); return b.left >= 0 && b.right <= innerWidth + 1 && b.top >= 0 && b.bottom <= innerHeight + 1; }), `Modal frame ${width}`);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Modal page overflow ${width}`);
        await page.screenshot({ path: path.join(screenshots, `version-${width}.png`), fullPage: true });
    }
    await page.getByRole('button', { name: 'Close version', exact: true }).focus();
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(() => !!document.activeElement.closest('[role="dialog"]')), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.activeElement.title), 'View version', 'Modal returns focus');
    await page.getByTitle('Undo latest restore',{exact:true}).click();
    await page.getByLabel('Reason for undoing restore',{exact:true}).waitFor();
    await page.evaluate(()=>window.bumpLiveVersion());
    await page.getByRole('alert').filter({hasText:'live record changed'}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Confirm Undo Restore',exact:true}).count(),0);
    assert.equal(await page.evaluate(()=>window.rpcCalls.filter(call=>call.name==='apply_dcf_restore').length),0,'Invalidating an open preview performs no mutation');
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('dialog').count(), 0);
    assert.equal(await page.evaluate(() => document.activeElement.classList.contains('dcf-revision-history__toggle')),true,'Metadata refresh preserves a connected focus return target');
    const reads = await page.evaluate(() => window.rpcCalls.filter(call => call.name === 'read_dcf_revision').length);
    await page.getByTitle('View version', { exact: true }).first().click();
    await page.getByRole('heading', { name: 'Activity Details', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.rpcCalls.filter(call => call.name === 'read_dcf_revision').length), reads, 'Repeated open reuses scoped immutable snapshot');
    await page.getByRole('button', { name: 'Restore this version', exact: true }).click();
    await page.getByRole('heading', { name: 'Restore Preview', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Confirm Restore', exact: true }).isDisabled(), true);
    await page.getByLabel('Reason for restoration', { exact: true }).fill('Fixture correction');
    assert.equal(await page.getByRole('button', { name: 'Confirm Restore', exact: true }).isDisabled(), true);
    await page.getByLabel('I acknowledge the changes to reported physical and financial actuals.').check();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.equal(await page.evaluate(() => window.rpcCalls.filter(call => call.name === 'apply_dcf_restore').length), 0, 'Preview cancellation writes nothing');
    await page.keyboard.press('Escape');
    for (const entity of ['subprojects', 'office_requirements', 'staffing_requirements', 'other_program_expenses']) {
        await load('normal', entity);
        await page.getByTitle('View version', { exact: true }).first().click();
        await page.getByRole('heading', { name: entity === 'subprojects' ? 'Project Details' : 'Requirement Details', exact: true }).waitFor();
        if (entity === 'staffing_requirements') { assert.match(await page.getByRole('dialog').innerText(), /Employment/); assert.match(await page.getByRole('dialog').innerText(), /Filled/); }
        await page.keyboard.press('Escape');
    }
    await load('normal', 'activities', 'Administrator');
    await page.getByTitle('View version', { exact: true }).first().click();
    await page.getByRole('heading', { name: 'Activity Details', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Restore this version', exact: true }).count(), 0);
    await page.keyboard.press('Escape');
    await load('schema'); await page.getByTitle('View version', { exact: true }).first().click();
    await page.getByRole('alert').filter({ hasText: 'unsupported' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Restore this version', exact: true }).count(), 0);
    await page.keyboard.press('Escape');
    await load('denied'); await page.getByRole('alert').filter({ hasText: 'Permission denied' }).waitFor();
    assert.equal(await page.getByTitle('View version', { exact: true }).count(), 0);
    await load('loggedout'); assert.match(await page.getByRole('alert').innerText(), /access scope/);
    await load('uncertain'); await page.getByTitle('Undo latest restore', { exact: true }).click();
    await page.getByLabel('Reason for undoing restore', { exact: true }).fill('Undo fixture restore');
    await page.getByLabel('I acknowledge the changes to reported physical and financial actuals.').check();
    await page.getByRole('button', { name: 'Confirm Undo Restore', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Response lost' }).waitFor().catch(async error => {
        console.error(await page.evaluate(() => ({ mode: window.fixtureMode, rpcNames: window.rpcCalls.map(call => call.name), dialog: document.querySelector('[role="dialog"]')?.textContent })));
        throw error;
    });
    await page.getByRole('button', { name: 'Confirm Undo Restore', exact: true }).dblclick();
    await page.waitForFunction(() => window.confirmations.length === 1);
    const applies = await page.evaluate(() => window.rpcCalls.filter(call => call.name === 'apply_dcf_restore'));
    assert.equal(applies.length, 2);
    assert.equal(applies[0].params.p_request_key, applies[1].params.p_request_key);
    assert.equal(applies[0].params.p_undo_operation_id, 'durable-restore');
    assert.equal(await page.getByRole('dialog').count(), 0);
    assert.deepEqual(errors, []);
    console.log(`DCF revision offline UI passed: lazy metadata, 10/50 bounded table, five snapshot viewers, desktop/tablet/mobile, focus/return, unavailable legacy/schema/permission states, restore cancel and durable undo retry. Screenshots: ${screenshots}`);
} finally { await browser.close(); }
