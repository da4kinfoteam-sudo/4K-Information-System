import type { AwardsInputData, AwardManualScore, AwardQuarter, AwardQuarterResult, AwardAnnualMetricBasis, AwardQuarterPhysicalMetrics } from './awardRankings';
import { calculateAwardsDashboardData, normalizeAwardSettings, scoreAwardAnnualMetrics, scoreAwardConsistencyQuarter, awardQuarters } from './awardRankings';
import { awardDate, awardEntryWindowPosition, validateAnnualPolicy } from './awardAnnualPolicy';
import type { AwardAnnualPolicy, AwardDatedAmount } from './awardAnnualPolicy';
import { operatingUnits } from './operatingUnits';
import Decimal from 'decimal.js-light';
import {buildAwardFinancialLineage,groupAwardReplacementLines,awardFinancialKey,type AwardTransferLink} from './awardFinancialLineage';
import { isParentExcludedFromTargets, isBudgetLineExcludedFromTargets } from './budgetLineAdjustments';
import { isActivityExpenseActualEligible } from './activitySupplementalBudget';
import { isTransferAccomplishmentActive } from './budgetItemTransferRules';
import { getFundSourceFilterValue } from './fundSources';
import type { RefFundSource, IPO } from '../constants';
import type { ReportorialPeriod } from './resources';

type JsonRecord=Record<string,any>;
export type AwardDcfType='activities'|'subprojects'|'office_requirements'|'staffing_requirements'|'other_program_expenses';
export interface AwardCalculationIssue {code:string;key:string;message:string;severity:'blocking'|'warning';}
export interface AwardRecognizedEvent extends AwardDatedAmount {kind:'physical'|'obligation'|'disbursement';parentKey:string;lineKey?:string;identityLineKey?:string;basisOnly?:boolean;historicalId?:string;storageId?:string;}
interface FundingContext {ou:string;name:string;entityType:AwardDcfType;parentId:string;uid:string|null;incarnation:string|null;sourceFundYear:number|null;fundType:string|null;tier:string|null;fundSourceUid:string|null;fundSource:string|null;}
export interface AwardPhysicalCarry extends FundingContext {kind:'physical';key:string;targetDate:string|null;component:string;subtype:string;ipoKeys:string[];}
interface FinancialLineage {basisOriginKey?:string;basisSourceFundYear?:number|null;basisOu?:string;transferIds?:string[];replacementItemIds?:string[];recordTargetEligible?:boolean;}
export interface AwardFinancialCarry extends FundingContext,FinancialLineage {
    kind:'financial';key:string;itemId:string|null;originalBasis:number;targetEligible:boolean;
    closingAllotment:number;closingUnpaidObligations:number;targetClosing:number;
}
export type AwardCarry=AwardPhysicalCarry|AwardFinancialCarry;
interface CapturedStage {source:string;entries:JsonRecord[];calendarYearKnown?:boolean;}
interface CapturedLine {itemId:string|null;line:JsonRecord;obligation:CapturedStage;disbursement:CapturedStage;}
interface CapturedParent {entityType:AwardDcfType;record:JsonRecord;financial:CapturedLine[];revision:JsonRecord|null;unmatchedFinancial:JsonRecord[];physicalEntries?:JsonRecord[];}
export interface AwardSourceCapture {
    id:string;awards_year:number;source_hash:string;source_data_as_of:string;scope:JsonRecord;
    inputs:{schemaVersion:1;awardsYear:number;scope:JsonRecord;policy:AwardAnnualPolicy;settings:unknown;manual:AwardManualScore[];records:CapturedParent[];
        fundSourceReferences:RefFundSource[];ipoReferences:IPO[];reportorialPeriods:JsonRecord[];dependencies:JsonRecord[];transferLinks?:AwardTransferLink[];
        baseline:null|{id:string;awardsYear:number;policy:AwardAnnualPolicy;carryHash:string;carry:AwardCarry[];recognizedEvents:AwardRecognizedEvent[]};};
}
interface PhysicalEvidence extends FundingContext {
    kind:'physical';key:string;targetDate:string|null;actualDate:string|null;component:string;subtype:string;ipoKeys:string[];
    targetEligible:boolean;includedTarget:boolean;includedActual:boolean;carriedIn:boolean;carriedOut:boolean;
}
interface FinancialEvidence extends FundingContext,FinancialLineage {
    kind:'financial';key:string;itemId:string|null;originalBasis:number;targetEligible:boolean;carriedIn:boolean;
    openingAllotment:number;openingUnpaidObligations:number;targetOpening:number;obligations:number;disbursements:number;
    obligationBasis:number;closingAllotment:number;closingUnpaidObligations:number;targetClosing:number;
    includedObligationIds:string[];includedDisbursementIds:string[];
}
const dcfTypes:AwardDcfType[]=['activities','subprojects','office_requirements','staffing_requirements','other_program_expenses'];
const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const object=(v:unknown):v is JsonRecord=>!!v&&typeof v==='object'&&!Array.isArray(v);
const validAmount=(v:unknown)=>typeof v==='number'?Number.isFinite(v):typeof v==='string'&&v.trim()!==''&&Number.isFinite(Number(v));
const Amount=Decimal.clone({precision:40});
const numberFor=(value:Decimal)=>{
    const number=value.toNumber();
    if(!Number.isFinite(number))throw Object.assign(new Error('Financial values exceed the supported calculation range.'),{code:'AWARDS_NUMERIC_RANGE'});
    return number;
};
const total=(values:number[])=>numberFor(values.reduce((sum,value)=>sum.plus(value),new Amount(0)));
const add=(a:number,b:number)=>numberFor(new Amount(a).plus(b));
const subtract=(a:number,b:number)=>numberFor(new Amount(a).minus(b));
const rate=(actual:number,basis:number)=>basis!==0?numberFor(new Amount(actual).dividedBy(basis).times(100)):0;
const allocationFor=(line:JsonRecord)=>{
    const value=(v:unknown)=>validAmount(v)?String(v).trim():'0';
    if(line.amount!==undefined)return numberFor(new Amount(value(line.amount)));
    if(line.pricePerUnit!==undefined||line.numberOfUnits!==undefined)return numberFor(new Amount(value(line.pricePerUnit)).times(value(line.numberOfUnits)));
    return numberFor(new Amount(value(line.annualSalary)));
};
const parentKey=(type:AwardDcfType,id:unknown)=>`${type}:${String(id)}`;
const lineKey=(parent:string,item:unknown)=>`${parent}:line:${item??'$parent'}`;
const equalEvent=(a:AwardRecognizedEvent,b:AwardRecognizedEvent)=>a.kind===b.kind&&a.amount===b.amount&&a.date===b.date&&a.month===b.month&&a.precision===b.precision;
const quarterDates=(year:number,q:AwardQuarter)=>{
    const index=awardQuarters.indexOf(q),start=`${year}-${String(index*3+1).padStart(2,'0')}-01`;
    return {start,end:new Date(Date.UTC(year,index*3+3,0)).toISOString().slice(0,10)};
};
const earlier=(a:string,b:string)=>a<b?a:b;
const later=(a:string,b:string)=>a>b?a:b;
const manilaDay=(value:string)=>{
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value));
    return ['year','month','day'].map(type=>parts.find(p=>p.type===type)!.value).join('-');
};

