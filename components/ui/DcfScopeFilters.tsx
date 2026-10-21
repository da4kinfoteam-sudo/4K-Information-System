import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { filterYears, fundTypes, operatingUnits, tiers } from '../../constants';
import { useAuth } from '../../contexts/AuthContext';
import type { DataScope } from '../../lib/scopedDataFetch';

export interface DcfScopeFilterValue {
    selectedYear: string;
    selectedOu: string;
    selectedTier: string;
    selectedFundType: string;
}

interface UseDcfScopeFiltersOptions {
    storageKey: string;
    moduleName: string;
    onDataScopeChange?: (scope: Partial<DataScope>) => void;
    initialApplied?: Partial<DcfScopeFilterValue>;
}

const sameScope = (left: DcfScopeFilterValue, right: DcfScopeFilterValue) =>
    left?.selectedYear === right.selectedYear
    && left?.selectedOu === right.selectedOu
    && left?.selectedTier === right.selectedTier
    && left?.selectedFundType === right.selectedFundType;

function useDcfPreference(key: string, initial: DcfScopeFilterValue) {
    const read = useCallback((): DcfScopeFilterValue => {
        try {
            const value = JSON.parse(localStorage.getItem(key) || 'null');
            return value && typeof value === 'object' ? value : initial;
        } catch { return initial; }
    }, [key, initial]);
    const [saved, setSaved] = useState(() => ({ key, value: read() }));
    const value = useMemo(() => saved.key === key ? saved.value : read(), [saved, key, read]);
    const setValue = useCallback((update: React.SetStateAction<DcfScopeFilterValue>) => setSaved(previous => ({
        key, value: typeof update === 'function' ? update(previous.key === key ? previous.value : read()) : update,
    })), [key, read]);
    useEffect(() => {
        if (saved.key !== key) setSaved({ key, value });
        try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Storage is optional. */ }
    }, [key, value]);
    return [value, setValue] as const;
}

