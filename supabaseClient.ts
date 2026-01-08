
import { createClient } from '@supabase/supabase-js';

// Instructions:
// 1. Create a project at https://database.new
// 2. Get your URL and ANON KEY from Project Settings > API
// 3. For local development, you can hardcode strings here temporarily or use a .env file if using a bundler.
// 4. For deployment (Vercel), set these as Environment Variables.

// NOTE: In this specific no-build environment, you might need to paste your keys directly below 
// replacing process.env... if env vars aren't injected by your runtime.

const supabaseUrl = (window as any)._env_?.VITE_SUPABASE_URL || 'YOUR_SUPABASE_PROJECT_URL';
const supabaseKey = (window as any)._env_?.VITE_SUPABASE_KEY || 'YOUR_SUPABASE_ANON_KEY';

export const supabase = createClient(supabaseUrl, supabaseKey);
