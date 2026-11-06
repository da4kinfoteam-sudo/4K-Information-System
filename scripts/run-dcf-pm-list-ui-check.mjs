import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { createHttpFixture, harnessImports, versions, finish } from './helpers/dcf-revision-http-fixture.mjs';

const harness=`${harnessImports}
import * as XLSX from 'xlsx';window.XLSX=XLSX;
import {OfficeRequirementsTab} from './components/program_management/OfficeRequirementsTab';
import {StaffingRequirementsTab} from './components/program_management/StaffingRequirementsTab';
import {OtherExpensesTab} from './components/program_management/OtherExpensesTab';
function Harness(){
 const[records,setRecords]=useState({}),[type,setType]=useState('office_requirements');
 React.useEffect(()=>{fetch('/records').then(r=>r.json()).then(setRecords)},[]);
 window.showImportModule=setType;
 const Component={office_requirements:OfficeRequirementsTab,staffing_requirements:StaffingRequirementsTab,other_program_expenses:OtherExpensesTab}[type];
 return <main style={{padding:16}}><Component key={type} items={records[type]||[]} setItems={update=>{window.fixture.confirmations.push({type});setRecords(old=>({...old,[type]:typeof update==='function'?update(old[type]||[]):update}))}}
  fundSources={[{id:1,uid:'FS-000001',label:'4K Fund',is_active:true,sort_order:0}]} uacsCodes={{MOOE:{Travel:{'502':'Travel'}}}} onSelect={()=>{}}/></main>;
}createRoot(document.getElementById('root')).render(<Harness/>);`;
const f=await createHttpFixture({harness,name:'pm-list-ui'}),{db,page,test}=f;
const dialogs=[];
page.removeAllListeners('dialog');page.on('dialog',dialog=>{dialogs.push({type:dialog.type(),message:dialog.message()});return dialog.accept(dialog.type()==='prompt'?'Disposable import reason':undefined)});
const open=async type=>{await page.evaluate(type=>window.showImportModule(type),type);await page.locator('input[type=file]').waitFor({state:'attached'});};
const upload=async buffer=>{
    const done=page.waitForEvent('dialog',{predicate:dialog=>dialog.type()==='alert'});
    await page.locator('input[type=file]').setInputFiles({name:'same-import.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer});
    await done;await page.waitForFunction(()=>!document.querySelector('input[type=file]').disabled);
};
try{
    for(const type of ['office_requirements','staffing_requirements','other_program_expenses'])await test(`${type}: actual XLSX list import retries a lost response and survives reload without duplicates`,async()=>{
        const row={operatingUnit:'NPMO',fundYear:2026,fundType:'Current',tier:'Tier 1',fundSourceUid:'FS-000001',fundSource:'4K Fund',status:type==='staffing_requirements'?'Contractual':'Proposed',
            obligationDate:'2026-11-01',disbursementDate:'2026-12-01',uacsCode:'502',equipment:'Imported equipment',specs:'Imported specs',purpose:'Imported purpose',numberOfUnits:2,pricePerUnit:50,
            personnelPosition:'Imported position',salaryGrade:12,personnelType:'Technical',hiringStatus:'Proposed',amount:100,particulars:'Imported program expense',disbursementNov:40,disbursementDec:60};
        const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.json_to_sheet([row]),'Template');
        const buffer=XLSX.write(workbook,{type:'buffer',bookType:'xlsx'});
        await open(type);f.control.loseResponse='commit_dcf_change';
        const initial=f.calls.length;
        await upload(buffer);
        assert(dialogs.at(-1).message.includes('Import failed:'),'An uncertain save must not report success');
        const first=f.calls.slice(initial).find(call=>call.name==='commit_dcf_change');assert(first?.key);
        const committed=(await db.query(`select id,uid from ${type} where "operatingUnit"='NPMO' order by id desc`)).rows[0];
        assert(committed);assert.equal((await versions(db,type,committed.id)).length,1);
        await upload(buffer);assert(dialogs.at(-1).message.includes('1 items imported.'));
        assert.equal(f.calls.filter(call=>call.key===first.key&&call.ok).length,2);
        assert.equal((await db.query(`select count(*)::int n from ${type} where uid=$1`,[committed.uid])).rows[0].n,1);
        await page.reload();await page.waitForFunction(()=>!!window.showImportModule);await open(type);
        const writes=f.calls.filter(call=>call.name==='commit_dcf_change').length;
        await upload(buffer);
        assert.equal(f.calls.filter(call=>call.name==='commit_dcf_change').length,writes,'A completed reimport reads the current record rather than replaying its old state');
        assert.equal((await versions(db,type,committed.id)).length,1);
    });
    await test('no external requests, direct table writes or runtime errors',async()=>{assert.deepEqual(f.external,[]);assert.deepEqual(f.errors,[]);});
}finally{await f.close();}
finish(f);
