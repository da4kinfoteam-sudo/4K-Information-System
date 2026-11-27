import React,{useEffect,useMemo,useRef,useState} from 'react';
import {BarChart3,Download,Eye,Medal,RefreshCw,SlidersHorizontal,Trophy} from 'lucide-react';
import {awardCellText,awardTime,type AwardActivationSelection,type AwardControllerState,type AwardHistory,type AwardPreview,type AwardResultRecord,type AwardScope,type AwardSnapshot} from '../../lib/awardResultView';
import {awardDashboardTables,awardDisplayError,awardReviewItems} from '../../lib/awardDashboardPresentation';
import {ResourceErrorState,ResourceModal,useResourcesClient} from '../resources/ResourceControls';
import {useAwardReportorial} from '../resources/AwardReportorialInputs';
import AwardResultTable from './AwardResultTable';
import AwardResultImpact from './AwardResultImpact';
import AwardsController from './AwardsController';
import {useAwardsQuery} from './useAwardsQuery';

export interface AwardsRankingsDashboardProps {selectedYear:string;scope:AwardScope;}
type Confirmation={kind:'finalize';preview:AwardPreview;previous:AwardSnapshot|null}|{kind:'restore';record:AwardResultRecord;expectedVersion:number;previous:AwardSnapshot|null}|{kind:'reconcile';selections:AwardActivationSelection[];versions:Array<{record:AwardResultRecord;previous:AwardSnapshot|null}>};
function AwardsView({year,scope,resource}:{year:number;scope:AwardScope;resource:ReturnType<typeof useResourcesClient>;key?:string}){
    const {client,currentUser}=resource,authorized=currentUser?.role==='Super Admin'||currentUser?.role==='Administrator';
    const history=useAwardsQuery<AwardHistory>(client,'history',{year,scope,limit:50},authorized),controller=useAwardsQuery<AwardControllerState>(client,'controller',{year,scope},authorized);
    const [live,setLive]=useState(false),[selection,setSelection]=useState<string|null>(null),[controllerOpen,setControllerOpen]=useState<AwardControllerState|null>(null),[error,setError]=useState(''),[message,setMessage]=useState(''),[saving,setSaving]=useState(false),[exporting,setExporting]=useState(false),[confirmation,setConfirmation]=useState<Confirmation|null>(null),[reason,setReason]=useState(''),[acknowledge,setAcknowledge]=useState(false),[compare,setCompare]=useState<{before:AwardSnapshot;after:AwardSnapshot}|null>(null);
    const pending=useRef(false),operation=useRef<{intent:string;id:string}|null>(null);
    const showLive=live||!!history.data&&!history.data.head.active_result_id&&!selection;
    const preview=useAwardsQuery<AwardPreview>(client,'preview',{year,scope},authorized&&showLive);
    const selectedId=selection||history.data?.head.active_result_id;
    const stored=useAwardsQuery<AwardResultRecord>(client,'result',{resultId:selectedId},authorized&&!showLive&&!!selectedId);
    const record=showLive?null:stored.data,snapshot=showLive?preview.data?.calculation:record?.snapshot;
    const reportorial=useAwardReportorial(year,controller.data?.scope.ous||scope.ous||[],authorized&&!!controllerOpen);
    useEffect(()=>{const refresh=()=>{history.refresh();controller.refresh();if(showLive)preview.refresh();};window.addEventListener('app-data-refreshed',refresh);return()=>window.removeEventListener('app-data-refreshed',refresh);},[history.refresh,controller.refresh,preview.refresh,showLive]);
    const tables=useMemo(()=>snapshot?awardDashboardTables(snapshot):[],[snapshot]);
    const getResult=(id:string)=>client.awards<AwardResultRecord>('result',{resultId:id});
    const runRead=async(run:()=>Promise<void>)=>{setError('');try{await run();}catch(failure){setError(failure instanceof Error?failure.message:'This Awards operation could not be completed.');}};
    const exportSelection=async(target:AwardResultRecord|null,calculation:AwardSnapshot)=>{if(exporting)return;setExporting(true);try{const {downloadAwardWorkbook}=await import('../../lib/awardExcelExport');await downloadAwardWorkbook({record:target,snapshot:calculation});}finally{setExporting(false);}};
    const previousActive=async()=>history.data?.head.active_result_id?(await getResult(history.data.head.active_result_id)).snapshot:null;
    const openRestore=(id:string)=>void runRead(async()=>{const target=await getResult(id);setReason('');setAcknowledge(false);setConfirmation({kind:'restore',record:target,expectedVersion:history.data?.head.version||0,previous:await previousActive()});});
    const openReconcile=(selections:AwardActivationSelection[])=>void runRead(async()=>{
        const versions=[];
        for(const choice of selections){const target=await getResult(choice.resultId),current=await client.awards<AwardHistory>('history',{year:target.awards_year,scope,limit:1});versions.push({record:target,previous:current.head.active_result_id?(await getResult(current.head.active_result_id)).snapshot:null});}
        setReason('');setConfirmation({kind:'reconcile',selections,versions});
    });
    const confirm=async(event:React.FormEvent)=>{
        event.preventDefault();if(pending.current||!confirmation||!reason.trim())return;
        pending.current=true;setSaving(true);setError('');
        try{
            const action=confirmation.kind==='finalize'?'finalize':confirmation.kind==='restore'?'restore':'reconcile',payload=confirmation.kind==='finalize'?{captureId:confirmation.preview.captureId,reason:reason.trim(),acknowledgeWarnings:acknowledge}:confirmation.kind==='restore'?{resultId:confirmation.record.id,expectedVersion:confirmation.expectedVersion,reason:reason.trim()}:{selections:confirmation.selections,reason:reason.trim()};
            const intent=JSON.stringify([action,payload]);if(operation.current?.intent!==intent)operation.current={intent,id:crypto.randomUUID()};
            const response=await client.awards<{id?:string;activation_pending?:boolean}>(action,{...payload,requestId:operation.current.id});operation.current=null;setConfirmation(null);setSelection(null);setLive(false);history.refresh();controller.refresh();setMessage(response.activation_pending?'Results saved. Review related Awards Years using Update Saved Years in Result History before using these results.':'The selected results are now current.');
        }catch(failure){setError(failure instanceof Error?failure.message:'This change could not be confirmed. Retry the same request.');}
        finally{pending.current=false;setSaving(false);}
    };
    if(!authorized)return <p className="dashboard-empty">This dashboard is available only to Administrator and Super Admin users.</p>;
    const failed=error||history.error||controller.error||(showLive?preview.error:stored.error);
    return <div className="awards-dashboard dashboard-view award-versioned-view">
        <header className="award-view-toolbar"><h3 className="dashboard-module-title">Awards And Rankings</h3><div className="resources-row-actions"><button type="button" className="btn btn-secondary" disabled={!controller.data} onClick={()=>setControllerOpen(controller.data)}><SlidersHorizontal aria-hidden="true"/>Awards Controller</button><button type="button" className="btn btn-primary" disabled={!snapshot||exporting} onClick={()=>snapshot&&void runRead(()=>exportSelection(record,snapshot))}><Download aria-hidden="true"/>{exporting?'Preparing...':'Download XLSX'}</button></div></header>
        <ResourceErrorState error={awardDisplayError(failed)} retry={()=>{history.refresh();controller.refresh();if(showLive)preview.refresh();else stored.refresh();}}/>{message&&<p role="status" className="award-message">{message}</p>}
        <div className="award-result-selector"><label className="form-field"><span className="form-label">Results</span><select className="form-control" aria-label="Results" value={showLive?'live':selectedId||''} onChange={event=>{setLive(event.target.value==='live');setSelection(event.target.value==='live'?null:event.target.value);setMessage('');}}><option value="live">Provisional</option>{history.data?.rows.map(row=><option key={row.id} value={row.id}>Finalized Result {row.version}{row.id===history.data?.head.active_result_id?' (Current)':''}</option>)}{selectedId&&!history.data?.rows.some(row=>row.id===selectedId)&&<option value={selectedId}>{record?`Finalized Result ${record.version}`:'Selected Saved Results'}</option>}</select></label>
            <button type="button" className="btn btn-secondary btn-icon" title={showLive?'Refresh Preview':'Reload Saved Results'} aria-label={showLive?'Refresh Preview':'Reload Saved Results'} onClick={()=>showLive?preview.refresh():stored.refresh()}><RefreshCw aria-hidden="true"/></button>
            {record&&<time className="award-saved-date" dateTime={record.finalized_at}>Saved {awardTime(record.finalized_at)}</time>}
            {showLive&&preview.data&&<button type="button" className="btn btn-primary" disabled={!preview.data.calculation.canFinalize||preview.data.calculation.policy.mode!=='Cutoff'} onClick={()=>void runRead(async()=>{setReason('');setAcknowledge(false);setConfirmation({kind:'finalize',preview:preview.data!,previous:await previousActive()});})}><Eye aria-hidden="true"/>Review And Finalize</button>}
        </div>
        {(history.loading||(!snapshot&&(showLive?preview.loading:stored.loading)))&&<p role="status">Loading Awards results...</p>}
        {snapshot&&<><section className="award-summary-grid">{(['overall','financial','physical'] as const).map(key=>{
                const winners=snapshot.results.annual[key].filter(row=>row.rank===1),Icon=key==='overall'?Trophy:key==='financial'?BarChart3:Medal;
                return <article key={key} className={`award-summary-card${key==='overall'?' award-summary-card--gold':''}`}><Icon aria-hidden="true"/><span>{key==='overall'?'Overall Top Performance':key==='financial'?'Top Financial Performance':'Top Physical Performance'}</span>{winners.length?winners.map(row=><div className="award-card-winner" key={row.ou}><strong>{row.ou}</strong><small>{awardCellText(row.totalPoints,'score')} pts</small></div>):<strong>No Data</strong>}</article>;
            })}</section>
            {showLive&&!!snapshot.reconciliation.issues.length&&<section className="award-review-issues"><h3>Review Required</h3><ul>{awardReviewItems(snapshot).map((issue,index)=><li key={index}><strong>{issue.severity==='blocking'?'Review Required':'Warning'}{issue.name?`: ${issue.name}`:''}. </strong>{issue.text}</li>)}</ul></section>}
            <div className="award-ranking-tables">{tables.filter(table=>!table.filterable).map(table=><AwardResultTable key={table.key} table={table}/>)}</div>
            {tables.filter(table=>table.filterable).map(table=><AwardResultTable key={table.key} table={table}/>)}
        </>}
        {controllerOpen&&<AwardsController client={client} year={year} scope={scope} controller={controllerOpen} history={history.data} reportorial={reportorial} onClose={()=>setControllerOpen(null)} onSaved={()=>{setControllerOpen(null);controller.refresh();history.refresh();setLive(true);setSelection(null);preview.refresh();setMessage('Settings saved. Review the provisional results before finalizing. Previously saved results are unchanged.');}} onHistoryRefresh={history.refresh} onView={id=>{setSelection(id);setLive(false);setControllerOpen(null);}} onCompare={id=>void runRead(async()=>{if(snapshot)setCompare({before:snapshot,after:(await getResult(id)).snapshot});})} onExport={id=>void runRead(async()=>{const selected=await getResult(id);await exportSelection(selected,selected.snapshot);})} onRestore={openRestore} onReconcile={openReconcile}/>}
        {compare&&<ResourceModal title="Compare Saved Results" onClose={()=>setCompare(null)} wide><div className="modal-card__body custom-scrollbar"><AwardResultImpact before={compare.before} after={compare.after}/></div><footer className="modal-card__footer"><button type="button" className="btn btn-secondary" onClick={()=>setCompare(null)}>Close</button></footer></ResourceModal>}
        {confirmation&&<ResourceModal title={confirmation.kind==='finalize'?'Finalize Awards Results':confirmation.kind==='restore'?'Restore Saved Results':'Update Saved Years'} busy={saving} onClose={()=>setConfirmation(null)} wide><form className="award-controller-form" onSubmit={confirm}><div className="modal-card__body resources-form-stack custom-scrollbar">{confirmation.kind==='reconcile'?confirmation.versions.map(({record,previous})=><section key={record.id}><h3>Awards Year {record.awards_year} / Result {record.version}</h3><AwardResultImpact before={previous} after={record.snapshot}/></section>):<AwardResultImpact before={confirmation.previous} after={confirmation.kind==='finalize'?confirmation.preview.calculation:confirmation.record.snapshot}/>}<label className="form-field"><span className="form-label">Reason</span><textarea className="form-control" aria-label="Finalization Or Restore Reason" required value={reason} maxLength={4000} onChange={event=>setReason(event.target.value)}/></label>{confirmation.kind==='finalize'&&confirmation.preview.calculation.reconciliation.issues.some(i=>i.severity==='warning')&&<label className="checkbox-label"><input type="checkbox" required checked={acknowledge} onChange={event=>setAcknowledge(event.target.checked)}/>I have reviewed the calculation warnings.</label>}<ResourceErrorState error={awardDisplayError(error)}/></div><footer className="modal-card__footer"><button type="button" className="btn btn-secondary" disabled={saving} onClick={()=>setConfirmation(null)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={saving||!reason.trim()}>{saving?'Saving...':confirmation.kind==='finalize'?'Confirm Finalization':confirmation.kind==='restore'?'Restore Saved Results':'Use Selected Results'}</button></footer></form></ResourceModal>}
    </div>;
}
export default function AwardsRankingsDashboard({selectedYear,scope}:AwardsRankingsDashboardProps){
    const year=/^\d{4}$/.test(selectedYear)?Number(selectedYear):new Date().getFullYear(),resource=useResourcesClient();
    return <AwardsView key={JSON.stringify([resource.identity,year,scope])} year={year} scope={scope} resource={resource}/>;
}
