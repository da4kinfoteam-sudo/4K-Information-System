import type { StaffingExpense } from '../constants';

export const LEGACY_STAFFING_EXPENSE_DISPLAY_ID = 99999;

export const isValidStaffingExpenseId = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 && parsed !== LEGACY_STAFFING_EXPENSE_DISPLAY_ID;
};

const nextGeneratedExpenseId = (usedIds: Set<number>, offset: number) => {
    let candidate = Date.now() + offset;
    while (usedIds.has(candidate) || !isValidStaffingExpenseId(candidate)) {
        candidate += 1;
    }
    usedIds.add(candidate);
    return candidate;
};

export const createStaffingExpenseId = (existingIds: unknown[] = []) => {
    const usedIds = new Set(
        existingIds
            .map(Number)
            .filter(id => isValidStaffingExpenseId(id))
    );
    return nextGeneratedExpenseId(usedIds, 0);
};

export const normalizeStaffingExpenses = (expenses: StaffingExpense[] | undefined): StaffingExpense[] => {
    const usedIds = new Set<number>();
    let generatedCount = 0;

    return (expenses || []).map(expense => {
        const parsedId = Number(expense.id);
        const hasUsableId = isValidStaffingExpenseId(parsedId) && !usedIds.has(parsedId);
        const id = hasUsableId ? parsedId : nextGeneratedExpenseId(usedIds, generatedCount++);

        if (hasUsableId) {
            usedIds.add(id);
        }

        return {
            ...expense,
            id,
        };
    });
};

export const staffingExpenseItemId = (expenseId: unknown) =>
    isValidStaffingExpenseId(expenseId) ? String(Number(expenseId)) : null;
