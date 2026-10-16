import type { Subproject, SubprojectDetail, User } from '../constants';
import { supabase } from '../supabaseClient';

export type SubprojectActualStage = 'obligation' | 'disbursement';
export interface SubprojectActualEntry { id: string | number; date: string; amount: number; remarks?: string; }
export interface SubprojectActualStageSnapshot { source: 'central' | 'legacy'; entries: SubprojectActualEntry[]; }
export interface SubprojectConfirmedFinancial { itemId: string; stage: SubprojectActualStage; rows: Array<{ id: number | string; entity_type: string; parent_id: number; item_id: string; [key: string]: unknown }>; }
export interface SubprojectAccomplishmentSnapshot {
    subproject: Subproject;
    stages: Record<string, Record<SubprojectActualStage, SubprojectActualStageSnapshot>>;
    confirmedFinancial?: SubprojectConfirmedFinancial[];
}
export interface SubprojectAccomplishmentRequest { key?: string; fingerprint?: string; reason?: string; }
export type SubprojectActualRemovals = Record<string, string[]>;
const fields = ['actualMaleBeneficiaries', 'actualFemaleBeneficiaries', 'actualFourPsBeneficiaries', 'actualPWD', 'actualMuslim', 'actualLGBTQ', 'actualSoloParent', 'actualSenior', 'actualYouth', 'accomplishmentRemarks', 'catchUpPlanRemarks'] as const;
const physicalItemFields = ['actualDeliveryDate', 'actualNumberOfUnits', 'isCompleted'] as const;
const adjustmentFields = ['type', 'particulars', 'deliveryDate', 'unitOfMeasure', 'pricePerUnit', 'numberOfUnits', 'objectType', 'expenseParticular', 'uacsCode', 'obligationMonth', 'disbursementMonth', 'adjustmentType', 'adjustmentFundingSource', 'replacementOfItemId', 'sourceItemId', 'adjustmentReason', 'itemRemarks', 'isCancelled', 'isRealignment', 'isSavings'] as const;
const replacementFields = ['isSuperseded', 'replacedByItemIds', 'replacementReason'] as const;
const additionFields = ['id', 'budgetItemGroupId', ...adjustmentFields.filter(field => field !== 'isCancelled'), 'isAdjustmentItem', 'replacementReason', 'originalPlannedAmount', 'originalPricePerUnit', 'originalNumberOfUnits', 'originalCapturedAt'] as const;
const keyFor = (itemId: string | number, stage: SubprojectActualStage) => `${itemId}:${stage}`;
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)])) : value ?? null;
export const sameSubprojectActualValue = (a: unknown, b: unknown) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
export function reconcileSubprojectFinancialRows<T extends { entity_type?: string; parent_id?: number; item_id?: number | string }>(rows: T[], parentId: number, confirmations: SubprojectConfirmedFinancial[], stage: SubprojectActualStage): T[] {
    const changes = confirmations.filter(row => row.stage === stage);
    const ids = new Set(changes.map(row => row.itemId));
    return [...rows.filter(row => row.entity_type !== 'subproject_detail' || Number(row.parent_id) !== Number(parentId) || !ids.has(String(row.item_id))), ...changes.flatMap(row => row.rows) as unknown as T[]];
}
export function getSubprojectPhysicalChanges(base: Subproject, draft: Subproject, surface: 'subproject' | 'physical' = 'subproject') {
    const changes: Record<string, unknown> = {}, parent: Record<string, unknown> = {}, items: Record<string, Record<string, unknown>> = {};
    for (const field of fields) {
        const normalize = (value: unknown) => ['accomplishmentRemarks', 'catchUpPlanRemarks'].includes(field) ? value || null : Number(value || 0);
        if (!sameSubprojectActualValue(normalize(base[field]), normalize(draft[field]))) parent[field] = draft[field] ?? null;
    }
    if (Object.keys(parent).length) changes.parent = parent;
    const originals = new Map((base.details || []).map(row => [String(row.id), row]));
    const ids = new Set(draft.details.map(row => String(row.id)));
    if ((base.details || []).some(row => !ids.has(String(row.id)))) throw new Error('An existing item is missing. Use the dedicated budget or adjustment workflow; accomplishments cannot silently remove items.');
    const additions: Record<string, unknown>[] = [];
    for (const row of draft.details) {
        const original = originals.get(String(row.id));
        if (!original) {
            if (surface !== 'subproject' || !row.isAdjustmentItem) throw new Error('Only explicit adjustment items may be added here.');
            additions.push(Object.fromEntries(additionFields.filter(key => row[key] !== undefined).map(key => [key, row[key]])));
        }
        const patch: Record<string, unknown> = {};
        const keys: readonly string[] = [...physicalItemFields, ...(surface === 'subproject' && original ? [...replacementFields, ...(original.isAdjustmentItem ? adjustmentFields : [])] : [])];
        for (const field of keys) {
            const normalize = (value: unknown) => field === 'actualNumberOfUnits' ? Number(value || 0)
                : ['isCompleted', 'isCancelled', 'isSuperseded', 'isRealignment', 'isSavings'].includes(field) ? !!value : value === '' ? null : value ?? null;
            if (!sameSubprojectActualValue(normalize(original?.[field]), normalize(row[field]))) patch[field] = row[field] === '' ? null : row[field] ?? null;
        }
        if (Object.keys(patch).length) items[String(row.id)] = patch;
    }
    if (Object.keys(items).length) changes.items = items;
    if (additions.length) changes.additions = additions;
    const commodities = [];
    for (const [index, row] of (draft.subprojectCommodities || []).entries()) {
        const original = base.subprojectCommodities?.[index];
        if (!original || original.name !== row.name || original.typeName !== row.typeName) throw new Error('Commodity identity changed. Reopen before saving.');
        const values: Record<string, unknown> = {};
        for (const field of ['actualYield', 'marketingPercentage', 'foodSecurityPercentage', 'income']) {
            if (Number(original[field] || 0) !== Number(row[field] || 0)) values[field] = row[field] ?? null;
        }
        if (Object.keys(values).length) commodities.push({ index, values });
    }
    if (commodities.length) changes.commodities = commodities;
    return changes;
}
const normalizeEntry = (entry: SubprojectActualEntry, original?: SubprojectActualEntry) => ({
    date: original?.date?.slice(0, 7) === entry.date?.slice(0, 7) ? original.date : String(entry.date || ''),
    amount: Number(entry.amount), remarks: String(entry.remarks || ''),
});

