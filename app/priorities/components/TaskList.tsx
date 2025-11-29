'use client';

import { Component, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode, UIEvent } from 'react';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

import type {
  ExecutionMetadata,
  PrioritizedTaskPlan,
  TaskAnnotation,
  TaskDependency,
  TaskRemoval,
} from '@/lib/types/agent';
import type { AdjustedPlan } from '@/lib/types/adjustment';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TaskRow } from '@/app/priorities/components/TaskRow';
import { CompletedTasks } from '@/app/priorities/components/CompletedTasks';
import { DiscardedTasks } from '@/app/priorities/components/DiscardedTasks';
import { TaskDetailsDrawer } from '@/app/priorities/components/TaskDetailsDrawer';
import { SortingStrategySelector } from '@/app/priorities/components/SortingStrategySelector';
import { useTaskDiff } from '@/app/priorities/components/useTaskDiff';
import { useScrollToTask } from '@/app/priorities/components/useScrollToTask';
import type { MovementInfo } from '@/app/priorities/components/MovementBadge';
import { ManualTaskModal } from '@/app/components/ManualTaskModal';
import { DiscardReviewModal, type DiscardCandidate } from '@/app/components/DiscardReviewModal';
import { BlockedTasksSection, type BlockedTask } from '@/app/priorities/components/BlockedTasksSection';
import {
  DEPENDENCY_OVERRIDE_STORAGE_KEY,
  type DependencyOverrideEntry,
  type DependencyOverrideStore,
} from '@/lib/utils/dependencyOverrides';
import { useLocalStorage } from '@/lib/hooks/useLocalStorage';
import { getQuadrant, type Quadrant } from '@/lib/schemas/quadrant';
import type { StrategicScore, StrategicScoresMap, TaskWithScores } from '@/lib/schemas/strategicScore';
import {
  classifyStrategyScores,
  HIGH_IMPACT_THRESHOLD,
  LOW_EFFORT_THRESHOLD,
  type SortingStrategy,
} from '@/lib/schemas/sortingStrategy';
import type { RetryStatusEntry } from '@/lib/schemas/retryStatus';
import type { ReflectionEffect } from '@/lib/services/reflectionAdjuster';
import { formatTaskId } from '@/app/priorities/utils/formatTaskId';
import type { ManualOverrideState } from '@/lib/schemas/manualOverride';
import { calculatePriority } from '@/lib/utils/strategicPriority';
import type { ManualTaskBadgeStatus } from '@/app/priorities/components/ManualTaskBadge';
import { DiscardPileSection } from '@/app/priorities/components/DiscardPileSection';

type TaskStatus = 'active' | 'completed' | 'discarded';

type PriorityState = {
  statuses: Record<string, TaskStatus>;
  reasons: Record<string, string>;
  ranks: Record<string, number>;
};

type TaskLookup = Record<
  string,
  {
    title: string;
    documentId?: string | null;
    documentName?: string | null;
    category?: 'leverage' | 'neutral' | 'overhead' | null;
    rationale?: string | null;
    sourceText?: string | null;
    isManual?: boolean;
    manualOverride?: ManualOverrideState | null;
    reflectionEffects?: ReflectionEffect[];
  }
>;

type TaskRenderNode = {
  id: string;
  title: string;
  documentId?: string | null;
  documentName?: string | null;
  category?: 'leverage' | 'neutral' | 'overhead' | null;
  rationale?: string | null;
  sourceText?: string | null;
  sourceDocumentTitle?: string | null;
  confidence: number | null;
  confidenceDelta?: number | null;
  dependencies: TaskDependency[];
  dependents: TaskDependency[];
  movement?: MovementInfo;
  planRank?: number | null;
  reasoning?: string | null;
  dependencyNotes?: string | null;
  manualOverride?: boolean;
  isManual?: boolean;
  state?: 'active' | 'completed' | 'discarded' | 'manual_override' | 'reintroduced';
  removalReason?: string | null;
};

type TaskStrategicSnapshot = {
  impact: number;
  effort: number;
  confidence: number;
  priority: number;
} | null;

type ActiveTaskEntry = {
  id: string;
  title: string;
  category: 'leverage' | 'neutral' | 'overhead' | null;
  movement: MovementInfo | undefined;
  dependencyLinks: ReturnType<typeof buildDependencyLinks>;
  planOrder: number;
  checked: boolean;
  isAiGenerated: boolean;
  isManual: boolean;
  isPrioritizing: boolean;
  strategicScore: TaskStrategicSnapshot;
  strategicDetails: TaskWithScores | null;
  retryStatus?: RetryStatusEntry | null;
  manualOverride?: ManualOverrideState | null;
  hasManualOverride?: boolean;
  baselineScore?: StrategicScore | null;
  inclusionReason?: string | null;
  reflectionEffects?: ReflectionEffect[];
};

type TaskOption = {
  id: string;
  title: string;
};

type SessionStatus = 'idle' | 'running' | 'completed' | 'failed';

type CachedManualTask = {
  id: string;
  title: string;
};

const ACTIVE_LIST_MAX_HEIGHT_PX = 560;
const VIRTUALIZATION_THRESHOLD = 500;
const VIRTUALIZATION_ROW_HEIGHT = 160;
const VIRTUALIZATION_BUFFER_ROWS = 8;
const VIRTUALIZATION_ROW_HEIGHT_MIN = 120;
const VIRTUALIZATION_ROW_HEIGHT_MAX = 360;
const VIRTUALIZATION_ROW_HEIGHT_TOLERANCE = 12;
const CATEGORY_FOCUS_COPY: Record<'leverage' | 'neutral' | 'overhead', string> = {
  leverage: 'high-leverage bets',
  neutral: 'core delivery work',
  overhead: 'operational hygiene',
};
const CATEGORY_DISPLAY_ORDER: Array<'leverage' | 'neutral' | 'overhead'> = [
  'leverage',
  'neutral',
  'overhead',
];
const TASK_LIST_PERF_LABEL = '[TaskList][Perf]';

const getNowMs = () => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
};

const logTaskListPerf = (event: string, payload: Record<string, unknown>) => {
  console.log(`${TASK_LIST_PERF_LABEL} ${event}`, payload);
};

type TaskListProps = {
  plan: PrioritizedTaskPlan;
  executionMetadata?: ExecutionMetadata | null;
  planVersion: number;
  outcomeId: string | null;
  outcomeStatement?: string | null;
  metadataRefreshKey?: string | number | null;
  activeReflectionIds?: string[];
  adjustedPlan?: AdjustedPlan | null;
  onDiffSummary?: (summary: { hasChanges: boolean; isInitial: boolean }) => void;
  sessionStatus?: SessionStatus;
  canTriggerPrioritization?: boolean;
  onRequestPrioritization?: () => void | Promise<void>;
  strategicScores?: StrategicScoresMap | null;
  retryStatuses?: Record<string, RetryStatusEntry> | null;
  sortingStrategy: SortingStrategy;
  onStrategyChange: (strategy: SortingStrategy) => void;
  onTaskMetadataUpdate?: (metadata: Record<string, { title: string }>) => void;
  onActiveIdsChange?: (ids: string[]) => void;
  excludedDocumentIds?: string[];
  discardActionsRef?: React.MutableRefObject<{
    overrideDiscard: (taskId: string) => void;
    confirmDiscard: (taskId: string) => void;
  } | null>;
};

const DEFAULT_REMOVAL_REASON =
  'Removed in the latest agent recalculation. Review and reinstate if still relevant.';
const EMPTY_DEPENDENCIES: TaskDependency[] = [];
const VALID_REFLECTION_EFFECTS: ReflectionEffect['effect'][] = [
  'blocked',
  'demoted',
  'boosted',
  'unchanged',
];

function ensureRecord<T>(value: unknown): Record<string, T> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, T>;
}

function arraysEqual(a: string[], b: string[]) {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

function normalizeReflectionEffects(value: unknown): ReflectionEffect[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized: ReflectionEffect[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const reflectionId = typeof (entry as { reflection_id?: unknown }).reflection_id === 'string'
      ? (entry as { reflection_id: string }).reflection_id
      : null;
    const taskId = typeof (entry as { task_id?: unknown }).task_id === 'string'
      ? (entry as { task_id: string }).task_id
      : null;
    const effect = (entry as { effect?: unknown }).effect;
    const reason = typeof (entry as { reason?: unknown }).reason === 'string'
      ? (entry as { reason: string }).reason
      : '';
    const magnitudeRaw = (entry as { magnitude?: unknown }).magnitude;
    const magnitude =
      typeof magnitudeRaw === 'number' && Number.isFinite(magnitudeRaw)
        ? magnitudeRaw
        : null;

    if (!reflectionId || !taskId || typeof effect !== 'string' || !VALID_REFLECTION_EFFECTS.includes(effect as ReflectionEffect['effect'])) {
      continue;
    }

    normalized.push({
      reflection_id: reflectionId,
      task_id: taskId,
      effect: effect as ReflectionEffect['effect'],
      magnitude:
        magnitude ??
        (effect === 'blocked' ? -10 : effect === 'demoted' ? -2 : 1),
      reason,
    });
  }

  return normalized.sort((a, b) => {
    const byReflection = a.reflection_id.localeCompare(b.reflection_id);
    if (byReflection !== 0) {
      return byReflection;
    }
    const byEffect = a.effect.localeCompare(b.effect);
    if (byEffect !== 0) {
      return byEffect;
    }
    return a.task_id.localeCompare(b.task_id);
  });
}

function reflectionEffectsEqual(a: ReflectionEffect[] = [], b: ReflectionEffect[] = []) {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i];
    const right = b[i];
    if (
      left.reflection_id !== right.reflection_id ||
      left.task_id !== right.task_id ||
      left.effect !== right.effect ||
      left.magnitude !== right.magnitude ||
      left.reason !== right.reason
    ) {
      return false;
    }
  }
  return true;
}

function sanitizePlanOrder(plan: PrioritizedTaskPlan): string[] {
  const orderedTaskIds = Array.isArray(plan.ordered_task_ids) ? plan.ordered_task_ids : [];
  const dependencies = Array.isArray(plan.dependencies) ? plan.dependencies : [];

  const uniqueIds = Array.from(new Set(orderedTaskIds));
  if (dependencies.length === 0) {
    return uniqueIds;
  }

  const indexMap = new Map<string, number>();
  uniqueIds.forEach((id, index) => indexMap.set(id, index));

  const adjacency = new Map<string, Set<string>>();
  const indegree = new Map<string, number>();
  uniqueIds.forEach(id => indegree.set(id, 0));

  for (const dependency of dependencies) {
    const source = dependency.source_task_id;
    const target = dependency.target_task_id;
    if (!indexMap.has(source) || !indexMap.has(target) || source === target) {
      continue;
    }
    const neighbours = adjacency.get(source) ?? new Set<string>();
    if (!neighbours.has(target)) {
      neighbours.add(target);
      adjacency.set(source, neighbours);
      indegree.set(target, (indegree.get(target) ?? 0) + 1);
    }
  }

  const ready: string[] = [];
  for (const id of uniqueIds) {
    if ((indegree.get(id) ?? 0) === 0) {
      ready.push(id);
    }
  }

  ready.sort((a, b) => (indexMap.get(a) ?? 0) - (indexMap.get(b) ?? 0));

  const result: string[] = [];

  while (ready.length > 0) {
    const current = ready.shift()!;
    result.push(current);

    const neighbours = adjacency.get(current);
    if (!neighbours) {
      continue;
    }

    for (const neighbour of neighbours) {
      const nextIndegree = (indegree.get(neighbour) ?? 0) - 1;
      indegree.set(neighbour, nextIndegree);
      if (nextIndegree === 0) {
        ready.push(neighbour);
      }
    }

    ready.sort((a, b) => (indexMap.get(a) ?? 0) - (indexMap.get(b) ?? 0));
  }

  if (result.length !== uniqueIds.length) {
    const remaining = uniqueIds.filter(id => !result.includes(id));
    result.push(...remaining);
  }

  return result;
}

function buildDependencyLinks(
  dependencies: TaskDependency[],
  ranks: Record<string, number>,
  getTitle: (taskId: string) => string
) {
  return dependencies.map(dependency => ({
    taskId: dependency.source_task_id,
    rank: ranks[dependency.source_task_id] ?? null,
    label: getTitle(dependency.source_task_id),
  }));
}

function buildDependentLinks(
  dependents: TaskDependency[],
  ranks: Record<string, number>,
  getTitle: (taskId: string) => string
) {
  return dependents.map(dependency => ({
    taskId: dependency.target_task_id,
    rank: ranks[dependency.target_task_id] ?? null,
    label: getTitle(dependency.target_task_id),
  }));
}

export function TaskList(props: TaskListProps) {
  return (
    <TaskListErrorBoundary>
      <TaskListContent {...props} />
    </TaskListErrorBoundary>
  );
}

