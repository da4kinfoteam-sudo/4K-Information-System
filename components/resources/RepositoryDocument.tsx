import React,{useEffect,useRef,useState} from 'react';
import {Archive,Pause,Pencil,RefreshCw,Send,Upload,XCircle} from 'lucide-react';
import {operatingUnits} from '../../constants';
import {resourceDate,resourceFileFingerprint,resourceOperation,ResourcesClientError,type RepositoryEntry,type RepositoryFile,type ResourceOperation,type ResourcePage,type ResourcesClient} from '../../lib/resources';
import {RESOURCE_FORMATS,resourceFilePolicy} from '../../supabase/functions/_shared/resourcesProtocol';
import {ResourceErrorState,ResourceModal,useResourceAction,useResourceQuery} from './ResourceControls';
import RepositoryOuSelector from './RepositoryOuSelector';
import {repositoryCurrentYear} from './RepositoryEntryEditor';
const Preview=React.lazy(()=>import('./RepositoryFilePreview'));
const path=(id:string)=>'/documentary-repository/detail?id='+encodeURIComponent(id);
const accept=Object.keys(RESOURCE_FORMATS).map(extension=>'.'+extension).join(',');
type DocumentFields={subject:string;instructions:string;reporting_year:number|null;audience_ous:string[]|null};
type UploadState={entryId:string|null;intent:RepositoryFile|null;file:File|null;progress:number;busy:boolean;status:string;error:string;revision:number;locked:boolean};
const emptyUpload:UploadState={entryId:null,intent:null,file:null,progress:0,busy:false,status:'',error:'',revision:0,locked:false};

export function useDocumentUpload(client:ResourcesClient,onNavigate:(path:string)=>void){
    const [state,setState]=useState<UploadState>(emptyUpload),latest=useRef(state),controller=useRef<AbortController|null>(null),pending=useRef(false),alive=useRef(true);
    const create=useRef<ResourceOperation|null>(null),reserve=useRef<ResourceOperation|null>(null),generation=useRef(0);
    const update=(patch:Partial<UploadState>)=>{latest.current={...latest.current,...patch};if(alive.current)setState(latest.current);};
    useEffect(()=>{alive.current=true;return()=>{alive.current=false;controller.current?.abort();};},[]);
    const run=async(file:File,entryId?:string,intent?:RepositoryFile,fields?:DocumentFields,parentId?:string|null)=>{
        if(pending.current)return;pending.current=true;controller.current=new AbortController();const current=generation.current,abort=controller.current;
        const patch=(value:Partial<UploadState>)=>{if(current===generation.current&&alive.current)update(value);};
        update({busy:true,error:'',status:'Uploading',file,entryId:entryId||latest.current.entryId,intent:intent||latest.current.intent});
        try{
            const policy=resourceFilePolicy(file.name,file.size,file.type),hash=await resourceFileFingerprint(file);
            if(controller.current.signal.aborted)throw new Error('Upload paused.');
            if(!latest.current.entryId){
                if(!create.current){if(!fields)throw new Error('Enter the document details.');create.current=resourceOperation(null,'entry_save',{...fields,kind:'File',parent_id:parentId||null});}
                update({locked:true});const entry=await client.mutate<RepositoryEntry>(create.current);
                if(!alive.current||current!==generation.current)return;update({entryId:entry.id});onNavigate(path(entry.id));
            }
            if(controller.current.signal.aborted)throw new Error('Upload paused.');
            if(!latest.current.intent){
                reserve.current=resourceOperation(reserve.current,'file_reserve',{entry_id:latest.current.entryId,assignment_id:null,file_name:file.name,file_size:file.size,mime_type:policy.mime,file_sha256:hash});
                update({locked:true});const result=await client.mutate<RepositoryFile>(reserve.current);if(!alive.current||current!==generation.current)return;update({intent:result});
            }
            await client.upload(file,latest.current.intent!, (done,total)=>patch({progress:Math.round(done/total*100)}),abort.signal);
            patch({status:'Ready',progress:100,revision:latest.current.revision+1});
            window.dispatchEvent(new CustomEvent('resources-data-changed',{detail:{mutation:'document_upload'}}));
        }catch(error){
            if(current!==generation.current||!alive.current)return;const aborted=abort.signal.aborted;
            if(!latest.current.entryId&&error instanceof ResourcesClientError&&error.status>=400&&error.status<500){create.current=null;update({locked:false});}
            update({status:aborted?'Paused':'Interrupted',error:aborted?'':error instanceof Error?error.message:'Upload interrupted. Retry the same upload.'});
        }finally{pending.current=false;patch({busy:false});}
    };
    return {state,run,pause:()=>controller.current?.abort(),reset:()=>{generation.current++;controller.current?.abort();create.current=null;reserve.current=null;update({...emptyUpload,revision:latest.current.revision});}};
}
export type DocumentUpload=ReturnType<typeof useDocumentUpload>;

