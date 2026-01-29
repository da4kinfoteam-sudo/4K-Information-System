
// Author: 4K 
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';

// Helper to fetch all rows handling pagination limits
export async function fetchAll(tableName: string, orderBy: string = 'id', ascending: boolean = true) {
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

export function useSupabaseTable<T extends { id: number | string }>(
    tableName: string,
    initialData: T[]
): [T[], React.Dispatch<React.SetStateAction<T[]>>] {
    const [data, setData] = useState<T[]>(initialData);
    const [isLoaded, setIsLoaded] = useState(false);

    // 1. Fetch data on mount
    useEffect(() => {
        if (!supabase) return;

        const fetchData = async () => {
            const dbData = await fetchAll(tableName);
            if (dbData && dbData.length > 0) {
                // Determine if we need to parse JSON columns based on your schema.
                // Supabase JS client usually auto-converts JSON columns to objects.
                setData(dbData as T[]);
            }
            setIsLoaded(true);
        };

        fetchData();
    }, [tableName]);

    // 2. Intercept state updates to sync with Supabase
    const setSupabaseData = (action: React.SetStateAction<T[]>) => {
        setData((prev) => {
            const next = typeof action === 'function' ? (action as any)(prev) : action;

            if (supabase && isLoaded) {
                const prevIds = new Set(prev.map(i => i.id));
                const nextIds = new Set(next.map(i => i.id));

                // A. Handle Deletions (Items present in prev but missing in next)
                const itemsToDelete = prev.filter(i => !nextIds.has(i.id));
                if (itemsToDelete.length > 0) {
                    const idsToDelete = itemsToDelete.map(i => i.id);
                    supabase.from(tableName).delete().in('id', idsToDelete).then(res => {
                        if (res.error) console.error(`Error deleting from ${tableName}:`, res.error);
                    });
                }

                // B. Handle Upserts (New items or Modified items)
                // We compare JSON stringified versions to detect changes. 
                // Note: This is a simple diffing strategy. For large datasets, field-level diffing is better.
                const itemsToUpsert = next.filter(n => {
                    const p = prev.find(i => i.id === n.id);
                    // If new (no p) or different (p != n), we upsert
                    return !p || JSON.stringify(p) !== JSON.stringify(n);
                });

                if (itemsToUpsert.length > 0) {
                    supabase.from(tableName).upsert(itemsToUpsert).then(res => {
                        if (res.error) console.error(`Error upserting to ${tableName}:`, res.error);
                    });
                }
            }

            return next;
        });
    };

    return [data, setSupabaseData];
}
