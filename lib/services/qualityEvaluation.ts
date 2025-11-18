import { z } from 'zod';
import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { QualityMetadata, QualityMetadataSchema } from '../schemas/taskIntelligence';
import { TASK_INTELLIGENCE_CONFIG } from '@/lib/config/taskIntelligence';

/**
 * Evaluates the quality of a task using AI or heuristics
 * @param taskText The text of the task to evaluate
 * @param forceHeuristic Whether to force heuristic evaluation
 * @returns Quality metadata for the task
 */
export async function evaluateQuality(taskText: string, forceHeuristic: boolean = false): Promise<QualityMetadata> {
  if (forceHeuristic) {
    return evaluateQualityHeuristics(taskText);
  }

  try {
    // Attempt AI evaluation first
    return await evaluateQualityAI(taskText);
  } catch (error) {
    console.error('[QualityEvaluation:evaluateQuality] AI quality evaluation failed:', error);

    // Retry once after 2s delay (FR-018)
    const retryDelayMs = TASK_INTELLIGENCE_CONFIG.QUALITY_EVAL_RETRY_DELAY_MS;
    console.log(
      `[QualityEvaluation:evaluateQuality] Retrying quality evaluation after ${retryDelayMs / 1000}s delay...`
    );
    await new Promise(resolve => setTimeout(resolve, retryDelayMs));

    try {
      return await evaluateQualityAI(taskText);
    } catch (retryError) {
      console.error('[QualityEvaluation:evaluateQuality] AI quality evaluation failed again, falling back to heuristics:', retryError);
      // If AI fails again, use heuristic fallback (FR-020)
      return evaluateQualityHeuristics(taskText);
    }
  }
}

/**
 * Evaluates task quality using AI (GPT-4o-mini)
 * @param taskText The text of the task to evaluate
 * @returns Quality metadata for the task
 */
async function evaluateQualityAI(taskText: string): Promise<QualityMetadata> {
  const prompt = `
    Analyze the quality of this task: "${taskText}"

    Evaluate the following aspects:
    1. Verb strength: Is the action verb strong and specific (e.g., "Build", "Test", "Deploy") or weak (e.g., "Improve", "Fix", "Optimize")?
    2. Specificity: Does the task include specific metrics, measurements, or acceptance criteria?
    3. Granularity: Is the task appropriately sized (not too broad or too granular)?
  `;

  try {
    const { object } = await generateObject({
      model: openai('gpt-4o-mini'),
      system: 'You are an intelligent assistant that evaluates task quality. Return only the requested JSON format.',
      prompt: prompt,
      temperature: 0.3,
      schema: z.object({
        clarity_score: z.number().min(0).max(1),
        verb_strength: z.enum(['strong', 'weak']),
        specificity_indicators: z.object({
          has_metrics: z.boolean(),
          has_acceptance_criteria: z.boolean(),
          contains_numbers: z.boolean(),
        }),
        granularity_flags: z.object({
          estimated_size: z.enum(['small', 'medium', 'large']),
          is_atomic: z.boolean(),
        }),
        improvement_suggestions: z.array(z.string()),
      })
    });

    // Validate against schema and add additional fields
    const qualityMetadata = QualityMetadataSchema.parse({
      ...object,
      calculated_at: new Date().toISOString(),
      calculation_method: 'ai'
    });

    return qualityMetadata;
  } catch (error) {
    console.error('[QualityEvaluation:evaluateQualityAI] Error in AI quality evaluation:', error);
    // If AI evaluation fails, fall back to heuristics
    return evaluateQualityHeuristics(taskText);
  }
}

/**
 * Evaluates task quality using heuristic rules
 * @param taskText The text of the task to evaluate
 * @returns Quality metadata for the task based on heuristics
 */
