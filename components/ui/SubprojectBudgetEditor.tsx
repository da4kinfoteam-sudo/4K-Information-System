import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pencil, Plus, Trash2, X, Save } from 'lucide-react';
import type { Subproject, SubprojectDetail } from '../../constants';
import { objectTypes } from '../../constants';
import { getBudgetLineAmount, getBudgetLineTag, isBudgetLineExcludedFromTargets, isParentExcludedFromTargets } from '../../lib/budgetLineAdjustments';
import { BudgetReferences, createBudgetScheduleId, getUacsOptions, groupBudgetSchedules, prepareBudgetScheduleRows, SHARED_BUDGET_FIELDS, validateBudgetSchedule } from '../../lib/subprojectBudgetSchedules';
import { MonthYearPicker } from './MonthYearPicker';
import { ReferenceCombobox } from './ReferenceCombobox';
import { BudgetTargetPlanEditor, BudgetTargetSummary } from './BudgetTargetPlanEditor';
import { targetPlanForEditing } from '../../lib/budgetTargetSchedules';

type Draft = { rows: SubprojectDetail[]; rowOnly: boolean; shared: SubprojectDetail };
const UOMS = ['pcs', 'grams', 'kg', 'liters', 'boxes', 'cans', 'sets', 'pax', 'heads', 'months', 'days', 'ha', 'bags', 'bottles', 'sachets', 'rolls', 'meters', 'units', 'packs', 'lots'];
const currency = (value: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value);
const monthLabel = (value: string) => value ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '';

