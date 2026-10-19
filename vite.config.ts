import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { createReleaseBuild, releaseBuildPlugin } from './scripts/helpers/release-build.mjs';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const release = createReleaseBuild({ root: process.cwd(), env: { ...env, ...process.env } });
    return {
      // Isolated fixture servers must not replace the running app's dependency cache.
      cacheDir: 'node_modules/.vite/app',
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        releaseBuildPlugin(release),
        react(),
        tailwindcss()
      ],
      define: {
        '__FOURKIS_BUILD__': JSON.stringify(release.manifest),
        '__FOURKIS_RELEASES__': JSON.stringify(release.catalog),
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL || env.SUPABASE_URL || ''),
        'process.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || ''),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      optimizeDeps: {
        exclude: [],
      },
      build: {
        rollupOptions: {
          external: [],
        }
      }
    };
});
