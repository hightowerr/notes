import { NextRequest } from 'next/server';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/lib/services/aiSummarizer', () => ({
  calculateCosineSimilarity: (taskVector: number[], reflectionVector: number[]) => {
    let dot = 0;
    let taskMagnitude = 0;
    let reflectionMagnitude = 0;

    for (let index = 0; index < taskVector.length; index += 1) {
      const taskValue = taskVector[index] ?? 0;
      const reflectionValue = reflectionVector[index] ?? 0;

      dot += taskValue * reflectionValue;
      taskMagnitude += taskValue * taskValue;
      reflectionMagnitude += reflectionValue * reflectionValue;
    }

    if (taskMagnitude === 0 || reflectionMagnitude === 0) {
      return 0;
    }

    return dot / Math.sqrt(taskMagnitude * reflectionMagnitude);
  },
}));

interface MockReflectionRow {
  id: string;
  user_id: string;
  text: string;
  created_at: string;
  is_active_for_prioritization: boolean;
}

interface MockTaskEmbeddingRow {
  task_id: string;
  task_text: string;
}

const tableData: {
  reflections: MockReflectionRow[];
  task_embeddings: MockTaskEmbeddingRow[];
} = {
  reflections: [],
  task_embeddings: [],
};

const supabaseAuthUserId = 'integration-user';

class QueryBuilder<T extends Record<string, unknown>> {
  private readonly tableName: keyof typeof tableData;
  private filters: Array<(row: T) => boolean> = [];
  private limitCount: number | null = null;
  private orderConfig: { field: keyof T; ascending: boolean } | null = null;

  constructor(tableName: keyof typeof tableData) {
    this.tableName = tableName;
  }

  select(): QueryBuilder<T> {
    return this;
  }

  eq(field: keyof T, value: unknown): QueryBuilder<T> {
    this.filters.push((row) => row[field] === value);
    return this;
  }

  gte(field: keyof T, value: string): QueryBuilder<T> {
    const threshold = new Date(value).getTime();
    this.filters.push((row) => {
      const raw = row[field];
      if (typeof raw !== 'string') {
        return false;
      }
      const created = new Date(raw).getTime();
      return Number.isFinite(created) && created >= threshold;
    });
    return this;
  }

  in(field: keyof T, values: unknown[]): QueryBuilder<T> {
    const valueSet = new Set(values);
    this.filters.push((row) => valueSet.has(row[field]));
    return this;
  }

  order(field: keyof T, options?: { ascending?: boolean }): QueryBuilder<T> {
    this.orderConfig = {
      field,
      ascending: options?.ascending !== false,
    };
    return this;
  }

  limit(count: number): QueryBuilder<T> {
    this.limitCount = count;
    return this;
  }

  private build(): { data: T[]; error: null } {
    const rows = [...tableData[this.tableName] as T[]];

    const filtered = this.filters.reduce<T[]>((accumulator, predicate) => {
      return accumulator.filter(predicate);
    }, rows);

    const ordered = this.orderConfig
      ? [...filtered].sort((left, right) => {
          const leftValue = left[this.orderConfig!.field];
          const rightValue = right[this.orderConfig!.field];

          if (typeof leftValue === 'string' && typeof rightValue === 'string') {
            const comparison =
              leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
            return this.orderConfig!.ascending ? comparison : -comparison;
          }

          return 0;
        })
      : filtered;

    const limited =
      typeof this.limitCount === 'number'
        ? ordered.slice(0, this.limitCount)
        : ordered;

    const cloned = JSON.parse(JSON.stringify(limited)) as T[];
    return { data: cloned, error: null };
  }

  then<TResult1 = { data: T[]; error: null }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: T[]; error: null }) => TResult1 | PromiseLike<TResult1>)
      | undefined
      | null,
    onrejected?:
      | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
      | undefined
      | null,
  ): Promise<TResult1 | TResult2> {
    try {
      const result = this.build();
      return Promise.resolve(result).then(onfulfilled, onrejected);
    } catch (error) {
      return Promise.reject(error).then(onfulfilled, onrejected);
    }
  }
}

const supabase = {
  auth: {
    getSession: vi.fn(async () => ({
      data: { session: { user: { id: supabaseAuthUserId } } },
    })),
  },
  from: vi.fn((tableName: keyof typeof tableData) => {
    if (!(tableName in tableData)) {
      throw new Error(`Table ${tableName.toString()} is not mocked`);
    }
    return new QueryBuilder(tableName);
  }),
};

vi.mock('@/lib/supabase', () => ({
  supabase,
  __mockTables: tableData,
}));

import type { PrioritizedTaskPlan } from '@/lib/types/agent';
import { GET as reflectionsGet } from '@/app/api/reflections/route';
import { buildAdjustedPlanFromReflections } from '@/lib/services/reflectionBasedRanking';
import { __mockTables } from '@/lib/supabase';

const MOCK_NOW = new Date('2025-02-01T12:00:00.000Z');
const DAY_IN_MS = 24 * 60 * 60 * 1000;

