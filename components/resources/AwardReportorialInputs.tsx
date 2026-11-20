import React,{useEffect,useMemo,useState} from 'react';
import {Eye,RefreshCw,Save} from 'lucide-react';
import {resourceAccess,resourceDate,type ReportorialPeriod,type ReportorialEvidence,type ResourcePage} from '../../lib/resources';
import {validateAwardReportorialPeriods} from '../../lib/awardRankings';
import {ResourceErrorState,ResourceModal,ResourceTable,ResourceText,useResourceAction,useResourceQuery,useResourcesClient} from './ResourceControls';

export function useAwardReportorial(year:number,ous:readonly string[],enabled:boolean){
    const {client,currentUser,rolesConfigs}=useResourcesClient();
    const allowed=resourceAccess(currentUser,rolesConfigs,'Documentary Repository');
    const query=useResourceQuery<{periods:ReportorialPeriod[]}>(client,'reportorial',{reporting_year:year,ous},enabled&&allowed);
    const result=useMemo(()=>{
        if(!query.data)return {periods:null,error:''};
        try{validateAwardReportorialPeriods(query.data.periods,year);return {periods:query.data.periods,error:''};}
        catch(error){return {periods:null,error:error instanceof Error?error.message:'Reportorial inputs are unavailable.'};}
    },[query.data,year]);
    useEffect(()=>{
        if(!enabled||!allowed)return;
        const refresh=(event:Event)=>{const mutation=(event as CustomEvent<{mutation?:string}>).detail?.mutation;if(!mutation||/^(reportorial_|entry_|assignment_|submission_)/.test(mutation))query.refresh();};
        window.addEventListener('app-data-refreshed',refresh);
        window.addEventListener('resources-data-changed',refresh);
        return()=>{window.removeEventListener('app-data-refreshed',refresh);window.removeEventListener('resources-data-changed',refresh);};
    },[enabled,allowed,query.refresh]);
    return {...query,...result,client,canManage:resourceAccess(currentUser,rolesConfigs,'Documentary Repository','manage'),error:!allowed?'Repository access is required to verify reportorial source information.':query.error||result.error};
}

type ReportorialState=ReturnType<typeof useAwardReportorial>;
type Snapshot={id:string;version:number;cutoff:string;actor_name:string;reason:string;created_at:string;rule_version:string};
function Evidence({period,client,onClose}:{period:ReportorialPeriod;client:ReportorialState['client'];onClose:()=>void}){
    const [ou,setOu]=useState(''),[page,setPage]=useState(1),[size,setSize]=useState(10);
    const snapshots=useResourceQuery<ResourcePage<Snapshot>>(client,'reportorial_snapshots',{reporting_year:period.reporting_year,quarter:period.quarter,page_size:100});
    const rows=(period.summary?.evidence||[]).filter(row=>!ou||row.operating_unit===ou).map(row=>({...row,id:row.assignment_id}));
    return <ResourceModal title={`${period.quarter} ${period.reporting_year} Reportorial Evidence`} onClose={onClose} wide>
        <div className="modal-card__body resources-form-stack">
            <dl className="repository-detail-meta"><div><dt>Inputs</dt><dd>{period.state==='Finalized'?'Finalized':'Provisional'}</dd></div><div><dt>Cutoff</dt><dd>{resourceDate(period.summary?.cutoff)}</dd></div><div><dt>Rule</dt><dd>On Time 100% / Late 50%</dd></div></dl>
            <ResourceTable<ReportorialEvidence & {id:string}> preferences="award-reportorial-evidence-v1" columns={[
                {key:'ou',label:'OU',locked:true,width:120,render:(row:ReportorialEvidence)=><ResourceText value={row.operating_unit}/>},
                {key:'subject',label:'Requirement',locked:true,width:310,render:row=><a className="resources-record-link" title={row.subject} href={`#/documentary-repository/detail?id=${encodeURIComponent(row.entry_id)}&source=dashboard&sourceView=awards-rankings`}>{row.subject}</a>},
                {key:'due',label:'Deadline',default:true,width:210,render:row=>resourceDate(row.due_at)},
                {key:'submitted',label:'Submitted At',default:true,width:210,render:row=>resourceDate(row.submitted_at)},
                {key:'credit',label:'Credit',locked:true,width:135,render:row=>row.waived?'Waived':row.credit===1?'On Time (100%)':row.credit===.5?'Late (50%)':'Missing (0%)'},
            ]} rows={rows.slice((page-1)*size,page*size)} total={rows.length} page={page} pageSize={size} onPage={setPage} onPageSize={value=>{setSize(value);setPage(1);}} toolbar={<label className="form-field"><span className="form-label">OU</span><select className="form-control" value={ou} onChange={event=>{setOu(event.target.value);setPage(1);}}><option value="">All OUs</option>{[...new Set((period.summary?.evidence||[]).map(row=>row.operating_unit))].sort().map(value=><option key={value}>{value}</option>)}</select></label>}/>
            <ResourceErrorState error={snapshots.error} retry={snapshots.refresh}/>
            {!!snapshots.data?.rows.length&&<details><summary>Finalization History</summary><div className="resources-table-scroll"><table className="data-table resources-table"><thead><tr><th>Version</th><th>Finalized At</th><th>Finalized By</th><th>Reason</th></tr></thead><tbody>{snapshots.data.rows.map(row=><tr key={row.id}><td>{row.version}</td><td>{resourceDate(row.created_at)}</td><td><ResourceText value={row.actor_name}/></td><td><ResourceText value={row.reason}/></td></tr>)}</tbody></table></div></details>}
        </div><footer className="modal-card__footer"><button className="btn btn-secondary" onClick={onClose}>Close</button></footer>
    </ResourceModal>;
}

