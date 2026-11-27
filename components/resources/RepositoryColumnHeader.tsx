import React, {useRef, useState} from 'react';
import {ArrowDown, ArrowUp, RotateCcw} from 'lucide-react';
import {Popover, PopoverContent, PopoverTrigger} from '../ui/popover';
import type {ResourcePage, ResourcesClient} from '../../lib/resources';
import {REPOSITORY_DEFAULT_SORT, repositoryChoiceChecked, toggleRepositoryChoice, type RepositoryChoice, type RepositoryColumnFilter, type RepositoryColumnKey, type RepositorySort} from '../../lib/repositoryTable';
import {ResourceErrorState, useResourceQuery, useResourceSearch} from './ResourceControls';

export default function RepositoryColumnHeader({client, column, label, filter, sort, args, onApply}: {
    client: ResourcesClient; column: RepositoryColumnKey; label: string; filter?: RepositoryColumnFilter;
    sort: RepositorySort; args: Record<string, unknown>; onApply: (filter: RepositoryColumnFilter | undefined, sort: RepositorySort) => void;
}) {
    const [open, setOpen] = useState(false), [draft, setDraft] = useState(filter), [draftSort, setDraftSort] = useState(sort);
    const [search, setSearch] = useState(''), [page, setPage] = useState(1);
    const searchRef = useRef<HTMLInputElement>(null);
    const text = useResourceSearch(search);
    const choices = useResourceQuery<ResourcePage<RepositoryChoice>>(client, 'entries', {...args, facet_key: column, facet_search: text, page, page_size: 50}, open);
    const sorted = sort.key === column;
    const limitReached = (draft?.values.length || 0) >= 100;
    return <Popover open={open} onOpenChange={value => {
        setOpen(value);
        if (value) {setDraft(filter ? structuredClone(filter) : undefined); setDraftSort({...sort}); setSearch(''); setPage(1);}
    }}>
        <PopoverTrigger asChild><button type="button" className={`repository-header-trigger${filter ? ' is-active' : ''}`} title={`Filter and sort ${label}${filter ? ' (filter active)' : ''}${sorted ? `; sorted ${sort.direction}` : ''}`} aria-label={`Filter and sort ${label}`}>{label}</button></PopoverTrigger>
        <PopoverContent align="end" collisionPadding={8} className="dashboard-scope-menu ipo-column-filter repository-column-filter" aria-label={`Filter and sort ${label}`} onOpenAutoFocus={event => {event.preventDefault(); searchRef.current?.focus();}}>
            <div className="ipo-column-filter__body custom-scrollbar">
                <div className="ipo-column-sort" role="group" aria-label={`Sort ${label}`}>
                    <button type="button" aria-pressed={draftSort.key === column && draftSort.direction === 'ascending'} onClick={() => setDraftSort({key: column, direction: 'ascending'})}><ArrowUp size={14} aria-hidden="true"/>Ascending</button>
                    <button type="button" aria-pressed={draftSort.key === column && draftSort.direction === 'descending'} onClick={() => setDraftSort({key: column, direction: 'descending'})}><ArrowDown size={14} aria-hidden="true"/>Descending</button>
                    <button type="button" title="Default Order (reset sorting)" aria-label="Default Order" onClick={() => setDraftSort(REPOSITORY_DEFAULT_SORT)}><RotateCcw size={14} aria-hidden="true"/></button>
                </div>
                <div className="repository-filter-search-row">
                    <input ref={searchRef} type="search" className="form-control" aria-label={`Search ${label} choices`} maxLength={240} value={search} onChange={event => {setSearch(event.target.value); setPage(1);}}/>
                    <div className="dashboard-scope-menu__actions"><button type="button" className="btn btn-secondary btn-sm" onClick={() => setDraft(undefined)}>Select All</button><button type="button" className="btn btn-secondary btn-sm" onClick={() => setDraft({mode: 'include', values: []})}>Clear</button></div>
                </div>
                <ResourceErrorState error={choices.error} retry={choices.refresh}/>
                <div className="dashboard-scope-menu__options custom-scrollbar" role="group" aria-label={`${label} choices`} onKeyDown={event => {
                    const inputs = [...event.currentTarget.querySelectorAll('input:not(:disabled)')] as HTMLInputElement[];
                    if (!inputs.length || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
                    event.preventDefault();
                    const index = inputs.indexOf(document.activeElement as HTMLInputElement);
                    inputs[event.key === 'Home' ? 0 : event.key === 'End' ? inputs.length - 1 : event.key === 'ArrowDown' ? (index + 1) % inputs.length : (index - 1 + inputs.length) % inputs.length]?.focus();
                }}>
                    {choices.loading ? <p role="status">Loading...</p> : choices.data?.rows.map(choice => <label key={choice.value} title={choice.label}>
                        <input type="checkbox" checked={repositoryChoiceChecked(draft, choice.value)} disabled={limitReached && !draft?.values.includes(choice.value)} onChange={event => setDraft(toggleRepositoryChoice(draft, choice.value, event.target.checked))}/><span>{choice.label}</span>
                    </label>)}
                    {!choices.loading && choices.data && !choices.data.rows.length && <p>No matching options.</p>}
                </div>
                {!!choices.data && choices.data.total > 50 && <div className="repository-choice-pagination"><button type="button" className="btn btn-secondary btn-sm" disabled={choices.loading || page <= 1} onClick={() => setPage(value => value - 1)}>Previous</button><span>{page} / {Math.ceil(choices.data.total / 50)}</span><button type="button" className="btn btn-secondary btn-sm" disabled={choices.loading || page * 50 >= choices.data.total} onClick={() => setPage(value => value + 1)}>Next</button></div>}
            </div>
            <div className="ipo-list-menu-footer"><div><button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(false)}>Cancel</button><button type="button" className="btn btn-primary btn-sm" disabled={!!choices.error} onClick={() => {onApply(draft, draftSort); setOpen(false);}}>Apply</button></div></div>
        </PopoverContent>
    </Popover>;
}
