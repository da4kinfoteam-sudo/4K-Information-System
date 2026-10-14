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
export const isOriginalActivityBudgetLocked = (parent: Partial<Activity>) => parent.status !== 'Proposed' || !!parent.original_budget_snapshot;
export const hasProtectedActivityBudgetHistory = (parent: Partial<Activity>) => !!parent.original_budget_snapshot
    || (parent.expenses || []).some(row => !!row.supplementUid)
    || (parent.history || []).some(entry => entry.event?.startsWith('Supplemental funding '));

export function getActivityBudgetSummary(parent: Partial<Activity>) {
    const lines = parent.expenses || [];
    const active = (row: ActivityExpense) => parent.status !== 'Cancelled' && !row.isCancelled && isActivityExpenseActualEligible(row) && isTransferAccomplishmentActive(parent);
    const supplements = lines.filter(row => isSupplementalExpense(row, parent) && active(row));
    const savings = supplements.filter(row => (row.supplementalSource || (row.isSavings || parent.isSavings ? 'Savings' : 'Realignment')) === 'Savings').reduce((sum, row) => sum + getBudgetLineAmount(row), 0);
    const realignment = supplements.reduce((sum, row) => sum + getBudgetLineAmount(row), 0) - savings;
    const target = isParentExcludedFromTargets(parent) ? 0 : lines.filter(row => !isSupplementalExpense(row, parent) && !row.isCancelled).reduce((sum, row) => sum + getBudgetLineAmount(row), 0);
    const current = lines.filter(active).reduce((sum, row) => sum + getBudgetLineAmount(row), 0);
    const original = parent.original_budget_snapshot
        ? parent.original_budget_snapshot.expenses.reduce((sum, row) => sum + getBudgetLineAmount(row), 0)
        : parent.status === 'Proposed' ? target : null;
    const actualLines = lines.filter(row => isActivityExpenseActualEligible(row) && isTransferAccomplishmentActive(parent));
    const obligated = actualLines.reduce((sum, row) => sum + getActualObligationSummary(row).amount, 0);
    const disbursed = actualLines.reduce((sum, row) => sum + getActualDisbursementSummary(row).amount, 0);
    return { original, target, savings, realignment, supplemental: savings + realignment, current, obligated, disbursed, unobligated: current - obligated };
}
