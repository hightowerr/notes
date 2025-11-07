import { createClient } from '@/lib/supabase/server';

/**
 * Get authenticated user ID from Supabase session.
 * Falls back to anonymous user during P0 while auth is optional.
 *
 * Uses auth.getUser() instead of auth.getSession() for better security on server-side.
 * @see https://supabase.com/docs/guides/auth/server-side/nextjs#creating-a-supabase-client
 */
export async function getAuthenticatedUserId(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error) {
      console.error('Auth error:', error);
      return 'anonymous-user-p0';
    }

    if (user?.id) {
      return user.id;
    }

    return 'anonymous-user-p0';
  } catch (error) {
    console.error('Auth error:', error);
    return null;
  }
}
