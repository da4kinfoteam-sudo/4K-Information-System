import { useCallback, useEffect, useState } from 'react';
import { migrateIpoListPreferences, normalizeIpoListPreferences, type IpoListPreferences } from '../lib/ipoListColumns';

export const ipoListPreferenceKey = (userId: number | string) => `4kis:ipo-list:${userId}:v1`;
const readJson = (key: string): unknown => {
    try { const value = localStorage.getItem(key); return value === null ? undefined : JSON.parse(value); }
    catch { return undefined; }
};
function readPreferences(userId: number | string | undefined): IpoListPreferences {
    if (userId === undefined) return normalizeIpoListPreferences(null);
    const stored = readJson(ipoListPreferenceKey(userId));
    if (stored && typeof stored === 'object' && !Array.isArray(stored) && (stored as { version?: unknown }).version === 1) return normalizeIpoListPreferences(stored);
    const prefix = `ipos_${userId}`;
    return migrateIpoListPreferences({ search: readJson(`${prefix}_searchTerm`), region: readJson(`${prefix}_regionFilter`), flags: readJson(`${prefix}_flagFilter`), filters: readJson(`${prefix}_columnFilters`) });
}
export function useIpoListPreferences(userId: number | string | undefined) {
    const [saved, setSaved] = useState(() => ({ userId, value: readPreferences(userId) }));
    // Guard before rendering/writing on account switches, including a still-mounted list.
    const value = saved.userId === userId ? saved.value : readPreferences(userId);
    useEffect(() => {
        if (saved.userId !== userId) { setSaved({ userId, value }); return; }
        if (userId === undefined) return;
        try { localStorage.setItem(ipoListPreferenceKey(userId), JSON.stringify(value)); }
        catch { /* Preferences remain usable when browser storage is unavailable. */ }
    }, [saved, userId, value]);
    const update = useCallback((change: Partial<IpoListPreferences> | ((previous: IpoListPreferences) => IpoListPreferences)) => setSaved(previous => {
        const current = previous.userId === userId ? previous.value : readPreferences(userId);
        const next = normalizeIpoListPreferences(typeof change === 'function' ? change(current) : { ...current, ...change });
        if (JSON.stringify(next.filters) === JSON.stringify(current.filters)) next.filters = current.filters;
        if (JSON.stringify(next.optionalColumns) === JSON.stringify(current.optionalColumns)) next.optionalColumns = current.optionalColumns;
        return { userId, value: next };
    }), [userId]);
    return [value, update] as const;
}
