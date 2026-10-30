import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { BudgetTargetEntry, BudgetTargetPlan, TargetPlanOwner, TargetStage } from '../../lib/budgetTargetSchedules';
import { readTargetSchedules, targetPlanForEditing, validateTargetPlan } from '../../lib/budgetTargetSchedules';
import { MonthYearPicker } from './MonthYearPicker';

const currency = (amount: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
const stageField = (stage: TargetStage) => stage === 'obligation' ? 'targetObligationSchedules' : 'targetDisbursementSchedules';
const label = (stage: TargetStage) => stage === 'obligation' ? 'Obligation' : 'Disbursement';

export function BudgetTargetSummary({ line, allocation, stage, showAmounts = true }: { line: TargetPlanOwner; allocation: number; stage: TargetStage; showAmounts?: boolean }) {
    const issue = validateTargetPlan(line);
    if (issue) return <span className="form-error" role="alert" title={issue}>Invalid target plan</span>;
    const entries = readTargetSchedules(line, stage, { amount: allocation, month: stage === 'obligation' ? line.obligationMonth : line.disbursementMonth, ownerId: line.id });
    const text = entries.map(entry => {
        const month = /^\d{4}-\d{2}-\d{2}$/.test(entry.month)
            ? new Date(`${entry.month}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' }) : 'Unscheduled';
        return showAmounts ? `${month}: ${currency(entry.amount)}` : month;
    }).join('; ') || 'No scheduled amount';
    return <span className="budget-target-plan__summary" title={text}>{text}</span>;
}

interface BudgetTargetPlanEditorProps {
    line: TargetPlanOwner;
    allocation: number;
    defaultYear?: number;
    disabled?: boolean;
    onChange: (plan: BudgetTargetPlan) => void;
}

export const BudgetTargetPlanEditor: React.FC<BudgetTargetPlanEditorProps> = ({ line, allocation, defaultYear, disabled = false, onChange }) => {
    // Incomplete drafts stay visible; the outer Apply operation validates dates and amounts.
    if ((line.targetScheduleVersion != null && line.targetScheduleVersion !== 2)
        || (line.targetScheduleVersion === 2 && (!Array.isArray(line.targetObligationSchedules) || !Array.isArray(line.targetDisbursementSchedules)
            || [...line.targetObligationSchedules, ...line.targetDisbursementSchedules].some(entry => !entry || typeof entry !== 'object')))) {
        return <p className="form-error" role="alert">Invalid target schedule structure. Refresh before editing.</p>;
    }
    const entriesFor = (stage: TargetStage): readonly BudgetTargetEntry[] => {
        if (line.targetScheduleVersion === 2) return line[stageField(stage)]!;
        return readTargetSchedules(line, stage, { amount: allocation, month: stage === 'obligation' ? line.obligationMonth : line.disbursementMonth, ownerId: line.id })
            .filter(entry => entry.amount > 0 || entry.month);
    };
    const change = (stage: TargetStage, update: (entries: BudgetTargetEntry[]) => BudgetTargetEntry[]) => {
        const plan = line.targetScheduleVersion === 2
            ? { targetScheduleVersion: 2 as const, targetObligationSchedules: line.targetObligationSchedules!, targetDisbursementSchedules: line.targetDisbursementSchedules! }
            : targetPlanForEditing(line, allocation);
        onChange({ ...plan, [stageField(stage)]: update(plan[stageField(stage)]!) });
    };
    return <div className="budget-target-plan" aria-label={`Financial targets for item ${line.id ?? ''}`}>
        {(['obligation', 'disbursement'] as const).map(stage => {
            const entries = entriesFor(stage);
            const total = entries.reduce((sum, entry) => sum + (Number.isFinite(entry.amount) ? entry.amount : 0), 0);
            const balance = (Number.isFinite(allocation) ? allocation : 0) - total;
            return <fieldset key={stage} className="budget-target-plan__stage" disabled={disabled}>
                <legend>{label(stage)} Targets</legend>
                <div className="data-table-scroll budget-target-plan__scroll"><table className="data-table">
                    <thead><tr><th>Month / Year</th><th className="data-table__numeric">Amount</th><th>Actions</th></tr></thead>
                    <tbody>{entries.map((entry, index) => <tr key={entry.id}>
                        <td><MonthYearPicker value={entry.month} defaultYear={defaultYear} ariaLabel={`${label(stage)} target month ${line.id}-${index + 1}`} onChange={month => change(stage, rows => rows.map((row, rowIndex) => rowIndex === index ? { ...row, month } : row))} /></td>
                        <td><input className="form-control form-control--compact" type="number" min="0.01" step="0.01" aria-label={`${label(stage)} target amount ${line.id}-${index + 1}`} value={Number.isFinite(entry.amount) ? entry.amount : ''} onChange={event => {
                            const amount = event.target.value === '' ? NaN : Number(event.target.value);
                            change(stage, rows => rows.map((row, rowIndex) => rowIndex === index ? { ...row, amount } : row));
                        }} /></td>
                        <td><button type="button" className="table-action table-action--danger" title={`Remove ${stage} target`} aria-label={`Remove ${stage} target ${line.id}-${index + 1}`} onClick={() => change(stage, rows => rows.filter((_, rowIndex) => rowIndex !== index))}><Trash2 aria-hidden="true" /></button></td>
                    </tr>)}{!entries.length && <tr><td colSpan={3} className="data-table__empty-cell">No scheduled amount</td></tr>}</tbody>
                    <tfoot><tr><td>Total</td><td className="data-table__numeric">{currency(total)}</td><td /></tr></tfoot>
                </table></div>
                <div className="budget-target-plan__footer">
                    <button type="button" className="btn btn-secondary" onClick={() => change(stage, rows => [...rows, { id: crypto.randomUUID(), month: '', amount: NaN }])}><Plus className="btn-symbol" aria-hidden="true" />Add {label(stage)} Target</button>
                    <span className={Math.abs(balance) >= 0.01 ? 'budget-target-plan__variance' : ''}>{balance < 0 ? 'Excess' : 'Unscheduled'}: {currency(Math.abs(balance))}</span>
                </div>
            </fieldset>;
        })}
        <div className="budget-target-plan__allocation">Allocation: {currency(Number.isFinite(allocation) ? allocation : 0)}</div>
    </div>;
};
