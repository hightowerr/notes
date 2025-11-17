import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';

import { generateEmbedding } from '@/lib/services/embeddingService';
import { DraftTask } from '@/lib/schemas/taskIntelligence';
import { TASK_INTELLIGENCE_CONFIG } from '@/lib/config/taskIntelligence';

const draftTaskResponseSchema = z.object({
  draft_tasks: z.array(
    z.object({
      task_text: z.string().min(10).max(200),
      estimated_hours: z.number().min(0.25).max(8.0),
      cognition_level: z.enum(['low', 'medium', 'high']),
      reasoning: z.string().min(50).max(300),
      confidence_score: z.number().min(0.0).max(1.0),
    })
  ),
});

interface GenerateDraftsParams {
  outcomeText: string;
  missingAreas: string[];
  existingTaskTexts: string[];
  maxPerArea?: number;
}

export interface GenerateDraftsResult {
  drafts: DraftTask[];
  generation_duration_ms: number;
}

export class DraftTaskGenerationError extends Error {
  constructor(
    message: string,
    public readonly code: 'GENERATION_FAILED' | 'VALIDATION_ERROR' | 'TIMEOUT',
    public readonly metadata?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'DraftTaskGenerationError';
  }
}

/**
 * Generates draft tasks to fill semantic gaps in the task plan
 */
export async function generateDrafts({
  outcomeText,
  missingAreas,
  existingTaskTexts,
  maxPerArea = 3,
}: GenerateDraftsParams): Promise<GenerateDraftsResult> {
  if (!outcomeText || !missingAreas || !Array.isArray(missingAreas) || missingAreas.length === 0) {
    throw new DraftTaskGenerationError('Invalid input parameters', 'VALIDATION_ERROR');
  }

  const startTime = Date.now();
  const allDrafts: DraftTask[] = [];

  for (const missingArea of missingAreas) {
    // Generate draft tasks for each missing area
    const prompt = `
You are helping to fill a semantic gap in a user's task plan.

USER OUTCOME:
${outcomeText}

MISSING CONCEPT:
${missingArea}

EXISTING TASKS IN PLAN:
${existingTaskTexts.slice(0, 10).map(task => `- ${task}`).join('\n')}  // Limit to 10 tasks

Generate up to ${maxPerArea} draft tasks that address this missing concept and align with the user's outcome.

Requirements:
- Each task should be specific, actionable, and measurable
- Task text should be between 10-200 characters
- Estimated hours should be between 0.25-8.0 hours (15 minutes to 1 work day)
- Cognition level should be 'low', 'medium', or 'high'
- Reasoning should explain why this task fills the gap (50-300 characters)
- Confidence score should reflect how well the task addresses the gap (0.0-1.0)

Return exactly ${maxPerArea} tasks unless there are fewer relevant tasks possible.

Respond ONLY with valid JSON matching the specified schema.`;

    try {
      const { object } = await Promise.race([
        generateObject({
          model: openai('gpt-4o-mini'),
          schema: draftTaskResponseSchema,
          prompt,
          temperature: 0.5,
        }),
        createTimeout(TASK_INTELLIGENCE_CONFIG.DRAFT_GENERATION_TIMEOUT_MS) // 30s timeout for each AI generation
      ]);

      // Generate embeddings for all drafts in parallel to stay under FR-012 budget
      const embeddings = await Promise.all(
        object.draft_tasks.map(draft => generateEmbedding(draft.task_text))
      );

      // Process each generated draft task
      for (let i = 0; i < object.draft_tasks.length; i++) {
        const draft = object.draft_tasks[i];
        const embedding = embeddings[i];

        // Create deduplication hash
        const crypto = await import('node:crypto');
        const deduplicationHash = crypto
          .createHash('sha256')
          .update(draft.task_text.toLowerCase().trim())
          .digest('hex');

        // Create the draft task object
        const draftTask: DraftTask = {
          id: randomUUID(),
          task_text: draft.task_text.trim(),
          estimated_hours: draft.estimated_hours,
          cognition_level: draft.cognition_level,
          reasoning: draft.reasoning.trim(),
          gap_area: missingArea,
          confidence_score: draft.confidence_score,
          source: 'phase10_semantic',
          source_label: '🎯 Semantic Gap',
          embedding,
          deduplication_hash: deduplicationHash,
        };

        allDrafts.push(draftTask);
      }
    } catch (error) {
      console.error(`[DraftTaskGeneration] Error generating drafts for area "${missingArea}":`, error);
      // Continue with other areas even if one fails
      continue;
    }
  }

  const duration = Date.now() - startTime;

  return {
    drafts: allDrafts,
    generation_duration_ms: duration,
  };
}

/**
 * Creates a timeout promise for AI generation
 */
function createTimeout(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(
        new DraftTaskGenerationError(
          `Draft generation timed out after ${ms}ms`,
          'TIMEOUT',
          { timeout_ms: ms }
        )
      );
    }, ms);
  });
}
