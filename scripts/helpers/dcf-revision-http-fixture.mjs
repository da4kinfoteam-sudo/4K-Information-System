import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { createDcfRevisionFixture, installDcfRevision, root, quote, domains, fingerprints } from './dcf-revision-fixture.mjs';

// Only the transport/auth boundary is replaced. Business adapters, serializers,
// history, ACF components and every database function remain repository code.
export const transportModule = `
const send=async body=>{
 const response=await fetch('/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 if(!response.ok)throw Error('Fixture HTTP '+response.status);
 return response.json();
};
export const supabase={
 rpc:(name,args={})=>send({name,args}),
 from(table){const filters=[];let single=false;const q={
  select(columns='*'){if(columns!=='*')throw Error('Unsupported fixture projection '+columns);return q},
  eq(key,value){filters.push([key,value]);return q},
  maybeSingle(){single=true;return q},single(){single=true;return q},
  order(){return q},limit(){return q},
  then(resolve,reject){return (table==='budget_item_adjustment_history'?Promise.resolve({data:[],error:null}):send({table,filters,single,actor:window.session})).then(resolve,reject)},
  insert(){throw Error('Unexpected direct INSERT')},update(){throw Error('Unexpected direct UPDATE')},delete(){throw Error('Unexpected direct DELETE')}
 };return q;}
};`;

export const authModule = `export const useAuth=()=>({currentUser:window.session,rolesConfigs:[],
 hasAccess:(_module,action)=>!!window.session&&(action==='view'||window.session.role!=='Guest'),
 getVisibilityScope:()=>window.session?.role==='Super Admin'?'All':'Own'});`;
export const policyModule = `
export const normalizePolicyMonth=v=>String(v||'').slice(0,7);
export const getDcfModuleKeyForSourceType=t=>({Activity:'activities',Subproject:'subprojects',Office:'office_requirements',Staffing:'staffing_requirements',Other:'other_program_expenses'})[t];
export const useDcfPolicyGuard=()=>({getStatusDecision:()=>({allowed:!!window.session&&window.session.role!=='Guest'}),
 ensureDecisionAllowed:async d=>d.allowed,getLastOverrideReason:()=> 'Disposable fixture correction',getMonthDecision:()=>({allowed:true}),
 getMonthLockMessage:()=>'',isMonthSelectionAllowed:()=>true});`;

export const harnessImports = `
import React,{useState,useRef}from'react';import{createRoot}from'react-dom/client';
import * as mutation from './lib/dcfMutation';
import * as pm from './lib/programManagementPersistence';
import * as revision from './lib/dcfRevisionHistory';
import {persistActivityDraft} from './lib/activityDraftPersistence';
import {persistSubprojectDraft} from './lib/subprojectDraftPersistence';
import * as activityActual from './lib/activityAccomplishmentPersistence';
import * as subprojectActual from './lib/subprojectAccomplishmentPersistence';
import DcfRevisionHistory from './components/shared/DcfRevisionHistory';
import PhysicalAccomplishment from './components/accomplishment/PhysicalAccomplishment';
import FinancialAccomplishment from './components/accomplishment/FinancialAccomplishment';
window.session={id:1,password:'fixture-password',role:'Super Admin',fullName:'Fixture Admin',operatingUnit:'NPMO'};
window.api={...mutation,...pm,...revision,...activityActual,...subprojectActual,persistActivityDraft,persistSubprojectDraft};
window.fixture={confirmations:[],errors:[],writes:0};
const empty=[],noop=()=>{},unexpected=()=>{throw Error('Confirmed save called a database-writing setter')};
`;

export const acfProps = `subprojects={visible('subprojects')} setSubprojects={unexpected} onSubprojectSaved={saved('subprojects')}
 activities={visible('activities')} setActivities={unexpected} onActivitySaved={saved('activities')}
 officeReqs={visible('office_requirements')} setOfficeReqs={unexpected} onOfficeSaved={saved('office_requirements')}
 staffingReqs={visible('staffing_requirements')} setStaffingReqs={unexpected} onStaffingSaved={saved('staffing_requirements')}
 otherProgramExpenses={visible('other_program_expenses')} setOtherProgramExpenses={unexpected} onOtherExpenseSaved={saved('other_program_expenses')}
 uacsCodes={{MOOE:{Travel:{'502':'Travel expenses'}}}} onSelectSubproject={noop} onSelectActivity={noop} onSelectOfficeReq={noop} onSelectStaffingReq={noop} onSelectOtherExpense={noop}`;

