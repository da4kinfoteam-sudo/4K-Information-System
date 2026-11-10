import React, { useEffect, useId, useRef, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { ChevronDown, Check } from 'lucide-react';
import { getFundYearOptions, isValidFundYear, rememberFundYear } from '../../lib/fundYear';
import { ConfirmDialog } from './enterprise';

interface FundYearFieldProps {
    key?: string | number;
    value?: number | string | null;
    onChange: (year: number, reschedule: boolean) => void;
    name?: string;
    label?: string;
    disabled?: boolean;
    className?: string;
    reschedule?: boolean;
    blockedReason?: string;
    trackFormDraft?: boolean;
}

export function FundYearField({ value, onChange, name, label = 'Fund Year', disabled, className = '', reschedule = false, blockedReason, trackFormDraft = true }: FundYearFieldProps) {
    const id = useId(), inputRef = useRef<HTMLInputElement>(null), committing = useRef(false), suppressFocusMenu = useRef(false);
    const saved = String(value ?? '');
    const [text, setText] = useState(saved), [open, setOpen] = useState(false), [searching, setSearching] = useState(false);
    const [error, setError] = useState(''), [touched, setTouched] = useState(false), [active, setActive] = useState(-1);
    const [pending, setPending] = useState<number | null>(null);
    const options = getFundYearOptions(value).filter(year => !searching || year.includes(text));
    useEffect(() => { setText(saved); setError(''); setTouched(false); setPending(null); committing.current = false; }, [saved]);
    useEffect(() => {
        const input = inputRef.current;
        const validate = () => setError(pending !== null ? 'Finish the Fund Year change before saving.' : 'Enter and confirm a four-digit year from 1000 to 9999.');
        input?.addEventListener('validate-fund-year', validate);
        input?.setCustomValidity((text === '' && !touched && saved === '') || isValidFundYear(text) ? '' : 'Enter a four-digit year from 1000 to 9999.');
        return () => input?.removeEventListener('validate-fund-year', validate);
    }, [text, touched, saved, pending]);
    const cancel = () => { suppressFocusMenu.current = pending !== null; setPending(null); committing.current = false; setText(saved); setTouched(false); setError(''); setOpen(false); };
    const apply = (year: number, move: boolean) => {
        suppressFocusMenu.current = pending !== null;
        try {
            onChange(year, move);
            rememberFundYear(year); setPending(null); setText(String(year)); setError('');
        } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to change Fund Year.'); setPending(null); setText(saved); }
        committing.current = false;
    };
    const commit = (candidate = text) => {
        if (disabled || inputRef.current?.matches(':disabled') || committing.current) return;
        setOpen(false);
        if (candidate === '' && saved === '' && !touched) return;
        if (!isValidFundYear(candidate)) { setError('Enter a four-digit year from 1000 to 9999.'); return; }
        if (candidate === saved) { setError(''); return; }
        if (blockedReason) { setError(blockedReason); return; }
        committing.current = true;
        const year = Number(candidate);
        setText(candidate);
        if (reschedule && isValidFundYear(saved)) setPending(year);
        else apply(year, false);
    };
    return <div className="reference-combobox fund-year-field">
        <label className="form-label" htmlFor={id}>{label}</label>
        <Popover.Root open={open} onOpenChange={setOpen}>
            <Popover.Anchor asChild><div className="reference-combobox__control">
                <input ref={inputRef} id={id} name={name} type="text" inputMode="numeric" autoComplete="off" role="combobox" aria-autocomplete="list"
                    aria-expanded={open} aria-controls={`${id}-choices`} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined}
                    aria-activedescendant={open && options[active] ? `${id}-year-${options[active]}` : undefined}
                    data-fund-year={trackFormDraft ? '' : undefined} data-committed-year={saved} data-year-allow-empty={saved === '' && !touched} data-year-pending={pending !== null}
                    pattern="[1-9][0-9]{3}" required={touched || !!saved} disabled={disabled} readOnly={pending !== null} value={text}
                    className={`form-control ${className}${error ? ' form-control--invalid' : ''}`}
                    onInvalid={event => { event.preventDefault(); setError('Enter a four-digit year from 1000 to 9999.'); inputRef.current?.focus(); }}
                    onFocus={() => { setSearching(false); if (suppressFocusMenu.current) suppressFocusMenu.current = false; else setOpen(true); }}
                    onChange={event => { setText(event.target.value); setTouched(true); setSearching(true); setActive(-1); setError(''); setOpen(true); }}
                    onBlur={() => commit()}
                    onKeyDown={event => {
                        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); setActive(previous => Math.max(0, Math.min(options.length - 1, previous + (event.key === 'ArrowDown' ? 1 : -1)))); }
                        if (event.key === 'Enter') { event.preventDefault(); commit(open && active >= 0 ? options[active] : text); }
                        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancel(); }
                    }} />
                <button type="button" className="reference-combobox__toggle" aria-label={`Open ${label} choices`} disabled={disabled || pending !== null}
                    onMouseDown={event => event.preventDefault()} onClick={() => { setSearching(false); setActive(-1); setOpen(previous => !previous); }}><ChevronDown aria-hidden="true" /></button>
            </div></Popover.Anchor>
            <Popover.Portal><Popover.Content align="start" sideOffset={4} className="reference-combobox__popover" onOpenAutoFocus={event => event.preventDefault()} onCloseAutoFocus={event => event.preventDefault()}>
                <div role="listbox" id={`${id}-choices`} aria-label={`${label} choices`}>
                    {options.map((year, index) => <button type="button" role="option" id={`${id}-year-${year}`} aria-selected={saved === year} key={year}
                        className={`reference-combobox__option${active === index ? ' is-active' : ''}`} onMouseDown={event => event.preventDefault()} onClick={() => commit(year)}>
                        <span>{year}</span>{saved === year && <Check aria-hidden="true" />}
                    </button>)}
                </div>
            </Popover.Content></Popover.Portal>
        </Popover.Root>
        {error && <span id={`${id}-error`} className="form-error" role="alert">{error}</span>}
        {pending !== null && <ConfirmDialog title="Change Fund Year" description={`Change Fund Year from ${saved} to ${pending}? Actual dates will remain unchanged.`} tone="primary"
            cancelLabel="Cancel" confirmLabel="Reschedule Planned Dates" compactConfirmLabel="Reschedule" onCancel={cancel} onConfirm={() => apply(pending, true)}
            secondaryAction={{ label: 'Keep Existing Dates', compactLabel: 'Keep Dates', onClick: () => apply(pending, false) }} />}
    </div>;
}
