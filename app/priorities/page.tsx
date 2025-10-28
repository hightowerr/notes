'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Loader2, ExternalLink, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { MainNav } from '@/components/main-nav';
import { TaskList } from '@/app/priorities/components/TaskList';
import { ReasoningTracePanel } from '@/app/components/ReasoningTracePanel';
import { ContextCard } from '@/app/priorities/components/ContextCard';
import { ReflectionPanel } from '@/app/components/ReflectionPanel';
import { prioritizedPlanSchema } from '@/lib/schemas/prioritizedPlanSchema';
import { executionMetadataSchema } from '@/lib/schemas/executionMetadataSchema';
import { reflectionWithWeightSchema } from '@/lib/schemas/reflectionSchema';
import type { ExecutionMetadata, PrioritizedTaskPlan } from '@/lib/types/agent';
import { adjustedPlanSchema, type AdjustedPlan } from '@/lib/types/adjustment';
import type { ReflectionWithWeight } from '@/lib/schemas/reflectionSchema';
import { useLocalStorage } from '@/lib/hooks/useLocalStorage';
import { useSessionStorage } from '@/lib/hooks/useSessionStorage';
import { useReflectionShortcut } from '@/lib/hooks/useReflectionShortcut';
import { toast } from 'sonner';

const DEFAULT_USER_ID = 'default-user';
const POLL_INTERVAL_MS = 2000;
const DEFAULT_RELATIVE_TIME = 'just now';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MINUTE_IN_MS = 60 * 1000;
const HOUR_IN_MS = 60 * 60 * 1000;
const DAY_IN_MS = 24 * HOUR_IN_MS;
const WEEK_IN_MS = 7 * DAY_IN_MS;

