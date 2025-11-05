import { supabase } from '@/lib/supabase';

/**
 * Get authenticated user ID from Supabase session.
 * Falls back to anonymous user during P0 while auth is optional.
 */
export async function getAuthenticatedUserId(): Promise<string | null> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session?.user?.id) {
      return session.user.id;
    }

    return 'anonymous-user-p0';
  } catch (error) {
    console.error('Auth error:', error);
    return null;
  }
}
