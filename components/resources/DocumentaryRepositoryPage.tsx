import React,{useEffect,useState} from 'react';
import {Archive,Eye,FolderPlus,LockKeyhole,Pencil,RefreshCw,RotateCcw,Send,UnlockKeyhole,Upload} from 'lucide-react';
import {useAuth} from '../../contexts/AuthContext';
import {repositoryBreadcrumbs,resourceAccess,resourceDate,resourceEventLabel,type RepositoryEntry,type RepositoryAssignment,type RepositoryFile,type ResourceEvent,type ResourcePage,type ResourcesClient} from '../../lib/resources';
import type {AppBreadcrumb} from '../../lib/appNavigation';
import {REPOSITORY_DEFAULT_SORT,repositoryListArgs,type RepositoryColumnKey,type RepositoryFilters,type RepositorySort} from '../../lib/repositoryTable';
import RepositoryColumnHeader from './RepositoryColumnHeader';
import {ResourceErrorState,ResourceModal,ResourceScope,ResourceSearch,ResourceTable,ResourceText,useResourceAction,useResourceQuery,useResourceSearch} from './ResourceControls';
import RepositoryEntryEditor from './RepositoryEntryEditor';
import RepositoryFiles from './RepositoryFiles';
import {RepositorySubmission} from './RepositorySubmission';
import {RepositoryDocumentCreate,RepositoryDocumentDetail,RepositoryStorageSync,useDocumentUpload,type DocumentUpload} from './RepositoryDocument';
const RepositoryFilePreview=React.lazy(()=>import('./RepositoryFilePreview'));