function TaskListContent({
  plan,
  executionMetadata,
  planVersion,
  outcomeId,
  outcomeStatement,
  metadataRefreshKey,
  activeReflectionIds = [],
  adjustedPlan,
  onDiffSummary,
  sessionStatus = 'idle',
  canTriggerPrioritization = false,
  onRequestPrioritization,
  strategicScores = null,
  retryStatuses = null,
  sortingStrategy = 'balanced',
  onStrategyChange,
  onTaskMetadataUpdate,
  onActiveIdsChange,
  excludedDocumentIds = [],
  discardActionsRef,
}: TaskListProps) {
  console.log('[TaskList][Render]', {
    planIds: Array.isArray(plan?.ordered_task_ids) ? plan.ordered_task_ids.length : 'missing',
    annotationsType: typeof plan?.task_annotations,
    hasStrategicScores: Boolean(strategicScores),
    hasDiscardRef: Boolean(discardActionsRef?.current),
  });
  const renderStartRef = useRef<number>(getNowMs());
  const lastRenderLogRef = useRef<number>(0);
  renderStartRef.current = getNowMs();
  const sanitizedTaskIds = useMemo(() => sanitizePlanOrder(plan), [plan]);
  const taskAnnotations = useMemo<TaskAnnotation[]>(() => plan.task_annotations ?? [], [plan.task_annotations]);
  const removedTasksFromPlan = useMemo<TaskRemoval[]>(() => plan.removed_tasks ?? [], [plan.removed_tasks]);
  const safeDependencies = useMemo<TaskDependency[]>(
    () => (Array.isArray(plan.dependencies) ? plan.dependencies : EMPTY_DEPENDENCIES),
    [plan.dependencies]
  );
  if (!Array.isArray(plan?.ordered_task_ids)) {
    console.warn('[TaskList][Debug] plan.ordered_task_ids missing or invalid', plan?.ordered_task_ids);
  }

  // Extract movement reasons from adjusted_plan.diff (T008 requirement)
  const adjustmentReasons = useMemo(() => {
    const reasonMap: Record<string, string> = {};
    if (adjustedPlan?.diff?.moved) {
      adjustedPlan.diff.moved.forEach((movement) => {
        if (movement.task_id && movement.reason) {
          reasonMap[movement.task_id] = movement.reason;
        }
      });
    }
    return reasonMap;
  }, [adjustedPlan]);
  const annotationById = useMemo(() => {
    const map = new Map<string, TaskAnnotation>();
    taskAnnotations.forEach(annotation => {
      if (annotation && typeof annotation.task_id === 'string') {
        map.set(annotation.task_id, annotation);
      }
    });
    return map;
  }, [taskAnnotations]);
  const removalById = useMemo(() => {
    const map = new Map<string, TaskRemoval>();
    removedTasksFromPlan.forEach(removal => {
      if (removal && typeof removal.task_id === 'string') {
        map.set(removal.task_id, removal);
      }
    });
    return map;
  }, [removedTasksFromPlan]);
  const movementAnnotations = useMemo(
    () =>
      taskAnnotations.map(annotation => ({
        task_id: annotation.task_id,
        state: annotation.state,
        confidence_delta:
          typeof annotation.confidence_delta === 'number' ? annotation.confidence_delta : null,
        manual_override: annotation.manual_override ?? false,
      })),
    [taskAnnotations]
  );
  const { movementMap, highlightedIds, flashTask } = useTaskDiff(sanitizedTaskIds, {
    annotations: movementAnnotations,
  });
  const scrollToTask = useScrollToTask({ flashTask });

  const statusNote = executionMetadata?.status_note ?? null;
  const hasToolFailures = Boolean(executionMetadata && executionMetadata.error_count > 0);
  const failedTools = executionMetadata?.failed_tools ?? [];

  const [taskLookup, setTaskLookup] = useState<TaskLookup>({});
  const lastMetadataRequestKeyRef = useRef<string | null>(null);
  const [priorityState, setPriorityState] = useState<PriorityState>({
    statuses: {},
    reasons: {},
    ranks: {},
  });
  const [manualTaskStore, setManualTaskStore] = useLocalStorage<
    Record<string, CachedManualTask[]>
  >('manual-task-cache', {});
  const manualTaskCacheKey = outcomeId ?? 'global';
  const cachedManualTasks = manualTaskStore[manualTaskCacheKey] ?? [];
  const manualTaskIds = useMemo(() => {
    const ids = new Set<string>();
    cachedManualTasks.forEach(task => ids.add(task.id));
    Object.entries(taskLookup).forEach(([taskId, metadata]) => {
      if (metadata?.isManual) {
        ids.add(taskId);
      }
    });
    return Array.from(ids);
  }, [cachedManualTasks, taskLookup]);
  const [isManualTaskModalOpen, setIsManualTaskModalOpen] = useState(false);
  const [prioritizingTasks, setPrioritizingTasks] = useState<Record<string, number>>({});
  const autoPrioritizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingAutoPrioritizationRef = useRef(false);
  const previousSessionStatusRef = useRef<SessionStatus | null>(null);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [recentlyDiscarded, setRecentlyDiscarded] = useState<Set<string>>(new Set());
  const [discardCandidates, setDiscardCandidates] = useState<DiscardCandidate[]>([]);
  const [showDiscardReview, setShowDiscardReview] = useState(false);
  const [dependencyStore, setDependencyStore] = useLocalStorage<DependencyOverrideStore>(DEPENDENCY_OVERRIDE_STORAGE_KEY, {});
  const [dismissedDiscardStore, setDismissedDiscardStore] = useLocalStorage<Record<string, string[]>>(
    'dismissed-discard-ids',
    {}
  );
  useEffect(() => {
    if (!onTaskMetadataUpdate) {
      return;
    }
    const summary: Record<string, { title: string }> = {};
    Object.entries(taskLookup).forEach(([taskId, metadata]) => {
      summary[taskId] = { title: metadata.title };
    });
    onTaskMetadataUpdate(summary);
  }, [taskLookup, onTaskMetadataUpdate]);

  useEffect(() => {
    console.log('[TaskList][StrategyChange]', {
      strategy: sortingStrategy,
      taskCount: sanitizedTaskIds.length,
      scoredCount: Object.keys(strategicScores ?? {}).length,
      scoresSample: Object.entries(strategicScores ?? {}).slice(0, 3),
    });
  }, [sortingStrategy, sanitizedTaskIds.length, strategicScores]);
  const outcomeKey = outcomeId ?? 'global';
  const safeDependencyStore = useMemo(
    () => ensureRecord<DependencyOverrideEntry>(dependencyStore),
    [dependencyStore]
  );
  const dependencyOverrides = useMemo(
    () => ensureRecord<DependencyOverrideEntry>(safeDependencyStore[outcomeKey]),
    [safeDependencyStore, outcomeKey]
  );
  const rejectedDiscardIdsRef = useRef<Set<string>>(new Set());
  const dismissedIds = useMemo(
    () => new Set(dismissedDiscardStore[outcomeKey] ?? []),
    [dismissedDiscardStore, outcomeKey]
  );
  useEffect(() => {
    rejectedDiscardIdsRef.current = new Set(dismissedIds);
  }, [dismissedIds]);
  const previousPlanVersionRef = useRef(planVersion);



  const updateDependencyOverrides = useCallback(
    (
      updater: (current: Record<string, DependencyOverrideEntry>) => Record<string, DependencyOverrideEntry>
    ) => {
      setDependencyStore(prev => {
        const safePrev = ensureRecord<DependencyOverrideEntry>(prev);
        const current = ensureRecord<DependencyOverrideEntry>(safePrev[outcomeKey]);
        const nextOutcomeEntry = updater(current);
        return {
          ...safePrev,
          [outcomeKey]: nextOutcomeEntry,
        };
      });
    },
    [outcomeKey, setDependencyStore]
  );

  const persistDismissedDiscards = useCallback(
    (ids: Set<string>) => {
      setDismissedDiscardStore(prev => ({
        ...prev,
        [outcomeKey]: Array.from(ids),
      }));
    },
    [outcomeKey, setDismissedDiscardStore]
  );

  const applyManualOverride = useCallback(
    (taskId: string, override: ManualOverrideState | null) => {
      setTaskLookup(prev => {
        const current = prev[taskId];
        if (!current) {
          return prev;
        }
        return {
          ...prev,
          [taskId]: {
            ...current,
            manualOverride: override ? { ...override } : null,
          },
        };
      });
    },
    []
  );

  const storageKey = outcomeId ? `priority-state:${outcomeId}` : null;
  const previousPlanRef = useRef<string[] | null>(null);
  const priorityStateRef = useRef<PriorityState>(priorityState);
  const metadataRef = useRef<Record<string, TaskRenderNode>>({});
  const [hasLoadedStoredState, setHasLoadedStoredState] = useState(false);
  const discardTimeoutRef = useRef<number | null>(null);
  const previousStorageKeyRef = useRef<string | null>(null);
  const didUnmountRef = useRef(false);
  const hiddenDueToReflectionRef = useRef<Set<string>>(new Set());
  const manualStatusAttemptsRef = useRef<Record<string, number>>({});
  const manualDropNotifiedRef = useRef<Set<string>>(new Set());
  const manualTimeoutNotifiedRef = useRef<Set<string>>(new Set());
  const [manualStatuses, setManualStatuses] = useState<Record<string, ManualTaskBadgeStatus>>({});
  const [manualStatusDetails, setManualStatusDetails] = useState<
    Record<string, string | undefined>
  >({});
  const [manualEditTask, setManualEditTask] = useState<{ id: string; title: string } | null>(null);

  useEffect(() => {
    priorityStateRef.current = priorityState;
  }, [priorityState]);

  const persistState = useCallback(
    (state: PriorityState) => {
      if (!storageKey || typeof window === 'undefined') {
        return;
      }
      window.localStorage.setItem(storageKey, JSON.stringify(state));
    },
    [storageKey]
  );

  const updatePriorityState = useCallback(
    (producer: (prev: PriorityState) => PriorityState) => {
      setPriorityState(prev => {
        const next = producer(prev);
        if (next === prev) {
          return prev;
        }
        priorityStateRef.current = next;
        persistState(next);
        return next;
      });
    },
    [persistState]
  );

  const attachManualTask = useCallback(
    (taskId: string, taskText: string, { flash = true }: { flash?: boolean } = {}) => {
      const existingLookup = taskLookup[taskId];

      setTaskLookup(prev => {
        const existing = prev[taskId];
        const nextEntry = {
          title: taskText,
          documentId: existing?.documentId ?? null,
          documentName: existing?.documentName ?? null,
          category: existing?.category ?? null,
          rationale: existing?.rationale ?? null,
          sourceText: existing?.sourceText ?? taskText,
          isManual: true,
        };
        if (
          existing &&
          existing.title === nextEntry.title &&
          existing.sourceText === nextEntry.sourceText &&
          existing.isManual
        ) {
          return prev;
        }
        return {
          ...prev,
          [taskId]: nextEntry,
        };
      });

      const previousNode = metadataRef.current[taskId];
      metadataRef.current[taskId] = {
        id: taskId,
        title: taskText,
        documentId: previousNode?.documentId ?? existingLookup?.documentId ?? null,
        documentName: previousNode?.documentName ?? existingLookup?.documentName ?? null,
        category: previousNode?.category ?? null,
        rationale: previousNode?.rationale ?? null,
        sourceText: previousNode?.sourceText ?? taskText,
        confidence: previousNode?.confidence ?? null,
        confidenceDelta: previousNode?.confidenceDelta ?? null,
        dependencies: previousNode?.dependencies ?? [],
        dependents: previousNode?.dependents ?? [],
        movement: previousNode?.movement ?? { type: 'manual' as const },
        planRank: previousNode?.planRank ?? null,
        reasoning: previousNode?.reasoning ?? null,
        dependencyNotes: previousNode?.dependencyNotes ?? null,
        manualOverride: true,
        isManual: true,
        state: previousNode?.state ?? 'manual_override',
        removalReason: previousNode?.removalReason ?? null,
      };

      updatePriorityState(prev => {
        if (prev.statuses[taskId] === 'active') {
          return prev;
        }
        const next: PriorityState = {
          statuses: { ...prev.statuses, [taskId]: 'active' },
          reasons: { ...prev.reasons },
          ranks: { ...prev.ranks },
        };
        if (!next.ranks[taskId]) {
          const fallbackRank = sanitizedTaskIds.length + Object.keys(prev.ranks).length + 1;
          next.ranks[taskId] = fallbackRank;
        }
        return next;
      });

      if (flash) {
        flashTask(taskId);
      }
    },
    [flashTask, sanitizedTaskIds.length, setTaskLookup, taskLookup, updatePriorityState]
  );

  const triggerAutoPrioritization = useCallback(() => {
    if (!onRequestPrioritization) {
      return;
    }

    if (!canTriggerPrioritization) {
      pendingAutoPrioritizationRef.current = true;
      return;
    }

    pendingAutoPrioritizationRef.current = false;

    if (autoPrioritizeTimeoutRef.current) {
      clearTimeout(autoPrioritizeTimeoutRef.current);
    }

    autoPrioritizeTimeoutRef.current = setTimeout(() => {
      void onRequestPrioritization();
      autoPrioritizeTimeoutRef.current = null;
    }, 500);
  }, [canTriggerPrioritization, onRequestPrioritization]);

  const handleManualTaskCreated = useCallback(
    ({
      taskId,
      taskText,
      prioritizationTriggered,
    }: {
      taskId: string;
      taskText: string;
      prioritizationTriggered: boolean;
    }) => {
      attachManualTask(taskId, taskText);
      setManualTaskStore(prev => {
        const current = prev[manualTaskCacheKey] ?? [];
        if (current.some(task => task.id === taskId)) {
          return prev;
        }
        return {
          ...prev,
          [manualTaskCacheKey]: [...current, { id: taskId, title: taskText }],
        };
      });
      if (prioritizationTriggered && outcomeId) {
        setPrioritizingTasks(prev => ({ ...prev, [taskId]: Date.now() }));
        triggerAutoPrioritization();
        setManualStatuses(prev => ({ ...prev, [taskId]: 'analyzing' }));
        manualStatusAttemptsRef.current[taskId] = 0;
        setManualStatusDetails(prev => ({ ...prev, [taskId]: undefined }));
      } else if (!prioritizationTriggered) {
        // Show info toast when no re-prioritization is triggered
        toast.info('Task added. Set an outcome to enable auto-prioritization.');
      }
    },
    [
      attachManualTask,
      manualTaskCacheKey,
      outcomeId,
      setManualTaskStore,
      triggerAutoPrioritization,
    ]
  );

  const handleDuplicateTaskFound = useCallback(
    (taskId: string) => {
      setIsManualTaskModalOpen(false);
      scrollToTask(taskId);
      flashTask(taskId);
      toast.info('Showing existing task');
    },
    [flashTask, scrollToTask]
  );

  const handleManualTaskUpdated = useCallback(
    (taskId: string, taskText: string) => {
      setManualEditTask(null);
      attachManualTask(taskId, taskText, { flash: true });
      setManualStatuses(prev => ({ ...prev, [taskId]: 'analyzing' }));
      manualStatusAttemptsRef.current[taskId] = 0;
      setManualStatusDetails(prev => ({ ...prev, [taskId]: undefined }));
    },
    [attachManualTask]
  );

  const handleManualModalOpenChange = useCallback(
    (open: boolean) => {
      setIsManualTaskModalOpen(open);
      if (!open) {
        setManualEditTask(null);
      }
    },
    []
  );

  const handleTaskTitleChange = useCallback(
    (taskId: string, nextTitle: string) => {
      if (!nextTitle) {
        return;
      }
      setTaskLookup(prev => {
        const current = prev[taskId];
        if (current && current.title === nextTitle) {
          return prev;
        }
        const nextEntry = {
          ...current,
          title: nextTitle,
          sourceText: current?.sourceText ?? nextTitle,
        };
        return {
          ...prev,
          [taskId]: nextEntry,
        };
      });
      metadataRef.current[taskId] = {
        ...(metadataRef.current[taskId] ?? {
          id: taskId,
          title: nextTitle,
          category: null,
          rationale: null,
          sourceText: nextTitle,
          confidence: null,
          confidenceDelta: null,
          dependencies: [],
          dependents: [],
          movement: undefined,
          planRank: null,
          reasoning: null,
          dependencyNotes: null,
          manualOverride: false,
          isManual: false,
          state: 'active',
          removalReason: null,
        }),
        title: nextTitle,
        sourceText: metadataRef.current[taskId]?.sourceText ?? nextTitle,
      };
      setManualTaskStore(prev => {
        const current = prev[manualTaskCacheKey] ?? [];
        if (!current.length) {
          return prev;
        }
        let changed = false;
        const updated = current.map(entry => {
          if (entry.id === taskId) {
            changed = true;
            return { ...entry, title: nextTitle };
          }
          return entry;
        });
        if (!changed) {
          return prev;
        }
        return {
          ...prev,
          [manualTaskCacheKey]: updated,
        };
      });
    },
    [manualTaskCacheKey, setManualTaskStore, setTaskLookup]
  );

  const handleTaskEditSuccess = useCallback(
    (taskId: string, { prioritizationTriggered }: { prioritizationTriggered: boolean }) => {
      if (prioritizationTriggered && outcomeId) {
        setPrioritizingTasks(prev => ({ ...prev, [taskId]: Date.now() }));
        triggerAutoPrioritization();
      } else if (!prioritizationTriggered) {
        // Show info toast when no re-prioritization is triggered after edit
        toast.info('Task updated. Set an outcome to enable re-prioritization.');
      }
    },
    [outcomeId, triggerAutoPrioritization]
  );

  useEffect(() => {
    return () => {
      if (autoPrioritizeTimeoutRef.current) {
        clearTimeout(autoPrioritizeTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (
      previousSessionStatusRef.current === 'running' &&
      sessionStatus !== 'running'
    ) {
      setPrioritizingTasks({});
    }
    previousSessionStatusRef.current = sessionStatus;
  }, [sessionStatus]);

  useEffect(() => {
    if (!pendingAutoPrioritizationRef.current) {
      return;
    }
    if (!canTriggerPrioritization) {
      return;
    }
    triggerAutoPrioritization();
  }, [canTriggerPrioritization, triggerAutoPrioritization]);

  useEffect(() => {
    setPrioritizingTasks({});
  }, [planVersion]);

  useEffect(() => {
    if (previousStorageKeyRef.current !== storageKey) {
      previousStorageKeyRef.current = storageKey;
      setHasLoadedStoredState(false);
      setPriorityState({
        statuses: {},
        reasons: {},
        ranks: {},
      });
      priorityStateRef.current = {
        statuses: {},
        reasons: {},
        ranks: {},
      };
      metadataRef.current = {};
      setTaskLookup({});
    }
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') {
      return;
    }

    if (hasLoadedStoredState) {
      return;
    }

    const raw = window.localStorage.getItem(storageKey);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as PriorityState;
        setPriorityState({
          statuses: parsed.statuses ?? {},
          reasons: parsed.reasons ?? {},
          ranks: parsed.ranks ?? {},
        });
        priorityStateRef.current = {
          statuses: parsed.statuses ?? {},
          reasons: parsed.reasons ?? {},
          ranks: parsed.ranks ?? {},
        };
      } catch (error) {
        console.error('[TaskList] Failed to parse stored priority state', error);
        window.localStorage.removeItem(storageKey);
      }
    }

    setHasLoadedStoredState(true);
  }, [storageKey]);

  useEffect(() => {
    if (!cachedManualTasks.length) {
      return;
    }
    cachedManualTasks.forEach(task => {
      attachManualTask(task.id, task.title, { flash: false });
    });
  }, [attachManualTask, cachedManualTasks]);

  useEffect(() => {
    if (!cachedManualTasks.length) {
      return;
    }
    const planIds = new Set(sanitizedTaskIds);
    const remaining = cachedManualTasks.filter(task => !planIds.has(task.id));
    if (remaining.length === cachedManualTasks.length) {
      return;
    }
    setManualTaskStore(prev => ({
      ...prev,
      [manualTaskCacheKey]: remaining,
    }));
  }, [cachedManualTasks, manualTaskCacheKey, sanitizedTaskIds, setManualTaskStore]);

  const flagRecentlyDiscarded = useCallback((ids: string[]) => {
    if (typeof window === 'undefined') {
      return;
    }
    if (discardTimeoutRef.current) {
      window.clearTimeout(discardTimeoutRef.current);
    }
    if (ids.length === 0) {
      setRecentlyDiscarded(new Set());
      discardTimeoutRef.current = null;
      return;
    }
    setRecentlyDiscarded(new Set(ids));
    discardTimeoutRef.current = window.setTimeout(() => {
      setRecentlyDiscarded(new Set());
      discardTimeoutRef.current = null;
    }, 2000);
  }, []);

  const handleToggleDiscardCandidate = useCallback((taskId: string, approved: boolean) => {
    setDiscardCandidates(prev =>
      prev.map(candidate =>
        candidate.taskId === taskId ? { ...candidate, approved } : candidate
      )
    );
  }, []);

  const handleApplyDiscardDecisions = useCallback(() => {
    setDiscardCandidates(prev => {
      if (prev.length === 0) {
        setShowDiscardReview(false);
        return prev;
      }

      const approved = prev.filter(candidate => candidate.approved);
      const rejected = prev.filter(candidate => !candidate.approved);

      if (approved.length === 0) {
        toast.info('Select at least one task to discard, or Cancel All to keep everything.');
        setShowDiscardReview(false);
        const rejectionSet = rejectedDiscardIdsRef.current;
        prev.forEach(candidate => rejectionSet.add(candidate.taskId));
        return [];
      }

      updatePriorityState(current => {
        const next: PriorityState = {
          statuses: { ...current.statuses },
          reasons: { ...current.reasons },
          ranks: { ...current.ranks },
        };

        approved.forEach(candidate => {
          next.statuses[candidate.taskId] = 'discarded';
          next.reasons[candidate.taskId] = candidate.reason;
          if (typeof candidate.previousRank === 'number') {
            next.ranks[candidate.taskId] = candidate.previousRank;
          } else if (!next.ranks[candidate.taskId]) {
            next.ranks[candidate.taskId] = Object.keys(current.ranks).length + 1;
          }
        });

        rejected.forEach(candidate => {
          if (next.statuses[candidate.taskId] === 'discarded') {
            next.statuses[candidate.taskId] = 'active';
          }
          if (next.reasons[candidate.taskId]) {
            delete next.reasons[candidate.taskId];
          }
          rejectedDiscardIdsRef.current.add(candidate.taskId);
        });

        return next;
      });

      const rejectionSet = rejectedDiscardIdsRef.current;
      approved.forEach(candidate => rejectionSet.delete(candidate.taskId));
      rejected.forEach(candidate => rejectionSet.add(candidate.taskId));
      persistDismissedDiscards(rejectionSet);

      flagRecentlyDiscarded(approved.map(candidate => candidate.taskId));
      toast.success(
        `${approved.length} ${approved.length === 1 ? 'task' : 'tasks'} discarded, ${
          rejected.length
        } kept active`
      );
      setShowDiscardReview(false);
      return [];
    });
  }, [flagRecentlyDiscarded, updatePriorityState]);

  const handleCancelAllDiscards = useCallback(() => {
    setDiscardCandidates(prev => {
      if (prev.length > 0) {
        toast.info('Discard cancelled. All tasks kept active.');
        const rejectionSet = rejectedDiscardIdsRef.current;
        prev.forEach(candidate => rejectionSet.add(candidate.taskId));
        persistDismissedDiscards(rejectionSet);
      }
      return [];
    });
    setShowDiscardReview(false);
  }, [persistDismissedDiscards]);

  const handleDiscardModalOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        handleCancelAllDiscards();
      } else if (discardCandidates.length > 0) {
        setShowDiscardReview(true);
      }
    },
    [discardCandidates.length, handleCancelAllDiscards]
  );

  useEffect(() => {
    // Reset unmount flag on mount (important for HMR)
    didUnmountRef.current = false;

    return () => {
      didUnmountRef.current = true;
      if (discardTimeoutRef.current) {
        window.clearTimeout(discardTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!outcomeId) {
      previousPlanRef.current = sanitizedTaskIds;
      return;
    }

    // Wait for stored state to be loaded before processing discards
    // Otherwise, discarded tasks will appear as candidates again
    if (!hasLoadedStoredState) {
      return;
    }

    if (previousPlanVersionRef.current !== planVersion) {
      // Re-seed rejected discards from persisted store when plan version changes
      rejectedDiscardIdsRef.current = new Set(dismissedIds);
      previousPlanVersionRef.current = planVersion;
    }

    const prevPlan = previousPlanRef.current ?? [];
    const currentState = priorityStateRef.current;

    const nextState: PriorityState = {
      statuses: { ...currentState.statuses },
      reasons: { ...currentState.reasons },
      ranks: { ...currentState.ranks },
    };

    let stateChanged = false;
    let ranksChanged = false;
    const newlyRemovedIds: string[] = [];
    const manualTaskIdSet = new Set(manualTaskIds);
    const planIdSet = new Set(sanitizedTaskIds);
    const candidateIds = new Set<string>();

    sanitizedTaskIds.forEach((taskId, index) => {
      const annotation = annotationById.get(taskId);
      const previousStatus = nextState.statuses[taskId];

      if (!previousStatus || previousStatus === 'discarded') {
        nextState.statuses[taskId] = 'active';
        stateChanged = true;
      }

      // 🔒 SAFEGUARD: Never auto-complete/discard tasks from agent annotations
      // Only manual user actions via handleToggleCompleted/handleApplyDiscardDecisions should change status
      // This prevents silent task disappearance without user knowledge
      if (annotation?.state === 'completed' && nextState.statuses[taskId] !== 'completed') {
        // Log warning but don't auto-apply
        console.warn('[TaskList] ⚠️ Agent tried to mark task as completed:', {
          taskId: taskId.slice(0, 16) + '...',
          annotationState: annotation.state,
          currentStatus: nextState.statuses[taskId]
        });
        // Keep status as 'active' - user must manually mark as complete
      }

      if (annotation?.state === 'discarded' && nextState.statuses[taskId] !== 'discarded') {
        // Log warning but don't auto-apply
        console.warn('[TaskList] ⚠️ Agent tried to mark task as discarded:', {
          taskId: taskId.slice(0, 16) + '...',
          annotationState: annotation.state,
          currentStatus: nextState.statuses[taskId]
        });
        // Keep status as 'active' - user must review via DiscardReviewModal
      }

      const desiredRank = index + 1;
      if (nextState.ranks[taskId] !== desiredRank) {
        nextState.ranks[taskId] = desiredRank;
        ranksChanged = true;
      }

      if (annotation?.removal_reason) {
        if (nextState.reasons[taskId] !== annotation.removal_reason) {
          nextState.reasons[taskId] = annotation.removal_reason;
          stateChanged = true;
        }
      } else if (nextState.reasons[taskId] && nextState.statuses[taskId] !== 'discarded') {
        delete nextState.reasons[taskId];
        stateChanged = true;
      }
    });

    if (prevPlan.length > 0) {
      prevPlan.forEach(taskId => {
        if (!planIdSet.has(taskId)) {
          if (nextState.statuses[taskId] !== 'discarded') {
            if (!nextState.ranks[taskId]) {
              nextState.ranks[taskId] =
                sanitizedTaskIds.length + manualTaskIdSet.size + Object.keys(nextState.ranks).length + 1;
              ranksChanged = true;
            }
            if (nextState.reasons[taskId]) {
              delete nextState.reasons[taskId];
              stateChanged = true;
            }
            if (!candidateIds.has(taskId)) {
              candidateIds.add(taskId);
              newlyRemovedIds.push(taskId);
            }
          }
        }
      });
    }

    removedTasksFromPlan.forEach(removal => {
      if (planIdSet.has(removal.task_id)) {
        return;
      }
      if (nextState.statuses[removal.task_id] === 'discarded') {
        return;
      }
      if (!candidateIds.has(removal.task_id)) {
        candidateIds.add(removal.task_id);
        newlyRemovedIds.push(removal.task_id);
      }
      if (
        typeof removal.previous_rank === 'number' &&
        nextState.ranks[removal.task_id] !== removal.previous_rank
      ) {
        nextState.ranks[removal.task_id] = removal.previous_rank;
        ranksChanged = true;
      }
    });

    if (stateChanged || ranksChanged) {
      updatePriorityState(() => nextState);
    }

    if (candidateIds.size > 0) {
      const fallbackReason =
        statusNote && statusNote.trim().length > 0 ? statusNote.trim() : DEFAULT_REMOVAL_REASON;
      const rejectionSet = rejectedDiscardIdsRef.current;
      const candidateDetails: DiscardCandidate[] = Array.from(candidateIds)
        .map(taskId => {
          const removal = removalById.get(taskId);
          const annotation = annotationById.get(taskId);
          const title =
            taskLookup[taskId]?.title ??
            metadataRef.current[taskId]?.title ??
            formatTaskId(taskId);
          const reason =
            removal?.removal_reason ??
            annotation?.removal_reason ??
            fallbackReason ??
            DEFAULT_REMOVAL_REASON;
          const previousRank =
            typeof removal?.previous_rank === 'number'
              ? removal.previous_rank
              : nextState.ranks[taskId] ?? null;
          const isManual = taskLookup[taskId]?.isManual ?? manualTaskIdSet.has(taskId);
          return {
            taskId,
            title,
            reason,
            previousRank: typeof previousRank === 'number' ? previousRank : null,
            isManual,
            approved: true,
          };
        })
        .sort((a, b) => {
          if (typeof a.previousRank === 'number' && typeof b.previousRank === 'number') {
            return a.previousRank - b.previousRank;
          }
          if (typeof a.previousRank === 'number') {
            return -1;
          }
          if (typeof b.previousRank === 'number') {
            return 1;
          }
          return a.title.localeCompare(b.title);
        });

      const filteredCandidates = candidateDetails.filter(candidate => !rejectionSet.has(candidate.taskId));
      if (filteredCandidates.length === 0) {
        setDiscardCandidates(prev => (prev.length === 0 ? prev : []));
        setShowDiscardReview(false);
      } else {
        setDiscardCandidates(prev => {
          const approvalMap = new Map(prev.map(candidate => [candidate.taskId, candidate.approved]));
          const merged = filteredCandidates.map(candidate => ({
            ...candidate,
            approved: approvalMap.get(candidate.taskId) ?? candidate.approved,
          }));
          const isSame =
            merged.length === prev.length &&
            merged.every((candidate, index) => {
              const previous = prev[index];
              return (
                previous &&
                previous.taskId === candidate.taskId &&
                previous.reason === candidate.reason &&
                previous.title === candidate.title &&
                previous.previousRank === candidate.previousRank &&
                previous.isManual === candidate.isManual &&
                previous.approved === candidate.approved
              );
            });
          return isSame ? prev : merged;
        });
        setShowDiscardReview(true);
      }
    } else {
      setDiscardCandidates(prev => (prev.length === 0 ? prev : []));
      setShowDiscardReview(false);
    }

    if (onDiffSummary) {
      const isInitial = planVersion <= 1;
      const orderChanged = prevPlan.length === 0 ? false : !arraysEqual(prevPlan, sanitizedTaskIds);
      const hasChanges = isInitial ? false : orderChanged || newlyRemovedIds.length > 0;
      onDiffSummary({ hasChanges, isInitial });
    }

    previousPlanRef.current = sanitizedTaskIds;
  }, [
    outcomeId,
    sanitizedTaskIds,
    planVersion,
    onDiffSummary,
    updatePriorityState,
    statusNote,
    annotationById,
    removalById,
    removedTasksFromPlan,
    manualTaskIds,
    taskLookup,
    hasLoadedStoredState,
  ]);

  const trackedTaskIds = useMemo(() => {
    const ids = new Set<string>();
    sanitizedTaskIds.forEach(id => ids.add(id));
    Object.keys(priorityState.statuses).forEach(id => ids.add(id));
    removedTasksFromPlan.forEach(removal => {
      if (removal?.task_id) {
        ids.add(removal.task_id);
      }
    });
    discardCandidates.forEach(candidate => ids.add(candidate.taskId));
    return Array.from(ids).sort();
  }, [sanitizedTaskIds, priorityState.statuses, removedTasksFromPlan, discardCandidates]);

  const metadataRequestKey = useMemo(
    () => `${trackedTaskIds.join('|')}::${outcomeStatement ?? ''}::${metadataRefreshKey ?? 0}`,
    [trackedTaskIds, outcomeStatement, metadataRefreshKey]
  );

  useEffect(() => {
    if (trackedTaskIds.length === 0) {
      setTaskLookup({});
      lastMetadataRequestKeyRef.current = null;
      setIsLoadingTasks(false);
      return;
    }

    if (lastMetadataRequestKeyRef.current === metadataRequestKey) {
      return;
    }

    const loadTasks = async () => {
      try {
        setIsLoadingTasks(true);
        setTaskError(null);

        const response = await fetch('/api/tasks/metadata', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            taskIds: trackedTaskIds,
            outcome: outcomeStatement ?? null,
          }),
        });

        if (!response.ok) {
          throw new Error(`Metadata request failed with status ${response.status}`);
        }

        const payload = (await response.json()) as {
          tasks?: Array<{
            task_id: string;
            title: string;
            document_id?: string | null;
            document_name?: string | null;
            category?: 'leverage' | 'neutral' | 'overhead' | null;
            rationale?: string | null;
            original_text?: string | null;
            is_manual?: boolean;
            manual_override?: ManualOverrideState | null;
            reflection_effects?: unknown;
          }>;
        };

        const returnedIds = new Set((payload.tasks ?? []).map(task => task.task_id));
        const missingMetadataIds = trackedTaskIds.filter(id => !returnedIds.has(id));
        if (missingMetadataIds.length > 0) {
          console.warn('[TaskList] Missing metadata for task IDs', {
            missingCount: missingMetadataIds.length,
            sampleMissing: missingMetadataIds.slice(0, 5),
          });
        }

        if (didUnmountRef.current) {
          return;
        }

        // ✅ FIX: Only set cache key AFTER successful data load
        lastMetadataRequestKeyRef.current = metadataRequestKey;

        setTaskLookup(prev => {
          const next = { ...prev };
          let changed = false;
          let effectsWithData = 0;
          const effectsSample: Array<{ id: string; effects: number }> = [];
          for (const task of payload.tasks ?? []) {
            const manualOverride = task.manual_override ?? null;
            const reflectionEffects = normalizeReflectionEffects(task.reflection_effects);
            const nextEntry = {
              title: task.title ?? formatTaskId(task.task_id),
              documentId: task.document_id ?? null,
              documentName: task.document_name ?? null,
              category: task.category ?? null,
              rationale: task.rationale ?? null,
              sourceText: task.original_text ?? null,
              isManual: Boolean(task.is_manual),
              manualOverride,
              reflectionEffects,
            };

            const currentEntry = prev[task.task_id];
            if (
              !currentEntry ||
              currentEntry.title !== nextEntry.title ||
              currentEntry.documentId !== nextEntry.documentId ||
              currentEntry.documentName !== nextEntry.documentName ||
              currentEntry.category !== nextEntry.category ||
              currentEntry.rationale !== nextEntry.rationale ||
              currentEntry.sourceText !== nextEntry.sourceText ||
              currentEntry.isManual !== nextEntry.isManual ||
              currentEntry.manualOverride !== nextEntry.manualOverride ||
              !reflectionEffectsEqual(currentEntry.reflectionEffects, reflectionEffects)
            ) {
              next[task.task_id] = nextEntry;
              changed = true;
            }

            if (reflectionEffects.length > 0) {
              effectsWithData += 1;
              if (effectsSample.length < 5) {
                effectsSample.push({ id: task.task_id, effects: reflectionEffects.length });
              }
            }
          }

          if (effectsWithData > 0) {
            console.log('[TaskList] Reflection effects mapped', {
              tasksWithEffects: effectsWithData,
              sample: effectsSample,
            });
          }

          if (!changed && Object.keys(next).length === Object.keys(prev).length) {
            return prev;
          }

          return next;
        });

        const fetchedIds = new Set((payload.tasks ?? []).map(task => task.task_id));
      } catch (error) {
        if (didUnmountRef.current) {
          return;
        }
        // ✅ FIX: Don't cache failed requests - allow retry
        console.error('[TaskList] Failed to load task metadata', error);
        setTaskError('Unable to load task details. Showing fallback task IDs.');
      } finally {
        if (!didUnmountRef.current) {
          setIsLoadingTasks(false);
        }
      }
    };

    void loadTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metadataRequestKey]);

  const missingLookupRef = useRef<Set<string>>(new Set());

  const getTaskTitle = useCallback(
    (taskId: string) => {
      const task = taskLookup[taskId];
      if (!task) {
        const seen = missingLookupRef.current;
        if (!seen.has(taskId)) {
          console.log('[TaskList] 🔍 No task found in lookup for ID:', taskId);
          seen.add(taskId);
        }
        return formatTaskId(taskId);
      }
      if (!task.title) {
        const seen = missingLookupRef.current;
        if (!seen.has(taskId)) {
          console.log('[TaskList] 🔍 Task found but title is missing for ID:', taskId);
          seen.add(taskId);
        }
        return formatTaskId(taskId);
      }
      return task.title;
    },
    [taskLookup]
  );

  const dependenciesByTarget = useMemo(() => {
    const map: Record<string, TaskDependency[]> = {};
    for (const dependency of safeDependencies) {
      map[dependency.target_task_id] ??= [];
      map[dependency.target_task_id].push(dependency);
    }
    return map;
  }, [safeDependencies]);

  const dependentsBySource = useMemo(() => {
    const map: Record<string, TaskDependency[]> = {};
    for (const dependency of safeDependencies) {
      map[dependency.source_task_id] ??= [];
      map[dependency.source_task_id].push(dependency);
    }
    return map;
  }, [safeDependencies]);

  const handleRemoveDependency = useCallback(
    (targetId: string, sourceId: string) => {
      updateDependencyOverrides(current => {
        const next = { ...current };
        const targetEntry: DependencyOverrideEntry = { ...(next[targetId] ?? {}) };
        const sourceEntry: DependencyOverrideEntry = { ...(next[sourceId] ?? {}) };
        const baseDependencies = targetEntry.dependencies ?? dependenciesByTarget[targetId] ?? [];
        const baseDependents = sourceEntry.dependents ?? dependentsBySource[sourceId] ?? [];
        targetEntry.dependencies = baseDependencies.filter(dep => dep.source_task_id !== sourceId);
        sourceEntry.dependents = baseDependents.filter(dep => dep.target_task_id !== targetId);
        next[targetId] = targetEntry;
        next[sourceId] = sourceEntry;
        return next;
      });
    },
    [updateDependencyOverrides, dependenciesByTarget, dependentsBySource]
  );

  const handleAddDependency = useCallback(
    (targetId: string, sourceId: string, relationship: TaskDependency['relationship_type']) => {
      if (!sourceId || targetId === sourceId) {
        return;
      }
      updateDependencyOverrides(current => {
        const next = { ...current };
        const targetEntry: DependencyOverrideEntry = { ...(next[targetId] ?? {}) };
        const sourceEntry: DependencyOverrideEntry = { ...(next[sourceId] ?? {}) };
        const baseDependencies = targetEntry.dependencies ?? dependenciesByTarget[targetId] ?? [];
        const alreadyLinked = baseDependencies.some(dep => dep.source_task_id === sourceId);
        if (alreadyLinked) {
          return next;
        }
        const newDependency: TaskDependency = {
          source_task_id: sourceId,
          target_task_id: targetId,
          relationship_type: relationship,
          confidence: 1,
          detection_method: 'ai_inference',
        };
        targetEntry.dependencies = [...baseDependencies, newDependency];
        const baseDependents = sourceEntry.dependents ?? dependentsBySource[sourceId] ?? [];
        sourceEntry.dependents = [...baseDependents, newDependency];
        next[targetId] = targetEntry;
        next[sourceId] = sourceEntry;
        return next;
      });
    },
    [updateDependencyOverrides, dependenciesByTarget, dependentsBySource]
  );

  const baseNodeMap = useMemo(() => {
    const map: Record<string, TaskRenderNode> = {};
    sanitizedTaskIds.forEach((taskId, index) => {
      const annotation = annotationById.get(taskId);
      const removal = removalById.get(taskId);
      const lookup = taskLookup[taskId];
      const confidence =
        typeof annotation?.confidence === 'number'
          ? annotation.confidence
          : plan.confidence_scores[taskId] ?? null;
      const confidenceDelta =
        typeof annotation?.confidence_delta === 'number' ? annotation.confidence_delta : null;
      const reasoning = annotation?.reasoning ?? null;
      const dependencyNotes = annotation?.dependency_notes ?? null;
      const manualOverride = annotation?.manual_override ?? false;
      const state = annotation?.state;
      const removalReason = annotation?.removal_reason ?? removal?.removal_reason ?? null;

      const overrides = dependencyOverrides[taskId];
      map[taskId] = {
        id: taskId,
        title: getTaskTitle(taskId),
        documentId: lookup?.documentId ?? null,
        documentName: lookup?.documentName ?? null,
        sourceDocumentTitle: lookup?.documentName ?? null,
        category: lookup?.category ?? null,
        rationale: lookup?.rationale ?? null,
        sourceText: lookup?.sourceText ?? null,
        confidence,
        confidenceDelta,
        dependencies: overrides?.dependencies ?? dependenciesByTarget[taskId] ?? [],
        dependents: overrides?.dependents ?? dependentsBySource[taskId] ?? [],
        movement: movementMap[taskId],
        planRank: index + 1,
        reasoning,
        dependencyNotes,
        manualOverride,
        isManual: Boolean(lookup?.isManual ?? manualOverride),
        state,
        removalReason,
      };
    });
    return map;
  }, [
    sanitizedTaskIds,
    getTaskTitle,
    plan.confidence_scores,
    dependenciesByTarget,
    dependentsBySource,
    movementMap,
    annotationById,
    removalById,
    taskLookup,
    dependencyOverrides,
  ]);

  useEffect(() => {
    metadataRef.current = { ...metadataRef.current, ...baseNodeMap };
  }, [baseNodeMap]);

  const nodeMap = useMemo(() => {
    const snapshot: Record<string, TaskRenderNode> = { ...metadataRef.current, ...baseNodeMap };

    Object.keys(priorityState.statuses).forEach(taskId => {
      const existing = snapshot[taskId];
      const lookup = taskLookup[taskId];
      if (existing) {
        const annotation = annotationById.get(taskId);
        snapshot[taskId] = {
          ...existing,
          title: getTaskTitle(taskId),
          documentId: existing.documentId ?? lookup?.documentId ?? null,
          documentName: existing.documentName ?? lookup?.documentName ?? null,
          sourceDocumentTitle: existing.sourceDocumentTitle ?? lookup?.documentName ?? null,
          movement: movementMap[taskId] ?? existing.movement,
          removalReason:
            existing.removalReason ?? removalById.get(taskId)?.removal_reason ?? null,
          manualOverride:
            existing.manualOverride ??
            annotation?.manual_override ??
            !sanitizedTaskIds.includes(taskId),
          isManual:
            existing.isManual ??
            lookup?.isManual ??
            annotation?.manual_override ??
            existing.manualOverride ??
            false,
        };
      } else {
        const annotation = annotationById.get(taskId);
        const removal = removalById.get(taskId);
        const overrides = dependencyOverrides[taskId];
        snapshot[taskId] = {
          id: taskId,
          title: getTaskTitle(taskId),
          documentId: lookup?.documentId ?? null,
          documentName: lookup?.documentName ?? null,
          sourceDocumentTitle: lookup?.documentName ?? null,
          category: lookup?.category ?? null,
          rationale: lookup?.rationale ?? null,
          sourceText: lookup?.sourceText ?? null,
          confidence:
            typeof annotation?.confidence === 'number'
              ? annotation.confidence
              : plan.confidence_scores[taskId] ?? null,
          confidenceDelta:
            typeof annotation?.confidence_delta === 'number'
              ? annotation.confidence_delta
              : null,
          dependencies: overrides?.dependencies ?? [],
          dependents: overrides?.dependents ?? [],
          movement: movementMap[taskId],
          planRank: null,
          reasoning: annotation?.reasoning ?? null,
          dependencyNotes: annotation?.dependency_notes ?? null,
          manualOverride:
            annotation?.manual_override ?? !sanitizedTaskIds.includes(taskId),
          isManual:
            lookup?.isManual ??
            annotation?.manual_override ??
            !sanitizedTaskIds.includes(taskId),
          state: annotation?.state,
          removalReason: annotation?.removal_reason ?? removal?.removal_reason ?? null,
        };
      }
    });

    console.log('[TaskList][DisplayCompute]', {
      sanitizedCount: sanitizedTaskIds.length,
      activeCount: Object.keys(priorityState.statuses).length,
      metadataCount: Object.keys(taskLookup).length,
      hasScores: Boolean(strategicScores),
    });

    return snapshot;
  }, [
    baseNodeMap,
    priorityState.statuses,
    getTaskTitle,
    movementMap,
    annotationById,
    plan.confidence_scores,
    removalById,
    sanitizedTaskIds,
    taskLookup,
    dependencyOverrides,
  ]);

  const activeIdsFromPlan = useMemo(
    () =>
      sanitizedTaskIds.filter(
        taskId =>
          priorityState.statuses[taskId] !== 'completed' &&
          priorityState.statuses[taskId] !== 'discarded'
      ),
    [sanitizedTaskIds, priorityState.statuses]
  );

  const manuallyRestoredIds = useMemo(() => {
    const ids: Array<{ id: string; rank: number }> = [];
    Object.entries(priorityState.statuses).forEach(([taskId, status]) => {
      if (status === 'active' && !sanitizedTaskIds.includes(taskId)) {
        ids.push({ id: taskId, rank: priorityState.ranks[taskId] ?? Number.MAX_SAFE_INTEGER });
      }
    });
    ids.sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id));
    return ids.map(item => item.id);
  }, [priorityState.statuses, priorityState.ranks, sanitizedTaskIds]);

  const orderedActiveIds = useMemo(() => {
    const combinedIds = new Set([
      ...activeIdsFromPlan,
      ...manuallyRestoredIds,
    ]);

    const sortable = Array.from(combinedIds).map(taskId => {
      const planIndex = sanitizedTaskIds.indexOf(taskId);
      const fallbackRank =
        planIndex >= 0 ? planIndex + 1 : priorityState.ranks[taskId] ?? Number.MAX_SAFE_INTEGER;
      return {
        taskId,
        fallbackRank,
      };
    });

    sortable.sort((a, b) => {
      if (a.fallbackRank !== b.fallbackRank) {
        return a.fallbackRank - b.fallbackRank;
      }

      return a.taskId.localeCompare(b.taskId);
    });

    return sortable.map(entry => entry.taskId);
  }, [activeIdsFromPlan, manuallyRestoredIds, sanitizedTaskIds, priorityState.ranks]);



  const taskOptions = useMemo<TaskOption[]>(() => {
    const ids = Array.from(new Set([...sanitizedTaskIds, ...manuallyRestoredIds]));
    return ids.map(id => ({
      id,
      title: getTaskTitle(id),
    }));
  }, [sanitizedTaskIds, manuallyRestoredIds, getTaskTitle]);

  // Collect blocked tasks for display in BlockedTasksSection
  // Only show blocked tasks when there are active reflections
  const blockedTasksForSection = useMemo(() => {
    // If no reflections are active, no tasks should be blocked
    if (activeReflectionIds.length === 0) {
      return [];
    }

    const blocked: BlockedTask[] = [];
    const activeReflectionsSet = new Set(activeReflectionIds);

    for (const taskId of orderedActiveIds) {
      const node = nodeMap[taskId];
      if (!node) continue;

      // Only consider effects from active reflections
      const taskReflectionEffects = (taskLookup[taskId]?.reflectionEffects ?? []).filter(effect =>
        activeReflectionsSet.has(effect.reflection_id)
      );
      const blockedEffect = taskReflectionEffects.find(effect => effect.effect === 'blocked');

      if (blockedEffect) {
        blocked.push({
          task_id: taskId,
          task_text: node.title,
          blocking_effect: blockedEffect,
        });
      }
    }

    return blocked;
  }, [orderedActiveIds, nodeMap, taskLookup, activeReflectionIds]);

  const excludedDocumentSet = useMemo(
    () => new Set(excludedDocumentIds.filter(Boolean)),
    [excludedDocumentIds]
  );

  const activeTasks = orderedActiveIds
    .map((taskId, index) => {
      const node = nodeMap[taskId];
      if (!node) {
        return null;
      }

      // Filter out tasks from excluded documents
      if (node.documentId && excludedDocumentSet.has(node.documentId)) {
        return null;
      }

      // Only apply blocking effects when there are active reflections
      if (activeReflectionIds.length > 0) {
        const activeReflectionsSet = new Set(activeReflectionIds);
        const taskReflectionEffects = (taskLookup[taskId]?.reflectionEffects ?? []).filter(effect =>
          activeReflectionsSet.has(effect.reflection_id)
        );
        const blockedEffect = taskReflectionEffects.find(effect => effect.effect === 'blocked');
        if (blockedEffect) {
          // Task is blocked - will be shown in BlockedTasksSection instead
          hiddenDueToReflectionRef.current.add(taskId);
          return null;
        }
      }

      // Merge adjustment reason into movement if available (T008 requirement)
      let movement = node.movement ??
        ((node.manualOverride ?? !sanitizedTaskIds.includes(taskId))
          ? { type: 'manual' as const }
          : undefined);

      // Add reason from adjusted_plan.diff if movement exists and has up/down type
      const adjustmentReason = adjustmentReasons[taskId];
      if (movement && (movement.type === 'up' || movement.type === 'down') && adjustmentReason) {
        movement = { ...movement, reason: adjustmentReason };
      }

      const score = strategicScores?.[taskId];
      const retryState = retryStatuses?.[taskId] ?? null;
      const manualOverride = taskLookup[taskId]?.manualOverride ?? null;

      let strategicSnapshot: TaskStrategicSnapshot = null;
      const aiImpact = typeof score?.impact === 'number' ? score.impact : null;
      const aiEffort = typeof score?.effort === 'number' ? score.effort : null;
      const aiConfidence = typeof score?.confidence === 'number' ? score.confidence : null;

      const resolvedImpact =
        typeof manualOverride?.impact === 'number' ? manualOverride.impact : aiImpact;
      const resolvedEffort =
        typeof manualOverride?.effort === 'number' ? manualOverride.effort : aiEffort;

      if (
        typeof resolvedImpact === 'number' &&
        typeof resolvedEffort === 'number' &&
        typeof aiConfidence === 'number'
      ) {
        const resolvedPriority = calculatePriority(resolvedImpact, resolvedEffort, aiConfidence);
        strategicSnapshot = {
          impact: resolvedImpact,
          effort: resolvedEffort,
          confidence: aiConfidence,
          priority: resolvedPriority,
        };
      }

      const quadrant =
        strategicSnapshot && typeof strategicSnapshot.impact === 'number' && typeof strategicSnapshot.effort === 'number'
          ? getQuadrant(strategicSnapshot.impact, strategicSnapshot.effort)
          : 'high_impact_low_effort';

      const activeReflectionsSet = activeReflectionIds.length > 0 ? new Set(activeReflectionIds) : null;
      const taskReflectionEffects = (taskLookup[taskId]?.reflectionEffects ?? []).filter(effect =>
        activeReflectionsSet ? activeReflectionsSet.has(effect.reflection_id) : true
      );
      const blockedEffect = taskReflectionEffects.find(effect => effect.effect === 'blocked');
      if (blockedEffect) {
        const alreadyLogged = hiddenDueToReflectionRef.current.has(taskId);
        hiddenDueToReflectionRef.current.add(taskId);
        if (!alreadyLogged) {
          console.log('[TaskList] Hiding task due to reflection block', {
            taskId,
            reflectionId: blockedEffect.reflection_id,
          });
        }
        return null;
      }

      return {
        id: taskId,
        title: node.title,
        category: node.category ?? null,

        movement,
        dependencyLinks: buildDependencyLinks(node.dependencies, priorityState.ranks, getTaskTitle),
        planOrder: index + 1,
        checked: priorityState.statuses[taskId] === 'completed',
        isAiGenerated: Boolean(node.manualOverride),
        isManual: Boolean(node.isManual),
        isPrioritizing: Boolean(prioritizingTasks[taskId]),
        strategicScore: strategicSnapshot,
        strategicDetails:
          score && strategicSnapshot
            ? {
                id: taskId,
                title: node.title,
                content: node.title,
                impact: strategicSnapshot.impact,
                effort: strategicSnapshot.effort,
                confidence: strategicSnapshot.confidence,
                priority: strategicSnapshot.priority,
                hasManualOverride: Boolean(manualOverride),
                quadrant,
                reasoning: score.reasoning,
                confidenceBreakdown: score.confidence_breakdown ?? null,
                sourceDocumentTitle: node.sourceDocumentTitle ?? taskLookup[taskId]?.documentName ?? null,
              }
            : null,
        retryStatus: retryState,
        manualOverride,
        hasManualOverride: Boolean(manualOverride),
          baselineScore: score ?? null,
          inclusionReason: typeof node.reasoning === 'string' ? node.reasoning : null,
          reflectionEffects: taskReflectionEffects,
        };
    })
    .filter(Boolean) as ActiveTaskEntry[];

  const strategyScoreCache = useMemo(() => buildStrategyScoreCache(activeTasks), [activeTasks]);

  const displayedActiveTasks = useMemo(() => {
    if (activeTasks.length === 0) {
      return [];
    }
    const filtered = activeTasks.filter(task =>
      matchesStrategyFilters(task, sortingStrategy, strategyScoreCache)
    );
    const sorted = [...filtered].sort((a, b) =>
      compareTasksByStrategy(a, b, sortingStrategy, strategyScoreCache)
    );
    
    // Apply focus mode limit: show only top 3 tasks
    const limited = sortingStrategy === 'focus_mode' ? sorted.slice(0, 3) : sorted;

    return limited.map((task, index) => ({
      ...task,
      displayOrder: index + 1,
    }));
  }, [activeTasks, sortingStrategy, strategyScoreCache]);

  const displayedActiveTaskIds = useMemo(
    () => displayedActiveTasks.map(task => task.id),
    [displayedActiveTasks]
  );

  const lastEmittedActiveIdsRef = useRef<string[] | null>(null);

  useEffect(() => {
    if (!onActiveIdsChange) {
      return;
    }
    const previous = lastEmittedActiveIdsRef.current;
    if (previous && arraysEqual(previous, displayedActiveTaskIds)) {
      return;
    }
    lastEmittedActiveIdsRef.current = displayedActiveTaskIds;
    onActiveIdsChange(displayedActiveTaskIds);
  }, [onActiveIdsChange, displayedActiveTaskIds]);

  // Ensure manual tasks have a default badge state
  useEffect(() => {
    const manualIds = displayedActiveTasks.filter(task => task.isManual).map(task => task.id);
    if (manualIds.length === 0) {
      return;
    }
    setManualStatuses(prev => {
      const next = { ...prev };
      let changed = false;
      manualIds.forEach(id => {
        if (!next[id]) {
          const isAnalyzing = Boolean(prioritizingTasks[id]);
          next[id] = isAnalyzing ? 'analyzing' : 'manual';
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [displayedActiveTasks, prioritizingTasks]);

  // Poll manual task statuses while analyzing
  useEffect(() => {
    const idsToPoll = displayedActiveTasks
      .filter(task => task.isManual)
      .map(task => task.id)
      .filter(id => (manualStatuses[id] ?? 'analyzing') === 'analyzing');

    if (idsToPoll.length === 0) {
      return;
    }

    const controller = new AbortController();
    const interval = setInterval(async () => {
      await Promise.all(
        idsToPoll.map(async taskId => {
          const attempts = manualStatusAttemptsRef.current[taskId] ?? 0;
          if (attempts >= 20) {
            setManualStatuses(prev => ({ ...prev, [taskId]: 'error' }));
            setManualStatusDetails(prev => ({
              ...prev,
              [taskId]: 'Analysis taking longer than expected',
            }));
            if (!manualTimeoutNotifiedRef.current.has(taskId)) {
              const title = taskLookup[taskId]?.title ?? taskId;
              toast.warning(`Analysis taking longer than expected for "${title}"`);
              manualTimeoutNotifiedRef.current.add(taskId);
            }
            return;
          }
          manualStatusAttemptsRef.current[taskId] = attempts + 1;

          try {
            const response = await fetch(`/api/tasks/manual/${taskId}/status`, {
              signal: controller.signal,
            });
            if (!response.ok) {
              throw new Error(`Status request failed: ${response.status}`);
            }
            const payload = await response.json();
            const nextStatus = payload?.status as string;
            if (nextStatus === 'prioritized') {
              setManualStatuses(prev => ({ ...prev, [taskId]: 'manual' }));
              setManualStatusDetails(prev => ({ ...prev, [taskId]: payload.placement_reason }));
              manualStatusAttemptsRef.current[taskId] = 0;
              manualTimeoutNotifiedRef.current.delete(taskId);
            } else if (nextStatus === 'not_relevant') {
              setManualStatuses(prev => ({ ...prev, [taskId]: 'error' }));
              setManualStatusDetails(prev => ({ ...prev, [taskId]: payload.exclusion_reason }));
              manualStatusAttemptsRef.current[taskId] = 0;
              manualTimeoutNotifiedRef.current.delete(taskId);
            } else if (nextStatus === 'conflict') {
              setManualStatuses(prev => ({ ...prev, [taskId]: 'conflict' }));
              setManualStatusDetails(prev => ({
                ...prev,
                [taskId]:
                  payload.exclusion_reason ||
                  payload.placement_reason ||
                  'Potential duplicate detected',
              }));
              manualStatusAttemptsRef.current[taskId] = 0;
              manualTimeoutNotifiedRef.current.delete(taskId);
            }
          } catch (error) {
            setManualStatuses(prev => ({ ...prev, [taskId]: 'error' }));
            setManualStatusDetails(prev => ({
              ...prev,
              [taskId]: error instanceof Error ? error.message : 'Failed to fetch status',
            }));
          }
        })
      );
    }, 1000);

    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [displayedActiveTasks, manualStatuses]);

  // Notify when manual tasks drop significantly after reprioritization
  useEffect(() => {
    Object.entries(movementMap).forEach(([taskId, movement]) => {
      if (!movement || movement.type !== 'down') {
        return;
      }
      const delta = Math.abs(movement.delta ?? 0);
      const isManual = taskLookup[taskId]?.isManual ?? metadataRef.current[taskId]?.isManual;
      if (!isManual || delta <= 5) {
        return;
      }
      if (manualDropNotifiedRef.current.has(taskId)) {
        return;
      }
      const title = taskLookup[taskId]?.title ?? metadataRef.current[taskId]?.title ?? taskId;
      toast.info(`Manual task dropped ${delta} spots: ${title}`);
      manualDropNotifiedRef.current.add(taskId);
    });
  }, [movementMap, taskLookup]);

  const [virtualRowHeight, setVirtualRowHeight] = useState(VIRTUALIZATION_ROW_HEIGHT);
  const virtualRowHeightRef = useRef(VIRTUALIZATION_ROW_HEIGHT);
  const virtualListRef = useRef<HTMLDivElement | null>(null);
  const measureFrameRef = useRef<number | null>(null);

  useEffect(() => {
    virtualRowHeightRef.current = virtualRowHeight;
  }, [virtualRowHeight]);

  const [virtualStartIndex, setVirtualStartIndex] = useState(0);
  const virtualizationEnabled = displayedActiveTasks.length > VIRTUALIZATION_THRESHOLD;
  const safeRowHeight = Math.max(virtualRowHeight, VIRTUALIZATION_ROW_HEIGHT_MIN);
  const virtualVisibleCount = virtualizationEnabled
    ? Math.ceil(ACTIVE_LIST_MAX_HEIGHT_PX / safeRowHeight) + VIRTUALIZATION_BUFFER_ROWS
    : displayedActiveTasks.length;
  const maxStartIndex = Math.max(displayedActiveTasks.length - virtualVisibleCount, 0);
  const clampedStartIndex = virtualizationEnabled ? Math.min(virtualStartIndex, maxStartIndex) : 0;

  if (displayedActiveTasks.length === 0) {
    console.warn('[TaskList][EmptyAfterSort]', {
      strategy: sortingStrategy,
      sanitizedCount: sanitizedTaskIds.length,
      activeStatuses: priorityState.statuses,
      scoresSample: Object.keys(strategicScores ?? {}).slice(0, 5),
      metadataCount: Object.keys(taskLookup).length,
    });
  }
  const totalVirtualHeight = displayedActiveTasks.length * safeRowHeight;
  const paddingTop = virtualizationEnabled ? clampedStartIndex * safeRowHeight : 0;
  const visibleTasks = virtualizationEnabled
    ? displayedActiveTasks.slice(
        clampedStartIndex,
        Math.min(clampedStartIndex + virtualVisibleCount, displayedActiveTasks.length)
      )
    : displayedActiveTasks;
  const paddingBottom = virtualizationEnabled
    ? Math.max(totalVirtualHeight - paddingTop - visibleTasks.length * safeRowHeight, 0)
    : 0;
  const displayedTaskCount = displayedActiveTasks.length;
  const visibleTaskCount = visibleTasks.length;
  const taskCountLabel = useMemo(
    () => `${displayedTaskCount} ${displayedTaskCount === 1 ? 'task' : 'tasks'}`,
    [displayedTaskCount]
  );

  useEffect(() => {
    if (!virtualizationEnabled) {
      setVirtualStartIndex(0);
    } else if (virtualStartIndex > maxStartIndex) {
      setVirtualStartIndex(maxStartIndex);
    }
  }, [virtualizationEnabled, maxStartIndex, virtualStartIndex]);

  useEffect(() => {
    const durationMs = Number((getNowMs() - renderStartRef.current).toFixed(2));
    const previousDurationMs = lastRenderLogRef.current || null;
    logTaskListPerf('commit', {
      durationMs,
      previousDurationMs,
      planVersion,
      totalTasks: displayedTaskCount,
      visibleTasks: visibleTaskCount,
      virtualizationEnabled,
      virtualWindowSize: virtualizationEnabled ? virtualVisibleCount : visibleTaskCount,
      virtualRowHeight: safeRowHeight,
    });
    lastRenderLogRef.current = durationMs;
  }, [
    planVersion,
    displayedTaskCount,
    visibleTaskCount,
    virtualizationEnabled,
    virtualVisibleCount,
    safeRowHeight,
  ]);

  useEffect(() => {
    if (!virtualizationEnabled) {
      if (typeof window !== 'undefined' && measureFrameRef.current !== null) {
        window.cancelAnimationFrame(measureFrameRef.current);
        measureFrameRef.current = null;
      }
      return;
    }
    if (typeof window === 'undefined') {
      return;
    }
    const container = virtualListRef.current;
    if (!container) {
      return;
    }
    if (measureFrameRef.current !== null) {
      window.cancelAnimationFrame(measureFrameRef.current);
    }
    measureFrameRef.current = window.requestAnimationFrame(() => {
      measureFrameRef.current = null;
      const rowNodes = Array.from(
        container.querySelectorAll<HTMLElement>('[data-virtual-row="true"]')
      );
      if (!rowNodes.length) {
        return;
      }
      const heights = rowNodes
        .map(node => node.getBoundingClientRect().height)
        .filter(height => Number.isFinite(height) && height > 0);
      if (!heights.length) {
        return;
      }
      const totalHeight = heights.reduce((total, value) => total + value, 0);
      const averageHeight = totalHeight / heights.length;
      const roundedAverage = Math.round(averageHeight);
      const previousHeight = virtualRowHeightRef.current;
      if (Math.abs(roundedAverage - previousHeight) > VIRTUALIZATION_ROW_HEIGHT_TOLERANCE) {
        const nextHeight = Math.max(
          VIRTUALIZATION_ROW_HEIGHT_MIN,
          Math.min(roundedAverage, VIRTUALIZATION_ROW_HEIGHT_MAX)
        );
        if (nextHeight !== previousHeight) {
          virtualRowHeightRef.current = nextHeight;
          setVirtualRowHeight(nextHeight);
          logTaskListPerf('virtual_row_height_adjusted', {
            previousHeight,
            nextHeight,
            sampleSize: heights.length,
            averageMeasuredHeight: roundedAverage,
          });
        }
      }
      const maxHeight = Math.max(...heights);
      if (maxHeight - virtualRowHeightRef.current > VIRTUALIZATION_ROW_HEIGHT_TOLERANCE * 2) {
        logTaskListPerf('virtual_row_height_violation', {
          configuredHeight: virtualRowHeightRef.current,
          maxHeight,
          sampleSize: heights.length,
          sortingStrategy,
        });
      }
    });
    return () => {
      if (measureFrameRef.current !== null) {
        window.cancelAnimationFrame(measureFrameRef.current);
        measureFrameRef.current = null;
      }
    };
  }, [visibleTasks, virtualizationEnabled, sortingStrategy]);

  const handleVirtualScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      if (!virtualizationEnabled) {
        return;
      }
      const scrollTop = event.currentTarget.scrollTop;
      const nextIndex = Math.max(0, Math.floor(scrollTop / safeRowHeight));
      if (nextIndex !== virtualStartIndex) {
        setVirtualStartIndex(nextIndex);
      }
    },
    [virtualizationEnabled, virtualStartIndex, safeRowHeight]
  );

  const showPrioritizingSkeleton = sessionStatus === 'running';

  const priorityFocusAreas = useMemo(() => {
    const firstWave = displayedActiveTasks.slice(0, 3);
    if (firstWave.length === 0) {
      return [];
    }
    const counts: Partial<Record<'leverage' | 'neutral' | 'overhead', number>> = {};
    for (const task of firstWave) {
      if (!task.category) {
        continue;
      }
      counts[task.category] = (counts[task.category] ?? 0) + 1;
    }
    const orderedAreas = CATEGORY_DISPLAY_ORDER.filter(category => counts[category]);
    if (orderedAreas.length === 0) {
      return [
        {
          label: 'clearing the earliest blockers so later work can flow',
          count: firstWave.length,
        },
      ];
    }
    return orderedAreas.map(category => ({
      label: CATEGORY_FOCUS_COPY[category],
      count: counts[category] ?? 0,
    }));
  }, [displayedActiveTasks]);

  const renderTaskRowContent = (task: ActiveTaskEntry) => (
    <TaskRow
      taskId={task.id}
      order={task.displayOrder}
      impact={task.strategicScore?.impact ?? null}
      effort={task.strategicScore?.effort ?? null}
      confidence={task.strategicScore?.confidence ?? null}
      priority={task.strategicScore?.priority ?? null}
      strategicDetails={task.strategicDetails ?? undefined}
      title={task.title}
      category={task.category}
      dependencyLinks={task.dependencyLinks}
      movement={task.movement}
      checked={task.checked}
      isAiGenerated={task.isAiGenerated}
      isManual={task.isManual}
      manualStatus={task.isManual ? manualStatuses[task.id] : undefined}
      manualStatusDetail={task.isManual ? manualStatusDetails[task.id] : undefined}
      isPrioritizing={task.isPrioritizing}
      retryStatus={task.retryStatus ?? undefined}
      isSelected={selectedTaskId === task.id && isDrawerOpen}
      isHighlighted={highlightedIds.has(task.id)}
      onSelect={handleSelectTask}
      onToggleCompleted={handleToggleCompleted}
      isEditingDisabled={sessionStatus === 'running'}
      onTaskTitleChange={handleTaskTitleChange}
      outcomeId={outcomeId}
      onEditSuccess={handleTaskEditSuccess}
      hasManualOverride={task.hasManualOverride ?? false}
      manualOverride={task.manualOverride ?? null}
      baselineScore={task.baselineScore ?? null}
      onManualOverrideChange={override => applyManualOverride(task.id, override)}
      inclusionReason={task.inclusionReason}
      reflectionEffects={task.reflectionEffects}
      onEditManual={
        task.isManual
          ? () => {
              setManualEditTask({ id: task.id, title: task.title });
              setIsManualTaskModalOpen(true);
            }
          : undefined
      }
      onMarkManualDone={task.isManual ? () => handleMarkManualDone(task.id) : undefined}
      onDeleteManual={task.isManual ? () => handleDeleteManualTask(task.id) : undefined}
/>
  );

  const renderTaskRows = (tasksToRender: ActiveTaskEntry[], options?: { virtualized?: boolean }) => (
    <div className="flex flex-col gap-4 lg:gap-0 lg:divide-y lg:divide-border/60">
      {tasksToRender.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-muted-foreground">No tasks match the current filter.</p>
          <Button
            variant="link"
            onClick={() => onStrategyChange('balanced')}
            className="mt-2"
          >
            Clear filter
          </Button>
        </div>
      ) : (
        tasksToRender.map(task => (
          <div
            key={`active-${task.id}`}
            data-virtual-row={options?.virtualized ? 'true' : undefined}
            style={options?.virtualized ? { minHeight: safeRowHeight } : undefined}
          >
            {renderTaskRowContent(task)}
          </div>
        ))
      )}
    </div>
  );

  const taskListHeader = (
    <div
      data-testid="task-list-header"
      className="flex flex-col justify-between gap-3 border-b border-border p-4 text-sm sm:flex-row sm:items-center sm:justify-between sm:text-base"
    >
      <div className="flex h-11 items-center gap-2 sm:h-9">
        <h2 className="text-sm font-semibold text-foreground sm:text-base">Your Prioritized Tasks</h2>
        <span className="text-sm text-muted-foreground sm:text-base">{taskCountLabel}</span>
      </div>
      <div className="flex w-full justify-start sm:w-auto sm:justify-end">
        <SortingStrategySelector
          value={sortingStrategy}
          onChange={onStrategyChange}
          compact
        />
      </div>
    </div>
  );

  const activeListHeader = (
    <div className="sticky top-0 z-10 hidden grid-cols-[48px_minmax(0,1fr)_120px_96px_48px] gap-2 border-b border-border/60 bg-background/95 px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground backdrop-blur lg:grid">
      <span>#</span>
      <span className="text-left">Task</span>
      <span className="text-left">Depends</span>
      <span className="text-right">Movement</span>
      <span className="text-right">Done</span>
    </div>
  );

  const normalizedOutcome = useMemo(() => {
    if (!outcomeStatement) {
      return null;
    }
    const trimmed = outcomeStatement.trim();
    return trimmed.length > 180 ? `${trimmed.slice(0, 177)}…` : trimmed;
  }, [outcomeStatement]);

  const planNarrative = useMemo(() => {
    const summary = plan.synthesis_summary?.trim();
    if (!summary && !normalizedOutcome && priorityFocusAreas.length === 0) {
      return '';
    }
    const focusPrefix = normalizedOutcome ? `To advance “${normalizedOutcome}”, ` : '';
    const primarySentence = summary
      ? `${focusPrefix}${summary}`
      : `${focusPrefix}The agent sequenced the most blocking dependencies first.`.trim();
    const themeSentence =
      priorityFocusAreas.length > 0
        ? `Focus areas: ${priorityFocusAreas
            .map((area, index) => {
              const countLabel =
                area.count > 1 ? `${area.count} tasks` : area.count === 1 ? '1 task' : '';
              return `${index + 1}) ${area.label}${countLabel ? ` (${countLabel})` : ''}`;
            })
            .join('; ')}.`
        : '';
    return [primarySentence.trim(), themeSentence].filter(Boolean).join(' ');
  }, [normalizedOutcome, plan.synthesis_summary, priorityFocusAreas]);
  const showPlanNarrative = false;

  const completedTasks = useMemo(
    () =>
      Object.entries(priorityState.statuses)
        .filter(([, status]) => status === 'completed')
        .map(([taskId]) => {
          const node = nodeMap[taskId];
          return {
            id: taskId,
            title: node?.title ?? getTaskTitle(taskId),
            isHighlighted: highlightedIds.has(taskId),
          };
        }),
    [priorityState.statuses, nodeMap, getTaskTitle, highlightedIds]
  );

  const discardedTasks = useMemo(
    () =>
      Object.entries(priorityState.statuses)
        .filter(([, status]) => status === 'discarded')
        .map(([taskId]) => {
          const node = nodeMap[taskId];
          return {
            id: taskId,
            title: node?.title ?? getTaskTitle(taskId),
            reason: node?.removalReason ?? priorityState.reasons[taskId],
            lastKnownRank: priorityState.ranks[taskId],
            isHighlighted: recentlyDiscarded.has(taskId),
          };
        }),
    [
      priorityState.statuses,
      nodeMap,
      getTaskTitle,
      priorityState.ranks,
      priorityState.reasons,
      recentlyDiscarded,
    ]
  );

  useEffect(() => {
    console.log('[TaskList][DisplayCompute]', {
      sanitizedCount: sanitizedTaskIds.length,
      activeCount: Object.keys(priorityState.statuses).length,
      metadataCount: Object.keys(taskLookup).length,
      hasScores: Boolean(strategicScores),
    });
  }, [sanitizedTaskIds.length, priorityState.statuses, taskLookup, strategicScores]);

  const handleToggleCompleted = useCallback(
    (taskId: string, nextChecked: boolean) => {
      updatePriorityState(prev => {
        const nextStatus = nextChecked ? 'completed' : 'active';
        if (prev.statuses[taskId] === nextStatus) {
          return prev;
        }
        const next: PriorityState = {
          statuses: { ...prev.statuses, [taskId]: nextStatus },
          reasons: { ...prev.reasons },
          ranks: { ...prev.ranks },
        };
        if (next.reasons[taskId]) {
          delete next.reasons[taskId];
        }
        if (!next.ranks[taskId]) {
          next.ranks[taskId] = sanitizedTaskIds.length + 1;
        }
        return next;
      });
    },
    [updatePriorityState, sanitizedTaskIds.length]
  );

  const handleReturnToActive = useCallback(
    (taskId: string) => {
      updatePriorityState(prev => {
        if (prev.statuses[taskId] === 'active') {
          return prev;
        }
        const next: PriorityState = {
          statuses: { ...prev.statuses, [taskId]: 'active' },
          reasons: { ...prev.reasons },
          ranks: { ...prev.ranks },
        };
        if (next.reasons[taskId]) {
          delete next.reasons[taskId];
        }
        if (!next.ranks[taskId]) {
          next.ranks[taskId] = sanitizedTaskIds.length + 1;
        }
        return next;
      });
      setDiscardCandidates(current => current.filter(candidate => candidate.taskId !== taskId));
      setShowDiscardReview(false);
      flagRecentlyDiscarded([]);
      rejectedDiscardIdsRef.current.delete(taskId);
      persistDismissedDiscards(rejectedDiscardIdsRef.current);
      scrollToTask(taskId);
      flashTask(taskId);
    },
    [
      updatePriorityState,
      sanitizedTaskIds.length,
      setDiscardCandidates,
      setShowDiscardReview,
      flagRecentlyDiscarded,
      scrollToTask,
      flashTask,
      persistDismissedDiscards,
    ]
  );

  const handleDiscardTask = useCallback(
    (taskId: string) => {
      updatePriorityState(prev => {
        if (prev.statuses[taskId] === 'discarded') {
          return prev;
        }
        const next: PriorityState = {
          statuses: { ...prev.statuses, [taskId]: 'discarded' },
          reasons: { ...prev.reasons },
          ranks: { ...prev.ranks },
        };
        if (next.reasons[taskId]) {
          delete next.reasons[taskId];
        }
        if (next.ranks[taskId]) {
          delete next.ranks[taskId];
        }
        return next;
      });
      setDiscardCandidates(current => current.filter(candidate => candidate.taskId !== taskId));
      setShowDiscardReview(false);
      rejectedDiscardIdsRef.current.delete(taskId);
      persistDismissedDiscards(rejectedDiscardIdsRef.current);
    },
    [updatePriorityState, persistDismissedDiscards]
  );

  useEffect(() => {
    if (!discardActionsRef) {
      return;
    }
    discardActionsRef.current = {
      overrideDiscard: handleReturnToActive,
      confirmDiscard: handleDiscardTask,
    };
    return () => {
      discardActionsRef.current = null;
    };
  }, [discardActionsRef, handleReturnToActive, handleDiscardTask]);

  const handleMarkManualDone = useCallback(
    async (taskId: string) => {
      console.log('[TaskList][Handlers] handleMarkManualDone invoked', {
        hasHandleToggleCompleted: typeof handleToggleCompleted,
      });
      try {
        const response = await fetch(`/api/tasks/manual/${taskId}/mark-done`, { method: 'PATCH' });
        const payload = (await response.json().catch(() => null)) as
          | { already_marked?: boolean }
          | null;
        if (!response.ok && response.status !== 404) {
          throw new Error(`Failed to mark done (${response.status})`);
        }
        handleToggleCompleted(taskId, true);
        toast.success(
          payload?.already_marked || response.status === 404
            ? 'Task already marked done'
            : 'Task marked as done'
        );
      } catch (error) {
        console.error('[TaskList] Failed to mark manual task done', error);
        toast.error('Could not mark task as done');
      }
    },
    [handleToggleCompleted]
  );

  const handleDeleteManualTask = useCallback(async (taskId: string) => {
    console.log('[TaskList][Handlers] handleDeleteManualTask invoked', {
      hasUpdatePriorityState: typeof updatePriorityState,
    });
    try {
      const response = await fetch(`/api/tasks/manual/${taskId}/delete`, { method: 'DELETE' });
      const payload = (await response.json().catch(() => null)) as
        | { already_removed?: boolean }
        | null;
      if (!response.ok && response.status !== 404) {
        throw new Error(`Failed to delete task (${response.status})`);
      }
      updatePriorityState(prev => {
        const next: PriorityState = {
          statuses: { ...prev.statuses },
          reasons: { ...prev.reasons },
          ranks: { ...prev.ranks },
        };
        delete next.statuses[taskId];
        delete next.reasons[taskId];
        delete next.ranks[taskId];
        return next;
      });
      setTaskLookup(prev => {
        const next = { ...prev };
        delete next[taskId];
        return next;
      });
      setManualStatuses(prev => {
        const next = { ...prev };
        delete next[taskId];
        return next;
      });
      setManualStatusDetails(prev => {
        const next = { ...prev };
        delete next[taskId];
        return next;
      });
      toast.success(
        payload?.already_removed || response.status === 404
          ? 'Task already removed; cleared from list'
          : 'Task deleted (recoverable for 30 days)'
      );
    } catch (error) {
      console.error('[TaskList] Failed to delete manual task', error);
      toast.error('Could not delete task');
    }
  }, [updatePriorityState, setTaskLookup]);



  const handleSelectTask = useCallback((taskId: string) => {
    setSelectedTaskId(taskId);
    setIsDrawerOpen(true);
  }, []);

  const selectedNode = selectedTaskId ? nodeMap[selectedTaskId] ?? null : null;
  const selectedStatus: TaskStatus = selectedTaskId
    ? priorityState.statuses[selectedTaskId] ?? 'active'
    : 'active';
  const selectedReason = selectedTaskId ? priorityState.reasons[selectedTaskId] : undefined;
  const selectedConfidence = selectedNode?.confidence ?? null;
  const selectedMovement: MovementInfo | undefined =
    selectedNode?.movement ?? movementMap[selectedTaskId ?? ''];

  return (
    <div className="flex flex-col gap-8">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-foreground">Active Priorities</h2>
            <p className="text-sm text-muted-foreground">
              Work down the list in order. Dependencies are linked inline.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" onClick={() => setIsManualTaskModalOpen(true)}>
              + Add Task
            </Button>
            {executionMetadata && (
              <span className="text-xs text-muted-foreground">
                {executionMetadata.steps_taken} steps •{' '}
                {Math.round(executionMetadata.total_time_ms / 100) / 10}s runtime
              </span>
            )}
          </div>
        </div>

        {showPlanNarrative && planNarrative && (
          <div className="rounded-lg border border-border/70 bg-bg-layer-3/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Why these tasks are on top
            </p>
            <p className="mt-2 text-sm text-foreground">{planNarrative}</p>
          </div>
        )}

        {hasToolFailures && (
          <Alert className="border-amber-300 bg-amber-50">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <AlertTitle>Some analysis steps failed</AlertTitle>
            <AlertDescription className="text-sm leading-relaxed text-foreground">
              {failedTools.length > 0 ? (
                <span>
                  The agent could not complete{' '}
                  <span className="font-medium">{failedTools.join(', ')}</span>. Results may be incomplete.
                </span>
              ) : (
                <span>The agent encountered tool errors. Results may be incomplete.</span>
              )}
              {statusNote && (
                <span className="mt-2 block text-muted-foreground">{statusNote}</span>
              )}
            </AlertDescription>
          </Alert>
        )}

        {!hasToolFailures && statusNote && (
          <Alert className="border-amber-300 bg-amber-50">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <AlertTitle>Why results may be limited</AlertTitle>
            <AlertDescription className="text-sm leading-relaxed text-foreground">
              {statusNote}
            </AlertDescription>
          </Alert>
        )}

        {taskError && <p className="text-xs text-destructive">{taskError}</p>}

        <div className="rounded-xl border border-border/60">
          {taskListHeader}
          {isLoadingTasks ? (
            <div className="p-4">
              <TaskListSkeleton rows={5} />
            </div>
          ) : displayedActiveTasks.length === 0 ? (
            <div className="px-2 py-4 text-sm text-muted-foreground">
              All current priorities are complete. Rerun the agent when new work arrives.
            </div>
          ) : virtualizationEnabled ? (
            <div
              ref={virtualListRef}
              className="relative max-h-[560px] overflow-y-auto"
              onScroll={handleVirtualScroll}
              role="region"
              aria-label="Virtualized active tasks"
              aria-busy={isLoadingTasks || showPrioritizingSkeleton}
            >
              {activeListHeader}
              {showPrioritizingSkeleton && !isLoadingTasks && (
                <div className="space-y-2 bg-bg-layer-2/40 px-4 py-3" aria-live="polite">
                  <TaskListSkeleton rows={3} />
                </div>
              )}
              <div style={{ height: paddingTop }} />
              {renderTaskRows(visibleTasks, { virtualized: true })}
              <div style={{ height: paddingBottom }} />
            </div>
          ) : (
            <div>
              {activeListHeader}
              {showPrioritizingSkeleton && !isLoadingTasks && (
                <div className="space-y-2 bg-bg-layer-2/40 px-4 py-3" aria-live="polite">
                  <TaskListSkeleton rows={3} />
                </div>
              )}
              {renderTaskRows(visibleTasks)}
            </div>
          )}
        </div>
      </section>

      <BlockedTasksSection
        blockedTasks={blockedTasksForSection}
      />

      <CompletedTasks
        tasks={completedTasks}
        onMoveToActive={taskId => handleReturnToActive(taskId)}
        onSelect={handleSelectTask}
      />

      <DiscardedTasks
        tasks={discardedTasks}
        onReturnToActive={handleReturnToActive}
        onSelect={handleSelectTask}
      />

      <TaskDetailsDrawer
        open={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        task={
          selectedNode
            ? {
                ...selectedNode,
                id: selectedNode.id,
                title: selectedNode.title,
                documentId: selectedNode.documentId ?? null,
                sourceDocumentTitle: selectedNode.sourceDocumentTitle ?? selectedNode.documentName ?? null,
                rank: selectedNode.planRank ?? priorityState.ranks[selectedNode.id] ?? null,
                confidence: selectedConfidence,
                confidenceDelta: selectedNode.confidenceDelta ?? null,
                movement: selectedMovement ?? null,
                dependencies: selectedNode.dependencies,
                dependents: selectedNode.dependents,
                dependencyLinks: buildDependencyLinks(
                  selectedNode.dependencies,
                  priorityState.ranks,
                  getTaskTitle
                ),
                dependentLinks: buildDependentLinks(
                  selectedNode.dependents,
                  priorityState.ranks,
                  getTaskTitle
                ),
                reasoning: selectedNode.reasoning ?? null,
                dependencyNotes: selectedNode.dependencyNotes ?? null,
                manualOverride:
                  selectedNode.manualOverride ?? !sanitizedTaskIds.includes(selectedNode.id),
                state: selectedNode.state,
                lnoCategory: selectedNode.category ?? null,
                outcomeRationale: selectedNode.rationale ?? null,
                sourceText: selectedNode.sourceText ?? null,
                isManual: Boolean(selectedNode.isManual),
                manualStatus: selectedNode.isManual ? manualStatuses[selectedNode.id] : undefined,
                manualStatusDetail: selectedNode.isManual ? manualStatusDetails[selectedNode.id] : undefined,
              }
            : null
        }
        strategicScore={selectedTaskId && strategicScores ? strategicScores[selectedTaskId] ?? null : null}
        status={selectedStatus}
        removalReason={selectedNode?.removalReason ?? selectedReason}
        onMarkDone={() => {
          if (!selectedTaskId) {
            return;
          }
          handleToggleCompleted(selectedTaskId, true);
        }}
        onMarkActive={() => {
          if (!selectedTaskId) {
            return;
          }
          handleToggleCompleted(selectedTaskId, false);
        }}
        onReturnToActive={() => {
          if (!selectedTaskId) {
            return;
          }
          handleReturnToActive(selectedTaskId);
        }}
      onNavigateToTask={scrollToTask}
      getTaskTitle={getTaskTitle}
      outcomeStatement={outcomeStatement ?? null}
      onRemoveDependency={handleRemoveDependency}
      onAddDependency={handleAddDependency}
      taskOptions={taskOptions}
      />

      <ManualTaskModal
        open={isManualTaskModalOpen}
        onOpenChange={handleManualModalOpenChange}
        outcomeId={outcomeId}
        onTaskCreated={handleManualTaskCreated}
        onDuplicateTaskFound={handleDuplicateTaskFound}
        initialTaskId={manualEditTask?.id}
        initialTaskText={manualEditTask?.title}
        onTaskUpdated={payload => handleManualTaskUpdated(payload.taskId, payload.taskText)}
      />

      <DiscardReviewModal
        open={showDiscardReview}
        candidates={discardCandidates}
        onOpenChange={handleDiscardModalOpenChange}
        onToggleCandidate={handleToggleDiscardCandidate}
        onApplyChanges={handleApplyDiscardDecisions}
        onCancelAll={handleCancelAllDiscards}
      />
    </div>
  );
}

function TaskListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={`task-skeleton-${index}`} className="h-12 rounded-lg" />
      ))}
    </div>
  );
}

