import assert from 'node:assert/strict';
import {averageLodComponent,buildLodMonitoringSummary,buildLodProgression,indexLodAssessments,LOD_SUMMARY_COLUMNS} from '../lib/lodDashboard.ts';
import {getLodEffectiveState} from '../lib/lodScoring.ts';
import {buildLodMonitoringWorkbook,downloadLodMonitoringWorkbook} from '../lib/lodMonitoringExcel.ts';
let passed=0;const check=async(name,run)=>{await run();passed++;console.log('PASS '+name);};
const registry=Array.from({length:9},(_,i)=>({id:i+1,region:i<7?'R1':i===7?'R2':'Unknown',province:i===6?'Unspecified Province':i%2?'B':'A'}));
const assessment=(ipo_id,id,extra={})=>({id,ipo_id,year:2026,computed_level:null,manual_level:null,is_complete:false,answered_question_count:0,...extra});
const assessments=[assessment(1,1,{computed_level:5,is_complete:true}),assessment(2,2,{manual_level:5}),assessment(3,3,{is_carried_over:true,carried_over_level:4}),assessment(4,4,{is_dropped:true,computed_level:5,is_complete:true}),assessment(5,5,{answered_question_count:1}),assessment(7,7,{computed_level:2,is_complete:null}),assessment(8,8,{manual_level:1}),assessment(9,9,{manual_level:3}),assessment(1,10,{year:2025,computed_level:2,is_complete:true}),assessment(2,11,{year:2024,is_dropped:true})];
const args={registry,assessments,year:2026,ownOu:false,ownRegion:'R1',regionToOu:new Map([['R1','RPMO 1'],['R2','RPMO 2']])};
await check('one canonical state per IPO/year reconciles all categories with the LOD list helper',()=>{
    const result=buildLodMonitoringSummary(args),index=indexLodAssessments(assessments);
    for(const {key}of LOD_SUMMARY_COLUMNS.filter(c=>c.key!=='total')){
        const expected=registry.filter(ipo=>{const state=getLodEffectiveState(index.get(ipo.id)?.get(2026));return key===(state.level?`level${state.level}`:state.kind==='dropped'?'dropped':state.kind==='incomplete'?'incomplete':'forAssessment');}).length;
        assert.equal(result.totals[key],expected,key);
    }
    assert.equal(result.totals.total,9);assert.equal(result.totals.level5,2);assert.equal(result.totals.dropped,1);assert.equal(result.totals.incomplete,1);assert.equal(result.totals.forAssessment,1);
    assert.equal(result.rows.find(row=>row.group==='Unassigned OU').total,1);
});
await check('Own OU never broadens scope and groups by province even when supplied other regions',()=>{
    const result=buildLodMonitoringSummary({...args,ownOu:true});assert.equal(result.groupLabel,'Province');assert.equal(result.totals.total,7);assert(result.rows.some(row=>row.group==='Unspecified Province'));
    assert.equal(buildLodMonitoringSummary({...args,ownOu:true,ownRegion:''}).totals.total,0);
    assert.equal(buildLodMonitoringSummary({...args,ownOu:true,region:'R2'}).totals.total,0);
});
await check('geographic filters and duplicate IPO/assessment metadata cannot inflate counts',()=>{
    const duplicate=assessment(1,99,{manual_level:1}),result=buildLodMonitoringSummary({...args,registry:[...registry,registry[0]],assessments:[...assessments,duplicate],region:'R1',province:'A'});
    assert.equal(result.totals.total,3);assert.equal(result.totals.level1,1);assert.equal(indexLodAssessments([...assessments,duplicate]).get(1).get(2026).id,99);
});
await check('legacy province filter labels remain compatible while unknown provinces group explicitly',()=>{
    const result=buildLodMonitoringSummary({...args,registry:[{id:1,region:'R1',province:'Unspecified Province',provinceFilterValue:'Legacy Unstructured Location'}],ownOu:true,province:'Legacy Unstructured Location'});
    assert.equal(result.rows[0].group,'Unspecified Province');assert.equal(result.totals.total,1);
});
await check('historical year states do not inherit latest or automatically carried levels',()=>{
    const old=buildLodMonitoringSummary({...args,year:2025});assert.equal(old.totals.level2,1);assert.equal(old.totals.forAssessment,8);assert.equal(old.totals.level5,0);
});
await check('progression includes published levels only and omits empty years rather than zero averages',()=>{
    assert.deepEqual(buildLodProgression(registry.map(row=>row.id),assessments).map(row=>row.year),[2025,2026]);
    const current=buildLodProgression([1,2,3,4,5,6,7],assessments).find(row=>row.year===2026);assert.equal(current.level5,2);assert.equal(current.level4,1);assert.equal(current.level2,1);assert.equal(current.average,4);
    assert.deepEqual(buildLodProgression([4,5,6],assessments),[]);
});
await check('diamond compares 20/40 at 50 percent and 5/5 at 100 percent',()=>{
    assert.equal(averageLodComponent([{weighted:20,weight:40}]).percent,50);assert.equal(averageLodComponent([{weighted:5,weight:5}]).percent,100);
});
await check('component averages normalize each bound maximum before averaging across versions',()=>{
    const result=averageLodComponent([{weighted:20,weight:40},{weighted:30,weight:60}]);assert.equal(result.percent,50);assert.equal(result.score,25);assert.equal(result.minWeight,40);assert.equal(result.maxWeight,60);
    assert.equal(averageLodComponent([{weighted:20,weight:40},{weighted:5,weight:5}]).percent,75);
});
await check('missing or zero-weight component evidence stays unavailable rather than becoming zero',()=>{
    assert.equal(averageLodComponent([undefined,{weighted:null,weight:40},{weighted:0,weight:0}]).percent,null);assert.equal(averageLodComponent([{weighted:0,weight:40}]).percent,0);
    assert.equal(averageLodComponent([{weighted:5,weight:5},{weighted:null,weight:40}]).percent,100);
});
await check('a large registry retains each IPO in one group and no source object is mutated',()=>{
    const original=JSON.stringify(args),large=Array.from({length:1000},(_,i)=>({id:100+i,region:'R1',province:'A'}));
    assert.equal(buildLodMonitoringSummary({...args,registry:large}).totals.forAssessment,1000);assert.equal(JSON.stringify(args),original);
});
await check('complete year worksheets preserve all integer counts and formatting without continuation tabs',async()=>{
    const summaries=[2026,2025,2024].map(year=>buildLodMonitoringSummary({...args,year})),date=new Date('2026-11-27T02:00:00Z');
    const wb=await buildLodMonitoringWorkbook({summaries,scope:'All Authorized OUs / All Provinces',extractedAt:date});assert.equal(wb.worksheets.length,3);
    for(const summary of summaries){const sheet=wb.getWorksheet('LOD Monitoring '+summary.year);assert(sheet);assert.equal(sheet.views[0].showGridLines,false);assert.match(sheet.getCell('A4').value,/Nov 27, 2026/);assert.equal(sheet.getCell('A6').alignment.horizontal,'center');assert.equal(sheet.getCell('J6').border.bottom.style,'thin');assert.equal(sheet.rowCount,7+summary.rows.length);
        [...summary.rows,summary.totals].forEach((row,index)=>{assert.deepEqual(sheet.getRow(index+7).values.slice(1),[row.group,...LOD_SUMMARY_COLUMNS.map(c=>row[c.key])]);for(let col=2;col<=10;col++){assert.equal(typeof sheet.getCell(index+7,col).value,'number');assert.equal(sheet.getCell(index+7,col).numFmt,'#,##0');}});
    }
    await assert.rejects(()=>buildLodMonitoringWorkbook({summaries:[],scope:''}),/at least one/);
    await assert.rejects(()=>buildLodMonitoringWorkbook({summaries:[summaries[0],summaries[0]],scope:''}),/distinct/);
});
await check('a scope/account change can cancel an asynchronous export before any browser download',async()=>{
    const controller=new AbortController(),pending=downloadLodMonitoringWorkbook({summaries:[buildLodMonitoringSummary(args)],scope:'Local Test'},controller.signal);controller.abort();await pending;
});
console.log(`${passed} LOD dashboard/model/Excel checks passed. No database or network writes.`);
