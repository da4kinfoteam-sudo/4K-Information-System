// Author: 4K 
import { createClient } from '@supabase/supabase-js';

const SB_URL = import.meta.env.VITE_SUPABASE_URL || (typeof process !== 'undefined' ? (process.env.VITE_SUPABASE_URL || (process.env as any).SUPABASE_URL) : '') || '';
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_KEY || (typeof process !== 'undefined' ? (process.env.VITE_SUPABASE_ANON_KEY || (process.env as any).SUPABASE_ANON_KEY) : '') || '';

if (typeof window !== 'undefined') {
    console.log("Supabase Client Init:", {
        urlValid: SB_URL.startsWith('https://'),
        keyLength: SB_KEY.length,
        keyCheck: SB_KEY ? `${SB_KEY.substring(0, 5)}...${SB_KEY.substring(SB_KEY.length - 5)}` : 'missing',
        mode: import.meta.env.MODE
    });
}

export const supabase = (SB_URL && SB_KEY) 
    ? createClient(SB_URL, SB_KEY, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
        }
    }) 
    : null;

if (supabase && typeof window !== 'undefined') {
    (window as any).supabaseDiagnostics = {
        supabase,
        SB_URL,
        ping: async () => {
             const start = Date.now();
             try {
                const { error, data } = await supabase.from('users').select('id', { head: true, count: 'exact' }).limit(1);
                return { success: !error, error, data, time: Date.now() - start };
             } catch (e) {
                return { success: false, error: e, time: Date.now() - start };
             }
        }
    };
    
    // Initial sanity check
    supabase.from('users').select('id', { head: true, count: 'exact' }).limit(1)
        .then(({ error }) => {
            if (error) {
                console.warn("Initial DB sanity check failed:", error.message);
                if (error.message.includes('Unauthorized') || error.code === '401') {
                    console.error("CRITICAL: 401 Unauthorized. The provided Anon Key is likely invalid for this URL.");
                }
            } else {
                console.log("Initial DB sanity check success.");
            }
        })
        .catch(err => console.error("Initial DB sanity check exception:", err));
}
// --- End of supabaseClient.ts ---
