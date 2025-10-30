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
import { prioritizedPlanSchema } from '@/lib/schemas/prioritizedPlanSchema';
import { executionMetadataSchema } from '@/lib/schemas/executionMetadataSchema';
import type { Gap, GapDetectionResponse } from '@/lib/schemas/gapSchema';
import type { BridgingTask } from '@/lib/schemas/bridgingTaskSchema';
import type { ExecutionMetadata, PrioritizedTaskPlan } from '@/lib/types/agent';
import { useLocalStorage } from '@/lib/hooks/useLocalStorage';
import { useSessionStorage } from '@/lib/hooks/useSessionStorage';
import {
  GapDetectionModal,
  type GapSuggestionState,
  type BridgingTaskWithSelection,
  type GapAcceptanceErrorInfo,
} from '@/app/priorities/components/GapDetectionModal';
import { toast } from 'sonner';

const DEFAULT_USER_ID = 'default-user';
const POLL_INTERVAL_MS = 2000;

type AcceptedSuggestionForPlan = {
  task: BridgingTask;
  gap: Gap;
  finalText: string;
  finalHours: number;
};

function integrateAcceptedTasksIntoPlan(
  plan: PrioritizedTaskPlan,
  accepted: AcceptedSuggestionForPlan[]
): PrioritizedTaskPlan {
  if (accepted.length === 0) {
    return plan;
  }

  const nextPlan: PrioritizedTaskPlan = JSON.parse(JSON.stringify(plan));

  const seenOrder = new Set<string>();
  accepted.forEach(entry => {
    const { task, gap } = entry;
    const newTaskId = task.id;
    const predecessorIndex = nextPlan.ordered_task_ids.indexOf(gap.predecessor_task_id);
    const successorIndex = nextPlan.ordered_task_ids.indexOf(gap.successor_task_id);
    let insertIndex = successorIndex;

    if (insertIndex === -1 && predecessorIndex !== -1) {
      insertIndex = predecessorIndex + 1;
    }
    if (insertIndex === -1) {
      insertIndex = nextPlan.ordered_task_ids.length;
    }

    nextPlan.ordered_task_ids.splice(insertIndex, 0, newTaskId);
    seenOrder.add(newTaskId);
  });

  // Ensure ordered_task_ids remains unique while preserving new ordering
  const dedupedOrder: string[] = [];
  const encountered = new Set<string>();
  nextPlan.ordered_task_ids.forEach(id => {
    if (!encountered.has(id)) {
      dedupedOrder.push(id);
      encountered.add(id);
    }
  });
  nextPlan.ordered_task_ids = dedupedOrder;

  nextPlan.dependencies ??= [];
  accepted.forEach(entry => {
    const { task, gap } = entry;
    const dependencyCandidates = [
      { source: gap.predecessor_task_id, target: task.id },
      { source: task.id, target: gap.successor_task_id },
    ];

    dependencyCandidates.forEach(({ source, target }) => {
      const alreadyExists = nextPlan.dependencies.some(
        dependency =>
          dependency.source_task_id === source && dependency.target_task_id === target
      );
      if (!alreadyExists) {
        nextPlan.dependencies.push({
          source_task_id: source,
          target_task_id: target,
          relationship_type: 'prerequisite',
          confidence: task.confidence,
          detection_method: 'stored_relationship',
        });
      }
    });
  });

  nextPlan.confidence_scores ??= {};
  accepted.forEach(entry => {
    nextPlan.confidence_scores[entry.task.id] = entry.task.confidence;
  });

  nextPlan.execution_waves ??= [];
  if (nextPlan.execution_waves.length === 0) {
    nextPlan.execution_waves.push({
      wave_number: 1,
      task_ids: [],
      parallel_execution: false,
      estimated_duration_hours: null,
    });
  }

  accepted.forEach(entry => {
    const { task, gap } = entry;
    const targetWaveIndex = nextPlan.execution_waves.findIndex(wave =>
      wave.task_ids.includes(gap.successor_task_id)
    );
    if (targetWaveIndex !== -1) {
      const targetWave = nextPlan.execution_waves[targetWaveIndex];
      const successorPosition = targetWave.task_ids.indexOf(gap.successor_task_id);
      const insertionIndex = successorPosition === -1 ? targetWave.task_ids.length : successorPosition;
      targetWave.task_ids.splice(insertionIndex, 0, task.id);
    } else {
      const lastWave = nextPlan.execution_waves[nextPlan.execution_waves.length - 1];
      if (!lastWave.task_ids.includes(task.id)) {
        lastWave.task_ids.push(task.id);
      }
    }
  });

  nextPlan.task_annotations ??= [];
  accepted.forEach(entry => {
    const annotationExists = nextPlan.task_annotations?.some(
      annotation => annotation.task_id === entry.task.id
    );
    if (!annotationExists) {
      nextPlan.task_annotations?.push({
        task_id: entry.task.id,
        state: 'active',
        reasoning: entry.task.reasoning,
        dependency_notes: `Estimated effort: ${entry.finalHours} hours`,
        manual_override: true,
      });
    }
  });

  return nextPlan;
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

  // T005: Reasoning trace discoverability
  const [hasSeenTrace, setHasSeenTrace] = useSessionStorage('trace-first-visit', false);
  const [isTraceCollapsed, setIsTraceCollapsed] = useLocalStorage('reasoning-trace-collapsed', false);
  const [isTraceExpanded, setIsTraceExpanded] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
      return;
    }

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
  }, []);

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

    setIsTriggering(true);
    setTriggerError(null);
    setResultsError(null);
    setPlanStatusMessage(null);
    setCurrentSessionId(null);
    setHasTriggered(true);

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
      const response = await fetch('/api/agent/prioritize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          outcome_id: activeOutcome.id,
          user_id: DEFAULT_USER_ID,
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
    !activeOutcome || outcomeLoading || isTriggering || sessionStatus === 'running';

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

  const isDetectingGaps = gapAnalysisStatus === 'detecting';
  const isGeneratingGaps = gapGenerationRunning;

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
    if (!prioritizedPlan) {
      setGapAnalysisStatus('error');
      setGapAnalysisError('Run prioritization to generate a task plan before detecting gaps.');
      setGapAnalysisResult(null);
      setGapSuggestions({});
      setGapGenerationRunning(false);
      setIsGapModalOpen(true);
      return;
    }

    const uniqueTaskIds = Array.from(new Set(prioritizedPlan.ordered_task_ids));

    if (uniqueTaskIds.length < 2) {
      setGapAnalysisStatus('error');
      setGapAnalysisError('At least two tasks are required to analyze gaps.');
      setGapAnalysisResult(null);
      setGapSuggestions({});
      setGapGenerationRunning(false);
      setIsGapModalOpen(true);
      return;
    }

    setGapAnalysisStatus('detecting');
    setGapAnalysisError(null);
    setGapAnalysisResult(null);
    setGapSuggestions({});
    setGapGenerationRunning(false);
    setGapGenerationProgress(0);
    setGapGenerationDurationMs(null);
    setIsGapModalOpen(true);
    setGapAcceptanceError(null);
    setIsAcceptingGapTasks(false);

    try {
      const response = await fetch('/api/gaps/detect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ task_ids: uniqueTaskIds }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        const message =
          typeof errorBody?.error === 'string'
            ? errorBody.error
            : 'Unable to analyze gaps. Please try again.';
        throw new Error(message);
      }

      const data: GapDetectionResponse = await response.json();
      setGapAnalysisResult(data);
      setGapAnalysisStatus('success');
      setGapAnalysisRunId(prev => prev + 1);
    } catch (error) {
      console.error('[Task Priorities] Gap detection failed:', error);
      setGapAnalysisStatus('error');
      setGapAnalysisError(error instanceof Error ? error.message : 'Gap detection failed.');
      setGapGenerationRunning(false);
    }
  }, [prioritizedPlan]);

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

    setGapAcceptanceError(null);
    setIsAcceptingGapTasks(true);

    const acceptedForPlan: AcceptedSuggestionForPlan[] = selectedEntries.map(entry => ({
      task: entry.task,
      gap: entry.gap,
      finalText: (entry.task.edited_task_text ?? entry.task.task_text).trim(),
      finalHours: entry.task.edited_estimated_hours ?? entry.task.estimated_hours,
    }));

    const payload = selectedEntries.map(entry => {
      const { task, gap } = entry;
      const { checked, ...rest } = task;
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
        body: JSON.stringify({ accepted_tasks: payload }),
      });

      // Log the raw response for debugging
      console.log('[GapAcceptance] Response status:', response.status, response.statusText);

      let body: any = null;
      try {
        const text = await response.text();
        console.log('[GapAcceptance] Response body:', text.substring(0, 500));
        body = text ? JSON.parse(text) : null;
      } catch (parseError) {
        console.error('[GapAcceptance] Failed to parse response as JSON:', parseError);
        setGapAcceptanceError({
          message: `Server returned invalid response (status ${response.status}). Check browser console for details.`,
        });
        return;
      }

      if (!response.ok) {
        const validationErrors = Array.isArray(body?.validation_errors)
          ? body.validation_errors.filter((item: unknown): item is string => typeof item === 'string')
          : [];
        const message =
          typeof body?.error === 'string'
            ? body.error
            : `Request failed with status ${response.status}`;
        const code = typeof body?.code === 'string' ? body.code : undefined;
        setGapAcceptanceError({
          message,
          details: validationErrors.length > 0 ? validationErrors : undefined,
          code,
        });
        return;
      }

      setGapAcceptanceError(null);
      setIsGapModalOpen(false);
      setGapAnalysisStatus('idle');
      setGapAnalysisResult(null);
      setGapGenerationRunning(false);
      setGapSuggestions({});

      setPrioritizedPlan(prev => {
        if (!prev) {
          return prev;
        }
        return integrateAcceptedTasksIntoPlan(prev, acceptedForPlan);
      });
      setPlanVersion(prev => prev + 1);

      // Show success toast with cycle resolution info
      const taskCount = acceptedForPlan.length;
      const cyclesResolved = body?.cycles_resolved ?? 0;

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
  }, [gapSuggestionList, isAcceptingGapTasks]);

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
      if (hasSteps && !isTraceCollapsed) {
        setIsTraceExpanded(true);
        setHasSeenTrace(true);
      }
    }
  }, [hasSeenTrace, prioritizedPlan, currentSessionId, executionMetadata, isTraceCollapsed, setHasSeenTrace]);

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
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Need to verify the sequence?</span>
              </div>
              <Button
                variant="secondary"
                onClick={handleDetectGaps}
                disabled={
                  isDetectingGaps ||
                  isGeneratingGaps ||
                  sessionStatus === 'running' ||
                  isLoadingResults
                }
              >
                {isDetectingGaps ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Analyzing…
                  </>
                ) : isGeneratingGaps ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating…
                  </>
                ) : (
                  'Find Missing Tasks'
                )}
              </Button>
            </div>
            <TaskList
              plan={prioritizedPlan}
              executionMetadata={executionMetadata ?? undefined}
              sessionId={currentSessionId}
              planVersion={planVersion}
              outcomeId={activeOutcome?.id ?? null}
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
            onTraceUnavailable={() => setIsTraceExpanded(false)}
          />
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
        />
      </main>
    </div>
  );
}
