import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createServer,transformWithEsbuild} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import {createResourcesHandler} from '../supabase/functions/_shared/resourcesHttp.ts';
import {createResourcesFixture} from './resources-sql-fixture.mjs';

const require=createRequire(import.meta.url);
const {chromium}=require(path.join(process.env.PLAYWRIGHT_NODE_MODULES||'C:/Users/joelm/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules','playwright'));
const {db,rpc}=await createResourcesFixture();
const serve=process.argv.includes('--serve');
const output=await mkdtemp(path.join(tmpdir(),'4kis-resource-ticket-ui-'));
const harness=`import React,{useState,useEffect}from'react';import{createRoot}from'react-dom/client';import Page from'/components/resources/SubmitTicketPage.tsx';import'/index.css';import'/styles/main.css';
window.fixture={user:{id:2,username:'region1',password:'fixture-password',fullName:'Region One',role:'User',operatingUnit:'RPMO 1'},configs:['Submit Ticket','Documentary Repository'].flatMap(module=>['User','Super Admin'].map(role=>({role,module,can_view:true,can_edit:true,can_manage:role==='Super Admin'})))};
function Harness(){const[route,setRoute]=useState(location.hash.slice(1)||'/submit-ticket'),[epoch,setEpoch]=useState(0);useEffect(()=>{const fn=()=>setRoute(location.hash.slice(1)||'/submit-ticket');window.addEventListener('hashchange',fn);return()=>window.removeEventListener('hashchange',fn);},[]);window.identity=user=>{window.fixture.user=user;setEpoch(value=>value+1);};const id=route.includes('/detail')?new URLSearchParams(route.split('?')[1]).get('id'):null;return <main className="app-main" style={{margin:0,padding:16}}><React.Fragment key={epoch}><Page id={id} onNavigate={path=>{location.hash=path;}}/></React.Fragment></main>;}createRoot(document.getElementById('root')).render(<Harness/>);`;
const auth=`export const useAuth=()=>({currentUser:window.fixture.user,rolesConfigs:window.fixture.configs});`;
const server=await createServer({configFile:false,root:process.cwd(),cacheDir:path.join(output,'.vite'),appType:'custom',
    resolve:{alias:{'@':process.cwd()}},
    define:{'import.meta.env.VITE_SUPABASE_URL':'window.location.origin','import.meta.env.VITE_SUPABASE_ANON_KEY':JSON.stringify('fixture-anon')},
    server:{host:'127.0.0.1',port:serve?Number(process.env.PORT||3036):0,strictPort:serve},optimizeDeps:{noDiscovery:true,entries:[],include:['react','react-dom/client','lucide-react']},
    plugins:[{name:'resources-ticket-disposable',enforce:'pre',resolveId(id,importer){
        if((importer||'').replace(/\\/g,'/').includes('/node_modules/'))return;
        if(id==='/resource-ticket-harness.tsx')return '\0resource-ticket-harness.tsx';
        if(id.replace(/\\/g,'/').endsWith('/contexts/AuthContext'))return '\0resource-test-auth.ts';
    },load(id){if(id==='\0resource-ticket-harness.tsx')return transformWithEsbuild(harness,'resource-ticket-harness.tsx',{loader:'tsx',jsx:'automatic'});if(id==='\0resource-test-auth.ts')return auth;},configureServer(vite){vite.middlewares.use(async(req,res,next)=>{
        if(req.url==='/functions/v1/resources'){
            try{
                const origin='http://127.0.0.1:'+server.httpServer.address().port;
                const handler=createResourcesHandler({rpc,origins:[origin]});
                const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>65536)throw Error('Fixture request too large');chunks.push(chunk);}
                const response=await handler(new Request(origin+req.url,{method:req.method,headers:req.headers,body:req.method==='POST'?Buffer.concat(chunks):undefined}));
                res.statusCode=response.status;response.headers.forEach((value,key)=>res.setHeader(key,value));res.end(Buffer.from(await response.arrayBuffer()));
            }catch(error){console.error(error);res.statusCode=500;res.end('Fixture error');}return;
        }
        if(!req.url?.startsWith('/fixture'))return next();
        res.setHeader('content-type','text/html');res.end(await vite.transformIndexHtml('/fixture','<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/resource-ticket-harness.tsx"></script></body></html>'));
    });}},react(),tailwindcss()]});
