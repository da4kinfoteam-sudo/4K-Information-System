import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { filterYears, fundTypes, operatingUnits, tiers, type RefFundSource } from '../../constants';
import { useAuth } from '../../contexts/AuthContext';
import { allSelection, dashboardDataScope, dashboardScopeKey, isValidDashboardScope, normalizeDashboardScope, selectedValues, selectionMatches, selectionValues, type DashboardScope, type DashboardScopeField, type ScopeSelection } from '../../lib/dashboardScope';
import { getFundSourceFilterOptions, getFundSourceFilterFallbackLabel, UNSPECIFIED_FUND_SOURCE_FILTER, type FundSourceRecord } from '../../lib/fundSources';
import type { DataScope } from '../../lib/scopedDataFetch';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

interface Options {
    storageKey: 'homepage_scope' | 'dashboards_dcf_scope';
    references: RefFundSource[];
    records?: (FundSourceRecord & { fundingYear?: number; fundYear?: number })[];
    onDataScopeChange?: (scope: Partial<DataScope>) => unknown;
    registryOnly?: boolean;
    enabled?: boolean;
    visibilityModule?: string;
}

function readSaved(key: string, storageKey: string, user: string | number | undefined) {
    try {
        const value = localStorage.getItem(key);
        if (value) return JSON.parse(value);
        if (storageKey !== 'homepage_scope') return JSON.parse(localStorage.getItem(`${storageKey}_${user || 'anonymous'}_applied`) || 'null');
        const prefix = `homepage_scope_${user || 'anonymous'}`;
        return Object.fromEntries(['year', 'ou', 'tier', 'fundType'].map((field, index) => [
            ['selectedYear', 'selectedOu', 'selectedTier', 'selectedFundType'][index], JSON.parse(localStorage.getItem(`${prefix}_${field}`) || 'null'),
        ]));
    } catch { return null; }
}

