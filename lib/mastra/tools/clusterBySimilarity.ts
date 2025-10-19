import { createTool } from '@mastra/core/tools';
import { z, ZodError } from 'zod';

import { performHierarchicalClustering } from '@/lib/services/clusteringService';
import type { ClusteringResult } from '@/lib/types/mastra';

type ClusterBySimilarityErrorCode =
  | 'INSUFFICIENT_EMBEDDINGS'
  | 'INVALID_THRESHOLD'
  | 'TASK_NOT_FOUND'
  | 'CLUSTERING_FAILED'
  | 'DATABASE_ERROR';

class ClusterBySimilarityToolError extends Error {
  constructor(
    public readonly code: ClusterBySimilarityErrorCode,
    message: string,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = 'ClusterBySimilarityToolError';
  }
}

const inputSchema = z.object({
  task_ids: z
    .array(z.string(), {
      required_error: 'At least one task ID is required.',
    })
    .min(1, 'At least one task ID is required.'),
  similarity_threshold: z.coerce.number().default(0.75),
});

async function executeClusterBySimilarity(
  input: z.input<typeof inputSchema>
): Promise<ClusteringResult> {
  const raw = (input ?? {}) as Record<string, unknown>;

  const normalized = {
    task_ids: normalizeTaskIds(raw.task_ids),
    similarity_threshold: normalizeNumber(raw.similarity_threshold),
  };

  let parsedInput;
  try {
    parsedInput = inputSchema.parse(normalized);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ClusterBySimilarityToolError(
        'CLUSTERING_FAILED',
        'Invalid clustering request payload.',
        false
      );
    }

    throw error;
  }

  const { task_ids, similarity_threshold } = parsedInput;

  if (task_ids.length < 2) {
    throw new ClusterBySimilarityToolError(
      'INSUFFICIENT_EMBEDDINGS',
      'At least two task IDs are required for clustering.',
      false
    );
  }

  if (task_ids.length > 100) {
    throw new ClusterBySimilarityToolError(
      'INSUFFICIENT_EMBEDDINGS',
      'No more than 100 task IDs can be clustered at once.',
      false
    );
  }

  if (!Number.isFinite(similarity_threshold)) {
    throw new ClusterBySimilarityToolError(
      'INVALID_THRESHOLD',
      'Similarity threshold must be a finite number between 0 and 1.',
      false
    );
  }

  if (similarity_threshold < 0 || similarity_threshold > 1) {
    throw new ClusterBySimilarityToolError(
      'INVALID_THRESHOLD',
      'Similarity threshold must be between 0 and 1.',
      false
    );
  }

  try {
    const result = await performHierarchicalClustering(task_ids, { threshold: similarity_threshold });
    return result;
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('Insufficient embeddings for clustering')) {
        throw new ClusterBySimilarityToolError('INSUFFICIENT_EMBEDDINGS', error.message, false);
      }
      if (error.message.includes('Failed to fetch embeddings')) {
        throw new ClusterBySimilarityToolError('DATABASE_ERROR', error.message, true);
      }
      if (error.message.includes('Missing embeddings for one or more task IDs')) {
        throw new ClusterBySimilarityToolError('TASK_NOT_FOUND', error.message, false);
      }
      if (error.message.includes('No embeddings found for provided task IDs')) {
        throw new ClusterBySimilarityToolError('TASK_NOT_FOUND', error.message, false);
      }
      if (error.message.toLowerCase().includes('clustering failed')) {
        throw new ClusterBySimilarityToolError('CLUSTERING_FAILED', error.message, false);
      }
    }

    throw new ClusterBySimilarityToolError(
      'DATABASE_ERROR',
      error instanceof Error ? error.message : 'Unknown database error',
      true
    );
  }
}

export const clusterBySimilarityTool = createTool({
  id: 'cluster-by-similarity',
  description:
    'Groups tasks into semantic clusters based on similarity threshold to identify conceptually related tasks without explicit links.',
  inputSchema,
  execute: executeClusterBySimilarity,
});

export type ClusterBySimilarityTool = typeof clusterBySimilarityTool;

function normalizeTaskIds(value: unknown): string[] {
  const toString = (item: unknown): string => {
    if (typeof item === 'string') {
      return item.trim();
    }

    if (item === null || typeof item === 'undefined') {
      return '';
    }

    if (typeof item === 'object' && item && 'task_id' in (item as Record<string, unknown>)) {
      return String((item as Record<string, unknown>).task_id ?? '').trim();
    }

    return String(item ?? '').trim();
  };

  if (Array.isArray(value)) {
    return value.map(toString).filter(str => str.length > 0);
  }

  if (value && typeof value === 'object' && Symbol.iterator in value) {
    return Array.from(value as Iterable<unknown>).map(toString).filter(str => str.length > 0);
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

  const single = toString(value);
  return single.length > 0 ? [single] : [];
}

function normalizeNumber(value: unknown): unknown {
  if (typeof value === 'number' || typeof value === 'bigint') {
    return Number(value);
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return value;
}
