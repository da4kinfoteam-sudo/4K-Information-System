import React,{useMemo} from 'react';
import {awardWinners,type AwardSnapshot,type AwardViewTable} from '../../lib/awardResultView';
import {awardReviewItems} from '../../lib/awardDashboardPresentation';
import AwardResultTable from './AwardResultTable';

export function compareAwardSnapshots(before:AwardSnapshot,after:AwardSnapshot):AwardViewTable[]{
    return (['overall','financial','physical'] as const).map(category=>({
        key:`impact-${category}`,title:`${category==='overall'?'Overall':category==='financial'?'Financial':'Physical'} Results`,
        columns:[{key:'ou',label:'OU',width:130},...(['rank','totalPoints'] as const).flatMap(field=>(['before','after'] as const).map(stage=>({key:`${stage}-${field}`,label:`${stage==='before'?'Current':'Selected'} ${field==='rank'?'Rank':'Points'}`,kind:field==='rank'?'count' as const:'score' as const,width:180})))],
        rows:[...new Set([...before.results.annual[category],...after.results.annual[category]].map(row=>row.ou))].map(ou=>{
            const old=before.results.annual[category].find(row=>row.ou===ou),selected=after.results.annual[category].find(row=>row.ou===ou);
            return {ou,'before-rank':old?.rank??null,'after-rank':selected?.rank??null,'before-totalPoints':old?.totalPoints??null,'after-totalPoints':selected?.totalPoints??null};
        }),
    }));
}
export default function AwardResultImpact({before,after}:{before:AwardSnapshot|null;after:AwardSnapshot}){
    const tables=useMemo(()=>before?compareAwardSnapshots(before,after):[],[before,after]),issues=awardReviewItems(after);
    return <div className="award-impact"><dl className="repository-detail-meta"><div><dt>Awards Year</dt><dd>{after.awardsYear}</dd></div>{(['physical','financial'] as const).map(stage=><div key={stage}><dt>{stage==='physical'?'Physical':'Financial'} Period</dt><dd>{before?`${before.policy[`${stage}Start`]} to ${before.policy[`${stage}Cutoff`]} → `:''}{after.policy[`${stage}Start`]} to {after.policy[`${stage}Cutoff`]}</dd></div>)}{(['overall','financial','physical'] as const).map(key=><div key={key}><dt>{key==='overall'?'Overall':key==='financial'?'Financial':'Physical'} Winner</dt><dd>{before?`${awardWinners(before.results.annual[key])} → `:''}{awardWinners(after.results.annual[key])}</dd></div>)}</dl>{!!issues.length&&<ul className="award-confirmation-warnings">{issues.map((issue,index)=><li key={index}><strong>{issue.severity==='blocking'?'Review Required':'Warning'}{issue.name?`: ${issue.name}`:''}. </strong>{issue.text}</li>)}</ul>}{tables.map(table=><AwardResultTable key={table.key} table={table}/>)}</div>;
}
