import {ResourceError,resourceBody} from './resourcesProtocol.ts';

export type ResourceDriveConnection={connection:{id:string;google_account_email:string;root_folder_id?:string|null};accessToken:string};
export type ResourceDriveItem={id:string;name?:string;size?:string;mimeType?:string;parents?:string[];driveId?:string;trashed?:boolean;appProperties?:Record<string,string>};
export const RESOURCE_DRIVE_API='https://www.googleapis.com/drive/v3/files';
export const RESOURCE_DRIVE_FIELDS='id,name,mimeType,size,parents,driveId,trashed,appProperties';
export type StorageOperation='root_preparation'|'folder_discovery'|'folder_creation'|'folder_metadata'|'permissions_check'|'folder_rename'|'file_identity'|'upload_session'|'upload_chunk'|'upload_status'|'file_metadata'|'file_download'|'upload_cleanup';
export type StorageDiagnostic={operation:StorageOperation;status:number;reason:string};
const reasons=new Set(['notFound','insufficientFilePermissions','insufficientPermissions','authError','userRateLimitExceeded','rateLimitExceeded','dailyLimitExceeded','storageQuotaExceeded','backendError','internalError','accessNotConfigured','invalid','badRequest','forbidden']);
export async function resourceStorageKey(parts:unknown[]){
    const bytes=new TextEncoder().encode(JSON.stringify(parts));
    return 'repo:'+Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(value=>value.toString(16).padStart(2,'0')).join('');
}
export function createResourceDriveAccess(fetcher:typeof fetch=fetch,report:(value:StorageDiagnostic)=>void=value=>console.warn(JSON.stringify({module:'resources-storage',...value}))){
    const failure=async(response:Response,operation:StorageOperation):Promise<never>=>{
        let reason='unknown';
        try{const body=JSON.parse(new TextDecoder().decode(await resourceBody(response,16384)));const candidate=body?.error?.errors?.[0]?.reason;if(reasons.has(candidate))reason=candidate;}catch{}
        report({operation,status:response.status,reason});
        const limited=response.status===429||['userRateLimitExceeded','rateLimitExceeded','dailyLimitExceeded'].includes(reason);
        const code=limited?'STORAGE_RATE_LIMITED':response.status===404?'STORAGE_NOT_FOUND':response.status===401||response.status===403?'STORAGE_PERMISSION_DENIED':'STORAGE_UNAVAILABLE';
        const hint=limited?'Drive is rate limited. Retry this operation later.':reason==='storageQuotaExceeded'?'The connected Drive storage is full. Ask an administrator to review storage.':code==='STORAGE_PERMISSION_DENIED'?'Drive denied access. Ask an administrator to review storage permissions.':code==='STORAGE_NOT_FOUND'?'A required Drive item is unavailable. Ask an administrator to review its location.':'Private Drive storage is unavailable. Retry this operation.';
        throw new ResourceError(`${hint} Operation: ${operation.replaceAll('_',' ')}.`,503,code);
    };
    const request=async(context:ResourceDriveConnection,url:string,init:RequestInit={},operation:StorageOperation='file_metadata')=>{
        const headers=new Headers(init.headers);headers.set('Authorization',`Bearer ${context.accessToken}`);
        try{return await fetcher(url,{...init,headers,redirect:'error'});}catch{
            report({operation,status:0,reason:'network'});
            throw new ResourceError(`Drive request interrupted. Retry the same operation (${operation.replaceAll('_',' ')}).`,503,'UPLOAD_UNCERTAIN');
        }
    };
    const json=async(context:ResourceDriveConnection,url:string,init?:RequestInit,operation:StorageOperation='folder_metadata')=>{
        const response=await request(context,url,init,operation);if(!response.ok)return failure(response,operation);
        try{return await response.json();}catch{report({operation,status:response.status,reason:'invalid_response'});throw new ResourceError('Drive returned an unreadable storage response. Retry the same operation.',503);}
    };
    const metadata=(context:ResourceDriveConnection,id:string,operation:StorageOperation='folder_metadata')=>json(context,`${RESOURCE_DRIVE_API}/${encodeURIComponent(id)}?fields=${RESOURCE_DRIVE_FIELDS}`,undefined,operation) as Promise<ResourceDriveItem>;
    const privateItem=async(context:ResourceDriveConnection,id:string,boundary:string)=>{
        if(!boundary)throw new ResourceError('The configured Drive parent is missing. Ask an administrator to review storage settings.',503,'STORAGE_CONFIGURATION');
        const seen=new Set<string>();let current=id;
        for(let depth=0;depth<20;depth++){
            if(seen.has(current))throw new ResourceError('The storage folder hierarchy contains a cycle.',503);seen.add(current);
            const item=await metadata(context,current);
            if(item.id!==current||item.trashed||item.driveId)throw new ResourceError('Repository storage must use an available private My Drive folder.',503);
            let page:string|undefined;
            do{
                const result=await json(context,`${RESOURCE_DRIVE_API}/${encodeURIComponent(current)}/permissions?fields=nextPageToken,permissions(type,role,emailAddress,deleted)&pageSize=100${page?'&pageToken='+encodeURIComponent(page):''}`,undefined,'permissions_check');
                if(!Array.isArray(result.permissions)||!result.permissions.length||result.permissions.some((p:any)=>p.type!=='user'||p.role!=='owner'||p.emailAddress?.toLowerCase()!==context.connection.google_account_email.toLowerCase()||p.deleted))throw new ResourceError('The configured storage hierarchy shares documents outside the connected account. Administrator review is required; no permissions were changed.',503,'STORAGE_NOT_PRIVATE');
                page=result.nextPageToken;
            }while(page);
            // The persisted configured parent is the trust boundary, not an arbitrary inaccessible ancestor.
            if(current===boundary)return;
            if(item.parents?.length!==1)throw new ResourceError('The document no longer reaches its expected storage parent.',503,'STORAGE_LOCATION_CHANGED');
            current=item.parents[0];
        }
        throw new ResourceError('The storage folder hierarchy cannot be verified.',503);
    };
    const legacyItem=async(context:ResourceDriveConnection,id:string,root:string)=>{
        const identity='resources-root:'+context.connection.id,item=await metadata(context,root);
        if(item.appProperties?.resourceIdentity!==identity)throw new ResourceError('Legacy repository storage identity changed.',503);
        const q=`trashed=false and 'root' in parents and appProperties has { key='resourceIdentity' and value='${identity.replaceAll("'","\\'")}' }`;
        const result=await json(context,`${RESOURCE_DRIVE_API}?q=${encodeURIComponent(q)}&fields=nextPageToken,files(id)&pageSize=100`,undefined,'root_preparation');
        if(result.nextPageToken||result.files?.length!==1||result.files[0].id!==root)throw new ResourceError('Legacy storage location is ambiguous or changed. Administrator review is required.',503);
        await privateItem(context,id,root);
    };
    return {request,json,metadata,privateItem,legacyItem,failure};
}
