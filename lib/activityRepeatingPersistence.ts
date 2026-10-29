import type { Activity } from '../constants';
import { supabase } from '../supabaseClient';

export interface RepeatingCreateAttempt {
    payload: Omit<Activity, 'id'>;
    confirmed?: Activity;
    uncertain: boolean;
}

/** Retain uncertain identities for read-only recovery; absence is not proof an INSERT rolled back. */
export async function persistRepeatingActivity(attempt: RepeatingCreateAttempt): Promise<Activity> {
    if (attempt.confirmed) return attempt.confirmed;
    if (!supabase) throw new Error('Database connection is unavailable. No repeating activities were created.');
    if (attempt.uncertain) {
        const { data, error } = await supabase.from('activities').select('*').eq('uid', attempt.payload.uid).maybeSingle();
        if (error || !data?.id || data.uid !== attempt.payload.uid) throw new Error(`The save for ${attempt.payload.uid} is not confirmed. Check Activities before retrying; this entry will not be inserted again automatically.`);
        attempt.confirmed = data as Activity;
        attempt.uncertain = false;
        return attempt.confirmed;
    }
    attempt.uncertain = true;
    const { data, error } = await supabase.from('activities').insert([attempt.payload]).select();
    if (error) {
        // Data/constraint/authorization SQL rejections roll back; transport/response errors may not.
        if (/^(?:22|23|42|P0)[0-9A-Z]{3}$/.test(error.code || '')) attempt.uncertain = false;
        throw new Error(error.message || 'Unable to confirm the activity save.');
    }
    if (data?.length !== 1 || !data[0]?.id || data[0].uid !== attempt.payload.uid) {
        throw new Error('No confirmed activity was returned. Check the saved entry before retrying.');
    }
    attempt.confirmed = data[0] as Activity;
    attempt.uncertain = false;
    return attempt.confirmed;
}
