import { supabase } from '../supabaseClient';
import { operatingUnits, ouToRegionMap } from '../constants';
import { getFundSourceFilterValue } from './fundSources';
import type { RefFundSource } from '../constants';
import {
  sampleActivities,
  sampleActivityMonitoringActions,
  sampleActivityMonitoringReports,
  sampleBudgetCeilings,
  sampleBudgetItemAdjustmentHistory,
  sampleElcacAreas,
  sampleFinancialDisbursements,
  sampleFinancialObligations,
  sampleGidaAreas,
  sampleMarketingPartners,
  sampleOfficeRequirements,
  sampleOtherProgramExpenses,
  sampleReferenceActivities,
  sampleReferenceParticularList,
  sampleReferenceUacsList,
  sampleRefCommodities,
  sampleRefEquipment,
  sampleRefInfrastructure,
  sampleRefInputs,
  sampleRefLivestock,
  sampleRefTrainings,
  sampleFundSources,
  sampleStaffingRequirements,
  sampleSubprojects,
} from '../samples';
import { sampleIPOs } from '../sampleIPOs';

export interface DataScope {
  year: string | number;
  years?: string[];
  operatingUnit: string;
  operatingUnits?: string[];
  skipMarketingPartners?: boolean;
  tier: string;
  tiers?: string[];
  fundType: string;
  fundTypes?: string[];
  fundSourceValues?: string[];
  scopeOwner?: string;
  registryOnly?: boolean;
  canViewAllOus: boolean;
  requestedBy?: string | number | null;
}

export interface ScopedAppData {
  subprojects: any[];
  ipos: any[];
  activities: any[];
  marketingPartners: any[];
  officeReqs: any[];
  staffingReqs: any[];
  otherProgramExpenses: any[];
  financialObligations: any[];
  financialDisbursements: any[];
  referenceUacsList: any[];
  referenceParticularList: any[];
  refCommodities: any[];
  refLivestock: any[];
  refEquipment: any[];
  refInputs: any[];
  refInfrastructure: any[];
  refTrainings: any[];
  fundSources: any[];
  referenceActivities: any[];
  deadlines: any[];
  budgetCeilings: any[];
  gidaAreas: any[];
  elcacAreas: any[];
  activityMonitoringReports: any[];
  activityMonitoringActions: any[];
  budgetItemAdjustmentHistory: any[];
}

const PAGE_SIZE = 1000;
const CHUNK_SIZE = 200;
type IpoReferenceSources = {
  subprojects: any[];
  activities: any[];
  activityMonitoringReports: any[];
};

const normalizeOperatingUnitList = (values?: string[]) => {
  if (!Array.isArray(values)) return undefined;
  return Array.from(new Set(values.filter(value => operatingUnits.includes(value)))).sort();
};

const normalizeScopeValues = (values?: string[]) => Array.isArray(values)
  ? [...new Set(values.filter(value => typeof value === 'string' && !!value.trim()))].sort() : undefined;

const matchesScopeValue = (value: unknown, scalar: unknown, values?: string[]) => values
  ? values.includes(String(value ?? '')) : isAll(scalar) || String(value ?? '') === String(scalar);

const getScopedOperatingUnits = (scope: DataScope): string[] | null => {
  const selected = normalizeOperatingUnitList(scope.operatingUnits);
  if (selected) return selected;
  if (!isAll(scope.operatingUnit)) return [scope.operatingUnit];
  return null;
};

export const normalizeDataScope = (scope: DataScope, fallbackOu?: string): DataScope => {
  const lockedOu = !scope.canViewAllOus;
  const candidateOu = fallbackOu || scope.operatingUnit;
  const lockedOperatingUnit = operatingUnits.includes(candidateOu) ? candidateOu : '';
  const selectedOperatingUnits = lockedOu
    ? (lockedOperatingUnit ? [lockedOperatingUnit] : [])
    : normalizeOperatingUnitList(scope.operatingUnits);
  return {
    ...scope,
    year: scope.year || new Date().getFullYear().toString(),
    operatingUnit: lockedOu ? (lockedOperatingUnit || 'All') : (scope.operatingUnit || 'All'),
    operatingUnits: selectedOperatingUnits,
    tier: scope.tier || 'Tier 1',
    fundType: scope.fundType || 'Current',
    years: normalizeScopeValues(scope.years),
    tiers: normalizeScopeValues(scope.tiers),
    fundTypes: normalizeScopeValues(scope.fundTypes),
    fundSourceValues: normalizeScopeValues(scope.fundSourceValues),
  };
};

