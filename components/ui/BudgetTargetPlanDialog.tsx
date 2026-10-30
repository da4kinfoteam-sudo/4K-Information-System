import React, { useEffect, useRef, useState } from 'react';
import { Save, X } from 'lucide-react';
import type { BudgetTargetPlan, TargetPlanOwner } from '../../lib/budgetTargetSchedules';
import { targetPlanForEditing, validateTargetPlan } from '../../lib/budgetTargetSchedules';
import { BudgetTargetPlanEditor } from './BudgetTargetPlanEditor';

interface Props {
    line: TargetPlanOwner;
    allocation: number;
    title: string;
    defaultYear?: number;
    disabled?: boolean;
    onApply: (plan: BudgetTargetPlan, allocation: number) => void;
    onClose: () => void;
}

export const BudgetTargetPlanDialog: React.FC<Props> = ({ line, allocation, title, defaultYear, disabled = false, onApply, onClose }) => {
    const [draft, setDraft] = useState(() => ({ ...line, ...targetPlanForEditing(line, allocation) }));
    const [amount, setAmount] = useState(allocation);
    const [error, setError] = useState('');
    const dialog = useRef<HTMLDivElement>(null);
    const close = useRef<HTMLButtonElement>(null);
    const closeHandler = useRef(onClose);
    closeHandler.current = onClose;
    useEffect(() => {
        const previous = document.activeElement as HTMLElement | null;
        close.current?.focus();
        const keydown = (event: KeyboardEvent) => {
            if (event.defaultPrevented) return;
            if (event.key === 'Escape') { event.preventDefault(); closeHandler.current(); return; }
            if (event.key !== 'Tab') return;
            const nodes = Array.from(dialog.current?.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex="0"]') || []) as HTMLElement[];
            const first = nodes[0], last = nodes[nodes.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        };
        document.addEventListener('keydown', keydown);
        return () => { document.removeEventListener('keydown', keydown); previous?.focus(); };
    }, []);
    const apply = () => {
        if (disabled) return;
        const issue = validateTargetPlan(draft);
        if (issue) { setError(issue); return; }
        if (!Number.isFinite(amount) || amount < 0) { setError('Allocation must be a non-negative finite amount.'); return; }
        onApply({ targetScheduleVersion: 2, targetObligationSchedules: draft.targetObligationSchedules, targetDisbursementSchedules: draft.targetDisbursementSchedules }, amount);
    };
    return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
        <div ref={dialog} className="modal-card budget-target-plan-dialog" role="dialog" aria-modal="true" aria-labelledby="budget-target-plan-title">
            <header className="modal-card__header"><h3 id="budget-target-plan-title" title={title}>Budget Targets: {title}</h3><button ref={close} type="button" className="modal-close-btn" aria-label="Close budget targets" onClick={onClose}><X aria-hidden="true" /></button></header>
            <div className="modal-card__body">
                <label className="form-label" htmlFor="budget-target-allocation">Allocation</label>
                <input id="budget-target-allocation" className="form-control" type="number" min="0" step="0.01" value={Number.isFinite(amount) ? amount : ''} disabled={disabled} onChange={event => setAmount(event.target.value === '' ? NaN : Number(event.target.value))} />
                <BudgetTargetPlanEditor line={draft} allocation={amount} defaultYear={defaultYear} disabled={disabled} onChange={plan => { setError(''); setDraft(previous => ({ ...previous, ...plan })); }} />
                {error && <p className="form-error" role="alert">{error}</p>}
            </div>
            <footer className="modal-card__footer"><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn btn-primary" disabled={disabled} onClick={apply}><Save className="btn-symbol" aria-hidden="true" />Apply Targets</button></footer>
        </div>
    </div>;
};