const uuid = (suffix: string) =>
  `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

const createReflection = (
  id: string,
  daysAgo: number,
  options: { userId?: string; text?: string } = {},
): MockReflectionRow => {
  const createdAt = new Date(MOCK_NOW.getTime() - daysAgo * DAY_IN_MS);
  return {
    id,
    user_id: options.userId ?? supabaseAuthUserId,
    text: options.text ?? `Reflection ${id}`,
    created_at: createdAt.toISOString(),
    is_active_for_prioritization: true,
  };
};

describe('Recency weighting integration (T012)', () => {
  beforeEach(() => {
    vi.setSystemTime(MOCK_NOW);
    __mockTables.reflections = [];
    __mockTables.task_embeddings = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns step-function recency weights via GET /api/reflections', async () => {
    __mockTables.reflections = [
      createReflection(uuid('000001'), 0, { text: 'Fresh reflection' }),
      createReflection(uuid('000002'), 7, { text: 'Exactly seven days' }),
      createReflection(uuid('000003'), 8, { text: 'Eight days old' }),
      createReflection(uuid('000004'), 14, { text: 'Fourteen days old' }),
      createReflection(uuid('000005'), 15, { text: 'Fifteen days old' }),
    ];

    const request = new NextRequest(
      'http://localhost/api/reflections?limit=5&within_days=30',
    );
    const response = await reflectionsGet(request);

    expect(response.status).toBe(200);

    const payload = await response.json();
    const reflections: Array<{ id: string; recency_weight: number }> =
      Array.isArray(payload?.reflections) ? payload.reflections : [];

    expect(reflections).toHaveLength(5);

    const weightById = new Map(
      reflections.map((reflection) => [reflection.id, reflection.recency_weight]),
    );

    expect(weightById.get(uuid('000001'))).toBe(1);
    expect(weightById.get(uuid('000002'))).toBe(1);
    expect(weightById.get(uuid('000003'))).toBe(0.5);
    expect(weightById.get(uuid('000004'))).toBe(0.5);
    expect(weightById.get(uuid('000005'))).toBe(0.25);
  });

  it('applies recency weighting when calculating adjusted plans', async () => {
    const TASK_BETA = uuid('100000');
    const TASK_ALPHA = uuid('200000');
    const reflectionFreshId = uuid('300000');
    const reflectionStaleId = uuid('400000');

    __mockTables.reflections = [
      {
        id: reflectionFreshId,
        user_id: supabaseAuthUserId,
        text: 'aaaa',
        created_at: new Date(MOCK_NOW.getTime() - 1 * DAY_IN_MS).toISOString(),
        is_active_for_prioritization: true,
      },
      {
        id: reflectionStaleId,
        user_id: supabaseAuthUserId,
        text: 'bbbb',
        created_at: new Date(MOCK_NOW.getTime() - 15 * DAY_IN_MS).toISOString(),
        is_active_for_prioritization: true,
      },
    ];

    __mockTables.task_embeddings = [
      { task_id: TASK_BETA, task_text: 'bbbb' },
      { task_id: TASK_ALPHA, task_text: 'aaaa' },
    ];

    const baselinePlan: PrioritizedTaskPlan = {
      ordered_task_ids: [TASK_BETA, TASK_ALPHA],
      execution_waves: [
        {
          wave_number: 1,
          task_ids: [TASK_BETA],
          parallel_execution: false,
          estimated_duration_hours: 2,
        },
        {
          wave_number: 2,
          task_ids: [TASK_ALPHA],
          parallel_execution: false,
          estimated_duration_hours: 2,
        },
      ],
      dependencies: [],
      confidence_scores: {
        [TASK_BETA]: 0.6,
        [TASK_ALPHA]: 0.6,
      },
      synthesis_summary: 'Baseline prioritization order',
      task_annotations: [],
      removed_tasks: [],
      created_at: new Date(MOCK_NOW.getTime() - 16 * DAY_IN_MS).toISOString(),
    };

    const { adjustedPlan } = await buildAdjustedPlanFromReflections({
      userId: supabaseAuthUserId,
      baselinePlan,
      activeReflectionIds: [reflectionFreshId, reflectionStaleId],
    });

    expect(adjustedPlan.ordered_task_ids).toEqual([TASK_ALPHA, TASK_BETA]);

    const weights = new Map(
      adjustedPlan.adjustment_metadata.reflections.map((reflection) => [
        reflection.id,
        reflection.recency_weight,
      ]),
    );

    expect(weights.get(reflectionFreshId)).toBe(1);
    expect(weights.get(reflectionStaleId)).toBe(0.25);

    const moved = adjustedPlan.diff.moved;
    const betaMovement = moved.find((entry) => entry.task_id === TASK_BETA);

    expect(betaMovement).toBeDefined();
    expect(betaMovement?.from).toBe(1);
    expect(betaMovement?.to).toBe(2);
  });
});