export const getDataScopeKey = (scope: DataScope) => [
  'scope-v2',
  scope.scopeOwner || 'legacy',
  scope.registryOnly ? 'registry-only' : 'program-data',
  scope.year || 'All',
  scope.operatingUnit || 'All',
  normalizeOperatingUnitList(scope.operatingUnits)?.join(',') ?? 'legacy-ou',
  scope.tier || 'All',
  scope.fundType || 'All',
  normalizeScopeValues(scope.years)?.join(',') ?? 'scalar-year',
  normalizeScopeValues(scope.tiers)?.join(',') ?? 'scalar-tier',
  normalizeScopeValues(scope.fundTypes)?.join(',') ?? 'scalar-type',
  JSON.stringify(normalizeScopeValues(scope.fundSourceValues) ?? 'All'),
  scope.skipMarketingPartners ? 'skip-marketing' : 'with-marketing',
  scope.canViewAllOus ? 'all-ou' : 'own-ou',
  scope.requestedBy || 'anonymous',
].join('|');

const isAll = (value: unknown) => value === undefined || value === null || value === '' || value === 'All';

async function fetchQuery(query: any): Promise<any[]> {
  let allData: any[] = [];
  let from = 0;
  let more = true;

  while (more) {
    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (error) throw error;

    if (data?.length) {
      allData = allData.concat(data);
      if (data.length < PAGE_SIZE) {
        more = false;
      } else {
        from += PAGE_SIZE;
      }
    } else {
      more = false;
    }
  }

  return allData;
}

function applyCommonScope(query: any, scope: DataScope, yearColumn: 'fundingYear' | 'fundYear') {
  let next = query;
  const scopedOus = getScopedOperatingUnits(scope);
  if (scope.years) next = next.in(yearColumn, scope.years.map(Number));
  else if (!isAll(scope.year)) next = next.eq(yearColumn, Number(scope.year));
  if (scopedOus) next = next.in('operatingUnit', scopedOus);
  if (scope.tiers) next = next.in('tier', scope.tiers);
  else if (!isAll(scope.tier)) next = next.eq('tier', scope.tier);
  if (scope.fundTypes) next = next.in('fundType', scope.fundTypes);
  else if (!isAll(scope.fundType)) next = next.eq('fundType', scope.fundType);
  return next;
}

async function fetchScopedBusinessTable(tableName: string, scope: DataScope, yearColumn: 'fundingYear' | 'fundYear', references: RefFundSource[]) {
  if (!supabase) return [];
  if (scope.registryOnly) return [];
  const scopedOus = getScopedOperatingUnits(scope);
  if ((scopedOus && scopedOus.length === 0) || [scope.years, scope.tiers, scope.fundTypes, scope.fundSourceValues].some(values => values?.length === 0)) return [];
  const query = () => applyCommonScope(supabase.from(tableName).select('*').order('id', { ascending: true }), scope, yearColumn);
  if (!scope.fundSourceValues) return fetchQuery(query());
  // UID matches plus a bounded legacy branch: never discard historical null-UID labels.
  const uids = scope.fundSourceValues.filter(value => !value.startsWith('__'));
  const direct = uids.length ? await fetchQuery(query().in('fundSourceUid', uids)) : [];
  const legacy = await fetchQuery(query().or('fundSourceUid.is.null,fundSourceUid.eq.""'));
  return [...new Map([...direct, ...legacy]
    .filter(row => scope.fundSourceValues!.includes(getFundSourceFilterValue(row, references)))
    .map(row => [String(row.id), row])).values()];
}

