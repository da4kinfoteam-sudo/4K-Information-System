import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { RefreshCw, Search, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import useLocalStorageState from '../../hooks/useLocalStorageState';
import { createResourcesClient, resourceAccess, resourceOperation, type ResourceModule, type ResourceOperation, type ResourcesClient } from '../../lib/resources';
import { DataTablePagination } from '../ui/enterprise';
import { EditTableControl } from '../ui/EditTableControl';

export function useResourcesClient(){
    const {currentUser,rolesConfigs}=useAuth();
    const identity=JSON.stringify([currentUser?.id,currentUser?.username,currentUser?.password,currentUser?.role,currentUser?.operatingUnit,currentUser?.permissions_override,rolesConfigs]);
    const client=useMemo(()=>createResourcesClient({
        url:import.meta.env.VITE_SUPABASE_URL?`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/resources`:'',
        apiKey:import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_KEY || '',
        credentials:()=>currentUser?.password?{identifier:currentUser.username,password:currentUser.password}:null,
    // The full identity includes credentials and current permissions; never reuse data across accounts/scopes.
    }),[identity]);
    useEffect(()=>()=>client.dispose(),[client]);
    return {client,identity,currentUser,rolesConfigs};
}
export function ResourceScope({module,children}:{module:ResourceModule;children:(client:ResourcesClient)=>React.ReactNode}) {
    const {client,identity,currentUser,rolesConfigs}=useResourcesClient();
    if(!resourceAccess(currentUser,rolesConfigs,module))return <div role="alert" className="alert alert-danger">You do not have access to this page.</div>;
    return <React.Fragment key={identity}>{children(client)}</React.Fragment>;
}

export function useResourceQuery<T>(client:ResourcesClient,resource:string,args:Record<string,unknown>={},enabled=true) {
    const [revision,setRevision]=useState(0);
    const key=JSON.stringify(args);
    const queryKey=resource+':'+key;
    const [state,setState]=useState<{client:ResourcesClient|null;key:string;data:T|null;loading:boolean;error:string}>({client:null,key:'',data:null,loading:enabled,error:''});
    useEffect(()=>{
        if(!enabled){setState({client,key:queryKey,data:null,loading:false,error:''});return;}
        const controller=new AbortController();let current=true;
        setState({client,key:queryKey,data:null,loading:true,error:''});
        client.query<T>(resource,JSON.parse(key),controller.signal).then(data=>{if(current)setState({client,key:queryKey,data,loading:false,error:''});})
            .catch(error=>{if(current&&!controller.signal.aborted)setState({client,key:queryKey,data:null,loading:false,error:error instanceof Error?error.message:'Resources could not be loaded.'});});
        return()=>{current=false;controller.abort();};
    },[client,resource,key,enabled,revision]);
    const refresh=useCallback(()=>setRevision(value=>value+1),[]);
    const current=enabled&&state.client===client&&state.key===queryKey;
    return {data:current?state.data:null,loading:enabled&&(!current||state.loading),error:current?state.error:'',refresh};
}

export function useResourceAction(client:ResourcesClient) {
    const operation=useRef<ResourceOperation|null>(null),pending=useRef(false);
    const [saving,setSaving]=useState(false),[error,setError]=useState('');
    const run=async<T,>(mutation:string,data:Record<string,unknown>,version:number|null=null):Promise<T|undefined>=>{
        if(pending.current)return;
        operation.current=resourceOperation(operation.current,mutation,data,version);
        pending.current=true;setSaving(true);setError('');
        try {
            const result=await client.mutate<T>(operation.current);operation.current=null;
            window.dispatchEvent(new CustomEvent('resources-data-changed',{detail:{mutation}}));
            return result;
        }catch(failure){setError(failure instanceof Error?failure.message:'This change could not be confirmed. Retry the same request.');}
        finally{pending.current=false;setSaving(false);}
    };
    return {run,saving,error,clearError:()=>setError('')};
}

export function ResourceErrorState({error,retry}:{error:string;retry?:()=>void}) {
    return error?<div role="alert" className="resources-error"><span>{error}</span>{retry&&<button type="button" className="btn btn-secondary btn-sm" onClick={retry}><RefreshCw aria-hidden="true"/>Retry</button>}</div>:null;
}

export function ResourceModal({title,children,onClose,busy=false,wide=false}:{title:string;children:React.ReactNode;onClose:()=>void;busy?:boolean;wide?:boolean}) {
    const titleId=useId();
    const ref=useRef<HTMLDialogElement>(null);const close=useRef(onClose);close.current=onClose;
    useEffect(()=>{
        const dialog=ref.current;dialog?.showModal();
        return()=>{dialog?.close();};
    },[]);
    return createPortal(<dialog ref={ref} aria-labelledby={titleId} className={`modal-card resources-modal ${wide?'resources-modal--wide':''}`} onCancel={event=>{event.preventDefault();if(!busy)close.current();}}>
        <header className="modal-card__header"><h2 id={titleId} title={title}>{title}</h2><button className="modal-card__close" type="button" title="Close" aria-label="Close" disabled={busy} onClick={onClose}><X aria-hidden="true"/></button></header>
        {children}
    </dialog>,document.body);
}

export function ResourceSearch({value,onChange,label}:{value:string;onChange:(value:string)=>void;label:string}) {
    return <label className="resources-search"><Search aria-hidden="true"/><input type="search" className="form-control" value={value} onChange={event=>onChange(event.target.value)} aria-label={label} placeholder={label}/></label>;
}
export function useResourceSearch(value:string){
    const [search,setSearch]=useState(value);
    useEffect(()=>{const timeout=setTimeout(()=>setSearch(value.trim()),250);return()=>clearTimeout(timeout);},[value]);
    return search;
}

export interface ResourceColumn<T> {key:string;label:string;render:(row:T)=>React.ReactNode;width?:number;locked?:boolean;default?:boolean;header?:React.ReactNode;ariaSort?:React.AriaAttributes['aria-sort'];}
export function ResourceTable<T extends {id:string|number}>({columns,rows,total,page,pageSize,onPage,onPageSize,loading=false,preferences,toolbar,empty='No records found.',allowColumnEditing=false,compactHeaders=false}: {
    columns:ResourceColumn<T>[];rows:T[];total:number;page:number;pageSize:number;onPage:(page:number)=>void;onPageSize:(size:number)=>void;loading?:boolean;preferences:string;toolbar?:React.ReactNode;empty?:string;allowColumnEditing?:boolean;compactHeaders?:boolean;
}) {
    const [stored,setStored]=useLocalStorageState<unknown>(preferences,()=>columns.filter(column=>!column.locked&&column.default).map(column=>column.key));
    const selected=Array.isArray(stored)?stored.filter((key):key is string=>typeof key==='string'&&columns.some(column=>column.key===key&&!column.locked)):[];
    const visible=columns.filter(column=>column.locked||(allowColumnEditing?selected.includes(column.key):column.default));
    const pages=Math.max(1,Math.ceil(total/pageSize));
    useEffect(()=>{if(!loading&&page>pages)onPage(pages);},[page,pages,loading,onPage]);
    return <section className={`resources-table-section${compactHeaders?' repository-table-section':''}`}>
        {(toolbar||allowColumnEditing)&&<div className="resources-table-toolbar">{toolbar}{allowColumnEditing&&<EditTableControl label="Edit Table" columns={columns.map(column=>({...column,group:'Columns'}))} selected={selected} onApply={setStored}/>}</div>}
        <div className="resources-table-scroll custom-scrollbar" aria-busy={loading} tabIndex={0} aria-label="Table records"><table className="data-table resources-table" style={{width:visible.reduce((sum,column)=>sum+(column.width||130),0)}}><colgroup>{visible.map(column=><col key={column.key} style={{width:column.width||130}}/>)}</colgroup>
            <thead><tr>{visible.map(column=><th key={column.key} scope="col" aria-sort={column.ariaSort}>{column.header||column.label}</th>)}</tr></thead>
            <tbody>{loading?<tr><td colSpan={visible.length}>Loading...</td></tr>:rows.length?rows.map(row=><tr key={row.id}>{visible.map(column=><td key={column.key}>{column.render(row)}</td>)}</tr>):<tr><td colSpan={visible.length}>{empty}</td></tr>}</tbody>
        </table></div>
        <DataTablePagination currentPage={Math.min(page,pages)} totalPages={pages} totalItems={total} itemsPerPage={pageSize} onPageChange={onPage} onItemsPerPageChange={onPageSize} pageSizeOptions={[10,20,50,100]}/>
    </section>;
}

export const ResourceText=({value}:{value:unknown})=><span className="resources-cell-text" title={value==null?'':String(value)}>{value==null?'':String(value)}</span>;
