/**
 * AI Summarization Service
 * Extracts structured data from Markdown using OpenAI GPT-4
 * Implements FR-003 (Data Extraction), FR-010 (Retry Logic), FR-011 (Confidence Flagging)
 */

import { generateObject, embed } from 'ai';
import { openai } from '@ai-sdk/openai';
import { DocumentOutputSchema, type DocumentOutput, type Action } from '@/lib/schemas';
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
   - **Leverage**: High-impact strategic tasks that create significant value
   - **Neutral**: Necessary operational tasks that maintain the business
   - **Overhead**: Low-value administrative tasks that should be minimized

Guidelines:
- Extract actual content from the document, don't make assumptions
- Be concise but specific in your extractions
- If a category has no items, return an empty array
- Ensure all extracted items are meaningful strings
- For LNO classification, consider impact vs effort ratio

**Action Item Requirements** (NEW):
For each action, estimate:
- **estimated_hours**: Time required in hours (0.25 to 8.0)
  * 0.25 = 15 minutes (quick email, simple update)
  * 0.5 = 30 minutes (short meeting, basic task)
  * 1.0 = 1 hour (standard task)
  * 2-4 = Half to full day (complex task)
  * 6-8 = Full working day (major project work)
- **effort_level**: Cognitive load required
  * "high" = Requires deep focus, complex problem-solving, critical thinking
  * "low" = Routine task, straightforward execution, low cognitive load

Base estimates on typical professional work speeds. Consider task complexity, not urgency.

**Task Extraction Strategy:**
- For meeting notes/action-oriented docs: Extract explicit tasks and action items mentioned in the document
- For informational docs (policies, guides, reports, reference materials): Infer actionable tasks that a reader would naturally need to do with this specific content
  * Insurance document → Infer tasks like "Review [specific coverage types mentioned]", "Compare [specific policy options discussed]"
  * Strategy document → Infer tasks like "Evaluate impact of [specific strategy mentioned]", "Align team on [specific objectives listed]"
  * Reference/cheat sheet → Infer tasks like "Study and memorize [specific concepts covered]", "Apply [specific techniques/formulas shown]"
  * Product documentation → Infer tasks like "Test [specific features described]", "Integrate [specific APIs documented]"

**Critical Rules for Task Generation:**
- Base ALL tasks on actual content present in the document - reference specific topics, concepts, or items mentioned
- DO NOT generate generic tasks like "Implement OCR" or "Develop strategy" unless the document explicitly discusses those topics
- If the document is purely reference material (cheat sheet, glossary, formula list): infer study/application tasks based on the specific content
- If no meaningful tasks can be inferred from the content, leave arrays empty rather than fabricating unrelated tasks
- LNO classification should reflect the strategic value of tasks based on document context

**Meta-Content Detection:**
- If the document is a system notice, error message, or processing placeholder (e.g., "Document Processing Notice", "Unable to extract"), extract metadata about the notice itself, not fabricated tasks
  * Topics: Document type/status (e.g., ["processing notice", "unreadable document"])
  * Decisions: Empty array (no decisions in system messages)
  * Actions: What user should do (e.g., ["Manual review required", "Provide text-based version"])
  * LNO Tasks: Categorize the required action (usually Overhead for manual fixes)
- DO NOT fabricate tasks about "implementing OCR" or "developing strategies" - these are system-level tasks, not user tasks from the document
- Only extract content that would be actionable for the document's reader

**LNO Classification:**
- **Leverage**: High-impact tasks that drive key decisions or create significant value (e.g., strategic planning, critical evaluations)
- **Neutral**: Standard operational tasks necessary for understanding or applying the content (e.g., reviewing details, studying concepts)
- **Overhead**: Low-value administrative tasks (e.g., filing, archiving, basic documentation)

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
function cosineSimilarity(a: number[], b: number[]): number {
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

        const relevanceScore = cosineSimilarity(outcomeEmbedding, actionEmbedding);

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

  // P0: Return original LNO classifications unchanged
  // Future: Use AI to reclassify tasks based on outcome alignment + reflection context
  // Example: Tasks aligned with "Increase revenue" might move from Neutral → Leverage
  // Example: If reflection says "burnt out", prioritize low-effort tasks

  console.log('[ScoreActions] P0 implementation: returning original classifications');

  return {
    leverage: document.structured_output.lno_tasks?.leverage || [],
    neutral: document.structured_output.lno_tasks?.neutral || [],
    overhead: document.structured_output.lno_tasks?.overhead || [],
  };
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
  });

  const leverageTasks = Array.isArray(output.lno_tasks?.leverage)
    ? output.lno_tasks!.leverage.filter(task => typeof task === 'string' && task.trim().length > 0)
    : [];

  const neutralTasks = Array.isArray(output.lno_tasks?.neutral)
    ? output.lno_tasks!.neutral.filter(task => typeof task === 'string' && task.trim().length > 0)
    : [];

  const taskTexts = Array.from(
    new Set(
      [...leverageTasks, ...neutralTasks].map(task =>
        task.trim()
      )
    )
  );

  // If no leverage/neutral tasks, skip embedding generation
  if (taskTexts.length === 0) {
    console.log('[GenerateEmbeddings] No leverage/neutral LNO tasks to process, skipping embedding generation');
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