async function fetchReferenceTable(tableName: string, orderBy = 'id') {
  if (!supabase) return [];
  return fetchQuery(supabase.from(tableName).select('*').order(orderBy, { ascending: true }));
}

/** The existing homepage-only approved NPMO schedule exception, not a global data scope. */
export async function fetchNpmoScheduleActivities(scope: DataScope, references: RefFundSource[]) {
  return fetchScopedBusinessTable('activities', { ...scope, operatingUnit: 'NPMO', operatingUnits: ['NPMO'] }, 'fundingYear', references);
}

async function fetchFundSources() {
  if (!supabase) return [];
  return fetchQuery(supabase
    .from('ref_fund_sources')
    .select('id,uid,label,is_active,sort_order,created_at,updated_at,created_by,updated_by')
    .order('sort_order', { ascending: true })
    .order('uid', { ascending: true }));
}

async function fetchBudgetCeilings(scope: DataScope) {
  if (!supabase) return [];
  const scopedOus = getScopedOperatingUnits(scope);
  if (scopedOus && scopedOus.length === 0) return [];
  let query = supabase.from('budget_ceilings').select('*');
  if (scope.years) query = query.in('year', scope.years.map(Number));
  else if (!isAll(scope.year)) query = query.eq('year', Number(scope.year));
  if (scopedOus) query = query.in('operating_unit', scopedOus);
  return fetchQuery(query);
}

async function fetchScopedIpos(scope: DataScope) {
  if (!supabase) return [];
  const scopedOus = getScopedOperatingUnits(scope);
  if (scopedOus && scopedOus.length === 0) return [];
  let query = supabase.from('ipos').select('*').order('id', { ascending: true });
  if (scopedOus) {
    const targetRegions = Array.from(new Set(scopedOus.map(ou => ouToRegionMap[ou]).filter(Boolean)));
    if (targetRegions.length === 0) return [];
    query = query.in('region', targetRegions);
  }
  return fetchQuery(query);
}

function uniqueStrings(values: unknown[]) {
  return Array.from(new Set(
    values
      .flatMap(value => Array.isArray(value) ? value : [value])
      .map(value => String(value || '').trim())
      .filter(Boolean)
  ));
}

async function fetchRowsByValues(tableName: string, columnName: string, values: Array<number | string>) {
  if (!supabase || values.length === 0) return [];
  const chunks: Array<Array<number | string>> = [];
  for (let index = 0; index < values.length; index += CHUNK_SIZE) {
    chunks.push(values.slice(index, index + CHUNK_SIZE));
  }

  const results = await Promise.all(chunks.map(chunk => fetchQuery(
    supabase
      .from(tableName)
      .select('*')
      .in(columnName, chunk)
      .order('id', { ascending: true })
  )));

  return results.flat();
}

function collectIpoReferences({ subprojects, activities, activityMonitoringReports }: IpoReferenceSources) {
  const ids = uniqueNumbers([
    ...subprojects.map(item => item.ipo_id),
    ...activities.flatMap(item => item.participating_ipo_ids || []),
    ...activityMonitoringReports.map(report => report.ipo_id),
  ]);
  const names = uniqueStrings([
    ...subprojects.map(item => item.indigenousPeopleOrganization),
    ...activities.flatMap(item => item.participatingIpos || []),
  ]);
  return { ids, names };
}

function mergeIpos(baseIpos: any[], extraIpos: any[]) {
  const byId = new Map<number, any>();
  const byName = new Map<string, any>();
  const merged: any[] = [];

  [...baseIpos, ...extraIpos].forEach(ipo => {
    const id = Number(ipo?.id);
    const name = String(ipo?.name || '').trim();
    if (Number.isFinite(id) && byId.has(id)) return;
    if (!Number.isFinite(id) && name && byName.has(name)) return;

    merged.push(ipo);
    if (Number.isFinite(id)) byId.set(id, ipo);
    if (name) byName.set(name, ipo);
  });

  return merged.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}

