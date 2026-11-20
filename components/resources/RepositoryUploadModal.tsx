import React,{useEffect,useRef,useState} from 'react';
import {Upload,XCircle} from 'lucide-react';
import {resourceFileFingerprint,resourceOperation,type RepositoryFile,type ResourceOperation,type ResourcesClient} from '../../lib/resources';
import {resourceFilePolicy,RESOURCE_FORMATS} from '../../supabase/functions/_shared/resourcesProtocol';
import {ResourceErrorState,ResourceModal} from './ResourceControls';
interface UploadRow {key:string;file:File;operation:ResourceOperation|null;intent:RepositoryFile|null;progress:number;state:string;error:string;}
export default function RepositoryUploadModal({client,entryId,assignmentId,reason,resume,onClose,onUploaded}:{client:ResourcesClient;entryId:string;assignmentId?:string|null;reason?:string;resume?:RepositoryFile;onClose:()=>void;onUploaded:()=>void}){
    const [rows,setRows]=useState<UploadRow[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
    const latest=useRef<UploadRow[]>([]),saving=useRef(false),controller=useRef<AbortController|null>(null);
    useEffect(()=>()=>controller.current?.abort(),[]);
    const update=(key:string,patch:Partial<UploadRow>)=>{latest.current=latest.current.map(row=>row.key===key?{...row,...patch}:row);setRows(latest.current);};
    const choose=(files:FileList|null)=>{
        if(!files)return;
        try{
            if(latest.current.length+files.length>client.maxBatch)throw new Error(`Choose up to ${client.maxBatch} files per upload.`);
            const additions=Array.from(files).map(file=>{resourceFilePolicy(file.name,file.size,file.type);if(resume&&(file.name!==resume.file_name||file.size!==Number(resume.file_size)))throw new Error('Choose the original file to resume this upload.');return {key:crypto.randomUUID(),file,operation:null,intent:resume||null,progress:0,state:'Selected',error:''};});
            latest.current=[...latest.current,...additions];setRows(latest.current);setError('');
        }catch(failure){setError(failure instanceof Error?failure.message:'Choose supported files.');}
    };
    const upload=async()=>{
        if(saving.current)return;saving.current=true;setBusy(true);setError('');controller.current=new AbortController();
        for(const row of [...latest.current]){
            if(row.state==='Ready'||controller.current.signal.aborted)continue;
            try{
                update(row.key,{state:'Uploading',error:''});let intent=row.intent;
                if(!intent){
                    const policy=resourceFilePolicy(row.file.name,row.file.size,row.file.type),hash=await resourceFileFingerprint(row.file);
                    const operation=resourceOperation(row.operation,'file_reserve',{entry_id:entryId,assignment_id:assignmentId||null,file_name:row.file.name,file_size:row.file.size,mime_type:policy.mime,file_sha256:hash,reason:reason?.trim()||null});
                    update(row.key,{operation});intent=await client.mutate<RepositoryFile>(operation);update(row.key,{intent});
                }
                await client.upload(row.file,intent,(done,total)=>update(row.key,{progress:Math.round(done/total*100)}),controller.current.signal);
                update(row.key,{state:'Ready',progress:100});onUploaded();
            }catch(failure){update(row.key,{state:controller.current.signal.aborted?'Paused':'Interrupted',error:controller.current.signal.aborted?'':failure instanceof Error?failure.message:'Upload interrupted. Retry the same upload.'});}
        }
        saving.current=false;setBusy(false);
    };
    const cleanup=async(row:UploadRow)=>{
        try{if(row.intent)await client.cleanup(row.intent.id);latest.current=latest.current.filter(item=>item.key!==row.key);setRows(latest.current);onUploaded();}
        catch(failure){setError(failure instanceof Error?failure.message:'Cleanup is pending. Retry later.');}
    };
    return <ResourceModal title={resume?'Resume Upload':'Upload Files'} onClose={onClose} busy={busy} wide>
        <div className="modal-card__body resources-form"><label className="repository-upload-picker">Files<input type="file" accept={Object.keys(RESOURCE_FORMATS).map(extension=>'.'+extension).join(',')} multiple={!resume} disabled={busy||(!!resume&&rows.length>0)} onChange={event=>{choose(event.target.files);event.target.value='';}}/></label>
            <ResourceErrorState error={error}/><div className="resources-table-scroll"><table className="data-table resources-table"><thead><tr><th>File</th><th>Size</th><th>Status</th><th>Progress</th><th aria-label="Actions"/></tr></thead><tbody>{rows.map(row=><tr key={row.key}><td title={row.file.name}>{row.file.name}</td><td>{(row.file.size/1024).toFixed(1)} KiB</td><td title={row.error}>{row.error||row.state}</td><td><progress value={row.progress} max={100} aria-label={`${row.file.name} upload progress`}/></td><td>{row.state!=='Ready'&&<button type="button" className="btn btn-secondary btn-icon" title="Discard Unfinished Upload" aria-label={`Discard ${row.file.name}`} disabled={busy} onClick={()=>void cleanup(row)}><XCircle aria-hidden="true"/></button>}</td></tr>)}</tbody></table></div>
        </div><footer className="modal-card__footer">{busy?<button type="button" className="btn btn-secondary" onClick={()=>controller.current?.abort()}>Pause Upload</button>:<button type="button" className="btn btn-secondary" onClick={onClose}>Done</button>}<button type="button" className="btn btn-primary" disabled={busy||!rows.some(row=>row.state!=='Ready')} onClick={()=>void upload()}><Upload aria-hidden="true"/>{busy?'Uploading...':'Upload'}</button></footer>
    </ResourceModal>;
}
