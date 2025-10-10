/**
 * Processing Queue Service
 * Task: T005 - Concurrent upload queue management
 *
 * Functional Requirements:
 * - FR-017: Process max 3 files concurrently, queue additional uploads
 * - FIFO ordering for queued jobs
 * - Automatic processing trigger when slot becomes available
 *
 * Design Pattern: Singleton for shared state across API routes
 */

export interface QueueJob {
  fileId: string;
  filename: string;
  addedAt: number;
}

export interface EnqueueResult {
  immediate: boolean;
  queuePosition: number | null;
}

export interface QueueStatus {
  activeCount: number;
  queuedCount: number;
  queuedJobs: QueueJob[];
}

export class ProcessingQueue {
  private activeJobs: Set<string>;
  private queuedJobs: QueueJob[];
  private readonly MAX_CONCURRENT = 3;

  // Optional callback for when a queued job becomes ready to process
  public onJobReady?: (fileId: string) => Promise<void>;

  constructor() {
    this.activeJobs = new Set();
    this.queuedJobs = [];
  }

  /**
   * Add a job to the queue or mark it as active for immediate processing
   *
   * @param fileId - Unique file identifier
   * @param filename - Original filename for logging
   * @returns Result indicating if processing starts immediately and queue position
   */
  enqueue(fileId: string, filename: string): EnqueueResult {
    // Check if we're under the concurrent limit
    if (this.activeJobs.size < this.MAX_CONCURRENT) {
      // Start processing immediately
      this.activeJobs.add(fileId);

      console.log('[QUEUE] Job added for immediate processing:', {
        fileId,
        filename,
        activeCount: this.activeJobs.size,
        queuedCount: this.queuedJobs.length,
        timestamp: new Date().toISOString(),
      });

      return {
        immediate: true,
        queuePosition: null,
      };
    }

    // At capacity - add to queue
    const job: QueueJob = {
      fileId,
      filename,
      addedAt: Date.now(),
    };

    this.queuedJobs.push(job);
    const queuePosition = this.queuedJobs.length;

    console.log('[QUEUE] Job added to queue:', {
      fileId,
      filename,
      queuePosition,
      activeCount: this.activeJobs.size,
      queuedCount: this.queuedJobs.length,
      timestamp: new Date().toISOString(),
    });

    return {
      immediate: false,
      queuePosition,
    };
  }

  /**
   * Mark a job as complete and process the next queued job if available
   *
   * @param fileId - File ID of completed job
   * @returns File ID of next job to process, or null if queue is empty
   */
  async complete(fileId: string): Promise<string | null> {
    // Remove from active jobs (if present)
    const wasActive = this.activeJobs.delete(fileId);

    if (!wasActive) {
      // Job wasn't in active set (already completed or never existed)
      console.warn('[QUEUE] Attempted to complete non-active job:', {
        fileId,
        timestamp: new Date().toISOString(),
      });
      return null;
    }

    console.log('[QUEUE] Job completed:', {
      fileId,
      activeCount: this.activeJobs.size,
      queuedCount: this.queuedJobs.length,
      timestamp: new Date().toISOString(),
    });

    // Check if there are queued jobs to process
    if (this.queuedJobs.length === 0) {
      console.log('[QUEUE] No queued jobs to process');
      return null;
    }

    // Get next job from queue (FIFO)
    const nextJob = this.queuedJobs.shift()!;
    this.activeJobs.add(nextJob.fileId);

    const waitTime = Date.now() - nextJob.addedAt;

    console.log('[QUEUE] Processing next queued job:', {
      fileId: nextJob.fileId,
      filename: nextJob.filename,
      waitTime,
      newActiveCount: this.activeJobs.size,
      remainingQueued: this.queuedJobs.length,
      timestamp: new Date().toISOString(),
    });

    // Trigger callback if provided (for automatic processing)
    if (this.onJobReady) {
      try {
        await this.onJobReady(nextJob.fileId);
      } catch (error) {
        console.error('[QUEUE] Error in onJobReady callback:', {
          fileId: nextJob.fileId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return nextJob.fileId;
  }

  /**
   * Get current queue status
   *
   * @returns Current state of active and queued jobs
   */
  getStatus(): QueueStatus {
    return {
      activeCount: this.activeJobs.size,
      queuedCount: this.queuedJobs.length,
      queuedJobs: [...this.queuedJobs], // Return copy to prevent external mutation
    };
  }

  /**
   * Reset queue (for testing purposes only)
   * @internal
   */
  _reset(): void {
    this.activeJobs.clear();
    this.queuedJobs = [];
    console.log('[QUEUE] Queue reset');
  }
}

// Export singleton instance for use across API routes
export const processingQueue = new ProcessingQueue();
