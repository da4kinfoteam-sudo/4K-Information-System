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
            fetch: async (url, options) => {
                const maxRetries = 2;
                let lastError;
                
                for (let i = 0; i <= maxRetries; i++) {
                    try {
                        const response = await fetch(url, options);
                        if (response.status >= 500 && i < maxRetries) {
                            await new Promise(r => setTimeout(r, 1000 * (i + 1)));
                            continue;
                        }
                        return response;
                    } catch (err: any) {
                        lastError = err;
                        if (i < maxRetries) {
                            console.warn(`Supabase Fetch Attempt ${i + 1} failed, retrying...`, err.message);
                            await new Promise(r => setTimeout(r, 1000 * (i + 1)));
                        }
                    }
                }
                console.error("Supabase Global Fetch Failed after retries:", lastError);
                throw lastError;
            }
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
