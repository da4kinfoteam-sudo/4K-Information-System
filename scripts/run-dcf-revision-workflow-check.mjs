import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createDcfRevisionFixture, installDcfRevision, domains, plannedLine, root, rpc, fingerprints } from './helpers/dcf-revision-fixture.mjs';

const db=await createDcfRevisionFixture({install:false});
const results=[];
const identity=(d,id,actor=1)=>({p_actor_id:actor,p_actor_password:'fixture-password',p_entity_type:d.table,p_parent_id:id});
const state=(d,id,actor=1)=>rpc(db,'read_dcf_state',identity(d,id,actor));
const commit=(d,id,base,changes,actor=1,reason='',key=crypto.randomUUID())=>rpc(db,'commit_dcf_change',{
    ...identity(d,id,actor),p_base:base,p_changes:changes,p_financial:[],p_source:'workflow-check',p_reason:reason,p_request_key:key});
async function check(name,run){
    try{await run();results.push({name,status:'PASS'});console.log(`PASS ${name}`);}
    catch(error){results.push({name,status:'FAIL',message:error.message,where:error.where});console.error(`FAIL ${name}: ${error.message}`);}
}
async function rejectsWithoutWrites(action,pattern){const before=await fingerprints(db);await assert.rejects(action,pattern);assert.deepEqual(await fingerprints(db),before);}
try{
    await installDcfRevision(db,{mutations:true});
    await db.exec(await readFile(path.join(root,'supabase/migrations/202611030003_dcf_revision_restore.sql'),'utf8'));
    await db.exec(`insert into users(id,username,"fullName",role,"operatingUnit",password,visibility_scope) values(7,'restricted-manager','Restricted Manager','Management','RFO I','fixture-password','Own OU');
        insert into roles_config(role,module,can_view,can_edit,visibility_scope) select 'Management',m,true,false,'Own OU' from unnest(array['Activities','Subprojects','Program Management']) m;`);
    for(const d of domains){
        await check(`${d.table}: server approval defaults, confirmed approve/reject and immutable reason`,async()=>{
            const line=Object.fromEntries(Object.entries(plannedLine(10)).filter(([key])=>!key.startsWith('actual')&&!['obligations','disbursements'].includes(key)));
            const changes={uid:`WORKFLOW-${d.type}-${crypto.randomUUID()}`,[d.label]:'Pending source',operatingUnit:'RFO I',workflow_status:'APPROVED',
                ...(d.table==='staffing_requirements'?{hiringStatus:'Proposed',status:'Contractual'}:{status:'Proposed'}),...(d.lines?{[d.lines]:[line]}:{})};
            const pending=await commit(d,null,{},changes,2);
            assert.equal(pending.record.workflow_status,'PENDING','Approval-required creator cannot self-approve via payload');
            const original=structuredClone(pending);
            await rejectsWithoutWrites(()=>commit(d,pending.record.id,pending,{workflow_status:'APPROVED'},3),/approver|permission/i);
            await rejectsWithoutWrites(()=>commit(d,pending.record.id,pending,{workflow_status:'APPROVED'},7),/permission/i);
            const approved=await commit(d,pending.record.id,pending,{workflow_status:'APPROVED'},1);
            assert.equal(approved.record.workflow_status,'APPROVED');assert.deepEqual(approved.financial,original.financial);
            const reason='Budget reference needs clarification; preserve the planned items.';
            const rejected=await commit(d,pending.record.id,approved,{workflow_status:'REJECTED'},1,reason);
            assert.equal(rejected.record.workflow_status,'REJECTED');assert.deepEqual(rejected.financial,original.financial);
            assert.equal(rejected.record[d.label],original.record[d.label]);
            if(d.lines)assert.deepEqual(rejected.record[d.lines],original.record[d.lines]);
            const metadata=await rpc(db,'list_dcf_revisions',{...identity(d,pending.record.id),p_limit:10});
            assert.equal(metadata.rows[0].reason,reason);assert.equal(metadata.rows[0].summary,'Rejected record');
            assert.equal(metadata.rows[1].summary,'Approved record');assert.equal(metadata.rows[0].actor_name,'Fixture Admin');
            const version=await rpc(db,'read_dcf_revision',{...identity(d,pending.record.id),p_revision_id:rejected.revisionId});
            assert.equal(version.reason,reason);assert.equal(version.snapshot.record.workflow_status,'REJECTED');
            const old=await rpc(db,'read_dcf_revision',{...identity(d,pending.record.id),p_revision_id:pending.revisionId});
            assert.equal(old.snapshot.record.workflow_status,'PENDING');
        });
    }
    await check('a schema-recognized but unavailable module column cannot be silently discarded',async()=>{
        const d=domains[4],base=await state(d,1);
        await rejectsWithoutWrites(()=>commit(d,1,base,{catchUpPlanRemarks:'This model has no such column'},1,'Disposable validation'),/unavailable.*module/i);
    });
    await check('approval receipt cannot be replayed after losing the approver role',async()=>{
        const d=domains[0],base=await state(d,1),key=crypto.randomUUID();
        await db.exec(`update roles_config set can_edit=true where role='Management' and module='Subprojects'`);
        await commit(d,1,base,{workflow_status:'REJECTED'},7,'Manager rejection',key);
        await db.exec(`update users set role='User' where id=7`);
        await rejectsWithoutWrites(()=>commit(d,1,base,{workflow_status:'REJECTED'},7,'Manager rejection',key),/Approval permission/i);
    });
    for(const filename of ['components/Activities.tsx','components/program_management/OfficeRequirementsTab.tsx','components/program_management/StaffingRequirementsTab.tsx','components/program_management/OtherExpensesTab.tsx']){
        const source=await readFile(path.join(root,filename),'utf8');
        assert.doesNotMatch(source,/workflow_status: 'REJECTED', \.\.\.\(reason \? \{ remarks/,'Unsupported remarks must not be sent on confirmed production paths');
    }
    console.log(JSON.stringify({passed:results.filter(x=>x.status==='PASS').length,failed:results.filter(x=>x.status==='FAIL').length,results,
        limitations:['Memory-only PGlite/source-modeled schema','Actual SQL workflow and source payload checks, not full list-page click coverage','No production operations']},null,2));
    if(results.some(x=>x.status==='FAIL'))process.exitCode=1;
}catch(error){console.error(JSON.stringify({message:error.message,code:error.code,where:error.where}));process.exitCode=1;}
finally{await db.close();}
