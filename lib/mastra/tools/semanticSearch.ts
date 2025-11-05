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
  const raw = input ?? {};
  const context = extractProperty(raw, 'context');

  const normalized = {
    query: normalizeQuery(
      extractProperty(raw, 'query') ?? extractProperty(context, 'query')
    ),
    limit: normalizeNumber(
      extractProperty(raw, 'limit') ?? extractProperty(context, 'limit')
    ),
    threshold: normalizeNumber(
      extractProperty(raw, 'threshold') ?? extractProperty(context, 'threshold')
    ),
  };

  console.log('[SemanticSearch] Raw input:', input);
  console.log('[SemanticSearch] Normalized input:', normalized);
  console.log('[SemanticSearch] input.context:', context);
  console.log(
    '[SemanticSearch] Type of normalized.query:',
    typeof normalized.query,
    'Value:',
    normalized.query
  );

  let query: string;
  let limit: number;
  let threshold: number;

  try {
    ({ query, limit, threshold } = inputSchema.parse(normalized));
    console.log('[SemanticSearch] Parsed values:', { query, limit, threshold });
  } catch (err) {
    console.error(
      '[SemanticSearch] Zod parse failed. Normalized snapshot:',
      normalized,
      'Error:',
      err
    );
    throw err;
  }

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

    const MIN_DYNAMIC_THRESHOLD = 0.4;
    const FALLBACK_STEP = 0.2;
    const MAX_FALLBACK_ATTEMPTS = 2;

    let attempts = 0;
    let currentThreshold = threshold;
    let filtered: SimilaritySearchResult[] = [];

    while (attempts <= MAX_FALLBACK_ATTEMPTS) {
      const results = await searchSimilarTasks(embedding, currentThreshold, limit);

      filtered = results
        .filter(
          (task) =>
            typeof task.similarity === 'number' &&
            task.similarity >= currentThreshold &&
            Number.isFinite(task.similarity)
        )
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);

      if (filtered.length > 0 || currentThreshold <= MIN_DYNAMIC_THRESHOLD) {
        break;
      }

      const nextThreshold = Math.max(
        MIN_DYNAMIC_THRESHOLD,
        Number((currentThreshold - FALLBACK_STEP).toFixed(2))
      );

      if (nextThreshold === currentThreshold) {
        break;
      }

      console.log(
        '[SemanticSearch] No matches above threshold; retrying with fallback threshold',
        { previousThreshold: currentThreshold, nextThreshold }
      );

      currentThreshold = nextThreshold;
      attempts += 1;
    }

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
  if (value === undefined) {
    return '';
  }

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
        // Ignore getter errors and continue
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

export const semanticSearchTool = createTool({
  id: 'semantic-search',
  description:
    'Search for tasks semantically similar to a natural language query using vector embeddings. Use this when you need related tasks for a topic, goal, or concept without exact keyword matches.',
  inputSchema,
  execute: executeSemanticSearch,
});

export type SemanticSearchTool = typeof semanticSearchTool;
