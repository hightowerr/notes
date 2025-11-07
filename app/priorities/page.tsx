'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Loader2, ExternalLink, RefreshCw, Lightbulb } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { MainNav } from '@/components/main-nav';
import { TaskList } from '@/app/priorities/components/TaskList';
import { ContextCard } from '@/app/priorities/components/ContextCard';
import { ReflectionPanel } from '@/app/components/ReflectionPanel';
import { prioritizedPlanSchema } from '@/lib/schemas/prioritizedPlanSchema';
import { executionMetadataSchema } from '@/lib/schemas/executionMetadataSchema';
import { gapDetectionResponseSchema, type GapDetectionResponse } from '@/lib/schemas/gapSchema';
import type { BridgingTask } from '@/lib/schemas/bridgingTaskSchema';
import { reflectionWithWeightSchema } from '@/lib/schemas/reflectionSchema';
import type { ExecutionMetadata, PrioritizedTaskPlan } from '@/lib/types/agent';
import { adjustedPlanSchema, type AdjustedPlan } from '@/lib/types/adjustment';
import type { ReflectionWithWeight } from '@/lib/schemas/reflectionSchema';
import {
  GapDetectionModal,
  type GapSuggestionState,
  type BridgingTaskWithSelection,
  type GapAcceptanceErrorInfo,
} from '@/app/priorities/components/GapDetectionModal';
import { useReflectionShortcut } from '@/lib/hooks/useReflectionShortcut';
import { toast } from 'sonner';
import {
  integrateAcceptedTasksIntoPlan,
  type AcceptedSuggestionForPlan,
} from '@/lib/services/planIntegration';
import {
  buildDependencyOverrideEdges,
  getOutcomeDependencyOverrides,
} from '@/lib/utils/dependencyOverrides';

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

  const [isGapModalOpen, setIsGapModalOpen] = useState(false);
  const [gapAnalysisStatus, setGapAnalysisStatus] = useState<'idle' | 'detecting' | 'success' | 'error'>('idle');
  const [gapAnalysisResult, setGapAnalysisResult] = useState<GapDetectionResponse | null>(null);
  const [gapAnalysisError, setGapAnalysisError] = useState<string | null>(null);
  const [gapSuggestions, setGapSuggestions] = useState<Record<string, GapSuggestionState>>({});
  const [gapGenerationRunning, setGapGenerationRunning] = useState(false);
  const [gapGenerationProgress, setGapGenerationProgress] = useState(0);
  const [gapGenerationDurationMs, setGapGenerationDurationMs] = useState<number | null>(null);
  const [gapAnalysisRunId, setGapAnalysisRunId] = useState(0);
  const [isAcceptingGapTasks, setIsAcceptingGapTasks] = useState(false);
  const [gapAcceptanceError, setGapAcceptanceError] = useState<GapAcceptanceErrorInfo | null>(null);
  const [gapAnalysisSessionId, setGapAnalysisSessionId] = useState<string | null>(null);
  const [isSuggestingGaps, setIsSuggestingGaps] = useState(false);
  const [gapPerformanceMetrics, setGapPerformanceMetrics] = useState<{
    detection_ms: number;
    generation_ms: number;
    total_ms: number;
    search_query_count?: number;
  } | null>(null);

  const readDependencyOverrideEdges = useCallback(() => {
    if (typeof window === 'undefined') {
      return [];
    }
    const overrides = getOutcomeDependencyOverrides(activeOutcome?.id ?? null);
    return buildDependencyOverrideEdges(overrides);
  }, [activeOutcome?.id]);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reflectionsFetchRef = useRef<{ hasFetched: boolean }>({ hasFetched: false });
  const lastActiveReflectionIdsRef = useRef<string[]>([]);
  const adjustmentControllerRef = useRef<AbortController | null>(null);
  const preloadedSuggestionsRef = useRef<Record<string, GapSuggestionState> | null>(null);
  const preloadedGenerationInfoRef = useRef<{ completed: number; durationMs: number } | null>(null);

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

    // Compare against baseline, not previous render state
    const baselineIds = baselineReflectionIds.length > 0
      ? baselineReflectionIds
      : lastActiveReflectionIdsRef.current;

    const isSame =
      baselineIds.length === normalized.length &&
      baselineIds.every((id, index) => id === normalized[index]);

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
  }, [activeReflectionIds, currentSessionId, prioritizedPlan, sessionStatus, baselineReflectionIds]);

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
      const dependencyOverrideEdges = readDependencyOverrideEdges();

      const response = await fetch('/api/agent/prioritize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          outcome_id: activeOutcome.id,
          user_id: DEFAULT_USER_ID,
          active_reflection_ids: validActiveReflectionIds,
          dependency_overrides: dependencyOverrideEdges,
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
      lastActiveReflectionIdsRef.current = validActiveReflectionIds;
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

  const isGeneratingGaps = gapGenerationRunning;

  const analyzeButtonHelper = useMemo(() => {
    if (sessionStatus === 'running') {
      return 'Task analysis is currently running. You can monitor progress below.';
    }
    if (isTriggering) {
      return 'Initializing prioritization… this only takes a moment.';
    }
    if (isInstantAdjusting) {
      return 'Finish applying instant adjustments before running a new analysis.';
    }
    if (!activeOutcome && !outcomeLoading) {
      return 'Create an active outcome to unlock prioritization.';
    }
    if (outcomeLoading) {
      return 'Loading your active outcome…';
    }
    return null;
  }, [activeOutcome, outcomeLoading, isInstantAdjusting, isTriggering, sessionStatus]);

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

  const handleDetectGaps = useCallback(async () => {
    const openModalWithError = (message: string) => {
      setGapAnalysisStatus('error');
      setGapAnalysisError(message);
      setGapAnalysisResult(null);
      setGapSuggestions({});
      setGapGenerationRunning(false);
      setGapGenerationProgress(0);
      setGapGenerationDurationMs(null);
      setGapAcceptanceError(null);
      setIsAcceptingGapTasks(false);
      setIsGapModalOpen(true);
    };

    if (!prioritizedPlan) {
      openModalWithError('Run prioritization to generate a task plan before detecting gaps.');
      return;
    }

    if (!currentSessionId) {
      openModalWithError('Active prioritization session not found. Run the analysis again to detect gaps.');
      return;
    }

    const uniqueTaskIds = Array.from(new Set(prioritizedPlan.ordered_task_ids));
    if (uniqueTaskIds.length < 2) {
      openModalWithError('At least two tasks are required to analyze gaps.');
      return;
    }

    setGapAnalysisStatus('detecting');
    setGapAnalysisError(null);
    setGapAnalysisResult(null);
    setGapSuggestions({});
    setGapGenerationRunning(false);
    setGapGenerationProgress(0);
    setGapGenerationDurationMs(null);
    setGapAcceptanceError(null);
    setIsAcceptingGapTasks(false);
    setIsGapModalOpen(true);
    setIsSuggestingGaps(true);
    setGapPerformanceMetrics(null);

    try {
      const response = await fetch('/api/agent/suggest-gaps', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_id: currentSessionId,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        const message =
          typeof errorBody?.error === 'string'
            ? errorBody.error
            : 'Unable to analyze gaps. Please try again.';
        throw new Error(message);
      }

      const payload = await response.json();
      const parsedResult = gapDetectionResponseSchema.safeParse({
        gaps: payload.gaps,
        metadata: payload.metadata,
      });

      if (!parsedResult.success) {
        throw new Error('Invalid response from gap analysis service.');
      }

      const detectionData = parsedResult.data;

      if (typeof payload.analysis_session_id === 'string') {
        setGapAnalysisSessionId(payload.analysis_session_id);
      } else {
        setGapAnalysisSessionId(null);
      }

      const suggestionEntries = Array.isArray(payload.suggestions) ? payload.suggestions : [];

      const metrics = payload.generation_metrics;
      const performanceSource =
        (payload.performance_metrics && typeof payload.performance_metrics === 'object'
          ? payload.performance_metrics
          : null) ??
        (metrics && typeof metrics === 'object' ? metrics : null);
      if (performanceSource) {
        const detectionMs = Number(
          (performanceSource as { detection_ms?: unknown }).detection_ms ?? 0
        );
        const generationMs = Number(
          (performanceSource as { generation_ms?: unknown }).generation_ms ?? 0
        );
        const totalMs = Number(
          (performanceSource as { total_ms?: unknown }).total_ms ?? detectionMs + generationMs
        );
        const searchQueryCount = Number(
          (performanceSource as { search_query_count?: unknown }).search_query_count ??
            suggestionEntries.length
        );
        setGapPerformanceMetrics({
          detection_ms: Number.isFinite(detectionMs) ? detectionMs : 0,
          generation_ms: Number.isFinite(generationMs) ? generationMs : 0,
          total_ms: Number.isFinite(totalMs) ? totalMs : Math.max(detectionMs + generationMs, 0),
          search_query_count: Number.isFinite(searchQueryCount) ? searchQueryCount : undefined,
        });
      } else {
        setGapPerformanceMetrics(null);
      }

      if (suggestionEntries.length > 0) {
        const suggestionMap: Record<string, GapSuggestionState> = {};

        detectionData.gaps.forEach(gap => {
          const entry = suggestionEntries.find(
            (candidate: unknown): candidate is Record<string, unknown> =>
              !!candidate && typeof candidate === 'object' && 'gap_id' in candidate && (candidate as { gap_id?: unknown }).gap_id === gap.id
          );

          if (!entry) {
            suggestionMap[gap.id] = {
              gap,
              status: 'loading',
              tasks: [],
            };
            return;
          }

          const rawStatus = typeof entry.status === 'string' ? entry.status : 'error';
          let status: GapSuggestionState['status'] = 'error';
          if (rawStatus === 'success') {
            status = 'success';
          } else if (rawStatus === 'requires_examples') {
            status = 'requires_examples';
          } else if (rawStatus === 'error') {
            status = 'error';
          }

          const tasks: BridgingTaskWithSelection[] =
            status === 'success' && Array.isArray(entry.tasks)
              ? (entry.tasks as BridgingTask[]).map(task => ({
                  ...task,
                  checked: true,
                }))
              : [];

          const metadataValue =
            status === 'success' && entry.metadata && typeof entry.metadata === 'object'
              ? {
                  search_results_count: Number(
                    (entry.metadata as { search_results_count?: unknown }).search_results_count ?? 0
                  ),
                  generation_duration_ms: Number(
                    (entry.metadata as { generation_duration_ms?: unknown }).generation_duration_ms ?? 0
                  ),
                }
              : undefined;

          suggestionMap[gap.id] = {
            gap,
            status,
            tasks,
            ...(metadataValue ? { metadata: metadataValue } : {}),
            ...(typeof entry.error === 'string' ? { error: entry.error } : {}),
            ...(entry.requires_manual_examples
              ? { requiresManualExamples: Boolean(entry.requires_manual_examples) }
              : {}),
          };
        });

        preloadedSuggestionsRef.current = suggestionMap;

        const metrics = payload.generation_metrics;
        const durationMs =
          metrics && typeof metrics.total_ms === 'number'
            ? Math.max(0, Math.round(metrics.total_ms))
            : 0;

        preloadedGenerationInfoRef.current = {
          completed: detectionData.gaps.length,
          durationMs,
        };
      } else {
        preloadedSuggestionsRef.current = null;
        preloadedGenerationInfoRef.current = null;
      }

      setGapAnalysisResult(detectionData);
      setGapAnalysisStatus('success');
      setGapAnalysisError(null);
      setGapAnalysisRunId(prev => prev + 1);
    } catch (error) {
      console.error('[Task Priorities] Gap detection failed:', error);
      setGapAnalysisStatus('error');
      const rawMessage = error instanceof Error ? error.message : '';
      const fallbackMessage = 'Unable to generate suggestions. Please try again.';
      const shouldUseFallback =
        !rawMessage ||
        /ai service error/i.test(rawMessage) ||
        /task generation failed/i.test(rawMessage) ||
        /failed to fetch/i.test(rawMessage);
      const resolvedMessage = shouldUseFallback ? fallbackMessage : rawMessage;
      setGapAnalysisError(resolvedMessage);
      setGapAnalysisResult(null);
      setGapAnalysisSessionId(null);
      setGapSuggestions({});
      setGapGenerationProgress(0);
      setGapGenerationDurationMs(null);
      preloadedSuggestionsRef.current = null;
      preloadedGenerationInfoRef.current = null;
      setGapPerformanceMetrics(null);
      setGapGenerationRunning(false);
    } finally {
      setIsSuggestingGaps(false);
    }
  }, [currentSessionId, prioritizedPlan]);

  const handleRetryGapAnalysis = useCallback(() => {
    void handleDetectGaps();
  }, [handleDetectGaps]);

  useEffect(() => {
    if (!isGapModalOpen) {
      return;
    }

    if (gapAnalysisStatus !== 'success' || !gapAnalysisResult) {
      if (gapAnalysisStatus !== 'detecting') {
        setGapGenerationRunning(false);
      }
      return;
    }

    const preloadedSuggestions = preloadedSuggestionsRef.current;
    if (
      preloadedSuggestions &&
      Object.keys(preloadedSuggestions).length === gapAnalysisResult.gaps.length
    ) {
      preloadedSuggestionsRef.current = null;
      setGapSuggestions(preloadedSuggestions);
      setGapAcceptanceError(null);
      setIsAcceptingGapTasks(false);
      setGapGenerationRunning(false);

      const generationInfo = preloadedGenerationInfoRef.current;
      if (generationInfo) {
        setGapGenerationProgress(generationInfo.completed);
        setGapGenerationDurationMs(generationInfo.durationMs);
      } else {
        setGapGenerationProgress(gapAnalysisResult.gaps.length);
        setGapGenerationDurationMs(0);
      }
      preloadedGenerationInfoRef.current = null;
      return;
    }

    if (preloadedSuggestionsRef.current) {
      preloadedSuggestionsRef.current = null;
      preloadedGenerationInfoRef.current = null;
    }

    if (gapAnalysisResult.gaps.length === 0) {
      setGapSuggestions({});
      setGapGenerationRunning(false);
      setGapGenerationProgress(0);
    setGapGenerationDurationMs(0);
    return;
  }

    const initialSuggestions: Record<string, GapSuggestionState> = {};
    gapAnalysisResult.gaps.forEach(gap => {
      initialSuggestions[gap.id] = {
        gap,
        status: 'loading',
        tasks: [],
      };
    });
  setGapSuggestions(initialSuggestions);
  setGapAcceptanceError(null);
  setIsAcceptingGapTasks(false);
  setGapGenerationRunning(true);
  setGapGenerationProgress(0);
  setGapGenerationDurationMs(null);

  let cancelled = false;
  const outcomeStatement = activeOutcome?.assembled_text ?? null;
  const totalGaps = gapAnalysisResult.gaps.length;
  const generationStart = Date.now();

    (async () => {
      await Promise.all(
        gapAnalysisResult.gaps.map(async gap => {
          try {
            const response = await fetch('/api/gaps/generate', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                gap_id: gap.id,
                predecessor_task_id: gap.predecessor_task_id,
                successor_task_id: gap.successor_task_id,
                outcome_statement: outcomeStatement ?? undefined,
              }),
            });

            if (!response.ok) {
              const errorBody = await response.json().catch(() => null);

              // T004: Handle zero-result case requiring manual examples
              if (response.status === 422 && errorBody?.code === 'REQUIRES_MANUAL_EXAMPLES') {
                if (cancelled) {
                  return;
                }
                setGapSuggestions(prev => ({
                  ...prev,
                  [gap.id]: {
                    gap,
                    status: 'requires_examples',
                    tasks: [],
                    requiresManualExamples: true,
                    error: errorBody.error ?? 'No similar tasks found. Manual examples required.',
                  },
                }));
                return;
              }

              const message =
                typeof errorBody?.error === 'string'
                  ? errorBody.error
                  : 'Unable to generate bridging tasks for this gap.';
              throw new Error(message);
            }

            const data = await response.json();

            if (cancelled) {
              return;
            }

            const tasks: BridgingTaskWithSelection[] = (data.bridging_tasks ?? []).map(
              (task: BridgingTask) => ({
                ...task,
                checked: true,
              })
            );

            setGapSuggestions(prev => ({
              ...prev,
              [gap.id]: {
                gap,
                status: 'success',
                tasks,
                metadata: {
                  search_results_count: data.search_results_count ?? 0,
                  generation_duration_ms: data.generation_duration_ms ?? 0,
                },
              },
            }));
          } catch (error) {
            if (cancelled) {
              return;
            }
            setGapSuggestions(prev => ({
              ...prev,
              [gap.id]: {
                gap,
                status: 'error',
                tasks: [],
                error:
                  error instanceof Error
                    ? error.message
                    : 'Failed to generate bridging tasks.',
              },
            }));
          } finally {
            if (!cancelled) {
              setGapGenerationProgress(prev => {
                const next = prev + 1;
                return next > totalGaps ? totalGaps : next;
              });
            }
          }
        })
      );

      if (!cancelled) {
        setGapGenerationRunning(false);
        setGapGenerationDurationMs(Math.max(0, Date.now() - generationStart));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    activeOutcome?.assembled_text,
    gapAnalysisResult,
    gapAnalysisRunId,
    gapAnalysisStatus,
    isGapModalOpen,
  ]);

  const handleToggleGeneratedTask = useCallback(
    (gapId: string, taskId: string, checked: boolean) => {
      setGapAcceptanceError(null);
      setGapSuggestions(prev => {
        const current = prev[gapId];
        if (!current) {
          return prev;
        }

        return {
          ...prev,
          [gapId]: {
            ...current,
            tasks: current.tasks.map(task =>
              task.id === taskId ? { ...task, checked } : task
            ),
          },
        };
      });
    },
    []
  );

  const handleEditGeneratedTask = useCallback(
    (
      gapId: string,
      taskId: string,
      updates: Pick<Partial<BridgingTask>, 'edited_task_text' | 'edited_estimated_hours'>
    ) => {
      setGapAcceptanceError(null);
      setGapSuggestions(prev => {
        const current = prev[gapId];
        if (!current) {
          return prev;
        }

        return {
          ...prev,
          [gapId]: {
            ...current,
            tasks: current.tasks.map(task => {
              if (task.id !== taskId) {
                return task;
              }

              const nextTask: BridgingTaskWithSelection = { ...task };

              if (
                'edited_task_text' in updates &&
                typeof updates.edited_task_text === 'string'
              ) {
                const nextText = updates.edited_task_text;
                nextTask.edited_task_text = nextText;
                const trimmed = nextText.trim();
                if (trimmed === task.task_text) {
                  nextTask.edited_task_text = undefined;
                }
              }

              if ('edited_estimated_hours' in updates && typeof updates.edited_estimated_hours === 'number') {
                const nextHours = updates.edited_estimated_hours;
                nextTask.edited_estimated_hours =
                  Number.isInteger(nextHours) && nextHours !== task.estimated_hours
                    ? nextHours
                    : undefined;
              }

              return nextTask;
            }),
          },
        };
      });
    },
    []
  );

  const gapSuggestionList = useMemo(() => Object.values(gapSuggestions), [gapSuggestions]);

  // T004: Handle retry with manual examples
  const handleRetryWithExamples = useCallback(async (gapId: string, examples: string[]) => {
    const suggestion = gapSuggestions[gapId];
    if (!suggestion) {
      return;
    }

    const gap = suggestion.gap;
    const outcomeStatement = activeOutcome?.assembled_text ?? null;

    // Set back to loading state
    setGapSuggestions(prev => ({
      ...prev,
      [gapId]: {
        ...prev[gapId]!,
        status: 'loading',
        tasks: [],
      },
    }));

    try {
      const response = await fetch('/api/gaps/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          gap_id: gap.id,
          predecessor_task_id: gap.predecessor_task_id,
          successor_task_id: gap.successor_task_id,
          outcome_statement: outcomeStatement ?? undefined,
          manual_examples: examples,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        const message =
          typeof errorBody?.error === 'string'
            ? errorBody.error
            : 'Unable to generate bridging tasks for this gap.';
        throw new Error(message);
      }

      const data = await response.json();

      const tasks: BridgingTaskWithSelection[] = (data.bridging_tasks ?? []).map(
        (task: BridgingTask) => ({
          ...task,
          checked: true,
        })
      );

      setGapSuggestions(prev => ({
        ...prev,
        [gapId]: {
          gap,
          status: 'success',
          tasks,
          metadata: {
            search_results_count: data.search_results_count ?? 0,
            generation_duration_ms: data.generation_duration_ms ?? 0,
          },
        },
      }));
    } catch (error) {
      console.error('[Task Priorities] Failed to generate with examples:', error);
      setGapSuggestions(prev => ({
        ...prev,
        [gapId]: {
          gap,
          status: 'error',
          tasks: [],
          error:
            error instanceof Error
              ? error.message
              : 'Failed to generate bridging tasks with examples.',
        },
      }));
    }
  }, [gapSuggestions, activeOutcome?.assembled_text]);

  // T004: Handle skip manual examples (generate with lower confidence)
  const handleSkipExamples = useCallback(async (gapId: string) => {
    const suggestion = gapSuggestions[gapId];
    if (!suggestion) {
      return;
    }

    const gap = suggestion.gap;
    const outcomeStatement = activeOutcome?.assembled_text ?? null;

    // Set back to loading state
    setGapSuggestions(prev => ({
      ...prev,
      [gapId]: {
        ...prev[gapId]!,
        status: 'loading',
        tasks: [],
      },
    }));

    try {
      const response = await fetch('/api/gaps/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          gap_id: gap.id,
          predecessor_task_id: gap.predecessor_task_id,
          successor_task_id: gap.successor_task_id,
          outcome_statement: outcomeStatement ?? undefined,
          // No manual_examples, but allow generation anyway (service will accept empty search results)
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        const message =
          typeof errorBody?.error === 'string'
            ? errorBody.error
            : 'Unable to generate bridging tasks for this gap.';
        throw new Error(message);
      }

      const data = await response.json();

      const tasks: BridgingTaskWithSelection[] = (data.bridging_tasks ?? []).map(
        (task: BridgingTask) => ({
          ...task,
          checked: true,
        })
      );

      setGapSuggestions(prev => ({
        ...prev,
        [gapId]: {
          gap,
          status: 'success',
          tasks,
          metadata: {
            search_results_count: data.search_results_count ?? 0,
            generation_duration_ms: data.generation_duration_ms ?? 0,
          },
        },
      }));
    } catch (error) {
      console.error('[Task Priorities] Failed to skip examples:', error);
      setGapSuggestions(prev => ({
        ...prev,
        [gapId]: {
          gap,
          status: 'error',
          tasks: [],
          error:
            error instanceof Error
              ? error.message
              : 'Failed to generate bridging tasks.',
        },
      }));
    }
  }, [gapSuggestions, activeOutcome?.assembled_text]);

  const handleAcceptSelectedTasks = useCallback(async () => {
    if (isAcceptingGapTasks) {
      return;
    }

    const selectedEntries = gapSuggestionList.flatMap(suggestion => {
      if (suggestion.status !== 'success') {
        return [] as Array<{ gap: Gap; task: BridgingTaskWithSelection }>;
      }
      return suggestion.tasks
        .filter(task => task.checked)
        .map(task => ({ gap: suggestion.gap, task }));
    });

    if (selectedEntries.length === 0) {
      setGapAcceptanceError({ message: 'Select at least one suggested task to accept.' });
      return;
    }

    if (!gapAnalysisSessionId) {
      setGapAcceptanceError({
        message:
          'Gap analysis session expired. Run "Find Missing Tasks" again before accepting suggestions.',
      });
      return;
    }

    if (!currentSessionId) {
      setGapAcceptanceError({
        message:
          'Active prioritization session missing. Rerun prioritization before accepting suggestions.',
      });
      return;
    }

    setGapAcceptanceError(null);
    setIsAcceptingGapTasks(true);

    const acceptedForPlan: AcceptedSuggestionForPlan[] = selectedEntries.map(entry => ({
      task: entry.task,
      gap: {
        predecessor_task_id: entry.gap.predecessor_task_id,
        successor_task_id: entry.gap.successor_task_id,
      },
      finalText: (entry.task.edited_task_text ?? entry.task.task_text).trim(),
      finalHours: entry.task.edited_estimated_hours ?? entry.task.estimated_hours,
    }));

    const payload = selectedEntries.map(entry => {
      const { task, gap } = entry;
      const { checked: _unusedChecked, ...rest } = task;
      void _unusedChecked;
      const baseTask = rest as BridgingTask;
      const trimmedEdit = baseTask.edited_task_text?.trim();
      const normalizedTask: BridgingTask = {
        ...baseTask,
        edited_task_text:
          trimmedEdit && trimmedEdit !== baseTask.task_text ? trimmedEdit : undefined,
        edited_estimated_hours:
          typeof baseTask.edited_estimated_hours === 'number' &&
          baseTask.edited_estimated_hours !== baseTask.estimated_hours
            ? baseTask.edited_estimated_hours
            : undefined,
      };

      return {
        task: normalizedTask,
        predecessor_id: gap.predecessor_task_id,
        successor_id: gap.successor_task_id,
      };
    });

    try {
      const response = await fetch('/api/gaps/accept', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          analysis_session_id: gapAnalysisSessionId,
          agent_session_id: currentSessionId,
          accepted_tasks: payload,
        }),
      });

      // Log the raw response for debugging
      console.log('[GapAcceptance] Response status:', response.status, response.statusText);

      let rawBody: unknown = null;
      try {
        const text = await response.text();
        console.log('[GapAcceptance] Response body:', text.substring(0, 500));
        rawBody = text ? JSON.parse(text) : null;
      } catch (parseError) {
        console.error('[GapAcceptance] Failed to parse response as JSON:', parseError);
        setGapAcceptanceError({
          message: `Server returned invalid response (status ${response.status}). Check browser console for details.`,
        });
        return;
      }

      const parsedBody =
        rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody)
          ? (rawBody as Record<string, unknown>)
          : null;
      const responseBody: Record<string, unknown> = parsedBody ?? {};

      if (!response.ok) {
        const validationErrorsValue = responseBody['validation_errors'];
        const validationErrors = Array.isArray(validationErrorsValue)
          ? validationErrorsValue.filter((item): item is string => typeof item === 'string')
          : [];
        const message =
          typeof responseBody['error'] === 'string'
            ? (responseBody['error'] as string)
            : `Request failed with status ${response.status}`;
        const code =
          typeof responseBody['code'] === 'string' ? (responseBody['code'] as string) : undefined;
        setGapAcceptanceError({
          message,
          details: validationErrors.length > 0 ? validationErrors : undefined,
          code,
        });
        return;
      }

      let nextPlan: PrioritizedTaskPlan | null = null;
      const updatedPlanCandidate = responseBody['updated_plan'];
      if (updatedPlanCandidate) {
        const parsedPlan = prioritizedPlanSchema.safeParse(updatedPlanCandidate);
        if (parsedPlan.success) {
          nextPlan = parsedPlan.data;
        } else {
          console.warn('[GapAcceptance] Updated plan failed validation, falling back to client integration', parsedPlan.error.flatten());
        }
      }

      if (!nextPlan && prioritizedPlan) {
        nextPlan = integrateAcceptedTasksIntoPlan(prioritizedPlan, acceptedForPlan);
      }

      if (!nextPlan) {
        setGapAcceptanceError({
          message:
            'Server response missing updated plan. Refresh the page or rerun prioritization.',
        });
        return;
      }

      setGapAcceptanceError(null);
      setIsGapModalOpen(false);
      setGapAnalysisStatus('idle');
      setGapAnalysisResult(null);
      setGapGenerationRunning(false);
      setGapSuggestions({});

      setPrioritizedPlan(nextPlan);
      setPlanVersion(prev => prev + 1);
      setGapAnalysisSessionId(
        typeof responseBody['gap_analysis_session_id'] === 'string'
          ? (responseBody['gap_analysis_session_id'] as string)
          : null
      );

      // Show success toast with cycle resolution info
      const taskCount = acceptedForPlan.length;
      const cyclesResolvedValue = responseBody['cycles_resolved'];
      const cyclesResolved =
        typeof cyclesResolvedValue === 'number' && Number.isFinite(cyclesResolvedValue)
          ? cyclesResolvedValue
          : 0;

      if (cyclesResolved > 0) {
        toast.success(
          `${taskCount} task${taskCount === 1 ? '' : 's'} added successfully`,
          {
            description: `Automatically resolved ${cyclesResolved} circular ${cyclesResolved === 1 ? 'dependency' : 'dependencies'} to maintain task graph integrity.`,
            duration: 6000,
          }
        );
      } else {
        toast.success(
          `${taskCount} task${taskCount === 1 ? '' : 's'} added successfully`,
          {
            description: 'Your task plan has been updated with the new bridging tasks.',
            duration: 4000,
          }
        );
      }
    } catch (error) {
      console.error('[Task Priorities] Failed to accept bridging tasks:', error);
      setGapAcceptanceError({ message: 'Unable to accept bridging tasks. Please try again later.' });
    } finally {
      setIsAcceptingGapTasks(false);
    }
  }, [
    gapSuggestionList,
    isAcceptingGapTasks,
    gapAnalysisSessionId,
    currentSessionId,
    prioritizedPlan,
  ]);

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

          // Initialize ref with currently active reflections to prevent immediate adjustment
          const currentlyActive = reflections
            .filter(r => r.is_active_for_prioritization && UUID_PATTERN.test(r.id))
            .map(r => r.id);
          lastActiveReflectionIdsRef.current = currentlyActive;
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
  }, [activeOutcome, prioritizedPlan, hasFetchedInitialPlan, applySessionResults, reflections]);

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
                      <div className="space-y-3 rounded-xl border border-primary/40 bg-primary/5 p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="space-y-1">
                            <p className="text-sm font-semibold text-primary">Active outcome required</p>
                            <p className="text-sm text-muted-foreground">
                              Create an outcome so the agent knows what you&apos;re working toward before ranking tasks.
                            </p>
                          </div>
                          <Button asChild className="sm:w-auto">
                            <Link href="/?openOutcome=1" prefetch>
                              Open outcome builder
                              <ExternalLink className="ml-2 h-4 w-4" />
                            </Link>
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Outcomes establish the focus, guardrails, and time expectations the prioritization run uses to build your plan.
                        </p>
                      </div>
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

                  {analyzeButtonHelper && (
                    <p className="text-xs text-muted-foreground">
                      {analyzeButtonHelper}
                    </p>
                  )}

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
              planVersion={planVersion}
              outcomeId={activeOutcome?.id ?? null}
              outcomeStatement={activeOutcome?.assembled_text ?? null}
              adjustedPlan={latestAdjustment}
              onDiffSummary={handleDiffSummary}
            />
            <div className="mt-6 flex justify-end">
              <Button
                onClick={handleDetectGaps}
                disabled={isSuggestingGaps || !prioritizedPlan}
              >
                {isSuggestingGaps ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Analyzing…
                  </>
                ) : (
                  <>
                    <Lightbulb className="mr-2 h-4 w-4" />
                    Find Missing Tasks
                  </>
                )}
              </Button>
            </div>
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
        <GapDetectionModal
          open={isGapModalOpen}
          onOpenChange={setIsGapModalOpen}
          detectionStatus={gapAnalysisStatus}
          detectionError={gapAnalysisError}
          detectionResult={gapAnalysisResult}
          suggestions={gapSuggestionList}
          isGenerating={isGeneratingGaps}
          onToggleTask={handleToggleGeneratedTask}
          onEditTask={handleEditGeneratedTask}
          onRetryWithExamples={handleRetryWithExamples}
          onSkipExamples={handleSkipExamples}
          onRetryGeneration={handleSkipExamples} // T005: Reuse skip examples for manual retry
          onAcceptSelected={handleAcceptSelectedTasks}
          isAccepting={isAcceptingGapTasks}
          acceptError={gapAcceptanceError}
          generationProgress={gapGenerationProgress}
          generationDurationMs={gapGenerationDurationMs}
          onRetryAnalysis={handleRetryGapAnalysis}
          performanceMetrics={gapPerformanceMetrics}
        />
      </main>

      <ReflectionPanel
        isOpen={reflectionPanelOpen}
        onOpenChange={setReflectionPanelOpen}
      />
    </div>
  );
}