function assertCapture(value:unknown):asserts value is AwardSourceCapture {
    if(!object(value)||!object(value.inputs)||value.inputs.schemaVersion!==1||!Number.isInteger(value.awards_year)||value.awards_year!==value.inputs.awardsYear||!object(value.scope)||JSON.stringify(value.scope)!==JSON.stringify(value.inputs.scope)||typeof value.source_hash!=='string'||!Number.isFinite(Date.parse(value.source_data_as_of)))throw new Error('The Awards source capture is invalid. Review a fresh calculation.');
    const input=value.inputs,scope=value.scope;
    for(const key of ['ous','tiers','fundTypes','fundSources','sourceFundYears'])if(scope[key]!==null&&(!Array.isArray(scope[key])||scope[key].some((v:unknown)=>typeof v!=='string')))throw new Error('The captured comparison scope is invalid.');
    if(!Array.isArray(scope.ous)||!scope.ous.length||scope.ous.some((ou:string)=>!operatingUnits.includes(ou))||new Set(scope.ous).size!==scope.ous.length)throw new Error('Choose valid comparison operating units.');
    for(const key of ['records','manual','fundSourceReferences','ipoReferences','reportorialPeriods','dependencies'])if(!Array.isArray(input[key]))throw new Error('Captured Awards evidence is incomplete.');
    if(input.transferLinks!==undefined){
        if(!Array.isArray(input.transferLinks)||input.transferLinks.length>20000)throw new Error('Captured transfer lineage is invalid.');
        for(const link of input.transferLinks)if(!object(link)||!['activities','subprojects'].includes(link.entityType)||typeof link.id!=='string'||typeof link.sourceId!=='string'||typeof link.destinationId!=='string'||link.sourceId===link.destinationId||!scope.ous.includes(link.sourceOu)||!scope.ous.includes(link.destinationOu)||!Array.isArray(link.itemIds)||!link.itemIds.length||link.itemIds.some((id:unknown)=>typeof id!=='string'||!id)||!Number.isFinite(Date.parse(link.resolvedAt)))throw new Error('Captured transfer lineage is outside the validated comparison scope.');
    }
    if(input.records.length>10000)throw new Error('The captured Awards scope exceeds the calculation limit.');
    for(const p of input.records){
        if(!object(p)||!dcfTypes.includes(p.entityType)||!object(p.record)||p.record.id==null||!Array.isArray(p.financial)||!Array.isArray(p.unmatchedFinancial))throw new Error('Captured DCF evidence is invalid.');
        if(!scope.ous.includes(p.record.operatingUnit))throw new Error('Captured DCF evidence is outside the comparison scope.');
        for(const [key,field] of [['tiers','tier'],['fundTypes','fundType'],['sourceFundYears',p.entityType==='activities'||p.entityType==='subprojects'?'fundingYear':'fundYear']])if(scope[key]!==null&&!scope[key].includes(String(p.record[field])))throw new Error('Captured DCF evidence does not match its funding scope.');
        if(scope.fundSources!==null&&!scope.fundSources.includes(getFundSourceFilterValue(p.record,input.fundSourceReferences)))throw new Error('Captured DCF evidence does not match its Fund Source scope.');
        for(const line of p.financial)if(!object(line)||!object(line.line)||!object(line.obligation)||!object(line.disbursement)||!Array.isArray(line.obligation.entries)||!Array.isArray(line.disbursement.entries))throw new Error('Captured financial evidence is incomplete.');
    }
    if(input.baseline!==null){
        const b=input.baseline;
        if(!object(b)||!Array.isArray(b.carry)||!Array.isArray(b.recognizedEvents)||b.awardsYear!==value.awards_year-1||b.id!==input.policy.baselineResultId)throw new Error('The selected opening baseline is invalid.');
        const keys=new Set<string>();
        for(const row of b.carry){
            if(!object(row)||!['physical','financial'].includes(row.kind)||typeof row.key!=='string'||keys.has(row.key)||!scope.ous.includes(row.ou))throw new Error('The stored opening carry is invalid.');keys.add(row.key);
            if(row.kind==='financial'&&['originalBasis','closingAllotment','closingUnpaidObligations','targetClosing'].some(k=>typeof row[k]!=='number'||!Number.isFinite(row[k])))throw new Error('The stored financial opening basis is invalid.');
            if(row.kind==='physical'&&!Array.isArray(row.ipoKeys))throw new Error('The stored physical opening basis is invalid.');
        }
        const ids=new Set<string>();for(const e of b.recognizedEvents){if(!object(e)||typeof e.id!=='string'||ids.has(e.id)||!['physical','obligation','disbursement'].includes(e.kind)||typeof e.amount!=='number'||!Number.isFinite(e.amount))throw new Error('The stored recognized-event ledger is invalid.');ids.add(e.id);}
    }
}

