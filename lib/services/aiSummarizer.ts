/**
 * AI Summarization Service
 * Extracts structured data from Markdown using OpenAI GPT-4
 * Implements FR-003 (Data Extraction), FR-010 (Retry Logic), FR-011 (Confidence Flagging)
 */

import { generateObject, embed } from 'ai';
import { openai } from '@ai-sdk/openai';
import { DocumentOutputSchema, type DocumentOutput, type Action } from '@/lib/schemas';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { generateTaskId } from './embeddingService';
import { embeddingQueue } from './embeddingQueue';
import type { EmbeddingTask } from './embeddingQueue';

export class SummarizationError extends Error {
  constructor(message: string, public readonly originalError?: Error) {
    super(message);
    this.name = 'SummarizationError';
  }
}

// Validate OpenAI API key
function validateOpenAIKey() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new SummarizationError(
      'OPENAI_API_KEY environment variable is not set. ' +
      'Please add it to .env.local file.'
    );
  }
}

/**
 * Extract structured data from Markdown content using AI
 * @param markdown - Markdown content to analyze
 * @param options - Optional configuration (retry flag)
 * @returns Structured output with confidence score and duration
 * @throws SummarizationError if extraction fails
 */
export async function extractStructuredData(
  markdown: string,
  options?: { retry?: boolean }
): Promise<{
  output: DocumentOutput;
  confidence: number;
  duration: number;
}> {
  console.log('[SUMMARIZE START]', {
    markdownLength: markdown.length,
    retry: options?.retry || false,
  });

  const startTime = Date.now();

  try {
    validateOpenAIKey();

    // Adjust parameters for retry (FR-010)
    const temperature = options?.retry ? 0.3 : 0.7;
    const maxTokens = options?.retry ? 2000 : 1500;

    const prompt = buildExtractionPrompt(markdown);

    // Use Vercel AI SDK's generateObject for structured output
    const { object: output } = await generateObject({
      model: openai('gpt-4o'),
      schema: DocumentOutputSchema,
      prompt,
      temperature,
      maxTokens,
    });

    // Calculate confidence score (FR-011)
    const confidence = calculateConfidence(output);

    const duration = Date.now() - startTime;

    console.log('[SUMMARIZE COMPLETE]', {
      duration,
      confidence,
      topicsCount: output.topics.length,
      decisionsCount: output.decisions.length,
      actionsCount: output.actions.length,
      actionsWithEstimates: output.actions.filter(a => a.estimated_hours).length,
      lnoTasksCount:
        output.lno_tasks.leverage.length +
        output.lno_tasks.neutral.length +
        output.lno_tasks.overhead.length,
    });

    return { output, confidence, duration };

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('[SUMMARIZE ERROR]', {
      duration,
      error: error instanceof Error ? error.message : String(error),
      retry: options?.retry || false,
    });

    // If this was already a retry, don't retry again
    if (options?.retry) {
      throw new SummarizationError(
        'AI summarization failed after retry',
        error instanceof Error ? error : undefined
      );
    }

    // FR-010: Retry once with adjusted parameters
    console.log('[SUMMARIZE] Attempting retry with adjusted parameters...');
    try {
      return await extractStructuredData(markdown, { retry: true });
    } catch (retryError) {
      throw new SummarizationError(
        'AI summarization failed after retry',
        retryError instanceof Error ? retryError : undefined
      );
    }
  }
}

/**
 * Build extraction prompt for AI model
 * @param markdown - Document content
 * @returns Formatted prompt string
 */
