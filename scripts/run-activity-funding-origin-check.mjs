import assert from 'node:assert/strict';
import { createServer } from 'vite';
import * as XLSX from 'xlsx';

globalThis.window={XLSX};
const server=await createServer({configFile:false,appType:'custom',server:{middlewareMode:true},optimizeDeps:{noDiscovery:true,entries:[]},plugins:[{
 name:'no-network-client',enforce:'pre',resolveId(id){if(id.endsWith('/supabaseClient'))return '\0offline'},load(id){if(id==='\0offline')return 'export const supabase={from(){throw Error("Unexpected database request")},rpc(){throw Error("Unexpected database request")}};'},
}]});
try{
 const budget=await server.ssrLoadModule('/lib/activitySupplementalBudget.ts');
 const {aggregateHomepagePhysicalStats}=await server.ssrLoadModule('/lib/physicalAggregation.ts');
 const {collectFinancialLineItems,aggregateHomepageFinancials}=await server.ssrLoadModule('/lib/financialAggregation.ts');
 const {calculateBAR1ReportData}=await server.ssrLoadModule('/components/reports/BAR1Calculation.ts');
 const {aggregateGadIpoMembership}=await server.ssrLoadModule('/lib/gadIpoMembership.ts');
 const {buildActivityClonePayload}=await server.ssrLoadModule('/lib/recordCloning.ts');
 const line={id:10,objectType:'MOOE',expenseParticular:'Travel',uacsCode:'502',amount:2500,targetScheduleVersion:2,
  targetObligationSchedules:[{id:'o',month:'2026-01-01',amount:2500}],targetDisbursementSchedules:[{id:'d1',month:'2026-03-01',amount:1000},{id:'d2',month:'2026-06-01',amount:1500}],
  obligations:[{id:11,date:'2026-01-12',amount:2000},{id:12,date:'2026-02-01',amount:-100}],disbursements:[{id:13,date:'2026-03-02',amount:900},{id:14,date:'2026-06-02',amount:1000}],
  actualObligationAmount:9999,actualDisbursementAmount:9999};
 const base={id:1,uid:'ACT-ORIGIN',type:'Training',name:'Program Management Training',component:'Program Management',status:'Completed',workflow_status:'APPROVED',fundingYear:2026,operatingUnit:'NPMO',tier:'Tier 1',fundType:'Current',
  date:'2026-02-01',endDate:'2026-02-04',actualDate:'2026-04-01',physical_accomplishment_submitted_at:'2026-04-03T00:00:00Z',participantsMale:10,participantsFemale:10,actualParticipantsMale:3,actualParticipantsFemale:4,
  participatingIpos:['Fixture IPO'],participating_ipo_ids:[1],expenses:[line],isSavings:false,isRealignment:false};
 const ipo={id:1,name:'Fixture IPO',region:'National Capital Region (NCR)',ancestralDomainNo:'AD-1',workflow_status:'APPROVED',maleMembers:3,femaleMembers:4};
 const data=record=>({activities:[record],subprojects:[],officeReqs:[],staffingReqs:[],otherProgramExpenses:[],ipos:[ipo]});
 const filters={year:'2026',actualYear:'2026',operatingUnit:'NPMO',tier:'Tier 1',fundType:'Current'};
 const flatten=value=>Array.isArray(value)?value.flatMap(flatten):value&&typeof value==='object'?[...(value.target&&value.actual?[value]:[]),...Object.values(value).flatMap(flatten)]:[];
 let passed=0;const test=(label,run)=>{run();passed++;console.log('PASS '+label)};
 for(const origin of ['Ordinary','Savings','Realignment']){
  const record={...structuredClone(base),isSavings:origin==='Savings',isRealignment:origin==='Realignment'},tagged=origin!=='Ordinary',original=structuredClone(record);
  test(`${origin}: positive active funding, zero tagged targets and no header duplication`,()=>{
   const result=budget.getActivityBudgetSummary(record);assert.equal(result.target,tagged?0:2500);assert.equal(result.current,2500);assert.equal(result.supplemental,tagged?2500:0);assert.equal(result.obligated,1900);assert.equal(result.disbursed,1900);
   assert.equal(budget.getActivityEditableBudgetExpenses(record).length,tagged?0:1);
   assert.equal(budget.getActivityEditableBudgetExpenses({...record,status:'Proposed'}).length,1);
   assert.equal(budget.getActivityEditableBudgetExpenses(record,true).length,1);
   const modern={...line,id:99,fundingOrigin:'Supplemental',supplementUid:'ledger',supplementStatus:'APPROVED',supplementalSource:'Savings'};
   assert.deepEqual(budget.getActivityEditableBudgetExpenses({...record,status:'Proposed',expenses:[line,modern]}).map(r=>r.id),[10]);
  });
  test(`${origin}: shared financial reports/dashboard reader preserves independent dates and signed actuals once`,()=>{
   const lines=collectFinancialLineItems(data(record),filters);assert.equal(lines.length,1);const result=lines[0];
   assert.equal(result.alloc,tagged?0:2500);assert.equal(result.targetObligationTotal,tagged?0:2500);assert.equal(result.targetDisbursementTotal,tagged?0:2500);
   assert.equal(result.targetObligationSchedules.length,tagged?0:1);assert.equal(result.targetDisbursementSchedules.length,tagged?0:2);
   assert.equal(result.obli,1900);assert.equal(result.disb,1900);assert.equal(result.obligationByMonth[0],2000);assert.equal(result.obligationByMonth[1],-100);assert.equal(result.disbursementByMonth[2],900);assert.equal(result.disbursementByMonth[5],1000);
   assert.equal(aggregateHomepageFinancials(data(record),filters).total.obli,1900);
   const empty=lines=>assert(lines.every(r=>r.alloc===0&&r.obli===0&&r.disb===0&&r.targetObligationTotal===0&&r.targetDisbursementTotal===0));
   empty(collectFinancialLineItems(data({...record,workflow_status:'PENDING'}),filters));
   // Cancellation removes targets, not already-reported signed financial actuals.
   const cancelled=collectFinancialLineItems(data({...record,status:'Cancelled'}),filters)[0];assert.equal(cancelled.alloc,0);assert.equal(cancelled.obli,1900);
   empty(collectFinancialLineItems(data(record),{...filters,operatingUnit:'RPMO 1'}));
   empty(collectFinancialLineItems(data(record),{...filters,year:'2025'}));
   const oldYear=collectFinancialLineItems(data(record),{...filters,actualYear:'2025'});assert(oldYear.every(r=>r.obli===0&&r.disb===0));
  });
  test(`${origin}: Homepage targets excluded while Training/IPO/AD actuals remain`,()=>{
   const result=aggregateHomepagePhysicalStats(data(record),filters);assert.deepEqual(result.trainings,{target:tagged?0:1,actual:1});assert.deepEqual(result.iposAssisted,{target:tagged?0:1,actual:1});assert.deepEqual(result.adsAssisted,{target:tagged?0:1,actual:1});
   assert.equal(aggregateHomepagePhysicalStats(data({...record,workflow_status:'PENDING'}),filters).trainings.actual,0);
   assert.equal(aggregateHomepagePhysicalStats(data({...record,actualDate:''}),filters).trainings.actual,0);
   assert.equal(aggregateHomepagePhysicalStats(data({...record,status:'Cancelled'}),filters).trainings.actual,0);
  });
  for(const type of ['Training','Activity'])test(`${origin}/${type}: BAR1 targets/actuals and existing encoded/as-of date rules remain`,()=>{
   const activity={...record,type,component:'Social Preparation',name:type==='Training'?record.name:'Subproject Monitoring'};
   const input={...data(activity),trainings:type==='Training'?[activity]:[],otherActivities:type==='Activity'?[activity]:[]};
   const rows=flatten(calculateBAR1ReportData(input,'2026','NPMO',{reportingYear:'2026',asOfDate:'2026-04-04'}));
   const conducted=rows.find(r=>r.indicator===(type==='Training'?'Number of Trainings conducted':'Number of Subproject Monitoring conducted'));
   assert(conducted,'BAR1 conducted indicator missing: '+rows.map(r=>r.indicator).join(', '));assert.equal(conducted.target.total,tagged?0:1);assert.equal(conducted.actual.total,1);
   const previous=flatten(calculateBAR1ReportData(input,'2026','NPMO',{reportingYear:'2026',asOfDate:'2026-04-02'}));assert(previous.every(r=>r.actual.total===0));
  });
  test(`${origin}: target-cohort GAD membership is not widened to supplemental IPOs`,()=>{
   const result=aggregateGadIpoMembership(data(record),{year:'2026',operatingUnits:['NPMO'],tier:'All',fundType:'All'});assert.equal(result.rows.length,tagged?0:1);
  });
  test(`${origin}: clones reset origin and actuals without changing source`,()=>{
   const clone=buildActivityClonePayload(record,{createdAt:'2026-11-06',encodedBy:'Fixture',requiresApprover:true});
   assert(!clone.isSavings&&!clone.isRealignment);assert.equal(clone.workflow_status,'PENDING');assert.notEqual(clone.uid,record.uid);assert.notEqual(clone.expenses[0].id,line.id);
   assert.deepEqual(clone.expenses[0].obligations,[]);assert.deepEqual(clone.expenses[0].disbursements,[]);
   if(tagged){assert.equal(clone.expenses[0].fundingOrigin,'SupplementalDraft');assert.equal(clone.expenses[0].supplementStatus,'DRAFT');assert.equal(budget.getActivityBudgetSummary(clone).current,0)}
   assert.deepEqual(record,original);
  });
 }
 console.log(`${passed} funding-origin domain/report calculation checks passed. No external data.`);
}finally{await server.close()}
