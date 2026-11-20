import type { RoleConfig, User } from '../constants';
import type {AppBreadcrumb} from './appNavigation';
import { RESOURCE_CHUNK_BYTES, RESOURCE_MAX_BATCH, resourceFilePolicy } from '../supabase/functions/_shared/resourcesProtocol';

export type ResourceModule = 'Documentary Repository' | 'Submit Ticket';
export type ResourceCapability = 'view'|'edit'|'delete'|'manage';
export const RESOURCE_MODULES: readonly ResourceModule[] = ['Documentary Repository','Submit Ticket'];
export const TICKET_STATUSES = ['Open','In Progress','Awaiting User','Resolved','Closed'] as const;
export const TICKET_CATEGORIES = ['Bug Report','Data Correction','System Change Request','Improvement Request','Other'] as const;
export const TICKET_PRIORITIES = ['Low','Normal','High','Urgent'] as const;
export const resourceDate = (value?: string|null) => value ? new Intl.DateTimeFormat('en-PH',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Manila'}).format(new Date(value)) : '';
export const resourceEventLabel=(event:string)=>({ticket_comment:'Comment Added',ticket_update:'Ticket Updated',ticket_reopen_request:'Reopening Requested',submission_submit:'Submission Received',submission_return:'Returned For Correction',submission_withdraw:'Submission Withdrawn',entry_save:'Details Updated',entry_publish:'Published',entry_state:'Publication State Updated',assignment_waive:'Assignment Updated'}[event]||event);

export function resourceAccess(user:User|null,configs:readonly RoleConfig[]|undefined,module:ResourceModule,action:ResourceCapability='view') {
    if(!user || user.role==='Guest')return false;
    if(user.role==='Super Admin')return true;
    if(action==='manage' && user.role!=='Administrator')return false;
    const config=configs?.find(row=>row.role===user.role && row.module===module);
    const override=user.permissions_override?.[module];
    const read=(field:ResourceCapability)=>typeof override?.[`can_${field}`]==='boolean' ? override[`can_${field}`] : config?.[`can_${field}`]===true;
    return !!read('view') && !!read(action);
}

export interface ResourcePage<T> { rows:T[];total:number;page:number;page_size:number; }
export interface ResourceActor {id:number;name:string;operatingUnit:string;role:string;}
export interface RepositoryEntry {
    id:string;parent_id:string|null;parent_subject?:string|null;kind:'Folder'|'File';subject:string;instructions:string;state:'Draft'|'Published'|'Closed'|'Archived';
    required_submission:boolean;requires_signed:boolean;reporting_year:number|null;quarter:string|null;include_awards:boolean;
    due_at:string|null;audience_ous:string[]|null;version:number;created_by_name:string;created_at:string;updated_at:string;
    assigned_count?:number;can_manage?:boolean;can_submit?:boolean;assignments?:RepositoryAssignment[];
    supporting_file_count?:number;
    own_status?:string|null;
}
export interface RepositoryAssignment {
    id:string;entry_id:string;operating_unit:string;waived:boolean;waiver_reason:string|null;version:number;
    status?:string;timeliness?:string;receipt_id?:string|null;receipt_version?:number;submitted_at?:string|null;submitted_by_name?:string;
    receipt_file_ids?:string[]|null;
}
export interface RepositoryFile {
    id:string;entry_id:string;assignment_id:string|null;file_name:string;display_name:string|null;mime_type:string;file_size:number;
    storage_state:'Reserved'|'Uploading'|'Ready'|'Failed'|'CleanupRequired';uploaded_by:number;uploaded_by_name:string;created_at:string;ready_at:string|null;
    uploaded_bytes:number;
    expected_sha256?:string|null;
    breadcrumb_entry?:Pick<RepositoryEntry,'id'|'subject'|'kind'|'parent_id'|'parent_subject'>;
}
export interface SubmissionReceipt {
    id:string;version:number;submitted_at:string;submitted_by_name:string;submitted_for_ou:string;file_ids:string[];
    invalidated_at:string|null;withdrawn_at:string|null;invalidation_reason:string|null;due_at:string;
}
export interface ResourceTicket {
    id:string;code:string;subject:string;category:typeof TICKET_CATEGORIES[number];description:string;
    status:typeof TICKET_STATUSES[number];priority:typeof TICKET_PRIORITIES[number];reporter_id:number;reporter_name:string;reporter_ou:string;
    assigned_to:number|null;assigned_to_name?:string|null;version:number;created_at:string;updated_at:string;can_manage?:boolean;
}
export interface ResourceComment {id:string;actor_name:string;body:string;created_at:string;}
export interface ResourceEvent {id:number;event:string;actor_name:string;detail:Record<string,unknown>;created_at:string;}
export interface ResourceDeadline {id:string;subject:string;due_at:string;reporting_year:number;own_status:string|null;assignment_id:string|null;}
export interface ReportorialTotal {operating_unit:string;required:number;on_time:number;late:number;missing:number;credited_units:number;compliance:number|null;}
export interface ReportorialEvidence {assignment_id:string;entry_id:string;subject:string;operating_unit:string;waived:boolean;due_at:string;submitted_at:string|null;credit:number|null;}
export interface ReportorialPeriod {reporting_year:number;quarter:string;source:'Manual'|'Repository';state:'Open'|'Finalized';version:number;snapshot_id?:string;summary?:{rows:ReportorialTotal[];evidence:ReportorialEvidence[];cutoff:string;rule_version:string};}
export interface ResourceOperation {mutation:string;data:Record<string,unknown>;version:number|null;request_id:string;}
export function resourceOperation(previous:ResourceOperation|null,mutation:string,data:Record<string,unknown>,version:number|null=null):ResourceOperation {
    if(previous && previous.mutation===mutation && previous.version===version && JSON.stringify(previous.data)===JSON.stringify(data))return previous;
    return {mutation,data:structuredClone(data),version,request_id:crypto.randomUUID()};
}
export class ResourcesClientError extends Error {
    status:number;code:string;
    constructor(message:string,status:number,code='RESOURCE_ERROR'){super(message);this.name='ResourcesClientError';this.status=status;this.code=code;}
}

export function createResourcesClient({url,apiKey,credentials,fetcher=fetch}: {
    url:string;apiKey:string;credentials:()=>{identifier:string;password:string}|null;fetcher?:typeof fetch;
}) {
    let session:{token:string;expires_at:string;actor:ResourceActor}|null=null;
    let verifying:Promise<string>|null=null;let generation=0;
    const inFlight=new Map<string,{payload:string;promise:Promise<unknown>}>();
    const parse=async(response:Response)=>{
        let body:any;try{body=await response.json();}catch{throw new ResourcesClientError('Resources returned an unreadable response. Retry the same request.',503);}
        if(!response.ok)throw new ResourcesClientError(body.error||'Resources is unavailable.',response.status,body.code);
        return body;
    };
    const headers=(token?:string)=>({'Content-Type':'application/json',apikey:apiKey,...(token?{'x-resource-session':token}:{})});
    const verify=async()=>{
        if(!url || !apiKey)throw new ResourcesClientError('Resources is unavailable because its connection is not configured.',503);
        if(session && new Date(session.expires_at).getTime()>Date.now()+10000)return session.token;
        if(verifying)return verifying;
        const source=credentials();if(!source?.password)throw new ResourcesClientError('Sign in again to verify your Resources access.',401,'SESSION_REQUIRED');
        const requestGeneration=generation;
        verifying=(async()=>{
            const verified=await parse(await fetcher(url,{method:'POST',headers:headers(),body:JSON.stringify({action:'session_start',...source}),cache:'no-store',credentials:'omit',redirect:'error'}));
            if(requestGeneration!==generation)throw new ResourcesClientError('Your account session changed.',401);
            session=verified;return session!.token;
        })().finally(()=>{verifying=null;});
        return verifying;
    };
    const send=async(body:Record<string,unknown>,signal?:AbortSignal,blob=false)=>{
        const token=await verify();const requestGeneration=generation;
        const response=await fetcher(url,{method:'POST',headers:headers(token),body:JSON.stringify(body),cache:'no-store',credentials:'omit',redirect:'error',signal});
        if(requestGeneration!==generation)throw new ResourcesClientError('Your account session changed.',401);
        if(response.status===401)session=null;
        if(blob && response.ok)return response.blob();
        return parse(response);
    };
    const mutate=async<T>(operation:ResourceOperation):Promise<T>=>{
        const key=operation.request_id,payload=JSON.stringify(operation),current=inFlight.get(key);
        if(current){if(current.payload!==payload)throw new ResourcesClientError('A pending request cannot be reused for different changes.',409);return current.promise as Promise<T>;}
        const request=send({action:'mutate',...operation}).finally(()=>inFlight.delete(key));inFlight.set(key,{payload,promise:request});return request as Promise<T>;
    };
    const query=<T>(resource:string,args:Record<string,unknown>={},signal?:AbortSignal):Promise<T>=>send({action:'read',resource,args},signal);
    const upload=async(file:File,intent:RepositoryFile,onProgress:(bytes:number,total:number)=>void,signal?:AbortSignal)=>{
        resourceFilePolicy(file.name,file.size,file.type);
        if(intent.file_name!==file.name || Number(intent.file_size)!==file.size)throw new ResourcesClientError('Choose the original file to resume this upload.',400);
        if(intent.expected_sha256 && await resourceFileFingerprint(file)!==intent.expected_sha256)throw new ResourcesClientError('Choose the exact original file to resume this upload. Its contents have changed.',400);
        let status=await send({action:'upload_begin',file_id:intent.id},signal) as {storage_state:string;uploaded_bytes:number};
        while(status.storage_state!=='Ready') {
            const token=await verify(),offset=Number(status.uploaded_bytes),requestGeneration=generation;
            if(!Number.isSafeInteger(offset) || offset<0 || offset>=file.size)throw new ResourcesClientError('The upload range is invalid. Refresh its status.',409);
            const chunk=file.slice(offset,Math.min(offset+RESOURCE_CHUNK_BYTES,file.size));
            try {
                const response=await fetcher(url,{method:'POST',headers:{apikey:apiKey,'Content-Type':'application/octet-stream','x-resource-session':token,'x-resource-action':'upload_chunk','x-resource-file':intent.id,'x-resource-offset':String(offset)},body:chunk,signal,credentials:'omit',cache:'no-store',redirect:'error'});
                if(requestGeneration!==generation)throw new ResourcesClientError('Your account session changed.',401);
                if(response.status===401)session=null;
                status=await parse(response);
            }catch(error){
                if(signal?.aborted||requestGeneration!==generation)throw error;
                // A lost response may already have committed the chunk: ask Drive before resending.
                const recovered=await send({action:'upload_status',file_id:intent.id},signal) as typeof status;
                if(recovered.storage_state!=='Ready' && Number(recovered.uploaded_bytes)<=offset)throw error;
                status=recovered;
            }
            onProgress(status.storage_state==='Ready'?file.size:Number(status.uploaded_bytes),file.size);
        }
        return status;
    };
    return {query,mutate,upload,download:(fileId:string,signal?:AbortSignal)=>send({action:'file_content',file_id:fileId},signal,true) as Promise<Blob>,
        cleanup:(fileId:string)=>send({action:'upload_cleanup',file_id:fileId}),maxBatch:RESOURCE_MAX_BATCH,
        dispose:()=>{generation++;session=null;verifying=null;inFlight.clear();},
        actor:()=>session?.actor || null};
}
export type ResourcesClient=ReturnType<typeof createResourcesClient>;

export function repositoryBreadcrumbs(entry:Pick<RepositoryEntry,'id'|'subject'|'kind'|'parent_id'|'parent_subject'>,file?:RepositoryFile):AppBreadcrumb[]{
    return [{label:'4KIS',path:'/'},{label:'Documentary Repository',path:'/documentary-repository'},
        ...(entry.parent_id?[{label:entry.parent_subject||'Folder',path:'/documentary-repository/detail?id='+encodeURIComponent(entry.parent_id)}]:[]),
        {label:entry.subject,...(file?{path:'/documentary-repository/detail?id='+encodeURIComponent(entry.id)}:{})},
        ...(file?[{label:file.display_name||file.file_name}]:[])];
}

export async function resourceFileFingerprint(file:File){
    resourceFilePolicy(file.name,file.size,file.type);
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))).map(value=>value.toString(16).padStart(2,'0')).join('');
}

export async function downloadRepositoryOriginal(client:ResourcesClient,file:RepositoryFile){
    const blob=await client.download(file.id),url=URL.createObjectURL(blob);
    try{const anchor=document.createElement('a');anchor.href=url;anchor.download=file.file_name;anchor.click();}finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}
}
