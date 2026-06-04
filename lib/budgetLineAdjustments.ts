import type { DisbursementRecord, ObligationRecord, User } from '../constants';
import { supabase } from '../supabaseClient';

export type BudgetAdjustmentSourceType = 'subproject_detail' | 'activity_expense' | 'staffing_expense';

export type BudgetAdjustmentAction =
    | 'cancel'
    | 'restore'
    | 'tag_realignment'
    | 'tag_savings'
    | 'clear_tag'
    | 'create_adjustment_item'
    | 'edit_adjustment_item'
    | 'delete_adjustment_item';

export interface BudgetItemAdjustmentHistory {
    id?: number;
    source_type: BudgetAdjustmentSourceType;
    parent_id: number | string;
    item_id: number | string;
    action: BudgetAdjustmentAction;
    source_item_id?: number | string | null;
    before_snapshot?: any;
    after_snapshot?: any;
    amount_delta?: number;
    reason: string;
    created_by?: string | null;
    created_by_name?: string | null;
    created_at?: string;
}

export interface AdjustableBudgetLine {
    id?: number | string;
    amount?: number | string | null;
    pricePerUnit?: number | string | null;
    numberOfUnits?: number | string | null;
    actualObligationAmount?: number | string | null;
    actualDisbursementAmount?: number | string | null;
    obligations?: Array<Partial<ObligationRecord> & { amount?: number; date?: string }>;
    disbursements?: Array<Partial<DisbursementRecord> & { amount?: number; date?: string }>;
    isCancelled?: boolean;
    isRealignment?: boolean;
    isSavings?: boolean;
    originalPlannedAmount?: number | null;
    originalPricePerUnit?: number | null;
    originalNumberOfUnits?: number | null;
    originalCapturedAt?: string | null;
    sourceItemId?: number | string | null;
    adjustmentReason?: string | null;
    [key: string]: any;
}

export type BudgetLineTag = 'Cancelled' | 'Realignment' | 'Savings' | null;

const MONTH_KEYS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

export const toFiniteNumber = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

export const getBudgetLineAmount = (line?: AdjustableBudgetLine | null) => {
    if (!line) return 0;
    if (line.amount !== undefined && line.amount !== null && line.amount !== '') return toFiniteNumber(line.amount);
    return toFiniteNumber(line.pricePerUnit) * toFiniteNumber(line.numberOfUnits);
};

export const getBudgetLineTag = (line?: AdjustableBudgetLine | null): BudgetLineTag => {
    if (!line) return null;
    if (line.isCancelled) return 'Cancelled';
    if (line.isRealignment) return 'Realignment';
    if (line.isSavings) return 'Savings';
    return null;
};

export const normalizeBudgetLineStatus = <T extends AdjustableBudgetLine>(line: T): T => {
    const tag = getBudgetLineTag(line);
    return {
        ...line,
        isCancelled: tag === 'Cancelled',
        isRealignment: tag === 'Realignment',
        isSavings: tag === 'Savings',
    };
};

export const isBudgetLineExcludedFromTargets = (line?: AdjustableBudgetLine | null) =>
    !!(line?.isCancelled || line?.isRealignment || line?.isSavings);

export const isParentExcludedFromTargets = (record?: { status?: string; isRealignment?: boolean; isSavings?: boolean } | null) =>
    !!(record?.status === 'Cancelled' || record?.isRealignment || record?.isSavings);

export const isRecordOrLineExcludedFromTargets = (
    record?: { status?: string; isRealignment?: boolean; isSavings?: boolean } | null,
    line?: AdjustableBudgetLine | null
) => isParentExcludedFromTargets(record) || isBudgetLineExcludedFromTargets(line);

export const ensureOriginalBudgetSnapshot = <T extends AdjustableBudgetLine>(line: T): T => {
    const normalizedLine = normalizeBudgetLineStatus(line);
    if (line.originalCapturedAt && line.originalPlannedAmount !== undefined && line.originalPlannedAmount !== null) {
        return normalizedLine;
    }

    return {
        ...normalizedLine,
        originalPlannedAmount: getBudgetLineAmount(normalizedLine),
        originalPricePerUnit: normalizedLine.pricePerUnit !== undefined && normalizedLine.pricePerUnit !== null ? toFiniteNumber(normalizedLine.pricePerUnit) : undefined,
        originalNumberOfUnits: normalizedLine.numberOfUnits !== undefined && normalizedLine.numberOfUnits !== null ? toFiniteNumber(normalizedLine.numberOfUnits) : undefined,
        originalCapturedAt: new Date().toISOString(),
    };
};