async function enrichScopedIpos(baseIpos: any[], sources: IpoReferenceSources) {
  const { ids, names } = collectIpoReferences(sources);
  const existingIds = new Set(baseIpos.map(ipo => Number(ipo.id)).filter(Number.isFinite));
  const existingNames = new Set(baseIpos.map(ipo => String(ipo.name || '').trim()).filter(Boolean));
  const missingIds = ids.filter(id => !existingIds.has(id));
  const missingNames = names.filter(name => !existingNames.has(name));

  const [iposById, iposByName] = await Promise.all([
    fetchRowsByValues('ipos', 'id', missingIds),
    fetchRowsByValues('ipos', 'name', missingNames),
  ]);

  return mergeIpos(baseIpos, [...iposById, ...iposByName]);
}

async function fetchScopedMarketingPartners(scope: DataScope) {
  if (scope.skipMarketingPartners) return [];
  if (!supabase) return [];
  const scopedOus = getScopedOperatingUnits(scope);
  if (scopedOus && scopedOus.length === 0) return [];
  let query = supabase.from('marketing_partners').select('*').order('id', { ascending: true });
  if (scopedOus) {
    const targetRegions = Array.from(new Set(scopedOus.map(ou => ouToRegionMap[ou]).filter(Boolean)));
    if (targetRegions.length === 0) return [];
    query = query.in('region', targetRegions);
  }
  return fetchQuery(query);
}

/**
 * Marketing Database is intentionally global for users who can view the module.
 * Keep this loader separate from the DCF/dashboard scope so an OU or fund-year
 * filter cannot hide a partner from the shared partner directory.
 */
export async function fetchMarketingDatabasePartners(): Promise<any[]> {
  if (!supabase) return sampleMarketingPartners;

  const query = supabase
    .from('marketing_partners')
    .select('id,uid,companyName,ownerName,contactNumber,email,location,region,commodityNeeds,buyerType,paymentMethods,linkedIpoNames,remarks,encodedBy,history,marketingLinkages,workflow_status,created_at,updated_at')
    .order('id', { ascending: true });

  return fetchQuery(query);
}

function uniqueNumbers(values: unknown[]) {
  return Array.from(new Set(values.map(Number).filter(Number.isFinite)));
}

async function fetchFinancialRows(tableName: 'financial_obligations' | 'financial_disbursements', entityType: string, parentIds: number[]) {
  if (!supabase || parentIds.length === 0) return [];
  const chunks: number[][] = [];
  for (let index = 0; index < parentIds.length; index += CHUNK_SIZE) {
    chunks.push(parentIds.slice(index, index + CHUNK_SIZE));
  }

  const results = await Promise.all(chunks.map(chunk => fetchQuery(
    supabase
      .from(tableName)
      .select('*')
      .eq('entity_type', entityType)
      .in('parent_id', chunk)
      .order('id', { ascending: true })
  )));

  return results.flat();
}

async function fetchRowsByIds(tableName: string, columnName: string, ids: number[], extraQuery?: (query: any) => any) {
  if (!supabase || ids.length === 0) return [];
  const chunks: number[][] = [];
  for (let index = 0; index < ids.length; index += CHUNK_SIZE) {
    chunks.push(ids.slice(index, index + CHUNK_SIZE));
  }

  const results = await Promise.all(chunks.map(chunk => {
    let query = supabase
      .from(tableName)
      .select('*')
      .in(columnName, chunk)
      .order('id', { ascending: true });
    if (extraQuery) query = extraQuery(query);
    return fetchQuery(query);
  }));

  return results.flat();
}

async function fetchScopedFinancialRows(
  subprojects: any[],
  activities: any[],
  officeReqs: any[],
  staffingReqs: any[],
  otherProgramExpenses: any[]
) {
  const groups = [
    { entityType: 'subproject_detail', ids: uniqueNumbers(subprojects.map(item => item.id)) },
    { entityType: 'activity_expense', ids: uniqueNumbers(activities.map(item => item.id)) },
    { entityType: 'office_requirement', ids: uniqueNumbers(officeReqs.map(item => item.id)) },
    { entityType: 'staffing_expense', ids: uniqueNumbers(staffingReqs.map(item => item.id)) },
    { entityType: 'other_program_expense', ids: uniqueNumbers(otherProgramExpenses.map(item => item.id)) },
  ];

  const [obligationGroups, disbursementGroups] = await Promise.all([
    Promise.all(groups.map(group => fetchFinancialRows('financial_obligations', group.entityType, group.ids))),
    Promise.all(groups.map(group => fetchFinancialRows('financial_disbursements', group.entityType, group.ids))),
  ]);

  return {
    financialObligations: obligationGroups.flat(),
    financialDisbursements: disbursementGroups.flat(),
  };
}

