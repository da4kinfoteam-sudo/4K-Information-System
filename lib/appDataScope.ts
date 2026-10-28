import { normalizeDataScope, type DataScope } from './scopedDataFetch';

export const getDataScopeModule = (owner?: string) => ({
    reports_scope: 'Reports',
    subprojects_dcf_scope: 'Subprojects',
    activities_dcf_scope: 'Activities',
    trainings_dcf_scope: 'Activities',
    other_activities_dcf_scope: 'Activities',
    program_management_dcf_scope: 'Program Management',
    physical_accomplishment_dcf_scope: 'Accomplishment - Physical',
    financial_accomplishment_dcf_scope: 'Accomplishment - Financial',
}[owner || ''] || 'Dashboards');

export function buildAuthorizedDataScope(overrides: Partial<DataScope>, actor: string | number | null, ownOu: string | undefined, moduleCanViewAll: boolean, skipMarketingPartners = false): DataScope {
    const canViewAllOus = moduleCanViewAll && overrides.canViewAllOus !== false;
    // Construct from this request only, never from the last active page's scope.
    return normalizeDataScope({
        year: overrides.year ?? new Date().getFullYear().toString(), years: overrides.years,
        operatingUnit: canViewAllOus ? overrides.operatingUnit ?? 'All' : ownOu || '',
        operatingUnits: overrides.operatingUnits,
        tier: overrides.tier ?? 'Tier 1', tiers: overrides.tiers,
        fundType: overrides.fundType ?? 'Current', fundTypes: overrides.fundTypes,
        fundSourceValues: overrides.fundSourceValues,
        scopeOwner: overrides.scopeOwner,
        registryOnly: overrides.registryOnly,
        skipMarketingPartners: overrides.skipMarketingPartners ?? skipMarketingPartners,
        canViewAllOus, requestedBy: actor,
    }, ownOu);
}
