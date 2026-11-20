import React,{useEffect} from 'react';
import {CalendarDays} from 'lucide-react';
import type {Deadline} from '../../constants';
import {resourceAccess,type ResourceDeadline,type ResourcePage} from '../../lib/resources';
import {ResourceErrorState,useResourceQuery,useResourcesClient} from './ResourceControls';

export function mergeHomepageDeadlines(legacy:readonly Deadline[],repository:readonly ResourceDeadline[]){
    return [
        ...legacy.map(row=>({key:`legacy:${row.id}`,name:row.name,date:row.date,source:'legacy' as const,path:null,status:null,sort:new Date(row.date.slice(0,10)+'T00:00:00').getTime()})),
        ...repository.map(row=>({key:`repository:${row.id}`,name:row.subject,date:row.due_at,source:'repository' as const,path:'/documentary-repository/detail?id='+encodeURIComponent(row.id),status:row.assignment_id?row.own_status:null,sort:new Date(row.due_at).getTime()})),
    ].filter(row=>Number.isFinite(row.sort)).sort((left,right)=>left.sort-right.sort||left.key.localeCompare(right.key)).slice(0,5);
}
export default function HomepageDeadlineList({legacy,navigateTo,formatLegacyDate,isLegacyUrgent}:{legacy:Deadline[];navigateTo:(path:string)=>void;formatLegacyDate:(value:string)=>string;isLegacyUrgent:(value:string)=>boolean}){
    const {client,currentUser,rolesConfigs}=useResourcesClient();
    const allowed=resourceAccess(currentUser,rolesConfigs,'Documentary Repository');
    const query=useResourceQuery<ResourcePage<ResourceDeadline>>(client,'deadlines',{upcoming_only:true,page_size:5},allowed);
    useEffect(()=>{
        if(!allowed)return;
        const refresh=(event:Event)=>{const mutation=(event as CustomEvent<{mutation?:string}>).detail?.mutation;if(!mutation||/^(entry_|assignment_|submission_)/.test(mutation))query.refresh();};
        window.addEventListener('app-data-refreshed',refresh);window.addEventListener('resources-data-changed',refresh);
        return()=>{window.removeEventListener('app-data-refreshed',refresh);window.removeEventListener('resources-data-changed',refresh);};
    },[allowed,query.refresh]);
    const rows=mergeHomepageDeadlines(legacy,query.data?.rows||[]);
    return <div className="dashboard-schedule-grid"><div>
        {allowed&&query.loading&&<p role="status" className="dashboard-empty">Loading repository deadlines...</p>}
        <ResourceErrorState error={query.error} retry={query.refresh}/>
        {rows.length?<ul className="dashboard-list">{rows.map(row=>{
            const urgent=row.source==='legacy'?isLegacyUrgent(row.date):new Date(row.date).getTime()-Date.now()<=7*24*60*60*1000;
            const date=row.source==='legacy'?formatLegacyDate(row.date):new Intl.DateTimeFormat('en-PH',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Manila'}).format(new Date(row.date));
            return <li key={row.key} className={`dashboard-list__item dashboard-deadline-row ${urgent?'dashboard-list__item--urgent':''}`}><span className="dashboard-deadline-row__icon" aria-hidden="true"><CalendarDays/></span><span className="dashboard-deadline-row__content">{row.path?<a className="dashboard-list__name repository-deadline-link" href={`#${row.path}`} title={row.name} onClick={event=>{event.preventDefault();navigateTo(row.path!);}}>{row.name}</a>:<span className="dashboard-list__name" title={row.name}>{row.name}</span>}{row.status&&<span className="repository-deadline-status">{row.status}</span>}</span><time className="dashboard-list__date" dateTime={row.date}>{date}</time></li>;
        })}</ul>:!query.loading&&!query.error&&<p className="dashboard-empty">No upcoming deadlines.</p>}
    </div></div>;
}
