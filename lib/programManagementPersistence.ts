import { useEffect, useRef, useState } from 'react';
import type { User } from '../constants';
import { supabase } from '../supabaseClient';
import { summarizeDisbursements } from './disbursementUtils';
import { deleteDcfRecord, DcfMutationError, type DcfMutationRequest } from './dcfMutation';

export type ProgramManagementEntity = 'office_requirements' | 'staffing_requirements' | 'other_program_expenses' | 'activities';
export type ActualStage = 'obligation' | 'disbursement';
export interface ActualEntry { id: string | number; date: string; amount: number; remarks?: string; }
export interface ProgramManagementState {
    record: any;
    financial: { obligations: any[]; disbursements: any[]; stages: Record<string, Record<ActualStage, { source: string; entries: ActualEntry[] }>> };
    revisionId?: string | number | null;
    hash?: string;
}
export interface ProgramManagementRequest { key?: string; fingerprint?: string; reason?: string; correlationId?: string; }
const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)])) : value ?? null;
export const sameProgramManagementValue = (a: unknown, b: unknown) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const entryValue = (entry: ActualEntry, original?: ActualEntry) => ({
    date: original?.date?.slice(0, 7) === entry.date?.slice(0, 7) ? original.date : String(entry.date || ''),
    amount: Number(entry.amount), remarks: String(entry.remarks || ''),
});
const ignoredFields = new Set(['id', 'uid', 'created_at', 'updated_at', 'revisionId', 'revision', 'history', 'obligations', 'disbursements', 'physical_accomplishment_submitted_at']);
const financialField = (key: string) => key === 'actualAmount' || key === 'obligations' || key === 'disbursements' || /^actual(Obligation|Disbursement)/.test(key);
function normalizeProgramManagementDates(changes: Record<string, any>) {
    for (const key of ['obligationDate', 'disbursementDate', 'physicalDeliveryDate', 'actualDate', 'actualObligationDate', 'actualDisbursementDate']) {
        if (changes[key] === '') changes[key] = null;
    }
    return changes;
}

export function getProgramManagementStage(base: ProgramManagementState, itemId: string | null, stage: ActualStage) {
    const stages = base.financial?.stages;
    const value = stages?.[itemId ?? 'null']?.[stage] ?? (itemId === null ? stages?.['']?.[stage] ?? stages?.['$parent']?.[stage] : undefined);
    if (!value || !Array.isArray(value.entries) || !['central', 'legacy', 'empty', 'managed'].includes(value.source)) throw new Error('The financial baseline is unavailable. Reopen before saving.');
    if (value.entries.some(row => row.id == null || row.id === '' || !Number.isFinite(Number(row.amount))) || new Set(value.entries.map(row => String(row.id))).size !== value.entries.length) throw new Error('Financial identities are incomplete or ambiguous. No changes were saved.');
    return value;
}

export function validateProgramManagementState(value: any, parentId?: number): ProgramManagementState {
    if (!value?.record?.id || (parentId != null && Number(value.record.id) !== Number(parentId)) || !Array.isArray(value.financial?.obligations) || !Array.isArray(value.financial?.disbursements) || !value.financial?.stages) throw new Error('The server returned incomplete DCF state. Your draft has been kept.');
    return value;
}

export function hydrateProgramManagementState(base: ProgramManagementState, entityType: ProgramManagementEntity): any {
    const hydrate = (record: any, itemId: string | null) => {
        const result = { ...record };
        for (const stage of ['obligation', 'disbursement'] as const) {
            const entries = getProgramManagementStage(base, itemId, stage).entries.map(row => ({ ...row, amount: Number(row.amount) }));
            result[stage === 'obligation' ? 'obligations' : 'disbursements'] = entries;
            result[stage === 'obligation' ? 'actualObligationAmount' : 'actualDisbursementAmount'] = entries.reduce((total, row) => total + row.amount, 0);
            result[stage === 'obligation' ? 'actualObligationDate' : 'actualDisbursementDate'] = entries.map(row => row.date || '').sort().at(-1) || null;
            if (stage === 'disbursement') Object.assign(result, summarizeDisbursements(entries as any, record.fundYear || base.record.fundYear).monthlyFields);
        }
        return result;
    };
    if (entityType === 'activities') return { ...base.record };
    if (entityType === 'staffing_requirements' && base.record.expenses?.length) return { ...base.record, expenses: base.record.expenses.map(row => hydrate(row, String(row.id))) };
    return hydrate(base.record, null);
}

export async function readProgramManagementState(args: { entityType: ProgramManagementEntity; parentId: number; currentUser: User }) {
    if (!supabase || !args.currentUser?.id) throw new Error('A database connection and signed-in user are required.');
    const { data, error } = await supabase.rpc('read_dcf_state', {
        p_actor_id: args.currentUser.id, p_actor_password: args.currentUser.password || '', p_entity_type: args.entityType, p_parent_id: args.parentId,
    });
    if (error) throw new Error(error.message || 'Existing DCF state could not be loaded.');
    return validateProgramManagementState(data, args.parentId);
}

