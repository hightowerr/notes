import { getSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * Permanently deletes soft-deleted manual tasks older than the specified retention window.
 * Default retention: 30 days.
 */
export async function purgeSoftDeletedManualTasks(retentionDays = 30): Promise<number> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.rpc('cleanup_manual_tasks');

  if (error) {
    throw new Error(error.message ?? 'Failed to purge soft-deleted manual tasks');
  }

  const deletedCount = typeof data === 'number' ? data : 0;
  return deletedCount;
}