async function fetchScopedMonitoringRows(activities: any[]) {
  const activityIds = uniqueNumbers(activities.map(item => item.id));
  const activityMonitoringReports = await fetchRowsByIds(
    'activity_monitoring_reports',
    'activity_id',
    activityIds,
    query => query.is('deleted_at', null)
  );
  const reportIds = uniqueNumbers(activityMonitoringReports.map(item => item.id));
  const activityMonitoringActions = await fetchRowsByIds(
    'activity_monitoring_actions',
    'monitoring_report_id',
    reportIds,
    query => query.is('deleted_at', null)
  );

  return {
    activityMonitoringReports,
    activityMonitoringActions,
  };
}

async function fetchBudgetItemAdjustmentHistory(subprojects: any[], activities: any[], staffingReqs: any[]) {
  if (!supabase) return [];
  const groups = [
    { sourceType: 'subproject_detail', ids: uniqueNumbers(subprojects.map(item => item.id)) },
    { sourceType: 'activity_expense', ids: uniqueNumbers(activities.map(item => item.id)) },
    { sourceType: 'staffing_expense', ids: uniqueNumbers(staffingReqs.map(item => item.id)) },
  ];

  try {
    const results = await Promise.all(groups.map(group =>
      fetchRowsByIds(
        'budget_item_adjustment_history',
        'parent_id',
        group.ids,
        query => query.eq('source_type', group.sourceType)
      )
    ));
    return results.flat();
  } catch (error) {
    console.warn('Unable to fetch budget item adjustment history', error);
    return [];
  }
}

function applyLocalCommonScope<T extends Record<string, any>>(
  rows: T[],
  scope: DataScope,
  yearColumn: 'fundingYear' | 'fundYear'
) {
  return rows.filter(row => {
    const scopedOus = getScopedOperatingUnits(scope);
    if (!matchesScopeValue(row[yearColumn], scope.year, scope.years)) return false;
    if (scopedOus && !scopedOus.includes(row.operatingUnit)) return false;
    if (!matchesScopeValue(row.tier, scope.tier, scope.tiers)) return false;
    if (!matchesScopeValue(row.fundType, scope.fundType, scope.fundTypes)) return false;
    if (scope.fundSourceValues && !scope.fundSourceValues.includes(getFundSourceFilterValue(row, sampleFundSources))) return false;
    return true;
  });
}

function applyLocalIpoScope(scope: DataScope) {
  const scopedOus = getScopedOperatingUnits(scope);
  if (!scopedOus) return sampleIPOs;
  if (scopedOus.length === 0) return [];
  const targetRegions = new Set(scopedOus.map(ou => ouToRegionMap[ou]).filter(Boolean));
  if (targetRegions.size === 0) return [];
  return sampleIPOs.filter(ipo => targetRegions.has(ipo.region));
}

function enrichLocalIpos(baseIpos: any[], sources: IpoReferenceSources) {
  const { ids, names } = collectIpoReferences(sources);
  const referencedIds = new Set(ids);
  const referencedNames = new Set(names);
  const extraIpos = sampleIPOs.filter(ipo =>
    referencedIds.has(Number(ipo.id)) ||
    referencedNames.has(String(ipo.name || '').trim())
  );
  return mergeIpos(baseIpos, extraIpos);
}

function filterLocalBudgetCeilings(scope: DataScope) {
  return sampleBudgetCeilings.filter(row => {
    const scopedOus = getScopedOperatingUnits(scope);
    if (!matchesScopeValue(row.year, scope.year, scope.years)) return false;
    if (scopedOus && !scopedOus.includes(row.operating_unit)) return false;
    return true;
  });
}

