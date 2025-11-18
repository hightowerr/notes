import { NextResponse } from 'next/server';
import { z } from 'zod';

import { resolveOutcomeAlignedTasks } from '@/lib/services/lnoTaskService';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { StrategicScoresMapSchema } from '@/lib/schemas/strategicScore';
import { getRetryQueueDiagnostics, getRetryStatusSnapshot } from '@/lib/services/retryQueue';
import type { RetryStatusEntry } from '@/lib/schemas/retryStatus';

const metadataQuerySchema = z.object({
  session_id: z.string().uuid(),
  status: z.enum(['all', 'retry', 'failed']).default('all'),
});

const requestSchema = z.object({
  taskIds: z.array(z.string().min(1)).max(400),
  outcome: z.string().min(3).max(500).optional(),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = metadataQuerySchema.safeParse({
    session_id: url.searchParams.get('session_id'),
    status: url.searchParams.get('status') ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'INVALID_REQUEST', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { session_id: sessionId, status } = parsed.data;
  const supabase = getSupabaseAdminClient();

  try {
    const { data: session, error } = await supabase
      .from('agent_sessions')
      .select('strategic_scores')
      .eq('id', sessionId)
      .maybeSingle();

    if (error) {
      console.error('[TaskMetadata API] Failed to load session scores', error);
      return NextResponse.json(
        { error: 'DATABASE_ERROR', message: 'Unable to load scoring metadata' },
        { status: 500 }
      );
    }

    if (!session) {
      return NextResponse.json(
        { error: 'SESSION_NOT_FOUND', message: 'Session not found' },
        { status: 404 }
      );
    }

    const scoresResult = StrategicScoresMapSchema.safeParse(session.strategic_scores ?? {});
    const scores = scoresResult.success ? scoresResult.data : {};
    const retryStatus: Record<string, RetryStatusEntry> = {};
    const retryQueueState = getRetryQueueDiagnostics();

    if (status === 'all' || status === 'retry') {
      Object.assign(retryStatus, getRetryStatusSnapshot(sessionId));
    }

    if (status === 'all' || status === 'failed') {
      const { data: logs, error: logError } = await supabase
        .from('processing_logs')
        .select('metadata, timestamp')
        .eq('operation', 'strategic_score_retry')
        .eq('status', 'retry_exhausted')
        .eq('metadata->>session_id', sessionId)
        .limit(100)
        .order('timestamp', { ascending: false });

      if (logError) {
        console.error('[TaskMetadata API] Failed to load retry logs', logError);
      } else if (Array.isArray(logs)) {
        logs.forEach(entry => {
          const metadata = entry?.metadata;
          if (!metadata || typeof metadata !== 'object') {
            return;
          }
          const taskId = (metadata as Record<string, unknown>).task_id;
          if (typeof taskId !== 'string') {
            return;
          }
          const attempts = Number((metadata as Record<string, unknown>).attempts) || 0;
          const lastError = (metadata as Record<string, unknown>).last_error;
          const maxAttempts = Number((metadata as Record<string, unknown>).max_attempts) || 3;
          retryStatus[taskId] = {
            status: 'failed',
            attempts,
            last_error: typeof lastError === 'string' ? lastError : undefined,
            updated_at: typeof entry?.timestamp === 'string' ? entry.timestamp : undefined,
            max_attempts: maxAttempts,
          };
        });
      }
    }

    return NextResponse.json(
      {
        scores,
        retry_status: retryStatus,
        retry_queue_state: retryQueueState,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[TaskMetadata API] Unexpected error while polling scores', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Unable to load scoring metadata' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const parsed = requestSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'INVALID_REQUEST', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { taskIds, outcome } = parsed.data;

    if (taskIds.length === 0) {
      return NextResponse.json({ tasks: [] }, { status: 200 });
    }

    const metadata = await resolveOutcomeAlignedTasks(taskIds, { outcome });
    const tasks = taskIds
      .map(taskId => metadata[taskId])
      .filter((task): task is NonNullable<typeof task> => Boolean(task));

    console.log('[TaskMetadata API] Request:', { taskIdsCount: taskIds.length, outcome });
    console.log('[TaskMetadata API] Response:', {
      tasksReturned: tasks.length,
      metadataKeys: Object.keys(metadata).length,
      sampleTaskIds: taskIds.slice(0, 3),
      sampleMetadata: Object.entries(metadata)
        .slice(0, 2)
        .map(([id, data]) => ({ id: id.slice(0, 16), hasTitle: !!data?.title })),
    });

    return NextResponse.json({ tasks }, { status: 200 });
  } catch (error) {
    console.error('[TaskMetadata API] Failed to build metadata', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Unable to load task metadata' },
      { status: 500 }
    );
  }
}
