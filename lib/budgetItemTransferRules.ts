export type BudgetTransferSourceType = 'subproject' | 'activity';

export interface ParentActualField {
    key: string;
    label: string;
}

export type ParentActualAllocation = Record<string, number | null>;

export const PARENT_ACTUAL_FIELDS: Record<BudgetTransferSourceType, ParentActualField[]> = {
    subproject: [
        { key: 'actualMaleBeneficiaries', label: 'Male beneficiaries' },
        { key: 'actualFemaleBeneficiaries', label: 'Female beneficiaries' },
        { key: 'actualFourPsBeneficiaries', label: '4Ps beneficiaries' },
        { key: 'actualPWD', label: 'PWD beneficiaries' },
        { key: 'actualMuslim', label: 'Muslim beneficiaries' },
        { key: 'actualLGBTQ', label: 'LGBTQ beneficiaries' },
        { key: 'actualSoloParent', label: 'Solo-parent beneficiaries' },
        { key: 'actualSenior', label: 'Senior beneficiaries' },
        { key: 'actualYouth', label: 'Youth beneficiaries' },
    ],
    activity: [
        { key: 'actualParticipantsMale', label: 'Male participants' },
        { key: 'actualParticipantsFemale', label: 'Female participants' },
        { key: 'actualPWD', label: 'PWD participants' },
        { key: 'actualMuslim', label: 'Muslim participants' },
        { key: 'actualLGBTQ', label: 'LGBTQ participants' },
        { key: 'actualSoloParent', label: 'Solo-parent participants' },
        { key: 'actualSenior', label: 'Senior participants' },
        { key: 'actualYouth', label: 'Youth participants' },
    ],
};

export const buildActualAllocation = (
    fields: ParentActualField[],
    sourceRecord: Record<string, unknown>,
    destinationValues: Record<string, number>,
): ParentActualAllocation => {
    const remainder: ParentActualAllocation = {};
    fields.forEach(({ key }) => {
        const originalValue = sourceRecord[key];
        const original = Number(originalValue ?? 0);
        const destination = Number(destinationValues[key] ?? 0);
        remainder[key] = originalValue == null && destination === 0 ? null : original - destination;
    });
    return remainder;
};

export const buildDestinationActualAllocation = (
    fields: ParentActualField[],
    sourceRecord: Record<string, unknown>,
    destinationValues: Record<string, number>,
): ParentActualAllocation => Object.fromEntries(fields.map(({ key }) => {
    const originalValue = sourceRecord[key];
    const destination = Number(destinationValues[key] ?? 0);
    return [key, originalValue == null && destination === 0 ? null : destination];
}));

export const validateActualAllocation = (
    fields: ParentActualField[],
    sourceRecord: Record<string, unknown>,
    destinationValues: Record<string, number>,
    sourceRemainder: Record<string, number | null>,
) => {
    for (const { key, label } of fields) {
        const original = Number(sourceRecord[key] ?? 0);
        const destination = Number(destinationValues[key] ?? 0);
        const remainder = Number(sourceRemainder[key] ?? 0);
        if (![original, destination, remainder].every(Number.isFinite)
            || [original, destination, remainder].some(value => !Number.isInteger(value))
            || original < 0 || destination < 0 || remainder < 0) {
            return `${label} must be a valid non-negative whole number.`;
        }
        if (Math.abs(destination + remainder - original) > 0.0001) {
            return `${label}: destination and source remainder must add up to the current total (${original}).`;
        }
    }
    return null;
};

export const isTransferAccomplishmentActive = (record: {
    budgetItemTransferId?: string | null;
    workflow_status?: string | null;
} | null | undefined) => !record?.budgetItemTransferId || record.workflow_status === 'APPROVED';

export const reparentSelectedFinancialActualRows = <T extends {
    entity_type?: string;
    parent_id?: number | string;
    item_id?: number | string | null;
}>(
    rows: T[],
    sourceType: BudgetTransferSourceType,
    sourceParentId: number,
    destinationParentId: number,
    selectedItemIds: string[],
): T[] => {
    const financialEntityType = sourceType === 'subproject' ? 'subproject_detail' : 'activity_expense';
    const selectedIds = new Set(selectedItemIds.map(String));
    return rows
        .filter(row => row.entity_type === financialEntityType
            && Number(row.parent_id) === sourceParentId
            && row.item_id != null
            && selectedIds.has(String(row.item_id)))
        .map(row => ({ ...row, parent_id: destinationParentId }));
};
