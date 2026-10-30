import { supabase } from '../supabaseClient';
import type { BudgetTargetPlan } from './budgetTargetSchedules';
import { hasStructuredTargets } from './budgetTargetSchedules';

let capability: Promise<void> | undefined;

/** One cheap capability check per loaded client; no item/OU records are fetched. */
export async function requireIndependentTargetSupport(lines: readonly BudgetTargetPlan[]): Promise<void> {
    if (!lines.map(hasStructuredTargets).some(Boolean)) return;
    if (!supabase) throw new Error('The database connection is unavailable. Independent target schedules have not been saved.');
    if (!capability) capability = (async () => {
        const { data, error } = await supabase.rpc('budget_target_schedule_capability');
        if (error || data !== 2) throw new Error('Independent target schedules are not enabled on this database yet. Your draft has been kept.');
    })().catch(error => { capability = undefined; throw error; });
    await capability;
}