function buildExtractionPrompt(markdown: string): string {
  return `You are an expert document analyzer. Extract structured information from the following document.

Your task is to identify:
1. **Topics**: Key themes, subjects, or areas discussed in the document
2. **Decisions**: Explicit decisions that were made or documented
3. **Actions**: Action items, tasks, or next steps identified (with time/effort estimates)
4. **LNO Tasks**: Categorize tasks into three priority levels:
   - **Leverage (L)**: High-impact strategic tasks that create disproportionate value
   - **Neutral (N)**: Necessary operational tasks that maintain the business
   - **Overhead (O)**: Low-value administrative tasks that should be minimized, automated, or batched

Guidelines:
- Extract actual content from the document, do not invent tasks that are not mentioned or implied
- Keep entries concise but specific
- If a category has no items, return an empty array
- For LNO classification, consider impact vs effort and provide outcome-aligned reasoning

**Action Item Requirements**
For each action, estimate:
- **estimated_hours**: Time required in hours (0.25 to 8.0)
- **effort_level**: Cognitive load required ("high" or "low")
Base estimates on typical professional work speeds. Consider task complexity, not urgency.

**Task Extraction Strategy**
- For meeting notes/action-oriented docs: extract explicit tasks and action items mentioned
- For informational docs (policies, guides, reports, reference materials): infer actionable tasks a reader would perform with this specific content
- If no meaningful tasks can be inferred, leave action/LNO arrays empty rather than fabricating unrelated items

**Meta-Content Detection**
- If the document is a system notice, error message, or placeholder, extract metadata about the notice itself (e.g., "Manual review required")
- Do not fabricate engineering tasks like "implement OCR" unless the document itself requests them

Document Content:
${markdown}

Extract the structured data following the required schema. Ensure tasks are grounded in the actual document content, not generic placeholders.`;
}

/**
 * Calculate confidence score based on output completeness
 * Implements FR-011 confidence scoring
 * @param output - Extracted document output
 * @returns Confidence score between 0.0 and 1.0
 */
function calculateConfidence(output: DocumentOutput): number {
  let score = 1.0;

  // Deduct if topics array is empty (topics are usually present in any document)
  if (output.topics.length === 0) {
    score -= 0.2;
  }

  // Deduct if decisions array is empty (but less penalty - not all docs have decisions)
  if (output.decisions.length === 0) {
    score -= 0.1;
  }

  // Deduct if actions array is empty (but less penalty - not all docs have actions)
  if (output.actions.length === 0) {
    score -= 0.1;
  }

  // Deduct if ALL LNO task categories are empty
  const lnoTotal =
    output.lno_tasks.leverage.length +
    output.lno_tasks.neutral.length +
    output.lno_tasks.overhead.length;

  if (lnoTotal === 0) {
    score -= 0.2;
  }

  // Check for very short or suspicious content
  // Map actions to text strings (handle both old string format and new Action objects)
  const actionTexts = output.actions.map(action =>
    typeof action === 'string' ? action : action.text
  );

  const allContent = [
    ...output.topics,
    ...output.decisions,
    ...actionTexts,
    ...output.lno_tasks.leverage,
    ...output.lno_tasks.neutral,
    ...output.lno_tasks.overhead,
  ].join(' ');

  // Check for OCR fallback or system placeholder content
  const ocrPlaceholderPatterns = [
    /document processing notice/i,
    /unable to extract/i,
    /requires manual review/i,
    /ocr tools/i,
    /minimal extractable text/i,
  ];

  if (ocrPlaceholderPatterns.some(pattern => pattern.test(allContent))) {
    // Force very low confidence for OCR placeholder documents
    return 0.3;
  }

  // If total content is suspiciously short, reduce confidence
  if (allContent.length < 50) {
    score -= 0.15;
  }

  // Check for placeholder or generic content
  const placeholderPatterns = [
    /placeholder/i,
    /example/i,
    /todo/i,
    /test/i,
  ];

  if (placeholderPatterns.some(pattern => pattern.test(allContent))) {
    score -= 0.1;
  }

  // Ensure score stays within 0.0 to 1.0 range
  return Math.max(0.0, Math.min(1.0, score));
}

/**
 * Calculate confidence score with forced low value (test-only)
 * Used for testing FR-011 review_required flag
 * @returns Low confidence score < 0.8
 */
export function calculateLowConfidence(): number {
  return 0.65; // Force low confidence for testing
}

/**
 * Initialize Supabase client for database access
 */
function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new SummarizationError('Supabase configuration missing');
  }

  return createClient(supabaseUrl, supabaseKey);
}

/**
 * Compute cosine similarity between two embedding vectors
 * @param a - First embedding vector
 * @param b - Second embedding vector
 * @returns Similarity score (0-1, where 1 = identical)
 */
export function calculateCosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) {
    return 0; // Avoid division by zero
  }

  return dotProduct / (normA * normB);
}