function filterLocalFinancialRows(rows: any[], sourceRows: {
  subprojects: any[];
  activities: any[];
  officeReqs: any[];
  staffingReqs: any[];
  otherProgramExpenses: any[];
}) {
  const scopedParents = new Map<string, Set<number>>();
  [
    ['subproject_detail', sourceRows.subprojects],
    ['activity_expense', sourceRows.activities],
    ['office_requirement', sourceRows.officeReqs],
    ['staffing_expense', sourceRows.staffingReqs],
    ['other_program_expense', sourceRows.otherProgramExpenses],
  ].forEach(([entityType, parents]) => {
    scopedParents.set(String(entityType), new Set((parents as any[]).map(parent => Number(parent.id))));
  });

  return rows.filter(row => scopedParents.get(row.entity_type)?.has(Number(row.parent_id)));
}

function filterLocalMonitoringRows(activities: any[]) {
  const activityIds = new Set(activities.map(item => Number(item.id)));
  const activityMonitoringReports = sampleActivityMonitoringReports.filter(report => activityIds.has(Number(report.activity_id)));
  const reportIds = new Set(activityMonitoringReports.map(report => Number(report.id)));
  const activityMonitoringActions = sampleActivityMonitoringActions.filter(action => reportIds.has(Number(action.monitoring_report_id)));

  return {
    activityMonitoringReports,
    activityMonitoringActions,
  };
}

function filterLocalAdjustmentHistory(subprojects: any[], activities: any[], staffingReqs: any[]) {
  const scopedParents = new Map<string, Set<number>>([
    ['subproject_detail', new Set(subprojects.map(item => Number(item.id)))],
    ['activity_expense', new Set(activities.map(item => Number(item.id)))],
    ['staffing_expense', new Set(staffingReqs.map(item => Number(item.id)))],
  ]);

  return sampleBudgetItemAdjustmentHistory.filter(row => scopedParents.get(row.source_type)?.has(Number(row.parent_id)));
}

function loadLocalSeedScopedData(scope: DataScope): ScopedAppData {
  const normalizedScope = normalizeDataScope(scope);
  const subprojects = normalizedScope.registryOnly ? [] : applyLocalCommonScope(sampleSubprojects, normalizedScope, 'fundingYear');
  const baseIpos = applyLocalIpoScope(normalizedScope);
  const activities = normalizedScope.registryOnly ? [] : applyLocalCommonScope(sampleActivities, normalizedScope, 'fundingYear');
  const marketingPartners = scope.skipMarketingPartners ? [] : sampleMarketingPartners;
  const officeReqs = normalizedScope.registryOnly ? [] : applyLocalCommonScope(sampleOfficeRequirements, normalizedScope, 'fundYear');
  const staffingReqs = normalizedScope.registryOnly ? [] : applyLocalCommonScope(sampleStaffingRequirements, normalizedScope, 'fundYear');
  const otherProgramExpenses = normalizedScope.registryOnly ? [] : applyLocalCommonScope(sampleOtherProgramExpenses, normalizedScope, 'fundYear');
  const financialSourceRows = {
    subprojects,
    activities,
    officeReqs,
    staffingReqs,
    otherProgramExpenses,
  };
  const { activityMonitoringReports, activityMonitoringActions } = filterLocalMonitoringRows(activities);
  const ipos = enrichLocalIpos(baseIpos, { subprojects, activities, activityMonitoringReports });

  return {
    subprojects,
    ipos,
    activities,
    marketingPartners,
    officeReqs,
    staffingReqs,
    otherProgramExpenses,
    financialObligations: filterLocalFinancialRows(sampleFinancialObligations, financialSourceRows),
    financialDisbursements: filterLocalFinancialRows(sampleFinancialDisbursements, financialSourceRows),
    referenceUacsList: sampleReferenceUacsList,
    referenceParticularList: sampleReferenceParticularList,
    refCommodities: sampleRefCommodities,
    refLivestock: sampleRefLivestock,
    refEquipment: sampleRefEquipment,
    refInputs: sampleRefInputs,
    refInfrastructure: sampleRefInfrastructure,
    refTrainings: sampleRefTrainings,
    fundSources: sampleFundSources,
    referenceActivities: sampleReferenceActivities,
    deadlines: [],
    budgetCeilings: filterLocalBudgetCeilings(normalizedScope),
    gidaAreas: sampleGidaAreas,
    elcacAreas: sampleElcacAreas,
    activityMonitoringReports,
    activityMonitoringActions,
    budgetItemAdjustmentHistory: filterLocalAdjustmentHistory(subprojects, activities, staffingReqs),
  };
}

