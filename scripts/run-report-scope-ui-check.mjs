import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const require=createRequire(import.meta.url);
const {chromium}=require(path.join(process.env.PLAYWRIGHT_NODE_MODULES||'C:/Users/joelm/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules','playwright'));
const artifacts=await mkdtemp(path.join(tmpdir(),'4kis-report-filters-'));
const serve=process.argv.includes('--serve');
const mocks={
    'contexts/AuthContext':`export const useAuth=()=>({currentUser:window.fixture.user,getVisibilityScope:module=>window.fixture.scopes[module]||'All',hasAccess:()=>true});`,
    'LocationPicker':`import React from'react';export const parseLocation=()=>({province:'Ilocos Norte',municipality:'Laoag',barangays:[]});export default()=>null;`,
    'lib/reportExcelExport':`export const exportReportWorkbook=async(request,signatories)=>window.fixture.exports.push(structuredClone({request,signatories}));`,
    'supabaseClient':`export const supabase={from(table){const filters=[];const q={select(){return q},order(){return q},eq(field,value){filters.push(row=>row[field]===value);return q},in(field,values){filters.push(row=>values.includes(row[field]));return q},is(field,value){return q.eq(field,value)},or(){filters.push(row=>row.fundSourceUid==null||row.fundSourceUid==='');return q},range(start,end){return Promise.resolve(result(start,end))},maybeSingle(){return Promise.resolve({data:null,error:null})},then(resolve,reject){return Promise.resolve(result(0,10000)).then(resolve,reject)},insert(){throw Error('Unexpected write')},update(){throw Error('Unexpected write')},delete(){throw Error('Unexpected write')}};function result(start,end){const f=window.fixture;const tables={ref_fund_sources:f.references,subprojects:f.subprojects,activities:f.activities,ipos:f.ipos,budget_ceilings:f.ceilings,office_requirements:f.officeReqs,staffing_requirements:f.staffingReqs,other_program_expenses:f.otherProgramExpenses};return{data:structuredClone((tables[table]||[]).filter(row=>filters.every(check=>check(row))).slice(start,end+1)),error:null}}return q}};`,
};
const harness=`import React,{useState,useEffect}from'react';import{createRoot}from'react-dom/client';import Reports from'/components/Reports.tsx';import{operatingUnits}from'/constants';import{loadScopedAppData}from'/lib/scopedDataFetch.ts';import{buildAuthorizedDataScope,getDataScopeModule}from'/lib/appDataScope.ts';import'/index.css';import'/styles/main.css';
const line=(id,amount,date)=>({id,particulars:'Inputs',expenseParticular:'Agricultural Supplies Expenses',objectType:'MOOE',uacsCode:'5020301000',pricePerUnit:amount,numberOfUnits:1,amount,obligationMonth:date,disbursementMonth:date,deliveryDate:date,isCompleted:true,actualDeliveryDate:'2026-02-01',obligations:[{amount:amount*.8,date:'2026-01-01'}],disbursements:[{amount:amount*.5,date:'2026-02-01'}]});
const parent=(id,year,source,type='Current',tier='Tier 1',ou='RPMO 1')=>({id,uid:'SP-'+id,name:'Subproject '+id,location:'Laoag, Ilocos Norte',operatingUnit:ou,fundingYear:year,fundSourceUid:source,fundType:type,tier,status:'Completed',workflow_status:'APPROVED',ipo_id:910,indigenousPeopleOrganization:'Sample IPO',packageType:'Production',estimatedCompletionDate:year+'-02',actualCompletionDate:'2026-02-01',details:[line(id*10,100,year+'-01'),line(id*10+1,200,year+'-02')],subprojectCommodities:[]});
const parents=[parent(101,2025,null,'Continuing'),parent(102,2026,'FS-000004'),parent(103,2027,'FS-000003','Current','Tier 2'),parent(104,2026,'FS-000004','Current','Tier 1','RPMO 2'),{...parent(105,2025,null,'Continuing'),fundSource:'Rice'}];
const activities=parents.map((row,index)=>({...row,id:201+index,uid:'ACT-'+index,type:index===1?'Activity':'Training',name:index===1?'Subproject Monitoring':'Training '+index,component:'Social Preparation',date:'2026-02',actualDate:'2026-02-01',activity_title:'Activity '+index,participantsMale:10,participantsFemale:12,actualParticipantsMale:8,actualParticipantsFemale:9,participatingIpos:['Sample IPO'],participating_ipo_ids:[910],expenses:row.details}));
window.fixture={user:{id:1,role:'Super Admin',operatingUnit:'RPMO 1'},scopes:{Dashboards:'Own OU',Reports:'All'},mode:'success',requests:[],pending:[],exports:[],prints:[],subprojects:parents,activities,officeReqs:[],staffingReqs:[],otherProgramExpenses:[],ipos:[{id:910,name:'Sample IPO',region:'Region I (Ilocos Region)',location:'Laoag, Ilocos Norte',ancestralDomainNo:'AD-001',indigenousCulturalCommunity:'Sample ICC',commodities:[],totalMembers:20,totalMaleMembers:8,totalFemaleMembers:12}],ceilings:[2025,2026,2027].map(year=>({operating_unit:'RPMO 1',year,amount:5000})),references:[{uid:'FS-000001',label:'4K Fund',is_active:true},{uid:'FS-000003',label:'Corn',is_active:false},{uid:'FS-000004',label:'Rice',is_active:true}]};
if(localStorage.getItem('sample-fund-sources'))window.fixture.references=JSON.parse(localStorage.getItem('sample-fund-sources'));
const empty=()=>({ipos:[],subprojects:[],activities:[],officeReqs:[],staffingReqs:[],otherProgramExpenses:[],budgetCeilings:[]});let sequence=0;
const load=async(raw,force)=>{const f=window.fixture,seq=++sequence;const scope=buildAuthorizedDataScope(raw,f.user.id,f.user.operatingUnit,f.scopes[getDataScopeModule(raw.scopeOwner)]!=='Own OU');f.requests.push(structuredClone({scope,force}));if(f.mode==='deferred')await new Promise(resolve=>f.pending.push(resolve));if(f.mode==='error')return{ok:false,error:'Sample report load failure'};const result=await loadScopedAppData(scope);if(seq!==sequence)return{ok:false,error:'Superseded'};f.lastData=result;window.receiveData(result);return{ok:true}};
const initial=()=>({activeTab:'WFP',selectedYear:'2025',selectedReportingYear:'2026',selectedOu:'All',selectedOus:operatingUnits,selectedTier:'All',selectedFundType:'All',bar1SelectedAsOfDate:'',monthlySelectedMonth:11,detailedSelectedQuarter:'All',financialAuditSearchTerm:'',financialAuditSeverityFilter:'All',financialAuditReportFilter:'All',financialAuditSourceFilter:'All',financialAuditIssueTypeFilter:'All',financialAuditAsOfMonth:11});
function Harness(){
const[data,setData]=useState(empty),[state,setState]=useState(initial),[version,setVersion]=useState(0),[detail,setDetail]=useState(false);
window.receiveData=setData;window.fixture.state=state;
window.selectReportTab=activeTab=>setState(previous=>({...previous,activeTab}));
window.updateUser=(user,scopes)=>{window.fixture.user=user;window.fixture.scopes=scopes;setVersion(v=>v+1)};
window.rename=()=>{window.fixture.references=window.fixture.references.map(row=>({...row,label:row.uid==='FS-000004'?'Renamed Rice':row.label}));localStorage.setItem('sample-fund-sources',JSON.stringify(window.fixture.references));setVersion(v=>v+1)};
const navigate=()=>setDetail(true);window.print=()=>{window.fixture.prints.push(document.querySelector('.report-print-header')?.textContent);dispatchEvent(new Event('afterprint'))};
return <main className="report-fixture"><nav aria-label="Sample navigation"><button className="btn btn-secondary" onClick={()=>setDetail(true)}>Sample detail</button>{detail&&<button className="btn btn-secondary" onClick={()=>setDetail(false)}>Return to report</button>}</nav>{detail?<h2>Sample record details</h2>:<Reports {...data} fundSources={window.fixture.references} trainings={data.activities.filter(row=>row.type==='Training')} otherActivities={data.activities.filter(row=>row.type==='Activity')} deadlines={[]} budgetCeilings={data.budgetCeilings} uacsCodes={{MOOE:{'Agricultural Supplies Expenses':{'5020301000':'Agricultural Supplies Expenses'}}}} onDataScopeChange={load} reportState={state} onReportStateChange={setState} onSelectSubproject={navigate} onSelectActivity={navigate} onSelectIpo={navigate} onSelectOfficeReq={navigate} onSelectStaffingReq={navigate} onSelectOtherExpense={navigate} onOpenIpoListForAncestralDomain={navigate}/>}</main>}
createRoot(document.getElementById('root')).render(<Harness/>);`;
const server=await createServer({
    configFile:false,root:process.cwd(),appType:'custom',cacheDir:path.join(artifacts,'.vite'),
    resolve:{alias:{'@':process.cwd()}},
    server:{host:'127.0.0.1',port:serve?3025:0,strictPort:serve},
    optimizeDeps:{noDiscovery:true,include:['react','react-dom/client','lucide-react','xlsx'],entries:[]},
    plugins:[{
        name:'report-ui-fixture',enforce:'pre',
        resolveId(id){if(id==='/report-harness.tsx')return'\0report-harness';for(const key of Object.keys(mocks))if(id.replace(/\\/g,'/').endsWith('/'+key))return'\0report-mock-'+key},
        load(id){if(id==='\0report-harness')return transformWithEsbuild(harness,'report-harness.tsx',{loader:'tsx',jsx:'automatic'});for(const[key,code]of Object.entries(mocks))if(id==='\0report-mock-'+key)return code},
        configureServer(vite){vite.middlewares.use(async(request,response,next)=>{
            if(request.url!=='/fixture')return next();response.setHeader('Content-Type','text/html');
            response.end(await vite.transformIndexHtml('/fixture','<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>4KIS Reports Sample Preview</title><style>.report-fixture{padding:16px;max-width:1500px;margin:auto;min-width:0}</style></head><body><div id="root"></div><script type="module">import*as XLSX from"xlsx";window.XLSX=XLSX.default||XLSX;await import("/report-harness.tsx");</script></body></html>'));
        })},
    },react(),tailwindcss()],
});
let browser,page;
try {
    await server.listen();if(serve){console.log('Sample-only Reports preview: http://127.0.0.1:3025/fixture');await new Promise(()=>{})}
    browser=await chromium.launch({channel:'msedge',headless:true});page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];
    page.on('pageerror',error=>{errors.push(error.message);console.error(error.message)});await page.route('https://**',route=>route.abort());
    await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/fixture');
    const panel=page.getByRole('region',{name:'Report filters',exact:true});
    const ready=()=>page.locator('.report-output .report-card').first().waitFor();
    const choose=async(label,values)=>{await panel.getByRole('button',{name:label,exact:true}).click();await page.getByRole('button',{name:'Clear',exact:true}).click();for(const value of values)await page.getByRole('group',{name:label+' choices',exact:true}).getByRole('checkbox',{name:value,exact:true}).check();await page.keyboard.press('Escape')};
    const all=async label=>{await panel.getByRole('button',{name:label,exact:true}).click();await page.getByRole('button',{name:'Select All',exact:true}).click();await page.keyboard.press('Escape')};
    const apply=async()=>{await panel.getByRole('button',{name:'Apply',exact:true}).click();await ready()};
    await ready();assert.equal(await page.evaluate(()=>window.fixture.requests[0].scope.scopeOwner),'reports_scope');assert.equal(await page.evaluate(()=>window.fixture.requests[0].scope.canViewAllOus),true);
    const initialRequests=await page.evaluate(()=>window.fixture.requests.length);
    await choose('Fund Year',['2025','2027']);await choose('Fund Type',['Current','Continuing']);await choose('Tier',['Tier 1','Tier 2']);await choose('Operating Unit',['RPMO 1']);await choose('Fund Source',['Rice','Corn (inactive)']);
    assert.equal(await page.evaluate(()=>window.fixture.requests.length),initialRequests,'Draft changes do not load');await apply();
    assert.deepEqual(await page.evaluate(()=>window.fixture.requests.at(-1).scope.years),['2025','2027']);assert.equal(await panel.getByLabel('Reporting Year',{exact:true}).inputValue(),'2026');
    assert.deepEqual(await page.evaluate(()=>window.fixture.lastData.subprojects.map(row=>row.id).sort()),[103,105]);
    await choose('Operating Unit',['RPMO 1','RPMO 2']);await choose('Fund Year',['2025','2026','2027']);await apply();
    assert.deepEqual(await page.evaluate(()=>window.fixture.requests.at(-1).scope.operatingUnits),['RPMO 1','RPMO 2']);
    assert.deepEqual(await page.evaluate(()=>window.fixture.lastData.subprojects.map(row=>row.id).sort()),[102,103,104,105]);
    await choose('Operating Unit',['RPMO 1']);await choose('Fund Year',['2025','2027']);await apply();
    await page.evaluate(()=>window.rename());assert.match(await panel.getByRole('button',{name:'Fund Source',exact:true}).innerText(),/Renamed Rice/);
    await choose('Fund Source',[]);assert.equal(await panel.getByRole('button',{name:'Apply',exact:true}).isDisabled(),true);await all('Fund Source');await apply();
    await choose('Fund Source',['Not specified']);await apply();assert.deepEqual(await page.evaluate(()=>window.fixture.lastData.subprojects.map(row=>row.id)),[101]);
    await choose('Fund Source',['Renamed Rice','Corn (inactive)']);await apply();
    await page.getByRole('button',{name:'Sample detail',exact:true}).click();await page.getByRole('button',{name:'Return to report',exact:true}).click();await ready();
    assert.match(await panel.getByRole('button',{name:'Fund Source',exact:true}).innerText(),/Renamed Rice/);
    await page.reload();await ready();assert.match(await panel.getByRole('button',{name:'Fund Year',exact:true}).innerText(),/2025, 2027/);
    await page.screenshot({path:path.join(artifacts,'reports-multiselect.png')});
    await panel.getByRole('button',{name:'Fund Source',exact:true}).click();
    await page.getByRole('searchbox',{name:'Search Fund Source',exact:true}).fill('Rice');
    await page.screenshot({path:path.join(artifacts,'reports-source-menu.png')});
    await page.keyboard.press('ArrowDown');await page.keyboard.press('Escape');
    const tabs=['WFP','BP Forms','BEDS','PICS','BAR1','Budget Utilization','Monthly Matrix','Detailed Accomplishment Data','Financial Audit'];
    for(const tab of tabs){
        await page.getByRole('navigation',{name:'Report tabs'}).getByRole('button',{name:tab,exact:true}).click();await ready();
        assert.equal(await page.locator('.reports-applied-scope').count(),0,'No redundant on-screen scope summary');
        const download=page.locator('.report-output .report-card__header').getByRole('button',{name:/Download XLSX|Download Excel|Export XLSX/}).first();
        await download.click();const modal=page.locator('.report-print-modal');await modal.waitFor();await modal.getByLabel('Prepared By',{exact:true}).fill('Sample Preparer');await modal.getByLabel('Approved By',{exact:true}).fill('Sample Approver');
        const before=await page.evaluate(()=>window.fixture.exports.length);await modal.getByRole('button',{name:'Export XLSX',exact:true}).click();await page.waitForFunction(count=>window.fixture.exports.length>count,before);
        const output=await page.evaluate(()=>window.fixture.exports.at(-1));assert(output.request.scopeLabel.includes('2025, 2027'));assert(output.request.scopeLabel.includes('RY 2026'));assert(output.request.scopeLabel.includes('Renamed Rice'));assert(output.request.sheets.length>0);assert(output.request.sheets.every(sheet=>sheet.rows.length>0));
        if(tab==='Monthly Matrix'){assert(output.request.scopeLabel.includes('Financial history:'));assert.equal(await page.evaluate(()=>window.fixture.requests.at(-1).scope.year),'All');assert.equal(await page.evaluate(()=>window.fixture.requests.at(-1).scope.fundType),'All')}
        if(tab==='Financial Audit')assert.match(await page.locator('.financial-audit-summary-grid').innerText(),/Whole OU\/year ceiling/);
    }
    await page.getByRole('navigation',{name:'Report tabs'}).getByRole('button',{name:'Monthly Matrix',exact:true}).click();await ready();
    await choose('Fund Year',['2027']);await choose('Fund Type',['Current']);await apply();
    assert.equal(await page.evaluate(()=>window.fixture.requests.at(-1).scope.year),'All');
    assert.equal(await page.evaluate(()=>window.fixture.requests.at(-1).scope.fundType),'All');
    const beforeAnnualChange=await page.evaluate(()=>window.fixture.requests.length);
    await panel.getByLabel('Reporting Year',{exact:true}).selectOption('All');await panel.getByRole('button',{name:'Apply',exact:true}).click();
    await page.getByText('Select a Reporting Year.',{exact:true}).waitFor();assert.equal(await page.locator('.report-output .report-card').count(),0);
    await panel.getByLabel('Reporting Year',{exact:true}).selectOption('2026');await apply();
    assert.equal(await page.evaluate(()=>window.fixture.requests.length),beforeAnnualChange,'Reporting period does not refetch an unchanged funding cohort');
    await choose('Fund Year',['2025','2027']);await choose('Fund Type',['Current','Continuing']);await apply();
    await page.getByRole('navigation',{name:'Report tabs'}).getByRole('button',{name:'WFP',exact:true}).click();await ready();
    await page.locator('.report-output .report-card__header').getByRole('button',{name:/Print/}).first().click();const printModal=page.locator('.report-print-modal');await printModal.getByRole('button',{name:'Print',exact:true}).click();await page.waitForFunction(()=>window.fixture.prints.length>0);assert((await page.evaluate(()=>window.fixture.prints[0])).includes('Renamed Rice'));
    await page.locator('.report-output .report-card__header').getByRole('button',{name:'Download XLSX',exact:true}).click();
    const oldExportCount=await page.evaluate(()=>window.fixture.exports.length);
    await page.evaluate(()=>window.selectReportTab('BP Forms'));
    await page.locator('.report-print-modal').getByRole('button',{name:'Export XLSX',exact:true}).click();
    await page.getByText('The report scope changed or is unavailable. Close this dialog and reopen the current report output.',{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>window.fixture.exports.length),oldExportCount,'Pending exports cannot cross report changes');
    await page.getByRole('button',{name:'Close report output dialog',exact:true}).click();
    await page.getByRole('navigation',{name:'Report tabs'}).getByRole('button',{name:'WFP',exact:true}).click();await ready();
    await page.evaluate(()=>{window.fixture.mode='error'});await choose('Fund Year',['2026']);await panel.getByRole('button',{name:'Apply',exact:true}).click();await page.getByRole('alert').waitFor();assert.equal(await page.locator('.report-output .report-card').count(),0,'Failed scope does not expose stale outputs');
    await page.evaluate(()=>{window.fixture.mode='success'});await page.getByRole('button',{name:'Retry',exact:true}).click();await ready();assert.equal(await page.evaluate(()=>window.fixture.requests.at(-1).force),true);
    await page.evaluate(()=>{window.fixture.mode='deferred'});await choose('Fund Year',['2025']);await panel.getByRole('button',{name:'Apply',exact:true}).click();await page.waitForFunction(()=>window.fixture.pending.length===1);await choose('Fund Year',['2027']);await panel.getByRole('button',{name:'Apply',exact:true}).click();await page.waitForFunction(()=>window.fixture.pending.length===2);
    await page.evaluate(()=>window.fixture.pending[1]());await ready();await page.evaluate(()=>window.fixture.pending[0]());await page.waitForTimeout(100);assert.deepEqual(await page.evaluate(()=>window.fixture.lastData.subprojects.map(row=>row.id)),[103]);
    await page.evaluate(()=>{window.fixture.mode='success'});
    await panel.getByRole('button',{name:'Reset',exact:true}).click();await ready();assert.equal(await panel.getByLabel('Reporting Year',{exact:true}).inputValue(),'2026');
    await choose('Fund Year',['2025']);await apply();assert.equal(await panel.getByLabel('Reporting Year',{exact:true}).inputValue(),'2025','Single FY initializes implicit RY');
    await panel.getByLabel('Reporting Year',{exact:true}).selectOption('2026');await apply();await choose('Fund Year',['2027']);await apply();assert.equal(await panel.getByLabel('Reporting Year',{exact:true}).inputValue(),'2026','Explicit RY survives funding changes');
    for(const width of [1440,814,390]){await page.setViewportSize({width,height:1000});await page.screenshot({path:path.join(artifacts,'reports-'+width+'.png')});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'No page overflow at '+width)}
    await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>window.updateUser({id:2,role:'Administrator',operatingUnit:'RPMO 2'},{Reports:'Own OU',Dashboards:'All'}));await ready();assert.equal(await panel.getByRole('button',{name:'Operating Unit',exact:true}).isDisabled(),true);assert.equal(await panel.getByRole('button',{name:'Operating Unit',exact:true}).innerText(),'RPMO 2');assert.equal(await page.getByRole('navigation',{name:'Report tabs'}).getByRole('button',{name:'Financial Audit',exact:true}).count(),0);assert.deepEqual(await page.evaluate(()=>window.fixture.requests.at(-1).scope.operatingUnits),['RPMO 2']);
    await page.evaluate(()=>window.updateUser({id:3,role:'Administrator'},{Reports:'Own OU'}));await page.getByRole('alert').waitFor();assert.equal(await page.locator('.report-output .report-card').count(),0);
    await page.evaluate(()=>window.updateUser({id:1,role:'Super Admin',operatingUnit:'RPMO 1'},{Reports:'All',Dashboards:'Own OU'}));await ready();
    assert.equal(await panel.getByRole('button',{name:'Operating Unit',exact:true}).isDisabled(),false);
    assert.equal(await panel.getByRole('button',{name:'Fund Year',exact:true}).innerText(),'2027','Original account preferences restored without inheriting another account');
    assert.deepEqual(errors,[]);console.log('PASS: all nine actual Reports tabs/exports, independent multi-select Apply/Reset, reference/legacy sources, history scopes, RY isolation, reload/detail return, failure/retry/races, Own OU/account gates and 1440/814/390 layouts. Synthetic read-only client. Artifacts: '+artifacts);
} catch(error){if(page){console.error('Page:',await page.locator('body').innerText());await page.screenshot({path:path.join(artifacts,'failure.png'),fullPage:true})}throw error}
finally{await browser?.close();await server.close()}
