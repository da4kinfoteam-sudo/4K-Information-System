import type { Activity, OtherProgramExpense, OfficeRequirement, StaffingRequirement, Subproject } from '../constants';

type YearFilter = string | 'All';

export interface FinancialAggregationFilters {
    year: YearFilter;
    operatingUnit?: string | 'All';
    tier?: string | 'All';
    fundType?: string | 'All';
    includeUnapproved?: boolean;
}

export interface FinancialBucket {
    alloc: number;
    obli: number;
    disb: number;
}

export interface FinancialAggregationInput {
    subprojects: Subproject[];
    activities: Activity[];
    officeReqs: OfficeRequirement[];
    staffingReqs: StaffingRequirement[];
    otherProgramExpenses: OtherProgramExpense[];
}

export interface HomepageFinancialStats {
    total: FinancialBucket;
    subprojects: FinancialBucket;
    trainings: FinancialBucket;
}

type FinancialLine = {
    amount?: number;
    pricePerUnit?: number;
    numberOfUnits?: number;
    annualSalary?: number;
    actualObligationAmount?: number;
    actualObligationDate?: string;
    actualDisbursementAmount?: number;
    actualDisbursementDate?: string;
    obligations?: Array<{ amount?: number; date?: string }>;
    disbursements?: Array<{ amount?: number; date?: string }>;
    actualDisbursementJan?: number;
    actualDisbursementFeb?: number;
    actualDisbursementMar?: number;
    actualDisbursementApr?: number;
    actualDisbursementMay?: number;
    actualDisbursementJun?: number;
    actualDisbursementJul?: number;
    actualDisbursementAug?: number;
    actualDisbursementSep?: number;
    actualDisbursementOct?: number;
    actualDisbursementNov?: number;
    actualDisbursementDec?: number;
};

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

const MONTH_KEYS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

const toNumber = (value: unknown) => Number(value) || 0;

const compact = <T,>(items?: Array<T | null | undefined>) => (items || []).filter(Boolean) as T[];

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

const matchesActualYear = (date: string | undefined, fallbackYear: string | number | undefined, selectedYear: YearFilter) => {
    if (selectedYear === 'All') return true;
    const dateYear = getDateYear(date);
    if (dateYear) return dateYear === selectedYear;
    return matchesSelectedYear(fallbackYear, selectedYear);
};

const isApproved = (record: ScopedRecord, includeUnapproved?: boolean) => {
    if (includeUnapproved) return true;
    return !record.workflow_status || record.workflow_status === 'APPROVED';
};

const matchesBaseFilters = (record: ScopedRecord, filters: FinancialAggregationFilters) => {
    if (!isApproved(record, filters.includeUnapproved)) return false;
    if (filters.operatingUnit && filters.operatingUnit !== 'All' && record.operatingUnit !== filters.operatingUnit) return false;
    if (filters.tier && filters.tier !== 'All' && record.tier !== filters.tier) return false;
    if (filters.fundType && filters.fundType !== 'All' && record.fundType !== filters.fundType) return false;
    return true;
};

const isTargetRecord = (record: ScopedRecord, filters: FinancialAggregationFilters) => {
    if (!matchesBaseFilters(record, filters)) return false;
    if (record.status === 'Cancelled') return false;
    return matchesSelectedYear(getRecordYear(record), filters.year);
};

const isActualRecord = (record: ScopedRecord, filters: FinancialAggregationFilters) => matchesBaseFilters(record, filters);

const getAllocation = (line: FinancialLine) => {
    if (line.amount !== undefined) return toNumber(line.amount);
    if (line.pricePerUnit !== undefined || line.numberOfUnits !== undefined) {
        return toNumber(line.pricePerUnit) * toNumber(line.numberOfUnits);
    }
    return toNumber(line.annualSalary);
};

export const getActualObligationTotal = (
    line: FinancialLine,
    options: { year: YearFilter; fallbackYear?: string | number }
) => {
    if (line.obligations && line.obligations.length > 0) {
        return line.obligations.reduce((sum, obligation) => {
            if (!matchesActualYear(obligation.date, options.fallbackYear, options.year)) return sum;
            return sum + toNumber(obligation.amount);
        }, 0);
    }

    if (!matchesActualYear(line.actualObligationDate, options.fallbackYear, options.year)) return 0;
    return toNumber(line.actualObligationAmount);
};

export const getActualDisbursementTotal = (
    line: FinancialLine,
    options: { year: YearFilter; fallbackYear?: string | number }
) => {
    if (line.disbursements && line.disbursements.length > 0) {
        return line.disbursements.reduce((sum, disbursement) => {
            if (!matchesActualYear(disbursement.date, options.fallbackYear, options.year)) return sum;
            return sum + toNumber(disbursement.amount);
        }, 0);
    }

    const monthlyTotal = MONTH_KEYS.reduce((sum, month) => sum + toNumber(line[`actualDisbursement${month}`]), 0);
    if (monthlyTotal > 0) {
        return matchesSelectedYear(options.fallbackYear, options.year) ? monthlyTotal : 0;
    }

    if (!matchesActualYear(line.actualDisbursementDate, options.fallbackYear, options.year)) return 0;
    return toNumber(line.actualDisbursementAmount);
};

