// Author: 4K 
import { createClient } from '@supabase/supabase-js';

const getEnvVar = (key: string) => {
    // 1. Check Vite's import.meta.env (standard for client-side)
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
        return import.meta.env[key];
    }
    // 2. Check process.env (Vite dev or backend)
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
        return process.env[key];
    }
    // 3. Check window._env_ (runtime injection)
    if (typeof window !== 'undefined' && (window as any)._env_ && (window as any)._env_[key]) {
        return (window as any)._env_[key];
    }
    return '';
};

// Log keys present (without full values) to help debug
const logEnvStatus = () => {
    const vars = [
        'VITE_SUPABASE_URL', 'SUPABASE_URL', 
        'VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_KEY', 'SUPABASE_KEY', 'SUPABASE_ANON_KEY'
    ];
    const status = vars.map(v => `${v}: ${getEnvVar(v) ? 'Present (Size: ' + getEnvVar(v).length + ')' : 'Missing'}`);
    console.log("Supabase Env Status:", status.join(' | '));
};

if (typeof window !== 'undefined') {
    logEnvStatus();
}

const supabaseUrl = getEnvVar('VITE_SUPABASE_URL') || getEnvVar('SUPABASE_URL');
const supabaseKey = getEnvVar('VITE_SUPABASE_ANON_KEY') || 
                    getEnvVar('VITE_SUPABASE_KEY') || 
                    getEnvVar('SUPABASE_ANON_KEY') || 
                    getEnvVar('SUPABASE_KEY');

if (!supabaseUrl || !supabaseKey) {
    console.warn('Supabase URL or Key is missing. Database features will be disabled. URL:', !!supabaseUrl, 'Key:', !!supabaseKey);
}

export const supabase = (supabaseUrl && supabaseKey) 
    ? createClient(supabaseUrl, supabaseKey) 
    : null;
// --- End of supabaseClient.ts ---
