import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Download} from 'lucide-react';
import type {LodAssessment} from '../../constants';
import {buildLodMonitoringSummary,LOD_SUMMARY_COLUMNS,type LodRegistryRow} from '../../lib/lodDashboard';
import {DataTablePagination} from '../ui/enterprise';
import {ResourceModal} from '../resources/ResourceControls';

interface Props {
    registry:LodRegistryRow[];assessments:LodAssessment[];availableYears:number[];ownOu:boolean;ownRegion:string;
    regionToOu:ReadonlyMap<string,string>;region:string;province:string;disabled:boolean;
}
export default function LodMonitoringSummary(props:Props){
    const {availableYears,registry,assessments,ownOu,ownRegion,regionToOu,region,province,disabled}=props;
    const preferred=availableYears.includes(new Date().getFullYear())?new Date().getFullYear():availableYears[0];
    const [requestedYear,setYear]=useState(preferred),[page,setPage]=useState(1),[size,setSize]=useState(10);
    const [exportOpen,setExportOpen]=useState(false),[mode,setMode]=useState<'single'|'selected'|'all'>('single'),[selected,setSelected]=useState<number[]>([]),[singleYear,setSingleYear]=useState<number|undefined>(),[saving,setSaving]=useState(false),[error,setError]=useState('');
    const pending=useRef(false),year=availableYears.includes(requestedYear)?requestedYear:preferred;
    const exportRequest=useRef<AbortController|null>(null);
    useEffect(()=>()=>exportRequest.current?.abort(),[]);
    const summary=useMemo(()=>year?buildLodMonitoringSummary({...props,year}):null,[registry,assessments,ownOu,ownRegion,regionToOu,region,province,year]);
    const pages=Math.max(1,Math.ceil((summary?.rows.length||0)/size)),currentPage=Math.min(page,pages);
    const exportYears=mode==='all'?availableYears:mode==='single'?[singleYear].filter((value):value is number=>value!==undefined&&availableYears.includes(value)):selected.filter(value=>availableYears.includes(value));
    const save=async(event:React.FormEvent)=>{
        event.preventDefault();if(pending.current||disabled||!exportYears.length)return;
        pending.current=true;setSaving(true);setError('');const request=new AbortController();exportRequest.current=request;
        try{
            const {downloadLodMonitoringWorkbook}=await import('../../lib/lodMonitoringExcel');
            const scope=[ownOu?regionToOu.get(ownRegion)||ownRegion:region==='All'?'All Authorized OUs':regionToOu.get(region)||region,province==='All'?'All Provinces':province].filter(Boolean).join(' / ');
            await downloadLodMonitoringWorkbook({summaries:exportYears.map(year=>buildLodMonitoringSummary({...props,year})),scope},request.signal);if(!request.signal.aborted)setExportOpen(false);
        }catch(failure){setError(failure instanceof Error?failure.message:'The workbook could not be prepared. Retry the download.');}
        finally{pending.current=false;setSaving(false);if(exportRequest.current===request)exportRequest.current=null;}
    };
    return <>
        <section className="data-table-card data-table-card--seamless lod-summary-section" aria-labelledby="lod-summary-title">
            <header className="lod-summary-header"><h3 id="lod-summary-title" className="dashboard-panel__title">Level Of Development Monitoring</h3><div className="lod-summary-controls">
                <label className="lod-summary-year"><span>Assessment Year</span><select className="form-control" aria-label="Monitoring Assessment Year" value={year??''} disabled={disabled||!availableYears.length} onChange={event=>{setYear(Number(event.target.value));setPage(1);}}>{!availableYears.length&&<option value="">No Assessment Years</option>}{availableYears.map(value=><option key={value} value={value}>{value}</option>)}</select></label>
                <button type="button" className="btn btn-primary" disabled={disabled||!availableYears.length} onClick={()=>{setMode('single');setSingleYear(year);setSelected(year?[year]:[]);setError('');setExportOpen(true);}}><Download size={16} aria-hidden="true"/>Download XLSX</button>
            </div></header>
            <div className="data-table-scroll custom-scrollbar lod-summary-scroll"><table className="data-table lod-summary-table"><colgroup><col style={{width:240}}/>{LOD_SUMMARY_COLUMNS.map(column=><col key={column.key} style={{width:Math.max(100,column.label.length*8+24)}}/>)}</colgroup><thead><tr><th scope="col">{ownOu?'Province':'Operating Unit'}</th>{LOD_SUMMARY_COLUMNS.map(column=><th scope="col" key={column.key}>{column.label}</th>)}</tr></thead>
                <tbody>{summary?.rows.length?summary.rows.slice((currentPage-1)*size,currentPage*size).map(row=><tr key={row.group}><th scope="row" title={row.group}>{row.group}</th>{LOD_SUMMARY_COLUMNS.map(column=><td key={column.key}>{row[column.key].toLocaleString('en-PH')}</td>)}</tr>):<tr><td colSpan={10}>{availableYears.length?'No IPOs match the selected geography.':'No assessment years available.'}</td></tr>}</tbody>
                {summary&&<tfoot><tr><th scope="row">Total</th>{LOD_SUMMARY_COLUMNS.map(column=><td key={column.key}>{summary.totals[column.key].toLocaleString('en-PH')}</td>)}</tr></tfoot>}
            </table></div>
            <DataTablePagination currentPage={currentPage} totalPages={pages} totalItems={summary?.rows.length||0} itemsPerPage={size} onPageChange={setPage} onItemsPerPageChange={value=>{setSize(value);setPage(1);}} pageSizeOptions={[10,20,50]}/>
        </section>
        {exportOpen&&<ResourceModal title="Download LOD Monitoring" busy={saving} onClose={()=>setExportOpen(false)}><form onSubmit={save}><div className="modal-card__body resources-form-stack lod-export-body">
            <fieldset className="lod-export-modes"><legend>Assessment Years</legend>{([['single','Single Year'],['selected','Selected Years'],['all','All Years']] as const).map(([value,label])=><label key={value}><input type="radio" name="lod-export-mode" value={value} checked={mode===value} onChange={()=>setMode(value)}/>{label}</label>)}</fieldset>
            {mode==='single'&&<label className="form-field"><span className="form-label">Assessment Year</span><select className="form-control" aria-label="Export Assessment Year" required value={singleYear??''} onChange={event=>setSingleYear(Number(event.target.value))}>{availableYears.map(value=><option key={value} value={value}>{value}</option>)}</select></label>}
            {mode==='selected'&&<div className="lod-export-years" role="group" aria-label="Select Assessment Years">{availableYears.map(value=><label key={value}><input type="checkbox" checked={selected.includes(value)} onChange={event=>setSelected(current=>event.target.checked?[...new Set([...current,value])]:current.filter(year=>year!==value))}/>{value}</label>)}</div>}
            {error&&<p className="resources-error" role="alert">{error}</p>}
        </div><footer className="modal-card__footer"><button type="button" className="btn btn-secondary" disabled={saving} onClick={()=>setExportOpen(false)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={disabled||saving||!exportYears.length}><Download size={16} aria-hidden="true"/>{saving?'Preparing...':'Download XLSX'}</button></footer></form></ResourceModal>}
    </>;
}
