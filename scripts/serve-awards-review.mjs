import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createAwardsBrowserFixture} from './awards-browser-fixture.mjs';
import {seedReportorialAwards} from './resources-awards-fixture.mjs';
import {createAwardsGateway} from '../supabase/functions/_shared/awardsGateway.ts';
import {defaultAnnualPolicy} from '../lib/awardAnnualPolicy.ts';

const port=Number(process.argv[2]||3042);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Choose a valid local review port.');
const output=await mkdtemp(path.join(tmpdir(),'4kis-awards-review-')),fixture=await createAwardsBrowserFixture(output,{port});
try{
    const seed=await seedReportorialAwards(fixture.db,fixture.rpc),gateway=createAwardsGateway({rpc:fixture.rpc}),scope={ous:['RPMO 1','RPMO 2'],tiers:null,fundTypes:null,fundSources:null,sourceFundYears:null};
    const state=await gateway('controller',seed.token,{year:2024,scope});
    await gateway('save_controller',seed.token,{year:2024,scope,settings:state.settings,manual:state.manual,policy:{...defaultAnnualPolicy(2024),mode:'Cutoff',transitionApproved:true},expectedVersion:state.controller_version,requestId:randomUUID(),reason:'Disposable local UI review only'});
    console.log(JSON.stringify({url:fixture.url,pid:process.pid,output,environment:'disposable-synthetic-local-only'}));
    await new Promise(resolve=>{process.once('SIGINT',resolve);process.once('SIGTERM',resolve);});
}finally{await fixture.close();}