export function buildProgramManagementFinancialEdit(base: ProgramManagementState, itemId: string | null, stage: ActualStage, entries: ActualEntry[], removedIds?: string[]) {
    const original = getProgramManagementStage(base, itemId, stage).entries;
    const byId = new Map(entries.map(row => [String(row.id), row]));
    if (byId.size !== entries.length || entries.some(row => row.id == null || !Number.isFinite(Number(row.amount)))) throw new Error('Financial entries need unique identities and valid amounts.');
    const originals = new Map(original.map(row => [String(row.id), row]));
    const operations: any[] = [];
    for (const row of original) {
        const edited = byId.get(String(row.id));
        if (!edited) {
            if (removedIds && !removedIds.includes(String(row.id))) throw new Error('An existing financial entry is missing without explicit removal.');
            operations.push({ action: 'delete', id: row.id, expected: entryValue(row) });
        } else if (!sameProgramManagementValue(entryValue(row), entryValue(edited, row))) operations.push({ action: 'update', id: row.id, expected: entryValue(row), value: entryValue(edited, row) });
    }
    for (const row of entries) if (!originals.has(String(row.id))) operations.push({ action: 'insert', id: row.id, value: entryValue(row) });
    return { itemId, stage, operations };
}

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function applyProgramManagementMonthlyChanges(original: ActualEntry[], before: any, proposed: any, year: number): ActualEntry[] {
    let result = original.map(row => ({ ...row }));
    monthNames.forEach((name, index) => {
        const field = `actualDisbursement${name}`;
        const oldAmount = Number(before[field] || 0), newAmount = Number(proposed[field] || 0);
        if (oldAmount === newAmount) return;
        if (!Number.isFinite(newAmount) || newAmount < 0) throw new Error('The monthly disbursement must be a valid non-negative amount.');
        const month = `${year}-${String(index + 1).padStart(2, '0')}`;
        const rows = result.filter(row => row.date?.slice(0, 7) === month);
        if (newAmount === 0) { result = result.filter(row => row.date?.slice(0, 7) !== month); return; }
        const delta = newAmount - rows.reduce((sum, row) => sum + Number(row.amount), 0);
        if (!delta) return;
        const last = rows.at(-1);
        if (last && Number(last.amount) + delta > 0) last.amount = Number(last.amount) + delta;
        else if (delta > 0) result.push({ id: `draft:${month}`, date: `${month}-01`, amount: delta, remarks: '' });
        else throw new Error('This monthly correction spans multiple posted entries. Correct the entries in Financial Accomplishment.');
    });
    return result;
}

function businessDiff(original: any, proposed: any, includeFinancial: boolean) {
    const changes: Record<string, any> = {};
    for (const [key, value] of Object.entries(proposed)) {
        if (ignoredFields.has(key) || (!includeFinancial && financialField(key))) continue;
        if (sameProgramManagementValue(original[key], value)) continue;
        // Numeric input normalization is not an intentional business change.
        if (typeof value === 'number' && original[key] != null && original[key] !== '' && Number(original[key]) === value) continue;
        changes[key] = value;
    }
    return changes;
}

export function buildProgramManagementChange(args: { entityType: ProgramManagementEntity; base: ProgramManagementState; original?: any; proposed: any; financial?: boolean; fields?: string[]; onlyItem?: string | null; onlyStage?: ActualStage; removedIds?: string[] }) {
    const before = args.original || hydrateProgramManagementState(args.base, args.entityType);
    const changes = businessDiff(before, args.proposed, !!args.financial);
    if (args.fields) {
        for (const key of Object.keys(changes)) if (!args.fields.includes(key)) delete changes[key];
        for (const key of args.fields) if (!ignoredFields.has(key) && !sameProgramManagementValue(before[key], args.proposed[key])) changes[key] = args.proposed[key];
    }
    if (args.financial) for (const key of Object.keys(changes)) if (financialField(key)) delete changes[key];
    const financial: any[] = [];
    const nested = args.entityType === 'staffing_requirements' && (before.expenses?.length || args.proposed.expenses?.length);
    if (nested && changes.expenses) {
        changes.expenses = args.proposed.expenses.map(row => {
            const previous = before.expenses?.find(old => String(old.id) === String(row.id));
            if (!previous) return row;
            const persisted = args.base.record.expenses?.find(old => String(old.id) === String(row.id));
            return { ...persisted, ...businessDiff(previous, row, false) };
        });
        if (sameProgramManagementValue(args.base.record.expenses, changes.expenses)) delete changes.expenses;
    }
    if (args.financial) {
        const rows = nested ? args.proposed.expenses : [args.proposed];
        for (const row of rows || []) {
            const itemId = nested ? String(row.id) : null;
            if (args.onlyItem !== undefined && args.onlyItem !== itemId) continue;
            const previous = nested ? before.expenses?.find(old => String(old.id) === itemId) : before;
            if (!previous) continue;
            for (const stage of ['obligation', 'disbursement'] as const) {
                if (args.onlyStage && args.onlyStage !== stage) continue;
                const arrayKey = stage === 'obligation' ? 'obligations' : 'disbursements';
                const baseline = getProgramManagementStage(args.base, itemId, stage).entries;
                let entries = row[arrayKey];
                if (stage === 'disbursement' && sameProgramManagementValue(previous[arrayKey], entries)) entries = applyProgramManagementMonthlyChanges(baseline, previous, row, Number(args.proposed.fundYear));
                if (!entries) continue;
                const edit = buildProgramManagementFinancialEdit(args.base, itemId, stage, entries, args.removedIds);
                if (edit.operations.length) financial.push(edit);
            }
        }
    }
    return { changes: normalizeProgramManagementDates(changes), financial };
}

