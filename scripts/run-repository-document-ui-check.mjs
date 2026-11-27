import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createRepositoryBrowserFixture} from './resources-repository-fixture.mjs';
import {createResourcesStorage} from '../supabase/functions/_shared/resourcesDrive.ts';
const require=createRequire(import.meta.url);
const {chromium}=require(path.join(process.env.PLAYWRIGHT_NODE_MODULES||'C:/Users/joelm/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules','playwright'));
const output=await mkdtemp(path.join(tmpdir(),'4kis-repository-document-')),serve=process.argv.includes('--serve');
const fixture=await createRepositoryBrowserFixture(output,{port:serve?Number(process.env.PORT||3041):0}),{db,url,drive}=fixture;
let png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
let browser,page,passed=0;const errors=[];
const check=async(name,run)=>{await run();passed++;console.log('PASS '+name);};
const count=async table=>(await db.query(`select count(*)::integer count from ${table}`)).rows[0].count;
try{
    if(serve){console.log('Disposable repository document preview: '+url);await new Promise(()=>{});}
    browser=await chromium.launch({channel:'msedge',headless:true});page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(20000);page.on('pageerror',error=>errors.push(error.message));await page.route('https://**',route=>route.abort());await page.goto(url);await page.getByText('No records found.',{exact:true}).waitFor();
    png=Buffer.from(await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;const context=canvas.getContext('2d');context.fillStyle='#edf4ee';context.fillRect(0,0,640,360);context.fillStyle='#254d3a';context.font='24px sans-serif';context.fillText('Disposable Official Document Preview',32,70);context.font='16px sans-serif';context.fillText('Local verification sample only',32,110);return canvas.toDataURL('image/png').split(',')[1];}),'base64');
    let id;
    await check('Upload File opens a combined document form, not a folder editor',async()=>{
        await page.getByRole('button',{name:'Upload File',exact:true}).click();await page.getByRole('heading',{name:'Upload Document',exact:true}).waitFor();
        assert.equal(await page.getByRole('dialog').count(),0);assert.equal(await page.getByLabel('Required Submission',{exact:true}).count(),0);
        assert.equal(await page.locator('input[type=file]').getAttribute('multiple'),null);
        await page.getByLabel('Subject',{exact:true}).fill('Official Test Document');await page.getByLabel('Description',{exact:true}).fill('Document description');await page.getByLabel('Year',{exact:true}).fill('2025');
        await page.locator('input[type=file]').setInputFiles({name:'original.png',mimeType:'image/png',buffer:png});await page.screenshot({path:path.join(output,'upload-desktop.png'),fullPage:true});
    });
    await check('one confirmed upload opens its direct preview without publishing or folder UI',async()=>{
        await page.getByRole('button',{name:'Upload',exact:true}).click();await page.getByRole('heading',{name:'Official Test Document',exact:true}).waitFor();await page.getByRole('button',{name:'Download Original',exact:true}).waitFor();
        await page.locator('.repository-preview-image').waitFor();id=(await db.query('select id from repository_entries')).rows[0].id;
        assert.equal(await count('repository_entries'),1);assert.equal(await count('repository_files'),1);assert.equal((await db.query('select state from repository_entries')).rows[0].state,'Draft');
        assert.equal(await page.getByRole('heading',{name:'Folder Contents',exact:true}).count(),0);assert.equal(await page.getByRole('heading',{name:'Official Files',exact:true}).count(),0);assert.equal(await page.locator('table').count(),0);
        assert.equal(await page.getByText('Document description',{exact:true}).count(),1);await page.reload();await page.getByRole('button',{name:'Download Original',exact:true}).waitFor();assert(page.url().includes(id));
    });
    await check('metadata edits synchronize subject folder while original ID and bytes stay unchanged',async()=>{
        const before=(await db.query('select drive_file_id,drive_folder_id from repository_files')).rows[0];await page.getByRole('button',{name:'Edit Details',exact:true}).click();const modal=page.getByRole('dialog');await modal.getByLabel('Subject',{exact:true}).fill('Renamed Document');await modal.getByRole('button',{name:'Save',exact:true}).click();await page.getByRole('heading',{name:'Renamed Document',exact:true}).waitFor();
        assert.equal(drive.files.get(before.drive_folder_id).name,'Renamed Document');assert.deepEqual(Buffer.from(drive.files.get(before.drive_file_id).bytes),png);assert.equal(await count('repository_files'),1);
    });
    await check('failed upload retries the same draft and file intent on its dedicated screen',async()=>{
        await page.goto(url+'#/documentary-repository');await page.getByRole('button',{name:'Upload File',exact:true}).click();await page.getByLabel('Subject',{exact:true}).fill('Recoverable Document');await page.locator('input[type=file]').setInputFiles({name:'retry.png',mimeType:'image/png',buffer:png});drive.setShared(true);
        await page.getByRole('button',{name:'Upload',exact:true}).click();await page.getByRole('heading',{name:'Recoverable Document',exact:true}).waitFor();await page.getByRole('button',{name:'Resume Upload',exact:true}).waitFor();
        assert.equal(await count('repository_entries'),2);assert.equal(await count('repository_files'),2);drive.setShared(false);await page.getByRole('button',{name:'Resume Upload',exact:true}).click();await page.getByRole('button',{name:'Download Original',exact:true}).waitFor();assert.equal(await count('repository_entries'),2);assert.equal(await count('repository_files'),2);
    });
    await check('lost create and reserve replies reuse their exact request identities',async()=>{
        await page.goto(url+'#/documentary-repository');await page.getByRole('button',{name:'Upload File',exact:true}).click();await page.getByLabel('Subject',{exact:true}).fill('Response Recovery');await page.locator('input[type=file]').setInputFiles({name:'lost.png',mimeType:'image/png',buffer:png});
        let createLost=false,reserveLost=false;
        const lose=async route=>{if(!route.request().headers()['content-type']?.includes('application/json'))return route.continue();const data=route.request().postDataJSON();if(data.action==='mutate'&&((data.mutation==='entry_save'&&!createLost)||(data.mutation==='file_reserve'&&!reserveLost))){await route.fetch();if(data.mutation==='entry_save')createLost=true;else reserveLost=true;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic response loss'})});}else await route.continue();};
        await page.route('**/functions/v1/resources',lose);
        await page.getByRole('button',{name:'Upload',exact:true}).click();await page.getByRole('button',{name:'Retry Upload',exact:true}).waitFor();assert.equal(await count('repository_entries'),3);assert.equal(await count('repository_files'),2);
        await page.getByRole('button',{name:'Retry Upload',exact:true}).click();await page.getByRole('button',{name:'Resume Upload',exact:true}).waitFor();assert.equal(await count('repository_entries'),3);assert.equal(await count('repository_files'),3);
        await page.getByRole('button',{name:'Resume Upload',exact:true}).click();await page.getByRole('button',{name:'Download Original',exact:true}).waitFor();assert.equal(await count('repository_entries'),3);assert.equal(await count('repository_files'),3);await page.unroute('**/functions/v1/resources',lose);
    });
    await check('refreshing an interrupted document resumes the server intent with the original file',async()=>{
        await page.goto(url+'#/documentary-repository');await page.getByRole('button',{name:'Upload File',exact:true}).click();await page.getByLabel('Subject',{exact:true}).fill('Refresh Recovery');await page.locator('input[type=file]').setInputFiles({name:'refresh.png',mimeType:'image/png',buffer:png});drive.setShared(true);await page.getByRole('button',{name:'Upload',exact:true}).click();await page.getByRole('button',{name:'Resume Upload',exact:true}).waitFor();await page.reload();await page.getByLabel('Original File',{exact:true}).waitFor();drive.setShared(false);
        await page.getByLabel('Original File',{exact:true}).setInputFiles({name:'wrong.png',mimeType:'image/png',buffer:png});await page.getByRole('alert').filter({hasText:'Choose the original file'}).waitFor();
        await page.getByLabel('Original File',{exact:true}).setInputFiles({name:'refresh.png',mimeType:'image/png',buffer:png});await page.getByRole('button',{name:'Download Original',exact:true}).waitFor();assert.equal(await count('repository_entries'),4);assert.equal(await count('repository_files'),4);
    });
    await check('published subject links open preview; ordinary OU cannot change metadata',async()=>{
        await page.getByRole('button',{name:'Publish',exact:true}).click();await page.getByText('Published',{exact:true}).waitFor();await page.evaluate(()=>window.identity({id:2,username:'region1',password:'fixture-password',fullName:'Region One',role:'User',operatingUnit:'RPMO 1'}));await page.getByRole('button',{name:'Download Original',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Edit Details',exact:true}).count(),0);
        await page.goto(url+'#/documentary-repository');await page.getByRole('link',{name:'Refresh Recovery',exact:true}).click();await page.getByRole('button',{name:'Download Original',exact:true}).waitFor();
    });
    await check('legacy multi-file documents retain an explicit selector for every original',async()=>{
        await page.evaluate(()=>window.identity({id:1,username:'root',password:'fixture-password',fullName:'System Administrator',role:'Super Admin',operatingUnit:'NPMO'}));
        const session=(await fixture.rpc('resource_start_session',{p_identifier:'root',p_password:'fixture-password'})).token;
        const mutate=(action,data,version=null)=>fixture.rpc('resource_mutate',{p_session:session,p_action:action,p_data:data,p_request_id:randomUUID(),p_expected_version:version});
        const legacy=await mutate('entry_save',{kind:'File',subject:'Legacy Originals'});await db.query('update repository_entries set single_document=null where id=$1',[legacy.id]);
        const storage=createResourcesStorage({rpc:fixture.rpc,...drive});
        for(const name of ['first.png','second.png']){const intent=await mutate('file_reserve',{entry_id:legacy.id,file_name:name,mime_type:'image/png',file_size:png.length});await storage('upload_begin',session,new Request('https://fixture.test'),{file_id:intent.id});await storage('upload_chunk',session,new Request('https://fixture.test',{method:'POST',headers:{'x-resource-file':intent.id,'x-resource-offset':'0'},body:png}),{});}
        await page.goto(url+'#/documentary-repository/detail?id='+legacy.id);await page.getByRole('combobox',{name:'Document',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Download Original',exact:true}).count(),0);
        for(const name of ['first.png','second.png']){await page.getByRole('combobox',{name:'Document',exact:true}).selectOption({label:name});await page.getByRole('img',{name,exact:true}).waitFor();}
        assert.equal((await db.query('select count(*)::integer count from repository_files where entry_id=$1',[legacy.id])).rows[0].count,2);
    });
    await check('Pause and Resume retain one draft and original upload intent',async()=>{
        await page.goto(url+'#/documentary-repository');await page.getByRole('button',{name:'Upload File',exact:true}).click();await page.getByLabel('Subject',{exact:true}).fill('Paused Document');await page.locator('input[type=file]').setInputFiles({name:'paused.png',mimeType:'image/png',buffer:png});
        let release,held=false;const gate=new Promise(resolve=>{release=resolve;});
        const hold=async route=>{if(route.request().headers()['x-resource-action']==='upload_chunk'&&!held){held=true;await gate;await route.abort().catch(()=>{});}else await route.continue();};
        await page.route('**/functions/v1/resources',hold);await page.getByRole('button',{name:'Upload',exact:true}).click();await page.getByRole('button',{name:'Pause Upload',exact:true}).waitFor();const until=Date.now()+10000;while(!held&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,20));assert(held,'Upload chunk reached the disposable network gate');await page.getByRole('button',{name:'Pause Upload',exact:true}).click();release();await page.getByRole('button',{name:'Resume Upload',exact:true}).waitFor();await page.unroute('**/functions/v1/resources',hold);await page.getByRole('button',{name:'Resume Upload',exact:true}).click();await page.getByRole('button',{name:'Download Original',exact:true}).waitFor();assert.equal((await db.query("select count(*)::integer count from repository_entries where subject='Paused Document'")).rows[0].count,1);
        assert.equal((await db.query("select count(*)::integer count from repository_files where entry_id=(select id from repository_entries where subject='Paused Document')")).rows[0].count,1);
    });
    await check('direct document layouts fit desktop, tablet and phone without page overflow',async()=>{
        for(const width of [1440,820,390,320]){await page.setViewportSize({width,height:width<500?667:900});await page.getByRole('button',{name:'Download Original',exact:true}).waitFor();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));await page.screenshot({path:path.join(output,`document-${width}.png`),fullPage:true});}
        assert.deepEqual(errors,[]);
    });
    console.log(`Repository document UI: ${passed} checks passed. Artifacts: ${output}`);
}finally{await browser?.close();await fixture.close();}
