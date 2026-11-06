import assert from 'node:assert/strict';
import path from 'node:path';
import { createHttpFixture, state, history, versions, identity, sqlRpc, browserCall, confirmed, assertRollback, assertFinancialRestored, finish } from './helpers/dcf-revision-http-fixture.mjs';
import { plannedLine, fingerprints } from './helpers/dcf-revision-fixture.mjs';

const f=await createHttpFixture();
const {db,page,test}=f;
const actor={id:1,password:'fixture-password',role:'Super Admin',fullName:'Fixture Admin',operatingUnit:'NPMO'};
const open=async(mode,type,id)=>page.evaluate(({mode,type,id})=>window.openFixture(mode,type,id),{mode,type,id});
const rows=async(type,id)=>versions(db,type,id);
const commit=async(type,id,changes,base)=>confirmed(await browserCall(page,'persistDcfMutation',[{entityType:type,parentId:id,base:base||await state(db,type,id),changes,actor,source:'details',reason:'Disposable correction'}]));
const closeModal=async()=>{if(await page.getByRole('dialog').count())await page.keyboard.press('Escape');};
async function showRevision(type,id,rid){
    await open('history',type,id);await page.getByRole('button',{name:'History',exact:true}).click();
    const metadata=await history(db,type,id),index=metadata.rows.findIndex(row=>Number(row.id)===Number(rid));
    assert.ok(index>=0,'Requested version must exist in the real SQL metadata');
    await page.getByTitle('View version',{exact:true}).nth(index).click();
    await page.getByRole('dialog').getByRole('heading',{name:type==='activities'?'Activity Details':type==='subprojects'?'Project Details':'Requirement Details',exact:true}).waitFor();
}
async function previewRestore(){await page.getByRole('button',{name:'Restore this version',exact:true}).click();await page.getByLabel('Reason for restoration',{exact:true}).waitFor();}
async function acknowledge(reason='Disposable correction'){
    const label=page.getByLabel(/Reason for (restoration|undoing restore)/);await label.fill(reason);
    const checkbox=page.getByLabel('I acknowledge the changes to reported physical and financial actuals.');if(await checkbox.count())await checkbox.check();
}
const confirmRestore=()=>page.getByRole('button',{name:'Confirm Restore',exact:true});
let financialRestoreRevision;

