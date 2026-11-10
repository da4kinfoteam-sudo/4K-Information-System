import assert from 'node:assert/strict';
import { createHttpFixture, harnessImports, state, sqlRpc, identity, versions, finish, policyModule } from './helpers/dcf-revision-http-fixture.mjs';
import { domains } from './helpers/dcf-revision-fixture.mjs';
const harness = `${harnessImports}
import ActivityEdit from './components/ActivityEdit';import SubprojectEdit from './components/SubprojectEdit';import SubprojectDetail from './components/SubprojectDetail';
import OfficeDetail from './components/program_management/OfficeRequirementDetail';import StaffingDetail from './components/program_management/StaffingRequirementDetail';import OtherDetail from './components/program_management/OtherExpenseDetail';
import{OfficeRequirementsTab}from'./components/program_management/OfficeRequirementsTab';import{StaffingRequirementsTab}from'./components/program_management/StaffingRequirementsTab';import{OtherExpensesTab}from'./components/program_management/OtherExpensesTab';
import{BudgetItemTransferDialog}from'./components/ui/BudgetItemTransferDialog';import{philippineRegions}from'./constants';
const fs=[{uid:'FS-000001',label:'4K Fund',is_active:true}],uacs={MOOE:{Travel:{'502':'Travel expenses'}}},ipos=[{id:1,name:'Fixture IPO',region:philippineRegions[0],location:'Fixture'}];
function Harness(){const[target,setTarget]=useState(null),[records,setRecords]=useState({}),[epoch,setEpoch]=useState(0);
window.openYearFlow=async(type,mode,patch={})=>{const all=await fetch('/records').then(r=>r.json());const row={...(all[type]||[]).find(row=>row.id===1),...patch};setRecords(all);setTarget({type,mode,row});setEpoch(n=>n+1)};
const saved=row=>{window.fixture.confirmations.push(row);setTarget(old=>({...old,row}))};
if(!target)return <div>Choose sample</div>;const{type,mode,row}=target;
const common={uacsCodes:uacs,fundSources:fs,onBack:noop,ipos,setIpos:noop,particularTypes:{Equipment:['Equipment']},commodityCategories:[],refCommodities:[],refLivestock:[],commodityOptions:[],livestockOptions:[]};
const pm={office_requirements:[OfficeRequirementsTab,OfficeDetail],staffing_requirements:[StaffingRequirementsTab,StaffingDetail],other_program_expenses:[OtherExpensesTab,OtherDetail]}[type];
return <main style={{padding:16,minWidth:0}} key={epoch}><h2 data-testid="flow">{type+' '+mode+' '+epoch}</h2>{mode==='transfer'?<BudgetItemTransferDialog sourceType={type==='activities'?'activity':'subproject'} source={row} selectedLines={[(row.expenses||row.details)[0]]} ipos={ipos} fundSources={fs} currentUser={window.session} canChangeOperatingUnit onClose={noop} onComplete={noop}/>:pm?mode==='create'?React.createElement(pm[0],{items:records[type]||[],setItems:unexpected,onSelect:noop,...common}):React.createElement(pm[1],{item:row,onUpdate:saved,...common}):type==='activities'?<ActivityEdit {...common} mode={mode==='create'?'create':mode==='actual'?'accomplishment':'details'} activity={mode==='create'?undefined:row} referenceActivities={[{id:1,activity_name:'Subproject Monitoring',component:'Social Preparation',type:'Activity'}]} onUpdateActivity={saved}/>:mode==='detail'?<SubprojectDetail {...common} subproject={row} onUpdateSubproject={saved} setSubprojects={unexpected}/>:<SubprojectEdit {...common} subproject={mode==='create'?undefined:row} onUpdateSubproject={saved}/>}</main>}
createRoot(document.getElementById('root')).render(<Harness/>);`;
const f = await createHttpFixture({ harness, name: 'fund-year-flows', componentMocks: {
    'hooks/useDcfPolicyGuard': policyModule.replace("getMonthDecision:", "getDeleteDecision:()=>({allowed:false}),getMonthDecision:"),
    LocationPicker: `import React from'react';export default function LocationPicker(){return React.createElement('div')};export const parseLocation=()=>({});`,
    'hooks/useIpoHistory': 'export const useIpoHistory=()=>({addIpoHistory:async()=>{}});',
    'lib/financialObligationSync': 'export const fetchFinancialObligationsForParent=async()=>[];export const replaceFinancialObligationRecords=async()=>{};',
    'lib/googleDriveStorage': `export const getGoogleDriveStatus=async()=>({connected:false});export const listSubprojectDriveFiles=async()=>[];export const formatFileSize=()=>'';export const getDriveFileDisplayName=file=>file.name;export const getSubprojectDriveImageUrl=()=>'';export const deleteSubprojectDriveFile=async()=>{};export const uploadSubprojectDriveFile=async()=>{};export const updateSubprojectDriveFileMetadata=async()=>{};export const DRIVE_GALLERY_IMAGE_ACCEPT='';export const IPO_DRIVE_FILE_ACCEPT='';export const isAllowedDriveGalleryImage=()=>true;export const isAllowedIpoDriveFile=()=>true;`,
} });
const { page, db, test } = f;
const year = () => page.getByRole('combobox', { name: 'Fund Year', exact: true });
const open = async (type, mode, patch = {}) => {
    const before = await page.locator('[data-testid=flow]').textContent().catch(() => '');
    await page.evaluate(async ({ type, mode, patch }) => window.openYearFlow(type, mode, patch), { type, mode, patch });
    await page.waitForFunction(previous => document.querySelector('[data-testid=flow]')?.textContent !== previous, before);
    if (mode === 'create' && !['activities', 'subprojects'].includes(type)) await page.getByRole('button', { name: 'Add New', exact: true }).click();
    else if (mode === 'edit' && !['activities', 'subprojects'].includes(type)) await page.getByRole('button', { name: 'Edit Details', exact: true }).click();
    else if (mode === 'detail') await page.getByRole('button', { name: 'Edit Details', exact: true }).click();
};
try {
    for (const domain of domains) await test(`${domain.table}: actual creation form shares strict year control and dynamic current-year default`, async () => {
        await open(domain.table, 'create'); await year().waitFor();
        assert.equal(await year().inputValue(), String(new Date().getFullYear()));
        assert.equal(await year().getAttribute('type'), 'text');
        const calls = f.calls.length;
        await year().fill('2099'); await year().press('Enter');
        if (await page.getByRole('alertdialog').count()) await page.getByRole('button', { name: 'Keep Existing Dates', exact: true }).click();
        assert.equal(await year().inputValue(), '2099');
        assert.equal(f.calls.length, calls, 'Changing a draft year must not fetch or save data');
        await year().fill('20'); await year().press('Tab'); await page.locator('form').first().evaluate(form => form.requestSubmit());
        assert.equal(f.calls.filter(call => call.name === 'commit_dcf_change').length, 0);
    });
    for (const domain of domains.slice(2)) await test(`${domain.table}: actual edit persists numeric year once and preserves reported actuals; legacy NULL survives metadata save`, async () => {
        let base = await state(db, domain.table, 1);
        await sqlRpc(db, 'commit_dcf_change', { ...identity(domain.table, 1), p_base: base, p_changes: { uacsCode: '502', obligationDate: '2026-10-01', disbursementDate: '2026-11-01', physicalDeliveryDate: '2026-10-01' }, p_financial: [], p_reason: 'Synthetic year preparation', p_source: 'fund-year-fixture', p_request_key: crypto.randomUUID() });
        base = await state(db, domain.table, 1); const before = await versions(db, domain.table, 1);
        await open(domain.table, 'edit'); await year().fill('2037'); await year().press('Enter');
        const button = () => page.getByRole('button', { name: domain.table === 'office_requirements' ? 'Save Details' : domain.table === 'staffing_requirements' ? 'Save Changes' : 'Save', exact: true });
        let confirmations = await page.evaluate(() => window.fixture.confirmations.length); await button().click(); await page.waitForFunction(count => window.fixture.confirmations.length > count, confirmations);
        let updated = await state(db, domain.table, 1); assert.equal(updated.record.fundYear, 2037); assert.deepEqual(updated.financial, base.financial); assert.equal((await versions(db, domain.table, 1)).length, before.length + 1);
        await db.exec(`update ${domain.table} set "fundYear"=NULL where id=1`);
        await open(domain.table, 'edit'); assert.equal(await year().inputValue(), '');
        const field = domain.table === 'other_program_expenses' ? 'particulars' : domain.label;
        await page.locator(`[name="${field}"]`).fill('Metadata with legacy year'); confirmations = await page.evaluate(() => window.fixture.confirmations.length);
        await button().click(); await page.waitForFunction(count => window.fixture.confirmations.length > count, confirmations);
        updated = await state(db, domain.table, 1); assert.equal(updated.record.fundYear, null); assert.deepEqual(updated.financial, base.financial);
    });
    await test('Activity FY2027 Continuing accepts CY2028 actual conduct without moving funding or financial entries', async () => {
        await db.exec(`update activities set "fundingYear"=2027,"fundType"='Continuing',"actualDate"=NULL,"actualEndDate"=NULL where id=1`);
        const before = await state(db, 'activities', 1);
        const loaded = page.waitForResponse(response => response.url().endsWith('/rpc') && response.request().postDataJSON()?.name === 'read_activity_accomplishments');
        await open('activities', 'actual'); await loaded;
        await page.getByRole('button', { name: 'Save Changes', exact: true }).waitFor();
        await page.getByRole('textbox', { name: 'Actual Start Date', exact: true }).fill('2028-03-15');
        const count = await page.evaluate(() => window.fixture.confirmations.length);
        await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
        await page.waitForFunction(count => window.fixture.confirmations.length > count, count);
        const after = await state(db, 'activities', 1);
        assert.equal(after.record.fundingYear, 2027); assert.equal(after.record.actualDate, '2028-03-15'); assert.deepEqual(after.financial, before.financial);
    });
    for (const type of ['activities', 'subprojects']) await test(`${type}: edit/transfer retain inherited year rather than defaulting; source unchanged`, async () => {
        const base = await state(db, type, 1);
        await open(type, 'edit'); await year().waitFor(); assert.equal(await year().inputValue(), String(base.record.fundingYear));
        await open(type, 'transfer', { fundingYear: 2027 }); await year().waitFor(); assert.equal(await year().inputValue(), '2027');
        await year().fill('2028'); await year().press('Enter'); assert.equal(await year().inputValue(), '2028'); assert.deepEqual(await state(db, type, 1), base);
    });
    await test('Subproject detail editor also uses shared control; no network or runtime leaks', async () => {
        await open('subprojects', 'detail'); await year().waitFor(); assert.equal(await year().getAttribute('type'), 'text'); assert.deepEqual(f.external, []); assert.deepEqual(f.errors, []);
    });
} finally { await f.close(); }
finish(f);