// Hydration is local-only. An empty authoritative stage clears every scalar/monthly fallback.
function hydrate(parent:CapturedParent):JsonRecord {
    const r=structuredClone(parent.record);
    const apply=(line:JsonRecord,c:CapturedLine)=>{
        const result={...line};
        for(const stage of ['obligation','disbursement'] as const){
            const s=c[stage];if(!['central','embedded'].includes(s.source))continue;
            const title=stage==='obligation'?'Obligation':'Disbursement';
            result[stage+'s']=s.entries.map(e=>({id:e.id,date:e.date,amount:Number(e.amount),remarks:e.remarks||''}));
            result['actual'+title+'Amount']=total(s.entries.map(e=>validAmount(e.amount)?Number(e.amount):0));
            result['actual'+title+'Date']=s.entries.map(e=>awardDate(e.date)).filter(Boolean).sort().at(-1)||undefined;
            if(stage==='disbursement')for(const month of months)result['actualDisbursement'+month]=0;
        }
        return result;
    };
    if(parent.entityType==='subprojects')r.details=parent.financial.map(c=>apply(c.line,c));
    else if(parent.entityType==='activities'||parent.entityType==='staffing_requirements'&&Array.isArray(r.expenses)&&r.expenses.length)r.expenses=parent.financial.map(c=>apply(c.line,c));
    else if(parent.financial.length)Object.assign(r,apply(r,parent.financial[0]));
    return r;
}

