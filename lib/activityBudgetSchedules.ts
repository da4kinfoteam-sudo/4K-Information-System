import type { ActivityExpense } from '../constants';
import { isValidTargetMonth } from './subprojectBudgetSchedules';

export const SHARED_ACTIVITY_EXPENSE_FIELDS = ['objectType', 'expenseParticular', 'uacsCode'] as const;
export type ActivityBudgetReferences = { uacsCodes: Record<string, Record<string, Record<string, string>>> };

export function groupActivityExpenses(items: ActivityExpense[]) {
    const groups = new Map<string, ActivityExpense[]>();
    for (const item of items) {
        const key = item.budgetItemGroupId
            ? JSON.stringify([item.budgetItemGroupId, ...SHARED_ACTIVITY_EXPENSE_FIELDS.map(field => item[field])])
            : `legacy:${item.id}`;
        groups.set(key, [...(groups.get(key) || []), item]);
    }
    return [...groups].map(([key, rows]) => ({ key, rows }));
}

export function validateActivitySchedule(row: ActivityExpense, references: ActivityBudgetReferences, original?: ActivityExpense): string | null {
    const unchanged = original && SHARED_ACTIVITY_EXPENSE_FIELDS.every(field => original[field] === row[field]);
    if (!unchanged && !Object.hasOwn(references.uacsCodes[row.objectType]?.[row.expenseParticular] || {}, row.uacsCode)) return 'Select a listed UACS Code for this Object Type and Expense Particular.';
    if (![row.obligationMonth, row.disbursementMonth].every(isValidTargetMonth)) return 'Select valid Obligation and Disbursement months.';
    if (!Number.isFinite(Number(row.amount)) || Number(row.amount) <= 0) return 'Amount must be greater than zero.';
    if ((row.isCancelled || row.isRealignment || row.isSavings) && !row.adjustmentReason?.trim()) return 'A reason is required for this adjustment.';
    return null;
}

export function remapActivityExpenseGroups(items: ActivityExpense[]) {
    const mapping = new Map<string, string>();
    return items.map(item => {
        if (!item.budgetItemGroupId) return { ...item };
        if (!mapping.has(item.budgetItemGroupId)) mapping.set(item.budgetItemGroupId, crypto.randomUUID());
        return { ...item, budgetItemGroupId: mapping.get(item.budgetItemGroupId)! };
    });
}

export function rescheduleActivityTargets(items: ActivityExpense[], year: number) {
    const change = (date: string) => isValidTargetMonth(date) ? `${year}-${date.slice(5, 7)}-01` : date;
    return items.map(row => ({ ...row, obligationMonth: change(row.obligationMonth), disbursementMonth: change(row.disbursementMonth) }));
}
