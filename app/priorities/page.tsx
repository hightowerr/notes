'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Loader2, ExternalLink, RefreshCw, Lightbulb } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { MainNav } from '@/components/main-nav';
import { TaskList } from '@/app/priorities/components/TaskList';
import type { QuadrantVizTask } from '@/app/priorities/components/QuadrantViz';
import { QuadrantViz } from '@/app/priorities/components/QuadrantViz';
import { ContextCard } from '@/app/priorities/components/ContextCard';
import { ExcludedTasksSection } from '@/app/priorities/components/ExcludedTasksSection';
import {
  QualitySurvey,
  nextSurveyStateAfterRun,
  type SurveyRating,
  type SurveyState,
} from '@/app/priorities/components/QualitySurvey';
import { ReflectionPanel, type ReflectionAddedResult } from '@/app/components/ReflectionPanel';
import { prioritizedPlanSchema } from '@/lib/schemas/prioritizedPlanSchema';
import { executionMetadataSchema } from '@/lib/schemas/executionMetadataSchema';
import { gapDetectionResponseSchema, type GapDetectionResponse } from '@/lib/schemas/gapSchema';
import type { BridgingTask } from '@/lib/schemas/bridgingTaskSchema';
import { reflectionWithWeightSchema } from '@/lib/schemas/reflectionSchema';
import type { ExecutionMetadata, PrioritizedTaskPlan } from '@/lib/types/agent';
import { adjustedPlanSchema, type AdjustedPlan } from '@/lib/types/adjustment';
import type { Reflection, ReflectionWithWeight } from '@/lib/schemas/reflectionSchema';
import { StrategicScoresMapSchema, type StrategicScoresMap } from '@/lib/schemas/strategicScore';
import type { SortingStrategy } from '@/lib/schemas/sortingStrategy';
import type { RetryStatusEntry } from '@/lib/schemas/retryStatus';
import { useScrollToTask } from '@/app/priorities/components/useScrollToTask';
import { formatTaskId } from '@/app/priorities/utils/formatTaskId';
import { hybridLoopMetadataSchema, type HybridLoopMetadata } from '@/lib/schemas/hybridLoopMetadataSchema';
import ReasoningChain from '@/app/priorities/components/ReasoningChain';
import ErrorBanner from '@/app/components/ErrorBanner';
import type { DocumentStatusResponse } from '@/lib/schemas/documentStatus';
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
  calculateRecencyWeight,
  enrichReflection,
  formatRelativeTime,
  normalizeReflectionFromUnknown,
} from '@/lib/services/reflectionService';
import type { ReflectionEffect } from '@/lib/services/reflectionAdjuster';
import {
  buildDependencyOverrideEdges,
  getOutcomeDependencyOverrides,
} from '@/lib/utils/dependencyOverrides';
import { usePrioritizationStream } from '@/lib/hooks/usePrioritizationStream';
import { OutcomeCard } from '@/app/priorities/components/OutcomeCard';
import { SourceDocuments } from '@/app/priorities/components/SourceDocuments';
import { useDocumentStatus } from '@/lib/hooks/useDocumentStatus';
import { useDocumentExclusions } from '@/lib/hooks/useDocumentExclusions';
import { DiscardPileSection } from '@/app/priorities/components/DiscardPileSection';

const DEFAULT_USER_ID = 'default-user';
const POLL_INTERVAL_MS = 2000;
// 2s strike a balance: quick enough for reactive UI, light enough for Supabase/API load
const METADATA_POLL_INTERVAL_MS = 2000;
const MAX_SESSION_DURATION_MS = 120_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DOCUMENT_PAGE_SIZE = 50;
const MINUTE_IN_MS = 60 * 1000;
const HOUR_IN_MS = 60 * 60 * 1000;
const DAY_IN_MS = 24 * HOUR_IN_MS;
const WEEK_IN_MS = 7 * DAY_IN_MS;
const HIGHLIGHT_CLASSES = ['ring-amber-400/60', 'ring-4', 'ring-offset-2', 'ring-offset-background'];
const REFLECTION_SURVEY_STORAGE_KEY = 'reflection-quality-survey';

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
  strategic_scores?: StrategicScoresMap;
};

