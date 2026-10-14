import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRightLeft, Check, ClipboardCheck, History, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import type { Activity, ActivityExpense } from '../../constants';
import { useAuth } from '../../contexts/AuthContext';
import { useDcfPolicyGuard } from '../../hooks/useDcfPolicyGuard';
import { ActivityBudgetEditor } from './ActivityBudgetEditor';
import { RecordKpiCard, RecordKpiGrid, RecordPanel, formatRecordMetricCurrency } from './RecordDetailLayout';
import { ActivitySupplement, getActivityBudgetSummary, isSupplementalExpense, SupplementalSource } from '../../lib/activitySupplementalBudget';
import { readActivitySupplements, saveActivitySupplement } from '../../lib/activitySupplementalPersistence';
import { getBudgetLineAmount } from '../../lib/budgetLineAdjustments';

type Draft = { uid: string; ledger?: ActivitySupplement; source: SupplementalSource; reference: string; date: string; reason: string; rows: ActivityExpense[]; establish: boolean; review?: boolean };
const money = (amount: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
const month = (date: string) => date ? new Date(`${date.slice(0,10)}T00:00:00`).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '';

export function ActivitySupplementalSection({ activity, uacsCodes, onUpdate, transferSelection }: {
    activity: Activity; uacsCodes: Record<string, Record<string, Record<string, string>>>; onUpdate: (activity: Activity) => void;
    transferSelection?: { selectedIds: string[]; eligibleIds: Set<string>; onToggle: (id: string) => void; onTransfer: () => void };
}) {
    const { currentUser, hasAccess } = useAuth();
    const { getStatusDecision } = useDcfPolicyGuard();
    const [supplements, setSupplements] = useState<ActivitySupplement[]>([]);
    const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState('');
    const [draft, setDraft] = useState<Draft | null>(null), [pendingRows, setPendingRows] = useState(false);
    const [history, setHistory] = useState<Array<{ id: number; operation: string; reason: string; created_at: string }> | null>(null);
    const inFlight = useRef(false), requestKey = useRef(crypto.randomUUID()), base = useRef(activity);
    const actionRetry = useRef<{ fingerprint: string; key: string } | null>(null);
    const loadSequence = useRef(0), latestProps = useRef({ activity, currentUser, onUpdate });
    latestProps.current = { activity, currentUser, onUpdate };
    const modalRef = useRef<HTMLElement>(null);
    const decision = getStatusDecision({ moduleKey: 'activities', item: activity, action: 'editSupplementalBudget', hasModuleAccess: hasAccess('Activities','edit') });
    const allowed = decision.allowed && activity.status !== 'Cancelled' && (!activity.budgetItemTransferId || activity.workflow_status === 'APPROVED');
    const summary = getActivityBudgetSummary(activity);
    const fetchLedger = useCallback(async () => {
        const actor = latestProps.current.currentUser, id = latestProps.current.activity.id;
        const sequence = ++loadSequence.current;
        if (!actor) { setLoading(false); return; }
        setLoading(true); setError('');
        try {
            const result = await readActivitySupplements(id,actor);
            if (sequence !== loadSequence.current || latestProps.current.activity.id !== id) return;
            setSupplements(result.supplements);
            latestProps.current.onUpdate(result.activity);
        }
        catch (e) { if (sequence === loadSequence.current) setError(e instanceof Error ? e.message : 'Supplemental Information could not be loaded.'); }
        finally { if (sequence === loadSequence.current) setLoading(false); }
    },[activity.id,currentUser?.id]);
    useEffect(() => {
        setSupplements([]); setDraft(null); setHistory(null);
        void fetchLedger();
        return () => { loadSequence.current++; };
    },[fetchLedger]);
    const closeDraft = () => { if (!busy && (draft?.review || window.confirm('Discard the unsaved supplemental draft?'))) { setDraft(null); setPendingRows(false); } };
    useEffect(() => {
        if (!draft && !history) return;
        const key = (event: KeyboardEvent) => {
            if (event.defaultPrevented || document.querySelector('[data-radix-popper-content-wrapper]')) return;
            if (event.key === 'Escape' && !busy) { if (history) setHistory(null); else closeDraft(); }
            if (event.key !== 'Tab') return;
            const targets: HTMLElement[] = [];
            modalRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]').forEach((node: HTMLElement) => { if (node.offsetParent !== null) targets.push(node); });
            if (!targets.length) return;
            const first = targets[0], last = targets[targets.length-1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        };
        document.addEventListener('keydown',key); return () => document.removeEventListener('keydown',key);
    },[!!draft,!!history,busy]);
    useEffect(() => {
        if (!draft && !history) return;
        const previous = document.activeElement as HTMLElement | null;
        modalRef.current?.querySelector<HTMLElement>('button,input')?.focus();
        return () => { if (previous?.isConnected) previous.focus(); };
    },[!!draft,!!history]);
    const start = (ledger?: ActivitySupplement, rows?: ActivityExpense[]) => {
        base.current = structuredClone(activity); requestKey.current = crypto.randomUUID(); setError(''); setPendingRows(false);
        const proposal = ledger?.pending_proposal;
        setDraft({ uid: ledger?.uid || crypto.randomUUID(), ledger, source: proposal?.source || ledger?.source || rows?.[0]?.supplementalSource || 'Savings',
            reference: proposal?.reference || ledger?.reference || '', date: proposal?.date || ledger?.authorization_date || '',
            reason: proposal?.reason || ledger?.reason || '', rows: structuredClone(proposal?.rows || rows || activity.expenses.filter(row => row.supplementUid === ledger?.uid && !!row.supplementUid)), establish: false,
            review: ledger?.status === 'PENDING' || ledger?.pending_status === 'PENDING' });
    };
    const updateDraft = (patch: Partial<Draft>) => { requestKey.current = crypto.randomUUID(); setDraft(previous => previous && ({ ...previous,...patch })); };
    const execute = async (operation: 'draft' | 'submit' | 'approve' | 'reject' | 'withdraw' | 'delete', selected?: ActivitySupplement) => {
        if (!currentUser || inFlight.current || !allowed) return;
        if (pendingRows) { setError('Apply or discard the schedule draft before saving.'); return; }
        const record = selected || draft?.ledger;
        const reason = selected ? window.prompt(`Reason for ${operation}:`,record?.reason || '') : draft?.reason;
        if (!reason?.trim()) { setError('A reason is required.'); return; }
        const payload = draft && !selected ? draft : { uid: record!.uid, ledger: record, source: record!.source, reference: record!.reference, date: record!.authorization_date,
            rows: activity.expenses.filter(row => row.supplementUid === record!.uid), establish: false };
        inFlight.current = true; setBusy(true); setError('');
        try {
            const fingerprint = JSON.stringify([currentUser.id,activity.id,activity.updated_at,operation,payload.uid,payload.ledger?.revision,reason.trim()]);
            if (selected && actionRetry.current?.fingerprint !== fingerprint) actionRetry.current = { fingerprint, key: crypto.randomUUID() };
            const result = await saveActivitySupplement({ activity: selected ? activity : base.current, actor: currentUser,
                uid: payload.uid, operation, source: payload.source, reference: payload.reference, authorizationDate: payload.date,
                reason: reason.trim(), rows: payload.rows, revision: payload.ledger?.revision || 0, establishBaseline: payload.establish,
                requestKey: selected ? actionRetry.current!.key : requestKey.current });
            setSupplements(result.supplements); onUpdate(result.activity); setDraft(null); setPendingRows(false);
        } catch (e) { setError(e instanceof Error ? e.message : 'No confirmed supplement was returned. Reload before retrying.'); }
        finally { inFlight.current = false; setBusy(false); }
    };
    const showHistory = async () => {
        if (!currentUser) return;
        try { const result = await readActivitySupplements(activity.id,currentUser,true); setHistory(result.revisions || []); }
        catch (e) { setError(e instanceof Error ? e.message : 'History could not be loaded.'); }
    };
    const confirmBaseline = async () => {
        if (!currentUser || !allowed || inFlight.current || !['Super Admin','Administrator'].includes(currentUser.role)) return;
        if (!window.confirm('Confirm the current original plan as the legacy baseline? This does not reconstruct its historical allocation.')) return;
        const reason = window.prompt('Reason for confirming the legacy baseline:');
        if (!reason?.trim()) return;
        inFlight.current = true; setBusy(true); setError('');
        try {
            const fingerprint = JSON.stringify([activity.id,activity.updated_at,'baseline',reason.trim()]);
            if (actionRetry.current?.fingerprint !== fingerprint) actionRetry.current = { fingerprint, key: crypto.randomUUID() };
            const result = await saveActivitySupplement({ activity, actor: currentUser, uid: actionRetry.current.key, operation: 'baseline', source: 'Savings', reference: '', authorizationDate: '', reason: reason.trim(), rows: [], revision: 0, establishBaseline: true, requestKey: actionRetry.current.key });
            setSupplements(result.supplements); onUpdate(result.activity);
        } catch (e) { setError(e instanceof Error ? e.message : 'The baseline could not be confirmed.'); }
        finally { inFlight.current = false; setBusy(false); }
    };
    const entries = activity.expenses.filter(row => isSupplementalExpense(row,activity));
    const approver = !!currentUser && ['Super Admin','Administrator','Focal - User','Management'].includes(currentUser.role);
    return <RecordPanel title="Supplemental Information" className="activity-supplemental-section" actions={<div className="data-table__actions">
        {transferSelection && <button type="button" className="table-action" title="Transfer selected expense items" disabled={!transferSelection.selectedIds.length || busy} onClick={transferSelection.onTransfer}><ArrowRightLeft className="btn-symbol" />Transfer{transferSelection.selectedIds.length ? ` (${transferSelection.selectedIds.length})` : ''}</button>}
        {!activity.original_budget_snapshot && activity.status !== 'Proposed' && ['Super Admin','Administrator'].includes(currentUser?.role || '') && <button type="button" className="table-action" title="Confirm legacy original plan" aria-label="Confirm legacy original plan" disabled={!allowed || busy || loading || !!draft} onClick={() => void confirmBaseline()}><ClipboardCheck className="btn-symbol" /></button>}
        <button type="button" className="table-action" title="Refresh Supplemental Information" aria-label="Refresh Supplemental Information" disabled={busy || loading || !!draft} onClick={() => void fetchLedger()}><RefreshCw className="btn-symbol" /></button>
        <button type="button" className="table-action" title="Supplemental history" aria-label="Supplemental history" disabled={busy || loading || !!draft} onClick={() => void showHistory()}><History className="btn-symbol" /></button>
        <button type="button" className="table-action" title={allowed ? 'Add supplement' : decision.message} aria-label="Add supplement" disabled={!allowed || busy || loading || !!error || !!draft} onClick={() => start()}><Plus className="btn-symbol" /></button>
    </div>}>
        <RecordKpiGrid>
            <RecordKpiCard label="Original Allocation" value={summary.original === null ? '-' : formatRecordMetricCurrency(summary.original)} title={activity.original_budget_snapshot?.kind === 'legacy_confirmed' ? 'Explicitly confirmed current-plan legacy baseline' : 'Original plan baseline'} />
            <RecordKpiCard label="Savings Supplements" value={formatRecordMetricCurrency(summary.savings)} title={money(summary.savings)} />
            <RecordKpiCard label="Realignment Supplements" value={formatRecordMetricCurrency(summary.realignment)} title={money(summary.realignment)} />
            <RecordKpiCard label="Current Active Budget" value={formatRecordMetricCurrency(summary.current)} title={money(summary.current)} />
        </RecordKpiGrid>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="data-table-scroll activity-supplemental-table"><table className="data-table"><thead><tr>{transferSelection && <th>Transfer</th>}<th>Source</th><th>Authorization Reference</th><th>Authorization Date</th><th>Expense Particular</th><th>UACS Code</th><th>Obligation</th><th>Disbursement</th><th className="data-table__numeric">Amount</th><th>Approval</th><th>Actions</th></tr></thead>
            <tbody>{entries.map(row => {
                const ledger = supplements.find(item => item.uid === row.supplementUid);
                const first = ledger ? entries.find(item => item.supplementUid === ledger.uid)?.id === row.id : true;
                return <tr key={row.id}>{transferSelection && <td><input type="checkbox" className="form-checkbox" aria-label={`Select supplemental schedule ${row.id} for transfer`} checked={transferSelection.selectedIds.includes(String(row.id))} disabled={busy || !transferSelection.eligibleIds.has(String(row.id))} onChange={() => transferSelection.onToggle(String(row.id))} /></td>}<td>{ledger?.source || row.supplementalSource || (row.isSavings || activity.isSavings ? 'Savings' : 'Realignment')}</td>
                    <td title={ledger?.reference}>{ledger?.reference || '-'}</td><td>{ledger?.authorization_date || '-'}</td><td title={row.expenseParticular}>{row.expenseParticular}</td><td>{row.uacsCode}</td>
                    <td>{month(row.obligationMonth)}</td><td>{month(row.disbursementMonth)}</td><td className="data-table__numeric">{money(getBudgetLineAmount(row))}</td>
                    <td>{ledger?.pending_status ? `${ledger.status} / Revision ${ledger.pending_status}` : ledger?.status || (row.fundingOrigin === 'SupplementalDraft' ? 'Unsubmitted Draft' : row.supplementStatus || 'Previously Recorded')}</td>
                    <td><div className="data-table__actions">{first && ledger && ledger.status !== 'WITHDRAWN' && <>
                        <button type="button" className="table-action" aria-label={`${ledger.status === 'PENDING' || ledger.pending_status === 'PENDING' ? 'Review' : 'Edit'} supplement ${ledger.uid}`} title={ledger.status === 'PENDING' || ledger.pending_status === 'PENDING' ? 'Review supplement' : 'Edit supplement'} disabled={busy || (!allowed && ledger.status !== 'PENDING' && ledger.pending_status !== 'PENDING')} onClick={() => start(ledger)}><Pencil className="btn-symbol" /></button>
                        {approver && (ledger.status === 'PENDING' || ledger.pending_status === 'PENDING') && <>
                            <button type="button" className="table-action" aria-label={`Approve supplement ${ledger.uid}`} title="Approve supplement" disabled={!allowed || busy} onClick={() => void execute('approve',ledger)}><Check className="btn-symbol" /></button>
                            <button type="button" className="table-action" aria-label={`Reject supplement ${ledger.uid}`} title="Reject supplement" disabled={!allowed || busy} onClick={() => void execute('reject',ledger)}><X className="btn-symbol" /></button>
                        </>}
                        <button type="button" className="table-action table-action--danger" aria-label={`Withdraw supplement ${ledger.uid}`} title={ledger.status === 'DRAFT' || ledger.status === 'REJECTED' ? 'Delete draft' : 'Withdraw supplement'} disabled={!allowed || busy} onClick={() => void execute(ledger.status === 'DRAFT' || ledger.status === 'REJECTED' ? 'delete' : 'withdraw',ledger)}><Trash2 className="btn-symbol" /></button>
                    </>}{!ledger && row.fundingOrigin === 'SupplementalDraft' && <button type="button" className="table-action" title="Complete supplemental draft" aria-label={`Complete supplemental draft ${row.id}`} disabled={!allowed || busy || loading} onClick={() => start(undefined,[row])}><Pencil className="btn-symbol" /></button>}</div></td>
                </tr>;
            })}{!entries.length && <tr><td colSpan={transferSelection ? 11 : 10} className="data-table__empty-cell">{loading ? 'Loading Supplemental Information...' : 'No supplemental expense items'}</td></tr>}</tbody>
            <tfoot><tr><td colSpan={transferSelection ? 8 : 7}>Active Supplemental Budget</td><td className="data-table__numeric">{money(summary.supplemental)}</td><td colSpan={2} /></tr></tfoot>
        </table></div>
        {draft && <div className="modal-backdrop" onClick={event => { if (event.target === event.currentTarget) closeDraft(); }}><section ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="supplement-title" className="modal-card activity-supplemental-modal">
            <header className="modal-card__header"><h2 id="supplement-title">{draft.review ? 'Review Supplement' : draft.ledger ? 'Edit Supplement' : 'Add Supplement'}</h2><button type="button" className="table-action" title="Close" aria-label="Close supplemental draft" disabled={busy} onClick={closeDraft}><X className="btn-symbol" /></button></header>
            <div className="activity-supplemental-body"><fieldset disabled={busy || draft.review} className="activity-supplemental-fields">
                <div className="form-grid form-grid--compact"><div><label className="form-label" htmlFor="supplement-source">Source</label><select id="supplement-source" className="form-control" value={draft.source} onChange={event => updateDraft({ source: event.target.value as SupplementalSource })}><option>Savings</option><option>Realignment</option></select></div>
                    <div><label className="form-label" htmlFor="supplement-reference">Authorization Reference</label><input id="supplement-reference" className="form-control" value={draft.reference} onChange={event => updateDraft({ reference: event.target.value })} /></div>
                    <div><label className="form-label" htmlFor="supplement-date">Authorization Date</label><input id="supplement-date" type="date" className="form-control" value={draft.date || ''} onChange={event => updateDraft({ date: event.target.value })} /></div>
                </div>
                <label className="form-field"><span className="form-label">Reason</span><textarea aria-label="Supplement reason" className="form-control" value={draft.reason} onChange={event => updateDraft({ reason: event.target.value })} /></label>
                {!activity.original_budget_snapshot && activity.status !== 'Proposed' && <label className="form-check"><input type="checkbox" className="form-checkbox" checked={draft.establish} disabled={!['Super Admin','Administrator'].includes(currentUser?.role || '')} onChange={event => updateDraft({ establish: event.target.checked })} />Confirm the current original plan as the legacy baseline</label>}
                <ActivityBudgetEditor items={draft.rows} parent={{ ...activity, expenses: draft.rows }} uacsCodes={uacsCodes} showAdjustmentTags={false} includeSupplementalAmounts disabled={busy || draft.review} onDraftChange={setPendingRows}
                    onApply={rows => updateDraft({ rows: [...draft.rows.filter(item => !rows.some(row => row.id === item.id)),...rows] })}
                    onRemove={row => { if (draft.ledger?.status === 'APPROVED' && activity.expenses.some(item => item.id === row.id)) { setError('Use a recorded revision or withdrawal for approved installments.'); return; } updateDraft({ rows: draft.rows.filter(item => item.id !== row.id) }); }} />
                {error && <p className="form-error" role="alert">{error}</p>}
            </fieldset></div>
            <footer className="modal-card__footer"><button type="button" className="btn btn-secondary" disabled={busy} onClick={closeDraft}>{draft.review ? 'Close' : 'Cancel'}</button>{draft.review ? approver && <><button type="button" className="btn btn-secondary" disabled={busy || !allowed} onClick={() => void execute('reject',draft.ledger)}>Reject</button><button type="button" className="btn btn-primary" disabled={busy || !allowed} onClick={() => void execute('approve',draft.ledger)}>Approve</button></> : <><button type="button" className="btn btn-secondary" disabled={busy || pendingRows} onClick={() => void execute('draft')}>Save Draft</button><button type="button" className="btn btn-primary" disabled={busy || pendingRows} onClick={() => void execute('submit')}>{busy ? 'Saving...' : 'Submit'}</button></>}</footer>
        </section></div>}
        {history && <div className="modal-backdrop" onClick={event => { if (event.target === event.currentTarget) setHistory(null); }}><section ref={modalRef} role="dialog" aria-modal="true" aria-label="Supplemental history" className="modal-card activity-supplemental-modal"><header className="modal-card__header"><h2>Supplemental History</h2><button type="button" className="table-action" title="Close" aria-label="Close supplemental history" onClick={() => setHistory(null)}><X className="btn-symbol" /></button></header><div className="activity-supplemental-body data-table-scroll"><table className="data-table"><thead><tr><th>Date</th><th>Operation</th><th>Reason</th></tr></thead><tbody>{history.map(row => <tr key={row.id}><td>{new Date(row.created_at).toLocaleString()}</td><td>{row.operation}</td><td title={row.reason}>{row.reason}</td></tr>)}</tbody></table></div></section></div>}
    </RecordPanel>;
}
