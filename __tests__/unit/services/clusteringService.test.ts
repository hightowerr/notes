import { performHierarchicalClustering } from '@/lib/services/clusteringService';
import { supabase } from '@/lib/supabase';

vi.mock('@/lib/supabase', () => {
  const chainable = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    in: vi.fn(),
    eq: vi.fn().mockReturnThis(),
  };

  return {
    supabase: chainable,
  };
});

describe('clusteringService', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should throw when embeddings are missing for requested tasks', async () => {
    const mockEmbeddings = [{ task_id: 'task1', embedding: [1, 0, 0] }];

    (supabase.in as any).mockResolvedValueOnce({ data: mockEmbeddings, error: null });

    await expect(
      performHierarchicalClustering(['task1', 'task2'], { threshold: 0.5 })
    ).rejects.toThrow('Missing embeddings for one or more task IDs');
  });

  it('should perform hierarchical clustering', async () => {
    const mockEmbeddings = [
      { task_id: 'task1', embedding: [1, 0, 0] },
      { task_id: 'task2', embedding: [0, 1, 0] },
      { task_id: 'task3', embedding: [0, 0, 1] },
      { task_id: 'task4', embedding: [0.9, 0.1, 0] },
    ];

    (supabase.in as any).mockResolvedValueOnce({ data: mockEmbeddings, error: null });

    const result = await performHierarchicalClustering(['task1', 'task2', 'task3', 'task4'], { threshold: 0.5 });

    expect(result.clusters.length).toBe(3);
    expect(result.task_count).toBe(4);
    expect(result.cluster_count).toBe(3);
    expect(result.clusters[0].task_ids.sort()).toEqual(['task1', 'task4'].sort());
  });
});
