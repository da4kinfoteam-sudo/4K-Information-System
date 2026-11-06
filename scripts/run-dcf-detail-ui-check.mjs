import assert from 'node:assert/strict';
import { appHarness, createHttpFixture, state, sqlRpc, identity, versions, finish } from './helpers/dcf-revision-http-fixture.mjs';
import { domains } from './helpers/dcf-revision-fixture.mjs';

const imports=`import OfficeDetail from './components/program_management/OfficeRequirementDetail';import StaffingDetail from './components/program_management/StaffingRequirementDetail';import OtherDetail from './components/program_management/OtherExpenseDetail';\n`;
const marker="mode==='physical'?";
assert(appHarness.includes(marker));
const harness=imports+appHarness.replace(marker,`mode==='details'&&target?React.createElement({office_requirements:OfficeDetail,staffing_requirements:StaffingDetail,other_program_expenses:OtherDetail}[target.type],{item:(records[target.type]||[]).find(row=>row.id===target.id),uacsCodes:{MOOE:{Travel:{'502':'Travel expenses'}}},fundSources:[{uid:'FS-000001',label:'4K Fund',is_active:true}],onUpdate:saved(target.type)}):${marker}`)
    .replace('window.localRecord=table=>records[table];','window.rerenderPermissionFixtures=()=>setRecords(old=>({...old}));window.localRecord=table=>records[table];');
const auth=`export const useAuth=()=>({currentUser:window.session,rolesConfigs:window.fixtureRoles||[],hasAccess:(module,action)=>!!window.session&&!window.fixtureDeniedModules?.includes(module)&&(action==='view'||window.session.role!=='Guest'),getVisibilityScope:()=>window.session?.role==='Super Admin'?'All':'Own OU'});`;
const f=await createHttpFixture({harness,auth,name:'detail-ui'}),{db,page,test}=f;
const open=async type=>{
    const pending=page.waitForResponse(response=>response.url().endsWith('/rpc')&&response.request().postDataJSON()?.name==='read_dcf_state'&&response.request().postDataJSON()?.args?.p_entity_type===type);
    await page.evaluate(async type=>window.openFixture('details',type,1),type);await pending;
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
};
try{
    for(const d of domains.slice(2))await test(`${d.table}: real detail form forwards override reason and confirms a single save`,async()=>{
        await db.exec(`update ${d.table} set "actualAmount"=77 where id=1`);
        let base=await state(db,d.table,1);
        base=await sqlRpc(db,'commit_dcf_change',{...identity(d.table,1),p_base:base,p_changes:{uacsCode:'502',obligationDate:'2026-10-01',disbursementDate:'2026-11-01',physicalDeliveryDate:'2026-10-01'},p_financial:[],p_reason:'Prepare valid synthetic detail fields',p_source:'detail-ui-seed',p_request_key:crypto.randomUUID()});
        const before=await versions(db,d.table,1),financial=structuredClone(base.financial),count=await page.evaluate(()=>window.fixture.confirmations.length);
        await open(d.table);await page.getByRole('button',{name:'Edit Details',exact:true}).click();
        const field=d.table==='other_program_expenses'?'amount':d.label;
        await page.locator(`[name="${field}"]`).fill(field==='amount'?'115':`Updated ${d.type} from real form`);
        f.control.delay='commit_dcf_change';
        const requests=f.calls.filter(call=>call.name==='commit_dcf_change').length;
        try{
            const button=page.getByRole('button',{name:d.table==='office_requirements'?'Save Details':d.table==='staffing_requirements'?'Save Changes':'Save',exact:true});
            await button.evaluate(button=>{button.form.requestSubmit(button);button.form.requestSubmit(button)});
            await page.waitForFunction(n=>window.fixture.confirmations.length>=n+1,count);await page.waitForLoadState('networkidle');
        }finally{f.control.delay=null;}
        const saved=await state(db,d.table,1);assert.equal(saved.record[field],field==='amount'?115:`Updated ${d.type} from real form`);
        assert.deepEqual(saved.financial,financial,'Metadata/target edit must not alter reported actual ledgers');
        assert.equal(saved.record.actualAmount,77,'A form-normalized zero must not erase the saved legacy summary');
        const after=await versions(db,d.table,1);assert.equal(after.length,before.length+1);assert.equal(after.at(-1).reason,'Disposable fixture correction');
        assert.equal((await page.evaluate(()=>window.fixture.confirmations.length)),count+1);
        assert.equal(f.calls.filter(call=>call.name==='commit_dcf_change').length,requests+1,'Same-tick submission is claimed before the first await');
    });
    await test('real detail History drops an open cached version when role permissions change without replacing the record',async()=>{
        await page.evaluate(()=>window.changeSession({id:3,password:'fixture-password',role:'User',fullName:'Fixture Editor',operatingUnit:'RFO I'}));
        await open('office_requirements');await page.locator('.dcf-revision-history__toggle').click();
        await page.getByTitle('View version',{exact:true}).first().click();await page.getByRole('dialog').getByRole('heading',{name:'Requirement Details',exact:true}).waitFor();
        await page.evaluate(()=>{window.fixtureRoles=[{role:'User',module:'Program Management',can_view:false}];window.fixtureDeniedModules=['Program Management'];window.rerenderPermissionFixtures()});
        await page.getByRole('dialog').waitFor({state:'hidden'});
        await page.locator('.dcf-revision-history__toggle').click();
        await page.getByRole('alert').filter({hasText:'current access scope'}).waitFor();
        assert.equal(await page.getByTitle('View version',{exact:true}).count(),0);
    });
    await test('no external requests, direct parent writes or runtime errors',async()=>{assert.deepEqual(f.external,[]);assert.deepEqual(f.errors,[]);});
}finally{await f.close();}
finish(f);
