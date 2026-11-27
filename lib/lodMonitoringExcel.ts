import type ExcelJS from 'exceljs';
import {LOD_SUMMARY_COLUMNS,type LodSummary} from './lodDashboard.ts';

export interface LodMonitoringExport {summaries:LodSummary[];scope:string;extractedAt?:Date;}
export async function buildLodMonitoringWorkbook({summaries,scope,extractedAt=new Date()}:LodMonitoringExport){
    if(!summaries.length)throw new Error('Select at least one available assessment year.');
    const years=new Set<number>();
    for(const summary of summaries){
        if(!Number.isInteger(summary.year)||summary.year<1900||summary.year>9999||years.has(summary.year))throw new Error('Select valid, distinct assessment years.');
        years.add(summary.year);
    }
    const {default:Excel}=await import('exceljs');
    const workbook=new Excel.Workbook();workbook.creator='4K Information System';workbook.created=extractedAt;workbook.modified=extractedAt;
    const border:Partial<ExcelJS.Borders>={top:{style:'thin',color:{argb:'FFCDD8D2'}},bottom:{style:'thin',color:{argb:'FFCDD8D2'}},left:{style:'thin',color:{argb:'FFCDD8D2'}},right:{style:'thin',color:{argb:'FFCDD8D2'}}};
    const extracted=new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'}).format(extractedAt);
    for(const summary of [...summaries].sort((a,b)=>a.year-b.year)){
        const sheet=workbook.addWorksheet(`LOD Monitoring ${summary.year}`,{views:[{state:'frozen',xSplit:1,ySplit:6,showGridLines:false}],pageSetup:{orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,paperSize:9,showGridLines:false,margins:{left:.3,right:.3,top:.4,bottom:.4,header:.2,footer:.2}}});
        sheet.columns=[{width:Math.max(24,Math.min(48,Math.max(0,...summary.rows.map(row=>row.group.length))+3))},...LOD_SUMMARY_COLUMNS.map(column=>({width:Math.max(12,column.label.length+3)}))];
        const heading=(row:number,text:string,bold=false)=>{sheet.mergeCells(row,1,row,10);const cell=sheet.getCell(row,1);cell.value=text;cell.font={name:'Arial',size:row===1?14:10,bold,color:{argb:'FF174E3B'}};cell.alignment={vertical:'middle',wrapText:true};const width=sheet.columns.reduce((sum,column)=>sum+Number(column.width||12),0)-4;sheet.getRow(row).height=Math.max(row===1?28:22,Math.ceil(text.length/width)*13+8);};
        heading(1,'Level Of Development Monitoring',true);heading(2,`Assessment Year ${summary.year}`);heading(3,scope);heading(4,`Extracted: ${extracted} (Asia/Manila)`);
        sheet.getRow(5).height=8;
        sheet.getRow(6).values=[summary.groupLabel,...LOD_SUMMARY_COLUMNS.map(column=>column.label)];sheet.getRow(6).height=32;
        for(let col=1;col<=10;col++){const cell=sheet.getCell(6,col);cell.font={name:'Arial',size:10,bold:true,color:{argb:'FF174E3B'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE7F1EB'}};cell.alignment={horizontal:'center',vertical:'middle',wrapText:true};cell.border=border;}
        for(const row of [...summary.rows,summary.totals]){
            const total=row===summary.totals,record=sheet.addRow([row.group,...LOD_SUMMARY_COLUMNS.map(column=>row[column.key])]);
            record.height=Math.max(22,Math.ceil(row.group.length/(Number(sheet.getColumn(1).width)-2))*13+8);
            for(let col=1;col<=10;col++){const cell=record.getCell(col);cell.border=border;cell.font={name:'Arial',size:10,bold:total};cell.alignment={horizontal:col===1?'left':'right',vertical:'middle',wrapText:col===1};if(col>1)cell.numFmt='#,##0';if(total)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF0F5F2'}};}
        }
        sheet.autoFilter=`A6:J${6+summary.rows.length}`;sheet.pageSetup.printArea=`A1:J${sheet.rowCount}`;sheet.pageSetup.printTitlesRow='6:6';sheet.headerFooter.oddFooter=`&L4KIS | Assessment Year ${summary.year}&RPage &P of &N`;
    }
    return workbook;
}
export async function downloadLodMonitoringWorkbook(selection:LodMonitoringExport,signal?:AbortSignal){
    if(signal?.aborted)return;
    const workbook=await buildLodMonitoringWorkbook(selection),bytes=await workbook.xlsx.writeBuffer();
    if(signal?.aborted)return;
    const url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})),anchor=document.createElement('a');
    anchor.href=url;anchor.download=`4KIS_LOD_Monitoring_${selection.summaries.map(row=>row.year).sort().join('-')}.xlsx`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
