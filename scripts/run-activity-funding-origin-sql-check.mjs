import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createDcfRevisionFixture, domains, fingerprints, insertParent, installDcfRevision, rpc, securityFingerprint } from './helpers/dcf-revision-fixture.mjs';

const migrationPath='supabase/migrations/202611060001_restore_activity_creation_funding_origin.sql';
const originalSql=await readFile('supabase/migrations/202610140001_activity_supplemental_budgets.sql','utf8');
const corrective=await readFile(migrationPath,'utf8');
const definition=sql=>sql.replaceAll('\r\n','\n').match(/create or replace function public\.guard_activity_budget_separation\(\) returns trigger[\s\S]*?end; \$\$;/)[0];
const original=definition(originalSql);
const rejected="    if tg_op='INSERT' and (coalesce(new.\"isSavings\",false) or coalesce(new.\"isRealignment\",false)) then raise exception 'Use Supplemental Information for new Savings or Realignment funding.' using errcode='42501'; end if;\n";
const exclusive="  if tg_op='INSERT' and coalesce(new.\"isSavings\",false) and coalesce(new.\"isRealignment\",false) then\n    raise exception 'Select either Savings or Realignment, not both.' using errcode='22023';\n  end if;\n";
assert(original.includes(rejected));
const expectedDefinition=original.replace(rejected,'').replace("  if tg_op='UPDATE' then\n",exclusive+"  if tg_op='UPDATE' then\n");
const body=sql=>sql.slice(sql.indexOf('as $$')+5,sql.lastIndexOf('$$;'));
assert(!/\b(?:update public\.|delete from|insert into|alter table|drop trigger)\b/i.test(corrective),'Corrective installation must not perform business DML or change table/trigger definitions');

