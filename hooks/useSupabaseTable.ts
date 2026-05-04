// Author: 4K 
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';

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

    useEffect(() => {
        if (!supabase) return;

        const fetchData = async () => {
            const dbData = await fetchAll(tableName);
            if (dbData && dbData.length > 0) {
                setData(dbData as T[]);
            }
            setIsLoaded(true);
        };

        fetchData();
    }, [tableName]);

    const setSupabaseData = (action: React.SetStateAction<T[]>) => {
        setData((prev) => {
            const next = typeof action === 'function' ? (action as any)(prev) : action;

            if (supabase && isLoaded) {
                const prevIds = new Set(prev.map(i => i.id));
                const nextIds = new Set(next.map(i => i.id));

                const itemsToDelete = prev.filter(i => !nextIds.has(i.id));
                if (itemsToDelete.length > 0) {
                    const idsToDelete = itemsToDelete.map(i => i.id);
                    supabase.from(tableName).delete().in('id', idsToDelete).then(res => {
                        if (res.error) console.error(`Error deleting from ${tableName}:`, res.error);
                    });
                }

                const itemsToUpsert = next.filter(n => {
                    const p = prev.find(i => i.id === n.id);
                    return !p || JSON.stringify(p) !== JSON.stringify(n);
                });

                if (itemsToUpsert.length > 0) {
                    itemsToUpsert.forEach(async (item) => {
                        const isExisting = prev.some(p => p.id === item.id);
                        
                        if (isExisting) {
                            const { id, ...updateData } = item as any;
                            const { error } = await supabase.from(tableName).update(updateData).eq('id', id);
                            if (error) console.error(`Error updating ${tableName} ID ${id}:`, error);
                        } else {
                            const shouldOmitId = typeof item.id === 'number' && item.id > 1700000000000;
                            
                            const payload = { ...item } as any;
                            if (shouldOmitId) delete payload.id;

                            const { data: inserted, error } = await supabase.from(tableName).insert([payload]).select().single();
                            
                            if (error) {
                                console.error(`Error inserting into ${tableName}:`, error);
                            } else if (inserted && shouldOmitId) {
                                setData(prevData => prevData.map(d => d.id === item.id ? inserted : d));
                            }
                        }
                    });
                }
            }

            return next;
        });
    };

    return [data, setSupabaseData];
}
// --- End of useSupabaseTable.ts ---
