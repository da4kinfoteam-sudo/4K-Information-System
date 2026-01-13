// Author: 4K 
import { createClient } from '@supabase/supabase-js';

const getEnvVar = (key: string) => {
    if (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env[key]) {
        return (import.meta as any).env[key];
    }
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
        return process.env[key];
    }
    if ((window as any)._env_ && (window as any)._env_[key]) {
        return (window as any)._env_[key];
    }
    return '';
};

const supabaseUrl = getEnvVar('VITE_SUPABASE_URL');
const supabaseKey = getEnvVar('VITE_SUPABASE_KEY') || getEnvVar('VITE_SUPABASE_ANON_KEY');

if (!supabaseUrl || !supabaseKey) {
    console.warn('Supabase URL or Key is missing. Please check your environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_KEY).');
}

// Fix: Removed invalid non-comment footer line
export const supabase = (supabaseUrl && supabaseKey) 
    ? createClient(supabaseUrl, supabaseKey) 
    : null;
// --- End of supabaseClient.ts ---