export async function loadScopedAppData(scope: DataScope): Promise<ScopedAppData> {
  const normalizedScope = normalizeDataScope(scope);
  if (!supabase) {
    return loadLocalSeedScopedData(normalizedScope);
  }

  const fundSourcesPromise = fetchFundSources();
  const fetchBusiness = (table: string, yearColumn: 'fundingYear' | 'fundYear') => normalizedScope.fundSourceValues
    ? fundSourcesPromise.then(references => fetchScopedBusinessTable(table, normalizedScope, yearColumn, references))
    : fetchScopedBusinessTable(table, normalizedScope, yearColumn, []);

  const [
    subprojects,
    baseIpos,
    activities,
    marketingPartners,
    officeReqs,
    staffingReqs,
    otherProgramExpenses,
    referenceUacsList,
    referenceParticularList,
    refCommodities,
    refLivestock,
    refEquipment,
    refInputs,
    refInfrastructure,
    refTrainings,
    fundSources,
    referenceActivities,
    deadlines,
    budgetCeilings,
    gidaAreas,
    elcacAreas,
  ] = await Promise.all([
    fetchBusiness('subprojects', 'fundingYear'),
    fetchScopedIpos(normalizedScope),
    fetchBusiness('activities', 'fundingYear'),
    normalizedScope.skipMarketingPartners ? Promise.resolve([]) : fetchScopedMarketingPartners(normalizedScope),
    fetchBusiness('office_requirements', 'fundYear'),
    fetchBusiness('staffing_requirements', 'fundYear'),
    fetchBusiness('other_program_expenses', 'fundYear'),
    fetchReferenceTable('reference_uacs'),
    fetchReferenceTable('reference_particulars'),
    fetchReferenceTable('ref_commodities'),
    fetchReferenceTable('ref_livestock'),
    fetchReferenceTable('ref_equipment'),
    fetchReferenceTable('ref_inputs'),
    fetchReferenceTable('ref_infrastructure'),
    fetchReferenceTable('ref_trainings'),
    fundSourcesPromise,
    fetchReferenceTable('reference_activities'),
    fetchReferenceTable('deadlines', 'date'),
    fetchBudgetCeilings(normalizedScope),
    fetchReferenceTable('gida_areas'),
    fetchReferenceTable('elcac_areas'),
  ]);

  const [
    { financialObligations, financialDisbursements },
    { activityMonitoringReports, activityMonitoringActions },
    budgetItemAdjustmentHistory,
  ] = await Promise.all([
    fetchScopedFinancialRows(
      subprojects,
      activities,
      officeReqs,
      staffingReqs,
      otherProgramExpenses
    ),
    fetchScopedMonitoringRows(activities),
    fetchBudgetItemAdjustmentHistory(subprojects, activities, staffingReqs),
  ]);
  const ipos = await enrichScopedIpos(baseIpos, { subprojects, activities, activityMonitoringReports });

  return {
    subprojects,
    ipos,
    activities,
    marketingPartners,
    officeReqs,
    staffingReqs,
    otherProgramExpenses,
    financialObligations,
    financialDisbursements,
    referenceUacsList,
    referenceParticularList,
    refCommodities,
    refLivestock,
    refEquipment,
    refInputs,
    refInfrastructure,
    refTrainings,
    fundSources,
    referenceActivities,
    deadlines,
    budgetCeilings,
    gidaAreas,
    elcacAreas,
    activityMonitoringReports,
    activityMonitoringActions,
    budgetItemAdjustmentHistory,
  };
}
