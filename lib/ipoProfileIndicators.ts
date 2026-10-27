import type { IPO } from '../constants';

export const IPO_INDICATOR_FIELDS = ['isF2c2Cluster', 'isFfedisRegistered', 'ffedisRegistrationNumber', 'ffedisRegistrationDate'] as const;
type Indicators = Pick<IPO, typeof IPO_INDICATOR_FIELDS[number]>;

export function isIpoRegistrationDate(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function normalizeIpoIndicators(record: Indicators): Indicators {
    const result: Indicators = {};
    for (const key of ['isF2c2Cluster', 'isFfedisRegistered'] as const) {
        if (record[key] === undefined) continue;
        if (record[key] !== null && typeof record[key] !== 'boolean') throw new Error(`${key} must be TRUE or FALSE.`);
        result[key] = record[key];
    }
    for (const key of ['ffedisRegistrationNumber', 'ffedisRegistrationDate'] as const) {
        if (record[key] === undefined) continue;
        result[key] = record[key]?.trim() || null;
    }
    if (result.ffedisRegistrationDate && !isIpoRegistrationDate(result.ffedisRegistrationDate)) {
        throw new Error('Enter a valid FFEDIS Registration Date in YYYY-MM-DD format.');
    }
    if (result.isFfedisRegistered === true && (!result.ffedisRegistrationNumber || !result.ffedisRegistrationDate)) {
        throw new Error('FFEDIS Registration Number and FFEDIS Registration Date are required when FFEDIS Registered is checked.');
    }
    return result;
}

export function parseImportedIpoIndicators(row: Record<string, unknown>, excelDate: (serial: number) => string): Indicators {
    const result: Indicators = {};
    for (const key of ['isF2c2Cluster', 'isFfedisRegistered'] as const) {
        const value = row[key];
        if (value == null || String(value).trim() === '') continue;
        if (typeof value === 'boolean') result[key] = value;
        else if (typeof value === 'string' && /^(TRUE|FALSE)$/i.test(value.trim())) result[key] = value.trim().toUpperCase() === 'TRUE';
        else throw new Error(`${key} must be TRUE or FALSE.`);
    }
    if (row.ffedisRegistrationNumber != null) result.ffedisRegistrationNumber = String(row.ffedisRegistrationNumber);
    const date = row.ffedisRegistrationDate;
    if (date != null && date !== '') result.ffedisRegistrationDate = typeof date === 'number' ? excelDate(date) : String(date).trim();
    return normalizeIpoIndicators(result);
}

const editableFields = [
    'name', 'location', 'region', 'indigenousCulturalCommunity', 'ancestralDomainNo', 'registeringBody',
    'contactPerson', 'contactNumber', 'registrationDate', 'isWomenLed', 'isWithinGida', 'isWithinElcac',
    'isWithScad', 'commodities', 'levelOfDevelopment', 'totalMembers', 'totalIpMembers', 'totalMaleMembers',
    'totalFemaleMembers', 'totalYouthMembers', 'totalSeniorMembers', 'total4PsMembers', ...IPO_INDICATOR_FIELDS,
] as const;

/** Send intentional profile differences only; do not replay approval or linked-record metadata. */
export function buildIpoProfilePatch(original: IPO, edited: IPO): Partial<IPO> {
    const next = { ...edited, ...normalizeIpoIndicators(edited) };
    return Object.fromEntries(editableFields
        .filter(key => next[key] !== undefined && JSON.stringify(original[key]) !== JSON.stringify(next[key]))
        .map(key => [key, next[key]])) as Partial<IPO>;
}

export function ipoIndicatorHistory(original: IPO, next: IPO): string[] {
    const changes: string[] = [];
    if (original.isF2c2Cluster !== next.isF2c2Cluster) changes.push(`F2C2 Cluster indicator ${next.isF2c2Cluster === true ? 'enabled' : 'disabled'}`);
    if (original.isFfedisRegistered !== next.isFfedisRegistered) changes.push(`FFEDIS Registered indicator ${next.isFfedisRegistered === true ? 'enabled' : 'disabled'}`);
    if (original.ffedisRegistrationNumber !== next.ffedisRegistrationNumber || original.ffedisRegistrationDate !== next.ffedisRegistrationDate) changes.push('Updated FFEDIS registration details');
    return changes;
}
