export type TargetStage = 'obligation' | 'disbursement';

export interface BudgetTargetEntry {
    id: string;
    month: string;
    amount: number;
}

export interface BudgetTargetPlan {
    targetScheduleVersion?: 2 | null;
    targetObligationSchedules?: BudgetTargetEntry[] | null;
    targetDisbursementSchedules?: BudgetTargetEntry[] | null;
}

export const TARGET_PLAN_FIELDS = ['targetScheduleVersion', 'targetObligationSchedules', 'targetDisbursementSchedules'] as const;
export const LEGACY_TARGET_INPUT_FIELDS = ['amount', 'pricePerUnit', 'numberOfUnits', 'obligationMonth', 'disbursementMonth'] as const;

export function assertLegacyTargetConversionCurrent(base: BudgetTargetPlan, draft: BudgetTargetPlan, latest: BudgetTargetPlan): void {
    if (draft.targetScheduleVersion !== 2 || base.targetScheduleVersion === 2) return;
    if (LEGACY_TARGET_INPUT_FIELDS.some(field => JSON.stringify(base[field]) !== JSON.stringify(latest[field]))) {
        throw new Error('The legacy target inputs changed while you were editing. Refresh the record before converting its target plan. Your draft has been kept.');
    }
}

export const isValidTargetMonth = (value: unknown): value is string => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return year >= 1900 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

const stageField = (stage: TargetStage) => stage === 'obligation' ? 'targetObligationSchedules' : 'targetDisbursementSchedules';
const hasPlanData = (line: BudgetTargetPlan) => TARGET_PLAN_FIELDS.some(field => line[field] != null);

export function validateTargetPlan(line: BudgetTargetPlan): string | null {
    if (!hasPlanData(line)) return null;
    if (line.targetScheduleVersion !== 2) return 'Unsupported target schedule version. Refresh or contact your administrator.';
    const ids = new Set<string>();
    for (const stage of ['obligation', 'disbursement'] as const) {
        const entries = line[stageField(stage)];
        if (!Array.isArray(entries)) return `The ${stage} target schedule must be a list.`;
        for (const entry of entries) {
            if (!entry || typeof entry !== 'object' || Object.keys(entry).some(key => !['id', 'month', 'amount'].includes(key))) return `Invalid ${stage} target entry.`;
            if (typeof entry.id !== 'string' || !entry.id.trim() || ids.has(entry.id)) return 'Target entries must have unique identities within the budget item.';
            ids.add(entry.id);
            if (!isValidTargetMonth(entry.month)) return `Select a valid ${stage} target month.`;
            if (typeof entry.amount !== 'number' || !Number.isFinite(entry.amount) || entry.amount <= 0 || entry.amount > Number.MAX_SAFE_INTEGER) return `The ${stage} target amount must be a positive finite number.`;
        }
        const total = entries.reduce((sum, entry) => sum + entry.amount, 0);
        if (!Number.isFinite(total) || total > Number.MAX_SAFE_INTEGER) return `The ${stage} target total is too large.`;
    }
    return null;
}

export function hasStructuredTargets(line: BudgetTargetPlan): boolean {
    const error = validateTargetPlan(line);
    if (error) throw new Error(error);
    return line.targetScheduleVersion === 2;
}

/** The caller supplies its historical amount/date precedence; reading never mutates legacy JSON. */
export function readTargetSchedules(
    line: BudgetTargetPlan,
    stage: TargetStage,
    legacy: { amount: number; month?: string; ownerId?: string | number },
): readonly BudgetTargetEntry[] {
    if (hasStructuredTargets(line)) return line[stageField(stage)]!;
    return [{ id: `legacy:${legacy.ownerId ?? ''}:${stage}`, month: legacy.month || '', amount: legacy.amount }];
}

export const targetScheduleTotal = (entries: readonly BudgetTargetEntry[]) => entries.reduce((sum, entry) => sum + entry.amount, 0);

export function targetScheduleMonths(entries: readonly BudgetTargetEntry[], year: string | number = 'All'): number[] {
    const months = Array<number>(12).fill(0);
    for (const entry of entries) {
        if (!isValidTargetMonth(entry.month)) continue;
        const entryYear = entry.month.slice(0, 4);
        if (year !== 'All' && String(year) !== entryYear) continue;
        months[Number(entry.month.slice(5, 7)) - 1] += entry.amount;
    }
    return months;
}

export function cloneTargetPlan<T extends BudgetTargetPlan>(line: T): T {
    if (!hasStructuredTargets(line)) return { ...line };
    return {
        ...line,
        targetObligationSchedules: line.targetObligationSchedules!.map(entry => ({ ...entry, id: crypto.randomUUID() })),
        targetDisbursementSchedules: line.targetDisbursementSchedules!.map(entry => ({ ...entry, id: crypto.randomUUID() })),
    };
}

export function rescheduleTargetPlan<T extends BudgetTargetPlan>(line: T, year: number): T {
    if (!hasStructuredTargets(line)) return { ...line };
    const change = (entries: BudgetTargetEntry[]) => entries.map(entry => ({ ...entry, month: `${year}-${entry.month.slice(5, 7)}-01` }));
    return { ...line, targetObligationSchedules: change(line.targetObligationSchedules!), targetDisbursementSchedules: change(line.targetDisbursementSchedules!) };
}

export const targetPlansEqual = (before: BudgetTargetPlan, after: BudgetTargetPlan) =>
    TARGET_PLAN_FIELDS.every(field => JSON.stringify(before[field]) === JSON.stringify(after[field]));

export type TargetPlanOwner = BudgetTargetPlan & { id?: number | string; obligationMonth?: string; disbursementMonth?: string };

/** Materialize only in an explicit edit draft, never while loading a record. */
export function targetPlanForEditing(line: TargetPlanOwner, allocation: number): BudgetTargetPlan {
    if (hasStructuredTargets(line)) return {
        targetScheduleVersion: 2,
        targetObligationSchedules: line.targetObligationSchedules!.map(entry => ({ ...entry })),
        targetDisbursementSchedules: line.targetDisbursementSchedules!.map(entry => ({ ...entry })),
    };
    const legacy = (month?: string): BudgetTargetEntry[] => allocation > 0 || month
        ? [{ id: crypto.randomUUID(), month: month || '', amount: allocation }]
        : [];
    return { targetScheduleVersion: 2, targetObligationSchedules: legacy(line.obligationMonth), targetDisbursementSchedules: legacy(line.disbursementMonth) };
}
