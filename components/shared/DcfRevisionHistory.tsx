import React, { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Eye, History, RefreshCw, RotateCcw, Undo2, X } from 'lucide-react';
import type { HistoryEntry, User } from '../../constants';
import {
    canRestoreDcfHistory, createDcfRevisionClient, dcfRevisionAuthorizationKey, formatDcfRevisionTime,
    legacyDcfHistory,
} from '../../lib/dcfRevisionHistory';
import { DcfHistoricalDetail } from './DcfHistoricalDetail';
import { historicalTitle } from '../../lib/dcfHistoricalPresentation';
import { historicalFieldLabel, historicalRestoreRows } from '../../lib/dcfHistoricalLabels';
import type {
    DcfRestoreConfirmation, DcfRestorePreview, DcfRestoreRequest, DcfRevisionEntityType, DcfRevisionMetadata,
    DcfRevisionPage, DcfRevisionPermissions, DcfRevisionSnapshot, RevisionId, RevisionSection,
} from '../../lib/dcfRevisionHistory';

export interface DcfRevisionHistoryProps {
    entityType: DcfRevisionEntityType;
    parentId: RevisionId;
    currentUser: User | null;
    currentVersionKey?: string | number | null;
    legacyHistory?: HistoryEntry[];
    permissions?: DcfRevisionPermissions;
    /** The response is already persisted. Reconcile local state only, never call a writing setter. */
    onRestored?: (confirmed: DcfRestoreConfirmation) => void | Promise<void>;
}

const errorText = (error: unknown) => error instanceof Error ? error.message : 'History could not be loaded.';
const IconButton: React.FC<{ title: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }> = ({ title, disabled, onClick, children }) =>
    <button type="button" className="table-action" title={title} aria-label={title} disabled={disabled} onClick={onClick}>{children}</button>;

function SnapshotSections({ sections }: { sections: RevisionSection[] }) {
    return <>{sections.map((section, index) => <section className="dcf-revision-section" key={`${section.title}-${index}`}>
        <h3>{section.title}</h3>
        {section.fields && <dl className="dcf-revision-fields">{section.fields.map((field, i) => <div key={`${field.label}-${i}`}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl>}
        {section.columns && <div className="data-table-scroll dcf-revision-section__table" tabIndex={0} role="region" aria-label={section.title}>
            <table className="data-table"><thead><tr>{section.columns.map(column => <th scope="col" key={column}>{column}</th>)}</tr></thead>
                <tbody>{section.rows?.length ? section.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td title={cell} key={j}>{cell}</td>)}</tr>)
                    : <tr><td colSpan={section.columns.length}>No recorded entries</td></tr>}</tbody></table>
        </div>}
    </section>)}</>;
}

