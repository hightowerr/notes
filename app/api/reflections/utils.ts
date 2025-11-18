import { createClient } from '@/lib/supabase/server';

export const DEFAULT_REFLECTION_USER_ID = 'default-user';

/**
 * Get authenticated user ID from Supabase session.
 * Falls back to DEFAULT_USER_ID while auth is optional.
 */
export async function getAuthenticatedUserId(): Promise<string> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error) {
      console.warn('[Reflections] Auth lookup failed, using default user', error);
      return DEFAULT_REFLECTION_USER_ID;
    }

    if (user?.id) {
      return user.id;
    }

    return DEFAULT_REFLECTION_USER_ID;
  } catch (error) {
    console.error('[Reflections] Auth error, using default user', error);
    return DEFAULT_REFLECTION_USER_ID;
  }
}