const db=await createDcfRevisionFixture({install:false});
let passed=0;
const test=async(name,run)=>{await run();passed++;console.log('PASS '+name)};
const activity=domains.find(domain=>domain.table==='activities');
try{
    const legacy=await insertParent(db,activity,{isSavings:true,isRealignment:false,name:'Existing Savings'});
    const nullable=await insertParent(db,activity,{isSavings:null,isRealignment:null,name:'Existing NULL classification'});
    await db.exec(original);
    const before=await fingerprints(db),security=await securityFingerprint(db);
    await test('old deployed guard rejects whole-Activity Savings creation',async()=>{
        await assert.rejects(()=>insertParent(db,activity,{isSavings:true}),/Use Supplemental Information/);
    });
    await test('function-only migration is idempotent and preserves every existing row/security attribute',async()=>{
        await db.exec(corrective);await db.exec(corrective);
        assert.equal((await db.query("select prosrc from pg_proc where oid='public.guard_activity_budget_separation()'::regprocedure")).rows[0].prosrc,body(expectedDefinition),'Only initial-origin admission/exclusivity may change in the installed guard');
        assert.deepEqual(await fingerprints(db),before);assert.deepEqual(await securityFingerprint(db),security);
    });
    await installDcfRevision(db,{mutations:true});
    const create=async(changes,actorId=1,key=crypto.randomUUID(),password='fixture-password')=>rpc(db,'commit_dcf_change',{
        p_actor_id:actorId,p_actor_password:password,p_entity_type:'activities',p_parent_id:null,p_base:{},p_changes:changes,p_financial:[],p_request_key:key,p_reason:'Disposable funding-origin creation',p_source:'activity-edit-create',
    });
    const changes=(type,origin,extra={})=>({uid:`ORIGIN-${crypto.randomUUID()}`,type,name:`${type} ${origin}`,operatingUnit:'RFO I',fundingYear:2026,fundType:'Current',tier:'Tier 1',fundSourceUid:'FS-000001',fundSource:'4K Fund',status:'Proposed',workflow_status:'APPROVED',isSavings:origin==='Savings',isRealignment:origin==='Realignment',expenses:[{id:10,objectType:'MOOE',expenseParticular:'Travel',uacsCode:'502',amount:100,targetScheduleVersion:2,targetObligationSchedules:[{id:'o',month:'2026-10-01',amount:100}],targetDisbursementSchedules:[{id:'d1',month:'2026-11-01',amount:40},{id:'d2',month:'2026-12-01',amount:60}]}],...extra});
    const created=[];
    for(const type of ['Activity','Training'])for(const origin of ['Ordinary','Savings','Realignment'])await test(`${type}: authorized ${origin} creation persists once and captures initial flags`,async()=>{
        const payload=changes(type,origin),key=crypto.randomUUID(),result=await create(payload,1,key);
        assert.equal(result.record.isSavings,payload.isSavings);assert.equal(result.record.isRealignment,payload.isRealignment);
        assert.deepEqual(result.record.expenses,payload.expenses);assert.deepEqual((await create(payload,1,key)).record,result.record);
        const versions=(await db.query('select snapshot from dcf_record_revisions where entity_type=\'activities\' and parent_id=$1',[result.record.id])).rows;
        assert.equal(versions.length,1);assert.equal(versions[0].snapshot.record.isSavings,payload.isSavings);assert.equal(versions[0].snapshot.record.isRealignment,payload.isRealignment);
        assert.equal((await db.query('select count(*)::int n from activity_supplements where activity_id=$1',[result.record.id])).rows[0].n,0);
        created.push(result);
    });
    await test('invalid dual flags, Guest, wrong credentials and foreign OU cannot create',async()=>{
        const before=await fingerprints(db);
        await assert.rejects(()=>create(changes('Activity','Savings',{isRealignment:true})),/not both/);
        await assert.rejects(()=>create(changes('Activity','Savings'),4),/permission|Guest|access/i);
        await assert.rejects(()=>create(changes('Activity','Savings'),1,crypto.randomUUID(),'wrong'),/session|credentials|password/i);
        await assert.rejects(()=>create(changes('Activity','Savings',{operatingUnit:'RFO II'}),3),/scope/i);
        assert.deepEqual(await fingerprints(db),before);
    });
    const read=async id=>rpc(db,'read_dcf_state',{p_actor_id:1,p_actor_password:'fixture-password',p_entity_type:'activities',p_parent_id:id});
    const edit=async(id,base,patch)=>rpc(db,'commit_dcf_change',{p_actor_id:1,p_actor_password:'fixture-password',p_entity_type:'activities',p_parent_id:id,p_base:base,p_changes:patch,p_financial:[],p_request_key:crypto.randomUUID(),p_reason:'Disposable correction',p_source:'activity-edit-expenses'});
    await test('unfrozen Proposed budget can change without reclassification; saved flags cannot change',async()=>{
        const saved=created.find(row=>row.record.isSavings),base=await read(saved.record.id);
        const edited=await edit(saved.record.id,base,{expenses:base.record.expenses.map(row=>({...row,amount:130}))});
        assert.equal(edited.record.expenses[0].amount,130);assert.equal(edited.record.isSavings,true);
        const unchanged=await fingerprints(db);
        await assert.rejects(async()=>edit(saved.record.id,await read(saved.record.id),{isSavings:false}),/classification cannot be changed/);
        assert.deepEqual(await fingerprints(db),unchanged);
    });
    await test('normal approval remains required and approved Ongoing origin has zero frozen target baseline',async()=>{
        const pending=await create(changes('Activity','Realignment',{status:'Ongoing',workflow_status:'PENDING',approver_id:1}),2);
        assert.equal(pending.record.workflow_status,'PENDING');assert.equal(pending.record.original_budget_snapshot,null);
        const approved=await edit(pending.record.id,await read(pending.record.id),{workflow_status:'APPROVED'});
        assert.equal(approved.record.original_budget_snapshot.expenses.length,0);
        await assert.rejects(async()=>edit(pending.record.id,await read(pending.record.id),{expenses:approved.record.expenses.map(row=>({...row,amount:999}))}),/original.*budget.*(?:locked|frozen)/i);
    });
    await test('forged ledger-backed supplements and ordinary per-item Savings remain rejected',async()=>{
        const payload=changes('Activity','Savings');
        await assert.rejects(()=>create({...payload,expenses:payload.expenses.map(row=>({...row,isSavings:true}))}),/Supplemental Information/);
        await assert.rejects(()=>create({...payload,uid:`FORGED-${crypto.randomUUID()}`,expenses:payload.expenses.map(row=>({...row,fundingOrigin:'Supplemental',supplementUid:crypto.randomUUID(),supplementStatus:'APPROVED',supplementalSource:'Savings'}))}),/Invalid supplemental/);
    });
    await test('legacy NULL flags and reported financial rows survive unrelated saves',async()=>{
        const ledgers=await fingerprints(db,['financial_obligations','financial_disbursements']);
        const updated=await edit(nullable.id,await read(nullable.id),{name:'Unrelated detail change'});
        assert.equal(updated.record.isSavings,null);assert.equal(updated.record.isRealignment,null);
        assert.equal((await read(legacy.id)).record.isSavings,true);
        assert.deepEqual(await fingerprints(db,['financial_obligations','financial_disbursements']),ledgers);
    });
    await test('production migration order preserves the History archive-recovery hook',async()=>{
        await db.exec(original);
        await db.exec('create table trash_bin(id bigint generated by default as identity primary key,entity_type text,original_id bigint,data jsonb,deleted_by text,deleted_at timestamptz default now())');
        for(const file of ['202611030003_dcf_revision_restore.sql','202611040001_dcf_archive_recovery.sql'])await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
        const source=async()=>(await db.query("select prosrc from pg_proc where oid='public.guard_activity_budget_separation()'::regprocedure")).rows[0].prosrc;
        const before=await source();assert.match(before,/dcf_archive_recovery_matches/);
        const rows=await fingerprints(db),security=await securityFingerprint(db);
        await db.exec(corrective);await db.exec(corrective);
        assert.equal(await source(),before.replace(rejected,'').replace("  if tg_op='UPDATE' then\n",exclusive+"  if tg_op='UPDATE' then\n"));
        assert.deepEqual(await fingerprints(db),rows);assert.deepEqual(await securityFingerprint(db),security);
    });
    console.log(`${passed} funding-origin SQL checks passed. Disposable database only; production untouched.`);
}finally{await db.close()}
