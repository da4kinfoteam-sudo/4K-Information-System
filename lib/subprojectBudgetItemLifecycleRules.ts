import type { ObligationRecord, Subproject, SubprojectDetail } from '../constants';

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

export type SubprojectBudgetItemRemovalAction = 'delete' | 'cancel' | 'block';

export const getSubprojectBudgetItemRemovalAction = (
    status: Subproject['status'] | undefined,
    isSavedLine: boolean,
    hasActuals: boolean,
): SubprojectBudgetItemRemovalAction => {
    if (status === 'Proposed') return 'delete';
    if (status === 'Ongoing' && (isSavedLine || hasActuals)) return 'cancel';
    if (isSavedLine || hasActuals) return 'block';
    return 'delete';
};

export const canEditSubprojectBudgetItem = (
    status: Subproject['status'] | undefined,
    isSuperseded: boolean,
) => status === 'Proposed' || !isSuperseded;

export const removeSubprojectBudgetItemById = <T extends { id?: number | string | null }>(
    items: T[],
    itemId: number | string,
) => items.filter(item => item.id === undefined || item.id === null || String(item.id) !== String(itemId));

export const getSubprojectBudgetSaveExpectedStatus = (
    status: Subproject['status'] | undefined,
    hasProposedBudgetChanges: boolean,
    hasOngoingCancellationChanges: boolean,
): Subproject['status'] | null => {
    if (status === 'Proposed' && hasProposedBudgetChanges) return 'Proposed';
    if (status === 'Ongoing' && hasOngoingCancellationChanges) return 'Ongoing';
    return null;
};
