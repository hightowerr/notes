// Test setup file
import { beforeAll, afterAll } from 'vitest';
import { webcrypto } from 'node:crypto';
import { FormData, File } from 'undici';

beforeAll(() => {
  // Set up test environment variables
  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://test.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'test-key';

  // Polyfill Web Crypto API for Node.js environment
  if (!globalThis.crypto) {
    globalThis.crypto = webcrypto as Crypto;
  }

  // Use undici's FormData and File for proper Web Standards compliance
  // undici provides implementations that work correctly with Next.js API routes
  globalThis.FormData = FormData as any;
  globalThis.File = File as any;
});

afterAll(() => {
  // Cleanup if needed
});
