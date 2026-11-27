import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createResourcesFixture} from './resources-sql-fixture.mjs';
import {createResourcesDriveFixture} from './resources-drive-fixture.mjs';
import {createResourcesStorage} from '../supabase/functions/_shared/resourcesDrive.ts';
import {createResourcesHandler} from '../supabase/functions/_shared/resourcesHttp.ts';
import {createResourceDriveAccess} from '../supabase/functions/_shared/resourcesDriveAccess.ts';

const {db,rpc}=await createResourcesFixture(),drive=createResourcesDriveFixture();
const storage=createResourcesStorage({rpc,...drive}),handler=createResourcesHandler({rpc,storage,origins:[]});
let passed=0;
const check=async(name,run)=>{await run();passed++;console.log('PASS '+name);};
const session=(await rpc('resource_start_session',{p_identifier:'root',p_password:'fixture-password'})).token;
const user=(await rpc('resource_start_session',{p_identifier:'region1',p_password:'fixture-password'})).token;
const mutate=(action,data,version=null)=>rpc('resource_mutate',{p_session:session,p_action:action,p_data:data,p_expected_version:version,p_request_id:randomUUID()});
const entry=(subject='Official Memo',extra={})=>mutate('entry_save',{kind:'File',subject,instructions:'Document context',reporting_year:2025,...extra});
const bytes=new TextEncoder().encode('%PDF-1.7\nDisposable local content');
const reserve=e=>mutate('file_reserve',{entry_id:e.id,file_name:'original.pdf',mime_type:'application/pdf',file_size:bytes.length});
const act=(action,f,token=session)=>storage(action,token,new Request('https://fixture.test',{method:'POST'}),{file_id:f.id});
const upload=async f=>{await act('upload_begin',f);return storage('upload_chunk',session,new Request('https://fixture.test',{method:'POST',headers:{'x-resource-file':f.id,'x-resource-offset':'0'},body:bytes}),{});};
try{
    let e,f;
    await check('configured IPO parent/year/subject hierarchy works without access to My Drive ancestor',async()=>{
        e=await entry();f=await reserve(e);assert.equal((await upload(f)).storage_state,'Ready');
        const folders=[...drive.files.values()].filter(item=>item.mimeType==='application/vnd.google-apps.folder');
        const branch=folders.find(item=>item.name==='Documentary Repository'),year=folders.find(item=>item.name==='2025'),subject=folders.find(item=>item.name===e.subject);
        assert.deepEqual(branch.parents,['configured-master']);assert.deepEqual(year.parents,[branch.id]);assert.deepEqual(subject.parents,[year.id]);
        assert.equal(drive.calls.some(call=>call.url.includes('/inaccessible-my-drive')),false);
        for(const item of folders.filter(item=>item.appProperties))assert.match(item.appProperties.resourceIdentity,/^repo:[a-f0-9]{64}$/);
        assert.equal((await db.query('select storage_year from repository_entries where id=$1',[e.id])).rows[0].storage_year,2025);
    });
    await check('original download is byte-exact and a second standalone upload is rejected',async()=>{
        const response=await act('file_content',f);assert.deepEqual(new Uint8Array(await response.arrayBuffer()),bytes);
        await assert.rejects(()=>reserve(e),/already has an upload/);
        await assert.rejects(()=>act('file_content',f,user),/unavailable|denied/i);
    });
    await check('duplicate subjects never cross-link entries and repeated begin preserves identities',async()=>{
        const second=await entry(),pending=await reserve(second);await act('upload_begin',pending);await act('upload_begin',pending);
        const rows=(await db.query('select drive_folder_id,drive_file_id from repository_files order by created_at')).rows;
        assert.notEqual(rows[0].drive_folder_id,rows[1].drive_folder_id);assert.notEqual(rows[0].drive_file_id,rows[1].drive_file_id);
        assert.equal([...drive.files.values()].filter(item=>item.name===e.subject).length,2);
    });
    await check('subject edits rename only the mapped folder and cannot relocate the year',async()=>{
        const before=(await db.query('select drive_folder_id,drive_file_id from repository_files where id=$1',[f.id])).rows[0];
        const changed=await mutate('entry_save',{...e,subject:'Revised Memo'},e.version);
        assert.equal(changed.storage_sync_pending,true);
        await storage('entry_sync',session,new Request('https://fixture.test'),{entry_id:e.id});
        assert.equal(drive.files.get(before.drive_folder_id).name,'Revised Memo');assert(drive.files.has(before.drive_file_id));
        assert.deepEqual((await db.query('select drive_folder_id,drive_file_id from repository_files where id=$1',[f.id])).rows[0],before);
        await assert.rejects(()=>mutate('entry_save',{...changed,reporting_year:2026},changed.version),/storage year is fixed/);
        await storage('entry_sync',session,new Request('https://fixture.test'),{entry_id:e.id});
        assert.equal((await db.query("select count(*)::integer count from resource_events where event='Storage Folder Name Synchronized'")).rows[0].count,1);
    });
    await check('shared inherited ACL blocks writes and reads without changing permissions',async()=>{
        drive.setShared(true);const blocked=await entry('Blocked'),intent=await reserve(blocked);
        await assert.rejects(()=>act('upload_begin',intent),/shares documents/);
        await assert.rejects(()=>act('file_content',f),/shares documents/);
        assert.equal(drive.calls.filter(call=>call.method!=='GET'&&call.url.includes('/permissions')).length,0);drive.setShared(false);
    });
    await check('lost rename response keeps saved metadata and retry completes the same mapping',async()=>{
        const current=await rpc('resource_read',{p_session:session,p_resource:'entry',p_args:{id:e.id}});
        const failing=createResourcesStorage({rpc,connect:drive.connect,fetcher:async(url,init)=>{
            const response=await drive.fetcher(url,init);if(init?.method==='PATCH')throw new Error('Synthetic lost rename response');return response;
        }});
        const failedHandler=createResourcesHandler({rpc,storage:failing,origins:[]});
        const operation={action:'mutate',mutation:'entry_save',data:{...current,subject:'Final Memo'},version:current.version,request_id:randomUUID()};
        const request=()=>new Request('https://fixture.test',{method:'POST',headers:{'x-resource-session':session,'content-type':'application/json'},body:JSON.stringify(operation)});
        const first=await failedHandler(request()),saved=await first.json();assert.equal(first.status,200);assert.equal(saved.subject,'Final Memo');assert.equal(saved.storage_sync_pending,true);
        const second=await handler(request()),recovered=await second.json();assert.equal(second.status,200);assert.equal(recovered.storage_sync_pending,false);assert.equal(recovered.version,saved.version);
    });
    await check('sanitized diagnostics retain operation/status/reason but no upstream secrets',async()=>{
        const diagnostics=[];const access=createResourceDriveAccess(async()=>new Response(JSON.stringify({error:{message:'secret-document-and-token',errors:[{reason:'insufficientFilePermissions'}]}}),{status:403}),value=>diagnostics.push(value));
        await assert.rejects(()=>access.json(drive.context,'https://www.googleapis.com/secret-token',undefined,'root_preparation'),/Drive denied access/);
        assert.deepEqual(diagnostics,[{operation:'root_preparation',status:403,reason:'insufficientFilePermissions'}]);assert(!JSON.stringify(diagnostics).includes('secret'));
    });
    await check('required folder uploads use the reporting year and a separate OU folder',async()=>{
        const requirement=await entry('Annual Requirement',{kind:'Folder',required_submission:true,reporting_year:2024,due_date:'2026-12-31',assigned_ous:['RPMO 1']});
        const assignment=(await db.query('select id from repository_assignments where entry_id=$1',[requirement.id])).rows[0].id;
        await mutate('entry_publish',{id:requirement.id},requirement.version);
        const intent=await mutate('file_reserve',{entry_id:requirement.id,assignment_id:assignment,file_name:'required.pdf',mime_type:'application/pdf',file_size:bytes.length,reason:'Authorized local fixture'});
        await upload(intent);
        const folderId=(await db.query('select drive_folder_id from repository_files where id=$1',[intent.id])).rows[0].drive_folder_id;
        const ou=drive.files.get(folderId),subject=drive.files.get(ou.parents[0]),year=drive.files.get(subject.parents[0]);
        assert.equal(ou.name,'RPMO 1');assert.equal(subject.name,'Annual Requirement');assert.equal(year.name,'2024');assert.equal(await db.query('select * from repository_submission_versions').then(result=>result.rows.length),0);
    });
    await check('legacy Ready originals remain readable in their registered root without moves or replacements',async()=>{
        const legacy=await entry('Legacy Original'),intent=await reserve(legacy);
        drive.files.set('legacy-root',{id:'legacy-root',name:'4KIS Documentary Repository (Private)',mimeType:'application/vnd.google-apps.folder',parents:['inaccessible-my-drive'],appProperties:{resourceIdentity:'resources-root:disposable-drive'}});
        drive.files.set('legacy-entry',{id:'legacy-entry',name:legacy.id,mimeType:'application/vnd.google-apps.folder',parents:['legacy-root'],appProperties:{resourceIdentity:'resources-entry:disposable-drive:'+legacy.id}});
        await db.query("insert into repository_drive_folders(identity_key,connection_id,folder_id) values('resources-root:disposable-drive','disposable-drive','legacy-root')");
        await db.query("update repository_files set drive_file_id='legacy-preallocated',drive_folder_id='legacy-entry',connection_id='disposable-drive' where id=$1",[intent.id]);
        await upload(intent);
        const writes=drive.calls.filter(call=>call.method!=='GET').length;
        assert.deepEqual(new Uint8Array(await (await act('file_content',intent)).arrayBuffer()),bytes);
        assert.equal(drive.calls.filter(call=>call.method!=='GET').length,writes);assert.equal((await db.query('select drive_file_id from repository_files where id=$1',[intent.id])).rows[0].drive_file_id,'legacy-preallocated');
        await assert.rejects(()=>db.query("update repository_files set drive_folder_id='changed' where id=$1",[intent.id]),/immutable/);
    });
    await check('additive migration preserves pre-existing rows and legacy NULLs on unrelated saves',async()=>{
        let legacyId,before;
        const old=await createResourcesFixture({beforeStorageWorkflow:async database=>{
            legacyId=(await database.query("insert into repository_entries(kind,subject,created_by_name) values('File','Legacy multi-file record','Fixture') returning id")).rows[0].id;
            before=(await database.query('select to_jsonb(e) value from repository_entries e where id=$1',[legacyId])).rows[0].value;
        }});
        try{
            const after=(await old.db.query("select to_jsonb(e)-array['storage_year','single_document'] value,single_document,storage_year from repository_entries e where id=$1",[legacyId])).rows[0];assert.deepEqual(after.value,before);assert.equal(after.single_document,null);assert.equal(after.storage_year,null);
            const token=(await old.rpc('resource_start_session',{p_identifier:'root',p_password:'fixture-password'})).token;
            const saved=await old.rpc('resource_mutate',{p_session:token,p_action:'entry_save',p_data:{id:legacyId,subject:'Legacy revised'},p_request_id:randomUUID(),p_expected_version:before.version});assert.equal(saved.reporting_year,null);assert.equal(saved.single_document,null);
        }finally{await old.db.close();}
    });
    await check('folder creation response loss recovers by identity without duplicate folders',async()=>{
        const recovering=await entry('Folder Response Recovery'),intent=await reserve(recovering);let lost=false;
        const uncertain=createResourcesStorage({rpc,connect:drive.connect,fetcher:async(url,init)=>{const response=await drive.fetcher(url,init);if(init?.method==='POST'&&String(init.body).includes('Folder Response Recovery')&&!url.includes('/upload/')){lost=true;throw new Error('Synthetic lost folder response');}return response;}});
        await assert.rejects(()=>uncertain('upload_begin',session,new Request('https://fixture.test'),{file_id:intent.id}),/Drive request interrupted/);assert.equal(lost,true);
        await upload(intent);assert.equal([...drive.files.values()].filter(item=>item.name==='Folder Response Recovery').length,1);
    });
    await check('concurrent subject edit during preparation rejects stale registration and recovers one folder',async()=>{
        const changing=await entry('Preparation Before'),intent=await reserve(changing);let changed=false;
        const racing=createResourcesStorage({rpc,connect:drive.connect,fetcher:async(url,init)=>{const response=await drive.fetcher(url,init);if(!changed&&init?.method==='POST'&&String(init.body).includes('Preparation Before')&&!url.includes('/upload/')){changed=true;await mutate('entry_save',{id:changing.id,subject:'Preparation After'},changing.version);}return response;}});
        await assert.rejects(()=>racing('upload_begin',session,new Request('https://fixture.test'),{file_id:intent.id}),/details changed/);
        await upload(intent);assert.equal([...drive.files.values()].filter(item=>item.name==='Preparation After').length,1);assert.equal([...drive.files.values()].filter(item=>item.name==='Preparation Before').length,0);
    });
    await check('mapping helpers remain service-only and ordinary users cannot rename folders',async()=>{
        const grants=(await db.query("select p.oid::regprocedure::text signature,has_function_privilege('anon',p.oid,'EXECUTE') anon,has_function_privilege('authenticated',p.oid,'EXECUTE') browser,has_function_privilege('service_role',p.oid,'EXECUTE') service from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('resource_storage_context','resource_storage_mapping','resource_storage_renames','resource_storage_rename_claim')")).rows;
        assert.equal(grants.length,4);assert(grants.every(row=>!row.anon&&!row.browser&&row.service));await assert.rejects(()=>storage('entry_sync',user,new Request('https://fixture.test'),{entry_id:e.id}),/denied/i);
    });
    await check('ambiguous or misplaced recovered folders stop without deleting or moving originals',async()=>{
        const ambiguous=await entry('Ambiguous Preparation'),intent=await reserve(ambiguous);
        const uncertain=createResourcesStorage({rpc,connect:drive.connect,fetcher:async(url,init)=>{const response=await drive.fetcher(url,init);if(init?.method==='POST'&&String(init.body).includes('Ambiguous Preparation')&&!url.includes('/upload/'))throw new Error('Synthetic response loss');return response;}});
        await assert.rejects(()=>uncertain('upload_begin',session,new Request('https://fixture.test'),{file_id:intent.id}),/interrupted/);
        const folder=[...drive.files.values()].find(item=>item.name==='Ambiguous Preparation'),parent=folder.parents[0];drive.files.set('ambiguous-copy',{...folder,id:'ambiguous-copy'});
        await assert.rejects(()=>act('upload_begin',intent),/ambiguous/);drive.files.delete('ambiguous-copy');folder.parents=['configured-master'];
        const writes=drive.calls.filter(call=>['PATCH','DELETE'].includes(call.method)).length;
        await assert.rejects(()=>act('upload_begin',intent),/unexpected identity or parent/);assert.equal(drive.calls.filter(call=>['PATCH','DELETE'].includes(call.method)).length,writes);
        folder.parents=[parent];await upload(intent);
    });
    console.log(`Repository storage workflow: ${passed} checks passed.`);
}finally{await db.close();}
