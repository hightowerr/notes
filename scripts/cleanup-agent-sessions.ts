import 'dotenv/config';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

type CleanupOptions = {
  dryRun?: boolean;
  now?: number;
};

type CleanupResult = {
  cutoffIso: string;
  candidateCount: number;
  removedCount: number;
  dryRun: boolean;
};

export async function cleanupEvaluationMetadata(
  options: CleanupOptions = {}
): Promise<CleanupResult> {
  const { dryRun = false, now = Date.now() } = options;
  const supabase = getSupabaseAdminClient();
  const cutoffIso = new Date(now - THIRTY_DAYS_MS).toISOString();

  const { data: candidates, error: selectError } = await supabase
    .from('agent_sessions')
    .select('id')
    .lt('updated_at', cutoffIso)
    .not('evaluation_metadata', 'is', null);

  if (selectError) {
    throw new Error(`Failed to fetch expired evaluation metadata: ${selectError.message}`);
  }

  const candidateCount = Array.isArray(candidates) ? candidates.length : 0;

  if (dryRun) {
    return {
      cutoffIso,
      candidateCount,
      removedCount: 0,
      dryRun: true,
    };
  }

  const { error: updateError } = await supabase
    .from('agent_sessions')
    .update({ evaluation_metadata: null })
    .lt('updated_at', cutoffIso)
    .not('evaluation_metadata', 'is', null);

  if (updateError) {
    throw new Error(`Failed to clear evaluation metadata: ${updateError.message}`);
  }

  const removedCount = candidateCount;

  await supabase.from('processing_logs').insert({
    operation: 'evaluation_metadata_cleanup',
    status: 'completed',
    timestamp: new Date(now).toISOString(),
    metadata: {
      cutoff: cutoffIso,
      removed_count: removedCount,
      dry_run: false,
    },
  });

  return {
    cutoffIso,
    candidateCount,
    removedCount,
    dryRun: false,
  };
}

async function run() {
  const dryRun = process.argv.includes('--dry-run');
  try {
    const result = await cleanupEvaluationMetadata({ dryRun });
    console.log(
      dryRun
        ? `Dry run: ${result.candidateCount} session(s) older than ${result.cutoffIso}`
        : `Cleanup complete: removed evaluation_metadata from ${result.removedCount} session(s) (cutoff ${result.cutoffIso})`
    );
  } catch (error) {
    console.error('[cleanup-agent-sessions] Failed:', error);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run();
}
