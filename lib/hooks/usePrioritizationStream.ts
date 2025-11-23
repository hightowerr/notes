import { useEffect, useMemo, useRef, useState } from 'react';

import { prioritizedPlanSchema } from '@/lib/schemas/prioritizedPlanSchema';
import type { PrioritizedTaskPlan } from '@/lib/types/agent';
import type { PrioritizationStreamEvent } from '@/lib/services/prioritizationStream';

type ConnectionState = 'idle' | 'connecting' | 'open' | 'error' | 'closed';

type StreamState = {
  progressPct: number;
  connectionState: ConnectionState;
  partialPlan: PrioritizedTaskPlan | null;
  stage: PrioritizationStreamEvent['status'] | null;
  lastEventAt: number | null;
};

const STREAM_PATH = '/api/agent/prioritize';

export function usePrioritizationStream(sessionId: string | null): StreamState {
  const [progressPct, setProgressPct] = useState(0);
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [partialPlan, setPartialPlan] = useState<PrioritizedTaskPlan | null>(null);
  const [stage, setStage] = useState<StreamState['stage']>(null);
  const lastEventAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setProgressPct(0);
      setConnectionState('idle');
      setPartialPlan(null);
      setStage(null);
      lastEventAtRef.current = null;
      return;
    }

    const source = new EventSource(`${STREAM_PATH}?session_id=${sessionId}`);
    setConnectionState('connecting');

    source.onopen = () => {
      setConnectionState('open');
    };

    source.onerror = () => {
      setConnectionState('error');
      source.close();
    };

    source.onmessage = event => {
      try {
        const payload = JSON.parse(event.data) as PrioritizationStreamEvent;
        lastEventAtRef.current = Date.now();

        if (payload.type === 'heartbeat') {
          return;
        }

        if (payload.type !== 'progress') {
          return;
        }

        const nextProgress = typeof payload.progress_pct === 'number' ? payload.progress_pct : 0;
        setProgressPct(prev => Math.min(1, Math.max(prev, nextProgress)));
        setStage(payload.status ?? null);

        if (payload.plan) {
          const parsed = prioritizedPlanSchema.safeParse(payload.plan);
          if (parsed.success) {
            setPartialPlan(parsed.data);
          }
        }
      } catch (error) {
        console.warn('[usePrioritizationStream] Failed to parse progress event', error);
      }
    };

    return () => {
      setConnectionState('closed');
      source.close();
    };
  }, [sessionId]);

  return useMemo(
    () => ({
      progressPct,
      connectionState,
      partialPlan,
      stage,
      lastEventAt: lastEventAtRef.current,
    }),
    [progressPct, connectionState, partialPlan, stage]
  );
}