export async function saveProgramManagementChange(args: Parameters<typeof buildProgramManagementChange>[0] & { currentUser: User; source: string; reason?: string; request: ProgramManagementRequest }) {
    if (!supabase || !args.currentUser?.id || !args.base?.record?.id) throw new Error('The loaded baseline or signed-in session is unavailable. Your draft was not saved.');
    const edit = buildProgramManagementChange(args);
    if (!Object.keys(edit.changes).length && !edit.financial.length) return args.base;
    const payload = { p_entity_type: args.entityType, p_parent_id: args.base.record.id, p_base: args.base, p_changes: edit.changes, p_financial: edit.financial, p_source: args.source };
    const fingerprint = JSON.stringify(canonical({ ...payload, actorId: args.currentUser.id, reason: args.reason || '' }));
    if (args.request.fingerprint !== fingerprint) { args.request.fingerprint = fingerprint; args.request.key = crypto.randomUUID(); args.request.reason = args.reason || ''; }
    const { data, error } = await supabase.rpc('commit_dcf_change', { ...payload, p_actor_id: args.currentUser.id, p_actor_password: args.currentUser.password || '', p_request_key: args.request.key, p_reason: args.request.reason || '' });
    if (error) throw new Error(error.message || 'The DCF change could not be saved. Your draft has been kept.');
    return validateProgramManagementState(data, args.base.record.id);
}

export async function createProgramManagementRecord(args: { entityType: ProgramManagementEntity; proposed: any; currentUser: User; source: string; request: ProgramManagementRequest; originParentId?: number }) {
    if (!supabase || !args.currentUser?.id) throw new Error('A database connection and signed-in user are required.');
    const changes = normalizeProgramManagementDates(Object.fromEntries(Object.entries(args.proposed).filter(([key, value]) => (key === 'uid' || !ignoredFields.has(key)) && value !== undefined)));
    // Clones start independent histories and cannot carry source actual entries.
    if (args.source.includes('clone')) {
        for (const key of Object.keys(changes)) if (/^actual|history|revision|approval|submitted/i.test(key)) delete changes[key];
        if (Array.isArray(changes.expenses)) changes.expenses = changes.expenses.map((row: any, index: number) => Object.fromEntries(Object.entries({ ...row, id: index + 1 }).filter(([key]) => !/^actual|history|revision|approval|submitted|obligations$|disbursements$/i.test(key))));
    }
    const payload = { p_entity_type: args.entityType, p_parent_id: null, p_base: args.originParentId ? { cloneSourceId: args.originParentId } : {}, p_changes: changes, p_financial: [], p_source: args.source,
        ...(args.request.correlationId ? { p_correlation_id: args.request.correlationId } : {}) };
    const fingerprint = JSON.stringify(canonical({ ...payload, actorId: args.currentUser.id }));
    if (args.request.fingerprint !== fingerprint) { args.request.fingerprint = fingerprint; args.request.key = crypto.randomUUID(); }
    const { data, error } = await supabase.rpc('commit_dcf_change', { ...payload, p_actor_id: args.currentUser.id, p_actor_password: args.currentUser.password || '', p_request_key: args.request.key, p_reason: '' });
    if (error) throw new DcfMutationError(error);
    return validateProgramManagementState(data);
}

