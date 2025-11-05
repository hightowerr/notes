import { analyzeTaskDependencies } from '@/lib/services/dependencyService';
import { supabase } from '@/lib/supabase';
import { generateObject } from 'ai';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    in: vi.fn(),
    insert: vi.fn(),
  },
}));

vi.mock('ai', () => ({
  generateObject: vi.fn(),
}));

describe('dependencyService', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should analyze task dependencies and store them', async () => {
    const mockTasks = [
      { task_id: 'task1', task_text: 'Task 1' },
      { task_id: 'task2', task_text: 'Task 2' },
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

    (supabase.in as any).mockResolvedValueOnce({ data: mockTasks, error: null });
    (generateObject as any).mockResolvedValueOnce({ object: mockDependencies });
    (supabase.insert as any).mockResolvedValueOnce({ error: null });

    const result = await analyzeTaskDependencies(['task1', 'task2'], { includeContext: false });

    expect(result.dependencies).toHaveLength(1);
    expect(result.analyzed_count).toBe(2);
    expect(result.context_included).toBe(false);
    expect(supabase.insert).toHaveBeenCalled();
  });

  it('should throw when no tasks are found', async () => {
    (supabase.in as any).mockResolvedValueOnce({ data: [], error: null });

    await expect(
      analyzeTaskDependencies(['missing-task'], { includeContext: false })
    ).rejects.toThrow('No tasks found for provided task IDs');
  });

  it('should throw when some task IDs are missing', async () => {
    const mockTasks = [{ task_id: 'task1', task_text: 'Task 1' }];

    (supabase.in as any).mockResolvedValueOnce({ data: mockTasks, error: null });

    await expect(
      analyzeTaskDependencies(['task1', 'task2'], { includeContext: false })
    ).rejects.toThrow('Missing task embeddings for IDs: task2');
  });
});
