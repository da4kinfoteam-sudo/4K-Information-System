import type { HistoryEntry, User } from '../constants';

export const DCF_REVISION_ENTITY_TYPES = ['subprojects', 'activities', 'office_requirements', 'staffing_requirements', 'other_program_expenses'] as const;
export type DcfRevisionEntityType = typeof DCF_REVISION_ENTITY_TYPES[number];
export type RevisionId = string | number;
export type SnapshotRecord = Record<string, unknown>;
export interface DcfRevisionMetadata {
    revisionId: RevisionId; version?: RevisionId; changedAt: string; summary: string; actorName: string;
    operation: string; snapshotAvailable: boolean; legacyKey?: string; legacyKeys?: string[];
    restoreOperationId?: string; undoAvailable?: boolean; reason?: string;
}
export interface DcfRevisionPage { revisions: DcfRevisionMetadata[]; hasMore: boolean; nextBeforeRevision: RevisionId | null; totalCount?: number; legacyTotalCount?: number; canRestore?: boolean; }
export interface DcfRevisionSnapshot {
    schemaVersion: 1; entityType: DcfRevisionEntityType; parentId: RevisionId;
    record: SnapshotRecord; financial: { obligations: SnapshotRecord[]; disbursements: SnapshotRecord[]; stages: SnapshotRecord };
    related: SnapshotRecord; physical: SnapshotRecord;
}
export interface DcfRestoreChange { section: string; field: string; before: unknown; after: unknown; }
export interface DcfRestorePreview {
    revisionId: RevisionId; currentRevisionId: RevisionId; currentHash: string; canRestore: boolean;
    blockers: string[]; changes: DcfRestoreChange[]; excludedFields: string[]; changesActuals: boolean;
}
export interface DcfRestoreConfirmation {
    confirmed: true; revisionId: RevisionId; operationId: string; record: SnapshotRecord;
    financial?: DcfRevisionSnapshot['financial']; [key: string]: unknown;
}
export interface DcfRevisionPermissions { canView?: boolean; canRestore?: boolean; authorizationKey?: string; }
export type DcfRevisionActor = Pick<User, 'id' | 'role' | 'password' | 'operatingUnit' | 'visibility_scope' | 'permissions_override'>;
export type DcfRevisionRpc = (name: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
export interface DcfRestoreRequest { key?: string; fingerprint?: string; }

const object = (value: unknown): value is SnapshotRecord => !!value && typeof value === 'object' && !Array.isArray(value);
export const revisionRows = (value: unknown): SnapshotRecord[] => Array.isArray(value) ? value.filter(object) : [];
const validId = (value: unknown): value is RevisionId => typeof value === 'string' ? /^[1-9]\d*$/.test(value) : typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const sameId = (a: unknown, b: unknown) => String(a) === String(b);
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : object(value)
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value ?? null;

// This fingerprint stays in memory only; never persist/log it or use it as server authorization.
export const dcfRevisionAuthorizationKey = (actor: DcfRevisionActor | null, permissions?: DcfRevisionPermissions) => JSON.stringify(canonical([actor, permissions]));
export const canRestoreDcfHistory = (actor: DcfRevisionActor | null, permissions?: DcfRevisionPermissions) => !!actor && actor.role !== 'Guest'
    && permissions?.canView !== false && (permissions?.canRestore ?? actor.role === 'Super Admin');

export function formatDcfRevisionTime(value: string, verified = true) {
    if (!verified) return value ? `${value} (legacy date)` : 'Unknown legacy date';
    if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(value) || !Number.isFinite(Date.parse(value))) return 'Unknown revision time';
    return new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).format(new Date(value));
}

