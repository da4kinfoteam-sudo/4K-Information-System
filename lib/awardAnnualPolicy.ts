import type {AwardRankingSettings,AwardsDashboardData} from './awardRankings';

export interface AwardAnnualPolicy {
    schemaVersion:1;
    mode:'Legacy'|'Cutoff';
    awardsYear:number;
    physicalStart:string;
    physicalCutoff:string;
    financialStart:string;
    financialCutoff:string;
    transitionApproved:boolean;
    baselineResultId:string|null;
    formulaVersion:'awards-v2';
}
export interface AwardDatedAmount {id:string;date?:string|null;amount:number;precision?:'day'|'month';month?:string|null;}
export interface AwardFinancialReconciliation {
    originalBasis:number;priorObligations:number;priorDisbursements:number;
    openingAllotment:number;openingUnpaidObligations:number;
    obligations:number;disbursements:number;obligationBasis:number;
    closingAllotment:number;closingUnpaidObligations:number;
    disbursementVsAllotmentRate:number;disbursementVsObligationRate:number;
    includedObligationIds:string[];includedDisbursementIds:string[];
    issues:string[];
}
export interface AwardStoredCalculation {
    schemaVersion:1;formulaVersion:string;awardsYear:number;
    scope:Record<string,unknown>;policy:AwardAnnualPolicy;settings:AwardRankingSettings;
    results:AwardsDashboardData;reconciliation:unknown;sourceDataAsOf:string;sourceHash:string;
}

export function awardDate(value:unknown):string|null {
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
    const parsed=new Date(value+'T00:00:00.000Z');
    return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value?value:null;
}
export function awardNextDate(value:string):string {
    if(!awardDate(value))throw new Error('Choose a valid awards date.');
    return new Date(Date.parse(value+'T00:00:00.000Z')+86400000).toISOString().slice(0,10);
}
export function defaultAnnualPolicy(year:number,previous?:{id:string;policy:AwardAnnualPolicy}):AwardAnnualPolicy {
    if(!Number.isInteger(year)||year<1900||year>9999)throw new Error('Choose a valid Awards Year.');
    if(previous&&(previous.policy.mode!=='Cutoff'||previous.policy.awardsYear!==year-1))throw new Error('Choose the preceding finalized Awards Year as the opening baseline.');
    return {schemaVersion:1,mode:'Legacy',awardsYear:year,physicalStart:previous?awardNextDate(previous.policy.physicalCutoff):`${year}-01-01`,physicalCutoff:`${year}-11-15`,
        financialStart:previous?awardNextDate(previous.policy.financialCutoff):`${year}-01-01`,financialCutoff:`${year}-10-15`,transitionApproved:false,baselineResultId:previous?.id||null,formulaVersion:'awards-v2'};
}
export function validateAnnualPolicy(value:unknown):AwardAnnualPolicy {
    if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Provide the annual cutoff policy.');
    const p=value as Record<string,unknown>;
    const keys=['schemaVersion','mode','awardsYear','physicalStart','physicalCutoff','financialStart','financialCutoff','transitionApproved','baselineResultId','formulaVersion'];
    if(Object.keys(p).some(key=>!keys.includes(key))||keys.some(key=>!(key in p)))throw new Error('The annual policy fields are invalid.');
    if(p.schemaVersion!==1||p.formulaVersion!=='awards-v2'||!['Legacy','Cutoff'].includes(String(p.mode))||!Number.isInteger(p.awardsYear)||Number(p.awardsYear)<1900||Number(p.awardsYear)>9999)throw new Error('The annual policy version or year is invalid.');
    for(const stage of ['physical','financial']){
        const start=awardDate(p[stage+'Start']),end=awardDate(p[stage+'Cutoff']);
        if(!start||!end||start>end||end.slice(0,4)!==String(p.awardsYear)||Number(start.slice(0,4))<Number(p.awardsYear)-1)throw new Error('Choose valid, continuous recognition dates for the Awards Year.');
    }
    if(typeof p.transitionApproved!=='boolean'||p.baselineResultId!==null&&(typeof p.baselineResultId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(p.baselineResultId)))throw new Error('The opening baseline is invalid.');
    if(p.mode==='Cutoff'&&!p.transitionApproved)throw new Error('Review and approve the opening transition before enabling annual cutoffs.');
    return structuredClone(p) as unknown as AwardAnnualPolicy;
}
export function awardDateInWindow(value:unknown,start:string,end:string):boolean {
    const date=awardDate(value);return !!date&&date>=start&&date<=end;
}