export const appHarness = `${harnessImports}
function Harness(){
 const[records,setRecords]=useState({}),[mode,setMode]=useState('history'),[target,setTarget]=useState(null),[epoch,setEpoch]=useState(0);
 window.reloadRecords=async()=>{const rows=await fetch('/records').then(r=>r.json());setRecords(rows);return rows};
 window.openFixture=async(next='history',type='activities',id=1)=>{await window.reloadRecords();setMode(next);setTarget({type,id});setEpoch(n=>n+1)};
 window.changeSession=async user=>{window.session=user;await window.reloadRecords();setEpoch(n=>n+1)};
 const visible=table=>(records[table]||[]).filter(row=>window.session&&(window.session.role==='Super Admin'||row.operatingUnit===window.session.operatingUnit));
 const saved=table=>(record,financial)=>{window.fixture.confirmations.push({table,record,financial});setRecords(old=>({...old,[table]:(old[table]||[]).map(row=>row.id===record.id?record:row)}))};
 window.localRecord=table=>records[table];
 return <main style={{padding:16,minWidth:0}} key={epoch}>{mode==='physical'?<PhysicalAccomplishment ${acfProps}/>:mode==='financial'?<FinancialAccomplishment ${acfProps}/>:target?<DcfRevisionHistory entityType={target.type} parentId={target.id} currentUser={window.session} permissions={{authorizationKey:String(epoch)}} onRestored={result=>{saved(target.type)(result.record,result.financial);if(window.fixture.callbackFailure)throw Error('Local callback failed')}}/>:null}</main>;
}createRoot(document.getElementById('root')).render(<Harness/>);`;

const allowedRpcs = new Set(['read_dcf_state','commit_dcf_change','list_dcf_revisions','read_dcf_revision',
    'preview_dcf_restore','apply_dcf_restore','undo_dcf_restore','dcf_revision_capability','budget_target_schedule_capability',
    'read_activity_accomplishments','save_activity_accomplishment','read_subproject_accomplishments','save_subproject_accomplishment']);

export async function sqlRpc(db, name, args = {}) {
    assert.ok(allowedRpcs.has(name), `Unexpected RPC: ${name}`);
    const signatures = (await db.query(`select p.proargnames names,
      array(select format_type(t,null) from unnest(p.proargtypes::oid[]) t) types,
      p.pronargs-p.pronargdefaults required from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname=$1`, [name])).rows;
    const keys = Object.keys(args);
    const matches = signatures.filter(s => keys.every(k => s.names?.includes(k)) && (s.names || []).slice(0,s.required).every(k => keys.includes(k)));
    assert.equal(matches.length, 1, `No unique installed signature for ${name}: ${JSON.stringify(signatures)}`);
    const spec = matches[0];
    const types = keys.map(k => spec.types[spec.names.indexOf(k)]);
    const values = keys.map((k,i) => ['json','jsonb'].includes(types[i]) ? JSON.stringify(args[k]) : args[k]);
    return (await db.query(`select public.${quote(name)}(${keys.map((k,i) => `${quote(k)} => $${i+1}::${types[i]}`).join(',')}) data`, values)).rows[0].data;
}

