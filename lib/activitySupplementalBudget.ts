import type { Activity, ActivityExpense } from '../constants';
import { getBudgetLineAmount, isParentExcludedFromTargets } from './budgetLineAdjustments';
import { isTransferAccomplishmentActive } from './budgetItemTransferRules';
import { getActualObligationSummary, getActualDisbursementSummary } from './financialActualSummary';

export type SupplementalSource = 'Savings' | 'Realignment';
export type SupplementStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN';
export interface ActivitySupplement {
    uid: string;
    activity_id: number;
    source: SupplementalSource;
    reference: string;
    authorization_date: string;
    reason: string;
    status: SupplementStatus;
    revision: number;
    created_by: number;
    approver_id?: number | null;
    origin_uid?: string | null;
    pending_status?: 'DRAFT' | 'PENDING' | null;
    pending_proposal?: { operation: string; rows: ActivityExpense[]; source: SupplementalSource; reference: string; date: string; reason: string } | null;
    updated_at: string;
}
export const isNewSupplementalExpense = (line: { fundingOrigin?: string; supplementUid?: string | null }) =>
    !!line.supplementUid || line.fundingOrigin === 'Supplemental' || line.fundingOrigin === 'SupplementalDraft';
export const isSupplementalExpense = (line: ActivityExpense, parent?: Partial<Activity>) =>
    isNewSupplementalExpense(line) || !!line.isSavings || !!line.isRealignment || !!parent?.isSavings || !!parent?.isRealignment;
export const isActivityExpenseActualEligible = (line: { fundingOrigin?: string; supplementUid?: string | null; supplementStatus?: string }) =>
    !isNewSupplementalExpense(line) || (line.fundingOrigin !== 'SupplementalDraft' && !!line.supplementUid && line.supplementStatus === 'APPROVED');
export const getActivityParentFundingSources = (parent: Partial<Activity>): SupplementalSource[] =>
    [...(parent.isSavings ? ['Savings' as const] : []), ...(parent.isRealignment ? ['Realignment' as const] : [])];
export const getActivityParentFundingLabel = (parent: Partial<Activity>) => getActivityParentFundingSources(parent).join(' / ') || 'Regular';
export function parseActivityParentFundingFlags(row: Record<string, unknown>): Pick<Partial<Activity>, 'isSavings' | 'isRealignment'> {
    const result: Pick<Partial<Activity>, 'isSavings' | 'isRealignment'> = {};
    for (const key of ['isSavings', 'isRealignment'] as const) {
        const value = row[key];
        if (value == null || value === '') continue;
        if (typeof value === 'boolean') result[key] = value;
        else if (typeof value === 'string' && /^(true|false)$/i.test(value.trim())) result[key] = value.trim().toLowerCase() === 'true';
        else throw new Error(`${key} must be TRUE or FALSE.`);
    }
    if (result.isSavings && result.isRealignment) throw new Error('Select either Savings or Realignment for a new Activity, not both.');
    return result;
}

export function resolveActivityExpenseFunding(line: ActivityExpense, parent: Partial<Activity> = {}) {
    const supplemental = isSupplementalExpense(line, parent);
    if (!supplemental) return { supplemental, source: null, conflicting: false };
    if (isNewSupplementalExpense(line) && line.supplementalSource) {
        const source = ['Savings', 'Realignment'].includes(line.supplementalSource) ? line.supplementalSource : null;
        return { supplemental, source, conflicting: source === null };
    }
    const ownSources = getActivityParentFundingSources(line);
    const sources = ownSources.length ? ownSources : getActivityParentFundingSources(parent);
    return { supplemental, source: sources.length === 1 ? sources[0] : null, conflicting: sources.length > 1 };
}
export const getActivityExpenseFundingLabel = (line: ActivityExpense, parent: Partial<Activity> = {}) => {
    const funding = resolveActivityExpenseFunding(line, parent);
    return funding.source || (funding.conflicting ? 'Conflicting' : funding.supplemental ? 'Not recorded' : 'Regular');
};
export const isActiveActivityBudgetExpense = (line: ActivityExpense, parent: Partial<Activity>) =>
    parent.status !== 'Cancelled' && !line.isCancelled && isActivityExpenseActualEligible(line) && isTransferAccomplishmentActive(parent);
export const getActiveActivitySupplementalSources = (parent: Partial<Activity>) => [...new Set(
    (parent.expenses || []).filter(line => isActiveActivityBudgetExpense(line, parent))
        .map(line => resolveActivityExpenseFunding(line, parent).source).filter((source): source is SupplementalSource => source !== null),
)];
export const isOriginalActivityBudgetLocked = (parent: Partial<Activity>) => parent.status !== 'Proposed' || !!parent.original_budget_snapshot;
export const hasWholeActivityFundingOrigin = (parent: Partial<Activity>) => !!parent.isSavings || !!parent.isRealignment;
export const getActivityEditableBudgetExpenses = (parent: Partial<Activity>, creating = false) => {
    const wholeOriginEditable = hasWholeActivityFundingOrigin(parent) && (creating || !isOriginalActivityBudgetLocked(parent));
    return (parent.expenses || []).filter(row => wholeOriginEditable ? !isNewSupplementalExpense(row) : !isSupplementalExpense(row, parent));
};
export const hasProtectedActivityBudgetHistory = (parent: Partial<Activity>) => !!parent.original_budget_snapshot
    || (parent.expenses || []).some(row => !!row.supplementUid)
    || (parent.history || []).some(entry => entry.event?.startsWith('Supplemental funding '));

export function getActivityBudgetSummary(parent: Partial<Activity>) {
    const lines = parent.expenses || [];
    const active = (row: ActivityExpense) => isActiveActivityBudgetExpense(row, parent);
    const supplements = lines.filter(row => isSupplementalExpense(row, parent) && active(row));
    const savings = supplements.filter(row => resolveActivityExpenseFunding(row, parent).source === 'Savings').reduce((sum, row) => sum + getBudgetLineAmount(row), 0);
    const realignment = supplements.filter(row => resolveActivityExpenseFunding(row, parent).source === 'Realignment').reduce((sum, row) => sum + getBudgetLineAmount(row), 0);
    // Unclassified legacy funding still belongs to the total; never guess its source.
    const supplemental = supplements.reduce((sum, row) => sum + getBudgetLineAmount(row), 0);
    const target = isParentExcludedFromTargets(parent) ? 0 : lines.filter(row => !isSupplementalExpense(row, parent) && !row.isCancelled).reduce((sum, row) => sum + getBudgetLineAmount(row), 0);
    const current = lines.filter(active).reduce((sum, row) => sum + getBudgetLineAmount(row), 0);
    const original = parent.original_budget_snapshot
        ? parent.original_budget_snapshot.expenses.reduce((sum, row) => sum + getBudgetLineAmount(row), 0)
        : parent.status === 'Proposed' ? target : null;
    const actualLines = lines.filter(row => isActivityExpenseActualEligible(row) && isTransferAccomplishmentActive(parent));
    const obligated = actualLines.reduce((sum, row) => sum + getActualObligationSummary(row).amount, 0);
    const disbursed = actualLines.reduce((sum, row) => sum + getActualDisbursementSummary(row).amount, 0);
    return { original, target, savings, realignment, supplemental, current, obligated, disbursed, unobligated: current - obligated };
}