const URGENT_KEYWORDS = /\b(urgent|critical|blocking|blocker)\b/i;

type StrategyScoreEntry = {
  priorityScore: number;
  quickWinScore: number;
  strategicBetScore: number;
  urgentScore: number;
  matchesQuickWin: boolean;
  matchesStrategicBet: boolean;
  isAvoidQuadrant: boolean;
};

type StrategyScoreCache = Record<string, StrategyScoreEntry>;

function matchesStrategyFilters(
  task: ActiveTaskEntry,
  strategy: SortingStrategy,
  cache: StrategyScoreCache
): boolean {
  if (strategy === 'balanced' || strategy === 'urgent') {
    return true;
  }
  const entry = cache[task.id];
  if (!entry) {
    return false;
  }
  if (strategy === 'quick_wins') {
    return entry.matchesQuickWin;
  }
  if (strategy === 'strategic_bets') {
    return entry.matchesStrategicBet;
  }
  if (strategy === 'focus_mode') {
    return entry.matchesQuickWin || entry.matchesStrategicBet;
  }
  return true;
}

function compareTasksByStrategy(
  a: ActiveTaskEntry,
  b: ActiveTaskEntry,
  strategy: SortingStrategy,
  cache: StrategyScoreCache
) {
  if (strategy === 'quick_wins') {
    return compareWithFallback(
      getQuickWinScore(a, cache),
      getQuickWinScore(b, cache),
      a.planOrder,
      b.planOrder
    );
  }
  if (strategy === 'strategic_bets') {
    return compareWithFallback(
      getStrategicBetScore(a, cache),
      getStrategicBetScore(b, cache),
      a.planOrder,
      b.planOrder
    );
  }
  if (strategy === 'urgent') {
    return compareWithFallback(getUrgentScore(a, cache), getUrgentScore(b, cache), a.planOrder, b.planOrder);
  }
  return compareWithFallback(getPriorityScore(a, cache), getPriorityScore(b, cache), a.planOrder, b.planOrder);
}

