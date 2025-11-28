import { NextResponse } from 'next/server';

import { getAnalysisStatus, ManualTaskNotFoundError, ManualTaskPlacementError } from '@/lib/services/manualTaskPlacement';
import { createClient } from '@/lib/supabase/server';

export async function GET(_request: Request, context: { params: { id: string } }) {
  const taskId = context.params.id;

  try {
    const supabase = await createClient();
    const status = await getAnalysisStatus(taskId, supabase);

    const cleanResponse: Record<string, unknown> = {
      status: status.status,
    };

    if (status.agent_rank !== null && status.agent_rank !== undefined) {
      cleanResponse.agent_rank = status.agent_rank;
    }
    if (status.placement_reason) {
      cleanResponse.placement_reason = status.placement_reason;
    }
    if (status.exclusion_reason) {
      cleanResponse.exclusion_reason = status.exclusion_reason;
    }
    if (status.duplicate_task_id) {
      cleanResponse.duplicate_task_id = status.duplicate_task_id;
      if (status.similarity_score !== null && status.similarity_score !== undefined) {
        cleanResponse.similarity_score = status.similarity_score;
      }
    }

    return NextResponse.json(cleanResponse, { status: 200 });
  } catch (error) {
    if (error instanceof ManualTaskNotFoundError) {
      return NextResponse.json({ error: 'Manual task not found' }, { status: 404 });
    }

    const message =
      error instanceof ManualTaskPlacementError
        ? error.message
        : 'Failed to fetch manual task status';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
