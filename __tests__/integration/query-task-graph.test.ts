const createBuilder = (result: { data: unknown; error: unknown }) => {
  const promise = Promise.resolve(result);
  const builder: any = {
    select: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockReturnValue(promise),
    then: (resolve: unknown, reject?: unknown) =>
      promise.then(resolve as (value: typeof result) => unknown, reject as (reason: unknown) => unknown),
  };
  builder.or.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.limit.mockReturnValue(builder);
  return builder;
};

import { queryTaskGraphTool } from '@/lib/mastra/tools/queryTaskGraph';
import { supabase } from '@/lib/supabase';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe('query-task-graph integration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('queries and returns task relationships', async () => {
    const taskId = 'task1';
    const mockRelationships = [
      {
        id: 'rel1',
        source_task_id: 'task1',
        target_task_id: 'task2',
        relationship_type: 'prerequisite',
        confidence_score: 0.9,
        detection_method: 'ai',
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: 'rel2',
        source_task_id: 'task3',
        target_task_id: 'task1',
        relationship_type: 'related',
        confidence_score: 0.8,
        detection_method: 'ai',
        created_at: new Date(),
        updated_at: new Date(),
      },
    ];

    const relationshipsBuilder = createBuilder({ data: mockRelationships, error: null });
    const taskLookupBuilder = createBuilder({ data: { task_id: taskId }, error: null });

    const supabaseFromMock = supabase.from as ReturnType<typeof vi.fn>;
    supabaseFromMock.mockImplementation((table: string) => {
      if (table === 'task_relationships') {
        return relationshipsBuilder;
      }
      if (table === 'task_embeddings') {
        return taskLookupBuilder;
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const result = await queryTaskGraphTool.execute({ task_id: taskId });

    expect(result.relationships).toEqual(mockRelationships);
    expect(result.task_id).toBe(taskId);
    expect(result.filter_applied).toBe('all');
  });

  it('filters relationships by type', async () => {
    const taskId = 'task1';
    const mockRelationships = [
      {
        id: 'rel1',
        source_task_id: 'task1',
        target_task_id: 'task2',
        relationship_type: 'prerequisite',
        confidence_score: 0.9,
        detection_method: 'ai',
        created_at: new Date(),
        updated_at: new Date(),
      },
    ];

    const relationshipsBuilder = createBuilder({ data: mockRelationships, error: null });
    const taskLookupBuilder = createBuilder({ data: { task_id: taskId }, error: null });

    const supabaseFromMock = supabase.from as ReturnType<typeof vi.fn>;
    supabaseFromMock.mockImplementation((table: string) => {
      if (table === 'task_relationships') {
        return relationshipsBuilder;
      }
      if (table === 'task_embeddings') {
        return taskLookupBuilder;
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const result = await queryTaskGraphTool.execute({ task_id: taskId, relationship_type: 'prerequisite' });

    expect(result.relationships).toEqual(mockRelationships);
    expect(result.task_id).toBe(taskId);
    expect(result.filter_applied).toBe('prerequisite');
  });
});
