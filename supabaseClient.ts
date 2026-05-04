// Author: 4K 
import { createClient } from '@supabase/supabase-js';

// Get credentials from Vite environment
const SB_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_KEY || '';

if (typeof window !== 'undefined') {
    console.log("Direct-Connect Supabase Init", {
        url: SB_URL ? "URL Present" : "Missing",
        key: SB_KEY ? "Key Present" : "Missing",
        mode: "Anonymous Mode (Auth Disabled)"
    });
}

// Initialize client with NO auth persistence
export const supabase = (SB_URL && SB_KEY) 
    ? createClient(SB_URL, SB_KEY) 
    : null;

// Diagnostics
if (supabase && typeof window !== 'undefined') {
    (window as any).dbStatus = async () => {
        const { error, data } = await supabase.from('users').select('id').limit(1);
        return error ? { status: 'failed', error } : { status: 'success', data };
    };
}
// --- End of supabaseClient.ts ---
