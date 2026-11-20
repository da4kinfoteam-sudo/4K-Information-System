import { ResourceError, RESOURCE_CHUNK_BYTES, RESOURCE_MAX_FILE_BYTES, resourceBody, resourceUuid, validateResourceBytes } from './resourcesProtocol.ts';

type Rpc = (name:string,args:Record<string,unknown>)=>Promise<any>;
type Connection = {connection:{id:string;google_account_email:string};accessToken:string};
type FileRow = {
  id:string;entry_id:string;assignment_id:string|null;file_name:string;mime_type:string;file_size:number;sha256:string|null;
  storage_state:string;upload_lease_id:string|null;uploaded_bytes:number;drive_file_id:string|null;drive_folder_id:string|null;
  connection_id:string|null;upload_session_secret:string|null;
  expected_sha256?:string|null;
};
type DriveItem = {id:string;name?:string;size?:string;mimeType?:string;parents?:string[];driveId?:string;trashed?:boolean;appProperties?:Record<string,string>};
const api='https://www.googleapis.com/drive/v3/files';
const upload='https://www.googleapis.com/upload/drive/v3/files';
const fields='id,name,mimeType,size,parents,driveId,trashed,appProperties';

export function createResourcesStorage({rpc,connect,fetcher=fetch}:{rpc:Rpc;connect:()=>Promise<Connection>;fetcher?:typeof fetch}) {
  const driveRequest = async (context:Connection,url:string,init:RequestInit={}) => {
    const headers=new Headers(init.headers);headers.set('Authorization',`Bearer ${context.accessToken}`);
    return fetcher(url,{...init,headers,redirect:'error'});
  };
  const driveJson = async (context:Connection,url:string,init?:RequestInit) => {
    const response=await driveRequest(context,url,init);
    if (!response.ok) throw new ResourceError('Private Drive storage is unavailable. Retry this operation.',503,'STORAGE_UNAVAILABLE');
    return await response.json();
  };
  const metadata=async(context:Connection,id:string):Promise<DriveItem>=>driveJson(context,`${api}/${encodeURIComponent(id)}?fields=${fields}`);
  const privateItem=async(context:Connection,id:string) => {
    const seen=new Set<string>();let queue=[id];
    while(queue.length) {
      const current=queue.pop()!;
      if(seen.has(current))continue;seen.add(current);
      if(seen.size>20)throw new ResourceError('The storage folder hierarchy cannot be verified.',503);
      const item=await metadata(context,current);
      if(item.trashed || item.driveId)throw new ResourceError('Repository storage must use a private My Drive folder.',503);
      let page:string|undefined;
      do {
        const result=await driveJson(context,`${api}/${encodeURIComponent(current)}/permissions?fields=nextPageToken,permissions(type,role,emailAddress,deleted)&pageSize=100${page?'&pageToken='+encodeURIComponent(page):''}`);
        if(!Array.isArray(result.permissions) || !result.permissions.length || result.permissions.some((permission:any)=>permission.type!=='user' || permission.role!=='owner' || permission.emailAddress?.toLowerCase()!==context.connection.google_account_email.toLowerCase() || permission.deleted)) {
          throw new ResourceError('Repository storage is shared outside the connected account. Ask an administrator to restore private storage.',503,'STORAGE_NOT_PRIVATE');
        }
        page=result.nextPageToken;
      } while(page);
      queue.push(...(item.parents||[]));
    }
  };
  const ensureFolder=async(context:Connection,key:string,name:string,parent?:string) => {
    const lease=crypto.randomUUID();const args={p_key:key,p_connection_id:context.connection.id,p_lease:lease};
    const mapping=await rpc('resource_folder_lease',args);
    if(mapping.folder_id) {
      const item=await metadata(context,mapping.folder_id);
      if(item.appProperties?.resourceIdentity!==key || (parent && !item.parents?.includes(parent)))throw new ResourceError('The repository folder identity or location changed.',503);
      await privateItem(context,mapping.folder_id);return mapping.folder_id as string;
    }
    const escaped=key.replace(/'/g,"\\'");
    const query=`trashed=false and mimeType='application/vnd.google-apps.folder' and appProperties has { key='resourceIdentity' and value='${escaped}' }`;
    const existing=await driveJson(context,`${api}?q=${encodeURIComponent(query)}&fields=nextPageToken,files(${fields})&pageSize=100`);
    if(existing.nextPageToken || existing.files.length>1)throw new ResourceError('Storage folder identity is ambiguous. Administrator review is required.',503);
    const folder=existing.files[0] || await driveJson(context,`${api}?fields=${fields}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,mimeType:'application/vnd.google-apps.folder',appProperties:{resourceIdentity:key},...(parent?{parents:[parent]}:{})})});
    if((parent && !folder.parents?.includes(parent)) || (!parent && folder.parents?.length>1))throw new ResourceError('The storage folder has an unexpected parent.',503);
    await privateItem(context,folder.id);
    await rpc('resource_folder_lease',{...args,p_folder_id:folder.id});
    return folder.id as string;
  };
  const publicStatus=(f:FileRow,offset=f.uploaded_bytes)=>({id:f.id,storage_state:f.storage_state,uploaded_bytes:f.storage_state==='Ready'?Number(f.file_size):offset,file_size:Number(f.file_size)});
  const release=async(session:string,f:FileRow,changes:Record<string,unknown>={})=>rpc('resource_upload_release',{p_session:session,p_file_id:f.id,p_lease_id:f.upload_lease_id,p_changes:changes});
  const sessionUrl=(value:string|null)=>{
    if(!value)throw new ResourceError('Start this upload before sending file data.',409);
    const url=new URL(value);
    if(url.protocol!=='https:' || url.hostname!=='www.googleapis.com' || !url.pathname.startsWith('/upload/drive/'))throw new ResourceError('Stored upload session is invalid.',503);
    return url.toString();
  };
  const existingUploaded=async(context:Connection,f:FileRow)=>{
    if(!f.drive_file_id)return null;
    const response=await driveRequest(context,`${api}/${encodeURIComponent(f.drive_file_id)}?fields=${fields}`);
    if(response.status===404)return null;
    if(!response.ok)throw new ResourceError('Upload status could not be verified. Retry without creating another upload.',503);
    return await response.json() as DriveItem;
  };
  const finish=async(context:Connection,session:string,f:FileRow,item:DriveItem)=>{
    if(item.id!==f.drive_file_id || item.appProperties?.resourceUpload!==f.id || item.appProperties?.resourceEntry!==f.entry_id || !item.parents?.includes(f.drive_folder_id||'') || Number(item.size)!==Number(f.file_size))throw new ResourceError('Uploaded file metadata does not match this upload.',409);
    await privateItem(context,item.id);
    const response=await driveRequest(context,`${api}/${encodeURIComponent(item.id)}?alt=media`);
    if(!response.ok)throw new ResourceError('Uploaded file could not be verified. Retry the upload status check.',503);
    const bytes=await resourceBody(response,RESOURCE_MAX_FILE_BYTES);
    if(bytes.length!==Number(f.file_size))throw new ResourceError('Uploaded file size does not match this upload.',409);
    try {validateResourceBytes(f.file_name,f.mime_type,bytes);} catch(error) {
      await release(session,f,{storage_state:'CleanupRequired',failure_reason:'Document type validation failed.'});throw error;
    }
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(value=>value.toString(16).padStart(2,'0')).join('');
    if(f.expected_sha256 && digest!==f.expected_sha256){await release(session,f,{storage_state:'CleanupRequired',failure_reason:'Original file fingerprint did not match.'});throw new ResourceError('The uploaded content does not match the original file selected for this upload.',409);}
    await rpc('resource_file_ready',{p_session:session,p_file_id:f.id,p_drive_file_id:item.id,p_drive_folder_id:f.drive_folder_id,p_connection_id:context.connection.id,p_sha256:digest,p_lease_id:f.upload_lease_id});
    return publicStatus({...f,storage_state:'Ready'});
  };
  return async(action:string,session:string,request:Request,data:Record<string,unknown>) => {
    const fileId=resourceUuid(action==='upload_chunk'?request.headers.get('x-resource-file'):data.file_id);
    if(action==='file_content') {
      const f=await rpc('resource_file_authorize',{p_session:session,p_file_id:fileId}) as FileRow;
      const context=await connect();
      if(context.connection.id!==f.connection_id)throw new ResourceError('This document uses a different Drive connection. Administrator review is required.',503);
      const item=await metadata(context,f.drive_file_id!);
      if(item.appProperties?.resourceUpload!==f.id || !item.parents?.includes(f.drive_folder_id||''))throw new ResourceError('The original document location changed.',503);
      await privateItem(context,item.id);
      const response=await driveRequest(context,`${api}/${encodeURIComponent(item.id)}?alt=media`);
      if(!response.ok)throw new ResourceError('Document could not be downloaded.',503);
      const bytes=await resourceBody(response,RESOURCE_MAX_FILE_BYTES);
      if(bytes.length!==Number(f.file_size))throw new ResourceError('The original document size changed.',503);
      const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(value=>value.toString(16).padStart(2,'0')).join('');
      if(sha!==f.sha256)throw new ResourceError('The original document contents changed. Administrator review is required.',503);
      return new Response(bytes,{headers:{'Content-Type':f.mime_type,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(f.file_name)}`,'Content-Security-Policy':"default-src 'none'; sandbox"}});
    }
    const f=await rpc('resource_upload_claim',{p_session:session,p_file_id:fileId}) as FileRow;
    if(f.storage_state==='Ready')return publicStatus(f);
    try {
      const context=await connect();
      if(f.connection_id && context.connection.id!==f.connection_id)throw new ResourceError('The storage connection changed. Administrator review is required.',503);
      if(action==='upload_cleanup') {
        const item=await existingUploaded(context,f);
        if(item && (item.appProperties?.resourceUpload!==f.id || item.appProperties?.resourceEntry!==f.entry_id))throw new ResourceError('Cleanup refused: file does not belong to this upload.',403);
        if(item) {
          await privateItem(context,item.id);
          const deleted=await driveRequest(context,`${api}/${encodeURIComponent(item.id)}`,{method:'DELETE'});
          if(!deleted.ok)throw new ResourceError('Cleanup is pending. Retry later.',503);
        }
        await release(session,f,{storage_state:'Failed',upload_session_secret:null,failure_reason:'Upload cancelled; original submissions retained.'});
        return {id:f.id,storage_state:'Failed',uploaded_bytes:f.uploaded_bytes};
      }
      if(['Failed','CleanupRequired'].includes(f.storage_state))throw new ResourceError('This upload needs cleanup. Reserve a new upload after cleanup succeeds.',409);
      if(action==='upload_begin') {
        const item=await existingUploaded(context,f);if(item)return await finish(context,session,f,item);
        if(f.upload_session_secret){await release(session,f);return publicStatus(f);}
        // This root is deliberately outside the existing potentially shared master folder.
        const root=await ensureFolder(context,'resources-root:'+context.connection.id,'4KIS Documentary Repository (Private)');
        const folder=await ensureFolder(context,'resources-entry:'+context.connection.id+':'+f.entry_id,f.entry_id,root);
        const ids=f.drive_file_id?[f.drive_file_id]:(await driveJson(context,`${api}/generateIds?count=1&space=drive&type=files`)).ids;
        f.drive_file_id=ids[0];f.drive_folder_id=folder;f.connection_id=context.connection.id;
        // Persist preallocated identity before starting Drive, so response-loss never creates a second original.
        await release(session,f,{drive_file_id:f.drive_file_id,drive_folder_id:folder,connection_id:context.connection.id,storage_state:'Uploading'});
        const locked=await rpc('resource_upload_claim',{p_session:session,p_file_id:fileId}) as FileRow;Object.assign(f,locked);
        const response=await driveRequest(context,`${upload}?uploadType=resumable&fields=${fields}`,{method:'POST',headers:{'Content-Type':'application/json','X-Upload-Content-Type':f.mime_type,'X-Upload-Content-Length':String(f.file_size)},body:JSON.stringify({id:f.drive_file_id,name:f.file_name,mimeType:f.mime_type,parents:[folder],appProperties:{resourceUpload:f.id,resourceEntry:f.entry_id}})});
        if(!response.ok)throw new ResourceError('The upload session could not be started. Retry this upload.',503);
        f.upload_session_secret=sessionUrl(response.headers.get('location'));
        await release(session,f,{upload_session_secret:f.upload_session_secret,storage_state:'Uploading'});
        return publicStatus(f);
      }
      const completed=await existingUploaded(context,f);if(completed)return await finish(context,session,f,completed);
      let response:Response;
      if(action==='upload_status') {
        response=await driveRequest(context,sessionUrl(f.upload_session_secret),{method:'PUT',headers:{'Content-Range':`bytes */${f.file_size}`,'Content-Length':'0'}});
      } else {
        const offset=Number(request.headers.get('x-resource-offset'));
        if(!request.headers.has('x-resource-offset') || !Number.isSafeInteger(offset) || offset<0 || offset!==Number(f.uploaded_bytes))throw new ResourceError('Check the upload status before resending this chunk.',409);
        const bytes=await resourceBody(request,RESOURCE_CHUNK_BYTES);
        if(!bytes.length || offset+bytes.length>Number(f.file_size) || (offset+bytes.length<Number(f.file_size) && bytes.length!==RESOURCE_CHUNK_BYTES))throw new ResourceError('Invalid upload chunk.');
        response=await driveRequest(context,sessionUrl(f.upload_session_secret),{method:'PUT',headers:{'Content-Type':f.mime_type,'Content-Range':`bytes ${offset}-${offset+bytes.length-1}/${f.file_size}`},body:bytes});
      }
      if(response.status===308) {
        const range=response.headers.get('range');const match=range?.match(/^bytes=0-(\d+)$/);
        const offset=match?Number(match[1])+1:0;
        if(!Number.isSafeInteger(offset) || offset<0 || offset>Number(f.file_size))throw new ResourceError('Drive returned an invalid upload range.',503);
        await release(session,f,{uploaded_bytes:offset});return publicStatus(f,offset);
      }
      if(response.ok)return await finish(context,session,f,await response.json());
      if([404,410].includes(response.status)) {
        await release(session,f,{upload_session_secret:null,uploaded_bytes:0});
        throw new ResourceError('Upload session expired. Start the same upload again.',409,'UPLOAD_RESTART');
      }
      throw new ResourceError('Upload interrupted. Check its status before retrying.',503,'UPLOAD_UNCERTAIN');
    } catch(error) {
      // Releasing the lease never deletes bytes or previously registered documents.
      await release(session,f).catch(()=>{});throw error;
    }
  };
}