export function evaluateQualityHeuristics(taskText: string): QualityMetadata {
  let score = 0;
  const now = new Date().toISOString();
  
  // Length-based scoring (FR-020)
  const length = taskText.length;
  let lengthScore = 0;
  if (length < 10) {
    lengthScore = 0.4; // Too short
  } else if (length >= 10 && length <= 30) {
    lengthScore = 0.7; // Good
  } else if (length > 30 && length <= 80) {
    lengthScore = 0.9; // Very good
  } else {
    lengthScore = 0.4; // Too long - should be broken down
  }
  
  score += lengthScore;
  
  // Verb strength (FR-020)
  let verbStrength: 'strong' | 'weak' = 'weak';
  const strongVerbs = ['build', 'create', 'develop', 'implement', 'test', 'deploy', 'fix', 'configure', 'setup', 'integrate'];
  const weakVerbs = ['improve', 'enhance', 'optimize', 'refactor', 'update', 'modify'];

  const firstWord = taskText.toLowerCase().split(' ')[0];
  if (strongVerbs.includes(firstWord)) {
    verbStrength = 'strong';
    score += 0.1; // Bonus for strong verb
  } else if (weakVerbs.includes(firstWord)) {
    verbStrength = 'weak';
  }
  
  // Metric detection (FR-020)
  const hasMetrics = /\d+/.test(taskText); // Check for numbers
  const hasMetricsBonus = hasMetrics ? 0.2 : 0;
  score += hasMetricsBonus;
  
  // Specificity indicators
  const specificityIndicators = {
    has_metrics: hasMetrics,
    has_acceptance_criteria: /acceptance|criteria|target|goal|require/.test(taskText.toLowerCase()),
    contains_numbers: /\d+/.test(taskText),
  };
  
  // Granularity estimation
  let estimatedSize: 'small' | 'medium' | 'large' = 'medium';
  if (length <= 30) {
    estimatedSize = 'small';
  } else if (length > 80) {
    estimatedSize = 'large';
  }
  
  // Determine if task is atomic (not divisible into meaningful subtasks)
  const isAtomic = !(
    /and|then|also/.test(taskText.toLowerCase()) || 
    taskText.split(' ').length > 10
  );
  
  // Improvement suggestions
  const suggestions = [];
  if (verbStrength === 'weak') {
    suggestions.push('Use a more specific action verb');
  }
  if (!specificityIndicators.has_metrics) {
    suggestions.push('Add specific metrics or measurements');
  }
  if (!specificityIndicators.has_acceptance_criteria) {
    suggestions.push('Define clear acceptance criteria');
  }
  if (estimatedSize === 'large') {
    suggestions.push('Consider breaking this task into smaller subtasks');
  }
  
  // Normalize score to 0-1 range (base score 0-1, plus possible bonuses up to 0.3)
  const normalizedScore = Math.min(score, 1.0);
  
  return {
    clarity_score: normalizedScore,
    verb_strength: verbStrength,
    specificity_indicators: specificityIndicators,
    granularity_flags: {
      estimated_size: estimatedSize,
      is_atomic: isAtomic,
    },
    improvement_suggestions: suggestions,
    calculated_at: now,
    calculation_method: 'heuristic',
  };
}

/**
 * Batch evaluates multiple tasks for quality
 * @param tasks Array of task objects with id and text
 * @param forceHeuristic Whether to force heuristic evaluation
 * @returns Array of quality evaluation results
 */
export async function batchEvaluateQuality(
  tasks: { id: string; text: string }[],
  forceHeuristic: boolean = false
): Promise<Array<{
  task_id: string;
  clarity_score: number;
  badge_color: 'green' | 'yellow' | 'red';
  badge_label: 'Clear' | 'Review' | 'Needs Work';
  quality_metadata: QualityMetadata;
}>> {
  // Process tasks in chunks to avoid rate limits
  const CHUNK_SIZE = TASK_INTELLIGENCE_CONFIG.QUALITY_EVAL_CHUNK_SIZE;
  const evaluations = [];

  for (let i = 0; i < tasks.length; i += CHUNK_SIZE) {
    const chunk = tasks.slice(i, i + CHUNK_SIZE);

    // Process each chunk in parallel
    const chunkEvaluations = await Promise.all(
      chunk.map(async (task) => {
        const qualityMetadata = await evaluateQuality(task.text, forceHeuristic);

        // Determine badge color and label based on clarity score
        let badge_color: 'green' | 'yellow' | 'red';
        let badge_label: 'Clear' | 'Review' | 'Needs Work';

        if (qualityMetadata.clarity_score >= 0.8) {
          badge_color = 'green';
          badge_label = 'Clear';
        } else if (qualityMetadata.clarity_score >= 0.5) {
          badge_color = 'yellow';
          badge_label = 'Review';
        } else {
          badge_color = 'red';
          badge_label = 'Needs Work';
        }

        return {
          task_id: task.id,
          clarity_score: qualityMetadata.clarity_score,
          badge_color,
          badge_label,
          quality_metadata: qualityMetadata
        };
      })
    );

    evaluations.push(...chunkEvaluations);

    // Small delay between chunks to avoid rate limits
    if (i + CHUNK_SIZE < tasks.length) {
      await new Promise(resolve =>
        setTimeout(resolve, TASK_INTELLIGENCE_CONFIG.QUALITY_EVAL_CHUNK_DELAY_MS)
      );
    }
  }

  return evaluations;
}
