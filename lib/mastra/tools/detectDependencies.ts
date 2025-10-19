import { createTool } from '@mastra/core/tools';
import { z, ZodError } from 'zod';
import { analyzeTaskDependencies } from '@/lib/services/dependencyService';
import type { DependencyAnalysisResult } from '@/lib/types/mastra';

type DetectDependenciesErrorCode =
  | 'AI_SERVICE_UNAVAILABLE'
  | 'AI_EXTRACTION_FAILED'
  | 'INVALID_TASK_IDS'
  | 'INSUFFICIENT_TASKS'
  | 'DATABASE_ERROR';

class DetectDependenciesToolError extends Error {
  constructor(
    public readonly code: DetectDependenciesErrorCode,
    message: string,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = 'DetectDependenciesToolError';
  }
}

const inputSchema = z.object({
  task_ids: z
    .array(z.string(), {
      required_error: 'At least one task ID is required.',
    })
    .min(1, 'At least one task ID is required.'),
  use_document_context: z.boolean().default(true),
});

async function executeDetectDependencies(
  input: z.input<typeof inputSchema>
): Promise<DependencyAnalysisResult> {
  let parsedInput;
  try {
    parsedInput = inputSchema.parse(input);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new DetectDependenciesToolError(
        'INVALID_TASK_IDS',
        'Invalid task_ids payload. Ensure all IDs are strings.',
        false
      );
    }
    throw error;
  }

  const { task_ids, use_document_context } = parsedInput;

  if (task_ids.length < 2) {
    throw new DetectDependenciesToolError(
      'INSUFFICIENT_TASKS',
      'At least two task IDs are required for dependency analysis.',
      false
    );
  }

  if (task_ids.length > 50) {
    throw new DetectDependenciesToolError(
      'INVALID_TASK_IDS',
      'No more than 50 task IDs can be analyzed at once.',
      false
    );
  }

  try {
    const result = await analyzeTaskDependencies(task_ids, { includeContext: use_document_context });
    return result;
  } catch (error) {
    if (error instanceof DetectDependenciesToolError) {
      throw error;
    }

    if (error instanceof Error) {
      if (error.message.includes('Missing task embeddings for IDs')) {
        throw new DetectDependenciesToolError('INVALID_TASK_IDS', error.message, false);
      }

      if (error.message.includes('No tasks found for provided task IDs')) {
        throw new DetectDependenciesToolError('INVALID_TASK_IDS', error.message, false);
      }

      if (error.message.toLowerCase().includes('failed to fetch tasks')) {
        throw new DetectDependenciesToolError('DATABASE_ERROR', error.message, true);
      }

      if (
        error.message.toLowerCase().includes('ai service unavailable') ||
        error.message.toLowerCase().includes('openai') ||
        error.message.toLowerCase().includes('timeout') ||
        error.message.toLowerCase().includes('rate limit')
      ) {
        throw new DetectDependenciesToolError('AI_SERVICE_UNAVAILABLE', error.message, true);
      }

      if (error.message.toLowerCase().includes('failed to parse ai response')) {
        throw new DetectDependenciesToolError('AI_EXTRACTION_FAILED', error.message, true);
      }

      throw new DetectDependenciesToolError('DATABASE_ERROR', error.message, true);
    }

    throw new DetectDependenciesToolError(
      'DATABASE_ERROR',
      'Unknown database error',
      true
    );
  }
}

export const detectDependenciesTool = createTool({
  id: 'detect-dependencies',
  description: 'Analyzes a set of tasks to detect prerequisite, blocking, or related relationships using AI, and stores those relationships for future queries.',
  inputSchema,
  execute: executeDetectDependencies,
});

export type DetectDependenciesTool = typeof detectDependenciesTool;
