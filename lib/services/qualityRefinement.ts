import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';

import { type SupabaseClient } from '@supabase/supabase-js';
import { QualityMetadata } from '@/lib/schemas/taskIntelligence';
import { TASK_INTELLIGENCE_CONFIG } from '@/lib/config/taskIntelligence';

// Define the schemas for the AI-generated response
const refinementSuggestionSchema = z.object({
  action: z.enum(['split', 'merge', 'rephrase']),
  new_task_texts: z.array(z.string().min(10).max(200)),
  reasoning: z.string().min(20).max(500),
});

const qualityRefinementResponseSchema = z.object({
  suggestions: z.array(refinementSuggestionSchema),
});

export interface QualityRefinementInput {
  taskId: string;
  taskText: string;
  qualityIssues: string[]; // From improvement_suggestions
}

export type RefinementAction = 'split' | 'merge' | 'rephrase';

export interface QualityRefinementSuggestion {
  suggestion_id: string;
  action: RefinementAction;
  new_task_texts: string[];
  reasoning: string;
}

export interface QualityRefinementOutput {
  suggestions: QualityRefinementSuggestion[];
}

export class QualityRefinementError extends Error {
  constructor(
    message: string,
    public readonly code: 'TASK_NOT_FOUND' | 'VALIDATION_ERROR' | 'AI_GENERATION_FAILED',
    public readonly metadata?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'QualityRefinementError';
  }
}

/**
 * Suggest refinements for a task based on quality issues
 */
export async function suggestRefinements({
  taskId,
  taskText,
  qualityIssues,
  supabaseClient,
}: QualityRefinementInput & { supabaseClient: SupabaseClient }): Promise<QualityRefinementOutput> {
  // Fetch the current task to get its quality metadata
  const { data: taskData, error: fetchError } = await supabaseClient
    .from('task_embeddings')
    .select('quality_metadata')
    .eq('task_id', taskId)
    .single();

  if (fetchError) {
    console.error(`[QualityRefinement] Error fetching task ${taskId}:`, fetchError);
    throw new QualityRefinementError(
      `Task ${taskId} not found`,
      'TASK_NOT_FOUND',
      { taskId, error: fetchError.message }
    );
  }

  const qualityMetadata = taskData?.quality_metadata as QualityMetadata | undefined;

  // Create a prompt for the AI to suggest refinements
  const prompt = `
You are an expert task refinement assistant. Analyze the following task and provide suggestions for improvement based on the quality issues identified.

TASK TEXT:
${taskText}

QUALITY ISSUES:
${qualityIssues.length > 0 ? qualityIssues.join('\n- ') : 'No specific issues provided'}

CURRENT QUALITY METADATA:
- Clarity Score: ${qualityMetadata?.clarity_score ?? 'N/A'}
- Verb Strength: ${qualityMetadata?.verb_strength ?? 'N/A'}
- Specificity: ${qualityMetadata?.specificity_indicators ?
    `Has Metrics: ${qualityMetadata.specificity_indicators.has_metrics},
    Has Acceptance Criteria: ${qualityMetadata.specificity_indicators.has_acceptance_criteria},
    Contains Numbers: ${qualityMetadata.specificity_indicators.contains_numbers}` : 'N/A'}

Based on this information, suggest ONE of the following actions:
1. 'split' - if the task should be broken into multiple more specific tasks
2. 'rephrase' - if the task should be reworded to be clearer
3. 'merge' - if this task is redundant with others (only if specifically relevant)

For each suggestion, provide:
- The action type ('split', 'rephrase', or 'merge')
- Specific new task text(s) that would address the quality issues
- A reasoning explaining why this improves the task quality

Provide up to 3 suggestions based on different improvement approaches.`;

  // Attempt AI refinement first
  try {
    return await generateRefinementsAI(prompt);
  } catch (error) {
    const retryDelayMs = TASK_INTELLIGENCE_CONFIG.AI_RETRY_DELAY_MS;
    console.error(
      `[QualityRefinement] AI refinement failed, retrying after ${retryDelayMs / 1000}s...`,
      error
    );
    await new Promise(resolve => setTimeout(resolve, retryDelayMs));

    try {
      return await generateRefinementsAI(prompt);
    } catch (retryError) {
      console.error('[QualityRefinement] AI refinement failed again', retryError);
      throw new QualityRefinementError(
        'Failed to generate refinements after retry',
        'AI_GENERATION_FAILED'
      );
    }
  }
}

/**
 * Generates refinements using AI (GPT-4o-mini)
 * @param prompt The prompt for the AI
 * @returns Quality refinement suggestions
 */
async function generateRefinementsAI(prompt: string): Promise<QualityRefinementOutput> {
  const { object } = await generateObject({
    model: openai('gpt-4o-mini'),
    schema: qualityRefinementResponseSchema,
    prompt,
    temperature: 0.3,
  });

  return {
    suggestions: object.suggestions.map(suggestion => ({
      suggestion_id: randomUUID(),
      action: suggestion.action,
      new_task_texts: suggestion.new_task_texts,
      reasoning: suggestion.reasoning,
    })),
  };
}
