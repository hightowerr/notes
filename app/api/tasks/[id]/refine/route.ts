import { NextRequest } from 'next/server';
import { z } from 'zod';

import { getAuthUser } from '@/lib/services/planIntegration';
import { suggestRefinements } from '@/lib/services/qualityRefinement';
import { createClient } from '@/lib/supabase/server';


export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Authenticate user
    const user = await getAuthUser(request);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const taskId = params.id;

    // Initialize Supabase client
    const supabase = await createClient();

    // Fetch the task from the database to get its text and quality metadata
    const { data: taskData, error: fetchError } = await supabase
      .from('task_embeddings')
      .select('task_text, quality_metadata')
      .eq('task_id', taskId)
      .eq('user_id', user.id) // Ensure the user owns this task
      .single();

    if (fetchError) {
      console.error('[API] Error fetching task for refinement:', fetchError);
      return Response.json({ error: 'Task not found' }, { status: 404 });
    }

    if (!taskData) {
      return Response.json({ error: 'Task not found' }, { status: 404 });
    }

    const { task_text: taskText, quality_metadata: qualityMetadata } = taskData;

    // Extract improvement suggestions from quality metadata
    const qualityIssues = qualityMetadata?.improvement_suggestions || [];

    // Generate refinement suggestions
    const refinementResponse = await suggestRefinements({
      taskId,
      taskText,
      qualityIssues,
      supabaseClient: supabase,
    });

    return Response.json(refinementResponse);
  } catch (error) {
    console.error('[API] Refine Task Error:', error);

    if (error instanceof z.ZodError) {
      return Response.json(
        { error: 'Invalid request body', details: error.errors },
        { status: 400 }
      );
    }

    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}