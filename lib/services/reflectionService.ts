import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/lib/supabase';
import type { Reflection, ReflectionWithWeight } from '@/lib/schemas/reflectionSchema';

/**
 * Calculate recency weight for a reflection using exponential decay
 *
 * Formula: weight = 0.5^(age_in_days / 7)
 * - Today: weight = 1.0
 * - 7 days old: weight = 0.5
 * - 14 days old: weight = 0.25
 * - 30 days old: weight ≈ 0.06 (floored to 0)
 *
 * @param createdAt - Date when reflection was created
 * @returns Weight value between 0 and 1
 */
export function calculateRecencyWeight(createdAt: Date): number {
  const now = new Date();
  const ageInMs = now.getTime() - createdAt.getTime();
  const ageInDays = ageInMs / (1000 * 60 * 60 * 24);
  const halfLife = 7; // days

  const weight = Math.pow(0.5, ageInDays / halfLife);

  // Floor at 0.06 (30 days old, effectively zero)
  return weight < 0.06 ? 0 : weight;
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
export async function fetchRecentReflections(
  userId: string,
  limit: number = 5
): Promise<ReflectionWithWeight[]> {

  // Filter out reflections older than 30 days (weight approaches 0)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const { data, error } = await supabase
    .from('reflections')
    .select('*')
    .eq('user_id', userId)
    .gte('created_at', thirtyDaysAgo.toISOString())
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching reflections:', error);
    throw new Error('Failed to fetch reflections');
  }

  if (!data) {
    return [];
  }

  // Calculate weights and relative times for each reflection
  return data.map((reflection: Reflection) => ({
    ...reflection,
    weight: calculateRecencyWeight(new Date(reflection.created_at)),
    relative_time: formatRelativeTime(new Date(reflection.created_at))
  }));
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

  return {
    ...data,
    weight: calculateRecencyWeight(new Date(data.created_at)),
    relative_time: formatRelativeTime(new Date(data.created_at))
  };
}
