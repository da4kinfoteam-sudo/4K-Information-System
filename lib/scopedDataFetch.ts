import { supabase } from '../supabaseClient';
import { ouToRegionMap } from '../constants';

export interface DataScope {
  year: string | number;
  operatingUnit: string;
  tier: string;
  fundType: string;
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
  referenceActivities: any[];
  deadlines: any[];
  budgetCeilings: any[];
  gidaAreas: any[];
  elcacAreas: any[];
  activityMonitoringReports: any[];
  activityMonitoringActions: any[];
}

const PAGE_SIZE = 1000;
const CHUNK_SIZE = 200;

export const normalizeDataScope = (scope: DataScope, fallbackOu?: string): DataScope => {
  const lockedOu = !scope.canViewAllOus;
  return {
    ...scope,
    year: scope.year || new Date().getFullYear().toString(),
    operatingUnit: lockedOu ? (fallbackOu || scope.operatingUnit) : (scope.operatingUnit || 'All'),
    tier: scope.tier || 'Tier 1',
    fundType: scope.fundType || 'Current',
  };
};

export const getDataScopeKey = (scope: DataScope) => [
  scope.year || 'All',
  scope.operatingUnit || 'All',
  scope.tier || 'All',
  scope.fundType || 'All',
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
  if (!isAll(scope.year)) next = next.eq(yearColumn, Number(scope.year));
  if (!isAll(scope.operatingUnit)) next = next.eq('operatingUnit', scope.operatingUnit);
  if (!isAll(scope.tier)) next = next.eq('tier', scope.tier);
  if (!isAll(scope.fundType)) next = next.eq('fundType', scope.fundType);
  return next;
}

async function fetchScopedBusinessTable(tableName: string, scope: DataScope, yearColumn: 'fundingYear' | 'fundYear') {
  if (!supabase) return [];
  return fetchQuery(applyCommonScope(
    supabase.from(tableName).select('*').order('id', { ascending: true }),
    scope,
    yearColumn
  ));
}

async function fetchReferenceTable(tableName: string, orderBy = 'id') {
  if (!supabase) return [];
  return fetchQuery(supabase.from(tableName).select('*').order(orderBy, { ascending: true }));
}

async function fetchBudgetCeilings(scope: DataScope) {
  if (!supabase) return [];
  let query = supabase.from('budget_ceilings').select('*');
  if (!isAll(scope.year)) query = query.eq('year', Number(scope.year));
  if (!isAll(scope.operatingUnit)) query = query.eq('operating_unit', scope.operatingUnit);
  return fetchQuery(query);
}

async function fetchScopedIpos(scope: DataScope) {
  if (!supabase) return [];
  let query = supabase.from('ipos').select('*').order('id', { ascending: true });
  if (!isAll(scope.operatingUnit)) {
    const targetRegion = ouToRegionMap[scope.operatingUnit];
    if (targetRegion) query = query.eq('region', targetRegion);
  }
  return fetchQuery(query);
}

async function fetchScopedMarketingPartners(scope: DataScope) {
  if (!supabase) return [];
  let query = supabase.from('marketing_partners').select('*').order('id', { ascending: true });
  if (!isAll(scope.operatingUnit)) {
    const targetRegion = ouToRegionMap[scope.operatingUnit];
    if (targetRegion) query = query.eq('region', targetRegion);
  }
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

export async function loadScopedAppData(scope: DataScope): Promise<ScopedAppData> {
  const normalizedScope = normalizeDataScope(scope);

  const [
    subprojects,
    ipos,
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
    referenceActivities,
    deadlines,
    budgetCeilings,
    gidaAreas,
    elcacAreas,
  ] = await Promise.all([
    fetchScopedBusinessTable('subprojects', normalizedScope, 'fundingYear'),
    fetchScopedIpos(normalizedScope),
    fetchScopedBusinessTable('activities', normalizedScope, 'fundingYear'),
    fetchScopedMarketingPartners(normalizedScope),
    fetchScopedBusinessTable('office_requirements', normalizedScope, 'fundYear'),
    fetchScopedBusinessTable('staffing_requirements', normalizedScope, 'fundYear'),
    fetchScopedBusinessTable('other_program_expenses', normalizedScope, 'fundYear'),
    fetchReferenceTable('reference_uacs'),
    fetchReferenceTable('reference_particulars'),
    fetchReferenceTable('ref_commodities'),
    fetchReferenceTable('ref_livestock'),
    fetchReferenceTable('ref_equipment'),
    fetchReferenceTable('ref_inputs'),
    fetchReferenceTable('ref_infrastructure'),
    fetchReferenceTable('ref_trainings'),
    fetchReferenceTable('reference_activities'),
    fetchReferenceTable('deadlines', 'date'),
    fetchBudgetCeilings(normalizedScope),
    fetchReferenceTable('gida_areas'),
    fetchReferenceTable('elcac_areas'),
  ]);

  const [
    { financialObligations, financialDisbursements },
    { activityMonitoringReports, activityMonitoringActions },
  ] = await Promise.all([
    fetchScopedFinancialRows(
      subprojects,
      activities,
      officeReqs,
      staffingReqs,
      otherProgramExpenses
    ),
    fetchScopedMonitoringRows(activities),
  ]);

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
    referenceActivities,
    deadlines,
    budgetCeilings,
    gidaAreas,
    elcacAreas,
    activityMonitoringReports,
    activityMonitoringActions,
  };
}
