import type {AwardAnnualPolicy} from './awardAnnualPolicy';
import type {AwardManualScore,AwardRankingSettings,AwardsDashboardData} from './awardRankings';
import type {calculateCapturedAwards} from './awardCapturedCalculation';

export type AwardSnapshot=ReturnType<typeof calculateCapturedAwards> & {calculatorHash?:string};
export interface AwardScope {ous:string[]|null;tiers:string[]|null;fundTypes:string[]|null;fundSources:string[]|null;sourceFundYears:string[]|null;}
export interface AwardControllerState {
    controller_version:number;scope:AwardScope;scope_key:string;settings:Partial<AwardRankingSettings>;manual:AwardManualScore[];
    policy:null|{id:string;version:number;policy:AwardAnnualPolicy};
}
export interface AwardResultRecord {
    id:string;awards_year:number;version:number;policy_version:number|null;policy_id:string|null;snapshot:AwardSnapshot;
    finalized_at:string;finalized_by_name:string;reason:string;source_data_as_of:string;previous_result_id:string|null;
}
export interface AwardHistory {
    head:{version:number;active_result_id:string|null};
    activation:null|{id:string;head_version:number;previous_result_id:string|null;result_id:string;action:string;operation_id:string;reason:string;actor_name:string;created_at:string};
    activation_group?:Array<{awards_year:number;head_version:number;previous_result_id:string|null;result_id:string;operation_id:string}>;
    rows:Array<Omit<AwardResultRecord,'snapshot'> & {policy:AwardAnnualPolicy;winners:{overall:string[];financial:string[];physical:string[]}}>;
}
export interface AwardActivationSelection {resultId:string;expectedVersion:number;}
export interface AwardPreview {captureId:string;controllerVersion:number;headVersion:number;policyId:string|null;expiresAt:string;calculation:AwardSnapshot;}
export type AwardCell=string|number|null;
export interface AwardViewColumn {key:string;label:string;kind?:'money'|'percent'|'score'|'count'|'text';width?:number;}
export interface AwardViewTable {key:string;title:string;columns:AwardViewColumn[];rows:Array<Record<string,AwardCell>>;filterable?:boolean;}
export const awardTime=(value:string|null|undefined)=>value?new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'}).format(new Date(value)):'Not available';
export const awardCellText=(value:AwardCell,kind?:AwardViewColumn['kind'])=>value==null?'':typeof value==='number'?kind==='money'?new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP',minimumFractionDigits:2,maximumFractionDigits:2}).format(value):kind==='percent'?`${value.toFixed(2)}%`:kind==='score'?value.toFixed(2):value.toLocaleString('en-PH'):value;
export const awardWinners=(rows:readonly {ou:string;rank:number}[])=>rows.filter(row=>row.rank===1).map(row=>row.ou).join(', ')||'No ranked OUs';
export function awardScopeText(scope:AwardScope){return [scope.ous?.join(', ')||'All OUs',scope.sourceFundYears?`Source FY ${scope.sourceFundYears.join(', ')}`:'All Source Fund Years',scope.tiers?.join(', ')||'All Tiers',scope.fundTypes?.join(', ')||'All Fund Types',scope.fundSources?.join(', ')||'All Fund Sources'].join(' / ');}
const column=(key:string,label:string,kind:AwardViewColumn['kind']='count',width=155):AwardViewColumn=>({key,label,kind,width});
const rankOu=[column('rank','Rank','count',75),column('ou','OU','text',130)];
const components:Record<string,string>={socialPrep:'Social Preparation',productionLivelihood:'Production and Livelihood',marketingEnterprise:'Marketing and Enterprise',programManagement:'Program Management'};
export function awardRankingTables(result:AwardsDashboardData):AwardViewTable[]{
    const annualColumns=[...rankOu,column('totalPoints','Points','score'),column('allocation','Annual Allotment','money',190),column('obligation','Obligation Basis','money',190),column('disbursement','Actual Disbursement','money',190),column('disbursementVsAllotmentRate','Disb / Allot','percent'),column('disbursementVsObligationRate','Disb / Oblig','percent'),column('physicalCompletionRate','Physical Completion','percent',190),column('financialTop4Quarters','Financial Top 4 Quarters','count',210),column('physicalTop4Quarters','Physical Top 4 Quarters','count',210),column('attendanceMissed','Attendance Missed','count',180)];
    const annual=['overall','financial','physical'] as const;
    const tables:AwardViewTable[]=annual.map((key,index)=>{
        const rows=result.annual[key];
        const breakdownKeys=[...new Set(rows.flatMap(row=>Object.keys(row.breakdown)))].filter(k=>key==='overall'||(key==='financial'?k.startsWith('disbursement')||k==='financialConsistency':k.startsWith('physical')));
        const visible=annualColumns.filter(c=>key==='overall'||(key==='financial'?!['physicalCompletionRate','physicalTop4Quarters','attendanceMissed'].includes(c.key):['rank','ou','totalPoints','physicalCompletionRate','physicalTop4Quarters'].includes(c.key)));
        return {key:`annual-${key}`,title:['Overall Top Performance','Top Financial Performance','Top Physical Performance'][index],columns:[...visible,...breakdownKeys.map(k=>column(`points-${k}`,`${k.replace(/([A-Z])/g,' $1').replace(/^./,v=>v.toUpperCase())} Points`,'score',230))],rows:rows.map(row=>{const {breakdown,...values}=row;return {...values,...Object.fromEntries(Object.entries(breakdown).map(([k,v])=>[`points-${k}`,v]))};})};
    });
    for(const [key,title,label] of [['mostIposAssisted','Most IPOs Assisted','IPOs Assisted'],['mostAttendance','National Activities Attendance','Attendance'],['mostTrainings','Most Trainings Conducted','Trainings'],['mostSubprojects','Most Subprojects Provided','Subprojects']] as const)tables.push({key,title,columns:[...rankOu,column('score',label),...(key==='mostIposAssisted'?[column('target','Target IPOs')]:[])],rows:result.annual[key].map(row=>({...row}))});
    for(const quarter of result.quarters){
        tables.push({key:`${quarter.period}-physical`,title:`${quarter.period} Physical Rankings`,columns:[...rankOu,column('componentPoints','Component Points','score',180),column('rankPoints','Rank Points','score')],rows:quarter.physicalOverall.map(row=>({...row}))});
        tables.push({key:`${quarter.period}-financial`,title:`${quarter.period} Financial Rankings`,columns:[...rankOu,column('allocation','Quarter Allotment','money',190),column('obligation','Obligation','money',190),column('disbursement','Disbursement','money',190),column('obligationRate','Obligation Rate','percent',180),column('disbursementRate','Disbursement Rate','percent',190),column('score','Score','score'),column('points','Points','score')],rows:quarter.financial.map(row=>({...row}))});
    }
    const active=result.quarters.filter(q=>q.isActive);
    tables.push({key:'financial-details',title:'Quarterly Financial Breakdown',filterable:true,columns:[column('period','Quarter','text',110),...rankOu,column('allocation','Quarter Allotment','money',190),column('obligation','Obligation','money',190),column('disbursement','Disbursement','money',190),column('obligationRate','Obligation Rate','percent',180),column('disbursementRate','Disbursement Rate','percent',190),column('score','Score','score'),column('points','Points','score')],rows:active.flatMap(q=>q.financial.map(row=>({...row,period:q.period})))});
    const metricLabels:Record<string,string>={activitiesConducted:'Activities Conducted',trainingsConducted:'Trainings Conducted',iposTrained:'IPOs Trained',subprojectsProvided:'Subprojects Provided',iposAssisted:'IPOs Assisted',reportorialRequired:'Reports Required',reportorialSubmitted:'Reports Submitted',reportorialOnTime:'On Time',reportorialLate:'Late',reportorialMissing:'Missing',reportorialCreditedUnits:'Credited Units',reportorialCompliance:'Reportorial Compliance',nationalRequired:'National Activities Required',nationalAttended:'National Activities Attended',nationalAttendance:'National Attendance',targetsDue:'Targets Due',targetsCompleted:'Targets Completed'};
    tables.push({key:'physical-details',title:'Quarterly Physical Breakdown',filterable:true,columns:[column('period','Quarter','text',110),column('component','Component','text',260),...rankOu,column('points','Points','score'),column('score','Score','score'),column('completionRate','Completion','percent'),...Object.entries(metricLabels).map(([k,label])=>column(k,label,k==='reportorialCompliance'?'percent':'count',Math.max(150,label.length*9)))],rows:active.flatMap(q=>Object.entries(q.physicalComponents).flatMap(([component,rows])=>rows.map(row=>{const {metrics,...values}=row;return {...values,...Object.fromEntries(Object.keys(metricLabels).map(k=>[k,metrics[k]??null])),period:q.period,component:components[component]};})))});
    return tables;
}
