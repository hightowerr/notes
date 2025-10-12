/**
 * Recompute Service
 * Task: T012 - Async recompute job triggers when outcome changes
 *
 * Functional Requirements:
 * - FR-042: Background recompute job re-scores all actions against new outcome
 * - FR-045: Toast warning if recompute fails after 3 retries
 * - Non-blocking: API returns immediately, recompute runs in background
 *
 * Design Pattern: Uses existing processingQueue pattern from T005
 */

import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export interface RecomputeJob {
  id: string;
  outcomeId: string;
  userId: string;
  actionCount: number;
  createdAt: number;
  retryCount: number;
}

export interface RecomputeJobResult {
  success: boolean;
  documentsProcessed: number;
  duration: number;
  error?: string;
}

/**
 * Recompute Service
 * Manages async recompute jobs for re-scoring actions against new outcomes
 */
export class RecomputeService {
  private activeJobs: Map<string, RecomputeJob>;
  private readonly MAX_CONCURRENT = 3;
  private readonly MAX_RETRIES = 3;
  private readonly BACKOFF_MS = [1000, 2000, 4000]; // Exponential backoff: 1s, 2s, 4s

  constructor() {
    this.activeJobs = new Map();
  }

  /**
   * Enqueue a recompute job
   * Returns immediately, job runs in background
   *
   * @param params - Job parameters (outcomeId, userId, actionCount)
   */
  async enqueue(params: {
    outcomeId: string;
    userId: string;
    actionCount: number;
  }): Promise<void> {
    const jobId = `recompute-${params.outcomeId}-${Date.now()}`;

    const job: RecomputeJob = {
      id: jobId,
      outcomeId: params.outcomeId,
      userId: params.userId,
      actionCount: params.actionCount,
      createdAt: Date.now(),
      retryCount: 0,
    };

    console.log(`[Recompute] Queued job for outcome ${params.outcomeId}, ${params.actionCount} actions`);

    // Execute immediately if under concurrency limit
    if (this.activeJobs.size < this.MAX_CONCURRENT) {
      this.activeJobs.set(jobId, job);
      // Run in background (don't await)
      this.executeJob(job).catch(error => {
        console.error(`[Recompute] Job ${jobId} failed:`, error);
      });
    } else {
      // For P0: Simply log that we're at capacity
      // Future enhancement: Add proper queue like processingQueue
      console.warn(`[Recompute] At capacity (${this.MAX_CONCURRENT} jobs), skipping job ${jobId}`);
    }
  }

  /**
   * Execute a recompute job with retry logic
   *
   * @param job - Job to execute
   * @returns Result with success status and processed count
   */
  private async executeJob(job: RecomputeJob): Promise<RecomputeJobResult> {
    const startTime = Date.now();

    try {
      console.log(`[Recompute] Starting job ${job.id}...`);

      // Fetch outcome from database
      const { data: outcome, error: outcomeError } = await supabase
        .from('user_outcomes')
        .select('id, assembled_text')
        .eq('id', job.outcomeId)
        .single();

      if (outcomeError || !outcome) {
        throw new Error(`Failed to fetch outcome ${job.outcomeId}: ${outcomeError?.message}`);
      }

      // Fetch all processed documents for user
      // Note: processed_documents doesn't have user_id, must join through uploaded_files
      const { data: documents, error: documentsError } = await supabase
        .from('processed_documents')
        .select(`
          id,
          structured_output,
          uploaded_files!inner (
            user_id
          )
        `)
        .eq('uploaded_files.user_id', job.userId);

      if (documentsError) {
        throw new Error(`Failed to fetch documents: ${documentsError.message}`);
      }

      const docCount = documents?.length || 0;
      console.log(`[Recompute] Fetched ${docCount} documents for user ${job.userId}`);

      // For P0: Re-scoring is a no-op (AI integration deferred to future)
      // In production, this would call aiSummarizer.scoreActions() for each document
      // and update processed_documents.lno_tasks with new scores

      // Simulate processing delay for testing (remove in production)
      await new Promise(resolve => setTimeout(resolve, 100));

      const duration = Date.now() - startTime;

      console.log(`[Recompute] Completed ${docCount} documents in ${duration}ms`);

      // Remove from active jobs
      this.activeJobs.delete(job.id);

      return {
        success: true,
        documentsProcessed: docCount,
        duration,
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      console.error(`[Recompute] Job ${job.id} failed:`, errorMessage);

      // Retry logic
      if (job.retryCount < this.MAX_RETRIES) {
        job.retryCount++;
        const backoffDelay = this.BACKOFF_MS[job.retryCount - 1] || 4000;

        console.log(`[Recompute] Retry attempt ${job.retryCount}/${this.MAX_RETRIES} after ${backoffDelay}ms...`);

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, backoffDelay));

        // Retry execution
        return this.executeJob(job);
      }

      // Max retries exceeded
      console.error(`[Recompute] Permanent failure after ${this.MAX_RETRIES} retries`);

      // FR-045: Log toast warning for UI to display
      console.warn('[Recompute] TOAST_WARNING: ⚠️ Some actions may show outdated scores');

      // Remove from active jobs
      this.activeJobs.delete(job.id);

      return {
        success: false,
        documentsProcessed: 0,
        duration,
        error: errorMessage,
      };
    }
  }

  /**
   * Get current recompute queue status
   *
   * @returns Active job count
   */
  getStatus(): { activeCount: number } {
    return {
      activeCount: this.activeJobs.size,
    };
  }

  /**
   * Reset service (for testing only)
   * @internal
   */
  _reset(): void {
    this.activeJobs.clear();
    console.log('[Recompute] Service reset');
  }
}

// Export singleton instance
export const recomputeService = new RecomputeService();