export const useDcfScopeFilters = ({ storageKey, moduleName, onDataScopeChange, initialApplied }: UseDcfScopeFiltersOptions) => {
    const { currentUser, getVisibilityScope } = useAuth();
    const defaultYear = new Date().getFullYear().toString();
    const canViewAll = getVisibilityScope(moduleName) === 'All';
    const defaultOu = canViewAll ? 'All' : (operatingUnits.includes(currentUser?.operatingUnit || '') ? currentUser!.operatingUnit : '');
    const defaults = useMemo<DcfScopeFilterValue>(() => ({
        selectedYear: defaultYear,
        selectedOu: defaultOu,
        selectedTier: 'Tier 1',
        selectedFundType: 'Current'
    }), [defaultOu, defaultYear]);
    const userStorageKey = `${storageKey}_${currentUser?.id || 'anonymous'}_applied`;
    const initialValue = useMemo<DcfScopeFilterValue>(() => ({
        ...defaults,
        ...initialApplied,
        selectedOu: canViewAll ? (initialApplied?.selectedOu || defaults.selectedOu) : defaultOu
    }), [canViewAll, defaultOu, defaults, initialApplied]);
    const [storedApplied, setStoredApplied] = useDcfPreference(userStorageKey, initialValue);
    const applied = useMemo<DcfScopeFilterValue>(() => ({
        selectedYear: storedApplied?.selectedYear || defaults.selectedYear,
        selectedOu: canViewAll ? (storedApplied?.selectedOu || 'All') : defaultOu,
        selectedTier: storedApplied?.selectedTier || defaults.selectedTier,
        selectedFundType: storedApplied?.selectedFundType || defaults.selectedFundType
    }), [canViewAll, defaultOu, defaults, storedApplied]);
    const [draft, setDraft] = useState<DcfScopeFilterValue>(applied);
    const [scopeLoad, setScopeLoad] = useState<{ key: string; loading: boolean; error: string } | null>(null);
    const [retryCount, setRetryCount] = useState(0);
    const scopeKey = JSON.stringify([userStorageKey, applied, canViewAll]);

    useEffect(() => {
        setDraft(applied);
        if (!sameScope(storedApplied, applied)) setStoredApplied(applied);
    }, [applied, setStoredApplied, storedApplied]);

    useEffect(() => {
        let active = true;
        if (!onDataScopeChange) return;
        setScopeLoad({ key: scopeKey, loading: true, error: '' });
        const scope: Partial<DataScope> = {
            year: applied.selectedYear,
            operatingUnit: applied.selectedOu,
            tier: applied.selectedTier,
            fundType: applied.selectedFundType,
            years: undefined, operatingUnits: undefined, tiers: undefined, fundTypes: undefined, fundSourceValues: undefined,
            scopeOwner: storageKey,
            canViewAllOus: canViewAll,
            requestedBy: currentUser?.id ?? null
        };
        void (async () => {
            try {
                const result: unknown = await onDataScopeChange(scope);
                if (result && typeof result === 'object' && 'ok' in result && result.ok === false) throw new Error('error' in result && typeof result.error === 'string' ? result.error : 'Unable to load these records.');
                if (active) setScopeLoad({ key: scopeKey, loading: false, error: '' });
            } catch (error) {
                if (active) setScopeLoad({ key: scopeKey, loading: false, error: error instanceof Error ? error.message : 'Unable to load these records.' });
            }
        })();
        return () => { active = false; };
    }, [scopeKey, onDataScopeChange, retryCount]);

    const updateDraft = useCallback((key: keyof DcfScopeFilterValue, value: string) => {
        setDraft(previous => ({ ...previous, [key]: value }));
    }, []);
    const apply = useCallback(() => setStoredApplied({
        ...draft,
        selectedOu: canViewAll ? draft.selectedOu : defaultOu
    }), [canViewAll, defaultOu, draft, setStoredApplied]);
    const applyScope = useCallback((updates: Partial<DcfScopeFilterValue>) => {
        setStoredApplied(previous => ({
            ...previous,
            ...updates,
            selectedOu: canViewAll ? (updates.selectedOu ?? previous.selectedOu) : defaultOu
        }));
    }, [canViewAll, defaultOu, setStoredApplied]);
    const reset = useCallback(() => {
        setDraft(defaults);
        setStoredApplied(defaults);
    }, [defaults, setStoredApplied]);

    const setSelectedYear = useCallback((value: React.SetStateAction<string>) => {
        setDraft(previous => ({ ...previous, selectedYear: typeof value === 'function' ? value(previous.selectedYear) : value }));
    }, []);
    const setSelectedOu = useCallback((value: React.SetStateAction<string>) => {
        setDraft(previous => ({ ...previous, selectedOu: typeof value === 'function' ? value(previous.selectedOu) : value }));
    }, []);
    const setSelectedTier = useCallback((value: React.SetStateAction<string>) => {
        setDraft(previous => ({ ...previous, selectedTier: typeof value === 'function' ? value(previous.selectedTier) : value }));
    }, []);
    const setSelectedFundType = useCallback((value: React.SetStateAction<string>) => {
        setDraft(previous => ({ ...previous, selectedFundType: typeof value === 'function' ? value(previous.selectedFundType) : value }));
    }, []);

    return {
        canViewAll,
        selectedYear: draft.selectedYear,
        selectedOu: canViewAll ? draft.selectedOu : defaultOu,
        selectedTier: draft.selectedTier,
        selectedFundType: draft.selectedFundType,
        setSelectedYear,
        setSelectedOu,
        setSelectedTier,
        setSelectedFundType,
        updateDraft,
        apply,
        applyScope,
        reset,
        hasPendingChanges: !sameScope(draft, applied),
        isDefault: sameScope(applied, defaults),
        value: applied,
        defaults,
        isDataReady: !onDataScopeChange || (scopeLoad?.key === scopeKey && !scopeLoad.loading && !scopeLoad.error),
        scopeLoading: !!onDataScopeChange && (scopeLoad?.key !== scopeKey || scopeLoad.loading),
        scopeError: scopeLoad?.key === scopeKey ? scopeLoad.error : '',
        retryScope: () => setRetryCount(value => value + 1),
    };
};

