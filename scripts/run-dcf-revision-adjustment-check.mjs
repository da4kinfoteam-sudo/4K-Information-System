import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createDcfRevisionFixture, installDcfRevision, domains, insertParent, root, rpc, fingerprints } from './helpers/dcf-revision-fixture.mjs';
const db=await createDcfRevisionFixture({install:false});
const results=[];
const identity=(d,id)=>({p_actor_id:1,p_actor_password:'fixture-password',p_entity_type:d.table,p_parent_id:id});
const state=(d,id)=>rpc(db,'read_dcf_state',identity(d,id));
const commit=(d,id,base,changes,key=crypto.randomUUID())=>rpc(db,'commit_dcf_change',{...identity(d,id),p_base:base,p_changes:changes,p_financial:[],p_request_key:key,p_reason:'Disposable budget correction',p_source:'adjustment-check'});
async function check(name,run){try{await run();results.push({name,status:'PASS'});console.log(`PASS ${name}`);}catch(error){results.push({name,status:'FAIL',message:error.message,where:error.where});console.error(`FAIL ${name}: ${error.message}`);}}
try{
    await installDcfRevision(db,{mutations:true});
    await db.exec(await readFile(path.join(root,'supabase/migrations/202611030003_dcf_revision_restore.sql'),'utf8'));
    for(const d of domains.filter(x=>x.lines)){
        await check(`${d.table}: one committed tag produces one audit and one complete revision; retry does not duplicate`,async()=>{
            const p=await insertParent(db,d),base=await state(d,p.id),key=crypto.randomUUID();
            const reason=d.type==='activity'?'Documented planned-item cancellation':'Supplement with documented savings';
            const changes={[d.lines]:base.record[d.lines].map(row=>({...row,...(d.type==='activity'?{isCancelled:true}:{isSavings:true}),adjustmentReason:reason}))};
            const count=(await db.query('select count(*)::int n from dcf_record_revisions where entity_type=$1 and parent_id=$2',[d.table,p.id])).rows[0].n;
            const saved=await commit(d,p.id,base,changes,key);
            const entries=(await db.query('select * from budget_item_adjustment_history where parent_id=$1 and source_type=$2',[p.id,d.type==='subproject'?'subproject_detail':d.type==='activity'?'activity_expense':'staffing_expense'])).rows;
            assert.equal(entries.length,1);assert.equal(entries[0].action,d.type==='activity'?'cancel':'tag_savings');assert.equal(entries[0].reason,reason);assert.equal(entries[0].created_by_name,'Fixture Admin');
            assert.equal((await db.query('select count(*)::int n from dcf_record_revisions where entity_type=$1 and parent_id=$2',[d.table,p.id])).rows[0].n,count+1);
            const version=await rpc(db,'read_dcf_revision',{...identity(d,p.id),p_revision_id:saved.revisionId});
            assert.equal(version.snapshot.related.budget_item_adjustment_history.at(-1).id,entries[0].id);
            const before=await fingerprints(db);assert.deepEqual(await commit(d,p.id,base,changes,key),saved);assert.deepEqual(await fingerprints(db),before);
        });
    }
    await check('audit failure rolls budget, history, receipt and financial ledgers back together',async()=>{
        const d=domains[0],p=await insertParent(db,d),base=await state(d,p.id),key=crypto.randomUUID();
        const changes={details:base.record.details.map(row=>({...row,isRealignment:true,adjustmentReason:'Reallocated provision'}))};
        await db.exec(`create function fixture_adjustment_failure() returns trigger language plpgsql as $$ begin raise exception 'Fixture audit failure'; end $$;create trigger fixture_adjustment_failure before insert on budget_item_adjustment_history for each row execute function fixture_adjustment_failure();`);
        const before=await fingerprints(db);await assert.rejects(()=>commit(d,p.id,base,changes,key),/Fixture audit failure/);assert.deepEqual(await fingerprints(db),before);
        await db.exec('drop trigger fixture_adjustment_failure on budget_item_adjustment_history;drop function fixture_adjustment_failure();');
        const saved=await commit(d,p.id,base,changes,key);assert.equal(saved.record.details[0].isRealignment,true);
    });
    await check('unsaved tag round trip produces no net audit or revision',async()=>{
        const d=domains[0],p=await insertParent(db,d),base=await state(d,p.id),before=await fingerprints(db,['subprojects','budget_item_adjustment_history','dcf_record_revisions']);
        await commit(d,p.id,base,{details:structuredClone(base.record.details)});
        assert.deepEqual(await fingerprints(db,['subprojects','budget_item_adjustment_history','dcf_record_revisions']),before);
    });
    await check('Proposed item removal is not disguised as cancellation',async()=>{
        const d=domains[0],p=await insertParent(db,d),base=await state(d,p.id);
        const saved=await commit(d,p.id,base,{details:[]});assert.deepEqual(saved.record.details,[]);assert.equal(saved.record.status,'Proposed');
        assert.equal((await db.query(`select count(*)::int n from budget_item_adjustment_history where source_type='subproject_detail' and parent_id=$1`,[p.id])).rows[0].n,0);
    });
    await check('generic accomplishment remarks change creates one recoverable audit snapshot',async()=>{
        const d=domains[0],p=await insertParent(db,d),base=await state(d,p.id);
        await commit(d,p.id,base,{accomplishmentRemarks:'Confirmed accomplishment narrative'});
        const rows=(await db.query(`select * from budget_item_adjustment_history where source_type='subproject_detail' and parent_id=$1`,[p.id])).rows;
        assert.equal(rows.length,1);assert.equal(rows[0].action,'update_accomplishment_remarks');
        const current=await state(d,p.id);assert.equal(current.related.budget_item_adjustment_history[0].after_snapshot.accomplishmentRemarks,'Confirmed accomplishment narrative');
    });
    await check('DCF components contain no draft-time or post-confirmation direct adjustment writer',async()=>{
        for(const name of ['ActivityEdit','SubprojectDetail','SubprojectEdit'])assert.doesNotMatch(await readFile(path.join(root,'components',`${name}.tsx`),'utf8'),/writeBudgetItemAdjustmentHistory/);
    });
    console.log(JSON.stringify({passed:results.filter(x=>x.status==='PASS').length,failed:results.filter(x=>x.status==='FAIL').length,results,limitations:['Disposable PGlite and source contract checks, not production operations or full editor click coverage']},null,2));
    if(results.some(x=>x.status==='FAIL'))process.exitCode=1;
}catch(error){console.error(JSON.stringify({message:error.message,code:error.code,where:error.where}));process.exitCode=1;}
finally{await db.close();}