export const repositoryEntryPath=(id:string)=>'/documentary-repository/detail?id='+id;
export default function DocumentaryRepositoryPage(props:{id?:string|null;fileId?:string|null;uploadView?:boolean;parentId?:string|null;deadlineView?:boolean;onNavigate:(path:string)=>void;onBreadcrumbs?:(items:AppBreadcrumb[])=>void}){
    return <ResourceScope module="Documentary Repository">{client=><RepositoryRouter {...props} client={client}/>}</ResourceScope>;
}
function RepositoryRouter({client,id,fileId,uploadView=false,parentId,deadlineView=false,onNavigate,onBreadcrumbs}:{client:ResourcesClient;id?:string|null;fileId?:string|null;uploadView?:boolean;parentId?:string|null;deadlineView?:boolean;onNavigate:(path:string)=>void;onBreadcrumbs?:(items:AppBreadcrumb[])=>void}){
    const {currentUser,rolesConfigs}=useAuth(),flow=useDocumentUpload(client,onNavigate);
    useEffect(()=>{if((!uploadView&&id!==flow.state.entryId)||fileId)flow.reset();if(uploadView)onBreadcrumbs?.([{label:'4KIS',path:'/'},{label:'Documentary Repository',path:'/documentary-repository'},{label:'Upload Document'}]);},[id,fileId,uploadView]);
    if(uploadView)return resourceAccess(currentUser,rolesConfigs,'Documentary Repository','manage')?<RepositoryDocumentCreate flow={flow} parentId={parentId} onNavigate={onNavigate}/>:<p role="alert">You do not have access to upload documents.</p>;
    return <React.Fragment key={id||'list'}>{id?fileId?<RepositoryFileRoute client={client} id={id} fileId={fileId} onBreadcrumbs={onBreadcrumbs}/>:<RepositoryDetail client={client} id={id} flow={flow} onNavigate={onNavigate} onBreadcrumbs={onBreadcrumbs}/>:<RepositoryList client={client} deadlineView={deadlineView} onNavigate={onNavigate}/>}</React.Fragment>;
}
function RepositoryList({client,onNavigate,parentId,deadlineView=false,embedded=false}:{client:ResourcesClient;onNavigate:(path:string)=>void;parentId?:string;deadlineView?:boolean;embedded?:boolean}){
    const {currentUser,rolesConfigs}=useAuth();
    const [search,setSearch]=useState(''),[filters,setFilters]=useState<RepositoryFilters>(()=>deadlineView?{kind:{mode:'include',values:['Required Folder']}}:{}),[sort,setSort]=useState<RepositorySort>(REPOSITORY_DEFAULT_SORT);
    const [page,setPage]=useState(1),[size,setSize]=useState(10),[creating,setCreating]=useState<'Folder'|'File'|null>(null);
    const text=useResourceSearch(search),args=repositoryListArgs(filters,text,sort,parentId);
    const query=useResourceQuery<ResourcePage<RepositoryEntry>>(client,'entries',{...args,page,page_size:size});
    const header=(key:RepositoryColumnKey,label:string)=>({ariaSort:sort.key===key?sort.direction:'none' as const,header:<RepositoryColumnHeader client={client} column={key} label={label} filter={filters[key]} sort={sort} args={args} onApply={(value,nextSort)=>{
        setFilters(previous=>{const next={...previous};if(value)next[key]=value;else delete next[key];return next;});setSort(nextSort);setPage(1);
    }}/>});
    const canManage=resourceAccess(currentUser,rolesConfigs,'Documentary Repository','manage');
    const create=<>{canManage&&<><button type="button" className="btn btn-secondary" onClick={()=>setCreating('Folder')}><FolderPlus aria-hidden="true"/>Create Folder</button><button type="button" className="btn btn-primary" onClick={()=>onNavigate('/documentary-repository/upload'+(parentId?'?parentId='+encodeURIComponent(parentId):''))}><Upload aria-hidden="true"/>Upload File</button></>}</>;
    return <div className={embedded?'repository-children':'data-list-page resources-page'}>
        {!embedded&&<header className="page-header"><h1>Documentary Repository</h1><div className="resources-actions">{create}</div></header>}
        <ResourceErrorState error={query.error} retry={query.refresh}/>
        <ResourceTable<RepositoryEntry> compactHeaders columns={[
            {key:'subject',label:'Subject',locked:true,width:340,render:entry=><a className="resources-record-link" href={`#${repositoryEntryPath(entry.id)}`} title={entry.subject} onClick={event=>{event.preventDefault();onNavigate(repositoryEntryPath(entry.id));}}>{entry.subject}</a>},
            {key:'kind',label:'Type',default:true,width:170,render:entry=><ResourceText value={entry.required_submission?'Required Folder':entry.kind}/>},
            {key:'state',label:'Status',default:true,width:130,render:entry=><ResourceText value={entry.state}/>},
            {key:'year',label:'Reporting Year',default:true,width:140,render:entry=><ResourceText value={entry.reporting_year}/>},
            {key:'due',label:'Deadline',default:true,width:225,render:entry=><ResourceText value={resourceDate(entry.due_at)}/>},
            {key:'assigned',label:'Assigned OUs',default:true,width:140,render:entry=><ResourceText value={entry.required_submission?entry.assigned_count:''}/>},
            {key:'own',label:'My Submission',default:true,width:165,render:entry=><ResourceText value={entry.own_status}/>},
            {key:'creator',label:'Created By',width:210,render:entry=><ResourceText value={entry.created_by_name}/>},
            {key:'updated',label:'Updated At',default:true,width:225,render:entry=><ResourceText value={resourceDate(entry.updated_at)}/>},
        ].map(column=>({...column,...header(column.key as RepositoryColumnKey,column.label)}))} rows={query.data?.rows||[]} total={query.data?.total||0} page={page} pageSize={size} onPage={setPage} onPageSize={value=>{setSize(value);setPage(1);}} loading={query.loading} preferences={`repository-entry-columns:${currentUser?.id}`} toolbar={<>
            <ResourceSearch value={search} onChange={value=>{setSearch(value);setPage(1);}} label="Search documents"/>
            {!!Object.keys(filters).length&&<button type="button" className="btn btn-secondary" onClick={()=>{setFilters({});setPage(1);}}><RotateCcw aria-hidden="true"/>Reset Filters</button>}
            {embedded&&create}<button type="button" className="btn btn-secondary btn-icon" aria-label="Refresh documents" title="Refresh documents" onClick={query.refresh} disabled={query.loading}><RefreshCw aria-hidden="true"/></button>
        </>}/>
        {creating&&<RepositoryEntryEditor client={client} kind={creating} parentId={parentId} onClose={()=>setCreating(null)} onSaved={entry=>{setCreating(null);query.refresh();onNavigate(repositoryEntryPath(entry.id));}}/>}
    </div>;
}
function RepositoryDetail({client,id,flow,onNavigate,onBreadcrumbs}:{client:ResourcesClient;id:string;flow:DocumentUpload;onNavigate:(path:string)=>void;onBreadcrumbs?:(items:AppBreadcrumb[])=>void}){
    const {currentUser}=useAuth();const query=useResourceQuery<RepositoryEntry>(client,'entry',{id,upload_revision:flow.state.entryId===id?flow.state.revision:0});
    const [editing,setEditing]=useState(false),[transition,setTransition]=useState<string|null>(null),[historyOpen,setHistoryOpen]=useState(false),[historyPage,setHistoryPage]=useState(1),[historySize,setHistorySize]=useState(10);
    const history=useResourceQuery<ResourcePage<ResourceEvent>>(client,'events',{id,page:historyPage,page_size:historySize},historyOpen&&!!query.data);
    const action=useResourceAction(client),entry=query.data;
    useEffect(()=>{if(entry?.id===id)onBreadcrumbs?.(repositoryBreadcrumbs(entry));else if(query.error)onBreadcrumbs?.([]);},[entry?.id,entry?.subject,entry?.parent_id,entry?.parent_subject,query.error,id,onBreadcrumbs]);
    const publish=async()=>{if(!entry)return;const result=await action.run<RepositoryEntry>('entry_publish',{id},entry.version);if(result)query.refresh();};
    if(entry?.kind==='File')return <RepositoryDocumentDetail client={client} entry={entry} flow={flow} onChanged={query.refresh}/>;
    return <div className="data-list-page resources-page"><header className="page-header"><h1 title={entry?.subject}>{entry?.subject||'Documentary Repository'}</h1><div className="resources-actions">
        {entry?.can_manage&&<>{['Draft','Published'].includes(entry.state)&&<button type="button" className="btn btn-secondary" onClick={()=>setEditing(true)}><Pencil aria-hidden="true"/>Edit Details</button>}{entry.state==='Draft'?<button type="button" className="btn btn-primary" onClick={()=>void publish()} disabled={action.saving}><Send aria-hidden="true"/>{action.saving?'Publishing...':'Publish'}</button>:<>{entry.state==='Published'?<button type="button" className="btn btn-secondary btn-icon" title="Close Submissions" aria-label="Close Submissions" onClick={()=>setTransition('Closed')}><LockKeyhole aria-hidden="true"/></button>:<button type="button" className="btn btn-secondary" onClick={()=>setTransition('Published')}><UnlockKeyhole aria-hidden="true"/>Reopen</button>}{entry.state!=='Archived'&&<button type="button" className="btn btn-secondary btn-icon" title="Archive" aria-label="Archive" onClick={()=>setTransition('Archived')}><Archive aria-hidden="true"/></button>}</>}</>}
        <button type="button" className="btn btn-secondary btn-icon" aria-label="Refresh document" title="Refresh document" disabled={query.loading||action.saving} onClick={query.refresh}><RefreshCw aria-hidden="true"/></button>
    </div></header><ResourceErrorState error={query.error||action.error} retry={query.refresh}/>{query.loading&&<p role="status">Loading...</p>}
    {entry&&<>
        <RepositoryStorageSync client={client} entry={entry} onChanged={query.refresh}/>
        <section className="resources-detail-section"><dl className="resources-metadata">{[['Type',entry.required_submission?'Required Submission':entry.kind],['Status',entry.state],['Reporting Year',entry.reporting_year],['Quarter',entry.quarter],['Deadline',resourceDate(entry.due_at)],['Audience',entry.audience_ous?.join(', ')||'All Authorized OUs'],['Signed Documents Required',entry.required_submission?(entry.requires_signed?'Yes':'No'):''],['Include In Awards',entry.required_submission?(entry.include_awards?'Yes':'No'):'']].filter(([,value])=>value!==null&&value!=='').map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>{entry.instructions&&<p className="resources-prose">{entry.instructions}</p>}</section>
        {entry.required_submission&&<RepositoryTracker client={client} entry={entry} onNavigate={onNavigate} onEntryChanged={query.refresh}/>}
        {(entry.can_manage||!!entry.supporting_file_count)&&<section className="resources-detail-section"><h2>{entry.kind==='File'?'Official Files':'Files'}</h2><RepositoryFiles client={client} entry={entry} allowUpload={entry.can_manage&&['Draft','Published'].includes(entry.state)} onNavigate={onNavigate}/></section>}
        {entry.kind==='Folder'&&!entry.required_submission&&!entry.parent_id&&<section className="resources-detail-section"><h2>Folder Contents</h2><RepositoryList client={client} parentId={entry.id} embedded onNavigate={onNavigate}/></section>}
        <details className="resources-detail-section" onToggle={event=>setHistoryOpen(event.currentTarget.open)}><summary>History</summary><ResourceErrorState error={history.error} retry={history.refresh}/>{historyOpen&&<ResourceTable<ResourceEvent> compactHeaders columns={[
            {key:'date',label:'Date',locked:true,width:225,render:row=><ResourceText value={resourceDate(row.created_at)}/>},
            {key:'change',label:'Change',locked:true,width:230,render:row=><ResourceText value={resourceEventLabel(row.event)}/>},
            {key:'by',label:'Changed By',locked:true,width:210,render:row=><ResourceText value={row.actor_name}/>},
            {key:'reason',label:'Reason',default:true,width:340,render:row=><ResourceText value={row.detail.reason}/>},
        ]} rows={history.data?.rows||[]} total={history.data?.total||0} page={historyPage} pageSize={historySize} onPage={setHistoryPage} onPageSize={value=>{setHistorySize(value);setHistoryPage(1);}} preferences={`repository-history-columns:${currentUser?.id}`} loading={history.loading}/>}</details>
        {editing&&<RepositoryEntryEditor client={client} entry={entry} onClose={()=>setEditing(false)} onSaved={()=>{setEditing(false);query.refresh();}}/>}
        {transition&&<RepositoryReasonModal client={client} title={transition==='Published'?'Reopen Entry':transition==='Closed'?'Close Submissions':'Archive Entry'} mutation="entry_state" data={{id:entry.id,state:transition}} version={entry.version} onClose={()=>setTransition(null)} onSaved={()=>{setTransition(null);query.refresh();}}/>}
    </>}
    </div>;
}
function RepositoryTracker({client,entry,onNavigate,onEntryChanged}:{client:ResourcesClient;entry:RepositoryEntry;onNavigate:(path:string)=>void;onEntryChanged:()=>void}){
    const {currentUser}=useAuth();const [page,setPage]=useState(1),[size,setSize]=useState(10),[search,setSearch]=useState(''),[selected,setSelected]=useState<RepositoryAssignment|null>(null),[waiver,setWaiver]=useState<RepositoryAssignment|null>(null);
    const query=useResourceQuery<ResourcePage<RepositoryAssignment>&{summary:{required:number;submitted:number}}>(client,'assignments',{id:entry.id,page,page_size:size,search:useResourceSearch(search)});
    return <section className="resources-detail-section"><header className="repository-section-heading"><h2>OU Submissions</h2>{query.data&&<span>{query.data.summary.submitted} / {query.data.summary.required} Submitted</span>}</header>
        <ResourceErrorState error={query.error} retry={query.refresh}/><ResourceTable<RepositoryAssignment> compactHeaders columns={[
            {key:'ou',label:'OU',locked:true,width:140,render:row=><ResourceText value={row.operating_unit}/>},
            {key:'status',label:'Status',locked:true,width:205,render:row=><ResourceText value={row.status}/>},
            {key:'timeliness',label:'Timeliness',default:true,width:140,render:row=><ResourceText value={row.timeliness}/>},
            {key:'date',label:'Submitted At',default:true,width:225,render:row=><ResourceText value={resourceDate(row.submitted_at)}/>},
            {key:'by',label:'Submitted By',default:true,width:210,render:row=><ResourceText value={row.submitted_by_name}/>},
            {key:'actions',label:'Actions',locked:true,width:180,render:row=><div className="resources-actions"><button type="button" className="resources-text-button" onClick={()=>setSelected(row)}><Eye aria-hidden="true"/>View</button>{entry.can_manage&&<button type="button" className="resources-text-button" onClick={()=>setWaiver(row)}>{row.waived?'Restore':'Waive'}</button>}</div>},
        ]} rows={query.data?.rows||[]} total={query.data?.total||0} page={page} pageSize={size} onPage={setPage} onPageSize={value=>{setSize(value);setPage(1);}} loading={query.loading} preferences={`repository-tracker-columns:${currentUser?.id}`} toolbar={<><ResourceSearch value={search} onChange={value=>{setSearch(value);setPage(1);}} label="Search OUs"/><button type="button" className="btn btn-secondary btn-icon" title="Refresh submissions" aria-label="Refresh submissions" onClick={query.refresh} disabled={query.loading}><RefreshCw aria-hidden="true"/></button></>}/>
        {selected&&<RepositorySubmission client={client} entry={entry} assignment={selected} onNavigate={onNavigate} onClose={()=>{setSelected(null);query.refresh();}} onChanged={query.refresh}/>}
        {waiver&&<RepositoryReasonModal client={client} title={waiver.waived?'Restore Assignment':'Waive Assignment'} mutation="assignment_waive" data={{id:entry.id,assignment_id:waiver.id,waived:!waiver.waived}} version={entry.version} onClose={()=>setWaiver(null)} onSaved={()=>{setWaiver(null);query.refresh();onEntryChanged();}}/>}
    </section>;
}
function RepositoryReasonModal({client,title,mutation,data,version,onClose,onSaved}:{client:ResourcesClient;title:string;mutation:string;data:Record<string,unknown>;version:number;onClose:()=>void;onSaved:()=>void}){
    const [reason,setReason]=useState('');const action=useResourceAction(client);
    return <ResourceModal title={title} onClose={onClose} busy={action.saving}><form onSubmit={async event=>{event.preventDefault();const result=await action.run(mutation,{...data,reason:reason.trim()},version);if(result)onSaved();}}><fieldset className="modal-card__body resources-form" disabled={action.saving}><label>Reason<textarea className="form-control" rows={3} value={reason} maxLength={2000} required onChange={event=>setReason(event.target.value)}/></label><ResourceErrorState error={action.error}/></fieldset><footer className="modal-card__footer"><button type="button" className="btn btn-secondary" disabled={action.saving} onClick={onClose}>Cancel</button><button type="submit" className="btn btn-primary" disabled={action.saving}>{action.saving?'Saving...':'Confirm'}</button></footer></form></ResourceModal>;
}
function RepositoryFileRoute({client,id,fileId,onBreadcrumbs}:{client:ResourcesClient;id:string;fileId:string;onBreadcrumbs?:(items:AppBreadcrumb[])=>void}){
    const query=useResourceQuery<RepositoryFile>(client,'file',{id,file_id:fileId});
    const file=query.data;
    useEffect(()=>{if(file?.id===fileId&&file.breadcrumb_entry)onBreadcrumbs?.(repositoryBreadcrumbs(file.breadcrumb_entry,file));else if(query.error)onBreadcrumbs?.([]);},[file,fileId,query.error,onBreadcrumbs]);
    return <div className="data-list-page resources-page"><header className="page-header"><h1 title={query.data?.file_name}>{query.data?.display_name||query.data?.file_name||'Document'}</h1></header><ResourceErrorState error={query.error} retry={query.refresh}/>{query.loading&&<p role="status">Loading...</p>}{query.data?.storage_state==='Ready'?<React.Suspense fallback={<p role="status">Loading preview...</p>}><RepositoryFilePreview client={client} file={query.data}/></React.Suspense>:query.data&&<p>The original file has not finished uploading.</p>}</div>;
}
