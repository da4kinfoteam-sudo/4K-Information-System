import type { RefFundSource } from '../constants';

export const DEFAULT_FUND_SOURCE_UID = 'FS-000001';
export const UNSPECIFIED_FUND_SOURCE_FILTER = '__unspecified_fund_source__';
const LEGACY_FUND_SOURCE_FILTER_PREFIX = '__legacy_fund_source__:';

export interface FundSourceRecord {
    fundSourceUid?: string | null;
    fundSource?: string | null;
}

const LEGACY_FUND_SOURCE_UIDS: Record<string, string> = {
    '4k fund': 'FS-000001',
    'high value crops': 'FS-000002',
    corn: 'FS-000003',
    rice: 'FS-000004',
    organic: 'FS-000005',
    livestock: 'FS-000006',
};

export const normalizeFundSourceLabel = (value: unknown) => String(value ?? '').trim().toLocaleLowerCase();

export const getFundSourceByUid = (uid: string | null | undefined, references: RefFundSource[]) =>
    uid ? references.find(source => source.uid === uid) : undefined;

export const getFundSourceLabel = (record: FundSourceRecord, references: RefFundSource[]) =>
    getFundSourceByUid(record.fundSourceUid, references)?.label || record.fundSource || '';

export const resolveFundSourceUidFromLegacyLabel = (label: string | null | undefined, references: RefFundSource[]) => {
    const normalized = normalizeFundSourceLabel(label);
    if (!normalized) return null;

    const currentLabelMatches = references.filter(source => normalizeFundSourceLabel(source.label) === normalized);
    if (currentLabelMatches.length === 1) return currentLabelMatches[0].uid;
    if (currentLabelMatches.length > 1) return null;

    const legacyUid = LEGACY_FUND_SOURCE_UIDS[normalized];
    return legacyUid && references.some(source => source.uid === legacyUid) ? legacyUid : null;
};

export const getNewSubprojectDefaultFundSource = (references: RefFundSource[]) => {
    const defaultSource = getFundSourceByUid(DEFAULT_FUND_SOURCE_UID, references);
    return defaultSource?.is_active ? defaultSource : undefined;
};

export const getNewFundSourceDefault = getNewSubprojectDefaultFundSource;

export const fundSourceNeedsCloneSelection = (record: FundSourceRecord, references: RefFundSource[]) => {
    const resolvedUid = record.fundSourceUid || resolveFundSourceUidFromLegacyLabel(record.fundSource, references);
    if (resolvedUid) return !getFundSourceByUid(resolvedUid, references)?.is_active;
    if (record.fundSource?.trim()) return true;
    return !getNewFundSourceDefault(references);
};

export const resolveClonedFundSource = (
    record: FundSourceRecord,
    references: RefFundSource[],
    replacementUid?: string | null
) => {
    const resolvedUid = record.fundSourceUid || resolveFundSourceUidFromLegacyLabel(record.fundSource, references);
    const existingSource = getFundSourceByUid(resolvedUid, references);
    if (existingSource?.is_active) return existingSource;
    if (!resolvedUid && !record.fundSource?.trim()) {
        const defaultSource = getNewFundSourceDefault(references);
        if (defaultSource) return defaultSource;
    }
    const replacement = getFundSourceByUid(replacementUid, references);
    return replacement?.is_active ? replacement : undefined;
};

export const getFundSourceFilterValue = (record: FundSourceRecord, references: RefFundSource[]) => {
    if (record.fundSourceUid) return record.fundSourceUid;
    const resolvedUid = resolveFundSourceUidFromLegacyLabel(record.fundSource, references);
    if (resolvedUid) return resolvedUid;
    const normalizedLabel = normalizeFundSourceLabel(record.fundSource);
    return normalizedLabel
        ? `${LEGACY_FUND_SOURCE_FILTER_PREFIX}${normalizedLabel}`
        : UNSPECIFIED_FUND_SOURCE_FILTER;
};

export const getFundSourceFilterOptions = <T extends FundSourceRecord>(records: T[], references: RefFundSource[]) => {
    const options = new Map<string, string>();
    records.forEach(record => {
        const value = getFundSourceFilterValue(record, references);
        if (value === UNSPECIFIED_FUND_SOURCE_FILTER) {
            options.set(value, 'Not specified');
        } else if (value.startsWith(LEGACY_FUND_SOURCE_FILTER_PREFIX)) {
            options.set(value, record.fundSource?.trim() || 'Unmapped legacy value');
        } else {
            const source = getFundSourceByUid(value, references);
            options.set(value, source?.label || record.fundSource || value);
        }
    });
    return Array.from(options, ([value, label]) => ({ value, label }))
        .sort((left, right) => left.label.localeCompare(right.label));
};

export const getFundSourceSortLabel = (record: FundSourceRecord, references: RefFundSource[]) =>
    getFundSourceLabel(record, references).toLocaleLowerCase();

export const sortFundSources = (references: RefFundSource[]) =>
    [...references].sort((a, b) => a.sort_order - b.sort_order || a.uid.localeCompare(b.uid));
