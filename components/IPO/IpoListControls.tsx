import React, { useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Columns3, RotateCcw } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { IPO_DEFAULT_SORT, IPO_LIST_COLUMNS, IPO_NOT_RECORDED, isDefaultIpoColumn, isIpoSortableColumn, normalizeIpoListSort, type IpoListColumn, type IpoListSort } from '../../lib/ipoListColumns';

export function IpoColumnsControl({ selected, onApply }: { selected: string[]; onApply: (keys: string[]) => void }) {
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState(selected);
    const [search, setSearch] = useState('');
    const searchRef = useRef<HTMLInputElement>(null);
    const groups = [...new Set(IPO_LIST_COLUMNS.map(column => column.group))];
    const visible = IPO_LIST_COLUMNS.filter(column => `${column.label} ${column.group}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
    return <Popover modal open={open} onOpenChange={next => { setOpen(next); if (next) { setDraft([...selected]); setSearch(''); } }}>
        <PopoverTrigger asChild><button type="button" className="btn btn-secondary" title="Edit Table"><Columns3 aria-hidden="true" />Edit Table</button></PopoverTrigger>
        <PopoverContent align="end" collisionPadding={8} className="ipo-columns-menu" aria-label="Edit IPO Table" onOpenAutoFocus={event => { event.preventDefault(); searchRef.current?.focus(); }}>
            <input ref={searchRef} type="search" className="form-control" aria-label="Search columns" value={search} onChange={event => setSearch(event.target.value)} />
            <div className="ipo-columns-menu__options custom-scrollbar">
                {groups.map(group => {
                    const columns = visible.filter(column => column.group === group);
                    return columns.length > 0 && <fieldset key={group}><legend>{group}</legend>{columns.map(column => {
                        const locked = isDefaultIpoColumn(column.key);
                        return <label key={column.key} title={column.label}><input type="checkbox" className="form-checkbox" checked={locked || draft.includes(column.key)} disabled={locked} onChange={event => setDraft(previous => event.target.checked ? [...previous, column.key] : previous.filter(key => key !== column.key))} /><span>{column.label}</span></label>;
                    })}</fieldset>;
                })}
                {!visible.length && <p>No matching columns.</p>}
            </div>
            <div className="ipo-list-menu-footer">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDraft([])}>Reset Columns</button>
                <div><button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(false)}>Cancel</button><button type="button" className="btn btn-primary btn-sm" onClick={() => { onApply(draft); setOpen(false); }}>Apply</button></div>
            </div>
        </PopoverContent>
    </Popover>;
}

interface IpoColumnHeaderProps {
    column: IpoListColumn;
    options: Array<{ value: string; label: string }>;
    selected: string[] | undefined;
    sort: IpoListSort | null;
    onApply: (values: string[] | undefined, sort: IpoListSort) => void;
}
export const IpoColumnHeader: React.FC<IpoColumnHeaderProps> = ({ column, options, selected, sort, onApply }) => {
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState<string[] | undefined>(selected);
    const [search, setSearch] = useState('');
    const [draftSort, setDraftSort] = useState(() => normalizeIpoListSort(sort));
    const searchRef = useRef<HTMLInputElement>(null);
    const canSort = isIpoSortableColumn(column.key);
    const sorted = sort?.key === column.key;
    const triggerLabel = `${canSort ? 'Filter and sort' : 'Filter'} ${column.label}`;
    const tooltip = `${triggerLabel}${selected !== undefined ? ' (filter active)' : ''}${sorted ? `; sorted ${sort.direction}` : ''}`;
    const shown = useMemo(() => options.filter(option => option.label.toLocaleLowerCase().includes(search.toLocaleLowerCase())), [options, search]);
    return <th scope="col" aria-sort={canSort ? sorted ? sort.direction : 'none' : undefined} data-ipo-column={column.key}>
            <Popover open={open} onOpenChange={next => { setOpen(next); if (next) { setDraft(selected === undefined ? undefined : [...selected]); setDraftSort(normalizeIpoListSort(sort)); setSearch(''); } }}>
                <PopoverTrigger asChild><button type="button" className={`ipo-list-header__trigger${selected !== undefined ? ' is-active' : ''}`} aria-label={triggerLabel} title={tooltip}>{column.label}</button></PopoverTrigger>
                <PopoverContent align="end" collisionPadding={8} className={`dashboard-scope-menu ipo-column-filter${canSort ? ' ipo-column-filter--sortable' : ''}`} aria-label={triggerLabel} onOpenAutoFocus={event => { event.preventDefault(); searchRef.current?.focus(); }}>
                    <div className="ipo-column-filter__body custom-scrollbar">
                    {canSort && <div className="ipo-column-sort" role="group" aria-label={`Sort ${column.label}`}>
                        <button type="button" aria-pressed={draftSort.key === column.key && draftSort.direction === 'ascending'} onClick={() => setDraftSort({ key: column.key, direction: 'ascending' })}><ArrowUp size={14} aria-hidden="true" />Ascending</button>
                        <button type="button" aria-pressed={draftSort.key === column.key && draftSort.direction === 'descending'} onClick={() => setDraftSort({ key: column.key, direction: 'descending' })}><ArrowDown size={14} aria-hidden="true" />Descending</button>
                        <button type="button" aria-label="Default Order" title="Default Order (reset sorting)" onClick={() => setDraftSort(IPO_DEFAULT_SORT)}><RotateCcw size={14} aria-hidden="true" /></button>
                    </div>}
                    <input ref={searchRef} type="search" className="form-control" aria-label={`Search ${column.label} choices`} value={search} onChange={event => setSearch(event.target.value)} />
                    <div className="dashboard-scope-menu__actions"><button type="button" className="btn btn-secondary btn-sm" onClick={() => setDraft(column.kind === 'flags' ? options.filter(option => option.value !== IPO_NOT_RECORDED).map(option => option.value) : undefined)}>Select All</button><button type="button" className="btn btn-secondary btn-sm" onClick={() => setDraft([])}>Clear</button>{column.kind === 'flags' && <button type="button" className="btn btn-secondary btn-sm" aria-label={`Reset ${column.label} filter`} onClick={() => setDraft(undefined)}>Reset Filter</button>}</div>
                    <div className="dashboard-scope-menu__options custom-scrollbar" role="group" aria-label={`${column.label} choices`} onKeyDown={event => {
                        const inputs = [...event.currentTarget.querySelectorAll('input')];
                        const index = inputs.indexOf(document.activeElement as HTMLInputElement);
                        if (!inputs.length || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
                        event.preventDefault();
                        const next = event.key === 'Home' ? 0 : event.key === 'End' ? inputs.length - 1 : event.key === 'ArrowDown' ? (index + 1) % inputs.length : (index - 1 + inputs.length) % inputs.length;
                        inputs[next]?.focus();
                    }}>
                        {shown.map(option => <label key={option.value} title={option.label}><input type="checkbox" checked={draft === undefined ? column.kind !== 'flags' : draft.includes(option.value)} onChange={event => {
                            const previous = draft === undefined ? column.kind === 'flags' ? [] : options.map(option => option.value) : draft;
                            setDraft(event.target.checked ? [...previous, option.value] : previous.filter(value => value !== option.value));
                        }} /><span>{option.label}</span></label>)}
                        {!shown.length && <p>No matching options.</p>}
                    </div>
                    </div>
                    <div className="ipo-list-menu-footer">
                        <div><button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(false)}>Cancel</button><button type="button" className="btn btn-primary btn-sm" onClick={() => { onApply(draft, draftSort); setOpen(false); }}>Apply</button></div>
                    </div>
                </PopoverContent>
            </Popover>
    </th>;
};
