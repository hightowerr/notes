import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/supabase';

let adminClient: SupabaseClient<Database> | null = null;

/**
 * Creates a Supabase admin client with service_role key.
 *
 * ⚠️ WARNING: This client bypasses Row Level Security (RLS).
 *
 * Use ONLY for:
 * - Administrative operations that need full database access
 * - Webhooks and background jobs
 * - Cron jobs
 * - System-level operations
 *
 * DO NOT use for:
 * - User-authenticated API routes (use lib/supabase/server.ts instead)
 * - Client Components (use lib/supabase/client.ts instead)
 * - Any operation that should respect user permissions
 *
 * @throws {Error} If called from browser context
 * @throws {Error} If SUPABASE_SERVICE_ROLE_KEY is not configured
 * @see https://supabase.com/docs/guides/api/api-keys#the-servicerole-key
 */
export function getSupabaseAdminClient(): SupabaseClient<Database> {
  const isBrowser = typeof window !== 'undefined' && typeof window.document !== 'undefined';
  if (isBrowser && process.env.NODE_ENV !== 'test') {
    throw new Error('Admin client cannot be instantiated in the browser');
  }

  if (adminClient) {
    return adminClient;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase service role configuration');
  }

  adminClient = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return adminClient;
}
