import { formatDistanceToNow } from 'date-fns';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import type { Reflection, ReflectionWithWeight } from '@/lib/schemas/reflectionSchema';

const supabase = getSupabaseAdminClient();

/**
 * Step-function recency weighting used by context-aware prioritization.
 *
 * - 0-7 days old    → 1.0
 * - 8-14 days old   → 0.5
 * - 15+ days old    → 0.25
 */
export function calculateRecencyWeight(createdAt: Date): number {
  const ageInDays = Math.floor(
    (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (ageInDays <= 7) {
    return 1.0;
  }

  if (ageInDays <= 14) {
    return 0.5;
  }

  return 0.25;
}

/**
 * Format relative time for a reflection
 *
 * Examples:
 * - "just now" (< 1 minute)
 * - "3 hours ago"
 * - "2 days ago"
 * - "7+ days ago" (cutoff for aged reflections)
 *
 * @param createdAt - Date when reflection was created
 * @returns Human-readable relative time string
 */
export function formatRelativeTime(createdAt: Date): string {
  const ageInDays = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);

  // Spec requires "7+ days ago" for anything older than 7 days
  if (ageInDays > 7) {
    return '7+ days ago';
  }

  return formatDistanceToNow(createdAt, { addSuffix: true });
}

/**
 * Fetch recent reflections for a user with calculated weights
 *
 * @param userId - User ID (UUID)
 * @param limit - Maximum number of reflections to fetch (default: 5)
 * @returns Array of reflections with weights and relative times
 */
type FetchReflectionsOptions = {
  limit?: number;
  withinDays?: number;
  activeOnly?: boolean;
};

export function enrichReflection(reflection: Reflection): ReflectionWithWeight {
  const createdAt = new Date(reflection.created_at);
  const weight = calculateRecencyWeight(createdAt);

  return {
    ...reflection,
    recency_weight: weight,
    weight,
    relative_time: formatRelativeTime(createdAt),
  };
}

export async function fetchRecentReflections(
  userId: string,
  options: FetchReflectionsOptions = {},
): Promise<ReflectionWithWeight[]> {
  const { limit = 5, withinDays = 30, activeOnly = false } = options;

  let query = supabase
    .from('reflections')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (withinDays > 0) {
    const cutoff = new Date(Date.now() - withinDays * 24 * 60 * 60 * 1000);
    query = query.gte('created_at', cutoff.toISOString());
  }

  if (activeOnly) {
    query = query.eq('is_active_for_prioritization', true);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching reflections:', error);
    throw new Error('Failed to fetch reflections');
  }

  if (!data) {
    return [];
  }

  return data.map((reflection: Reflection) => enrichReflection(reflection));
}

/**
 * Create a new reflection
 *
 * @param userId - User ID (UUID)
 * @param text - Reflection text (10-500 chars, pre-validated)
 * @returns Created reflection with weight and relative time
 */
export async function createReflection(
  userId: string,
  text: string
): Promise<ReflectionWithWeight> {

  const { data, error } = await supabase
    .from('reflections')
    .insert({
      user_id: userId,
      text: text.trim(),
      created_at: new Date().toISOString() // Explicit for precision
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating reflection:', error);
    throw new Error('Failed to create reflection');
  }

  if (!data) {
    throw new Error('No data returned from reflection creation');
  }

  return enrichReflection(data as Reflection);
}

/**
 * Delete a reflection and clean up any references to it
 *
 * @param userId - User ID (UUID)
 * @param reflectionId - Reflection ID (UUID)
 * @throws Error if deletion fails or reflection doesn't belong to user
 */
export async function deleteReflection(
  userId: string,
  reflectionId: string
): Promise<void> {
  // First, update any agent sessions that might be using this reflection to remove references
  // This prevents broken references in adjusted plans
  try {
    // Fetch current agent sessions to check for reflection references
    const { data: sessions, error: fetchError } = await supabase
      .from('agent_sessions')
      .select('id, adjusted_plan, baseline_plan')
      .eq('user_id', userId);

    if (sessions && Array.isArray(sessions)) {
      for (const session of sessions) {
        let updated = false;
        let updatedAdjustedPlan = session.adjusted_plan;
        let updatedBaselinePlan = session.baseline_plan;

        // Remove reference to the deleted reflection from adjusted_plan if it contains reflection IDs
        if (updatedAdjustedPlan && typeof updatedAdjustedPlan === 'object' && updatedAdjustedPlan.adjustment_metadata) {
          // Safely access the reflections array in adjustment_metadata
          if (Array.isArray(updatedAdjustedPlan.adjustment_metadata.reflections)) {
            const originalLength = updatedAdjustedPlan.adjustment_metadata.reflections.length;
            updatedAdjustedPlan.adjustment_metadata.reflections = 
              updatedAdjustedPlan.adjustment_metadata.reflections.filter((r: any) => r?.id !== reflectionId);
              
            if (updatedAdjustedPlan.adjustment_metadata.reflections.length !== originalLength) {
              updated = true;
            }
          }
        }

        // Also check baseline_plan (though less likely to contain reflection references)
        if (updatedBaselinePlan && typeof updatedBaselinePlan === 'object' && updatedBaselinePlan.adjustment_metadata) {
          if (Array.isArray(updatedBaselinePlan.adjustment_metadata.reflections)) {
            const originalLength = updatedBaselinePlan.adjustment_metadata.reflections.length;
            updatedBaselinePlan.adjustment_metadata.reflections = 
              updatedBaselinePlan.adjustment_metadata.reflections.filter((r: any) => r?.id !== reflectionId);
              
            if (updatedBaselinePlan.adjustment_metadata.reflections.length !== originalLength) {
              updated = true;
            }
          }
        }

        // Update the session if any reflection references were removed
        if (updated) {
          const { error: updateError } = await supabase
            .from('agent_sessions')
            .update({ 
              adjusted_plan: updatedAdjustedPlan,
              baseline_plan: updatedBaselinePlan
            })
            .eq('id', session.id);

          if (updateError) {
            console.warn(`[ReflectionService] Failed to update agent session after reflection deletion:`, updateError);
          }
        }
      }
    } else if (fetchError) {
      console.error('Error fetching sessions to clean up reflection references:', fetchError);
    }
  } catch (cleanupError) {
    console.error('Error during reflection reference cleanup:', cleanupError);
    // Don't throw - continue with deletion even if cleanup fails 
  }

  // Now delete the reflection from the reflections table
  const { error } = await supabase
    .from('reflections')
    .delete()
    .eq('id', reflectionId)
    .eq('user_id', userId); // Ensure user owns the reflection

  if (error) {
    console.error('Error deleting reflection:', error);
    throw new Error('Failed to delete reflection');
  }
}
