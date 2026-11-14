import { getGadPimmeListStatus } from './gadPimmeScoring';

export const GAD_PIMME_START_YEAR = 2019;
export interface GadPimmeListState {
    search: string;
    status: '' | 'Completed' | 'Incomplete' | 'For Assessment';
    page: number;
    pageSize: number;
    summaryYear: number;
    additionalYears: number[];
}

const validYear = (value: unknown, currentYear: number): value is number =>
    typeof value === 'number' && Number.isInteger(value) && value >= GAD_PIMME_START_YEAR && value <= currentYear;

export const getGadPimmeListYears = (currentYear: number) =>
    Array.from({ length: Math.max(0, currentYear - GAD_PIMME_START_YEAR + 1) }, (_, index) => currentYear - index);

export function normalizeGadPimmeListState(value: unknown, currentYear: number): GadPimmeListState {
    const state = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
    return {
        search: typeof state.search === 'string' ? state.search : '',
        status: typeof state.status === 'string' && ['Completed', 'Incomplete', 'For Assessment'].includes(state.status) ? state.status as GadPimmeListState['status'] : '',
        page: Number.isSafeInteger(state.page) && Number(state.page) > 0 ? Number(state.page) : 1,
        pageSize: [10, 20, 50, 100].includes(Number(state.pageSize)) ? Number(state.pageSize) : 10,
        summaryYear: validYear(state.summaryYear, currentYear) ? state.summaryYear : currentYear,
        additionalYears: Array.isArray(state.additionalYears)
            ? [...new Set(state.additionalYears.filter(year => validYear(year, currentYear) && year !== currentYear))].sort((a, b) => b - a) : [],
    };
}

export interface GadPimmeListAssessment {
    operating_unit: string;
    year: number;
    status?: string | null;
    total_score?: number | null;
}

export function scopeGadPimmeListAssessments<T extends GadPimmeListAssessment>(rows: T[], visibleOus: readonly string[], currentYear: number): T[] {
    const allowed = new Set(visibleOus);
    return rows.filter(row => allowed.has(row.operating_unit) && validYear(row.year, currentYear));
}

export const getGadPimmeSummaryYears = (rows: GadPimmeListAssessment[], currentYear: number) =>
    [...new Set([currentYear, ...rows.map(row => row.year)])].sort((a, b) => b - a);

export function summarizeGadPimmeList(visibleOus: readonly string[], byOuYear: ReadonlyMap<string, GadPimmeListAssessment>, year: number) {
    const counts = { Completed: 0, Incomplete: 0, 'For Assessment': 0 };
    for (const ou of visibleOus) counts[getGadPimmeListStatus(byOuYear.get(`${ou}:${year}`))]++;
    return counts;
}
