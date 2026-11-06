import type { User } from '../constants';
import { persistDcfMutation, readDcfState, type DcfMutationRequest } from './dcfMutation';

export type DcfImportEntity = 'subprojects' | 'activities' | 'office_requirements' | 'staffing_requirements' | 'other_program_expenses';
type ImportRow = Record<string, any>;
type JournalStorage = Pick<Storage, 'getItem' | 'setItem'>;
interface ImportAttempt {
    version: 1;
    operation: string;
    changes: ImportRow;
    reason: string;
    request: DcfMutationRequest;
    parentId?: number;
}

const commonFields = ['uid', 'operatingUnit', 'fundingYear', 'fundType', 'tier', 'fundSourceUid', 'fundSource', 'status', 'lat', 'lng'];
const pmFields = ['uid', 'operatingUnit', 'fundYear', 'fundType', 'tier', 'fundSourceUid', 'fundSource', 'status', 'uacsCode', 'obligationDate', 'disbursementDate', 'physicalDeliveryDate', 'isSavings', 'isRealignment',
    'actualDate', 'actualAmount', 'actualObligationDate', 'actualObligationAmount', 'actualDisbursementDate', 'actualDisbursementAmount', 'obligations', 'disbursements',
    ...['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].flatMap(month => ['disbursement' + month, 'actualDisbursement' + month])];
const importFields = {
    subprojects: [...commonFields, 'name', 'location', 'indigenousPeopleOrganization', 'ipo_id', 'details', 'subprojectCommodities', 'packageType', 'startDate', 'estimatedCompletionDate', 'actualCompletionDate', 'actualMaleBeneficiaries', 'actualFemaleBeneficiaries', 'actualFourPsBeneficiaries', 'remarks'],
    activities: [...commonFields, 'type', 'component', 'name', 'activity_title', 'date', 'description', 'location', 'participatingIpos', 'participating_ipo_ids', 'participantsMale', 'participantsFemale', 'facilitator', 'expenses'],
    office_requirements: [...pmFields, 'equipment', 'specs', 'purpose', 'numberOfUnits', 'pricePerUnit'],
    staffing_requirements: [...pmFields, 'personnelPosition', 'position', 'component', 'salaryGrade', 'annualSalary', 'personnelType', 'expenses', 'hiringStatus'],
    other_program_expenses: [...pmFields, 'particulars', 'amount', 'obligatedAmount'],
};
function validateNumbers(value: unknown): void {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Import values must be finite numbers.');
    if (Array.isArray(value)) value.forEach(validateNumbers);
    else if (value && typeof value === 'object') Object.values(value).forEach(validateNumbers);
}

// Import creates are not snapshot restores: identities, workflow and attribution
// belong to the server. Explicit imported actuals are business values, not clones.
export function dcfImportBusinessChanges(entityType: DcfImportEntity, row: ImportRow): ImportRow {
    const result = Object.fromEntries(importFields[entityType]
        .filter(key => row[key] !== undefined).map(key => [key, row[key]]));
    for (const field of ['startDate', 'estimatedCompletionDate', 'actualCompletionDate', 'obligationDate', 'disbursementDate', 'physicalDeliveryDate', 'actualDate', 'actualObligationDate', 'actualDisbursementDate']) {
        if (result[field] === '') result[field] = null;
    }
    validateNumbers(result);
    return JSON.parse(JSON.stringify(result));
}

export async function dcfImportFileIdentity(bytes: ArrayBuffer): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
}

export function dcfImportRowUid(entityType: DcfImportEntity, actorId: number, fileIdentity: string, rowIndex: number, proposedUid: string, storage: JournalStorage = globalThis.localStorage): string {
    if (!actorId || !fileIdentity || !Number.isInteger(rowIndex) || rowIndex < 0 || !storage) throw new Error('Durable import row identity is unavailable. No import was sent.');
    const key = `4kis:dcf-import-row:v1:${actorId}:${entityType}:${encodeURIComponent(fileIdentity)}:${rowIndex}`;
    const existing = storage.getItem(key);
    if (existing !== null && existing !== undefined) {
        if (!existing.trim() || existing.length > 200) throw new Error('The stored import row identity is unreadable. Reconcile the original import before retrying.');
        return existing;
    }
    if (!proposedUid.trim()) throw new Error('A generated import UID is required.');
    storage.setItem(key, proposedUid);
    return proposedUid;
}

export function hasDcfImportAttempt(entityType: DcfImportEntity, actorId: number, fileIdentity: string, uid: string): boolean {
    const value = globalThis.localStorage?.getItem(`4kis:dcf-import:v1:${actorId}:${entityType}:${encodeURIComponent(uid)}`);
    if (!value) return false;
    try {
        const attempt: ImportAttempt = JSON.parse(value);
        return attempt.operation === JSON.stringify([fileIdentity, 'file-import']);
    } catch { throw new Error('An import retry identity is unreadable. Reconcile this UID before another import.'); }
}

const activeUploads = new Set<string>();
export function claimDcfImportUpload(entityType: DcfImportEntity, actorId?: number): (() => void) | undefined {
    const key = `${entityType}:${actorId ?? 'offline'}`;
    if (activeUploads.has(key)) return undefined;
    activeUploads.add(key);
    return () => { activeUploads.delete(key); };
}

const activeBatches = new Set<string>();
const importSignature = (entityType: DcfImportEntity, changes: ImportRow, reason: string, actorId: number, correlationId?: string) =>
    JSON.stringify({ p_entity_type: entityType, p_parent_id: null, p_base: {}, p_changes: changes, p_financial: [],
        p_source: 'spreadsheet-import', p_reason: reason, ...(correlationId ? { p_correlation_id: correlationId } : {}), actorId });
export async function persistDcfImportRows<T extends ImportRow>(options: {
    entityType: DcfImportEntity;
    fileIdentity: string;
    rows: ImportRow[];
    actor: Pick<User, 'id' | 'password'>;
    reason: string;
    onConfirmed: (record: T) => void;
    // Only an explicitly distinct user operation may supply a new operationId.
    // Merely selecting the same file again must keep its original identity.
    operationId?: string;
    storage?: JournalStorage;
}): Promise<T[]> {
    if (!options.actor?.id || !options.fileIdentity) throw new Error('A signed-in user and file identity are required before importing.');
    const storage = options.storage ?? globalThis.localStorage;
    if (!storage) throw new Error('Durable retry storage is unavailable. No import was sent.');
    const scope = `4kis:dcf-import:v1:${options.actor.id}:${options.entityType}:`;
    if (activeBatches.has(scope)) throw new Error('An import is already in progress.');
    activeBatches.add(scope);
    const confirmed: T[] = [];
    let currentUid = '';
    try {
        const seen = new Set<string>();
        for (const row of options.rows) {
            const uid = String(row.uid || '').trim();
            if (!uid || seen.has(uid)) throw new Error('Import rows require unique, nonempty UIDs.');
            seen.add(uid);
        }
        const operation = JSON.stringify([options.fileIdentity, options.operationId ?? 'file-import']);
        const batchKey = `${scope}batch:${encodeURIComponent(operation)}`;
        let correlationId = storage.getItem(batchKey);
        if (correlationId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(correlationId)) {
            throw new Error('The saved batch identity is unreadable. Reconcile this import before retrying.');
        }
        if (!correlationId) {
            correlationId = crypto.randomUUID();
            storage.setItem(batchKey, correlationId);
        }
        for (const row of options.rows) {
            currentUid = String(row.uid).trim();
            const key = scope + encodeURIComponent(currentUid);
            const stored = storage.getItem(key);
            let attempt: ImportAttempt | undefined;
            if (stored) {
                try { attempt = JSON.parse(stored); } catch { throw new Error('The saved retry identity is unreadable. Reconcile this UID before another import.'); }
                if (attempt?.version !== 1 || !attempt.request?.key || !attempt.request.signature || attempt.changes?.uid !== currentUid) {
                    throw new Error('The saved retry identity is incomplete. Reconcile this UID before another import.');
                }
                if (attempt.operation !== operation) {
                    if (!attempt.parentId) throw new Error('An earlier import of this UID has an unknown outcome. Retry its original file before a different operation.');
                    attempt = undefined;
                }
            }
            if (!attempt) {
                const changes = dcfImportBusinessChanges(options.entityType, { ...row, uid: currentUid });
                const reason = options.reason.trim();
                if (!reason) throw new Error('An import reason is required for intentional actuals and any policy override.');
                // Match persistDcfMutation's transport signature before dispatch so
                // a lost response or reload cannot regenerate the request UUID.
                const signature = importSignature(options.entityType, changes, reason, options.actor.id, correlationId);
                attempt = { version: 1, operation, changes, reason, request: { key: crypto.randomUUID(), signature, correlationId } };
                storage.setItem(key, JSON.stringify(attempt));
            }
            let record: T;
            if (attempt.parentId) {
                // A repeated completed file must not rehydrate an old receipt over
                // subsequent edits; read today's authorized record without writes.
                record = (await readDcfState<T>(options.entityType, attempt.parentId, options.actor)).record;
            } else {
                if (attempt.request.signature !== importSignature(options.entityType, attempt.changes, attempt.reason, options.actor.id, attempt.request.correlationId)) {
                    throw new Error('The stored request contract changed. Reconcile the original request before importing again.');
                }
                const result = await persistDcfMutation<T>({ entityType: options.entityType, changes: attempt.changes,
                    actor: options.actor, request: attempt.request, source: 'spreadsheet-import', reason: attempt.reason });
                record = result.record;
                if (!record?.id || record.uid !== currentUid) throw new Error('The saved UID could not be confirmed. Retry the original file; do not create another operation.');
                attempt.parentId = Number(record.id);
                // Reconcile even if persisting the acknowledgement fails. The
                // already stored request remains safe to replay in that case.
                try { storage.setItem(key, JSON.stringify(attempt)); }
                finally { confirmed.push(record); options.onConfirmed(record); }
                continue;
            }
            if (record.uid !== currentUid) throw new Error('This UID no longer identifies the confirmed record. Reconcile before importing.');
            confirmed.push(record);
            options.onConfirmed(record);
        }
        return confirmed;
    } catch (error) {
        throw new Error(`${confirmed.length} row(s) confirmed before import stopped${currentUid ? ` at UID ${currentUid}` : ''}. ${error instanceof Error ? error.message : 'Import failed.'} Retry the same file to resolve unconfirmed rows; do not change their UIDs.`);
    } finally { activeBatches.delete(scope); }
}
