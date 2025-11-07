import { randomUUID } from 'node:crypto';

import { z } from 'zod';
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';

import { generateEmbedding, EmbeddingError } from '@/lib/services/embeddingService';
import { searchSimilarTasks } from '@/lib/services/vectorStorage';
import { getTaskRecordsByIds } from '@/lib/services/taskRepository';
import type { SimilaritySearchResult } from '@/lib/types/embedding';
import { bridgingTaskSchema, bridgingTaskResponseSchema, cognitionLevelSchema } from '@/lib/schemas/bridgingTaskSchema';

type BridgingTask = z.infer<typeof bridgingTaskSchema>;

type GenerateBridgingTasksParams = {
  gapId: string;
  predecessorTaskId: string;
  successorTaskId: string;
  outcomeStatement?: string | null;
  manualExamples?: string[] | null;
};

type GenerateBridgingTasksResult = z.infer<typeof bridgingTaskResponseSchema>;
type BatchGenerationResult = {
  gapId: string;
  status: 'fulfilled' | 'rejected';
  result?: GenerateBridgingTasksResult;
  error?: unknown;
};

const generatedTaskSchema = z.object({
  task_text: z.string().min(10).max(500),
  estimated_hours: z.number().int().min(8).max(160),
  cognition_level: cognitionLevelSchema,
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(20).max(1000),
});

const agentResponseSchema = z.object({
  bridging_tasks: z.array(generatedTaskSchema).min(1).max(3),
});

type TaskRecord = {
  task_id: string;
  task_text: string;
};

export class TaskGenerationError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'TASK_NOT_FOUND'
      | 'GENERATION_FAILED'
      | 'NO_SUGGESTIONS'
      | 'EMBEDDING_ERROR'
      | 'VALIDATION_ERROR'
      | 'REQUIRES_MANUAL_EXAMPLES'
      | 'TIMEOUT'
      | 'AI_SERVICE_ERROR',
    public readonly metadata?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'TaskGenerationError';
  }
}

function normalizeTaskText(text: string | null): string {
  return (text ?? '').trim();
}

/**
 * Creates a promise that rejects after the specified timeout
 * @param ms Timeout in milliseconds
 * @returns Promise that rejects with TaskGenerationError after timeout
 */
function createTimeout(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(
        new TaskGenerationError(
          `AI generation timed out after ${ms}ms. Please try again.`,
          'TIMEOUT',
          { timeout_ms: ms }
        )
      );
    }, ms);
  });
}

