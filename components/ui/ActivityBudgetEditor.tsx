import React, { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Trash2, Save, X } from 'lucide-react';
import type { Activity, ActivityExpense } from '../../constants';
import { objectTypes } from '../../constants';
import { getBudgetLineAmount, getBudgetLineTag, isBudgetLineExcludedFromTargets, isParentExcludedFromTargets } from '../../lib/budgetLineAdjustments';
import { groupActivityExpenses, SHARED_ACTIVITY_EXPENSE_FIELDS, validateActivitySchedule, ActivityBudgetReferences } from '../../lib/activityBudgetSchedules';
import { createBudgetScheduleId, getUacsOptions } from '../../lib/subprojectBudgetSchedules';
import { MonthYearPicker } from './MonthYearPicker';
import { ReferenceCombobox } from './ReferenceCombobox';

type Draft = { shared: ActivityExpense; rows: ActivityExpense[]; rowOnly: boolean };
const currency = (value: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value);
const month = (value: string) => value ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '';

export const ActivityBudgetEditor: React.FC<ActivityBudgetReferences & {
    items: ActivityExpense[];
    parent: Partial<Activity>;
    disabled?: boolean;
    onApply: (rows: ActivityExpense[]) => void;
    onRemove: (row: ActivityExpense) => void;
    onDraftChange: (pending: boolean) => void;
}> = ({ items, parent, uacsCodes, disabled = false, onApply, onRemove, onDraftChange }) => {
    const [draft, setDraft] = useState<Draft | null>(null);
    const [error, setError] = useState('');
    const groups = useMemo(() => groupActivityExpenses(items), [items]);
    useEffect(() => { setDraft(null); setError(''); }, [parent.id]);
    useEffect(() => { onDraftChange(!!draft); }, [draft, onDraftChange]);
    useEffect(() => () => onDraftChange(false), [onDraftChange]);
    const newRow = (template?: ActivityExpense, groupId: string = crypto.randomUUID()): ActivityExpense => ({
        id: createBudgetScheduleId(new Set([...items, ...(draft?.rows || [])].map(row => String(row.id)))),
        objectType: template?.objectType || 'MOOE', expenseParticular: template?.expenseParticular || '', uacsCode: template?.uacsCode || '',
        budgetItemGroupId: groupId, obligationMonth: '', disbursementMonth: '', amount: NaN,
        isRealignment: template?.isRealignment, isSavings: template?.isSavings, adjustmentReason: template?.adjustmentReason,
    });
    const start = (rows: ActivityExpense[], rowOnly = false) => {
        if (draft && !window.confirm('Discard the unsaved schedule draft?')) return;
        setError(''); setDraft({ shared: { ...rows[0] }, rows: rows.map(row => ({ ...row })), rowOnly });
    };
    const editGroup = (rows: ActivityExpense[]) => {
        const id = rows[0].budgetItemGroupId || crypto.randomUUID();
        start(rows.map(row => ({ ...row, budgetItemGroupId: id })));
    };
    const addSchedule = (row: ActivityExpense) => {
        const id = row.budgetItemGroupId || crypto.randomUUID();
        start(row.budgetItemGroupId ? [newRow(row, id)] : [{ ...row, budgetItemGroupId: id }, newRow(row, id)], true);
    };
    const updateShared = (field: string, value: string) => setDraft(previous => previous && ({ ...previous, shared: {
        ...previous.shared, [field]: value,
        ...(field === 'objectType' ? { expenseParticular: '', uacsCode: '' } : field === 'expenseParticular' ? { uacsCode: '' } : {}),
    } }));
    const updateRow = (id: number, patch: Partial<ActivityExpense>) => setDraft(previous => previous && ({ ...previous, rows: previous.rows.map(row => row.id === id ? { ...row, ...patch } : row) }));
    const apply = () => {
        if (!draft || disabled) return;
        if (!draft.rows.length) { setError('Add at least one schedule.'); return; }
        const rows = draft.rows.map(row => ({ ...row, ...Object.fromEntries(SHARED_ACTIVITY_EXPENSE_FIELDS.map(field => [field, draft.shared[field]])), amount: Number(row.amount) }));
        const issue = rows.map(row => validateActivitySchedule(row, { uacsCodes }, items.find(item => item.id === row.id))).find(Boolean);
        if (issue) { setError(issue); return; }
        onApply(rows); setDraft(null); setError('');
    };
    const total = (rows: ActivityExpense[]) => rows.reduce((sum, row) => sum + (isBudgetLineExcludedFromTargets(row) || isParentExcludedFromTargets(parent) ? 0 : getBudgetLineAmount(row)), 0);
    const shared = draft?.shared;
    const options = shared ? getUacsOptions({ uacsCodes, particularTypes: {} }, shared.objectType, shared.expenseParticular) : [];
    return <div className="subproject-budget-editor activity-budget-editor">
        <div className="form-action-row"><button type="button" className="btn btn-secondary" disabled={disabled} onClick={() => start([newRow()])}><Plus className="btn-symbol" />Add Expense</button></div>
        <div className="subproject-budget-editor__scroll"><table className="data-table">
            <thead><tr><th>Object Type</th><th>Expense Particular</th><th>UACS Code</th><th>Obligation</th><th>Disbursement</th><th className="data-table__numeric">Amount</th><th>Actions</th></tr></thead>
            {groups.map(group => <tbody key={group.key}>{group.rows.map((row, index) => <tr key={row.id}>
                {index === 0 && <><td rowSpan={group.rows.length}>{row.objectType}</td><td rowSpan={group.rows.length} title={row.expenseParticular}><span className="subproject-budget-editor__text">{row.expenseParticular}</span><div className="data-table__actions">
                    <button type="button" className="table-action" title="Edit expense group" aria-label={`Edit expense group ${row.id}`} disabled={disabled} onClick={() => editGroup(group.rows)}><Pencil /></button>
                    <button type="button" className="table-action" title="Add schedule" aria-label={`Add schedule to ${row.expenseParticular}`} disabled={disabled || !group.rows.some(item => !item.isCancelled)} onClick={() => addSchedule(group.rows.find(item => !item.isCancelled)!)}><Plus /></button>
                </div></td><td rowSpan={group.rows.length} title={`${row.uacsCode} - ${uacsCodes[row.objectType]?.[row.expenseParticular]?.[row.uacsCode] || ''}`}>{row.uacsCode}</td></>}
                <td>{month(row.obligationMonth)}</td><td>{month(row.disbursementMonth)}</td><td className="data-table__numeric">{currency(getBudgetLineAmount(row))}</td><td><div className="data-table__actions">
                    <button type="button" className="table-action" title="Edit schedule" aria-label={`Edit schedule ${row.id}`} disabled={disabled} onClick={() => start([row], true)}><Pencil /></button>
                    <button type="button" className="table-action table-action--danger" title="Remove schedule" aria-label={`Remove schedule ${row.id}`} disabled={disabled} onClick={() => { if (draft) { setError('Apply or discard the schedule draft before removing an expense.'); return; } onRemove(row); }}><Trash2 /></button>
                    {getBudgetLineTag(row) && <span title={row.adjustmentReason || ''}>{getBudgetLineTag(row)}</span>}
                </div></td>
            </tr>)}<tr className="subproject-budget-editor__subtotal"><td colSpan={5}>Item Total</td><td className="data-table__numeric">{currency(total(group.rows))}</td><td /></tr></tbody>)}
            {!items.length && <tbody><tr><td colSpan={7} className="data-table__empty-cell">No expense items</td></tr></tbody>}
            <tfoot><tr><td colSpan={5}>Total</td><td className="data-table__numeric">{currency(total(items))}</td><td /></tr></tfoot>
        </table></div>
        {draft && shared && <fieldset className="subproject-budget-editor__draft" disabled={disabled}>
            <div className="form-grid form-grid--compact">
                <div><label className="form-label">Object Type</label><select aria-label="Object Type" className="form-control form-control--compact" value={shared.objectType} disabled={draft.rowOnly} onChange={event => updateShared('objectType', event.target.value)}>{objectTypes.map(value => <option key={value}>{value}</option>)}</select></div>
                <ReferenceCombobox key={`particular:${shared.objectType}`} label="Expense Particular" value={shared.expenseParticular} fallbackLabel={shared.expenseParticular} options={Object.keys(uacsCodes[shared.objectType] || {}).sort((a, b) => a.localeCompare(b)).map(value => ({ value, label: value }))} disabled={draft.rowOnly} onChange={value => updateShared('expenseParticular', value)} />
                <ReferenceCombobox key={`code:${shared.objectType}:${shared.expenseParticular}`} label="UACS Code" value={shared.uacsCode ? JSON.stringify([shared.objectType, shared.expenseParticular, shared.uacsCode]) : ''} fallbackLabel={shared.uacsCode} options={options} disabled={draft.rowOnly} onChange={value => {
                    const [objectType, expenseParticular, uacsCode] = value ? JSON.parse(value) : [shared.objectType, shared.expenseParticular, ''];
                    setDraft(previous => previous && ({ ...previous, shared: { ...previous.shared, objectType, expenseParticular, uacsCode } }));
                }} />
            </div>
            <div className="subproject-budget-editor__draft-scroll"><table className="data-table"><thead><tr><th>Obligation Month</th><th>Disbursement Month</th><th>Amount</th><th>Tag</th><th>Reason</th><th>Actions</th></tr></thead><tbody>{draft.rows.map(row => <tr key={row.id}>
                <td><MonthYearPicker ariaLabel={`Obligation month ${row.id}`} value={row.obligationMonth} defaultYear={parent.fundingYear} onChange={value => updateRow(row.id, { obligationMonth: value })} /></td>
                <td><MonthYearPicker ariaLabel={`Disbursement month ${row.id}`} value={row.disbursementMonth} defaultYear={parent.fundingYear} onChange={value => updateRow(row.id, { disbursementMonth: value })} /></td>
                <td><input aria-label={`Amount ${row.id}`} className="form-control form-control--compact" type="number" min="0.01" step="0.01" value={Number.isFinite(row.amount) ? row.amount : ''} onChange={event => updateRow(row.id, { amount: event.target.value === '' ? NaN : Number(event.target.value) })} /></td>
                <td><select aria-label={`Tag ${row.id}`} className="form-control form-control--compact" value={getBudgetLineTag(row) || ''} onChange={event => updateRow(row.id, { isCancelled: event.target.value === 'Cancelled', isRealignment: event.target.value === 'Realignment', isSavings: event.target.value === 'Savings' })}><option value="" />{items.some(item => item.id === row.id) && <option>Cancelled</option>}<option>Realignment</option><option>Savings</option></select></td>
                <td><input aria-label={`Reason ${row.id}`} className="form-control form-control--compact" value={row.adjustmentReason || ''} onChange={event => updateRow(row.id, { adjustmentReason: event.target.value })} /></td>
                <td>{!items.some(item => item.id === row.id) && <button type="button" className="table-action table-action--danger" title="Remove draft schedule" aria-label={`Remove draft schedule ${row.id}`} onClick={() => setDraft(previous => previous && ({ ...previous, rows: previous.rows.filter(item => item.id !== row.id) }))}><Trash2 /></button>}</td>
            </tr>)}</tbody></table></div>
            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="form-action-row">{!draft.rowOnly && <button type="button" className="btn btn-secondary" onClick={() => setDraft(previous => previous && ({ ...previous, rows: [...previous.rows, newRow(previous.shared, previous.rows[0]?.budgetItemGroupId)] }))}><Plus className="btn-symbol" />Add Schedule</button>}
                <button type="button" className="btn btn-primary" onClick={apply}><Save className="btn-symbol" />Apply</button><button type="button" className="btn btn-secondary" onClick={() => { setDraft(null); setError(''); }}><X className="btn-symbol" />Discard</button>
            </div>
        </fieldset>}
        {!draft && error && <p className="form-error" role="alert">{error}</p>}
    </div>;
};
