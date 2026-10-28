import React, { useEffect, useMemo, useState } from 'react';
import { filterYears, fundTypes, operatingUnits, tiers, type RefFundSource } from '../../constants';
import { useAuth } from '../../contexts/AuthContext';
import type { ReportsPageState } from '../Reports';
import type { DataScope } from '../../lib/scopedDataFetch';
import { dashboardScopeKey, isValidDashboardScope, selectionScalar, type DashboardScopeField, type ScopeSelection } from '../../lib/dashboardScope';
import { defaultReportScope, normalizeReportScope, reportFetchScope, type ReportScope } from '../../lib/reportScope';
import { getFundSourceFilterFallbackLabel, getFundSourceFilterOptions, UNSPECIFIED_FUND_SOURCE_FILTER, type FundSourceRecord } from '../../lib/fundSources';
import { ScopeMultiSelect } from './DashboardScopeFilters';

interface Applied { scope: ReportScope; reportingYear: string; reportingYearExplicit: boolean }
interface Options {
    state: ReportsPageState;
    setState: React.Dispatch<React.SetStateAction<ReportsPageState>>;
    references: RefFundSource[];
    records: (FundSourceRecord & { fundingYear?: number; fundYear?: number })[];
    onDataScopeChange?: (scope: Partial<DataScope>, force?: boolean) => unknown;
}

export function useReportsScopeFilters({ state, setState, references, records, onDataScopeChange }: Options) {
    const { currentUser, getVisibilityScope, hasAccess } = useAuth();
    const canViewAll = currentUser?.role !== 'User' && getVisibilityScope('Reports') === 'All';
    const ownOu = canViewAll ? undefined : operatingUnits.includes(currentUser?.operatingUnit || '') ? currentUser!.operatingUnit : '';
    const owner = String(currentUser?.id || 'anonymous');
    const preferenceKey = `reports_scope_${owner}_v1`;
    const year = String(new Date().getFullYear());
    const defaults = defaultReportScope(year, ownOu);
    const normalize = (value: Partial<Applied>): Applied => ({
        scope: normalizeReportScope(value.scope, defaults, ownOu),
        reportingYear: value.reportingYear === 'All' || /^\d{4}$/.test(value.reportingYear || '') ? value.reportingYear! : year,
        reportingYearExplicit: value.reportingYearExplicit === true,
    });
    const read = (): Applied => {
        if (state.filterOwnerId === owner) return normalize({ scope: state.fundingScope, reportingYear: state.selectedReportingYear, reportingYearExplicit: state.reportingYearExplicit });
        try {
            const stored = JSON.parse(localStorage.getItem(preferenceKey) || 'null');
            if (stored && typeof stored === 'object') return normalize(stored);
        } catch { /* Preferences are optional. */ }
        if (!state.filterOwnerId) return normalize({
            scope: normalizeReportScope(state, defaults, ownOu), reportingYear: state.selectedReportingYear,
            reportingYearExplicit: state.reportingYearExplicit ?? state.selectedYear !== state.selectedReportingYear,
        });
        return normalize({ scope: defaults, reportingYear: year });
    };
    const [saved, setSaved] = useState(() => ({ key: preferenceKey, value: read() }));
    const applied = normalize(saved.key === preferenceKey ? saved.value : read());
    const appliedKey = JSON.stringify([dashboardScopeKey(applied.scope), applied.reportingYear, applied.reportingYearExplicit]);
    const [draftState, setDraft] = useState(() => ({ key: preferenceKey, value: applied }));
    const draft = normalize(draftState.key === preferenceKey ? draftState.value : applied);
    const draftKey = JSON.stringify([dashboardScopeKey(draft.scope), draft.reportingYear, draft.reportingYearExplicit]);
    const fetchScope = reportFetchScope(applied.scope, state.activeTab, canViewAll, currentUser?.id);
    const requestKey = JSON.stringify([preferenceKey, canViewAll, fetchScope]);
    const [load, setLoad] = useState<{ key: string; error: string } | null>(null);
    const [retry, setRetry] = useState(0);
    const valid = isValidDashboardScope(applied.scope);
    const enabled = !!currentUser && hasAccess('Reports', 'view') && (state.activeTab !== 'Financial Audit' || currentUser.role === 'Super Admin');

    useEffect(() => {
        setDraft({ key: preferenceKey, value: applied });
        if (saved.key !== preferenceKey) setSaved({ key: preferenceKey, value: applied });
        try { localStorage.setItem(preferenceKey, JSON.stringify(applied)); } catch { /* Storage is optional. */ }
        setState(previous => ({ ...previous, fundingScope: applied.scope, filterOwnerId: owner,
            reportingYearExplicit: applied.reportingYearExplicit, selectedReportingYear: applied.reportingYear,
            selectedYear: selectionScalar(applied.scope.years), selectedOu: selectionScalar(applied.scope.operatingUnits),
            selectedOus: applied.scope.operatingUnits.mode === 'all' ? [...operatingUnits] : applied.scope.operatingUnits.values,
            selectedTier: selectionScalar(applied.scope.tiers), selectedFundType: selectionScalar(applied.scope.fundTypes),
        }));
    }, [preferenceKey, appliedKey]);

    useEffect(() => {
        let active = true;
        setLoad(null);
        if (!enabled || !valid) return;
        void (async () => {
            try {
                const result = await onDataScopeChange?.(fetchScope, retry > 0);
                if (onDataScopeChange && (!result || typeof result !== 'object' || !('ok' in result) || result.ok !== true)) {
                    throw new Error(result && typeof result === 'object' && 'error' in result && typeof result.error === 'string' ? result.error : 'Report data is unavailable. Retry loading this scope.');
                }
                if (active) setLoad({ key: requestKey, error: '' });
            } catch (error) {
                if (active) setLoad({ key: requestKey, error: error instanceof Error ? error.message : 'Unable to load report data.' });
            }
        })();
        return () => { active = false; };
    }, [requestKey, enabled, valid, onDataScopeChange, retry]);

    const sourceOptions = useMemo(() => {
        const choices = new Map(references.map(source => [source.uid, source.is_active ? source.label : `${source.label} (inactive)`]));
        getFundSourceFilterOptions(records, references).forEach(option => { if (!choices.has(option.value)) choices.set(option.value, option.label); });
        if (draft.scope.fundSources.mode === 'values') draft.scope.fundSources.values.forEach(value => { if (!choices.has(value)) choices.set(value, getFundSourceFilterFallbackLabel(value)); });
        choices.set(UNSPECIFIED_FUND_SOURCE_FILTER, 'Not specified');
        return [...choices].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
    }, [references, records, JSON.stringify(draft.scope.fundSources)]);
    const availableYears = [...new Set([...filterYears, year, applied.reportingYear, draft.reportingYear,
        ...records.map(record => String(record.fundingYear ?? record.fundYear ?? '')),
        ...(draft.scope.years.mode === 'values' ? draft.scope.years.values : []),
    ])].filter(value => /^\d{4}$/.test(value)).sort().reverse();
    const fields = [
        { key: 'operatingUnits', label: 'Operating Unit', all: 'All Operating Units', options: (canViewAll ? operatingUnits : ownOu ? [ownOu] : []).map(value => ({ value, label: value })), disabled: !canViewAll },
        { key: 'fundTypes', label: 'Fund Type', all: 'All Fund Types', options: fundTypes.map(value => ({ value, label: value })) },
        { key: 'tiers', label: 'Tier', all: 'All Tiers', options: tiers.map(value => ({ value, label: value })) },
        { key: 'years', label: 'Fund Year', all: 'All Fund Years', options: availableYears.map(value => ({ value, label: value })) },
        { key: 'fundSources', label: 'Fund Source', all: 'All Fund Sources', options: sourceOptions },
    ];
    return {
        applied, draft, fields, availableYears, key: appliedKey,
        ready: enabled && valid && load?.key === requestKey && !load.error,
        loading: enabled && valid && load?.key !== requestKey,
        error: !valid ? 'Select at least one value in every filter.' : load?.key === requestKey ? load.error : '',
        update: (field: DashboardScopeField, value: ScopeSelection) => setDraft({ key: preferenceKey, value: { ...draft, scope: { ...draft.scope, [field]: value } } }),
        updateReportingYear: (reportingYear: string) => setDraft({ key: preferenceKey, value: { ...draft, reportingYear, reportingYearExplicit: true } }),
        apply: () => {
            if (!isValidDashboardScope(draft.scope)) return;
            const single = selectionScalar(draft.scope.years);
            setSaved({ key: preferenceKey, value: { ...draft, reportingYear: !draft.reportingYearExplicit && single !== 'All' ? single : draft.reportingYear } });
        },
        reset: () => setSaved({ key: preferenceKey, value: { scope: defaults, reportingYear: year, reportingYearExplicit: false } }),
        pending: draftKey !== appliedKey,
        isDefault: dashboardScopeKey(applied.scope) === dashboardScopeKey(defaults) && applied.reportingYear === year,
        validDraft: isValidDashboardScope(draft.scope),
        retry: () => setRetry(value => value + 1),
    };
}

