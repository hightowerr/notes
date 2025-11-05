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
  use_document_context: z.coerce.boolean().default(true),
});

async function executeDetectDependencies(
  input: z.input<typeof inputSchema>
): Promise<DependencyAnalysisResult> {
  const raw = input ?? {};
  const context = extractProperty(raw, 'context');

  const normalized = {
    task_ids: normalizeTaskIds(
      extractProperty(raw, 'task_ids') ?? extractProperty(context, 'task_ids')
    ),
    use_document_context: normalizeBoolean(
      extractProperty(raw, 'use_document_context') ??
        extractProperty(context, 'use_document_context')
    ),
  };

  console.log('[DetectDependencies] Raw input:', input);
  console.log('[DetectDependencies] input.context:', context);
  console.log('[DetectDependencies] Normalized input:', normalized);

  let parsedInput;
  try {
    parsedInput = inputSchema.parse(normalized);
    console.log('[DetectDependencies] Parsed values:', parsedInput);
  } catch (error) {
    console.error(
      '[DetectDependencies] Zod parse failed. Normalized snapshot:',
      normalized,
      'Error:',
      error
    );
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

function normalizeTaskIds(value: unknown): string[] {
  const toString = (item: unknown): string => {
    if (typeof item === 'string') {
      return item.trim();
    }
    if (item === null || typeof item === 'undefined') {
      return '';
    }
    if (typeof item === 'object' && 'task_id' in (item as Record<string, unknown>)) {
      return String((item as Record<string, unknown>).task_id ?? '');
    }
    return String(item);
  };

  if (Array.isArray(value)) {
    return value
      .map(toString)
      .map(str => str.trim())
      .filter(str => str.length > 0);
  }

  if (value && typeof value === 'object' && Symbol.iterator in value) {
    return Array.from(value as Iterable<unknown>)
      .map(toString)
      .map(str => str.trim())
      .filter(str => str.length > 0);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map(str => str.trim())
      .filter(str => str.length > 0);
  }

  if (value === null || typeof value === 'undefined') {
    return [];
  }

  return [toString(value)].filter(str => str.trim().length > 0);
}

function normalizeBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase();
    if (lower === 'true') return true;
    if (lower === 'false') return false;
  }

  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  return undefined;
}

function extractProperty(source: unknown, key: string): unknown {
  if (!source) {
    return undefined;
  }

  if (typeof source === 'object') {
    if (key in (source as Record<string, unknown>)) {
      return (source as Record<string, unknown>)[key];
    }

    if (source instanceof Map) {
      return source.get(key);
    }

    const candidate = source as Record<string, unknown>;
    const getter = candidate.get;
    if (typeof getter === 'function') {
      try {
        const value = getter.call(source, key);
        if (value !== undefined) {
          return value;
        }
      } catch {
        // Ignore getter errors
      }
    }

    const entries = candidate.entries;
    if (typeof entries === 'function') {
      try {
        for (const entry of entries.call(source) as Iterable<unknown>) {
          if (Array.isArray(entry) && entry[0] === key) {
            return entry[1];
          }
        }
      } catch {
        // Ignore iterator errors
      }
    }
  }

  return undefined;
}
