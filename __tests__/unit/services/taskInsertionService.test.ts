import { describe, it, expect, beforeEach, vi } from 'vitest';

const supabaseFromQueue: any[] = [];

const supabaseMock = {
  from: vi.fn((table: string) => {
    const builder = supabaseFromQueue.shift();
    if (!builder) {
      throw new Error(`Unexpected supabase.from call for table ${table}`);
    }
    return builder;
  }),
};

vi.mock('@/lib/supabase', () => ({
  supabase: supabaseMock,
}));

const generateEmbeddingMock = vi.fn();
const searchSimilarTasksMock = vi.fn();

vi.mock('@/lib/services/embeddingService', () => ({
  generateEmbedding: generateEmbeddingMock,
}));

vi.mock('@/lib/services/vectorStorage', () => ({
  searchSimilarTasks: searchSimilarTasksMock,
}));

const EMBEDDING_VECTOR = Array.from({ length: 1536 }, () => 0.1);

const baseTask = {
  id: '00000000-0000-0000-0000-000000000001',
  gap_id: '11111111-1111-1111-1111-111111111111',
  task_text: 'Bridge the implementation gap between tasks',
  estimated_hours: 80,
  cognition_level: 'high' as const,
  confidence: 0.9,
  reasoning: 'Connects predecessor and successor tasks by implementing required work.',
  source: 'ai_generated' as const,
  requires_review: true,
  created_at: '2025-10-28T12:00:00Z',
};

function createTask(overrides: Partial<typeof baseTask> = {}) {
  return {
    ...baseTask,
    ...overrides,
  };
}

function createSelectBuilder<T>(result: { data: T; error: null } | { data: null; error: Error }) {
  return {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    returns: vi.fn().mockResolvedValue(result),
  };
}

function createInsertBuilder(insertedIds: string[]) {
  const selectFn = vi.fn().mockResolvedValue({
    data: insertedIds.map(id => ({ task_id: id })),
    error: null,
  });

  return {
    insert: vi.fn().mockReturnValue({ select: selectFn }),
  };
}

function createRelationshipInsertBuilder(error: Error | null = null, capturedRows: any[] = []) {
  return {
    insert: vi.fn().mockImplementation(async (rows: any[]) => {
      capturedRows.push(...rows);
      return { error };
    }),
  };
}

function createDeleteBuilder() {
  return {
    delete: vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ error: null }) }),
  };
}

let insertBridgingTasks: typeof import('@/lib/services/taskInsertionService')['insertBridgingTasks'];
let TaskInsertionError: typeof import('@/lib/services/taskInsertionService')['TaskInsertionError'];

