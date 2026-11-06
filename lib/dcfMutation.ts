import { supabase } from '../supabaseClient';
import type { User } from '../constants';

export type DcfEntityType = 'activities' | 'subprojects' | 'office_requirements' | 'staffing_requirements' | 'other_program_expenses';
export interface DcfMutationRequest { key?: string; signature?: string; correlationId?: string; }
export interface DcfMutationResult<T = Record<string, any>> {
    record: T;
    financial: { obligations: any[]; disbursements: any[]; stages?: Record<string, any> };
    revisionId: number | null;
    hash?: string;
}
export interface DcfFinancialOperation {
    stage: 'obligation' | 'disbursement';
    itemId: string | number | null;
    operations: Array<{ action: 'insert' | 'update' | 'delete'; id?: string | number; expected?: { date: string; amount: number; remarks?: string }; value?: { date: string; amount: number; remarks?: string } }>;
}
export interface DcfMutationOptions {
    entityType: DcfEntityType;
    parentId?: number | null;
    base?: Record<string, any>;
    changes?: Record<string, any>;
    financial?: DcfFinancialOperation[];
    actor: Pick<User, 'id' | 'password'>;
    request?: DcfMutationRequest;
    source?: string;
    reason?: string;
}

const ignored = new Set(['id', 'created_at', 'updated_at', 'history']);
export class DcfMutationError extends Error {
    readonly code?: string;
    constructor(error: { message: string; code?: string }) {
        super(error.message);
        this.name = 'DcfMutationError';
        this.code = error.code;
    }
}
export function dcfChangedFields(base: Record<string, any>, draft: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = {};
    for (const key of Object.keys(draft)) {
        if (!ignored.has(key) && draft[key] !== undefined && JSON.stringify(base[key]) !== JSON.stringify(draft[key])) result[key] = draft[key];
    }
    return result;
}

function mutationKey(request: DcfMutationRequest, payload: Record<string, any>): string {
    const signature = JSON.stringify(payload);
    if (request.signature !== signature || !request.key) {
        request.key = crypto.randomUUID();
        request.signature = signature;
    }
    return request.key;
}

export async function readDcfState<T = Record<string, any>>(entityType: DcfEntityType, parentId: number, actor: Pick<User, 'id' | 'password'>): Promise<DcfMutationResult<T>> {
    if (!supabase || !actor?.id) throw new Error('The current database session is unavailable. Your draft has not been saved.');
    const { data, error } = await supabase.rpc('read_dcf_state', { p_actor_id: actor.id, p_actor_password: actor.password || '', p_entity_type: entityType, p_parent_id: parentId });
    if (error) throw new DcfMutationError(error);
    if (!data?.record || !data?.financial) throw new Error('The current record and actual entries could not be loaded.');
    return data as DcfMutationResult<T>;
}

export async function persistDcfMutation<T = Record<string, any>>(options: DcfMutationOptions): Promise<DcfMutationResult<T>> {
    if (!supabase || !options.actor?.id) throw new Error('The current database session is unavailable. Your draft has not been saved.');
    const request = options.request || {};
    const payload = {
        p_entity_type: options.entityType, p_parent_id: options.parentId ?? null,
        p_base: options.base || {}, p_changes: options.changes || {}, p_financial: options.financial || [],
        p_source: options.source || 'dcf', p_reason: options.reason || '',
        ...(request.correlationId ? { p_correlation_id: request.correlationId } : {}),
    };
    const { data, error } = await supabase.rpc('commit_dcf_change', {
        ...payload, p_actor_id: options.actor.id, p_actor_password: options.actor.password || '',
        p_request_key: mutationKey(request, { ...payload, actorId: options.actor.id }),
    });
    if (error) throw new DcfMutationError(error);
    if (!data?.record || !data?.financial) throw new Error('No confirmed saved record was returned. Reopen the current record before retrying.');
    return data as DcfMutationResult<T>;
}

export async function deleteDcfRecord(options: Omit<DcfMutationOptions, 'changes' | 'financial'>): Promise<void> {
    if (!supabase || !options.actor?.id) throw new Error('The current database session is unavailable.');
    const payload = { p_entity_type: options.entityType, p_parent_id: options.parentId, p_base: options.base || {}, p_reason: options.reason || '' };
    const request = options.request || {};
    if (request.correlationId) Object.assign(payload, { p_correlation_id: request.correlationId });
    const { error } = await supabase.rpc('delete_dcf_record', {
        ...payload, p_actor_id: options.actor.id, p_actor_password: options.actor.password || '',
        p_request_key: mutationKey(request, { ...payload, actorId: options.actor.id }),
    });
    if (error) throw new DcfMutationError(error);
}
