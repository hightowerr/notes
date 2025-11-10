import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { taskEditInputSchema } from '@/lib/schemas/manualTaskSchemas';
import { createClient } from '@/lib/supabase/server';
import {
  ManualTaskNotFoundError,
  ManualTaskPermissionError,
  ManualTaskServiceError,
  ManualTaskValidationError,
  updateTask,
} from '@/lib/services/manualTaskService';

type RouteContext = {
  params: {
    id?: string;
  };
};

function parseBody(payload: unknown) {
  const parsed = taskEditInputSchema.safeParse(payload);
  if (parsed.success) {
    return { success: true as const, data: parsed.data };
  }

  const hasNoFieldsIssue = parsed.error.issues.some(
    issue => issue.message === 'NO_FIELDS_PROVIDED'
  );

  return {
    success: false as const,
    error: {
      code: hasNoFieldsIssue ? 'NO_FIELDS_PROVIDED' : 'INVALID_INPUT',
      details: hasNoFieldsIssue ? undefined : parsed.error.flatten(),
    },
  };
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const taskId = context.params?.id;
  if (!taskId) {
    return NextResponse.json(
      {
        error: 'Task identifier is required',
        code: 'INVALID_TASK_ID',
      },
      { status: 400 }
    );
  }

  let body: unknown = null;
  try {
    body = await request.json();
  } catch (error) {
    console.warn('[TaskEdit API] Invalid JSON payload', error);
    return NextResponse.json(
      {
        error: 'Invalid JSON payload',
        code: 'INVALID_INPUT',
      },
      { status: 400 }
    );
  }

  const parsed = parseBody(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          parsed.error.code === 'NO_FIELDS_PROVIDED'
            ? 'At least one field must be provided'
            : 'Invalid input',
        code: parsed.error.code,
        details: parsed.error.details,
      },
      { status: 400 }
    );
  }

  // Check if outcome exists and is active (if an outcome_id was provided)
  let hasActiveOutcome = false;
  if (parsed.data.outcome_id) {
    // Verify the specific outcome exists and is active
    const supabase = await createClient();
    const { data: outcome, error } = await supabase
      .from('user_outcomes')
      .select('id')
      .eq('id', parsed.data.outcome_id)
      .is('completed_at', null) // Only active outcomes
      .single();

    if (!error && outcome) {
      hasActiveOutcome = true;
    }
  } else {
    // Check if any active outcome exists for the user
    const supabase = await createClient();
    const { data: outcomes, error } = await supabase
      .from('user_outcomes')
      .select('id')
      .is('completed_at', null) // Only active outcomes
      .limit(1);

    if (!error && outcomes && outcomes.length > 0) {
      hasActiveOutcome = true;
    }
  }

  try {
    const result = await updateTask({
      taskId,
      ...parsed.data,
    });

    return NextResponse.json(
      {
        success: true,
        task: {
          task_id: result.taskId,
          task_text: result.taskText,
          is_manual: result.isManual,
          updated_at: result.updatedAt,
        },
        embedding_regenerated: result.embeddingRegenerated,
        prioritization_triggered: hasActiveOutcome,
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof ManualTaskNotFoundError) {
      return NextResponse.json(
        {
          error: error.message,
          code: 'TASK_NOT_FOUND',
        },
        { status: 404 }
      );
    }
    if (error instanceof ManualTaskPermissionError) {
      return NextResponse.json(
        {
          error: error.message,
          code: 'PERMISSION_DENIED',
        },
        { status: 403 }
      );
    }
    if (error instanceof ManualTaskValidationError) {
      return NextResponse.json(
        {
          error: error.message,
          code: 'INVALID_INPUT',
        },
        { status: 400 }
      );
    }
    if (error instanceof ManualTaskServiceError) {
      console.error('[TaskEdit API] Manual task service error', error);
      return NextResponse.json(
        {
          error: 'Failed to update task',
          code: 'INTERNAL_ERROR',
        },
        { status: 500 }
      );
    }

    console.error('[TaskEdit API] Unexpected error', error);
    return NextResponse.json(
      {
        error: 'Failed to update task',
        code: 'INTERNAL_ERROR',
      },
      { status: 500 }
    );
  }
}
