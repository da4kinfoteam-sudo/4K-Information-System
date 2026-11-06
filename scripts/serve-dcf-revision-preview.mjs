import { createHttpFixture, harnessImports, acfProps, state, sqlRpc, identity } from './helpers/dcf-revision-http-fixture.mjs';
import { domains } from './helpers/dcf-revision-fixture.mjs';

// Disposable loopback preview. No environment file, production client or remote DB.
const harness=`${harnessImports}
function Harness(){
 const[records,setRecords]=useState({}),[mode,setMode]=useState('history'),[type,setType]=useState('activities');
 const reload=async()=>{const rows=await fetch('/records').then(response=>response.json());setRecords(rows)};
 React.useEffect(()=>{void reload()},[]);
 const visible=table=>records[table]||[];
 const saved=table=>(record,financial)=>{window.fixture.confirmations.push({table,record,financial});setRecords(old=>({...old,[table]:(old[table]||[]).map(row=>row.id===record.id?record:row)}))};
 const record=visible(type).find(row=>row.id===1);
 return <main className="form-page" style={{maxWidth:1400,margin:'0 auto',padding:16}}>
  <nav className="data-filters" style={{display:'flex',flexWrap:'wrap',gap:12,alignItems:'center',padding:16,marginBottom:16}} aria-label="Disposable preview controls">
   <strong>Local Sample Data</strong>
   <select className="form-control" style={{width:240}} aria-label="Preview DCF module" value={type} onChange={event=>setType(event.target.value)}>
    <option value="activities">Activities / Trainings</option><option value="subprojects">Subprojects</option><option value="office_requirements">Office Requirements</option><option value="staffing_requirements">Staffing Requirements</option><option value="other_program_expenses">Other Expenses</option>
   </select>
   {['history','physical','financial'].map(value=><button type="button" key={value} className={mode===value?'btn btn-primary':'btn btn-secondary'} onClick={()=>setMode(value)}>{value==='history'?'History':value==='physical'?'Physical ACF':'Financial ACF'}</button>)}
   <button type="button" className="btn btn-secondary" onClick={()=>void reload()}>Reload sample records</button>
  </nav>
  {mode==='physical'?<PhysicalAccomplishment ${acfProps}/>:mode==='financial'?<FinancialAccomplishment ${acfProps}/>:record?<DcfRevisionHistory key={type} entityType={type} parentId={record.id} currentUser={window.session} currentVersionKey={record.updated_at} legacyHistory={record.history||[]} onRestored={result=>saved(type)(result.record,result.financial)}/>:null}
 </main>;
}createRoot(document.getElementById('root')).render(<Harness/>);`;

const f=await createHttpFixture({harness,name:'revision-preview'});
try{
    for(const domain of domains){
        let base=await state(f.db,domain.table,1);
        const label=base.record[domain.label];
        for(const [suffix,amount] of [['B',18.5],['C',23.75]]){
            const itemId=domain.lines?'10':null,stage=base.financial.stages[domain.lines?'10':'$parent'].disbursement;
            const entry=stage.entries[0];
            base=await sqlRpc(f.db,'commit_dcf_change',{...identity(domain.table,1),p_base:base,p_changes:{[domain.label]:`${label} - Version ${suffix}`},
                p_financial:[{stage:'disbursement',itemId,operations:[{action:'update',id:entry.id,expected:entry,value:{date:entry.date,amount,remarks:`Sample correction ${suffix}`}}]}],
                p_request_key:crypto.randomUUID(),p_source:'disposable-preview-seed',p_reason:'Synthetic local preview only'});
        }
    }
    await f.page.reload();await f.page.locator('.dcf-revision-history__toggle').click();
    await f.page.getByTitle('View version',{exact:true}).first().waitFor();
    console.log(JSON.stringify({url:f.origin,mode:'Disposable in-memory SQL; no production connection',artifacts:f.artifacts}));
    let closing=false;
    const close=async()=>{if(closing)return;closing=true;await f.close();process.exit(0)};
    process.once('SIGINT',()=>void close());process.once('SIGTERM',()=>void close());
}catch(error){await f.close();throw error;}