export function ReportsScopeFilterPanel({ filters }: { filters: ReturnType<typeof useReportsScopeFilters> }) {
    return <section className="major-filter-bar dashboard-scope-filter reports-scope-filter print-hidden" aria-label="Report filters">
        <div className="major-filter-bar__fields">
            {filters.fields.map(field => <ScopeMultiSelect key={field.key} label={field.label} allLabel={field.all} value={filters.draft.scope[field.key as DashboardScopeField]} options={field.options} disabled={field.disabled} onChange={value => filters.update(field.key as DashboardScopeField, value)} />)}
            <div className="major-filter-field"><label className="form-label" htmlFor="reports-reporting-year">Reporting Year</label>
                <select id="reports-reporting-year" className="form-control" value={filters.draft.reportingYear} onChange={event => filters.updateReportingYear(event.target.value)}>
                    <option value="All">All Reporting Years</option>{filters.availableYears.map(year => <option key={year} value={year}>{year}</option>)}
                </select>
            </div>
        </div>
        <div className="major-filter-bar__actions">
            <button type="button" className="btn btn-secondary" onClick={filters.reset} disabled={filters.isDefault && !filters.pending}>Reset</button>
            <button type="button" className="btn btn-primary" onClick={filters.apply} disabled={!filters.pending || !filters.validDraft}>Apply</button>
        </div>
    </section>;
}
