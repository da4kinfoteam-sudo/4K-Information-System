// Author: 4K
import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
    AlertTriangle,
    ArrowLeft,
    BookOpen,
    Briefcase,
    Building2,
    ChevronDown,
    ChevronRight,
    Clock,
    Download,
    GraduationCap,
    Landmark,
    Search,
    Users,
} from 'lucide-react';
import { Subproject, IPO, Training, OtherActivity, OfficeRequirement, StaffingRequirement, ouToRegionMap } from '../../constants';
import { parseLocation } from '../LocationPicker';
import { ModalItem } from './DashboardComponents';

interface PhysicalDashboardProps {
    data: {
        subprojects: Subproject[];
        trainings: Training[];
        otherActivities: OtherActivity[];
        officeReqs: OfficeRequirement[];
        staffingReqs: StaffingRequirement[];
        ipos: IPO[];
    };
    setModalData: (data: { title: string; items: ModalItem[] } | null) => void;
    selectedYear: string;
    selectedOu?: string;
    isAllOuView?: boolean;
    onSelectIpo?: (ipo: IPO) => void;
    onSelectSubproject?: (project: Subproject) => void;
    onSelectActivity?: (activity: Training | OtherActivity) => void;
    setExternalFilters?: (filters: any) => void;
    navigateTo?: (page: string) => void;
}

type ViewMode = 'Annual' | 'Monthly';
type DetailView = 'national' | 'provinces' | 'trend' | 'alerts' | 'rankings' | 'submissions';
type ModalType = 'ipos' | 'subprojects' | 'trainings' | 'ads' | 'provinces';
type MetricId = 'ipos' | 'subprojects' | 'iposWithSubprojects' | 'trainings' | 'iposTrained' | 'ads';

type ModalItemWithOu = ModalItem & { operatingUnit?: string };

type MetricScope = {
    target: number;
    actual: number;
    targets: ModalItemWithOu[];
    accomplishments: ModalItemWithOu[];
};

type Metric = {
    id: MetricId;
    label: string;
    variant: string;
    modalType: ModalType;
    icon: React.ReactNode;
    annual: MetricScope;
    monthly: MetricScope;
    cumulative: MetricScope;
};

type ProvincePerformance = {
    key: string;
    ou: string;
    province: string;
    targetIpos: number;
    actualIpos: number;
    targetSubprojects: number;
    actualSubprojects: number;
    targetTrainings: number;
    actualTrainings: number;
    rate: number;
};

type RecentSubmission = {
    id: string;
    name: string;
    type: string;
    component: string;
    operatingUnit: string;
    editedAt: string;
    completionDate: string;
};

const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

const shortMonthNames = monthNames.map(month => month.slice(0, 3));

const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(`${dateString}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return 'N/A';
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
};

const formatDateTime = (dateString?: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return formatDate(dateString.slice(0, 10));
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
};

const parseDate = (dateString?: string) => {
    if (!dateString) return null;
    const date = new Date(`${dateString}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
};

const getDateYear = (dateString?: string) => parseDate(dateString)?.getFullYear().toString();
const getDateMonth = (dateString?: string) => {
    const parsed = parseDate(dateString);
    return parsed ? parsed.getMonth() : -1;
};

const getActivityTargetDate = (activity: Training | OtherActivity) => activity.endDate || activity.date;

const getCumulativeCutoff = (selectedYear: string) => {
    if (selectedYear === 'All') {
        return { month: 11, label: 'Full year', cutoffDate: null as Date | null };
    }

    const selectedYearNumber = Number(selectedYear);
    if (!Number.isFinite(selectedYearNumber)) {
        return { month: 11, label: 'Full year', cutoffDate: null as Date | null };
    }

    const now = new Date();
    const currentYear = now.getFullYear();
    if (selectedYearNumber < currentYear) {
        return {
            month: 11,
            label: 'December',
            cutoffDate: new Date(selectedYearNumber, 11, 31, 23, 59, 59, 999),
        };
    }
    if (selectedYearNumber > currentYear) {
        return {
            month: -1,
            label: 'Not yet due',
            cutoffDate: new Date(selectedYearNumber, 0, 0, 23, 59, 59, 999),
        };
    }

    const month = now.getMonth();
    return {
        month,
        label: monthNames[month],
        cutoffDate: new Date(selectedYearNumber, month + 1, 0, 23, 59, 59, 999),
    };
};

const isDueByCutoff = (dateString: string | undefined, cutoffDate: Date | null) => {
    if (!dateString) return false;
    if (!cutoffDate) return true;
    const parsed = parseDate(dateString);
    return !!parsed && parsed.getTime() <= cutoffDate.getTime();
};

const matchesSelectedYear = (dateString: string | undefined, selectedYear: string) => {
    if (selectedYear === 'All') return true;
    return getDateYear(dateString) === selectedYear;
};

const isTargetRecord = (record: { status?: string; isRealignment?: boolean; isSavings?: boolean }) =>
    record.status !== 'Cancelled' && !record.isRealignment && !record.isSavings;

const isCompletedSubproject = (subproject: Subproject) =>
    subproject.status === 'Completed' && !!subproject.actualCompletionDate;

const isCompletedTraining = (training: Training) =>
    training.status !== 'Cancelled' && !!training.actualDate;

const percent = (actual: number, target: number) => target > 0 ? Math.round((actual / target) * 100) : 0;

const getStatus = (actual: number, target: number, options: { notYetDue?: boolean } = {}) => {
    if (target === 0) {
        if (options.notYetDue) return { label: 'Not Yet Due', tone: 'neutral' };
        return { label: actual > 0 ? 'Recorded' : 'No target', tone: 'neutral' };
    }
    const value = percent(actual, target);
    if (value >= 80) return { label: 'On Track', tone: 'good' };
    if (value >= 50) return { label: 'Needs Attention', tone: 'warning' };
    return { label: 'Critical', tone: 'danger' };
};

const getProvinceForIpo = (ipo?: IPO) => parseLocation(ipo?.location || '').province || 'Unspecified Province';

const sanitizeSheetName = (name: string) => name.replace(/[\\/?*[\]:]/g, '').slice(0, 31) || 'Report';

