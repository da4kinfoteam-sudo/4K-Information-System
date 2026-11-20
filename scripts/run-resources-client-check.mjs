import assert from 'node:assert/strict';
import { createServer } from 'vite';
const server=await createServer({configFile:false,appType:'custom',server:{middlewareMode:true},optimizeDeps:{noDiscovery:true,entries:[]}});
let passed=0;
const check=async(name,run)=>{await run();passed++;console.log('PASS '+name);};
const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
try {
    const {resourceAccess,resourceOperation,createResourcesClient}=await server.ssrLoadModule('/lib/resources.ts');
    await check('resource permissions fail closed and respect explicit administrator restrictions',()=>{
        const user={id:1,role:'User'},admin={id:2,role:'Administrator'},root={id:3,role:'Super Admin'},module='Submit Ticket';
        assert.equal(resourceAccess(user,[],module),false);assert.equal(resourceAccess(admin,[],module),false);
        assert.equal(resourceAccess(root,[],module,'manage'),true);
        const configs=[{role:'User',module,can_view:true,can_edit:true,can_manage:true},{role:'Administrator',module,can_view:true,can_edit:true,can_manage:true}];
        assert.equal(resourceAccess(user,configs,module,'edit'),true);assert.equal(resourceAccess(user,configs,module,'manage'),false);
        assert.equal(resourceAccess({...admin,permissions_override:{[module]:{can_view:false}}},configs,module,'manage'),false);
        assert.equal(resourceAccess({role:'Guest',permissions_override:{[module]:{can_view:true,can_edit:true}}},configs,module),false);
    });
    await check('retry operations preserve the exact request identity and snapshot data without mutating drafts',()=>{
        const data={subject:'Original',nested:{count:1}};const first=resourceOperation(null,'ticket_create',data);
        data.nested.count=2;assert.equal(first.data.nested.count,1);
        assert.equal(resourceOperation(first,'ticket_create',first.data),first);
        assert.notEqual(resourceOperation(first,'ticket_create',data).request_id,first.request_id);
    });
    await check('concurrent reads verify once and session tokens never appear in URLs or mutation payloads',async()=>{
        const requests=[];
        const client=createResourcesClient({url:'https://fixture.test/resources',apiKey:'anon-key',credentials:()=>({identifier:'user',password:'fixture'}),fetcher:async(url,init)=>{
            const body=JSON.parse(init.body);requests.push({url,init,body});assert.equal(init.cache,'no-store');assert.equal(init.credentials,'omit');
            return response(body.action==='session_start'?{token:'a'.repeat(64),expires_at:new Date(Date.now()+60000).toISOString(),actor:{id:1}}:{rows:[],total:0});
        }});
        await Promise.all([client.query('tickets'),client.query('tickets')]);
        assert.equal(requests.filter(row=>row.body.action==='session_start').length,1);
        assert(requests.every(row=>!row.url.includes('fixture-password')&&!row.url.includes('aaaa')));
        assert(requests.filter(row=>row.body.action!=='session_start').every(row=>!('password' in row.body)&&row.init.headers['x-resource-session']==='a'.repeat(64)));
        client.dispose();assert.equal(client.actor(),null);
    });
    await check('duplicate clicks await one confirmed request while uncertain response retries keep the same operation ID',async()=>{
        const ids=[];let resolve,reject,attempt=0;
        const client=createResourcesClient({url:'https://fixture.test/resources',apiKey:'anon',credentials:()=>({identifier:'user',password:'fixture'}),fetcher:async(url,init)=>{
            const body=JSON.parse(init.body);
            if(body.action==='session_start')return response({token:'b'.repeat(64),expires_at:new Date(Date.now()+60000).toISOString(),actor:{id:1}});
            ids.push(body.request_id);attempt++;
            if(attempt===1)return new Promise((yes,no)=>{resolve=yes;reject=no;});
            return response({id:'confirmed'});
        }});
        const op=resourceOperation(null,'ticket_create',{subject:'Request'});
        const first=client.mutate(op),second=client.mutate(op);
        while(!reject)await new Promise(resolve=>setTimeout(resolve,1));
        await assert.rejects(()=>client.mutate({...op,data:{subject:'Different'}}),/different changes/);
        reject(new TypeError('Lost response'));
        const results=await Promise.allSettled([first,second]);assert(results.every(result=>result.status==='rejected'));assert.equal(ids.length,1);
        assert.equal((await client.mutate(op)).id,'confirmed');assert.deepEqual(ids,[op.request_id,op.request_id]);client.dispose();
    });
    await check('revoked session errors are explicit and a late reply after account disposal is discarded',async()=>{
        let finish;
        const client=createResourcesClient({url:'https://fixture.test/resources',apiKey:'anon',credentials:()=>({identifier:'user',password:'fixture'}),fetcher:async(url,init)=>{
            const body=JSON.parse(init.body);if(body.action==='session_start')return response({token:'c'.repeat(64),expires_at:new Date(Date.now()+60000).toISOString(),actor:{id:1}});
            return new Promise(resolve=>{finish=resolve;});
        }});
        const pending=client.query('tickets');while(!finish)await new Promise(resolve=>setTimeout(resolve,1));
        client.dispose();finish(response({rows:[{id:'old-account'}]}));await assert.rejects(()=>pending,/session changed/);
    });
    console.log(`${passed} Resources client checks passed. No external service called.`);
}finally{await server.close();}
