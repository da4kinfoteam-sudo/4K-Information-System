import type { Activity, User } from '../constants';
import { dcfChangedFields, persistDcfMutation, type DcfMutationRequest } from './dcfMutation';
import { supabase } from '../supabaseClient';
import { requireIndependentTargetSupport } from './budgetTargetPersistence';

export interface RepeatingCreateAttempt {
    payload: Omit<Activity, 'id'>;
    confirmed?: Activity;
    uncertain: boolean;
    request?: DcfMutationRequest;
}

/** Retain uncertain identities for read-only recovery; absence is not proof an INSERT rolled back. */
export async function persistRepeatingActivity(attempt: RepeatingCreateAttempt, actor?: User): Promise<Activity> {
    if (attempt.confirmed) return attempt.confirmed;
    if (!supabase) throw new Error('Database connection is unavailable. No repeating activities were created.');
    if (!actor?.id) throw new Error('A signed-in user is required. No repeating activities were created.');
    if (attempt.uncertain) {
        const { data, error } = await supabase.from('activities').select('*').eq('uid', attempt.payload.uid).maybeSingle();
        if (error || !data?.id || data.uid !== attempt.payload.uid) throw new Error(`The save for ${attempt.payload.uid} is not confirmed. Check Activities before retrying; this entry will not be inserted again automatically.`);
        attempt.confirmed = data as Activity;
        attempt.uncertain = false;
        return attempt.confirmed;
    }
    await requireIndependentTargetSupport(attempt.payload.expenses || []);
    attempt.uncertain = true;
    attempt.request ||= {};
    let record: Activity;
    try {
        const result = await persistDcfMutation({ entityType: 'activities', changes: dcfChangedFields({}, attempt.payload), actor,
            source: 'activity-edit-repeating-create', request: attempt.request });
        record = result.record as Activity;
    } catch (error) {
        // Data/constraint/authorization SQL rejections roll back; transport/response errors may not.
        if (/^(?:22|23|42|P0)[0-9A-Z]{3}$/.test((error as { code?: string }).code || '')) attempt.uncertain = false;
        throw error;
    }
    if (!record?.id || record.uid !== attempt.payload.uid) {
        throw new Error('No confirmed activity was returned. Check the saved entry before retrying.');
    }
    attempt.confirmed = record;
    attempt.uncertain = false;
    return attempt.confirmed;
}
