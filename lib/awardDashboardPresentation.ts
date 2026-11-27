import {awardRankingTables,type AwardSnapshot,type AwardViewColumn,type AwardViewTable} from './awardResultView';

const column=(key:string,label:string,kind:AwardViewColumn['kind']='count',width=155):AwardViewColumn=>({key,label,kind,width});
const ranking=[column('rank','Rank','count',75),column('ou','OU','text',130),column('totalPoints','Points','score')];
const financial=[column('allocation','Annual Allotment','money',190),column('disbursement','Actual Disbursement','money',190),column('disbursementVsAllotmentRate','Disbursement / Allotment','percent',240),column('points-disbursementVsAllotmentRank','Allotment Rank Points','score',210),column('points-disbursementVsAllotmentCompletion','Allotment Completion Points','score',260),column('disbursementVsObligationRate','Disbursement / Obligation','percent',240),column('points-disbursementVsObligationRank','Obligation Rank Points','score',220),column('points-disbursementVsObligationCompletion','Obligation Completion Points','score',270)];
const physical=[column('physicalCompletionRate','Physical Completion','percent',190),column('points-physicalCompletionRank','Physical Rank Points','score',200),column('points-physicalCompletionBand','Physical Completion Points','score',250)];
const financialConsistency=[column('financialTop4Quarters','Financial Top 4 Quarters','count',230),column('points-financialConsistency','Financial Consistency Points','score',260)];
const physicalConsistency=[column('physicalTop4Quarters','Physical Top 4 Quarters','count',230),column('points-physicalConsistency','Physical Consistency Points','score',260)];
const annualColumns:Record<string,AwardViewColumn[]>={
    'annual-overall':[...ranking,...financial,...physical,...financialConsistency,...physicalConsistency,column('attendanceMissed','Attendance Missed','count',180),column('points-nationalAttendance','Attendance Points','score',180)],
    'annual-financial':[...ranking,...financial,...financialConsistency],
    'annual-physical':[...ranking,...physical,...physicalConsistency],
};

// Dashboard columns are deliberately separate from the complete export contract.
export function awardDashboardTables(snapshot:AwardSnapshot):AwardViewTable[]{
    return awardRankingTables(snapshot.results).map(table=>{
        if(annualColumns[table.key])return {...table,columns:annualColumns[table.key]};
        if(table.key!=='physical-details')return table;
        const keys=['period','component','rank','ou','points','score','completionRate'];
        const columns=[...table.columns.filter(c=>keys.includes(c.key)),column('conducted','Activities / Trainings','count',210),column('iposTrained','IPOs Trained'),column('subprojectsProvided','Subprojects Provided','count',200),column('iposAssisted','IPOs Assisted'),column('reports','Reports Submitted / Required','text',260),...table.columns.filter(c=>['reportorialOnTime','reportorialLate','reportorialMissing','reportorialCreditedUnits','reportorialCompliance'].includes(c.key)),column('national','National Attendance / Required','text',280),column('targets','Targets Completed / Due','text',240)];
        const pair=(row:Record<string,string|number|null>,actual:string,target:string)=>row[actual]==null&&row[target]==null?null:`${row[actual]??''} / ${row[target]??''}`;
        return {...table,columns,rows:table.rows.map(row=>({...row,conducted:row.component==='Production and Livelihood'?row.trainingsConducted:row.activitiesConducted,reports:pair(row,'reportorialSubmitted','reportorialRequired'),national:pair(row,'nationalAttended','nationalRequired'),targets:pair(row,'targetsCompleted','targetsDue')}))};
    });
}

const reviewText:Record<string,string>={
    identity_changed:'The record or OU changed after the previous results were saved. Review those results first.',
    duplicate_event:'An accomplishment appears more than once. Review the original entries.',
    invalid_amount:'An accomplishment amount needs correction.',
    historical_event_changed:'A previously reported accomplishment changed. Update its original Awards Year first.',
    historical_event_missing:'A previously reported financial entry is missing. Its saved amount is protected; review its original Awards Year.',
    ambiguous_date:'The actual date needs verification before this accomplishment can be included.',
    unmatched_ledger:'A financial entry no longer matches its budget item. Review the original record.',
    missing_physical_date:'A completed record has no valid actual completion or conduct date.',
    missing_target_date:'A target has no valid planned completion date.',
    ambiguous_replacement_lineage:'The replacement items need review before these results can be finalized.',
    duplicate_line:'A budget item appears more than once. Review the original record.',
    missing_line_identity:'A budget item cannot be matched to its saved record. Review the original record.',
    ambiguous_transfer_lineage:'The transferred items need review before these results can be finalized.',
    duplicate_opening_basis:'Multiple items refer to the same previously reported budget. Review the affected items.',
    invalid_financial_value:'A planned or reported amount needs correction. Its original value remains unchanged.',
    financial_basis_changed:'The funding amount changed after the previous results were saved. Review that change first.',
    target_classification_changed:'The funding classification changed after the previous results were saved.',
    ambiguous_financial_lineage:'A financial entry matches multiple previously reported entries. Review the original record.',
    missing_event_identity:'A financial entry cannot be matched to its saved record.',
    negative_financial_basis:'Reported actuals exceed the available budget or obligations. Review the amounts; none have been adjusted.',
    missing_opening_source:'An unfinished record from the previous Awards Year is unavailable. Its saved information remains protected.',
};
export function awardReviewItems(snapshot:AwardSnapshot){
    const records=[...snapshot.reconciliation.physical,...snapshot.reconciliation.financial].sort((a,b)=>b.key.length-a.key.length);
    return snapshot.reconciliation.issues.map(issue=>{
        const event=snapshot.reconciliation.unresolvedEvents.find(row=>row.id===issue.key);
        const record=records.find(row=>issue.key===row.key||issue.key.startsWith(row.key+':')||row.key.startsWith(issue.key+':')||event?.parentKey===row.key||event?.parentKey&&row.key.startsWith(event.parentKey+':'));
        const text=issue.code==='late_prior_event'?(issue.severity==='blocking'?'A late-encoded accomplishment affects previously saved results. Update its original Awards Year first.':'A late-encoded accomplishment belongs to an earlier Awards Year and is not counted again here.'):reviewText[issue.code]||'The original record needs review before these results can be confirmed.';
        return {name:record?.name||'',text,severity:issue.severity};
    });
}
export function awardDisplayError(message:string){
    if(!message)return '';
    if(/preceding finalized|opening baseline|baselineResultId/i.test(message))return 'Select saved results for the previous Awards Year and review the cutoff dates.';
    if(/opening transition|transitionApproved/i.test(message))return 'Review and confirm the cutoff dates before enabling annual cutoffs.';
    if(/recognition dates/i.test(message))return 'Choose valid, continuous dates for the Awards Year.';
    if(/dependen|reconcil|carry/i.test(message))return 'Related saved Awards Years also need review. Use Update Saved Years in Result History.';
    if(/policy|formula|capture|schema|source_hash|\b[a-f0-9]{8}-[a-f0-9-]{27,}\b/i.test(message))return 'The selected results or settings could not be verified. Refresh them and review the dates before retrying.';
    return message;
}
