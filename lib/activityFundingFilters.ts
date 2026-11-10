import type { Activity } from '../constants';
import { getActivityParentFundingSources, getActiveActivitySupplementalSources } from './activitySupplementalBudget';

export const ACTIVITY_PARENT_ORIGINS = ['Regular', 'Savings', 'Realignment'];
const columnKeys = new Set(['name', 'component', 'status', 'date', 'fundSourceUid', 'parentFundingOrigin']);

export function normalizeActivityColumnFilters(value: unknown): Record<string, string[]> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).flatMap(([key, raw]) => {
        if (!columnKeys.has(key) || !Array.isArray(raw)) return [];
        const allowed = key === 'parentFundingOrigin' ? ACTIVITY_PARENT_ORIGINS : null;
        const values = [...new Set(raw.filter((entry): entry is string => typeof entry === 'string' && !!entry && (!allowed || allowed.includes(entry))))];
        return values.length ? [[key, values]] : [];
    }));
}

export function matchesActivityFundingFilter(parent: Partial<Activity>, key: string, values: string[]) {
    const sources = key === 'parentFundingOrigin' ? getActivityParentFundingSources(parent) : getActiveActivitySupplementalSources(parent);
    return values.some(value => sources.includes(value as 'Savings' | 'Realignment')
        || (key === 'parentFundingOrigin' && value === 'Regular' && sources.length === 0));
}
