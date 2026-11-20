import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createResourcesStorage } from '../supabase/functions/_shared/resourcesDrive.ts';
import { RESOURCE_CHUNK_BYTES } from '../supabase/functions/_shared/resourcesProtocol.ts';
let passed=0;
const check=async(name,run)=>{await run();passed++;console.log('PASS '+name);};

function fixture({size=RESOURCE_CHUNK_BYTES+13,loseFinalResponse=false,shared=false,badContent=false}={}) {
    const bytes=new Uint8Array(size);bytes.set(new TextEncoder().encode(badContent?'<html>':'%PDF-1.7'));
    const row={id:randomUUID(),entry_id:randomUUID(),assignment_id:randomUUID(),file_name:'signed.pdf',mime_type:'application/pdf',file_size:size,sha256:null,storage_state:'Reserved',upload_lease_id:null,uploaded_bytes:0,drive_file_id:null,drive_folder_id:null,connection_id:null,upload_session_secret:null};
    const files=new Map(),folders=new Map(),sessions=new Map(),calls=[];let readyCalls=0,deleted=0,started=0,generated=0;
    const context={connection:{id:'fixture-connection',google_account_email:'owner@example.test'},accessToken:'server-only-token'};
    const json=(value,status=200,headers={})=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json',...headers}});
    const rpc=async(name,args)=>{
        assert.equal(name==='resource_folder_lease' || args.p_session==='verified',true);
        if(name==='resource_folder_lease') {
            const value=folders.get(args.p_key)||{};
            if(args.p_folder_id)value.folder_id=args.p_folder_id;folders.set(args.p_key,value);return {...value};
        }
        assert.equal(args.p_file_id,row.id);
        if(name==='resource_upload_claim') {
            if(row.storage_state!=='Ready') {assert.equal(row.upload_lease_id,null);row.upload_lease_id=randomUUID();}
            return structuredClone(row);
        }
        if(name==='resource_upload_release') {
            if(row.storage_state!=='Ready') {assert.equal(args.p_lease_id,row.upload_lease_id);Object.assign(row,args.p_changes);row.upload_lease_id=null;}
            return {id:row.id,storage_state:row.storage_state};
        }
        if(name==='resource_file_ready') {
            readyCalls++;Object.assign(row,{sha256:args.p_sha256,storage_state:'Ready',upload_session_secret:null});return {...row};
        }
        if(name==='resource_file_authorize') {assert.equal(row.storage_state,'Ready');return {...row};}
        throw new Error('Unexpected RPC '+name);
    };
    const fetcher=async(url,init={})=>{
        const u=new URL(url),method=init.method||'GET',headers=new Headers(init.headers);calls.push({url,method,body:init.body});
        assert.equal(headers.get('authorization'),'Bearer server-only-token');assert.equal(init.redirect,'error');
        if(u.pathname.endsWith('/permissions'))return json({permissions:[{type:'user',role:'owner',emailAddress:'owner@example.test'},...(shared?[{type:'anyone',role:'reader'}]:[])]});
        if(u.pathname.endsWith('/generateIds'))return json({ids:['allocated-'+(++generated)]});
        if(u.pathname==='/upload/drive/v3/files' && method==='POST') {
            const metadata=JSON.parse(init.body),session='https://www.googleapis.com/upload/drive/v3/files?upload_id='+metadata.id;
            sessions.set(session,{metadata,offset:0,bytes:new Uint8Array(size)});started++;
            return new Response(null,{status:200,headers:{location:session}});
        }
        if(u.pathname==='/upload/drive/v3/files' && method==='PUT') {
            const upload=sessions.get(url);assert(upload);
            const range=headers.get('content-range');
            if(!range.startsWith('bytes */')) {
                const match=range.match(/^bytes (\d+)-(\d+)\/(\d+)$/);assert(match);assert.equal(Number(match[1]),upload.offset);
                upload.bytes.set(init.body,upload.offset);upload.offset=Number(match[2])+1;
            }
            if(upload.offset===size) {
                const item={...upload.metadata,size:String(size)};files.set(item.id,{...item,bytes:upload.bytes});
                if(loseFinalResponse) {loseFinalResponse=false;throw new TypeError('Synthetic connection lost after Drive commit');}
                return json(item);
            }
            return new Response(null,{status:308,headers:upload.offset?{range:'bytes=0-'+(upload.offset-1)}:{}});
        }
        if(u.pathname==='/drive/v3/files' && method==='GET') {
            const key=decodeURIComponent(u.searchParams.get('q')).match(/value='([^']+)'/)?.[1];
            return json({files:[...files.values()].filter(item=>item.appProperties?.resourceIdentity===key).map(({bytes,...item})=>item)});
        }
        if(u.pathname==='/drive/v3/files' && method==='POST') {
            const item={id:'folder-'+files.size,...JSON.parse(init.body)};files.set(item.id,item);return json(item);
        }
        const id=decodeURIComponent(u.pathname.split('/').pop()),item=files.get(id);
        if(!item)return json({},404);
        if(method==='DELETE'){files.delete(id);deleted++;return new Response(null,{status:204});}
        if(u.searchParams.get('alt')==='media')return new Response(item.bytes,{headers:{'content-length':String(item.bytes.length)}});
        const {bytes:ignored,...metadata}=item;return json(metadata);
    };
    const storage=createResourcesStorage({rpc,connect:async()=>context,fetcher});
    const request=(action,data={})=>storage(action,'verified',new Request('https://local.test',{method:'POST'}),{file_id:row.id,...data});
    const chunk=async(offset,length)=>storage('upload_chunk','verified',new Request('https://local.test',{method:'POST',headers:{'x-resource-file':row.id,'x-resource-offset':String(offset)},body:bytes.subarray(offset,offset+length)}),{});
    return {row,request,chunk,bytes,files,calls,setShared:value=>{shared=value;},stats:()=>({readyCalls,deleted,started,generated})};
}