const addBucket = (target: FinancialBucket, values: Partial<FinancialBucket>) => {
    target.alloc += values.alloc || 0;
    target.obli += values.obli || 0;
    target.disb += values.disb || 0;
};

const roundedBucket = (bucket: FinancialBucket): FinancialBucket => ({
    alloc: Math.ceil(bucket.alloc),
    obli: Math.ceil(bucket.obli),
    disb: Math.ceil(bucket.disb),
});

export const aggregateHomepageFinancials = (
    data: FinancialAggregationInput,
    filters: FinancialAggregationFilters
): HomepageFinancialStats => {
    const subprojectsBucket: FinancialBucket = { alloc: 0, obli: 0, disb: 0 };
    const trainingsBucket: FinancialBucket = { alloc: 0, obli: 0, disb: 0 };
    const otherActivitiesBucket: FinancialBucket = { alloc: 0, obli: 0, disb: 0 };
    const programManagementBucket: FinancialBucket = { alloc: 0, obli: 0, disb: 0 };

    (data.subprojects || []).forEach(subproject => {
        const fallbackYear = getRecordYear(subproject);
        const details = compact(subproject.details);

        if (isTargetRecord(subproject, filters) && !subproject.isRealignment && !subproject.isSavings) {
            subprojectsBucket.alloc += details.reduce((sum, detail) => sum + getAllocation(detail), 0);
        }

        if (isActualRecord(subproject, filters)) {
            subprojectsBucket.obli += details.reduce((sum, detail) => sum + getActualObligationTotal(detail, { year: filters.year, fallbackYear }), 0);
            subprojectsBucket.disb += details.reduce((sum, detail) => sum + getActualDisbursementTotal(detail, { year: filters.year, fallbackYear }), 0);
        }
    });

    (data.activities || []).forEach(activity => {
        const fallbackYear = getRecordYear(activity);
        const expenses = compact(activity.expenses);
        const targetBucket = activity.type === 'Training' ? trainingsBucket : otherActivitiesBucket;

        if (isTargetRecord(activity, filters) && !activity.isRealignment && !activity.isSavings) {
            targetBucket.alloc += expenses.reduce((sum, expense) => sum + getAllocation(expense), 0);
        }

        if (isActualRecord(activity, filters)) {
            targetBucket.obli += expenses.reduce((sum, expense) => sum + getActualObligationTotal(expense, { year: filters.year, fallbackYear }), 0);
            targetBucket.disb += expenses.reduce((sum, expense) => sum + getActualDisbursementTotal(expense, { year: filters.year, fallbackYear }), 0);
        }
    });

    (data.officeReqs || []).forEach(item => {
        const fallbackYear = getRecordYear(item);
        if (isTargetRecord(item, filters) && !item.isRealignment && !item.isSavings) {
            programManagementBucket.alloc += getAllocation(item);
        }
        if (isActualRecord(item, filters)) {
            programManagementBucket.obli += getActualObligationTotal(item, { year: filters.year, fallbackYear });
            programManagementBucket.disb += getActualDisbursementTotal(item, { year: filters.year, fallbackYear });
        }
    });

    (data.staffingReqs || []).forEach(item => {
        const fallbackYear = getRecordYear(item);
        const expenses = compact(item.expenses);
        const hasExpenseRows = expenses.length > 0;

        if (isTargetRecord(item, filters) && !item.isRealignment && !item.isSavings) {
            programManagementBucket.alloc += hasExpenseRows
                ? expenses.reduce((sum, expense) => sum + getAllocation(expense), 0)
                : getAllocation({ annualSalary: item.annualSalary });
        }

        if (isActualRecord(item, filters)) {
            programManagementBucket.obli += hasExpenseRows
                ? expenses.reduce((sum, expense) => sum + getActualObligationTotal(expense, { year: filters.year, fallbackYear }), 0)
                : getActualObligationTotal(item, { year: filters.year, fallbackYear });

            programManagementBucket.disb += hasExpenseRows
                ? expenses.reduce((sum, expense) => sum + getActualDisbursementTotal(expense, { year: filters.year, fallbackYear }), 0)
                : getActualDisbursementTotal(item, { year: filters.year, fallbackYear });
        }
    });

    (data.otherProgramExpenses || []).forEach(item => {
        const fallbackYear = getRecordYear(item);
        if (isTargetRecord(item, filters) && !item.isRealignment && !item.isSavings) {
            programManagementBucket.alloc += getAllocation(item);
        }
        if (isActualRecord(item, filters)) {
            programManagementBucket.obli += getActualObligationTotal(item, { year: filters.year, fallbackYear });
            programManagementBucket.disb += getActualDisbursementTotal(item, { year: filters.year, fallbackYear });
        }
    });

    const totalBucket: FinancialBucket = { alloc: 0, obli: 0, disb: 0 };
    addBucket(totalBucket, subprojectsBucket);
    addBucket(totalBucket, trainingsBucket);
    addBucket(totalBucket, otherActivitiesBucket);
    addBucket(totalBucket, programManagementBucket);

    return {
        total: roundedBucket(totalBucket),
        subprojects: roundedBucket(subprojectsBucket),
        trainings: roundedBucket(trainingsBucket),
    };
};
