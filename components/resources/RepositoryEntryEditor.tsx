import React,{useState} from 'react';
import {Save} from 'lucide-react';
import {operatingUnits} from '../../constants';
import {resourceDate,type RepositoryEntry,type ResourcePage,type RepositoryAssignment,type ResourcesClient} from '../../lib/resources';
import {ResourceErrorState,ResourceModal,useResourceAction,useResourceQuery} from './ResourceControls';
import RepositoryOuSelector from './RepositoryOuSelector';

export const repositoryDateOnly=(value?:string|null)=>{
    if(!value)return '';
    const parts=new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'Asia/Manila'}).formatToParts(new Date(value));
    return ['year','month','day'].map(type=>parts.find(part=>part.type===type)?.value).join('-');
};
export const repositoryCurrentYear=()=>Number(new Intl.DateTimeFormat('en',{year:'numeric',timeZone:'Asia/Manila'}).format(new Date()));
export default function RepositoryEntryEditor({client,entry,parentId,kind='Folder',onClose,onSaved}:{client:ResourcesClient;entry?:RepositoryEntry;parentId?:string;kind?:'Folder'|'File';onClose:()=>void;onSaved:(entry:RepositoryEntry)=>void}){
    const [subject,setSubject]=useState(entry?.subject||''),[instructions,setInstructions]=useState(entry?.instructions||'');
    const [required,setRequired]=useState(entry?.required_submission||false),[signed,setSigned]=useState(entry?.requires_signed??true),[awards,setAwards]=useState(entry?.include_awards||false);
    const [year,setYear]=useState(entry?String(entry.reporting_year??''):String(repositoryCurrentYear())),[quarter,setQuarter]=useState(entry?.quarter||''),[date,setDate]=useState(repositoryDateOnly(entry?.due_at));
    const [audience,setAudience]=useState<string[]|null>(entry?.audience_ous||null),[assigned,setAssigned]=useState<string[]|null>(entry?null:[]),[reason,setReason]=useState('');
    const assignments=useResourceQuery<ResourcePage<RepositoryAssignment>>(client,'assignments',{id:entry?.id,page_size:100},!!entry?.required_submission);
    const chosen=assigned??assignments.data?.rows.filter(row=>!row.waived).map(row=>row.operating_unit)??[];
    const published=!!entry&&entry.state!=='Draft',actualKind=entry?.kind||kind;
    const action=useResourceAction(client);
    const impact=useResourceQuery<{current_due_at:string;proposed_due_at:string;rows:{operating_unit:string;old_credit:number|null;proposed_credit:number|null}[]}>(client,'entry_preview',{id:entry?.id,due_date:date},published&&required&&!!date&&date!==repositoryDateOnly(entry?.due_at));
    const submit=async(event:React.FormEvent)=>{
        event.preventDefault();if(required&&entry&&assignments.loading)return;
        const result=await action.run<RepositoryEntry>('entry_save',{...(entry?{id:entry.id}:{}),kind:actualKind,parent_id:entry?.parent_id||parentId||null,subject:subject.trim(),instructions,required_submission:actualKind==='Folder'&&required,requires_signed:signed,include_awards:required&&awards,reporting_year:year?Number(year):null,quarter:required&&quarter?quarter:null,due_date:required?date:null,due_at:required?entry?.due_at||null:null,audience_ous:audience,assigned_ous:required?chosen:[],reason:reason.trim()||null},entry?.version??null);
        if(result)onSaved(result);
    };
    return <ResourceModal title={entry?'Edit Details':actualKind==='File'?'Add Official File':'Create Folder'} onClose={onClose} busy={action.saving} wide>
        <form onSubmit={submit}><div className="modal-card__body resources-form-scroll"><fieldset disabled={action.saving} className="resources-form">
            <label>Subject<input className="form-control" value={subject} maxLength={240} required onChange={event=>setSubject(event.target.value)}/></label>
            <label>Instructions<textarea className="form-control" value={instructions} maxLength={20000} rows={3} onChange={event=>setInstructions(event.target.value)}/></label>
            {actualKind==='Folder'&&<label className="repository-check"><input type="checkbox" className="form-checkbox" checked={required} disabled={published} onChange={event=>setRequired(event.target.checked)}/>Required Submission</label>}
            {!required&&<label>Year<input className="form-control" type="number" min={1900} max={9999} step={1} value={year} required={!entry} disabled={published||entry?.storage_year!=null} onChange={event=>setYear(event.target.value)}/></label>}
            {required&&<>
                <div className="resources-fields"><label>Reporting Year<input className="form-control" type="number" min={1900} max={9999} step={1} value={year} required disabled={published||entry?.storage_year!=null} onChange={event=>setYear(event.target.value)}/></label>
                    <label>Quarter<select className="form-control" value={quarter} required={awards} disabled={published} onChange={event=>setQuarter(event.target.value)}><option value="">None</option>{['Q1','Q2','Q3','Q4'].map(value=><option key={value}>{value}</option>)}</select></label>
                    <label>Deadline<input className="form-control" type="date" value={date} required onChange={event=>setDate(event.target.value)}/></label></div>
                <div className="repository-checkboxes"><label className="repository-check"><input type="checkbox" className="form-checkbox" checked={signed} onChange={event=>setSigned(event.target.checked)}/>Signed Documents Required</label><label className="repository-check"><input type="checkbox" className="form-checkbox" checked={awards} disabled={published} onChange={event=>setAwards(event.target.checked)}/>Include In Awards</label></div>
                <ResourceErrorState error={assignments.error} retry={assignments.refresh}/>{assignments.loading?<p role="status">Loading...</p>:<RepositoryOuSelector label="Assigned OUs" options={operatingUnits} selected={chosen} disabled={assignments.data?.rows.filter(row=>row.waived).map(row=>row.operating_unit)} onChange={setAssigned}/>}
            </>}
            <div className="repository-audience"><label className="repository-check"><input type="checkbox" className="form-checkbox" checked={audience===null} onChange={event=>setAudience(event.target.checked?null:[])}/>All Authorized OUs</label>{audience!==null&&<RepositoryOuSelector label="Audience" options={operatingUnits} selected={audience} onChange={setAudience}/>}</div>
            {published&&<label>Reason For Change<textarea className="form-control" value={reason} rows={2} maxLength={2000} required onChange={event=>setReason(event.target.value)}/></label>}
            {impact.loading&&<p role="status">Checking deadline impact...</p>}<ResourceErrorState error={impact.error} retry={impact.refresh}/>
            {impact.data&&<div className="repository-impact"><h3>Deadline Change</h3><p>{resourceDate(impact.data.current_due_at)} → {resourceDate(impact.data.proposed_due_at)}</p><div className="resources-table-scroll"><table className="data-table resources-table"><thead><tr><th>OU</th><th>Current Credit</th><th>Proposed Credit</th></tr></thead><tbody>{impact.data.rows.map(row=><tr key={row.operating_unit}><td>{row.operating_unit}</td><td>{row.old_credit===null?'Waived':`${row.old_credit*100}%`}</td><td>{row.proposed_credit===null?'Waived':`${row.proposed_credit*100}%`}</td></tr>)}</tbody></table></div></div>}
            <ResourceErrorState error={action.error}/>
        </fieldset></div><footer className="modal-card__footer"><button type="button" className="btn btn-secondary" onClick={onClose} disabled={action.saving}>Cancel</button><button type="submit" className="btn btn-primary" disabled={action.saving||(required&&assignments.loading)||!!assignments.error||impact.loading||!!impact.error}><Save aria-hidden="true"/>{action.saving?'Saving...':'Save'}</button></footer></form>
    </ResourceModal>;
}
