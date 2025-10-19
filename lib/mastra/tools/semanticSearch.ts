import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { generateEmbedding, EmbeddingError } from '@/lib/services/embeddingService';
import { searchSimilarTasks, StorageError } from '@/lib/services/vectorStorage';
import type { SimilaritySearchResult } from '@/lib/types/embedding';

type SemanticSearchErrorCode =
  | 'INVALID_THRESHOLD'
  | 'INVALID_LIMIT'
  | 'EMBEDDING_GENERATION_FAILED'
  | 'EMBEDDING_SERVICE_UNAVAILABLE'
  | 'DATABASE_ERROR';

class SemanticSearchToolError extends Error {
  constructor(
    public readonly code: SemanticSearchErrorCode,
    message: string,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = 'SemanticSearchToolError';
  }
}

const inputSchema = z.object({
  query: z
    .string()
    .min(1, 'Query must contain text')
    .max(500, 'Query cannot exceed 500 characters')
    .transform(value => value.trim()),
  limit: z.coerce.number().default(20),
  threshold: z.coerce.number().default(0.7),
});

function isRetryableEmbeddingError(error: EmbeddingError): boolean {
  const original = error.originalError as
    | (Error & { status?: number; statusCode?: number; code?: string })
    | undefined;

  if (!original) {
    return false;
  }

  const status = original.status ?? original.statusCode;
  if (status === 408 || status === 429 || status === 503) {
    return true;
  }

  if (typeof original.code === 'string') {
    return ['ETIMEOUT', 'ECONNRESET', 'EAI_AGAIN', 'ETIMEDOUT'].includes(
      original.code.toUpperCase()
    );
  }

  const message = (original.message || '').toLowerCase();
  return message.includes('timeout') || message.includes('rate limit');
}

async function executeSemanticSearch(
  input: z.input<typeof inputSchema>
): Promise<{
  tasks: SimilaritySearchResult[];
  count: number;
  query: string;
}> {
  const raw = (input ?? {}) as Record<string, unknown>;

  const normalized = {
    query: normalizeQuery(raw.query),
    limit: normalizeNumber(raw.limit),
    threshold: normalizeNumber(raw.threshold),
  };

  const { query, limit, threshold } = inputSchema.parse(normalized);

  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new SemanticSearchToolError(
      'INVALID_THRESHOLD',
      'Threshold must be between 0.0 and 1.0',
      false
    );
  }

  if (!Number.isFinite(limit) || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new SemanticSearchToolError(
      'INVALID_LIMIT',
      'Limit must be an integer between 1 and 100',
      false
    );
  }

  try {
    const embedding = await generateEmbedding(query);
    const results = await searchSimilarTasks(embedding, threshold, limit);

    // Defensive filtering keeps tool resilient if database function misconfigures threshold/ordering.
    const filtered = results
      .filter(
        (task) =>
          typeof task.similarity === 'number' &&
          task.similarity >= threshold &&
          Number.isFinite(task.similarity)
      )
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    return {
      tasks: filtered,
      count: filtered.length,
      query,
    };
  } catch (error) {
    if (error instanceof SemanticSearchToolError) {
      throw error;
    }

    if (error instanceof EmbeddingError) {
      const retryable = isRetryableEmbeddingError(error);
      throw new SemanticSearchToolError(
        retryable ? 'EMBEDDING_SERVICE_UNAVAILABLE' : 'EMBEDDING_GENERATION_FAILED',
        error.message,
        retryable
      );
    }

    if (error instanceof StorageError) {
      throw new SemanticSearchToolError('DATABASE_ERROR', error.message, true);
    }

    throw new SemanticSearchToolError(
      'DATABASE_ERROR',
      error instanceof Error ? error.message : 'Unknown database error',
      true
    );
  }
}

function normalizeQuery(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    const first = value.find(item => typeof item === 'string') ?? '';
    return String(first);
  }

  if (value === null || typeof value === 'undefined') {
    return '';
  }

  return String(value);
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

export const semanticSearchTool = createTool({
  id: 'semantic-search',
  description:
    'Search for tasks semantically similar to a natural language query using vector embeddings. Use this when you need related tasks for a topic, goal, or concept without exact keyword matches.',
  inputSchema,
  execute: executeSemanticSearch,
});

export type SemanticSearchTool = typeof semanticSearchTool;
