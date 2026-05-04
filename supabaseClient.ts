// Author: 4K 
import { createClient } from '@supabase/supabase-js';

const SB_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_KEY || '';

if (typeof window !== 'undefined') {
    console.log("Supabase Client Init:", {
        hasUrl: !!SB_URL,
        urlPreview: SB_URL ? SB_URL.substring(0, 15) + '...' : 'none',
        hasKey: !!SB_KEY,
        mode: import.meta.env.MODE
    });
}

export const supabase = (SB_URL && SB_KEY) 
    ? createClient(SB_URL, SB_KEY, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
        },
        global: {
            fetch: (...args) => fetch(...args).catch(err => {
                console.error("Supabase Global Fetch Error:", err);
                throw err;
            })
        }
    }) 
    : null;

if (supabase && typeof window !== 'undefined') {
    (window as any).supabaseDiagnostics = {
        supabase,
        SB_URL,
        SB_KEY: SB_KEY ? "Present (Private)" : "Missing",
        ping: async () => {
             const start = Date.now();
             try {
                const { error, data } = await supabase.from('users').select('id').limit(1);
                return { success: !error, error, data, time: Date.now() - start };
             } catch (e) {
                return { success: false, error: e, time: Date.now() - start };
             }
        }
    };
    
    supabase.from('users').select('id').limit(1)
        .then(({ error }) => {
            if (error) console.warn("Initial DB sanity check failed:", error.message);
            else console.log("Initial DB sanity check success.");
        })
        .catch(err => console.error("Initial DB sanity check exception:", err));
}
// --- End of supabaseClient.ts ---
