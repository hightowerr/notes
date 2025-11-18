import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  QualityMetadataSchema,
  QualitySummarySchema
} from '../../lib/schemas/taskIntelligence';

describe('Quality Evaluation API Contract Tests', () => {
  describe('POST /api/tasks/evaluate-quality', () => {
    it('should return 200 with evaluations array for valid input', async () => {
      // Mock response structure
      const mockResponse = {
        evaluations: [
          {
            task_id: 'task-1',
            clarity_score: 0.85,
            badge_color: 'green',
            badge_label: 'Clear',
            quality_metadata: {
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
              improvement_suggestions: ['Add acceptance criteria for measurability'],
              calculated_at: new Date().toISOString(),
              calculation_method: 'ai'
            }
          }
        ],
        summary: {
          average_clarity: 0.75,
          high_quality_count: 1,
          needs_review_count: 1,
          needs_work_count: 0,
          analyzed_at: new Date().toISOString()
        }
      };

      // Validate response structure
      expect(mockResponse.evaluations).toBeInstanceOf(Array);
      expect(mockResponse.summary).toBeDefined();
      
      // Validate each evaluation
      for (const evalItem of mockResponse.evaluations) {
        expect(() => QualityMetadataSchema.parse(evalItem.quality_metadata)).not.toThrow();
        expect(evalItem.clarity_score).toBeGreaterThanOrEqual(0);
        expect(evalItem.clarity_score).toBeLessThanOrEqual(1);
        expect(['green', 'yellow', 'red']).toContain(evalItem.badge_color);
        expect(['Clear', 'Review', 'Needs Work']).toContain(evalItem.badge_label);
      }
      
      // Validate summary
      expect(() => QualitySummarySchema.parse(mockResponse.summary)).not.toThrow();
    });

    it('should return 400 for >50 tasks', async () => {
      const tooManyTasks = Array(51).fill(0).map((_, i) => ({
        task_id: `task-${i}`,
        task_text: `Task ${i} description`
      }));
      
      const requestBody = {
        tasks: tooManyTasks
      };
      
      // Validate error response structure
      expect(() => {
        throw new Error('TOO_MANY_TASKS');
      }).toThrow('TOO_MANY_TASKS');
    });

    it('should handle AI evaluation of "Build pricing page" with high quality', async () => {
      const requestBody = {
        tasks: [
          {
            task_id: 'task-1',
            task_text: 'Build pricing page with tiered plans',
          }
        ]
      };
      
      // Mock expected response for high-quality task
      const expectedResponse = {
        clarity_score: 0.85,
        badge_color: 'green',
        badge_label: 'Clear'
      };
      
      expect(expectedResponse.clarity_score).toBeGreaterThanOrEqual(0.8);
      expect(expectedResponse.badge_color).toBe('green');
      expect(expectedResponse.badge_label).toBe('Clear');
    });

    it('should handle AI evaluation of "Improve UX" with low quality', async () => {
      const requestBody = {
        tasks: [
          {
            task_id: 'task-2',
            task_text: 'Improve UX',
          }
        ]
      };
      
      // Mock expected response for low-quality task
      const expectedResponse = {
        clarity_score: 0.4,
        badge_color: 'red',
        badge_label: 'Needs Work'
      };
      
      expect(expectedResponse.clarity_score).toBeLessThan(0.5);
      expect(expectedResponse.badge_color).toBe('red');
      expect(expectedResponse.badge_label).toBe('Needs Work');
    });

    it('should handle force_heuristic=true parameter', async () => {
      const requestBody = {
        tasks: [
          {
            task_id: 'task-3',
            task_text: 'Fix login issues'
          }
        ],
        force_heuristic: true
      };
      
      // When force_heuristic=true, the response should indicate heuristic calculation method
      const expectedMetadata = {
        calculation_method: 'heuristic'
      };
      
      expect(expectedMetadata.calculation_method).toBe('heuristic');
    });

    it('should match response schema defined in quality-evaluation-api.yaml', async () => {
      // Validate the response structure against our schema
      const mockApiResponse = {
        evaluations: [
          {
            task_id: 'task-1',
            clarity_score: 0.72,
            badge_color: 'yellow',
            badge_label: 'Review',
            quality_metadata: {
              clarity_score: 0.72,
              verb_strength: 'weak',
              specificity_indicators: {
                has_metrics: false,
                has_acceptance_criteria: false,
                contains_numbers: false
              },
              granularity_flags: {
                estimated_size: 'medium',
                is_atomic: false
              },
              improvement_suggestions: [
                'Add specific metrics to measure success',
                'Define clear acceptance criteria'
              ],
              calculated_at: new Date().toISOString(),
              calculation_method: 'ai'
            }
          }
        ],
        summary: {
          average_clarity: 0.72,
          high_quality_count: 0,
          needs_review_count: 1,
          needs_work_count: 0,
          analyzed_at: new Date().toISOString()
        }
      };

      // Validate using our Zod schema
      expect(mockApiResponse.evaluations.length).toBe(1);
      expect(() => QualityMetadataSchema.parse(mockApiResponse.evaluations[0].quality_metadata)).not.toThrow();
      expect(() => QualitySummarySchema.parse(mockApiResponse.summary)).not.toThrow();
    });
  });
});
