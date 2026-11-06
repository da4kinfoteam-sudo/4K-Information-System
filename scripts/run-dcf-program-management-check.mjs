import assert from 'node:assert/strict';
import path from 'node:path';
import { createHttpFixture, state, history, versions, browserCall, confirmed, assertRollback, assertFinancialRestored, finish } from './helpers/dcf-revision-http-fixture.mjs';
import { domains, fingerprints } from './helpers/dcf-revision-fixture.mjs';

const f=await createHttpFixture({name:'program-management'}),{db,page,test}=f;
const actor={id:1,password:'fixture-password',role:'Super Admin',fullName:'Fixture Admin',operatingUnit:'NPMO'};
const pmDomains=domains.slice(2);
const open=(mode,type,id=1)=>page.evaluate(({mode,type,id})=>window.openFixture(mode,type,id),{mode,type,id});
const stage=(value,d,kind='obligation')=>value.financial.stages[d.lines?'10':'$parent'][kind].entries;
const save=async(d,base,proposed,extra={})=>confirmed(await browserCall(page,'saveProgramManagementChange',[{
    entityType:d.table,base,proposed,currentUser:actor,source:'program-management-edit',reason:'Disposable correction',request:{},...extra,
}]));
async function showVersion(d,rid){
    await open('history',d.table);await page.getByRole('button',{name:'History',exact:true}).click();
    const data=await history(db,d.table,1),index=data.rows.findIndex(row=>Number(row.id)===Number(rid));assert.ok(index>=0);
    await page.getByTitle('View version',{exact:true}).nth(index).click();await page.getByRole('dialog').getByRole('heading',{name:'Requirement Details',exact:true}).waitFor();
}
async function restore(d,rid,{undo=false}={}){
    await showVersion(d,rid);
    await page.getByRole('button',{name:undo?'Undo Restore':'Restore this version',exact:true}).click();
    await page.getByLabel(undo?'Reason for undoing restore':'Reason for restoration',{exact:true}).fill('Disposable verified correction');
    const ack=page.getByLabel('I acknowledge the changes to reported physical and financial actuals.');if(await ack.count())await ack.check();
    const count=await page.evaluate(()=>window.fixture.confirmations.length);
    await page.getByRole('button',{name:undo?'Confirm Undo Restore':'Confirm Restore',exact:true}).dblclick();
    await page.waitForFunction(n=>window.fixture.confirmations.length===n+1,count);
    return state(db,d.table,1);
}

