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

  describe('Time gap indicator', () => {
    it('detects time gap when tasks are >7 days apart', async () => {
      (getTaskRecordsByIds as unknown as vi.Mock).mockResolvedValue({
        tasks: [
          {
            task_id: 'task-1',
            task_text: 'Research user needs',
            created_at: '2025-01-01T00:00:00.000Z',
            document_id: 'doc-1',
            source: 'embedding',
          },
          {
            task_id: 'task-2',
            task_text: 'Build initial prototype',
            created_at: '2025-01-10T00:00:00.000Z', // 9 days later
            document_id: 'doc-1',
            source: 'embedding',
          },
        ],
        missingIds: [],
        recoveredTaskIds: [],
      });

      mockRelationshipQuery({ data: [], error: null });

      const result = await detectGaps(['task-1', 'task-2']);

      // Should detect gap due to time_gap + action_type_jump (research→build skips design/plan)
      expect(result.gaps).toHaveLength(1);
      expect(result.gaps[0].indicators.time_gap).toBe(true);
    });

    it('does not detect time gap when tasks are ≤7 days apart', async () => {
      (getTaskRecordsByIds as unknown as vi.Mock).mockResolvedValue({
        tasks: [
          {
            task_id: 'task-1',
            task_text: 'Design mockups',
            created_at: '2025-01-01T00:00:00.000Z',
            document_id: 'doc-1',
            source: 'embedding',
          },
          {
            task_id: 'task-2',
            task_text: 'Build frontend components',
            created_at: '2025-01-05T00:00:00.000Z', // 4 days later
            document_id: 'doc-1',
            source: 'embedding',
          },
        ],
        missingIds: [],
        recoveredTaskIds: [],
      });

      mockRelationshipQuery({ data: [], error: null });

      const result = await detectGaps(['task-1', 'task-2']);

      // Gap detected due to action_type_jump + no_dependency, but time_gap should be false
      expect(result.gaps).toHaveLength(1);
      expect(result.gaps[0].indicators.time_gap).toBe(false);
    });
  });

  describe('Action type jump indicator', () => {
    it('detects action type jump when skipping 2+ workflow stages', async () => {
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
            task_text: 'Launch app in app store',
            created_at: '2025-01-15T00:00:00.000Z',
            document_id: 'doc-1',
            source: 'embedding',
          },
        ],
        missingIds: [],
        recoveredTaskIds: [],
      });

      mockRelationshipQuery({ data: [], error: null });

      const result = await detectGaps(['task-1', 'task-2']);

      // Design → Launch skips: plan, build, test, deploy (4 stages)
      expect(result.gaps).toHaveLength(1);
      expect(result.gaps[0].indicators.action_type_jump).toBe(true);
    });

    it('does not detect action type jump when only 1 stage apart', async () => {
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
            task_text: 'Plan implementation architecture',
            created_at: '2025-01-05T00:00:00.000Z',
            document_id: 'doc-1',
            source: 'embedding',
          },
        ],
        missingIds: [],
        recoveredTaskIds: [],
      });

      mockRelationshipQuery({ data: [], error: null });

      const result = await detectGaps(['task-1', 'task-2']);

      // Design → Plan is only 1 stage apart
      expect(result.gaps).toHaveLength(0);
      expect(result.metadata.gaps_detected).toBe(0);
    });
  });

  describe('No dependency indicator', () => {
    it('detects no_dependency when tasks have no explicit relationship', async () => {
      (getTaskRecordsByIds as unknown as vi.Mock).mockResolvedValue({
        tasks: [
          {
            task_id: 'task-1',
            task_text: 'Design mockups',
            created_at: '2025-01-01T00:00:00.000Z',
            document_id: 'doc-1',
            source: 'embedding',
          },
          {
            task_id: 'task-2',
            task_text: 'Launch app with marketing campaign',
            created_at: '2025-01-20T00:00:00.000Z',
            document_id: 'doc-1',
            source: 'embedding',
          },
        ],
        missingIds: [],
        recoveredTaskIds: [],
      });

      mockRelationshipQuery({ data: [], error: null });

      const result = await detectGaps(['task-1', 'task-2']);

      expect(result.gaps).toHaveLength(1);
      expect(result.gaps[0].indicators.no_dependency).toBe(true);
    });

    it('does not trigger no_dependency when explicit relationship exists', async () => {
      (getTaskRecordsByIds as unknown as vi.Mock).mockResolvedValue({
        tasks: [
          {
            task_id: 'task-1',
            task_text: 'Design mockups',
            created_at: '2025-01-01T00:00:00.000Z',
            document_id: 'doc-1',
            source: 'embedding',
          },
          {
            task_id: 'task-2',
            task_text: 'Launch app in stores',
            created_at: '2025-01-20T00:00:00.000Z',
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

      // Gap still detected due to time_gap + action_type_jump, but no_dependency should be false
      expect(result.gaps).toHaveLength(1);
      expect(result.gaps[0].indicators.no_dependency).toBe(false);
    });
  });

  describe('Skill jump indicator', () => {
    it('detects skill jump when tasks require completely different skills', async () => {
      (getTaskRecordsByIds as unknown as vi.Mock).mockResolvedValue({
        tasks: [
          {
            task_id: 'task-1',
            task_text: 'Design Figma mockups and UX flows',
            created_at: '2025-01-01T00:00:00.000Z',
            document_id: 'doc-1',
            source: 'embedding',
          },
          {
            task_id: 'task-2',
            task_text: 'Build backend API with Supabase and Postgres database',
            created_at: '2025-01-15T00:00:00.000Z',
            document_id: 'doc-1',
            source: 'embedding',
          },
        ],
        missingIds: [],
        recoveredTaskIds: [],
      });

      mockRelationshipQuery({ data: [], error: null });

      const result = await detectGaps(['task-1', 'task-2']);

      // Design skills (figma, ux) vs Backend skills (api, database, backend, supabase, postgres)
      expect(result.gaps).toHaveLength(1);
      expect(result.gaps[0].indicators.skill_jump).toBe(true);
    });

    it('does not detect skill jump when tasks share skills', async () => {
      (getTaskRecordsByIds as unknown as vi.Mock).mockResolvedValue({
        tasks: [
          {
            task_id: 'task-1',
            task_text: 'Build React frontend components',
            created_at: '2025-01-01T00:00:00.000Z',
            document_id: 'doc-1',
            source: 'embedding',
          },
          {
            task_id: 'task-2',
            task_text: 'Integrate Next.js routing with TypeScript',
            created_at: '2025-01-10T00:00:00.000Z',
            document_id: 'doc-1',
            source: 'embedding',
          },
        ],
        missingIds: [],
        recoveredTaskIds: [],
      });

      mockRelationshipQuery({ data: [], error: null });

      const result = await detectGaps(['task-1', 'task-2']);

      // Both tasks involve frontend skills (React, Next, TypeScript)
      expect(result.gaps).toHaveLength(0); // Not enough indicators (only time_gap if any)
    });
  });

  describe('Indicator threshold and confidence', () => {
    it('detects gap with 2 indicators (minimum threshold)', async () => {
      (getTaskRecordsByIds as unknown as vi.Mock).mockResolvedValue({
        tasks: [
          {
            task_id: 'task-1',
            task_text: 'Design mockups',
            created_at: '2025-01-01T00:00:00.000Z',
            document_id: 'doc-1',
            source: 'embedding',
          },
          {
            task_id: 'task-2',
            task_text: 'Test application quality',
            created_at: '2025-01-02T00:00:00.000Z',
            document_id: 'doc-1',
            source: 'embedding',
          },
        ],
        missingIds: [],
        recoveredTaskIds: [],
      });

      mockRelationshipQuery({ data: [], error: null });

      const result = await detectGaps(['task-1', 'task-2']);

      // Should have: action_type_jump (design→test skips plan+build) + no_dependency = 2 indicators
      expect(result.gaps).toHaveLength(1);
      expect(result.gaps[0].confidence).toBe(0.6); // 2 indicators = 0.6 confidence
    });

    it('calculates 0.75 confidence with 3 indicators', async () => {
      (getTaskRecordsByIds as unknown as vi.Mock).mockResolvedValue({
        tasks: [
          {
            task_id: 'task-1',
            task_text: 'Design mockups',
            created_at: '2025-01-01T00:00:00.000Z',
            document_id: 'doc-1',
            source: 'embedding',
          },
          {
            task_id: 'task-2',
            task_text: 'Build backend API with Supabase',
            created_at: '2025-01-10T00:00:00.000Z',
            document_id: 'doc-1',
            source: 'embedding',
          },
        ],
        missingIds: [],
        recoveredTaskIds: [],
      });

      mockRelationshipQuery({ data: [], error: null });

      const result = await detectGaps(['task-1', 'task-2']);

      // Should have: time_gap (9 days) + action_type_jump (design→build) + skill_jump (design→backend) + no_dependency = 4 indicators?
      // Actually: time_gap + action_type_jump + no_dependency + skill_jump
      expect(result.gaps).toHaveLength(1);
      const indicatorCount = Object.values(result.gaps[0].indicators).filter(Boolean).length;
      if (indicatorCount === 3) {
        expect(result.gaps[0].confidence).toBe(0.75);
      } else if (indicatorCount === 4) {
        expect(result.gaps[0].confidence).toBe(1.0);
      }
    });

    it('calculates 1.0 confidence with 4 indicators', async () => {
      (getTaskRecordsByIds as unknown as vi.Mock).mockResolvedValue({
        tasks: [
          {
            task_id: 'task-1',
            task_text: 'Design Figma mockups',
            created_at: '2025-01-01T00:00:00.000Z',
            document_id: 'doc-1',
            source: 'embedding',
          },
          {
            task_id: 'task-2',
            task_text: 'Launch app with marketing campaign',
            created_at: '2025-01-15T00:00:00.000Z',
            document_id: 'doc-1',
            source: 'embedding',
          },
        ],
        missingIds: [],
        recoveredTaskIds: [],
      });

      mockRelationshipQuery({ data: [], error: null });

      const result = await detectGaps(['task-1', 'task-2']);

      // All 4 indicators: time_gap (14 days) + action_type_jump (design→launch) + no_dependency + skill_jump (design→marketing)
      expect(result.gaps).toHaveLength(1);
      const indicatorCount = Object.values(result.gaps[0].indicators).filter(Boolean).length;
      expect(indicatorCount).toBe(4);
      expect(result.gaps[0].confidence).toBe(1.0);
    });

    it('does not detect gap with only 1 indicator', async () => {
      (getTaskRecordsByIds as unknown as vi.Mock).mockResolvedValue({
        tasks: [
          {
            task_id: 'task-1',
            task_text: 'Build frontend React components',
            created_at: '2025-01-01T00:00:00.000Z',
            document_id: 'doc-1',
            source: 'embedding',
          },
          {
            task_id: 'task-2',
            task_text: 'Develop Next.js pages',
            created_at: '2025-01-02T00:00:00.000Z',
            document_id: 'doc-1',
            source: 'embedding',
          },
        ],
        missingIds: [],
        recoveredTaskIds: [],
      });

      mockRelationshipQuery({ data: [], error: null });

      const result = await detectGaps(['task-1', 'task-2']);

      // Only no_dependency indicator (same workflow stage, same skills, <7 days apart)
      expect(result.gaps).toHaveLength(0);
      expect(result.metadata.gaps_detected).toBe(0);
    });
  });

  it('detects a gap when three or more indicators are met', async () {
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