interface DcfScopeFilterPanelProps {
    idPrefix: string;
    filters: ReturnType<typeof useDcfScopeFilters>;
    onBeforeApply?: () => boolean;
    onBeforeReset?: () => boolean;
}

/** @deprecated Scope filters are now permanently visible. */
export const DcfScopeFilterToggle: React.FC<DcfScopeFilterPanelProps> = () => null;

export const DcfScopeFilterPanel: React.FC<DcfScopeFilterPanelProps> = ({ idPrefix, filters, onBeforeApply, onBeforeReset }) => (<>
    <section id={`${idPrefix}-filter-panel`} className="major-filter-bar" aria-label="Data scope filters">
        <div className="major-filter-bar__fields">
            <div className="major-filter-field">
                <label htmlFor={`${idPrefix}-ou-filter`} className="form-label">Operating Unit</label>
                <select
                    id={`${idPrefix}-ou-filter`}
                    value={filters.selectedOu}
                    onChange={(event) => filters.setSelectedOu(event.target.value)}
                    disabled={!filters.canViewAll}
                    className="form-control"
                >
                    <option value="All">All Operating Units</option>
                    {operatingUnits.map(ou => <option key={ou} value={ou}>{ou}</option>)}
                </select>
            </div>
            <div className="major-filter-field">
                <label htmlFor={`${idPrefix}-fund-type-filter`} className="form-label">Fund Type</label>
                <select id={`${idPrefix}-fund-type-filter`} value={filters.selectedFundType} onChange={(event) => filters.setSelectedFundType(event.target.value)} className="form-control">
                    <option value="All">All Fund Types</option>
                    {fundTypes.map(fundType => <option key={fundType} value={fundType}>{fundType}</option>)}
                </select>
            </div>
            <div className="major-filter-field">
                <label htmlFor={`${idPrefix}-tier-filter`} className="form-label">Tier</label>
                <select id={`${idPrefix}-tier-filter`} value={filters.selectedTier} onChange={(event) => filters.setSelectedTier(event.target.value)} className="form-control">
                    <option value="All">All Tiers</option>
                    {tiers.map(tier => <option key={tier} value={tier}>{tier}</option>)}
                </select>
            </div>
            <div className="major-filter-field">
                <label htmlFor={`${idPrefix}-year-filter`} className="form-label">Fund Year</label>
                <select id={`${idPrefix}-year-filter`} value={filters.selectedYear} onChange={(event) => filters.setSelectedYear(event.target.value)} className="form-control">
                    <option value="All">All Fund Years</option>
                    {filterYears.map(year => <option key={year} value={year}>{year}</option>)}
                </select>
            </div>
        </div>
        <div className="major-filter-bar__actions">
            <button type="button" className="btn btn-secondary" onClick={() => {
                if (onBeforeReset && !onBeforeReset()) return;
                filters.reset();
            }} disabled={filters.isDefault && !filters.hasPendingChanges}>Reset</button>
            <button type="button" className="btn btn-primary" onClick={() => {
                if (onBeforeApply && !onBeforeApply()) return;
                filters.apply();
            }} disabled={!filters.hasPendingChanges}>Apply</button>
        </div>
    </section>
    {filters.scopeLoading && <p role="status">Loading records...</p>}
    {filters.scopeError && <div className="notice notice--warning" role="alert"><p>{filters.scopeError}</p><button className="btn btn-secondary" type="button" onClick={filters.retryScope}>Retry</button></div>}
</>);

export const matchesDcfScope = (
    item: Record<string, any>,
    filters: DcfScopeFilterValue,
    yearKey: 'fundingYear' | 'fundYear'
) => {
    if (filters.selectedYear !== 'All' && String(item?.[yearKey] ?? '') !== String(filters.selectedYear)) return false;
    if (filters.selectedOu !== 'All' && item?.operatingUnit !== filters.selectedOu) return false;
    if (filters.selectedTier !== 'All' && item?.tier !== filters.selectedTier) return false;
    if (filters.selectedFundType !== 'All' && item?.fundType !== filters.selectedFundType) return false;
    return true;
};
