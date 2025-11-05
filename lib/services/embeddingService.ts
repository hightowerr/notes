/**
 * Embedding Service - Generate vector embeddings for tasks
 * Task: T023 - Automatic embedding generation during document processing
 *
 * Purpose: Generate 1536-dimension embeddings using OpenAI text-embedding-3-small
 * Used by: aiSummarizer.ts (automatic generation during document processing)
 */

import { embed } from 'ai';
import { openai } from '@ai-sdk/openai';
import type { EmbeddingGenerationResult } from '@/lib/types/embedding';
import crypto from 'crypto';

export class EmbeddingError extends Error {
  constructor(message: string, public readonly originalError?: Error) {
    super(message);
    this.name = 'EmbeddingError';
  }
}

/**
 * Validate OpenAI API key
 * @throws EmbeddingError if API key is missing
 */
function validateOpenAIKey() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new EmbeddingError(
      'OPENAI_API_KEY environment variable is not set. ' +
      'Please add it to .env.local file.'
    );
  }
}

/**
 * Generate deterministic task ID from task text and document ID
 * @param taskText - Task text content
 * @param documentId - Document UUID
 * @returns SHA-256 hash as task ID
 */
export function generateTaskId(taskText: string, documentId: string): string {
  const content = `${taskText}||${documentId}`;
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Generate single embedding for text
 * @param text - Text to embed
 * @param timeout - Timeout in milliseconds (default: 10000)
 * @returns 1536-dimension embedding array
 * @throws EmbeddingError if generation fails
 */
export async function generateEmbedding(
  text: string,
  timeout: number = 10000
): Promise<number[]> {
  if (!text || text.trim().length === 0) {
    throw new EmbeddingError('Task text cannot be empty');
  }

  try {
    validateOpenAIKey();

    console.log('[EmbeddingService] Generating embedding:', {
      textLength: text.length,
      timeout,
    });

    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Embedding generation timeout')), timeout);
    });

    // Race between embedding generation and timeout
    const result = await Promise.race([
      embed({
        model: openai.embedding('text-embedding-3-small'),
        value: text,
      }),
      timeoutPromise,
    ]);

    if (!result.embedding || result.embedding.length !== 1536) {
      throw new EmbeddingError(
        `Invalid embedding dimensions: expected 1536, got ${result.embedding?.length || 0}`
      );
    }

    console.log('[EmbeddingService] Embedding generated:', {
      dimensions: result.embedding.length,
    });

    return result.embedding;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.error('[EmbeddingService] Error generating embedding:', {
      error: errorMessage,
      textPreview: text.substring(0, 50) + '...',
    });

    // T025: Preserve original error message for better debugging
    throw new EmbeddingError(
      errorMessage,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Generate embeddings for batch of tasks
 * @param tasks - Array of tasks with task_id, task_text, document_id
 * @returns Array of generation results with status
 */
export async function generateBatchEmbeddings(
  tasks: Array<{ task_id: string; task_text: string; document_id: string }>
): Promise<EmbeddingGenerationResult[]> {
  if (!tasks || tasks.length === 0) {
    console.log('[EmbeddingService] No tasks to process');
    return [];
  }

  console.log('[EmbeddingService] Starting batch generation:', {
    taskCount: tasks.length,
    documentId: tasks[0]?.document_id,
  });

  const startTime = Date.now();

  // Process all tasks in parallel with individual error handling
  const results = await Promise.all(
    tasks.map(async (task): Promise<EmbeddingGenerationResult> => {
      try {
        const embedding = await generateEmbedding(task.task_text);

        return {
          task_id: task.task_id,
          status: 'completed',
          embedding,
          error_message: null,
        };

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        console.error('[EmbeddingService] Task embedding failed:', {
          task_id: task.task_id,
          document_id: task.document_id,
          error: errorMessage,
          timestamp: new Date().toISOString(),
        });

        // T025: Mark as 'pending' on API failure for graceful degradation
        // Tasks remain pending until manual re-process (no automatic retry per FR-031)
        return {
          task_id: task.task_id,
          status: 'pending',
          embedding: null,
          error_message: errorMessage,
        };
      }
    })
  );

  const duration = Date.now() - startTime;
  const completed = results.filter(r => r.status === 'completed').length;
  const pending = results.filter(r => r.status === 'pending').length;
  const failed = results.filter(r => r.status === 'failed').length;

  console.log('[EmbeddingService] Batch generation complete:', {
    duration,
    total: tasks.length,
    completed,
    pending,
    failed,
    successRate: `${((completed / tasks.length) * 100).toFixed(1)}%`,
  });

  return results;
}