try {
    for(const type of ['activities','subprojects']){
        await test(`${type}: browser real create adapter, two saves, immutable versions and no-op`,async()=>{
            const label=`Created ${type}`,line=plannedLine(31);delete line.obligations;delete line.actualObligationAmount;delete line.actualObligationDate;
            const changes={uid:`BROWSER-${type}`,name:label,operatingUnit:'RFO I',fundType:'Current',tier:'Tier 1',
                fundSourceUid:'FS-000001',fundSource:'4K Fund',[type==='activities'?'expenses':'details']:[line],
                ...(type==='activities'?{type:'Activity',reference_activity_id:1,fundingYear:2026}:{fundingYear:2026,ipo_id:1,indigenousPeopleOrganization:'Frozen IPO Label'})};
            const created=confirmed(await browserCall(page,'persistDcfMutation',[{entityType:type,changes,actor,source:type==='activities'?'activity-create':'subproject-create'}]));
            assert.equal((await rows(type,created.record.id)).length,1,'Creation is one revision');
            assert.equal(created.record.encodedBy,'Fixture Admin');
            const original=structuredClone(created.record);
            let saved=await commit(type,created.record.id,{name:label+' B'});
            saved=await commit(type,created.record.id,{name:label+' C'});
            assert.equal((await rows(type,created.record.id)).length,3);
            const immutable=(await rows(type,created.record.id))[0];
            assert.equal(immutable.snapshot.record.name,label);
            const adapter=type==='activities'?'persistActivityDraft':'persistSubprojectDraft';
            const draft=structuredClone(saved.record),field=type==='activities'?'expenses':'details';draft[field][0].amount=120;
            if(type==='subprojects')draft[field][0].pricePerUnit=60;
            const args=type==='activities'?[saved.record,draft,'expenses',actor,{source:'activity-edit-expenses',reason:'Disposable correction'}]:[saved.record,draft,'budget','Proposed',actor,{reason:'Disposable correction'}];
            confirmed(await browserCall(page,adapter,args));
            const before=(await rows(type,created.record.id)).length;
            await commit(type,created.record.id,{});assert.equal((await rows(type,created.record.id)).length,before);
            assert.deepEqual((await rows(type,created.record.id))[0],immutable);
            assert.equal(original.name,label,'Draft save must not mutate source');
        });
    }

    for(const type of ['activities','subprojects']){
        await test(`${type}: Financial ACF real stage saves twice, central identities and single callback`,async()=>{
            const before=await state(db,type,1),other=structuredClone(before.financial.disbursements),initial=(await rows(type,1)).length;
            await open('financial',type,1);
            const name=before.record.name;
            await page.getByLabel('Search particulars, UACS code, or parent item',{exact:true}).fill(name);
            for(const amount of ['24.50','31.75']){
                const callbackBefore=await page.evaluate(()=>window.fixture.confirmations.length);
                await page.getByRole('button',{name:`Manage actual obligations for ${name}`,exact:true}).click();
                const dialog=page.getByRole('dialog',{name:'Manage Actual Obligations',exact:true});
                await dialog.locator('input[aria-label$="obligation 1 amount"]').fill(amount);
                await dialog.getByRole('button',{name:'Save Changes',exact:true}).dblclick();
                await page.waitForFunction(n=>window.fixture.confirmations.length===n+1,callbackBefore);
                await dialog.waitFor({state:'hidden'});
                const current=await state(db,type,1);
                assert.deepEqual(current.financial.disbursements,other,'The other stage is byte-for-byte unchanged');
                assert.deepEqual(current.financial.obligations.map(r=>r.id),before.financial.obligations.map(r=>r.id));
                assert.equal(Number(current.financial.obligations[0].amount),Number(amount));
                assert.equal(Number(current.financial.obligations[1].amount),12.34,'Independent duplicate-looking entry survives');
                const local=await page.evaluate(type=>window.localRecord(type).find(r=>r.id===1),type);
                const hydrated=await page.evaluate(async({type,actor})=>{
                    const activity=type==='activities',read=activity?'readActivityAccomplishments':'readSubprojectAccomplishments',hydrate=activity?'hydrateActivityAccomplishment':'hydrateSubprojectAccomplishment';
                    return window.api[hydrate]((await window.api[read]([1],actor,'financial'))[0]);
                },{type,actor});
                assert.deepEqual(local,hydrated,'Authoritative hydrated confirmation reconciles local parent once');
            }
            assert.equal((await rows(type,1)).length,initial+3,'First write captures opening baseline plus two saved versions');
        });
    }

    await test('Activity Physical ACF uses real adapter and preserves both financial stages',async()=>{
        const before=await state(db,'activities',1),n=(await rows('activities',1)).length;
        await open('physical','activities',1);
        await page.getByLabel('Search physical items by title',{exact:true}).fill(before.record.name);
        await page.getByLabel(`Actual male participants for ${before.record.name}`,{exact:true}).fill('3');
        await page.getByLabel(`Actual female participants for ${before.record.name}`,{exact:true}).fill('2');
        const count=await page.evaluate(()=>window.fixture.confirmations.length);
        await page.getByRole('button',{name:'Save All Changes',exact:true}).click();
        await page.getByRole('button',{name:'Confirm Save',exact:true}).click();
        await page.waitForFunction(n=>window.fixture.confirmations.length===n+1,count);
        const after=await state(db,'activities',1);
        assert.equal(Number(after.record.actualParticipantsMale),3);assert.equal(Number(after.record.actualParticipantsFemale),2);
        assert.deepEqual(after.financial,before.financial);
        assert.equal((await rows('activities',1)).length,n+1);
    });

    await test('Subproject Physical ACF quantity/date save captures physical state once without financial writes',async()=>{
        const before=await state(db,'subprojects',1),n=(await rows('subprojects',1)).length;
        await open('physical','subprojects',1);
        await page.getByLabel('Search physical items by title',{exact:true}).fill(before.record.name);
        const line=before.record.details[0],callbacks=await page.evaluate(()=>window.fixture.confirmations.length);
        await page.getByLabel(`Actual units for ${line.particulars}`,{exact:true}).fill('1');
        await page.getByLabel(`Actual date for ${line.particulars}`,{exact:true}).fill('2026-11-04');
        await page.getByRole('button',{name:'Save All Changes',exact:true}).click();await page.getByRole('button',{name:'Confirm Save',exact:true}).click();
        await page.waitForFunction(n=>window.fixture.confirmations.length===n+1,callbacks);
        const after=await state(db,'subprojects',1);assert.equal(after.record.details[0].actualDeliveryDate,'2026-11-04');assert.equal(after.record.details[0].actualNumberOfUnits,1);
        assert.deepEqual(after.financial,before.financial);assert.equal((await rows('subprojects',1)).length,n+1);
        assert.equal((await rows('subprojects',1)).at(-1).physical_changed,true);
    });

    await test('Historical modal freezes old values; preview/cancel and all responsive sizes write nothing',async()=>{
        const revs=await rows('activities',1),old=revs[0],before=await fingerprints(db);
        await showRevision('activities',1,old.id);
        assert.match(await page.getByRole('dialog').innerText(),new RegExp(old.snapshot.record.name));
        assert.equal(await page.getByRole('dialog').locator('input,textarea').count(),0);
        for(const width of [1440,820,390]){
            await page.setViewportSize({width,height:1000});
            assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Page overflow ${width}`);
            assert.ok(await page.getByRole('dialog').evaluate(node=>{const r=node.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1;}),`Modal bounds ${width}`);
            await page.screenshot({path:path.join(f.artifacts,`historical-${width}.png`),fullPage:true});
        }
        await page.setViewportSize({width:1440,height:1000});
        await previewRestore();await acknowledge();await page.getByRole('button',{name:'Cancel',exact:true}).click();await closeModal();
        assert.deepEqual(await fingerprints(db),before,'Opening, viewing, preview and cancellation cause zero database writes');
    });

    await test('Server rejects missing financial acknowledgement and rolls back after history failure',async()=>{
        // Use a version captured after the separate Physical ACF evidence change.
        // Rewinding that evidence is intentionally a blocked independent workflow;
        // this case exercises an eligible financial-only restoration instead.
        const type='subprojects';
        let current=await state(db,type,1);
        const itemId=current.record.details[0].id;
        for(const amount of [41,53]){
            const entry=current.financial.stages[itemId].obligation.entries[0];
            current=await sqlRpc(db,'commit_dcf_change',{...identity(type,1),p_base:current,p_changes:{},p_financial:[{itemId:String(itemId),stage:'obligation',operations:[{action:'update',id:entry.id,expected:entry,value:{...entry,amount}}]}],p_source:'financial-acf',p_reason:'Disposable financial correction',p_request_key:crypto.randomUUID()});
            if(amount===41)financialRestoreRevision=current.revisionId;
        }
        const old=(await rows(type,1)).find(row=>row.id===financialRestoreRevision);
        const preview=await sqlRpc(db,'preview_dcf_restore',{...identity(type,1),p_revision_id:old.id});
        assert.equal(preview.requiresActualsAcknowledgement,true);
        const params={...identity(type,1),p_revision_id:old.id,p_expected_revision_id:preview.currentRevisionId,p_expected_hash:preview.currentHash,
            p_reason:'Fixture correction',p_acknowledged_actuals:false,p_request_key:crypto.randomUUID()};
        await assertRollback(db,async()=>{
            const result=await page.evaluate(params=>fetch('/rpc',{method:'POST',body:JSON.stringify({name:'apply_dcf_restore',args:params})}).then(r=>r.json()),params);
            assert.match(result.error?.message||'',/confirm.*actuals|acknowledge/i);
        });
        await db.exec(`create function fixture_fail_restore() returns trigger language plpgsql as $$ begin raise exception 'fixture history failure'; end $$;
          create trigger fixture_fail_restore before insert on dcf_restore_operations for each row execute function fixture_fail_restore();`);
        try{
            await showRevision(type,1,old.id);await previewRestore();await acknowledge();
            await assertRollback(db,async()=>{await confirmRestore().click();await page.getByRole('alert').filter({hasText:'fixture history failure'}).waitFor();});
        }finally{await closeModal();await db.exec('drop trigger fixture_fail_restore on dcf_restore_operations; drop function fixture_fail_restore();');}
    });

    await test('Real financial restore, lost-response retry, refresh-safe undo, callback failure never replays write',async()=>{
        const type='subprojects',before=await state(db,type,1),old=(await rows(type,1)).find(row=>row.id===financialRestoreRevision),n=(await rows(type,1)).length;
        await showRevision(type,1,old.id);await previewRestore();await acknowledge();
        const callbacks=await page.evaluate(()=>window.fixture.confirmations.length);
        f.control.loseResponse='apply_dcf_restore';
        await confirmRestore().click();await page.getByRole('alert').filter({hasText:/fetch|JSON|Unexpected/i}).waitFor();
        assert.equal((await rows(type,1)).length,n+1,'Response loss is after a real committed SQL transaction');
        await confirmRestore().dblclick();await page.waitForFunction(n=>window.fixture.confirmations.length===n+1,callbacks);
        assert.equal((await rows(type,1)).length,n+1,'Same-key retry creates no extra version');
        const applies=f.calls.filter(c=>c.name==='apply_dcf_restore'&&c.ok).slice(-2);assert.equal(applies[0].key,applies[1].key);
        const restored=await state(db,type,1);assertFinancialRestored(restored.financial,old.snapshot.financial);
        assert.deepEqual(restored.financial.disbursements,before.financial.disbursements);
        await page.reload();await page.waitForFunction(()=>!!window.api);
        const latest=(await rows(type,1)).at(-1);await showRevision(type,1,latest.id);
        await page.getByRole('button',{name:'Undo Restore',exact:true}).click();await page.getByLabel('Reason for undoing restore',{exact:true}).waitFor();
        await acknowledge('Undo after full browser refresh');await page.evaluate(()=>{window.fixture.callbackFailure=true;});
        await page.getByRole('button',{name:'Confirm Undo Restore',exact:true}).dblclick();
        await page.getByRole('status').filter({hasText:'local view could not refresh'}).waitFor();
        const undone=await state(db,type,1);assertFinancialRestored(undone.financial,before.financial);
        assert.deepEqual(undone.financial.disbursements,before.financial.disbursements);
        assert.equal((await rows(type,1)).length,n+2);assert.equal(await page.getByRole('dialog').count(),0);
        assert.equal(await page.evaluate(()=>window.fixture.confirmations.length),1,'Undo callback runs once even if callback throws');
        await page.evaluate(()=>{window.fixture.callbackFailure=false;});
    });

    await test('Child-only intervening write blocks stale restore with complete rollback',async()=>{
        const type='activities',old=(await rows(type,1))[0];
        await showRevision(type,1,old.id);await previewRestore();await acknowledge();
        await db.query(`update financial_obligations set amount=amount+1 where entity_type='activity_expense' and parent_id=1`);
        await assertRollback(db,async()=>{await confirmRestore().click();await page.getByRole('alert').filter({hasText:/changed|stale/i}).waitFor();});
        await closeModal();
    });

    await test('Current OU/role and session changes deny access and clear a previously open snapshot',async()=>{
        const type='activities',old=(await rows(type,1))[0];
        await showRevision(type,1,old.id);
        await page.evaluate(()=>window.changeSession({id:5,password:'fixture-password',role:'User',fullName:'Other OU',operatingUnit:'RFO II'}));
        assert.equal(await page.getByRole('dialog').count(),0);
        await page.getByRole('button',{name:'History',exact:true}).click();await page.getByRole('alert').filter({hasText:/permission|scope|unavailable/i}).waitFor();
        assert.equal(await page.getByTitle('View version',{exact:true}).count(),0);
        await page.evaluate(()=>window.changeSession({id:4,password:'fixture-password',role:'Guest',fullName:'Guest',operatingUnit:'RFO I'}));
        await page.getByRole('button',{name:'History',exact:true}).click();await page.getByTitle('View version',{exact:true}).first().click();
        await page.getByRole('dialog').getByRole('heading',{name:'Activity Details',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Restore this version',exact:true}).count(),0);
        const before=await fingerprints(db);
        const denied=await browserCall(page,'persistDcfMutation',[{entityType:type,parentId:1,base:await state(db,type,1),changes:{name:'Guest overwrite'},actor:{id:4,password:'fixture-password'},source:'details'}]);
        assert.match(denied.error,/guest|permission|denied|allowed/i);assert.deepEqual(await fingerprints(db),before);
        await page.evaluate(actor=>window.changeSession(actor),actor);
    });

    await test('In-flight snapshot completion is discarded after account change',async()=>{
        await open('history','activities',1);await page.getByRole('button',{name:'History',exact:true}).click();
        await page.getByTitle('View version',{exact:true}).first().waitFor();
        f.control.delay='read_dcf_revision';
        try{
            const pending=page.waitForResponse(response=>response.url().endsWith('/rpc')&&response.request().postDataJSON()?.name==='read_dcf_revision');
            await page.getByTitle('View version',{exact:true}).first().click();
            await page.evaluate(()=>window.changeSession(null));await pending;
            assert.equal(await page.getByRole('dialog').count(),0);
            await page.getByRole('button',{name:'History',exact:true}).click();await page.getByRole('alert').filter({hasText:'current access scope'}).waitFor();
            assert.equal(await page.getByTitle('View version',{exact:true}).count(),0);
        }finally{f.control.delay=null;await page.evaluate(actor=>window.changeSession(actor),actor);}
    });
    await test('No external transport, direct setters or unhandled runtime errors',async()=>{assert.deepEqual(f.external,[]);assert.deepEqual(f.errors,[]);assert.ok(f.calls.some(c=>c.name==='save_activity_accomplishment'));assert.ok(f.calls.some(c=>c.name==='save_subproject_accomplishment'));});
}finally{await f.close();}
finish(f);
