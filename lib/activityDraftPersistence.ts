import type { Activity, ActivityExpense } from '../constants';
import { supabase } from '../supabaseClient';
import { sameActivityActualValue } from './activityAccomplishmentPersistence';

const equal = sameActivityActualValue;
const conflict = () => new Error('This activity changed while you were editing. Your draft has not been saved. Reopen the current record before applying these changes.');
const ACTUAL_FIELDS = ['obligations', 'disbursements', 'actualObligationAmount', 'actualObligationDate', 'actualDisbursementAmount', 'actualDisbursementDate', 'actualAmount'];

function mergeFields<T extends object>(base: T, draft: T, latest: T, ignored: string[] = []): T {
    const result = { ...latest };
    for (const key of new Set([...Object.keys(base), ...Object.keys(draft)])) {
        if (ignored.includes(key) || equal(base[key], draft[key])) continue;
        if (!equal(base[key], latest[key]) && !equal(draft[key], latest[key])) throw conflict();
        result[key] = draft[key];
    }
    return result;
}

export function mergeActivityExpenses(base: ActivityExpense[], draft: ActivityExpense[], latest: ActivityExpense[], targetsOnly = false) {
    const originals = new Map(base.map(row => [String(row.id), row]));
    const changed = new Map(draft.map(row => [String(row.id), row]));
    const result = latest.flatMap(row => {
        const id = String(row.id), original = originals.get(id), edited = changed.get(id);
        if (!original) return [row];
        if (!edited) { if (!equal(original, row)) throw conflict(); return []; }
        return [mergeFields(original, edited, row, ['id', ...(targetsOnly ? ACTUAL_FIELDS : [])])];
    });
    for (const row of draft) {
        const id = String(row.id);
        if (!originals.has(id)) {
            if (latest.some(saved => String(saved.id) === id)) throw conflict();
            result.push(row);
        } else if (!latest.some(saved => String(saved.id) === id) && !equal(originals.get(id), row)) throw conflict();
    }
    return result;
}

export function getChangedActivityActualIds(base: ActivityExpense[], draft: ActivityExpense[], stage: 'obligation' | 'disbursement') {
    const array = stage === 'obligation' ? 'obligations' : 'disbursements';
    const amount = stage === 'obligation' ? 'actualObligationAmount' : 'actualDisbursementAmount';
    const date = stage === 'obligation' ? 'actualObligationDate' : 'actualDisbursementDate';
    const originals = new Map(base.map(row => [String(row.id), row]));
    return new Set(draft.filter(row => {
        const original = originals.get(String(row.id));
        return !equal(original?.[array] || [], row[array] || []) || Number(original?.[amount] || 0) !== Number(row[amount] || 0) || !equal(original?.[date] || null, row[date] || null);
    }).map(row => String(row.id)));
}

export async function persistActivityDraft(base: Activity, draft: Activity, mode: 'expenses'): Promise<Activity> {
    if (mode !== 'expenses') throw new Error('Accomplishments must use the transactional financial save operation.');
    if (!supabase) return draft;
    const { data, error: readError } = await supabase.from('activities').select('*').eq('id', base.id).maybeSingle();
    if (readError) throw readError;
    if (!data) throw new Error('The activity is no longer available. No changes were saved.');
    const latest = data as Activity;
    if (latest.status !== base.status || !equal(latest.workflow_status, base.workflow_status) || !equal(latest.budgetItemTransferId, base.budgetItemTransferId)
        || !equal(latest.operatingUnit, base.operatingUnit) || latest.type !== base.type) throw conflict();
    const payload: Record<string, unknown> = {
        expenses: mergeActivityExpenses(base.expenses || [], draft.expenses || [], latest.expenses || [], true),
        history: [...(latest.history || []), ...(draft.history || []).slice((base.history || []).length)],
        updated_at: new Date().toISOString(),
    };
    let query = supabase.from('activities').update(payload).eq('id', base.id).eq('status', latest.status);
    query = latest.updated_at ? query.eq('updated_at', latest.updated_at) : query.is('updated_at', null);
    const { data: confirmed, error } = await query.select('*').maybeSingle();
    if (error) throw error;
    if (!confirmed) throw conflict();
    return confirmed as Activity;
}
