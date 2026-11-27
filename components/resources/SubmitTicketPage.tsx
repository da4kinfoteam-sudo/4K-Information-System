import React, { useState } from 'react';
import { Plus, RefreshCw, Send } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { resourceAccess, resourceDate, resourceEventLabel, TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES, type ResourceComment, type ResourceEvent, type ResourcePage, type ResourceTicket, type ResourcesClient } from '../../lib/resources';
import { ResourceErrorState, ResourceModal, ResourceScope, ResourceSearch, ResourceTable, ResourceText, useResourceAction, useResourceQuery, useResourceSearch } from './ResourceControls';
import { DataTablePagination } from '../ui/enterprise';

export default function SubmitTicketPage({id,onNavigate}:{id?:string|null;onNavigate:(path:string)=>void}) {
    return <ResourceScope module="Submit Ticket">{client=>id?<React.Fragment key={id}><TicketDetail client={client} id={id}/></React.Fragment>:<TicketList client={client} onNavigate={onNavigate}/>}</ResourceScope>;
}
function TicketList({client,onNavigate}:{client:ResourcesClient;onNavigate:(path:string)=>void}) {
    const {currentUser,rolesConfigs}=useAuth();
    const [search,setSearch]=useState(''),[status,setStatus]=useState(''),[category,setCategory]=useState(''),[page,setPage]=useState(1),[size,setSize]=useState(10),[creating,setCreating]=useState(false);
    const query=useResourceQuery<ResourcePage<ResourceTicket>>(client,'tickets',{search:useResourceSearch(search),status,category,page,page_size:size});
    const columns=[
        {key:'code',label:'Code',locked:true,width:190,render:(row:ResourceTicket)=><ResourceText value={row.code}/>},
        {key:'subject',label:'Subject',locked:true,width:320,render:(row:ResourceTicket)=><a href={`#/submit-ticket/detail?id=${row.id}`} className="resources-record-link" title={row.subject} onClick={event=>{event.preventDefault();onNavigate('/submit-ticket/detail?id='+row.id);}}>{row.subject}</a>},
        {key:'category',label:'Category',default:true,width:205,render:(row:ResourceTicket)=><ResourceText value={row.category}/>},
        {key:'ou',label:'OU',default:true,width:130,render:(row:ResourceTicket)=><ResourceText value={row.reporter_ou}/>},
        {key:'reporter',label:'Submitted By',default:true,width:210,render:(row:ResourceTicket)=><ResourceText value={row.reporter_name}/>},
        {key:'created',label:'Submitted At',default:true,width:220,render:(row:ResourceTicket)=><ResourceText value={resourceDate(row.created_at)}/>},
        {key:'status',label:'Status',locked:true,width:160,render:(row:ResourceTicket)=><ResourceText value={row.status}/>},
        {key:'priority',label:'Priority',width:110,render:(row:ResourceTicket)=><ResourceText value={row.priority}/>},
        {key:'assigned',label:'Assigned To',default:true,width:210,render:(row:ResourceTicket)=><ResourceText value={row.assigned_to_name||''}/>},
        {key:'updated',label:'Updated At',default:true,width:220,render:(row:ResourceTicket)=><ResourceText value={resourceDate(row.updated_at)}/>},
    ];
    return <div className="data-list-page resources-page"><header className="page-header"><h1>Submit Ticket</h1>{resourceAccess(currentUser,rolesConfigs,'Submit Ticket','edit')&&<button type="button" className="btn btn-primary" onClick={()=>setCreating(true)}><Plus aria-hidden="true"/>Submit Ticket</button>}</header>
        <ResourceErrorState error={query.error} retry={query.refresh}/>
        <ResourceTable allowColumnEditing columns={columns} rows={query.data?.rows||[]} total={query.data?.total||0} page={page} pageSize={size} loading={query.loading} onPage={setPage} onPageSize={value=>{setSize(value);setPage(1);}} preferences={`resource-ticket-columns:${currentUser?.id}`} toolbar={<>
            <ResourceSearch value={search} onChange={value=>{setSearch(value);setPage(1);}} label="Search tickets"/>
            <select className="form-control" aria-label="Ticket status" value={status} onChange={event=>{setStatus(event.target.value);setPage(1);}}><option value="">All Statuses</option>{TICKET_STATUSES.map(value=><option key={value}>{value}</option>)}</select>
            <select className="form-control" aria-label="Ticket category" value={category} onChange={event=>{setCategory(event.target.value);setPage(1);}}><option value="">All Categories</option>{TICKET_CATEGORIES.map(value=><option key={value}>{value}</option>)}</select>
            <button type="button" className="btn btn-secondary btn-icon" title="Refresh tickets" aria-label="Refresh tickets" onClick={query.refresh} disabled={query.loading}><RefreshCw aria-hidden="true"/></button>
        </>}/>
        {creating&&<TicketCreate client={client} onClose={()=>setCreating(false)} onCreated={ticket=>{setCreating(false);onNavigate('/submit-ticket/detail?id='+ticket.id);}}/>}
    </div>;
}
function TicketCreate({client,onClose,onCreated}:{client:ResourcesClient;onClose:()=>void;onCreated:(ticket:ResourceTicket)=>void}) {
    const [subject,setSubject]=useState(''),[category,setCategory]=useState<string>(TICKET_CATEGORIES[0]),[description,setDescription]=useState('');
    const action=useResourceAction(client);
    return <ResourceModal title="Submit Ticket" onClose={onClose} busy={action.saving}><form onSubmit={async event=>{event.preventDefault();const result=await action.run<ResourceTicket>('ticket_create',{subject:subject.trim(),category,description:description.trim()});if(result)onCreated(result);}}>
        <fieldset className="modal-card__body resources-form" disabled={action.saving}>
            <label>Subject<input className="form-control" value={subject} onChange={event=>setSubject(event.target.value)} maxLength={240} required/></label>
            <label>Category<select className="form-control" value={category} onChange={event=>setCategory(event.target.value)}>{TICKET_CATEGORIES.map(value=><option key={value}>{value}</option>)}</select></label>
            <label>Description<textarea className="form-control" value={description} onChange={event=>setDescription(event.target.value)} maxLength={20000} rows={6} required/></label>
            <ResourceErrorState error={action.error}/>
        </fieldset>
        <footer className="modal-card__footer"><button type="button" className="btn btn-secondary" disabled={action.saving} onClick={onClose}>Cancel</button><button type="submit" className="btn btn-primary" disabled={action.saving}><Send aria-hidden="true"/>{action.saving?'Submitting...':'Submit Ticket'}</button></footer>
    </form></ResourceModal>;
}
function TicketDetail({client,id}:{client:ResourcesClient;id:string}) {
    const {currentUser,rolesConfigs}=useAuth();
    const query=useResourceQuery<ResourceTicket>(client,'ticket',{id});
    const [page,setPage]=useState(1),[commentSize,setCommentSize]=useState(20),[historyPage,setHistoryPage]=useState(1),[historySize,setHistorySize]=useState(20),[historyOpen,setHistoryOpen]=useState(false),[comment,setComment]=useState('');
    const [edits,setEdits]=useState<Partial<ResourceTicket>>({});
    const comments=useResourceQuery<ResourcePage<ResourceComment>>(client,'ticket_comments',{id,page,page_size:commentSize},!!query.data);
    const history=useResourceQuery<ResourcePage<ResourceEvent>>(client,'ticket_events',{id,page:historyPage,page_size:historySize},!!query.data&&historyOpen);
    const admins=useResourceQuery<{rows:{id:number;name:string}[]}>(client,'administrators',{},!!query.data?.can_manage);
    const action=useResourceAction(client),ticket=query.data;
    const canEdit=resourceAccess(currentUser,rolesConfigs,'Submit Ticket','edit');
    const submit=async(mutation:string)=>{
        if(!ticket)return;
        const result=await action.run<ResourceTicket>(mutation,{id,comment:comment.trim(),...(mutation==='ticket_update'?{status:edits.status||ticket.status,priority:edits.priority||ticket.priority,assigned_to:edits.assigned_to===undefined?ticket.assigned_to:edits.assigned_to}:{})},ticket.version);
        if(result){setComment('');setEdits({});query.refresh();comments.refresh();if(historyOpen)history.refresh();}
    };
    return <div className="data-list-page resources-page">
        <header className="page-header"><h1 title={ticket?.subject}>{ticket?.subject||'Ticket'}</h1><button type="button" className="btn btn-secondary btn-icon" aria-label="Refresh ticket" title="Refresh ticket" onClick={()=>{query.refresh();comments.refresh();if(historyOpen)history.refresh();}} disabled={query.loading||action.saving}><RefreshCw aria-hidden="true"/></button></header>
        <ResourceErrorState error={query.error} retry={query.refresh}/>
        {query.loading&&<p role="status">Loading...</p>}
        {ticket&&<>
            <section className="resources-detail-section"><dl className="resources-metadata">{[['Code',ticket.code],['Status',ticket.status],['Category',ticket.category],['Priority',ticket.priority],['OU',ticket.reporter_ou],['Submitted By',ticket.reporter_name],['Submitted At',resourceDate(ticket.created_at)],['Updated At',resourceDate(ticket.updated_at)],['Assigned To',ticket.assigned_to_name||'']].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><p className="resources-prose">{ticket.description}</p></section>
            <section className="resources-detail-section"><h2>Comments</h2><ResourceErrorState error={comments.error} retry={comments.refresh}/>
                {comments.loading?<p role="status">Loading...</p>:<ol className="resources-comments">{comments.data?.rows.map(row=><li key={row.id}><header><strong>{row.actor_name}</strong><time dateTime={row.created_at}>{resourceDate(row.created_at)}</time></header><p className="resources-prose">{row.body}</p></li>)}</ol>}
                {comments.data&&<DataTablePagination currentPage={page} totalPages={Math.max(1,Math.ceil(comments.data.total/commentSize))} totalItems={comments.data.total} itemsPerPage={commentSize} onPageChange={setPage} onItemsPerPageChange={size=>{setCommentSize(size);setPage(1);}}/>}
                {canEdit&&<form className="resources-response" onSubmit={event=>{event.preventDefault();void submit(ticket.can_manage?'ticket_update':'ticket_comment');}}>
                    <fieldset className="resources-form" disabled={action.saving}>
                        {ticket.can_manage&&<div className="resources-fields"><label>Status<select className="form-control" value={edits.status||ticket.status} onChange={event=>setEdits(previous=>({...previous,status:event.target.value as ResourceTicket['status']}))}>{TICKET_STATUSES.map(value=><option key={value}>{value}</option>)}</select></label>
                            <label>Priority<select className="form-control" value={edits.priority||ticket.priority} onChange={event=>setEdits(previous=>({...previous,priority:event.target.value as ResourceTicket['priority']}))}>{TICKET_PRIORITIES.map(value=><option key={value}>{value}</option>)}</select></label>
                            <label>Assigned To<select className="form-control" value={(edits.assigned_to===undefined?ticket.assigned_to:edits.assigned_to)??''} disabled={admins.loading||!!admins.error} onChange={event=>setEdits(previous=>({...previous,assigned_to:event.target.value?Number(event.target.value):null}))}><option value="">Unassigned</option>{admins.data?.rows.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label></div>}
                        <ResourceErrorState error={admins.error} retry={admins.refresh}/>
                        <label>Comment<textarea className="form-control" value={comment} onChange={event=>setComment(event.target.value)} rows={4} maxLength={20000} required/></label>
                        <ResourceErrorState error={action.error}/>
                        <div className="resources-actions">{ticket.status!=='Closed'||ticket.can_manage?<button className="btn btn-primary" type="submit" disabled={action.saving||!!admins.error}><Send aria-hidden="true"/>{action.saving?'Saving...':ticket.can_manage?'Save Response':'Add Comment'}</button>:<button type="button" className="btn btn-primary" disabled={action.saving||!comment.trim()} onClick={()=>void submit('ticket_reopen_request')}>Request Reopening</button>}</div>
                    </fieldset>
                </form>}
            </section>
            <details className="resources-detail-section" onToggle={event=>setHistoryOpen(event.currentTarget.open)}><summary>History</summary><ResourceErrorState error={history.error} retry={history.refresh}/>{historyOpen&&<ResourceTable<ResourceEvent> allowColumnEditing columns={[
                {key:'date',label:'Date',locked:true,width:220,render:row=><ResourceText value={resourceDate(row.created_at)}/>},
                {key:'event',label:'Change',locked:true,width:230,render:row=><ResourceText value={resourceEventLabel(row.event)}/>},
                {key:'user',label:'Changed By',locked:true,width:220,render:row=><ResourceText value={row.actor_name}/>},
            ]} rows={history.data?.rows||[]} total={history.data?.total||0} page={historyPage} pageSize={historySize} onPage={setHistoryPage} onPageSize={size=>{setHistorySize(size);setHistoryPage(1);}} loading={history.loading} preferences={`resource-ticket-history:${currentUser?.id}`}/>}</details>
        </>}
    </div>;
}
