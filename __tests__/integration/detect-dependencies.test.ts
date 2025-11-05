import { detectDependenciesTool } from '@/lib/mastra/tools/detectDependencies';
import { supabase } from '@/lib/supabase';
import * as dependencyService from '@/lib/services/dependencyService';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
  },
}));

vi.mock('@/lib/services/dependencyService');

describe('detect-dependencies integration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('analyzes dependencies and stores them', async () => {
    const taskIds = ['task1', 'task2', 'task3'];
    const mockAnalysis = {
      dependencies: [
        {
          source_task_id: 'task1',
          target_task_id: 'task2',
          relationship_type: 'prerequisite',
          confidence_score: 0.9,
          reasoning: 'task2 depends on task1'
        }
      ],
      analyzed_count: 3,
      context_included: true
    };

    (dependencyService.analyzeTaskDependencies as any).mockResolvedValue(mockAnalysis);
    (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'task_relationships') {
            return {
                insert: vi.fn().mockResolvedValue({ error: null })
            }
        }
    });

    const result = await detectDependenciesTool.execute({ task_ids: taskIds });

    expect(dependencyService.analyzeTaskDependencies).toHaveBeenCalledWith(taskIds, { includeContext: true });
    expect(result).toEqual(mockAnalysis);
  });
});
