import type { DcfRevisionSnapshot } from './dcfRevisionHistory';
import { summarizeDisbursements } from './disbursementUtils';
import { getActivityDisplayTitle } from '../supabase/functions/_shared/activityTitles';

export type HistoricalRecord = Record<string, unknown>;
export const historicalMonths = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
];
export const historicalMissing = 'Not Recorded In This Version';
export const historicalObject = (value: unknown): HistoricalRecord =>
    value && typeof value === 'object' && !Array.isArray(value) ? (value as HistoricalRecord) : {};
export const historicalRows = (value: unknown): HistoricalRecord[] =>
    Array.isArray(value) ? value.map(historicalObject) : [];
export const historicalNumber = (value: unknown): number | undefined => {
    const number =
        typeof value === 'number'
            ? value
            : typeof value === 'string' && /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())
              ? Number(value)
              : undefined;
    return number !== undefined && Number.isFinite(number) ? number : undefined;
};
export const historicalSum = (values: unknown[]): number | undefined =>
    values.every((value) => historicalNumber(value) !== undefined)
        ? values.reduce<number>((sum, value) => sum + historicalNumber(value)!, 0)
        : undefined;
export const historicalText = (value: unknown): string =>
    value === undefined
        ? historicalMissing
        : value === null || value === ''
          ? 'Not Set'
          : typeof value === 'boolean'
            ? value
                ? 'Yes'
                : 'No'
            : typeof value === 'number'
              ? value.toLocaleString('en-PH')
              : typeof value === 'string'
                ? value
                : historicalMissing;
export const historicalYear = (value: unknown): string =>
    typeof value === 'number' || typeof value === 'string' ? String(value) : historicalText(value);
export const historicalCurrency = (value: unknown): string =>
    value === null || value === ''
        ? 'Not Set'
        : historicalNumber(value) === undefined
          ? historicalMissing
          : new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(
                historicalNumber(value)!,
            );
export function historicalDate(
    value: unknown,
    monthOnly = false,
    monthFormat: 'long' | 'short' | 'numeric' = 'long',
): string {
    if (value === undefined) return historicalMissing;
    if (value === null || value === '') return 'Not Set';
    if (typeof value !== 'string' || !/^\d{4}-\d{2}(?:-\d{2})?(?:T.*)?$/.test(value))
        return historicalText(value);
    const [year, month, day] = value.slice(0, 10).split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day || 1));
    return Number.isFinite(date.valueOf()) &&
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === (day || 1)
        ? date.toLocaleDateString('en-US', {
              year: 'numeric',
              month: monthFormat,
              ...(monthOnly ? {} : { day: 'numeric' }),
              timeZone: 'UTC',
          })
        : historicalText(value);
}

export function historicalTitle(snapshot: DcfRevisionSnapshot): string {
    const record = snapshot.record;
    const title =
        snapshot.entityType === 'activities'
            ? getActivityDisplayTitle(record)
            : snapshot.entityType === 'subprojects'
              ? record.name
              : snapshot.entityType === 'office_requirements'
                ? record.equipment
                : snapshot.entityType === 'staffing_requirements'
                  ? record.personnelPosition
                  : record.particulars;
    return typeof title === 'string' && title ? title : 'Historical Record';
}

