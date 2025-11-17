import { describe, it, expect } from 'vitest';
import {
  insertBridgingTasks,
  detectCycle,
  type Task,
  type InsertionResult,
} from '../taskInsertion';

describe('taskInsertion service', () => {
  describe('insertBridgingTasks', () => {
    it('should insert 2 tasks between predecessor and successor with correct dependencies', () => {
      // Arrange
      const currentPlan: Task[] = [
        { id: '001', text: 'Define Q4 goals', estimated_hours: 20, depends_on: [] },
        { id: '002', text: 'Design app mockups', estimated_hours: 40, depends_on: ['001'] },
        { id: '005', text: 'Launch app', estimated_hours: 20, depends_on: [] },
      ];

      const bridgingTasks = [
        { text: 'Build MVP frontend', estimated_hours: 80 },
        { text: 'Implement backend API', estimated_hours: 60 },
      ];

      const gap = {
        predecessor_id: '002',
        successor_id: '005',
      };

      // Act
      const result = insertBridgingTasks(gap, bridgingTasks, currentPlan);

      // Assert
      expect(result.success).toBe(true);
      expect(result.insertedIds).toHaveLength(2);
      expect(result.error).toBeNull();

      const updatedPlan = result.updated_plan!;
      expect(updatedPlan).toHaveLength(5);

      // Verify task IDs are correct
      const task3 = updatedPlan.find(t => t.id === '003');
      const task4 = updatedPlan.find(t => t.id === '004');

      expect(task3).toBeDefined();
      expect(task4).toBeDefined();

      // Verify task texts
      expect(task3?.text).toBe('Build MVP frontend');
      expect(task4?.text).toBe('Implement backend API');
    });

    it('should create correct dependency chain: #3→#2, #4→#3, #5→#4', () => {
      // Arrange
      const currentPlan: Task[] = [
        { id: '001', text: 'Define goals', estimated_hours: 20, depends_on: [] },
        { id: '002', text: 'Design mockups', estimated_hours: 40, depends_on: ['001'] },
        { id: '005', text: 'Launch app', estimated_hours: 20, depends_on: [] },
      ];

      const bridgingTasks = [
        { text: 'Build frontend', estimated_hours: 80 },
        { text: 'Build backend', estimated_hours: 60 },
      ];

      const gap = {
        predecessor_id: '002',
        successor_id: '005',
      };

      // Act
      const result = insertBridgingTasks(gap, bridgingTasks, currentPlan);

      // Assert
      expect(result.success).toBe(true);

      const updatedPlan = result.updated_plan!;
      const task3 = updatedPlan.find(t => t.id === '003');
      const task4 = updatedPlan.find(t => t.id === '004');
      const task5 = updatedPlan.find(t => t.id === '005');

      // Verify dependency chain
      expect(task3?.depends_on).toEqual(['002']);
      expect(task4?.depends_on).toEqual(['003']);
      expect(task5?.depends_on).toEqual(['004']);
    });

    it('should reject insertion if it would create circular dependency', () => {
      // Arrange - Create a scenario where insertion would create a cycle
      const currentPlan: Task[] = [
        { id: '001', text: 'Task 1', estimated_hours: 20, depends_on: ['003'] }, // Already depends on future task
        { id: '002', text: 'Task 2', estimated_hours: 40, depends_on: ['001'] },
        { id: '003', text: 'Task 3', estimated_hours: 20, depends_on: ['002'] },
      ];
      const originalSnapshot = currentPlan.map(task => ({
        ...task,
        depends_on: [...task.depends_on],
      }));

      const bridgingTasks = [
        { text: 'Bridging task', estimated_hours: 30 },
      ];

      const gap = {
        predecessor_id: '002',
        successor_id: '003',
      };

      // Act
      const result = insertBridgingTasks(gap, bridgingTasks, currentPlan);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('circular dependency');
      expect(result.insertedIds).toHaveLength(0);
      expect(result.updated_plan).toBeUndefined();
      expect(currentPlan).toEqual(originalSnapshot);
    });

    it('should handle single task insertion correctly', () => {
      // Arrange
      const currentPlan: Task[] = [
        { id: '001', text: 'Task 1', estimated_hours: 20, depends_on: [] },
        { id: '003', text: 'Task 3', estimated_hours: 20, depends_on: [] },
      ];

      const bridgingTasks = [
        { text: 'Task 2', estimated_hours: 30 },
      ];

      const gap = {
        predecessor_id: '001',
        successor_id: '003',
      };

      // Act
      const result = insertBridgingTasks(gap, bridgingTasks, currentPlan);

      // Assert
      expect(result.success).toBe(true);
      expect(result.insertedIds).toHaveLength(1);
      expect(result.insertedIds[0]).toBe('002');

      const updatedPlan = result.updated_plan!;
      expect(updatedPlan).toHaveLength(3);

      const task2 = updatedPlan.find(t => t.id === '002');
      expect(task2).toBeDefined();
      expect(task2?.text).toBe('Task 2');
      expect(task2?.depends_on).toEqual(['001']);

      const task3 = updatedPlan.find(t => t.id === '003');
      expect(task3?.depends_on).toEqual(['002']);
    });

    it('should handle insertion at the start of the plan (before task #1)', () => {
      // Arrange
      const currentPlan: Task[] = [
        { id: '001', text: 'Task 1', estimated_hours: 20, depends_on: [] },
        { id: '002', text: 'Task 2', estimated_hours: 30, depends_on: ['001'] },
      ];

      const bridgingTasks = [
        { text: 'Preliminary task', estimated_hours: 15 },
      ];

      const gap = {
        predecessor_id: '000', // Special case: before first task
        successor_id: '001',
      };

      // Act
      const result = insertBridgingTasks(gap, bridgingTasks, currentPlan);

      // Assert
      expect(result.success).toBe(true);
      expect(result.insertedIds).toHaveLength(1);

      const updatedPlan = result.updated_plan!;
      expect(updatedPlan).toHaveLength(3);

      // New task should have no dependencies
      const newTask = updatedPlan.find(t => t.text === 'Preliminary task');
      expect(newTask).toBeDefined();
      expect(newTask?.depends_on).toEqual([]);

      // Task 001 should now depend on the new task
      const task1 = updatedPlan.find(t => t.id === '001');
      expect(task1?.depends_on).toContain(newTask?.id);
    });

    it('should preserve existing dependencies for unrelated tasks', () => {
      // Arrange
      const currentPlan: Task[] = [
        { id: '001', text: 'Task 1', estimated_hours: 20, depends_on: [] },
        { id: '002', text: 'Task 2', estimated_hours: 40, depends_on: ['001'] },
        { id: '005', text: 'Task 5', estimated_hours: 20, depends_on: [] },
        { id: '006', text: 'Task 6', estimated_hours: 30, depends_on: ['005'] }, // Unrelated branch
      ];

      const bridgingTasks = [
        { text: 'Task 3', estimated_hours: 50 },
      ];

      const gap = {
        predecessor_id: '002',
        successor_id: '005',
      };

      // Act
      const result = insertBridgingTasks(gap, bridgingTasks, currentPlan);

      // Assert
      expect(result.success).toBe(true);

      const updatedPlan = result.updated_plan!;
      const task6 = updatedPlan.find(t => t.id === '006');

      // Task 6 should still depend on Task 5 only
      expect(task6?.depends_on).toEqual(['005']);
    });

    it('should generate sequential task IDs when inserting multiple tasks', () => {
      // Arrange
      const currentPlan: Task[] = [
        { id: '001', text: 'Task 1', estimated_hours: 20, depends_on: [] },
        { id: '010', text: 'Task 10', estimated_hours: 20, depends_on: [] },
      ];

      const bridgingTasks = [
        { text: 'Task A', estimated_hours: 30 },
        { text: 'Task B', estimated_hours: 40 },
        { text: 'Task C', estimated_hours: 50 },
      ];

      const gap = {
        predecessor_id: '001',
        successor_id: '010',
      };

      // Act
      const result = insertBridgingTasks(gap, bridgingTasks, currentPlan);

      // Assert
      expect(result.success).toBe(true);
      expect(result.insertedIds).toHaveLength(3);

      // IDs should be sequential: 002, 003, 004
      expect(result.insertedIds).toEqual(['002', '003', '004']);
    });

    it('should preserve estimated_hours from bridging tasks', () => {
      // Arrange
      const currentPlan: Task[] = [
        { id: '001', text: 'Task 1', estimated_hours: 20, depends_on: [] },
        { id: '003', text: 'Task 3', estimated_hours: 20, depends_on: [] },
      ];

      const bridgingTasks = [
        { text: 'Task 2', estimated_hours: 75 },
      ];

      const gap = {
        predecessor_id: '001',
        successor_id: '003',
      };

      // Act
      const result = insertBridgingTasks(gap, bridgingTasks, currentPlan);

      // Assert
      expect(result.success).toBe(true);

      const task2 = result.updated_plan!.find(t => t.id === '002');
      expect(task2?.estimated_hours).toBe(75);
    });
  });

  describe('detectCycle (Kahn\'s algorithm)', () => {
    it('should detect no cycle in linear dependency chain', () => {
      // Arrange
      const tasks: Task[] = [
        { id: '001', text: 'Task 1', estimated_hours: 20, depends_on: [] },
        { id: '002', text: 'Task 2', estimated_hours: 30, depends_on: ['001'] },
        { id: '003', text: 'Task 3', estimated_hours: 40, depends_on: ['002'] },
      ];

      // Act
      const hasCycle = detectCycle(tasks);

      // Assert
      expect(hasCycle).toBe(false);
    });

    it('should detect cycle in simple 2-task loop (A→B, B→A)', () => {
      // Arrange
      const tasks: Task[] = [
        { id: '001', text: 'Task 1', estimated_hours: 20, depends_on: ['002'] },
        { id: '002', text: 'Task 2', estimated_hours: 30, depends_on: ['001'] },
      ];

      // Act
      const hasCycle = detectCycle(tasks);

      // Assert
      expect(hasCycle).toBe(true);
    });

    it('should detect cycle in 3-task loop (A→B→C→A)', () => {
      // Arrange
      const tasks: Task[] = [
        { id: '001', text: 'Task 1', estimated_hours: 20, depends_on: ['003'] },
        { id: '002', text: 'Task 2', estimated_hours: 30, depends_on: ['001'] },
        { id: '003', text: 'Task 3', estimated_hours: 40, depends_on: ['002'] },
      ];

      // Act
      const hasCycle = detectCycle(tasks);

      // Assert
      expect(hasCycle).toBe(true);
    });

    it('should detect no cycle in parallel branches', () => {
      // Arrange
      const tasks: Task[] = [
        { id: '001', text: 'Root', estimated_hours: 20, depends_on: [] },
        { id: '002', text: 'Branch A', estimated_hours: 30, depends_on: ['001'] },
        { id: '003', text: 'Branch B', estimated_hours: 40, depends_on: ['001'] },
        { id: '004', text: 'Merge', estimated_hours: 50, depends_on: ['002', '003'] },
      ];

      // Act
      const hasCycle = detectCycle(tasks);

      // Assert
      expect(hasCycle).toBe(false);
    });

    it('should detect no cycle in DAG with multiple dependencies', () => {
      // Arrange
      const tasks: Task[] = [
        { id: '001', text: 'Task 1', estimated_hours: 20, depends_on: [] },
        { id: '002', text: 'Task 2', estimated_hours: 30, depends_on: [] },
        { id: '003', text: 'Task 3', estimated_hours: 40, depends_on: ['001', '002'] },
        { id: '004', text: 'Task 4', estimated_hours: 50, depends_on: ['003'] },
      ];

      // Act
      const hasCycle = detectCycle(tasks);

      // Assert
      expect(hasCycle).toBe(false);
    });

    it('should detect cycle with self-dependency (A→A)', () => {
      // Arrange
      const tasks: Task[] = [
        { id: '001', text: 'Task 1', estimated_hours: 20, depends_on: ['001'] },
      ];

      // Act
      const hasCycle = detectCycle(tasks);

      // Assert
      expect(hasCycle).toBe(true);
    });

    it('should handle empty task list', () => {
      // Arrange
      const tasks: Task[] = [];

      // Act
      const hasCycle = detectCycle(tasks);

      // Assert
      expect(hasCycle).toBe(false);
    });

    it('should handle single task with no dependencies', () => {
      // Arrange
      const tasks: Task[] = [
        { id: '001', text: 'Task 1', estimated_hours: 20, depends_on: [] },
      ];

      // Act
      const hasCycle = detectCycle(tasks);

      // Assert
      expect(hasCycle).toBe(false);
    });

    it('should detect cycle in complex graph with multiple branches', () => {
      // Arrange - Create diamond pattern with back edge
      const tasks: Task[] = [
        { id: '001', text: 'Start', estimated_hours: 20, depends_on: [] },
        { id: '002', text: 'Branch 1', estimated_hours: 30, depends_on: ['001'] },
        { id: '003', text: 'Branch 2', estimated_hours: 40, depends_on: ['001'] },
        { id: '004', text: 'Merge', estimated_hours: 50, depends_on: ['002', '003'] },
        { id: '005', text: 'End', estimated_hours: 60, depends_on: ['004', '002'] }, // Valid
        { id: '006', text: 'Cycle creator', estimated_hours: 70, depends_on: ['005'] },
      ];

      // Add a back edge to create cycle: 002 now depends on 006
      tasks[1].depends_on = ['001', '006'];

      // Act
      const hasCycle = detectCycle(tasks);

      // Assert
      expect(hasCycle).toBe(true);
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle gap where predecessor does not exist', () => {
      // Arrange
      const currentPlan: Task[] = [
        { id: '001', text: 'Task 1', estimated_hours: 20, depends_on: [] },
        { id: '003', text: 'Task 3', estimated_hours: 20, depends_on: [] },
      ];

      const bridgingTasks = [
        { text: 'Task 2', estimated_hours: 30 },
      ];

      const gap = {
        predecessor_id: '999', // Non-existent
        successor_id: '003',
      };

      // Act
      const result = insertBridgingTasks(gap, bridgingTasks, currentPlan);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('predecessor');
    });

    it('should handle gap where successor does not exist', () => {
      // Arrange
      const currentPlan: Task[] = [
        { id: '001', text: 'Task 1', estimated_hours: 20, depends_on: [] },
        { id: '002', text: 'Task 2', estimated_hours: 30, depends_on: [] },
      ];

      const bridgingTasks = [
        { text: 'Task X', estimated_hours: 30 },
      ];

      const gap = {
        predecessor_id: '001',
        successor_id: '999', // Non-existent
      };

      // Act
      const result = insertBridgingTasks(gap, bridgingTasks, currentPlan);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('successor');
    });

    it('should handle empty bridging tasks array', () => {
      // Arrange
      const currentPlan: Task[] = [
        { id: '001', text: 'Task 1', estimated_hours: 20, depends_on: [] },
        { id: '002', text: 'Task 2', estimated_hours: 30, depends_on: [] },
      ];

      const bridgingTasks: Array<{ text: string; estimated_hours: number }> = [];

      const gap = {
        predecessor_id: '001',
        successor_id: '002',
      };

      // Act
      const result = insertBridgingTasks(gap, bridgingTasks, currentPlan);

      // Assert
      expect(result.success).toBe(true);
      expect(result.insertedIds).toHaveLength(0);
      expect(result.updated_plan).toEqual(currentPlan);
    });

    it('should validate task text is not empty', () => {
      // Arrange
      const currentPlan: Task[] = [
        { id: '001', text: 'Task 1', estimated_hours: 20, depends_on: [] },
        { id: '003', text: 'Task 3', estimated_hours: 20, depends_on: [] },
      ];

      const bridgingTasks = [
        { text: '', estimated_hours: 30 },
      ];

      const gap = {
        predecessor_id: '001',
        successor_id: '003',
      };

      // Act
      const result = insertBridgingTasks(gap, bridgingTasks, currentPlan);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('text');
    });

    it('should validate estimated_hours is positive', () => {
      // Arrange
      const currentPlan: Task[] = [
        { id: '001', text: 'Task 1', estimated_hours: 20, depends_on: [] },
        { id: '003', text: 'Task 3', estimated_hours: 20, depends_on: [] },
      ];

      const bridgingTasks = [
        { text: 'Invalid task', estimated_hours: -10 },
      ];

      const gap = {
        predecessor_id: '001',
        successor_id: '003',
      };

      // Act
      const result = insertBridgingTasks(gap, bridgingTasks, currentPlan);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('estimated_hours');
    });
  });
});
