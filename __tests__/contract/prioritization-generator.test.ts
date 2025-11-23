import { describe, it, expect } from 'vitest';

import { prioritizationGenerator } from '@/lib/mastra/agents/prioritizationGenerator';
import { prioritizationResultSchema } from '@/lib/schemas/prioritizationResultSchema';

describe('prioritizationGenerator agent (T005)', () => {
  it('configures GPT-4o single-pass JSON generation', async () => {
    const defaultOptions = await prioritizationGenerator.getDefaultGenerateOptions();

    expect(prioritizationGenerator.name).toBe('prioritization-generator');
    expect(prioritizationGenerator.model).toBe('openai/gpt-4o');
    expect(prioritizationGenerator.maxRetries).toBe(1);
    expect(defaultOptions).toMatchObject({
      maxSteps: 1,
      toolChoice: 'none',
      response_format: { type: 'json_object' },
    });
  });

  it('includes filtering, prioritization, and self-eval guidance', async () => {
    const instructions = await prioritizationGenerator.getInstructions();

    expect(typeof instructions).toBe('string');
    if (typeof instructions !== 'string') {
      throw new Error('prioritization generator instructions must be a string');
    }

    expect(instructions).toContain('### Step 1: FILTER (Outcome Alignment)');
    expect(instructions).toContain('### Step 2: PRIORITIZE (Strategic Ordering)');
    expect(instructions).toContain('### Step 3: SELF-EVALUATE (Quality Check)');
    expect(instructions).toContain('## OUTPUT FORMAT');
    expect(instructions).toContain('"included_tasks"');
    expect(instructions).toContain('"excluded_tasks"');
    expect(instructions).toContain('"per_task_scores"');
  });

  it('validates sample prioritization for payments outcome', () => {
    const applePayTaskId = 'bfe0c266-5b65-4ce1-ae59-0774e5df2475';
    const checkoutTaskId = '18c6b362-2ef0-4f3c-b816-ff789fe352de';
    const docsTaskId = '52b284ad-4970-4af1-bb2a-887dd3fc7e96';

    const mockResult = {
      thoughts: {
        outcome_analysis:
          'Increasing payment conversion requires tackling checkout friction and enabling preferred wallets.',
        filtering_rationale:
          'Kept tasks that remove friction during checkout while excluding backlog grooming and documentation.',
        prioritization_strategy:
          'Lead with critical path optimization, then rollout wallet support that drives conversion lift.',
        self_check_notes:
          'Verified that no analytical-only work remained in the included list and confirmed dependencies.',
      },
      included_tasks: [
        {
          task_id: checkoutTaskId,
          inclusion_reason:
            'Directly optimizes the primary funnel and removes blockers called out in reflections.',
          alignment_score: 9,
        },
        {
          task_id: applePayTaskId,
          inclusion_reason:
            'Wallet adoption correlates with the target metric and is repeatedly requested by the GTM team.',
          alignment_score: 8,
        },
      ],
      excluded_tasks: [
        {
          task_id: docsTaskId,
          task_text: 'Update API docs for batch invoices',
          exclusion_reason:
            'Documentation refresh does not materially influence conversion within the next sprint.',
          alignment_score: 3,
        },
      ],
      ordered_task_ids: [checkoutTaskId, applePayTaskId],
      per_task_scores: {
        [checkoutTaskId]: {
          task_id: checkoutTaskId,
          impact: 9,
          effort: 24,
          confidence: 0.86,
          reasoning: 'Checkout speedups unblock the stated outcome and require one squad-week.',
        },
        [applePayTaskId]: {
          task_id: applePayTaskId,
          impact: 8,
          effort: 32,
          confidence: 0.81,
          reasoning: 'Apple Pay v6 unlocks mobile conversion with moderate engineering lift.',
        },
      },
      confidence: 0.82,
      critical_path_reasoning:
        'Address funnel leakage first, then launch wallets that multiply checkout throughput.',
      corrections_made:
        'Removed documentation task after self-check flagged lack of measurable conversion impact.',
    };

    const parsed = prioritizationResultSchema.parse(mockResult);
    const includedIds = parsed.included_tasks.map(task => task.task_id);

    expect(includedIds).toEqual([checkoutTaskId, applePayTaskId]);
    expect(parsed.excluded_tasks[0]?.task_id).toBe(docsTaskId);
    expect(parsed.ordered_task_ids).toEqual([checkoutTaskId, applePayTaskId]);
  });
});
