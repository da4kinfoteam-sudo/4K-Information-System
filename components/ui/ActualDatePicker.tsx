import React, { useEffect, useId, useRef, useState } from 'react';
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isValid, parseISO, startOfMonth, startOfWeek } from 'date-fns';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import * as Popover from '@radix-ui/react-popover';
import { FundYearField } from './FundYearField';
import { isValidFundYear } from '../../lib/fundYear';

export function ActualDatePicker({ value = '', onChange, defaultYear, disabled, className = '', ariaLabel = 'Date', name }: {
    value?: string | null; onChange: (date: string) => void | Promise<void>; defaultYear?: number | string | null;
    disabled?: boolean; className?: string; ariaLabel?: string; name?: string;
}) {
    const id = useId(), input = useRef<HTMLInputElement>(null);
    const initialView = () => value && isValid(parseISO(value)) ? startOfMonth(parseISO(value))
        : new Date(isValidFundYear(defaultYear) ? Number(defaultYear) : new Date().getFullYear(), new Date().getMonth(), 1);
    const [open, setOpen] = useState(false), [view, setView] = useState(initialView), [draft, setDraft] = useState('');
    const [editing, setEditing] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false);
    const pending = useRef<Promise<boolean> | null>(null);
    const text = editing ? draft : value || '';
    const valid = (date: string) => !date || (/^[1-9]\d{3}-\d{2}-\d{2}$/.test(date) && isValid(parseISO(date)) && format(parseISO(date), 'yyyy-MM-dd') === date);
    const commit = (date: string): Promise<boolean> => {
        if (pending.current) return pending.current;
        if (!valid(date)) { setError('Enter a valid date as YYYY-MM-DD.'); input.current?.setCustomValidity('Enter a valid date as YYYY-MM-DD.'); input.current?.focus(); return Promise.resolve(false); }
        if (disabled || input.current?.matches(':disabled')) return Promise.resolve(true);
        if (date === (value || '') && !editing) return Promise.resolve(true);
        setError(''); input.current?.setCustomValidity('');
        setBusy(true);
        pending.current = (async () => {
            try { if (date !== (value || '')) await onChange(date); setEditing(false); setOpen(false); return true; }
            catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to change this date.'); return false; }
        })().finally(() => { setBusy(false); pending.current = null; });
        return pending.current;
    };
    const flush = useRef(() => commit(text));
    flush.current = () => { setOpen(false); return commit(text); };
    useEffect(() => {
        const field = input.current;
        const handler = (event: Event) => { (event as CustomEvent).detail.result = flush.current(); };
        field?.addEventListener('flush-dcf-date', handler);
        return () => field?.removeEventListener('flush-dcf-date', handler);
    }, []);
    const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(view)), end: endOfWeek(endOfMonth(view)) });
    return <Popover.Root open={open} onOpenChange={next => { if (next) setView(initialView()); setOpen(next); }}>
        <Popover.Anchor asChild><div className="actual-date-picker">
            <input ref={input} id={id} name={name} type="text" data-dcf-date="" data-committed-date={value || ''} data-date-pending={busy} value={text} inputMode="numeric" aria-label={ariaLabel} aria-invalid={!!error}
                aria-describedby={error ? `${id}-error` : undefined} autoComplete="off" disabled={disabled} readOnly={busy} className={`form-control ${className}`}
                onFocus={() => { setDraft(value || ''); setEditing(true); }}
                onChange={event => { const value = event.target.value; setDraft(value); setEditing(true); const issue = valid(value) ? '' : 'Enter a valid date as YYYY-MM-DD.'; input.current?.setCustomValidity(issue); if (value.length === 10 && !issue) void commit(value); }}
                onBlur={event => { if (editing && !(event.relatedTarget instanceof Element && event.relatedTarget.closest('.actual-date-popover'))) void commit(draft); }}
                onInvalid={event => { event.preventDefault(); setError('Enter a valid date as YYYY-MM-DD.'); input.current?.focus(); }}
                onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void commit(text); } if (event.key === 'Escape') { event.preventDefault(); setEditing(false); setError(''); input.current?.setCustomValidity(''); setOpen(false); } }} />
            <Popover.Trigger asChild><button type="button" className="reference-combobox__toggle" aria-label={`Open ${ariaLabel} calendar`} disabled={disabled || busy} onMouseDown={event => event.preventDefault()}><Calendar aria-hidden="true" /></button></Popover.Trigger>
            {error && <span id={`${id}-error`} className="form-error" role="alert">{error}</span>}
        </div></Popover.Anchor>
        <Popover.Portal><Popover.Content className="actual-date-popover" align="start" sideOffset={4} onOpenAutoFocus={event => event.preventDefault()}>
            <div className="actual-date-popover__header">
                <button type="button" className="table-action" aria-label="Previous month" disabled={format(view, 'yyyy-MM') === '1000-01'} onClick={() => setView(previous => addMonths(previous, -1))}><ChevronLeft aria-hidden="true" /></button>
                <select className="form-control" aria-label={`${ariaLabel} month`} value={view.getMonth()} onChange={event => setView(new Date(view.getFullYear(), Number(event.target.value), 1))}>
                    {Array.from({ length: 12 }, (_, month) => <option value={month} key={month}>{format(new Date(2026, month, 1), 'MMMM')}</option>)}
                </select>
                <FundYearField label={`${ariaLabel} year`} value={view.getFullYear()} onChange={year => setView(new Date(year, view.getMonth(), 1))} trackFormDraft={false} />
                <button type="button" className="table-action" aria-label="Next month" disabled={format(view, 'yyyy-MM') === '9999-12'} onClick={() => setView(previous => addMonths(previous, 1))}><ChevronRight aria-hidden="true" /></button>
            </div>
            <table className="actual-date-popover__days"><thead><tr>{['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => <th key={day} scope="col">{day}</th>)}</tr></thead>
                <tbody>{Array.from({ length: days.length / 7 }, (_, week) => <tr key={week}>{days.slice(week * 7, week * 7 + 7).map(day => {
                    const date = format(day, 'yyyy-MM-dd');
                    return <td key={date}><button type="button" aria-label={date} aria-pressed={value === date} disabled={busy || !isValidFundYear(day.getFullYear())} className={day.getMonth() !== view.getMonth() ? 'is-other-month' : undefined} onMouseDown={event => event.preventDefault()} onClick={() => void commit(date)}>{format(day, 'd')}</button></td>;
                })}</tr>)}</tbody>
            </table>
            {!!value && <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void commit('')}>Clear</button>}
        </Popover.Content></Popover.Portal>
    </Popover.Root>;
}
