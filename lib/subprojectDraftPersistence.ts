import type { Subproject, SubprojectDetail } from '../constants';
import { supabase } from '../supabaseClient';
import { resolveSubprojectCompletionRollup } from './subprojectCompletion';
import { sameSubprojectActualValue } from './subprojectAccomplishmentPersistence';
import { assertLegacyTargetConversionCurrent, rescheduleTargetPlan } from './budgetTargetSchedules';
import { requireIndependentTargetSupport } from './budgetTargetPersistence';

const equal = sameSubprojectActualValue;
const conflict = () => new Error('This record changed while you were editing. Your draft has not been saved. Reopen the current record before applying these changes.');

function mergeFields<T extends object>(base: T, draft: T, latest: T, ignored: string[] = []): T {
    const result = { ...latest };
    for (const key of new Set([...Object.keys(base), ...Object.keys(draft)])) {
        if (ignored.includes(key) || equal(base[key], draft[key])) continue;
        if (!equal(base[key], latest[key]) && !equal(draft[key], latest[key])) throw conflict();
        result[key] = draft[key];
    }
    return result;
}

// Apply only the user's changed fields, keyed by stable row identity, to the latest plan/actuals.
export function mergeSubprojectDraft(base: Subproject, draft: Subproject, latest: Subproject): Subproject {
    const result = mergeFields(base, draft, latest, ['details', 'history', 'updated_at', 'created_at', 'id']);
    const byId = new Map((draft.details || []).map(row => [String(row.id), row]));
    const originals = new Map((base.details || []).map(row => [String(row.id), row]));
    result.details = (latest.details || []).flatMap(row => {
        const id = String(row.id), original = originals.get(id), changed = byId.get(id);
        if (!original) return [row];
        if (!changed) {
            if (!equal(original, row)) throw conflict();
            return [];
        }
        assertLegacyTargetConversionCurrent(original, changed, row);
        return [mergeFields(original, changed, row, ['id'])];
    });
    for (const row of draft.details || []) {
        const id = String(row.id);
        if (!originals.has(id)) {
            if ((latest.details || []).some(saved => String(saved.id) === id)) throw conflict();
            result.details.push(row);
        } else if (!(latest.details || []).some(saved => String(saved.id) === id) && !equal(originals.get(id), row)) throw conflict();
    }
    result.history = [...(latest.history || []), ...(draft.history || []).slice((base.history || []).length)];
    return result;
}

export function getChangedSubprojectActualIds(base: SubprojectDetail[], draft: SubprojectDetail[], stage: 'obligation' | 'disbursement'): Set<string> {
    const arrayKey = stage === 'obligation' ? 'obligations' : 'disbursements';
    const amountKey = stage === 'obligation' ? 'actualObligationAmount' : 'actualDisbursementAmount';
    const dateKey = stage === 'obligation' ? 'actualObligationDate' : 'actualDisbursementDate';
    const originals = new Map(base.map(row => [String(row.id), row]));
    return new Set(draft.filter(row => {
        const original = originals.get(String(row.id));
        return !equal(original?.[arrayKey] || [], row[arrayKey] || [])
            || Number(original?.[amountKey] || 0) !== Number(row[amountKey] || 0)
            || !equal(original?.[dateKey] || null, row[dateKey] || null);
    }).map(row => String(row.id)));
}

export async function persistSubprojectDraft(base: Subproject, draft: Subproject, mode: string, expectedStatus?: string | null): Promise<Subproject> {
    if (mode === 'budget') await requireIndependentTargetSupport(draft.details || []);
    if (!supabase) return draft;
    const { data: latest, error: readError } = await supabase.from('subprojects').select('*').eq('id', base.id).maybeSingle();
    if (readError) throw readError;
    if (!latest) throw new Error('The subproject is no longer available. No changes were saved.');
    if (latest.status !== base.status || (expectedStatus && latest.status !== expectedStatus)) throw conflict();
    const merged = mergeSubprojectDraft(base, draft, latest as Subproject);
    if (mode === 'budget' || mode === 'accomplishment') {
        const rollup = resolveSubprojectCompletionRollup(merged.details, merged.status);
        merged.details = rollup.details;
        if (mode === 'budget' && base.status === 'Proposed') merged.status = 'Proposed';
        else if (merged.status !== 'Cancelled') merged.status = rollup.isComplete ? 'Completed' : (merged.status === 'Completed' || mode === 'accomplishment' ? 'Ongoing' : merged.status);
        merged.actualCompletionDate = merged.status === 'Completed' ? rollup.actualCompletionDate : null;
    }
    const { id, created_at, ...payload } = merged;
    payload.updated_at = new Date().toISOString();
    for (const field of ['startDate', 'estimatedCompletionDate', 'actualCompletionDate']) if (payload[field] === '') payload[field] = null;
    let query = supabase.from('subprojects').update(payload).eq('id', id).eq('status', latest.status);
    query = latest.updated_at ? query.eq('updated_at', latest.updated_at) : query.is('updated_at', null);
    const { data, error } = await query.select('*').maybeSingle();
    if (error) throw error;
    if (!data) throw conflict();
    return data as Subproject;
}

export function rescheduleBudgetTargets(items: SubprojectDetail[], year: number): SubprojectDetail[] {
    const change = (date?: string) => date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${year}-${date.slice(5, 7)}-01` : date;
    return items.map(row => row.isSuperseded ? row : { ...rescheduleTargetPlan(row, year), deliveryDate: change(row.deliveryDate), obligationMonth: change(row.obligationMonth), disbursementMonth: change(row.disbursementMonth) });
}
