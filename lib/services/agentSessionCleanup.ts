import { getSupabaseAdminClient } from '@/lib/supabase/admin';

const RETENTION_DAYS = 7;
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // throttle to once per hour

let lastCleanupRun = 0;

/**
 * Deletes agent sessions (and cascading reasoning traces) that are older than
 * the configured retention window. Throttled to avoid hammering the database
 * when multiple requests hit the same route.
 *
 * @returns number of sessions purged (best-effort; 0 on failure or when skipped)
 */
export async function cleanupExpiredAgentSessions(): Promise<number> {
  const now = Date.now();
  if (now - lastCleanupRun < CLEANUP_INTERVAL_MS) {
    return 0;
  }

  const cutoffIso = new Date(now - RETENTION_MS).toISOString();
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('agent_sessions')
    .delete()
    .lt('created_at', cutoffIso)
    .select('id');

  if (error) {
    console.error('[AgentSessionCleanup] Failed to purge expired sessions', error);
    return 0;
  }

  lastCleanupRun = now;
  return data?.length ?? 0;
}
