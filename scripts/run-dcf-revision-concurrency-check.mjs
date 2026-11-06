import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createNativePostgresFixture } from './helpers/dcf-native-postgres-fixture.mjs';
import { createDcfRevisionFixture, domains, insertParent, plannedLine, root, rpc } from './helpers/dcf-revision-fixture.mjs';

const native=await createNativePostgresFixture();
const db=native.primary,results=[];
let a,b,bPid;
const identity=(d,id)=>({p_actor_id:1,p_actor_password:'fixture-password',p_entity_type:d.table,p_parent_id:id});
const state=(client,d,id)=>rpc(client,'read_dcf_state',identity(d,id));
const commit=(client,d,id,base,changes={},financial=[],key=crypto.randomUUID())=>rpc(client,'commit_dcf_change',{
    ...identity(d,id),p_base:base,p_changes:changes,p_financial:financial,p_request_key:key,
    p_reason:'Disposable native concurrency correction',p_source:'native-concurrency-check'});
const outcome=promise=>promise.then(data=>({ok:true,data}),error=>({ok:false,error}));
const history=async(d,id)=>(await db.query(`select * from dcf_record_revisions where entity_type=$1 and parent_id=$2 order by version`,[d.table,id])).rows;
const lock=async(d,id)=>{await a.exec('begin');await a.query(`select id from ${d.table} where id=$1 for update`,[id]);};
async function waiting(){
    const end=Date.now()+7000;
    while(Date.now()<end){
        const status=(await db.query('select state,wait_event_type,wait_event from pg_stat_activity where pid=$1',[bPid])).rows[0];
        if(status?.state==='active'&&status.wait_event_type==='Lock')return status;
        await delay(20);
    }
    throw Error('Second real backend did not reach an observable lock wait');
}
async function check(name,run){
    try{await run();results.push({name,status:'PASS'});console.log(`PASS ${name}`);}
    catch(error){results.push({name,status:'FAIL',error:error.message,code:error.code});console.error(`FAIL ${name}: ${error.message}`);}
    finally{await a?.exec('rollback');await b?.exec('rollback');}
}
try{
    await createDcfRevisionFixture({database:db});
    for(const file of ['202611030002_dcf_revision_mutations.sql','202611030003_dcf_revision_restore.sql'])await db.exec(await readFile(path.join(root,'supabase/migrations',file),'utf8'));
    a=await native.connect();b=await native.connect();
    const aPid=(await a.query('select pg_backend_pid() pid')).rows[0].pid;
    bPid=(await b.query('select pg_backend_pid() pid')).rows[0].pid;
    assert.equal(new Set([aPid,bPid,native.server.pid]).size,3,'Three genuinely independent native PostgreSQL backends');
    console.log(JSON.stringify({server:native.server,backends:[aPid,bPid],artifacts:native.artifacts}));
    const secondary={subprojects:'remarks',activities:'description',office_requirements:'purpose',staffing_requirements:'component',other_program_expenses:'fundType'};
    for(const d of domains){
        await check(`${d.table}: blocked disjoint saves preserve both fields and revision effective order`,async()=>{
            const p=await insertParent(db,d),base=await state(db,d,p.id);
            await lock(d,p.id);
            const secondValue=d.table==='other_program_expenses'?'Continuing':'Second writer';
            const pending=outcome(commit(b,d,p.id,base,{[secondary[d.table]]:secondValue}));
            try{
                await waiting();
                const first=await commit(a,d,p.id,base,{[d.label]:'First writer'});
                await a.exec('commit');
                const second=await pending;assert.ok(second.ok,second.error?.message);
                assert.equal(second.data.record[d.label],'First writer');assert.equal(second.data.record[secondary[d.table]],secondValue);
                assert.equal(first.record[secondary[d.table]],base.record[secondary[d.table]]);
                const versions=await history(d,p.id);assert.equal(versions.length,3);
                assert.equal(versions.at(-1).previous_revision_id,versions.at(-2).id);
                const ordered=(await db.query(`select not exists(select 1 from(select recorded_at,lag(recorded_at) over(order by version) prior from dcf_record_revisions where entity_type=$1 and parent_id=$2) x where recorded_at<prior) ordered`,[d.table,p.id])).rows[0].ordered;
                assert.equal(ordered,true,'A context opened before waiting must not timestamp a later revision before its predecessor');
            }finally{await a.exec('rollback');await pending;}
        });
    }
    const d=domains[2];
    await check('same-entry financial race rejects the stale writer and preserves posted identities',async()=>{
        await commit(db,d,1,await state(db,d,1),{purpose:'Known tracked baseline before the financial race'});
        const base=await state(db,d,1),entries=base.financial.stages.$parent.obligation.entries,entry=entries[0],count=(await history(d,1)).length;
        const edit=amount=>[{itemId:null,stage:'obligation',operations:[{action:'update',id:entry.id,expected:entry,value:{...entry,amount}}]}];
        await lock(d,1);const pending=outcome(commit(b,d,1,base,{},edit(81)));
        try{
            await waiting();await commit(a,d,1,base,{},edit(72));await a.exec('commit');
            const stale=await pending;assert.equal(stale.ok,false);assert.equal(stale.error.code,'40001');
            const current=await state(db,d,1);assert.equal(current.financial.stages.$parent.obligation.entries[0].amount,72);
            assert.deepEqual(current.financial.stages.$parent.obligation.entries.slice(1),entries.slice(1));
            assert.equal((await history(d,1)).length,count+1);
        }finally{await a.exec('rollback');await pending;}
    });
    await check('different financial entries serialize without losing the first correction',async()=>{
        const base=await state(db,d,1),entries=base.financial.stages.$parent.obligation.entries;
        const edit=(entry,amount)=>[{itemId:null,stage:'obligation',operations:[{action:'update',id:entry.id,expected:entry,value:{...entry,amount}}]}];
        await lock(d,1);const pending=outcome(commit(b,d,1,base,{},edit(entries[1],44)));
        try{
            await waiting();await commit(a,d,1,base,{},edit(entries[0],33));await a.exec('commit');
            const saved=await pending;assert.ok(saved.ok,saved.error?.message);
            assert.deepEqual(saved.data.financial.stages.$parent.obligation.entries.map(x=>x.amount),[33,44]);
            assert.deepEqual(saved.data.financial.stages.$parent.obligation.entries.map(x=>x.id),entries.map(x=>x.id));
        }finally{await a.exec('rollback');await pending;}
    });
    await check('same request concurrently returns one confirmed save and one version',async()=>{
        const p=await insertParent(db,d),base=await state(db,d,p.id),key=crypto.randomUUID(),changes={purpose:'One logical request'};
        await a.exec('begin');const first=await commit(a,d,p.id,base,changes,[],key);
        const pending=outcome(commit(b,d,p.id,base,changes,[],key));
        try{
            await waiting();await a.exec('commit');const repeated=await pending;assert.ok(repeated.ok,repeated.error?.message);
            assert.deepEqual(repeated.data,first);assert.equal((await history(d,p.id)).length,2);
            assert.equal((await db.query('select count(*)::int n from dcf_mutation_requests where request_key=$1',[key])).rows[0].n,1);
        }finally{await a.exec('rollback');await pending;}
    });
    await check('competing new requests cannot create a duplicate UID',async()=>{
        const uid=`NATIVE-${crypto.randomUUID()}`,changes={uid,equipment:'One planned item',operatingUnit:'RFO I',status:'Proposed'};
        await a.exec('begin');const first=await commit(a,d,null,{},changes);
        const pending=outcome(commit(b,d,null,{},changes));
        try{
            await waiting();await a.exec('commit');const repeated=await pending;assert.equal(repeated.ok,false);assert.equal(repeated.error.code,'23505');
            assert.equal((await db.query('select count(*)::int n from office_requirements where uid=$1',[uid])).rows[0].n,1);
            assert.equal((await history(d,first.record.id)).length,1);
        }finally{await a.exec('rollback');await pending;}
    });
    await check('intervening committed edit invalidates a waiting restore preview atomically',async()=>{
        const p=await insertParent(db,d),base=await state(db,d,p.id);
        const historical=await commit(db,d,p.id,base,{purpose:'Earlier point'});
        const current=await commit(db,d,p.id,historical,{purpose:'Current point'});
        const preview=await rpc(db,'preview_dcf_restore',{...identity(d,p.id),p_revision_id:historical.revisionId});
        await lock(d,p.id);
        const pending=outcome(rpc(b,'apply_dcf_restore',{...identity(d,p.id),p_revision_id:historical.revisionId,p_expected_revision_id:preview.currentRevisionId,p_expected_hash:preview.currentHash,p_reason:'Disposable historical correction',p_acknowledged_actuals:true,p_request_key:crypto.randomUUID()}));
        try{
            await waiting();await commit(a,d,p.id,current,{purpose:'Newer legitimate edit'});await a.exec('commit');
            const stale=await pending;assert.equal(stale.ok,false);assert.equal(stale.error.code,'40001');
            assert.equal((await state(db,d,p.id)).record.purpose,'Newer legitimate edit');
            assert.equal((await db.query('select count(*)::int n from dcf_restore_operations where entity_type=$1 and parent_id=$2',[d.table,p.id])).rows[0].n,0);
        }finally{await a.exec('rollback');await pending;}
    });
    for(const sourceType of ['subproject','activity'])await check(`${sourceType}: actual transfer finalizes paired histories with one operation/time`,async()=>{
        const domain=domains.find(x=>x.type===sourceType),line=plannedLine(101),retained=plannedLine(102);
        for(const x of [line,retained])for(const key of Object.keys(x))if(key.startsWith('actual')||['obligations','disbursements'].includes(key))delete x[key];
        const p=await insertParent(db,domain,{[domain.lines]:[line,retained]});
        await db.query(`update ${domain.table} set status='Completed' where id=$1`,[p.id]);
        const numeric=sourceType==='activity'?['actualParticipantsMale','actualParticipantsFemale','actualPWD','actualMuslim','actualLGBTQ','actualSoloParent','actualSenior','actualYouth']:['actualMaleBeneficiaries','actualFemaleBeneficiaries','actualFourPsBeneficiaries','actualPWD','actualMuslim','actualLGBTQ','actualSoloParent','actualSenior','actualYouth'];
        const allocation=Object.fromEntries(numeric.map(k=>[k,null])),key=crypto.randomUUID();
        const saved=(await db.query(`select submit_budget_item_transfer(1,'fixture-password',$1,$2,array['101'],$3::jsonb,$4::jsonb,$4::jsonb,'Native transfer evidence',$5::uuid) saved`,[sourceType,p.id,JSON.stringify({status:'Completed'}),JSON.stringify(allocation),key])).rows[0].saved;
        assert.equal(saved.status,'applied');
        const versions=(await db.query('select parent_id,operation_id,recorded_at from dcf_record_revisions where operation_id=$1 order by parent_id',[key])).rows;
        assert.equal(new Set(versions.map(x=>x.parent_id)).size,2);assert.equal(new Set(versions.map(x=>x.recorded_at)).size,1);
        assert.deepEqual(saved.source[domain.lines].map(x=>x.id),[102]);assert.deepEqual(saved.destination[domain.lines].map(x=>x.id),[101]);
    });
    console.log(JSON.stringify({nativeMultiSession:true,server:native.server,artifacts:native.artifacts,
        passed:results.filter(x=>x.status==='PASS').length,failed:results.filter(x=>x.status==='FAIL').length,results,
        limitations:['Disposable source-modeled schema, not production catalog parity','No crash-recovery or unrelated-parent global commit-order claim','No production operations']},null,2));
    if(results.some(x=>x.status==='FAIL'))process.exitCode=1;
}catch(error){console.error(JSON.stringify({message:error.message,code:error.code,where:error.where}));process.exitCode=1;}
finally{await native.close();}