await check('resumable chunks use private isolated folders and retain a single original',async()=>{
    const f=fixture();const begin=await f.request('upload_begin');assert.equal(begin.storage_state,'Uploading');
    assert(!JSON.stringify(begin).includes('server-only'));assert(!JSON.stringify(begin).includes('upload_id'));
    assert.equal((await f.chunk(0,RESOURCE_CHUNK_BYTES)).uploaded_bytes,RESOURCE_CHUNK_BYTES);
    const result=await f.chunk(RESOURCE_CHUNK_BYTES,13);assert.equal(result.storage_state,'Ready');
    assert.match(f.row.sha256,/^[a-f\d]{64}$/);assert.equal(f.stats().readyCalls,1);
    const response=await f.request('file_content');assert.deepEqual(new Uint8Array(await response.arrayBuffer()),f.bytes);
    assert.match(response.headers.get('content-disposition'),/attachment/);
    assert.equal(f.calls.filter(call=>call.method==='POST'&&call.url.includes('/permissions')).length,0);
    const root=f.calls.find(call=>call.method==='POST'&&String(call.body).includes('resources-root:'));
    assert(!JSON.parse(root.body).parents);
});
await check('lost final response is reconciled by preallocated ID without a second upload or original',async()=>{
    const f=fixture({size:64,loseFinalResponse:true});await f.request('upload_begin');
    await assert.rejects(()=>f.chunk(0,64),/connection lost/);
    assert.equal(f.row.storage_state,'Uploading');assert.equal(f.stats().readyCalls,0);
    assert.equal((await f.request('upload_status')).storage_state,'Ready');
    assert.equal(f.stats().started,1);assert.equal(f.stats().generated,1);assert.equal(f.stats().readyCalls,1);
    await f.request('upload_begin');await f.request('upload_cleanup');assert.equal(f.stats().deleted,0);
});
await check('Drive ACL changes prevent both uploading and downloading confidential originals',async()=>{
    const blocked=fixture({size:64,shared:true});await assert.rejects(()=>blocked.request('upload_begin'),/shared outside/);
    assert.equal(blocked.stats().started,0);
    const f=fixture({size:64});await f.request('upload_begin');await f.chunk(0,64);f.setShared(true);
    await assert.rejects(()=>f.request('file_content'),/shared outside/);assert.equal(f.stats().deleted,0);
});
await check('wrong chunk offsets and type-spoofed uploads fail without registering receipts or deleting previous originals',async()=>{
    const f=fixture({size:64,badContent:true});await f.request('upload_begin');
    await assert.rejects(()=>f.chunk(1,63),/status/);assert.equal(f.row.uploaded_bytes,0);
    await assert.rejects(()=>f.chunk(0,64),/contents/);assert.equal(f.row.storage_state,'CleanupRequired');assert.equal(f.stats().readyCalls,0);
    assert.equal(f.stats().deleted,0);await f.request('upload_cleanup');assert.equal(f.stats().deleted,1);assert.equal(f.row.storage_state,'Failed');
});
await check('unexpected original content changes are detected at download',async()=>{
    const f=fixture({size:64});await f.request('upload_begin');await f.chunk(0,64);
    f.files.get(f.row.drive_file_id).bytes[20]=1;
    await assert.rejects(()=>f.request('file_content'),/contents changed/);assert.equal(f.stats().deleted,0);
});
console.log(`${passed} Resources Drive checks passed. Simulated Drive; no production credentials or storage used.`);
