import React, { useEffect, useId, useMemo, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { ChevronDown, Check } from 'lucide-react';

export interface ReferenceOption { value: string; label: string; }

export const ReferenceCombobox: React.FC<{
    label: string;
    value: string;
    options: ReferenceOption[];
    onChange: (value: string) => void;
    disabled?: boolean;
    fallbackLabel?: string;
}> = ({ label, value, options, onChange, disabled = false, fallbackLabel }) => {
    const id = useId();
    const selected = options.find(option => option.value === value);
    const [text, setText] = useState(selected?.label || fallbackLabel || '');
    const [open, setOpen] = useState(false);
    const [searching, setSearching] = useState(false);
    const [active, setActive] = useState(0);
    useEffect(() => {
        if (value) { setText(selected?.label || fallbackLabel || value); setSearching(false); }
    }, [value, selected?.label, fallbackLabel]);
    const filtered = useMemo(() => options.filter(option => !searching || option.label.toLowerCase().includes(text.toLowerCase())), [options, searching, text]);
    const choose = (option: ReferenceOption) => { onChange(option.value); setText(option.label); setSearching(false); setOpen(false); };
    return <div className="reference-combobox">
        <label className="form-label" htmlFor={id}>{label}</label>
        <Popover.Root open={open} onOpenChange={setOpen}>
            <Popover.Anchor asChild><div className="reference-combobox__control">
                <input id={id} className="form-control form-control--compact" role="combobox" autoComplete="off" aria-autocomplete="list"
                    aria-expanded={open} aria-controls={`${id}-options`} aria-activedescendant={open && filtered[active] ? `${id}-option-${active}` : undefined}
                    aria-invalid={!!text && !value} disabled={disabled} value={text}
                    onFocus={() => { setOpen(true); setSearching(false); }}
                    onChange={event => { setText(event.target.value); setSearching(true); setActive(0); setOpen(true); onChange(''); }}
                    onKeyDown={event => {
                        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                            event.preventDefault(); setOpen(true); setActive(previous => Math.max(0, Math.min(filtered.length - 1, previous + (event.key === 'ArrowDown' ? 1 : -1))));
                        } else if (event.key === 'Enter') {
                            event.preventDefault(); if (open && filtered[active]) choose(filtered[active]);
                        } else if (event.key === 'Escape') { event.preventDefault(); setOpen(false); }
                    }} />
                <button type="button" className="reference-combobox__toggle" aria-label={`Open ${label} choices`} disabled={disabled} onClick={() => { setSearching(false); setOpen(previous => !previous); }}><ChevronDown aria-hidden="true" /></button>
            </div></Popover.Anchor>
            <Popover.Portal><Popover.Content className="reference-combobox__popover" sideOffset={4} align="start" onOpenAutoFocus={event => event.preventDefault()} onCloseAutoFocus={event => event.preventDefault()}>
                <div id={`${id}-options`} role="listbox" aria-label={`${label} choices`}>
                    {filtered.map((option, index) => <button type="button" key={option.value} id={`${id}-option-${index}`} role="option" aria-selected={value === option.value}
                        className={`reference-combobox__option${active === index ? ' is-active' : ''}`} title={option.label}
                        onMouseEnter={() => setActive(index)} onMouseDown={event => event.preventDefault()} onClick={() => choose(option)}>
                        <span>{option.label}</span>{value === option.value && <Check aria-hidden="true" />}
                    </button>)}
                    {!filtered.length && <div className="reference-combobox__empty">No matching choices</div>}
                </div>
            </Popover.Content></Popover.Portal>
        </Popover.Root>
        {!!text && !value && <span className="form-error">Select a listed choice.</span>}
        {!!value && !selected && <span className="form-help">Saved reference unavailable</span>}
    </div>;
};
