import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createDcfRevisionFixture, installDcfRevision, root, rpc, fingerprints } from './helpers/dcf-revision-fixture.mjs';
import { revisionDisplayValue } from '../lib/dcfRevisionHistory.ts';

const db=await createDcfRevisionFixture({install:false}),results=[];
const identity=type=>({p_actor_id:1,p_actor_password:'fixture-password',p_entity_type:type,p_parent_id:1});
const state=type=>rpc(db,'read_dcf_state',identity(type));
const commit=(type,base,changes={},financial=[])=>rpc(db,'commit_dcf_change',{...identity(type),p_base:base,p_changes:changes,p_financial:financial,p_reason:'Disposable preview correction',p_source:'preview-check',p_request_key:crypto.randomUUID()});
const preview=(type,rid)=>rpc(db,'preview_dcf_restore',{...identity(type),p_revision_id:rid});
async function check(name,run){await db.exec('begin');try{await run();results.push({name,status:'PASS'});console.log(`PASS ${name}`);}catch(error){results.push({name,status:'FAIL',message:error.message,where:error.where});console.error(`FAIL ${name}: ${error.message}`);}finally{await db.exec('rollback');}}
try{
    await installDcfRevision(db,{mutations:true});
    await db.exec(await readFile(path.join(root,'supabase/migrations/202611030003_dcf_revision_restore.sql'),'utf8'));
    for(const type of ['activities','subprojects'])await check(`${type}: server preview exposes individual budget fields and independent schedules`,async()=>{
        const key=type==='activities'?'expenses':'details';
        const a=await commit(type,await state(type),{name:'Historical preview point'});
        await commit(type,a,{[key]:a.record[key].map(x=>({...x,amount:105,targetScheduleVersion:2,targetObligationSchedules:[{id:'o1',month:'2026-10-01',amount:105}],targetDisbursementSchedules:[{id:'d1',month:'2026-11-01',amount:65},{id:'d2',month:'2026-12-01',amount:40}]}))});
        const before=await fingerprints(db),plan=await preview(type,a.revisionId);
        assert.deepEqual(await fingerprints(db),before);assert.equal(plan.canRestore,true,JSON.stringify(plan.blockers));
        assert(plan.changes.some(x=>x.section==='Budget item 10'&&x.field==='amount'&&x.before===105&&x.after===100));
        const schedules=plan.changes.find(x=>x.field==='targetDisbursementSchedules');
        assert(schedules);assert(revisionDisplayValue(schedules.before).includes('2026-12-01'));
        assert(!plan.changes.some(x=>['details','expenses'].includes(x.field)),'No opaque whole-budget replacement row');
    });
    await check('financial preview shows stable entry identity, dates, amounts, remarks and authoritative stage totals',async()=>{
        const a=await commit('activities',await state('activities'),{description:'Historical financial preview'});
        const prior=a.financial.stages['10'].disbursement.entries[0];
        await commit('activities',a,{},[{itemId:'10',stage:'disbursement',operations:[{action:'update',id:prior.id,expected:{date:prior.date,amount:prior.amount,remarks:prior.remarks},value:{date:'2026-11-01',amount:7.21,remarks:'New correction'}}]}]);
        const plan=await preview('activities',a.revisionId);assert.equal(plan.canRestore,true,JSON.stringify(plan.blockers));
        const entry=plan.changes.find(x=>x.section==='Financial actuals');assert(entry.field.includes(String(prior.id)));
        assert.equal(entry.before.amount,7.21);assert.equal(entry.after.amount,12.34);
        assert(revisionDisplayValue(entry.before).includes('2026-11-01'));assert(revisionDisplayValue(entry.before).includes('New correction'));
        const total=plan.changes.find(x=>x.section==='Financial totals'&&x.field==='disbursement');
        assert.equal(Number(total.before.toFixed(2)),19.55);assert.equal(total.after,24.68);assert.equal(plan.requiresActualsAcknowledgement,true);
    });
    await check('nested physical preview shows the exact changed date and quantity',async()=>{
        const a=await commit('subprojects',await state('subprojects'),{name:'Physical preview point'});
        await commit('subprojects',a,{details:a.record.details.map(x=>({...x,actualDeliveryDate:'2026-11-01',actualNumberOfUnits:2,isCompleted:true}))});
        const plan=await preview('subprojects',a.revisionId);assert.equal(plan.canRestore,true,JSON.stringify(plan.blockers));
        assert(plan.changes.some(x=>x.section==='Budget item 10'&&x.field==='actualDeliveryDate'&&x.before==='2026-11-01'));
        assert(plan.changes.some(x=>x.field==='actualNumberOfUnits'&&x.before===2));assert.equal(plan.requiresActualsAcknowledgement,true);
    });
    await check('independent metadata is explicitly excluded, never silently rewound',async()=>{
        const a=await commit('activities',await state('activities'),{description:'Historical metadata point'});
        await db.exec(`update activity_drive_files set caption='New live caption' where activity_id=1;update activities set description='New live description' where id=1;`);
        const before=await fingerprints(db),plan=await preview('activities',a.revisionId);
        assert.deepEqual(await fingerprints(db),before);assert(plan.excludedFields.includes('related.activity_drive_files'));
        assert.equal(plan.proposed.related.activity_drive_files[0].caption,'New live caption');
    });
    await check('Subproject derived completion retains Proposed cancellation and explicit-null completion rules',async()=>{
        const derive=async record=>(await db.query("select dcf_derived_physical('subprojects',$1::jsonb) value",[JSON.stringify(record)])).rows[0].value;
        const details=[{id:1,actualDeliveryDate:'2026-11-01',isCompleted:true},{id:2,isCancelled:true}];
        assert.equal((await derive({status:'Proposed',details})).actualCompletionDate,null,'Legacy cancellation does not remove a Proposed target from delivery requirements');
        assert.equal((await derive({status:'Ongoing',details})).actualCompletionDate,'2026-11-01');
        assert.equal((await derive({status:'Ongoing',details:[{id:1,actualDeliveryDate:'2026-11-01',isCompleted:null}]})).actualCompletionDate,null,'Explicit null is not an affirmative completion flag');
        assert.equal((await derive({status:'Ongoing',details:[{id:1,actualDeliveryDate:'2026-11-01'}]})).actualCompletionDate,'2026-11-01','Missing legacy flag follows the established normalization');
    });
    console.log(JSON.stringify({passed:results.filter(x=>x.status==='PASS').length,failed:results.filter(x=>x.status==='FAIL').length,results,
        limitations:['Memory-only source-modeled SQL and actual display formatter','No production writes or whole-application browser proof']},null,2));
    if(results.some(x=>x.status==='FAIL'))process.exitCode=1;
}catch(error){console.error(JSON.stringify({message:error.message,code:error.code,where:error.where}));process.exitCode=1;}
finally{await db.close();}