/**
 * Score actions against outcome using semantic similarity
 * Task: T017 - AI extracts actions with relevance scores
 *
 * @param actions - Extracted actions with time/effort estimates
 * @param outcomeText - Optional outcome statement for relevance scoring
 * @returns Actions with relevance_score added (1.0 if no outcome)
 */
export async function scoreActionsWithSemanticSimilarity(
  actions: Action[],
  outcomeText?: string
): Promise<Action[]> {
  console.log('[ScoreActions] Starting semantic similarity scoring:', {
    actionCount: actions.length,
    hasOutcome: !!outcomeText,
  });

  // If no outcome exists, return actions with default 1.0 relevance (no filtering)
  if (!outcomeText) {
    console.log('[ScoreActions] No outcome found, returning default relevance 1.0');
    return actions.map(action => ({
      ...action,
      relevance_score: 1.0,
    }));
  }

  try {
    const startTime = Date.now();

    // Generate outcome embedding
    const { embedding: outcomeEmbedding } = await embed({
      model: openai.embedding('text-embedding-3-small'),
      value: outcomeText,
    });

    console.log('[ScoreActions] Outcome embedding generated:', {
      dimensions: outcomeEmbedding.length,
    });

    // Generate embeddings for each action and compute similarity
    const scoredActions = await Promise.all(
      actions.map(async (action) => {
        const { embedding: actionEmbedding } = await embed({
          model: openai.embedding('text-embedding-3-small'),
          value: action.text,
        });

        const relevanceScore = calculateCosineSimilarity(outcomeEmbedding, actionEmbedding);

        return {
          ...action,
          relevance_score: Math.max(0, Math.min(1, relevanceScore)), // Clamp to 0-1
        };
      })
    );

    const duration = Date.now() - startTime;

    console.log('[ScoreActions] Scoring complete:', {
      duration,
      scoredCount: scoredActions.length,
      avgRelevance: (scoredActions.reduce((sum, a) => sum + (a.relevance_score || 0), 0) / scoredActions.length).toFixed(2),
    });

    return scoredActions;

  } catch (error) {
    console.error('[ScoreActions] Error during semantic similarity scoring:', {
      error: error instanceof Error ? error.message : String(error),
    });

    // Fallback: Return actions with default 1.0 relevance (don't block processing)
    return actions.map(action => ({
      ...action,
      relevance_score: 1.0,
    }));
  }
}

/**
 * Re-score actions against a new outcome context with reflection context
 * Task: T012 - Async recompute job integration
 * Task: T023 - Reflection context injection
 *
 * @param document - Processed document with structured_output
 * @param outcomeText - Assembled outcome statement for context
 * @param reflectionContext - Optional formatted reflection context string
 * @returns Updated LNO task categorization (P0: returns original, AI rescoring deferred)
 *
 * NOTE: P0 implementation is a placeholder. Future enhancement will:
 * - Use Vercel AI SDK to re-evaluate LNO task classifications
 * - Consider outcome alignment when scoring tasks
 * - Inject reflection context into AI prompt for dynamic prioritization
 * - Update processed_documents.structured_output with new classifications
 *
 * Example AI Prompt (future):
 * ```
 * USER'S OUTCOME: "Increase monthly recurring revenue by 25% within 6 months"
 *
 * RECENT REFLECTIONS (weighted by recency):
 * 1. "Feeling energized after client win" (weight: 1.00, Just now)
 * 2. "Only have 1-hour blocks today" (weight: 0.95, 2 hours ago)
 *
 * Re-score these tasks...
 * ```
 */
