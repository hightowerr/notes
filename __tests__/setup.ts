// Test setup file
import { beforeAll, afterAll, afterEach } from 'vitest';
import { webcrypto } from 'node:crypto';
import { FormData, File } from 'undici';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

beforeAll(() => {
  // Set up test environment variables
  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://test.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'test-key';
  process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key';

  // Polyfill Web Crypto API for Node.js environment
  // Use Object.defineProperty to ensure crypto is available in all test contexts
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    writable: false,
    configurable: true,
  });

  // Verify crypto.subtle is available
  if (!globalThis.crypto || !globalThis.crypto.subtle) {
    throw new Error('Failed to initialize crypto polyfill. crypto.subtle is required for tests.');
  }

  // Use undici's FormData and File for proper Web Standards compliance in tests
  // undici provides implementations that work correctly with Next.js API routes
  globalThis.FormData = FormData as any;
  globalThis.File = File as any;

  // Verify File API works correctly with properties
  const testFile = new File(['test'], 'test.txt', { type: 'text/plain' });
  if (!testFile.name || !testFile.type || !testFile.size) {
    throw new Error('File API incomplete - name/type/size properties missing');
  }
  console.log('[SETUP] ✓ File API verified (undici)');

  if (!globalThis.crypto.randomUUID) {
    globalThis.crypto.randomUUID = function() {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    };
  }

  if (!globalThis.URL.createObjectURL) {
    globalThis.URL.createObjectURL = () => 'blob:http://localhost/mock-url';
  }

  if (!globalThis.URL.revokeObjectURL) {
    globalThis.URL.revokeObjectURL = () => {};
  }

  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class ResizeObserver {
      observe() {
        // do nothing
      }
      unobserve() {
        // do nothing
      }
      disconnect() {
        // do nothing
      }
    };
  }
});

afterEach(() => {
  // Cleanup React Testing Library DOM after each test
  cleanup();
});

afterAll(() => {
  // Cleanup if needed
});