export function AwardReportorialInputs({state}:{state:ReportorialState}){
    const [edit,setEdit]=useState<{period:ReportorialPeriod;action:'reportorial_source'|'reportorial_finalize'|'reportorial_reopen'}|null>(null),[evidence,setEvidence]=useState<ReportorialPeriod|null>(null),[source,setSource]=useState('Manual'),[reason,setReason]=useState('');
    const action=useResourceAction(state.client);
    const open=(period:ReportorialPeriod,kind:NonNullable<typeof edit>['action'])=>{action.clearError();setReason('');setSource(period.source);setEdit({period,action:kind});};
    const save=async(event:React.FormEvent)=>{
        event.preventDefault();if(!edit)return;
        const result=await action.run(edit.action,{reporting_year:edit.period.reporting_year,quarter:edit.period.quarter,reason:reason.trim(),...(edit.action==='reportorial_source'?{source}:{})},edit.period.version);
        if(result){setEdit(null);state.refresh();}
    };
    return <section className="dashboard-panel award-panel award-reportorial-inputs"><header className="dashboard-panel__header"><h3 className="dashboard-panel__title">Reportorial Inputs</h3><button className="btn btn-secondary btn-icon" title="Refresh Reportorial Inputs" aria-label="Refresh Reportorial Inputs" onClick={state.refresh}><RefreshCw aria-hidden="true"/></button></header>
        <div className="resources-table-scroll"><table className="data-table resources-table"><thead><tr><th>Quarter</th><th>Source</th><th>Inputs</th><th>Cutoff</th><th>Actions</th></tr></thead><tbody>{state.periods?.map(period=><tr key={period.quarter}><td>{period.quarter}</td><td>{period.source}</td><td>{period.source==='Manual'?'Manual':period.state==='Finalized'?'Finalized':'Provisional'}</td><td>{resourceDate(period.summary?.cutoff)}</td><td><div className="resources-row-actions">{period.source==='Repository'&&<button className="btn btn-secondary btn-sm" onClick={()=>setEvidence(period)}><Eye aria-hidden="true"/>View Evidence</button>}{state.canManage&&<>{period.state!=='Finalized'&&<button className="btn btn-secondary btn-sm" onClick={()=>open(period,'reportorial_source')}>Change Source</button>}{period.source==='Repository'&&<button className="btn btn-secondary btn-sm" onClick={()=>open(period,period.state==='Finalized'?'reportorial_reopen':'reportorial_finalize')}>{period.state==='Finalized'?'Reopen':'Finalize'}</button>}</>}</div></td></tr>)}</tbody></table></div>
        {evidence&&<Evidence period={evidence} client={state.client} onClose={()=>setEvidence(null)}/>}
        {edit&&<ResourceModal title={edit.action==='reportorial_source'?'Change Reportorial Source':edit.action==='reportorial_finalize'?'Finalize Reportorial Inputs':'Reopen Reportorial Inputs'} busy={action.saving} onClose={()=>setEdit(null)}>
            <form onSubmit={save}><div className="modal-card__body resources-form-stack">
                <p>{edit.period.quarter} {edit.period.reporting_year}</p>
                {edit.action==='reportorial_source'&&<label className="form-field"><span className="form-label">Source</span><select className="form-control" aria-label="Source" value={source} onChange={event=>setSource(event.target.value)}><option>Manual</option><option>Repository</option></select></label>}
                <label className="form-field"><span className="form-label">Reason</span><textarea className="form-control" aria-label="Reason" required maxLength={4000} value={reason} onChange={event=>setReason(event.target.value)}/></label>
                <ResourceErrorState error={action.error}/>
            </div><footer className="modal-card__footer"><button type="button" className="btn btn-secondary" disabled={action.saving} onClick={()=>setEdit(null)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={action.saving||!reason.trim()}><Save aria-hidden="true"/>{action.saving?'Saving...':'Confirm'}</button></footer></form>
        </ResourceModal>}
    </section>;
}
