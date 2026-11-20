import React,{useState} from 'react';
import {Download,Upload,RotateCcw} from 'lucide-react';
import {useAuth} from '../../contexts/AuthContext';
import {downloadRepositoryOriginal,resourceAccess,resourceDate,type RepositoryEntry,type RepositoryFile,type ResourcePage,type ResourcesClient} from '../../lib/resources';
import {ResourceErrorState,ResourceTable,ResourceText,useResourceQuery} from './ResourceControls';
import RepositoryUploadModal from './RepositoryUploadModal';

export const repositoryFilePath=(entryId:string,fileId:string)=>`/documentary-repository/file?id=${entryId}&fileId=${fileId}`;
export default function RepositoryFiles({client,entry,assignmentId,reason,fileIds,allowUpload=false,onNavigate,onChanged,selected,onSelect}:{client:ResourcesClient;entry:RepositoryEntry;assignmentId?:string|null;reason?:string;fileIds?:string[];allowUpload?:boolean;onNavigate:(path:string)=>void;onChanged?:()=>void;selected?:string[];onSelect?:(ids:string[])=>void}){
    const {currentUser,rolesConfigs}=useAuth();const [page,setPage]=useState(1),[size,setSize]=useState(10),[upload,setUpload]=useState<true|RepositoryFile|false>(false),[error,setError]=useState(''),[downloading,setDownloading]=useState<string|null>(null);
    const query=useResourceQuery<ResourcePage<RepositoryFile>>(client,'files',{id:entry.id,assignment_id:assignmentId||null,...(fileIds?{file_ids:fileIds}:{}),page,page_size:size});
    const canUpload=allowUpload&&resourceAccess(currentUser,rolesConfigs,'Documentary Repository','edit');
    const download=async(file:RepositoryFile)=>{setDownloading(file.id);setError('');try{await downloadRepositoryOriginal(client,file);}catch(failure){setError(failure instanceof Error?failure.message:'Download failed.');}finally{setDownloading(null);}};
    return <><ResourceErrorState error={query.error||error} retry={query.refresh}/><ResourceTable<RepositoryFile> columns={[
        ...(onSelect?[{key:'select',label:'Select',locked:true,width:80,render:(file:RepositoryFile)=>file.storage_state==='Ready'?<input type="checkbox" className="form-checkbox" aria-label={`Select ${file.file_name}`} checked={selected?.includes(file.id)||false} onChange={event=>onSelect(event.target.checked?[...(selected||[]),file.id]:(selected||[]).filter(id=>id!==file.id))}/>:null}]:[]),
        {key:'name',label:'File',locked:true,width:320,render:file=>file.storage_state==='Ready'?<a className="resources-record-link" href={`#${repositoryFilePath(entry.id,file.id)}`} title={file.display_name||file.file_name} onClick={event=>{event.preventDefault();onNavigate(repositoryFilePath(entry.id,file.id));}}>{file.display_name||file.file_name}</a>:<ResourceText value={file.file_name}/>},
        {key:'size',label:'Size',default:true,width:120,render:file=><ResourceText value={`${(Number(file.file_size)/1024).toFixed(1)} KiB`}/>},
        {key:'state',label:'Status',default:true,width:160,render:file=><ResourceText value={file.storage_state}/>},
        {key:'by',label:'Uploaded By',default:true,width:210,render:file=><ResourceText value={file.uploaded_by_name}/>},
        {key:'date',label:'Uploaded At',default:true,width:220,render:file=><ResourceText value={resourceDate(file.ready_at||file.created_at)}/>},
        {key:'actions',label:'Actions',locked:true,width:110,render:file=><div className="resources-actions">{file.storage_state==='Ready'?<button type="button" className="btn btn-secondary btn-icon" title="Download Original" aria-label={`Download ${file.file_name}`} disabled={downloading===file.id} onClick={()=>void download(file)}><Download aria-hidden="true"/></button>:canUpload&&file.uploaded_by===currentUser?.id&&<button type="button" className="btn btn-secondary btn-icon" title="Resume Upload" aria-label={`Resume ${file.file_name}`} onClick={()=>setUpload(file)}><RotateCcw aria-hidden="true"/></button>}</div>},
    ]} rows={query.data?.rows||[]} total={query.data?.total||0} page={page} pageSize={size} onPage={setPage} onPageSize={value=>{setSize(value);setPage(1);}} loading={query.loading} preferences={`repository-files-columns:${currentUser?.id}`} toolbar={canUpload?<button type="button" className="btn btn-primary" disabled={!!assignmentId&&reason===undefined} onClick={()=>setUpload(true)}><Upload aria-hidden="true"/>Upload Files</button>:undefined}/>
    {upload&&<RepositoryUploadModal client={client} entryId={entry.id} assignmentId={assignmentId} reason={reason} resume={upload===true?undefined:upload} onClose={()=>{setUpload(false);query.refresh();onChanged?.();}} onUploaded={()=>{query.refresh();onChanged?.();}}/>}
    </>;
}
