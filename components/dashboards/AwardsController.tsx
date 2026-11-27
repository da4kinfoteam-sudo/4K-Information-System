import React,{useRef,useState} from 'react';
import {RotateCcw,Save} from 'lucide-react';
import {DEFAULT_AWARD_SETTINGS,normalizeAwardSettings,type AwardManualScore,type AwardRankingSettings} from '../../lib/awardRankings';
import {awardNextDate,defaultAnnualPolicy,validateAnnualPolicy,type AwardAnnualPolicy} from '../../lib/awardAnnualPolicy';
import {type AwardActivationSelection,type AwardControllerState,type AwardHistory,type AwardScope} from '../../lib/awardResultView';
import type {ResourcesClient} from '../../lib/resources';
import {ResourceErrorState,ResourceModal,ResourceText} from '../resources/ResourceControls';
import {AwardReportorialInputs,type ReportorialState} from '../resources/AwardReportorialInputs';
import {useAwardsQuery} from './useAwardsQuery';
import AwardResultHistory from './AwardResultHistory';
import {awardDisplayError} from '../../lib/awardDashboardPresentation';

const tabs=['Quarterly Rules','Annual Rules','Manual Inputs','Reportorial Inputs','Annual Cutoffs','Result History'] as const;
const periods=['Q1','Q2','Q3','Q4','Year End'] as const;
const labelFor=(key:string)=>key.replace(/([A-Z])/g,' $1').replace(/\b\w/g,v=>v.toUpperCase()).replace(/\bIpos\b/g,'IPOs');
const labelGroups:Record<string,string>={socialPrep:'Social Preparation',productionLivelihood:'Production and Livelihood',marketingEnterprise:'Marketing and Enterprise',programManagement:'Program Management'};
const json=(value:unknown)=>JSON.stringify(value);
function manualRows(state:AwardControllerState,year:number):AwardManualScore[]{
    return periods.flatMap(period=>(state.scope.ous||[]).map(ou=>state.manual.find(row=>row.period===period&&row.operating_unit===ou)||{fund_year:year,period,operating_unit:ou,reportorial_required:0,reportorial_submitted:0,national_activities_required:0,national_activities_attended:0,remarks:''}));
}
function NumberMap({title,values,onChange}:{title:string;values:Record<string,number>;onChange:(values:Record<string,number>)=>void;key?:string}){
    return <fieldset className="award-rule-fields"><legend>{title}</legend>{Object.entries(values).map(([key,value])=><label className="form-field" key={key}><span className="form-label">{/^\d+$/.test(key)?key:labelFor(key)}</span><input className="form-control" type="number" min="0" max="1000000000" step="any" required value={value} onChange={event=>onChange({...values,[key]:Number(event.target.value)})}/></label>)}</fieldset>;
}
export default function AwardsController({client,year,scope,controller,history,reportorial,onClose,onSaved,onHistoryRefresh,onView,onCompare,onExport,onRestore,onReconcile}: {
    client:ResourcesClient;year:number;scope:AwardScope;controller:AwardControllerState;history:AwardHistory|null;reportorial:ReportorialState;
    onClose:()=>void;onSaved:()=>void;onHistoryRefresh:()=>void;onView:(id:string)=>void;onCompare:(id:string)=>void;onExport:(id:string)=>void;onRestore:(id:string)=>void;onReconcile:(selections:AwardActivationSelection[])=>void;
}){
    const [tab,setTab]=useState<typeof tabs[number]>('Quarterly Rules'),[settings,setSettings]=useState(()=>normalizeAwardSettings(controller.settings)),[manual,setManual]=useState(()=>manualRows(controller,year)),[policy,setPolicy]=useState<AwardAnnualPolicy>(()=>controller.policy?.policy||defaultAnnualPolicy(year)),[manualPeriod,setManualPeriod]=useState<typeof periods[number]>('Q1');
    const [reason,setReason]=useState(''),[saving,setSaving]=useState(false),[error,setError]=useState(''),[discard,setDiscard]=useState(false);
    const pending=useRef(false),request=useRef<{intent:string;id:string}|null>(null);
    const [baselineCursors,setBaselineCursors]=useState<number[]>([]);
    const baseline=useAwardsQuery<AwardHistory>(client,'history',{year:year-1,scope,before:baselineCursors.at(-1),limit:50},tab==='Annual Cutoffs');
    const dirty=json(settings)!==json(normalizeAwardSettings(controller.settings))||json(manual)!==json(manualRows(controller,year))||json(policy)!==json(controller.policy?.policy||defaultAnnualPolicy(year));
    const close=()=>{if(saving)return;if(dirty)setDiscard(true);else onClose();};
    const change=<K extends keyof AwardRankingSettings>(key:K,value:AwardRankingSettings[K])=>setSettings(current=>({...current,[key]:value}));
    const save=async(event:React.SyntheticEvent)=>{
        event.preventDefault();if(pending.current||!dirty)return;
        setError('');
        try{
            validateAnnualPolicy(policy);if(!reason.trim())throw new Error('Provide a reason for the controller changes.');
            pending.current=true;setSaving(true);
            const payload={year,scope,settings,manual,policy,expectedVersion:controller.controller_version,reason:reason.trim()},intent=json(payload);
            if(request.current?.intent!==intent)request.current={intent,id:crypto.randomUUID()};
            await client.awards('save_controller',{...payload,requestId:request.current.id});request.current=null;onSaved();
        }catch(failure){setError(failure instanceof Error?failure.message:'The controller could not be saved. Retry the same changes.');}
        finally{pending.current=false;setSaving(false);}
    };
    const patchManual=(ou:string,field:keyof AwardManualScore,value:string)=>setManual(current=>current.map(row=>row.period===manualPeriod&&row.operating_unit===ou?{...row,[field]:field==='remarks'?value:Math.max(0,Math.floor(Number(value)||0))}:row));
    return <ResourceModal title="Awards Controller" onClose={close} busy={saving} wide>
        <div className="award-controller-form">
            <div className="award-controller-tabs" role="tablist" aria-label="Awards Controller" onKeyDown={event=>{if(!['ArrowRight','ArrowLeft','Home','End'].includes(event.key))return;event.preventDefault();const index=tabs.indexOf(tab),next=tabs[event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length];setTab(next);document.getElementById(`award-tab-${tabs.indexOf(next)}`)?.focus();}}>{tabs.map((name,index)=><button id={`award-tab-${index}`} key={name} type="button" role="tab" aria-selected={tab===name} aria-controls="award-controller-panel" tabIndex={tab===name?0:-1} onClick={()=>setTab(name)}>{name}</button>)}</div>
            <div id="award-controller-panel" role="tabpanel" aria-labelledby={`award-tab-${tabs.indexOf(tab)}`} className="modal-card__body resources-form-stack custom-scrollbar">
                {tab==='Quarterly Rules'&&<div className="award-rules-grid">
                    {(Object.entries(settings.quarterlyPhysicalWeights) as Array<[string,Record<string,number>]>).map(([key,values])=><NumberMap key={key} title={labelGroups[key]} values={values} onChange={value=>change('quarterlyPhysicalWeights',{...settings.quarterlyPhysicalWeights,[key]:value})}/>)}
                    <NumberMap title="Quarter Rank Points" values={settings.quarterlyRankPoints} onChange={value=>change('quarterlyRankPoints',value)}/>
                    <NumberMap title="Financial Weights" values={settings.quarterlyFinancialWeights} onChange={value=>change('quarterlyFinancialWeights',value as AwardRankingSettings['quarterlyFinancialWeights'])}/>
                    <NumberMap title="Other Quarter Points" values={{quarterlyRestPoints:settings.quarterlyRestPoints,quarterlyZeroCompletionPoints:settings.quarterlyZeroCompletionPoints}} onChange={values=>setSettings(current=>({...current,...values}))}/>
                </div>}
                {tab==='Annual Rules'&&<div className="award-rules-grid">
                    <NumberMap title="Rank Points" values={settings.annualRankPoints} onChange={value=>change('annualRankPoints',value)}/>
                    <NumberMap title="Consistency Points By Quarter Count" values={settings.annualConsistencyPoints} onChange={value=>change('annualConsistencyPoints',value)}/>
                    <NumberMap title="Attendance Points By Missed Count" values={settings.annualAttendanceMissedPoints} onChange={value=>change('annualAttendanceMissedPoints',value)}/>
                    {(['annualFinancialCompletionBands','annualPhysicalCompletionBands'] as const).map(key=><fieldset className="award-rule-fields" key={key}><legend>{key==='annualFinancialCompletionBands'?'Financial Completion Bands':'Physical Completion Bands'}</legend>{settings[key].map((band,index)=><React.Fragment key={index}><label className="form-field"><span className="form-label">Minimum %</span><input className="form-control" type="number" min="0" step="any" required value={band.min} onChange={event=>change(key,settings[key].map((b,i)=>i===index?{...b,min:Number(event.target.value)}:b))}/></label><label className="form-field"><span className="form-label">Points</span><input className="form-control" type="number" min="0" step="any" required value={band.points} onChange={event=>change(key,settings[key].map((b,i)=>i===index?{...b,points:Number(event.target.value)}:b))}/></label></React.Fragment>)}</fieldset>)}
                </div>}
                {tab==='Manual Inputs'&&<><div className="award-toggle-group" role="group" aria-label="Manual Input Period">{periods.map(period=><button type="button" key={period} className={period===manualPeriod?'is-active':''} aria-pressed={period===manualPeriod} onClick={()=>setManualPeriod(period)}>{period}</button>)}</div>
                    <div className="resources-table-scroll award-manual-scroll"><table className="data-table resources-table"><thead><tr><th>OU</th><th>Reports Required</th><th>Reports Submitted</th><th>Activities Required</th><th>Activities Attended</th><th>Remarks</th></tr></thead><tbody>{manual.filter(row=>row.period===manualPeriod).map(row=>{
                        const period=reportorial.periods?.find(p=>p.quarter===manualPeriod),repository=period?.source==='Repository',total=period?.summary?.rows.find(r=>r.operating_unit===row.operating_unit);
                        return <tr key={row.operating_unit}><td>{row.operating_unit}</td>{(['reportorial_required','reportorial_submitted','national_activities_required','national_activities_attended','remarks'] as const).map(field=><td key={field}>{repository&&field.startsWith('reportorial_')?<span title="From Documentary Repository">{field==='reportorial_required'?total?.required||0:(total?.on_time||0)+(total?.late||0)}</span>:<input className="form-control" aria-label={`${row.operating_unit} ${labelFor(field.replaceAll('_',' '))}`} type={field==='remarks'?'text':'number'} min={field==='remarks'?undefined:0} step={1} value={row[field]??''} onChange={event=>patchManual(row.operating_unit,field,event.target.value)}/>}</td>)}</tr>;
                    })}</tbody></table></div><ResourceErrorState error={reportorial.error} retry={reportorial.refresh}/></>}
                {tab==='Reportorial Inputs'&&<><ResourceErrorState error={reportorial.error} retry={reportorial.refresh}/><AwardReportorialInputs state={reportorial} embedded/></>}
                {tab==='Annual Cutoffs'&&<>
                    <div className="award-policy-fields"><label className="form-field"><span className="form-label">Annual Recognition</span><select className="form-control" aria-label="Annual Recognition" value={policy.mode} onChange={event=>setPolicy(current=>({...current,mode:event.target.value as AwardAnnualPolicy['mode']}))}><option value="Legacy">Standard Calculation</option><option value="Cutoff">Annual Cutoffs</option></select></label>
                    <label className="form-field"><span className="form-label">Previous Year's Results</span><select className="form-control" aria-label="Previous Year's Results" value={policy.baselineResultId||''} onChange={event=>{const row=baseline.data?.rows.find(r=>r.id===event.target.value);setPolicy(current=>({...current,baselineResultId:row?.id||null,physicalStart:row?awardNextDate(row.policy.physicalCutoff):`${year}-01-01`,financialStart:row?awardNextDate(row.policy.financialCutoff):`${year}-01-01`,transitionApproved:false}));}}><option value="">No Previous Saved Results</option>{baseline.data?.rows.filter(row=>row.policy.mode==='Cutoff').map(row=><option key={row.id} value={row.id}>Awards Year {year-1} / Result {row.version}{row.id===baseline.data?.head.active_result_id?' (Current)':''}</option>)}{policy.baselineResultId&&!baseline.data?.rows.some(row=>row.id===policy.baselineResultId)&&<option value={policy.baselineResultId}>Previously Selected Results</option>}</select></label>
                    {(['physicalStart','physicalCutoff','financialStart','financialCutoff'] as const).map(key=><label className="form-field" key={key}><span className="form-label">{labelFor(key)}</span><input type="date" className="form-control" aria-label={labelFor(key)} required value={policy[key]} onChange={event=>setPolicy(current=>({...current,[key]:event.target.value,transitionApproved:false}))}/></label>)}</div>
                    <label className="checkbox-label"><input type="checkbox" checked={policy.transitionApproved} onChange={event=>setPolicy(current=>({...current,transitionApproved:event.target.checked}))}/>I have reviewed the cutoff dates and selected previous results.</label>
                    <ResourceErrorState error={awardDisplayError(baseline.error)} retry={baseline.refresh}/>
                    <div className="resources-row-actions" aria-label="Previous Results Pages"><button type="button" className="btn btn-secondary btn-sm" disabled={!baselineCursors.length||baseline.loading} onClick={()=>setBaselineCursors(current=>current.slice(0,-1))}>Newer</button><button type="button" className="btn btn-secondary btn-sm" disabled={baseline.data?.rows.length!==50||baseline.loading} onClick={()=>setBaselineCursors(current=>[...current,baseline.data!.rows.at(-1)!.version])}>Older</button></div>
                </>}
                {tab==='Result History'&&<AwardResultHistory client={client} year={year} scope={scope} history={history} onRefresh={onHistoryRefresh} onView={onView} onCompare={onCompare} onExport={onExport} onRestore={onRestore} onReconcile={onReconcile}/>}
                {tab!=='Result History'&&tab!=='Reportorial Inputs'&&<label className="form-field"><span className="form-label">Reason</span><textarea className="form-control" aria-label="Controller Change Reason" value={reason} maxLength={4000} onChange={event=>setReason(event.target.value)}/></label>}
                <ResourceErrorState error={awardDisplayError(error)}/>
            </div>
            <footer className="modal-card__footer"><button type="button" className="btn btn-secondary" disabled={saving} onClick={()=>setSettings(structuredClone(DEFAULT_AWARD_SETTINGS))}><RotateCcw aria-hidden="true"/>Reset Scoring Rules</button><span className="award-draft-status" role="status">{dirty?'Unsaved Changes':'Saved'}</span><button type="button" className="btn btn-secondary" disabled={saving} onClick={close}>Close</button><button type="button" className="btn btn-primary" disabled={saving||!dirty||!reason.trim()} onClick={save}><Save aria-hidden="true"/>{saving?'Saving...':'Save And Preview'}</button></footer>
        </div>
        {discard&&<ResourceModal title="Discard Controller Changes?" onClose={()=>setDiscard(false)}><div className="modal-card__body">The unsaved controller draft will be discarded.</div><footer className="modal-card__footer"><button type="button" className="btn btn-secondary" onClick={()=>setDiscard(false)}>Keep Editing</button><button type="button" className="btn btn-danger" onClick={onClose}>Discard</button></footer></ResourceModal>}
    </ResourceModal>;
}
