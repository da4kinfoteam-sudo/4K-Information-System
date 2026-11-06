// Author: 4K 
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../supabaseClient';
import type { User } from '../constants';
import { dcfChangedFields, deleteDcfRecord, persistDcfMutation, type DcfEntityType } from '../lib/dcfMutation';

const DCF_TABLES = new Set<string>(['subprojects', 'activities', 'office_requirements', 'staffing_requirements', 'other_program_expenses']);

export async function fetchAll(tableName: string, orderBy: string = 'id', ascending: boolean = true, throwOnError: boolean = false) {
    if (!supabase) return [];
    
    let allData: any[] = [];
    let from = 0;
    const step = 1000;
    let more = true;

    while (more) {
        const { data, error } = await supabase
            .from(tableName)
            .select('*')
            .order(orderBy, { ascending })
            .range(from, from + step - 1);

        if (error) {
            console.error(`Error fetching ${tableName}:`, error);
            if (throwOnError) {
                throw error;
            }
            break;
        }

        if (data && data.length > 0) {
            allData = [...allData, ...data];
            if (data.length < step) {
                more = false;
            } else {
                from += step;
            }
        } else {
            more = false;
        }
    }
    return allData;
}

export interface SupabaseTableSyncState {
    refresh: () => Promise<void>;
    replaceLocalData: (nextData: any[]) => void;
    upsertLocalData: (records: any[]) => void;
    setLocalData: React.Dispatch<React.SetStateAction<any[]>>;
    flushPendingWrites: () => Promise<void>;
    isLoading: boolean;
    lastFetchedAt: string | null;
    error: string | null;
}

export interface SupabaseTableOptions<T> {
    autoFetch?: boolean;
    fetcher?: () => Promise<T[]>;
    actor?: User;
}