let browser,passed=0;
const check=async(name,run)=>{await run();passed++;console.log('PASS '+name);};
try{
    await server.listen();const url='http://127.0.0.1:'+server.httpServer.address().port+'/fixture';
    if(serve){
        await db.exec(`insert into resource_tickets(subject,category,description,reporter_id,reporter_name,reporter_ou) select 'Sample Ticket '||i,'Improvement Request','Local disposable sample. No production connection.',2,'Region One','RPMO 1' from generate_series(1,15) i`);
        console.log('Sample-only ticket preview using disposable SQL: '+url);await new Promise(()=>{});
    }
    browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.route('https://**',route=>route.abort());await page.goto(url);
    const root={id:1,username:'root',password:'fixture-password',fullName:'System Administrator',role:'Super Admin',operatingUnit:'NPMO'};
    const user={id:2,username:'region1',password:'fixture-password',fullName:'Region One',role:'User',operatingUnit:'RPMO 1'};
    await page.getByText('No records found.',{exact:true}).waitFor();
    let ticketId;
    await check('requester creates one ticket and reloads its confirmed detail with no local credential/token storage',async()=>{
        await page.getByRole('button',{name:'Submit Ticket',exact:true}).click();
        const modal=page.getByRole('dialog');await modal.getByRole('textbox',{name:'Subject',exact:true}).fill('Test compact title');
        await modal.getByRole('textbox',{name:'Description',exact:true}).fill('Description with details.');
        await modal.getByRole('button',{name:'Submit Ticket',exact:true}).click();await page.getByRole('heading',{name:'Test compact title',exact:true}).waitFor();
        const rows=(await db.query('select * from resource_tickets')).rows;assert.equal(rows.length,1);ticketId=rows[0].id;assert.equal(rows[0].reporter_id,2);
        await page.reload();await page.getByRole('heading',{name:'Test compact title',exact:true}).waitFor();
        const storage=await page.evaluate(()=>JSON.stringify({...localStorage}));assert(!storage.includes('fixture-password'));assert(!storage.includes('token'));
    });
    await check('requester comments persist once and administrators update status assignment and priority through the protected endpoint',async()=>{
        await page.getByRole('textbox',{name:'Comment',exact:true}).fill('Additional detail.');await page.getByRole('button',{name:'Add Comment',exact:true}).click();await page.getByText('Additional detail.',{exact:true}).waitFor();
        await page.evaluate(root=>window.identity(root),root);await page.getByRole('combobox',{name:'Status',exact:true}).waitFor();
        await page.getByRole('combobox',{name:'Status',exact:true}).selectOption('In Progress');await page.getByRole('combobox',{name:'Priority',exact:true}).selectOption('High');
        await page.getByRole('combobox',{name:'Assigned To',exact:true}).selectOption('1');await page.getByRole('textbox',{name:'Comment',exact:true}).fill('Investigating.');await page.getByRole('button',{name:'Save Response',exact:true}).click();await page.getByText('Investigating.',{exact:true}).waitFor();
        const row=(await db.query('select * from resource_tickets where id=$1',[ticketId])).rows[0];assert.equal(row.status,'In Progress');assert.equal(row.priority,'High');assert.equal(row.assigned_to,1);
        assert.equal((await db.query('select count(*)::int count from resource_ticket_comments')).rows[0].count,2);
    });
    await check('cross-account direct routes deny private tickets without leaking earlier content',async()=>{
        await page.evaluate(()=>window.identity({id:3,username:'region2',password:'fixture-password',fullName:'Region Two',role:'User',operatingUnit:'RPMO 2'}));
        await page.getByRole('alert').filter({hasText:'Access denied'}).waitFor();assert.equal(await page.getByText('Description with details.',{exact:true}).count(),0);
        await page.evaluate(user=>window.identity(user),user);await page.getByRole('heading',{name:'Test compact title',exact:true}).waitFor();
    });
    await check('response loss preserves the draft and retry reconciles the same database request without a second ticket',async()=>{
        await page.goto(url+'#/submit-ticket');await page.getByRole('button',{name:'Submit Ticket',exact:true}).waitFor();
        await page.getByRole('button',{name:'Submit Ticket',exact:true}).click();const modal=page.getByRole('dialog');
        await modal.getByRole('textbox',{name:'Subject',exact:true}).fill('Lost response ticket');await modal.getByRole('textbox',{name:'Description',exact:true}).fill('Retained draft.');
        let intercepted=false;
        await page.route('**/functions/v1/resources',async route=>{const data=route.request().postDataJSON();if(data.action==='mutate'&&data.mutation==='ticket_create'&&!intercepted){intercepted=true;await route.fetch();return route.abort('failed');}return route.continue();});
        await modal.getByRole('button',{name:'Submit Ticket',exact:true}).click();await modal.getByRole('alert').waitFor();assert.equal(await modal.getByRole('textbox',{name:'Description',exact:true}).inputValue(),'Retained draft.');
        await modal.getByRole('button',{name:'Submit Ticket',exact:true}).click();await page.getByRole('heading',{name:'Lost response ticket',exact:true}).waitFor();await page.unroute('**/functions/v1/resources');
        assert.equal((await db.query("select count(*)::int count from resource_tickets where subject='Lost response ticket'")).rows[0].count,1);
    });
    await db.exec(`insert into resource_tickets(subject,category,description,reporter_id,reporter_name,reporter_ou,updated_at) select 'Long title '||i||' - repeatable test content that must not wrap in the compact table','Other','Fixture',2,'Region One','RPMO 1',clock_timestamp()+i*interval '1 second' from generate_series(1,30) i`);
    await check('Edit Table preferences persist and larger pages scroll without stretching the section',async()=>{
        await page.goto(url+'#/submit-ticket');await page.getByText('Long title 30',{exact:false}).waitFor();
        const height=await page.locator('.resources-table-scroll').evaluate(node=>node.getBoundingClientRect().height);
        await page.getByRole('combobox',{name:'Rows per page'}).selectOption('50');await page.waitForFunction(()=>document.querySelectorAll('tbody tr').length===32);
        const metrics=await page.locator('.resources-table-scroll').evaluate(node=>({height:node.getBoundingClientRect().height,scroll:node.scrollHeight,client:node.clientHeight}));assert(metrics.height<=440);assert(metrics.height>=height);assert(metrics.scroll>metrics.client);
        await page.getByRole('button',{name:'Edit Table',exact:true}).click();await page.getByRole('checkbox',{name:'Category',exact:true}).uncheck();await page.getByRole('button',{name:'Apply',exact:true}).click();assert.equal(await page.getByRole('columnheader',{name:'Category',exact:true}).count(),0);
        await page.reload();await page.getByText('Long title 30',{exact:false}).waitFor();assert.equal(await page.getByRole('columnheader',{name:'Category',exact:true}).count(),0);
    });
    await check('desktop tablet and mobile controls and modal remain within bounds with compact non-wrapping tables',async()=>{
        for(const width of [1440,820,390,320]){
            await page.setViewportSize({width,height:900});await page.screenshot({path:path.join(output,`tickets-${width}.png`),fullPage:true});
            const metrics=await page.evaluate(()=>({page:document.documentElement.scrollWidth,viewport:innerWidth,wrap:[...document.querySelectorAll('.resources-table th,.resources-table td')].every(node=>getComputedStyle(node).whiteSpace==='nowrap'),footer:(()=>{const n=document.querySelector('.data-table-pagination'),p=document.querySelector('.resources-table-section');return {left:n.getBoundingClientRect().left-p.getBoundingClientRect().left,padding:parseFloat(getComputedStyle(n).paddingLeft)};})()}));
            assert(metrics.page<=metrics.viewport+1);assert(metrics.wrap);assert(metrics.footer.padding>=12);
            await page.getByRole('button',{name:'Submit Ticket',exact:true}).click();const modal=page.getByRole('dialog');await modal.waitFor();const box=await modal.boundingBox();assert(box.x>=0&&box.x+box.width<=width+1);
            await page.screenshot({path:path.join(output,`ticket-create-${width}.png`),fullPage:true});await page.keyboard.press('Escape');await modal.waitFor({state:'hidden'});
        }
        assert.deepEqual(errors,[]);
    });
    console.log(`${passed} Resources ticket browser checks passed through disposable SQL. Screenshots: ${output}`);
}finally{await browser?.close();await server.close();await db.close();}