export async function createHttpFixture({ harness = appHarness, name = 'e2e', auth = authModule, componentMocks = {} } = {}) {
    const artifacts = await mkdtemp(path.join(tmpdir(), `4kis-dcf-${name}-`));
    const db = await createDcfRevisionFixture({install:false});
    let server, browser;
    const calls = [], external = [], errors = [], results = [];
    const control = { loseResponse: null, delay: null };
    try {
        // Seed complete current-year inputs before installing capture, so the real
        // ACF scope filters show the disposable records without manufacturing history.
        for(const domain of domains) await db.exec(`update ${quote(domain.table)} set ${quote(domain.lines && domain.type!=='staffing_requirement'?'fundingYear':'fundYear')}=2026`);
        await installDcfRevision(db);
        for (const file of ['202611030002_dcf_revision_mutations.sql','202611030003_dcf_revision_restore.sql']) {
            await db.exec(await readFile(path.join(root,'supabase/migrations',file),'utf8'));
        }
        const replacements = { supabaseClient: transportModule, 'contexts/AuthContext': auth,
            'hooks/useDcfPolicyGuard': policyModule, 'hooks/useLogAction': 'export const useLogAction=()=>({logAction:()=>{}});', ...componentMocks };
        const bundle = await build({ stdin: { contents: harness, resolveDir: root, sourcefile: 'dcf-http-fixture.tsx', loader: 'tsx' },
            bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
            define: { 'process.env.NODE_ENV': '"development"' }, plugins: [{ name: 'disposable-sql-boundary', setup(api) {
                api.onResolve({ filter: /.*/ }, args => {
                    const normalized = args.path.replaceAll('\\','/').replace(/\.(tsx?|jsx?)$/,'');
                    const key = Object.keys(replacements).find(k => normalized.endsWith('/'+k));
                    if (key) return { path: key, namespace: 'fixture' };
                });
                api.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: replacements[args.path], loader: 'js', resolveDir: root }));
            } }] });
        const css = await readFile(path.join(root,'styles/main.css'),'utf8');
        let queue = Promise.resolve();
        const serialized = task => { const pending = queue.then(task); queue = pending.catch(()=>{}); return pending; };
        server = createServer(async (req,res) => {
            res.setHeader('Cache-Control','no-store');
            try {
                if(req.url==='/') {res.setHeader('Content-Type','text/html');return res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/main.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');}
                if(req.url==='/main.css') {res.setHeader('Content-Type','text/css');return res.end(css);}
                if(req.url==='/bundle.js') {res.setHeader('Content-Type','text/javascript');return res.end(bundle.outputFiles[0].text);}
                res.setHeader('Content-Type','application/json');
                if(req.url==='/records') return res.end(JSON.stringify(await serialized(async()=>Object.fromEntries(await Promise.all(domains.map(async d=>[d.table,(await db.query(`select * from ${quote(d.table)} order by id`)).rows]))))));
                if(req.url!=='/rpc'||req.method!=='POST') {res.statusCode=404;return res.end('{}');}
                let body='';for await(const part of req)body+=part;
                const request=JSON.parse(body),call={name:request.name || 'select',entity:request.args?.p_entity_type || request.table,
                    actor:request.args?.p_actor_id || request.actor?.id,key:request.args?.p_request_key};
                calls.push(call);
                const response=await serialized(async()=>{
                    try {
                        let data;
                        if(request.name) data=await sqlRpc(db,request.name,request.args);
                        else {
                            assert.ok(domains.some(d=>d.table===request.table),'Only DCF parent reads are supported');
                            assert.ok(request.single,'Only scoped single-parent reads are supported');
                            assert.equal(request.filters.length,1);
                            assert.equal(request.filters[0][0],'id');
                            data=(await sqlRpc(db,'read_dcf_state',{p_actor_id:request.actor.id,p_actor_password:request.actor.password,
                                p_entity_type:request.table,p_parent_id:request.filters[0][1]})).record;
                        }
                        call.ok=true;return {data,error:null};
                    }catch(error){call.ok=false;call.error=error.message;return {data:null,error:{message:error.message,code:error.code}};}
                });
                if(control.delay===request.name) await new Promise(resolve=>setTimeout(resolve,300));
                // A truncated response after commit deterministically exercises an
                // uncertain outcome without Chromium transparently retrying a reset socket.
                if(control.loseResponse===request.name && !response.error){control.loseResponse=null;res.end('{"data":');return;}
                res.end(JSON.stringify(response));
            }catch(error){errors.push(error.message);res.statusCode=500;res.end(JSON.stringify({error:error.message}));}
        });
        await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
        const origin=`http://127.0.0.1:${server.address().port}`;
        const require=createRequire(import.meta.url);
        const {chromium}=require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || 'C:/Users/joelm/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules','playwright'));
        browser=await chromium.launch({channel:'msedge',headless:true});
        const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
        await context.route('**/*',route=>{
            const url=new URL(route.request().url());
            if(url.origin===origin)return route.continue();
            external.push(url.origin+url.pathname);return route.abort();
        });
        const page=await context.newPage();page.setDefaultTimeout(10000);
        page.on('pageerror',error=>errors.push(error.message));
        page.on('dialog',dialog=>dialog.accept());
        await page.goto(origin);await page.waitForFunction(()=>!!window.api);
        const test=async(label,action)=>{
            try{await action();results.push({label,status:'PASS'});console.log(`PASS ${label}`);}
            catch(error){results.push({label,status:'FAIL',error:error.stack});console.error(`FAIL ${label}: ${error.stack}`);
                await page.screenshot({path:path.join(artifacts,`failure-${results.length}.png`),fullPage:true}).catch(()=>{});}
        };
        return {db,page,origin,calls,control,artifacts,results,external,errors,test,
            async close(){
                await browser.close();await new Promise(resolve=>server.close(resolve));await db.close();
                await writeFile(path.join(artifacts,'results.json'),JSON.stringify({results,calls,errors,external,limitations:[
                    'Memory-only PGlite; 31 source migrations and modeled legacy DDL, not live catalog/RLS or parallel PostgreSQL sessions.',
                    'Synthetic auth/policy providers and parent prop shell; real adapters, ACF components, history and SQL functions.',
                    'No environment files, production URLs, credentials or production operations.'
                ]},null,2));
            }};
    }catch(error){await browser?.close();if(server?.listening)await new Promise(resolve=>server.close(resolve));await db.close();throw error;}
}