export function useSupabaseTable<T extends { id: number | string }>(
    tableName: string,
    initialData: T[],
    options: SupabaseTableOptions<T> = {}
): [T[], React.Dispatch<React.SetStateAction<T[]>>, SupabaseTableSyncState] {
    const [data, setData] = useState<T[]>(initialData);
    const dataRef = useRef(data);
    const loadedRef = useRef(false);
    const writeQueue = useRef<Promise<void>>(Promise.resolve());
    const writeFailed = useRef(false);
    const idMappings = useRef(new Map<T['id'], T['id']>());
    const scope = `${tableName}:${options.actor?.id ?? ''}`;
    const scopeRef = useRef(scope);
    if (scopeRef.current !== scope) {
        scopeRef.current = scope;
        loadedRef.current = false;
        writeFailed.current = false;
        idMappings.current.clear();
    }
    const [isLoading, setIsLoading] = useState(false);
    const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const autoFetch = options.autoFetch !== false;
    const fetcher = options.fetcher;
    const actor = options.actor;

    const setLocalData = useCallback((action: React.SetStateAction<T[]>) => {
        const next = typeof action === 'function' ? action(dataRef.current) : action;
        dataRef.current = next;
        setData(next);
    }, []);

    const refresh = useCallback(async () => {
        if (!supabase) return;
        const requestedScope = scopeRef.current;
        await writeQueue.current;

        setIsLoading(true);
        setError(null);
        try {
            const dbData = fetcher
                ? await fetcher()
                : await fetchAll(tableName, 'id', true, true);
            if (scopeRef.current !== requestedScope) return;
            if (dbData && (dbData.length > 0 || initialData.length === 0)) {
                setLocalData(dbData as T[]);
            }
            setLastFetchedAt(new Date().toISOString());
            loadedRef.current = true;
            writeFailed.current = false;
        } catch (err: any) {
            if (scopeRef.current !== requestedScope) return;
            const message = err?.message || `Unable to fetch ${tableName}.`;
            setError(message);
            console.error(`Error refreshing ${tableName}:`, err);
            throw err;
        } finally {
            if (scopeRef.current === requestedScope) setIsLoading(false);
        }
    }, [fetcher, initialData.length, tableName, setLocalData]);

    useEffect(() => {
        if (!autoFetch) return;
        refresh().catch(() => {
            // Individual refresh errors are stored in hook state and surfaced by callers.
        });
    }, [autoFetch, refresh]);

    const replaceLocalData = useCallback((nextData: any[]) => {
        setLocalData((nextData || []) as T[]);
        setLastFetchedAt(new Date().toISOString());
        setError(null);
        loadedRef.current = true;
    }, [setLocalData]);

    const upsertLocalData = useCallback((records: T[]) => {
        setLocalData(previous => {
            const next = new Map(previous.map(item => [item.id, item]));
            records.forEach(item => next.set(item.id, item));
            return Array.from(next.values());
        });
        setLastFetchedAt(new Date().toISOString());
        setError(null);
        loadedRef.current = true;
    }, [setLocalData]);

    const setSupabaseData = useCallback((action: React.SetStateAction<T[]>) => {
        const previous = dataRef.current;
        const next = typeof action === 'function' ? action(previous) : action;
        setLocalData(next);
        if (!supabase || !loadedRef.current) return;

        const nextIds = new Set(next.map(item => item.id));
        const removed = previous.filter(item => !nextIds.has(item.id));
        const changed = next.flatMap(item => {
            const base = previous.find(row => row.id === item.id);
            const changes = dcfChangedFields(base || {}, item);
            return (!base || Object.keys(changes).length) ? [{ item, base, changes, request: {} }] : [];
        });
        if (!removed.length && !changed.length) return;
        const requestedScope = scopeRef.current;

        // Execute once per caller action, outside React's replayable updater. Later
        // actions wait for confirmation and never retry an uncertain write implicitly.
        const task = async () => {
            if (scopeRef.current !== requestedScope) return;
            if (writeFailed.current) throw new Error('A previous save failed. Refresh this table before saving again.');
            if (DCF_TABLES.has(tableName) && !actor?.id) throw new Error('A signed-in user is required to save DCF changes.');
            for (const base of removed) {
                const id = idMappings.current.get(base.id) ?? base.id;
                if (DCF_TABLES.has(tableName)) {
                    await deleteDcfRecord({ entityType: tableName as DcfEntityType, parentId: Number(id), base, actor: actor!, request: {}, source: 'legacy-setter' });
                } else {
                    const result = await supabase.from(tableName).delete().eq('id', id);
                    if (result.error) throw result.error;
                }
            }
            for (const { item, base, changes, request } of changed) {
                const id = idMappings.current.get(item.id) ?? item.id;
                let confirmed: T | undefined;
                if (DCF_TABLES.has(tableName)) {
                    const result = await persistDcfMutation<T>({ entityType: tableName as DcfEntityType, parentId: base ? Number(id) : null, base: base || {}, changes, actor: actor!, request, source: 'legacy-setter' });
                    confirmed = result.record;
                } else if (base) {
                    const result = await supabase.from(tableName).update(changes).eq('id', id);
                    if (result.error) throw result.error;
                } else {
                    const payload = { ...item } as any;
                    if (typeof id === 'number' && id > 1700000000000) delete payload.id;
                    const result = await supabase.from(tableName).insert([payload]).select().single();
                    if (result.error) throw result.error;
                    confirmed = result.data as T;
                }
                if (confirmed && scopeRef.current === requestedScope) {
                    idMappings.current.set(item.id, confirmed.id);
                    const saved = confirmed;
                    setLocalData(current => current.map(row => row.id === item.id || row.id === saved.id
                        ? { ...saved, ...dcfChangedFields(item, row), id: saved.id } : row));
                }
            }
        };
        writeQueue.current = writeQueue.current.then(task).catch((err: any) => {
            if (scopeRef.current !== requestedScope) return;
            writeFailed.current = true;
            setError(err?.message || `Unable to save ${tableName}.`);
            console.error(`Error saving ${tableName}:`, err);
        });
    }, [actor, tableName, setLocalData]);

    const flushPendingWrites = useCallback(() => writeQueue.current, []);
    return [data, setSupabaseData, { refresh, replaceLocalData, upsertLocalData, setLocalData, flushPendingWrites, isLoading, lastFetchedAt, error }];
}
// --- End of useSupabaseTable.ts ---
