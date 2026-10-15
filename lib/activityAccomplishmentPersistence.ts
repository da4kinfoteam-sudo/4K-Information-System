import type { Activity, ActivityExpense, User } from '../constants';
import { supabase } from '../supabaseClient';

export type ActivityActualStage = 'obligation' | 'disbursement';
export interface ActivityActualEntry { id: string | number; date: string; amount: number; remarks?: string; }
export interface ActivityActualStageSnapshot { source: 'central' | 'legacy'; entries: ActivityActualEntry[]; }
export interface ActivityAccomplishmentSnapshot {
    activity: Activity;
    stages: Record<string, Record<ActivityActualStage, ActivityActualStageSnapshot>>;
}
export interface ActivityAccomplishmentRequest { key?: string; fingerprint?: string; reason?: string; }
export type ActivityActualRemovals = Record<string, string[]>;
const fields = ['actualDate', 'actualEndDate', 'actualParticipantsMale', 'actualParticipantsFemale', 'actualPWD', 'actualMuslim', 'actualLGBTQ', 'actualSoloParent', 'actualSenior', 'actualYouth'] as const;
const keyFor = (itemId: string | number, stage: ActivityActualStage) => `${itemId}:${stage}`;
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)])) : value ?? null;
export const sameActivityActualValue = (a: unknown, b: unknown) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
export function getActivityPhysicalChanges(base: Activity, draft: Activity) {
    const changes: Record<string, unknown> = {};
    for (const field of fields) {
        const normalize = (value: unknown) => ['actualDate', 'actualEndDate'].includes(field) ? value || null : Number(value || 0);
        if (!sameActivityActualValue(normalize(base[field]), normalize(draft[field]))) changes[field] = normalize(draft[field]);
    }
    return changes;
}
const normalizeEntry = (entry: ActivityActualEntry, original?: ActivityActualEntry) => ({
    date: original?.date?.slice(0, 7) === entry.date?.slice(0, 7) ? original.date : String(entry.date || ''),
    amount: Number(entry.amount), remarks: String(entry.remarks || ''),
});

export function validateActivityAccomplishmentSnapshot(value: any): ActivityAccomplishmentSnapshot {
    const expenses = value?.activity?.expenses ?? [];
    if (!value?.activity?.id || !Array.isArray(expenses) || !value.stages) throw new Error('Existing Activity actuals could not be loaded completely. No changes were saved.');
    if (expenses.some(row => row?.id == null) || new Set(expenses.map(row => String(row.id))).size !== expenses.length) throw new Error('Expense identities are ambiguous. Reopen before saving.');
    for (const expense of expenses) {
        for (const stage of ['obligation', 'disbursement']) {
            const data = value.stages[String(expense.id)]?.[stage];
            if (!['central', 'legacy'].includes(data?.source) || !Array.isArray(data?.entries)
                || new Set(data.entries.map(row => String(row.id))).size !== data.entries.length
                || data.entries.some(row => row.id == null || row.id === '' || !Number.isFinite(Number(row.amount)))) {
                throw new Error('Existing financial entries are incomplete or have ambiguous identities. Reopen before saving.');
            }
        }
    }
    return value;
}

export function hydrateActivityAccomplishment(snapshot: ActivityAccomplishmentSnapshot): Activity {
    return { ...snapshot.activity, expenses: (snapshot.activity.expenses || []).map(expense => {
        const result = { ...expense };
        for (const stage of ['obligation', 'disbursement'] as const) {
            const entries = snapshot.stages[String(expense.id)][stage].entries.map(row => ({ ...row, id: /^\d+$/.test(String(row.id)) && Number.isSafeInteger(Number(row.id)) ? Number(row.id) : row.id, amount: Number(row.amount), remarks: row.remarks || '' }));
            const arrayKey = stage === 'obligation' ? 'obligations' : 'disbursements';
            result[arrayKey] = entries as unknown as ActivityExpense[typeof arrayKey];
            result[stage === 'obligation' ? 'actualObligationAmount' : 'actualDisbursementAmount'] = entries.reduce((total, row) => total + row.amount, 0);
            result[stage === 'obligation' ? 'actualObligationDate' : 'actualDisbursementDate'] = entries.map(row => row.date || '').sort().at(-1) || null;
        }
        return result;
    }) };
}