const PhysicalMetricCard: React.FC<{
    metric: Metric;
    viewMode: ViewMode;
    asOfMonth: number;
    cumulativeLabel: string;
    expanded: boolean;
    onToggleExpand: () => void;
    onOpen: () => void;
}> = ({ metric, viewMode, asOfMonth, cumulativeLabel, expanded, onToggleExpand, onOpen }) => {
    const active = viewMode === 'Annual' ? metric.annual : metric.monthly;
    const statusScope = viewMode === 'Annual' ? metric.cumulative : metric.monthly;
    const status = getStatus(statusScope.actual, statusScope.target, {
        notYetDue: viewMode === 'Annual' && metric.annual.target > 0 && statusScope.target === 0,
    });
    return (
        <article
            className={`physical-dashboard-kpi physical-dashboard-kpi--${metric.variant} physical-dashboard-kpi--${status.tone}`}
            onClick={onOpen}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onOpen();
                }
            }}
        >
            <div className="physical-dashboard-kpi__header">
                <span className="physical-dashboard-kpi__icon" aria-hidden="true">{metric.icon}</span>
                <button
                    type="button"
                    className="physical-dashboard-kpi__expand"
                    aria-label={expanded ? `Collapse ${metric.label} detail` : `Expand ${metric.label} detail`}
                    onClick={(event) => {
                        event.stopPropagation();
                        onToggleExpand();
                    }}
                >
                    <ChevronDown className={expanded ? 'is-open' : ''} aria-hidden="true" />
                </button>
            </div>
            <div className="physical-dashboard-kpi__body">
                <h4>{metric.label}</h4>
                <strong>{active.actual.toLocaleString()} / {active.target.toLocaleString()}</strong>
                <span>{percent(active.actual, active.target)}%</span>
            </div>
            <div className="physical-dashboard-kpi__status">
                <i aria-hidden="true" />
                <span>{status.label}</span>
            </div>
            {expanded && (
                <div className="physical-dashboard-kpi__detail" onClick={event => event.stopPropagation()}>
                    <div>
                        <span>Annual</span>
                        <strong>{metric.annual.actual.toLocaleString()} / {metric.annual.target.toLocaleString()}</strong>
                        <small>{percent(metric.annual.actual, metric.annual.target)}%</small>
                    </div>
                    <div>
                        <span>{monthNames[asOfMonth]}</span>
                        <strong>{metric.monthly.actual.toLocaleString()} / {metric.monthly.target.toLocaleString()}</strong>
                        <small>{percent(metric.monthly.actual, metric.monthly.target)}%</small>
                    </div>
                    <div>
                        <span>Cumulative as of {cumulativeLabel}</span>
                        <strong>{metric.cumulative.actual.toLocaleString()} / {metric.cumulative.target.toLocaleString()}</strong>
                        <small>{getStatus(metric.cumulative.actual, metric.cumulative.target, {
                            notYetDue: metric.annual.target > 0 && metric.cumulative.target === 0,
                        }).label}</small>
                    </div>
                </div>
            )}
        </article>
    );
};

const SectionHeader: React.FC<{
    title: string;
    actionLabel?: string;
    onAction?: () => void;
    meta?: string;
}> = ({ title, actionLabel, onAction, meta }) => (
    <div className="physical-dashboard-section-header">
        <div>
            <h3>{title}</h3>
            {meta && <span>{meta}</span>}
        </div>
        {actionLabel && onAction && (
            <button type="button" className="btn btn-secondary btn-responsive" onClick={onAction}>
                <span className="btn-text">{actionLabel}</span>
                <ChevronRight className="btn-symbol" aria-hidden="true" />
            </button>
        )}
    </div>
);

const ProgressPill: React.FC<{ actual: number; target: number }> = ({ actual, target }) => {
    const value = percent(actual, target);
    return (
        <div className="physical-dashboard-progress">
            <span>{value}%</span>
            <i><b style={{ width: `${Math.min(value, 100)}%` }} /></i>
        </div>
    );
};

const StatusBadge: React.FC<{ actual: number; target: number }> = ({ actual, target }) => {
    const status = getStatus(actual, target);
    return <span className={`physical-dashboard-status physical-dashboard-status--${status.tone}`}>{status.label}</span>;
};

