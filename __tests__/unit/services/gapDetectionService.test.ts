import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

vi.mock('@/lib/services/taskRepository', () => ({
  getTaskRecordsByIds: vi.fn(),
}));

let detectGaps: typeof import('@/lib/services/gapDetectionService')['detectGaps'];
let MissingTaskError: typeof import('@/lib/services/gapDetectionService')['MissingTaskError'];
let supabase: { from: ReturnType<typeof vi.fn> };
let getTaskRecordsByIds: typeof import('@/lib/services/taskRepository')['getTaskRecordsByIds'];

beforeAll(async () => {
  supabase = (await import('@/lib/supabase')).supabase as unknown as {
    from: ReturnType<typeof vi.fn>;
  };
  const module = await import('@/lib/services/gapDetectionService');
  detectGaps = module.detectGaps;
  MissingTaskError = module.MissingTaskError;
  ({ getTaskRecordsByIds } = await import('@/lib/services/taskRepository'));
});

type BuilderResult<T> = {
  data: T;
  error: { message: string } | null;
};

const createBuilder = <T,>(result: BuilderResult<T>) => {
  const promise = Promise.resolve(result);
  const builder: any = {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    then: promise.then.bind(promise),
  };
  builder.select.mockReturnValue(builder);
  builder.in.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  return builder;
};

const mockRelationshipQuery = <T>(result: BuilderResult<T>) => {
  supabase.from.mockImplementation((table: string) => {
    if (table === 'task_relationships') {
      return createBuilder(result);
    }
    throw new Error(`Unexpected table requested: ${table}`);
  });
};

describe('gapDetectionService.detectGaps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabase.from.mockReset();
    (getTaskRecordsByIds as unknown as vi.Mock).mockReset();
  });

  it('detects a gap when three or more indicators are met', async () => {
    (getTaskRecordsByIds as unknown as vi.Mock).mockResolvedValue({
      tasks: [
        {
          task_id: 'task-1',
          task_text: 'Design app mockups',
          created_at: '2025-01-01T00:00:00.000Z',
          document_id: 'doc-1',
          source: 'embedding',
        },
        {
          task_id: 'task-2',
          task_text: 'Launch app in stores with marketing push',
          created_at: '2025-01-20T00:00:00.000Z',
          document_id: 'doc-2',
          source: 'embedding',
        },
      ],
      missingIds: [],
      recoveredTaskIds: [],
    });

    mockRelationshipQuery({
      data: [],
      error: null,
    });

    const result = await detectGaps(['task-1', 'task-2']);

    expect(result.metadata.total_pairs_analyzed).toBe(1);
    expect(result.metadata.gaps_detected).toBe(1);
    expect(Array.isArray(result.gaps)).toBe(true);
    expect(result.gaps).toHaveLength(1);

    const gap = result.gaps[0];
    expect(gap.predecessor_task_id).toBe('task-1');
    expect(gap.successor_task_id).toBe('task-2');
    expect(gap.indicators).toMatchObject({
      time_gap: true,
      action_type_jump: true,
      no_dependency: true,
    });
    expect(gap.confidence).toBeGreaterThanOrEqual(0.75);
    expect(typeof gap.detected_at).toBe('string');
  });

  it('returns no gaps when indicators do not meet the threshold', async () => {
    (getTaskRecordsByIds as unknown as vi.Mock).mockResolvedValue({
      tasks: [
        {
          task_id: 'task-1',
          task_text: 'Design app mockups',
          created_at: '2025-01-01T00:00:00.000Z',
          document_id: 'doc-1',
          source: 'embedding',
        },
        {
          task_id: 'task-2',
          task_text: 'Build app frontend',
          created_at: '2025-01-02T00:00:00.000Z',
          document_id: 'doc-1',
          source: 'embedding',
        },
      ],
      missingIds: [],
      recoveredTaskIds: [],
    });

    mockRelationshipQuery({
      data: [
        {
          source_task_id: 'task-1',
          target_task_id: 'task-2',
          relationship_type: 'prerequisite',
        },
      ],
      error: null,
    });

    const result = await detectGaps(['task-1', 'task-2']);

    expect(result.metadata.total_pairs_analyzed).toBe(1);
    expect(result.metadata.gaps_detected).toBe(0);
    expect(result.gaps).toHaveLength(0);
  });

  it('throws MissingTaskError when any task is not found', async () => {
    (getTaskRecordsByIds as unknown as vi.Mock).mockResolvedValue({
      tasks: [
        {
          task_id: 'task-1',
          task_text: 'Design app mockups',
          created_at: '2025-01-01T00:00:00.000Z',
          document_id: 'doc-1',
          source: 'embedding',
        },
      ],
      missingIds: ['task-2'],
      recoveredTaskIds: [],
    });

    mockRelationshipQuery({
      data: [],
      error: null,
    });

    await expect(detectGaps(['task-1', 'task-2'])).rejects.toBeInstanceOf(MissingTaskError);
  });
});