export function awardEntryWindowPosition(entry:AwardDatedAmount,start:string,end:string):'prior'|'current'|'future'|'ambiguous'|'invalid' {
    let first:string,last:string;
    if(entry.precision==='month'){
        if(typeof entry.month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(entry.month))return 'invalid';
        first=entry.month+'-01';if(!awardDate(first))return 'invalid';
        last=new Date(Date.UTC(Number(entry.month.slice(0,4)),Number(entry.month.slice(5)),0)).toISOString().slice(0,10);
    }else{
        const date=awardDate(entry.date);if(!date)return 'invalid';first=date;last=date;
    }
    if(last<start)return 'prior';
    if(first>end)return 'future';
    if(first>=start&&last<=end)return 'current';
    return 'ambiguous';
}

// Original financial values remain untouched. Carry is an awards-only opening basis.
export function reconcileAwardFinancialLine(originalBasis:number,obligations:readonly AwardDatedAmount[],disbursements:readonly AwardDatedAmount[],policy:AwardAnnualPolicy):AwardFinancialReconciliation {
    validateAnnualPolicy(policy);
    if(policy.mode!=='Cutoff')throw new Error('Enable the reviewed annual cutoff policy before calculating carry-forward.');
    const issues:string[]=[],seen=new Set<string>();
    const split=(entries:readonly AwardDatedAmount[],stage:string)=>{
        let prior=0,current=0;const ids:string[]=[];
        for(const entry of entries){
            if(!entry.id||seen.has(stage+':'+entry.id)){issues.push(`Duplicate or missing ${stage} identity.`);continue;}seen.add(stage+':'+entry.id);
            if(!Number.isFinite(entry.amount)){issues.push(`Invalid ${stage} amount: ${entry.id}.`);continue;}
            const position=awardEntryWindowPosition(entry,policy.financialStart,policy.financialCutoff);
            if(position==='invalid'){issues.push(entry.precision==='month'?`Review the actual calendar year and month of the legacy ${stage}: ${entry.id}. Fund Year is not evidence of its actual year.`:`Review the actual ${stage} date: ${entry.id}.`);continue;}
            if(position==='ambiguous'){issues.push(`The legacy ${stage} month crosses a recognition boundary: ${entry.id}. Review its dated evidence before finalizing.`);continue;}
            if(position==='prior')prior+=entry.amount;
            else if(position==='current'){current+=entry.amount;ids.push(entry.id);}
        }
        return {prior,current,ids};
    };
    const o=split(obligations,'obligation'),d=split(disbursements,'disbursement');
    if(!Number.isFinite(originalBasis)||originalBasis<0)issues.push('Review the original financial basis.');
    const openingAllotment=originalBasis-d.prior,openingUnpaidObligations=o.prior-d.prior,obligationBasis=openingUnpaidObligations+o.current;
    const closingAllotment=openingAllotment-d.current,closingUnpaidObligations=obligationBasis-d.current;
    if(openingAllotment<0||openingUnpaidObligations<0||closingAllotment<0||closingUnpaidObligations<0)issues.push('Reported actuals exceed an available financial basis; review before finalizing.');
    return {originalBasis,priorObligations:o.prior,priorDisbursements:d.prior,openingAllotment,openingUnpaidObligations,obligations:o.current,disbursements:d.current,obligationBasis,closingAllotment,closingUnpaidObligations,
        disbursementVsAllotmentRate:openingAllotment!==0?d.current/openingAllotment*100:0,disbursementVsObligationRate:obligationBasis!==0?d.current/obligationBasis*100:0,
        includedObligationIds:o.ids,includedDisbursementIds:d.ids,issues};
}

export function awardResultWinners(result:AwardsDashboardData){
    const winners=(rows:readonly {ou:string;rank:number}[])=>rows.filter(row=>row.rank===1).map(row=>row.ou).sort();
    return {overall:winners(result.annual.overall),financial:winners(result.annual.financial),physical:winners(result.annual.physical)};
}
export function compareAwardResults(before:AwardsDashboardData,after:AwardsDashboardData){
    const oldRows=new Map(before.annual.overall.map(row=>[row.ou,row]));
    return {before:awardResultWinners(before),after:awardResultWinners(after),rows:after.annual.overall.map(row=>({ou:row.ou,previousRank:oldRows.get(row.ou)?.rank??null,rank:row.rank,
        previousPoints:oldRows.get(row.ou)?.totalPoints??null,points:row.totalPoints,previousPhysicalRate:oldRows.get(row.ou)?.physicalCompletionRate??null,physicalRate:row.physicalCompletionRate}))};
}