export function validateSubprojectAccomplishmentSnapshot(value: any): SubprojectAccomplishmentSnapshot {
    const details = value?.subproject?.details ?? [];
    if (!value?.subproject?.id || value.subproject.details === undefined || !Array.isArray(details) || !value.stages) throw new Error('Existing Subproject actuals could not be loaded completely. No changes were saved.');
    if (details.some(row => row?.id == null) || new Set(details.map(row => String(row.id))).size !== details.length) throw new Error('Budget item identities are ambiguous. Reopen before saving.');
    for (const detail of details) {
        for (const stage of ['obligation', 'disbursement']) {
            const data = value.stages[String(detail.id)]?.[stage];
            if (!['central', 'legacy'].includes(data?.source) || !Array.isArray(data?.entries)
                || new Set(data.entries.map(row => String(row.id))).size !== data.entries.length
                || data.entries.some(row => row.id == null || row.id === '' || !Number.isFinite(Number(row.amount)))) {
                throw new Error('Existing financial entries are incomplete or have ambiguous identities. Reopen before saving.');
            }
        }
    }
    if (value.confirmedFinancial !== undefined && (!Array.isArray(value.confirmedFinancial) || value.confirmedFinancial.some(change => !['obligation', 'disbursement'].includes(change.stage)
        || !details.some(row => String(row.id) === change.itemId) || !Array.isArray(change.rows)
        || change.rows.some(row => row.entity_type !== 'subproject_detail' || row.parent_id !== value.subproject.id || String(row.item_id) !== change.itemId)))) {
        throw new Error('The confirmed financial rows do not match this Subproject. Reload before retrying.');
    }
    return value;
}

export function hydrateSubprojectAccomplishment(snapshot: SubprojectAccomplishmentSnapshot): Subproject {
    return { ...snapshot.subproject, details: (snapshot.subproject.details || []).map(detail => {
        const result = { ...detail };
        for (const stage of ['obligation', 'disbursement'] as const) {
            const entries = snapshot.stages[String(detail.id)][stage].entries.map(row => ({ ...row, id: /^\d+$/.test(String(row.id)) && Number.isSafeInteger(Number(row.id)) ? Number(row.id) : row.id, amount: Number(row.amount), remarks: row.remarks || '' }));
            const arrayKey = stage === 'obligation' ? 'obligations' : 'disbursements';
            result[arrayKey] = entries as unknown as SubprojectDetail[typeof arrayKey];
            result[stage === 'obligation' ? 'actualObligationAmount' : 'actualDisbursementAmount'] = entries.reduce((total, row) => total + row.amount, 0);
            result[stage === 'obligation' ? 'actualObligationDate' : 'actualDisbursementDate'] = entries.map(row => row.date || '').sort().at(-1) || null;
        }
        return result;
    }) };
}

