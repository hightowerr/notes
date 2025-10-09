import { defineConfig } from 'vitest/config';
import path from 'path';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load env file based on mode
  const env = loadEnv(mode || 'test', process.cwd(), '');

  return {
    plugins: [react()],
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['__tests__/setup.ts'],
      css: true, // Enable CSS processing for component tests
      testTimeout: 15000, // Increase default timeout to 15 seconds for AI processing
      hookTimeout: 30000, // Allow longer setup/teardown for file uploads
      env: {
        // Make env variables available to tests
        NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL || 'https://test.supabase.co',
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'test-key-placeholder',
        OPENAI_API_KEY: env.OPENAI_API_KEY || '',
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './'),
      },
    },
  };
});
