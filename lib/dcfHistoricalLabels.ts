import type { DcfRestoreChange, DcfRevisionSnapshot } from './dcfRevisionHistory';
import {
    historicalCurrency,
    historicalDate,
    historicalObject,
    historicalRows,
    historicalText,
} from './dcfHistoricalPresentation';

const labels: Record<string, string> = {
    name: 'Name',
    activity_title: 'Activity Title',
    equipment: 'Equipment',
    particulars: 'Particulars',
    personnelPosition: 'Position',
    position: 'Position',
    uid: 'UID',
    operatingUnit: 'Operating Unit',
    fundingYear: 'Fund Year',
    fundYear: 'Fund Year',
    fundType: 'Fund Type',
    tier: 'Tier',
    fundSource: 'Fund Source',
    fundSourceUid: 'Fund Source',
    status: 'Status',
    hiringStatus: 'Hiring Status',
    type: 'Type',
    component: 'Component',
    description: 'Description',
    location: 'Location',
    facilitator: 'Facilitator',
    date: 'Date',
    endDate: 'End Date',
    actualDate: 'Actual Date',
    actualEndDate: 'Actual End Date',
    packageType: 'Package',
    indigenousPeopleOrganization: 'IPO',
    ipo_id: 'Linked IPO',
    participating_ipo_ids: 'Participating IPOs',
    participatingIpos: 'Participating IPOs',
    reference_activity_id: 'Reference Activity',
    participantsMale: 'Target Male Participants',
    participantsFemale: 'Target Female Participants',
    actualParticipantsMale: 'Actual Male Participants',
    actualParticipantsFemale: 'Actual Female Participants',
    actualMaleBeneficiaries: 'Male Beneficiaries',
    actualFemaleBeneficiaries: 'Female Beneficiaries',
    actualFourPsBeneficiaries: '4Ps Beneficiaries',
    actualPWD: 'PWD',
    actualMuslim: 'Muslim',
    actualLGBTQ: 'LGBTQ+',
    actualSoloParent: 'Solo Parents',
    actualSenior: 'Senior',
    actualYouth: 'Youth',
    estimatedCompletionDate: 'Estimated Completion',
    actualCompletionDate: 'Actual Completion',
    startDate: 'Start Date',
    newTargetCompletionDate: 'New Target Completion',
    newTargetDate: 'New Target Date',
    accomplishmentRemarks: 'Accomplishment Remarks',
    remarks: 'Remarks',
    catchUpPlanRemarks: 'Catch-Up Plan Remarks',
    specs: 'Specs',
    purpose: 'Purpose',
    numberOfUnits: 'Number Of Units',
    unitOfMeasure: 'Unit Of Measure',
    pricePerUnit: 'Price Per Unit',
    amount: 'Amount',
    obligatedAmount: 'Target Obligated Amount',
    uacsCode: 'UACS Code',
    objectType: 'Object Type',
    expenseParticular: 'Expense Particular',
    physicalDeliveryDate: 'Physical Delivery',
    deliveryDate: 'Delivery Date',
    obligationDate: 'Target Obligation Date',
    disbursementDate: 'Target Disbursement Date',
    obligationMonth: 'Target Obligation Month',
    disbursementMonth: 'Target Disbursement Month',
    actualDeliveryDate: 'Actual Delivery Date',
    actualNumberOfUnits: 'Actual Units',
    isCompleted: 'Completed',
    actualAmount: 'Actual Amount',
    actualObligationAmount: 'Actual Obligated Amount',
    actualDisbursementAmount: 'Actual Disbursed Amount',
    actualObligationDate: 'Actual Obligation Date',
    actualDisbursementDate: 'Actual Disbursement Date',
    annualSalary: 'Total Annual Requirement',
    salaryGrade: 'Salary Grade',
    personnelType: 'Personnel Type',
    encodedBy: 'Encoded By',
    targetObligationSchedules: 'Obligation Targets',
    targetDisbursementSchedules: 'Disbursement Targets',
    obligations: 'Obligations',
    disbursements: 'Disbursements',
    subprojectCommodities: 'Commodities',
    isCancelled: 'Cancelled',
    isSuperseded: 'Replaced Item',
    isSavings: 'Savings',
    isRealignment: 'Realignment',
    adjustmentType: 'Adjustment Type',
    adjustmentReason: 'Adjustment Reason',
    adjustmentFundingSource: 'Adjustment Funding Source',
    isAdjustmentItem: 'Adjustment Item',
    itemRemarks: 'Item Remarks',
    replacementReason: 'Replacement Reason',
    supplementStatus: 'Supplement Approval',
    supplementalSource: 'Supplemental Source',
    fundingOrigin: 'Funding Origin',
    workflow_status: 'Approval Status',
    approved_at: 'Approval Date',
    rejection_reason: 'Rejection Reason',
    physical_accomplishment_submitted_at: 'Physical Submission Date',
    'Item availability': 'Item Availability',
    'Actual obligation': 'Actual Obligation',
    obligation: 'Obligation',
    disbursement: 'Disbursement',
    month: 'Month',
    quantity: 'Quantity',
    label: 'Label',
    title: 'Title',
    value: 'Value',
    typeName: 'Kind',
    area: 'Coverage',
    averageYield: 'Target Yield',
    actualYield: 'Actual Yield',
    income: 'Actual Income',
    marketingPercentage: 'Marketing Percentage',
    foodSecurityPercentage: 'Food Security Percentage',
    id: 'Record Identity',
    created_at: 'Created Date',
    created_by: 'Recorded Author',
    updated_at: 'Updated Date',
    submitted_at: 'Submission Date',
    approver_id: 'Approver',
    approved_by: 'Approved By',
    isTransferTargetExcluded: 'Target Classification',
    budgetItemTransferId: 'Transfer Relationship',
    budgetItemGroupId: 'Budget Item Group',
    sourceItemId: 'Source Item',
    replacementOfItemId: 'Replaced Item',
    replacedByItemIds: 'Replacement Items',
    supplementUid: 'Supplement',
    supplementalRevisionPending: 'Supplement Revision Pending',
    targetScheduleVersion: 'Financial Target Schedules',
    originalPlannedAmount: 'Original Planned Amount',
    originalPricePerUnit: 'Original Unit Price',
    originalNumberOfUnits: 'Original Units',
};
export function historicalFieldLabel(key: string): string {
    const monthly =
        /^(actualDisbursement|disbursement)(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/.exec(key);
    return (
        labels[key] ??
        (monthly
            ? `${monthly[1] === 'disbursement' ? 'Target' : 'Actual'} Disbursement (${monthly[2]})`
            : 'Additional Recorded Field')
    );
}
export function historicalChangeValue(value: unknown): string {
    if (Array.isArray(value)) return value.length ? value.map(historicalChangeValue).join('; ') : 'None';
    if (!value || typeof value !== 'object') return historicalText(value);
    const record = historicalObject(value);
    const fields = Object.keys(record).filter(
        (key) =>
            labels[key] &&
            ![
                'id',
                'uid',
                'ipo_id',
                'fundSourceUid',
                'reference_activity_id',
                'participating_ipo_ids',
            ].includes(key),
    );
    return (
        fields
            .map(
                (key) =>
                    `${historicalFieldLabel(key)}: ${/amount|price|salary|income/i.test(key) ? historicalCurrency(record[key]) : /date|month$/i.test(key) ? historicalDate(record[key]) : historicalChangeValue(record[key])}`,
            )
            .join('; ') || 'Recorded Value Changed (Review Required)'
    );
}
export function historicalRestoreRows(
    changes: DcfRestoreChange[],
    snapshot: DcfRevisionSnapshot | null,
): string[][] {
    const lines = historicalRows(
        snapshot?.record[snapshot.entityType === 'subprojects' ? 'details' : 'expenses'],
    );
    const itemLabel = (id: string) => {
        if (id === '$parent') return 'Record';
        const index = lines.findIndex((line) => String(line.id) === id),
            line = lines[index];
        return line
            ? `${historicalText(line.particulars ?? line.expenseParticular)} (Item ${index + 1})`
            : 'Budget Item';
    };
    return changes.map((change) => {
        const financial = change.section === 'Financial actuals';
        const item = /^Budget item (.+)$/.exec(change.section);
        const sections: Record<string, string> = {
            Details: 'Details',
            Record: 'Record',
            'Physical accomplishments': 'Physical Accomplishments',
            'Financial actuals': 'Financial Actuals',
            'Financial totals': 'Financial Totals',
        };
        let field = historicalFieldLabel(change.field),
            section = item ? itemLabel(item[1]) : (sections[change.section] ?? 'Recorded Changes');
        if (financial) {
            const parts = change.field.split(' / '),
                id = parts.find((part) => part.startsWith('item '))?.slice(5);
            field = `${historicalFieldLabel(parts[0])} / ${id ? itemLabel(id) : 'Record'} / ${{ insert: 'Add Entry', update: 'Update Entry', delete: 'Remove Entry' }[parts[2]] ?? 'Entry Correction'}`;
        }
        if (change.field === 'targetScheduleVersion')
            return [
                section,
                field,
                change.before == null ? 'Not Set' : 'Previous Schedule',
                change.after == null ? 'Not Set' : 'Recorded Schedule',
            ];
        if (
            change.field === 'id' ||
            change.field.endsWith('_id') ||
            [
                'fundSourceUid',
                'participating_ipo_ids',
                'sourceItemId',
                'replacementOfItemId',
                'replacedByItemIds',
                'supplementUid',
                'budgetItemGroupId',
            ].includes(change.field)
        ) {
            return [
                section,
                field === 'Additional Recorded Field' ? 'Recorded Relationship' : field,
                change.before == null ? 'Not Set' : 'Recorded Relationship',
                change.after == null ? 'Not Set' : 'Relationship Changed',
            ];
        }
        const format = (value: unknown) =>
            /Amount$|amount|pricePerUnit|annualSalary|income/.test(change.field)
                ? historicalCurrency(value)
                : historicalChangeValue(value);
        return [section, field, format(change.before), format(change.after)];
    });
}
