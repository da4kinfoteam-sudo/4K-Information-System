// Author: 4K
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { HistoryEntry } from '../constants';
import { useAuth } from '../contexts/AuthContext';

export const useIpoHistory = (ipoId?: number) => {
    const [history, setHistory] = useState<HistoryEntry[]>([]);
    const { currentUser } = useAuth();

    const fetchHistory = useCallback(async () => {
        if (!supabase || !ipoId) return;

        const { data, error } = await supabase
            .from('ipo_history')
            .select('*')
            .eq('ipo_id', ipoId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error("Error fetching IPO history:", error);
        } else if (data) {
            setHistory(data as HistoryEntry[]);
        }
    }, [ipoId]);

    useEffect(() => {
        fetchHistory();
    }, [fetchHistory]);

    const addIpoHistory = async (ipoId: number, event: string, user: string) => {
        if (!supabase) return;

        const { error } = await supabase
            .from('ipo_history')
            .insert([{
                ipo_id: ipoId,
                event: event,
                user: user,
                date: new Date().toISOString(),
                created_at: new Date().toISOString()
            }]);

        if (error) {
            console.error("Error adding IPO history:", error);
        } else {
            // If currently viewing this IPO, refresh list
            fetchHistory();
        }
    };

    return { history, addIpoHistory, refreshHistory: fetchHistory };
};
