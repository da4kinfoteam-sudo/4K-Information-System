import type { DisbursementRecord } from '../constants';

export const ACTUAL_DISBURSEMENT_MONTH_KEYS = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

export type ActualDisbursementMonthKey = typeof ACTUAL_DISBURSEMENT_MONTH_KEYS[number];

type DisbursementLike = {
    id?: number;
    date?: string;
    amount?: number;
    remarks?: string;
};

type MonthlyDisbursementSource = Partial<Record<`actualDisbursement${ActualDisbursementMonthKey}`, number>> & {
    actualDisbursementAmount?: number;
    actualDisbursementDate?: string;
    disbursements?: DisbursementLike[];
};

const toNumber = (value: unknown) => Number(value) || 0;

export const getDisbursementMonthIndex = (dateStr?: string) => {
    if (!dateStr) return undefined;
    const parts = dateStr.split('-');
    if (parts.length >= 2) {
        const month = parseInt(parts[1], 10);
        if (!Number.isNaN(month) && month >= 1 && month <= 12) return month - 1;
    }

    const date = new Date(dateStr);
    return Number.isNaN(date.getTime()) ? undefined : date.getUTCMonth();
};

export const getDisbursementDateYear = (dateStr?: string) => {
    if (!dateStr) return undefined;
    const parts = dateStr.split('-');
    if (parts.length >= 1) {
        const year = parseInt(parts[0], 10);
        if (!Number.isNaN(year)) return year;
    }

    const date = new Date(dateStr);
    return Number.isNaN(date.getTime()) ? undefined : date.getUTCFullYear();
};

export const createMonthDate = (year: string | number | undefined, monthIndex: number) => {
    const numericYear = Number(year);
    const safeYear = Number.isFinite(numericYear) ? numericYear : new Date().getFullYear();
    return `${safeYear}-${String(monthIndex + 1).padStart(2, '0')}-01`;
};

export const getMonthlyActualDisbursementTotal = (line: MonthlyDisbursementSource) =>
    ACTUAL_DISBURSEMENT_MONTH_KEYS.reduce(
        (sum, month) => sum + toNumber(line[`actualDisbursement${month}`]),
        0
    );

export const getActualDisbursementMonthlyFields = (line: MonthlyDisbursementSource) => {
    const fields: Record<`actualDisbursement${ActualDisbursementMonthKey}`, number> = {} as Record<`actualDisbursement${ActualDisbursementMonthKey}`, number>;

    ACTUAL_DISBURSEMENT_MONTH_KEYS.forEach(month => {
        fields[`actualDisbursement${month}`] = toNumber(line[`actualDisbursement${month}`]);
    });

    return fields;
};

export const createDisbursementsFromMonthlyFields = (
    line: MonthlyDisbursementSource,
    fallbackYear?: string | number,
    remarks = 'Synced from monthly matrix'
): DisbursementRecord[] => {
    return ACTUAL_DISBURSEMENT_MONTH_KEYS.flatMap((month, index) => {
        const amount = toNumber(line[`actualDisbursement${month}`]);
        if (amount <= 0) return [];

        return [{
            id: -1 * (index + 1),
            date: createMonthDate(fallbackYear, index),
            amount,
            remarks,
        }];
    });
};

export const resolveDisbursementEntries = (
    line: MonthlyDisbursementSource,
    fallbackYear?: string | number
): DisbursementRecord[] => {
    if (line.disbursements && line.disbursements.length > 0) {
        return line.disbursements.map((entry, index) => ({
            id: entry.id ?? Date.now() + index,
            date: entry.date || line.actualDisbursementDate || createMonthDate(fallbackYear, 11),
            amount: toNumber(entry.amount),
            remarks: entry.remarks,
        }));
    }

    const monthlyEntries = createDisbursementsFromMonthlyFields(line, fallbackYear);
    if (monthlyEntries.length > 0) return monthlyEntries;

    if (toNumber(line.actualDisbursementAmount) > 0) {
        return [{
            id: -99,
            date: line.actualDisbursementDate || createMonthDate(fallbackYear, 11),
            amount: toNumber(line.actualDisbursementAmount),
            remarks: 'Legacy Record',
        }];
    }

    return [];
};

export const summarizeDisbursements = (
    disbursements: DisbursementLike[],
    fallbackYear?: string | number
) => {
    const monthlyFields: Record<`actualDisbursement${ActualDisbursementMonthKey}`, number> = {} as Record<`actualDisbursement${ActualDisbursementMonthKey}`, number>;
    ACTUAL_DISBURSEMENT_MONTH_KEYS.forEach(month => {
        monthlyFields[`actualDisbursement${month}`] = 0;
    });

    let total = 0;
    let latestDate = '';

    disbursements.forEach(entry => {
        const amount = toNumber(entry.amount);
        if (amount <= 0) return;

        const date = entry.date || createMonthDate(fallbackYear, 11);
        const monthIndex = getDisbursementMonthIndex(date) ?? 11;
        const monthKey = ACTUAL_DISBURSEMENT_MONTH_KEYS[monthIndex];

        monthlyFields[`actualDisbursement${monthKey}`] += amount;
        total += amount;

        if (!latestDate || new Date(date).getTime() > new Date(latestDate).getTime()) {
            latestDate = date;
        }
    });

    return {
        monthlyFields,
        total,
        latestDate,
    };
};

