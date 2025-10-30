import { analyzeTaskDependencies } from '@/lib/services/dependencyService';
import { supabase } from '@/lib/supabase';
import { generateObject } from 'ai';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      upsert: vi.fn().mockResolvedValue({ error: null }),
    }),
  },
}));

vi.mock('ai', () => ({
  generateObject: vi.fn(),
}));

vi.mock('@/lib/services/taskRepository', () => ({
  getTaskRecordsByIds: vi.fn(),
}));

describe('dependencyService', () => {
  let getTaskRecordsByIds: typeof import('@/lib/services/taskRepository')['getTaskRecordsByIds'];

  beforeAll(async () => {
    ({ getTaskRecordsByIds } = await import('@/lib/services/taskRepository'));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should analyze task dependencies and store them', async () => {
    const mockTasks = [
      {
        task_id: 'task1',
        task_text: 'Task 1',
        created_at: '2025-01-01T00:00:00.000Z',
        document_id: 'doc-1',
        source: 'embedding',
      },
      {
        task_id: 'task2',
        task_text: 'Task 2',
        created_at: '2025-01-02T00:00:00.000Z',
        document_id: 'doc-2',
        source: 'embedding',
      },
    ];
    const mockDependencies = {
      dependencies: [
        {
          source_task_id: 'task1',
          target_task_id: 'task2',
          relationship_type: 'prerequisite',
          confidence_score: 0.9,
          reasoning: 'Task 2 depends on Task 1',
        },
      ],
    };

    (getTaskRecordsByIds as unknown as vi.Mock).mockResolvedValue({
      tasks: mockTasks,
      missingIds: [],
      recoveredTaskIds: [],
    });

    (generateObject as any).mockResolvedValueOnce({ object: mockDependencies });

    const result = await analyzeTaskDependencies(['task1', 'task2'], { includeContext: false });

    expect(result.dependencies).toHaveLength(1);
    expect(result.analyzed_count).toBe(2);
    expect(result.context_included).toBe(false);
    expect(supabase.from).toHaveBeenCalledWith('task_relationships');
    const fromMock = supabase.from as unknown as vi.Mock;
    const upsert = fromMock.mock.results[0]?.value.upsert as vi.Mock;
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('should throw when no tasks are found', async () => {
    (getTaskRecordsByIds as unknown as vi.Mock).mockResolvedValue({
      tasks: [],
      missingIds: [],
      recoveredTaskIds: [],
    });

    await expect(
      analyzeTaskDependencies(['missing-task'], { includeContext: false })
    ).rejects.toThrow('No tasks found for provided task IDs');
  });

  it('should throw when some task IDs are missing', async () => {
    (getTaskRecordsByIds as unknown as vi.Mock).mockResolvedValue({
      tasks: [
        {
          task_id: 'task1',
          task_text: 'Task 1',
          created_at: '2025-01-01T00:00:00.000Z',
          document_id: 'doc-1',
          source: 'embedding',
        },
      ],
      missingIds: ['task2'],
      recoveredTaskIds: [],
    });

    await expect(
      analyzeTaskDependencies(['task1', 'task2'], { includeContext: false })
    ).rejects.toThrow('Missing task embeddings for IDs: task2');
  });
});
