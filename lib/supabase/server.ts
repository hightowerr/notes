import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/lib/types/supabase';

/**
 * Creates a Supabase client for use in Server Components, Server Actions, and API Routes.
 *
 * Uses @supabase/ssr with Next.js cookies() for proper session management.
 * This client respects Row Level Security (RLS) policies and is scoped to the authenticated user.
 *
 * For administrative operations that need to bypass RLS, use getSupabaseAdminClient() instead.
 *
 * @see https://supabase.com/docs/guides/auth/server-side/nextjs
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing user sessions.
          }
        },
      },
    }
  );
}