export default function TaskPrioritiesPage() {
  const searchParams = useSearchParams();
  const debugMode = searchParams?.get('debug') === 'true';
  const [outcomeLoading, setOutcomeLoading] = useState(true);
  const [activeOutcome, setActiveOutcome] = useState<OutcomeResponse | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [showOutcomePrompt, setShowOutcomePrompt] = useState(true);
  const [showQualitySurvey, setShowQualitySurvey] = useState(false);
  const [isSurveySubmitting, setIsSurveySubmitting] = useState(false);

  const [sessionStatus, setSessionStatus] = useState<SessionStatus>('idle');
  const [triggerError, setTriggerError] = useState<string | null>(null);
  const [isTriggering, setIsTriggering] = useState(false);

  const [prioritizedPlan, setPrioritizedPlan] = useState<PrioritizedTaskPlan | null>(null);
const [executionMetadata, setExecutionMetadata] = useState<ExecutionMetadata | null>(null);
const [evaluationMetadata, setEvaluationMetadata] = useState<HybridLoopMetadata | null>(null);
  const [resultsError, setResultsError] = useState<string | null>(null);
  const [isLoadingResults, setIsLoadingResults] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [hasTriggered, setHasTriggered] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [planVersion, setPlanVersion] = useState(0);
  const [prioritizationError, setPrioritizationError] = useState<string | null>(null);
  const [prioritizationRetryCount, setPrioritizationRetryCount] = useState(0);
  const [strategicScores, setStrategicScores] = useState<StrategicScoresMap | null>(null);
  const [retryStatuses, setRetryStatuses] = useState<Record<string, RetryStatusEntry>>({});
  const [sortingStrategy, setSortingStrategy] = useState<SortingStrategy>('balanced');
  const [taskMetadata, setTaskMetadata] = useState<Record<string, { title: string }>>({});
  const [planStatusMessage, setPlanStatusMessage] = useState<string | null>(null);
  const [isSessionStreamConnected, setSessionStreamConnected] = useState(false);
  const sessionStreamFailuresRef = useRef(0);
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
  const [documentIdsForExclusions, setDocumentIdsForExclusions] = useState<string[] | undefined>(undefined);
  const [documentOffset, setDocumentOffset] = useState(0);
  const [documentStatus, setDocumentStatus] = useState<DocumentStatusResponse | null>(null);
  const { excludedIds, toggleExclusion, setExcludedIds } = useDocumentExclusions(
    activeOutcome?.id ?? null,
    { validDocumentIds: documentIdsForExclusions }
  );
  const showContextCard = false;
  const {
    progressPct: prioritizationProgress,
    connectionState: streamConnectionState,
    partialPlan: streamedPlan,
    stage: streamStage,
  } = usePrioritizationStream(currentSessionId);
  const {
    data: documentStatusPage,
    isLoading: documentStatusLoading,
    error: documentStatusError,
    refresh: refreshDocumentStatus,
  } = useDocumentStatus({
    outcomeId: activeOutcome?.id ?? null,
    excludedIds,
    limit: DOCUMENT_PAGE_SIZE,
    offset: documentOffset,
    enabled: Boolean(activeOutcome && !outcomeLoading),
  });
  useEffect(() => {
    if (!documentStatusPage) {
      return;
    }

    setDocumentStatus(prev => {
      if (documentOffset === 0 || !prev) {
        return documentStatusPage;
      }

      const mergedDocuments = [...prev.documents];
      documentStatusPage.documents.forEach(doc => {
        const existingIndex = mergedDocuments.findIndex(item => item.id === doc.id);
        if (existingIndex === -1) {
          mergedDocuments.push(doc);
        } else {
          mergedDocuments[existingIndex] = doc;
        }
      });

      const total = documentStatusPage.total ?? mergedDocuments.length;

      return {
        documents: mergedDocuments,
        summary: documentStatusPage.summary,
        total,
      };
    });
  }, [documentStatusPage, documentOffset]);
  useEffect(() => {
    if (!documentStatus?.documents) {
      setDocumentIdsForExclusions(undefined);
      return;
    }
    const ids = documentStatus.documents.map(doc => doc.id);
    setDocumentIdsForExclusions(ids);
  }, [documentStatus]);
  const exclusionsKey = useMemo(() => excludedIds.join(','), [excludedIds]);
  useEffect(() => {
    setDocumentOffset(0);
    setDocumentStatus(null);
  }, [activeOutcome?.id, exclusionsKey]);
  const lastStreamSignatureRef = useRef<string | null>(null);
  const completionTime = prioritizedPlan?.created_at ? new Date(prioritizedPlan.created_at) : undefined;
  const evaluationWasTriggered = evaluationMetadata?.evaluation_triggered;
  const scorePollingHaltedRef = useRef(false);
  const surveyStateRef = useRef<SurveyState>({
    runCount: 0,
    lastShownAt: null,
    dontShowAgain: false,
  });
  const lastSessionStatusRef = useRef<SessionStatus | null>(null);
  const hasStrategicScores = useMemo(() => {
    if (!strategicScores) {
      return false;
    }
    return Object.keys(strategicScores).length > 0;
  }, [strategicScores]);
  const scrollToTaskFromViz = useScrollToTask();
  const handleTaskMetadataUpdate = useCallback(
    (metadata: Record<string, { title: string }>) => {
      setTaskMetadata(metadata);
    },
    []
  );

  const getSurveyState = useCallback((): SurveyState => {
    const fallback = surveyStateRef.current ?? {
      runCount: 0,
      lastShownAt: null,
      dontShowAgain: false,
    };

    if (typeof window === 'undefined') {
      return fallback;
    }

    try {
      const raw = window.localStorage.getItem(REFLECTION_SURVEY_STORAGE_KEY);
      if (!raw) {
        return fallback;
      }
      const parsed = JSON.parse(raw) as Partial<SurveyState>;
      return {
        runCount: typeof parsed.runCount === 'number' && Number.isFinite(parsed.runCount)
          ? Math.max(0, Math.floor(parsed.runCount))
          : 0,
        lastShownAt: typeof parsed.lastShownAt === 'string' ? parsed.lastShownAt : null,
        dontShowAgain: Boolean(parsed.dontShowAgain),
      };
    } catch (error) {
      console.warn('[Task Priorities] Failed to read reflection survey state', error);
      return fallback;
    }
  }, []);

  const persistSurveyState = useCallback((state: SurveyState) => {
    surveyStateRef.current = state;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(REFLECTION_SURVEY_STORAGE_KEY, JSON.stringify(state));
    }
  }, []);

  useEffect(() => {
    const stored = getSurveyState();
    surveyStateRef.current = stored;
  }, [getSurveyState]);

  useEffect(() => {
    if (sessionStatus === 'completed' && lastSessionStatusRef.current !== 'completed') {
      const now = Date.now();
      const { state, show } = nextSurveyStateAfterRun(getSurveyState(), now);
      persistSurveyState(state);
      if (show) {
        setShowQualitySurvey(true);
      }
    }
    lastSessionStatusRef.current = sessionStatus;
  }, [getSurveyState, persistSurveyState, sessionStatus]);
  useEffect(() => {
    scorePollingHaltedRef.current = false;
    const shouldPoll =
      currentSessionId &&
      (sessionStatus === 'running' || isInstantAdjusting) &&
      !isSessionStreamConnected;
    if (!shouldPoll) {
      return;
    }

    let cancelled = false;
    let pollHandle: ReturnType<typeof setInterval> | null = null;
    let consecutiveFailures = 0;
    const MAX_CONSECUTIVE_FAILURES = 5;

    const pollScores = async () => {
      // Stop polling if too many consecutive failures (prevents fetch spam)
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        console.warn('[Task Priorities] Stopping score polling after', MAX_CONSECUTIVE_FAILURES, 'consecutive failures');
        if (!scorePollingHaltedRef.current) {
          scorePollingHaltedRef.current = true;
          toast.error('Lost connection to score updates. Reload the page to resume polling.');
        }
        if (pollHandle) {
          clearInterval(pollHandle);
          pollHandle = null;
        }
        return;
      }

      try {
        const response = await fetch(
          `/api/tasks/metadata?session_id=${currentSessionId}&status=all`
        );
        if (!response.ok) {
          if (response.status === 404) {
            consecutiveFailures += 1;
            return;
          }
          throw new Error('Failed to load scoring metadata');
        }
        const payload = await response.json();
        if (cancelled) {
          return;
        }

        // Reset failure counter on success
        consecutiveFailures = 0;
        scorePollingHaltedRef.current = false;

        const scoresResult = StrategicScoresMapSchema.safeParse(payload.scores ?? {});
        if (scoresResult.success) {
          setStrategicScores(prev => ({
            ...(prev ?? {}),
            ...scoresResult.data,
          }));
        }
        if (payload.retry_status && typeof payload.retry_status === 'object') {
          setRetryStatuses(payload.retry_status as Record<string, RetryStatusEntry>);
        } else {
          setRetryStatuses({});
        }
      } catch (error) {
        consecutiveFailures += 1;
        // Only log every 3rd failure to reduce console spam
        if (consecutiveFailures % 3 === 1) {
          console.error('[Task Priorities] Failed to poll scoring metadata:', error);
        }
      }
    };

    pollScores();
    pollHandle = setInterval(pollScores, METADATA_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (pollHandle) {
        clearInterval(pollHandle);
      }
    };
  }, [currentSessionId, sessionStatus, isInstantAdjusting, isSessionStreamConnected]);

  useEffect(() => {
    if (sessionStatus !== 'running') {
      lastStreamSignatureRef.current = null;
      return;
    }

    if (!streamedPlan) {
      return;
    }

    const signature = streamedPlan.ordered_task_ids.slice(0, 20).join('|');
    if (signature === lastStreamSignatureRef.current) {
      return;
    }

    lastStreamSignatureRef.current = signature;
    setPrioritizedPlan(streamedPlan);
    setResultsError(null);
    setPlanVersion(prev => prev + 1);
    setPlanStatusMessage('Streaming prioritization results…');
  }, [streamedPlan, sessionStatus]);
  const [activeTaskIds, setActiveTaskIds] = useState<string[]>([]);
  const quadrantTasks = useMemo(() => {
    if (!strategicScores || !prioritizedPlan) {
      return [] as QuadrantVizTask[];
    }
    const ids = prioritizedPlan.ordered_task_ids ?? [];
    const activeSet = activeTaskIds.length > 0 ? new Set(activeTaskIds) : null;
    const tasks = ids
      .map(taskId => {
        if (activeSet && !activeSet.has(taskId)) {
          return null;
        }
        const score = strategicScores[taskId];
        if (!score) {
          return null;
        }
        return {
          id: taskId,
          title: taskMetadata[taskId]?.title ?? formatTaskId(taskId),
          impact: score.impact,
          effort: Math.max(score.effort, 1),
          confidence: Math.max(score.confidence ?? 0, 0),
        };
      })
      .filter((task): task is QuadrantVizTask => Boolean(task));
    return tasks;
  }, [strategicScores, prioritizedPlan, taskMetadata, activeTaskIds]);
  const handleQuadrantTaskClick = useCallback(
    (taskId: string) => {
      if (!taskId) {
        return;
      }
      scrollToTaskFromViz(taskId);
      const element = document.querySelector<HTMLElement>(`[data-task-id="${taskId}"]`);
      if (element) {
        element.classList.add(...HIGHLIGHT_CLASSES);
        window.setTimeout(() => {
          element.classList.remove(...HIGHLIGHT_CLASSES);
        }, 1200);
      }
    },
    [scrollToTaskFromViz]
  );
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
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollStartRef = useRef<number | null>(null);
  const reflectionsFetchRef = useRef<{ hasFetched: boolean }>({ hasFetched: false });
  const lastActiveReflectionIdsRef = useRef<string[]>([]);
  const adjustmentControllerRef = useRef<AbortController | null>(null);
  const preloadedSuggestionsRef = useRef<Record<string, GapSuggestionState> | null>(null);
  const preloadedGenerationInfoRef = useRef<{ completed: number; durationMs: number } | null>(null);
  const discardActionsRef = useRef<{
    overrideDiscard: (taskId: string) => void;
    confirmDiscard: (taskId: string) => void;
  } | null>(null);
  const [overriddenManualTasks, setOverriddenManualTasks] = useState<Set<string>>(new Set());

  // Check localStorage for dismissal and fetch active outcome on mount
  useEffect(() => {
    // Check if prompt was dismissed
    if (typeof window !== 'undefined') {
      const isDismissed = localStorage.getItem('outcome-prompt-dismissed') === 'true';
      setShowOutcomePrompt(!isDismissed);
    }

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
          const body = await response.text().catch(() => 'Unknown error');
          console.warn('[Task Priorities] Active outcome request failed', {
            status: response.status,
            body,
          });
          setActiveOutcome(null);
          setFetchError('Unable to load active outcome. Please try again.');
        } else {
          const data = await response.json();
          setActiveOutcome(data.outcome);
        }
      } catch (error) {
        console.error('[Task Priorities] Failed to load outcome:', error);
        setFetchError('Unable to load active outcome. Please try again.');
        toast.error('Unable to load active outcome. Please try again.');
      } finally {
        setOutcomeLoading(false);
      }
    };

    fetchOutcome();

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
      }
    };
  }, []);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
    pollStartRef.current = null;
  };

  const applySessionResults = useCallback((session: unknown) => {
    if (!session || typeof session !== 'object' || session === null) {
      return;
    }

    const rawStrategicScores = (session as { strategic_scores?: unknown }).strategic_scores;
    const strategicResult = StrategicScoresMapSchema.safeParse(rawStrategicScores);
    setStrategicScores(strategicResult.success ? strategicResult.data : null);

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
        setPrioritizationError(null);
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

    const evaluationResult = hybridLoopMetadataSchema.safeParse(
      (session as { evaluation_metadata?: unknown }).evaluation_metadata
    );
    setEvaluationMetadata(evaluationResult.success ? evaluationResult.data : null);
  }, []);

  const fetchReflections = useCallback(async () => {
    try {
      if (!reflectionsFetchRef.current.hasFetched) {
        setReflectionsLoading(true);
      }

      setReflectionsError(null);

      const response = await fetch('/api/reflections?limit=5&within_days=30');

      if (!response.ok) {
        // Gracefully handle missing/disabled reflections API (e.g., offline or 404)
        if (response.status === 404) {
          reflectionsFetchRef.current.hasFetched = true;
          setReflections([]);
          return;
        }
        const text = await response.text().catch(() => 'Unknown error');
        console.warn('[Task Priorities] Reflections request failed', {
          status: response.status,
          body: text,
        });
        setReflections([]);
        reflectionsFetchRef.current.hasFetched = true;
        return;
      }

      const payload = await response.json();
      const rawReflections = Array.isArray(payload.reflections) ? payload.reflections : [];
      const normalized = rawReflections
        .map((reflection, index) =>
          normalizeReflectionFromUnknown(reflection, {
            fallbackIndex: index,
            fallbackUserId: DEFAULT_USER_ID,
          })
        )
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

  useEffect(() => {
    if (showContextCard) {
      return;
    }
    const nextActive = Array.from(
      new Set(
        reflections
          .filter(reflection => reflection.is_active_for_prioritization)
          .map(reflection => reflection.id)
          .filter(id => UUID_PATTERN.test(id))
      )
    );
    setActiveReflectionIds(prev => {
      if (
        prev.length === nextActive.length &&
        prev.every((id, index) => id === nextActive[index])
      ) {
        return prev;
      }
      return nextActive;
    });
  }, [reflections, showContextCard]);

  // Refresh reflections after the panel closes (user may have added context)
  const previousPanelState = useRef(false);
  useEffect(() => {
    const wasOpen = previousPanelState.current;
    previousPanelState.current = reflectionPanelOpen;

    if (wasOpen && !reflectionPanelOpen) {
      fetchReflections();
    }
  }, [reflectionPanelOpen, fetchReflections]);

  const applyImmediateEffectsToPlan = useCallback(
    (effects: ReflectionEffect[]) => {
      if (!effects || effects.length === 0) {
        return;
      }

      setPrioritizedPlan(prev => {
        if (!prev || !Array.isArray(prev.ordered_task_ids)) {
          return prev;
        }

        const weightMap = new Map<string, number>();
        effects.forEach(effect => {
          if (!UUID_PATTERN.test(effect.task_id)) {
            return;
          }
          const existing = weightMap.get(effect.task_id) ?? 0;
          if (effect.effect === 'blocked') {
            weightMap.set(effect.task_id, existing - 100);
            return;
          }
          if (effect.effect === 'demoted') {
            weightMap.set(effect.task_id, existing - Math.max(1, Math.abs(effect.magnitude ?? 1)) * 2);
            return;
          }
          if (effect.effect === 'boosted') {
            weightMap.set(effect.task_id, existing + Math.max(1, Math.abs(effect.magnitude ?? 1)) * 2);
          }
        });

        if (weightMap.size === 0) {
          return prev;
        }

        const ordered = [...prev.ordered_task_ids];
        ordered.sort((a, b) => {
          const bScore = weightMap.get(b) ?? 0;
          const aScore = weightMap.get(a) ?? 0;
          if (aScore === bScore) {
            return 0;
          }
          return bScore - aScore;
        });

        return { ...prev, ordered_task_ids: ordered };
      });
      setPlanVersion(prev => prev + 1);
    },
    []
  );

  const handleReflectionAutoAdjust = useCallback(
    (result: ReflectionAddedResult) => {
      setPlanStatusMessage('Applying your context...');
      setIsInstantAdjusting(true);
      void fetchReflections();

      const newReflectionId = result.reflection?.id;
      if (newReflectionId && UUID_PATTERN.test(newReflectionId)) {
        setActiveReflectionIds(prev =>
          prev.includes(newReflectionId) ? prev : [...prev, newReflectionId]
        );
      }

      if (Array.isArray(result.effects) && result.effects.length > 0) {
        applyImmediateEffectsToPlan(result.effects);
        toast.success('Applied your context to the current task list.');
      } else if (result.message) {
        toast.info(result.message);
      } else {
        toast.success('Reflection saved.');
      }

      window.setTimeout(() => {
        setPlanStatusMessage(null);
        setIsInstantAdjusting(false);
      }, 500);
    },
    [applyImmediateEffectsToPlan, fetchReflections]
  );

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

  const reflectionEffectsRefreshKey = useMemo(() => {
    const activeKey = [...activeReflectionIds].sort().join('|');
    const summaryKey = reflections
      .map(reflection => `${reflection.id}:${reflection.effects_summary?.total ?? 0}:${reflection.is_active_for_prioritization ? '1' : '0'}`)
      .sort()
      .join('|');
    return `${activeKey}::${summaryKey}`;
  }, [activeReflectionIds, reflections]);

  useEffect(() => {
    if (!currentSessionId) {
      return;
    }
    const source = new EventSource(`/api/agent/sessions/${currentSessionId}/stream`);

    const handleSession = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as { session?: unknown };
        if (payload.session) {
          applySessionResults(payload.session);
          const status = (payload.session as { status?: string }).status;
          const id = (payload.session as { id?: string }).id;
          if (status) {
            setSessionStatus(status as SessionStatus);
          }
          if (id) {
            setCurrentSessionId(id);
          }
        }
      } catch (error) {
        console.error('[Task Priorities] Failed to parse session stream payload', error);
      }
    };

    const handleScores = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as { scores?: unknown; retry_status?: unknown };
        const scoresResult = StrategicScoresMapSchema.safeParse(payload.scores ?? {});
        if (scoresResult.success) {
          setStrategicScores(prev => ({
            ...(prev ?? {}),
            ...scoresResult.data,
          }));
        }
        if (payload.retry_status && typeof payload.retry_status === 'object') {
          setRetryStatuses(payload.retry_status as Record<string, RetryStatusEntry>);
        }
      } catch (error) {
        console.error('[Task Priorities] Failed to parse score stream payload', error);
      }
    };

    const handleOpen = () => {
      sessionStreamFailuresRef.current = 0;
      setSessionStreamConnected(true);
    };

    const handleError = () => {
      sessionStreamFailuresRef.current += 1;
      setSessionStreamConnected(false);
      if (sessionStreamFailuresRef.current >= 2) {
        source.close();
      }
    };

    source.addEventListener('open', handleOpen);
    source.addEventListener('session', handleSession as EventListener);
    source.addEventListener('scores', handleScores as EventListener);
    source.addEventListener('error', handleError);

    return () => {
      source.removeEventListener('open', handleOpen);
      source.removeEventListener('session', handleSession as EventListener);
      source.removeEventListener('scores', handleScores as EventListener);
      source.removeEventListener('error', handleError);
      source.close();
      setSessionStreamConnected(false);
    };
  }, [currentSessionId, applySessionResults]);

  useEffect(() => {
    if (overriddenManualTasks.size === 0) {
      return;
    }

    const attempts = new Map<string, number>();
    const interval = setInterval(async () => {
      const ids = Array.from(overriddenManualTasks);
      await Promise.all(
        ids.map(async taskId => {
          const count = attempts.get(taskId) ?? 0;
          if (count >= 20) {
            setOverriddenManualTasks(prev => {
              const next = new Set(prev);
              next.delete(taskId);
              return next;
            });
            toast.warning(`Analysis taking longer than expected for "${taskId}"`);
            return;
          }
          attempts.set(taskId, count + 1);
          try {
            const response = await fetch(`/api/tasks/manual/${taskId}/status`);
            if (!response.ok) {
              return;
            }
            const payload = await response.json();
            if (payload?.status && payload.status !== 'analyzing') {
              setOverriddenManualTasks(prev => {
                const next = new Set(prev);
                next.delete(taskId);
                return next;
              });
            }
          } catch {
            // ignore transient errors; will retry
          }
        })
      );
    }, 1000);

    return () => clearInterval(interval);
  }, [overriddenManualTasks]);

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
  const handleActiveReflectionsChange = useCallback((ids: string[]) => {
    setActiveReflectionIds(prevIds => {
      if (prevIds.length === ids.length && prevIds.every((id, index) => id === ids[index])) {
        return prevIds;
      }
      return ids;
    });
  }, []);

  useEffect(() => {
    if (!prioritizedPlan || !currentSessionId || sessionStatus === 'running') {
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
          setAdjustmentError(message);
          setPlanStatusMessage(null);
          return;
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
          
          // Preserve locked task positions by applying adjusted order while respecting locks
          const prevOrder = [...prev.ordered_task_ids];
          const adjustedOrder = [...adjustedPlan.ordered_task_ids];
          
          // Get currently locked task IDs from localStorage
          let lockedTaskIds: Set<string> = new Set();
          try {
            const lockStore = localStorage.getItem('locked-tasks');
            if (lockStore) {
              const parsed = JSON.parse(lockStore);
              const outcomeKey = activeOutcome?.id || 'global';
              lockedTaskIds = new Set(Object.keys(parsed[outcomeKey] || {}));
            }
          } catch (e) {
            console.warn('Failed to read locked tasks from localStorage', e);
          }
          
          if (lockedTaskIds.size > 0) {
            // Separate locked and unlocked tasks from the adjusted order
            const unlockedInAdjustedOrder = adjustedOrder.filter(id => !lockedTaskIds.has(id));
            
            // Create a new order with locked tasks in their original relative positions
            const newOrder = [];
            let unlockedIndex = 0;
            
            // Go through the previous order and place items accordingly
            for (const taskId of prevOrder) {
              if (lockedTaskIds.has(taskId)) {
                // Keep locked tasks in their original positions
                newOrder.push(taskId);
              } else {
                // Replace unlocked positions with tasks from the adjusted order
                if (unlockedIndex < unlockedInAdjustedOrder.length) {
                  newOrder.push(unlockedInAdjustedOrder[unlockedIndex]);
                  unlockedIndex++;
                }
              }
            }
            
            // Add any remaining unlocked tasks that might not have been in the original
            while (unlockedIndex < unlockedInAdjustedOrder.length) {
              newOrder.push(unlockedInAdjustedOrder[unlockedIndex]);
              unlockedIndex++;
            }
            
            return {
              ...prev,
              ordered_task_ids: newOrder,
              confidence_scores: mergedConfidence,
            };
          } else {
            // No locked tasks, use the adjusted order as is
            return {
              ...prev,
              ordered_task_ids:
                adjustedPlan.ordered_task_ids.length > 0
                  ? adjustedPlan.ordered_task_ids
                  : prev.ordered_task_ids,
              confidence_scores: mergedConfidence,
            };
          }
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

    const handleTimeout = () => {
      console.warn('[Task Priorities] Prioritization timed out');
      stopPolling();
      setSessionStatus('failed');
      setTriggerError('Prioritization timed out after 2 minutes. Please rerun.');
      setIsLoadingResults(false);
      setIsRecalculating(false);
      setCurrentSessionId(null);
    };

    pollStartRef.current = Date.now();
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
    }
    pollTimeoutRef.current = setTimeout(handleTimeout, MAX_SESSION_DURATION_MS);

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

        if (session.status === 'failed') {
          setPrioritizationError('Prioritization failed. Please retry.');
        } else if (session.status === 'completed') {
          setPrioritizationError(null);
          setPrioritizationRetryCount(0);
        }
      } catch (error) {
        console.error('[Task Priorities] Polling error:', error);
        setTriggerError('Lost connection while checking progress. Retrying…');
        toast.error('Lost connection while checking progress. Retrying…');
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
    setPrioritizationError(null);
    setPrioritizationRetryCount(prev => (hasExistingPlan ? prev + 1 : 0));

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
          excluded_document_ids: excludedIds,
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
      const initialScores = StrategicScoresMapSchema.safeParse(data.strategic_scores);
      setStrategicScores(initialScores.success ? initialScores.data : null);
      setBaselineReflectionIds(validActiveReflectionIds);
      lastActiveReflectionIdsRef.current = validActiveReflectionIds;
      setSessionStatus('running');
      setCurrentSessionId(data.session_id);
      pollSessionStatus(data.session_id);
    } catch (error) {
      console.error('[Task Priorities] Failed to trigger agent:', error);
      const message = 'Could not start prioritization. Please retry.';
      setTriggerError(message);
      toast.error(message);
      setSessionStatus('failed');
      setIsLoadingResults(false);
      setIsRecalculating(false);
    } finally {
      setIsTriggering(false);
    }
  };

  const handleSurveySubmit = useCallback(
    async (rating: SurveyRating) => {
      setIsSurveySubmitting(true);
      const now = Date.now();
      try {
        const response = await fetch('/api/feedback/reflection-quality', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rating,
            session_id: currentSessionId ?? undefined,
          }),
        });

        if (!response.ok) {
          console.error('[Task Priorities] Feedback submission failed', {
            status: response.status,
          });
          toast.error('Could not submit feedback. Please try again.');
          return;
        }

        const updatedState: SurveyState = {
          ...getSurveyState(),
          runCount: 0,
          lastShownAt: new Date(now).toISOString(),
        };
        persistSurveyState(updatedState);
        setShowQualitySurvey(false);
        toast.success('Thanks for your feedback.');
      } catch (error) {
        console.error('[Task Priorities] Failed to send reflection feedback', error);
        toast.error('Could not submit feedback. Please try again.');
      } finally {
        setIsSurveySubmitting(false);
      }
    },
    [currentSessionId, getSurveyState, persistSurveyState]
  );

  const handleSurveyDontShowAgain = useCallback(() => {
    const now = Date.now();
    const state = getSurveyState();
    persistSurveyState({
      ...state,
      dontShowAgain: true,
      runCount: 0,
      lastShownAt: new Date(now).toISOString(),
    });
    setShowQualitySurvey(false);
  }, [getSurveyState, persistSurveyState]);

  const streamingProgressLabel = useMemo(() => {
    if (streamStage === 'refining') {
      return 'Refining prioritization order…';
    }
    if (streamStage === 'draft') {
      return 'Scoring and drafting tasks…';
    }
    if (streamStage === 'completed') {
      return 'Finalizing prioritization…';
    }
    return 'Scoring tasks…';
  }, [streamStage]);

  const streamingProgressValue = Math.round(Math.min(1, Math.max(0, prioritizationProgress)) * 100);

  const showProgress = sessionStatus === 'running';
  const showCollapsedPrimaryCard = hasTriggered && !outcomeLoading;
  const hasPlan = prioritizedPlan !== null;
  const pendingDocumentCount = documentStatus?.summary.pending_count ?? 0;
  const hasDocumentBaseline =
    (documentStatus?.documents ?? []).some(doc => doc.status === 'included' || doc.status === 'excluded');
  const totalDocuments = documentStatus?.documents.length ?? 0;
  const excludedDocumentCount = documentStatus?.documents?.filter(doc => excludedIds.includes(doc.id)).length ?? 0;
  const allDocumentsExcluded = totalDocuments > 0 && excludedDocumentCount === totalDocuments;
  const documentStatusBadgeLabel = useMemo(() => {
    if (!documentStatus) {
      return null;
    }
    if (pendingDocumentCount > 0) {
      return `${pendingDocumentCount} new`;
    }
    if (hasDocumentBaseline) {
      return 'up to date';
    }
    return null;
  }, [documentStatus, pendingDocumentCount, hasDocumentBaseline]);
  const documentStatusBadgeVariant = pendingDocumentCount > 0 ? 'secondary' : 'outline';
  const analyzeButtonLabel = () => {
    if (isTriggering) {
      return 'Initializing…';
    }
    if (sessionStatus === 'running') {
      return hasPlan ? 'Recalculating…' : 'Analyzing…';
    }
    return hasPlan ? 'Recalculate priorities' : 'Analyze Tasks';
  };
  const isButtonDisabled =
    !activeOutcome ||
    outcomeLoading ||
    isTriggering ||
    sessionStatus === 'running' ||
    isInstantAdjusting ||
    allDocumentsExcluded;
  const disableRecalculate = isTriggering || sessionStatus === 'running' || allDocumentsExcluded;
  const handleShowMoreDocuments = useCallback(() => {
    if (documentStatusLoading) {
      return;
    }
    const loadedCount = documentStatus?.documents.length ?? 0;
    const totalAvailable = documentStatus?.total ?? loadedCount;
    if (loadedCount >= totalAvailable) {
      return;
    }
    setDocumentOffset(prev => prev + DOCUMENT_PAGE_SIZE);
  }, [documentStatus, documentStatusLoading]);

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
    if (allDocumentsExcluded) {
      return 'Select at least one document to include before recalculating.';
    }
    if (!activeOutcome && !outcomeLoading) {
      return 'Create an active outcome to unlock prioritization.';
    }
    if (outcomeLoading) {
      return 'Loading your active outcome…';
    }
    return null;
  }, [activeOutcome, outcomeLoading, isInstantAdjusting, isTriggering, sessionStatus]);

  const canAutoTriggerPrioritization =
    Boolean(activeOutcome) &&
    !outcomeLoading &&
    !isTriggering &&
    sessionStatus !== 'running' &&
    !isInstantAdjusting;

  useEffect(() => {
    if (sessionStatus === 'completed') {
      void refreshDocumentStatus();
    }
  }, [sessionStatus, refreshDocumentStatus]);

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
          setStrategicScores(null);
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
      <QualitySurvey
        open={showQualitySurvey}
        onClose={() => setShowQualitySurvey(false)}
        onSubmit={handleSurveySubmit}
        onDontShowAgain={handleSurveyDontShowAgain}
        isSubmitting={isSurveySubmitting}
      />

      <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-12">
        <div className="flex flex-col gap-3 text-left">
          <h1 className="text-3xl font-semibold text-foreground">Task Priorities</h1>
          <p className="text-muted-foreground max-w-2xl">
            Trigger the autonomous agent to analyze your tasks, then work from a focused, dependency-aware list.
          </p>
        </div>

        {prioritizationError && (
          <ErrorBanner
            message={prioritizationError}
            onRetry={handleAnalyzeTasks}
            retryLabel="Retry"
            retryCount={prioritizationRetryCount}
            maxRetries={1}
          />
        )}

        {showContextCard && (
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
            pendingDocumentCount={documentStatusBadgeLabel ? pendingDocumentCount : null}
            hasBaselineDocuments={hasDocumentBaseline}
            completionTime={completionTime}
            qualityCheckPassed={evaluationWasTriggered}
          />
        )}

        {/* Banner for when no active outcome exists - T012 requirement */}
        {!activeOutcome && !outcomeLoading && showOutcomePrompt && (
          <Alert className="border-amber-300 bg-amber-50">
            <Lightbulb className="h-5 w-5 text-amber-600" />
            <AlertTitle>Set an outcome to enable automatic task prioritization</AlertTitle>
            <AlertDescription className="mt-2 flex items-center gap-3 text-foreground">
              <span>Set an outcome to enable automatic task prioritization.</span>
              <Button 
                size="sm" 
                variant="default"
                onClick={() => {
                  // Navigate to outcome builder as the link does elsewhere in the code
                  window.location.href = '/?openOutcome=1';
                }}
              >
                Create Outcome
              </Button>
              <Button 
                size="sm" 
                variant="ghost"
                onClick={() => {
                  // Dismissible via localStorage as per requirement
                  if (typeof window !== 'undefined') {
                    localStorage.setItem('outcome-prompt-dismissed', 'true');
                    setShowOutcomePrompt(false);
                  }
                }}
                className="ml-auto"
              >
                Dismiss
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <Card className={showCollapsedPrimaryCard ? 'border-border/70 shadow-1layer-sm' : undefined}>
          {showCollapsedPrimaryCard ? (
            <>
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
                  </CardDescription>
                </div>
                <div className="flex items-center gap-3">
                  {sessionStatus === 'running' && (
                    <Badge variant="secondary" className="gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                      In progress
                    </Badge>
                  )}
                  <Button onClick={handleAnalyzeTasks} disabled={isButtonDisabled} className="gap-2">
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
                  {documentStatusBadgeLabel && (
                    <Badge
                      variant={documentStatusBadgeVariant}
                      className="h-7 rounded-full px-2 text-xs"
                    >
                      {documentStatusBadgeLabel}
                    </Badge>
                  )}
                </div>
                {triggerError && (
                  <p className="text-sm text-destructive">{triggerError}</p>
                )}
              </CardHeader>
              {activeOutcome && (
                <CardContent className="pt-0">
                  <OutcomeCard outcome={activeOutcome} />
                </CardContent>
              )}
              {sessionStatus === 'running' && (
                <CardContent className="pt-0">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>{streamingProgressLabel}</span>
                      <span className="tabular-nums">{streamingProgressValue}%</span>
                    </div>
                    <Progress value={streamingProgressValue} className="h-2" />
                    <p className="text-xs text-muted-foreground">
                      Live updates: {streamConnectionState === 'open' ? 'connected' : 'stabilizing…'}
                    </p>
                  </div>
                </CardContent>
              )}
            </>
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
                      <OutcomeCard outcome={activeOutcome} />
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
                  <div className="flex flex-wrap items-center gap-2">
                    <Button onClick={handleAnalyzeTasks} disabled={isButtonDisabled} className="w-fit gap-2">
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
                    {documentStatusBadgeLabel && (
                      <Badge
                        variant={documentStatusBadgeVariant}
                        className="h-7 rounded-full px-2 text-xs"
                      >
                        {documentStatusBadgeLabel}
                      </Badge>
                    )}
                  </div>

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

        {activeOutcome && (
          <SourceDocuments
            status={documentStatus}
            isLoading={documentStatusLoading || outcomeLoading}
            error={documentStatusError}
            onRetry={refreshDocumentStatus}
            excludedIds={excludedIds}
            onExcludedChange={setExcludedIds}
            disabled={sessionStatus === 'running' || isTriggering}
            total={documentStatus?.total ?? documentStatus?.documents.length ?? 0}
            onShowMore={handleShowMoreDocuments}
          />
        )}

        {allDocumentsExcluded && activeOutcome && (
          <Alert variant="default" className="border-amber-300 bg-amber-50">
            <AlertTitle>All documents excluded</AlertTitle>
            <AlertDescription className="text-sm text-foreground">
              Select at least one document to include before running prioritization.
            </AlertDescription>
          </Alert>
        )}

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
            {evaluationMetadata && debugMode && (
              <ReasoningChain
                chain={evaluationMetadata.chain_of_thought}
                iterations={evaluationMetadata.iterations}
                evaluationTriggered={evaluationMetadata.evaluation_triggered}
                debugMode={debugMode}
              />
            )}
            <TaskList
              plan={prioritizedPlan}
              executionMetadata={executionMetadata ?? undefined}
              planVersion={planVersion}
              outcomeId={activeOutcome?.id ?? null}
              outcomeStatement={activeOutcome?.assembled_text ?? null}
              adjustedPlan={latestAdjustment}
              onDiffSummary={handleDiffSummary}
              sessionStatus={sessionStatus}
              canTriggerPrioritization={canAutoTriggerPrioritization}
              onRequestPrioritization={handleAnalyzeTasks}
              strategicScores={strategicScores}
              retryStatuses={retryStatuses}
              sortingStrategy={sortingStrategy}
              onStrategyChange={setSortingStrategy}
              onTaskMetadataUpdate={handleTaskMetadataUpdate}
              onActiveIdsChange={setActiveTaskIds}
              metadataRefreshKey={reflectionEffectsRefreshKey}
              activeReflectionIds={activeReflectionIds}
              excludedDocumentIds={excludedIds}
              discardActionsRef={discardActionsRef}
            />
            <div className="mt-6">
              <DiscardPileSection
                outcomeId={activeOutcome?.id ?? null}
                onOverride={taskId => {
                  console.log('[Priorities][DiscardOverride]', taskId);
                  discardActionsRef.current?.overrideDiscard(taskId);
                  setOverriddenManualTasks(prev => {
                    const next = new Set(prev);
                    next.add(taskId);
                    return next;
                  });
                }}
                onConfirmDiscard={taskId => discardActionsRef.current?.confirmDiscard(taskId)}
              />
            </div>
            {prioritizedPlan.excluded_tasks && prioritizedPlan.excluded_tasks.length > 0 && (
              <ExcludedTasksSection excludedTasks={prioritizedPlan.excluded_tasks} />
            )}
            {quadrantTasks.length > 0 && (
              <section className="mt-8 hidden rounded-xl border border-border/70 bg-bg-layer-3/40 p-4 md:block">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">Impact/Effort Quadrant</h3>
                    <p className="text-sm text-muted-foreground">
                      Bubble size tracks confidence; click a point to jump to that task.
                    </p>
                  </div>
                </div>
                <div className="mt-4 h-[420px] w-full">
                  <QuadrantViz tasks={quadrantTasks} onTaskClick={handleQuadrantTaskClick} />
                </div>
              </section>
            )}
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
        onReflectionAdded={handleReflectionAutoAdjust}
        outcomeId={activeOutcome?.id ?? null}
      />
    </div>
  );
}
