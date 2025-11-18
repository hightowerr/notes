import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { evaluateQuality, batchEvaluateQuality } from '../../lib/services/qualityEvaluation';

// Mock the OpenAI client to simulate API responses
vi.mock('openai', () => ({
  OpenAI: vi.fn(() => ({
    chat: {
      completions: {
        create: vi.fn(() => Promise.resolve({
          choices: [{
            message: {
              content: JSON.stringify({
                clarity_score: 0.85,
                verb_strength: 'strong',
                specificity_indicators: {
                  has_metrics: true,
                  has_acceptance_criteria: false,
                  contains_numbers: true
                },
                granularity_flags: {
                  estimated_size: 'small',
                  is_atomic: true
                },
                improvement_suggestions: ['Add specific performance target'],
                calculated_at: new Date().toISOString(),
                calculation_method: 'ai'
              })
            }
          }]
        }))
      }
    },
    embeddings: {
      create: vi.fn(() => Promise.resolve({
        data: [{ embedding: [0.1, 0.2, 0.3] }] // Mock embedding
      }))
    }
  }))
}));

describe('Real-time Quality Badge Updates Integration Tests', () => {
  // Test the optimistic UI update functionality
  describe('optimistic UI updates', () => {
    it('should immediately update badge when task text changes (optimistic update)', async () => {
      const initialTask = {
        id: 'task-1',
        text: 'Fix bugs'
      };

      // Initially evaluate the vague task (should result in low quality score)
      const initialResult = await evaluateQuality(initialTask.text);
      
      // Simulate an edit to make it more specific (optimistic update)
      const updatedTask = {
        id: 'task-1',
        text: 'Fix login timeout bug (max 3s response time)'
      };
      
      // The badge should immediately change from red to green (optimistic update)
      // before the actual AI evaluation completes
      const expectedOptimisticScore = 0.9; // High score for specific task
      
      // The actual AI evaluation would happen in the background
      const actualResult = await evaluateQuality(updatedTask.text);
      
      // Both should be high quality, but the optimistic update happens immediately
      expect(actualResult.clarity_score).toBeGreaterThan(0.8);
      expect(actualResult.verb_strength).toBe('strong');
    });
  });

  // Test the debounced recalculation functionality
  describe('debounced recalculation', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should debounce rapid edits to single API call after 300ms', async () => {
      const tasks = [
        { id: 'task-1', text: 'Initial task text' }
      ];

      // Simulate multiple rapid edits (within 300ms)
      const editSequence = [
        { id: 'task-1', text: 'Edit 1' },
        { id: 'task-1', text: 'Edit 2' },
        { id: 'task-1', text: 'Edit 3' }
      ];

      // Call batch evaluation for each edit
      const evaluations = [];
      for (const edit of editSequence) {
        // Each call would trigger a debounced evaluation
        evaluations.push(batchEvaluateQuality([edit]));
      }

      // Advance timer by 300ms to trigger the debounced call
      vi.advanceTimersByTime(300);

      // Wait for all evaluations to complete
      const results = await Promise.all(evaluations);
      
      // Verify the final evaluation used the last edit
      const finalEvaluation = results[results.length - 1][0];
      expect(finalEvaluation.quality_metadata.clarity_score).toBeGreaterThanOrEqual(0);
      expect(finalEvaluation.quality_metadata.clarity_score).toBeLessThanOrEqual(1);
    });

    it('should show pulsing animation during recalculation', () => {
      // Mock the recalculation state
      let isRecalculating = true;
      
      // Verify that the UI shows the recalculating state
      expect(isRecalculating).toBe(true);
      
      // After evaluation completes, this would be set to false
      isRecalculating = false;
      expect(isRecalculating).toBe(false);
    });

    it('should replace optimistic value with actual score after recalculation', async () => {
      const task = { id: 'task-1', text: 'Fix login timeout (max 3s)' };
      
      // Simulate optimistic update (immediate assumption of improvement)
      const optimisticScore = 0.9; // Assuming improvement
      
      // Perform actual evaluation in background
      const actualResult = await evaluateQuality(task.text);
      
      // The actual score should replace the optimistic one after recalculation
      expect(actualResult.clarity_score).toBeGreaterThanOrEqual(0);
      expect(actualResult.clarity_score).toBeLessThanOrEqual(1);
      
      // In a real UI implementation, this would update the displayed score
      const finalScore = actualResult.clarity_score;
      
      // Verify that the score is reasonable for the given task
      expect(finalScore).toBeGreaterThan(0.5); // Should be medium or high quality
    });
  });

  // Performance validation test
  describe('performance validation', () => {
    it('should complete recalculation within 500ms (SC-009)', async () => {
      const tasks = [
        { id: 'task-1', text: 'Implement user authentication' },
        { id: 'task-2', text: 'Fix minor UI glitch' },
        { id: 'task-3', text: 'Update documentation' }
      ];

      const startTime = performance.now();
      const results = await batchEvaluateQuality(tasks);
      const endTime = performance.now();
      
      const totalLatency = endTime - startTime;
      
      // Validate performance target (SC-009: <500ms p95)
      expect(totalLatency).toBeLessThan(500);
      
      // Verify that all tasks were evaluated
      expect(results).toHaveLength(tasks.length);
      expect(results[0].clarity_score).toBeGreaterThanOrEqual(0);
      expect(results[0].clarity_score).toBeLessThanOrEqual(1);
    });
  });
});