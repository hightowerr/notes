/**
 * Semantic Search API Endpoint
 * POST /api/embeddings/search
 *
 * Task: T024 - Users can search for tasks semantically similar to a query
 *
 * Performs vector similarity search across stored task embeddings.
 * Returns ranked results based on cosine similarity within 500ms.
 *
 * Implements FR-006, FR-007, FR-008, FR-009, FR-010, FR-015, FR-018
 */

import { NextRequest } from 'next/server';
import { SimilaritySearchRequestSchema } from '@/lib/schemas/embeddingSchema';
import { generateEmbedding } from '@/lib/services/embeddingService';
import { searchSimilarTasks } from '@/lib/services/vectorStorage';

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // 1. Parse and validate request body
    const body = await request.json();

    const validation = SimilaritySearchRequestSchema.safeParse(body);

    if (!validation.success) {
      const errors = validation.error.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message,
      }));

      console.error('[SearchAPI] Validation error:', {
        errors,
        body,
      });

      return Response.json(
        {
          error: 'Invalid request',
          message: errors[0]?.message || 'Request validation failed',
          code: 'INVALID_QUERY',
        },
        { status: 400 }
      );
    }

    const { query, limit, threshold } = validation.data;

    console.log('[SearchAPI] Search request:', {
      query: query.substring(0, 50) + (query.length > 50 ? '...' : ''),
      limit,
      threshold,
    });

    // 2. Generate embedding for query text
    const embeddingStartTime = Date.now();

    let queryEmbedding: number[];
    try {
      queryEmbedding = await generateEmbedding(query);
    } catch (error) {
      const embeddingDuration = Date.now() - embeddingStartTime;

      console.error('[SearchAPI] Embedding generation failed:', {
        duration: embeddingDuration,
        error: error instanceof Error ? error.message : String(error),
        query: query.substring(0, 50) + '...',
      });

      // Check if it's an API unavailability issue (503) or generation failure (500)
      const isUnavailable = error instanceof Error &&
        (error.message.includes('timeout') ||
         error.message.includes('unavailable') ||
         error.message.includes('OPENAI_API_KEY'));

      return Response.json(
        {
          error: isUnavailable ? 'Service unavailable' : 'Internal server error',
          message: isUnavailable
            ? 'Embedding service temporarily unavailable'
            : 'Failed to generate embedding for query',
          code: isUnavailable ? 'EMBEDDING_SERVICE_UNAVAILABLE' : 'EMBEDDING_GENERATION_FAILED',
        },
        { status: isUnavailable ? 503 : 500 }
      );
    }

    const embeddingDuration = Date.now() - embeddingStartTime;

    // 3. Perform vector similarity search
    const searchStartTime = Date.now();

    let results;
    try {
      results = await searchSimilarTasks(queryEmbedding, threshold, limit);
    } catch (error) {
      const searchDuration = Date.now() - searchStartTime;

      console.error('[SearchAPI] Vector search failed:', {
        duration: searchDuration,
        error: error instanceof Error ? error.message : String(error),
      });

      return Response.json(
        {
          error: 'Internal server error',
          message: 'Vector search query failed',
          code: 'DATABASE_ERROR',
        },
        { status: 500 }
      );
    }

    const searchDuration = Date.now() - searchStartTime;
    const totalDuration = Date.now() - startTime;

    // 4. Return search results
    const response = {
      tasks: results,
      query,
      count: results.length,
    };

    console.log('[SearchAPI] Search complete:', {
      totalDuration,
      embeddingDuration,
      searchDuration,
      resultsCount: results.length,
      avgSimilarity: results.length > 0
        ? (results.reduce((sum, r) => sum + r.similarity, 0) / results.length).toFixed(3)
        : 'N/A',
    });

    return Response.json(response, { status: 200 });

  } catch (error) {
    const totalDuration = Date.now() - startTime;

    console.error('[SearchAPI] Unexpected error:', {
      duration: totalDuration,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return Response.json(
      {
        error: 'Internal server error',
        message: 'An unexpected error occurred during search',
        code: 'INTERNAL_ERROR',
      },
      { status: 500 }
    );
  }
}
