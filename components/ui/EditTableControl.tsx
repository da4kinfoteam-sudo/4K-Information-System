import React, { useRef, useState } from 'react';
import { Columns3 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

export interface EditTableColumn {
    key: string;
    label: string;
    group: string;
    locked?: boolean;
}

interface EditTableControlProps {
    columns: readonly EditTableColumn[];
    selected: readonly string[];
    onApply: (keys: string[]) => void;
    label: string;
}

export function EditTableControl({ columns, selected, onApply, label }: EditTableControlProps) {
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState<string[]>([]);
    const [search, setSearch] = useState('');
    const searchRef = useRef<HTMLInputElement>(null);
    const groups = [...new Set(columns.map(column => column.group))];
    const visible = columns.filter(column => `${column.label} ${column.group}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));

    return <Popover modal open={open} onOpenChange={next => {
        setOpen(next);
        if (next) { setDraft([...selected]); setSearch(''); }
    }}>
        <PopoverTrigger asChild><button type="button" className="btn btn-secondary" title="Edit Table"><Columns3 aria-hidden="true" />Edit Table</button></PopoverTrigger>
        <PopoverContent align="end" collisionPadding={8} className="edit-table-menu" aria-label={label} onOpenAutoFocus={event => { event.preventDefault(); searchRef.current?.focus(); }}>
            <input ref={searchRef} type="search" className="form-control" aria-label="Search columns" value={search} onChange={event => setSearch(event.target.value)} />
            <div className="edit-table-menu__options custom-scrollbar">
                {groups.map(group => {
                    const options = visible.filter(column => column.group === group);
                    return options.length > 0 && <fieldset key={group}><legend>{group}</legend>{options.map(column =>
                        <label key={column.key} title={column.label}>
                            <input type="checkbox" className="form-checkbox" checked={column.locked || draft.includes(column.key)} disabled={column.locked}
                                onChange={event => setDraft(previous => event.target.checked ? [...previous, column.key] : previous.filter(key => key !== column.key))} />
                            <span>{column.label}</span>
                        </label>,
                    )}</fieldset>;
                })}
                {!visible.length && <p>No matching columns.</p>}
            </div>
            <div className="table-control-menu-footer">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDraft([])}>Reset Columns</button>
                <div><button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(false)}>Cancel</button><button type="button" className="btn btn-primary btn-sm" onClick={() => { onApply(draft.filter(key => columns.some(column => column.key === key && !column.locked))); setOpen(false); }}>Apply</button></div>
            </div>
        </PopoverContent>
    </Popover>;
}
