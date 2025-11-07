import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import {
  generateBridgingTasks,
  TaskGenerationError,
} from '@/lib/services/taskGenerationService';
import { bridgingTaskResponseSchema } from '@/lib/schemas/bridgingTaskSchema';

const inputSchema = z.object({
  gap_id: z.string().uuid(),
  predecessor_id: z.string().uuid(),
  successor_id: z.string().uuid(),
  outcome_text: z.string().min(1).max(1000).optional(),
  manual_examples: z.array(z.string().min(10).max(200)).min(1).max(2).optional(),
});

const outputSchema = bridgingTaskResponseSchema;

export const suggestBridgingTasksTool = createTool({
  id: 'suggest-bridging-tasks',
  description:
    'Generate 1-3 bridging tasks that connect a predecessor task to a successor task in a prioritized plan.',
  inputSchema,
  outputSchema,
  async execute(input) {
    const result = await generateBridgingTasks({
      gapId: input.gap_id,
      predecessorTaskId: input.predecessor_id,
      successorTaskId: input.successor_id,
      outcomeStatement: input.outcome_text,
      manualExamples: input.manual_examples,
    });

    return outputSchema.parse(result);
  },
});

export type SuggestBridgingTasksTool = typeof suggestBridgingTasksTool;

export class SuggestBridgingTasksToolError extends TaskGenerationError {}
