import { NextRequest } from 'next/server';
import { z } from 'zod';
import { type SupabaseClient } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/services/planIntegration';
import { validateRequestSchema } from '@/lib/utils/validation';
import { evaluateQuality } from '@/lib/services/qualityEvaluation';
import { generateEmbedding } from '@/lib/services/embeddingService';
import { analyzeCoverage } from '@/lib/services/taskIntelligence';

// Schema for the request body
const acceptDraftTasksRequestSchema = z.object({
  session_id: z.string().uuid(),
  accepted_draft_ids: z.array(z.string().uuid()),
  edited_drafts: z.array(z.object({
    id: z.string().uuid(),
    task_text: z.string().min(10).max(200),
  })).optional().default([]),
});


export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const user = await getAuthUser(request);
    if (!user) {
      return Response.json(
        { error: 'UNAUTHORIZED', message: 'Authentication required' },
        { status: 401 }
      );
    }

    // Validate request body
    const body = await request.json();
    const validatedBody = validateRequestSchema(acceptDraftTasksRequestSchema, body);

    const { session_id, accepted_draft_ids, edited_drafts = [] } = validatedBody;

    // Initialize Supabase client
    const supabase = await createClient();

    // Fetch the agent session to get the draft tasks
    const { data: session, error: sessionError } = await supabase
      .from('agent_sessions')
      .select('result, outcome_id')
      .eq('id', session_id)
      .eq('user_id', user.id)
      .single();

    if (sessionError) {
      console.error('[API] Error fetching agent session:', sessionError);
      return Response.json(
        { error: 'SESSION_NOT_FOUND', message: 'Agent session not found' },
        { status: 404 }
      );
    }

    if (!session || !session.result || !session.result.draft_tasks) {
      return Response.json(
        { error: 'NO_DRAFT_TASKS', message: 'No draft tasks found in session' },
        { status: 400 }
      );
    }

    const draftTasks = session.result.draft_tasks.generated || [];
    const outcomeId = session.outcome_id;

    // Validate that all accepted draft IDs exist in the session
    const invalidIds = accepted_draft_ids.filter(id => 
      !draftTasks.some(task => task.id === id)
    );
    
    if (invalidIds.length > 0) {
      return Response.json(
        { error: 'INVALID_DRAFT_IDS', message: `Invalid draft IDs: ${invalidIds.join(', ')}` },
        { status: 400 }
      );
    }

    // Get the accepted drafts and apply any edits
    const acceptedDrafts = draftTasks
      .filter(task => accepted_draft_ids.includes(task.id))
      .map(task => {
        // Apply any edits to the draft
        const edit = edited_drafts.find(edited => edited.id === task.id);
        return edit ? { ...task, task_text: edit.task_text } : task;
      });

    // For draft tasks acceptance, cycle detection may not be straightforward since
    // draft tasks don't necessarily have explicit predecessor/successor relationships defined initially.
    // But we should check if there are any existing relationships that could cause cycles
    // when these new tasks are added to the system.

    // Check for duplicate task IDs before insertion
    const existingIds = new Set(
      (await supabase
        .from('task_embeddings')
        .select('task_id')
        .in('task_id', acceptedDrafts.map(d => d.id))
      ).data?.map(t => t.task_id) || []
    );

    if (existingIds.size > 0) {
      return Response.json(
        {
          error: 'DUPLICATE_TASK_IDS',
          message: 'Duplicate task IDs detected',
          duplicate_ids: Array.from(existingIds)
        },
        { status: 400 }
      );
    }

    // Insert each accepted draft as a new task
    const insertedTaskIds: string[] = [];
    const errors: string[] = [];

    for (const draft of acceptedDrafts) {
      try {
        // Generate embedding for the new task
        const embedding = await generateEmbedding(draft.task_text);

        // Evaluate quality for the new task
        const qualityResult = await evaluateQuality(draft.task_text, false);

        // Insert the task with embedding and quality metadata directly to Supabase
        const { data: insertData, error } = await supabase
          .from('task_embeddings')
          .insert([{
            id: draft.id, // Use draft ID as the primary ID
            task_id: draft.id, // Use draft ID as task_id as well
            task_text: draft.task_text,
            embedding: embedding,
            status: 'completed',
            error_message: null,
            document_id: null, // Draft tasks don't have source documents
            user_id: user.id, // Include the user ID
          }])
          .select('task_id');

        if (error) {
          console.error(`[API] Error inserting task ${draft.id}:`, error);
          errors.push(`Failed to insert task ${draft.id}: ${error.message}`);
        } else {
          // Use the inserted task ID from the response
          const insertedTaskId = insertData?.[0]?.task_id || draft.id;
          insertedTaskIds.push(insertedTaskId);

          // Also update the quality metadata in a separate update query
          const { error: qualityError } = await supabase
            .from('task_embeddings')
            .update({
              quality_metadata: qualityResult.quality_metadata
            })
            .eq('task_id', insertedTaskId);

          if (qualityError) {
            console.error(`[API] Error updating quality metadata for task ${insertedTaskId}:`, qualityError);
            // Don't treat this as a failure to insert the task itself
          }
        }
      } catch (error) {
        console.error(`Error inserting draft task ${draft.id}:`, error);
        errors.push(`Error inserting task ${draft.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Update the agent session with the accepted task IDs
    const updatedDraftTasks = {
      ...session.result.draft_tasks,
      accepted: [
        ...(session.result.draft_tasks.accepted || []),
        ...insertedTaskIds
      ],
    };

    // Update the agent session
    const { error: updateSessionError } = await supabase
      .from('agent_sessions')
      .update({
        result: {
          ...session.result,
          draft_tasks: updatedDraftTasks,
        }
      })
      .eq('id', session_id)
      .eq('user_id', user.id);

    if (updateSessionError) {
      console.error('[API] Error updating agent session:', updateSessionError);
      return Response.json(
        { error: 'SESSION_UPDATE_FAILED', message: 'Failed to update session' },
        { status: 500 }
      );
    }

    // Recalculate coverage percentage after insertion
    let newCoveragePercentage = session.result?.coverage_analysis?.coverage_percentage || 0;
    
    // Only recalculate if we have outcome information
    if (outcomeId) {
      // Fetch the outcome text
      const { data: outcome, error: outcomeError } = await supabase
        .from('user_outcomes')
        .select('outcome_text')
        .eq('id', outcomeId)
        .single();

      if (outcome && !outcomeError) {
        // Get all task IDs associated with this user and outcome
        const { data: allTasks, error: tasksError } = await supabase
          .from('task_embeddings')
          .select('task_id')
          .eq('user_id', user.id) // Adjust this as needed based on your schema
          .not('task_id', 'is', null);

        if (allTasks && !tasksError) {
          try {
            // Fetch all tasks with embeddings
            const { data: allTasksData, error: tasksError2 } = await supabase
              .from('task_embeddings')
              .select('task_id, task_text, embedding')
              .eq('user_id', user.id);

            if (allTasksData && !tasksError2) {
              const taskIds = allTasksData.map(t => t.task_id);
              const taskTexts = allTasksData.map(t => t.task_text);
              const taskEmbeddings = allTasksData.map(t => t.embedding);

              const coverageResult = await analyzeCoverage(
                outcome.outcome_text,
                taskIds,
                taskTexts,
                taskEmbeddings
              );
              newCoveragePercentage = coverageResult.coverage_percentage;
            }

            // Update the coverage analysis in the session
            const { error: updateCoverageError } = await supabase
              .from('agent_sessions')
              .update({
                result: {
                  ...session.result,
                  draft_tasks: updatedDraftTasks,
                  coverage_analysis: {
                    ...session.result.coverage_analysis,
                    coverage_percentage: newCoveragePercentage,
                    analysis_timestamp: new Date().toISOString(),
                  },
                }
              })
              .eq('id', session_id)
              .eq('user_id', user.id);

            if (updateCoverageError) {
              console.error('[API] Error updating coverage in session:', updateCoverageError);
            }
          } catch (coverageError) {
            console.error('[API] Error recalculating coverage:', coverageError);
          }
        }
      }
    }

    // Check if there were cycle detection errors
    // We need to check if the newly inserted tasks create any cycles in the task graph
    const hasCycles = await checkForCycles([...insertedTaskIds], supabase);

    if (errors.length > 0 && insertedTaskIds.length === 0) {
      // All inserts failed
      return Response.json(
        { 
          error: 'TASK_INSERT_FAILED',
          message: 'All task insertions failed',
          details: errors 
        },
        { status: 500 }
      );
    }

    return Response.json({
      inserted_task_ids: insertedTaskIds,
      cycle_detected: hasCycles,
      new_coverage_percentage: newCoveragePercentage,
      insert_errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('[API] Accept Draft Tasks Error:', error);

    if (error instanceof z.ZodError) {
      return Response.json(
        { error: 'VALIDATION_ERROR', message: 'Invalid request body', details: error.errors },
        { status: 400 }
      );
    }

    return Response.json(
      { error: 'INTERNAL_SERVER_ERROR', message: 'Failed to accept draft tasks' },
      { status: 500 }
    );
  }
}

/**
 * Detects circular dependencies in a task graph using Kahn's algorithm
 * (topological sort with in-degree counting).
 *
 * Time complexity: O(V + E) where V = tasks, E = dependencies
 *
 * @param newTaskIds - Array of newly inserted task IDs to check for cycles
 * @param supabaseClient - Supabase client instance
 * @returns true if cycle detected, false if DAG is valid
 */
async function checkForCycles(newTaskIds: string[], supabaseClient: SupabaseClient): Promise<boolean> {
  if (newTaskIds.length === 0) {
    return false;
  }

  // Fetch all task relationships from the database to check for cycles
  const { data: allRelationships, error: allRelationshipsError } = await supabaseClient
    .from('task_relationships')
    .select('source_task_id, target_task_id');

  if (allRelationshipsError) {
    console.error('[CycleDetection] Error fetching all relationships:', allRelationshipsError);
    return false;
  }

  // Build adjacency list and calculate in-degrees
  const inDegree = new Map<string, number>();
  const adjList = new Map<string, string[]>();

  // Collect all unique task IDs involved in relationships
  const allTaskIds = new Set<string>();

  allRelationships?.forEach(rel => {
    allTaskIds.add(rel.source_task_id);
    allTaskIds.add(rel.target_task_id);
    if (!adjList.has(rel.source_task_id)) {
      adjList.set(rel.source_task_id, []);
    }
    adjList.get(rel.source_task_id)!.push(rel.target_task_id);
  });

  // Initialize in-degrees for all tasks
  allTaskIds.forEach(taskId => {
    inDegree.set(taskId, 0);
  });

  // Calculate in-degrees based on adjacency list
  for (const entry of adjList.entries()) {
    const targets = entry[1];
    targets.forEach(target => {
      inDegree.set(target, (inDegree.get(target) || 0) + 1);
    });
  }

  // Kahn's algorithm: Process tasks with zero in-degree
  const queue: string[] = [];
  inDegree.forEach((degree, taskId) => {
    if (degree === 0) {
      queue.push(taskId);
    }
  });

  let processedCount = 0;

  while (queue.length > 0) {
    const taskId = queue.shift()!;
    processedCount++;

    // Reduce in-degree for all neighbors
    const neighbors = adjList.get(taskId) || [];
    neighbors.forEach(neighborId => {
      const newDegree = (inDegree.get(neighborId) || 0) - 1;
      inDegree.set(neighborId, newDegree);

      if (newDegree === 0) {
        queue.push(neighborId);
      }
    });
  }

  // Cycle exists if we couldn't process all tasks
  const hasCycle = processedCount !== allTaskIds.size;

  if (hasCycle) {
    console.log('[CycleDetection] Cycle detected in task graph involving new tasks:', newTaskIds);
  }

  return hasCycle;
}
