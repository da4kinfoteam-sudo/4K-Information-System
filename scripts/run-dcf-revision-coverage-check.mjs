import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createDcfRevisionFixture, installDcfRevision, domains, insertParent, root, rpc, fingerprints } from './helpers/dcf-revision-fixture.mjs';

const db=await createDcfRevisionFixture({install:false});
const results=[];
const identity=(d,id)=>({p_actor_id:1,p_actor_password:'fixture-password',p_entity_type:d.table,p_parent_id:id});
const state=(d,id)=>rpc(db,'read_dcf_state',identity(d,id));
const commit=(d,id,base,changes)=>rpc(db,'commit_dcf_change',{...identity(d,id),p_base:base,p_changes:changes,p_financial:[],p_request_key:crypto.randomUUID(),p_reason:'Disposable coverage fixture',p_source:'coverage-check'});
const preview=(d,id,rid)=>rpc(db,'preview_dcf_restore',{...identity(d,id),p_revision_id:rid});
async function check(name,run){
    try{await run();results.push({name,status:'PASS'});console.log(`PASS ${name}`);}
    catch(error){results.push({name,status:'FAIL',message:error.message,where:error.where});console.error(`FAIL ${name}: ${error.message}`);}
}
try{
    await installDcfRevision(db,{mutations:true});
    await db.exec(await readFile(path.join(root,'supabase/migrations/202611030003_dcf_revision_restore.sql'),'utf8'));
    for(const d of domains){
        await check(`${d.table}: complete field manifest validates identity and all captured stages`,async()=>{
            const saved=await commit(d,1,await state(d,1),{[d.label]:'Complete snapshot'});
            assert.equal(saved.coverage.complete,true);
            assert.deepEqual(saved.coverage.recordFields,Object.keys(saved.record).filter(k=>!['updated_at','history'].includes(k)).sort());
            const stored=(await rpc(db,'read_dcf_revision',{...identity(d,1),p_revision_id:saved.revisionId})).snapshot;
            await db.query('select dcf_assert_snapshot($1,1,$2::jsonb)',[d.table,JSON.stringify(stored)]);
            await commit(d,1,saved,{[d.label]:'Current version'});
            assert.equal((await preview(d,1,saved.revisionId)).canRestore,true);
        });
        if(d.lines)await check(`${d.table}: legacy NULL budget array remains readable and untouched during metadata saves`,async()=>{
            const p=await insertParent(db,d,{[d.lines]:null}),before=await state(d,p.id);
            assert.equal(before.record[d.lines],null);
            const saved=await commit(d,p.id,before,{[d.label]:'Unrelated detail correction'});
            assert.equal(saved.record[d.lines],null);
            const stored=(await rpc(db,'read_dcf_revision',{...identity(d,p.id),p_revision_id:saved.revisionId})).snapshot;
            await db.query('select dcf_assert_snapshot($1,$2,$3::jsonb)',[d.table,p.id,JSON.stringify(stored)]);
        });
    }
    const variants=[
        ['missing coverage',s=>{delete s.coverage;}],
        ['missing nullable record field',s=>{delete s.record.location;}],
        ['manifest/record disagreement',s=>{s.coverage.recordFields=s.coverage.recordFields.filter(x=>x!=='location');}],
        ['wrong parent identity',s=>{s.record.id=99999;}],
        ['missing financial section',s=>{delete s.financial.disbursements;}],
        ['missing item stage',s=>{delete s.financial.stages['10'].obligation;}],
        ['missing actual identity',s=>{delete s.financial.stages['10'].obligation.entries[0].id;}],
        ['ambiguous actual identity',s=>{s.financial.stages['10'].obligation.entries.push({...s.financial.stages['10'].obligation.entries[0]});}],
    ];
    for(const [label,alter]of variants)await check(`restore refuses ${label} without altering business records`,async()=>{
        const d=domains[0],p=await insertParent(db,d),a=await commit(d,p.id,await state(d,p.id),{name:'Historical point'});
        // Give the captured stage a real posted entry for identity corruption cases.
        if(label.includes('actual identity')){
            await db.query(`insert into financial_obligations(entity_type,parent_id,item_id,obligation_date,amount) values('subproject_detail',$1,'10','2026-11-01',25)`,[p.id]);
        }
        const saved=await commit(d,p.id,await state(d,p.id),{name:'Historical point with stage'});
        await commit(d,p.id,saved,{name:'Current state'});
        const target=(await db.query('select snapshot from dcf_record_revisions where id=$1',[saved.revisionId])).rows[0].snapshot;
        alter(target);
        // Privileged corruption is injected only in this disposable database.
        // Ordinary application roles cannot update the append-only revision table.
        await db.query('update dcf_record_revisions set snapshot=$1 where id=$2',[target,saved.revisionId]);
        const before=await fingerprints(db);
        await assert.rejects(()=>preview(d,p.id,saved.revisionId),error=>error.code==='22023'&&/incomplete|coverage|identity|schema|ambiguous/i.test(error.message));
        assert.deepEqual(await fingerprints(db),before);
    });
    console.log(JSON.stringify({passed:results.filter(x=>x.status==='PASS').length,failed:results.filter(x=>x.status==='FAIL').length,results,
        limitations:['Disposable PGlite/source-modeled schema; no production reads or writes','Corruption injected with fixture-owner privileges, not an ordinary-user capability']},null,2));
    if(results.some(x=>x.status==='FAIL'))process.exitCode=1;
}catch(error){console.error(JSON.stringify({message:error.message,code:error.code,where:error.where}));process.exitCode=1;}
finally{await db.close();}
