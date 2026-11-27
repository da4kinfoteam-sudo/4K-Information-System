import assert from 'node:assert/strict';
import {createHttpFixture,harnessImports,policyModule,finish} from './helpers/dcf-revision-http-fixture.mjs';
import {domains,insertParent,fingerprints} from './helpers/dcf-revision-fixture.mjs';
const harness=`${harnessImports}
import {OfficeRequirementsTab} from './components/program_management/OfficeRequirementsTab';
import {StaffingRequirementsTab} from './components/program_management/StaffingRequirementsTab';
import {OtherExpensesTab} from './components/program_management/OtherExpensesTab';
function Harness(){const[records,setRecords]=useState({}),[type,setType]=useState(null),[epoch,setEpoch]=useState(0);
window.openDeleteModule=async next=>{const rows=await fetch('/records').then(r=>r.json());setRecords(rows);setType(next);setEpoch(n=>n+1)};
window.visibleRows=()=>records[type]||[];
const Component={office_requirements:OfficeRequirementsTab,staffing_requirements:StaffingRequirementsTab,other_program_expenses:OtherExpensesTab}[type];
return <main style={{padding:16}} key={epoch}>{Component&&<Component items={records[type]||[]} setItems={update=>setRecords(old=>({...old,[type]:typeof update==='function'?update(old[type]||[]):update}))} fundSources={[{uid:'FS-000001',label:'4K Fund',is_active:true}]} uacsCodes={{MOOE:{Travel:{'502':'Travel'}}}} onSelect={()=>{}}/>}</main>}
createRoot(document.getElementById('root')).render(<Harness/>);`;
const f=await createHttpFixture({harness,name:'pm-delete-ui',componentMocks:{'hooks/useDcfPolicyGuard':policyModule.replace('getMonthDecision:',"getDeleteDecision:()=>({allowed:window.allowDelete!==false}),getMonthDecision:")}});
const {page,db,test}=f,alerts=[];
// Match PostgREST JSON date/number serialization, not the fixture driver's JS Date objects.
await page.route('**/records',async route=>{
    const records={};for(const type of types)records[type]=(await db.query(`select to_jsonb(t) value from ${type} t order by id`)).rows.map(row=>row.value);
    await route.fulfill({json:records});
});
page.removeAllListeners('dialog');page.on('dialog',async dialog=>{alerts.push(dialog.message());await dialog.accept();});
const types=['other_program_expenses','office_requirements','staffing_requirements'];
const open=async(type,ids)=>{
    await page.evaluate(async type=>window.openDeleteModule(type),type);
    await page.getByRole('button',{name:/Delete multiple/}).click();
    for(const id of ids){const row=(await db.query(`select uid from ${type} where id=$1`,[id])).rows[0];await page.getByRole('checkbox',{name:'Select '+row.uid,exact:true}).check();}
    await page.getByRole('region',{name:'delete selection mode'}).getByRole('button',{name:`Delete (${ids.length})`,exact:true}).click();
    return page.getByRole('alertdialog');
};
let release;
const holdDeletes=async()=>{
    let received;const started=new Promise(resolve=>received=resolve),gate=new Promise(resolve=>release=resolve);
    await page.route('**/rpc',async route=>{if(route.request().postDataJSON()?.name!=='delete_dcf_record')return route.continue();const response=await route.fetch();received();await gate;await route.fulfill({response});});
    return {started};
};
try{
        for(const type of types)await test(`${type}: repeated confirm is blocked until one confirmed deletion completes`,async()=>{
            const before=alerts.length,dialog=await open(type,[1]);
            const {started}=await holdDeletes();
            await dialog.getByRole('button',{name:'Delete',exact:true}).evaluate(button=>{button.click();button.click();});
            await started;
            assert.equal(await dialog.getAttribute('aria-busy'),'true');
            assert.equal(await dialog.getByRole('button',{name:'Processing...',exact:true}).isDisabled(),true);
            assert.equal(await dialog.getByRole('button',{name:'Cancel',exact:true}).isDisabled(),true);
            await page.keyboard.press('Escape');assert.equal(await dialog.count(),1);
            await page.keyboard.press('Tab');assert.equal(await dialog.evaluate(node=>document.activeElement===node),true);
            await page.locator('.modal-backdrop').click({position:{x:2,y:2},force:true});assert.equal(await dialog.count(),1);
            assert.equal(await page.evaluate(()=>window.visibleRows().some(row=>row.id===1)),true,'Local state must await database confirmation');
            assert.equal(f.calls.filter(call=>call.name==='delete_dcf_record'&&call.entity===type).length,1);
            await page.screenshot({path:f.artifacts+'/'+type+'-pending.png'});
            release();await dialog.waitFor({state:'detached'});await page.unroute('**/rpc');
            assert.equal(alerts.length,before,'No misleading save-in-progress error');
            assert.equal((await db.query(`select count(*)::int n from ${type} where id=1`)).rows[0].n,0);
            assert.equal(await page.evaluate(()=>window.visibleRows().some(row=>row.id===1)),false);
            assert.equal((await db.query('select count(*)::int n from dcf_revision_heads where entity_type=$1 and parent_id=1 and deleted',[type])).rows[0].n,1);
        });
        const seed=async(type,extra={})=>insertParent(db,domains.find(domain=>domain.table===type),{fundYear:2026,...extra});
        for(const type of types)await test(`${type}: rejected deletion preserves the record and reported actuals, then allows retry`,async()=>{
            const row=await seed(type),dialog=await open(type,[row.id]);
            await db.query(`update ${type} set "encodedBy"='Another confirmed edit' where id=$1`,[row.id]);
            const before=await fingerprints(db),alert=page.waitForEvent('dialog');
            await dialog.getByRole('button',{name:'Delete',exact:true}).click();await alert;
            assert.match(alerts.at(-1),/record changed/i);
            assert.equal(await dialog.getByRole('button',{name:'Delete',exact:true}).isEnabled(),true);
            assert.deepEqual(await fingerprints(db),before,'A rejected delete must not change any persisted record');
            await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
            const retry=await open(type,[row.id]);await retry.getByRole('button',{name:'Delete',exact:true}).click();await retry.waitFor({state:'detached'});
            assert.equal((await db.query(`select count(*)::int n from ${type} where id=$1`,[row.id])).rows[0].n,0);
        });
        for(const type of types)await test(`${type}: lost delete response retries the original receipt without a duplicate archive`,async()=>{
            const row=await seed(type),dialog=await open(type,[row.id]),before=f.calls.length;
            f.control.loseResponse='delete_dcf_record';const alert=page.waitForEvent('dialog');
            await dialog.getByRole('button',{name:'Delete',exact:true}).click();await alert;
            assert.equal(await page.evaluate(id=>window.visibleRows().some(row=>row.id===id),row.id),true);
            const head=(await db.query('select latest_revision_id from dcf_revision_heads where entity_type=$1 and parent_id=$2',[type,row.id])).rows[0];
            await dialog.getByRole('button',{name:'Delete',exact:true}).click();await dialog.waitFor({state:'detached'});
            const calls=f.calls.slice(before).filter(call=>call.name==='delete_dcf_record');assert.equal(calls.length,2);assert.equal(calls[0].key,calls[1].key);
            assert.equal((await db.query('select latest_revision_id from dcf_revision_heads where entity_type=$1 and parent_id=$2',[type,row.id])).rows[0].latest_revision_id,head.latest_revision_id);
        });
        await test('Other Expenses bulk deletion confirms each selected record once and preserves unrelated financials',async()=>{
            const a=await seed(types[0]),b=await seed(types[0]),before=await fingerprints(db,['financial_obligations','financial_disbursements']);
            const start=f.calls.length,dialog=await open(types[0],[a.id,b.id]);
            await dialog.getByRole('button',{name:'Delete',exact:true}).click();await dialog.waitFor({state:'detached'});
            assert.equal(f.calls.slice(start).filter(call=>call.name==='delete_dcf_record'&&call.ok).length,2);
            assert.deepEqual(await fingerprints(db,['financial_obligations','financial_disbursements']),before);
        });
        await test('Cancel and a denied delete policy produce no delete requests or data changes',async()=>{
            const row=await seed(types[0]),before=await fingerprints(db),start=f.calls.length;
            let dialog=await open(types[0],[row.id]);await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
            assert.deepEqual(await fingerprints(db),before);
            dialog=await open(types[0],[row.id]);await page.evaluate(()=>window.allowDelete=false);
            const alert=page.waitForEvent('dialog');await dialog.getByRole('button',{name:'Delete',exact:true}).click();await alert;
            assert.match(alerts.at(-1),/None of the selected/i);assert.equal(f.calls.slice(start).filter(call=>call.name==='delete_dcf_record').length,0);
            assert.deepEqual(await fingerprints(db),before);await page.evaluate(()=>window.allowDelete=true);
        });
        await test('no external requests, direct parent writes or runtime errors',async()=>{assert.deepEqual(f.external,[]);assert.deepEqual(f.errors,[]);});
}finally{release?.();await f.close();}
finish(f);
