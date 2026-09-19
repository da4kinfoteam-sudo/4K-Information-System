import type { SubprojectDetail } from '../constants';
import {
    getBudgetLineActualDisbursement,
    getBudgetLineActualObligation,
    getBudgetLineAmount,
    isBudgetLineExcludedFromTargets,
    toFiniteNumber,
} from './budgetLineAdjustments';

export type SubprojectAdjustmentType = 'Replacement' | 'Additional Item';
export type SubprojectAdjustmentFundingSource = 'Original Allocation' | 'Realignment' | 'Savings';

/** A superseded target remains in the record for auditability but no longer participates in rollups. */
export const isSupersededSubprojectDetail = (detail?: Pick<SubprojectDetail, 'isSuperseded'> | null) => (
    !!detail?.isSuperseded
);

export const isActiveSubprojectDetail = (detail: SubprojectDetail) => (
    !detail.isCancelled && !isSupersededSubprojectDetail(detail)
);

export const isSubprojectAdjustmentItem = (detail: SubprojectDetail) => (
    !!detail.isAdjustmentItem || detail.adjustmentType === 'Replacement' || detail.adjustmentType === 'Additional Item'
);

export const getOriginalSubprojectBudget = (details: SubprojectDetail[] = []) => details
    .filter(detail => !isSubprojectAdjustmentItem(detail))
    .reduce((total, detail) => total + (
        detail.originalPlannedAmount !== undefined && detail.originalPlannedAmount !== null
            ? toFiniteNumber(detail.originalPlannedAmount)
            : getBudgetLineAmount(detail)
    ), 0);

export const getActiveSubprojectBudget = (details: SubprojectDetail[] = []) => details
    .filter(isActiveSubprojectDetail)
    .reduce((total, detail) => total + (
        isBudgetLineExcludedFromTargets(detail) ? 0 : getBudgetLineAmount(detail)
    ), 0);

/** Posted actuals remain part of the financial record even after a physical item is superseded. */
export const getSubprojectActualObligation = (details: SubprojectDetail[] = []) => details
    .reduce((total, detail) => total + getBudgetLineActualObligation(detail), 0);

export const getSubprojectActualDisbursement = (details: SubprojectDetail[] = []) => details
    .reduce((total, detail) => total + getBudgetLineActualDisbursement(detail), 0);

export const getSubprojectAdjustmentLabel = (detail: SubprojectDetail) => {
    if (detail.isSuperseded) return 'Replaced item';
    if (detail.adjustmentType === 'Replacement') return 'Replacement item';
    if (detail.adjustmentType === 'Additional Item') return 'Additional item';
    return null;
};
