import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {createHttpFixture,harnessImports,acfProps,state,finish} from './helpers/dcf-revision-http-fixture.mjs';
const app=ts.createSourceFile('App.tsx',await readFile('App.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const selected=new Map();
function visit(node){if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&['handleActivitySaved','handleConfirmedDcfFinancial','enrichedActivities','obligationsMap','disbursementsMap'].includes(node.name.text))selected.set(node.name.text,`const ${node.getText(app)};`);ts.forEachChild(node,visit);}visit(app);
assert.equal(selected.size,5);
const harness=`${harnessImports}
const {useMemo}=React;
import * as actual from './lib/activityAccomplishmentPersistence';
import {getActivityIpoIds,reconcileActivityIpoLinks} from './lib/activityIpoLinks';
import {updateCachedActivity,updateCachedDcfVersion,writeScopedCache,readScopedCache} from './lib/localScopedCache';
const reconcileActivityFinancialRows=(...args)=>actual.reconcileActivityFinancialRows(...args);
function Harness(){const[activities,setActivities]=useState([]),[allFinancialObligations,setObligations]=useState([]),[allFinancialDisbursements,setDisbursements]=useState([]),[selectedActivity,setSelectedActivity]=useState(null);
const activityWorkflowIpos=[],ipos=[],selectedIpo=null,currentUser=window.session,ipoLinkedDcfCacheRef=useRef(new Map()),financialRowsRef=useRef({obligations:[],disbursements:[]});
financialRowsRef.current={obligations:allFinancialObligations,disbursements:allFinancialDisbursements};
const activitiesSync={upsertLocalData:rows=>setActivities(old=>{const next=new Map(old.map(row=>[row.id,row]));rows.forEach(row=>next.set(row.id,row));return [...next.values()]})};
const financialObligationsSync={replaceLocalData:setObligations},financialDisbursementsSync={replaceLocalData:setDisbursements};
const setIpoLinkedDcfState=()=>{},setActivityLinkRevision=()=>{};
${selected.get('obligationsMap')}
${selected.get('disbursementsMap')}
${selected.get('enrichedActivities')}
${selected.get('handleConfirmedDcfFinancial')}
${selected.get('handleActivitySaved')}
window.cacheScope={year:'2026',operatingUnit:'All',tier:'All',fundType:'All',canViewAllOus:true,requestedBy:1};
window.readConfirmedCache=actor=>readScopedCache({...window.cacheScope,requestedBy:actor});
window.openConfirmedActivity=async()=>{const result=await window.api.readDcfState('activities',1,window.session);setActivities([result.record]);setObligations(result.financial.obligations);setDisbursements(result.financial.disbursements);const data={activities:[result.record],financialObligations:result.financial.obligations,financialDisbursements:result.financial.disbursements};await writeScopedCache(window.cacheScope,data);await writeScopedCache({...window.cacheScope,requestedBy:2},data)};
window.confirmedView=()=>({record:enrichedActivities[0],selected:selectedActivity,obligations:allFinancialObligations,disbursements:allFinancialDisbursements});
window.applyConfirmedActivity=handleActivitySaved;
const visible=table=>table==='activities'?enrichedActivities:[],saved=table=>table==='activities'?handleActivitySaved:noop;
return <FinancialAccomplishment ${acfProps}/>;
}createRoot(document.getElementById('root')).render(<Harness/>);`;
const f=await createHttpFixture({harness,name:'activity-confirmed-state'}),{page,db,test}=f;
try{
    await page.waitForFunction(()=>typeof window.openConfirmedActivity==='function');
    await test('Activity disbursement correction survives the actual App callback and ledger enrichment after reopening',async()=>{
        await page.evaluate(()=>window.openConfirmedActivity());
        const before=await state(db,'activities',1),name=before.record.name;
        await page.getByLabel('Search particulars, UACS code, or parent item',{exact:true}).fill(name);
        await page.getByRole('button',{name:`Manage actual disbursements for ${name}`,exact:true}).click();
        const dialog=page.getByRole('dialog',{name:'Manage Actual Disbursements',exact:true});
        await dialog.locator('input[aria-label$="disbursement 1 amount"]').fill('31.75');
        await dialog.getByRole('button',{name:'Save Changes',exact:true}).click();await dialog.waitFor({state:'detached'});
        const after=await state(db,'activities',1),view=await page.evaluate(()=>window.confirmedView());
        assert.equal(Number(after.financial.disbursements[0].amount),31.75,'Database must confirm the correction');
        assert.equal(Number(view.disbursements.find(row=>String(row.id)===String(after.financial.disbursements[0].id)).amount),31.75,'Old loaded ledger must not overwrite the confirmed value');
        assert.equal(Number(view.record.expenses[0].disbursements[0].amount),31.75,'The reconstructed detail record must use confirmed actuals');
        assert.deepEqual(view.obligations,before.financial.obligations,'The other financial stage must remain unchanged');
        await page.waitForFunction(async()=>Number((await window.readConfirmedCache(1)).financialDisbursements[0].amount)===31.75);
        assert.equal(Number((await page.evaluate(()=>window.readConfirmedCache(2))).financialDisbursements[0].amount),12.34,'Another account cache must remain unchanged');
        await page.evaluate(()=>window.openConfirmedActivity());
        assert.equal(Number((await page.evaluate(()=>window.confirmedView())).record.expenses[0].disbursements[0].amount),31.75);
    });
    await test('confirmed ledger reconciliation preserves identities and metadata, excludes legacy rows and respects empty stages',async()=>{
        const result=await page.evaluate(()=>{
            const rows=[{id:1,entity_type:'activity_expense',parent_id:7,item_id:'10',disbursement_date:'2026-01-01',amount:10,created_at:'2026-01-02',updated_at:'2026-01-03'},
                {id:2,entity_type:'activity_expense',parent_id:7,item_id:'10',disbursement_date:'2026-01-01',amount:10},
                {id:3,entity_type:'activity_expense',parent_id:8,item_id:'10',amount:55},
                {id:4,entity_type:'subproject_detail',parent_id:7,item_id:'10',amount:66}];
            const empty={source:'central',entries:[]},snapshot={activity:{id:7,expenses:[{id:10},{id:11}]},stages:{10:{obligation:empty,disbursement:{source:'central',entries:[{id:'1',date:'2026-01-01',amount:20},{id:'2',date:'2026-01-01',amount:10},{id:'5',date:'2026-02-01',amount:3}]}},11:{obligation:empty,disbursement:{source:'legacy',entries:[{id:'legacy',date:'2026-01-01',amount:100}]}}}};
            const original=JSON.stringify({rows,snapshot}),next=window.api.reconcileActivityFinancialRows(rows,snapshot,'disbursement');
            const cleared=window.api.reconcileActivityFinancialRows(next,{...snapshot,stages:{...snapshot.stages,10:{obligation:empty,disbursement:empty}}},'disbursement');
            return {next,cleared,unchanged:original===JSON.stringify({rows,snapshot})};
        });
        assert(result.unchanged);assert.equal(result.next.length,5);assert.equal(result.next.find(row=>row.id===1).created_at,'2026-01-02');assert.equal(result.next.find(row=>row.id===1).updated_at,'2026-01-03');
        assert.equal(result.next.find(row=>row.id===5).created_at,undefined);assert(!result.next.some(row=>row.id==='legacy'));assert.deepEqual(result.cleared.map(row=>row.id),[3,4]);
    });
    await test('no external requests, database-writing setters or runtime errors',async()=>{assert.deepEqual(f.external,[]);assert.deepEqual(f.errors,[]);});
}finally{await f.close();}
finish(f);
