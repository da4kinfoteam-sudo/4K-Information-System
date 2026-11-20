import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createRepositoryBrowserFixture} from './resources-repository-fixture.mjs';
const require=createRequire(import.meta.url),{chromium}=require(path.join(process.env.PLAYWRIGHT_NODE_MODULES||'C:/Users/joelm/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules','playwright'));
const output=await mkdtemp(path.join(tmpdir(),'4kis-home-deadlines-ui-')),fixture=await createRepositoryBrowserFixture(output,{homepage:true}),{db,rpc,url}=fixture;
let browser,page,passed=0;const check=async(name,run)=>{await run();passed++;console.log('PASS '+name);};
try{
    const root=(await rpc('resource_start_session',{p_identifier:'root',p_password:'fixture-password'})).token;
    const create=async(subject,due,ous)=>{
        const entry=await rpc('resource_mutate',{p_session:root,p_action:'entry_save',p_data:{kind:'Folder',subject,required_submission:true,reporting_year:2090,due_date:due,assigned_ous:ous},p_request_id:randomUUID()});
        return rpc('resource_mutate',{p_session:root,p_action:'entry_publish',p_data:{id:entry.id},p_request_id:randomUUID(),p_expected_version:entry.version});
    };
    const own=await create('My Future Requirement','2090-01-03',['RPMO 1']),other=await create('Other OU Requirement','2090-01-01',['RPMO 2']);await create('My Overdue Requirement','2025-01-01',['RPMO 1']);
    browser=await chromium.launch({channel:'msedge',headless:true});page=await browser.newPage({viewport:{width:1440,height:1100}});const errors=[];page.on('pageerror',error=>{errors.push(error.message);console.error(error.stack);});await page.route('https://**',route=>route.abort());await page.goto(url);
    const section=page.locator('section,div').filter({has:page.getByRole('heading',{name:'Upcoming Deadlines',exact:true})}).filter({has:page.getByRole('button',{name:'Upcoming deadlines menu',exact:true})}).last();
    await check('actual Homepage merges legacy and protected repository deadlines without mislabeling other OUs',async()=>{
        await page.getByRole('link',{name:'My Future Requirement',exact:true}).waitFor();
        const rows=page.locator('.dashboard-deadline-row');assert.deepEqual(await rows.locator('.dashboard-list__name').allTextContents(),['Other OU Requirement','Legacy Deadline','My Future Requirement']);
        assert.equal(await rows.filter({hasText:'Other OU Requirement'}).locator('.repository-deadline-status').count(),0);assert.equal(await rows.filter({hasText:'My Future Requirement'}).locator('.repository-deadline-status').innerText(),'Not Submitted');
        assert.equal(await page.getByRole('link',{name:'My Overdue Requirement',exact:true}).count(),0);assert.deepEqual(await page.evaluate(()=>window.fixture.deadlines),[{id:1,name:'Legacy Deadline',date:'2090-01-02'}]);
        await page.getByRole('link',{name:'My Future Requirement',exact:true}).click();assert.equal((await page.evaluate(()=>window.fixture.navigation)).at(-1),'/documentary-repository/detail?id='+own.id);
    });
    await check('View All opens the repository deadline view and pending scope belongs only to the current OU',async()=>{
        await page.getByRole('button',{name:'Upcoming deadlines menu',exact:true}).click();await page.getByRole('menuitem',{name:'View all deadlines',exact:true}).click();assert.equal((await page.evaluate(()=>window.fixture.navigation)).at(-1),'/documentary-repository?view=deadlines');
        const token=(await rpc('resource_start_session',{p_identifier:'region1',p_password:'fixture-password'})).token;
        const pending=await rpc('resource_read',{p_session:token,p_resource:'entries',p_args:{required_only:true,pending_only:true,page_size:100}});assert(pending.rows.some(row=>row.id===own.id));assert(!pending.rows.some(row=>row.id===other.id));assert(pending.rows.some(row=>row.subject==='My Overdue Requirement'));
        const overdue=await rpc('resource_read',{p_session:token,p_resource:'entries',p_args:{required_only:true,pending_only:true,overdue_only:true,page_size:100}});assert.deepEqual(overdue.rows.map(row=>row.subject),['My Overdue Requirement']);
    });
    await check('explicit refresh updates deadlines and an API failure preserves legacy entries with an honest error',async()=>{
        await db.query('update repository_entries set subject=$1 where id=$2',['Renamed Requirement',own.id]);await page.evaluate(()=>window.dispatchEvent(new Event('app-data-refreshed')));await page.getByRole('link',{name:'Renamed Requirement',exact:true}).waitFor();
        await page.route('**/functions/v1/resources',async route=>{const body=route.request().postDataJSON();if(body.action==='read'&&body.resource==='deadlines')return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic deadline outage'})});return route.continue();});
        await page.evaluate(()=>window.dispatchEvent(new Event('app-data-refreshed')));await page.getByRole('alert').filter({hasText:'Synthetic deadline outage'}).waitFor();assert.equal(await page.getByText('Legacy Deadline',{exact:true}).count(),1);await page.unroute('**/functions/v1/resources');await page.getByRole('alert').filter({hasText:'Synthetic deadline outage'}).getByRole('button',{name:'Retry',exact:true}).click();await page.getByRole('link',{name:'Renamed Requirement',exact:true}).waitFor();
    });
    await check('permission revocation removes the repository feed immediately while legacy deadlines remain',async()=>{
        await page.evaluate(()=>window.identity({...window.fixture.user,permissions_override:{'Documentary Repository':{can_view:false}}}));await page.getByText('Legacy Deadline',{exact:true}).waitFor();assert.equal(await page.locator('.repository-deadline-link').count(),0);await page.getByRole('button',{name:'Upcoming deadlines menu',exact:true}).click();assert.equal(await page.getByRole('menuitem',{name:'View all deadlines',exact:true}).count(),0);await page.keyboard.press('Escape');assert.deepEqual(errors,[]);
    });
    console.log(`${passed} actual Homepage repository deadline checks passed. Disposable SQL; legacy dataset unchanged. ${output}`);
}catch(error){if(page){console.error(await page.locator('body').innerText());await page.screenshot({path:path.join(output,'failure.png'),fullPage:true});console.error(output);}throw error;}
finally{await browser?.close();await fixture.close();}
