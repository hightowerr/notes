import { describe, it, expect, vi, beforeEach } from 'vitest';

import { cleanupEvaluationMetadata } from '../cleanup-agent-sessions';

type MockQueryResult<T> = { data: T; error: null } | { data: null; error: { message: string } };

function createChain<T extends object>(resolveWith: () => Promise<MockQueryResult<T>>) {
  return {
    lt: vi.fn().mockReturnThis(),
    not: vi.fn().mockImplementation(() => resolveWith()),
  };
}

function createUpdateChain(resolveWith: () => Promise<MockQueryResult<unknown>>) {
  return {
    lt: vi.fn().mockReturnThis(),
    not: vi.fn().mockImplementation(() => resolveWith()),
  };
}

function createMockSupabase(options: { candidateCount: number }) {
  const selectChain = createChain(() =>
    Promise.resolve({
      data: Array.from({ length: options.candidateCount }, (_, i) => ({ id: `id-${i}` })),
      error: null,
    })
  );

  const updateChain = createUpdateChain(() =>
    Promise.resolve({
      data: null,
      error: null,
    })
  );

  const insert = vi.fn().mockResolvedValue({ data: null, error: null });

  const from = vi.fn().mockImplementation((table: string) => {
    if (table === 'agent_sessions') {
      return {
        select: vi.fn().mockReturnValue(selectChain),
        update: vi.fn().mockReturnValue(updateChain),
      };
    }

    if (table === 'processing_logs') {
      return { insert };
    }

    throw new Error(`Unexpected table ${table}`);
  });

  return { from, selectChain, updateChain, insert };
}

vi.mock('@/lib/supabase/admin', () => {
  const store: { client: ReturnType<typeof createMockSupabase> | null } = { client: null };

  return {
    getSupabaseAdminClient: () => {
      if (!store.client) {
        throw new Error('Mock client not set');
      }
      return store.client;
    },
    __setMockClient: (client: ReturnType<typeof createMockSupabase>) => {
      store.client = client as any;
    },
  };
});

// eslint-disable-next-line @typescript-eslint/naming-convention
const { __setMockClient } = await import('@/lib/supabase/admin') as {
  __setMockClient: (client: ReturnType<typeof createMockSupabase>) => void;
};

describe('cleanupEvaluationMetadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns candidate counts without mutating when dry-run', async () => {
    const mockClient = createMockSupabase({ candidateCount: 3 });
    __setMockClient(mockClient);

    const result = await cleanupEvaluationMetadata({ dryRun: true, now: Date.UTC(2024, 0, 31) });

    expect(result.dryRun).toBe(true);
    expect(result.candidateCount).toBe(3);
    expect(mockClient.from).toHaveBeenCalledWith('agent_sessions');
    expect(mockClient.from).not.toHaveBeenCalledWith('processing_logs');
  });

  it('clears evaluation metadata and logs when not dry-run', async () => {
    const mockClient = createMockSupabase({ candidateCount: 2 });
    __setMockClient(mockClient);

    const result = await cleanupEvaluationMetadata({ dryRun: false, now: Date.UTC(2024, 0, 31) });

    expect(result.removedCount).toBe(2);
    expect(mockClient.from).toHaveBeenCalledWith('agent_sessions');
    expect(mockClient.from).toHaveBeenCalledWith('processing_logs');
    expect(mockClient.updateChain.not).toHaveBeenCalled();
    expect(mockClient.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'evaluation_metadata_cleanup',
        metadata: expect.objectContaining({ removed_count: 2, dry_run: false }),
      })
    );
  });
});
