import type ExcelJS from 'exceljs';
import {awardRankingTables,awardScopeText,awardTime,type AwardCell,type AwardResultRecord,type AwardScope,type AwardSnapshot,type AwardViewTable} from './awardResultView';

export interface AwardExportSelection {snapshot:AwardSnapshot;record:AwardResultRecord|null;extractedAt?:Date;logo?:ArrayBuffer;}
const money='"PHP "#,##0.00;[Red]("PHP "#,##0.00);"PHP "0.00';
const financialFormat=new Intl.NumberFormat('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2});
// OOXML/Excel support A3 (8); ExcelJS's published enum omits that paper size.
const a3PaperSize=8 as ExcelJS.PaperSize;
const border:Partial<ExcelJS.Borders>={top:{style:'thin',color:{argb:'FFB9C6C1'}},bottom:{style:'thin',color:{argb:'FFB9C6C1'}},left:{style:'thin',color:{argb:'FFB9C6C1'}},right:{style:'thin',color:{argb:'FFB9C6C1'}}};
const column=(key:string,label:string,kind:'money'|'text'|'count'='text')=>({key,label,kind,width:kind==='text'?220:180});
const title=(key:string)=>key.replace(/([A-Z])/g,' $1').replace(/\b\w/g,value=>value.toUpperCase());
function evidenceTables(snapshot:AwardSnapshot):AwardViewTable[]{
    const {financial,physical,issues,unresolvedEvents}=snapshot.reconciliation;
    const financialRows=financial.map(row=>({...row,basisSourceFundYear:row.basisSourceFundYear??row.sourceFundYear,basisOu:row.basisOu||row.ou,basisOriginKey:row.basisOriginKey||row.key,transferIds:(row.transferIds||[]).join(', '),replacementItemIds:(row.replacementItemIds||[]).join(', '),recordTargetEligible:String(row.recordTargetEligible??row.targetEligible),targetEligible:String(row.targetEligible),carriedIn:String(row.carriedIn),includedObligationIds:row.includedObligationIds.join(', '),includedDisbursementIds:row.includedDisbursementIds.join(', ')}));
    const financialColumns=[column('ou','OU'),column('name','Item'),column('sourceFundYear','Record Fund Year','count'),column('itemId','Budget Item ID'),...['originalBasis','openingAllotment','openingUnpaidObligations','obligations','disbursements','obligationBasis','closingAllotment','closingUnpaidObligations','targetOpening','targetClosing'].map(key=>column(key,title(key),'money'))];
    const tables:AwardViewTable[]=[{key:'financial-reconciliation',title:'Financial Carry Reconciliation',columns:financialColumns,rows:financialRows},
        {key:'financial-lineage',title:'Financial Basis Lineage',columns:[column('ou','OU'),column('name','Item'),column('itemId','Budget Item ID'),column('basisSourceFundYear','Basis Original Fund Year','count'),column('basisOu','Basis Original OU'),column('basisOriginKey','Basis Origin Reference'),column('transferIds','Transfer References'),column('replacementItemIds','Replacement Item IDs'),column('targetEligible','Basis Included In Targets'),column('recordTargetEligible','Record Included In Targets'),column('includedObligationIds','Recognized Obligation IDs'),column('includedDisbursementIds','Recognized Disbursement IDs')],rows:financialRows},
        {key:'physical-reconciliation',title:'Physical Target Reconciliation',columns:[column('ou','OU'),column('name','Record'),column('sourceFundYear','Original Fund Year','count'),column('component','Component'),column('targetDate','Target Date'),column('actualDate','Actual Date'),column('includedTarget','Included Target'),column('includedActual','Included Actual'),column('carriedIn','Carried In'),column('carriedOut','Carried Out')],rows:physical.map(row=>({...row,targetEligible:String(row.targetEligible),includedTarget:String(row.includedTarget),includedActual:String(row.includedActual),carriedIn:String(row.carriedIn),carriedOut:String(row.carriedOut),ipoKeys:row.ipoKeys.join(', ')}))},
        {key:'calculation-review',title:'Calculation Review',columns:[column('severity','Severity'),column('code','Code'),column('key','Source Reference'),column('message','Review Message')],rows:issues.map(row=>({...row}))},
        {key:'unresolved-events',title:'Unresolved Actual Evidence',columns:[column('id','Event ID'),column('kind','Type'),column('date','Actual Date'),column('month','Actual Month'),column('amount','Reported Amount','money'),column('parentKey','Source Reference')],rows:unresolvedEvents.map(row=>({...row}))}];
    const evidence=snapshot.reportorialPeriods.flatMap(period=>(period.summary?.evidence||[]).map(row=>({quarter:period.quarter,source:period.source,state:period.state,rule:period.summary?.rule_version||'',cutoff:period.summary?.cutoff||'',...row,waived:String(row.waived)})));
    tables.push({key:'reportorial-inputs',title:'Reportorial Inputs',columns:[column('quarter','Quarter'),column('ou','OU'),column('source','Source'),column('state','Inputs'),column('required','Required','count'),column('submitted','Submitted','count'),column('onTime','On Time','count'),column('late','Late','count'),column('missing','Missing','count'),column('credited','Credited Units','count'),column('compliance','Compliance (%)','count')],rows:snapshot.results.quarters.flatMap(quarter=>quarter.physicalComponents.programManagement.map(row=>{const period=snapshot.reportorialPeriods.find(p=>p.quarter===quarter.period),metrics=row.metrics;return {quarter:quarter.period,ou:row.ou,source:period?.source||'Manual',state:period?.state||'Open',required:metrics.reportorialRequired,submitted:metrics.reportorialSubmitted,onTime:metrics.reportorialOnTime??null,late:metrics.reportorialLate??null,missing:metrics.reportorialMissing??null,credited:metrics.reportorialCreditedUnits??null,compliance:metrics.reportorialCompliance};}))});
    tables.push({key:'repository-evidence',title:'Reportorial Evidence',columns:[column('quarter','Quarter'),column('source','Source'),column('state','Inputs'),column('operating_unit','OU'),column('subject','Requirement'),column('due_at','Deadline'),column('submitted_at','Submitted At'),column('credit','Credit','count'),column('waived','Waived'),column('cutoff','Evidence As Of')],rows:evidence});
    return tables;
}
type ExportGroup={label:string;keys:string[]};
const rankKeys=['rank','ou','totalPoints'];
const financialKeys=['allocation','obligation','disbursement'];
const allotmentKeys=['disbursementVsAllotmentRate','points-disbursementVsAllotmentRank','points-disbursementVsAllotmentCompletion'];
const obligationKeys=['disbursementVsObligationRate','points-disbursementVsObligationRank','points-disbursementVsObligationCompletion'];
const physicalKeys=['physicalCompletionRate','points-physicalCompletionRank','points-physicalCompletionBand'];
function exportGroups(table:AwardViewTable):ExportGroup[]{
    if(table.key.startsWith('annual-'))return [
        {label:'Ranking',keys:rankKeys},{label:'Financial Amounts',keys:financialKeys},
        {label:'Disbursement vs Allotment',keys:allotmentKeys},{label:'Disbursement vs Obligation',keys:obligationKeys},
        {label:'Physical Completion',keys:physicalKeys},
        {label:'Financial Consistency',keys:['financialTop4Quarters','points-financialConsistency']},
        {label:'Physical Consistency',keys:['physicalTop4Quarters','points-physicalConsistency']},
        {label:'Attendance',keys:['attendanceMissed','points-nationalAttendance']},
    ];
    if(table.key==='physical-details')return [
        {label:'Ranking And Completion',keys:['period','component','rank','ou','points','score','completionRate']},
        {label:'Physical Accomplishments',keys:['activitiesConducted','iposTrained','trainingsConducted','subprojectsProvided','iposAssisted']},
        {label:'Reportorial Compliance',keys:['reportorialSubmitted','reportorialRequired','reportorialOnTime','reportorialLate','reportorialMissing','reportorialCreditedUnits','reportorialCompliance']},
        {label:'National Activities',keys:['nationalAttended','nationalRequired','nationalAttendance']},
        {label:'Targets',keys:['targetsDue','targetsCompleted']},
    ];
    if(table.key==='financial-details'||table.key.endsWith('-financial'))return [
        {label:'Ranking',keys:['period','rank','ou']},{label:'Financial Amounts',keys:financialKeys},
        {label:'Performance',keys:['obligationRate','disbursementRate','score']},{label:'Award',keys:['points']},
    ];
    return [{label:table.key.endsWith('-physical')?'Quarterly Physical Performance':table.title,keys:table.columns.map(c=>c.key)}];
}
const shortLabels:Record<string,string>={totalPoints:'Points',financialTop4Quarters:'Top 4 Quarters',physicalTop4Quarters:'Top 4 Quarters',disbursementVsAllotmentRate:'Rate (%)',disbursementVsObligationRate:'Rate (%)',physicalCompletionRate:'Completion (%)',attendanceMissed:'Missed',
    'points-disbursementVsAllotmentRank':'Rank Points','points-disbursementVsAllotmentCompletion':'Completion Points','points-disbursementVsObligationRank':'Rank Points','points-disbursementVsObligationCompletion':'Completion Points','points-physicalCompletionRank':'Rank Points','points-physicalCompletionBand':'Completion Points','points-financialConsistency':'Points','points-physicalConsistency':'Points','points-nationalAttendance':'Points'};
export function awardWorkbookTables(snapshot:AwardSnapshot){
    return [...awardRankingTables(snapshot.results),...evidenceTables(snapshot)].map(table=>{
        const groups=exportGroups(table).map(group=>({...group,keys:group.keys.filter(key=>table.columns.some(c=>c.key===key))})).filter(group=>group.keys.length);
        const assigned=new Set(groups.flatMap(group=>group.keys)),other=table.columns.filter(c=>!assigned.has(c.key));
        if(other.length)groups.push({label:'Additional Results',keys:other.map(c=>c.key)});
        return {...table,groups,columns:groups.flatMap(group=>group.keys.map(key=>{const c=table.columns.find(c=>c.key===key)!;return {...c,label:shortLabels[key]||c.label};}))};
    });
}
export async function buildAwardWorkbook({snapshot,record,extractedAt=new Date(),logo}:AwardExportSelection){
    if(record&&record.snapshot!==snapshot&&JSON.stringify(record.snapshot)!==JSON.stringify(snapshot))throw new Error('The selected result and export snapshot differ. Reopen the selected version.');
    const {default:Excel}=await import('exceljs');
    const workbook=new Excel.Workbook();workbook.creator='4K Information System';workbook.created=extractedAt;workbook.modified=extractedAt;
    if(!logo){const response=await fetch('/assets/4klogo.png');if(!response.ok)throw new Error('The official 4K logo could not be loaded. Retry the export.');logo=await response.arrayBuffer();}
    const logoId=workbook.addImage({buffer:logo,extension:'png'}),names=new Set<string>();
    const metadata=[
        `Awards Year ${snapshot.awardsYear} | ${record?`Finalized Result ${record.version}`:'Provisional'}`,
        awardScopeText(snapshot.scope as AwardScope),
        `Physical: ${snapshot.policy.physicalStart} to ${snapshot.policy.physicalCutoff} | Financial: ${snapshot.policy.financialStart} to ${snapshot.policy.financialCutoff} (Asia/Manila, inclusive)`,
        `Source Data As Of: ${awardTime(snapshot.sourceDataAsOf)} | Extracted: ${awardTime(extractedAt.toISOString())} (Asia/Manila)`,
        record?`Finalized: ${awardTime(record.finalized_at)} | By: ${record.finalized_by_name}`:'Provisional calculation; not an official finalized result.',
    ];
    for(const table of awardWorkbookTables(snapshot)){
        const base=table.title.replace(/[\\/*?:\[\]]/g,' ').trim().slice(0,31);let name=base,index=2;while(names.has(name)){const suffix=` ${index++}`;name=base.slice(0,31-suffix.length).trimEnd()+suffix;}names.add(name);
        const count=Math.max(5,table.columns.length),sheet=workbook.addWorksheet(name,{properties:{defaultRowHeight:20},views:[{state:'frozen',xSplit:Math.min(2,table.columns.length),ySplit:11,showGridLines:false}],pageSetup:{orientation:'landscape',paperSize:9,fitToPage:true,fitToWidth:0,fitToHeight:0,scale:100,showGridLines:false,margins:{left:.3,right:.3,top:.4,bottom:.4,header:.2,footer:.2}}});
        sheet.columns=Array.from({length:count},(_,i)=>{
            const c=table.columns[i];
            if(!c)return {width:16};
            const labels=c.label.split(/\s+/),wordWidth=Math.max(...labels.map(word=>word.length))+3;
            const dataWidth=table.rows.reduce((width,row)=>Math.max(width,typeof row[c.key]==='number'?(c.kind==='money'?financialFormat.format(row[c.key] as number).length+7:String(row[c.key]).split('.')[0].length+7):0),0);
            const width=c.kind==='money'?Math.max(23,dataWidth):c.key==='ou'?16:c.key==='rank'?9:c.kind==='text'?Math.max(18,Math.min(42,(c.width||180)/7),wordWidth):Math.max(12,Math.min(20,c.label.length+3),wordWidth,dataWidth);
            return {width};
        });
        sheet.addImage(logoId,{tl:{col:.12,row:.2},ext:{width:58,height:58}});
        const merged=(row:number,start:number,text:string)=>{sheet.mergeCells(row,start,row,count);const cell=sheet.getCell(row,start);cell.value=text;cell.font={name:'Arial',size:10,color:{argb:'FF223D33'}};cell.alignment={vertical:'middle',horizontal:'left',wrapText:true};};
        merged(1,2,'REPUBLIC OF THE PHILIPPINES');merged(2,2,'DEPARTMENT OF AGRICULTURE');merged(3,2,'Kabuhayan at Kaunlaran ng Kababayang Katutubo (4K)');
        for(let i=1;i<=3;i++)sheet.getRow(i).height=20;sheet.getCell(2,2).font={name:'Arial',size:12,bold:true,color:{argb:'FF174E3B'}};
        merged(4,1,table.title);sheet.getCell(4,1).font={name:'Arial',size:13,bold:true,color:{argb:'FF174E3B'}};sheet.getRow(4).height=27;
        const textLines=(value:string,width:number)=>value.split(/\r?\n/).reduce((sum,line)=>sum+Math.max(1,Math.ceil(line.length/Math.max(1,width))),0);
        const headingWidth=sheet.columns.reduce((sum,column)=>sum+Number(column.width||16),0)-4;
        sheet.pageSetup.paperSize=headingWidth>145?a3PaperSize:9;
        // Keep a wide table intact at readable size. Excel may paginate it without
        // manufacturing continuation worksheets or shrinking the workbook text.
        sheet.pageSetup.fitToWidth=headingWidth>190?0:1;
        metadata.forEach((text,i)=>{merged(5+i,1,text);sheet.getRow(5+i).height=Math.min(409,Math.max(i===1||i===4?32:27,textLines(text,headingWidth)*12+10));});
        let groupStart=1;
        for(const group of table.groups){
            const end=groupStart+group.keys.length-1;if(end>groupStart)sheet.mergeCells(10,groupStart,10,end);
            const cell=sheet.getCell(10,groupStart);cell.value=group.label;cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFD5E7DB'}};cell.font={name:'Arial',size:10,bold:true,color:{argb:'FF174E3B'}};cell.alignment={horizontal:'center',vertical:'middle',wrapText:true};
            for(let index=groupStart;index<=end;index++)sheet.getCell(10,index).border=border;
            groupStart=end+1;
        }
        sheet.getRow(10).height=32;
        const header=sheet.getRow(11);header.values=table.columns.map(c=>c.label);header.height=Math.max(38,...table.columns.map((column,index)=>textLines(column.label,Number(sheet.getColumn(index+1).width)-3)*14+12));
        table.columns.forEach((_,i)=>{const cell=header.getCell(i+1);cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE7F1EB'}};cell.font={name:'Arial',size:10,bold:true,color:{argb:'FF174E3B'}};cell.alignment={horizontal:'center',vertical:'middle',wrapText:true};cell.border=border;});
        table.rows.forEach(row=>{const recordRow=sheet.addRow(table.columns.map(c=>row[c.key]??null));recordRow.height=Math.min(409,Math.max(22,...table.columns.map((c,i)=>typeof row[c.key]==='string'?textLines(String(row[c.key]),Number(sheet.getColumn(i+1).width)-2)*12+8:22)));table.columns.forEach((c,i)=>{const cell=recordRow.getCell(i+1);cell.font={name:'Arial',size:10};cell.border=border;cell.alignment={vertical:'middle',horizontal:typeof row[c.key]==='number'?'right':'left',wrapText:typeof row[c.key]==='string'};if(c.kind==='money')cell.numFmt=money;else if(c.kind==='score')cell.numFmt='0.00';else if(c.kind==='percent')cell.numFmt='0.00"%"';else if(c.key==='credited'||c.key==='credit')cell.numFmt='0.0';else if(c.key==='compliance')cell.numFmt='0.00\"%\"';else if(c.kind==='count')cell.numFmt=/fundyear/i.test(c.key)?'0':'#,##0';});});
        if(!table.rows.length){const row=sheet.addRow(['No records.']);for(let i=1;i<=table.columns.length;i++)row.getCell(i).border=border;}
        sheet.autoFilter={from:{row:11,column:1},to:{row:11,column:table.columns.length}};
        sheet.pageSetup.printTitlesRow='10:11';sheet.pageSetup.printTitlesColumn='A:B';sheet.pageSetup.printArea=`A1:${sheet.getColumn(count).letter}${sheet.rowCount}`;
        sheet.headerFooter.oddFooter=`&L4KIS | AY ${snapshot.awardsYear} | ${record?`Finalized v${record.version}`:'Provisional'}&RPage &P of &N`;
    }
    return workbook;
}
export async function downloadAwardWorkbook(selection:AwardExportSelection){
    const workbook=await buildAwardWorkbook(selection),bytes=await workbook.xlsx.writeBuffer(),blob=new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),url=URL.createObjectURL(blob),anchor=document.createElement('a');
    anchor.href=url;anchor.download=`4KIS_Awards_AY${selection.snapshot.awardsYear}_${selection.record?`v${selection.record.version}`:'Provisional'}.xlsx`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