function describeBaselineAge(ageMs: number): string {
  if (ageMs <= 0) {
    return 'just now';
  }

  if (ageMs < HOUR_IN_MS) {
    const minutes = Math.max(1, Math.floor(ageMs / MINUTE_IN_MS));
    return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  }

  const hours = Math.floor(ageMs / HOUR_IN_MS);
  if (hours < 24) {
    return `${hours} hour${hours === 1 ? '' : 's'}`;
  }

  const days = Math.floor(ageMs / DAY_IN_MS);
  if (days < 14) {
    return `${days} day${days === 1 ? '' : 's'}`;
  }

  const weeks = Math.floor(days / 7);
  if (weeks < 8) {
    return `${weeks} week${weeks === 1 ? '' : 's'}`;
  }

  const months = Math.floor(days / 30);
  if (months < 12) {
    return `${months} month${months === 1 ? '' : 's'}`;
  }

  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? '' : 's'}`;
}

const coerceNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
};

const calculateFallbackWeight = (createdAtIso: string): number => {
  const createdAt = new Date(createdAtIso);
  if (Number.isNaN(createdAt.getTime())) {
    return 1;
  }

  const ageInDays = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));

  if (ageInDays <= 7) {
    return 1;
  }

  if (ageInDays <= 14) {
    return 0.5;
  }

  return 0.25;
};

const formatFallbackRelativeTime = (createdAtIso: string): string => {
  const createdAt = new Date(createdAtIso);
  if (Number.isNaN(createdAt.getTime())) {
    return DEFAULT_RELATIVE_TIME;
  }

  const diffMs = Date.now() - createdAt.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes <= 1) {
    return DEFAULT_RELATIVE_TIME;
  }

  if (diffHours < 1) {
    return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  }

  if (diffDays < 1) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  }

  if (diffDays <= 7) {
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  }

  return '7+ days ago';
};

const normalizeReflection = (raw: unknown, index: number): ReflectionWithWeight | null => {
  if (!raw || typeof raw !== 'object') {
    console.warn('[Task Priorities] Skipping invalid reflection entry: not an object', raw);
    return null;
  }

  const candidate = raw as Record<string, unknown>;
  const id =
    typeof candidate.id === 'string' && candidate.id.length > 0
      ? candidate.id
      : `fallback-${index}`;
  const userId =
    typeof candidate.user_id === 'string' && candidate.user_id.length > 0
      ? candidate.user_id
      : 'unknown-user';
  const createdAt = typeof candidate.created_at === 'string' ? candidate.created_at : new Date().toISOString();
  const text =
    typeof candidate.text === 'string' && candidate.text.trim().length > 0
      ? candidate.text
      : 'Reflection unavailable.';
  const isActive =
    typeof candidate.is_active_for_prioritization === 'boolean'
      ? candidate.is_active_for_prioritization
      : true;

  const explicitWeight = coerceNumber(candidate.weight);
  const explicitRecency = coerceNumber(candidate.recency_weight);
  const weight = explicitWeight ?? explicitRecency ?? calculateFallbackWeight(createdAt);
  const recencyWeight = explicitRecency ?? weight;

  const relativeTime =
    typeof candidate.relative_time === 'string' && candidate.relative_time.trim().length > 0
      ? candidate.relative_time
      : formatFallbackRelativeTime(createdAt);

  const parsed = reflectionWithWeightSchema.safeParse({
    id,
    user_id: userId,
    text,
    created_at: createdAt,
    is_active_for_prioritization: isActive,
    recency_weight: recencyWeight,
    weight,
    relative_time: relativeTime
  });

  if (parsed.success) {
    return parsed.data;
  }

  console.warn('[Task Priorities] Dropping reflection that failed validation', {
    issues: parsed.error.flatten(),
    candidate
  });
  return null;
};

type OutcomeResponse = {
  id: string;
  assembled_text: string;
  state_preference: string | null;
  daily_capacity_hours: number | null;
};

type SessionStatus = 'idle' | 'running' | 'completed' | 'failed';

type PrioritizeResponse = {
  session_id: string;
  status: SessionStatus | 'running' | 'completed' | 'failed';
};

export default function TaskPrioritiesPage() {
  const [outcomeLoading, setOutcomeLoading] = useState(true);
  const [activeOutcome, setActiveOutcome] = useState<OutcomeResponse | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [sessionStatus, setSessionStatus] = useState<SessionStatus>('idle');
  const [triggerError, setTriggerError] = useState<string | null>(null);
  const [isTriggering, setIsTriggering] = useState(false);

  const [prioritizedPlan, setPrioritizedPlan] = useState<PrioritizedTaskPlan | null>(null);
  const [executionMetadata, setExecutionMetadata] = useState<ExecutionMetadata | null>(null);
  const [resultsError, setResultsError] = useState<string | null>(null);
  const [isLoadingResults, setIsLoadingResults] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [hasTriggered, setHasTriggered] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [planVersion, setPlanVersion] = useState(0);
  const [planStatusMessage, setPlanStatusMessage] = useState<string | null>(null);
  const [hasFetchedInitialPlan, setHasFetchedInitialPlan] = useState(false);
  const [reflections, setReflections] = useState<ReflectionWithWeight[]>([]);
  const [reflectionsLoading, setReflectionsLoading] = useState(true);
  const [reflectionsError, setReflectionsError] = useState<string | null>(null);
  const [reflectionPanelOpen, setReflectionPanelOpen] = useState(false);
  const [activeReflectionIds, setActiveReflectionIds] = useState<string[]>([]);
  const [latestAdjustment, setLatestAdjustment] = useState<AdjustedPlan | null>(null);
  const [isInstantAdjusting, setIsInstantAdjusting] = useState(false);
  const [adjustmentPerformance, setAdjustmentPerformance] = useState<{ total_ms: number; ranking_ms: number } | null>(null);
  const [adjustmentError, setAdjustmentError] = useState<string | null>(null);
  const [adjustmentWarnings, setAdjustmentWarnings] = useState<string[]>([]);
  const [baselineCreatedAt, setBaselineCreatedAt] = useState<string | null>(null);
  const [baselineReflectionIds, setBaselineReflectionIds] = useState<string[]>([]);

  // T005: Reasoning trace discoverability
  const [hasSeenTrace, setHasSeenTrace] = useSessionStorage('trace-first-visit', false);
  const [isTraceCollapsed, setIsTraceCollapsed] = useLocalStorage('reasoning-trace-collapsed', false);
  const [isTraceExpanded, setIsTraceExpanded] = useState(() => !isTraceCollapsed);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reflectionsFetchRef = useRef<{ hasFetched: boolean }>({ hasFetched: false });
  const lastActiveReflectionIdsRef = useRef<string[]>([]);
  const adjustmentControllerRef = useRef<AbortController | null>(null);

  // Fetch active outcome on mount
  useEffect(() => {
    const fetchOutcome = async () => {
      try {
        setOutcomeLoading(true);
        setFetchError(null);

        const response = await fetch('/api/outcomes');

        if (response.status === 404) {
          setActiveOutcome(null);
          return;
        }

        if (!response.ok) {
          throw new Error('Failed to fetch active outcome');
        }

        const data = await response.json();
        setActiveOutcome(data.outcome);
      } catch (error) {
        console.error('[Task Priorities] Failed to load outcome:', error);
        setFetchError('Unable to load active outcome. Please try again.');
      } finally {
        setOutcomeLoading(false);
      }
    };

    fetchOutcome();

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, []);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const applySessionResults = useCallback((session: unknown) => {
    if (!session || typeof session !== 'object' || session === null) {
      return;
    }

    let statusNote: string | null | undefined;

    const metadataResult = executionMetadataSchema.safeParse(
      (session as { execution_metadata?: unknown }).execution_metadata
    );
    if (metadataResult.success) {
      setExecutionMetadata(metadataResult.data);
      statusNote = metadataResult.data.status_note ?? null;
    }

    const planResult = prioritizedPlanSchema.safeParse(
      (session as { prioritized_plan?: unknown }).prioritized_plan
    );
    if (planResult.success) {
      setPrioritizedPlan(planResult.data);
      setResultsError(null);
      setHasTriggered(true);
      setPlanVersion(prev => prev + 1);
      setIsRecalculating(false);
      setIsLoadingResults(false);
      setPlanStatusMessage(null);
    } else {
      const rawStatus = (session as { status?: unknown }).status;
      const status = typeof rawStatus === 'string' ? rawStatus : undefined;
      if (status === 'completed') {
        setPrioritizedPlan(null);
        setResultsError(
          statusNote && statusNote.length > 0
            ? statusNote
            : 'Prioritized plan is unavailable. Please run prioritization again.'
        );
        setHasTriggered(true);
        setIsRecalculating(false);
        setIsLoadingResults(false);
      }
    }

    const baselineResult = prioritizedPlanSchema.safeParse(
      (session as { baseline_plan?: unknown }).baseline_plan
    );

    if (baselineResult.success) {
      const fallbackCreatedAt = (() => {
        const updatedAt = (session as { updated_at?: unknown }).updated_at;
        if (typeof updatedAt === 'string') {
          return updatedAt;
        }
        const createdAt = (session as { created_at?: unknown }).created_at;
        return typeof createdAt === 'string' ? createdAt : null;
      })();

      const createdAt = baselineResult.data.created_at ?? fallbackCreatedAt ?? null;
      setBaselineCreatedAt(createdAt);
    } else {
      setBaselineCreatedAt(null);
    }

    const adjustmentResult = adjustedPlanSchema.safeParse(
      (session as { adjusted_plan?: unknown }).adjusted_plan
    );

    if (adjustmentResult.success) {
      setLatestAdjustment(adjustmentResult.data);
    }
  }, []);

  const fetchReflections = useCallback(async () => {
    try {
      if (!reflectionsFetchRef.current.hasFetched) {
        setReflectionsLoading(true);
      }

      setReflectionsError(null);

      const response = await fetch('/api/reflections?limit=5&within_days=30');

      if (!response.ok) {
        throw new Error('Failed to load reflections');
      }

      const payload = await response.json();
      const rawReflections = Array.isArray(payload.reflections) ? payload.reflections : [];
      const normalized = rawReflections
        .map((reflection, index) => normalizeReflection(reflection, index))
        .filter((reflection): reflection is ReflectionWithWeight => reflection !== null);

      if (rawReflections.length > 0 && normalized.length === 0) {
        console.warn('[Task Priorities] Reflections response contained no valid entries', {
          payload: payload.reflections
        });
        setReflections([]);
        reflectionsFetchRef.current.hasFetched = true;
        return;
      }

      setReflections(normalized);
      reflectionsFetchRef.current.hasFetched = true;
    } catch (error) {
      console.error('[Task Priorities] Failed to fetch reflections:', error);
      setReflectionsError('Unable to load reflections. Please try again.');
    } finally {
      setReflectionsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReflections();
  }, [fetchReflections]);

  // Refresh reflections after the panel closes (user may have added context)
  const previousPanelState = useRef(false);
  useEffect(() => {
    const wasOpen = previousPanelState.current;
    previousPanelState.current = reflectionPanelOpen;

    if (wasOpen && !reflectionPanelOpen) {
      fetchReflections();
    }
  }, [reflectionPanelOpen, fetchReflections]);

  useReflectionShortcut(() => setReflectionPanelOpen((open) => !open));

  useEffect(() => {
    if (!adjustmentError) {
      return;
    }
    toast.error(adjustmentError);
  }, [adjustmentError]);

  useEffect(() => {
    if (adjustmentWarnings.length === 0) {
      return;
    }

    adjustmentWarnings.forEach((warning) => {
      if (typeof warning === 'string' && warning.length > 0) {
        toast.warning(warning);
      }
    });
  }, [adjustmentWarnings]);

  const reflectionMap = useMemo(() => {
    const map = new Map<string, ReflectionWithWeight>();
    reflections.forEach(reflection => {
      map.set(reflection.id, reflection);
    });
    return map;
  }, [reflections]);

  const baselineContextReflections = useMemo(() => {
    const sourceIds = baselineReflectionIds.length > 0
      ? baselineReflectionIds
      : reflections
          .filter(reflection => reflection.is_active_for_prioritization)
          .map(reflection => reflection.id);

    const uniqueIds = Array.from(new Set(sourceIds.filter(id => UUID_PATTERN.test(id))));

    return uniqueIds
      .map(id => reflectionMap.get(id))
      .filter((reflection): reflection is ReflectionWithWeight => Boolean(reflection))
      .map(reflection => ({
        id: reflection.id,
        text: reflection.text,
        recency_weight:
          typeof reflection.recency_weight === 'number'
            ? reflection.recency_weight
            : reflection.weight,
        created_at: reflection.created_at,
      }));
  }, [baselineReflectionIds, reflections, reflectionMap]);

  const adjustmentContextReflections = useMemo(() => {
    const metadata = latestAdjustment?.adjustment_metadata?.reflections;
    if (!metadata || metadata.length === 0) {
      return [];
    }

    const seen = new Set<string>();

    return metadata
      .filter(reflection => reflection && typeof reflection.id === 'string')
      .filter(reflection => {
        if (seen.has(reflection.id)) {
          return false;
        }
        seen.add(reflection.id);
        return true;
      })
      .map(reflection => ({
        id: reflection.id,
        text: reflection.text,
        recency_weight: reflection.recency_weight,
        created_at: reflection.created_at,
      }));
  }, [latestAdjustment]);

  const contextSummary = useMemo(() => {
    const baseline = baselineContextReflections.length > 0 ? baselineContextReflections : undefined;
    const adjustment = adjustmentContextReflections.length > 0 ? adjustmentContextReflections : undefined;

    if (!baseline && !adjustment) {
      return null;
    }

    return {
      baseline,
      adjustment,
      baselineCreatedAt,
    } as const;
  }, [baselineContextReflections, adjustmentContextReflections, baselineCreatedAt]);

  const baselineAgeInfo = useMemo(() => {
    if (!baselineCreatedAt) {
      return null;
    }

    const created = new Date(baselineCreatedAt);
    if (Number.isNaN(created.getTime())) {
      return null;
    }

    const ageMs = Math.max(0, Date.now() - created.getTime());
    return { ageMs, createdAt: baselineCreatedAt } as const;
  }, [baselineCreatedAt]);

  const isBaselineExpired = baselineAgeInfo ? baselineAgeInfo.ageMs >= WEEK_IN_MS : false;
  const isBaselineStale = baselineAgeInfo ? baselineAgeInfo.ageMs >= DAY_IN_MS : false;

  const baselineAgeLabel = useMemo(() => {
    if (!baselineAgeInfo) {
      return null;
    }
    return describeBaselineAge(baselineAgeInfo.ageMs);
  }, [baselineAgeInfo]);

  const disableContextToggles = isBaselineExpired;
  const disableRecalculate = isTriggering || sessionStatus === 'running';
  const handleActiveReflectionsChange = useCallback((ids: string[]) => {
    setActiveReflectionIds(prevIds => {
      if (prevIds.length === ids.length && prevIds.every((id, index) => id === ids[index])) {
        return prevIds;
      }
      return ids;
    });
  }, []);

  useEffect(() => {
    if (!prioritizedPlan || !currentSessionId || sessionStatus !== 'completed') {
      return;
    }

    const normalized = Array.from(
      new Set(activeReflectionIds.filter(id => UUID_PATTERN.test(id)))
    );

    const previousNormalized = lastActiveReflectionIdsRef.current;
    const isSame =
      previousNormalized.length === normalized.length &&
      previousNormalized.every((id, index) => id === normalized[index]);

    if (isSame) {
      return;
    }

    lastActiveReflectionIdsRef.current = normalized;

    adjustmentControllerRef.current?.abort();
    const controller = new AbortController();
    adjustmentControllerRef.current = controller;

    setLatestAdjustment(null);
    setAdjustmentPerformance(null);
    setAdjustmentWarnings([]);
    setAdjustmentError(null);
    setPlanStatusMessage(null);

    let cancelled = false;
    const indicatorTimeout = setTimeout(() => {
      if (!cancelled) {
        setIsInstantAdjusting(true);
        setPlanStatusMessage('Adjusting priorities…');
      }
    }, 120);

    const runAdjustment = async () => {
      try {
        const response = await fetch('/api/agent/adjust-priorities', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: currentSessionId,
            active_reflection_ids: normalized,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorPayload = await response.json().catch(() => ({}));
          const message =
            typeof errorPayload?.error === 'string'
              ? errorPayload.error
              : 'Failed to adjust priorities';
          throw new Error(message);
        }

        const payload = await response.json();
        const adjustedPlan = payload?.adjusted_plan as AdjustedPlan | undefined;
        if (!adjustedPlan || !Array.isArray(adjustedPlan.ordered_task_ids)) {
          throw new Error('Invalid adjustment response');
        }

        const warnings =
          Array.isArray(payload?.warnings) && payload.warnings.length > 0
            ? payload.warnings
            : [];

        if (typeof payload?.baseline_created_at === 'string') {
          setBaselineCreatedAt(payload.baseline_created_at);
        }

        setLatestAdjustment(adjustedPlan);
        setAdjustmentPerformance(
          typeof payload?.performance === 'object' ? payload.performance : null
        );
        setAdjustmentWarnings(
          warnings
            .map((warning: unknown) =>
              typeof warning === 'string' ? warning : String(warning)
            )
            .filter(warning => warning.length > 0)
        );

        setPrioritizedPlan(prev => {
          if (!prev) {
            return prev;
          }
          const mergedConfidence = {
            ...prev.confidence_scores,
            ...adjustedPlan.confidence_scores,
          };
          return {
            ...prev,
            ordered_task_ids:
              adjustedPlan.ordered_task_ids.length > 0
                ? adjustedPlan.ordered_task_ids
                : prev.ordered_task_ids,
            confidence_scores: mergedConfidence,
          };
        });
        setPlanVersion(prev => prev + 1);
        setPlanStatusMessage(null);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        console.error('[Task Priorities] Adjustment error:', error);
        const message =
          error instanceof Error ? error.message : 'Failed to adjust priorities';
        setAdjustmentError(message);
        setPlanStatusMessage(null);
      } finally {
        cancelled = true;
        clearTimeout(indicatorTimeout);
        setIsInstantAdjusting(false);
        adjustmentControllerRef.current = null;
      }
    };

    void runAdjustment();

    return () => {
      cancelled = true;
      clearTimeout(indicatorTimeout);
      controller.abort();
      adjustmentControllerRef.current = null;
    };
  }, [activeReflectionIds, currentSessionId, prioritizedPlan, sessionStatus]);

  const pollSessionStatus = (id: string) => {
    stopPolling();

    const poll = async () => {
      try {
        const res = await fetch(`/api/agent/sessions/${id}`);
        if (!res.ok) {
          if (res.status === 404) {
            stopPolling();
            setTriggerError('Session not found. Please try again.');
            setSessionStatus('failed');
            setIsRecalculating(false);
            return;
          }
          throw new Error('Failed to fetch session status');
        }

        const { session } = await res.json();
        setTriggerError(null);
        setSessionStatus(session.status as SessionStatus);
        setCurrentSessionId(typeof session.id === 'string' ? session.id : null);
        applySessionResults(session);

        if (session.status === 'completed' || session.status === 'failed') {
          setIsLoadingResults(false);
          setIsRecalculating(false);
        }

        if (session.status !== 'running') {
          stopPolling();
        }
      } catch (error) {
        console.error('[Task Priorities] Polling error:', error);
        setTriggerError('Lost connection while checking progress. Retrying…');
      }
    };

    poll();
    pollRef.current = setInterval(poll, POLL_INTERVAL_MS);
  };

  const handleAnalyzeTasks = async () => {
    if (!activeOutcome) {
      return;
    }

    const hasExistingPlan = prioritizedPlan !== null;

    adjustmentControllerRef.current?.abort();
    lastActiveReflectionIdsRef.current = [];
    setLatestAdjustment(null);
    setAdjustmentPerformance(null);
    setAdjustmentError(null);
    setAdjustmentWarnings([]);
    setIsInstantAdjusting(false);

    setIsTriggering(true);
    setTriggerError(null);
    setResultsError(null);
    setPlanStatusMessage(null);
    setCurrentSessionId(null);
    setHasTriggered(true);
    setBaselineCreatedAt(null);

    if (hasExistingPlan) {
      setIsRecalculating(true);
      setIsLoadingResults(false);
    } else {
      setPrioritizedPlan(null);
      setExecutionMetadata(null);
      setIsLoadingResults(true);
    }

    setCurrentSessionId(null);

    try {
      const validActiveReflectionIds = Array.from(
        new Set(activeReflectionIds.filter(id => UUID_PATTERN.test(id)))
      );

      const response = await fetch('/api/agent/prioritize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          outcome_id: activeOutcome.id,
          user_id: DEFAULT_USER_ID,
          active_reflection_ids: validActiveReflectionIds,
        }),
      });

      if (response.status === 403) {
        setTriggerError('Active outcome required for prioritization.');
        setSessionStatus('failed');
        setIsLoadingResults(false);
        return;
      }

      if (!response.ok) {
        throw new Error('Failed to start prioritization');
      }

      const data: PrioritizeResponse = await response.json();
      setBaselineReflectionIds(validActiveReflectionIds);
      setSessionStatus('running');
      setCurrentSessionId(data.session_id);
      pollSessionStatus(data.session_id);
    } catch (error) {
      console.error('[Task Priorities] Failed to trigger agent:', error);
      setTriggerError('Could not start prioritization. Please retry.');
      setSessionStatus('failed');
      setIsLoadingResults(false);
      setIsRecalculating(false);
    } finally {
      setIsTriggering(false);
    }
  };

  const isButtonDisabled =
    !activeOutcome || outcomeLoading || isTriggering || sessionStatus === 'running' || isInstantAdjusting;

  const showProgress = sessionStatus === 'running';
  const showCollapsedPrimaryCard = hasTriggered && !outcomeLoading;
  const hasPlan = prioritizedPlan !== null;
  const analyzeButtonLabel = () => {
    if (isTriggering) {
      return 'Initializing…';
    }
    if (sessionStatus === 'running') {
      return hasPlan ? 'Recalculating…' : 'Analyzing…';
    }
    return hasPlan ? 'Recalculate priorities' : 'Analyze Tasks';
  };

  const handleDiffSummary = useCallback(
    ({ hasChanges, isInitial }: { hasChanges: boolean; isInitial: boolean }) => {
      if (isInitial) {
        setPlanStatusMessage(null);
        return;
      }
      setPlanStatusMessage(hasChanges ? null : 'No changes to prioritization.');
    },
    []
  );

  useEffect(() => {
    if (!activeOutcome || prioritizedPlan || hasFetchedInitialPlan) {
      return;
    }

    let isCancelled = false;

    const loadLatestPlan = async () => {
      try {
        setIsLoadingResults(true);
        const params = new URLSearchParams({ outcomeId: activeOutcome.id, userId: DEFAULT_USER_ID });
        const response = await fetch(`/api/agent/sessions/latest?${params.toString()}`);

        if (isCancelled) {
          return;
        }

        if (response.status === 404) {
          setIsLoadingResults(false);
          setHasFetchedInitialPlan(true);
          return;
        }

        if (!response.ok) {
          throw new Error('Failed to load latest session');
        }

        const { session } = await response.json();
        if (session) {
          setSessionStatus(session.status as SessionStatus);
          setCurrentSessionId(typeof session.id === 'string' ? session.id : null);
          applySessionResults(session);
          setHasTriggered(true);
          setPlanStatusMessage(null);
        } else {
          setIsLoadingResults(false);
        }
      } catch (error) {
        if (!isCancelled) {
          console.error('[Task Priorities] Failed to load latest session:', error);
          setIsLoadingResults(false);
        }
      } finally {
        if (!isCancelled) {
          setHasFetchedInitialPlan(true);
        }
      }
    };

    loadLatestPlan();

    return () => {
      isCancelled = true;
    };
  }, [activeOutcome, prioritizedPlan, hasFetchedInitialPlan, applySessionResults]);

  // T005: Auto-expand trace on first visit
  useEffect(() => {
    if (!hasSeenTrace && prioritizedPlan && currentSessionId && executionMetadata) {
      const hasSteps = executionMetadata.steps_taken > 0;
      if (hasSteps) {
        setIsTraceExpanded(true);
        setHasSeenTrace(true);
        setIsTraceCollapsed(false);
      }
    }
  }, [hasSeenTrace, prioritizedPlan, currentSessionId, executionMetadata, setHasSeenTrace, setIsTraceCollapsed]);

  // T005: Handle manual toggle
  const handleToggleTrace = useCallback(() => {
    setIsTraceExpanded(prev => {
      const nextExpanded = !prev;
      setIsTraceCollapsed(!nextExpanded);
      return nextExpanded;
    });
  }, [setIsTraceCollapsed]);

  return (
    <div className="min-h-screen bg-muted/30">
      <MainNav />

      <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-12">
        <div className="flex flex-col gap-3 text-left">
          <h1 className="text-3xl font-semibold text-foreground">Task Priorities</h1>
          <p className="text-muted-foreground max-w-2xl">
            Trigger the autonomous agent to analyze your tasks, then work from a focused, dependency-aware list.
          </p>
        </div>

        <ContextCard
          reflections={reflections}
          isLoading={reflectionsLoading}
          error={reflectionsError}
          onAddContext={() => setReflectionPanelOpen(true)}
          onActiveReflectionsChange={handleActiveReflectionsChange}
          togglesDisabled={disableContextToggles}
          toggleDisabledLabel="Baseline plan too old (>7 days). Run a full analysis to adjust context."
          baselineAgeLabel={baselineAgeLabel}
          isBaselineStale={isBaselineStale}
          isBaselineExpired={isBaselineExpired}
          onRecalculate={handleAnalyzeTasks}
          disableRecalculate={disableRecalculate}
        />

        <Card className={showCollapsedPrimaryCard ? 'border-border/70 shadow-1layer-sm' : undefined}>
          {showCollapsedPrimaryCard ? (
            <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <CardTitle className="text-lg font-semibold">
                  {hasPlan ? 'Recalculate priorities' : 'Prioritize Tasks'}
                </CardTitle>
                <CardDescription className="flex flex-col gap-1 text-sm">
                  <span>
                    {sessionStatus === 'running'
                      ? hasPlan
                        ? 'Recalculating based on your latest changes…'
                        : 'Analyzing your task set…'
                      : sessionStatus === 'failed'
                        ? 'Last run failed. Try again when ready.'
                        : hasPlan
                          ? 'Last plan is ready. Recalculate whenever your task stack changes.'
                          : 'Run the agent to build your first prioritized list.'}
                  </span>
                  {activeOutcome && (
                    <span className="truncate text-muted-foreground">
                      Outcome: {activeOutcome.assembled_text}
                    </span>
                  )}
                </CardDescription>
              </div>
              <div className="flex items-center gap-3">
                {sessionStatus === 'running' && (
                  <Badge variant="secondary" className="gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                    In progress
                  </Badge>
                )}
                <Button onClick={handleAnalyzeTasks} disabled={isButtonDisabled}>
                  {sessionStatus === 'running' ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      {analyzeButtonLabel()}
                    </>
                  ) : isTriggering ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {analyzeButtonLabel()}
                    </>
                  ) : (
                    analyzeButtonLabel()
                  )}
                </Button>
              </div>
              {triggerError && (
                <p className="text-sm text-destructive">{triggerError}</p>
              )}
            </CardHeader>
          ) : (
            <>
              <CardHeader>
                <CardTitle>Prioritize Tasks</CardTitle>
                <CardDescription>
                  Provide the agent with your active outcome, then let it assemble a ranked task list with dependency guidance.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {fetchError && (
                  <Alert variant="destructive">
                    <AlertTitle>Unable to fetch outcome</AlertTitle>
                    <AlertDescription>{fetchError}</AlertDescription>
                  </Alert>
                )}

                {!fetchError && (
                  <div className="space-y-4">
                    {outcomeLoading ? (
                      <div className="h-16 animate-pulse rounded-lg bg-muted" />
                    ) : activeOutcome ? (
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-muted-foreground">Active Outcome</p>
                        <div className="rounded-lg border border-border bg-background px-4 py-3">
                          <p className="text-base leading-relaxed text-foreground">{activeOutcome.assembled_text}</p>
                          <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                            {activeOutcome.state_preference && (
                              <Badge variant="secondary">
                                State Preference: {activeOutcome.state_preference}
                              </Badge>
                            )}
                            {activeOutcome.daily_capacity_hours !== null && (
                              <Badge variant="outline">
                                Daily Capacity: {activeOutcome.daily_capacity_hours}h
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <Alert>
                        <AlertTitle>Active outcome required</AlertTitle>
                        <AlertDescription className="flex flex-col gap-2 text-sm">
                          <span>
                            Create an outcome before running prioritization. This provides the agent with context for ranking your tasks.
                          </span>
                          <Button asChild variant="link" className="px-0 text-base">
                            <Link href="/?openOutcome=1" prefetch>
                              Open outcome builder
                              <ExternalLink className="ml-2 inline h-4 w-4" />
                            </Link>
                          </Button>
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                )}

                <div className="flex flex-col gap-3">
                  <Button onClick={handleAnalyzeTasks} disabled={isButtonDisabled} className="w-fit">
                    {sessionStatus === 'running' ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        {analyzeButtonLabel()}
                      </>
                    ) : isTriggering ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {analyzeButtonLabel()}
                      </>
                    ) : (
                      analyzeButtonLabel()
                    )}
                  </Button>

                  {triggerError && (
                    <p className="text-sm text-destructive">{triggerError}</p>
                  )}
                </div>
              </CardContent>
            </>
          )}

          {!showCollapsedPrimaryCard && showProgress && (
            <CardContent>
              <div className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span>Analyzing tasks… This may take up to 30 seconds.</span>
              </div>
            </CardContent>
          )}

          {showCollapsedPrimaryCard && showProgress && (
            <CardContent className="pt-0">
              <div className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span>Analyzing tasks… This may take up to 30 seconds.</span>
              </div>
            </CardContent>
          )}

          {sessionStatus === 'failed' && !showProgress && triggerError && (
            <CardContent className="pt-0">
              <Alert variant="destructive">
                <AlertTitle>Prioritization failed</AlertTitle>
                <AlertDescription>{triggerError}</AlertDescription>
              </Alert>
            </CardContent>
          )}
        </Card>

        {resultsError && (
          <Alert variant="destructive">
            <AlertTitle>Unable to load prioritization results</AlertTitle>
            <AlertDescription>{resultsError}</AlertDescription>
          </Alert>
        )}

        {isLoadingResults && (
          <Card className="border-dashed border-border/70 bg-muted/40">
            <CardHeader>
              <CardTitle>Preparing prioritized list</CardTitle>
              <CardDescription>
                We will surface the updated ranking as soon as the agent finishes synthesizing dependencies.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-5 w-48" />
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton key={index} className="h-12 rounded-lg" />
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {prioritizedPlan ? (
          <>
            {isRecalculating && (
              <Alert>
                <AlertTitle>Recalculating priorities</AlertTitle>
                <AlertDescription>Hold tight while we align the list with your latest changes.</AlertDescription>
              </Alert>
            )}
            {planStatusMessage && !isRecalculating && (
              <Alert>
                <AlertDescription>{planStatusMessage}</AlertDescription>
              </Alert>
            )}
            {!planStatusMessage && !isRecalculating && !isInstantAdjusting && adjustmentPerformance && (
              <Alert>
                <AlertDescription>
                  Context adjustment completed in {Math.round(adjustmentPerformance.total_ms)}ms.
                </AlertDescription>
              </Alert>
            )}
            <TaskList
              plan={prioritizedPlan}
              executionMetadata={executionMetadata ?? undefined}
              sessionId={currentSessionId}
              planVersion={planVersion}
              outcomeId={activeOutcome?.id ?? null}
              adjustedPlan={latestAdjustment}
              onDiffSummary={handleDiffSummary}
              onToggleTrace={handleToggleTrace}
              isTraceExpanded={isTraceExpanded}
              stepCount={executionMetadata?.steps_taken ?? 0}
            />
          </>
        ) : (
          !isLoadingResults &&
          sessionStatus !== 'running' && (
            <Card className="border-dashed border-border/70 bg-muted/30">
              <CardHeader>
                <CardTitle>No prioritization results yet</CardTitle>
                <CardDescription>
                  Run the agent to generate a ranked list of your tasks along with dependencies and movement markers.
                </CardDescription>
              </CardHeader>
            </Card>
          )
        )}

        {currentSessionId && prioritizedPlan && (
          <ReasoningTracePanel
            sessionId={currentSessionId}
            open={isTraceExpanded}
            executionMetadata={executionMetadata}
            contextSummary={contextSummary}
            onTraceUnavailable={() => {
              setIsTraceExpanded(false);
              setIsTraceCollapsed(true);
            }}
          />
        )}
      </main>

      <ReflectionPanel
        isOpen={reflectionPanelOpen}
        onOpenChange={setReflectionPanelOpen}
      />
    </div>
  );
}
