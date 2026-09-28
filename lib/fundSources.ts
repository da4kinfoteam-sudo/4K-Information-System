import type { RefFundSource, Subproject } from '../constants';

export const DEFAULT_FUND_SOURCE_UID = 'FS-000001';

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

export const getFundSourceLabel = (subproject: Pick<Subproject, 'fundSourceUid' | 'fundSource'>, references: RefFundSource[]) =>
    getFundSourceByUid(subproject.fundSourceUid, references)?.label || subproject.fundSource || '';

export const resolveFundSourceUidFromLegacyLabel = (label: string | null | undefined, references: RefFundSource[]) => {
    const normalized = normalizeFundSourceLabel(label);
    if (!normalized) return null;

    const currentLabelMatch = references.find(source => normalizeFundSourceLabel(source.label) === normalized);
    if (currentLabelMatch) return currentLabelMatch.uid;

    const legacyUid = LEGACY_FUND_SOURCE_UIDS[normalized];
    return legacyUid && references.some(source => source.uid === legacyUid) ? legacyUid : null;
};

export const getNewSubprojectDefaultFundSource = (references: RefFundSource[]) => {
    const defaultSource = getFundSourceByUid(DEFAULT_FUND_SOURCE_UID, references);
    return defaultSource?.is_active ? defaultSource : undefined;
};

export const sortFundSources = (references: RefFundSource[]) =>
    [...references].sort((a, b) => a.sort_order - b.sort_order || a.uid.localeCompare(b.uid));
