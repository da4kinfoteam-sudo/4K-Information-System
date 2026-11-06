import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createDcfRevisionFixture, installDcfRevision, root, rpc, fingerprints } from './helpers/dcf-revision-fixture.mjs';

const db=await createDcfRevisionFixture({install:false}),results=[];
const identity=(type='activities',actor=1)=>({p_actor_id:actor,p_actor_password:'fixture-password',p_entity_type:type,p_parent_id:1});
const state=(type='activities')=>rpc(db,'read_dcf_state',identity(type));
const commit=(base,changes,type='activities')=>rpc(db,'commit_dcf_change',{...identity(type),p_base:base,p_changes:changes,p_financial:[],p_reason:'Disposable reference correction',p_source:'reference-check',p_request_key:crypto.randomUUID()});
const preview=(version,type='activities',actor=1)=>rpc(db,'preview_dcf_restore',{...identity(type,actor),p_revision_id:version.revisionId});
const apply=(version,plan,type='activities')=>rpc(db,'apply_dcf_restore',{...identity(type),p_revision_id:version.revisionId,p_expected_revision_id:plan.currentRevisionId,p_expected_hash:plan.currentHash,p_reason:'Disposable reference restore',p_acknowledged_actuals:true,p_request_key:crypto.randomUUID()});
async function check(name,run){
    await db.exec('begin');
    try{await run();results.push({name,status:'PASS'});console.log(`PASS ${name}`);}
    catch(error){results.push({name,status:'FAIL',message:error.message,where:error.where});console.error(`FAIL ${name}: ${error.message}`);}
    finally{await db.exec('rollback');}
}
try{
    await installDcfRevision(db,{mutations:true});
    await db.exec(await readFile(path.join(root,'supabase/migrations/202611030003_dcf_revision_restore.sql'),'utf8'));
    await check('Fund Source current label is resolved even when the stable UID is unchanged',async()=>{
        const uid=(await db.query(`select uid from ref_fund_sources order by id limit 1`)).rows[0].uid;
        const a=await commit(await state(),{fundSourceUid:uid,fundSource:'Historical fund label',description:'A'});
        await commit(a,{description:'B',fundSource:'Current fund label'});
        await db.query(`update ref_fund_sources set label='Current fund label' where uid=$1`,[uid]);
        const before=await fingerprints(db),plan=await preview(a);
        assert.deepEqual(await fingerprints(db),before,'Preview does not write');
        assert.equal(plan.canRestore,true,JSON.stringify(plan.blockers));
        assert.equal(plan.proposed.record.fundSource,'Current fund label');
        assert(!plan.changes.some(x=>x.field==='fundSource'),'No stale-label/no-op edit in confirmation');
        const saved=await apply(a,plan);assert.equal(saved.record.fundSource,'Current fund label');
        const old=await rpc(db,'read_dcf_revision',{...identity(),p_revision_id:a.revisionId});
        assert.equal(old.snapshot.record.fundSource,'Historical fund label');
    });
    await check('newly assigning an inactive historical Fund Source is blocked',async()=>{
        const rows=(await db.query(`select uid,label from ref_fund_sources order by id limit 2`)).rows;
        const a=await commit(await state(),{fundSourceUid:rows[0].uid,fundSource:rows[0].label,description:'Historical inactive fund checkpoint'});
        await commit(a,{fundSourceUid:rows[1].uid,fundSource:rows[1].label});
        await db.query(`update ref_fund_sources set is_active=false where uid=$1`,[rows[0].uid]);
        const plan=await preview(a);assert.equal(plan.canRestore,false);assert(plan.blockers.some(x=>/inactive/.test(x)));
    });
    await check('generic Activity restore resolves the current reference name without replacing its optional title',async()=>{
        const a=await commit(await state(),{type:'Activity',reference_activity_id:1,name:'Recorded generic label',activity_title:'Specific historical title'});
        await commit(a,{name:'Current generic label',activity_title:'Current specific title'});
        await db.exec(`update reference_activities set activity_name='Current generic label' where id=1`);
        const plan=await preview(a);assert.equal(plan.canRestore,true,JSON.stringify(plan.blockers));
        assert.equal(plan.proposed.record.name,'Current generic label');
        assert.equal(plan.proposed.record.activity_title,'Specific historical title');
        const saved=await apply(a,plan);assert.equal(saved.record.name,'Current generic label');
        assert.equal(saved.record.activity_title,'Specific historical title');
        const old=await rpc(db,'read_dcf_revision',{...identity(),p_revision_id:a.revisionId});
        assert.equal(old.snapshot.record.name,'Recorded generic label');
    });
    await check('legacy null Fund Source can be restored without accidentally resolving the current UID',async()=>{
        const a=await commit(await state(),{fundSourceUid:null,fundSource:null,description:'Legacy null'});
        const row=(await db.query(`select uid,label from ref_fund_sources order by id limit 1`)).rows[0];
        await commit(a,{fundSourceUid:row.uid,fundSource:row.label,description:'Linked fund'});
        const plan=await preview(a);assert.equal(plan.canRestore,true,JSON.stringify(plan.blockers));
        assert.equal(plan.proposed.record.fundSourceUid,null);assert.equal(plan.proposed.record.fundSource,null);
    });
    await check('Activity IPO IDs resolve current names while old snapshot labels remain immutable',async()=>{
        const a=await commit(await state(),{description:'A'});
        await commit(a,{description:'B',participatingIpos:['Current IPO label']});
        await db.exec(`update ipos set name='Current IPO label' where id=1`);
        const plan=await preview(a);assert.equal(plan.canRestore,true,JSON.stringify(plan.blockers));
        assert.deepEqual(plan.proposed.record.participatingIpos,['Current IPO label']);
        assert(!plan.changes.some(x=>x.field==='participatingIpos'));
        const saved=await apply(a,plan);assert.deepEqual(saved.record.participatingIpos,['Current IPO label']);
    });
    await check('Subproject IPO ID resolves its current name in the exact preview payload',async()=>{
        const a=await commit(await state('subprojects'),{name:'Historical parent'},'subprojects');
        await commit(a,{name:'Current parent',indigenousPeopleOrganization:'Current IPO label'},'subprojects');
        await db.exec(`update ipos set name='Current IPO label' where id=1`);
        const plan=await preview(a,'subprojects');assert.equal(plan.canRestore,true,JSON.stringify(plan.blockers));
        assert.equal(plan.proposed.record.indigenousPeopleOrganization,'Current IPO label');
        const saved=await apply(a,plan,'subprojects');assert.equal(saved.record.indigenousPeopleOrganization,'Current IPO label');
    });
    await check('own-OU restore cannot reconnect an out-of-scope IPO; all-OU actor can',async()=>{
        await db.exec(`update users set "operatingUnit"='RPMO 1' where id=3;update activities set "operatingUnit"='RPMO 1' where id=1;
          insert into ipos(id,name,region) values(2,'Other region IPO','Region II (Cagayan Valley)');
          update ipos set region='Region I (Ilocos Region)' where id=1;
          update dcf_policy_settings set settings=jsonb_set(settings,'{roleRules,User,activities,Proposed,restoreHistory}','true',true) where settings_key='dcf_editing_policy';`);
        const a=await commit(await state(),{participating_ipo_ids:[2],participatingIpos:['Other region IPO']});
        await commit(a,{participating_ipo_ids:[1],participatingIpos:['Frozen IPO Label']});
        const denied=await preview(a,'activities',3);assert.equal(denied.canRestore,false);assert(denied.blockers.some(x=>/OU visibility/.test(x)));
        const allowed=await preview(a);assert.equal(allowed.canRestore,true,JSON.stringify(allowed.blockers));
    });
    await check('missing Activity reference and name-only legacy IPO links fail closed',async()=>{
        await db.exec(`insert into reference_activities(id,activity_name,component,type) values(999,'Temporary reference','Program Management','Activity')`);
        const a=await commit(await state(),{reference_activity_id:999,participating_ipo_ids:[],participatingIpos:['Unresolved legacy name']});
        await commit(a,{reference_activity_id:1,participating_ipo_ids:[1],participatingIpos:['Frozen IPO Label']});
        await db.exec(`delete from reference_activities where id=999`);
        const plan=await preview(a);assert.equal(plan.canRestore,false);
        assert(plan.blockers.some(x=>/no stable identities/.test(x)));assert(plan.blockers.some(x=>/Activity reference no longer exists/.test(x)));
    });
    await check('a changed destination reference invalidates confirmation even when the current parent is unchanged',async()=>{
        await db.exec(`insert into ipos(id,name,region) values(2,'Historical destination IPO','Region II (Cagayan Valley)')`);
        const a=await commit(await state(),{participating_ipo_ids:[2],participatingIpos:['Historical destination IPO']});
        await commit(a,{participating_ipo_ids:[1],participatingIpos:['Frozen IPO Label']});
        const plan=await preview(a);assert.equal(plan.canRestore,true,JSON.stringify(plan.blockers));
        await db.exec(`update ipos set name='Renamed destination IPO' where id=2`);
        const before=await fingerprints(db);
        await db.exec('savepoint stale_dependency_preview');
        await assert.rejects(()=>apply(a,plan),/changed after the preview/i);
        await db.exec('rollback to savepoint stale_dependency_preview');
        assert.deepEqual(await fingerprints(db),before);
        const fresh=await preview(a);assert.equal(fresh.canRestore,true,JSON.stringify(fresh.blockers));assert.notEqual(fresh.currentHash,plan.currentHash);
        assert.deepEqual(fresh.proposed.record.participatingIpos,['Renamed destination IPO']);
    });
    await check('restore cannot newly assign a removed UACS selection',async()=>{
        await db.exec(`insert into reference_uacs values('ref-509','MOOE','Travel','509','Temporary valid reference')`);
        const base=await state(),a=await commit(base,{expenses:base.record.expenses.map(x=>({...x,uacsCode:'509'}))});
        await commit(a,{expenses:a.record.expenses.map(x=>({...x,uacsCode:'502'}))});
        await db.exec(`delete from reference_uacs where "uacsCode"='509'`);
        const plan=await preview(a);assert.equal(plan.canRestore,false);assert(plan.blockers.some(x=>/UACS selection/.test(x)));
    });
    console.log(JSON.stringify({passed:results.filter(x=>x.status==='PASS').length,failed:results.filter(x=>x.status==='FAIL').length,results,
        limitations:['Disposable PGlite/source-modeled schema, not live catalog or authorization proof','No production data, migration or network operation']},null,2));
    if(results.some(x=>x.status==='FAIL'))process.exitCode=1;
}catch(error){console.error(JSON.stringify({message:error.message,code:error.code,where:error.where}));process.exitCode=1;}
finally{await db.close();}
