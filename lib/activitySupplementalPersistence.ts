import { supabase } from '../supabaseClient';
import type { Activity, ActivityExpense, User } from '../constants';
import type { ActivitySupplement } from './activitySupplementalBudget';

export interface ActivitySupplementResult { activity: Activity; supplements: ActivitySupplement[]; revisions?: Array<{ id: number; operation: string; reason: string; created_at: string }>; }
export async function readActivitySupplements(activityId: number, actor: User, history = false): Promise<ActivitySupplementResult> {
    if (!supabase) throw new Error('The database connection is unavailable.');
    const { data, error } = await supabase.rpc('read_activity_supplements', { p_actor_id: actor.id, p_actor_password: actor.password || '', p_activity_id: activityId, p_history: history });
    if (error) throw new Error(error.message || 'Supplemental Information could not be loaded.');
    if (!data?.activity || data.activity.id !== activityId || !Array.isArray(data.activity.expenses) || !Array.isArray(data.supplements)) throw new Error('The server returned incomplete supplemental information.');
    return data;
}
export async function saveActivitySupplement(args: {
    activity: Activity; actor: User; uid: string; operation: 'draft' | 'submit' | 'approve' | 'reject' | 'withdraw' | 'delete' | 'baseline';
    source: string; reference: string; authorizationDate: string; reason: string; rows: ActivityExpense[];
    revision: number; establishBaseline: boolean; requestKey: string;
}): Promise<ActivitySupplementResult> {
    if (!supabase) throw new Error('The database connection is unavailable. No changes were saved.');
    const { data, error } = await supabase.rpc('save_activity_supplement', {
        p_actor_id: args.actor.id, p_actor_password: args.actor.password || '', p_activity_id: args.activity.id,
        p_uid: args.uid, p_operation: args.operation, p_source: args.source, p_reference: args.reference,
        p_authorization_date: args.authorizationDate || null, p_reason: args.reason, p_rows: args.rows,
        p_expected_revision: args.revision, p_expected_updated_at: args.activity.updated_at || null,
        p_establish_baseline: args.establishBaseline, p_request_key: args.requestKey,
    });
    if (error) throw new Error(error.message || 'The supplement could not be saved.');
    if (!data?.activity || data.activity.id !== args.activity.id || !Array.isArray(data.activity.expenses) || !Array.isArray(data.supplements)) throw new Error('No confirmed supplemental result was returned. Reload before retrying.');
    return data;
}
