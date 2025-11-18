import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { generateObject } from 'ai';

import { scoreAllTasks } from '@/lib/services/strategicScoring';
import { resetRetryQueue, getRetryStatusSnapshot, clearRetryJobs } from '@/lib/services/retryQueue';
import { GET as metadataRoute } from '@/app/api/tasks/metadata/route';
import { TaskRow } from '@/app/priorities/components/TaskRow';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { TaskSummary } from '@/lib/types/agent';

vi.mock('ai', () => ({
  generateObject: vi.fn(),
}));

vi.mock('@ai-sdk/openai', () => ({
  openai: () => () => 'mock-model',
}));

const agentSessionsStore = new Map<string, { strategic_scores: Record<string, unknown> }>();
const processingLogsStore: Array<Record<string, any>> = [];

vi.mock('@/lib/supabase/admin', () => {
  const buildSelectBuilder = () => {
    const state: { sessionId: string | null } = { sessionId: null };
    return {
      eq(field: string, value: string) {
        if (field === 'id') {
          state.sessionId = value;
        }
        return this;
      },
      limit() {
        return {
          then(resolve: (value: { data: Array<{ strategic_scores: Record<string, unknown> }>; error: null }) => void) {
            const record = state.sessionId ? agentSessionsStore.get(state.sessionId) : undefined;
            const data = record ? [{ strategic_scores: record.strategic_scores }] : [];
            return resolve({ data, error: null });
          },
        };
      },
      async maybeSingle() {
        const record = state.sessionId ? agentSessionsStore.get(state.sessionId) : undefined;
        return { data: record ?? null, error: null };
      },
    };
  };

  const from = (table: string) => {
    if (table === 'agent_sessions') {
      return {
        select: () => buildSelectBuilder(),
        update: (values: Record<string, unknown>) => ({
          async eq(field: string, value: string) {
            if (field === 'id') {
              const existing = agentSessionsStore.get(value) ?? { strategic_scores: {} };
              agentSessionsStore.set(value, { ...existing, ...values });
            }
            return { error: null };
          },
        }),
      };
    }
    if (table === 'processing_logs') {
      return {
        insert: async (record: Record<string, unknown>) => {
          processingLogsStore.push({ ...record });
          return { error: null };
        },
        select: () => {
          const filters: Record<string, string> = {};
          return {
            eq(field: string, value: string) {
              filters[field] = value;
              return this;
            },
            then(
              resolve: (value: { data: Array<Record<string, unknown>>; error: null }) => void
            ) {
              const filtered = processingLogsStore.filter(entry => {
                if (filters.operation && entry.operation !== filters.operation) {
                  return false;
                }
                if (filters.status && entry.status !== filters.status) {
                  return false;
                }
                if (
                  filters['metadata->>session_id'] &&
                  entry.metadata?.session_id !== filters['metadata->>session_id']
                ) {
                  return false;
                }
                return true;
              });
              return resolve({ data: filtered, error: null });
            },
          };
        },
      };
    }
    return {};
  };

  return {
    getSupabaseAdminClient: () => ({
      from: (table: string) => from(table),
    }),
  };
});

const mockedGenerateObject = generateObject as unknown as vi.Mock;
const baseTask: TaskSummary = {
  task_id: 'task-retry-1',
  task_text: 'Refactor payment integration',
  document_id: 'doc-1',
  source: 'structured_output',
};

describe('Async retry flow', () => {
  beforeEach(() => {
    agentSessionsStore.clear();
    processingLogsStore.length = 0;
    mockedGenerateObject.mockReset();
    resetRetryQueue();
    process.env.OPENAI_API_KEY = 'test-key';
  });

  afterEach(() => {
    resetRetryQueue();
  });

  it('surfaces scoring status and updates scores after retry succeeds', async () => {
    const sessionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    agentSessionsStore.set(sessionId, { strategic_scores: {} });

    const previousKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'test-key';

    try {
      mockedGenerateObject.mockRejectedValue(new Error('timeout'));

      const scores = await scoreAllTasks([baseTask], 'Grow revenue', { sessionId });
      expect(Object.keys(scores)).toHaveLength(0);

      const snapshot = getRetryStatusSnapshot(sessionId);
      expect(snapshot['task-retry-1']).toBeDefined();

      const pendingResponse = await metadataRoute(
        new Request(`http://localhost/api/tasks/metadata?session_id=${sessionId}`)
      );
      const pendingPayload = await pendingResponse.json();
      const pendingStatus = pendingPayload.retry_status['task-retry-1']?.status;
      expect(['pending', 'in_progress']).toContain(pendingStatus);

      render(
        <TooltipProvider>
          <TaskRow
            taskId="task-retry-1"
            order={1}
            impact={null}
            effort={null}
            confidence={null}
            priority={null}
            strategicDetails={null}
            title="Refactor payment integration"
            category={null}
            isLocked={false}
            dependencyLinks={[]}
            movement={undefined}
            checked={false}
            isAiGenerated
            isManual={false}
            isPrioritizing={false}
            retryStatus={pendingPayload.retry_status['task-retry-1']}
            isSelected={false}
            isHighlighted={false}
            onSelect={() => {}}
            onToggleCompleted={() => {}}
            onToggleLock={() => {}}
            isEditingDisabled={false}
            outcomeId={null}
            onEditSuccess={() => {}}
          />
        </TooltipProvider>
      );
      expect(screen.getByText('Scoring…')).toBeInTheDocument();

      const strategicScore = {
        impact: 8,
        effort: 8,
        confidence: 0.78,
        priority: 48,
        reasoning: {
          impact_keywords: ['payment'],
          effort_source: 'heuristic',
          effort_hint: undefined,
          complexity_modifiers: undefined,
        },
        scored_at: new Date().toISOString(),
      };
      agentSessionsStore.set(sessionId, {
        strategic_scores: { 'task-retry-1': strategicScore },
      });
      clearRetryJobs(sessionId);

      const resolvedResponse = await metadataRoute(
        new Request(`http://localhost/api/tasks/metadata?session_id=${sessionId}`)
      );
      const resolvedPayload = await resolvedResponse.json();
      expect(resolvedPayload.retry_status['task-retry-1']).toBeUndefined();
      expect(resolvedPayload.scores['task-retry-1']).toMatchObject({
        impact: 8,
        confidence: expect.any(Number),
      });
    } finally {
      if (typeof previousKey === 'string') {
        process.env.OPENAI_API_KEY = previousKey;
      } else {
        delete process.env.OPENAI_API_KEY;
      }
    }
  });
});
