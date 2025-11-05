/**
 * Integration Test: Complete Outcome Creation and Edit Flow (T018)
 * Simulates empty state → create → banner display → edit → update
 */

vi.mock('sonner', () => {
  const success = vi.fn();
  const error = vi.fn();
  const Toaster = () => null;
  return {
    Toaster,
    toast: {
      success,
      error,
    },
  };
});

vi.mock('@/lib/services/recomputeService', () => ({
  recomputeService: {
    enqueue: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@supabase/supabase-js', () => {
  type OutcomeRecord = {
    id: string;
    user_id: string;
    direction: string;
    object_text: string;
    metric_text: string;
    clarifier: string;
    assembled_text: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
  };

  interface Tables {
    user_outcomes: OutcomeRecord[];
    processed_documents: Array<Record<string, unknown>>;
  }

  const tables: Tables = {
    user_outcomes: [],
    processed_documents: [],
  };

  const clone = <T,>(value: T): T => structuredClone(value);

  const ensureTable = <K extends keyof Tables>(tableName: K): Tables[K] => tables[tableName];

  const buildSelect = <K extends keyof Tables>(
    tableName: K,
    options?: Record<string, unknown>
  ) => {
    const filters: Array<(row: Tables[K][number]) => boolean> = [];

    const applyFilters = () => ensureTable(tableName).filter((row) =>
      filters.every((predicate) => predicate(row))
    );

    const builder: any = {
      eq(field: string, value: unknown) {
        filters.push((row: any) => row[field] === value);

        if (options?.head) {
          const rows = applyFilters();
          return Promise.resolve({ data: null, count: rows.length, error: null });
        }

        return builder;
      },
      async maybeSingle() {
        const rows = applyFilters();
        if (rows.length === 0) {
          return { data: null, error: null };
        }
        return { data: clone(rows[0]), error: null };
      },
      async single() {
        const rows = applyFilters();
        if (rows.length === 0) {
          return { data: null, error: { message: 'No rows found' } };
        }
        return { data: clone(rows[0]), error: null };
      },
    };

    return builder;
  };

  const createFrom = <K extends keyof Tables>(tableName: K) => ({
    select(_columns = '*', options?: Record<string, unknown>) {
      return buildSelect(tableName, options);
    },
    insert(payload: any) {
      const rows = ensureTable(tableName);
      const entries = Array.isArray(payload) ? payload : [payload];
      const now = new Date().toISOString();

      const inserted = entries.map((entry) => {
        const record = { ...entry };
        if (!record.id) record.id = crypto.randomUUID();
        if (!record.created_at) record.created_at = now;
        if (!record.updated_at) record.updated_at = now;
        rows.push(record);
        return record;
      });

      const first = inserted[0];

      return {
        select() {
          return {
            async single() {
              return { data: clone(first), error: null };
            },
          };
        },
      };
    },
    update(values: Record<string, unknown>) {
      return {
        async eq(field: string, value: unknown) {
          const rows = ensureTable(tableName);
          const updated: Tables[K][number][] = [];

          for (const row of rows) {
            if ((row as any)[field] === value) {
              Object.assign(row as any, values);
              if (values.updated_at === undefined) {
                (row as any).updated_at = new Date().toISOString();
              }
              updated.push(clone(row));
            }
          }

          return { data: updated, error: null };
        },
      };
    },
  });

  const resetTables = () => {
    tables.user_outcomes.length = 0;
    tables.processed_documents.length = 0;
  };

  return {
    createClient: () => ({
      from: (tableName: keyof Tables) => createFrom(tableName),
    }),
    __tables: tables,
    __resetTables: resetTables,
  };
});

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Home from '@/app/page';
import { GET as outcomesGET, POST as outcomesPOST } from '@/app/api/outcomes/route';
import { toast } from 'sonner';
import { recomputeService } from '@/lib/services/recomputeService';

interface MockTables {
  user_outcomes: Array<{
    id: string;
    user_id: string;
    direction: string;
    object_text: string;
    metric_text: string;
    clarifier: string;
    assembled_text: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
  }>;
  processed_documents: Array<Record<string, unknown>>;
}

const DEFAULT_USER_ID = 'default-user';

describe('Outcome Flow Integration (T018)', () => {
  const originalFetch = global.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;
  let tables: MockTables;
  let resetTables: () => void;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://localhost:54321';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??= 'test-key';

    const supabaseModule = await import('@supabase/supabase-js');
    tables = supabaseModule.__tables as MockTables;
    resetTables = supabaseModule.__resetTables as () => void;
  });

  beforeEach(() => {
    resetTables();
    vi.clearAllMocks();

    fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const method = (init?.method ?? 'GET').toUpperCase();

      if (url.endsWith('/api/outcomes')) {
        if (method === 'GET') {
          return outcomesGET();
        }

        if (method === 'POST') {
          const requestInit: RequestInit = {
            ...init,
            method,
          };
          const request = new Request('http://localhost/api/outcomes', requestInit);
          return outcomesPOST(request);
        }
      }

      return new Response(JSON.stringify({ error: 'NOT_FOUND' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('allows a user to create, display, and edit an outcome', async () => {
    const user = userEvent.setup();

    render(<Home />);

    // Initial fetch returns 404 (no outcome yet)
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
      expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/outcomes');
    });

    // Open creation modal
    await user.click(screen.getByRole('button', { name: /set outcome/i }));
    expect(await screen.findByText(/Set Your Outcome Statement/i)).toBeInTheDocument();

    // Fill out outcome fields
    await user.type(
      screen.getByPlaceholderText(/monthly recurring revenue/i),
      'monthly recurring revenue',
    );
    await user.type(
      screen.getByPlaceholderText(/25% within 6 months/i),
      '25% within 6 months',
    );
    await user.type(
      screen.getByPlaceholderText(/enterprise customer acquisition/i),
      'enterprise customer acquisition',
    );

    await user.click(screen.getByRole('button', { name: /set outcome statement/i }));

    // Success toast + banner refresh
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        expect.stringContaining('Outcome created successfully'),
        expect.anything(),
      );
    });

    await waitFor(() => {
      expect(
        screen.getByText(
          /Increase the monthly recurring revenue by 25% within 6 months through enterprise customer acquisition/i,
        ),
      ).toBeInTheDocument();
    });

    // Database assertion: one active outcome stored
    expect(tables.user_outcomes).toHaveLength(1);
    expect(tables.user_outcomes[0].is_active).toBe(true);
    expect(tables.user_outcomes[0].user_id).toBe(DEFAULT_USER_ID);

    // Edit the active outcome
    await user.click(screen.getByRole('button', { name: /edit outcome/i }));
    expect(await screen.findByText(/Edit Your Outcome Statement/i)).toBeInTheDocument();

    const metricField = screen.getByPlaceholderText(/25% within 6 months/i);
    await user.clear(metricField);
    await user.type(metricField, '40% within 4 months');

    await user.click(screen.getByRole('button', { name: /update outcome/i }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        expect.stringContaining('Outcome updated'),
        expect.anything(),
      );
    });

    await waitFor(() => {
      expect(
        screen.getByText(
          /Increase the monthly recurring revenue by 40% within 4 months through enterprise customer acquisition/i,
        ),
      ).toBeInTheDocument();
    });

    // Database assertions: old outcome deactivated, new active outcome stored
    expect(tables.user_outcomes).toHaveLength(2);

    const activeOutcome = tables.user_outcomes.find((entry) => entry.is_active);
    const inactiveOutcome = tables.user_outcomes.find((entry) => !entry.is_active);

    expect(activeOutcome).toBeDefined();
    expect(inactiveOutcome).toBeDefined();
    expect(activeOutcome?.metric_text).toBe('40% within 4 months');
    expect(inactiveOutcome?.metric_text).toBe('25% within 6 months');

    // Recompute job triggered on create + update
    expect(recomputeService.enqueue).toHaveBeenCalledTimes(2);
    expect(recomputeService.enqueue).toHaveBeenLastCalledWith(
      expect.objectContaining({
        outcomeId: activeOutcome?.id,
        userId: DEFAULT_USER_ID,
      }),
    );
  });
});
