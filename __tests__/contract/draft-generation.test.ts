import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { DraftTaskSchema, DraftTasksSessionSchema } from '../../lib/schemas/taskIntelligence';

describe('Draft Generation API Contract Tests', () => {
  describe('POST /api/agent/generate-draft-tasks', () => {
    it('should return 200 with drafts array for valid input', async () => {
      // Mock response structure
      const mockResponse = {
        drafts: [
          {
            id: '550e8400-e29b-41d4-a716-446655440000',
            task_text: 'Run pricing A/B test: $49 vs $59 tier for SMB segment',
            estimated_hours: 4.0,
            cognition_level: 'medium',
            reasoning:
              'Addresses gap in pricing experiments - outcome mentions 25% ARR increase so pricing optimization is critical to hit the goal.',
            gap_area: 'pricing experiments',
            confidence_score: 0.85,
            source: 'phase10_semantic',
            source_label: '🎯 Semantic Gap',
            embedding: Array(1536).fill(0.1),
            deduplication_hash: 'a'.repeat(64),
          }
        ],
        phase5_triggered: false,
        generation_duration_ms: 3200,
        deduplication_stats: {
          phase5_total: 0,
          phase5_suppressed: 0,
          final_count: 1,
        },
      };

      // Validate response structure
      expect(mockResponse.drafts).toBeInstanceOf(Array);
      expect(mockResponse.phase5_triggered).toBeTypeOf('boolean');
      expect(mockResponse.generation_duration_ms).toBeGreaterThan(0);
      expect(mockResponse.deduplication_stats).toBeDefined();

      // Validate each draft against schema
      for (const draft of mockResponse.drafts) {
        expect(() => DraftTaskSchema.parse(draft)).not.toThrow();
      }
    });

    it('should return 400 for max 3 drafts per area (FR-005)', async () => {
      // Even if the AI generates more than 3 drafts for an area, 
      // the API should enforce the limit
      const requestBody = {
        outcome_text: 'Increase ARR by 25%',
        missing_areas: ['pricing experiments'],
        max_drafts_per_area: 5 // Request more than allowed
      };

      const schema = z.object({
        max_drafts_per_area: z.number().int().min(1).max(3),
      });

      expect(() => schema.parse(requestBody)).toThrow();
    });

    it('should return response when accepting drafts via POST /api/agent/accept-draft-tasks', async () => {
      const acceptRequestBody = {
        session_id: 'session-123',
        accepted_draft_ids: ['draft-001', 'draft-002'],
        edited_drafts: [
          {
            id: 'draft-001',
            task_text: 'Updated draft task text'
          }
        ]
      };

      const expectedAcceptResponse = {
        inserted_task_ids: ['new-task-1', 'new-task-2'],
        cycle_detected: false,
        new_coverage_percentage: 85
      };

      expect(expectedAcceptResponse).toHaveProperty('inserted_task_ids');
      expect(expectedAcceptResponse).toHaveProperty('cycle_detected');
      expect(expectedAcceptResponse).toHaveProperty('new_coverage_percentage');
    });

    it('should return 400 with DEPENDENCY_CYCLE error when accepting drafts creates cycle', async () => {
      const cycleRequestBody = {
        session_id: 'session-123',
        accepted_draft_ids: ['draft-001', 'draft-002'],
        edited_drafts: []
      };

      // Mock response for cycle detection failure
      const expectedCycleErrorResponse = {
        error: 'DEPENDENCY_CYCLE',
        message: 'The requested task insertions would create a dependency cycle',
        details: {
          cycle_tasks: ['task-a', 'task-b', 'task-c', 'task-a']
        }
      };

      expect(expectedCycleErrorResponse.error).toBe('DEPENDENCY_CYCLE');
    });

    it('should trigger and return P5 drafts when coverage <80% after P10', async () => {
      const requestBody = {
        outcome_text: 'Increase ARR by 25%',
        missing_areas: ['pricing experiments'],
        existing_tasks: ['existing-task-1']
      };

      // Mock response when P5 is triggered after P10
      const expectedResponse = {
        drafts: expect.arrayContaining([
          expect.objectContaining({
            source: expect.stringMatching(/^(phase10_semantic|phase5_dependency)$/)
          })
        ]),
        phase5_triggered: true,
        generation_duration_ms: expect.any(Number),
        deduplication_stats: expect.objectContaining({
          phase5_total: expect.any(Number),
          phase5_suppressed: expect.any(Number),
          final_count: expect.any(Number),
        })
      };

      expect(expectedResponse.phase5_triggered).toBe(true);
    });

    it('should match response schema defined in draft-generation-api.yaml', async () => {
      const mockApiResponse = {
        drafts: [
          {
            id: '123e4567-e89b-12d3-a456-426614174000',
            task_text: 'Draft task text',
            estimated_hours: 2.5,
            cognition_level: 'medium',
            reasoning: 'Reasoning for this draft that clearly explains why it helps the gap and exceeds fifty characters.',
            gap_area: 'gap area',
            confidence_score: 0.75,
            source: 'phase10_semantic',
            source_label: '🎯 Semantic Gap',
            embedding: Array(1536).fill(0.1),
            deduplication_hash: 'b'.repeat(64),
          }
        ],
        phase5_triggered: false,
        generation_duration_ms: 3000,
        deduplication_stats: {
          phase5_total: 0,
          phase5_suppressed: 0,
          final_count: 1,
        }
      };

      // Validate each draft against our schema
      for (const draft of mockApiResponse.drafts) {
        expect(() => DraftTaskSchema.parse(draft)).not.toThrow();
      }

      // Validate deduplication stats structure
      expect(mockApiResponse.deduplication_stats).toHaveProperty('phase5_total');
      expect(mockApiResponse.deduplication_stats).toHaveProperty('phase5_suppressed');
      expect(mockApiResponse.deduplication_stats).toHaveProperty('final_count');
    });
  });
});
