// Author: 4K 
import { createClient } from '@supabase/supabase-js';

// Standard Vite Env Vars
const ENV_URL = import.meta.env.VITE_SUPABASE_URL;
const ENV_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_KEY;

// Process Env Vars (mapped via define in vite.config.ts)
const PROC_URL = typeof process !== 'undefined' ? (process.env.VITE_SUPABASE_URL || (process.env as any).SUPABASE_URL) : '';
const PROC_KEY = typeof process !== 'undefined' ? (process.env.VITE_SUPABASE_ANON_KEY || (process.env as any).SUPABASE_ANON_KEY) : '';

const supabaseUrl = ENV_URL || PROC_URL || '';
const supabaseKey = ENV_KEY || PROC_KEY || '';

if (typeof window !== 'undefined') {
    console.log("Supabase Client Diagnostic:", {
        urlSource: ENV_URL ? 'import.meta.env' : (PROC_URL ? 'process.env' : 'none'),
        keySource: ENV_KEY ? 'import.meta.env' : (PROC_KEY ? 'process.env' : 'none'),
        urlValid: supabaseUrl.startsWith('https://'),
        urlLength: supabaseUrl.length,
        keyLength: supabaseKey.length,
        mode: import.meta.env.MODE
    });
}

if (!supabaseUrl || !supabaseKey) {
    console.error('CRITICAL: Supabase URL or Key is missing. Check Vercel/Local Environment Variables.');
}

export const supabase = (supabaseUrl && supabaseKey) 
    ? createClient(supabaseUrl, supabaseKey, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            storageKey: 'npmoms-auth-token',
            storage: typeof window !== 'undefined' ? window.localStorage : undefined
        },
        realtime: {
            timeout: 60000, // 60s for realtime consistency
        },
        global: {
            fetch: (url, options) => {
                return fetch(url, options).catch(err => {
                    console.error("Supabase Lower-Level Fetch Error:", { url, err });
                    throw err;
                });
            }
        }
    }) 
    : null;
// --- End of supabaseClient.ts ---