export async function readSubprojectAccomplishments(ids: number[], actor: User, surface: 'subproject' | 'financial' | 'physical' = 'subproject') {
    if (!supabase || !actor?.id) throw new Error('A database connection and signed-in user are required.');
    const uniqueIds = [...new Set(ids)];
    const snapshots: SubprojectAccomplishmentSnapshot[] = [];
    for (let offset = 0; offset < uniqueIds.length; offset += 100) {
        const batch = uniqueIds.slice(offset, offset + 100);
        const { data, error } = await supabase.rpc('read_subproject_accomplishments', {
            p_actor_id: actor.id, p_actor_password: actor.password || '', p_subproject_ids: batch, p_surface: surface,
        });
        if (error) throw new Error(error.message || 'Existing financial actuals could not be loaded.');
        if (!Array.isArray(data) || data.length !== batch.length || data.some(row => !batch.includes(row?.subproject?.id)) || new Set(data.map(row => row?.subproject?.id)).size !== batch.length) throw new Error('The server returned incomplete Subproject actuals.');
        snapshots.push(...data.map(validateSubprojectAccomplishmentSnapshot));
    }
    return snapshots;
}

export function buildSubprojectActualEdits(base: SubprojectAccomplishmentSnapshot, draft: Subproject, removals: SubprojectActualRemovals = {}, onlyStage?: SubprojectActualStage, onlyItem?: string) {
    const edits = [];
    for (const detail of draft.details) {
        if (onlyItem && String(detail.id) !== onlyItem) continue;
        for (const stage of ['obligation', 'disbursement'] as const) {
            if (onlyStage && stage !== onlyStage) continue;
            const baseline = base.stages[String(detail.id)]?.[stage] || (!(base.subproject.details || []).some(row => String(row.id) === String(detail.id)) && detail.isAdjustmentItem ? { source: 'legacy', entries: [] } : null);
            if (!baseline) throw new Error('The item is not in the loaded accomplishment baseline.');
            const entries = (stage === 'obligation' ? detail.obligations : detail.disbursements) || [];
            const byId = new Map(entries.map(row => [String(row.id), row]));
            if (byId.size !== entries.length) throw new Error('Financial entry identities must be unique.');
            const originals = new Map(baseline.entries.map(row => [String(row.id), row]));
            const operations = [];
            for (const original of baseline.entries) {
                const edited = byId.get(String(original.id));
                if (!edited) {
                    if (!removals[keyFor(detail.id, stage)]?.includes(String(original.id))) throw new Error('An existing financial entry is missing without an explicit removal. Your draft was not saved.');
                    operations.push({ action: 'delete', id: String(original.id), explicit: true });
                } else if (!sameSubprojectActualValue(normalizeEntry(original), normalizeEntry(edited, original))) {
                    operations.push({ action: 'update', id: String(original.id), value: normalizeEntry(edited, original) });
                }
            }
            for (const entry of entries) if (!originals.has(String(entry.id))) operations.push({ action: 'insert', id: String(entry.id), value: normalizeEntry(entry) });
            if (operations.length) edits.push({ itemId: String(detail.id), stage, operations });
        }
    }
    return edits;
}

export async function saveSubprojectAccomplishment(args: {
    base: SubprojectAccomplishmentSnapshot; draft: Subproject; actor: User; removals?: SubprojectActualRemovals;
    surface?: 'subproject' | 'financial' | 'physical'; onlyStage?: SubprojectActualStage; onlyItem?: string;
    targets?: Array<{ itemId: string; values: Record<string, unknown> }>;
    reason?: string; request: SubprojectAccomplishmentRequest;
}) {
    if (!supabase || !args.actor?.id) throw new Error('The database connection or user session is unavailable. No changes were saved.');
    const edits = args.surface === 'physical' ? [] : buildSubprojectActualEdits(args.base, args.draft, args.removals, args.onlyStage, args.onlyItem);
    const physical = args.surface === 'financial' ? {} : getSubprojectPhysicalChanges(args.base.subproject, args.draft, args.surface || 'subproject');
    const payload = { p_base: args.base, p_edits: edits, p_physical: physical, p_targets: args.targets || [], p_surface: args.surface || 'subproject' };
    const fingerprint = JSON.stringify(canonical(payload));
    if (args.request.fingerprint !== fingerprint) { args.request.fingerprint = fingerprint; args.request.key = crypto.randomUUID(); args.request.reason = args.reason || ''; }
    const { data, error } = await supabase.rpc('save_subproject_accomplishment', {
        ...payload, p_reason: args.request.reason || '', p_actor_id: args.actor.id, p_actor_password: args.actor.password || '', p_subproject_id: args.base.subproject.id, p_request_key: args.request.key,
    });
    if (error) throw new Error(error.message || 'The accomplishment could not be saved. Your draft has been kept.');
    const confirmed = validateSubprojectAccomplishmentSnapshot(data);
    if (confirmed.subproject.id !== args.base.subproject.id) throw new Error('The server returned a different Subproject. Reload before retrying.');
    return confirmed;
}
