import { remapActivityExpenseGroups } from './activityBudgetSchedules';
import { isSupplementalExpense } from './activitySupplementalBudget';
import type { Activity, ActivityExpense, Subproject, SubprojectDetail } from '../constants';
import { normalizeActivityTitle } from './activityTitles';
import { remapClonedBudgetGroups } from './subprojectBudgetSchedules';

interface CloneContext {
    createdAt: string;
    encodedBy: string;
    requiresApprover: boolean;
}

let lastCloneItemId = 0;

const createCloneItemId = (reservedIds: Set<string>) => {
    do {
        lastCloneItemId = Math.max(Date.now(), lastCloneItemId + 1);
    } while (reservedIds.has(String(lastCloneItemId)));
    reservedIds.add(String(lastCloneItemId));
    return lastCloneItemId;
};

const createCloneUid = (prefix: string, createdAt: string) =>
    `${prefix}-${new Date(createdAt).getFullYear()}-${crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;

const createCloneBase = <T extends Activity | Subproject>(source: T, context: CloneContext) => {
    const {
        id, uid, created_at, updated_at, history, workflow_status,
        physical_accomplishment_submitted_at, budgetItemTransferId,
        isTransferTargetExcluded, ...planned
    } = structuredClone(source);
    delete (planned as Partial<Activity>).original_budget_snapshot;
    return {
        ...planned,
        status: 'Proposed' as const,
        workflow_status: context.requiresApprover ? 'PENDING' as const : 'APPROVED' as const,
        encodedBy: context.encodedBy,
        created_at: context.createdAt,
        updated_at: context.createdAt,
        physical_accomplishment_submitted_at: null,
        actualPWD: 0,
        actualMuslim: 0,
        actualLGBTQ: 0,
        actualSoloParent: 0,
        actualSenior: 0,
        actualYouth: 0,
        catchUpPlanRemarks: '',
        history: [{ date: context.createdAt, event: `Cloned from ${uid || id}`, user: context.encodedBy }],
    };
};

const cloneFinancialLine = <T extends ActivityExpense | SubprojectDetail>(line: T, reservedIds: Set<string>) => ({
    ...structuredClone(line),
    id: createCloneItemId(reservedIds),
    obligations: [],
    disbursements: [],
    actualObligationAmount: 0,
    actualObligationDate: undefined,
    actualDisbursementAmount: 0,
    actualDisbursementDate: undefined,
    actualAmount: 0,
});

export const buildActivityClonePayload = (source: Activity, context: CloneContext): Omit<Activity, 'id'> => {
    const reservedIds = new Set((source.expenses || []).map(line => String(line.id)));
    return {
        ...createCloneBase(source, context),
        uid: createCloneUid(source.type === 'Training' ? 'TRN' : 'ACT', context.createdAt),
        activity_title: normalizeActivityTitle(source.activity_title),
        isSavings: false,
        isRealignment: false,
        actualDate: undefined,
        actualEndDate: undefined,
        actualParticipantsMale: 0,
        actualParticipantsFemale: 0,
        newTargetDate: undefined,
        expenses: remapActivityExpenseGroups(source.expenses || []).map(line => {
            const clone = cloneFinancialLine(line, reservedIds);
            if (!isSupplementalExpense(line, source)) return clone;
            const { supplementUid, supplementRevisionPending, ...draft } = clone;
            return { ...draft, fundingOrigin: 'SupplementalDraft' as const, supplementStatus: 'DRAFT' as const,
                supplementalSource: line.supplementalSource || (line.isSavings || source.isSavings ? 'Savings' as const : 'Realignment' as const) };
        }),
    };
};

export const buildSubprojectClonePayload = (source: Subproject, context: CloneContext): Omit<Subproject, 'id'> => {
    const reservedIds = new Set((source.details || []).map(line => String(line.id)));
    return {
        ...createCloneBase(source, context),
        uid: createCloneUid('SP', context.createdAt),
        actualCompletionDate: undefined,
        actualMaleBeneficiaries: null,
        actualFemaleBeneficiaries: null,
        actualFourPsBeneficiaries: null,
        accomplishmentRemarks: null,
        newTargetCompletionDate: undefined,
        details: remapClonedBudgetGroups(source.details || []).map(line => ({
            ...cloneFinancialLine(line, reservedIds),
            actualDeliveryDate: undefined,
            actualNumberOfUnits: 0,
            isCompleted: false,
        })),
        subprojectCommodities: source.subprojectCommodities?.map(commodity => ({
            ...structuredClone(commodity), actualYield: 0, income: 0,
        })),
    };
};
