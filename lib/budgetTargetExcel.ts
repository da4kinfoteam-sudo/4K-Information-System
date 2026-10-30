import type { BudgetTargetPlan, TargetPlanOwner, TargetStage } from './budgetTargetSchedules';
import { hasStructuredTargets, validateTargetPlan } from './budgetTargetSchedules';

export const TARGET_SHEET_HEADERS = ['uid', 'item_id', 'schedule_id', 'month', 'amount'];
export const TARGET_SHEET_NAMES = { obligation: 'Obligation Targets', disbursement: 'Disbursement Targets' } as const;

export function exportTargetRows(owners: Array<{ uid?: string; line: TargetPlanOwner }>, stage: TargetStage) {
    return owners.flatMap(({ uid, line }) => {
        if (!hasStructuredTargets(line)) return [];
        if (line.id == null || !Number.isSafeInteger(Number(line.id))) throw new Error('A structured target plan has no valid budget-item identity.');
        const entries = stage === 'obligation' ? line.targetObligationSchedules! : line.targetDisbursementSchedules!;
        return entries.map(entry => ({ uid: uid || '', item_id: String(line.id), schedule_id: entry.id, month: entry.month, amount: entry.amount }));
    });
}

export function importedBudgetItemId(value: unknown, fallback: number): number {
    if (value == null || String(value).trim() === '') return fallback;
    if (typeof value !== 'string' && typeof value !== 'number') throw new Error('Budget item IDs must be safe whole numbers.');
    const id = Number(value);
    if (!Number.isSafeInteger(id)) throw new Error('Budget item IDs must be safe whole numbers.');
    return id;
}

export function importedOptionalBudgetAmount(flag: unknown, value: unknown): { amount?: number | null } {
    if (flag == null || flag === '' || [false, 'false', 0, '0'].includes(flag as never)) return {};
    if (![true, 'true', 1, '1'].includes(flag as never)) throw new Error('detail_amount_is_set must be true or false.');
    if (value == null || value === '') return { amount: null };
    if (!['string', 'number'].includes(typeof value) || !Number.isFinite(Number(value))) throw new Error('Explicit budget amounts must be finite numbers or blank.');
    return { amount: Number(value) };
}

/** Join children to one stable owner; never zip stages or multiply cost/delivery rows. */
export function targetWorkbookImporter(sheets: Record<TargetStage, Array<Record<string, unknown>>>) {
    const plans = new Map<string, { uid: string; itemId: string; plan: BudgetTargetPlan }>();
    const used = new Set<string>();
    const key = (uid: string, itemId: string) => JSON.stringify([uid, itemId]);
    for (const stage of ['obligation', 'disbursement'] as const) {
        sheets[stage].forEach((row, index) => {
            if (TARGET_SHEET_HEADERS.every(field => row[field] == null || row[field] === '')) return;
            const uid = String(row.uid ?? '').trim(), itemId = String(row.item_id ?? '').trim();
            if (!uid || !itemId) throw new Error(`${TARGET_SHEET_NAMES[stage]} row ${index + 2}: UID and item_id are required.`);
            importedBudgetItemId(itemId, 0);
            const ownerKey = key(uid, String(Number(itemId)));
            const owner = plans.get(ownerKey) || { uid, itemId, plan: { targetScheduleVersion: 2 as const, targetObligationSchedules: [], targetDisbursementSchedules: [] } };
            const field = stage === 'obligation' ? 'targetObligationSchedules' : 'targetDisbursementSchedules';
            if (!['string', 'number'].includes(typeof row.amount) || String(row.amount).trim() === '') {
                throw new Error(`${TARGET_SHEET_NAMES[stage]} row ${index + 2}: amount must be a positive number.`);
            }
            owner.plan[field]!.push({ id: String(row.schedule_id ?? '').trim(), month: String(row.month ?? '').trim(), amount: Number(row.amount) });
            plans.set(ownerKey, owner);
        });
    }
    return {
        read(uid: string, itemId: number, version: unknown): BudgetTargetPlan {
            const ownerKey = key(uid, String(itemId)), owner = plans.get(ownerKey);
            const hasVersion = version != null && String(version).trim() !== '';
            if (!hasVersion && !owner) return {};
            if (!hasVersion || Number(version) !== 2) throw new Error(`${uid}, item ${itemId}: targetScheduleVersion must be 2 for structured targets.`);
            if (used.has(ownerKey)) throw new Error(`${uid}, item ${itemId}: duplicate budget owner row. Financial schedules belong in the separate stage sheets.`);
            const plan: BudgetTargetPlan = owner?.plan || { targetScheduleVersion: 2, targetObligationSchedules: [], targetDisbursementSchedules: [] };
            const issue = validateTargetPlan(plan);
            if (issue) throw new Error(`${uid}, item ${itemId}: ${issue}`);
            used.add(ownerKey);
            return plan;
        },
        assertUsed(ignoredUids: Set<string> = new Set()) {
            for (const [ownerKey, owner] of plans) if (!used.has(ownerKey) && !ignoredUids.has(owner.uid)) {
                throw new Error(`${owner.uid}, item ${owner.itemId}: target entries have no matching budget owner row.`);
            }
        },
    };
}