export async function scoreActions(
  document: {
    id: string;
    structured_output: DocumentOutput;
  },
  outcomeText: string,
  reflectionContext?: string
): Promise<{
  leverage: string[];
  neutral: string[];
  overhead: string[];
}> {
  console.log('[ScoreActions] Re-scoring document:', {
    documentId: document.id,
    outcomeText: outcomeText.substring(0, 50) + '...',
    actionCount: document.structured_output.actions?.length || 0,
    hasReflectionContext: !!reflectionContext,
  });

  // T023: Log reflection context if present
  if (reflectionContext) {
    console.log('[ScoreActions] Reflection context available:', {
      reflectionLines: reflectionContext.split('\n').length,
      preview: reflectionContext.substring(0, 100) + '...',
    });
  }

  const actionEntries = document.structured_output.actions ?? [];
  const actionTexts = actionEntries
    .map((action, index) => {
      if (typeof action === 'string') {
        return { id: `action-${index + 1}`, text: action.trim() };
      }
      if (action && typeof action.text === 'string' && action.text.trim().length > 0) {
        return { id: `action-${index + 1}`, text: action.text.trim() };
      }
      return null;
    })
    .filter((entry): entry is { id: string; text: string } => Boolean(entry));

  if (actionTexts.length === 0) {
    console.log('[ScoreActions] No action texts found; returning original classifications');
    return {
      leverage: document.structured_output.lno_tasks?.leverage || [],
      neutral: document.structured_output.lno_tasks?.neutral || [],
      overhead: document.structured_output.lno_tasks?.overhead || [],
    };
  }

  const lnoSchema = z.object({
    leverage: z.array(z.string()).default([]),
    neutral: z.array(z.string()).default([]),
    overhead: z.array(z.string()).default([]),
  });

  const actionList = actionTexts
    .map((action, idx) => `${idx + 1}. ${action.text}`)
    .join('\n');

  const prompt = [
    'You are reprioritizing action items for an outcome-driven planning agent.',
    `USER OUTCOME: ${outcomeText}`,
    reflectionContext ? `RECENT REFLECTIONS:\n${reflectionContext}\n` : '',
    'ACTION ITEMS:',
    actionList,
    '\nGroup each action into one of three categories:',
    '- Leverage: High strategic impact tied directly to the outcome.',
    '- Neutral: Necessary operational or supporting work.',
    '- Overhead: Administrative / low-leverage work that should be minimized.',
    'ONLY return actions that were provided. If an action feels ambiguous, choose the best-fitting bucket.',
    'Respond using JSON with arrays: { "leverage": [], "neutral": [], "overhead": [] } listing the action text verbatim.',
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const { object } = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: lnoSchema,
      prompt,
      temperature: 0.3,
      maxTokens: 800,
    });

    // Helper to match returned strings to known actions
    const normalize = (text: string) => text.trim().toLowerCase();
    const actionMap = new Map(actionTexts.map(({ text }) => [normalize(text), text]));

    const remap = (items: string[]) => {
      const mapped: string[] = [];
      items.forEach(item => {
        const normalized = normalize(item);
        const match =
          actionMap.get(normalized) ||
          actionTexts.find(action => normalize(action.text) === normalized)?.text;
        if (match && !mapped.includes(match)) {
          mapped.push(match);
        }
      });
      return mapped;
    };

    const leverage = remap(object.leverage);
    const neutral = remap(object.neutral);
    const overhead = remap(object.overhead);

    const allAssigned = new Set([...leverage, ...neutral, ...overhead]);
    const unassigned = actionTexts
      .map(entry => entry.text)
      .filter(text => !allAssigned.has(text));

    // Place any unassigned tasks back into their original buckets to avoid loss
    const original = document.structured_output.lno_tasks ?? {
      leverage: [],
      neutral: [],
      overhead: [],
    };
    unassigned.forEach(taskText => {
      if (original.leverage?.includes(taskText)) {
        leverage.push(taskText);
      } else if (original.overhead?.includes(taskText)) {
        overhead.push(taskText);
      } else {
        neutral.push(taskText);
      }
    });

    console.log('[ScoreActions] Reclassification complete', {
      leverage: leverage.length,
      neutral: neutral.length,
      overhead: overhead.length,
    });

    return { leverage, neutral, overhead };
  } catch (error) {
    console.error('[ScoreActions] Reclassification failed, returning original buckets', {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      leverage: document.structured_output.lno_tasks?.leverage || [],
      neutral: document.structured_output.lno_tasks?.neutral || [],
      overhead: document.structured_output.lno_tasks?.overhead || [],
    };
  }
}

/**
 * Generate and store embeddings for tasks in document
 * Task: T023 - Automatic embedding generation during document processing
 * Task: T026 - Queue embedding requests to prevent rate limiting
 *
 * @param documentId - Document UUID
 * @param actions - Extracted actions from document
 * @returns Success/failure counts and embedding status
 */
