import { ouToRegionMap } from '../constants';
import type { Activity, IPO, OfficeRequirement, StaffingRequirement, Subproject } from '../constants';

type YearFilter = string | 'All';

export interface PhysicalAggregationFilters {
    year: YearFilter;
    operatingUnit?: string | 'All';
    tier?: string | 'All';
    fundType?: string | 'All';
    includeUnapproved?: boolean;
}

export interface HomepagePhysicalStats {
    subprojects: { target: number; actual: number };
    trainings: { target: number; actual: number };
    iposAssisted: { target: number; actual: number };
    iposWithSp: { target: number; actual: number };
    adsAssisted: { target: number; actual: number };
}

export interface PhysicalAggregationInput {
    subprojects: Subproject[];
    ipos: IPO[];
    activities: Activity[];
    officeReqs?: OfficeRequirement[];
    staffingReqs?: StaffingRequirement[];
}

type ScopedRecord = {
    workflow_status?: string;
    fundingYear?: number;
    fundYear?: number;
    operatingUnit?: string;
    tier?: string;
    fundType?: string;
    isRealignment?: boolean;
    isSavings?: boolean;
    status?: string;
};

const getRecordYear = (record: ScopedRecord) => record.fundingYear ?? record.fundYear;

const matchesSelectedYear = (value: string | number | undefined, selectedYear: YearFilter) => {
    if (selectedYear === 'All') return true;
    return value?.toString() === selectedYear;
};

const getDateYear = (date?: string) => {
    if (!date) return undefined;
    const parsed = new Date(date);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed.getFullYear().toString();
};

const isApproved = (record: ScopedRecord, includeUnapproved?: boolean) => {
    if (includeUnapproved) return true;
    return !record.workflow_status || record.workflow_status === 'APPROVED';
};

const matchesBaseFilters = (record: ScopedRecord, filters: PhysicalAggregationFilters) => {
    if (!isApproved(record, filters.includeUnapproved)) return false;
    if (filters.operatingUnit && filters.operatingUnit !== 'All' && record.operatingUnit !== filters.operatingUnit) return false;
    if (filters.tier && filters.tier !== 'All' && record.tier !== filters.tier) return false;
    if (filters.fundType && filters.fundType !== 'All' && record.fundType !== filters.fundType) return false;
    return true;
};

const isTargetRecord = (record: ScopedRecord, filters: PhysicalAggregationFilters) => {
    if (!matchesBaseFilters(record, filters)) return false;
    if (record.status === 'Cancelled') return false;
    if (record.isRealignment || record.isSavings) return false;
    return matchesSelectedYear(getRecordYear(record), filters.year);
};

const isActualRecord = (record: ScopedRecord, actualDate: string | undefined, filters: PhysicalAggregationFilters) => {
    if (!matchesBaseFilters(record, filters)) return false;
    if (record.status === 'Cancelled') return false;
    if (filters.year === 'All') return true;
    return matchesSelectedYear(getRecordYear(record), filters.year) && getDateYear(actualDate) === filters.year;
};

const hasCompletedSubproject = (subproject: Subproject) => subproject.status === 'Completed' && !!subproject.actualCompletionDate;

const hasCompletedActivity = (activity: Activity) => activity.status === 'Completed' && !!activity.actualDate;

const getVisibleIpoRegistry = (ipos: IPO[], filters: PhysicalAggregationFilters) => {
    return (ipos || []).filter(ipo => {
        if (!isApproved(ipo, filters.includeUnapproved)) return false;
        if (filters.operatingUnit && filters.operatingUnit !== 'All') {
            const targetRegion = ouToRegionMap[filters.operatingUnit];
            return !targetRegion || ipo.region === targetRegion;
        }
        return true;
    });
};

const addNames = (target: Set<string>, names: Array<string | undefined> | undefined) => {
    (names || []).forEach(name => {
        if (name) target.add(name);
    });
};

const getAds = (ipoNames: Set<string>, ipoRegistry: Map<string, IPO>) => {
    const ads = new Set<string>();
    ipoNames.forEach(name => {
        const ipo = ipoRegistry.get(name);
        if (ipo?.ancestralDomainNo) ads.add(ipo.ancestralDomainNo);
    });
    return ads;
};

export const aggregateHomepagePhysicalStats = (
    data: PhysicalAggregationInput,
    filters: PhysicalAggregationFilters
): HomepagePhysicalStats => {
    const targetSubprojects = (data.subprojects || []).filter(subproject => isTargetRecord(subproject, filters));
    const actualSubprojects = (data.subprojects || []).filter(subproject =>
        hasCompletedSubproject(subproject) && isActualRecord(subproject, subproject.actualCompletionDate, filters)
    );

    const trainings = (data.activities || []).filter(activity => activity.type === 'Training');
    const targetTrainings = trainings.filter(training => isTargetRecord(training, filters));
    const actualTrainings = trainings.filter(training =>
        hasCompletedActivity(training) && isActualRecord(training, training.actualDate, filters)
    );

    const targetIposWithSp = new Set<string>();
    addNames(targetIposWithSp, targetSubprojects.map(subproject => subproject.indigenousPeopleOrganization));

    const actualIposWithSp = new Set<string>();
    addNames(actualIposWithSp, actualSubprojects.map(subproject => subproject.indigenousPeopleOrganization));

    const targetIposWithTr = new Set<string>();
    targetTrainings.forEach(training => addNames(targetIposWithTr, training.participatingIpos));

    const actualIposWithTr = new Set<string>();
    actualTrainings.forEach(training => addNames(actualIposWithTr, training.participatingIpos));

    const targetIposAssisted = new Set<string>([
        ...Array.from(targetIposWithSp),
        ...Array.from(targetIposWithTr),
    ]);
    const actualIposAssisted = new Set<string>([
        ...Array.from(actualIposWithSp),
        ...Array.from(actualIposWithTr),
    ]);

    const ipoRegistry = new Map(getVisibleIpoRegistry(data.ipos || [], filters).map(ipo => [ipo.name, ipo]));

    return {
        subprojects: { target: targetSubprojects.length, actual: actualSubprojects.length },
        trainings: { target: targetTrainings.length, actual: actualTrainings.length },
        iposAssisted: { target: targetIposAssisted.size, actual: actualIposAssisted.size },
        iposWithSp: { target: targetIposWithSp.size, actual: actualIposWithSp.size },
        adsAssisted: {
            target: getAds(targetIposAssisted, ipoRegistry).size,
            actual: getAds(actualIposAssisted, ipoRegistry).size,
        },
    };
};
