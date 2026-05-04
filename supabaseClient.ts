// Author: 4K 
import { createClient } from '@supabase/supabase-js';

// Static detection for Vite build-time replacement
const SB_URL = import.meta.env.VITE_SUPABASE_URL || (typeof process !== 'undefined' ? process.env.VITE_SUPABASE_URL : '');
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || (typeof process !== 'undefined' ? process.env.VITE_SUPABASE_ANON_KEY : '');

const getEnvVar = (key: string) => {
    // 1. Check Vite's import.meta.env (standard for client-side)
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
        return import.meta.env[key];
    }
    // 2. Check process.env (mapped in vite.config.ts)
    if (typeof process !== 'undefined' && process.env && (process.env as any)[key]) {
        return (process.env as any)[key];
    }
    // 3. Check window._env_ (runtime injection)
    if (typeof window !== 'undefined' && (window as any)._env_ && (window as any)._env_[key]) {
        return (window as any)._env_[key];
    }
    return '';
};

const supabaseUrl = SB_URL || getEnvVar('VITE_SUPABASE_URL') || getEnvVar('SUPABASE_URL');
const supabaseKey = SB_KEY || getEnvVar('VITE_SUPABASE_ANON_KEY') || getEnvVar('VITE_SUPABASE_KEY') || getEnvVar('SUPABASE_ANON_KEY') || getEnvVar('SUPABASE_KEY');

// Log keys present (without full values) to help debug
if (typeof window !== 'undefined') {
    console.log("Supabase Client Init:", {
        hasUrl: !!supabaseUrl,
        urlLength: supabaseUrl?.length,
        hasKey: !!supabaseKey,
        keyLength: supabaseKey?.length,
        env: import.meta.env.MODE
    });
}

if (!supabaseUrl || !supabaseKey) {
    console.warn('Supabase URL or Key is missing. Database features will be disabled.');
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
            timeout: 30000, 
        }
    }) 
    : null;
// --- End of supabaseClient.ts ---
