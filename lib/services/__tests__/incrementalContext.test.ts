import { describe, it, expect } from 'vitest';
import {
  buildIncrementalContext,
  formatBaselineSummary,
  formatNewTasks,
  buildIncrementalPromptContext,
  type BaselineSummary,
} from '../incrementalContext';
import type { TaskSummary } from '@/lib/types/agent';

describe('incrementalContext', () => {
  const mockTasks: TaskSummary[] = [
    {
      task_id: 'task-1',
      task_text: 'Baseline task 1',
      document_id: 'doc-1',
      source: 'embedding',
    },
    {
      task_id: 'task-2',
      task_text: 'Baseline task 2',
      document_id: 'doc-1',
      source: 'embedding',
    },
    {
      task_id: 'task-3',
      task_text: 'New task 1',
      document_id: 'doc-2',
      source: 'embedding',
    },
    {
      task_id: 'task-4',
      task_text: 'New task 2',
      document_id: 'doc-3',
      source: 'embedding',
    },
  ];

  describe('buildIncrementalContext', () => {
    it('should identify first run when no baseline exists', () => {
      const result = buildIncrementalContext(mockTasks, [], null);

      expect(result.is_first_run).toBe(true);
      expect(result.baseline).toBeNull();
      expect(result.new_tasks).toEqual(mockTasks);
      expect(result.all_tasks).toEqual(mockTasks);
      expect(result.token_savings_estimate).toBe(0);
    });

    it('should separate baseline and new tasks correctly', () => {
      const baselineDocIds = ['doc-1'];
      const createdAt = '2025-01-15T10:00:00Z';

      const result = buildIncrementalContext(mockTasks, baselineDocIds, createdAt);

      expect(result.is_first_run).toBe(false);
      expect(result.baseline).not.toBeNull();
      expect(result.new_tasks.length).toBe(2); // task-3 and task-4 from doc-2 and doc-3
      expect(result.new_tasks.map(t => t.task_id)).toEqual(['task-3', 'task-4']);
    });

    it('should calculate token savings estimate', () => {
      const baselineDocIds = ['doc-1'];
      const createdAt = '2025-01-15T10:00:00Z';

      const result = buildIncrementalContext(mockTasks, baselineDocIds, createdAt);

      // 2 baseline tasks * 50 tokens/task - 100 token summary = 0 tokens saved
      // (Since 2*50=100 and summary=100, net savings is 0)
      expect(result.token_savings_estimate).toBe(0);
    });

    it('should calculate significant token savings for large baseline', () => {
      const largeMockTasks: TaskSummary[] = [];
      for (let i = 1; i <= 100; i++) {
        largeMockTasks.push({
          task_id: `baseline-task-${i}`,
          task_text: `Baseline task ${i}`,
          document_id: 'doc-baseline',
          source: 'embedding',
        });
      }
      largeMockTasks.push({
        task_id: 'new-task-1',
        task_text: 'New task',
        document_id: 'doc-new',
        source: 'embedding',
      });

      const result = buildIncrementalContext(
        largeMockTasks,
        ['doc-baseline'],
        '2025-01-15T10:00:00Z'
      );

      expect(result.is_first_run).toBe(false);
      expect(result.new_tasks.length).toBe(1);
      expect(result.token_savings_estimate).toBe(4900); // (100 * 50) - 100 = 4900
    });

    it('should handle tasks with null document_id', () => {
      const tasksWithNullDocs: TaskSummary[] = [
        ...mockTasks,
        {
          task_id: 'task-5',
          task_text: 'Task with null doc',
          document_id: '',
          source: 'embedding',
        },
      ];

      const result = buildIncrementalContext(
        tasksWithNullDocs,
        ['doc-1'],
        '2025-01-15T10:00:00Z'
      );

      // Task with null document_id should be treated as new
      expect(result.new_tasks.map(t => t.task_id)).toContain('task-5');
    });
  });

  describe('formatBaselineSummary', () => {
    it('should format baseline summary with age', () => {
      const now = new Date().toISOString();
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

      const baseline: BaselineSummary = {
        document_ids: ['doc-1', 'doc-2'],
        document_count: 2,
        task_count: 50,
        top_task_ids: ['task-1', 'task-2', 'task-3'],
        created_at: twoHoursAgo,
        age_hours: 2,
      };

      const formatted = formatBaselineSummary(baseline);

      expect(formatted).toContain('BASELINE CONTEXT');
      expect(formatted).toContain('2 documents with 50 tasks');
      expect(formatted).toContain('2 hours ago');
      expect(formatted).toContain('Document IDs: doc-1, doc-2');
      expect(formatted).toContain('Top task IDs from baseline: task-1, task-2, task-3');
    });

    it('should handle null baseline', () => {
      const formatted = formatBaselineSummary(null);
      expect(formatted).toBe('No previous baseline.');
    });

    it('should handle many document IDs gracefully', () => {
      const manyDocIds = Array.from({ length: 20 }, (_, i) => `doc-${i + 1}`);

      const baseline: BaselineSummary = {
        document_ids: manyDocIds,
        document_count: 20,
        task_count: 200,
        top_task_ids: [],
        created_at: null,
        age_hours: null,
      };

      const formatted = formatBaselineSummary(baseline);

      expect(formatted).toContain('20 documents with 200 tasks');
      expect(formatted).toContain('... (10 more)'); // Should truncate
    });
  });

  describe('formatNewTasks', () => {
    it('should format new tasks as JSON lines', () => {
      const newTasks: TaskSummary[] = [
        {
          task_id: 'new-1',
          task_text: 'New task 1',
          document_id: 'doc-new',
          source: 'embedding',
          lnoCategory: 'leverage',
        },
        {
          task_id: 'new-2',
          task_text: 'New task 2',
          document_id: 'doc-new',
          source: 'embedding',
          lnoCategory: 'neutral',
        },
      ];

      const formatted = formatNewTasks(newTasks);

      expect(formatted).toContain('"id":"new-1"');
      expect(formatted).toContain('"text":"New task 1"');
      expect(formatted).toContain('"lnoCategory":"leverage"');
      expect(formatted).toContain('"id":"new-2"');
    });

    it('should handle empty new tasks', () => {
      const formatted = formatNewTasks([]);
      expect(formatted).toBe('No new tasks to analyze.');
    });
  });

  describe('buildIncrementalPromptContext', () => {
    it('should build complete prompt context', () => {
      const incrementalContext = buildIncrementalContext(
        mockTasks,
        ['doc-1'],
        '2025-01-15T10:00:00Z'
      );

      const promptContext = buildIncrementalPromptContext(incrementalContext);

      expect(promptContext.baseline_summary).toContain('BASELINE CONTEXT');
      expect(promptContext.new_tasks_text).toContain('"id":"task-3"');
      expect(promptContext.task_count).toBe(4);
      expect(promptContext.new_task_count).toBe(2);
    });

    it('should handle first run without baseline', () => {
      const incrementalContext = buildIncrementalContext(mockTasks, [], null);

      const promptContext = buildIncrementalPromptContext(incrementalContext);

      expect(promptContext.baseline_summary).toBe('No previous baseline.');
      expect(promptContext.task_count).toBe(4);
      expect(promptContext.new_task_count).toBe(4);
    });
  });

  describe('age calculation', () => {
    it('should calculate age in hours correctly', () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

      const result = buildIncrementalContext(mockTasks, ['doc-1'], oneHourAgo);

      expect(result.baseline?.age_hours).toBeGreaterThanOrEqual(0.9);
      expect(result.baseline?.age_hours).toBeLessThanOrEqual(1.1);
    });

    it('should handle invalid created_at gracefully', () => {
      const result = buildIncrementalContext(mockTasks, ['doc-1'], 'invalid-date');

      expect(result.baseline?.age_hours).toBeNull();
    });
  });
});