export function useProgramManagementWriter(entityType: ProgramManagementEntity, currentUser: User, onConfirmed: (record: any) => void) {
    const requests = useRef(new Map<string, ProgramManagementRequest>());
    const inFlight = useRef(false);
    const batchIds = useRef(new Map<string, string>());
    const createAttempts = useRef(new Map<string, { proposed: any; request: ProgramManagementRequest; originParentId?: number; actorId: number; intent: string; confirmedId?: number }>());
    const batchId = (key: string) => {
        if (!batchIds.current.has(key)) batchIds.current.set(key, crypto.randomUUID());
        return batchIds.current.get(key)!;
    };
    const createMany = async (records: any[], source: string, originParentIds?: number[]) => {
        if (!currentUser?.id) throw new Error('A signed-in user is required before creating records.');
        if (inFlight.current) throw new Error('A save is already in progress.');
        inFlight.current = true;
        const saved: any[] = [];
        const sourceOccurrences = new Map<number, number>();
        try {
            for (let index = 0; index < records.length; index++) {
                const originParentId = originParentIds?.[index];
                const occurrence = originParentId ? sourceOccurrences.get(originParentId) || 0 : index;
                if (originParentId) sourceOccurrences.set(originParentId, occurrence + 1);
                const key = `${source}:${originParentId ?? 'new'}:${occurrence}`;
                const intent = JSON.stringify(canonical(originParentId ? { originParentId } : Object.fromEntries(Object.entries(records[index])
                    .filter(([field]) => !['id', 'uid', 'created_at', 'updated_at', 'history'].includes(field)))));
                let attempt = createAttempts.current.get(key);
                if (attempt && (attempt.actorId !== currentUser?.id || attempt.intent !== intent)) {
                    throw new Error('An earlier creation still needs confirmation. Keep your draft and resolve that original save before submitting different content.');
                }
                if (!attempt) {
                    attempt = { proposed: structuredClone(records[index]), request: { correlationId: batchId(source) }, originParentId, actorId: currentUser?.id, intent };
                    createAttempts.current.set(key, attempt);
                }
                let state: ProgramManagementState;
                try {
                    state = attempt.confirmedId ? await readProgramManagementState({ entityType, parentId: attempt.confirmedId, currentUser })
                        : await createProgramManagementRecord({ entityType, proposed: attempt.proposed, currentUser, source, request: attempt.request, originParentId: attempt.originParentId });
                    attempt.confirmedId = Number(state.record.id);
                } catch (error) {
                    if (/^(?:22|23|42|P0)[0-9A-Z]{3}$/.test((error as { code?: string }).code || '')) createAttempts.current.delete(key);
                    throw error;
                }
                saved.push(state.record);
                onConfirmed(state.record);
            }
            for (const key of createAttempts.current.keys()) if (key.startsWith(`${source}:`)) createAttempts.current.delete(key);
            batchIds.current.delete(source);
            return saved;
        } finally { inFlight.current = false; }
    };
    const update = async (parentId: number, changes: any, source: string, reason = '') => {
        if (inFlight.current) throw new Error('A save is already in progress.');
        inFlight.current = true;
        try {
        const base = await readProgramManagementState({ entityType, parentId, currentUser });
        const key = `${source}:${parentId}`;
        const request = requests.current.get(key) || {};
        requests.current.set(key, request);
        const state = await saveProgramManagementChange({ entityType, base, original: base.record, proposed: { ...base.record, ...changes }, fields: Object.keys(changes), currentUser, source, reason, request });
        onConfirmed(state.record);
        return state.record;
        } finally { inFlight.current = false; }
    };
    const remove = async (records: any[], source: string, reason: string, onRemoved: (record: any) => void) => {
        if (inFlight.current) throw new Error('A save is already in progress.');
        inFlight.current = true;
        try {
            for (const record of records) {
                const key = `delete:${record.id}`;
                const request = (requests.current.get(key) || { correlationId: batchId(source) }) as DcfMutationRequest;
                requests.current.set(key, request);
                await deleteDcfRecord({ entityType, parentId: record.id, base: record, actor: currentUser, request, source, reason });
                onRemoved(record);
                requests.current.delete(key);
            }
            batchIds.current.delete(source);
        } finally { inFlight.current = false; }
    };
    return { createMany, update, remove };
}

// Only refresh an idle editor. An open draft owns its baseline until confirmed or discarded.
export function useProgramManagementBaseline(entityType: ProgramManagementEntity, item: any, currentUser: User, idle: boolean) {
    const [state, setState] = useState<ProgramManagementState | null>(null);
    const [error, setError] = useState('');
    const request = useRef<ProgramManagementRequest>({});
    useEffect(() => { setState(null); request.current = {}; }, [entityType, item.id, currentUser?.id]);
    useEffect(() => {
        if (!idle) return;
        let cancelled = false;
        readProgramManagementState({ entityType, parentId: item.id, currentUser }).then(value => { if (!cancelled) { setState(value); setError(''); } }).catch(reason => { if (!cancelled) { setState(null); setError(reason.message); } });
        return () => { cancelled = true; };
    }, [entityType, item.id, item.updated_at, currentUser?.id, currentUser?.password, idle]);
    return { state, setState, error, request };
}