export function validateDcfSnapshot(value: unknown, entityType: DcfRevisionEntityType, parentId: RevisionId): DcfRevisionSnapshot {
    if (!object(value) || value.schemaVersion !== 1) throw new Error('This version uses an unsupported snapshot schema.');
    if (value.entityType !== entityType || !sameId(value.parentId, parentId)) throw new Error('The saved version belongs to a different record.');
    const financial = value.financial;
    if (!object(value.record) || !object(value.related) || !object(value.physical) || !object(financial)
        || !Array.isArray(financial.obligations) || !financial.obligations.every(object)
        || !Array.isArray(financial.disbursements) || !financial.disbursements.every(object) || !object(financial.stages)) {
        throw new Error('This historical version is incomplete. No current values have been substituted.');
    }
    for (const item of Object.values(financial.stages)) {
        if (!object(item) || ['obligation', 'disbursement'].some(stage => !object(item[stage]) || typeof item[stage].source !== 'string' || !Array.isArray(item[stage].entries) || !item[stage].entries.every(object))) {
            throw new Error('This historical version has incomplete financial stage provenance.');
        }
    }
    return value as unknown as DcfRevisionSnapshot;
}

export function validateDcfRevisionPage(value: unknown, limit: number): DcfRevisionPage {
    if (object(value) && Array.isArray(value.rows)) {
        const rows = value.rows.map(row => object(row) ? { revisionId: row.id, version: row.version, changedAt: row.recorded_at, summary: row.summary,
            actorName: row.actor_name, operation: row.kind || row.source, snapshotAvailable: row.snapshot_available !== false,
            restoreOperationId: row.restore_operation_id, undoAvailable: row.can_undo === true, legacyKey: row.legacy_key,
            legacyKeys: Array.isArray(row.legacy_keys) ? row.legacy_keys.filter(key => Array.isArray(key) && key.length === 3 && key.every(part => typeof part === 'string')).map(key => JSON.stringify(key)) : [],
            reason: typeof row.reason === 'string' ? row.reason : undefined } : row);
        value = { revisions: rows, totalCount: value.total, legacyTotalCount: value.legacyTotal, nextBeforeRevision: value.nextCursor ?? null, hasMore: value.nextCursor != null, canRestore: value.canRestore };
    }
    if (!object(value) || !Array.isArray(value.revisions) || value.revisions.length > limit || typeof value.hasMore !== 'boolean') throw new Error('The history metadata response is incomplete.');
    const rows = value.revisions;
    if (rows.some(row => !object(row) || !validId(row.revisionId) || typeof row.changedAt !== 'string' || typeof row.summary !== 'string'
        || typeof row.snapshotAvailable !== 'boolean' || typeof row.operation !== 'string')
        || new Set(rows.map(row => String(row.revisionId))).size !== rows.length) throw new Error('The history metadata response is invalid.');
    if (rows.some((row, i) => i > 0 && BigInt(row.revisionId) >= BigInt(rows[i - 1].revisionId))) throw new Error('The history metadata order is invalid.');
    if (value.hasMore && (!rows.length || !validId(value.nextBeforeRevision) || !sameId(value.nextBeforeRevision, rows.at(-1).revisionId))) throw new Error('The history pagination cursor is invalid.');
    if (value.totalCount != null && (!Number.isSafeInteger(value.totalCount) || Number(value.totalCount) < rows.length)) throw new Error('The history count is invalid.');
    if (value.legacyTotalCount != null && (!Number.isSafeInteger(value.legacyTotalCount) || Number(value.legacyTotalCount) < 0)) throw new Error('The legacy history count is invalid.');
    return { revisions: rows.map(row => ({ ...row, actorName: typeof row.actorName === 'string' && row.actorName.trim() ? row.actorName : 'Unknown actor' })), hasMore: value.hasMore,
        nextBeforeRevision: value.hasMore ? value.nextBeforeRevision as RevisionId : null, ...(value.totalCount != null ? { totalCount: Number(value.totalCount) } : {}), ...(value.legacyTotalCount != null ? { legacyTotalCount: Number(value.legacyTotalCount) } : {}), ...(typeof value.canRestore === 'boolean' ? { canRestore: value.canRestore } : {}) } as DcfRevisionPage;
}

