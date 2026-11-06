import { supabase } from '../supabaseClient';
import type { User } from '../constants';
import type { DcfEntityType } from './dcfMutation';

export interface DcfArchiveRecoveryResult {
    entityType: DcfEntityType;
    parentId: number;
    record: Record<string, any>;
    revisionId: number;
    operationId: string;
}

const pending = new Set<string>();
const requestKeys = new Map<string, string>();

// Store only the request UUID, never actor credentials or archived business data.
// Keeping it after success also resolves a lost response after a browser refresh.
function recoveryKey(identity: string): string {
    let key = requestKeys.get(identity);
    if (!key) {
        try { key = localStorage.getItem(identity) || undefined; } catch { /* Private browsing may deny storage. */ }
        key ||= crypto.randomUUID();
        requestKeys.set(identity, key);
        try { localStorage.setItem(identity, key); } catch { /* In-memory retries remain available. */ }
    }
    return key;
}

export async function recoverDcfArchive(trashId: number, actor: Pick<User, 'id' | 'password'>): Promise<DcfArchiveRecoveryResult> {
    if (!supabase || !actor?.id) throw new Error('The current database session is unavailable.');
    if (!Number.isSafeInteger(trashId) || trashId <= 0) throw new Error('The archive identity is invalid.');
    const identity = `4kis:dcf-archive-recovery:${actor.id}:${trashId}`;
    if (pending.has(identity)) throw new Error('Recovery of this archive is already pending.');
    pending.add(identity);
    try {
        const { data, error } = await supabase.rpc('recover_dcf_archive', {
            p_trash_id: trashId, p_request_key: recoveryKey(identity),
            p_actor_id: actor.id, p_actor_password: actor.password || '',
        });
        if (error) throw new Error(error.message);
        if (!data?.record || !data?.revisionId || !data?.operationId || !data?.entityType || !data?.parentId) {
            throw new Error('Recovery was not confirmed. Retry this archive to resolve the existing request.');
        }
        return data as DcfArchiveRecoveryResult;
    } finally {
        pending.delete(identity);
    }
}
