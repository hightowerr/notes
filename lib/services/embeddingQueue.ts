/**
 * Embedding Queue Service
 * Task: T026 - System queues embedding requests to prevent API rate limiting
 *
 * Functional Requirements:
 * - FR-029: Process embeddings at controlled rate to prevent OpenAI rate limiting
 * - FR-030: Handle concurrent uploads without conflicts
 * - Max 3 concurrent document processing jobs
 * - Batch tasks in groups of 50 for efficient processing
 *
 * Design Pattern: Singleton for shared state across API routes
 * Based on: processingQueue.ts (T005 implementation)
 */

import pLimit from 'p-limit';
import { generateBatchEmbeddings } from './embeddingService';
import { storeEmbeddings } from './vectorStorage';
import type { TaskEmbeddingInsert } from '@/lib/types/embedding';

// Max 3 concurrent document processing jobs
const limit = pLimit(3);

/**
 * Task to be embedded
 */
export interface EmbeddingTask {
  task_id: string;
  task_text: string;
  document_id: string;
}

/**
 * Result from processing a batch of tasks
 */
export interface BatchProcessingResult {
  success: number;
  failed: number;
  pending: number;
  duration: number;
}

/**
 * Queue metrics for monitoring
 */
export interface QueueMetrics {
  queueDepth: number;
  activeJobs: number;
  totalProcessed: number;
  totalFailed: number;
}

/**
 * Embedding Queue Service
 * Controls rate of embedding generation to prevent API rate limiting
 */
export class EmbeddingQueue {
  private queueDepth = 0;
  private activeJobs = 0;
  private totalProcessed = 0;
  private totalFailed = 0;
  private readonly BATCH_SIZE = 50;

  /**
   * Enqueue tasks for embedding generation
   * @param tasks - Array of tasks to embed
   * @param documentId - Document UUID for logging
   * @returns Promise that resolves when all tasks are processed
   */
  async enqueue(tasks: EmbeddingTask[], documentId: string): Promise<BatchProcessingResult> {
    if (!tasks || tasks.length === 0) {
      console.log('[EmbeddingQueue] No tasks to enqueue');
      return {
        success: 0,
        failed: 0,
        pending: 0,
        duration: 0,
      };
    }

    this.queueDepth += tasks.length;
    this.activeJobs++;

    console.log(`[EmbeddingQueue] Enqueued ${tasks.length} tasks for document ${documentId.slice(0, 8)}... (queue depth: ${this.queueDepth}, active jobs: ${this.activeJobs})`);

    try {
      // Use p-limit to control concurrency (max 3 concurrent documents)
      const result = await limit(async () => {
        return await this.processBatch(tasks, documentId);
      });

      return result;

    } finally {
      this.queueDepth -= tasks.length;
      this.activeJobs--;
    }
  }

  /**
   * Process batch of tasks for a single document
   * @param tasks - All tasks for the document
   * @param documentId - Document UUID
   * @returns Processing result with success/failure counts
   */
  private async processBatch(
    tasks: EmbeddingTask[],
    documentId: string
  ): Promise<BatchProcessingResult> {
    const startTime = Date.now();

    // Split tasks into batches of 50
    const batches: EmbeddingTask[][] = [];
    for (let i = 0; i < tasks.length; i += this.BATCH_SIZE) {
      batches.push(tasks.slice(i, i + this.BATCH_SIZE));
    }

    console.log(`[EmbeddingQueue] Processing ${batches.length} batch(es) for document ${documentId.slice(0, 8)}...`);

    let totalSuccess = 0;
    let totalFailed = 0;
    let totalPending = 0;

    // Process each batch sequentially
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const batchNum = i + 1;

      console.log(`[EmbeddingQueue] Processing batch ${batchNum}/${batches.length} (${batch.length} tasks)`);

      const batchStartTime = Date.now();

      try {
        // Generate embeddings for batch
        const embeddingResults = await generateBatchEmbeddings(batch);

        // Prepare embeddings for storage
        const embeddingsToStore: TaskEmbeddingInsert[] = embeddingResults.map(result => ({
          task_id: result.task_id,
          task_text: batch.find(t => t.task_id === result.task_id)!.task_text,
          document_id: documentId,
          embedding: result.embedding || Array(1536).fill(0), // Fallback to zero vector
          status: result.status,
          error_message: result.error_message,
        }));

        // Store embeddings
        await storeEmbeddings(embeddingsToStore);

        // Count results by status
        const completed = embeddingResults.filter(r => r.status === 'completed').length;
        const pending = embeddingResults.filter(r => r.status === 'pending').length;
        const failed = embeddingResults.filter(r => r.status === 'failed').length;

        totalSuccess += completed;
        totalPending += pending;
        totalFailed += failed;

        const batchDuration = ((Date.now() - batchStartTime) / 1000).toFixed(1);

        console.log(`[EmbeddingQueue] Batch ${batchNum} complete (${batchDuration}s) - Success: ${completed}, Pending: ${pending}, Failed: ${failed}`);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        console.error(`[EmbeddingQueue] Batch ${batchNum} failed:`, {
          error: errorMessage,
          batchSize: batch.length,
          documentId: documentId.slice(0, 8) + '...',
        });

        // Mark all tasks in failed batch as pending (graceful degradation)
        totalPending += batch.length;
      }
    }

    const totalDuration = Date.now() - startTime;

    // Update metrics
    this.totalProcessed += totalSuccess;
    this.totalFailed += totalFailed;

    console.log(`[EmbeddingQueue] Document processing complete:`, {
      documentId: documentId.slice(0, 8) + '...',
      duration: totalDuration,
      totalTasks: tasks.length,
      success: totalSuccess,
      pending: totalPending,
      failed: totalFailed,
      successRate: `${((totalSuccess / tasks.length) * 100).toFixed(1)}%`,
    });

    return {
      success: totalSuccess,
      failed: totalFailed,
      pending: totalPending,
      duration: totalDuration,
    };
  }

  /**
   * Get current queue metrics
   * @returns Queue status and metrics
   */
  getMetrics(): QueueMetrics {
    return {
      queueDepth: this.queueDepth,
      activeJobs: this.activeJobs,
      totalProcessed: this.totalProcessed,
      totalFailed: this.totalFailed,
    };
  }

  /**
   * Reset queue metrics (for testing only)
   * @internal
   */
  _reset(): void {
    this.queueDepth = 0;
    this.activeJobs = 0;
    this.totalProcessed = 0;
    this.totalFailed = 0;
    console.log('[EmbeddingQueue] Queue reset');
  }
}

// Export singleton instance for use across API routes
export const embeddingQueue = new EmbeddingQueue();
