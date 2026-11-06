import assert from 'node:assert/strict';
import path from 'node:path';
import { createHttpFixture, finish, harnessImports, versions } from './helpers/dcf-revision-http-fixture.mjs';

const harness=`${harnessImports}
import ActivityEdit from './components/ActivityEdit';
import {philippineRegions} from './constants';
const ipos=[{id:1,name:'Fixture IPO',region:philippineRegions[0]}];
function Harness(){const[epoch,setEpoch]=useState(0),[options,setOptions]=useState({});
 window.openCreate=(next={})=>{window.fixture.confirmations=[];setOptions(next);setEpoch(v=>v+1)};
 return <main style={{maxWidth:1200,padding:16,margin:'0 auto',minWidth:0}}><ActivityEdit key={epoch} mode={options.mode||'create'} activity={options.record}
 ipos={ipos} onBack={()=>{window.fixture.back=true}} onUpdateActivity={row=>window.fixture.confirmations.push(row)}
 uacsCodes={{MOOE:{Travel:{'502':'Travel expenses'}}}} referenceActivities={[{id:1,activity_name:'Subproject Monitoring',component:'Program Management',type:'Activity'},{id:2,activity_name:'Program Management Training',component:'Program Management',type:'Training'}]}
 fundSources={[{id:1,uid:'FS-000001',label:'4K Fund',is_active:true,sort_order:1}]}/></main>;
}createRoot(document.getElementById('root')).render(<Harness/>);`;
const f=await createHttpFixture({name:'funding-origin',harness,componentMocks:{
 LocationPicker:`import React from'react';export default function LocationPicker({value,onChange}){return React.createElement('input',{'aria-label':'Location',className:'form-control',value,onChange:e=>onChange(e.target.value)})}`,
 'hooks/useIpoHistory':`export const useIpoHistory=()=>({addIpoHistory:async()=>{}});`,
}});
const {page,db,test}=f;
try{
 await db.exec("insert into reference_activities(id,activity_name,component,type) values(2,'Program Management Training','Program Management','Training')");
 const reset=async(options={})=>{await page.evaluate(options=>window.openCreate(options),options);await page.locator(options.mode==='expenses'?'.subproject-budget-editor':'input[name="fundingYear"]').waitFor()};
 const typeSelect=()=>page.locator('select').filter({has:page.locator('option[value="Subproject Monitoring"]')});
 const conduct=()=>page.locator('select').filter({has:page.locator('option[value="Repeating"]')});
 const expense=async()=>{
  await page.getByRole('button',{name:'Expenses',exact:true}).click();
  await page.getByRole('button',{name:'Add Expense',exact:true}).click();
  const draft=page.locator('.subproject-budget-editor__draft');
  await page.getByRole('combobox',{name:'Expense Particular',exact:true}).fill('Travel');await page.getByRole('option',{name:'Travel',exact:true}).click();
  await page.getByRole('combobox',{name:'UACS Code',exact:true}).fill('502');await page.getByRole('option',{name:'502 - Travel expenses',exact:true}).click();
  await draft.getByRole('spinbutton').fill('2500');
  for(const[stage,month,amount]of [['Obligation','Jan 2026',2500],['Disbursement','Mar 2026',1000],['Disbursement','Jun 2026',1500]]){
   await draft.getByRole('button',{name:'Add '+stage+' Target',exact:true}).click();
   await draft.getByRole('button',{name:new RegExp(stage+' target month')}).last().click();
   await page.getByRole('button',{name:month,exact:true}).click();
   await draft.getByLabel(new RegExp(stage+' target amount')).last().fill(String(amount));
  }
  await page.getByRole('button',{name:'Apply',exact:true}).click();
 };
 const row=()=>page.locator('.subproject-budget-editor tbody').filter({has:page.locator('.subproject-budget-editor__subtotal')});
 for(const type of ['Activity','Training'])for(const mode of ['Single','Multi-day','Repeating'])for(const origin of ['Ordinary','Savings','Realignment'])await test(`${type}/${mode}/${origin}: browser saves confirmed expenses and initial history`,async()=>{
  await reset();
  assert.equal(await page.getByRole('checkbox',{name:'Savings',exact:true}).isChecked(),false);
  assert.equal(await page.getByRole('checkbox',{name:'Realignment',exact:true}).isChecked(),false);
  await page.locator('select[name="component"]').selectOption('Program Management');
  await typeSelect().selectOption(type==='Training'?'Program Management Training':'Subproject Monitoring');
  if(type==='Training')await page.locator('input[name="name"]').fill('Specific Training');
  await page.getByRole('textbox',{name:'Location',exact:true}).fill('Fixture location');
  await conduct().selectOption(mode);
  if(mode==='Repeating'){
   for(const date of ['2026-02-01','2026-04-01']){
    await page.getByLabel('Start Date',{exact:true}).fill(date);
    await page.getByRole('button',{name:'Add to Schedule',exact:true}).click();
   }
  }else{
   await page.locator('input[name="date"]').fill('2026-02-01');
   if(mode==='Multi-day')await page.locator('input[name="endDate"]').fill('2026-02-04');
  }
  await expense();
  const before=await row().innerText();
  await page.getByRole('button',{name:'Basic Info',exact:true}).click();
  await page.getByRole('checkbox',{name:'Savings',exact:true}).check();
  await page.getByRole('checkbox',{name:'Realignment',exact:true}).check();
  assert.equal(await page.getByRole('checkbox',{name:'Savings',exact:true}).isChecked(),false);
  await page.getByRole('checkbox',{name:'Realignment',exact:true}).uncheck();
  if(origin!=='Ordinary')await page.getByRole('checkbox',{name:origin,exact:true}).check();
  await page.getByRole('button',{name:'Expenses',exact:true}).click();
  assert.equal(await row().innerText(),before,'Classification changes must not lose expense rows or schedules');
  assert.match(await page.locator('.subproject-budget-editor tfoot').innerText(),/2,500\.00/);
  assert.equal(await page.getByLabel(/Tag /).count(),0,'No per-item tag controls');
  const prior=f.calls.filter(c=>c.name==='commit_dcf_change').length;
  await page.getByRole('button',{name:'Create Activity',exact:true}).click();
  const count=mode==='Repeating'?2:1;
  await page.waitForFunction(count=>window.fixture.confirmations.length===count,count);
  const saved=await page.evaluate(()=>window.fixture.confirmations);
  assert.equal(f.calls.filter(c=>c.name==='commit_dcf_change').length-prior,count);
  for(const record of saved){
   assert.equal(record.isSavings,origin==='Savings');assert.equal(record.isRealignment,origin==='Realignment');assert.equal(record.type,type);
   assert.equal(record.expenses.length,1);assert.equal(record.expenses[0].amount,2500);assert.equal(record.expenses[0].targetObligationSchedules.length,1);assert.equal(record.expenses[0].targetDisbursementSchedules.length,2);
   const persisted=(await db.query('select * from activities where id=$1',[record.id])).rows[0];assert.deepEqual(persisted.expenses,record.expenses);
   const history=await versions(db,'activities',record.id);assert.equal(history.length,1);assert.equal(history[0].snapshot.record.isSavings,record.isSavings);
  }
 });
 await test('tagged Proposed reload remains budget-editable, with immutable funding classification',async()=>{
  const record=(await db.query('select * from activities where "isSavings"=true and "uid" like \'ACT-%\' order by id desc limit 1')).rows[0];
  await reset({mode:'expenses',record});
  assert.equal(await page.locator('input[name="isSavings"]').count(),0);
  assert.match(await row().innerText(),/Travel/);
  assert.equal(await page.getByRole('button',{name:'Add Expense',exact:true}).isEnabled(),true);
 });
 await test('lost response retains tagged draft and request identity; retry confirms once',async()=>{
  await reset();await page.locator('select[name="component"]').selectOption('Program Management');await typeSelect().selectOption('Subproject Monitoring');
  await page.getByRole('textbox',{name:'Location',exact:true}).fill('Retry fixture');await page.locator('input[name="date"]').fill('2026-02-01');
  await page.getByRole('checkbox',{name:'Savings',exact:true}).check();await expense();
  const prior=f.calls.filter(c=>c.name==='commit_dcf_change').length;
  f.control.loseResponse='commit_dcf_change';
  await page.getByRole('button',{name:'Create Activity',exact:true}).click();
  await page.getByRole('button',{name:'Create Activity',exact:true}).waitFor({state:'visible'});
  await page.waitForFunction(()=>!document.querySelector('button[type="submit"]').disabled);
  assert.match(await row().innerText(),/Travel/);assert.equal(await page.evaluate(()=>window.fixture.confirmations.length),0);
  await page.getByRole('button',{name:'Create Activity',exact:true}).click();
  await page.waitForFunction(()=>window.fixture.confirmations.length===1);
  const calls=f.calls.filter(c=>c.name==='commit_dcf_change').slice(prior);assert.equal(calls.length,2);assert.equal(calls[0].key,calls[1].key);
  const saved=await page.evaluate(()=>window.fixture.confirmations[0]);assert.equal(saved.isSavings,true);assert.equal((await versions(db,'activities',saved.id)).length,1);
 });
 await test('1440/820/390 creation funding controls fit without page overflow',async()=>{
  await reset();
  for(const width of [1440,820,390]){
   await page.setViewportSize({width,height:1000});
   assert.equal(await page.getByRole('checkbox',{name:'Savings',exact:true}).isVisible(),true);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await page.screenshot({path:path.join(f.artifacts,`funding-${width}.png`),fullPage:true});
  }
 });
 finish(f);
}finally{await f.close()}
