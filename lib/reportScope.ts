import { operatingUnits, ouToRegionMap, tiers, fundTypes, type RefFundSource, type IPO } from '../constants';
import { allSelection, selectedValues, selectionScalar, dashboardDataScope, normalizeDashboardScope, matchesDashboardScope, dashboardScopeLabels, type DashboardScope } from './dashboardScope';
import type { FinancialAggregationInput } from './financialAggregation';
import { buildFinancialAudit, type FinancialAuditBudgetCeiling, type FinancialAuditResult } from './financialAudit';

export type ReportScope = DashboardScope;
export interface ReportData extends Omit<FinancialAggregationInput, 'activities'> {
    trainings: FinancialAggregationInput['activities'];
    otherActivities: FinancialAggregationInput['activities'];
    ipos: IPO[];
}

export const defaultReportScope = (year: string, ownOu?: string): ReportScope => ({
    years: selectedValues([year]), operatingUnits: ownOu === undefined ? allSelection() : selectedValues(ownOu ? [ownOu] : []),
    tiers: selectedValues(['Tier 1']), fundTypes: selectedValues(['Current']), fundSources: allSelection(),
});

export function normalizeReportScope(value: unknown, defaults: ReportScope, ownOu?: string): ReportScope {
    const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    const legacyOus = Array.isArray(raw.selectedOus) ? selectedValues(raw.selectedOus.filter((ou): ou is string => typeof ou === 'string' && operatingUnits.includes(ou))) : null;
    const legacy = !raw.operatingUnits && Array.isArray(raw.selectedOus)
        ? { ...raw, operatingUnits: legacyOus?.mode === 'values' && legacyOus.values.length === operatingUnits.length ? allSelection() : legacyOus } : raw;
    const scope = normalizeDashboardScope(legacy, defaults, { operatingUnits, tiers, fundTypes }, ownOu);
    if (scope.years.mode === 'values') scope.years = selectedValues(scope.years.values.filter(year => /^\d{4}$/.test(year)));
    return scope;
}

export const reportUsesHistory = (tab: string) => tab === 'Monthly Matrix' || tab === 'Financial Audit';
export const reportHistoryScope = (scope: ReportScope): ReportScope => ({ ...scope, years: allSelection(), fundTypes: allSelection() });
export const reportFetchScope = (scope: ReportScope, tab: string, canViewAll: boolean, userId?: string | number) =>
    dashboardDataScope(reportUsesHistory(tab) ? reportHistoryScope(scope) : scope, 'reports_scope', canViewAll, userId);

/** Scope parents once, then preserve all their independently dated installments/actuals. */
export function filterReportData(data: ReportData, scope: ReportScope, references: RefFundSource[]): ReportData {
    const match = (row: Parameters<typeof matchesDashboardScope>[0] & { workflow_status?: string }) =>
        (!row.workflow_status || row.workflow_status === 'APPROVED') && matchesDashboardScope(row, scope, references);
    const matchProgram: typeof match = row => match({ ...row, fundingYear: row.fundYear });
    const unique = <T extends { id: number }>(rows: T[]) => [...new Map(rows.map(row => [row.id, row])).values()];
    const regions = scope.operatingUnits.mode === 'all' ? null : new Set(scope.operatingUnits.values.map(ou => ouToRegionMap[ou]).filter(Boolean));
    return {
        subprojects: unique(data.subprojects.filter(match)).map(row => ({ ...row, details: (row.details || []).filter(Boolean) })),
        trainings: unique(data.trainings.filter(match)).map(row => ({ ...row, expenses: (row.expenses || []).filter(Boolean) })),
        otherActivities: unique(data.otherActivities.filter(match)).map(row => ({ ...row, expenses: (row.expenses || []).filter(Boolean) })),
        officeReqs: unique(data.officeReqs.filter(matchProgram)),
        staffingReqs: unique(data.staffingReqs.filter(matchProgram)).map(row => ({ ...row, expenses: (row.expenses || []).filter(Boolean) })),
        otherProgramExpenses: unique(data.otherProgramExpenses.filter(matchProgram)),
        ipos: unique(data.ipos.filter(row => (!row.workflow_status || row.workflow_status === 'APPROVED') && (!regions || regions.has(row.region)))),
    };
}

export function reportScopeSummary(scope: ReportScope, reportingYear: string, references: RefFundSource[], records: Parameters<typeof dashboardScopeLabels>[2] = []) {
    const labels = dashboardScopeLabels(scope, references, records);
    return [labels.operatingUnits, `FY ${labels.years}`, `RY ${reportingYear}`, labels.tiers, labels.fundTypes, labels.fundSources].join(' / ');
}

export function reportOutputName(name: string) {
    return name.replace(/ \(FY [^)]*\)$/, '');
}

/** Existing scalar engines receive only the already-selected union, not the original dataset. */
export const reportCalculationScope = (scope: ReportScope) => ({
    year: selectionScalar(scope.years), operatingUnit: selectionScalar(scope.operatingUnits),
    tier: selectionScalar(scope.tiers), fundType: selectionScalar(scope.fundTypes),
});

export function buildReportFinancialAudit(data: FinancialAggregationInput, scope: ReportScope, options: { auditAsOfMonth: number; budgetCeilings: FinancialAuditBudgetCeiling[] }): FinancialAuditResult {
    const filters = reportCalculationScope(scope);
    if (scope.years.mode === 'all' || scope.years.values.length === 1) return buildFinancialAudit(data, filters, options);
    // Annual checks use each selected record's FY; aggregate and round once as before.
    return buildFinancialAudit(data, filters, { ...options, annualChecksByRecordYear: true });
}