export function useDashboardScopeFilters({ storageKey, references, records = [], onDataScopeChange, registryOnly = false, enabled = true, visibilityModule }: Options) {
    const { currentUser, getVisibilityScope } = useAuth();
    const canViewAll = getVisibilityScope('Dashboards') === 'All' && (!visibilityModule || getVisibilityScope(visibilityModule) === 'All');
    const ownOu = canViewAll ? undefined : operatingUnits.includes(currentUser?.operatingUnit || '') ? currentUser!.operatingUnit : '';
    const currentYear = String(new Date().getFullYear());
    const key = `${storageKey}_${currentUser?.id || 'anonymous'}_v2`;
    const defaults: DashboardScope = {
        years: selectedValues([currentYear]), operatingUnits: ownOu === undefined ? allSelection() : selectedValues(ownOu ? [ownOu] : []),
        tiers: selectedValues(['Tier 1']), fundTypes: selectedValues(['Current']), fundSources: allSelection(),
    };
    const normalizeSaved = (value: unknown) => {
        const scope = normalizeDashboardScope(value, defaults, { operatingUnits, tiers, fundTypes }, ownOu);
        if (scope.years.mode === 'values') scope.years = selectedValues(scope.years.values.filter(year => /^\d{4}$/.test(year)));
        return scope;
    };
    const normalize = (value: unknown) => {
        const scope = normalizeSaved(value);
        return registryOnly ? { ...scope, years: allSelection(), tiers: allSelection(), fundTypes: allSelection(), fundSources: allSelection() } : scope;
    };
    const [saved, setSaved] = useState(() => ({ key, value: readSaved(key, storageKey, currentUser?.id) }));
    const persistedApplied = normalizeSaved(saved.key === key ? saved.value : readSaved(key, storageKey, currentUser?.id));
    const applied = normalize(persistedApplied);
    const appliedKey = dashboardScopeKey(applied);
    const [draftState, setDraft] = useState(() => ({ key, value: applied }));
    const draft = normalize(draftState.key === key ? draftState.value : applied);
    const [load, setLoad] = useState<{ key: string; loading: boolean; error: string } | null>(null);
    const [reload, setReload] = useState(0);
    const requestKey = `${key}|${registryOnly}|${canViewAll}|${appliedKey}`;
    const valid = isValidDashboardScope(applied);
    useEffect(() => {
        setDraft({ key, value: applied });
        if (saved.key !== key) setSaved({ key, value: persistedApplied });
        try { localStorage.setItem(key, JSON.stringify(persistedApplied)); } catch { /* Storage is optional. */ }
    }, [key, appliedKey]);
    useEffect(() => {
        let active = true;
        if (!enabled || !valid) return;
        setLoad({ key: requestKey, loading: true, error: '' });
        void (async () => {
            try {
                const result = await onDataScopeChange?.({ ...dashboardDataScope(applied, storageKey, canViewAll, currentUser?.id), registryOnly });
                if (result && typeof result === 'object' && 'ok' in result && result.ok === false) {
                    throw new Error('error' in result && typeof result.error === 'string' ? result.error : 'Unable to load this data scope.');
                }
                if (active) setLoad({ key: requestKey, loading: false, error: '' });
            } catch (error) {
                if (active) setLoad({ key: requestKey, loading: false, error: error instanceof Error ? error.message : 'Unable to load this data scope.' });
            }
        })();
        return () => { active = false; };
    }, [requestKey, enabled, valid, onDataScopeChange, reload]);
    const sourceOptions = useMemo(() => {
        const options = new Map(references.map(source => [source.uid, source.is_active ? source.label : `${source.label} (inactive)`]));
        getFundSourceFilterOptions(records, references).forEach(option => { if (!options.has(option.value)) options.set(option.value, option.label); });
        if (draft.fundSources.mode === 'values') draft.fundSources.values.forEach(value => { if (!options.has(value)) options.set(value, getFundSourceFilterFallbackLabel(value)); });
        options.set(UNSPECIFIED_FUND_SOURCE_FILTER, 'Not specified');
        return [...options].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
    }, [references, records, JSON.stringify(draft.fundSources)]);
    const availableYears = [...new Set([
        ...filterYears, currentYear,
        ...records.map(record => String(record.fundingYear ?? record.fundYear ?? '')).filter(year => /^\d{4}$/.test(year)),
        ...(selectionValues(applied.years) || []), ...(selectionValues(draft.years) || []),
    ])].sort().reverse();
    const fields = [
        { key: 'operatingUnits', label: 'Operating Unit', all: 'All Operating Units', options: (canViewAll ? operatingUnits : ownOu ? [ownOu] : []).map(value => ({ value, label: value })), disabled: !canViewAll },
        { key: 'fundTypes', label: 'Fund Type', all: 'All Fund Types', options: fundTypes.map(value => ({ value, label: value })) },
        { key: 'tiers', label: 'Tier', all: 'All Tiers', options: tiers.map(value => ({ value, label: value })) },
        { key: 'years', label: 'Fund Year', all: 'All Fund Years', options: availableYears.map(value => ({ value, label: value })) },
        { key: 'fundSources', label: 'Fund Source', all: 'All Fund Sources', options: sourceOptions },
    ].filter(field => !registryOnly || field.key === 'operatingUnits');
    return {
        applied, draft, fields, availableYears, key: appliedKey,
        update: (field: DashboardScopeField, value: ScopeSelection) => setDraft({ key, value: { ...draft, [field]: value } }),
        apply: () => { if (isValidDashboardScope(draft)) setSaved({ key, value: registryOnly ? { ...persistedApplied, operatingUnits: draft.operatingUnits } : draft }); },
        applyYears: (year: string) => setSaved({ key, value: { ...applied, years: normalizeSaved({ selectedYear: year }).years } }),
        reset: () => setSaved({ key, value: registryOnly ? { ...persistedApplied, operatingUnits: defaults.operatingUnits } : defaults }),
        pending: dashboardScopeKey(draft) !== appliedKey,
        isDefault: appliedKey === dashboardScopeKey(normalize(defaults)),
        validDraft: isValidDashboardScope(draft),
        loading: enabled && valid && onDataScopeChange && (load?.key !== requestKey || load.loading),
        error: !valid ? 'Select at least one value in every filter.' : load?.key === requestKey ? load.error : '',
        retry: () => setReload(value => value + 1),
    };
}

