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
  // Mastra may add additional fields like suspend and resumeData, allow them
  suspend: z.unknown().optional(),
  resumeData: z.unknown().optional(),
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
  input: any
): Promise<{
  tasks: SimilaritySearchResult[];
  count: number;
  query: string;
}> {
  console.log('[SemanticSearch] Input:', input);

  // Check if Mastra context format is used (with context property)
  // Otherwise assume direct arguments for testing compatibility
  const args = 'context' in input && input.context !== undefined ? input.context : input;
  
  if (!args) {
    throw new SemanticSearchToolError(
      'INVALID_INPUT',
      'Tool arguments not found in context object',
      false
    );
  }

  let query: string;
  let limit: number;
  let threshold: number;

  try {
    // Parse with the input schema (basic coercion only)
    ({ query, limit, threshold } = inputSchema.parse(args));
    console.log('[SemanticSearch] Parsed:', { query, limit, threshold });
  } catch (err) {
    console.error('[SemanticSearch] Basic parsing failed:', err);
    throw err;
  }

  // Now do the specific validation that was in the original manual checks
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



export const semanticSearchTool = createTool({
  id: 'semantic-search',
  description:
    'Search for tasks semantically similar to a natural language query using vector embeddings. Use this when you need related tasks for a topic, goal, or concept without exact keyword matches.',
  inputSchema,
  execute: executeSemanticSearch,
});

export type SemanticSearchTool = typeof semanticSearchTool;
