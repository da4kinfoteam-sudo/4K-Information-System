import { ResourceError, RESOURCE_CHUNK_BYTES, RESOURCE_MAX_FILE_BYTES, resourceBody, resourceUuid, validateResourceBytes } from './resourcesProtocol.ts';
import {createResourceDriveAccess,resourceStorageKey,type ResourceDriveConnection,type ResourceDriveItem} from './resourcesDriveAccess.ts';

type Rpc = (name:string,args:Record<string,unknown>)=>Promise<any>;
type Connection = ResourceDriveConnection;
type FileRow = {
  id:string;entry_id:string;assignment_id:string|null;file_name:string;mime_type:string;file_size:number;sha256:string|null;
  storage_state:string;upload_lease_id:string|null;uploaded_bytes:number;drive_file_id:string|null;drive_folder_id:string|null;
  connection_id:string|null;upload_session_secret:string|null;
  expected_sha256?:string|null;
};
type DriveItem = ResourceDriveItem;
const api='https://www.googleapis.com/drive/v3/files';
const upload='https://www.googleapis.com/upload/drive/v3/files';
const fields='id,name,mimeType,size,parents,driveId,trashed,appProperties';

export function createResourcesStorage({rpc,connect,fetcher=fetch}:{rpc:Rpc;connect:()=>Promise<Connection>;fetcher?:typeof fetch}) {
  const access=createResourceDriveAccess(fetcher);
  const {request:driveRequest,json:driveJson,metadata}=access;
  const storageContext=(session:string,f:FileRow,read=false)=>rpc('resource_storage_context',{p_session:session,p_file_id:f.id,p_lease_id:read?null:f.upload_lease_id});
  const privateFile=async(context:Connection,session:string,f:FileRow,id:string,read=false)=>{
    const placement=await storageContext(session,f,read);
    if(placement.master_folder_id)await access.privateItem(context,id,placement.master_folder_id);
    else if(placement.legacy_root_id)await access.legacyItem(context,id,placement.legacy_root_id);
    else throw new ResourceError('The original storage mapping cannot be verified. Administrator review is required.',503,'STORAGE_LOCATION_CHANGED');
  };
  const ensureFolder=async(context:Connection,session:string,f:FileRow,placement:any,kind:string,name:string,parent:string,identity:string)=>{
    const master=context.connection.root_folder_id!;
    const key=await resourceStorageKey([context.connection.id,master,kind,parent,identity]);
    const args={p_session:session,p_file_id:f.id,p_upload_lease:f.upload_lease_id,p_key:key,p_connection_id:context.connection.id,p_folder_lease:crypto.randomUUID(),p_data:{kind,name,master_folder_id:master,parent_folder_id:parent,year:placement.year,entry_version:placement.entry_version}};
    const mapping=await rpc('resource_storage_mapping',args);
    try{
      if(mapping.folder_id){
        const item=await metadata(context,mapping.folder_id);
        if(item.appProperties?.resourceIdentity!==key||item.mimeType!=='application/vnd.google-apps.folder'||item.parents?.length!==1||item.parents[0]!==parent)throw new ResourceError('The repository folder identity or location changed.',503);
        await access.privateItem(context,item.id,master);
        if(item.name!==name)throw new ResourceError('The storage folder name needs synchronization. Retry from its details screen.',409,'STORAGE_NAME_PENDING');
        return item.id;
      }
      const query=`trashed=false and mimeType='application/vnd.google-apps.folder' and appProperties has { key='resourceIdentity' and value='${key}' }`;
      const existing=await driveJson(context,`${api}?q=${encodeURIComponent(query)}&fields=nextPageToken,files(${fields})&pageSize=100`,undefined,'folder_discovery');
      if(existing.nextPageToken||!Array.isArray(existing.files)||existing.files.length>1)throw new ResourceError('Storage folder identity is ambiguous. Administrator review is required.',503);
      const folder=existing.files[0]||await driveJson(context,`${api}?fields=${fields}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,mimeType:'application/vnd.google-apps.folder',appProperties:{resourceIdentity:key},parents:[parent]})},'folder_creation');
      if(folder.parents?.length!==1||folder.parents[0]!==parent||folder.appProperties?.resourceIdentity!==key)throw new ResourceError('The storage folder has an unexpected identity or parent.',503);
      await access.privateItem(context,folder.id,master);
      // A response-lost, not-yet-registered folder may carry an older subject.
      if(folder.name!==name)await driveJson(context,`${api}/${encodeURIComponent(folder.id)}?fields=${fields}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})},'folder_rename');
      await rpc('resource_storage_mapping',{...args,p_folder_id:folder.id});
      return folder.id as string;
    }catch(error){await rpc('resource_storage_mapping',{...args,p_release:true}).catch(()=>{});throw error;}
  };
  const prepareFolder=async(context:Connection,session:string,f:FileRow)=>{
    if(f.drive_folder_id){await privateFile(context,session,f,f.drive_folder_id);return f.drive_folder_id;}
    const master=context.connection.root_folder_id;
    if(!master)throw new ResourceError('The Google Drive master folder is not configured. Ask an administrator to review storage settings.',503,'STORAGE_CONFIGURATION');
    const masterItem=await metadata(context,master,'root_preparation');
    if(masterItem.mimeType!=='application/vnd.google-apps.folder')throw new ResourceError('The configured Drive parent is not a folder.',503);
    await access.privateItem(context,master,master);
    const placement=await storageContext(session,f);
    const branch=await ensureFolder(context,session,f,placement,'branch','Documentary Repository',master,'repository');
    const year=await ensureFolder(context,session,f,placement,'year',String(placement.year),branch,String(placement.year));
    const subject=await ensureFolder(context,session,f,placement,'entry',placement.subject,year,f.entry_id);
    return f.assignment_id?ensureFolder(context,session,f,placement,'ou',placement.assignment_ou,subject,f.assignment_id):subject;
  };
  const syncEntry=async(session:string,entryId:string)=>{
    const pending=await rpc('resource_storage_renames',{p_session:session,p_entry_id:entryId});
    if(!pending.rows.length)return {storage_sync_pending:false};
    const context=await connect();
    for(const row of pending.rows){
      const args={p_session:session,p_entry_id:entryId,p_key:row.key,p_lease:crypto.randomUUID()};
      const mapping=await rpc('resource_storage_rename_claim',args);
      try{
        if(mapping.connection_id!==context.connection.id)throw new ResourceError('This folder uses a different Drive connection. Administrator review is required.',503);
        const item=await metadata(context,mapping.folder_id);
        if(item.appProperties?.resourceIdentity!==row.key||item.parents?.length!==1||item.parents[0]!==mapping.parent_folder_id)throw new ResourceError('The mapped folder location changed. Administrator review is required.',503);
        await access.privateItem(context,item.id,mapping.master_folder_id);
        if(item.name!==mapping.desired_name)await driveJson(context,`${api}/${encodeURIComponent(item.id)}?fields=${fields}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:mapping.desired_name})},'folder_rename');
        await rpc('resource_storage_rename_claim',{...args,p_done_name:mapping.desired_name});
      }catch(error){await rpc('resource_storage_rename_claim',{...args,p_release:true}).catch(()=>{});throw error;}
    }
    const remaining=await rpc('resource_storage_renames',{p_session:session,p_entry_id:entryId});
    return {storage_sync_pending:!!remaining.rows.length};
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
    if(!response.ok)return access.failure(response,'upload_status');
    return await response.json() as DriveItem;
  };
  const finish=async(context:Connection,session:string,f:FileRow,item:DriveItem)=>{
    if(item.id!==f.drive_file_id || item.appProperties?.resourceUpload!==f.id || item.appProperties?.resourceEntry!==f.entry_id || !item.parents?.includes(f.drive_folder_id||'') || Number(item.size)!==Number(f.file_size))throw new ResourceError('Uploaded file metadata does not match this upload.',409);
    await privateFile(context,session,f,item.id);
    const response=await driveRequest(context,`${api}/${encodeURIComponent(item.id)}?alt=media`,{},'file_download');
    if(!response.ok)return access.failure(response,'file_download');
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
    if(action==='entry_sync')return syncEntry(session,resourceUuid(data.entry_id));
    const fileId=resourceUuid(action==='upload_chunk'?request.headers.get('x-resource-file'):data.file_id);
    if(action==='file_content') {
      const f=await rpc('resource_file_authorize',{p_session:session,p_file_id:fileId}) as FileRow;
      const context=await connect();
      if(context.connection.id!==f.connection_id)throw new ResourceError('This document uses a different Drive connection. Administrator review is required.',503);
      const item=await metadata(context,f.drive_file_id!);
      if(item.id!==f.drive_file_id||item.appProperties?.resourceUpload!==f.id||item.appProperties?.resourceEntry!==f.entry_id||item.parents?.length!==1||item.parents[0]!==f.drive_folder_id)throw new ResourceError('The original document location changed.',503);
      await privateFile(context,session,f,item.id,true);
      const response=await driveRequest(context,`${api}/${encodeURIComponent(item.id)}?alt=media`,{},'file_download');
      if(!response.ok)return access.failure(response,'file_download');
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
          await privateFile(context,session,f,item.id);
          const deleted=await driveRequest(context,`${api}/${encodeURIComponent(item.id)}`,{method:'DELETE'},'upload_cleanup');
          if(!deleted.ok)return access.failure(deleted,'upload_cleanup');
        }
        await release(session,f,{storage_state:'Failed',upload_session_secret:null,failure_reason:'Upload cancelled; original submissions retained.'});
        return {id:f.id,storage_state:'Failed',uploaded_bytes:f.uploaded_bytes};
      }
      if(['Failed','CleanupRequired'].includes(f.storage_state))throw new ResourceError('This upload needs cleanup. Reserve a new upload after cleanup succeeds.',409);
      if(action==='upload_begin') {
        const item=await existingUploaded(context,f);if(item)return await finish(context,session,f,item);
        if(f.upload_session_secret){await release(session,f);return publicStatus(f);}
        const folder=await prepareFolder(context,session,f);
        const ids=f.drive_file_id?[f.drive_file_id]:(await driveJson(context,`${api}/generateIds?count=1&space=drive&type=files`,undefined,'file_identity')).ids;
        f.drive_file_id=ids[0];f.drive_folder_id=folder;f.connection_id=context.connection.id;
        // Persist preallocated identity before starting Drive, so response-loss never creates a second original.
        await release(session,f,{drive_file_id:f.drive_file_id,drive_folder_id:folder,connection_id:context.connection.id,storage_state:'Uploading'});
        const locked=await rpc('resource_upload_claim',{p_session:session,p_file_id:fileId}) as FileRow;Object.assign(f,locked);
        const response=await driveRequest(context,`${upload}?uploadType=resumable&fields=${fields}`,{method:'POST',headers:{'Content-Type':'application/json','X-Upload-Content-Type':f.mime_type,'X-Upload-Content-Length':String(f.file_size)},body:JSON.stringify({id:f.drive_file_id,name:f.file_name,mimeType:f.mime_type,parents:[folder],appProperties:{resourceUpload:f.id,resourceEntry:f.entry_id}})},'upload_session');
        if(!response.ok)return access.failure(response,'upload_session');
        f.upload_session_secret=sessionUrl(response.headers.get('location'));
        await release(session,f,{upload_session_secret:f.upload_session_secret,storage_state:'Uploading'});
        return publicStatus(f);
      }
      const completed=await existingUploaded(context,f);if(completed)return await finish(context,session,f,completed);
      let response:Response;
      if(action==='upload_status') {
        response=await driveRequest(context,sessionUrl(f.upload_session_secret),{method:'PUT',headers:{'Content-Range':`bytes */${f.file_size}`,'Content-Length':'0'}},'upload_status');
      } else {
        const offset=Number(request.headers.get('x-resource-offset'));
        if(!request.headers.has('x-resource-offset') || !Number.isSafeInteger(offset) || offset<0 || offset!==Number(f.uploaded_bytes))throw new ResourceError('Check the upload status before resending this chunk.',409);
        const bytes=await resourceBody(request,RESOURCE_CHUNK_BYTES);
        if(!bytes.length || offset+bytes.length>Number(f.file_size) || (offset+bytes.length<Number(f.file_size) && bytes.length!==RESOURCE_CHUNK_BYTES))throw new ResourceError('Invalid upload chunk.');
        await privateFile(context,session,f,f.drive_folder_id!);
        response=await driveRequest(context,sessionUrl(f.upload_session_secret),{method:'PUT',headers:{'Content-Type':f.mime_type,'Content-Range':`bytes ${offset}-${offset+bytes.length-1}/${f.file_size}`},body:bytes},'upload_chunk');
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
      return access.failure(response,action==='upload_status'?'upload_status':'upload_chunk');
    } catch(error) {
      // Releasing the lease never deletes bytes or previously registered documents.
      await release(session,f).catch(()=>{});throw error;
    }
  };
}