export function extractActionTextsFromOutput(output: DocumentOutput): string[] {
  if (!Array.isArray(output.actions)) {
    return [];
  }

  return output.actions
    .map(action => {
      if (typeof action === 'string') {
        return action.trim();
      }
      if (action && typeof action.text === 'string') {
        return action.text.trim();
      }
      return '';
    })
    .filter(text => text.length > 0);
}

export async function generateAndStoreEmbeddings(
  documentId: string,
  output: DocumentOutput
): Promise<{
  success: number;
  failed: number;
  pending: number;
  embeddingsStatus: 'completed' | 'pending' | 'failed';
}> {
  console.log('[GenerateEmbeddings] Starting embedding generation:', {
    documentId,
    leverageCount: output.lno_tasks?.leverage?.length ?? 0,
    neutralCount: output.lno_tasks?.neutral?.length ?? 0,
    overheadCount: output.lno_tasks?.overhead?.length ?? 0,
  });

  const leverageTasks = Array.isArray(output.lno_tasks?.leverage)
    ? output.lno_tasks!.leverage.filter(task => typeof task === 'string' && task.trim().length > 0)
    : [];

  const neutralTasks = Array.isArray(output.lno_tasks?.neutral)
    ? output.lno_tasks!.neutral.filter(task => typeof task === 'string' && task.trim().length > 0)
    : [];

  const overheadTasks = Array.isArray(output.lno_tasks?.overhead)
    ? output.lno_tasks!.overhead.filter(task => typeof task === 'string' && task.trim().length > 0)
    : [];

  const taskTextsSet = new Set(
    [...leverageTasks, ...neutralTasks, ...overheadTasks].map(task => task.trim())
  );

  if (taskTextsSet.size === 0) {
    const actionFallback = extractActionTextsFromOutput(output);
    if (actionFallback.length > 0) {
      console.warn('[GenerateEmbeddings] LNO buckets empty, falling back to action list for embeddings', {
        documentId,
        actionCount: actionFallback.length,
      });
      actionFallback.forEach(text => taskTextsSet.add(text));
    }
  }

  const taskTexts = Array.from(taskTextsSet);

  // If we still have no tasks, skip embedding generation
  if (taskTexts.length === 0) {
    console.log('[GenerateEmbeddings] No tasks available for embedding generation after fallback');
    return {
      success: 0,
      failed: 0,
      pending: 0,
      embeddingsStatus: 'completed',
    };
  }

  try {
    // Prepare tasks for embedding generation
    const tasks: EmbeddingTask[] = taskTexts.map(taskText => ({
      task_id: generateTaskId(taskText, documentId),
      task_text: taskText,
      document_id: documentId,
    }));

    console.log('[GenerateEmbeddings] Enqueuing tasks for embedding generation:', {
      taskCount: tasks.length,
      documentId: documentId.substring(0, 8) + '...',
    });

    // T026: Use queue to control rate of embedding requests
    const result = await embeddingQueue.enqueue(tasks, documentId);

    // T025: Determine overall embedding status
    // - All completed → 'completed'
    // - Some completed, some pending/failed → 'pending' (graceful degradation)
    // - All pending/failed → 'pending' (no blocking)
    let embeddingsStatus: 'completed' | 'pending' | 'failed';
    if (result.success === tasks.length) {
      embeddingsStatus = 'completed';
    } else {
      // Any failures or pending tasks → mark as 'pending' (FR-024)
      embeddingsStatus = 'pending';
    }

    console.log('[GenerateEmbeddings] Embedding generation complete:', {
      duration: result.duration,
      total: tasks.length,
      completed: result.success,
      failed: result.failed,
      pending: result.pending,
      embeddingsStatus,
    });

    return {
      success: result.success,
      failed: result.failed,
      pending: result.pending,
      embeddingsStatus,
    };

  } catch (error) {
    console.error('[GenerateEmbeddings] Unexpected error during embedding generation:', {
      documentId,
      error: error instanceof Error ? error.message : String(error),
    });

    // Graceful degradation: Mark all as pending (FR-024)
    return {
      success: 0,
      failed: 0,
      pending: taskTexts.length,
      embeddingsStatus: 'pending',
    };
  }
}