export const identity=(type,id,actor=1)=>({p_entity_type:type,p_parent_id:id,p_actor_id:actor,p_actor_password:'fixture-password'});
export const state=(db,type,id,actor=1)=>sqlRpc(db,'read_dcf_state',identity(type,id,actor));
export const history=(db,type,id,actor=1)=>sqlRpc(db,'list_dcf_revisions',identity(type,id,actor));
export const versions=(db,type,id)=>db.query('select * from dcf_record_revisions where entity_type=$1 and parent_id=$2 order by id',[type,id]).then(r=>r.rows);
export async function browserCall(page, method, args) {
    return page.evaluate(async({method,args})=>{try{return {value:await window.api[method](...args)}}catch(error){return {error:error.message}}},{method,args});
}
export function confirmed(result){assert.equal(result.error,undefined,result.error);assert.ok(result.value);return result.value;}
export function assertFinancialRestored(actual,expected){
    // Corrected rows get new audit timestamps; creation identity, ownership,
    // actual values, provenance and all untouched rows must still be preserved.
    const business=financial=>({...financial,obligations:financial.obligations.map(({updated_at,...row})=>row),
        disbursements:financial.disbursements.map(({updated_at,...row})=>row)});
    assert.deepEqual(business(actual),business(expected));
    for(const key of ['obligations','disbursements'])for(const row of expected[key]){
        const match=actual[key].find(candidate=>String(candidate.id)===String(row.id));
        assert.ok(match);assert.ok(new Date(match.updated_at)>=new Date(row.updated_at),'Restore cannot backdate ledger encoding');
    }
}
export async function assertRollback(db,action,pattern){const before=await fingerprints(db);await action(pattern);assert.deepEqual(await fingerprints(db),before,'Business rows, history and receipts must all roll back');}
export function finish(fixture){
    assert.deepEqual(fixture.errors,[],'Unexpected server/browser errors');assert.deepEqual(fixture.external,[],'External requests attempted');
    const failed=fixture.results.filter(r=>r.status==='FAIL');
    console.log(`${fixture.results.length-failed.length} passed; ${failed.length} failed. Evidence: ${fixture.artifacts}`);
    if(failed.length)process.exitCode=1;
}