try {
    for(const d of pmDomains){
        await test(`${d.table}: actual create adapter, stable request retry, two detail saves and no-op`,async()=>{
            const proposed={uid:`PM-${d.type}-${crypto.randomUUID()}`,operatingUnit:'RFO I',fundYear:2026,fundType:'Current',tier:'Tier 1',fundSourceUid:'FS-000001',fundSource:'4K Fund',
                [d.label]:`Created ${d.type}`,...(d.type==='office_requirement'?{numberOfUnits:2,pricePerUnit:20}:
                    d.type==='staffing_requirement'?{status:'Contractual',hiringStatus:'Proposed',annualSalary:100,expenses:[]}:{amount:100})};
            const created=await page.evaluate(async({d,proposed,actor})=>{
                const request={};window.pmCreate={entityType:d.table,proposed,currentUser:actor,source:'program-management-create',request};
                return window.api.createProgramManagementRecord(window.pmCreate);
            },{d,proposed,actor});
            const first=await versions(db,d.table,created.record.id);assert.equal(first.length,1);assert.equal(first[0].actor_id,1);assert.equal(created.record.uid,proposed.uid);
            const repeated=await page.evaluate(()=>window.api.createProgramManagementRecord(window.pmCreate));
            assert.deepEqual(repeated,created);assert.equal((await versions(db,d.table,created.record.id)).length,1);
            const b=await save(d,created,{...created.record,[d.label]:'Detail B'});
            const c=await save(d,b,{...b.record,[d.label]:'Detail C'});
            const before=await fingerprints(db),calls=f.calls.length;
            await save(d,c,c.record);assert.deepEqual(await fingerprints(db),before);assert.equal(f.calls.length,calls,'Client no-op issues no RPC');
            const saved=await versions(db,d.table,c.record.id);assert.equal(saved.length,3);
            assert.deepEqual(saved[0],first[0]);assert.equal(saved[1].snapshot.record[d.label],'Detail B');assert.equal(saved[2].snapshot.record[d.label],'Detail C');
        });

        await test(`${d.table}: full Financial ACF saves twice with stable IDs, other stage and one local confirmation`,async()=>{
            const baseline=await state(db,d.table,1),initial=(await versions(db,d.table,1)).length,name=baseline.record[d.label];
            await open('financial',d.table);await page.getByLabel('Search particulars, UACS code, or parent item',{exact:true}).fill(name);
            for(const amount of ['21.25','26.50']){
                const callbacks=await page.evaluate(()=>window.fixture.confirmations.length);
                await page.getByRole('button',{name:`Manage actual obligations for ${name}`,exact:true}).click();
                const dialog=page.getByRole('dialog',{name:'Manage Actual Obligations',exact:true});
                await dialog.locator('input[aria-label$="obligation 1 amount"]').fill(amount);
                await dialog.getByRole('button',{name:'Save Changes',exact:true}).dblclick();
                await page.waitForFunction(n=>window.fixture.confirmations.length===n+1,callbacks);await dialog.waitFor({state:'hidden'});
                const current=await state(db,d.table,1);
                assert.deepEqual(current.financial.disbursements,baseline.financial.disbursements);
                assert.deepEqual(current.financial.obligations.map(r=>r.id),baseline.financial.obligations.map(r=>r.id));
                assert.equal(Number(current.financial.obligations[0].amount),Number(amount));assert.equal(Number(current.financial.obligations[1].amount),12.34);
                const expected=confirmed(await browserCall(page,'hydrateProgramManagementState',[current,d.table]));
                const local=await page.evaluate(type=>window.localRecord(type).find(row=>row.id===1),d.table);assert.deepEqual(local,expected);
                assert.deepEqual((await versions(db,d.table,1)).at(-1).snapshot.financial,current.financial);
            }
            assert.equal((await versions(db,d.table,1)).length,initial+3);
        });

        await test(`${d.table}: server-approved historical financial restore and refresh-safe undo through shared modal`,async()=>{
            const old=(await versions(db,d.table,1))[0],before=await state(db,d.table,1),immutable=await versions(db,d.table,1);
            const restored=await restore(d,old.id);assertFinancialRestored(restored.financial,old.snapshot.financial);
            assert.deepEqual(restored.financial.disbursements,before.financial.disbursements);
            await page.reload();await page.waitForFunction(()=>!!window.api);
            const undone=await restore(d,(await versions(db,d.table,1)).at(-1).id,{undo:true});assertFinancialRestored(undone.financial,before.financial);
            assert.deepEqual(undone.financial.disbursements,before.financial.disbursements);
            assert.deepEqual((await versions(db,d.table,1)).slice(0,immutable.length),immutable);
        });

        await test(`${d.table}: combined parent/child mutation fails atomically at SQL finalization`,async()=>{
            const base=await state(db,d.table,1),hydrated=confirmed(await browserCall(page,'hydrateProgramManagementState',[base,d.table]));
            const proposed=structuredClone(hydrated),line=d.lines?proposed.expenses[0]:proposed;line.obligations[0].amount+=5;proposed[d.label]='Must roll back';
            await db.exec(`create function fixture_fail_commit() returns trigger language plpgsql as $$ begin raise exception 'fixture finalization failure'; end $$;
              create trigger fixture_fail_commit before insert on dcf_mutation_requests for each row execute function fixture_fail_commit();`);
            try{await assertRollback(db,async()=>{
                const result=await browserCall(page,'saveProgramManagementChange',[{entityType:d.table,base,original:hydrated,proposed,financial:true,currentUser:actor,source:'financial-accomplishment',reason:'Disposable correction',request:{}}]);
                assert.match(result.error||'',/fixture finalization failure/);
            });}finally{await db.exec('drop trigger fixture_fail_commit on dcf_mutation_requests; drop function fixture_fail_commit();');}
        });

        await test(`${d.table}: stale child baseline refuses overwrite without losing other records`,async()=>{
            const base=await state(db,d.table,1),hydrated=confirmed(await browserCall(page,'hydrateProgramManagementState',[base,d.table]));
            const proposed=structuredClone(hydrated),line=d.lines?proposed.expenses[0]:proposed;line.obligations[0].amount+=9;
            await db.query('update financial_obligations set amount=amount+1 where id=$1',[base.financial.obligations[0].id]);
            await assertRollback(db,async()=>{
                const result=await browserCall(page,'saveProgramManagementChange',[{entityType:d.table,base,original:hydrated,proposed,financial:true,currentUser:actor,source:'financial-accomplishment',reason:'Disposable correction',request:{}}]);
                assert.match(result.error||'',/changed|stale|conflict/i);
            });
        });

        await test(`${d.table}: explicit removal/recreation restore preserves historical identity lineage`,async()=>{
            const base=await state(db,d.table,1),hydrated=confirmed(await browserCall(page,'hydrateProgramManagementState',[base,d.table]));
            // Save the exact current state as an ordinary metadata revision before removing a posted entry.
            const saved=await save(d,base,{...hydrated,[d.label]:hydrated[d.label]+' before removal'}),target=saved.revisionId;
            const current=confirmed(await browserCall(page,'hydrateProgramManagementState',[saved,d.table]));
            const proposed=structuredClone(current),line=d.lines?proposed.expenses[0]:proposed,removed=line.obligations.shift();
            const after=await save(d,saved,proposed,{original:current,financial:true,onlyStage:'obligation',removedIds:[String(removed.id)]});
            assert.equal(stage(after,d).length,stage(saved,d).length-1);
            assert.deepEqual(after.financial.disbursements,saved.financial.disbursements);
            const restored=await restore(d,target),entries=stage(restored,d),mapped=entries.find(row=>Number(row.amount)===Number(removed.amount)&&row.date===removed.date);
            assert.ok(mapped,'Historical financial values restored');assert.notEqual(String(mapped.id),String(removed.id),'Removed central ID is not falsely reused');
            assert.ok((await db.query('select * from dcf_financial_lineage where entity_type=$1 and parent_id=1 and historical_id=$2',[d.table,String(removed.id)])).rows.length);
            const undone=await restore(d,(await versions(db,d.table,1)).at(-1).id,{undo:true});
            assert.equal(stage(undone,d).length,stage(after,d).length);assert.deepEqual(undone.financial.disbursements,after.financial.disbursements);
        });
    }

    for(const d of pmDomains.slice(0,2)){
        await test(`${d.table}: full Physical ACF date correction uses real transactional adapter`,async()=>{
            const base=await state(db,d.table,1),n=(await versions(db,d.table,1)).length;
            await open('physical',d.table);await page.getByLabel('Search physical items by title',{exact:true}).fill(base.record[d.label]);
            const name=d.type==='staffing_requirement'?`${base.record[d.label]} (${base.record.operatingUnit})`:base.record[d.label];
            const input=page.getByLabel(`Actual date for ${name}`,{exact:true});
            await input.fill('2026-11-04');
            const callbacks=await page.evaluate(()=>window.fixture.confirmations.length);
            await page.getByRole('button',{name:'Save All Changes',exact:true}).click();await page.getByRole('button',{name:'Confirm Save',exact:true}).click();
            await page.waitForFunction(n=>window.fixture.confirmations.length===n+1,callbacks);
            const after=await state(db,d.table,1);assert.equal(after.record.actualObligationDate,'2026-11-04');
            assert.deepEqual(after.financial,base.financial);assert.equal((await versions(db,d.table,1)).length,n+1);
            assert.equal((await versions(db,d.table,1)).at(-1).physical_changed,true);
            for(const width of [1440,820,390]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(f.artifacts,`${d.type}-physical-${width}.png`),fullPage:true});}
            await page.setViewportSize({width:1440,height:1000});
        });
    }
    await test('Program Management current module permission revocation denies cached version reads',async()=>{
        const d=pmDomains[0],user={id:3,password:'fixture-password',role:'User',operatingUnit:'RFO I'};
        await page.evaluate(user=>window.changeSession(user),user);
        await open('history',d.table);await page.getByRole('button',{name:'History',exact:true}).click();await page.getByTitle('View version',{exact:true}).first().click();
        await page.getByRole('dialog').getByRole('heading',{name:'Requirement Details',exact:true}).waitFor();await page.keyboard.press('Escape');
        await db.exec(`update roles_config set can_view=false where role='User' and module='Program Management'`);
        try{
            await page.evaluate(user=>window.changeSession({...user,permissions_override:{changed:true}}),user);
            await page.getByRole('button',{name:'History',exact:true}).click();await page.getByRole('alert').filter({hasText:/permission|denied|view/i}).waitFor();
            assert.equal(await page.getByTitle('View version',{exact:true}).count(),0);
        }finally{await db.exec(`update roles_config set can_view=true where role='User' and module='Program Management'`);await page.evaluate(actor=>window.changeSession(actor),actor);}
    });
    await test('No external requests, writing setters or unhandled errors',async()=>{assert.deepEqual(f.external,[]);assert.deepEqual(f.errors,[]);});
}finally{await f.close();}
finish(f);
