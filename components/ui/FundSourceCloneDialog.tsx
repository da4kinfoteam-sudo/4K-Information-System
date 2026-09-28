import React, { useEffect, useId, useRef, useState } from 'react';
import type { RefFundSource } from '../../constants';
import { sortFundSources } from '../../lib/fundSources';

interface FundSourceCloneDialogProps {
    count: number;
    references: RefFundSource[];
    onConfirm: (uid: string) => void;
    onCancel: () => void;
}

export const FundSourceCloneDialog: React.FC<FundSourceCloneDialogProps> = ({ count, references, onConfirm, onCancel }) => {
    const titleId = useId();
    const descriptionId = useId();
    const selectRef = useRef<HTMLSelectElement>(null);
    const [uid, setUid] = useState('');
    const activeSources = sortFundSources(references.filter(source => source.is_active));

    useEffect(() => {
        const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const focusFrame = window.requestAnimationFrame(() => selectRef.current?.focus());
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onCancel();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            window.cancelAnimationFrame(focusFrame);
            document.removeEventListener('keydown', handleKeyDown);
            returnFocus?.focus();
        };
    }, [onCancel]);

    return (
        <div className="modal-backdrop" role="presentation" onMouseDown={onCancel}>
            <section
                className="modal-card confirm-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={descriptionId}
                onMouseDown={event => event.stopPropagation()}
            >
                <div className="confirm-dialog__content">
                    <div>
                        <h3 id={titleId}>Choose Fund Source for cloned records</h3>
                        <p id={descriptionId} className="confirm-dialog__description">
                            {count} selected record{count === 1 ? ' has' : 's have'} an inactive, unmapped, or unavailable default Fund Source. Choose an active source for those copies. Other active sources will be preserved.
                        </p>
                        <label className="form-label" htmlFor={`${titleId}-source`}>Fund Source <span className="form-required">*</span></label>
                        <select
                            ref={selectRef}
                            id={`${titleId}-source`}
                            className="form-control"
                            value={uid}
                            onChange={event => setUid(event.target.value)}
                            required
                        >
                            <option value="">Select Fund Source</option>
                            {activeSources.map(source => <option key={source.uid} value={source.uid}>{source.label}</option>)}
                        </select>
                    </div>
                </div>
                <footer className="modal-card__footer confirm-dialog__actions">
                    <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
                    <button type="button" className="btn btn-primary" disabled={!uid} onClick={() => onConfirm(uid)}>Continue</button>
                </footer>
            </section>
        </div>
    );
};
