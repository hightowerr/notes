import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/lib/types/supabase';

/**
 * Creates a Supabase client for use in Client Components.
 *
 * Uses @supabase/ssr for proper cookie handling and session management.
 * This client runs in the browser and includes auth state management.
 *
 * @see https://supabase.com/docs/guides/auth/server-side/nextjs
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}