export function validateDcfRestorePreview(value: unknown, revisionId: RevisionId): DcfRestorePreview {
    if (object(value) && 'requiresActualsAcknowledgement' in value) value = { ...value, revisionId,
        changesActuals: value.requiresActualsAcknowledgement, changes: Array.isArray(value.changes) ? value.changes.map(change => object(change) ? { ...change, section: change.section || 'Record' } : change) : value.changes };
    if (!object(value) || !sameId(value.revisionId, revisionId) || !validId(value.currentRevisionId) || typeof value.currentHash !== 'string' || !value.currentHash
        || typeof value.canRestore !== 'boolean' || typeof value.changesActuals !== 'boolean'
        || !Array.isArray(value.blockers) || !value.blockers.every(v => typeof v === 'string')
        || !Array.isArray(value.excludedFields) || !value.excludedFields.every(v => typeof v === 'string')
        || !Array.isArray(value.changes) || value.changes.some(v => !object(v) || typeof v.section !== 'string' || typeof v.field !== 'string' || !('before' in v) || !('after' in v))) {
        throw new Error('The server restore preview is incomplete. Restoration is unavailable.');
    }
    return value as unknown as DcfRestorePreview;
}

export function legacyDcfHistory(history: HistoryEntry[] = [], importedLegacyKeys: Set<string> = new Set()): DcfRevisionMetadata[] {
    return history.flatMap((entry, index) => {
        const key = JSON.stringify([entry.date, entry.event, entry.user]);
        return importedLegacyKeys.has(key) ? [] : [{ revisionId: `legacy-${index}`, changedAt: entry.date || '', summary: entry.event || 'Legacy change',
            actorName: entry.user || 'Unknown legacy actor', operation: 'legacy', snapshotAvailable: false, legacyKey: key }];
    });
}

export function createDcfRevisionClient(actor: DcfRevisionActor, entityType: DcfRevisionEntityType, parentId: RevisionId, rpc?: DcfRevisionRpc) {
    if (!DCF_REVISION_ENTITY_TYPES.includes(entityType) || !validId(parentId) || !validId(actor?.id)) throw new Error('A valid signed-in user and DCF record are required.');
    const identity = { p_actor_id: actor.id, p_actor_password: actor.password || '', p_entity_type: entityType, p_parent_id: parentId };
    const cache = new Map<string, Promise<unknown>>();
    let disposed = false;
    const call = async (name: string, params: Record<string, unknown>) => {
        if (disposed) throw new Error('History authorization changed. Reopen history.');
        const transport = rpc || (async (method, payload) => {
            const { supabase } = await import('../supabaseClient');
            if (!supabase) throw new Error('History is unavailable without a database connection.');
            return supabase.rpc(method, payload);
        }) as DcfRevisionRpc;
        const { data, error } = await transport(name, { ...identity, ...params });
        if (disposed) throw new Error('History authorization changed. Reopen history.');
        if (error) { cache.clear(); throw new Error(error.message || 'History access failed.'); }
        return data;
    };
    const cached = <T>(key: string, work: () => Promise<T>): Promise<T> => {
        if (disposed) return Promise.reject(new Error('History authorization changed. Reopen history.'));
        if (!cache.has(key)) cache.set(key, work().catch(error => { cache.delete(key); throw error; }));
        return cache.get(key) as Promise<T>;
    };
    return {
        dispose() { disposed = true; cache.clear(); },
        clear() { cache.clear(); },
        invalidateLists() { for (const key of cache.keys()) if (key.startsWith('list:')) cache.delete(key); },
        list(limit = 10, before: RevisionId | null = null) {
            if (![10, 20, 50].includes(limit) || (before !== null && !validId(before))) return Promise.reject(new Error('Invalid history page.'));
            return cached(`list:${limit}:${before}`, async () => validateDcfRevisionPage(await call('list_dcf_revisions', { p_limit: limit, p_before_revision: before }), limit));
        },
        read(revisionId: RevisionId) {
            if (!validId(revisionId)) return Promise.reject(new Error('This legacy entry has no saved version.'));
            return cached(`snapshot:${revisionId}`, async () => {
                const value = await call('read_dcf_revision', { p_revision_id: revisionId });
                if (object(value) && 'snapshot' in value) {
                    if (value.id != null && !sameId(value.id, revisionId)) throw new Error('The server returned a different saved revision.');
                    return validateDcfSnapshot(value.snapshot, entityType, parentId);
                }
                return validateDcfSnapshot(value, entityType, parentId);
            });
        },
        async preview(revisionId: RevisionId, undoOperationId: string | null = null) {
            if (!validId(revisionId)) throw new Error('A saved revision is required.');
            return validateDcfRestorePreview(await call('preview_dcf_restore', { p_revision_id: revisionId, p_undo_operation_id: undoOperationId }), revisionId);
        },
        async apply(preview: DcfRestorePreview, reason: string, acknowledgedActuals: boolean, request: DcfRestoreRequest, undoOperationId: string | null = null) {
            if (!preview.canRestore || preview.blockers.length || !reason.trim() || (preview.changesActuals && !acknowledgedActuals)) throw new Error('A valid preview, reason and required actuals acknowledgement are required.');
            const payload = { p_revision_id: preview.revisionId, p_expected_revision_id: preview.currentRevisionId, p_expected_hash: preview.currentHash,
                p_reason: reason.trim(), p_acknowledged_actuals: acknowledgedActuals, p_undo_operation_id: undoOperationId };
            const fingerprint = JSON.stringify(canonical(payload));
            if (!request.key || request.fingerprint !== fingerprint) { request.key = crypto.randomUUID(); request.fingerprint = fingerprint; }
            const data = await call('apply_dcf_restore', { ...payload, p_request_key: request.key });
            const operationId = object(data) ? data.restoreOperationId ?? data.operationId : null;
            if (!object(data) || !validId(data.revisionId) || typeof operationId !== 'string' || !operationId || !object(data.record) || !sameId(data.record.id, parentId)) {
                throw new Error('The restore response was not confirmed. Retry the same request to resolve its outcome.');
            }
            cache.clear();
            return { ...data, confirmed: true, operationId } as DcfRestoreConfirmation;
        },
    };
}