function compareWithFallback(aScore: number, bScore: number, aOrder: number, bOrder: number) {
  if (aScore === bScore) {
    return aOrder - bOrder;
  }
  return bScore - aScore;
}

function getPriorityScore(task: ActiveTaskEntry, cache: StrategyScoreCache) {
  return cache[task.id]?.priorityScore ?? Number.NEGATIVE_INFINITY;
}

function getQuickWinScore(task: ActiveTaskEntry, cache: StrategyScoreCache) {
  return cache[task.id]?.quickWinScore ?? Number.NEGATIVE_INFINITY;
}

function getStrategicBetScore(task: ActiveTaskEntry, cache: StrategyScoreCache) {
  return cache[task.id]?.strategicBetScore ?? Number.NEGATIVE_INFINITY;
}

function getUrgentScore(task: ActiveTaskEntry, cache: StrategyScoreCache) {
  return cache[task.id]?.urgentScore ?? Number.NEGATIVE_INFINITY;
}

function hasUrgentKeyword(title: string) {
  return URGENT_KEYWORDS.test(title);
}

function buildStrategyScoreCache(tasks: ActiveTaskEntry[]): StrategyScoreCache {
  const cache: StrategyScoreCache = {};
  tasks.forEach(task => {
    const impact = task.strategicScore?.impact ?? null;
    const effort = task.strategicScore?.effort ?? null;
    const confidence = task.strategicScore?.confidence ?? null;
    const isAvoidQuadrant =
      typeof impact === 'number' &&
      typeof effort === 'number' &&
      impact < HIGH_IMPACT_THRESHOLD &&
      effort > LOW_EFFORT_THRESHOLD;
    const priorityScore =
      typeof task.strategicScore?.priority === 'number' && !isAvoidQuadrant
        ? task.strategicScore.priority
        : Number.NEGATIVE_INFINITY;
    const { matchesQuickWin, matchesStrategicBet } = classifyStrategyScores(impact, effort);

    const quickWinScore =
      !isAvoidQuadrant && matchesQuickWin && typeof impact === 'number' && typeof confidence === 'number'
        ? impact * confidence
        : Number.NEGATIVE_INFINITY;
    const strategicBetScore =
      !isAvoidQuadrant && matchesStrategicBet && typeof impact === 'number'
        ? impact
        : Number.NEGATIVE_INFINITY;
    const urgencyMultiplier = hasUrgentKeyword(task.title) ? 2 : 1;
    const urgentScore =
      typeof task.strategicScore?.priority === 'number' && !isAvoidQuadrant
        ? task.strategicScore.priority * urgencyMultiplier
        : Number.NEGATIVE_INFINITY;

    cache[task.id] = {
      priorityScore,
      quickWinScore,
      strategicBetScore,
      urgentScore,
      matchesQuickWin,
      matchesStrategicBet,
      isAvoidQuadrant,
    };
  });
  return cache;
}

type TaskListErrorBoundaryProps = {
  children: ReactNode;
};

type TaskListErrorBoundaryState = {
  hasError: boolean;
};

class TaskListErrorBoundary extends Component<TaskListErrorBoundaryProps, TaskListErrorBoundaryState> {
  state: TaskListErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, errorInfo: unknown) {
    console.error('[TaskList][Boundary] Error caught by boundary', error, errorInfo);
    toast.error('Task list failed to render. Please refresh or rerun prioritization.');
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive"
        >
          <p className="font-semibold">Unable to render task list</p>
          <p className="text-destructive/80">Please refresh the page or run prioritization again.</p>
        </div>
      );
    }
    return this.props.children;
  }
}
