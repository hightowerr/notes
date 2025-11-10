import { NextResponse } from 'next/server';

import { manualTaskInputSchema } from '@/lib/schemas/manualTaskSchemas';
import { createClient } from '@/lib/supabase/server';
import {
  createManualTask,
  DuplicateManualTaskError,
  ManualTaskServiceError,
} from '@/lib/services/manualTaskService';

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const parsed = manualTaskInputSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Invalid input',
          code: 'INVALID_INPUT',
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { outcome_id } = parsed.data;
    
    // Check if outcome exists and is active (if an outcome_id was provided)
    let hasActiveOutcome = false;
    if (outcome_id) {
      // Verify the specific outcome exists and is active
      const supabase = await createClient();
      const { data: outcome, error } = await supabase
        .from('user_outcomes')
        .select('id')
        .eq('id', outcome_id)
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

    const result = await createManualTask(parsed.data);

    return NextResponse.json(
      {
        task_id: result.taskId,
        success: true,
        prioritization_triggered: hasActiveOutcome,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof DuplicateManualTaskError) {
      return NextResponse.json(
        {
          error: error.message,
          code: 'DUPLICATE_TASK',
          existing_task: error.existingTask,
        },
        { status: 400 }
      );
    }

    if (error instanceof ManualTaskServiceError) {
      console.error('[ManualTask API] Manual task service error', error);
      return NextResponse.json(
        {
          error: error.message,
          code: 'INTERNAL_ERROR',
        },
        { status: 500 }
      );
    }

    console.error('[ManualTask API] Failed to create manual task', error);

    return NextResponse.json(
      {
        error: 'Failed to create manual task',
        code: 'INTERNAL_ERROR',
      },
      { status: 500 }
    );
  }
}