describe('taskInsertionService.insertBridgingTasks', () => {
  beforeEach(async () => {
    vi.resetModules();
    supabaseFromQueue.length = 0;
    supabaseMock.from.mockClear();
    generateEmbeddingMock.mockReset();
    searchSimilarTasksMock.mockReset();

    ({ insertBridgingTasks, TaskInsertionError } = await import('@/lib/services/taskInsertionService'));

    generateEmbeddingMock.mockResolvedValue(EMBEDDING_VECTOR);
    searchSimilarTasksMock.mockResolvedValue([]);
  });

  it('inserts bridging tasks and relationships when validation passes', async () => {
    const relationshipRows: any[] = [];

    supabaseFromQueue.push(
      createSelectBuilder({
        data: [
          { task_id: 'task-pre', document_id: 'doc-1' },
          { task_id: 'task-suc', document_id: 'doc-1' },
        ],
        error: null,
      }),
      createSelectBuilder({ data: [], error: null }),
      createSelectBuilder({ data: [], error: null }),
      createInsertBuilder(['task-new']),
      createRelationshipInsertBuilder(null, relationshipRows)
    );

    const result = await insertBridgingTasks([
      {
        task: createTask(),
        predecessor_id: 'task-pre',
        successor_id: 'task-suc',
      },
    ]);

    expect(result).toEqual({
      inserted_count: 1,
      task_ids: ['task-new'],
      relationships_created: 2,
    });

    expect(relationshipRows).toHaveLength(2);
    expect(relationshipRows[0]).toMatchObject({
      source_task_id: 'task-pre',
      target_task_id: baseTask.id,
      relationship_type: 'prerequisite',
    });
    expect(relationshipRows[1]).toMatchObject({
      source_task_id: baseTask.id,
      target_task_id: 'task-suc',
    });
  });

  it('throws when duplicate tasks are detected', async () => {
    supabaseFromQueue.push(
      createSelectBuilder({
        data: [
          { task_id: 'task-pre', document_id: 'doc-1' },
          { task_id: 'task-suc', document_id: 'doc-1' },
        ],
        error: null,
      }),
      createSelectBuilder({ data: [], error: null })
    );

    searchSimilarTasksMock.mockResolvedValueOnce([
      { task_id: 'existing-task', task_text: 'Existing task', document_id: 'doc-x', similarity: 0.95 },
    ]);

    await expect(
      insertBridgingTasks([
        {
          task: createTask({
            id: '00000000-0000-0000-0000-000000000002',
            task_text: 'Duplicate task text',
            estimated_hours: 40,
            cognition_level: 'medium',
            confidence: 0.8,
            reasoning: 'Looks similar to existing entry for validation checks.',
          }),
          predecessor_id: 'task-pre',
          successor_id: 'task-suc',
        },
      ])
    ).rejects.toMatchObject({ code: 'DUPLICATE_TASK' });
  });

  it('throws when cycle would be introduced and cannot be auto-resolved', async () => {
    supabaseFromQueue.push(
      // 1. Fetch task context (predecessor + successor)
      createSelectBuilder({
        data: [
          { task_id: 'task-pre', document_id: 'doc-1' },
          { task_id: 'task-suc', document_id: 'doc-1' },
        ],
        error: null,
      }),
      // 2. Check if task IDs are available
      createSelectBuilder({ data: [], error: null }),
      // 3. Load existing relationships (shows cycle: suc → pre)
      createSelectBuilder({
        data: [
          { source_task_id: 'task-suc', target_task_id: 'task-pre' },
        ],
        error: null,
      }),
      // 4. Load task texts for cycle display (findPath check)
      createSelectBuilder({
        data: [
          { task_id: 'task-pre', task_text: 'Predecessor task' },
          { task_id: 'task-suc', task_text: 'Successor task' },
        ],
        error: null,
      }),
      // 5. Delete builder for attempting to remove cycle edge
      {
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }),
      },
      // 6. Load relationships again after delete attempt - still has cycle
      createSelectBuilder({
        data: [
          { source_task_id: 'task-suc', target_task_id: 'task-pre' },
        ],
        error: null,
      }),
      // 7. Load task texts for final cycle detection
      createSelectBuilder({
        data: [
          { task_id: 'task-pre', task_text: 'Predecessor task' },
          { task_id: 'task-suc', task_text: 'Successor task' },
          { task_id: '00000000-0000-0000-0000-000000000003', task_text: 'Bridging task' },
        ],
        error: null,
      })
    );

    await expect(
      insertBridgingTasks([
        {
          task: createTask({
            id: '00000000-0000-0000-0000-000000000003',
            estimated_hours: 16,
            cognition_level: 'low',
            confidence: 0.7,
            reasoning: 'Would create cycle in dependency graph if inserted.',
          }),
          predecessor_id: 'task-pre',
          successor_id: 'task-suc',
        },
      ])
    ).rejects.toMatchObject({ code: 'CYCLE_DETECTED' });
  });

  it('attempts rollback when relationship insertion fails', async () => {
    const relationshipRows: any[] = [];
    const deleteBuilder = createDeleteBuilder();

    supabaseFromQueue.push(
      createSelectBuilder({
        data: [
          { task_id: 'task-pre', document_id: 'doc-1' },
          { task_id: 'task-suc', document_id: 'doc-1' },
        ],
        error: null,
      }),
      createSelectBuilder({ data: [], error: null }),
      createSelectBuilder({ data: [], error: null }),
      createInsertBuilder(['task-new']),
      createRelationshipInsertBuilder(new Error('Insert failed'), relationshipRows),
      deleteBuilder
    );

    await expect(
      insertBridgingTasks([
        {
          task: createTask({
            id: '00000000-0000-0000-0000-000000000004',
            estimated_hours: 32,
            cognition_level: 'medium',
            confidence: 0.85,
            reasoning: 'Testing rollback behaviour when relationship insert fails.',
          }),
          predecessor_id: 'task-pre',
          successor_id: 'task-suc',
        },
      ])
    ).rejects.toBeInstanceOf(TaskInsertionError);

    expect(deleteBuilder.delete).toHaveBeenCalled();
  });
});
