import assert from 'node:assert/strict';
import { createHttpFixture, harnessImports, state, versions, finish } from './helpers/dcf-revision-http-fixture.mjs';
import { fingerprints, insertParent, domains, transaction, rpc } from './helpers/dcf-revision-fixture.mjs';

const harness=`${harnessImports}
import {buildActivityClonePayload,buildSubprojectClonePayload} from './lib/recordCloning';
import {persistRepeatingActivity} from './lib/activityRepeatingPersistence';
function Harness(){
 const confirmed=record=>window.fixture.confirmations.push(record);
 const office=pm.useProgramManagementWriter('office_requirements',window.session,confirmed);
 const staffing=pm.useProgramManagementWriter('staffing_requirements',window.session,confirmed);
 const other=pm.useProgramManagementWriter('other_program_expenses',window.session,confirmed);
 window.batchWriters={office_requirements:office,staffing_requirements:staffing,other_program_expenses:other};
 window.api={...window.api,buildActivityClonePayload,buildSubprojectClonePayload,persistRepeatingActivity};
 return <main>Disposable batch adapter check</main>;
}createRoot(document.getElementById('root')).render(<Harness/>);`;
const f=await createHttpFixture({harness,name:'revision-batch'}),{db,page,test}=f;
try{
    for(const type of ['office_requirements','staffing_requirements','other_program_expenses'])await test(`${type}: real batch hook creates two independent versions sharing one correlation`,async()=>{
        const original=await state(db,type,1);
        const records=[1,2].map(index=>({...original.record,id:undefined,uid:`BATCH-${type}-${index}`}));
        const saved=await page.evaluate(async({type,records})=>window.batchWriters[type].createMany(records,'fixture-bulk-clone',[1,1]),{type,records});
        assert.equal(saved.length,2);
        const revisions=await Promise.all(saved.map(row=>versions(db,type,row.id)));
        assert(revisions.every(rows=>rows.length===1));
        assert.equal(revisions[0][0].correlation_id,revisions[1][0].correlation_id);
        assert.notEqual(revisions[0][0].operation_id,revisions[1][0].operation_id);
        assert(revisions.every(rows=>rows[0].origin.parentId===1&&rows[0].origin.uid===original.record.uid));
        for(const row of saved){
            const current=await state(db,type,row.id);
            assert.equal(current.record.status,original.record.status);
            for(const stage of Object.values(current.financial.stages))for(const value of Object.values(stage))assert.deepEqual(value.entries,[]);
        }
        assert.deepEqual(await state(db,type,1),original,'Cloning cannot change the source or its posted entries');
    });
    for(const type of ['office_requirements','staffing_requirements','other_program_expenses'])await test(`${type}: a lost response reuses the original clone payload despite regenerated UI identities`,async()=>{
        const source=(await state(db,type,1)).record;
        f.control.loseResponse='commit_dcf_change';
        const attempt=await page.evaluate(async({type,source})=>{
            const records=[1,2].map(index=>({...source,id:undefined,uid:`RETRY-${type}-${index}`}));
            try{await window.batchWriters[type].createMany(records,'retry-bulk-clone',[1,1]);return {error:null};}
            catch(error){return {error:error.message};}
        },{type,source});
        assert(attempt.error);
        const first=f.calls.filter(call=>call.name==='commit_dcf_change').at(-1);
        const saved=await page.evaluate(async({type,source})=>window.batchWriters[type].createMany([1,2].map(index=>({...source,id:undefined,uid:`REGENERATED-${type}-${index}`})),'retry-bulk-clone',[1,1]),{type,source});
        assert.equal(saved.length,2);assert.notEqual(saved[0].id,saved[1].id);
        assert.equal(saved[0].uid,`RETRY-${type}-1`);
        assert.equal(f.calls.filter(call=>call.key===first.key&&call.ok).length,2,'The same receipt must confirm a lost response');
        for(const row of saved)assert.equal((await versions(db,type,row.id)).length,1);
    });
    await test('clone source lineage is resolved from an authorized current source, never a client label or foreign OU',async()=>{
        const source=await insertParent(db,domains.find(domain=>domain.table==='office_requirements'),{operatingUnit:'RFO II'});
        const before=await fingerprints(db);
        const result=await page.evaluate(async sourceId=>{
            try{
                await window.api.persistDcfMutation({entityType:'office_requirements',base:{cloneSourceId:sourceId,uid:'Forged source label'},
                    changes:{uid:'DENIED-CLONE-LINEAGE',equipment:'Independent destination',operatingUnit:'RFO I',status:'Proposed'},
                    actor:{id:3,password:'fixture-password'},source:'fixture-clone'});
                return null;
            }catch(error){return error.message;}
        },source.id);
        assert.match(result,/scope/i);
        assert.deepEqual(await fingerprints(db),before);
    });
    for(const type of ['activities','subprojects'])await test(`${type}: clone adapters retain batch correlation and independent request identities`,async()=>{
        const original=await state(db,type,1);
        const result=await page.evaluate(async({type,source})=>{
            const build=type==='activities'?window.api.buildActivityClonePayload:window.api.buildSubprojectClonePayload;
            const correlationId=crypto.randomUUID(),context={createdAt:new Date().toISOString(),encodedBy:'Fixture Admin',requiresApprover:false};
            const attempts=[1,2].map(()=>({changes:window.api.dcfChangedFields({},build(source,context)),request:{correlationId}}));
            const rows=[];
            for(const attempt of attempts)rows.push(await window.api.persistDcfMutation({entityType:type,base:{cloneSourceId:source.id},...attempt,actor:window.session,source:'fixture-bulk-clone'}));
            return {rows,attempts};
        },{type,source:original.record});
        const revisions=await Promise.all(result.rows.map(row=>versions(db,type,row.record.id)));
        assert(revisions.every(rows=>rows.length===1));
        assert.equal(revisions[0][0].correlation_id,revisions[1][0].correlation_id);
        assert.notEqual(revisions[0][0].operation_id,revisions[1][0].operation_id);
        assert(revisions.every(rows=>rows[0].origin.parentId===1&&rows[0].summary===`Cloned from ${original.record.uid}`));
        assert.deepEqual(await state(db,type,1),original);
    });
    await test('partial PM batch reads a confirmed first row instead of overwriting later changes with its old create receipt',async()=>{
        const type='office_requirements',source=(await state(db,type,1)).record;
        await db.exec(`create function fixture_reject_second_clone() returns trigger language plpgsql as $$ begin if new.uid='PARTIAL-PM-2' then raise exception 'Disposable second row rejected' using errcode='23514'; end if;return new;end $$;
            create trigger fixture_reject_second_clone before insert on office_requirements for each row execute function fixture_reject_second_clone()`);
        const result=await page.evaluate(async source=>{
            try{await window.batchWriters.office_requirements.createMany([1,2].map(index=>({...source,id:undefined,uid:'PARTIAL-PM-'+index})),'partial-clone',[1,1]);return null;}
            catch(error){return error.message;}
        },source);
        assert.match(result,/second row rejected/);
        const first=(await db.query("select * from office_requirements where uid='PARTIAL-PM-1'")).rows[0];assert(first);
        await db.query('update office_requirements set purpose=$1 where id=$2',['Later confirmed purpose',first.id]);
        await db.exec('drop trigger fixture_reject_second_clone on office_requirements');
        const writes=f.calls.filter(call=>call.name==='commit_dcf_change').length;
        const saved=await page.evaluate(async source=>window.batchWriters.office_requirements.createMany([1,2].map(index=>({...source,id:undefined,uid:'PARTIAL-PM-REGENERATED-'+index})),'partial-clone',[1,1]),source);
        assert.equal(saved[0].id,first.id);assert.equal(saved[0].purpose,'Later confirmed purpose');
        assert.equal(f.calls.filter(call=>call.name==='commit_dcf_change').length,writes+1);
        assert.equal((await db.query("select count(*)::int n from office_requirements where uid like 'PARTIAL-PM-%'")).rows[0].n,2);
    });
    await test('a later operation in one backend transaction cannot inherit a clone origin or batch label',async()=>{
        const base=await state(db,'office_requirements',1),identity={p_actor_id:1,p_actor_password:'fixture-password',p_entity_type:'office_requirements'};
        const saved=await transaction(db,async()=>{
            await rpc(db,'commit_dcf_change',{...identity,p_parent_id:null,p_base:{cloneSourceId:1},p_changes:{uid:'CONTEXT-CLONE',equipment:'Context-only clone',operatingUnit:'RFO I',status:'Proposed'},p_financial:[],p_request_key:crypto.randomUUID(),p_source:'fixture-clone',p_reason:'Disposable context check',p_correlation_id:crypto.randomUUID()});
            return rpc(db,'commit_dcf_change',{...identity,p_parent_id:1,p_base:base,p_changes:{purpose:'Independent later operation'},p_financial:[],p_request_key:crypto.randomUUID(),p_source:'fixture-details',p_reason:'Disposable context check'});
        });
        const revision=(await versions(db,'office_requirements',1)).find(row=>row.id===saved.revisionId);
        assert.equal(revision.origin,null);assert.equal(revision.correlation_id,revision.operation_id);
    });
    await test('no external requests, direct parent writes or runtime errors',async()=>{assert.deepEqual(f.external,[]);assert.deepEqual(f.errors,[]);});
}finally{await f.close();}
finish(f);
