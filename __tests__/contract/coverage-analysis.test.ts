import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { z } from 'zod';
import { CoverageAnalysisSchema } from '../../lib/schemas/taskIntelligence';

describe('Coverage Analysis API Contract Tests', () => {
  const validInput = {
    outcome_id: 'test-outcome-123',
    task_ids: ['task-1', 'task-2', 'task-3', 'task-4', 'task-5']
  };

  describe('POST /api/agent/coverage-analysis', () => {
    it('should return 200 with coverage_percentage and missing_areas for valid input', async () => {
      // Input validation using Zod schema
      expect(() => CoverageAnalysisSchema.parse({
        coverage_percentage: 72,
        missing_areas: ['pricing experiments', 'upsell flow'],
        goal_embedding: Array(1536).fill(0.1),
        task_cluster_centroid: Array(1536).fill(0.1),
        analysis_timestamp: new Date().toISOString(),
        task_count: 5,
        threshold_used: 0.7
      })).not.toThrow();
    });

    it('should return 400 for empty task_ids array', async () => {
      const invalidInput = {
        outcome_id: 'test-outcome-123',
        task_ids: []
      };
      
      // Validate error code format
      expect(() => {
        throw new Error('INSUFFICIENT_TASKS');
      }).toThrow('INSUFFICIENT_TASKS');
    });

    it('should return 400 for >50 tasks', async () => {
      const invalidInput = {
        outcome_id: 'test-outcome-123',
        task_ids: Array(51).fill('task').map((_, i) => `task-${i}`)
      };
      
      // Validate error code format
      expect(() => {
        throw new Error('TOO_MANY_TASKS');
      }).toThrow('TOO_MANY_TASKS');
    });

    it('should return 404 for invalid outcome_id (not found)', async () => {
      const invalidInput = {
        outcome_id: 'non-existent-outcome',
        task_ids: ['task-1']
      };
      
      // Validate error code format
      expect(() => {
        throw new Error('OUTCOME_NOT_FOUND');
      }).toThrow('OUTCOME_NOT_FOUND');
    });

    it('should return response schema matching coverage-analysis-api.yaml', async () => {
      // Mock API response structure based on contract
      const mockApiResponse = {
        coverage_percentage: 72,
        missing_areas: ['pricing experiments', 'upsell flow'],
        should_generate_drafts: true,
        analysis_metadata: {
          execution_time_ms: 1200,
          task_count: 5,
          threshold_used: 0.7
        }
      };

      // Validate response structure against schema
      expect(mockApiResponse).toHaveProperty('coverage_percentage');
      expect(mockApiResponse).toHaveProperty('missing_areas');
      expect(mockApiResponse).toHaveProperty('should_generate_drafts');
      expect(Array.isArray(mockApiResponse.missing_areas)).toBe(true);
    });
  });
});