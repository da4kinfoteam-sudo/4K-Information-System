import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { readFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';

const references = [{uid:'FS-000001',label:'4K Fund',is_active:true},{uid:'FS-000003',label:'Corn',is_active:false},{uid:'FS-000004',label:'Renamed Rice',is_active:true}];
const base = {operatingUnit:'RPMO 1',fundingYear:2025,tier:'Tier 1',fundType:'Continuing',workflow_status:'APPROVED',status:'Completed',name:'Sample',ipo_id:1,indigenousPeopleOrganization:'IPO 1',actualCompletionDate:'2026-02-01',details:[
    {id:1,particulars:'Inputs',pricePerUnit:100,numberOfUnits:1,obligationMonth:'2025-01',disbursementMonth:'2025-03',deliveryDate:'2025-01',isCompleted:true,obligations:[{amount:90,date:'2026-01-01'}],disbursements:[{amount:70,date:'2026-02-01'}]},
    {id:2,particulars:'Inputs',pricePerUnit:200,numberOfUnits:1,obligationMonth:'2025-02',disbursementMonth:'2025-04',deliveryDate:'2025-02',isCompleted:true},
]};
const rows = [
    {...base,id:1,fundSourceUid:'FS-000004',fundSource:'Rice'},
    {...base,id:2,fundSource:'Rice'},
    {...base,id:3,fundSource:' '},
    {...base,id:4,fundingYear:2027,fundType:'Current',tier:'Tier 2',fundSourceUid:'FS-000003'},
    {...base,id:5,operatingUnit:'RPMO 2',fundSourceUid:'FS-000004'},
    {...base,id:6,fundSourceUid:'UNKNOWN',fundSource:'Not a reference'},
    {...base,id:7,workflow_status:'PENDING',fundSourceUid:'FS-000004'},
];
const activities = rows.map(row=>({...row,type:'Training',component:'Social Preparation',participatingIpos:['IPO 1'],participating_ipo_ids:[1],actualDate:'2026-02-01',expenses:row.details}));
const ipos=[{id:1,name:'IPO 1',region:'Region I (Ilocos Region)',registrationDate:'2020-01-01',location:'Sample',totalMembers:12,totalMaleMembers:5,totalFemaleMembers:7}];
const data={subprojects:rows,trainings:activities,otherActivities:[],officeReqs:rows.map(({fundingYear,details,...row})=>({...row,fundYear:fundingYear,equipment:'Office item',amount:100,obligationDate:'2025-01',disbursementDate:'2025-02'})),staffingReqs:[],otherProgramExpenses:[],ipos};
const original=JSON.stringify(data),requests=[];
const tables={ref_fund_sources:references,subprojects:rows,activities,ipos,office_requirements:data.officeReqs};
globalThis.__reportsClient={from(table){const predicates=[];const query={select(){return query},order(){return query},eq(field,value){predicates.push({field,values:[value]});return query},in(field,values){predicates.push({field,values});return query},is(field,value){return query.eq(field,value)},or(){predicates.push({legacy:true});return query},range(start,end){requests.push({table,predicates:structuredClone(predicates)});return Promise.resolve({data:(tables[table]||[]).filter(row=>predicates.every(p=>p.legacy?row.fundSourceUid==null||row.fundSourceUid==='':p.values.includes(row[p.field]))).slice(start,end+1),error:null})}};return query}};
globalThis.window={XLSX:{}};
const vite=await createServer({configFile:false,appType:'custom',server:{middlewareMode:true},optimizeDeps:{noDiscovery:true,include:[],entries:[]},plugins:[{name:'report-readonly-client',enforce:'pre',resolveId(id){if(id.endsWith('/supabaseClient'))return'\0report-client'},load(id){if(id==='\0report-client')return'export const supabase=globalThis.__reportsClient;'}}]});
try {
    const domain=await vite.ssrLoadModule('/lib/reportScope.ts');
    const scopeHelpers=await vite.ssrLoadModule('/lib/dashboardScope.ts');
    const {allSelection:all,selectedValues:select}=scopeHelpers;
    const {operatingUnits}=await vite.ssrLoadModule('/constants.tsx');
    const {getFundSourceFilterValue,UNSPECIFIED_FUND_SOURCE_FILTER:blank}=await vite.ssrLoadModule('/lib/fundSources.ts');
    const {buildAuthorizedDataScope,getDataScopeModule}=await vite.ssrLoadModule('/lib/appDataScope.ts');
    const loader=await vite.ssrLoadModule('/lib/scopedDataFetch.ts');
    const {collectFinancialLineItems}=await vite.ssrLoadModule('/lib/financialAggregation.ts');
    const {buildFinancialAudit}=await vite.ssrLoadModule('/lib/financialAudit.ts');
    const {calculateBAR1ReportData}=await vite.ssrLoadModule('/components/reports/BAR1Calculation.ts');
    const defaults=domain.defaultReportScope('2025');
    const legacy=domain.normalizeReportScope({selectedYear:'2025',selectedOus:['RPMO 1'],selectedTier:'All',selectedFundType:'Continuing'},defaults);
    assert.deepEqual(legacy.operatingUnits,select(['RPMO 1']));assert.deepEqual(legacy.fundSources,all());
    assert.deepEqual(domain.normalizeReportScope({selectedOus:operatingUnits},defaults).operatingUnits,all(),'Legacy full-OU selection keeps All semantics');
    const scope={...legacy,years:select(['2025','2027']),fundTypes:select(['Current','Continuing']),fundSources:select(['FS-000003','FS-000004'])};
    const normal=domain.filterReportData(data,scope,references);
    assert.deepEqual(normal.subprojects.map(row=>row.id),[1,2,4]);
    assert.deepEqual(normal.officeReqs.map(row=>row.id),[1,2,4]);
    assert.deepEqual(domain.filterReportData({...data,officeReqs:data.officeReqs.map(row=>({...row,fundingYear:2099}))},scope,references).officeReqs.map(row=>row.id),[1,2,4],'Program Management uses fundYear, never a fundingYear alias');
    assert.equal(domain.filterReportData(data,{...scope,years:select([])},references).subprojects.length,0,'Empty selections are never All');
    assert.equal(normal.ipos.length,1,'Registry metadata is not funding-year filtered');
    assert.deepEqual(domain.filterReportData({...data,subprojects:[...rows,rows[0]]},scope,references).subprojects.map(row=>row.id),[1,2,4]);
    assert.deepEqual(domain.filterReportData(data,{...scope,fundSources:select([blank])},references).subprojects.map(row=>row.id),[3]);
    assert.deepEqual(domain.filterReportData(data,{...scope,fundSources:all()},references).subprojects.map(row=>row.id),[1,2,3,4,6]);
    assert.equal(getFundSourceFilterValue(rows[5],references),'UNKNOWN');
    const history=domain.reportHistoryScope({...scope,years:select(['2027']),fundTypes:select(['Current'])});
    assert.deepEqual(domain.filterReportData(data,history,references).subprojects.map(row=>row.id),[1,2,4]);
    const raw=domain.reportFetchScope(scope,'BEDS',true,1);
    assert.equal(getDataScopeModule(raw.scopeOwner),'Reports');
    assert.equal(buildAuthorizedDataScope(raw,1,'NPMO',true).canViewAllOus,true,'Reports All does not depend on Dashboard Own');
    assert.deepEqual(buildAuthorizedDataScope(raw,2,'RPMO 2',false).operatingUnits,['RPMO 2']);
    assert.deepEqual(domain.normalizeReportScope(scope,defaults,'').operatingUnits,select([]));
    assert.notEqual(loader.getDataScopeKey(buildAuthorizedDataScope(raw,1,'NPMO',true)),loader.getDataScopeKey(buildAuthorizedDataScope({...raw,scopeOwner:'homepage_scope'},1,'NPMO',true)));
    const loaded=await loader.loadScopedAppData(buildAuthorizedDataScope(raw,1,'NPMO',true));
    assert.deepEqual(loaded.subprojects.map(row=>row.id).sort((a,b)=>a-b),[1,2,4,7]);
    for(const table of ['subprojects','activities','office_requirements']){
        const reads=requests.filter(request=>request.table===table);assert.equal(reads.length,2,'At most UID and legacy branch, never a per-choice product');
        for(const read of reads){assert(read.predicates.some(p=>p.field==='operatingUnit'&&p.values.join()==='RPMO 1'));assert(read.predicates.some(p=>p.field===(table==='office_requirements'?'fundYear':'fundingYear')&&p.values.join()==='2025,2027'));}
    }
    const historyFetch=domain.reportFetchScope(scope,'Monthly Matrix',true,1);assert.equal(historyFetch.year,'All');assert.equal(historyFetch.fundType,'All');assert.equal(historyFetch.years,undefined);assert.deepEqual(historyFetch.fundSourceValues,['FS-000003','FS-000004']);
    const financial=selected=>({subprojects:selected.subprojects,activities:[...selected.trainings,...selected.otherActivities],officeReqs:selected.officeReqs,staffingReqs:[],otherProgramExpenses:[]});
    const input=financial(normal),options={auditAsOfMonth:11,budgetCeilings:[{operating_unit:'RPMO 1',year:2025,amount:2000},{operating_unit:'RPMO 1',year:2027,amount:1000}]};
    const audit=domain.buildReportFinancialAudit(input,scope,options);
    assert(audit.issues.some(issue=>issue.year==='2027'&&issue.issueType==='Target obligation outside selected year'));
    assert.equal(audit.summary.totalBudgetCeiling,3000,'Each whole OU/FY ceiling counted once');
    assert.equal(audit.issues.length,new Set(audit.issues.map(issue=>issue.id)).size);
    for(const fy of ['2025','2027']){
        const single={...scope,years:select([fy])},selected=domain.filterReportData(data,single,references),filters=domain.reportCalculationScope(single);
        assert.deepEqual(domain.buildReportFinancialAudit(financial(selected),single,options),buildFinancialAudit(financial(selected),filters,options),'Single-year financial audit remains identical');
        const old={...data,...Object.fromEntries(['subprojects','trainings','officeReqs'].map(key=>[key,data[key].filter(row=>(!row.workflow_status||row.workflow_status==='APPROVED')&&row.operatingUnit==='RPMO 1'&&String(row.fundingYear??row.fundYear)===fy&&['Current','Continuing'].includes(row.fundType)&&['FS-000003','FS-000004'].includes(getFundSourceFilterValue(row,references)))]))};
        assert.deepEqual(calculateBAR1ReportData(selected,fy,'RPMO 1',{reportingYear:'2026'}),calculateBAR1ReportData(old,fy,'RPMO 1',{reportingYear:'2026'}),'Single-selection physical calculations remain identical');
    }
    const items=collectFinancialLineItems(input,{...domain.reportCalculationScope(scope),actualYear:'2026'});
    assert(items.some(item=>item.targetMonth===0)&&items.some(item=>item.targetMonth===1),'Installments retain distinct target months');
    assert.equal(items.find(item=>item.recordId===1&&item.line.id===1).disb,70,'Actual year stays CY 2026, not FY 2025');
    assert.equal(JSON.stringify(data),original,'Inputs are immutable');
    const label=domain.reportScopeSummary(scope,'2026',references,rows);assert(label.includes('2025, 2027'));assert(label.includes('Renamed Rice'));assert(label.includes('Corn'));
    const {exportReportWorkbook}=await vite.ssrLoadModule('/lib/reportExcelExport.ts');
    const oldFetch=globalThis.fetch,oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL;let exportedBlob;
    globalThis.fetch=async()=>({ok:false});URL.createObjectURL=blob=>{exportedBlob=blob;return'blob:fixture'};URL.revokeObjectURL=()=>{};
    globalThis.document={body:{appendChild(){}},createElement:()=>({click(){},remove(){}})};
    try {
        await exportReportWorkbook({reportName:domain.reportOutputName('BEDS (FY All / RY 2026)'),scopeLabel:label,ouName:'RPMO 1',fileName:'report.xlsx',sheets:[{sheetName:'BEDS',rows:[['Item','Amount'],['Inputs',300]],headerRowCount:1,columnFormats:{1:'money'},columnWidths:[30,20]}]},{preparedBy:'Sample Preparer',approvedBy:'Sample Approver'});
        const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(Buffer.from(await exportedBlob.arrayBuffer()));const sheet=workbook.worksheets[0];
        assert.equal(sheet.getCell('A4').value,label);assert.equal(sheet.getCell('A4').alignment.wrapText,true);assert.equal(sheet.getCell('B7').value,300);assert.equal(sheet.views[0].showGridLines,false);assert(sheet.model.merges.includes('A1:G1'));assert(sheet.getCell('B7').numFmt.includes('#,##0'));
    } finally {globalThis.fetch=oldFetch;URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke;delete globalThis.document;}
    const app=await readFile('App.tsx','utf8');assert(app.includes("['/reports', '/subprojects'"));
    console.log('PASS: Reports scope normalization, independent permissions/OU clamps, UID/legacy/blank/inactive sources, bounded union queries, parent/registry/date/installation safety, monthly history, annual audit checks, single-scope equivalence and real Excel output metadata/formatting. Synthetic client only.');
} finally {delete globalThis.window;delete globalThis.__reportsClient;await vite.close();}
