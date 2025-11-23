import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';

export type OutcomeRecord = {
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

export type AgentSessionRecord = {
  id: string;
  user_id: string;
  outcome_id: string;
  status: 'running' | 'completed' | 'failed';
  prioritized_plan: Record<string, unknown> | null;
  baseline_plan: Record<string, unknown> | null;
  excluded_tasks?: Array<Record<string, unknown>> | null;
  evaluation_metadata?: Record<string, unknown> | null;
  strategic_scores?: Record<string, unknown> | null;
  execution_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ReasoningTraceRecord = {
  id: string;
  session_id: string;
  steps: Array<Record<string, unknown>>;
  total_duration_ms: number;
  total_steps: number;
  tools_used_count: Record<string, number>;
  created_at: string;
};

export type TaskEmbeddingRecord = {
  task_id: string;
  task_text: string;
  document_id: string | null;
  status?: string | null;
  manual_override?: boolean | null;
  manual_overrides?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
};

export type ReflectionRecord = {
  id?: string;
  user_id?: string;
  text?: string;
  created_at?: string;
  is_active_for_prioritization?: boolean;
};

type AgentMockTables = {
  user_outcomes: OutcomeRecord[];
  agent_sessions: AgentSessionRecord[];
  reasoning_traces: ReasoningTraceRecord[];
  task_embeddings: TaskEmbeddingRecord[];
  processing_logs: Array<Record<string, unknown>>;
  reflections: ReflectionRecord[];
};

const tables: AgentMockTables = {
  user_outcomes: [],
  agent_sessions: [],
  reasoning_traces: [],
  task_embeddings: [],
  processing_logs: [],
  reflections: [],
};

const clone = <T,>(value: T): T => {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
};

const resetTables = () => {
  tables.user_outcomes.length = 0;
  tables.agent_sessions.length = 0;
  tables.reasoning_traces.length = 0;
  tables.task_embeddings.length = 0;
  tables.processing_logs.length = 0;
  tables.reflections.length = 0;
};

const ensureTable = <K extends keyof AgentMockTables>(tableName: K): AgentMockTables[K] => {
  if (!tables[tableName]) {
    (tables as Record<string, unknown>)[tableName as string] = [];
  }
  return tables[tableName];
};

function buildSelect<K extends keyof AgentMockTables>(tableName: K) {
  const filters: Array<(row: AgentMockTables[K][number]) => boolean> = [];
  let orderField: string | null = null;
  let orderAscending = true;
  let limitCount: number | null = null;

  const applyFilters = () => {
    let results = ensureTable(tableName).filter(row => filters.every(predicate => predicate(row)));
    if (orderField) {
      const factor = orderAscending ? 1 : -1;
      results = [...results].sort((a, b) => {
        const aValue = (a as any)[orderField!];
        const bValue = (b as any)[orderField!];
        if (aValue === bValue) return 0;
        return aValue > bValue ? factor : -factor;
      });
    }
    if (limitCount !== null) {
      results = results.slice(0, limitCount);
    }
    return results;
  };

  const execute = () => ({ data: clone(applyFilters()), error: null });

  const builder: any = {
    eq(field: string, value: unknown) {
      filters.push((row: any) => row[field] === value);
      return builder;
    },
    in(field: string, values: unknown[]) {
      filters.push((row: any) => values.includes(row[field]));
      return builder;
    },
    order(field: string, options?: { ascending?: boolean }) {
      orderField = field;
      orderAscending = options?.ascending ?? true;
      return builder;
    },
    limit(count: number) {
      limitCount = count;
      return builder;
    },
    gte(field: string, value: unknown) {
      filters.push((row: any) => {
        const rowValue = row[field];
        return typeof rowValue === 'number' || typeof rowValue === 'string'
          ? rowValue >= value
          : false;
      });
      return builder;
    },
    lte(field: string, value: unknown) {
      filters.push((row: any) => {
        const rowValue = row[field];
        return typeof rowValue === 'number' || typeof rowValue === 'string'
          ? rowValue <= value
          : false;
      });
      return builder;
    },
    returns() {
      return builder;
    },
    async maybeSingle() {
      const rows = applyFilters();
      return { data: rows.length > 0 ? clone(rows[0]) : null, error: null };
    },
    async single() {
      const rows = applyFilters();
      if (rows.length === 0) {
        return { data: null, error: { message: 'No rows found' } };
      }
      return { data: clone(rows[0]), error: null };
    },
    then(onFulfilled?: (value: { data: unknown; error: null }) => unknown, onRejected?: (reason: unknown) => unknown) {
      const result = execute();
      try {
        return Promise.resolve(onFulfilled ? onFulfilled(result) : result);
      } catch (error) {
        if (onRejected) {
          return Promise.resolve(onRejected(error));
        }
        return Promise.reject(error);
      }
    },
  };

  return builder;
}

const createFrom = <K extends keyof AgentMockTables>(tableName: K) => ({
  select(_columns = '*') {
    return buildSelect(tableName);
  },
  insert(payload: any) {
    const rows = ensureTable(tableName);
    const entries = Array.isArray(payload) ? payload : [payload];
    const now = new Date().toISOString();

    const inserted = entries.map(entry => {
      const record: any = { ...entry };
      if (!record.id && tableName !== 'task_embeddings') {
        record.id = randomUUID();
      }
      if (!record.created_at) record.created_at = now;
      if (!record.updated_at) record.updated_at = now;
      rows.push(record);
      return record;
    });

    const first = inserted[0];

    return {
      select: () => ({
        single: async () => ({ data: clone(first), error: null }),
      }),
    };
  },
  delete() {
    const deleteFilters: Array<(row: Record<string, unknown>) => boolean> = [];

    const applyDelete = () => {
      const rows = ensureTable(tableName) as Array<Record<string, unknown>>;
      const deleted: Array<Record<string, unknown>> = [];
      for (let index = rows.length - 1; index >= 0; index -= 1) {
        if (deleteFilters.every(predicate => predicate(rows[index]))) {
          deleted.push(rows[index]);
          rows.splice(index, 1);
        }
      }
      return deleted;
    };

    const builder: any = {
      eq(field: string, value: unknown) {
        deleteFilters.push((row: any) => row[field] === value);
        return builder;
      },
      in(field: string, values: unknown[]) {
        deleteFilters.push((row: any) => values.includes(row[field]));
        return builder;
      },
      lt(field: string, value: unknown) {
        deleteFilters.push((row: any) => {
          const rowValue = row[field];
          return typeof rowValue === 'number' || typeof rowValue === 'string'
            ? rowValue < value
            : false;
        });
        return builder;
      },
      select(columns = '*') {
        return {
          then(onFulfilled?: (value: { data: unknown; error: null }) => unknown) {
            const deleted = applyDelete();
            const result = { data: clone(deleted), error: null };
            return Promise.resolve(onFulfilled ? onFulfilled(result) : result);
          },
        };
      },
      then(onFulfilled?: (value: { data: null; error: null }) => unknown) {
        applyDelete();
        const result = { data: null, error: null };
        return Promise.resolve(onFulfilled ? onFulfilled(result) : result);
      },
    };

    return builder;
  },
  update(values: Record<string, unknown>) {
    const updateFilters: Array<(row: Record<string, unknown>) => boolean> = [];

    const builder: any = {
      async eq(field: string, value: unknown) {
        updateFilters.push((row: any) => row[field] === value);
        const rows = ensureTable(tableName) as Array<Record<string, unknown>>;
        const updated: Array<Record<string, unknown>> = [];
        for (const row of rows) {
          if (updateFilters.every(predicate => predicate(row))) {
            Object.assign(row, values);
            if (values.updated_at === undefined) {
              row.updated_at = new Date().toISOString();
            }
            updated.push(clone(row));
          }
        }
        return { data: updated, error: null };
      },
      not(field: string, operator: string, value: unknown) {
        if (operator === 'is') {
          updateFilters.push((row: any) => row[field] !== value);
        }
        return builder;
      },
    };

    return builder;
  },
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (tableName: keyof AgentMockTables) => createFrom(tableName),
  }),
  __tables: tables,
  __resetTables: resetTables,
}));

export const agentMockTables = tables;
export const resetAgentMockTables = resetTables;
