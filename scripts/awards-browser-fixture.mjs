import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {createServer,transformWithEsbuild} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import {createDcfRevisionFixture,insertParent,domains} from './helpers/dcf-revision-fixture.mjs';
import {createResourcesHandler} from '../supabase/functions/_shared/resourcesHttp.ts';
import {createAwardsGateway} from '../supabase/functions/_shared/awardsGateway.ts';

export async function createAwardsBrowserFixture(output,{port=0}={}){
    const db=await createDcfRevisionFixture({seed:false});
    try{
        await db.exec(`update users set username='root',"fullName"='System Administrator' where id=1;update users set "operatingUnit"='RPMO 1' where id=2;`);
        for(const file of ['202611030002_dcf_revision_mutations.sql','202611200001_resources_foundation.sql','202611200002_resources_workflows.sql','202611200003_resources_reads.sql','202606290001_award_rankings.sql','202611250002_awards_versioned_results.sql','202611250003_awards_source_capture.sql','202611260001_awards_controller_privacy.sql'])await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
        await db.exec(`insert into award_manual_scores(fund_year,period,operating_unit,reportorial_required,reportorial_submitted,national_activities_required,national_activities_attended) values(2024,'Q3','RPMO 1',5,4,2,1)`);
        const parents=[];
        for(const [ou,amount] of [['RPMO 1',100],['RPMO 2',200]]){
            const parent=await insertParent(db,domains[0],{name:'Prior-FY Subproject '+ou,operatingUnit:ou,fundingYear:2023,status:'Completed',estimatedCompletionDate:'2023-12-01',actualCompletionDate:'2024-11-14',details:[{id:10,amount,numberOfUnits:1,pricePerUnit:amount}]});parents.push(parent);
            await db.query(`insert into financial_obligations(entity_type,parent_id,item_id,obligation_date,amount) values('subproject_detail',$1,'10','2024-01-01',$2)`,[parent.id,amount]);
            await db.query(`insert into financial_disbursements(entity_type,parent_id,item_id,disbursement_date,amount) values('subproject_detail',$1,'10','2024-10-14',$2)`,[parent.id,amount/2]);
        }
        for(const [ou,paid] of [['RPMO 1',2],['RPMO 2',10]]){
            const parent=await insertParent(db,domains[0],{name:'Current-FY Numeric Sort '+ou,operatingUnit:ou,fundingYear:2024,status:'Completed',estimatedCompletionDate:'2024-03-01',actualCompletionDate:'2024-03-01',details:[{id:20,amount:20,numberOfUnits:1,pricePerUnit:20}]});
            await db.query(`insert into financial_obligations(entity_type,parent_id,item_id,obligation_date,amount) values('subproject_detail',$1,'20','2024-02-01',20)`,[parent.id]);
            await db.query(`insert into financial_disbursements(entity_type,parent_id,item_id,disbursement_date,amount) values('subproject_detail',$1,'20','2024-03-01',$2)`,[parent.id,paid]);
        }
        const calls=[],rpc=async(name,args)=>{calls.push(name);return (await db.query(`select ${name}(${Object.keys(args).map((key,i)=>`${key}=>$${i+1}`).join(',')}) value`,Object.values(args))).rows[0].value;};
        const harness=`import React,{useState}from'react';import{createRoot}from'react-dom/client';import Awards from'/components/dashboards/AwardsRankingsDashboard.tsx';import'/index.css';import'/styles/main.css';
        window.fixture={user:{id:1,username:'root',password:'fixture-password',fullName:'System Administrator',role:'Super Admin',operatingUnit:'NPMO'},configs:['Documentary Repository','Submit Ticket','Dashboards'].map(module=>({role:'Super Admin',module,can_view:true,can_edit:true,can_manage:true}))};
        function Harness(){const[year,setYear]=useState('2024'),[epoch,setEpoch]=useState(0);window.year=setYear;window.identity=user=>{window.fixture.user=user;setEpoch(v=>v+1)};return <main className="app-main" style={{margin:0,padding:16}}><React.Fragment key={epoch}><Awards selectedYear={year} scope={{ous:['RPMO 1','RPMO 2'],tiers:null,fundTypes:null,fundSources:null,sourceFundYears:null}}/></React.Fragment></main>;}createRoot(document.getElementById('root')).render(<Harness/>);`;
        const server=await createServer({configFile:false,root:process.cwd(),cacheDir:path.join(output,'.vite'),appType:'custom',resolve:{alias:{'@':process.cwd()}},define:{'import.meta.env.VITE_SUPABASE_URL':'window.location.origin','import.meta.env.VITE_SUPABASE_ANON_KEY':JSON.stringify('disposable-anon')},server:{host:'127.0.0.1',port,strictPort:!!port,hmr:!!port},optimizeDeps:{noDiscovery:true,entries:[],include:['react','react-dom/client','lucide-react','exceljs','@radix-ui/react-popover']},plugins:[{name:'disposable-awards',enforce:'pre',resolveId(id){if(id==='/awards-harness.tsx')return '\0awards-harness';if(id.replaceAll('\\','/').endsWith('/contexts/AuthContext'))return '\0awards-auth';if(id.replaceAll('\\','/').endsWith('/supabaseClient'))return '\0awards-no-supabase';},load(id){if(id==='\0awards-harness')return transformWithEsbuild(harness,'awards-harness.tsx',{loader:'tsx',jsx:'automatic'});if(id==='\0awards-auth')return `export const useAuth=()=>({currentUser:window.fixture.user,rolesConfigs:window.fixture.configs,hasAccess:()=>true,getVisibilityScope:()=>window.fixture.user.role==='Super Admin'?'All':'Own OU'});`;if(id==='\0awards-no-supabase')return 'export const supabase=null;';},configureServer(vite){vite.middlewares.use(async(req,res,next)=>{
            if(req.url==='/functions/v1/resources'){
                try{const origin='http://127.0.0.1:'+server.httpServer.address().port,handler=createResourcesHandler({rpc,awards:createAwardsGateway({rpc}),origins:[origin]}),chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>1100000)throw Error('Oversized fixture request');chunks.push(chunk);}const response=await handler(new Request(origin+req.url,{method:req.method,headers:req.headers,body:Buffer.concat(chunks)}));res.statusCode=response.status;response.headers.forEach((value,key)=>res.setHeader(key,value));res.end(Buffer.from(await response.arrayBuffer()));}catch(error){console.error(error);res.statusCode=500;res.end('Disposable Awards fixture failed');}return;
            }
            if(!req.url?.startsWith('/fixture'))return next();res.setHeader('content-type','text/html');res.end(await vite.transformIndexHtml('/fixture','<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>4KIS Local Awards Review</title></head><body><div id="root"></div><script type="module" src="/awards-harness.tsx"></script></body></html>'));
        });}},react(),tailwindcss()]});
        await server.listen();return {db,rpc,parents,calls,server,url:'http://127.0.0.1:'+server.httpServer.address().port+'/fixture',close:async()=>{await server.close();await db.close();}};
    }catch(error){await db.close();throw error;}
}
