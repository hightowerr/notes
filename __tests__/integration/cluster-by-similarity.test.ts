import { clusterBySimilarityTool } from '@/lib/mastra/tools/clusterBySimilarity';
import { supabase } from '@/lib/supabase';
import * as clusteringService from '@/lib/services/clusteringService';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
  },
}));

vi.mock('@/lib/services/clusteringService');

describe('cluster-by-similarity integration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('groups tasks into clusters', async () => {
    const taskIds = ['task1', 'task2', 'task3'];
    const mockResult = {
      clusters: [
        {
          cluster_id: 0,
          task_ids: ['task1', 'task2'],
          centroid: Array(1536).fill(0.1),
          average_similarity: 0.8,
        },
      ],
      task_count: 3,
      cluster_count: 1,
      threshold_used: 0.75,
      ungrouped_task_ids: ['task3'],
    };

    (clusteringService.performHierarchicalClustering as any).mockResolvedValue(mockResult);

    const result = await clusterBySimilarityTool.execute({ task_ids: taskIds });

    expect(clusteringService.performHierarchicalClustering).toHaveBeenCalledWith(taskIds, { threshold: 0.75 });
    expect(result).toEqual(mockResult);
    const clusteredTaskIds = result.clusters.flatMap(c => c.task_ids);
    const combined = new Set([...clusteredTaskIds, ...result.ungrouped_task_ids]);
    expect(combined.size).toBe(taskIds.length);
  });
});