function normalizeGenerationError(error: unknown): TaskGenerationError {
  if (error instanceof TaskGenerationError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  const lowerMessage = message.toLowerCase();

  const isApiKeyError =
    lowerMessage.includes('api key') ||
    lowerMessage.includes('unauthorized') ||
    lowerMessage.includes('authentication');
  if (isApiKeyError) {
    return new TaskGenerationError(
      'AI service error: Invalid authentication while generating bridging tasks.',
      'AI_SERVICE_ERROR',
      { original_error: message }
    );
  }

  const isRateLimitError =
    lowerMessage.includes('rate limit') ||
    lowerMessage.includes('quota');
  if (isRateLimitError) {
    return new TaskGenerationError(
      `AI service error: ${message}`,
      'AI_SERVICE_ERROR',
      { original_error: message }
    );
  }

  return new TaskGenerationError(
    `Task generation failed: ${message}`,
    'GENERATION_FAILED',
    { original_error: message }
  );
}

function isTransientGenerationError(error: TaskGenerationError): boolean {
  if (error.code === 'TIMEOUT') {
    return true;
  }

  const lowerMessage = error.message.toLowerCase();

  if (
    error.code === 'AI_SERVICE_ERROR' &&
    (lowerMessage.includes('rate limit') ||
      lowerMessage.includes('temporarily') ||
      lowerMessage.includes('try again'))
  ) {
    return true;
  }

  if (
    error.code === 'GENERATION_FAILED' &&
    (lowerMessage.includes('timeout') ||
      lowerMessage.includes('temporarily') ||
      lowerMessage.includes('overload') ||
      lowerMessage.includes('connection'))
  ) {
    return true;
  }

  return false;
}

function formatSearchResults(results: SimilaritySearchResult[]): string {
  if (results.length === 0) {
    return 'None found.\n';
  }

  return results
    .slice(0, 5)
    .map((result, index) => {
      const similarity = Math.round(result.similarity * 100);
      const text = result.task_text.length > 220
        ? `${result.task_text.slice(0, 217)}…`
        : result.task_text;
      return `${index + 1}. ${text} (${similarity}% similar)`;
    })
    .join('\n');
}

function formatManualExamples(manualExamples: string[] | null | undefined): string {
  if (!manualExamples || manualExamples.length === 0) {
    return 'No manual examples provided.';
  }

  return manualExamples
    .map(example => `- ${example.trim()}`)
    .join('\n');
}

function deduplicateGeneratedTasks(
  tasks: z.infer<typeof generatedTaskSchema>[],
  predecessorText: string,
  successorText: string
): z.infer<typeof generatedTaskSchema>[] {
  const seen = new Set<string>();
  const predecessor = predecessorText.trim().toLowerCase();
  const successor = successorText.trim().toLowerCase();

  return tasks.filter(task => {
    const normalized = task.task_text.trim().toLowerCase();
    if (!normalized || normalized === predecessor || normalized === successor) {
      return false;
    }
    if (seen.has(normalized)) {
      return false;
    }
    seen.add(normalized);
    return true;
  });
}

async function fetchTasks(taskIds: string[]): Promise<TaskRecord[]> {
  const { tasks, missingIds } = await getTaskRecordsByIds(taskIds, {
    recoverMissing: true,
  });

  if (tasks.length !== taskIds.length || missingIds.length > 0) {
    const message =
      missingIds.length > 0
        ? `Missing task embeddings for IDs: ${missingIds.join(', ')}`
        : 'Predecessor or successor task not found';

    throw new TaskGenerationError(message, 'TASK_NOT_FOUND');
  }

  return tasks.map(task => ({
    task_id: task.task_id,
    task_text: task.task_text,
  }));
}

export async function generateBridgingTasks(
  params: GenerateBridgingTasksParams
): Promise<GenerateBridgingTasksResult> {
  const {
    gapId,
    predecessorTaskId,
    successorTaskId,
    outcomeStatement,
    manualExamples,
  } = params;

  if (!gapId || !predecessorTaskId || !successorTaskId) {
    throw new TaskGenerationError('Missing required parameters', 'VALIDATION_ERROR');
  }

  const tasks = await fetchTasks([predecessorTaskId, successorTaskId]);
  if (tasks.length !== 2) {
    throw new TaskGenerationError(
      'Predecessor or successor task not found',
      'TASK_NOT_FOUND'
    );
  }

  const predecessor = tasks.find(task => task.task_id === predecessorTaskId);
  const successor = tasks.find(task => task.task_id === successorTaskId);

  if (!predecessor || !successor) {
    throw new TaskGenerationError(
      'Predecessor or successor task not found',
      'TASK_NOT_FOUND'
    );
  }

  const predecessorText = normalizeTaskText(predecessor.task_text);
  const successorText = normalizeTaskText(successor.task_text);

  if (!predecessorText || !successorText) {
    throw new TaskGenerationError(
      'Predecessor or successor task is missing description text',
      'TASK_NOT_FOUND'
    );
  }

  let semanticSearchResults: SimilaritySearchResult[] = [];

  try {
    const embeddingQuery = `${predecessorText} followed by ${successorText}`;
    const embedding = await generateEmbedding(embeddingQuery);
    semanticSearchResults = await searchSimilarTasks(embedding, 0.6, 5);
  } catch (error) {
    const message = error instanceof EmbeddingError ? error.message : String(error);
    console.error('[TaskGenerationService] Semantic search failed:', message);
    if (error instanceof EmbeddingError && message.includes('OPENAI_API_KEY')) {
      throw new TaskGenerationError(message, 'EMBEDDING_ERROR');
    }
  }

  // Check for zero semantic search results (T004: Manual examples required)
  if (semanticSearchResults.length === 0 && (!manualExamples || manualExamples.length === 0)) {
    throw new TaskGenerationError(
      'No similar tasks found in the existing corpus. Please provide 1-2 example tasks to help generate relevant suggestions.',
      'REQUIRES_MANUAL_EXAMPLES',
      { requires_manual_examples: true }
    );
  }

  const searchResultsSummary = formatSearchResults(semanticSearchResults);
  const manualExampleSummary = formatManualExamples(manualExamples);

  const prompt = `
You are helping to fill a logical gap in a user's prioritized task plan.

USER OUTCOME:
${outcomeStatement ?? 'Outcome not provided.'}

GAP CONTEXT:
Predecessor Task: "${predecessorText}"
Successor Task: "${successorText}"

SEMANTIC SEARCH RESULTS (examples of similar tasks):
${searchResultsSummary}

MANUAL EXAMPLES (if provided):
${manualExampleSummary}

Generate 1-3 bridging tasks that logically connect the predecessor to the successor.

Constraints:
- Each task must take 1-4 weeks (8-160 hours).
- Tasks must be specific, actionable, and align with the user's outcome.
- Avoid duplicating the predecessor or successor tasks.
- Provide a confidence score (0.0-1.0) representing how well the task fills the gap.
- Assign a cognition level: "low", "medium", or "high".
- Explain the reasoning for each task in 1-3 sentences.

Respond ONLY with valid JSON matching the specified schema.`;

  const generationStart = Date.now();

  // T005: Add 8-second timeout for AI generation with manual retry only
  const GENERATION_TIMEOUT_MS = 8000;
  const MAX_GENERATION_ATTEMPTS = 2;

  let agentResponse: z.infer<typeof agentResponseSchema> | null = null;
  let lastGenerationError: TaskGenerationError | null = null;

  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
    try {
      const generationPromise = generateObject({
        model: openai('gpt-4o-mini'),
        schema: agentResponseSchema,
        prompt,
        temperature: 0.3,
      });

      const { object } = await Promise.race([
        generationPromise,
        createTimeout(GENERATION_TIMEOUT_MS),
      ]);

      agentResponse = object;
      break;
    } catch (error) {
      const normalizedError = normalizeGenerationError(error);
      if (attempt < MAX_GENERATION_ATTEMPTS - 1 && isTransientGenerationError(normalizedError)) {
        lastGenerationError = normalizedError;
        continue;
      }
      throw normalizedError;
    }
  }

  if (!agentResponse) {
    throw lastGenerationError ??
      new TaskGenerationError(
        'Task generation failed: no response received from AI service.',
        'GENERATION_FAILED'
      );
  }

  const deduplicatedTasks = deduplicateGeneratedTasks(
    agentResponse.bridging_tasks,
    predecessorText,
    successorText
  );

  if (deduplicatedTasks.length === 0) {
    throw new TaskGenerationError(
      'The AI did not return any valid bridging tasks',
      'NO_SUGGESTIONS'
    );
  }

  const finalTasks: BridgingTask[] = deduplicatedTasks.map(task => ({
    id: randomUUID(),
    gap_id: gapId,
    task_text: task.task_text.trim(),
    estimated_hours: task.estimated_hours,
    cognition_level: task.cognition_level,
    confidence: Math.min(1, Math.max(0, task.confidence)),
    reasoning: task.reasoning.trim(),
    source: 'ai_generated',
    requires_review: true,
    created_at: new Date().toISOString(),
  }));

  const uniqueTasks: BridgingTask[] = [];
  const seenText = new Set<string>();
  for (const task of finalTasks) {
    const normalized = task.task_text.toLowerCase();
    if (!seenText.has(normalized)) {
      uniqueTasks.push(task);
      seenText.add(normalized);
    }
  }

  const generationDuration = Math.max(0, Date.now() - generationStart);

  return {
    bridging_tasks: uniqueTasks,
    search_results_count: semanticSearchResults.length,
    generation_duration_ms: generationDuration,
  };
}

export async function generateBridgingTasksBatch(
  params: GenerateBridgingTasksParams[]
): Promise<{
  total_generation_duration_ms: number;
  results: BatchGenerationResult[];
}> {
  if (!Array.isArray(params) || params.length === 0) {
    return {
      total_generation_duration_ms: 0,
      results: [],
    };
  }

  const startedAt = Date.now();

  const operations = params.map(async (param) => {
    const result = await generateBridgingTasks(param);
    return { gapId: param.gapId, result };
  });

  const settled = await Promise.allSettled(operations);
  const finishedAt = Date.now();

  const results: BatchGenerationResult[] = settled.map((entry, index) => {
    const gapId = params[index]?.gapId ?? 'unknown-gap';
    if (entry.status === 'fulfilled') {
      return {
        gapId,
        status: 'fulfilled',
        result: entry.value.result,
      };
    }

    return {
      gapId,
      status: 'rejected',
      error: entry.reason,
    };
  });

  return {
    total_generation_duration_ms: Math.max(0, finishedAt - startedAt),
    results,
  };
}