const PhysicalDashboard: React.FC<PhysicalDashboardProps> = ({
    data,
    selectedYear,
    selectedOu = 'All',
    isAllOuView,
    onSelectIpo,
    onSelectSubproject,
    onSelectActivity,
    setExternalFilters,
    navigateTo,
}) => {
    const currentMonth = new Date().getMonth();
    const [viewMode, setViewMode] = useState<ViewMode>('Annual');
    const [asOfMonth, setAsOfMonth] = useState(currentMonth);
    const [expandedCards, setExpandedCards] = useState<Set<MetricId>>(new Set());
    const [expandedOus, setExpandedOus] = useState<Set<string>>(new Set());
    const [detailView, setDetailView] = useState<DetailView | null>(null);
    const [detailSearch, setDetailSearch] = useState('');
    const [localModal, setLocalModal] = useState<{
        title: string;
        type: ModalType;
        targets: ModalItemWithOu[];
        accomplishments: ModalItemWithOu[];
    } | null>(null);
    const [modalTab, setModalTab] = useState<'targets' | 'accomplishments'>('accomplishments');

    const regionToOuMap = useMemo(() => {
        const map: Record<string, string> = {};
        Object.entries(ouToRegionMap).forEach(([ou, region]) => {
            map[region] = ou;
        });
        return map;
    }, []);

    const analytics = useMemo(() => {
        const ipoMap = new Map<string, IPO>((data.ipos || []).map(ipo => [ipo.name, ipo]));
        const targetSubprojects = (data.subprojects || []).filter(isTargetRecord);
        const targetTrainings = (data.trainings || []).filter(isTargetRecord);
        const actualSubprojects = (data.subprojects || []).filter(sp =>
            isCompletedSubproject(sp) && matchesSelectedYear(sp.actualCompletionDate, selectedYear)
        );
        const actualTrainings = (data.trainings || []).filter(training =>
            isCompletedTraining(training) && matchesSelectedYear(training.actualDate, selectedYear)
        );
        const cumulativeCutoff = getCumulativeCutoff(selectedYear);

        const monthTargetSubprojects = targetSubprojects.filter(sp => getDateMonth(sp.estimatedCompletionDate) === asOfMonth);
        const monthTargetTrainings = targetTrainings.filter(training => getDateMonth(getActivityTargetDate(training)) === asOfMonth);
        const monthActualSubprojects = actualSubprojects.filter(sp => getDateMonth(sp.actualCompletionDate) === asOfMonth);
        const monthActualTrainings = actualTrainings.filter(training => getDateMonth(training.actualDate) === asOfMonth);
        const cumulativeTargetSubprojects = targetSubprojects.filter(sp => isDueByCutoff(sp.estimatedCompletionDate, cumulativeCutoff.cutoffDate));
        const cumulativeTargetTrainings = targetTrainings.filter(training => isDueByCutoff(getActivityTargetDate(training), cumulativeCutoff.cutoffDate));
        const cumulativeActualSubprojects = actualSubprojects.filter(sp => isDueByCutoff(sp.actualCompletionDate, cumulativeCutoff.cutoffDate));
        const cumulativeActualTrainings = actualTrainings.filter(training => isDueByCutoff(training.actualDate, cumulativeCutoff.cutoffDate));

        const makeIpoItems = (names: Set<string>) => Array.from(names)
            .map(name => ipoMap.get(name))
            .filter((ipo): ipo is IPO => !!ipo)
            .map(ipo => ({
                id: ipo.id,
                name: ipo.name,
                details: ipo.location,
                operatingUnit: regionToOuMap[ipo.region] || 'Unknown OU',
            }))
            .sort((a, b) => (a.operatingUnit || '').localeCompare(b.operatingUnit || '') || a.name.localeCompare(b.name));

        const makeSubprojectItems = (items: Subproject[]) => items
            .map(sp => ({
                id: sp.id,
                name: sp.name,
                details: `${sp.indigenousPeopleOrganization} | Target: ${formatDate(sp.estimatedCompletionDate)} | Completed: ${formatDate(sp.actualCompletionDate)}`,
                operatingUnit: sp.operatingUnit,
            }))
            .sort((a, b) => (a.operatingUnit || '').localeCompare(b.operatingUnit || '') || a.name.localeCompare(b.name));

        const makeTrainingItems = (items: Training[]) => items
            .map(training => ({
                id: training.id,
                name: training.name,
                details: `${training.component} | Target: ${formatDate(getActivityTargetDate(training))} | Conducted: ${formatDate(training.actualDate)}`,
                operatingUnit: training.operatingUnit,
            }))
            .sort((a, b) => (a.operatingUnit || '').localeCompare(b.operatingUnit || '') || a.name.localeCompare(b.name));

        const getIpoSetFromSubprojects = (items: Subproject[]): Set<string> =>
            new Set(items.map(sp => sp.indigenousPeopleOrganization).filter((name): name is string => !!name));
        const getIpoSetFromTrainings = (items: Training[]): Set<string> =>
            new Set(items.flatMap(training => training.participatingIpos || []).filter((name): name is string => !!name));
        const unionSets = (...sets: Set<string>[]): Set<string> => {
            const merged = new Set<string>();
            sets.forEach(set => set.forEach(value => merged.add(value)));
            return merged;
        };

        const makeAdScope = (ipoNames: Set<string>) => {
            const adMap = new Map<string, { ipoNames: string[]; ou: string }>();
            ipoNames.forEach(name => {
                const ipo = ipoMap.get(name);
                if (!ipo?.ancestralDomainNo) return;
                if (!adMap.has(ipo.ancestralDomainNo)) {
                    adMap.set(ipo.ancestralDomainNo, {
                        ipoNames: [],
                        ou: regionToOuMap[ipo.region] || 'Unknown OU',
                    });
                }
                adMap.get(ipo.ancestralDomainNo)!.ipoNames.push(ipo.name);
            });
            return Array.from(adMap.entries())
                .map(([adNo, item]) => ({
                    id: adNo,
                    name: `AD No: ${adNo}`,
                    details: item.ipoNames.join(', '),
                    operatingUnit: item.ou,
                }))
                .sort((a, b) => (a.operatingUnit || '').localeCompare(b.operatingUnit || '') || a.name.localeCompare(b.name));
        };

        const makeMetricScope = (
            target: number,
            actual: number,
            targets: ModalItemWithOu[],
            accomplishments: ModalItemWithOu[]
        ): MetricScope => ({ target, actual, targets, accomplishments });

        const annualTargetIposWithSp = getIpoSetFromSubprojects(targetSubprojects);
        const annualActualIposWithSp = getIpoSetFromSubprojects(actualSubprojects);
        const annualTargetIposTrained = getIpoSetFromTrainings(targetTrainings);
        const annualActualIposTrained = getIpoSetFromTrainings(actualTrainings);
        const annualTargetIpos = unionSets(annualTargetIposWithSp, annualTargetIposTrained);
        const annualActualIpos = unionSets(annualActualIposWithSp, annualActualIposTrained);

        const cumulativeTargetIposWithSp = getIpoSetFromSubprojects(cumulativeTargetSubprojects);
        const cumulativeActualIposWithSp = getIpoSetFromSubprojects(cumulativeActualSubprojects);
        const cumulativeTargetIposTrained = getIpoSetFromTrainings(cumulativeTargetTrainings);
        const cumulativeActualIposTrained = getIpoSetFromTrainings(cumulativeActualTrainings);
        const cumulativeTargetIpos = unionSets(cumulativeTargetIposWithSp, cumulativeTargetIposTrained);
        const cumulativeActualIpos = unionSets(cumulativeActualIposWithSp, cumulativeActualIposTrained);

        const monthlyTargetIposWithSp = getIpoSetFromSubprojects(monthTargetSubprojects);
        const monthlyActualIposWithSp = getIpoSetFromSubprojects(monthActualSubprojects);
        const monthlyTargetIposTrained = getIpoSetFromTrainings(monthTargetTrainings);
        const monthlyActualIposTrained = getIpoSetFromTrainings(monthActualTrainings);
        const monthlyTargetIpos = unionSets(monthlyTargetIposWithSp, monthlyTargetIposTrained);
        const monthlyActualIpos = unionSets(monthlyActualIposWithSp, monthlyActualIposTrained);

        const metrics: Metric[] = [
            {
                id: 'ipos',
                label: 'IPOs Assisted',
                variant: 'teal',
                modalType: 'ipos',
                icon: <Users />,
                annual: makeMetricScope(annualTargetIpos.size, annualActualIpos.size, makeIpoItems(annualTargetIpos), makeIpoItems(annualActualIpos)),
                monthly: makeMetricScope(monthlyTargetIpos.size, monthlyActualIpos.size, makeIpoItems(monthlyTargetIpos), makeIpoItems(monthlyActualIpos)),
                cumulative: makeMetricScope(cumulativeTargetIpos.size, cumulativeActualIpos.size, makeIpoItems(cumulativeTargetIpos), makeIpoItems(cumulativeActualIpos)),
            },
            {
                id: 'subprojects',
                label: 'Subprojects',
                variant: 'orange',
                modalType: 'subprojects',
                icon: <Briefcase />,
                annual: makeMetricScope(targetSubprojects.length, actualSubprojects.length, makeSubprojectItems(targetSubprojects), makeSubprojectItems(actualSubprojects)),
                monthly: makeMetricScope(monthTargetSubprojects.length, monthActualSubprojects.length, makeSubprojectItems(monthTargetSubprojects), makeSubprojectItems(monthActualSubprojects)),
                cumulative: makeMetricScope(cumulativeTargetSubprojects.length, cumulativeActualSubprojects.length, makeSubprojectItems(cumulativeTargetSubprojects), makeSubprojectItems(cumulativeActualSubprojects)),
            },
            {
                id: 'iposWithSubprojects',
                label: 'IPOs with Subprojects',
                variant: 'blue',
                modalType: 'ipos',
                icon: <Building2 />,
                annual: makeMetricScope(annualTargetIposWithSp.size, annualActualIposWithSp.size, makeIpoItems(annualTargetIposWithSp), makeIpoItems(annualActualIposWithSp)),
                monthly: makeMetricScope(monthlyTargetIposWithSp.size, monthlyActualIposWithSp.size, makeIpoItems(monthlyTargetIposWithSp), makeIpoItems(monthlyActualIposWithSp)),
                cumulative: makeMetricScope(cumulativeTargetIposWithSp.size, cumulativeActualIposWithSp.size, makeIpoItems(cumulativeTargetIposWithSp), makeIpoItems(cumulativeActualIposWithSp)),
            },
            {
                id: 'trainings',
                label: 'Trainings Conducted',
                variant: 'violet',
                modalType: 'trainings',
                icon: <BookOpen />,
                annual: makeMetricScope(targetTrainings.length, actualTrainings.length, makeTrainingItems(targetTrainings), makeTrainingItems(actualTrainings)),
                monthly: makeMetricScope(monthTargetTrainings.length, monthActualTrainings.length, makeTrainingItems(monthTargetTrainings), makeTrainingItems(monthActualTrainings)),
                cumulative: makeMetricScope(cumulativeTargetTrainings.length, cumulativeActualTrainings.length, makeTrainingItems(cumulativeTargetTrainings), makeTrainingItems(cumulativeActualTrainings)),
            },
            {
                id: 'iposTrained',
                label: 'IPOs Trained',
                variant: 'cyan',
                modalType: 'ipos',
                icon: <GraduationCap />,
                annual: makeMetricScope(annualTargetIposTrained.size, annualActualIposTrained.size, makeIpoItems(annualTargetIposTrained), makeIpoItems(annualActualIposTrained)),
                monthly: makeMetricScope(monthlyTargetIposTrained.size, monthlyActualIposTrained.size, makeIpoItems(monthlyTargetIposTrained), makeIpoItems(monthlyActualIposTrained)),
                cumulative: makeMetricScope(cumulativeTargetIposTrained.size, cumulativeActualIposTrained.size, makeIpoItems(cumulativeTargetIposTrained), makeIpoItems(cumulativeActualIposTrained)),
            },
            {
                id: 'ads',
                label: 'Ancestral Domains Assisted',
                variant: 'green',
                modalType: 'ads',
                icon: <Landmark />,
                annual: makeMetricScope(makeAdScope(annualTargetIpos).length, makeAdScope(annualActualIpos).length, makeAdScope(annualTargetIpos), makeAdScope(annualActualIpos)),
                monthly: makeMetricScope(makeAdScope(monthlyTargetIpos).length, makeAdScope(monthlyActualIpos).length, makeAdScope(monthlyTargetIpos), makeAdScope(monthlyActualIpos)),
                cumulative: makeMetricScope(makeAdScope(cumulativeTargetIpos).length, makeAdScope(cumulativeActualIpos).length, makeAdScope(cumulativeTargetIpos), makeAdScope(cumulativeActualIpos)),
            },
        ];

        const monthSeries = monthNames.map((month, index) => {
            const monthTargets = [
                targetSubprojects.filter(sp => getDateMonth(sp.estimatedCompletionDate) === index).length,
                targetTrainings.filter(training => getDateMonth(getActivityTargetDate(training)) === index).length,
            ].reduce((sum, value) => sum + value, 0);
            const monthActuals = [
                actualSubprojects.filter(sp => getDateMonth(sp.actualCompletionDate) === index).length,
                actualTrainings.filter(training => getDateMonth(training.actualDate) === index).length,
            ].reduce((sum, value) => sum + value, 0);
            return { month, monthShort: shortMonthNames[index], target: monthTargets, actual: monthActuals };
        });

        type MutableProvince = {
            ou: string;
            province: string;
            targetIpos: Set<string>;
            actualIpos: Set<string>;
            targetSubprojects: Set<number>;
            actualSubprojects: Set<number>;
            targetTrainings: Set<number>;
            actualTrainings: Set<number>;
        };

        const provinceMap = new Map<string, MutableProvince>();
        const ensureProvince = (ou: string, province: string) => {
            const key = `${ou || 'Unknown OU'}|${province || 'Unspecified Province'}`;
            if (!provinceMap.has(key)) {
                provinceMap.set(key, {
                    ou: ou || 'Unknown OU',
                    province: province || 'Unspecified Province',
                    targetIpos: new Set(),
                    actualIpos: new Set(),
                    targetSubprojects: new Set(),
                    actualSubprojects: new Set(),
                    targetTrainings: new Set(),
                    actualTrainings: new Set(),
                });
            }
            return provinceMap.get(key)!;
        };

        targetSubprojects.forEach(sp => {
            const ipo = ipoMap.get(sp.indigenousPeopleOrganization);
            const row = ensureProvince(sp.operatingUnit, getProvinceForIpo(ipo));
            row.targetSubprojects.add(sp.id);
            if (sp.indigenousPeopleOrganization) row.targetIpos.add(sp.indigenousPeopleOrganization);
        });
        actualSubprojects.forEach(sp => {
            const ipo = ipoMap.get(sp.indigenousPeopleOrganization);
            const row = ensureProvince(sp.operatingUnit, getProvinceForIpo(ipo));
            row.actualSubprojects.add(sp.id);
            if (sp.indigenousPeopleOrganization) row.actualIpos.add(sp.indigenousPeopleOrganization);
        });
        targetTrainings.forEach(training => {
            (training.participatingIpos || []).forEach(ipoName => {
                const ipo = ipoMap.get(ipoName);
                const row = ensureProvince(training.operatingUnit, getProvinceForIpo(ipo));
                row.targetTrainings.add(training.id);
                row.targetIpos.add(ipoName);
            });
        });
        actualTrainings.forEach(training => {
            (training.participatingIpos || []).forEach(ipoName => {
                const ipo = ipoMap.get(ipoName);
                const row = ensureProvince(training.operatingUnit, getProvinceForIpo(ipo));
                row.actualTrainings.add(training.id);
                row.actualIpos.add(ipoName);
            });
        });

        const provinceRows: ProvincePerformance[] = Array.from(provinceMap.entries())
            .map(([key, row]) => {
                const targetTotal = row.targetIpos.size + row.targetSubprojects.size + row.targetTrainings.size;
                const actualTotal = row.actualIpos.size + row.actualSubprojects.size + row.actualTrainings.size;
                return {
                    key,
                    ou: row.ou,
                    province: row.province,
                    targetIpos: row.targetIpos.size,
                    actualIpos: row.actualIpos.size,
                    targetSubprojects: row.targetSubprojects.size,
                    actualSubprojects: row.actualSubprojects.size,
                    targetTrainings: row.targetTrainings.size,
                    actualTrainings: row.actualTrainings.size,
                    rate: percent(actualTotal, targetTotal),
                };
            })
            .sort((a, b) => a.ou.localeCompare(b.ou) || b.rate - a.rate || a.province.localeCompare(b.province));

        const ouRows = Array.from(provinceRows.reduce((map, row) => {
            const current = map.get(row.ou) || {
                key: row.ou,
                ou: row.ou,
                province: 'All Provinces',
                targetIpos: 0,
                actualIpos: 0,
                targetSubprojects: 0,
                actualSubprojects: 0,
                targetTrainings: 0,
                actualTrainings: 0,
                rate: 0,
            };
            current.targetIpos += row.targetIpos;
            current.actualIpos += row.actualIpos;
            current.targetSubprojects += row.targetSubprojects;
            current.actualSubprojects += row.actualSubprojects;
            current.targetTrainings += row.targetTrainings;
            current.actualTrainings += row.actualTrainings;
            const targetTotal = current.targetIpos + current.targetSubprojects + current.targetTrainings;
            const actualTotal = current.actualIpos + current.actualSubprojects + current.actualTrainings;
            current.rate = percent(actualTotal, targetTotal);
            map.set(row.ou, current);
            return map;
        }, new Map<string, ProvincePerformance>()).values()).sort((a, b) => b.rate - a.rate || a.ou.localeCompare(b.ou));

        const alerts = [
            ...provinceRows
                .filter(row => row.rate < 50 && (row.targetIpos + row.targetSubprojects + row.targetTrainings) > 0)
                .slice(0, 4)
                .map(row => ({
                    title: `${row.province} is below 50% overall accomplishment.`,
                    details: `${row.ou} | ${row.rate}% accomplishment rate`,
                    tone: 'danger',
            })),
            ...metrics
                .filter(metric => metric.cumulative.target > 0 && percent(metric.cumulative.actual, metric.cumulative.target) < 50)
                .slice(0, 2)
                .map(metric => ({
                    title: `${metric.label} needs attention.`,
                    details: `${metric.cumulative.actual.toLocaleString()} of ${metric.cumulative.target.toLocaleString()} targets due by ${cumulativeCutoff.label} accomplished`,
                    tone: 'warning',
                })),
        ];

        const getSubmissionEditTimestamp = (item: { physical_accomplishment_submitted_at?: string | null; updated_at?: string }, completionDate?: string) => {
            if (!completionDate) return '';
            return item.physical_accomplishment_submitted_at || item.updated_at || '';
        };

        const activitySubmissions: RecentSubmission[] = [...(data.trainings || []), ...(data.otherActivities || [])]
            .filter(activity => activity.status !== 'Cancelled' && !!activity.actualDate)
            .map(activity => ({
                id: `activity-${activity.id}`,
                name: activity.name,
                type: activity.type === 'Training' ? 'Training' : 'Activity',
                component: activity.component || 'Activity',
                operatingUnit: activity.operatingUnit || 'Unknown OU',
                editedAt: getSubmissionEditTimestamp(activity, activity.actualDate),
                completionDate: activity.actualDate || '',
            }));

        const submissions: RecentSubmission[] = [
            ...actualSubprojects.map(sp => ({
                id: `subproject-${sp.id}`,
                name: sp.name,
                type: 'Subproject',
                component: sp.packageType || 'Subproject',
                operatingUnit: sp.operatingUnit || 'Unknown OU',
                editedAt: getSubmissionEditTimestamp(sp, sp.actualCompletionDate),
                completionDate: sp.actualCompletionDate || '',
            })),
            ...activitySubmissions,
            ...(data.staffingReqs || [])
                .filter(staff => staff.hiringStatus !== 'Unfilled' && !!(staff.actualDate || staff.actualObligationDate))
                .map(staff => {
                    const completionDate = staff.actualDate || staff.actualObligationDate || '';
                    return {
                        id: `staffing-${staff.id}`,
                        name: staff.personnelPosition,
                        type: 'Staff Requirement',
                        component: staff.component || 'Program Management / Staffing',
                        operatingUnit: staff.operatingUnit || 'Unknown OU',
                        editedAt: getSubmissionEditTimestamp(staff, completionDate),
                        completionDate,
                    };
                }),
            ...(data.officeReqs || [])
                .filter(office => office.status !== 'Cancelled' && !!(office.actualDate || office.actualObligationDate))
                .map(office => {
                    const completionDate = office.actualDate || office.actualObligationDate || '';
                    return {
                        id: `office-${office.id}`,
                        name: office.equipment,
                        type: 'Office Requirement',
                        component: 'Program Management / Office Requirement',
                        operatingUnit: office.operatingUnit || 'Unknown OU',
                        editedAt: getSubmissionEditTimestamp(office, completionDate),
                        completionDate,
                    };
                }),
        ].filter(item => item.editedAt && item.completionDate)
            .sort((a, b) => new Date(b.editedAt).getTime() - new Date(a.editedAt).getTime());

        return {
            metrics,
            metricMap: new Map(metrics.map(metric => [metric.id, metric])),
            cumulativeCutoff,
            monthSeries,
            provinceRows,
            ouRows,
            alerts,
            submissions,
            topPerformers: [...provinceRows].filter(row => row.rate > 0).sort((a, b) => b.rate - a.rate).slice(0, 5),
        };
    }, [asOfMonth, data.ipos, data.officeReqs, data.otherActivities, data.staffingReqs, data.subprojects, data.trainings, regionToOuMap, selectedYear]);

    const activeScope = (metric: Metric) => viewMode === 'Annual' ? metric.annual : metric.monthly;
    const statusScope = (metric: Metric) => viewMode === 'Annual' ? metric.cumulative : metric.monthly;
    const metricStatus = (metric: Metric) => {
        const scope = statusScope(metric);
        return getStatus(scope.actual, scope.target, {
            notYetDue: viewMode === 'Annual' && metric.annual.target > 0 && scope.target === 0,
        });
    };
    const allOuMode = isAllOuView ?? selectedOu === 'All';

    const openMetricModal = (metric: Metric) => {
        const scope = activeScope(metric);
        setLocalModal({
            title: `${metric.label} ${viewMode === 'Monthly' ? `- ${monthNames[asOfMonth]}` : ''}`,
            type: metric.modalType,
            targets: scope.targets,
            accomplishments: scope.accomplishments,
        });
        setModalTab('accomplishments');
    };

    const handleDownloadModalExcel = () => {
        if (!localModal) return;
        const wb = XLSX.utils.book_new();
        const toRows = (items: ModalItemWithOu[]) => items.map(item => ({
            OU: item.operatingUnit || '',
            Name: item.name,
            Details: item.details || '',
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(toRows(localModal.targets)), 'Targets');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(toRows(localModal.accomplishments)), 'Accomplishments');
        XLSX.writeFile(wb, `${localModal.title.replace(/\s+/g, '_')}.xlsx`);
    };

    const handleItemClick = (item: ModalItem) => {
        if (localModal?.type === 'ipos') {
            const ipo = (data.ipos || []).find(i => i.id === item.id);
            if (ipo && onSelectIpo) onSelectIpo(ipo);
        } else if (localModal?.type === 'subprojects') {
            const sp = (data.subprojects || []).find(p => p.id === item.id);
            if (sp && onSelectSubproject) onSelectSubproject(sp);
        } else if (localModal?.type === 'trainings') {
            const training = (data.trainings || []).find(t => t.id === item.id);
            if (training && onSelectActivity) onSelectActivity(training);
        } else if (localModal?.type === 'ads' && setExternalFilters && navigateTo) {
            setExternalFilters({ search: item.id as string });
            navigateTo('/ipo');
        }
    };

    const openDetailView = (view: DetailView) => {
        setDetailView(view);
        setDetailSearch('');
    };

    const getDetailRows = () => {
        if (detailView === 'national') {
            return analytics.metrics.map(metric => {
                const scope = activeScope(metric);
                const basis = statusScope(metric);
                return {
                    Indicator: metric.label,
                    Target: scope.target,
                    Accomplishment: scope.actual,
                    Rate: `${percent(scope.actual, scope.target)}%`,
                    'Status Basis': viewMode === 'Annual'
                        ? `${basis.actual} / ${basis.target} cumulative as of ${analytics.cumulativeCutoff.label}`
                        : `${basis.actual} / ${basis.target} for ${monthNames[asOfMonth]}`,
                    Status: metricStatus(metric).label,
                };
            });
        }
        if (detailView === 'provinces') {
            return analytics.provinceRows.map(row => ({
                OU: row.ou,
                Province: row.province,
                'IPOs Target/Accomp': `${row.actualIpos} / ${row.targetIpos}`,
                'Subprojects Target/Accomp': `${row.actualSubprojects} / ${row.targetSubprojects}`,
                'Trainings Target/Accomp': `${row.actualTrainings} / ${row.targetTrainings}`,
                Rate: `${row.rate}%`,
                Status: getStatus(row.actualIpos + row.actualSubprojects + row.actualTrainings, row.targetIpos + row.targetSubprojects + row.targetTrainings).label,
            }));
        }
        if (detailView === 'trend') {
            return analytics.monthSeries.map(row => ({
                Month: row.month,
                Target: row.target,
                Accomplishment: row.actual,
                Rate: `${percent(row.actual, row.target)}%`,
            }));
        }
        if (detailView === 'alerts') {
            return analytics.alerts.map(row => ({
                Alert: row.title,
                Details: row.details,
                Type: row.tone,
            }));
        }
        if (detailView === 'rankings') {
            return analytics.topPerformers.map((row, index) => ({
                Rank: index + 1,
                OU: row.ou,
                Province: row.province,
                Rate: `${row.rate}%`,
                'IPOs Target/Accomp': `${row.actualIpos} / ${row.targetIpos}`,
                'Subprojects Target/Accomp': `${row.actualSubprojects} / ${row.targetSubprojects}`,
                'Trainings Target/Accomp': `${row.actualTrainings} / ${row.targetTrainings}`,
            }));
        }
        if (detailView === 'submissions') {
            return analytics.submissions.map(row => ({
                'Item Name': row.name,
                Type: row.type,
                Component: row.component,
                OU: row.operatingUnit,
                Edited: formatDateTime(row.editedAt),
                'Completion Date': formatDate(row.completionDate),
            }));
        }
        return [];
    };

    const detailRows = getDetailRows();
    const filteredDetailRows = detailRows.filter(row =>
        !detailSearch.trim() || Object.values(row).some(value =>
            String(value ?? '').toLowerCase().includes(detailSearch.trim().toLowerCase())
        )
    );

    const downloadDetailView = () => {
        if (!detailView) return;
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filteredDetailRows), sanitizeSheetName(detailView));
        XLSX.writeFile(wb, `Physical_Dashboard_${detailView}_${selectedYear}.xlsx`);
    };

    const chartMax = Math.max(1, ...analytics.metrics.map(metric => activeScope(metric).target));
    const trendMax = Math.max(1, ...analytics.monthSeries.flatMap(row => [row.target, row.actual]));
    const trendPoints = (key: 'target' | 'actual') => analytics.monthSeries.map((row, index) => {
        const x = analytics.monthSeries.length === 1 ? 0 : (index / (analytics.monthSeries.length - 1)) * 100;
        const y = 100 - ((row[key] / trendMax) * 88 + 6);
        return `${x},${y}`;
    }).join(' ');

    if (detailView) {
        const titleMap: Record<DetailView, string> = {
            national: 'National Target vs Accomplishment',
            provinces: allOuMode ? 'OU and Province Performance Summary' : 'Province Performance Summary',
            trend: 'Monthly Accomplishment Trend',
            alerts: 'Key Insights and Alerts',
            rankings: 'Top Performers',
            submissions: 'Recent Data Submissions',
        };
        const headers = Object.keys(filteredDetailRows[0] || detailRows[0] || { Notice: 'No records' });
        return (
            <div className="physical-dashboard dashboard-view">
                <section className="report-card physical-dashboard-detail-card">
                    <div className="report-card__header physical-dashboard-detail-card__header">
                        <div>
                            <button type="button" className="physical-dashboard-back-button" onClick={() => setDetailView(null)}>
                                <ArrowLeft aria-hidden="true" />
                                <span>Back to dashboard</span>
                            </button>
                            <h3 className="report-card__title">{titleMap[detailView]}</h3>
                        </div>
                        <button type="button" className="btn btn-primary btn-responsive" onClick={downloadDetailView}>
                            <Download className="btn-symbol" aria-hidden="true" />
                            <span className="btn-text">Download XLSX</span>
                        </button>
                    </div>
                    <div className="data-table-toolbar physical-dashboard-detail-toolbar">
                        <div className="data-table-search-wrap">
                            <Search aria-hidden="true" />
                            <input
                                className="data-table-search"
                                type="search"
                                value={detailSearch}
                                onChange={event => setDetailSearch(event.target.value)}
                                placeholder="Search this report..."
                            />
                        </div>
                    </div>
                    <div className="data-table-scroll custom-scrollbar">
                        <table className="data-table physical-dashboard-detail-table">
                            <thead>
                                <tr>
                                    {headers.map(header => <th key={header}>{header}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredDetailRows.length > 0 ? filteredDetailRows.map((row, index) => (
                                    <tr key={index}>
                                        {headers.map(header => <td key={header}>{String((row as any)[header] ?? '')}</td>)}
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={headers.length} className="text-center italic text-gray-500 dark:text-gray-400">
                                            No records found for the selected filters.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>
            </div>
        );
    }

    return (
        <div className="physical-dashboard dashboard-view">
            <section className="physical-dashboard-hero report-card">
                <div>
                    <h2>Physical Accomplishment Dashboard</h2>
                    <p>Monitoring targets and accomplishments of 4K Program implementation</p>
                </div>
                <div className="physical-dashboard-controls">
                    <label>
                        <span>View</span>
                        <select value={viewMode} onChange={event => setViewMode(event.target.value as ViewMode)} className="form-control">
                            <option value="Annual">Annual</option>
                            <option value="Monthly">Monthly</option>
                        </select>
                    </label>
                    <label>
                        <span>As of</span>
                        <select value={asOfMonth} onChange={event => setAsOfMonth(Number(event.target.value))} className="form-control">
                            {monthNames.map((month, index) => <option key={month} value={index}>{month}</option>)}
                        </select>
                    </label>
                </div>
            </section>

            <section className="dashboard-section" aria-labelledby="physical-executive-summary">
                <SectionHeader title="Executive Summary" meta={`${selectedOu === 'All' ? 'All OUs' : selectedOu} / ${selectedYear}`} />
                <div className="physical-dashboard-kpi-grid">
                    {analytics.metrics.map(metric => (
                        <PhysicalMetricCard
                            key={metric.id}
                            metric={metric}
                            viewMode={viewMode}
                            asOfMonth={asOfMonth}
                            cumulativeLabel={analytics.cumulativeCutoff.label}
                            expanded={expandedCards.has(metric.id)}
                            onToggleExpand={() => {
                                setExpandedCards(prev => {
                                    const next = new Set(prev);
                                    if (next.has(metric.id)) next.delete(metric.id);
                                    else next.add(metric.id);
                                    return next;
                                });
                            }}
                            onOpen={() => openMetricModal(metric)}
                        />
                    ))}
                </div>
            </section>

            <section className="physical-dashboard-main-grid">
                <article className="report-card physical-dashboard-chart-card">
                    <SectionHeader
                        title="National Target vs Accomplishment"
                        meta={viewMode}
                        actionLabel="View Full Report"
                        onAction={() => openDetailView('national')}
                    />
                    <div className="physical-dashboard-horizontal-chart">
                        {analytics.metrics.slice(0, 6).map(metric => {
                            const scope = activeScope(metric);
                            return (
                                <div key={metric.id} className="physical-dashboard-horizontal-row">
                                    <span>{metric.label}</span>
                                    <div>
                                        <i className="physical-dashboard-horizontal-row__target" style={{ width: `${Math.max(4, (scope.target / chartMax) * 100)}%` }} />
                                        <i className="physical-dashboard-horizontal-row__actual" style={{ width: `${Math.max(scope.actual > 0 ? 4 : 0, (scope.actual / chartMax) * 100)}%` }} />
                                    </div>
                                    <strong>{scope.actual.toLocaleString()} / {scope.target.toLocaleString()}</strong>
                                </div>
                            );
                        })}
                    </div>
                    <div className="physical-dashboard-legend">
                        <span><i className="physical-dashboard-legend__target" /> Target</span>
                        <span><i className="physical-dashboard-legend__actual" /> Accomplishment</span>
                    </div>
                </article>

                <article className="report-card physical-dashboard-province-card">
                    <SectionHeader
                        title={allOuMode ? 'OU / Province Performance Summary' : 'Province Performance Summary'}
                        actionLabel={allOuMode ? 'View All OUs' : 'View All Provinces'}
                        onAction={() => openDetailView('provinces')}
                    />
                    <div className="data-table-scroll custom-scrollbar">
                        <table className="data-table physical-dashboard-province-table">
                            <thead>
                                <tr>
                                    <th>{allOuMode ? 'OU / Province' : 'Province'}</th>
                                    <th>IPOs</th>
                                    <th>Subprojects</th>
                                    <th>Trainings</th>
                                    <th>Rate</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {allOuMode ? analytics.ouRows.slice(0, 8).map(row => {
                                    const isExpanded = expandedOus.has(row.ou);
                                    const childRows = analytics.provinceRows.filter(province => province.ou === row.ou);
                                    return (
                                        <React.Fragment key={row.ou}>
                                            <tr className="physical-dashboard-ou-row">
                                                <td>
                                                    <button
                                                        type="button"
                                                        className="physical-dashboard-row-toggle"
                                                        onClick={() => setExpandedOus(prev => {
                                                            const next = new Set(prev);
                                                            if (next.has(row.ou)) next.delete(row.ou);
                                                            else next.add(row.ou);
                                                            return next;
                                                        })}
                                                    >
                                                        <ChevronRight className={isExpanded ? 'is-open' : ''} aria-hidden="true" />
                                                        <strong>{row.ou}</strong>
                                                    </button>
                                                </td>
                                                <td>{row.actualIpos} / {row.targetIpos}</td>
                                                <td>{row.actualSubprojects} / {row.targetSubprojects}</td>
                                                <td>{row.actualTrainings} / {row.targetTrainings}</td>
                                                <td><ProgressPill actual={row.actualIpos + row.actualSubprojects + row.actualTrainings} target={row.targetIpos + row.targetSubprojects + row.targetTrainings} /></td>
                                                <td><StatusBadge actual={row.actualIpos + row.actualSubprojects + row.actualTrainings} target={row.targetIpos + row.targetSubprojects + row.targetTrainings} /></td>
                                            </tr>
                                            {isExpanded && childRows.map(child => (
                                                <tr key={child.key} className="physical-dashboard-province-child-row">
                                                    <td>{child.province}</td>
                                                    <td>{child.actualIpos} / {child.targetIpos}</td>
                                                    <td>{child.actualSubprojects} / {child.targetSubprojects}</td>
                                                    <td>{child.actualTrainings} / {child.targetTrainings}</td>
                                                    <td><ProgressPill actual={child.actualIpos + child.actualSubprojects + child.actualTrainings} target={child.targetIpos + child.targetSubprojects + child.targetTrainings} /></td>
                                                    <td><StatusBadge actual={child.actualIpos + child.actualSubprojects + child.actualTrainings} target={child.targetIpos + child.targetSubprojects + child.targetTrainings} /></td>
                                                </tr>
                                            ))}
                                        </React.Fragment>
                                    );
                                }) : analytics.provinceRows.slice(0, 8).map(row => (
                                    <tr key={row.key}>
                                        <td><strong>{row.province}</strong></td>
                                        <td>{row.actualIpos} / {row.targetIpos}</td>
                                        <td>{row.actualSubprojects} / {row.targetSubprojects}</td>
                                        <td>{row.actualTrainings} / {row.targetTrainings}</td>
                                        <td><ProgressPill actual={row.actualIpos + row.actualSubprojects + row.actualTrainings} target={row.targetIpos + row.targetSubprojects + row.targetTrainings} /></td>
                                        <td><StatusBadge actual={row.actualIpos + row.actualSubprojects + row.actualTrainings} target={row.targetIpos + row.targetSubprojects + row.targetTrainings} /></td>
                                    </tr>
                                ))}
                                {analytics.provinceRows.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="text-center italic text-gray-500 dark:text-gray-400">No province data available.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </article>
            </section>

            <section className="physical-dashboard-main-grid physical-dashboard-main-grid--lower">
                <article className="report-card physical-dashboard-trend-card">
                    <SectionHeader
                        title="Monthly Accomplishment Trend"
                        meta="Target vs Accomplishment"
                        actionLabel="View Trend Report"
                        onAction={() => openDetailView('trend')}
                    />
                    <div className="physical-dashboard-line-chart">
                        <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Monthly accomplishment trend">
                            <polyline points={trendPoints('target')} className="physical-dashboard-line-chart__target" />
                            <polyline points={trendPoints('actual')} className="physical-dashboard-line-chart__actual" />
                        </svg>
                        <div className="physical-dashboard-line-chart__labels">
                            {shortMonthNames.map(month => <span key={month}>{month}</span>)}
                        </div>
                    </div>
                    <div className="physical-dashboard-legend">
                        <span><i className="physical-dashboard-legend__target" /> Target</span>
                        <span><i className="physical-dashboard-legend__actual" /> Accomplishment</span>
                    </div>
                </article>

                <article className="report-card physical-dashboard-alert-card">
                    <SectionHeader title="Key Insights & Alerts" actionLabel="View All Alerts" onAction={() => openDetailView('alerts')} />
                    <div className="physical-dashboard-alert-list">
                        {(analytics.alerts.length > 0 ? analytics.alerts.slice(0, 4) : [{ title: 'No critical alerts for the selected filters.', details: 'Physical accomplishments are within available target context.', tone: 'good' }]).map((alert, index) => (
                            <div key={index} className={`physical-dashboard-alert physical-dashboard-alert--${alert.tone}`}>
                                <AlertTriangle aria-hidden="true" />
                                <div>
                                    <strong>{alert.title}</strong>
                                    <span>{alert.details}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </article>
            </section>

            <section className="physical-dashboard-footer-grid">
                <article className="report-card physical-dashboard-list-card">
                    <SectionHeader title="Top Performers" actionLabel="View All Rankings" onAction={() => openDetailView('rankings')} />
                    <div className="physical-dashboard-performer-list">
                        {analytics.topPerformers.slice(0, 4).map((row, index) => (
                            <div key={row.key} className="physical-dashboard-performer">
                                <span>{index + 1}</span>
                                <div>
                                    <strong>{row.province}</strong>
                                    <small>{row.ou}</small>
                                    <ProgressPill actual={row.actualIpos + row.actualSubprojects + row.actualTrainings} target={row.targetIpos + row.targetSubprojects + row.targetTrainings} />
                                </div>
                                <b>{row.rate}%</b>
                            </div>
                        ))}
                        {analytics.topPerformers.length === 0 && <p className="dashboard-empty">No performer data available.</p>}
                    </div>
                </article>

                <article className="report-card physical-dashboard-list-card">
                    <SectionHeader title="Recent Data Submissions" actionLabel="View All Submissions" onAction={() => openDetailView('submissions')} />
                    <div className="physical-dashboard-submission-list">
                        {analytics.submissions.slice(0, 5).map(row => (
                            <div key={row.id} className="physical-dashboard-submission">
                                <Clock aria-hidden="true" />
                                <div>
                                    <strong>{row.name}</strong>
                                    <span>{row.type} | {row.component} | {row.operatingUnit}</span>
                                    <span>Completed: {formatDate(row.completionDate)}</span>
                                </div>
                                <time>{formatDateTime(row.editedAt)}</time>
                            </div>
                        ))}
                        {analytics.submissions.length === 0 && <p className="dashboard-empty">No recent submissions available.</p>}
                    </div>
                </article>
            </section>

            {localModal && (
                <div className="dashboard-modal-backdrop" onClick={() => setLocalModal(null)}>
                    <div className="dashboard-modal dashboard-modal--wide" onClick={event => event.stopPropagation()}>
                        <div className="dashboard-modal__header">
                            <div>
                                <h3>{localModal.title}</h3>
                                <p className="dashboard-modal__metric-subtext">{viewMode} | Year: {selectedYear}</p>
                            </div>
                            <div className="dashboard-modal__actions">
                                <button type="button" onClick={handleDownloadModalExcel} className="btn btn-primary btn-responsive">
                                    <Download className="btn-symbol" aria-hidden="true" />
                                    <span className="btn-text">Excel</span>
                                </button>
                                <button type="button" onClick={() => setLocalModal(null)} className="dashboard-modal__close" aria-label="Close modal">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                        <div className="data-tabs dashboard-modal-tabs">
                            <button type="button" onClick={() => setModalTab('targets')} className={`data-tab ${modalTab === 'targets' ? 'is-active' : ''}`}>
                                Targets ({localModal.targets.length})
                            </button>
                            <button type="button" onClick={() => setModalTab('accomplishments')} className={`data-tab ${modalTab === 'accomplishments' ? 'is-active' : ''}`}>
                                Accomplishments ({localModal.accomplishments.length})
                            </button>
                        </div>
                        <div className="dashboard-modal__body custom-scrollbar">
                            {(modalTab === 'targets' ? localModal.targets : localModal.accomplishments).length > 0 ? (
                                <div className="dashboard-modal__stack">
                                    {Object.entries((modalTab === 'targets' ? localModal.targets : localModal.accomplishments).reduce((acc, item) => {
                                        const ou = item.operatingUnit || 'Unknown OU';
                                        if (!acc[ou]) acc[ou] = [];
                                        acc[ou].push(item);
                                        return acc;
                                    }, {} as Record<string, ModalItemWithOu[]>)).sort(([a], [b]) => a.localeCompare(b)).map(([ou, groupedItems]) => {
                                        const items = groupedItems as ModalItemWithOu[];
                                        return (
                                            <div key={ou} className="dashboard-modal-group">
                                                <div className="dashboard-modal-group__heading">
                                                    <span>{ou}</span>
                                                    <div />
                                                </div>
                                                <ul className="dashboard-modal__stack">
                                                    {items.map((item, index) => (
                                                        <li
                                                            key={`${item.id}-${index}`}
                                                            className={`dashboard-modal__event ${localModal.type !== 'provinces' ? 'dashboard-modal__event--clickable' : ''}`}
                                                            onClick={() => localModal.type !== 'provinces' && handleItemClick(item)}
                                                        >
                                                            <p className="dashboard-modal__metric-value">{item.name}</p>
                                                            {item.details && <p className="dashboard-modal__metric-subtext">{item.details}</p>}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="dashboard-modal__empty">
                                    <p>No records found for this view.</p>
                                </div>
                            )}
                        </div>
                        <div className="dashboard-modal__footer-note">
                            {localModal.type === 'provinces' ? 'Province entries are summary records.' : 'Tip: Click on an item to view its profile.'}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PhysicalDashboard;