function DocumentInputs({values,onChange,yearLocked=false,yearRequired=true}:{values:DocumentFields;onChange:(value:DocumentFields)=>void;yearLocked?:boolean;yearRequired?:boolean}){
    return <><label>Subject<input className="form-control" value={values.subject} maxLength={240} required onChange={event=>onChange({...values,subject:event.target.value})}/></label>
        <label>Description<textarea className="form-control" rows={3} maxLength={20000} value={values.instructions} onChange={event=>onChange({...values,instructions:event.target.value})}/></label>
        <label>Year<input className="form-control" type="number" min={1900} max={9999} step={1} value={values.reporting_year??''} required={yearRequired} disabled={yearLocked} onChange={event=>onChange({...values,reporting_year:event.target.value?Number(event.target.value):null})}/></label>
        <div className="repository-audience"><label className="repository-check"><input type="checkbox" className="form-checkbox" checked={values.audience_ous===null} onChange={event=>onChange({...values,audience_ous:event.target.checked?null:[]})}/>All Authorized OUs</label>{values.audience_ous!==null&&<RepositoryOuSelector label="Audience" options={operatingUnits} selected={values.audience_ous} onChange={audience_ous=>onChange({...values,audience_ous})}/>}</div></>;
}
function UploadProgress({flow}:{flow:DocumentUpload}){
    const state=flow.state;
    return <div className="repository-document-upload-status" aria-live="polite">{state.status&&<><span title={state.file?.name}>{state.file?.name}</span><span>{state.status}</span><progress value={state.progress} max={100} aria-label="Document upload progress"/></>}<ResourceErrorState error={state.error}/></div>;
}
export function RepositoryDocumentCreate({flow,parentId,onNavigate}:{flow:DocumentUpload;parentId?:string|null;onNavigate:(path:string)=>void}){
    const [values,setValues]=useState<DocumentFields>({subject:'',instructions:'',reporting_year:repositoryCurrentYear(),audience_ous:null}),[file,setFile]=useState<File|null>(null),[error,setError]=useState('');
    return <div className="data-list-page resources-page repository-document-page"><header className="page-header"><h1>Upload Document</h1></header>
        <form className="repository-document-form" onSubmit={event=>{event.preventDefault();if(file)void flow.run(file,undefined,undefined,{...values,subject:values.subject.trim()},parentId);}}>
            <fieldset className="resources-form" disabled={flow.state.busy||flow.state.locked}><DocumentInputs values={values} onChange={setValues}/>
                <label className="repository-upload-picker">File<input type="file" accept={accept} required onChange={event=>{const selected=event.target.files?.[0]||null;try{if(selected)resourceFilePolicy(selected.name,selected.size,selected.type);setFile(selected);setError('');}catch(failure){setFile(null);setError(failure instanceof Error?failure.message:'Choose a supported file.');event.target.value='';}}}/></label>
            </fieldset><ResourceErrorState error={error}/><UploadProgress flow={flow}/>
            <div className="repository-document-actions"><button type="button" className="btn btn-secondary" disabled={flow.state.busy||flow.state.locked} onClick={()=>onNavigate(parentId?path(parentId):'/documentary-repository')}>Cancel</button>{flow.state.busy?<button type="button" className="btn btn-secondary" onClick={flow.pause}><Pause aria-hidden="true"/>Pause Upload</button>:<button type="submit" className="btn btn-primary" disabled={!file}><Upload aria-hidden="true"/>{flow.state.locked?'Retry Upload':'Upload'}</button>}</div>
        </form></div>;
}
export function RepositoryStorageSync({client,entry,onChanged}:{client:ResourcesClient;entry:RepositoryEntry;onChanged:()=>void}){
    const [busy,setBusy]=useState(false),[error,setError]=useState('');
    if(!entry.can_manage||!entry.storage_sync_pending)return null;
    return <div className="resources-error" role="status"><span>{error||entry.storage_sync_error||'Storage folder name synchronization is pending.'}</span><button type="button" className="btn btn-secondary" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await client.syncEntry(entry.id);onChanged();}catch(failure){setError(failure instanceof Error?failure.message:'Storage synchronization is pending.');}finally{setBusy(false);}}}><RefreshCw aria-hidden="true"/>Retry</button></div>;
}
export function RepositoryDocumentDetail({client,entry,flow,onChanged}:{client:ResourcesClient;entry:RepositoryEntry;flow:DocumentUpload;onChanged:()=>void}){
    const [filePage,setFilePage]=useState(1),[selected,setSelected]=useState(''),[editing,setEditing]=useState(false),[archive,setArchive]=useState(false),[reason,setReason]=useState(''),[cleanupError,setCleanupError]=useState(''),[cleaning,setCleaning]=useState(false);
    const action=useResourceAction(client),active=flow.state.entryId===entry.id;
    const files=useResourceQuery<ResourcePage<RepositoryFile>>(client,'files',{id:entry.id,assignment_id:null,page:filePage,page_size:50,upload_revision:active?flow.state.revision:0});
    const rows=files.data?.rows||[],ready=rows.filter(file=>file.storage_state==='Ready'),current=ready.find(file=>file.id===selected)||(files.data?.total===1?ready[0]:undefined);
    const pending=rows.find(file=>['Reserved','Uploading','CleanupRequired'].includes(file.storage_state)),mayUpload=entry.can_manage&&['Draft','Published'].includes(entry.state)&&!ready.length;
    const perform=async(mutation:string,data:Record<string,unknown>)=>{if(await action.run(mutation,{id:entry.id,...data},entry.version)){setArchive(false);onChanged();}};
    return <div className="data-list-page resources-page repository-document-page"><header className="page-header"><h1 title={entry.subject}>{entry.subject}</h1><div className="resources-actions">
        {entry.can_manage&&<>{['Draft','Published'].includes(entry.state)&&<button type="button" className="btn btn-secondary" disabled={flow.state.busy} onClick={()=>setEditing(true)}><Pencil aria-hidden="true"/>Edit Details</button>}{entry.state==='Draft'&&<button type="button" className="btn btn-primary" disabled={action.saving||!ready.length||flow.state.busy} onClick={()=>void perform('entry_publish',{})}><Send aria-hidden="true"/>Publish</button>}{entry.state!=='Archived'&&<button type="button" className="btn btn-secondary btn-icon" title="Archive" aria-label="Archive" onClick={()=>setArchive(true)}><Archive aria-hidden="true"/></button>}{['Closed','Archived'].includes(entry.state)&&<button type="button" className="btn btn-secondary" onClick={()=>setArchive(true)}>Reopen</button>}</>}
        <button type="button" className="btn btn-secondary btn-icon" title="Refresh document" aria-label="Refresh document" disabled={files.loading||flow.state.busy} onClick={()=>{files.refresh();onChanged();}}><RefreshCw aria-hidden="true"/></button>
    </div></header><ResourceErrorState error={files.error||action.error} retry={files.refresh}/><RepositoryStorageSync client={client} entry={entry} onChanged={onChanged}/>
        <div className="repository-document-metadata"><span>{entry.state}</span>{entry.reporting_year!=null&&<span>{entry.reporting_year}</span>}{current&&<><span title={current.file_name}>{current.file_name}</span><span>{resourceDate(current.ready_at)}</span></>}</div>
        {entry.instructions&&<p className="resources-prose repository-document-description">{entry.instructions}</p>}
        {(files.data?.total||0)>1&&<div className="repository-document-selector"><label>Document<select className="form-control" value={selected} onChange={event=>setSelected(event.target.value)}><option value="">Select Document</option>{ready.map(file=><option key={file.id} value={file.id}>{file.display_name||file.file_name}</option>)}</select></label>{files.data!.total>50&&<div className="resources-actions"><button type="button" className="btn btn-secondary" disabled={filePage===1} onClick={()=>{setFilePage(value=>value-1);setSelected('');}}>Previous</button><span>{filePage} / {Math.ceil(files.data!.total/50)}</span><button type="button" className="btn btn-secondary" disabled={filePage*50>=files.data!.total} onClick={()=>{setFilePage(value=>value+1);setSelected('');}}>Next</button></div>}</div>}
        {current&&<React.Suspense fallback={<p role="status">Loading preview...</p>}><Preview key={current.id} client={client} file={current}/></React.Suspense>}
        {mayUpload&&<div className="repository-document-upload"><label className="repository-upload-picker">{pending?'Original File':'File'}<input type="file" accept={accept} disabled={flow.state.busy||cleaning||!!(active&&flow.state.file&&!flow.state.intent)} onChange={event=>{const file=event.target.files?.[0];if(file)void flow.run(file,entry.id,pending);event.target.value='';}}/></label>
            {pending&&<span className="resources-cell-text" title={pending.file_name}>{pending.file_name}</span>}
            <ResourceErrorState error={cleanupError}/>{pending&&!flow.state.busy&&<div className="repository-document-actions"><button type="button" className="btn btn-secondary" disabled={cleaning} onClick={async()=>{setCleaning(true);setCleanupError('');try{await client.cleanup(pending.id);flow.reset();files.refresh();}catch(error){setCleanupError(error instanceof Error?error.message:'Cleanup is pending. Retry later.');}finally{setCleaning(false);}}}><XCircle aria-hidden="true"/>Discard Unfinished Upload</button></div>}
            {active&&<><UploadProgress flow={flow}/><div className="repository-document-actions">{flow.state.busy?<button type="button" className="btn btn-secondary" onClick={flow.pause}><Pause aria-hidden="true"/>Pause Upload</button>:flow.state.file&&flow.state.status!=='Ready'&&<button type="button" className="btn btn-primary" onClick={()=>void flow.run(flow.state.file!,entry.id,flow.state.intent||pending)}><Upload aria-hidden="true"/>Resume Upload</button>}</div></>}
        </div>}
        {editing&&<DocumentEdit client={client} entry={entry} onClose={()=>setEditing(false)} onSaved={()=>{setEditing(false);onChanged();}}/>}
        {archive&&<ResourceModal title={entry.state==='Archived'||entry.state==='Closed'?'Reopen Document':'Archive Document'} busy={action.saving} onClose={()=>setArchive(false)}><form onSubmit={event=>{event.preventDefault();void perform('entry_state',{state:entry.state==='Archived'||entry.state==='Closed'?'Published':'Archived',reason});}}><div className="modal-card__body resources-form"><label>Reason<textarea className="form-control" required maxLength={2000} value={reason} onChange={event=>setReason(event.target.value)}/></label><ResourceErrorState error={action.error}/></div><footer className="modal-card__footer"><button type="button" className="btn btn-secondary" disabled={action.saving} onClick={()=>setArchive(false)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={action.saving}>Confirm</button></footer></form></ResourceModal>}
    </div>;
}
function DocumentEdit({client,entry,onClose,onSaved}:{client:ResourcesClient;entry:RepositoryEntry;onClose:()=>void;onSaved:()=>void}){
    const [values,setValues]=useState<DocumentFields>({subject:entry.subject,instructions:entry.instructions,reporting_year:entry.reporting_year,audience_ous:entry.audience_ous}),[reason,setReason]=useState('');const action=useResourceAction(client);
    return <ResourceModal title="Edit Document" onClose={onClose} busy={action.saving} wide><form onSubmit={async event=>{event.preventDefault();if(await action.run('entry_save',{id:entry.id,...values,subject:values.subject.trim(),reason},entry.version))onSaved();}}><div className="modal-card__body resources-form-scroll"><fieldset className="resources-form" disabled={action.saving}><DocumentInputs values={values} onChange={setValues} yearRequired={entry.reporting_year!==null} yearLocked={entry.storage_year!=null||entry.state!=='Draft'}/>{entry.state!=='Draft'&&<label>Reason For Change<textarea className="form-control" value={reason} required maxLength={2000} onChange={event=>setReason(event.target.value)}/></label>}<ResourceErrorState error={action.error}/></fieldset></div><footer className="modal-card__footer"><button type="button" className="btn btn-secondary" disabled={action.saving} onClick={onClose}>Cancel</button><button type="submit" className="btn btn-primary" disabled={action.saving}>Save</button></footer></form></ResourceModal>;
}
