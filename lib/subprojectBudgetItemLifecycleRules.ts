import type { ObligationRecord, SubprojectDetail } from '../constants';

const hasNonZeroValue = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed !== 0;
};

export const getSubprojectBudgetItemObligations = (
    item: Omit<SubprojectDetail, 'id'> & { id?: number },
    centralRows: Array<ObligationRecord & { itemId: string | null }> | null,
): ObligationRecord[] => {
    const centralObligations = centralRows?.filter(row => row.itemId === String(item.id)) || [];
    if (centralObligations.length > 0) return centralObligations;
    if (item.obligations?.length) return item.obligations;
    if (!hasNonZeroValue(item.actualObligationAmount)) return [];
    return [{
        id: Date.now() + Math.random(),
        date: item.actualObligationDate || '',
        amount: Number(item.actualObligationAmount),
        remarks: 'Legacy Record',
    }];
};

export const getProposedBudgetItemLocalBlocker = (item: SubprojectDetail) => {
    if ((item.obligations?.length || 0) > 0 || hasNonZeroValue(item.actualObligationAmount) || item.actualObligationDate) {
        return 'actual obligation records';
    }
    if ((item.disbursements?.length || 0) > 0 || hasNonZeroValue(item.actualDisbursementAmount) || item.actualDisbursementDate) {
        return 'actual disbursement records';
    }
    if (
        item.actualDeliveryDate
        || hasNonZeroValue(item.actualNumberOfUnits)
        || item.isCompleted
        || hasNonZeroValue(item.actualAmount)
    ) return 'physical accomplishment records';
    if (
        item.isCancelled
        || item.isRealignment
        || item.isSavings
        || item.isSuperseded
        || item.isAdjustmentItem
        || item.adjustmentType === 'Replacement'
        || item.adjustmentType === 'Additional Item'
        || item.replacementOfItemId !== undefined && item.replacementOfItemId !== null
        || (item.replacedByItemIds?.length || 0) > 0
        || item.replacementReason
    ) return 'budget adjustment or replacement history';
    if (Object.entries(item as unknown as Record<string, unknown>).some(([key, value]) => (
        key.startsWith('actualDisbursement') && hasNonZeroValue(value)
    ))) return 'actual disbursement records';
    return null;
};
