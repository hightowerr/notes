import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import type { TaskRelationship } from '@/lib/types/mastra';

type QueryTaskGraphErrorCode =
  | 'TASK_NOT_FOUND'
  | 'DATABASE_ERROR';

class QueryTaskGraphToolError extends Error {
  constructor(
    public readonly code: QueryTaskGraphErrorCode,
    message: string,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = 'QueryTaskGraphToolError';
  }
}

const inputSchema = z.object({
  task_id: z.string(),
  relationship_type: z.enum(['prerequisite', 'blocks', 'related', 'all']).default('all'),
});

async function executeTaskGraphQuery(
  input: z.input<typeof inputSchema>
): Promise<{
  relationships: TaskRelationship[];
  task_id: string;
  filter_applied: string;
}> {
  const { task_id, relationship_type } = inputSchema.parse(input);

  try {
    let query = supabase
      .from('task_relationships')
      .select('*')
      .or(`source_task_id.eq.${task_id},target_task_id.eq.${task_id}`);

    if (relationship_type !== 'all') {
      query = query.eq('relationship_type', relationship_type);
    }

    const { data, error } = await query;

    if (error) {
      throw new QueryTaskGraphToolError('DATABASE_ERROR', error.message, true);
    }

    if (!data || data.length === 0) {
      const {
        data: taskRecord,
        error: taskLookupError,
      } = await supabase
        .from('task_embeddings')
        .select('task_id')
        .eq('task_id', task_id)
        .maybeSingle();

      if (taskLookupError) {
        throw new QueryTaskGraphToolError(
          'DATABASE_ERROR',
          taskLookupError.message ?? 'Failed to verify task existence.',
          true
        );
      }

      if (!taskRecord) {
        throw new QueryTaskGraphToolError(
          'TASK_NOT_FOUND',
          `Task with ID ${task_id} does not exist.`,
          false
        );
      }

      return {
        relationships: [],
        task_id,
        filter_applied: relationship_type,
      };
    }

    return {
      relationships: data as TaskRelationship[],
      task_id,
      filter_applied: relationship_type,
    };
  } catch (error) {
    if (error instanceof QueryTaskGraphToolError) {
      throw error;
    }
    throw new QueryTaskGraphToolError(
      'DATABASE_ERROR',
      error instanceof Error ? error.message : 'Unknown database error',
      true
    );
  }
}

export const queryTaskGraphTool = createTool({
  id: 'query-task-graph',
  description: 'Queries existing task relationships from the database, filtered by relationship type.',
  inputSchema,
  execute: executeTaskGraphQuery,
});

export type QueryTaskGraphTool = typeof queryTaskGraphTool;