export const getBudgetLineActualObligation = (line?: AdjustableBudgetLine | null) => {
    if (!line) return 0;
    if (line.obligations && line.obligations.length > 0) {
        return line.obligations.reduce((sum, item) => sum + toFiniteNumber(item.amount), 0);
    }
    return toFiniteNumber(line.actualObligationAmount);
};

export const getBudgetLineActualDisbursement = (line?: AdjustableBudgetLine | null) => {
    if (!line) return 0;
    if (line.disbursements && line.disbursements.length > 0) {
        return line.disbursements.reduce((sum, item) => sum + toFiniteNumber(item.amount), 0);
    }

    const monthlyActual = MONTH_KEYS.reduce((sum, month) => sum + toFiniteNumber(line[`actualDisbursement${month}`]), 0);
    return monthlyActual > 0 ? monthlyActual : toFiniteNumber(line.actualDisbursementAmount);
};

export const summarizeBudgetAdjustments = (lines: AdjustableBudgetLine[] = []) => {
    const summary = lines.reduce(
        (summary, rawLine) => {
            const line = ensureOriginalBudgetSnapshot(rawLine);
            const amount = getBudgetLineAmount(line);
            const originalAmount = toFiniteNumber(line.originalPlannedAmount) || amount;
            const actualObligated = getBudgetLineActualObligation(line);
            const actualDisbursed = getBudgetLineActualDisbursement(line);

            summary.originalPlannedBudget += originalAmount;
            summary.actualObligated += actualObligated;
            summary.actualDisbursed += actualDisbursed;

            if (line.isCancelled) {
                summary.cancelledAmount += amount;
            } else if (line.isRealignment) {
                summary.realignedAmount += amount;
            } else if (line.isSavings) {
                summary.savingsAmount += amount;
            } else {
                summary.activeTargetBudget += amount;
            }

            return summary;
        },
        {
            originalPlannedBudget: 0,
            activeTargetBudget: 0,
            cancelledAmount: 0,
            realignedAmount: 0,
            savingsAmount: 0,
            actualObligated: 0,
            actualDisbursed: 0,
        }
    );
    summary.savingsAmount = Math.max(summary.originalPlannedBudget - summary.actualObligated, 0);
    return summary;
};

export const requestAdjustmentReason = (actionLabel: string) => {
    const reason = window.prompt(`Reason for ${actionLabel}:`);
    if (!reason || !reason.trim()) {
        window.alert('A short reason is required before saving this budget item adjustment.');
        return null;
    }
    return reason.trim();
};

export const writeBudgetItemAdjustmentHistory = async (entry: {
    sourceType: BudgetAdjustmentSourceType;
    parentId: number | string;
    itemId: number | string;
    action: BudgetAdjustmentAction;
    beforeSnapshot?: any;
    afterSnapshot?: any;
    sourceItemId?: number | string | null;
    reason: string;
    currentUser?: User | null;
}) => {
    if (!supabase) {
        return null;
    }

    const payload: BudgetItemAdjustmentHistory = {
        source_type: entry.sourceType,
        parent_id: entry.parentId,
        item_id: entry.itemId,
        action: entry.action,
        source_item_id: entry.sourceItemId ?? null,
        before_snapshot: entry.beforeSnapshot ?? null,
        after_snapshot: entry.afterSnapshot ?? null,
        amount_delta: getBudgetLineAmount(entry.afterSnapshot) - getBudgetLineAmount(entry.beforeSnapshot),
        reason: entry.reason,
        created_by: entry.currentUser?.email || entry.currentUser?.username || null,
        created_by_name: entry.currentUser?.fullName || entry.currentUser?.username || null,
    };

    const { error, data } = await supabase
        .from('budget_item_adjustment_history')
        .insert(payload)
        .select('*')
        .single();

    if (error) {
        console.warn('Unable to write budget item adjustment history', error);
        throw error;
    }

    return data as BudgetItemAdjustmentHistory;
};