export async function readActivityAccomplishments(ids: number[], actor: User, surface: 'activity' | 'financial' = 'activity') {
    if (!supabase || !actor?.id) throw new Error('A database connection and signed-in user are required.');
    const uniqueIds = [...new Set(ids)];
    const snapshots: ActivityAccomplishmentSnapshot[] = [];
    for (let offset = 0; offset < uniqueIds.length; offset += 100) {
        const batch = uniqueIds.slice(offset, offset + 100);
        const { data, error } = await supabase.rpc('read_activity_accomplishments', {
            p_actor_id: actor.id, p_actor_password: actor.password || '', p_activity_ids: batch, p_surface: surface,
        });
        if (error) throw new Error(error.message || 'Existing financial actuals could not be loaded.');
        if (!Array.isArray(data) || data.length !== batch.length || data.some(row => !batch.includes(row?.activity?.id)) || new Set(data.map(row => row?.activity?.id)).size !== batch.length) throw new Error('The server returned incomplete Activity actuals.');
        snapshots.push(...data.map(validateActivityAccomplishmentSnapshot));
    }
    return snapshots;
}

export function buildActivityActualEdits(base: ActivityAccomplishmentSnapshot, draft: Activity, removals: ActivityActualRemovals = {}, onlyStage?: ActivityActualStage, onlyItem?: string) {
    const edits = [];
    for (const expense of draft.expenses) {
        if (onlyItem && String(expense.id) !== onlyItem) continue;
        for (const stage of ['obligation', 'disbursement'] as const) {
            if (onlyStage && stage !== onlyStage) continue;
            const baseline = base.stages[String(expense.id)]?.[stage];
            if (!baseline) throw new Error('The expense is not in the loaded accomplishment baseline.');
            const entries = (stage === 'obligation' ? expense.obligations : expense.disbursements) || [];
            const byId = new Map(entries.map(row => [String(row.id), row]));
            if (byId.size !== entries.length) throw new Error('Financial entry identities must be unique.');
            const originals = new Map(baseline.entries.map(row => [String(row.id), row]));
            const operations = [];
            for (const original of baseline.entries) {
                const edited = byId.get(String(original.id));
                if (!edited) {
                    if (!removals[keyFor(expense.id, stage)]?.includes(String(original.id))) throw new Error('An existing financial entry is missing without an explicit removal. Your draft was not saved.');
                    operations.push({ action: 'delete', id: String(original.id), explicit: true });
                } else if (!sameActivityActualValue(normalizeEntry(original), normalizeEntry(edited, original))) {
                    operations.push({ action: 'update', id: String(original.id), value: normalizeEntry(edited, original) });
                }
            }
            for (const entry of entries) if (!originals.has(String(entry.id))) operations.push({ action: 'insert', id: String(entry.id), value: normalizeEntry(entry) });
            if (operations.length) edits.push({ itemId: String(expense.id), stage, operations });
        }
    }
    return edits;
}

export async function saveActivityAccomplishment(args: {
    base: ActivityAccomplishmentSnapshot; draft: Activity; actor: User; removals?: ActivityActualRemovals;
    surface?: 'activity' | 'financial'; onlyStage?: ActivityActualStage; onlyItem?: string;
    targets?: Array<{ itemId: string; values: Record<string, unknown> }>;
    reason?: string; request: ActivityAccomplishmentRequest;
}) {
    if (!supabase || !args.actor?.id) throw new Error('The database connection or user session is unavailable. No changes were saved.');
    const edits = buildActivityActualEdits(args.base, args.draft, args.removals, args.onlyStage, args.onlyItem);
    const physical = (args.surface || 'activity') === 'activity' ? getActivityPhysicalChanges(args.base.activity, args.draft) : {};
    const payload = { p_base: args.base, p_edits: edits, p_physical: physical, p_targets: args.targets || [], p_surface: args.surface || 'activity' };
    const fingerprint = JSON.stringify(canonical(payload));
    if (args.request.fingerprint !== fingerprint) { args.request.fingerprint = fingerprint; args.request.key = crypto.randomUUID(); args.request.reason = args.reason || ''; }
    const { data, error } = await supabase.rpc('save_activity_accomplishment', {
        ...payload, p_reason: args.request.reason || '', p_actor_id: args.actor.id, p_actor_password: args.actor.password || '', p_activity_id: args.base.activity.id, p_request_key: args.request.key,
    });
    if (error) throw new Error(error.message || 'The accomplishment could not be saved. Your draft has been kept.');
    const confirmed = validateActivityAccomplishmentSnapshot(data);
    if (confirmed.activity.id !== args.base.activity.id) throw new Error('The server returned a different Activity. Reload before retrying.');
    return confirmed;
}
