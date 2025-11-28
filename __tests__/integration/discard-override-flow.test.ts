/**
 * Integration Test: Discard Override Flow
 * Tests T013 and T018: Override discard decision and re-analysis
 *
 * User journey:
 * 1. Manual task created and analyzed
 * 2. Agent marks task as not_relevant (discarded)
 * 3. User disagrees and clicks Override
 * 4. Task sent back for re-analysis
 * 5. Agent re-evaluates (may accept or still reject)
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

type ManualTaskStatus = 'analyzing' | 'prioritized' | 'not_relevant' | 'conflict';

type ManualTaskRow = {
  task_id: string;
  status: ManualTaskStatus;
  agent_rank?: number | null;
  placement_reason?: string | null;
  exclusion_reason?: string | null;
  outcome_id?: string | null;
  deleted_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

type TaskEmbeddingRow = {
  task_id: string;
  task_text: string;
  is_manual?: boolean | null;
  outcome_id?: string | null;
  created_at?: string;
  updated_at?: string;
};

type OutcomeRow = {
  id: string;
  user_id: string;
  assembled_text: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

const manualTasks: ManualTaskRow[] = [];
const taskEmbeddings: TaskEmbeddingRow[] = [];
const userOutcomes: OutcomeRow[] = [];

const agentDecisions: Array<
  | { decision: 'include'; rank: number; reason: string }
  | { decision: 'exclude'; reason: string }
> = [];

vi.mock('@/lib/mastra/agents/prioritizationGenerator', () => {
  const runPrioritization = vi.fn(async () => {
    const nextDecision = agentDecisions.shift();
    if (!nextDecision) {
      return {
        decision: 'exclude',
        exclusion_reason: 'No decision provided',
      };
    }
    if (nextDecision.decision === 'include') {
      return {
        decision: 'include',
        agent_rank: nextDecision.rank,
        placement_reason: nextDecision.reason,
      };
    }
    return {
      decision: 'exclude',
      exclusion_reason: nextDecision.reason,
    };
  });

  return {
    createPrioritizationAgent: () => ({
      run: runPrioritization,
    }),
    runPrioritization,
    generatePrioritizationInstructions: vi.fn(),
  };
});

function buildQuery<T extends Record<string, any>>(table: T[]) {
  const filters: Array<(row: T) => boolean> = [];

  const applyFilters = () => table.filter(row => filters.every(predicate => predicate(row)));

  const builder: any = {
    eq(field: keyof T, value: unknown) {
      filters.push(row => row[field] === value);
      return builder;
    },
    is(field: keyof T, value: unknown) {
      filters.push(row => row[field] === value);
      return builder;
    },
    async maybeSingle() {
      const data = applyFilters()[0] ?? null;
      return { data, error: null };
    },
    async single() {
      const data = applyFilters()[0] ?? null;
      if (!data) {
        return { data: null, error: { message: 'No rows found' } };
      }
      return { data, error: null };
    },
    update(payload: Partial<T>) {
      return {
        eq(field: keyof T, value: unknown) {
          const matchingRows = table.filter(row => {
            if ((row as any)[field] !== value) return false;
            return filters.every(predicate => predicate(row));
          });
          matchingRows.forEach(row => {
            Object.assign(row, payload, { updated_at: new Date().toISOString() });
          });
          const result = {
            data: matchingRows,
            error: null,
            select: async () => ({ data: matchingRows, error: null }),
            then: (resolve: any) => resolve({ data: matchingRows, error: null }),
          };
          return result;
        },
      };
    },
  };

  return builder;
}

vi.mock('@/lib/supabase/admin', () => {
  const supabase = {
    from: (tableName: string) => {
      switch (tableName) {
        case 'manual_tasks':
          return {
            select: () => buildQuery(manualTasks),
            insert: (payload: ManualTaskRow | ManualTaskRow[]) => {
              const rows = Array.isArray(payload) ? payload : [payload];
              manualTasks.push(...rows);
              return {
                select: async () => ({ data: rows, error: null }),
              };
            },
            update: (payload: Partial<ManualTaskRow>) => buildQuery(manualTasks).update(payload),
          };
        case 'task_embeddings':
          return {
            select: () => buildQuery(taskEmbeddings),
            insert: (payload: TaskEmbeddingRow | TaskEmbeddingRow[]) => {
              const rows = Array.isArray(payload) ? payload : [payload];
              taskEmbeddings.push(...rows);
              return {
                select: async () => ({ data: rows, error: null }),
              };
            },
          };
        case 'user_outcomes':
          return {
            select: () => buildQuery(userOutcomes),
            insert: (payload: OutcomeRow | OutcomeRow[]) => {
              const rows = Array.isArray(payload) ? payload : [payload];
              userOutcomes.push(...rows);
              return {
                select: async () => ({ data: rows, error: null }),
              };
            },
          };
        default:
          throw new Error(`Unexpected table: ${tableName}`);
      }
    },
  };
  return {
    getSupabaseAdminClient: () => supabase,
  };
});

type ManualTaskPlacementModule = {
  analyzeManualTask: (params: {
    taskId: string;
    taskText: string;
    outcomeId: string;
  }) => Promise<{
    status: ManualTaskStatus;
    rank?: number;
    placementReason?: string;
    exclusionReason?: string;
  }>;
  overrideDiscardDecision: (params: {
    taskId: string;
    userJustification?: string;
  }) => Promise<void>;
  getAnalysisStatus: (
    taskId: string
  ) => Promise<{
    status: ManualTaskStatus;
    agent_rank?: number | null;
    placement_reason?: string | null;
    exclusion_reason?: string | null;
  }>;
};

let analyzeManualTask: ManualTaskPlacementModule['analyzeManualTask'];
let overrideDiscardDecision: ManualTaskPlacementModule['overrideDiscardDecision'];
let getAnalysisStatus: ManualTaskPlacementModule['getAnalysisStatus'];

describe('Discard override flow (T013 + T018)', () => {
  beforeEach(async () => {
    manualTasks.length = 0;
    taskEmbeddings.length = 0;
    userOutcomes.length = 0;
    agentDecisions.length = 0;

    const module = (await import(
      '@/lib/services/manualTaskPlacement'
    )) as ManualTaskPlacementModule;
    analyzeManualTask = module.analyzeManualTask;
    overrideDiscardDecision = module.overrideDiscardDecision;
    getAnalysisStatus = module.getAnalysisStatus;
  });

  it('overrides discard decision and re-analyzes task successfully', async () => {
    // Setup: Create outcome and task
    const outcomeId = 'outcome-123';
    userOutcomes.push({
      id: outcomeId,
      user_id: 'default-user',
      assembled_text: 'Increase payment conversion by 10%',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const taskId = 'task-discarded-1';
    taskEmbeddings.push({
      task_id: taskId,
      task_text: 'Email legal about V6 payment contract',
      is_manual: true,
      outcome_id: outcomeId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    manualTasks.push({
      task_id: taskId,
      status: 'analyzing',
      outcome_id: outcomeId,
      deleted_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Step 1: Initial analysis - agent discards task
    agentDecisions.push({ decision: 'exclude', reason: 'No direct payment impact identified' });

    const initialResult = await analyzeManualTask({
      taskId,
      taskText: 'Email legal about V6 payment contract',
      outcomeId,
    });

    expect(initialResult.status).toBe('not_relevant');
    expect(initialResult.exclusionReason).toContain('No direct payment impact');

    const statusAfterDiscard = await getAnalysisStatus(taskId);
    expect(statusAfterDiscard.status).toBe('not_relevant');
    expect(statusAfterDiscard.exclusion_reason).toBe('No direct payment impact identified');

    // Step 2: User overrides discard decision
    await overrideDiscardDecision({
      taskId,
      userJustification: 'Contract approval unblocks payment feature launch',
    });

    // Verify status changed to analyzing and exclusion_reason cleared
    const statusAfterOverride = await getAnalysisStatus(taskId);
    expect(statusAfterOverride.status).toBe('analyzing');
    expect(statusAfterOverride.exclusion_reason).toBeNull();

    // Step 3: Re-analysis - agent now accepts task
    agentDecisions.push({
      decision: 'include',
      rank: 3,
      reason: 'Unblocks payment feature development',
    });

    // Wait for re-analysis (in real implementation, this is fire-and-forget background job)
    await new Promise(resolve => setTimeout(resolve, 100));

    const reAnalysisResult = await analyzeManualTask({
      taskId,
      taskText: 'Email legal about V6 payment contract',
      outcomeId,
    });

    expect(reAnalysisResult.status).toBe('prioritized');
    expect(reAnalysisResult.rank).toBe(3);
    expect(reAnalysisResult.placementReason).toContain('Unblocks payment feature');

    const finalStatus = await getAnalysisStatus(taskId);
    expect(finalStatus.status).toBe('prioritized');
    expect(finalStatus.agent_rank).toBe(3);
    expect(finalStatus.placement_reason).toContain('Unblocks payment feature');
  });

  it('handles override when agent still excludes task after re-analysis', async () => {
    // Setup
    const outcomeId = 'outcome-456';
    userOutcomes.push({
      id: outcomeId,
      user_id: 'default-user',
      assembled_text: 'Improve user activation by 15%',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const taskId = 'task-still-irrelevant';
    taskEmbeddings.push({
      task_id: taskId,
      task_text: 'Reorganize Notion workspace structure',
      is_manual: true,
      outcome_id: outcomeId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    manualTasks.push({
      task_id: taskId,
      status: 'analyzing',
      outcome_id: outcomeId,
      deleted_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Initial discard
    agentDecisions.push({ decision: 'exclude', reason: 'No impact on activation metric' });
    const initialResult = await analyzeManualTask({
      taskId,
      taskText: 'Reorganize Notion workspace structure',
      outcomeId,
    });
    expect(initialResult.status).toBe('not_relevant');

    // User overrides
    await overrideDiscardDecision({
      taskId,
      userJustification: 'Better organization will help team focus on activation work',
    });

    const statusAfterOverride = await getAnalysisStatus(taskId);
    expect(statusAfterOverride.status).toBe('analyzing');

    // Re-analysis - agent still excludes
    agentDecisions.push({
      decision: 'exclude',
      reason: 'Organizational work does not directly impact user activation metrics',
    });

    await new Promise(resolve => setTimeout(resolve, 100));

    const reAnalysisResult = await analyzeManualTask({
      taskId,
      taskText: 'Reorganize Notion workspace structure',
      outcomeId,
    });

    expect(reAnalysisResult.status).toBe('not_relevant');
    expect(reAnalysisResult.exclusionReason).toContain('does not directly impact');

    const finalStatus = await getAnalysisStatus(taskId);
    expect(finalStatus.status).toBe('not_relevant');
    expect(finalStatus.exclusion_reason).toContain('does not directly impact');
  });

  it('throws error when trying to override non-discarded task', async () => {
    const outcomeId = 'outcome-789';
    userOutcomes.push({
      id: outcomeId,
      user_id: 'default-user',
      assembled_text: 'Test outcome',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const taskId = 'task-prioritized';
    taskEmbeddings.push({
      task_id: taskId,
      task_text: 'Some task',
      is_manual: true,
      outcome_id: outcomeId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    manualTasks.push({
      task_id: taskId,
      status: 'prioritized', // Not in discard pile
      agent_rank: 5,
      placement_reason: 'High impact',
      outcome_id: outcomeId,
      deleted_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Attempt to override - should fail
    await expect(
      overrideDiscardDecision({
        taskId,
        userJustification: 'Test',
      })
    ).rejects.toThrow('not in discard pile');
  });

  it('throws error when trying to override non-existent task', async () => {
    await expect(
      overrideDiscardDecision({
        taskId: 'non-existent-task',
        userJustification: 'Test',
      })
    ).rejects.toThrow('not found');
  });

  it('handles override without user justification', async () => {
    const outcomeId = 'outcome-no-justification';
    userOutcomes.push({
      id: outcomeId,
      user_id: 'default-user',
      assembled_text: 'Test outcome',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const taskId = 'task-no-justification';
    taskEmbeddings.push({
      task_id: taskId,
      task_text: 'Task without justification',
      is_manual: true,
      outcome_id: outcomeId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    manualTasks.push({
      task_id: taskId,
      status: 'not_relevant',
      exclusion_reason: 'Low priority',
      outcome_id: outcomeId,
      deleted_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Override without justification
    await overrideDiscardDecision({ taskId });

    const status = await getAnalysisStatus(taskId);
    expect(status.status).toBe('analyzing');
    expect(status.exclusion_reason).toBeNull();
  });
});
