import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {createResourcesFixture} from './resources-sql-fixture.mjs';
import {seedReportorialAwards} from './resources-awards-fixture.mjs';
const {db,rpc}=await createResourcesFixture(),fixture=await seedReportorialAwards(db,rpc),server=await createServer({configFile:false,appType:'custom',server:{middlewareMode:true},optimizeDeps:{noDiscovery:true,entries:[]}});
let passed=0;const check=async(name,run)=>{await run();passed++;console.log('PASS '+name);};
try{
    const {calculateAwardsDashboardData:calculate,DEFAULT_AWARD_SETTINGS:settings}=await server.ssrLoadModule('/lib/awardRankings.ts');
    const data={operatingUnitScope:['RPMO 1','RPMO 2'],subprojects:[],trainings:[],otherActivities:[],officeReqs:[],staffingReqs:[],otherProgramExpenses:[],ipos:[]};
    const manual=[{fund_year:2024,period:'Q3',operating_unit:'RPMO 1',reportorial_required:5,reportorial_submitted:4,national_activities_required:0,national_activities_attended:0}],original=JSON.stringify({data,manual}),legacy=calculate(data,'2024',settings,manual);
    let periods,period,frozen;
    await check('new periods stay Manual and produce byte-equivalent legacy awards',async()=>{
        periods=(await fixture.read()).periods;assert(periods.every(row=>row.source==='Manual'));
        assert.deepEqual(calculate(data,'2024',settings,manual,periods),legacy);assert.equal((await db.query('select count(*)::int n from reportorial_periods')).rows[0].n,0);
    });
    await check('repository 100/50/0 uses fractional units and only lifts the Program Management completion gate',async()=>{
        period=await fixture.mutate('reportorial_source',{reporting_year:2024,quarter:'Q3',source:'Repository',reason:'Disposable calculation verification'},0);
        periods=(await fixture.read()).periods;const result=calculate(data,'2024',settings,manual,periods),quarter=result.quarters[2],before=legacy.quarters[2],row=quarter.physicalComponents.programManagement[0];
        assert.equal(row.metrics.reportorialCompliance,50);assert.equal(row.metrics.reportorialSubmitted,2);assert.equal(row.metrics.reportorialCreditedUnits,1.5);assert.equal(row.score,15);assert.equal(row.completionRate,0);assert(row.points>0);
        for(const key of ['socialPrep','productionLivelihood','marketingEnterprise'])assert.deepEqual(quarter.physicalComponents[key],before.physicalComponents[key]);
        assert.deepEqual(quarter.financial,before.financial);assert.deepEqual(result.annual.financial,legacy.annual.financial);
        for(const annual of result.annual.physical){const count=result.quarters.filter(q=>(q.physicalOverall.find(row=>row.ou===annual.ou)?.rank||999)<=4).length;assert.equal(annual.physicalTop4Quarters,count);assert.equal(annual.breakdown.physicalConsistency,settings.annualConsistencyPoints[String(count)]||0);}
        assert(quarter.physicalOverall.find(row=>row.ou==='RPMO 1').componentPoints>before.physicalOverall.find(row=>row.ou==='RPMO 1').componentPoints);
        assert.equal(quarter.physicalComponents.programManagement.find(row=>row.ou==='RPMO 2').points,0);assert.equal(quarter.physicalComponents.programManagement.find(row=>row.ou==='RPMO 2').metrics.reportorialRequired,0);
    });
    await check('missing summary, malformed totals and wrong-year evidence fail instead of substituting manual counts',()=>{
        for(const mutate of [p=>delete p[2].summary,p=>p[2].summary.rows[0].credited_units=2,p=>p[2].summary.rows[0].compliance=100,p=>p[2].reporting_year=2025,p=>p.pop()]){const copy=structuredClone(periods);mutate(copy);assert.throws(()=>calculate(data,'2024',settings,manual,copy),/Reportorial|reportorial/);}
    });
    await check('finalization freezes only reportorial evidence; correction and reasoned reopen preserve prior snapshot',async()=>{
        period=await fixture.mutate('reportorial_finalize',{reporting_year:2024,quarter:'Q3',reason:'Freeze disposable evidence'},period.version);
        periods=(await fixture.read()).periods;frozen=calculate(data,'2024',settings,manual,periods);
        await fixture.mutate('submission_return',{receipt_id:fixture.lateReceipt,reason:'Invalid late fixture'},1);assert.deepEqual(calculate(data,'2024',settings,manual,(await fixture.read()).periods),frozen);
        period=await fixture.mutate('reportorial_reopen',{reporting_year:2024,quarter:'Q3',reason:'Recalculate after correction'},period.version);
        const reopened=calculate(data,'2024',settings,manual,(await fixture.read()).periods);assert.equal(reopened.quarters[2].physicalComponents.programManagement[0].metrics.reportorialCreditedUnits,1);assert.equal((await db.query('select evidence from reportorial_snapshots')).rows[0].evidence.rows[0].credited_units,1.5);
        await fixture.mutate('reportorial_source',{reporting_year:2024,quarter:'Q3',source:'Manual',reason:'Restore explicit manual mode'},period.version);assert.deepEqual(calculate(data,'2024',settings,manual,(await fixture.read()).periods),legacy);assert.equal(JSON.stringify({data,manual}),original);
    });
    console.log(`${passed} reportorial Awards calculation and persistence checks passed. Disposable SQL only.`);
}finally{await server.close();await db.close();}
