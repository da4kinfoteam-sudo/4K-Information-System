// Author: 4K
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { HistoryEntry } from '../constants';
import { useAuth } from '../contexts/AuthContext';

export interface IpoHistoryEntry {
    id: number;
    ipo_id: number;
    event: string;
    user: string;
    date: string;
    created_at: string;
}

export const useIpoHistory = (currentIpoId?: number) => {
    const [history, setHistory] = useState<IpoHistoryEntry[]>([]);
    const { currentUser } = useAuth();

    const fetchHistory = useCallback(async () => {
        if (!supabase || !currentIpoId) return;

        const { data, error } = await supabase
            .from('ipo_history')
            .select('*')
            .eq('ipo_id', currentIpoId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error("Error fetching IPO history:", error);
        } else if (data) {
            setHistory(data as IpoHistoryEntry[]);
        }
    }, [currentIpoId]);

    useEffect(() => {
        fetchHistory();
    }, [fetchHistory]);

    const addIpoHistory = async (ipoId: number, event: string) => {
        if (!supabase) return;

        const user = currentUser?.fullName || 'System';

        const { error } = await supabase
            .from('ipo_history')
            .insert([{
                ipo_id: ipoId,
                event: event,
                user: user,
                date: new Date().toISOString()
            }]);

        if (error) {
            console.error("Error adding IPO history:", error);
        } else {
            // If currently viewing this IPO, refresh list
            if (currentIpoId === ipoId) {
                fetchHistory();
            }
        }
    };

    return { history, addIpoHistory, refreshHistory: fetchHistory };
};
