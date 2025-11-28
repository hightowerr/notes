import { z } from 'zod';

export const analyzeManualTaskInputSchema = z.object({
  taskId: z.string().uuid(),
  taskText: z.string().min(1).max(500),
  outcomeId: z.string().uuid(),
});

export const manualTaskAnalysisResultSchema = z.object({
  status: z.enum(['analyzing', 'prioritized', 'not_relevant', 'conflict']),
  rank: z.number().int().min(1).optional(),
  placementReason: z.string().optional(),
  exclusionReason: z.string().optional(),
  conflictDetails: z
    .object({
      duplicateTaskId: z.string(),
      similarityScore: z.number().min(0).max(1),
      existingTaskText: z.string(),
    })
    .optional(),
});

export type AnalyzeManualTaskInput = z.infer<typeof analyzeManualTaskInputSchema>;
export type ManualTaskAnalysisResult = z.infer<typeof manualTaskAnalysisResultSchema>;