export const SubprojectBudgetEditor: React.FC<BudgetReferences & {
    items: SubprojectDetail[];
    parent: Partial<Subproject>;
    canEdit: (row: SubprojectDetail) => boolean;
    canRemove: (row: SubprojectDetail) => boolean;
    onApply: (rows: SubprojectDetail[]) => Promise<void> | void;
    onRemove: (id: number) => void;
    onDraftChange: (pending: boolean) => void;
    allowTags?: boolean;
    disabled?: boolean;
}> = ({ items, parent, particularTypes, uacsCodes, canEdit, canRemove, onApply, onRemove, onDraftChange, allowTags = false, disabled = false }) => {
    const [draft, setDraft] = useState<Draft | null>(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const inFlight = useRef(false);
    const groups = useMemo(() => groupBudgetSchedules(items), [items]);
    const references = { particularTypes, uacsCodes };
    useEffect(() => { onDraftChange(draft !== null); }, [draft, onDraftChange]);
    useEffect(() => () => onDraftChange(false), [onDraftChange]);

    const newRow = (template?: SubprojectDetail, groupId: string = crypto.randomUUID()): SubprojectDetail => {
        const reserved = new Set([...items, ...(draft?.rows || [])].map(row => String(row.id)));
        const shared = template ? Object.fromEntries(SHARED_BUDGET_FIELDS.map(field => [field, template[field]])) : {};
        return {
            type: '', particulars: '', objectType: 'MOOE', expenseParticular: '', uacsCode: '', unitOfMeasure: 'pcs',
            ...shared, id: createBudgetScheduleId(reserved), budgetItemGroupId: groupId,
            deliveryDate: '', obligationMonth: '', disbursementMonth: '', numberOfUnits: NaN, pricePerUnit: template?.pricePerUnit ?? NaN,
            targetScheduleVersion: 2, targetObligationSchedules: [], targetDisbursementSchedules: [],
            isRealignment: template?.isRealignment, isSavings: template?.isSavings, adjustmentReason: template?.adjustmentReason,
        } as SubprojectDetail;
    };
    const start = (rows: SubprojectDetail[], rowOnly: boolean) => {
        if (draft && !window.confirm('Discard the unsaved schedule draft?')) return;
        setError(''); setDraft({ rows: rows.map(row => ({ ...row })), rowOnly, shared: { ...rows[0] } });
    };
    const editGroup = (rows: SubprojectDetail[]) => {
        const groupId = rows[0].budgetItemGroupId || crypto.randomUUID();
        start(rows.map(row => ({ ...row, budgetItemGroupId: groupId })), false);
    };
    const addSchedule = (row: SubprojectDetail) => {
        const groupId = row.budgetItemGroupId || crypto.randomUUID();
        start(row.budgetItemGroupId ? [newRow(row, groupId)] : [{ ...row, budgetItemGroupId: groupId }, newRow(row, groupId)], true);
    };
    const updateShared = (field: string, value: string) => setDraft(previous => {
        if (!previous) return previous;
        const shared = { ...previous.shared, [field]: value };
        if (field === 'type') shared.particulars = '';
        if (field === 'objectType') { shared.expenseParticular = ''; shared.uacsCode = ''; }
        if (field === 'expenseParticular') shared.uacsCode = '';
        return { ...previous, shared };
    });
    const updateRow = (id: number, field: string, value: unknown) => setDraft(previous => previous && ({ ...previous, rows: previous.rows.map(row => {
        if (row.id !== id) return row;
        const preserveStages = ['numberOfUnits', 'pricePerUnit'].includes(field) && row[field] !== value && row.targetScheduleVersion !== 2
            ? targetPlanForEditing(row, getBudgetLineAmount(row)) : {};
        return { ...row, ...preserveStages, [field]: value };
    }) }));
    const apply = async () => {
        if (!draft || inFlight.current) return;
        setError('');
        const rows = prepareBudgetScheduleRows(draft.rows.map(row => ({ ...row, ...Object.fromEntries(SHARED_BUDGET_FIELDS.map(field => [field, draft.shared[field]])) })), items);
        if (!rows.length) { setError('Add at least one schedule.'); return; }
        for (const row of rows) {
            const original = items.find(item => item.id === row.id);
            const message = validateBudgetSchedule(row, references, original);
            if (message) { setError(message); return; }
            if (original && !canEdit(original)) { setError('This entry is not editable.'); return; }
            if (parent.status !== 'Proposed' && (row.isCancelled || row.isRealignment || row.isSavings) && !row.adjustmentReason?.trim()) {
                setError('Enter a reason for the tagged schedule.'); return;
            }
        }
        inFlight.current = true; setBusy(true);
        try { await onApply(rows); setDraft(null); }
        catch (failure) { setError(failure instanceof Error ? failure.message : 'The schedule could not be applied.'); }
        finally { inFlight.current = false; setBusy(false); }
    };
    const amount = (rows: SubprojectDetail[]) => rows.reduce((total, row) => total + (isBudgetLineExcludedFromTargets(row, parent.status) || isParentExcludedFromTargets(parent) ? 0 : getBudgetLineAmount(row)), 0);
    const shared = draft?.shared;
    const uacsOptions = shared ? getUacsOptions(references, shared.objectType, shared.expenseParticular) : [];
    const uacsValue = shared?.uacsCode ? JSON.stringify([shared.objectType, shared.expenseParticular, shared.uacsCode]) : '';
    return <div className="subproject-budget-editor">
        <div className="form-action-row"><button type="button" className="btn btn-primary" disabled={disabled || busy} onClick={() => start([newRow()], false)}><Plus aria-hidden="true" />Add Item</button></div>
        <div className="data-table-scroll subproject-budget-editor__scroll">
            <table className="data-table subproject-budget-editor__table">
                <thead><tr>{['Item Type', 'Particulars', 'UOM', 'Object Type', 'Expense Particular', 'UACS Code', 'Obligation Targets', 'Delivery Month', 'Disbursement Targets', 'Units', 'Unit Price', 'Allocation', 'Actions'].map(label => <th key={label}>{label}</th>)}</tr></thead>
                {groups.map(group => <tbody key={group.key}>
                    {group.rows.map((row, index) => <tr key={row.id}>
                        {index === 0 && SHARED_BUDGET_FIELDS.map(field => <td key={field} rowSpan={group.rows.length} className={`subproject-budget-editor__shared${field === 'particulars' ? ' subproject-budget-editor__particulars' : ''}`}>
                            <span className="subproject-budget-editor__text" title={String(row[field] || '')}>{row[field]}</span>
                            {field === 'particulars' && <div className="data-table__actions">
                                <button type="button" className="table-action" aria-label={`Edit shared item ${row.particulars}`} title="Edit shared item" disabled={disabled || busy || !group.rows.every(item => canEdit(item) && !item.isCancelled && !item.isSuperseded)} onClick={() => editGroup(group.rows)}><Pencil aria-hidden="true" /></button>
                                <button type="button" className="table-action" aria-label={`Add schedule to ${row.particulars}`} title="Add schedule" disabled={disabled || busy || !group.rows.some(item => canEdit(item) && !item.isCancelled && !item.isSuperseded)} onClick={() => addSchedule(group.rows.find(item => canEdit(item) && !item.isCancelled && !item.isSuperseded)!)}><Plus aria-hidden="true" /></button>
                            </div>}
                        </td>)}
                        <td><BudgetTargetSummary line={row} allocation={getBudgetLineAmount(row)} stage="obligation" /></td><td>{monthLabel(row.deliveryDate)}</td><td><BudgetTargetSummary line={row} allocation={getBudgetLineAmount(row)} stage="disbursement" /></td>
                        <td className="data-table__numeric">{row.numberOfUnits}</td><td className="data-table__numeric">{currency(row.pricePerUnit)}</td><td className="data-table__numeric">{currency(getBudgetLineAmount(row))}</td>
                        <td><div className="data-table__actions">
                            <button type="button" className="table-action" title="Edit schedule" aria-label={`Edit schedule ${row.id}`} disabled={disabled || busy || !canEdit(row)} onClick={() => start([row], true)}><Pencil aria-hidden="true" /></button>
                            <button type="button" className="table-action table-action--danger" title={parent.status === 'Ongoing' ? 'Cancel schedule' : 'Delete schedule'} aria-label={`${parent.status === 'Ongoing' ? 'Cancel' : 'Delete'} schedule ${row.id}`} disabled={disabled || busy || !canRemove(row)} onClick={() => onRemove(row.id)}><Trash2 aria-hidden="true" /></button>
                            {getBudgetLineTag(row, parent.status) && <span title={row.adjustmentReason || ''}>{getBudgetLineTag(row, parent.status)}</span>}
                        </div></td>
                    </tr>)}
                    <tr className="subproject-budget-editor__subtotal"><td colSpan={9}>Item Total</td><td className="data-table__numeric">{group.rows.reduce((total, row) => total + (isBudgetLineExcludedFromTargets(row, parent.status) || isParentExcludedFromTargets(parent) ? 0 : row.numberOfUnits), 0)}</td><td /><td className="data-table__numeric">{currency(amount(group.rows))}</td><td /></tr>
                </tbody>)}
                {!items.length && <tbody><tr><td colSpan={13} className="data-table__empty-cell">No budget items</td></tr></tbody>}
                <tfoot><tr><td colSpan={11}>Total</td><td className="data-table__numeric">{currency(amount(items))}</td><td /></tr></tfoot>
            </table>
        </div>
        {draft && shared && <fieldset className="subproject-budget-editor__draft" disabled={disabled || busy}>
            <div className="form-grid form-grid--compact">
                <div><label className="form-label">Item Type</label><select className="form-control form-control--compact" aria-label="Item Type" value={shared.type} disabled={draft.rowOnly} onChange={event => updateShared('type', event.target.value)}><option value="" />{Object.keys(particularTypes).sort().map(value => <option key={value}>{value}</option>)}{shared.type && !particularTypes[shared.type] && <option value={shared.type}>{shared.type}</option>}</select></div>
                <ReferenceCombobox key={`particular:${shared.type}`} label="Particulars" value={shared.particulars} fallbackLabel={shared.particulars} options={[...(particularTypes[shared.type] || [])].sort((a, b) => a.localeCompare(b)).map(value => ({ value, label: value }))} disabled={draft.rowOnly || !shared.type} onChange={value => updateShared('particulars', value)} />
                <div><label className="form-label">UOM</label><select className="form-control form-control--compact" aria-label="UOM" value={shared.unitOfMeasure} disabled={draft.rowOnly} onChange={event => updateShared('unitOfMeasure', event.target.value)}>{[...new Set([...UOMS, shared.unitOfMeasure])].filter(Boolean).map(value => <option key={value}>{value}</option>)}</select></div>
                <div><label className="form-label">Object Type</label><select className="form-control form-control--compact" aria-label="Object Type" value={shared.objectType} disabled={draft.rowOnly} onChange={event => updateShared('objectType', event.target.value)}>{objectTypes.map(value => <option key={value}>{value}</option>)}</select></div>
                <div><label className="form-label">Expense Particular</label><select className="form-control form-control--compact" aria-label="Expense Particular" value={shared.expenseParticular} disabled={draft.rowOnly} onChange={event => updateShared('expenseParticular', event.target.value)}><option value="" />{[...new Set([...Object.keys(uacsCodes[shared.objectType] || {}), shared.expenseParticular])].filter(Boolean).sort().map(value => <option key={value}>{value}</option>)}</select></div>
                <ReferenceCombobox key={`uacs:${shared.objectType}:${shared.expenseParticular}`} label="UACS Code" value={uacsValue} fallbackLabel={shared.uacsCode} options={uacsOptions} disabled={draft.rowOnly} onChange={value => setDraft(previous => {
                    if (!previous) return previous;
                    if (!value) return { ...previous, shared: { ...previous.shared, uacsCode: '' } };
                    const [objectType, expenseParticular, uacsCode] = JSON.parse(value);
                    return { ...previous, shared: { ...previous.shared, objectType, expenseParticular, uacsCode } };
                })} />
            </div>
            <div className="data-table-scroll subproject-budget-editor__draft-scroll"><table className="data-table"><thead><tr>{['Delivery Month', 'Units', 'Unit Price', 'Allocation', ...(allowTags ? ['Tag', 'Reason'] : []), 'Actions'].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>
                {draft.rows.map((row, index) => <tr key={row.id}>
                    <td><MonthYearPicker value={row.deliveryDate} defaultYear={parent.fundingYear} ariaLabel={`deliveryDate schedule ${index + 1}`} onChange={value => updateRow(row.id, 'deliveryDate', value)} /></td>
                    {(['numberOfUnits', 'pricePerUnit'] as const).map(field => <td key={field}><input className="form-control form-control--compact" type="number" step="any" min="0" aria-label={`${field === 'numberOfUnits' ? 'Units' : 'Unit Price'} schedule ${index + 1}`} value={Number.isFinite(row[field]) ? row[field] : ''} onChange={event => updateRow(row.id, field, event.target.value === '' ? NaN : Number(event.target.value))} /></td>)}
                    <td className="data-table__numeric">{currency(getBudgetLineAmount(prepareBudgetScheduleRows([row], items)[0]))}</td>
                    {allowTags && <><td><select className="form-control form-control--compact" aria-label={`Tag schedule ${index + 1}`} value={row.isCancelled ? 'Cancelled' : row.isRealignment ? 'Realignment' : row.isSavings ? 'Savings' : ''} onChange={event => setDraft(previous => previous && ({ ...previous, rows: previous.rows.map(item => item.id === row.id ? { ...item, isCancelled: event.target.value === 'Cancelled', isRealignment: event.target.value === 'Realignment', isSavings: event.target.value === 'Savings' } : item) }))}><option value="">None</option>{(parent.status === 'Ongoing' || row.isCancelled) && <option>Cancelled</option>}<option>Realignment</option><option>Savings</option></select></td><td><input className="form-control form-control--compact" aria-label={`Reason schedule ${index + 1}`} value={row.adjustmentReason || ''} onChange={event => updateRow(row.id, 'adjustmentReason', event.target.value)} /></td></>}
                    <td><button type="button" className="table-action table-action--danger" aria-label={`Remove draft schedule ${index + 1}`} title="Remove draft schedule" disabled={items.some(item => item.id === row.id)} onClick={() => setDraft(previous => previous && ({ ...previous, rows: previous.rows.filter(item => item.id !== row.id) }))}><Trash2 aria-hidden="true" /></button></td>
                </tr>)}
            </tbody></table></div>
            {draft.rows.map(row => <BudgetTargetPlanEditor key={row.id} line={row} allocation={getBudgetLineAmount(prepareBudgetScheduleRows([row], items)[0])} defaultYear={parent.fundingYear} disabled={disabled || busy} onChange={plan => setDraft(previous => previous && ({ ...previous, rows: previous.rows.map(item => item.id === row.id ? { ...item, ...plan } : item) }))} />)}
            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="form-action-row">
                {!draft.rowOnly && <button type="button" className="btn btn-secondary" onClick={() => { const row = newRow(draft.rows[0], draft.rows[0]?.budgetItemGroupId || crypto.randomUUID()); setDraft(previous => previous && ({ ...previous, rows: [...previous.rows, row] })); }}><Plus aria-hidden="true" />Add Delivery Line</button>}
                <button type="button" className="btn btn-primary" onClick={apply}><Save aria-hidden="true" />{busy ? 'Applying...' : 'Apply Item'}</button>
                <button type="button" className="btn btn-secondary" onClick={() => { setDraft(null); setError(''); }}><X aria-hidden="true" />Discard Draft</button>
            </div>
        </fieldset>}
    </div>;
};