export type RevisionField = readonly [key: string, label: string];
export interface RevisionSection { title: string; fields?: Array<{ label: string; value: string }>; columns?: string[]; rows?: string[][]; }
const f = (keys: string): RevisionField[] => keys.split(' ').filter(Boolean).map(key => [key, fieldLabel(key)]);
export function fieldLabel(key: string) { return key.replace(/_/g, ' ').replace(/([a-z\d])([A-Z])/g, '$1 $2').replace(/^./, char => char.toUpperCase()); }
export function revisionDisplayValue(value: unknown): string {
    if (value === undefined) return 'Not recorded';
    if (value === null || value === '') return 'Not set';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'number') return Number.isFinite(value) ? value.toLocaleString('en-PH', { maximumFractionDigits: 6 }) : 'Invalid number';
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map(revisionDisplayValue).join('; ') || 'None';
    if (object(value)) {
        const safe = f('id uid name label title date month amount remarks source status quantity unitOfMeasure value');
        return safe.filter(([key]) => key in value).map(([key, label]) => `${label}: ${revisionDisplayValue(value[key])}`).join('; ') || 'Recorded structured value';
    }
    return 'Not recorded';
}
const commonFields = f('id uid operatingUnit fundingYear fundYear fundType fundSourceUid fundSource tier status workflow_status encodedBy created_at updated_at remarks isSavings isRealignment approver_id approved_by approved_at rejection_reason submitted_at');
const moduleFields: Record<DcfRevisionEntityType, RevisionField[]> = {
    subprojects: f('name location indigenousPeopleOrganization ipo_id packageType startDate estimatedCompletionDate actualCompletionDate lat lng accomplishmentRemarks catchUpPlanRemarks newTargetCompletionDate'),
    activities: f('name activity_title type component reference_activity_id description location facilitator date endDate participating_ipo_ids participatingIpos participantsMale participantsFemale lat lng catchUpPlanRemarks newTargetDate'),
    office_requirements: f('equipment specs purpose numberOfUnits pricePerUnit physicalDeliveryDate uacsCode obligationDate disbursementDate'),
    staffing_requirements: [...f('personnelPosition position component personnelType salaryGrade annualSalary hiringStatus uacsCode obligationDate disbursementDate physicalDeliveryDate'), ['status', 'Employment status']],
    other_program_expenses: f('particulars amount obligatedAmount uacsCode obligationDate disbursementDate physicalDeliveryDate'),
};
const physicalFields = f('actualDate actualEndDate actualCompletionDate actualAmount actualMaleBeneficiaries actualFemaleBeneficiaries actualFourPsBeneficiaries actualParticipantsMale actualParticipantsFemale actualPWD actualMuslim actualLGBTQ actualSoloParent actualSenior actualYouth accomplishmentRemarks physical_accomplishment_submitted_at');
const lineFields = f('id budgetItemGroupId type particulars expenseParticular objectType uacsCode unitOfMeasure numberOfUnits pricePerUnit amount deliveryDate physicalDeliveryDate isCompleted isCancelled isSuperseded isRealignment isSavings originalPlannedAmount originalPricePerUnit originalNumberOfUnits originalCapturedAt sourceItemId adjustmentReason adjustmentType adjustmentFundingSource isAdjustmentItem replacementOfItemId replacedByItemIds replacementReason itemRemarks fundingOrigin supplementUid supplementStatus supplementalSource supplementRevisionPending');
const lifecycleFields = f('isTransferTargetExcluded budgetItemTransferId transfer_source_parent_id transfer_source_item_id transfer_destination_parent_id transfer_destination_item_id actualsActive ownership activationDate');
const evidenceLineFields = [...lineFields, ...f('obligationMonth disbursementMonth obligationDate targetScheduleVersion targetObligationSchedules targetDisbursementSchedules')];
const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// All sections use recorded snapshot values only. No live lookups or raw row dumps.
export function projectDcfRevision(snapshot: DcfRevisionSnapshot): RevisionSection[] {
    const record = snapshot.record;
    const sections: RevisionSection[] = [];
    const fields = (title: string, source: SnapshotRecord, selected: RevisionField[]) => {
        const values = selected.filter(([key]) => key in source).map(([key, label]) => ({ label, value: typeof source[key] === 'number' && /(^id$|_id$|Id$|Year$|Grade$)/.test(key) ? String(source[key]) : revisionDisplayValue(source[key]) }));
        if (values.length) sections.push({ title, fields: values });
    };
    const table = (title: string, rows: SnapshotRecord[], selected: RevisionField[]) => {
        if (!rows.length) return;
        const visible = selected.filter(([key]) => rows.some(row => key in row));
        if (visible.length) sections.push({ title, columns: visible.map(([, label]) => label), rows: rows.map(row => visible.map(([key]) => revisionDisplayValue(row[key]))) });
    };
    fields('Details', record, [...commonFields.filter(([key]) => snapshot.entityType !== 'staffing_requirements' || key !== 'status'), ...moduleFields[snapshot.entityType]]);
    let lines = snapshot.entityType === 'subprojects' ? revisionRows(record.details) : revisionRows(record.expenses);
    if (!lines.length && ['office_requirements', 'staffing_requirements', 'other_program_expenses'].includes(snapshot.entityType)) lines = [record];
    table('Budget items', lines, lineFields);
    const schedules: SnapshotRecord[] = [];
    const legacyActuals: SnapshotRecord[] = [];
    for (const line of lines) {
        for (const [stage, arrayKey, legacyDate] of [['Obligation', 'targetObligationSchedules', 'obligationMonth'], ['Disbursement', 'targetDisbursementSchedules', 'disbursementMonth']] as const) {
            if (line.targetScheduleVersion === 2) {
                const entries = revisionRows(line[arrayKey]);
                for (const entry of entries) schedules.push({ itemId: line.id, stage, source: 'Version 2', ...entry });
                if (!entries.length) schedules.push({ itemId: line.id, stage, source: 'Version 2 (explicitly empty)' });
            } else if (line[legacyDate] != null || line[stage === 'Obligation' ? 'obligationDate' : 'disbursementDate'] != null) {
                schedules.push({ itemId: line.id, stage, month: line[legacyDate] ?? line[stage === 'Obligation' ? 'obligationDate' : 'disbursementDate'], amount: line.amount ?? (typeof line.pricePerUnit === 'number' && typeof line.numberOfUnits === 'number' ? line.pricePerUnit * line.numberOfUnits : line.annualSalary),
                    source: 'Legacy scalar plan' });
            }
        }
        for (const month of monthNames) {
            if (`disbursement${month}` in line) schedules.push({ itemId: line.id, stage: 'Disbursement', month, amount: line[`disbursement${month}`], source: 'Legacy monthly plan' });
            if (`actualDisbursement${month}` in line) legacyActuals.push({ itemId: line.id, stage: 'Disbursement', date: month, amount: line[`actualDisbursement${month}`], source: 'Legacy monthly evidence (not added to ledger)' });
        }
        for (const stage of ['Obligation', 'Disbursement']) {
            const key = `actual${stage}Amount`;
            if (key in line) legacyActuals.push({ itemId: line.id, stage, date: line[`actual${stage}Date`], amount: line[key], source: 'Legacy scalar evidence (not added to ledger)' });
            for (const entry of revisionRows(line[stage === 'Obligation' ? 'obligations' : 'disbursements'])) legacyActuals.push({ ...entry, itemId: line.id, stage, source: 'Embedded evidence (not added to ledger)' });
        }
    }
    table('Target schedules', schedules, f('itemId stage id month amount source'));
    fields('Physical accomplishments', { ...record, ...snapshot.physical }, [...physicalFields, ...f('projectionVersion changed source completionDate completed quantity remarks submittedAt effectiveDate effectiveCount')]);
    table('Item physical accomplishments', lines, f('id particulars expenseParticular actualDeliveryDate actualNumberOfUnits isCompleted'));
    const actuals: SnapshotRecord[] = [];
    const provenance: SnapshotRecord[] = [];
    for (const stage of ['obligation', 'disbursement'] as const) {
        const managed = new Set<string>();
        for (const [itemId, item] of Object.entries(snapshot.financial.stages)) {
            if (!object(item) || !object(item[stage])) continue;
            const state = item[stage] as SnapshotRecord;
            managed.add(itemId);
            provenance.push({ itemId, stage, source: state.source, entries: Array.isArray(state.entries) ? state.entries.length : 'Not recorded' });
            for (const entry of revisionRows(state.entries)) actuals.push({ ...entry, itemId, stage, source: state.source });
        }
        const central = snapshot.financial[stage === 'obligation' ? 'obligations' : 'disbursements'];
        for (const entry of central) {
            const itemId = entry.item_id ?? entry.itemId ?? '$parent';
            if (!managed.has(String(itemId))) actuals.push({ ...entry, date: entry.date ?? entry[stage === 'obligation' ? 'obligation_date' : 'disbursement_date'], itemId, stage, source: 'Central ledger' });
        }
    }
    table('Financial stage provenance', provenance, f('itemId stage source entries'));
    sections.push({ title: 'Financial actuals', columns: ['Item ID', 'Stage', 'Entry ID', 'Date', 'Amount', 'Remarks', 'Source'], rows: actuals.map(row => ['itemId', 'stage', 'id', 'date', 'amount', 'remarks', 'source'].map(key => revisionDisplayValue(row[key]))) });
    table('Legacy financial evidence', legacyActuals, f('itemId stage id date amount remarks source'));
    fields('Lifecycle and transfer lineage', record, lifecycleFields);
    fields('Saved relationships', snapshot.related, f('fundSource fundSourceUid ipo ipos participatingIpos participating_ipo_ids approver approvalStatus approvalReason approvalDate transfer lineage coverage'));
    for (const key of ['ipos', 'participants', 'approvals', 'attachments', 'files', 'monitoring', 'supplements']) {
        table(fieldLabel(key), revisionRows(snapshot.related[key]), f('id uid name label title file_name original_name mime_type section status source reference reason version revision amount created_at updated_at approverName approvalDate unavailable'));
    }
    fields('Reference activity', object(snapshot.related.referenceActivity) ? snapshot.related.referenceActivity : {}, f('id activity_name component type'));
    const relatedTables: Array<[string, string, RevisionField[]]> = [
        ['activity_supplements', 'Activity supplements', f('uid activity_id source reference authorization_date reason status revision created_by approver_id origin_uid pending_status created_at updated_at')],
        ['activity_monitoring_reports', 'Monitoring reports', f('id activity_id ipo_id status findings issues recommendations reported_by reported_by_name created_at updated_at deleted_at deleted_by deleted_by_name')],
        ['activity_monitoring_actions', 'Monitoring actions', f('id monitoring_report_id action_taken created_by created_by_name created_at updated_at edited_by edited_by_name edited_at deleted_by deleted_by_name deleted_at')],
        ['subproject_accomplishments', 'Subproject delivery evidence', f('id detail_id delivery_date quantity remarks created_by created_at')],
        ['budget_item_adjustment_history', 'Budget adjustment history', f('id source_type parent_id item_id action source_item_id amount_delta reason created_by created_by_name created_at')],
    ];
    const mediaFields = f('id file_id file_name display_name caption mime_type file_size upload_section folder_id folder_name folder_year operating_unit ipo_name subproject_name activity_name activity_type uploaded_at uploaded_by uploaded_by_name created_at updated_at deleted_at deleted_by deleted_by_name unavailable');
    relatedTables.push(['activity_drive_files', 'Activity file metadata', mediaFields], ['subproject_drive_files', 'Subproject file metadata', mediaFields]);
    for (const [key, title, selected] of relatedTables) table(title, revisionRows(snapshot.related[key]), selected);
    table('Transfer history', revisionRows(snapshot.related.transfers), f('id source_type source_id destination_id selected_item_ids reason actor_id actor_name assigned_approver_id status resolved_by resolved_by_name resolution_reason created_at resolved_at'));
    for (const transfer of revisionRows(snapshot.related.transfers)) {
        for (const [key, label] of [['source_actual_remainder', 'source remainder'], ['destination_actuals', 'destination actuals']] as const) {
            if (object(transfer[key])) fields(`Transfer ${revisionDisplayValue(transfer.id)} ${label}`, transfer[key], physicalFields);
        }
    }
    for (const adjustment of revisionRows(snapshot.related.budget_item_adjustment_history)) {
        for (const [key, label] of [['before_snapshot', 'before'], ['after_snapshot', 'after']] as const) {
            if (object(adjustment[key])) fields(`Adjustment ${revisionDisplayValue(adjustment.id)} ${label}`, adjustment[key], [...evidenceLineFields, ...f('accomplishmentRemarks catchUpPlanRemarks')]);
        }
    }
    table('Commodities', revisionRows(record.subprojectCommodities), f('typeName name area averageYield actualYield marketingPercentage foodSecurityPercentage income'));
    if (object(record.original_budget_snapshot)) {
        fields('Original budget freeze', record.original_budget_snapshot, f('capturedAt kind reason'));
        table('Frozen original budget items', revisionRows(record.original_budget_snapshot.expenses), lineFields);
    }
    for (const supplement of [...revisionRows(snapshot.related.supplements), ...revisionRows(snapshot.related.activity_supplements)]) {
        const title = `Supplement ${revisionDisplayValue(supplement.uid ?? supplement.id)}`;
        table(`${title} items`, revisionRows(supplement.items ?? supplement.expenses), evidenceLineFields);
        if (object(supplement.pending_proposal)) {
            fields(`${title} pending proposal`, supplement.pending_proposal, f('source reference authorization_date reason status'));
            table(`${title} pending proposal items`, revisionRows(supplement.pending_proposal.expenses), evidenceLineFields);
        }
    }
    return sections;
}
