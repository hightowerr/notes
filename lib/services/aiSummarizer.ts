/**
 * AI Summarization Service
 * Extracts structured data from Markdown using OpenAI GPT-4
 * Implements FR-003 (Data Extraction), FR-010 (Retry Logic), FR-011 (Confidence Flagging)
 */

import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { DocumentOutputSchema, type DocumentOutput } from '@/lib/schemas';

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
3. **Actions**: Action items, tasks, or next steps identified
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

Document Content:
${markdown}

Extract the structured data following the required schema.`;
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
  const allContent = [
    ...output.topics,
    ...output.decisions,
    ...output.actions,
    ...output.lno_tasks.leverage,
    ...output.lno_tasks.neutral,
    ...output.lno_tasks.overhead,
  ].join(' ');

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
 * @param _output - Extracted document output (unused)
 * @returns Low confidence score < 0.8
 */
export function calculateLowConfidence(_output: DocumentOutput): number {
  return 0.65; // Force low confidence for testing
}
