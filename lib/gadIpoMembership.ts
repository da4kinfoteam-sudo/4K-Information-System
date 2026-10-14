import type { Activity, IPO, Subproject } from '../constants';
import { isValid, parseISO } from 'date-fns';
import { getActivityIpoNames } from './activityIpoLinks';
import { isParentExcludedFromTargets } from './budgetLineAdjustments';
import { isActiveSubprojectDeliveryDetail, resolveSubprojectCompletionRollup } from './subprojectCompletion';

export interface GadMembershipRow {
    ipo: IPO;
    total: number | null;
    male: number | null;
    female: number | null;
    womenLed: boolean | null;
    subprojectsLinked: number;
    subprojectsCompleted: number;
    trainingsLinked: number;
    trainingsConducted: number;
}

export interface GadMembershipMetric { value: number | null; reported: number }
export interface GadMembershipData {
    rows: GadMembershipRow[];
    total: GadMembershipMetric;
    male: GadMembershipMetric;
    female: GadMembershipMetric;
    programs: Pick<GadMembershipRow, 'subprojectsLinked' | 'subprojectsCompleted' | 'trainingsLinked' | 'trainingsConducted'>;
    diagnostics: { unresolvedLinks: number; ambiguousNames: number; mismatchedTotals: number };
}

export interface GadMembershipScope {
    year: string;
    operatingUnits: readonly string[];
    tier: string;
    fundType: string;
}

const positiveId = (value: unknown): number | null => {
    if (typeof value !== 'number' && typeof value !== 'string') return null;
    if (typeof value === 'string' && !value.trim()) return null;
    const number = Number(value);
    return Number.isSafeInteger(number) && number > 0 ? number : null;
};

export const reportedMembershipCount = (value: unknown): number | null => {
    if (typeof value !== 'number' && typeof value !== 'string') return null;
    if (typeof value === 'string' && !value.trim()) return null;
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= 0 ? number : null;
};

const validActualDate = (value: unknown) => typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value) && isValid(parseISO(value));
const normalizeName = (name: string) => name.trim().toLowerCase();

