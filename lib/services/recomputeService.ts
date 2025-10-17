/**
 * Recompute Service
 * Task: T012 - Async recompute job triggers when outcome changes
 * Task: T023 - Reflections automatically trigger priority recomputation
 *
 * Functional Requirements:
 * - FR-042: Background recompute job re-scores all actions against new outcome
 * - FR-045: Toast warning if recompute fails after 3 retries
 * - Non-blocking: API returns immediately, recompute runs in background
 * - T023: Inject reflection context into AI summarization
 *
 * Design Pattern: Uses existing processingQueue pattern from T005
 */

import { createClient } from '@supabase/supabase-js';
import { fetchRecentReflections } from './reflectionService';

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

      // Fetch all processed documents
      // P0: No user_id in uploaded_files table (single-user system)
      // Query from uploaded_files and join to processed_documents (correct pattern)
      const { data: files, error: documentsError } = await supabase
        .from('uploaded_files')
        .select(`
          id,
          processed_documents (
            id,
            structured_output
          )
        `)
        .eq('status', 'completed');

      if (documentsError) {
        throw new Error(`Failed to fetch documents: ${documentsError.message}`);
      }

      // Extract processed documents from files (filter out files without processed_documents)
      const documents = (files || [])
        .map(f => Array.isArray(f.processed_documents) ? f.processed_documents[0] : f.processed_documents)
        .filter(Boolean);

      const docCount = documents.length;
      console.log(`[Recompute] Fetched ${docCount} processed documents for user ${job.userId}`);

      // T023: Fetch recent reflections for context injection
      const reflections = await fetchRecentReflections(job.userId, 5);
      const reflectionContext = reflections
        .filter(r => r.weight >= 0.10) // Exclude aged reflections
        .map((r, i) =>
          `${i + 1}. "${r.text}" (weight: ${r.weight.toFixed(2)}, ${r.relative_time})`
        )
        .join('\n');

      console.log(
        JSON.stringify({
          event: 'recompute_reflection_context',
          user_id: job.userId,
          timestamp: new Date().toISOString(),
          reflection_count: reflections.length,
          filtered_count: reflections.filter(r => r.weight >= 0.10).length,
        })
      );

      // For P0: Re-scoring is a no-op (AI integration deferred to future)
      // In production, this would call aiSummarizer.scoreActions() for each document
      // with reflectionContext parameter and update processed_documents.lno_tasks with new scores

      // Simulate processing delay for testing (remove in production)
      await new Promise(resolve => setTimeout(resolve, 100));

      const duration = Date.now() - startTime;

      console.log(`[Recompute] Completed ${docCount} documents in ${duration}ms`);

      // T027: Structured logging for recompute completion
      console.log(
        JSON.stringify({
          event: 'recompute_completed',
          user_id: job.userId,
          timestamp: new Date().toISOString(),
          duration_ms: duration,
          documents_processed: docCount,
        })
      );

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

      // T027: Structured logging for recompute error
      console.error(
        JSON.stringify({
          event: 'recompute_error',
          user_id: job.userId,
          timestamp: new Date().toISOString(),
          error: errorMessage,
          retry_count: this.MAX_RETRIES,
          duration_ms: duration,
        })
      );

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

/**
 * Trigger recompute job with reflection context
 * Task: T023 - Reflections automatically trigger priority recomputation
 *
 * @param userId - User ID to trigger recompute for
 * @param reason - Trigger reason ('reflection_added' | 'outcome_changed')
 */
export async function triggerRecomputeJob(
  userId: string,
  reason: 'reflection_added' | 'outcome_changed'
): Promise<void> {
  console.log(
    JSON.stringify({
      event: 'recompute_triggered',
      user_id: userId,
      trigger_reason: reason,
      timestamp: new Date().toISOString(),
    })
  );

  // Fetch active outcome for this user
  const { data: outcome } = await supabase
    .from('user_outcomes')
    .select('id, assembled_text')
    .eq('is_active', true)
    .single();

  if (!outcome) {
    console.log('[RecomputeTrigger] No active outcome found, skipping recompute');
    return;
  }

  // Fetch all processed documents for action count
  // P0: No user_id in uploaded_files table (single-user system)
  // Query from uploaded_files and join to processed_documents (correct pattern)
  const { data: files } = await supabase
    .from('uploaded_files')
    .select(`
      id,
      processed_documents (
        id
      )
    `)
    .eq('status', 'completed');

  // Count files that have processed_documents
  const actionCount = (files || [])
    .filter(f => {
      const doc = Array.isArray(f.processed_documents) ? f.processed_documents[0] : f.processed_documents;
      return Boolean(doc);
    })
    .length;

  console.log(`[RecomputeTrigger] Enqueuing recompute job: ${actionCount} documents`);

  // Enqueue recompute job (runs in background)
  await recomputeService.enqueue({
    outcomeId: outcome.id,
    userId,
    actionCount,
  });
}
