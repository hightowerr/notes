import { EventEmitter } from 'node:events';

import type { PrioritizedTaskPlan } from '@/lib/types/agent';

export type PrioritizationStreamEvent = {
  type: 'progress' | 'heartbeat';
  session_id: string;
  progress_pct?: number;
  iteration?: number;
  total_iterations?: number;
  scored_tasks?: number;
  total_tasks?: number;
  ordered_count?: number;
  status?: 'started' | 'draft' | 'refining' | 'completed' | 'failed';
  plan?: PrioritizedTaskPlan;
  note?: string | null;
  timestamp: string;
};

const GLOBAL_KEY = '__PRIORITIZATION_PROGRESS_EMITTER__';

const emitter: EventEmitter =
  (globalThis as Record<string, unknown>)[GLOBAL_KEY] instanceof EventEmitter
    ? (globalThis as Record<string, unknown>)[GLOBAL_KEY] as EventEmitter
    : new EventEmitter();

emitter.setMaxListeners(0);
(globalThis as Record<string, unknown>)[GLOBAL_KEY] = emitter;

export function emitPrioritizationProgress(
  sessionId: string,
  event: Omit<PrioritizationStreamEvent, 'session_id' | 'timestamp'>
): void {
  const payload: PrioritizationStreamEvent = {
    ...event,
    session_id: sessionId,
    timestamp: new Date().toISOString(),
  };
  emitter.emit(sessionId, payload);
}

export function subscribeToPrioritizationProgress(
  sessionId: string,
  listener: (event: PrioritizationStreamEvent) => void
): () => void {
  emitter.on(sessionId, listener);
  return () => {
    emitter.off(sessionId, listener);
  };
}

export function emitPrioritizationHeartbeat(sessionId: string): void {
  emitPrioritizationProgress(sessionId, { type: 'heartbeat' });
}