export function aggregateGadIpoMembership(
    input: { ipos: readonly IPO[]; subprojects: readonly Subproject[]; activities: readonly Activity[] },
    scope: GadMembershipScope,
): GadMembershipData {
    const diagnostics = { unresolvedLinks: 0, ambiguousNames: 0, mismatchedTotals: 0 };
    const allowedOus = new Set(scope.operatingUnits);
    const byId = new Map<number, IPO>();
    const byName = new Map<string, IPO[]>();
    input.ipos.forEach(ipo => {
        const id = positiveId(ipo.id);
        if (id === null || byId.has(id) || (ipo.workflow_status && ipo.workflow_status !== 'APPROVED')) return;
        byId.set(id, ipo);
        const name = normalizeName(ipo.name || '');
        if (name) byName.set(name, [...(byName.get(name) || []), ipo]);
    });
    const eligible = (record: Subproject | Activity) => (
        String(record.fundingYear) === scope.year
        && allowedOus.has(record.operatingUnit)
        && (scope.tier === 'All' || record.tier === scope.tier)
        && (scope.fundType === 'All' || record.fundType === scope.fundType)
        && (!record.workflow_status || record.workflow_status === 'APPROVED')
        && ['Proposed', 'Ongoing', 'Completed'].includes(record.status)
        && !isParentExcludedFromTargets(record)
    );
    const resolveId = (value: unknown): IPO[] => {
        const id = positiveId(value);
        const ipo = id === null ? undefined : byId.get(id);
        if (!ipo) diagnostics.unresolvedLinks += 1;
        return ipo ? [ipo] : [];
    };
    const resolveName = (name: string): IPO[] => {
        const matches = byName.get(normalizeName(name)) || [];
        if (matches.length === 1) return matches;
        diagnostics.unresolvedLinks += 1;
        if (matches.length > 1) diagnostics.ambiguousNames += 1;
        return [];
    };
    type RowSets = { ipo: IPO; subprojects: Set<number>; completed: Set<number>; trainings: Set<number>; conducted: Set<number> };
    const linked = new Map<number, RowSets>();
    const attach = (ipo: IPO): RowSets => {
        const id = Number(ipo.id);
        if (!linked.has(id)) linked.set(id, { ipo, subprojects: new Set(), completed: new Set(), trainings: new Set(), conducted: new Set() });
        return linked.get(id)!;
    };
    const programs = { subprojects: new Set<number>(), completed: new Set<number>(), trainings: new Set<number>(), conducted: new Set<number>() };
    const seenSubprojects = new Set<number>();
    input.subprojects.forEach(record => {
        const id = positiveId(record.id);
        if (id === null || seenSubprojects.has(id) || !eligible(record)) return;
        seenSubprojects.add(id);
        const explicit = record.ipo_id != null && String(record.ipo_id).trim() !== '';
        const ipos = explicit ? resolveId(record.ipo_id) : resolveName(record.indigenousPeopleOrganization || '');
        const rollup = resolveSubprojectCompletionRollup(record.details || [], record.status);
        // Validate every active delivery date, not just the latest rollup date.
        const completed = rollup.isComplete && validActualDate(rollup.actualCompletionDate)
            && rollup.details.filter(detail => isActiveSubprojectDeliveryDetail(detail, record.status))
                .every(detail => validActualDate(detail.actualDeliveryDate));
        ipos.forEach(ipo => {
            const row = attach(ipo);
            row.subprojects.add(id); programs.subprojects.add(id);
            if (completed) { row.completed.add(id); programs.completed.add(id); }
        });
    });
    const seenActivities = new Set<number>();
    input.activities.forEach(record => {
        const id = positiveId(record.id);
        if (id === null || seenActivities.has(id) || !eligible(record)) return;
        seenActivities.add(id);
        const rawIds: unknown = record.participating_ipo_ids;
        // Nonempty explicit IDs remain authoritative even if malformed or unavailable.
        const explicit = rawIds != null && (!Array.isArray(rawIds) || rawIds.length > 0);
        const ipos = explicit
            ? [...new Set(Array.isArray(rawIds) ? rawIds : [rawIds])].flatMap(resolveId)
            : [...new Set(getActivityIpoNames(record).map(normalizeName))].flatMap(resolveName);
        const conducted = record.status === 'Completed' && validActualDate(record.actualDate);
        ipos.forEach(ipo => {
            const row = attach(ipo);
            if (record.type !== 'Training') return;
            row.trainings.add(id); programs.trainings.add(id);
            if (conducted) { row.conducted.add(id); programs.conducted.add(id); }
        });
    });
    const rows = [...linked.values()].map(({ ipo, subprojects, completed, trainings, conducted }): GadMembershipRow => {
        const total = reportedMembershipCount(ipo.totalMembers);
        const male = reportedMembershipCount(ipo.totalMaleMembers);
        const female = reportedMembershipCount(ipo.totalFemaleMembers);
        if (total !== null && male !== null && female !== null && total !== male + female) diagnostics.mismatchedTotals += 1;
        return { ipo, total, male, female, womenLed: typeof ipo.isWomenLed === 'boolean' ? ipo.isWomenLed : null,
            subprojectsLinked: subprojects.size, subprojectsCompleted: completed.size,
            trainingsLinked: trainings.size, trainingsConducted: conducted.size };
    }).sort((a, b) => a.ipo.name.localeCompare(b.ipo.name) || Number(a.ipo.id) - Number(b.ipo.id));
    const metric = (key: 'total' | 'male' | 'female'): GadMembershipMetric => {
        const reported = rows.filter(row => row[key] !== null);
        return { value: rows.length && !reported.length ? null : reported.reduce((sum, row) => sum + row[key]!, 0), reported: reported.length };
    };
    return { rows, total: metric('total'), male: metric('male'), female: metric('female'), diagnostics,
        programs: { subprojectsLinked: programs.subprojects.size, subprojectsCompleted: programs.completed.size,
            trainingsLinked: programs.trainings.size, trainingsConducted: programs.conducted.size } };
}
