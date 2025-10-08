import { defineConfig } from 'vitest/config';
import path from 'path';
import { loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // Load env file based on mode
  const env = loadEnv(mode || 'test', process.cwd(), '');

  return {
    test: {
      environment: 'node',
      globals: true,
      setupFiles: ['__tests__/setup.ts'],
      css: false, // Disable CSS processing entirely for tests
      env: {
        // Make env variables available to tests
        NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL || 'https://test.supabase.co',
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'test-key-placeholder',
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './'),
      },
    },
  };
});