function RevisionModal({ row, snapshot, loading, error, busy, preview, reason, acknowledged, canRestore, undo, onClose, onPreview, onCancelPreview, onReason, onAcknowledge, onApply }: {
    row: DcfRevisionMetadata; snapshot: DcfRevisionSnapshot | null; loading: boolean; error: string; busy: boolean;
    preview: DcfRestorePreview | null; reason: string; acknowledged: boolean; canRestore: boolean; undo: boolean;
    onClose: () => void; onPreview: (undo: boolean) => void; onCancelPreview: () => void;
    onReason: (value: string) => void; onAcknowledge: (value: boolean) => void; onApply: () => void;
}) {
    const titleId = useId(), reasonId = useId(), acknowledgementId = useId();
    const dialog = useRef<HTMLDivElement>(null), closeButton = useRef<HTMLButtonElement>(null);
    const latest = useRef({ onClose, busy });
    latest.current = { onClose, busy };
    useEffect(() => {
        const previous = document.activeElement as HTMLElement | null;
        const previousContainer = previous?.closest('.dcf-revision-history');
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        closeButton.current?.focus();
        const focusable = () => (Array.from(dialog.current?.querySelectorAll('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),a[href],[tabindex="0"]') || []) as HTMLElement[]).filter(node => node.getClientRects().length > 0);
        const keydown = (event: KeyboardEvent) => {
            if (event.defaultPrevented) return;
            if (event.key === 'Escape') { event.preventDefault(); if (!latest.current.busy) latest.current.onClose(); return; }
            if (event.key !== 'Tab') return;
            const nodes = focusable(), first = nodes[0], last = nodes[nodes.length - 1];
            if (event.shiftKey && (document.activeElement === first || !dialog.current?.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && (document.activeElement === last || !dialog.current?.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
        };
        const focusin = (event: FocusEvent) => { if (dialog.current && !dialog.current.contains(event.target as Node)) focusable()[0]?.focus(); };
        document.addEventListener('keydown', keydown);
        document.addEventListener('focusin', focusin);
        return () => {
            document.removeEventListener('keydown', keydown);
            document.removeEventListener('focusin', focusin);
            document.body.style.overflow = previousOverflow;
            if (previous?.isConnected) previous.focus();
            else if (previousContainer?.isConnected) previousContainer.querySelector<HTMLElement>('.dcf-revision-history__toggle')?.focus();
        };
    }, []);
    const name = snapshot ? historicalTitle(snapshot) : 'Historical Version';
    return <div className="modal-backdrop dcf-revision-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
        <div ref={dialog} className="modal-card dcf-revision-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy={loading || busy}>
            <header className="modal-card__header"><h2 id={titleId}>{name}{snapshot?.record.uid ? ` (${snapshot.record.uid})` : ''} | Version {row.version ?? 'Not Recorded'}</h2>
                <button ref={closeButton} type="button" className="modal-close-btn" title="Close version" aria-label="Close version" disabled={busy} onClick={onClose}><X aria-hidden="true" /></button></header>
            <div className="modal-card__body dcf-revision-modal__body">
                <p className="dcf-revision-stamp">{formatDcfRevisionTime(row.changedAt)} | {row.actorName}</p>
                {row.reason && <dl className="dcf-revision-fields"><div><dt>Change Reason</dt><dd>{row.reason}</dd></div></dl>}
                {loading && <p role="status">Loading saved version...</p>}
                {error && <p className="form-error" role="alert">{error}</p>}
                {!loading && snapshot && !preview && <DcfHistoricalDetail snapshot={snapshot} />}
                {preview && <section className="dcf-revision-section">
                    <h3>{undo ? 'Undo Restore' : 'Restore Preview'}</h3>
                    <dl className="dcf-revision-fields"><div><dt>Source Version</dt><dd>{row.version ?? 'Selected Saved Version'}</dd></div><div><dt>Current Version</dt><dd>Current Saved Record</dd></div></dl>
                    {preview.blockers.length > 0 && <ul className="form-error" role="alert">{preview.blockers.map((blocker, i) => <li key={i}>{blocker}</li>)}</ul>}
                    {!preview.canRestore && !preview.blockers.length && <p role="alert">The server has not authorized this restoration.</p>}
                    <SnapshotSections sections={[{ title: 'Changes', columns: ['Section', 'Field / Entry', 'Current', 'Proposed'], rows: historicalRestoreRows(preview.changes, snapshot) }]} />
                    {preview.excludedFields.length > 0 && <p><strong>Protected Fields Excluded: </strong>{[...new Set(preview.excludedFields.map(historicalFieldLabel))].join(', ')}</p>}
                    {preview.changesActuals && <p className="form-error" role="alert">This correction changes physical accomplishments or previously reported obligations/disbursements.</p>}
                    <label className="form-label" htmlFor={reasonId}>Reason for {undo ? 'undoing restore' : 'restoration'}</label>
                    <textarea id={reasonId} className="form-control" rows={3} maxLength={2000} value={reason} disabled={busy} onChange={event => onReason(event.target.value)} required />
                    {preview.changesActuals && <label className="form-check dcf-revision-acknowledgement" htmlFor={acknowledgementId}><input id={acknowledgementId} className="form-checkbox" type="checkbox" checked={acknowledged} disabled={busy} onChange={event => onAcknowledge(event.target.checked)} />I acknowledge the changes to reported physical and financial actuals.</label>}
                </section>}
            </div>
            <footer className="modal-card__footer">
                {preview ? <><button type="button" className="btn btn-secondary" disabled={busy} onClick={onCancelPreview}>Cancel</button>
                    <button type="button" className="btn btn-primary" disabled={busy || !canRestore || !preview.canRestore || !!preview.blockers.length || !reason.trim() || (preview.changesActuals && !acknowledged)} onClick={onApply}>
                        {undo ? <Undo2 className="btn-symbol" aria-hidden="true" /> : <RotateCcw className="btn-symbol" aria-hidden="true" />}{busy ? 'Confirming...' : undo ? 'Confirm Undo Restore' : 'Confirm Restore'}</button></>
                    : <><button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>Close</button>
                        {snapshot && canRestore && !loading && <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => onPreview(false)}><RotateCcw className="btn-symbol" aria-hidden="true" />Restore this version</button>}
                        {snapshot && canRestore && row.undoAvailable && row.restoreOperationId && <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => onPreview(true)}><Undo2 className="btn-symbol" aria-hidden="true" />Undo Restore</button>}</>}
            </footer>
        </div>
    </div>;
}

const HistorySession: React.FC<DcfRevisionHistoryProps> = ({ entityType, parentId, currentUser, currentVersionKey, legacyHistory = [], permissions, onRestored }) => {
    const [client, setClient] = useState<ReturnType<typeof createDcfRevisionClient> | null>(null);
    const [expanded, setExpanded] = useState(false), [limit, setLimit] = useState(10);
    const [cursors, setCursors] = useState<Array<RevisionId | null>>([null]), [pageIndex, setPageIndex] = useState(0);
    const [legacyOffset, setLegacyOffset] = useState<number | null>(null);
    const [page, setPage] = useState<DcfRevisionPage | null>(null), [refresh, setRefresh] = useState(0);
    const [loading, setLoading] = useState(false), [listError, setListError] = useState(''), [notice, setNotice] = useState('');
    const [selected, setSelected] = useState<DcfRevisionMetadata | null>(null), [snapshot, setSnapshot] = useState<DcfRevisionSnapshot | null>(null);
    const [versionLoading, setVersionLoading] = useState(false), [modalError, setModalError] = useState(''), [busy, setBusy] = useState(false);
    const [preview, setPreview] = useState<DcfRestorePreview | null>(null), [undo, setUndo] = useState(false);
    const [reason, setReason] = useState(''), [acknowledged, setAcknowledged] = useState(false);
    const alive = useRef(true), selectionSequence = useRef(0), inFlight = useRef(false), retry = useRef<DcfRestoreRequest>({});
    const observedVersion = useRef(currentVersionKey);
    const canView = !!currentUser && permissions?.canView !== false;
    const restoreAllowed = canRestoreDcfHistory(currentUser, { ...permissions, canRestore: permissions?.canRestore ?? page?.canRestore ?? currentUser?.role === 'Super Admin' }) && page?.canRestore !== false;
    const sectionId = useId();
    useEffect(() => {
        alive.current = true;
        if (!currentUser || !canView) return () => { alive.current = false; };
        const service = createDcfRevisionClient(currentUser, entityType, parentId);
        setClient(service);
        return () => { alive.current = false; service.dispose(); };
    }, []);
    useEffect(() => {
        if (Object.is(observedVersion.current, currentVersionKey)) return;
        observedVersion.current = currentVersionKey;
        client?.invalidateLists();
        setPage(null); setPageIndex(0); setCursors([null]); setLegacyOffset(null); setRefresh(value => value + 1);
        if (preview) { setPreview(null); setModalError('The live record changed. Review a new restore preview before continuing.'); }
    }, [client, currentVersionKey, preview]);
    useEffect(() => {
        if (!expanded || !canView || !client) return;
        let active = true;
        setLoading(true); setPage(null); setListError('');
        client.list(limit, cursors[pageIndex]).then(result => { if (active) setPage(result); }).catch(error => { if (active) setListError(errorText(error)); }).finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [expanded, canView, client, limit, pageIndex, cursors, refresh]);
    const open = async (row: DcfRevisionMetadata, reviewUndo = false) => {
        if (!client || !row.snapshotAvailable || !canView || inFlight.current) return;
        if (reviewUndo && (!restoreAllowed || !row.undoAvailable || !row.restoreOperationId)) return;
        const sequence = ++selectionSequence.current;
        const versionAtStart = observedVersion.current;
        setSelected(row); setSnapshot(null); setPreview(null); setReason(''); setAcknowledged(false); setModalError(''); setVersionLoading(true); retry.current = {};
        if (reviewUndo) { inFlight.current = true; setBusy(true); setUndo(true); }
        try {
            const result = await client.read(row.revisionId);
            if (alive.current && sequence === selectionSequence.current) setSnapshot(result);
            if (reviewUndo && alive.current && sequence === selectionSequence.current) {
                const nextPreview = await client.preview(row.revisionId, row.restoreOperationId!);
                if (!Object.is(versionAtStart, observedVersion.current)) throw new Error('The live record changed. Review a new restore preview before continuing.');
                if (alive.current && sequence === selectionSequence.current) setPreview(nextPreview);
            }
        }
        catch (error) { if (alive.current && sequence === selectionSequence.current) setModalError(errorText(error)); }
        finally {
            if (reviewUndo) inFlight.current = false;
            if (alive.current && sequence === selectionSequence.current) { setVersionLoading(false); if (reviewUndo) setBusy(false); }
        }
    };
    const close = () => { if (inFlight.current) return; selectionSequence.current++; setSelected(null); setSnapshot(null); setPreview(null); setModalError(''); };
    const loadPreview = async (isUndo: boolean) => {
        if (!client || !selected || !restoreAllowed || inFlight.current) return;
        inFlight.current = true; setBusy(true); setModalError(''); setUndo(isUndo); retry.current = {};
        const versionAtStart = observedVersion.current;
        try {
            const result = await client.preview(selected.revisionId, isUndo ? selected.restoreOperationId || null : null);
            if (!Object.is(versionAtStart, observedVersion.current)) throw new Error('The live record changed. Review a new restore preview before continuing.');
            if (alive.current) { setPreview(result); setReason(''); setAcknowledged(false); }
        } catch (error) { if (alive.current) setModalError(errorText(error)); }
        finally { inFlight.current = false; if (alive.current) setBusy(false); }
    };
    const apply = async () => {
        if (!client || !selected || !preview || !restoreAllowed || inFlight.current) return;
        inFlight.current = true; setBusy(true); setModalError('');
        let confirmed: DcfRestoreConfirmation;
        try { confirmed = await client.apply(preview, reason, acknowledged, retry.current, undo ? selected.restoreOperationId || null : null); }
        catch (error) { inFlight.current = false; if (alive.current) { setBusy(false); setModalError(errorText(error)); } return; }
        // Confirmation closes the mutation flow even when a local reconciliation callback fails.
        if (!alive.current) { inFlight.current = false; return; }
        setSelected(null); setSnapshot(null); setPreview(null); setNotice(`${undo ? 'Undo Restore' : 'Restore'} confirmed as version ${confirmed.revisionId}.`);
        if (currentVersionKey !== undefined && typeof confirmed.record.updated_at === 'string') observedVersion.current = confirmed.record.updated_at;
        setPageIndex(0); setCursors([null]); setRefresh(value => value + 1);
        try { await onRestored?.(confirmed); }
        catch { if (alive.current) setNotice(`Version ${confirmed.revisionId} was saved, but the local view could not refresh. Reopen the live record; do not submit again.`); }
        finally { inFlight.current = false; if (alive.current) setBusy(false); }
    };
    const importedLegacyKeys = useRef(new Set<string>());
    for (const row of page?.revisions || []) {
        if (row.legacyKey) importedLegacyKeys.current.add(row.legacyKey);
        for (const key of row.legacyKeys || []) importedLegacyKeys.current.add(key);
    }
    const legacy = legacyDcfHistory(legacyHistory, importedLegacyKeys.current);
    const legacyOnLastPage = page && !page.hasMore ? Math.max(0, limit - page.revisions.length) : 0;
    const rows = !page ? [] : legacyOffset !== null ? legacy.slice(legacyOffset, legacyOffset + limit)
        : [...page.revisions, ...legacy.slice(0, legacyOnLastPage)];
    const first = legacyOffset !== null ? (page?.totalCount ?? pageIndex * limit + (page?.revisions.length || 0)) + legacyOffset + 1 : pageIndex * limit + 1;
    const hasNext = !!page && (legacyOffset !== null ? legacyOffset + limit < legacy.length : page.hasMore || legacyOnLastPage < legacy.length);
    const next = () => {
        if (!page) return;
        if (legacyOffset !== null) { setLegacyOffset(legacyOffset + limit); return; }
        if (!page.hasMore) { setLegacyOffset(legacyOnLastPage); return; }
        setCursors(value => [...value.slice(0, pageIndex + 1), page.nextBeforeRevision]); setPageIndex(value => value + 1);
    };
    const latestUndo = pageIndex === 0 && legacyOffset === null ? page?.revisions.find(row => row.undoAvailable && row.restoreOperationId) : undefined;
    return <section className="dcf-revision-history" aria-label="History">
        <div className="dcf-revision-history__heading"><button type="button" className="dcf-revision-history__toggle" aria-expanded={expanded} aria-controls={sectionId} onClick={() => setExpanded(value => !value)}><History aria-hidden="true" />History{expanded ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}</button>
            {expanded && restoreAllowed && latestUndo && <IconButton title="Undo latest restore" disabled={loading || busy} onClick={() => void open(latestUndo, true)}><Undo2 aria-hidden="true" /></IconButton>}
            {expanded && canView && <IconButton title="Refresh history" disabled={loading || busy} onClick={() => { client?.clear(); setLegacyOffset(null); setCursors([null]); setPageIndex(0); setRefresh(value => value + 1); }}><RefreshCw aria-hidden="true" /></IconButton>}</div>
        {expanded && <div id={sectionId}>
            {!canView && <p role="alert">History is unavailable for the current access scope.</p>}
            {notice && <p role="status">{notice}</p>}
            {listError && <p className="form-error" role="alert">{listError}</p>}
            {canView && <><div className="data-table-scroll dcf-revision-history__scroll" role="region" aria-label="Revision history" tabIndex={0} aria-busy={loading}>
                <table className="data-table dcf-revision-history__table"><thead><tr><th scope="col">Changed At</th><th scope="col">Change Summary</th><th scope="col">Changed By</th><th scope="col">Version</th></tr></thead>
                    <tbody>{rows.map((row, index) => <tr key={`${row.revisionId}-${index}`}><td title={formatDcfRevisionTime(row.changedAt, row.operation !== 'legacy')}>{formatDcfRevisionTime(row.changedAt, row.operation !== 'legacy')}</td>
                        <td title={row.summary}>{row.summary}</td><td title={row.actorName}>{row.actorName}</td><td>
                            {row.snapshotAvailable ? <IconButton title="View version" onClick={() => void open(row)}><Eye aria-hidden="true" /></IconButton>
                                : <span className="dcf-revision-unavailable" title="Saved version unavailable" aria-label="Saved version unavailable"><Eye aria-hidden="true" /></span>}</td></tr>)}
                        {!rows.length && <tr><td colSpan={4}>{loading ? 'Loading history...' : listError ? 'History unavailable' : 'No recorded revisions'}</td></tr>}</tbody></table>
            </div>
                <footer className="dcf-revision-history__footer"><label>Entries <select className="form-control" aria-label="History entries per page" value={limit} disabled={loading} onChange={event => { setLimit(Number(event.target.value)); setPageIndex(0); setCursors([null]); setLegacyOffset(null); }}>{[10, 20, 50].map(size => <option key={size} value={size}>{size}</option>)}</select></label>
                    <span>{rows.length ? `${first}-${first + rows.length - 1}` : '0'}{page?.totalCount != null ? ` of ${page.totalCount + (page.legacyTotalCount ?? legacy.length)}` : ' entries'}</span>
                    <div><IconButton title="Previous history page" disabled={loading || (!pageIndex && legacyOffset === null)} onClick={() => legacyOffset !== null ? setLegacyOffset(legacyOffset - limit >= legacyOnLastPage ? legacyOffset - limit : null) : setPageIndex(value => Math.max(0, value - 1))}><ChevronLeft aria-hidden="true" /></IconButton>
                        <IconButton title="Next history page" disabled={loading || !hasNext} onClick={next}><ChevronRight aria-hidden="true" /></IconButton></div>
                </footer>
            </>}
        </div>}
        {selected && <RevisionModal row={selected} snapshot={snapshot} loading={versionLoading} error={modalError} busy={busy} preview={preview} reason={reason} acknowledged={acknowledged} canRestore={restoreAllowed} undo={undo} onClose={close} onPreview={value => void loadPreview(value)} onCancelPreview={() => { setPreview(null); setModalError(''); retry.current = {}; }} onReason={setReason} onAcknowledge={setAcknowledged} onApply={() => void apply()} />}
    </section>;
}

export function DcfRevisionHistory(props: DcfRevisionHistoryProps) {
    const authorization = dcfRevisionAuthorizationKey(props.currentUser, props.permissions);
    return <HistorySession key={`${props.entityType}:${props.parentId}:${authorization}`} {...props} />;
}

export default DcfRevisionHistory;
