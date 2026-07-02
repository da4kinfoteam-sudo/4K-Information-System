import { Activity, ActivityMonitoringAction, ActivityMonitoringReport, IPO, Subproject, User } from '../constants';
import { supabase } from '../supabaseClient';

export interface IpoLinkedDcfRecords {
  subprojects: Subproject[];
  trainings: Activity[];
  monitoringActivities: Activity[];
  monitoringReports: ActivityMonitoringReport[];
  monitoringActions: ActivityMonitoringAction[];
}

const isAdminRole = (role?: string) => role === 'Super Admin' || role === 'Administrator';

const isMissingColumnError = (error: any) => {
  const message = String(error?.message || '').toLowerCase();
  return error?.code === 'PGRST204' || error?.code === '42703' || message.includes('column');
};

const fetchQuery = async (query: any, optionalColumn = false) => {
  const { data, error } = await query;
  if (error) {
    if (optionalColumn && isMissingColumnError(error)) {
      console.warn('Skipping IPO linked-record query because an optional column is unavailable:', error.message);
      return [];
    }
    throw error;
  }
  return data || [];
};

const mergePreferFirstById = <T extends { id: number }>(...groups: T[][]) => {
  const byId = new Map<number, T>();
  groups.flat().forEach(item => {
    const id = Number(item.id);
    if (!Number.isFinite(id) || byId.has(id)) return;
    byId.set(id, item);
  });
  return Array.from(byId.values()).sort((a, b) => Number(a.id) - Number(b.id));
};

const filterByUserVisibility = <T extends { operatingUnit?: string }>(rows: T[], currentUser: User | null | undefined) => {
  if (!currentUser || isAdminRole(currentUser.role)) return rows;
  const scope = currentUser.visibility_scope || 'All OUs';
  if (scope === 'All OUs') return rows;
  return rows.filter(row => row.operatingUnit === currentUser.operatingUnit);
};

const toNumericIds = (values: unknown[]) => Array.from(new Set(values.map(Number).filter(Number.isFinite)));

const fetchActionsForReports = async (reports: ActivityMonitoringReport[]) => {
  const reportIds = toNumericIds(reports.map(report => report.id));
  if (!supabase || reportIds.length === 0) return [];
  return fetchQuery(
    supabase
      .from('activity_monitoring_actions')
      .select('*')
      .in('monitoring_report_id', reportIds)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
  ) as Promise<ActivityMonitoringAction[]>;
};

export const emptyIpoLinkedDcfRecords = (): IpoLinkedDcfRecords => ({
  subprojects: [],
  trainings: [],
  monitoringActivities: [],
  monitoringReports: [],
  monitoringActions: [],
});

export async function fetchIpoLinkedDcfRecords(ipo: IPO, currentUser?: User | null): Promise<IpoLinkedDcfRecords> {
  if (!supabase || !ipo?.id) return emptyIpoLinkedDcfRecords();

  const ipoId = Number(ipo.id);
  const ipoName = String(ipo.name || '').trim();

  const [
    idMatchedSubprojects,
    nameMatchedSubprojects,
    idMatchedActivities,
    nameMatchedActivities,
  ] = await Promise.all([
    fetchQuery(
      supabase
        .from('subprojects')
        .select('*')
        .eq('ipo_id', ipoId)
        .order('id', { ascending: true }),
      true
    ) as Promise<Subproject[]>,
    ipoName
      ? fetchQuery(
        supabase
          .from('subprojects')
          .select('*')
          .eq('indigenousPeopleOrganization', ipoName)
          .order('id', { ascending: true })
      ) as Promise<Subproject[]>
      : Promise.resolve([]),
    fetchQuery(
      supabase
        .from('activities')
        .select('*')
        .contains('participating_ipo_ids', [ipoId])
        .order('id', { ascending: true }),
      true
    ) as Promise<Activity[]>,
    ipoName
      ? fetchQuery(
        supabase
          .from('activities')
          .select('*')
          .contains('participatingIpos', [ipoName])
          .order('id', { ascending: true })
      ) as Promise<Activity[]>
      : Promise.resolve([]),
  ]);

  const linkedSubprojects = filterByUserVisibility(
    mergePreferFirstById(idMatchedSubprojects, nameMatchedSubprojects),
    currentUser
  );
  const linkedActivities = filterByUserVisibility(
    mergePreferFirstById(idMatchedActivities, nameMatchedActivities),
    currentUser
  );
  const linkedTrainings = linkedActivities.filter(activity => activity.type === 'Training');

  const linkedActivityIds = new Set(linkedActivities.map(activity => Number(activity.id)));
  const reports = (await fetchQuery(
    supabase
      .from('activity_monitoring_reports')
      .select('*')
      .eq('ipo_id', ipoId)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
  ) as ActivityMonitoringReport[]).filter(report => linkedActivityIds.has(Number(report.activity_id)));

  return {
    subprojects: linkedSubprojects,
    trainings: linkedTrainings,
    monitoringActivities: linkedActivities,
    monitoringReports: reports,
    monitoringActions: await fetchActionsForReports(reports),
  };
}