interface Choice { value: string; label: string }
export function ScopeMultiSelect({ label, allLabel, value, options, disabled, onChange }: { key?: string; label: string; allLabel: string; value: ScopeSelection; options: Choice[]; disabled?: boolean; onChange: (value: ScopeSelection) => void }) {
    const [open, setOpen] = useState(false), [search, setSearch] = useState('');
    const searchRef = useRef<HTMLInputElement>(null);
    const summary = value.mode === 'all' ? allLabel : value.values.map(key => options.find(option => option.value === key)?.label || key).join(', ') || 'Select...';
    const visible = options.filter(option => option.label.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
    return <div className="major-filter-field"><label className="form-label">{label}</label>
        <Popover open={open} onOpenChange={next => { setOpen(next); if (!next) setSearch(''); }}>
            <PopoverTrigger asChild><button type="button" className="form-control dashboard-scope-select" aria-label={label} title={summary} disabled={disabled}>
                <span>{summary}</span><ChevronDown size={16} aria-hidden="true" />
            </button></PopoverTrigger>
            <PopoverContent align="start" className="dashboard-scope-menu" onOpenAutoFocus={event => { event.preventDefault(); searchRef.current?.focus(); }}>
                <input ref={searchRef} type="search" className="form-control" aria-label={`Search ${label}`} value={search} onChange={event => setSearch(event.target.value)} />
                <div className="dashboard-scope-menu__actions"><button type="button" className="btn btn-secondary btn-sm" onClick={() => onChange(allSelection())}>Select All</button><button type="button" className="btn btn-secondary btn-sm" onClick={() => onChange(selectedValues([]))}>Clear</button></div>
                <div className="dashboard-scope-menu__options custom-scrollbar" role="group" aria-label={`${label} choices`} onKeyDown={event => {
                    const inputs = [...event.currentTarget.querySelectorAll('input')] as HTMLInputElement[];
                    const index = inputs.indexOf(document.activeElement as HTMLInputElement);
                    const next = event.key === 'ArrowDown' ? (index + 1) % inputs.length : event.key === 'ArrowUp' ? (index - 1 + inputs.length) % inputs.length : event.key === 'Home' ? 0 : event.key === 'End' ? inputs.length - 1 : null;
                    if (next !== null && inputs[next]) { event.preventDefault(); inputs[next].focus(); }
                }}>
                    {visible.map(option => <label key={option.value} title={option.label}><input type="checkbox" checked={selectionMatches(value, option.value)} onChange={event => {
                        const previous = value.mode === 'all' ? options.map(item => item.value) : value.values;
                        onChange(selectedValues(event.target.checked ? [...previous, option.value] : previous.filter(item => item !== option.value)));
                    }} /><span>{option.label}</span></label>)}
                    {!visible.length && <p>No matching options.</p>}
                </div>
            </PopoverContent>
        </Popover>
    </div>;
}

export function DashboardScopeFilterPanel({ filters }: { filters: ReturnType<typeof useDashboardScopeFilters> }) {
    return <section className="major-filter-bar dashboard-scope-filter" aria-label="Data scope filters">
        <div className="major-filter-bar__fields">{filters.fields.map(field => <ScopeMultiSelect key={field.key} label={field.label} allLabel={field.all} value={filters.draft[field.key as DashboardScopeField]} options={field.options} disabled={field.disabled} onChange={value => filters.update(field.key as DashboardScopeField, value)} />)}</div>
        <div className="major-filter-bar__actions"><button type="button" className="btn btn-secondary" onClick={filters.reset} disabled={filters.isDefault && !filters.pending}>Reset</button><button type="button" className="btn btn-primary" onClick={filters.apply} disabled={!filters.pending || !filters.validDraft}>Apply</button></div>
    </section>;
}
