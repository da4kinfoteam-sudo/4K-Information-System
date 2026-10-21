import type { RefFundSource } from '../constants';
import type { DataScope } from './scopedDataFetch';
import { getFundSourceFilterOptions, getFundSourceFilterValue, getFundSourceFilterFallbackLabel, UNSPECIFIED_FUND_SOURCE_FILTER, type FundSourceRecord } from './fundSources';

export type ScopeSelection = { mode: 'all' } | { mode: 'values'; values: string[] };
export type DashboardScopeField = 'years' | 'operatingUnits' | 'tiers' | 'fundTypes' | 'fundSources';
export type DashboardScope = Record<DashboardScopeField, ScopeSelection>;
export type DashboardScopeLabels = Record<DashboardScopeField, string>;
export const allSelection = (): ScopeSelection => ({ mode: 'all' });
export const selectedValues = (values: string[]): ScopeSelection => ({ mode: 'values', values: [...new Set(values)].sort() });
export const selectionValues = (selection: ScopeSelection): string[] | undefined => selection.mode === 'all' ? undefined : selection.values;
export const selectionScalar = (selection: ScopeSelection) => selection.mode === 'values' && selection.values.length === 1 ? selection.values[0] : 'All';
export const selectionMatches = (selection: ScopeSelection, value: unknown) => selection.mode === 'all' || selection.values.includes(String(value ?? ''));
export const selectionLabel = (selection: ScopeSelection, allLabel: string) => selection.mode === 'all' ? allLabel : selection.values.join(', ');
export const isValidDashboardScope = (scope: DashboardScope) => Object.values(scope).every(value => value.mode === 'all' || value.values.length > 0);

export function normalizeSelection(value: unknown, fallback: ScopeSelection, allowed?: readonly string[]): ScopeSelection {
    if (value === 'All' || (value && typeof value === 'object' && 'mode' in value && value.mode === 'all')) return allSelection();
    const raw = typeof value === 'string' ? [value] : value && typeof value === 'object' && 'mode' in value && value.mode === 'values' && 'values' in value && Array.isArray(value.values) ? value.values : null;
    if (!raw) return fallback;
    return selectedValues(raw.filter((item): item is string => typeof item === 'string' && !!item.trim() && (!allowed || allowed.includes(item))));
}

export function normalizeDashboardScope(value: unknown, defaults: DashboardScope, options: Partial<Record<DashboardScopeField, readonly string[]>>, ownOu?: string): DashboardScope {
    const saved = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    const legacy = { years: 'selectedYear', operatingUnits: 'selectedOu', tiers: 'selectedTier', fundTypes: 'selectedFundType', fundSources: 'selectedFundSource' };
    const normalized = Object.fromEntries((Object.keys(defaults) as DashboardScopeField[]).map(key => [key, normalizeSelection(saved[key] ?? saved[legacy[key]], defaults[key], options[key])])) as DashboardScope;
    if (ownOu !== undefined) normalized.operatingUnits = selectedValues(ownOu ? [ownOu] : []);
    return normalized;
}

export const dashboardScopeKey = (scope: DashboardScope) => JSON.stringify(Object.fromEntries(
    (Object.keys(scope) as DashboardScopeField[]).sort().map(key => [key, scope[key].mode === 'all' ? 'All' : selectionValues(scope[key])?.slice().sort()])
));

export function dashboardDataScope(scope: DashboardScope, owner: string, canViewAllOus: boolean, requestedBy?: string | number | null): Partial<DataScope> {
    return {
        year: selectionScalar(scope.years), years: selectionValues(scope.years),
        operatingUnit: selectionScalar(scope.operatingUnits), operatingUnits: selectionValues(scope.operatingUnits),
        tier: selectionScalar(scope.tiers), tiers: selectionValues(scope.tiers),
        fundType: selectionScalar(scope.fundTypes), fundTypes: selectionValues(scope.fundTypes),
        fundSourceValues: selectionValues(scope.fundSources), scopeOwner: owner, canViewAllOus, requestedBy,
    };
}

export function matchesDashboardScope(record: FundSourceRecord & { fundingYear?: number; fundYear?: number; operatingUnit?: string; tier?: string; fundType?: string }, scope: DashboardScope, references: RefFundSource[]) {
    return selectionMatches(scope.years, record.fundingYear ?? record.fundYear)
        && selectionMatches(scope.operatingUnits, record.operatingUnit)
        && selectionMatches(scope.tiers, record.tier)
        && selectionMatches(scope.fundTypes, record.fundType)
        && selectionMatches(scope.fundSources, getFundSourceFilterValue(record, references));
}

export function annualScope(scope: DashboardScope, year: string): DashboardScope {
    return { ...scope, years: selectedValues([year]) };
}

export function dashboardScopeLabels(scope: DashboardScope, references: RefFundSource[], records: FundSourceRecord[] = []): DashboardScopeLabels {
    const sources = new Map([...references.map(source => [source.uid, source.label] as const), ...getFundSourceFilterOptions(records, references).map(option => [option.value, option.label] as const)]);
    sources.set(UNSPECIFIED_FUND_SOURCE_FILTER, 'Not specified');
    return {
        years: selectionLabel(scope.years, 'All Fund Years'), operatingUnits: selectionLabel(scope.operatingUnits, 'All OUs'),
        tiers: selectionLabel(scope.tiers, 'All Tiers'), fundTypes: selectionLabel(scope.fundTypes, 'All Fund Types'),
        fundSources: scope.fundSources.mode === 'all' ? 'All Fund Sources' : scope.fundSources.values.map(value => sources.get(value) || getFundSourceFilterFallbackLabel(value)).join(', '),
    };
}
