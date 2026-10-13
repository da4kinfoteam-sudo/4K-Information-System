import type { ObjectType, SubprojectDetail } from '../constants';

export type BudgetReferences = {
    particularTypes: Record<string, string[]>;
    uacsCodes: Record<string, Record<string, Record<string, string>>>;
};

export const SHARED_BUDGET_FIELDS = ['type', 'particulars', 'unitOfMeasure', 'objectType', 'expenseParticular', 'uacsCode'] as const;
export const SCHEDULE_FIELDS = ['deliveryDate', 'obligationMonth', 'disbursementMonth', 'numberOfUnits', 'pricePerUnit'] as const;

export const groupBudgetSchedules = (items: SubprojectDetail[]) => {
    const groups = new Map<string, SubprojectDetail[]>();
    items.forEach(item => {
        // Same labels are not identity. A mismatched legacy group is displayed safely as separate items.
        const key = item.budgetItemGroupId
            ? JSON.stringify([item.budgetItemGroupId, ...SHARED_BUDGET_FIELDS.map(field => item[field])])
            : `legacy:${item.id}`;
        groups.set(key, [...(groups.get(key) || []), item]);
    });
    return [...groups.entries()].map(([key, rows]) => ({ key, rows }));
};

export const createBudgetScheduleId = (reserved: Set<string>) => {
    let id = -Date.now() * 1000;
    while (reserved.has(String(id))) id--;
    reserved.add(String(id));
    return id;
};

export const isValidTargetMonth = (value: unknown) => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return year >= 1900 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

export const validateBudgetSchedule = (row: SubprojectDetail, references: BudgetReferences, original?: SubprojectDetail): string | null => {
    const sameParticular = original && original.type === row.type && original.particulars === row.particulars;
    if (!sameParticular && !references.particularTypes[row.type]?.includes(row.particulars)) return 'Select a listed Particular for this Item Type.';
    const sameUacs = original && original.objectType === row.objectType && original.expenseParticular === row.expenseParticular && original.uacsCode === row.uacsCode;
    if (!sameUacs && !Object.hasOwn(references.uacsCodes[row.objectType]?.[row.expenseParticular] || {}, row.uacsCode)) return 'Select a listed UACS Code for the selected Object Type and Expense Particular.';
    if (!row.unitOfMeasure.trim()) return 'Select a Unit of Measure.';
    if (SCHEDULE_FIELDS.slice(0, 3).some(field => !isValidTargetMonth(row[field]))) return 'Select valid Delivery, Obligation and Disbursement months.';
    if (![row.numberOfUnits, row.pricePerUnit].every(value => Number.isFinite(Number(value)) && Number(value) > 0)) return 'Units and Unit Price must be greater than zero.';
    if (!Number.isFinite(Number(row.numberOfUnits) * Number(row.pricePerUnit))) return 'The schedule amount is too large.';
    return null;
};

export const getUacsOptions = (references: BudgetReferences, objectType: ObjectType, expenseParticular: string) =>
    Object.entries(references.uacsCodes[objectType] || {}).flatMap(([particular, codes]) =>
        expenseParticular && particular !== expenseParticular ? [] : Object.entries(codes).map(([code, description]) => ({
            value: JSON.stringify([objectType, particular, code]), label: `${code} - ${description}`, particular,
        }))).sort((a, b) => a.label.localeCompare(b.label));

export const prepareBudgetScheduleRows = (rows: SubprojectDetail[], existing: SubprojectDetail[]) => {
    const originals = new Map(existing.map(row => [row.id, row]));
    return rows.map(row => {
        const original = originals.get(row.id);
        const result = { ...original, ...row, numberOfUnits: Number(row.numberOfUnits), pricePerUnit: Number(row.pricePerUnit) };
        // Keep legacy explicit amount precedence consistent only when planned price/units were edited.
        if (original && 'amount' in original && (original.pricePerUnit !== result.pricePerUnit || original.numberOfUnits !== result.numberOfUnits)) {
            return { ...result, amount: result.pricePerUnit * result.numberOfUnits };
        }
        return result;
    });
};

export const latestBudgetDeliveryDate = (items: SubprojectDetail[], current: string, parentStatus?: string) =>
    items.filter(item => !item.isSuperseded && (parentStatus === 'Proposed' || !item.isCancelled))
        .map(item => item.deliveryDate).filter(isValidTargetMonth).reduce((latest, value) => value > latest ? value : latest, current || '');

export const remapClonedBudgetGroups = (items: SubprojectDetail[]) => {
    const mapping = new Map<string, string>();
    return items.map(item => {
        if (!item.budgetItemGroupId) return item;
        if (!mapping.has(item.budgetItemGroupId)) mapping.set(item.budgetItemGroupId, crypto.randomUUID());
        return { ...item, budgetItemGroupId: mapping.get(item.budgetItemGroupId)! };
    });
};

export const budgetTargetsChanged = (before: SubprojectDetail, after: SubprojectDetail) =>
    [...SHARED_BUDGET_FIELDS, ...SCHEDULE_FIELDS, 'budgetItemGroupId' as const].some(field => before[field] !== after[field]);
