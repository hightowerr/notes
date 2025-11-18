/**
 * Processing Queue Service Tests
 * Task: T005 - Concurrent upload queue management
 *
 * Test Requirements:
 * - Max 3 concurrent jobs enforcement
 * - FIFO queue ordering
 * - Automatic processing of next job on completion
 * - Queue position accuracy
 * - Edge case handling (race conditions, errors)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ProcessingQueue } from '../processingQueue';

describe('ProcessingQueue', () => {
  let queue: ProcessingQueue;

  beforeEach(() => {
    // Create fresh queue instance for each test
    queue = new ProcessingQueue();
  });

  describe('Basic Queue Operations', () => {
    it('should allow immediate processing when under limit', () => {
      const result = queue.enqueue('file-1', 'test.pdf');

      expect(result.immediate).toBe(true);
      expect(result.queuePosition).toBeNull();
      expect(queue.getStatus().activeCount).toBe(1);
      expect(queue.getStatus().queuedCount).toBe(0);
    });

    it('should allow up to 3 concurrent jobs immediately', () => {
      const result1 = queue.enqueue('file-1', 'test1.pdf');
      const result2 = queue.enqueue('file-2', 'test2.pdf');
      const result3 = queue.enqueue('file-3', 'test3.pdf');

      expect(result1.immediate).toBe(true);
      expect(result2.immediate).toBe(true);
      expect(result3.immediate).toBe(true);

      expect(queue.getStatus().activeCount).toBe(3);
      expect(queue.getStatus().queuedCount).toBe(0);
    });

    it('should queue 4th file when at max concurrent limit', () => {
      // Fill up to max (3 active)
      queue.enqueue('file-1', 'test1.pdf');
      queue.enqueue('file-2', 'test2.pdf');
      queue.enqueue('file-3', 'test3.pdf');

      // 4th should queue
      const result4 = queue.enqueue('file-4', 'test4.pdf');

      expect(result4.immediate).toBe(false);
      expect(result4.queuePosition).toBe(1);
      expect(queue.getStatus().activeCount).toBe(3);
      expect(queue.getStatus().queuedCount).toBe(1);
    });

    it('should queue multiple files beyond limit', () => {
      // Fill to max
      queue.enqueue('file-1', 'test1.pdf');
      queue.enqueue('file-2', 'test2.pdf');
      queue.enqueue('file-3', 'test3.pdf');

      // Queue additional
      const result4 = queue.enqueue('file-4', 'test4.pdf');
      const result5 = queue.enqueue('file-5', 'test5.pdf');
      const result6 = queue.enqueue('file-6', 'test6.pdf');

      expect(result4.queuePosition).toBe(1);
      expect(result5.queuePosition).toBe(2);
      expect(result6.queuePosition).toBe(3);

      expect(queue.getStatus().activeCount).toBe(3);
      expect(queue.getStatus().queuedCount).toBe(3);
    });
  });

  describe('FIFO Queue Ordering', () => {
    it('should maintain FIFO order when processing queue', async () => {
      // Setup: 3 active + 2 queued
      queue.enqueue('file-1', 'test1.pdf');
      queue.enqueue('file-2', 'test2.pdf');
      queue.enqueue('file-3', 'test3.pdf');
      queue.enqueue('file-4', 'test4.pdf'); // Position 1
      queue.enqueue('file-5', 'test5.pdf'); // Position 2

      // Complete first job
      const processed = await queue.complete('file-1');

      // file-4 should be processed (was first in queue)
      expect(processed?.fileId).toBe('file-4');
      expect(queue.getStatus().activeCount).toBe(3); // Still 3 active (2+3+4)
      expect(queue.getStatus().queuedCount).toBe(1); // Only file-5 queued now
    });

    it('should process all queued jobs in correct order', async () => {
      // Setup: 3 active + 3 queued
      queue.enqueue('file-1', 'test1.pdf');
      queue.enqueue('file-2', 'test2.pdf');
      queue.enqueue('file-3', 'test3.pdf');
      queue.enqueue('file-4', 'test4.pdf');
      queue.enqueue('file-5', 'test5.pdf');
      queue.enqueue('file-6', 'test6.pdf');

      // Complete jobs and track order
      const processedOrder: string[] = [];

      const next1 = await queue.complete('file-1');
      if (next1) processedOrder.push(next1.fileId);

      const next2 = await queue.complete('file-2');
      if (next2) processedOrder.push(next2.fileId);

      const next3 = await queue.complete('file-3');
      if (next3) processedOrder.push(next3.fileId);

      // Verify FIFO order
      expect(processedOrder).toEqual(['file-4', 'file-5', 'file-6']);
      expect(queue.getStatus().queuedCount).toBe(0);
    });
  });

  describe('Queue Completion', () => {
    it('should reduce active count when job completes with no queue', async () => {
      queue.enqueue('file-1', 'test1.pdf');
      queue.enqueue('file-2', 'test2.pdf');

      await queue.complete('file-1');

      expect(queue.getStatus().activeCount).toBe(1);
      expect(queue.getStatus().queuedCount).toBe(0);
    });

    it('should process next queued job when one completes', async () => {
      // Fill to max + queue one
      queue.enqueue('file-1', 'test1.pdf');
      queue.enqueue('file-2', 'test2.pdf');
      queue.enqueue('file-3', 'test3.pdf');
      queue.enqueue('file-4', 'test4.pdf'); // Queued

      // Complete one
      const nextFile = await queue.complete('file-1');

      expect(nextFile?.fileId).toBe('file-4');
      expect(queue.getStatus().activeCount).toBe(3); // Still at max (2, 3, 4)
      expect(queue.getStatus().queuedCount).toBe(0); // Queue empty
    });

    it('should handle completing non-existent job gracefully', async () => {
      queue.enqueue('file-1', 'test1.pdf');

      // Complete job that doesn't exist
      const result = await queue.complete('non-existent-file');

      expect(result).toBeNull();
      expect(queue.getStatus().activeCount).toBe(1); // file-1 still active
    });

    it('should handle completing already-completed job gracefully', async () => {
      queue.enqueue('file-1', 'test1.pdf');
      await queue.complete('file-1');

      // Try to complete again
      const result = await queue.complete('file-1');

      expect(result).toBeNull();
      expect(queue.getStatus().activeCount).toBe(0);
    });
  });

  describe('Queue Status', () => {
    it('should return accurate queue status', () => {
      queue.enqueue('file-1', 'test1.pdf');
      queue.enqueue('file-2', 'test2.pdf');
      queue.enqueue('file-3', 'test3.pdf');
      queue.enqueue('file-4', 'test4.pdf');
      queue.enqueue('file-5', 'test5.pdf');

      const status = queue.getStatus();

      expect(status.activeCount).toBe(3);
      expect(status.queuedCount).toBe(2);
      expect(status.queuedJobs).toHaveLength(2);
      expect(status.queuedJobs[0].fileId).toBe('file-4');
      expect(status.queuedJobs[1].fileId).toBe('file-5');
    });

    it('should include job metadata in status', () => {
      queue.enqueue('file-1', 'test1.pdf');
      queue.enqueue('file-2', 'test2.pdf');
      queue.enqueue('file-3', 'test3.pdf');
      queue.enqueue('file-4', 'document.docx');

      const status = queue.getStatus();
      const queuedJob = status.queuedJobs[0];

      expect(queuedJob.fileId).toBe('file-4');
      expect(queuedJob.filename).toBe('document.docx');
      expect(queuedJob.addedAt).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty queue status check', () => {
      const status = queue.getStatus();

      expect(status.activeCount).toBe(0);
      expect(status.queuedCount).toBe(0);
      expect(status.queuedJobs).toEqual([]);
    });

    it('should handle rapid sequential enqueues', () => {
      // Simulate rapid uploads
      const results = [];
      for (let i = 1; i <= 10; i++) {
        results.push(queue.enqueue(`file-${i}`, `test${i}.pdf`));
      }

      // First 3 immediate, rest queued
      expect(results.slice(0, 3).every(r => r.immediate)).toBe(true);
      expect(results.slice(3).every(r => !r.immediate)).toBe(true);

      // Queue positions correct
      expect(results[3].queuePosition).toBe(1);
      expect(results[9].queuePosition).toBe(7);

      expect(queue.getStatus().activeCount).toBe(3);
      expect(queue.getStatus().queuedCount).toBe(7);
    });

    it('should handle completing all jobs sequentially', async () => {
      // Add jobs
      for (let i = 1; i <= 5; i++) {
        queue.enqueue(`file-${i}`, `test${i}.pdf`);
      }

      // Complete all
      await queue.complete('file-1');
      await queue.complete('file-2');
      await queue.complete('file-3');
      await queue.complete('file-4');
      await queue.complete('file-5');

      const status = queue.getStatus();
      expect(status.activeCount).toBe(0);
      expect(status.queuedCount).toBe(0);
    });

    it('should handle enqueuing duplicate fileIds gracefully', () => {
      // In practice shouldn't happen, but shouldn't crash
      // Sets naturally prevent duplicate activeJobs
      queue.enqueue('file-1', 'test1.pdf');
      queue.enqueue('file-1', 'test1.pdf'); // Duplicate

      // Set only stores unique values, so activeCount remains 1
      expect(queue.getStatus().activeCount).toBe(1);
    });
  });

  describe('Callback Mechanism', () => {
    it('should trigger callback when processing queued job', async () => {
      let callbackTriggered = false;
      let callbackFileId = '';

      // Set callback
      queue.onJobReady = async (fileId: string) => {
        callbackTriggered = true;
        callbackFileId = fileId;
      };

      // Setup queue
      queue.enqueue('file-1', 'test1.pdf');
      queue.enqueue('file-2', 'test2.pdf');
      queue.enqueue('file-3', 'test3.pdf');
      queue.enqueue('file-4', 'test4.pdf'); // Queued

      // Complete one
      await queue.complete('file-1');

      expect(callbackTriggered).toBe(true);
      expect(callbackFileId).toBe('file-4');
    });

    it('should not trigger callback when no queued jobs', async () => {
      let callbackTriggered = false;

      queue.onJobReady = async (fileId: string) => {
        callbackTriggered = true;
      };

      queue.enqueue('file-1', 'test1.pdf');
      await queue.complete('file-1');

      expect(callbackTriggered).toBe(false);
    });
  });
});
