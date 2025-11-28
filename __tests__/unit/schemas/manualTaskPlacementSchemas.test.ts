import { describe, expect, it } from 'vitest';

import {
  analyzeManualTaskInputSchema,
  manualTaskAnalysisResultSchema,
} from '@/lib/schemas/manualTaskPlacementSchemas';

describe('manualTaskPlacementSchemas', () => {
  describe('analyzeManualTaskInputSchema', () => {
    it('accepts valid input', () => {
      const parsed = analyzeManualTaskInputSchema.parse({
        taskId: '11111111-2222-3333-4444-555555555555',
        taskText: 'Email legal about contract review',
        outcomeId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      });

      expect(parsed).toMatchObject({
        taskId: '11111111-2222-3333-4444-555555555555',
        taskText: 'Email legal about contract review',
        outcomeId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      });
    });

    it('rejects invalid UUIDs and empty text', () => {
      expect(() =>
        analyzeManualTaskInputSchema.parse({
          taskId: 'not-a-uuid',
          taskText: '',
          outcomeId: 'also-not-a-uuid',
        })
      ).toThrow();
    });
  });

  describe('manualTaskAnalysisResultSchema', () => {
    it('accepts prioritized result with rank and placement reason', () => {
      const parsed = manualTaskAnalysisResultSchema.parse({
        status: 'prioritized',
        rank: 2,
        placementReason: 'Directly enables payment feature work',
      });

      expect(parsed.status).toBe('prioritized');
      expect(parsed.rank).toBe(2);
      expect(parsed.placementReason).toContain('payment');
    });

    it('accepts not_relevant result with exclusion reason', () => {
      const parsed = manualTaskAnalysisResultSchema.parse({
        status: 'not_relevant',
        exclusionReason: 'No impact on outcome',
      });

      expect(parsed.status).toBe('not_relevant');
      expect(parsed.exclusionReason).toBe('No impact on outcome');
    });

    it('accepts conflict result with conflict details', () => {
      const parsed = manualTaskAnalysisResultSchema.parse({
        status: 'conflict',
        conflictDetails: {
          duplicateTaskId: 'task-duplicate-1',
          similarityScore: 0.92,
          existingTaskText: 'Follow up on Q4 contract',
        },
      });

      expect(parsed.status).toBe('conflict');
      expect(parsed.conflictDetails?.duplicateTaskId).toBe('task-duplicate-1');
    });

    it('rejects similarity scores outside 0-1', () => {
      expect(() =>
        manualTaskAnalysisResultSchema.parse({
          status: 'conflict',
          conflictDetails: {
            duplicateTaskId: 'task-duplicate-1',
            similarityScore: 1.5,
            existingTaskText: 'Follow up on Q4 contract',
          },
        })
      ).toThrow();
    });
  });
});