export function calculateCapturedAwards(value:unknown){
    assertCapture(value);const capture=structuredClone(value),input=capture.inputs,policy=validateAnnualPolicy(input.policy),year=capture.awards_year;
    if(policy.awardsYear!==year)throw new Error('The policy and captured Awards Year differ.');
    const issues:AwardCalculationIssue[]=[];
    const issue=(code:string,key:string,message:string,severity:'blocking'|'warning'='blocking')=>{if(!issues.some(i=>i.code===code&&i.key===key))issues.push({code,key,message,severity});};
    const approved=input.records.filter(p=>(!p.record.workflow_status||p.record.workflow_status==='APPROVED')&&isTransferAccomplishmentActive(p.record)).filter(p=>{
        const r=p.record,fundYear=Number(r.fundingYear??r.fundYear);
        if(!Number.isFinite(fundYear)||fundYear<=year)return true;
        const physicalDate=awardDate(r.actualCompletionDate||r.actualDate||r.actualObligationDate),target=awardDate(r.estimatedCompletionDate||r.endDate||r.date||r.physicalDeliveryDate);
        if(physicalDate&&physicalDate<=policy.physicalCutoff||target&&target<=policy.physicalCutoff)return true;
        return p.financial.some(line=>(['obligation','disbursement'] as const).some(stage=>line[stage].entries.some(e=>!awardDate(e.date)||e.date<=policy.financialCutoff)));
    });
    const hydrated=approved.map(p=>({type:p.entityType,record:hydrate(p)}));
    const hydratedByKey=new Map(hydrated.map(p=>[parentKey(p.type,p.record.id),p.record]));
    const data: AwardsInputData={operatingUnitScope:input.scope.ous,subprojects:[],trainings:[],otherActivities:[],officeReqs:[],staffingReqs:[],otherProgramExpenses:[],ipos:input.ipoReferences};
    for(const p of hydrated){const r=p.record as any;if(p.type==='subprojects')data.subprojects.push(r);else if(p.type==='activities')(r.type==='Training'?data.trainings:data.otherActivities).push(r);else if(p.type==='office_requirements')data.officeReqs.push(r);else if(p.type==='staffing_requirements')data.staffingReqs.push(r);else data.otherProgramExpenses.push(r);}
    const periods=input.reportorialPeriods.map(p=>({reporting_year:year,quarter:p.quarter,source:p.source,state:p.state,version:p.version,snapshot_id:p.snapshotId,
        ...(p.summary?{summary:{...p.summary,cutoff:p.summary.cutoff||capture.source_data_as_of}}:{})})) as ReportorialPeriod[];
    const settings=normalizeAwardSettings(input.settings);
    const sourceDay=manilaDay(capture.source_data_as_of),referenceDate=new Date(sourceDay+'T12:00:00');
    const results=calculateAwardsDashboardData(data,String(year),settings,input.manual,periods,referenceDate);
    const physical:PhysicalEvidence[]=[],financial:FinancialEvidence[]=[],carry:AwardCarry[]=[],unresolvedEvents:JsonRecord[]=[];
    const recognized=new Map<string,AwardRecognizedEvent>((input.baseline?.recognizedEvents||[]).map(e=>[e.id,structuredClone(e)]));
    const incoming=new Map<string,AwardCarry>((input.baseline?.carry||[]).map(c=>[c.key,structuredClone(c)]));
    const transferPath=buildAwardFinancialLineage(input.transferLinks||[]),claimedOpeningKeys=new Set<string>();
    const capturedParents=new Map(approved.map(p=>[parentKey(p.entityType,p.record.id),p]));
    const baselineEventIds=new Set((input.baseline?.recognizedEvents||[]).map(e=>e.id));
    const historicalEvents=new Map<string,AwardRecognizedEvent[]>();
    const previousEventsByLine=new Map<string,AwardRecognizedEvent[]>();
    for(const event of input.baseline?.recognizedEvents||[])if(event.kind!=='physical'&&event.lineKey){
        const key=event.identityLineKey||event.lineKey;
        previousEventsByLine.set(key,[...(previousEventsByLine.get(key)||[]),event]);
    }
    for(const event of recognized.values())if(event.historicalId&&event.lineKey){
        const key=`${event.kind}:${event.identityLineKey||event.lineKey}:${event.historicalId}`;
        historicalEvents.set(key,[...(historicalEvents.get(key)||[]),event]);
    }
    const visited=new Set<string>(),seenParents=new Set<string>(),seenCurrentEvents=new Set<string>();
    const funding=(p:CapturedParent):FundingContext=>({ou:p.record.operatingUnit,name:p.record.activity_title||p.record.name||p.record.equipment||p.record.personnelPosition||p.record.particulars||String(p.record.id),entityType:p.entityType,parentId:String(p.record.id),uid:p.record.uid||null,incarnation:p.revision?.incarnation||null,
        sourceFundYear:p.record.fundingYear??p.record.fundYear??null,fundType:p.record.fundType??null,tier:p.record.tier??null,fundSourceUid:p.record.fundSourceUid??null,fundSource:p.record.fundSource??null});
    const identity=(current:FundingContext,previous:AwardCarry|undefined,key:string)=>{
        if(previous&&(previous.ou!==current.ou||previous.uid&&current.uid&&previous.uid!==current.uid||previous.incarnation&&current.incarnation&&previous.incarnation!==current.incarnation))issue('identity_changed',key,'The source identity or operating unit differs from its finalized opening basis. Reconcile the earlier version.');
    };
    const ipoKeys=(r:JsonRecord,type:AwardDcfType)=>{
        if(type==='subprojects')return r.ipo_id!=null?[`ipo:${r.ipo_id}`]:r.indigenousPeopleOrganization?[`legacy:${String(r.indigenousPeopleOrganization).trim()}`]:[];
        if(type!=='activities')return [];
        const ids=Array.isArray(r.participating_ipo_ids)?r.participating_ipo_ids.filter((id:unknown)=>/^\d+$/.test(String(id))):[];
        const names=Array.isArray(r.participatingIpos)?r.participatingIpos:[];
        return [...new Set<string>(ids.length?ids.map((id:unknown)=>`ipo:${id}`):names.map((name:unknown)=>`legacy:${String(name).trim()}`).filter((name:string)=>name!=='legacy:'))];
    };
    const consume=(event:AwardRecognizedEvent,windowStart:string,windowEnd:string,affectsOpening=false)=>{
        if(seenCurrentEvents.has(event.id)){issue('duplicate_event',event.id,'A financial or physical event identity occurs more than once.');return 'invalid';}seenCurrentEvents.add(event.id);
        if(!Number.isFinite(event.amount)){issue('invalid_amount',event.id,'A reported amount is invalid.');unresolvedEvents.push(event);return 'invalid';}
        const previous=recognized.get(event.id);
        if(previous){if(!equalEvent(previous,event)){issue('historical_event_changed',event.id,'A previously recognized event was edited. Amend its original Awards Year instead of recognizing it again.');unresolvedEvents.push(event);}return 'recognized';}
        const position=awardEntryWindowPosition(event,windowStart,windowEnd);
        if(position==='invalid'||position==='ambiguous'){issue('ambiguous_date',event.id,event.precision==='month'?'A legacy monthly amount has an unknown actual year or crosses a cutoff. Review dated evidence; Fund Year is not its actual year.':'A reported event has no valid actual date.');unresolvedEvents.push(event);return 'invalid';}
        if(position==='prior'&&input.baseline){
            issue('late_prior_event',event.id,affectsOpening?'This newly available prior-period event changes a frozen opening basis. Reconcile its earlier Awards Year before finalizing.':'This late-available event belongs to an earlier recognition window, not current accomplishments. It is retained as opening evidence without rewriting the earlier finalized result.',affectsOpening?'blocking':'warning');
            if(affectsOpening){unresolvedEvents.push(event);return 'prior-unrecognized';}
        }
        if(position!=='future')recognized.set(event.id,{...event,...(position==='prior'?{basisOnly:true}:{})});
        return position;
    };
    if(policy.mode==='Cutoff')for(const p of approved){
        const key=parentKey(p.entityType,p.record.id),r=hydratedByKey.get(key)!,context=funding(p);
        if(seenParents.has(key))throw new Error('A captured source parent occurs more than once.');seenParents.add(key);
        if(p.unmatchedFinancial.length){issue('unmatched_ledger',key,'Reported financial entries no longer match a current budget item. Reconcile them before finalization.');unresolvedEvents.push(...p.unmatchedFinancial.map(e=>({...e,parentKey:key})));}
        if(p.entityType!=='other_program_expenses'){
            const physicalKey=`physical:${key}`,prior=incoming.get(physicalKey) as AwardPhysicalCarry|undefined;visited.add(physicalKey);identity(context,prior,physicalKey);
            const targetDate=awardDate(p.entityType==='subprojects'?r.estimatedCompletionDate:p.entityType==='activities'?r.endDate||r.date:r.physicalDeliveryDate||r.obligationDate);
            const rawDate=p.entityType==='subprojects'?r.actualCompletionDate:p.entityType==='activities'?r.actualDate:r.actualDate||r.actualObligationDate;
            const complete=r.status!=='Cancelled'&&(p.entityType!=='subprojects'||r.status==='Completed')&&!!rawDate;
            const actualDate=complete?awardDate(rawDate):null;
            const targetEligible=!isParentExcludedFromTargets(r),component=p.entityType==='subprojects'?'Production and Livelihood':p.entityType==='activities'?r.component||'Program Management':'Program Management';
            const subtype=p.entityType==='activities'?r.type:p.entityType,ids=ipoKeys(r,p.entityType);
            let includedActual=false;
            if(complete){const pos=consume({id:physicalKey,kind:'physical',parentKey:key,date:actualDate,precision:'day',amount:1},policy.physicalStart,policy.physicalCutoff,!!prior);includedActual=pos==='current';}
            if(r.status==='Completed'&&!actualDate)issue('missing_physical_date',physicalKey,'A completed source has no valid actual completion/conduct date.');
            const pastComplete=!!actualDate&&actualDate<policy.physicalStart;
            const previouslyRecognized=baselineEventIds.has(physicalKey);
            const includedTarget=targetEligible&&(!previouslyRecognized||!!prior)&&(!!prior||!!targetDate&&targetDate<=policy.physicalCutoff&&!pastComplete||includedActual);
            if(includedTarget&&!targetDate&&!prior)issue('missing_target_date',physicalKey,'A physical target has no valid planned completion date.');
            const carriedOut=includedTarget&&!includedActual;
            physical.push({...context,kind:'physical',key:physicalKey,targetDate:targetDate||prior?.targetDate||null,actualDate,component,subtype,ipoKeys:ids,targetEligible,includedTarget,includedActual,carriedIn:!!prior,carriedOut});
            if(carriedOut)carry.push({...context,kind:'physical',key:physicalKey,targetDate:targetDate||prior?.targetDate||null,component,subtype,ipoKeys:ids});
        }
        const seenLines=new Set<string>();
        const annualLines=groupAwardReplacementLines(p.entityType,String(p.record.id),p.financial,(key,message)=>issue('ambiguous_replacement_lineage',key,message));
        for(const c of annualLines){
            const k=lineKey(key,c.itemId),line=c.line;if(seenLines.has(k)){issue('duplicate_line',k,'Budget item identities are duplicated.');continue;}seenLines.add(k);
            if(c.itemId==null&&(p.entityType==='activities'||p.entityType==='subprojects'||p.entityType==='staffing_requirements'&&Array.isArray(r.expenses)&&r.expenses.length))issue('missing_line_identity',k,'A budget item has no stable identity for reconciliation.');
            if(!isActivityExpenseActualEligible(line))continue;
            visited.add(k);
            const path=transferPath(k);
            if(path.ambiguous)issue('ambiguous_transfer_lineage',k,'The applied transfer lineage contains competing origins or a cycle. Review it before finalization.');
            const priorKey=path.keys.find(key=>incoming.get(key)?.kind==='financial'),prior=priorKey?incoming.get(priorKey) as AwardFinancialCarry:undefined,moved=!!priorKey&&priorKey!==k;
            if(priorKey){if(claimedOpeningKeys.has(priorKey))issue('duplicate_opening_basis',k,'More than one current item claims the same finalized opening balance.');claimedOpeningKeys.add(priorKey);visited.add(priorKey);}
            if(moved){const source=capturedParents.get(parentKey(prior!.entityType,prior!.parentId));if(source)identity(funding(source),prior,priorKey!);}
            else identity(context,prior,k);
            if(!prior&&context.sourceFundYear!=null&&context.sourceFundYear>year&&!(['obligation','disbursement'] as const).some(stage=>c[stage].entries.some(e=>!awardDate(e.date)||e.date<=policy.financialCutoff)))continue;
            const replacementPool=!!c.replacementItemIds?.length;
            const originalBasis=replacementPool&&validAmount(line.originalPlannedAmount)?Number(line.originalPlannedAmount):allocationFor(line),recordTargetEligible=!isParentExcludedFromTargets(r)&&!isBudgetLineExcludedFromTargets(line,p.entityType==='subprojects'?r.status:undefined);
            const continuedTransferBasis=!!prior&&(moved||!!prior.basisOriginKey&&r.isTransferTargetExcluded===true);
            const replacementEligible=replacementPool&&!isParentExcludedFromTargets(r)&&!isBudgetLineExcludedFromTargets({...line,isSuperseded:false},r.status);
            const targetEligible=continuedTransferBasis||replacementPool&&!!prior?prior!.targetEligible:replacementPool?replacementEligible:recordTargetEligible;
            const lineage:FinancialLineage={...(continuedTransferBasis?{basisOriginKey:prior!.basisOriginKey||priorKey!,basisSourceFundYear:prior!.basisSourceFundYear??prior!.sourceFundYear,basisOu:prior!.basisOu||prior!.ou,
                transferIds:[...new Set([...(prior!.transferIds||[]),...path.transferIds])],recordTargetEligible}:{}),...(replacementPool?{replacementItemIds:c.replacementItemIds,recordTargetEligible}:{})};
            for(const field of ['amount','pricePerUnit','numberOfUnits','annualSalary','actualObligationAmount','actualDisbursementAmount',...months.map(m=>'actualDisbursement'+m)])if(line[field]!=null&&line[field]!==''&&!validAmount(line[field]))issue('invalid_financial_value',k+':'+field,'A planned or reported financial value is invalid. Its source value is retained for review.');
            if(prior&&originalBasis!==prior.originalBasis)issue('financial_basis_changed',k,'The original funding basis differs from the frozen opening basis. Review the funding change before finalizing.');
            if(prior&&!continuedTransferBasis&&targetEligible!==prior.targetEligible)issue('target_classification_changed',k,'Target eligibility changed after finalization. Reconcile the earlier funding classification.');
            let oldO=0,oldD=0,newO=0,newD=0;const oIds:string[]=[],dIds:string[]=[];
            const identityKeys=new Set([k,...(c.replacementItemIds||[]).map(item=>lineKey(key,item))].flatMap(item=>transferPath(item).keys));
            for(const stage of ['obligation','disbursement'] as const)for(const entry of c[stage].entries){
                const storageSource=c[stage].source==='composite'?entry.awardStorageSource:c[stage].source,identityKey=c[stage].source==='composite'?entry.awardOriginLineKey:k;
                const storageId=storageSource==='central'?`${stage}:central:${entry.id}`:`${stage}:${identityKey}:${entry.id??'missing'}`;
                const aliases=storageSource==='central'&&Array.isArray(entry.historicalIds)?entry.historicalIds.filter((id:unknown)=>typeof id==='string').map((id:string)=>({key:identityKey,id})):[];
                if(storageSource==='central'&&Array.isArray(entry.historicalLinks))for(const link of entry.historicalLinks){
                    if(!object(link)||typeof link.parentId!=='string'||typeof link.itemId!=='string'||typeof link.historicalId!=='string')continue;
                    const key=awardFinancialKey(p.entityType,link.parentId,link.itemId||null);
                    if(identityKeys.has(key))aliases.push({key,id:link.historicalId});
                }
                const linked=[...new Map<string,AwardRecognizedEvent>(aliases.flatMap(({key,id}:{key:string;id:string})=>(historicalEvents.get(`${stage}:${key}:${id}`)||[]).map(event=>[event.id,event] as const))).values()];
                if(storageSource!=='central'&&moved)for(const key of path.keys.slice(1)){const event=recognized.get(`${stage}:${key}:${entry.id}`);if(event&&!linked.some(e=>e.id===event.id))linked.push(event);}
                if(linked.length>1)issue('ambiguous_financial_lineage',storageId,'More than one previously recognized event maps to this current entry. Review its stored financial lineage before finalizing.');
                const previous=linked.length===1?linked[0]:undefined,id=previous?.id||storageId;
                if(entry.id==null){issue('missing_event_identity',id,'A reported financial entry has no identity.');unresolvedEvents.push({...entry,parentKey:key,lineKey:k,stage});continue;}
                const e:AwardRecognizedEvent={id,storageId,kind:stage,parentKey:key,lineKey:k,identityLineKey:identityKey,date:entry.date??null,amount:validAmount(entry.amount)?Number(entry.amount):NaN,precision:entry.precision==='month'?'month':'day',
                    ...(previous?.historicalId||typeof entry.historicalId==='string'?{historicalId:previous?.historicalId||entry.historicalId}:{}),...(entry.precision==='month'?{month:entry.month??null}:{})};
                const pos=consume(e,policy.financialStart,policy.financialCutoff,!!prior);
                if(pos==='prior'){if(stage==='obligation')oldO=add(oldO,e.amount);else oldD=add(oldD,e.amount);}
                if(pos==='current'){if(stage==='obligation'){newO=add(newO,e.amount);oIds.push(id);}else{newD=add(newD,e.amount);dIds.push(id);}}
            }
            for(const old of [...identityKeys].flatMap(key=>previousEventsByLine.get(key)||[]))if(!seenCurrentEvents.has(old.id)){
                issue('historical_event_missing',old.id,'A previously recognized financial entry is absent from this captured source. Its frozen evidence and balances are retained; reconcile its original Awards Year before finalizing.');
                unresolvedEvents.push({...old,missingFromCurrentSource:true});
            }
            const openingAllotment=prior?.closingAllotment??subtract(originalBasis,oldD),openingUnpaidObligations=prior?.closingUnpaidObligations??subtract(oldO,oldD);
            const targetOpening=targetEligible?(prior?.targetClosing??openingAllotment):0,obligationBasis=add(openingUnpaidObligations,newO);
            const closingAllotment=subtract(openingAllotment,newD),closingUnpaidObligations=subtract(obligationBasis,newD),targetClosing=targetEligible?subtract(targetOpening,newD):0;
            if([openingAllotment,openingUnpaidObligations,closingAllotment,closingUnpaidObligations].some(n=>n<0))issue('negative_financial_basis',k,'Reported actuals exceed a funding or obligation basis. Amounts are retained without clamping; review the reconciliation.','warning');
            financial.push({...context,...lineage,kind:'financial',key:k,itemId:c.itemId,originalBasis,targetEligible,carriedIn:!!prior,openingAllotment,openingUnpaidObligations,targetOpening,obligations:newO,disbursements:newD,obligationBasis,closingAllotment,closingUnpaidObligations,targetClosing,includedObligationIds:oIds,includedDisbursementIds:dIds});
            carry.push({...context,...lineage,kind:'financial',key:k,itemId:c.itemId,originalBasis:prior?.originalBasis??originalBasis,targetEligible,closingAllotment,closingUnpaidObligations,targetClosing});
        }
    }
    if(policy.mode==='Cutoff')for(const row of incoming.values())if(!visited.has(row.key)){
        carry.push(row);
        if(row.kind==='physical'){
            issue('missing_opening_source',row.key,'An unfinished physical target is absent from the current source. Its opening target is retained until reconciled.');
            physical.push({...row,actualDate:null,targetEligible:true,includedTarget:true,includedActual:false,carriedIn:true,carriedOut:true});
        }else{
            if(row.closingAllotment!==0||row.closingUnpaidObligations!==0)issue('missing_opening_source',row.key,'An outstanding financial source is absent. Its finalized remaining basis is retained until reconciled.');
            financial.push({...row,carriedIn:true,openingAllotment:row.closingAllotment,openingUnpaidObligations:row.closingUnpaidObligations,targetOpening:row.targetClosing,obligations:0,disbursements:0,obligationBasis:row.closingUnpaidObligations,includedObligationIds:[],includedDisbursementIds:[]});
        }
    }
    const ous:string[]=input.scope.ous;
    const financialByKey=new Map(financial.map(row=>[row.key,row]));
    const financialByOu=new Map(ous.map(ou=>[ou,financial.filter(row=>row.ou===ou)]));
    const financialEventsByOu=new Map(ous.map(ou=>[ou,[] as AwardRecognizedEvent[]]));
    for(const event of recognized.values()){
        if(event.kind==='physical'||!event.lineKey)continue;
        const row=financialByKey.get(event.lineKey);if(row)financialEventsByOu.get(row.ou)?.push(event);
    }
    const financialRows=ous.map(ou=>{
        const rows=financialByOu.get(ou)!,allocation=total(rows.map(r=>r.targetOpening)),obligation=total(rows.map(r=>r.obligationBasis)),disbursement=total(rows.map(r=>r.disbursements));
        return {ou,allocation,obligation,disbursement,disbursementVsAllotmentRate:rate(disbursement,allocation),disbursementVsObligationRate:rate(disbursement,obligation)};
    });
    const physicalRate=(rows:PhysicalEvidence[])=>rate(rows.filter(r=>r.includedTarget&&r.includedActual).length,rows.filter(r=>r.includedTarget).length);
    const countIpos=(rows:PhysicalEvidence[])=>new Set(rows.flatMap(r=>r.ipoKeys)).size;
    const basis:AwardAnnualMetricBasis={financial:financialRows,physical:ous.map(ou=>({ou,physicalCompletionRate:physicalRate(physical.filter(r=>r.ou===ou))})),counts:{
        iposAssisted:ous.map(ou=>({ou,value:countIpos(physical.filter(r=>r.ou===ou&&r.includedActual)),target:countIpos(physical.filter(r=>r.ou===ou&&r.includedTarget))})),
        trainings:ous.map(ou=>({ou,value:physical.filter(r=>r.ou===ou&&r.includedActual&&r.entityType==='activities'&&r.subtype==='Training').length})),
        subprojects:ous.map(ou=>({ou,value:physical.filter(r=>r.ou===ou&&r.includedActual&&r.entityType==='subprojects').length})),
    }};
    const consistencyQuarters:AwardQuarterResult[]=policy.mode==='Cutoff'?awardQuarters.map(q=>{
        const ordinary=results.quarters.find(row=>row.period===q)!;if(!ordinary.isActive)return structuredClone(ordinary);
        const range=quarterDates(year,q),physicalStart=later(range.start,policy.physicalStart),physicalEnd=earlier(range.end,policy.physicalCutoff),financialStart=later(range.start,policy.financialStart),financialEnd=earlier(range.end,policy.financialCutoff);
        const actual=(r:PhysicalEvidence)=>r.includedActual&&!!r.actualDate&&r.actualDate>=physicalStart&&r.actualDate<=physicalEnd;
        const complete=(rows:PhysicalEvidence[])=>{
            const due=rows.filter(r=>r.includedTarget&&(!r.targetDate||r.targetDate<=physicalEnd)&&!(r.includedActual&&r.actualDate!<physicalStart));
            const done=due.filter(actual);return {targetsDue:due.length,targetsCompleted:done.length,completionRate:rate(done.length,due.length)};
        };
        const metrics:AwardQuarterPhysicalMetrics={socialPrep:[],productionLivelihood:[],marketingEnterprise:[],programManagement:[]};
        for(const ou of ous){
            const rows=physical.filter(r=>r.ou===ou),sp=rows.filter(r=>r.component==='Social Preparation'),pl=rows.filter(r=>r.component==='Production and Livelihood'),me=rows.filter(r=>r.component==='Marketing and Enterprise'),pm=rows.filter(r=>r.component==='Program Management');
            metrics.socialPrep.push({ou,...complete(sp),activitiesConducted:sp.filter(actual).length,iposTrained:countIpos(sp.filter(actual))});
            metrics.productionLivelihood.push({ou,...complete(pl),trainingsConducted:pl.filter(r=>actual(r)&&r.subtype==='Training').length,subprojectsProvided:pl.filter(r=>actual(r)&&r.entityType==='subprojects').length,iposAssisted:countIpos(pl.filter(actual))});
            metrics.marketingEnterprise.push({ou,...complete(me),activitiesConducted:me.filter(actual).length,iposAssisted:countIpos(me.filter(actual))});
            const manual=ordinary.physicalComponents.programManagement.find(r=>r.ou===ou)?.metrics||{};
            metrics.programManagement.push({ou,...complete(pm),reportorialRequired:manual.reportorialRequired||0,reportorialSubmitted:manual.reportorialSubmitted||0,reportorialCompliance:manual.reportorialCompliance||0,nationalRequired:manual.nationalRequired||0,nationalAttended:manual.nationalAttended||0,nationalAttendance:manual.nationalAttendance||0,
                ...(manual.reportorialRepository?{reportorialRepository:1,reportorialOnTime:manual.reportorialOnTime,reportorialLate:manual.reportorialLate,reportorialMissing:manual.reportorialMissing,reportorialCreditedUnits:manual.reportorialCreditedUnits}:{})});
        }
        const f=ous.map(ou=>{
            const rows=financialByOu.get(ou)!,events=financialEventsByOu.get(ou)!;
            const disbursement=total(events.filter(e=>e.kind==='disbursement'&&awardEntryWindowPosition(e,financialStart,financialEnd)==='current').map(e=>e.amount));
            const obligation=total(events.filter(e=>e.kind==='obligation'&&awardEntryWindowPosition(e,financialStart,financialEnd)==='current').map(e=>e.amount));
            const allocated=total(rows.map(r=>r.targetOpening)),previousPayments=total(events.filter(e=>e.kind==='disbursement'&&e.date&&e.date>=policy.financialStart&&e.date<financialStart&&financialByKey.get(e.lineKey!)?.targetEligible).map(e=>e.amount));
            return {ou,allocation:subtract(allocated,previousPayments),obligation,disbursement};
        });
        return scoreAwardConsistencyQuarter(ous,q,metrics,f,settings);
    }):[];
    if(policy.mode==='Cutoff')results.annual=scoreAwardAnnualMetrics(ous,year,settings,input.manual,consistencyQuarters,basis);
    const sortedCarry=carry.sort((a,b)=>a.key.localeCompare(b.key));
    return {schemaVersion:1 as const,formulaVersion:'awards-v2',awardsYear:year,scope:input.scope,policy,policyVersion:(input as unknown as JsonRecord).policyVersion??null,settings:input.settings,normalizedSettings:settings,results,consistencyQuarters,
        reconciliation:{physical,financial,unresolvedEvents,issues},carry:sortedCarry,recognizedEvents:[...recognized.values()].sort((a,b)=>a.id.localeCompare(b.id)),
        sourceDataAsOf:capture.source_data_as_of,sourceHash:capture.source_hash,sourceCaptureId:capture.id,
        sourceReferences:approved.map(p=>({entityType:p.entityType,parentId:String(p.record.id),uid:p.record.uid||null,revision:p.revision})),
        fundSourceReferences:input.fundSourceReferences,reportorialPeriods:periods,canFinalize:!issues.some(i=>i.severity==='blocking')};
}