// Resolve each saved stage once. An explicitly empty managed stage must not revive embedded actuals.
export function historicalFinancialLine(
    snapshot: DcfRevisionSnapshot,
    line: HistoricalRecord,
    parent = false,
): HistoricalRecord {
    const result = { ...line };
    for (const stage of ['obligation', 'disbursement'] as const) {
        const state = historicalObject(
            parent
                ? (snapshot.financial.stages.null ??
                      snapshot.financial.stages[''] ??
                      snapshot.financial.stages.$parent)
                : snapshot.financial.stages[String(line.id)],
        );
        const saved = historicalObject(state[stage]);
        const arrayKey = stage === 'obligation' ? 'obligations' : 'disbursements';
        const amountKey = stage === 'obligation' ? 'actualObligationAmount' : 'actualDisbursementAmount';
        const dateKey = stage === 'obligation' ? 'actualObligationDate' : 'actualDisbursementDate';
        const central = snapshot.financial[arrayKey].filter((entry) => {
            const itemId = entry.item_id ?? entry.itemId;
            return parent ? itemId == null || itemId === '$parent' : String(itemId) === String(line.id);
        });
        const entries = Array.isArray(saved.entries)
            ? historicalRows(saved.entries)
            : central.length
              ? central
              : Array.isArray(line[arrayKey]) && historicalRows(line[arrayKey]).length
                ? historicalRows(line[arrayKey])
                : undefined;
        if (!entries) continue;
        const normalized: HistoricalRecord[] = entries.map((entry) => ({
            ...entry,
            date: entry.date ?? entry[`${stage}_date`],
        }));
        result[arrayKey] = normalized;
        result[amountKey] = historicalSum(normalized.map((entry) => entry.amount));
        const dates = normalized
            .map((entry) => entry.date)
            .filter((date): date is string => typeof date === 'string' && !!date)
            .sort();
        // Staffing's parent obligation date represents Date Hired, not a financial ledger date.
        if (!(parent && snapshot.entityType === 'staffing_requirements' && stage === 'obligation'))
            result[dateKey] = dates.at(-1) ?? null;
        if (stage === 'disbursement') {
            const complete = normalized.every(
                (entry) =>
                    typeof entry.date === 'string' &&
                    /^\d{4}-\d{2}-\d{2}$/.test(entry.date) &&
                    historicalNumber(entry.amount) !== undefined,
            );
            // Neutralize legacy monthly fallbacks for every module, including managed-empty Subprojects.
            // Do not invoke the live helper's undated-entry/current-year fallback for incomplete evidence.
            const monthly = complete
                ? summarizeDisbursements(normalized as { date: string; amount: number }[]).monthlyFields
                : undefined;
            for (const month of historicalMonths)
                result[`actualDisbursement${month}`] = monthly?.[`actualDisbursement${month}`];
        }
    }
    return result;
}

export function historicalRecord(snapshot: DcfRevisionSnapshot): HistoricalRecord {
    const record = historicalFinancialLine(snapshot, snapshot.record, true);
    for (const field of [
        'actualDate',
        'actualEndDate',
        'actualCompletionDate',
        'actualMaleBeneficiaries',
        'actualFemaleBeneficiaries',
        'actualFourPsBeneficiaries',
        'actualParticipantsMale',
        'actualParticipantsFemale',
        'actualPWD',
        'actualMuslim',
        'actualLGBTQ',
        'actualSoloParent',
        'actualSenior',
        'actualYouth',
    ]) {
        if (!(field in record) && field in snapshot.physical) record[field] = snapshot.physical[field];
    }
    const key = snapshot.entityType === 'subprojects' ? 'details' : 'expenses';
    if (Array.isArray(record[key]))
        record[key] = historicalRows(record[key]).map((line) => historicalFinancialLine(snapshot, line));
    return record;
}

export function historicalFundSource(snapshot: DcfRevisionSnapshot): unknown {
    const saved = historicalObject(snapshot.related.fundSource);
    return saved.label ?? snapshot.record.fundSource;
}

export function historicalMonthlyTotal(record: HistoricalRecord, actual = false): number | undefined {
    return historicalSum(
        historicalMonths.map((month) => record[`${actual ? 'actualDisbursement' : 'disbursement'}${month}`]),
    );
}

export function historicalBudgetAmount(line: HistoricalRecord): number | undefined {
    if (historicalNumber(line.amount) !== undefined) return historicalNumber(line.amount);
    const units = historicalNumber(line.numberOfUnits),
        price = historicalNumber(line.pricePerUnit);
    return units === undefined || price === undefined ? undefined : units * price;
}
