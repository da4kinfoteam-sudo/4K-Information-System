import type {LodAssessment} from '../constants';
import {getLodEffectiveState} from './lodScoring.ts';

export interface LodRegistryRow {id:number;region:string;province:string;provinceFilterValue?:string;}
export type LodSummaryKey='level1'|'level2'|'level3'|'level4'|'level5'|'forAssessment'|'dropped'|'incomplete'|'total';
export const LOD_SUMMARY_COLUMNS:Array<{key:LodSummaryKey;label:string}>=[
    {key:'level1',label:'Level 1'},{key:'level2',label:'Level 2'},{key:'level3',label:'Level 3'},
    {key:'level4',label:'Level 4'},{key:'level5',label:'Level 5'},{key:'forAssessment',label:'For Assessment'},
    {key:'dropped',label:'Dropped'},{key:'incomplete',label:'Incomplete'},{key:'total',label:'Total IPOs'},
];
export type LodSummaryRow={group:string}&Record<LodSummaryKey,number>;
export interface LodSummary {year:number;groupLabel:'Operating Unit'|'Province';rows:LodSummaryRow[];totals:LodSummaryRow;}
const emptyCounts=(group:string):LodSummaryRow=>({group,level1:0,level2:0,level3:0,level4:0,level5:0,forAssessment:0,dropped:0,incomplete:0,total:0});

// The list receives ascending IDs and keeps the last IPO/year entry. Match that
// resolution defensively without counting duplicate metadata more than once.
export function indexLodAssessments(assessments:readonly LodAssessment[]){
    const byIpo=new Map<number,Map<number,LodAssessment>>();
    for(const assessment of assessments){
        const ipo=Number(assessment.ipo_id),year=Number(assessment.year);
        if(!Number.isFinite(ipo)||!Number.isInteger(year))continue;
        const years=byIpo.get(ipo)||new Map<number,LodAssessment>(),existing=years.get(year);
        if(!existing||Number(assessment.id)>Number(existing.id))years.set(year,assessment);
        byIpo.set(ipo,years);
    }
    return byIpo;
}

export function buildLodMonitoringSummary({registry,assessments,year,ownOu,ownRegion,regionToOu,region='All',province='All'}:{
    registry:readonly LodRegistryRow[];assessments:readonly LodAssessment[];year:number;ownOu:boolean;ownRegion:string;
    regionToOu:ReadonlyMap<string,string>;region?:string;province?:string;
}):LodSummary{
    const byIpo=indexLodAssessments(assessments),groups=new Map<string,LodSummaryRow>(),seen=new Set<number>();
    for(const ipo of registry){
        if(seen.has(Number(ipo.id))||ownOu&&(!ownRegion||ipo.region!==ownRegion)||region!=='All'&&ipo.region!==region||province!=='All'&&(ipo.provinceFilterValue??ipo.province)!==province)continue;
        seen.add(Number(ipo.id));
        const group=ownOu?ipo.province||'Unspecified Province':regionToOu.get(ipo.region)||'Unassigned OU';
        const row=groups.get(group)||emptyCounts(group),state=getLodEffectiveState(byIpo.get(Number(ipo.id))?.get(year));
        const key:LodSummaryKey=state.level!==null?`level${state.level}` as LodSummaryKey:state.kind==='dropped'?'dropped':state.kind==='incomplete'?'incomplete':'forAssessment';
        row[key]++;row.total++;groups.set(group,row);
    }
    const rows=[...groups.values()].sort((a,b)=>a.group.localeCompare(b.group,'en',{numeric:true})),totals=emptyCounts('Total');
    for(const row of rows)for(const {key}of LOD_SUMMARY_COLUMNS)totals[key]+=row[key];
    return {year,groupLabel:ownOu?'Province':'Operating Unit',rows,totals};
}

export function buildLodProgression(ipoIds:readonly number[],assessments:readonly LodAssessment[]){
    const byIpo=indexLodAssessments(assessments),included=new Set(ipoIds.map(Number));
    const years=[...new Set(assessments.filter(row=>included.has(Number(row.ipo_id))).map(row=>Number(row.year)))].filter(Number.isInteger).sort((a,b)=>a-b);
    return years.flatMap(year=>{
        const row={year,level1:0,level2:0,level3:0,level4:0,level5:0,average:0},levels:number[]=[];
        for(const id of included){const level=getLodEffectiveState(byIpo.get(id)?.get(year)).level;if(level===null)continue;row[`level${level}` as 'level1']++;levels.push(level);}
        if(!levels.length)return [];
        row.average=Number((levels.reduce((sum,value)=>sum+value,0)/levels.length).toFixed(2));
        return [row];
    });
}

export interface LodComponentValue {weighted:number|null;weight:number;}
export function averageLodComponent(values:readonly (LodComponentValue|undefined)[]){
    const scored=values.filter((value):value is LodComponentValue&{weighted:number}=>!!value&&value.weight>0&&Number.isFinite(value.weight)&&value.weighted!==null&&Number.isFinite(value.weighted));
    if(!scored.length)return {score:null,percent:null,minWeight:null,maxWeight:null,count:0};
    return {
        score:scored.reduce((sum,row)=>sum+row.weighted,0)/scored.length,
        percent:scored.reduce((sum,row)=>sum+Math.max(0,Math.min(100,row.weighted/row.weight*100)),0)/scored.length,
        minWeight:Math.min(...scored.map(row=>row.weight)),maxWeight:Math.max(...scored.map(row=>row.weight)),count:scored.length,
    };
}
