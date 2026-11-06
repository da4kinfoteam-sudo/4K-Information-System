import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createDcfRevisionFixture, installDcfRevision, domains, insertParent, rpc, transaction, fingerprints } from './helpers/dcf-revision-fixture.mjs';

const db=await createDcfRevisionFixture({install:false}),results=[];
const identity=(type,id)=>({p_actor_id:1,p_actor_password:'fixture-password',p_entity_type:type,p_parent_id:id});
const state=(type,id)=>rpc(db,'read_dcf_state',identity(type,id));
const commit=(type,id,base,changes)=>transaction(db,()=>rpc(db,'commit_dcf_change',{...identity(type,id),p_base:base,p_changes:changes,p_financial:[],p_reason:'Disposable pre-state regression',p_source:'prestate-check',p_request_key:crypto.randomUUID()}));
const preview=(type,id,revision,operation)=>rpc(db,'preview_dcf_restore',{...identity(type,id),p_revision_id:revision,...(operation?{p_undo_operation_id:operation}:{})});
const apply=(type,id,revision,plan,operation,key=crypto.randomUUID())=>transaction(db,()=>rpc(db,'apply_dcf_restore',{...identity(type,id),p_revision_id:revision,p_expected_revision_id:plan.currentRevisionId,p_expected_hash:plan.currentHash,p_reason:'Disposable exact pre-state correction',p_acknowledged_actuals:true,p_request_key:key,...(operation?{p_undo_operation_id:operation}:{})}));
async function check(name,action){try{await action();results.push({name,status:'PASS'});console.log('PASS '+name)}catch(error){results.push({name,status:'FAIL',error:error.message});console.error('FAIL '+name+': '+error.message)}}
try{
    await installDcfRevision(db,{mutations:true});
    await db.exec(await readFile('supabase/migrations/202611030003_dcf_revision_restore.sql','utf8'));
    // Isolated old-client grants demonstrate incomplete capture, not an ACL failure.
    await db.exec(`grant select,update on activities,subprojects,office_requirements,staffing_requirements,other_program_expenses,financial_disbursements to anon;
        create policy fixture_prestate_read on financial_disbursements for select to anon using(true);
        create policy fixture_prestate_write on financial_disbursements for update to anon using(true) with check(true);`);
    for(const d of domains)await check(`${d.table}: exact pre-state and reported entries remain undoable after an incomplete older-client revision`,async()=>{
        const field=d.table==='activities'?'description':d.label;
        const a=await commit(d.table,1,await state(d.table,1),{[field]:'Verified historical A'});
        await db.exec(`set role anon;update ${d.table} set "${field}"='Observed current C' where id=1;
            update financial_disbursements set amount=21.77 where entity_type='${d.ledger}' and parent_id=1;reset role;`);
        const old=(await db.query('select id,snapshot from dcf_record_revisions where entity_type=$1 and parent_id=1 order by id desc limit 1',[d.table])).rows[0];
        assert.equal(old.snapshot.coverage.complete,false);
        const before=(await db.query('select dcf_snapshot($1,1) value',[d.table])).rows[0].value;
        const plan=await preview(d.table,1,a.revisionId);assert.equal(plan.canRestore,true,JSON.stringify(plan.blockers));
        const restored=await apply(d.table,1,a.revisionId,plan);
        const receipt=(await db.query('select * from dcf_restore_operations where id=$1',[restored.operationId])).rows[0];
        assert.equal(receipt.before_revision_id,old.id);assert.deepEqual(receipt.before_snapshot,before);
        for(const selected of [restored.revisionId,old.id]){
            const undo=await preview(d.table,1,selected,restored.operationId);
            assert.equal(undo.canRestore,true,JSON.stringify(undo.blockers));assert.equal(undo.proposed.record[field],'Observed current C');
        }
        const undo=await preview(d.table,1,restored.revisionId,restored.operationId),key=crypto.randomUUID();
        const undone=await apply(d.table,1,restored.revisionId,undo,restored.operationId,key);
        assert.equal(undone.record[field],'Observed current C');
        const business=rows=>rows.map(({updated_at,...entry})=>entry);
        assert.deepEqual(business(undone.financial.disbursements),business(before.financial.disbursements));
        assert.equal((await db.query('select snapshot from dcf_record_revisions where id=$1',[old.id])).rows[0].snapshot.coverage.complete,false,'Do not relabel incomplete historical evidence');
        const retry=await apply(d.table,1,restored.revisionId,undo,restored.operationId,key);assert.equal(retry.revisionId,undone.revisionId);
    });
    await check('failure to store the protected pre-state rolls back the restore, ledgers and all history',async()=>{
        const d=domains[2],p=await insertParent(db,d),a=await commit(d.table,p.id,await state(d.table,p.id),{purpose:'A'});
        await commit(d.table,p.id,a,{purpose:'C'});
        const plan=await preview(d.table,p.id,a.revisionId),before=await fingerprints(db);
        await db.exec(`create function fixture_fail_prestate() returns trigger language plpgsql as $$ begin raise exception 'Disposable protected pre-state failure'; end $$;
            create trigger fixture_fail_prestate before insert on dcf_restore_operations for each row execute function fixture_fail_prestate()`);
        await assert.rejects(()=>apply(d.table,p.id,a.revisionId,plan),/protected pre-state failure/);
        assert.deepEqual(await fingerprints(db),before);
    });
    console.log(JSON.stringify({passed:results.filter(row=>row.status==='PASS').length,failed:results.filter(row=>row.status==='FAIL').length,results,mode:'Disposable modeled SQL only; no production operation'},null,2));
    if(results.some(row=>row.status==='FAIL'))process.exitCode=1;
}finally{await db.close()}
