'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { TaskRow } from '@/app/priorities/components/TaskRow';
import { CompletedTasks } from '@/app/priorities/components/CompletedTasks';
import { DiscardedTasks } from '@/app/priorities/components/DiscardedTasks';
import { TaskDetailsDrawer } from '@/app/priorities/components/TaskDetailsDrawer';
import { useTaskDiff } from '@/app/priorities/components/useTaskDiff';
import { useScrollToTask } from '@/app/priorities/components/useScrollToTask';
import type { MovementInfo } from '@/app/priorities/components/MovementBadge';
import { ManualTaskModal } from '@/app/components/ManualTaskModal';
import { DiscardReviewModal, type DiscardCandidate } from '@/app/components/DiscardReviewModal';
import { RefinementModal } from '@/app/priorities/components/RefinementModal';
import {
  DEPENDENCY_OVERRIDE_STORAGE_KEY,
  type DependencyOverrideEntry,
  type DependencyOverrideStore,
} from '@/lib/utils/dependencyOverrides';
import { useLocalStorage } from '@/lib/hooks/useLocalStorage';
import type { RefinementAction } from '@/lib/services/qualityRefinement';
import type { QualityMetadata } from '@/lib/schemas/taskIntelligence';

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
    category?: 'leverage' | 'neutral' | 'overhead' | null;
    rationale?: string | null;
    sourceText?: string | null;
    isManual?: boolean;
    clarityScore?: number | null;
    badgeColor?: 'green' | 'yellow' | 'red';
    badgeLabel?: 'Clear' | 'Review' | 'Needs Work';
    qualityMetadata?: QualityMetadata | null;
  }
>;

type QualityUpdatePayload = {
  taskId: string;
  clarityScore: number;
  badgeColor: 'green' | 'yellow' | 'red';
  badgeLabel: 'Clear' | 'Review' | 'Needs Work';
  qualityMetadata?: QualityMetadata;
};

type TaskRenderNode = {
  id: string;
  title: string;
  category?: 'leverage' | 'neutral' | 'overhead' | null;
  rationale?: string | null;
  sourceText?: string | null;
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

type LockedTaskState = {
  order: number;
};

type ApplyRefinementPayload = {
  taskId: string;
  suggestionId: string;
  newTaskTexts: string[];
  action: RefinementAction;
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

type TaskListProps = {
  plan: PrioritizedTaskPlan;
  executionMetadata?: ExecutionMetadata | null;
  planVersion: number;
  outcomeId: string | null;
  outcomeStatement?: string | null;
  adjustedPlan?: AdjustedPlan | null;
  onDiffSummary?: (summary: { hasChanges: boolean; isInitial: boolean }) => void;
  sessionStatus?: SessionStatus;
  canTriggerPrioritization?: boolean;
  onRequestPrioritization?: () => void | Promise<void>;
  isRecalculating?: boolean;
};

const DEFAULT_REMOVAL_REASON =
  'Removed in the latest agent recalculation. Review and reinstate if still relevant.';

function formatTaskId(taskId: string): string {
  if (!taskId) {
    console.log('[formatTaskId] 🔍 Called with empty taskId');
    return 'Unknown task';
  }

  // Check if this is a raw UUID (32+ characters, hex only)
  const isRawUuid = /^[0-9a-f]+$/.test(taskId.replace(/-/g, '')) && taskId.replace(/-/g, '').length >= 32;
  
  if (isRawUuid) {
    console.log('[formatTaskId] 🔍 Called with raw UUID, returning placeholder:', taskId);
    // For raw UUIDs, return a more user-friendly placeholder
    return 'Untitled task';
  }

  const parts = taskId.split('::');
  const last = parts[parts.length - 1];
  return last.replace(/[-_]/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
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

function sanitizePlanOrder(plan: PrioritizedTaskPlan): string[] {
  const uniqueIds = Array.from(new Set(plan.ordered_task_ids));
  if (plan.dependencies.length === 0) {
    return uniqueIds;
  }

  const indexMap = new Map<string, number>();
  uniqueIds.forEach((id, index) => indexMap.set(id, index));

  const adjacency = new Map<string, Set<string>>();
  const indegree = new Map<string, number>();
  uniqueIds.forEach(id => indegree.set(id, 0));

  for (const dependency of plan.dependencies) {
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
  console.log('[TaskList] Building dependency links:', {
    count: dependencies.length,
    dependencies: dependencies.map(d => ({
      source_task_id: d.source_task_id,
      target_task_id: d.target_task_id,
      relationship_type: d.relationship_type
    }))
  });
  
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
  console.log('[TaskList] Building dependent links:', {
    count: dependents.length,
    dependents: dependents.map(d => ({
      source_task_id: d.source_task_id,
      target_task_id: d.target_task_id,
      relationship_type: d.relationship_type
    }))
  });
  
  return dependents.map(dependency => ({
    taskId: dependency.target_task_id,
    rank: ranks[dependency.target_task_id] ?? null,
    label: getTitle(dependency.target_task_id),
  }));
}

export function TaskList({
  plan,
  executionMetadata,
  planVersion,
  outcomeId,
  outcomeStatement,
  adjustedPlan,
  onDiffSummary,
  sessionStatus = 'idle',
  canTriggerPrioritization = false,
  onRequestPrioritization,
  isRecalculating = false,
}: TaskListProps) {
  const sanitizedTaskIds = useMemo(() => sanitizePlanOrder(plan), [plan]);
  const taskAnnotations = useMemo<TaskAnnotation[]>(() => plan.task_annotations ?? [], [plan.task_annotations]);
  const removedTasksFromPlan = useMemo<TaskRemoval[]>(() => plan.removed_tasks ?? [], [plan.removed_tasks]);

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
  const [showRefinementModal, setShowRefinementModal] = useState(false);
  const [refinementTaskId, setRefinementTaskId] = useState<string | null>(null);
  const [refinementTaskText, setRefinementTaskText] = useState<string>('');
  const [lockStore, setLockStore] = useLocalStorage<Record<string, Record<string, LockedTaskState>>>('locked-tasks', {});
  const [dependencyStore, setDependencyStore] = useLocalStorage<DependencyOverrideStore>(DEPENDENCY_OVERRIDE_STORAGE_KEY, {});
  const outcomeKey = outcomeId ?? 'global';
  const lockedTasks = lockStore[outcomeKey] ?? {};
  const dependencyOverrides = dependencyStore[outcomeKey] ?? {};
  const rejectedDiscardIdsRef = useRef<Set<string>>(new Set());
  const previousPlanVersionRef = useRef(planVersion);

  const updateLockedTasks = useCallback(
    (updater: (current: Record<string, LockedTaskState>) => Record<string, LockedTaskState>) => {
      setLockStore(prev => {
        const current = prev[outcomeKey] ?? {};
        const nextOutcomeEntry = updater(current);
        return {
          ...prev,
          [outcomeKey]: nextOutcomeEntry,
        };
      });
    },
    [outcomeKey, setLockStore]
  );

  const updateDependencyOverrides = useCallback(
    (
      updater: (current: Record<string, DependencyOverrideEntry>) => Record<string, DependencyOverrideEntry>
    ) => {
      setDependencyStore(prev => {
        const current = prev[outcomeKey] ?? {};
        const nextOutcomeEntry = updater(current);
        return {
          ...prev,
          [outcomeKey]: nextOutcomeEntry,
        };
      });
    },
    [outcomeKey, setDependencyStore]
  );

  const storageKey = outcomeId ? `priority-state:${outcomeId}` : null;
  const previousPlanRef = useRef<string[] | null>(null);
  const priorityStateRef = useRef<PriorityState>(priorityState);
  const metadataRef = useRef<Record<string, TaskRenderNode>>({});
  const hasLoadedStoredState = useRef(false);
  const discardTimeoutRef = useRef<number | null>(null);
  const previousStorageKeyRef = useRef<string | null>(null);
  const didUnmountRef = useRef(false);

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
      setTaskLookup(prev => {
        const existing = prev[taskId];
        const nextEntry = {
          title: taskText,
          documentId: existing?.documentId ?? null,
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
    [flashTask, sanitizedTaskIds.length, setTaskLookup, updatePriorityState]
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
      scrollToTask(taskId);
    },
    [scrollToTask]
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

  const handleQualityUpdate = useCallback(
    ({ taskId, clarityScore, badgeColor, badgeLabel, qualityMetadata }: QualityUpdatePayload) => {
      setTaskLookup(prev => {
        const current = prev[taskId] ?? {
          title: formatTaskId(taskId),
          qualityMetadata: null,
        };
        return {
          ...prev,
          [taskId]: {
            ...current,
            clarityScore,
            badgeColor,
            badgeLabel,
            qualityMetadata: qualityMetadata ?? current.qualityMetadata ?? null,
          },
        };
      });
    },
    [setTaskLookup]
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
      hasLoadedStoredState.current = false;
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

    if (hasLoadedStoredState.current) {
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

    hasLoadedStoredState.current = true;
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
        });

        return next;
      });

      const rejectionSet = rejectedDiscardIdsRef.current;
      approved.forEach(candidate => rejectionSet.delete(candidate.taskId));
      rejected.forEach(candidate => rejectionSet.add(candidate.taskId));

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
      }
      return [];
    });
    setShowDiscardReview(false);
  }, []);

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

    if (previousPlanVersionRef.current !== planVersion) {
      rejectedDiscardIdsRef.current.clear();
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

    Object.entries(lockedTasks).forEach(([taskId, lockState]) => {
      if (nextState.statuses[taskId] !== 'completed' && nextState.statuses[taskId] !== 'discarded') {
        if (nextState.statuses[taskId] !== 'active') {
          nextState.statuses[taskId] = 'active';
          stateChanged = true;
        }
      }
      if (typeof lockState.order === 'number' && nextState.ranks[taskId] !== lockState.order) {
        nextState.ranks[taskId] = lockState.order;
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
    lockedTasks,
    manualTaskIds,
    taskLookup,
  ]);

  const trackedTaskIds = useMemo(
    () => Array.from(new Set([...sanitizedTaskIds, ...Object.keys(priorityState.statuses)])),
    [sanitizedTaskIds, priorityState.statuses]
  );

  useEffect(() => {
    // 🔍 DIAGNOSTIC: Log useEffect trigger
    console.log('[TaskList] Metadata useEffect triggered:', {
      trackedTaskIdsCount: trackedTaskIds.length,
      outcomeStatement: outcomeStatement?.slice(0, 50) + '...',
      sampleTaskIds: trackedTaskIds.slice(0, 2).map(id => id.slice(0, 16) + '...')
    });

    if (trackedTaskIds.length === 0) {
      console.log('[TaskList] ⚠️ No tracked task IDs - skipping metadata fetch');
      setTaskLookup({});
      lastMetadataRequestKeyRef.current = null;
      setIsLoadingTasks(false);
      return;
    }

    const requestKey = `${trackedTaskIds.join('|')}::${outcomeStatement ?? ''}`;

    // 🔍 DIAGNOSTIC: Log cache check
    console.log('[TaskList] Cache check:', {
      requestKeySample: requestKey.slice(0, 100) + '...',
      cachedKeySample: (lastMetadataRequestKeyRef.current || 'null').slice(0, 100) + '...',
      isMatch: lastMetadataRequestKeyRef.current === requestKey,
      willSkip: lastMetadataRequestKeyRef.current === requestKey
    });

    if (lastMetadataRequestKeyRef.current === requestKey) {
      console.log('[TaskList] ⚠️ SKIPPING metadata API call - request key matches cache');
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
            category?: 'leverage' | 'neutral' | 'overhead' | null;
            rationale?: string | null;
            original_text?: string | null;
            is_manual?: boolean;
          }>;
        };

        console.log('[TaskList] 🔍 API response parsed:', {
          taskCount: payload.tasks?.length ?? 0,
          didUnmount: didUnmountRef.current,
          sampleTitles: (payload.tasks || []).slice(0, 2).map(t => t.title?.slice(0, 40))
        });

        if (didUnmountRef.current) {
          console.log('[TaskList] ⚠️ Component unmounted, skipping state update');
          return;
        }

        // ✅ FIX: Only set cache key AFTER successful data load
        lastMetadataRequestKeyRef.current = requestKey;

        console.log('[TaskList] 📝 About to call setTaskLookup...');
        setTaskLookup(prev => {
          const next = { ...prev };
          for (const task of payload.tasks ?? []) {
            // 🔍 DIAGNOSTIC: Log task info to understand missing titles
            if (!task.title || task.title === formatTaskId(task.task_id)) {
              console.log('[TaskList] 🔍 Task missing proper title:', {
                taskId: task.task_id,
                originalTitle: task.title,
                fallbackTitle: formatTaskId(task.task_id),
                isManual: task.is_manual,
                category: task.category,
                documentId: task.document_id,
              });
            }

            const previousEntry = next[task.task_id];
            next[task.task_id] = {
              title: task.title ?? formatTaskId(task.task_id),
              documentId: task.document_id ?? null,
              category: task.category ?? null,
              rationale: task.rationale ?? null,
              sourceText: task.original_text ?? null,
              isManual: Boolean(task.is_manual),
              clarityScore: task.clarity_score ?? previousEntry?.clarityScore ?? null,
              badgeColor: task.badge_color ?? previousEntry?.badgeColor ?? null,
              badgeLabel: task.badge_label ?? previousEntry?.badgeLabel ?? null,
              qualityMetadata: task.quality_metadata ?? previousEntry?.qualityMetadata ?? null,
            };
          }

          // 🔍 DIAGNOSTIC: Log taskLookup state
          console.log('[TaskList] TaskLookup updated:', {
            totalTasks: Object.keys(next).length,
            newTasks: payload.tasks?.length ?? 0,
            sampleTasks: Object.entries(next).slice(0, 2).map(([id, data]) => ({
              id: id.slice(0, 16) + '...',
              title: data.title?.slice(0, 30) + '...',
              hasCategory: !!data.category,
              hasQuality: !!data.clarityScore
            }))
          });

          return next;
        });

        const fetchedIds = new Set((payload.tasks ?? []).map(task => task.task_id));
        const missingLocked = Object.keys(lockedTasks).filter(taskId => !fetchedIds.has(taskId));
        if (missingLocked.length > 0) {
          updateLockedTasks(current => {
            const next = { ...current };
            missingLocked.forEach(taskId => {
              delete next[taskId];
            });
            return next;
          });
          updatePriorityState(prev => {
            const next: PriorityState = {
              statuses: { ...prev.statuses },
              reasons: { ...prev.reasons },
              ranks: { ...prev.ranks },
            };
            missingLocked.forEach(taskId => {
              delete next.statuses[taskId];
              delete next.reasons[taskId];
              delete next.ranks[taskId];
            });
            return next;
          });
        }
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
  }, [trackedTaskIds, outcomeStatement]);

  const getTaskTitle = useCallback(
    (taskId: string) => {
      const task = taskLookup[taskId];
      if (!task) {
        console.log('[TaskList] 🔍 No task found in lookup for ID:', taskId);
        return formatTaskId(taskId);
      }
      if (!task.title) {
        console.log('[TaskList] 🔍 Task found but title is missing for ID:', taskId);
        return formatTaskId(taskId);
      }
      return task.title;
    },
    [taskLookup]
  );

  const dependenciesByTarget = useMemo(() => {
    const map: Record<string, TaskDependency[]> = {};
    for (const dependency of plan.dependencies) {
      map[dependency.target_task_id] ??= [];
      map[dependency.target_task_id].push(dependency);
    }
    return map;
  }, [plan.dependencies]);

  const dependentsBySource = useMemo(() => {
    const map: Record<string, TaskDependency[]> = {};
    for (const dependency of plan.dependencies) {
      map[dependency.source_task_id] ??= [];
      map[dependency.source_task_id].push(dependency);
    }
    return map;
  }, [plan.dependencies]);

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
    const combinedIds = new Set<string>([
      ...activeIdsFromPlan,
      ...manuallyRestoredIds,
      ...Object.keys(lockedTasks),
    ]);

    const sortable = Array.from(combinedIds).map(taskId => {
      const lockOrder = lockedTasks[taskId]?.order ?? null;
      const planIndex = sanitizedTaskIds.indexOf(taskId);
      const fallbackRank =
        planIndex >= 0 ? planIndex + 1 : priorityState.ranks[taskId] ?? Number.MAX_SAFE_INTEGER;
      return {
        taskId,
        lockOrder,
        fallbackRank,
      };
    });

    sortable.sort((a, b) => {
      if (a.lockOrder !== null && b.lockOrder !== null) {
        if (a.lockOrder !== b.lockOrder) {
          return a.lockOrder - b.lockOrder;
        }
      } else if (a.lockOrder !== null) {
        return -1;
      } else if (b.lockOrder !== null) {
        return 1;
      }

      if (a.fallbackRank !== b.fallbackRank) {
        return a.fallbackRank - b.fallbackRank;
      }

      return a.taskId.localeCompare(b.taskId);
    });

    return sortable.map(entry => entry.taskId);
  }, [activeIdsFromPlan, manuallyRestoredIds, lockedTasks, sanitizedTaskIds, priorityState.ranks]);

  useEffect(() => {
    if (Object.keys(lockedTasks).length === 0) {
      return;
    }
    const updated: Record<string, LockedTaskState> = {};
    let changed = false;
    orderedActiveIds.forEach((taskId, index) => {
      if (lockedTasks[taskId]) {
        const nextOrder = index + 1;
        updated[taskId] = { order: nextOrder };
        if (lockedTasks[taskId].order !== nextOrder) {
          changed = true;
        }
      }
    });
    if (changed) {
      updateLockedTasks(() => updated);
    }
  }, [lockedTasks, orderedActiveIds, updateLockedTasks]);

  const taskOptions = useMemo<TaskOption[]>(() => {
    const ids = Array.from(new Set([...sanitizedTaskIds, ...manuallyRestoredIds, ...Object.keys(lockedTasks)]));
    return ids.map(id => ({
      id,
      title: getTaskTitle(id),
    }));
  }, [sanitizedTaskIds, manuallyRestoredIds, lockedTasks, getTaskTitle]);

  const activeTasks = orderedActiveIds
    .map((taskId, index) => {
      const node = nodeMap[taskId];
      if (!node) {
        return null;
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

      return {
        id: taskId,
        title: node.title,
        category: node.category ?? null,
        isLocked: Boolean(lockedTasks[taskId]),
        movement,
        dependencyLinks: buildDependencyLinks(node.dependencies, priorityState.ranks, getTaskTitle),
        displayOrder: index + 1,
        checked: priorityState.statuses[taskId] === 'completed',
        isAiGenerated: Boolean(node.manualOverride),
        isManual: Boolean(node.isManual),
        isPrioritizing: Boolean(prioritizingTasks[taskId]),
      };
    })
    .filter(Boolean) as Array<{
      id: string;
      title: string;
      category: 'leverage' | 'neutral' | 'overhead' | null;
      isLocked: boolean;
      movement: MovementInfo | undefined;
      dependencyLinks: ReturnType<typeof buildDependencyLinks>;
      displayOrder: number;
      checked: boolean;
      isAiGenerated: boolean;
      isManual: boolean;
      isPrioritizing: boolean;
    }>;

  const topTaskHighlights = useMemo(
    () =>
      activeTasks.slice(0, 3).map(task => `#${task.displayOrder} ${task.title}`),
    [activeTasks]
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
    const segments: string[] = [];
    if (normalizedOutcome) {
      segments.push(`Keeps focus on “${normalizedOutcome}”.`);
    }
    if (summary) {
      segments.push(summary);
    }
    if (topTaskHighlights.length) {
      segments.push(`Immediate next steps: ${topTaskHighlights.join(', ')}.`);
    }
    return segments.join(' ');
  }, [normalizedOutcome, plan.synthesis_summary, topTaskHighlights]);

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
        if (nextStatus !== 'discarded' && next.reasons[taskId]) {
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
      flashTask(taskId);
    },
    [updatePriorityState, sanitizedTaskIds.length, flashTask]
  );

  const handleToggleLock = useCallback(
    (taskId: string, order: number) => {
      updateLockedTasks(current => {
        const next = { ...current };
        if (next[taskId]) {
          delete next[taskId];
        } else {
          next[taskId] = { order };
        }
        return next;
      });
      updatePriorityState(prev => {
        const next: PriorityState = {
          statuses: { ...prev.statuses },
          reasons: { ...prev.reasons },
          ranks: { ...prev.ranks },
        };
        if (!next.statuses[taskId]) {
          next.statuses[taskId] = 'active';
        }
        if (!lockedTasks[taskId]) {
          next.ranks[taskId] = order;
        }
        return next;
      });
    },
    [lockedTasks, updateLockedTasks, updatePriorityState]
  );

  const handleSelectTask = useCallback((taskId: string) => {
    setSelectedTaskId(taskId);
    setIsDrawerOpen(true);
  }, []);

  const handleRefineTask = useCallback((taskId: string, taskText: string) => {
    setRefinementTaskId(taskId);
    setRefinementTaskText(taskText);
    setShowRefinementModal(true);
  }, []);

  const handleApplyRefinement = useCallback(
    async ({ taskId, suggestionId, newTaskTexts, action }: ApplyRefinementPayload) => {
      try {
        const response = await fetch(`/api/tasks/${taskId}/apply-refinement`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            suggestion_id: suggestionId,
            new_task_texts: newTaskTexts,
            action,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          throw new Error(errorData?.error || 'Failed to apply refinement');
        }

        setShowRefinementModal(false);

        toast.success(
          `${action.charAt(0).toUpperCase() + action.slice(1)} operation applied. ${
            newTaskTexts.length
          } new task(s) created.`
        );

        if (outcomeId) {
          triggerAutoPrioritization();
        }
      } catch (error) {
        console.error('Error applying refinement:', error);
        toast.error('Failed to apply refinement. Please try again.');
      }
    },
    [outcomeId, triggerAutoPrioritization]
  );

  const selectedNode = selectedTaskId ? nodeMap[selectedTaskId] ?? null : null;
  const selectedStatus: TaskStatus = selectedTaskId
    ? priorityState.statuses[selectedTaskId] ?? 'active'
    : 'active';
  const selectedReason = selectedTaskId ? priorityState.reasons[selectedTaskId] : undefined;
  const selectedConfidence = selectedNode?.confidence ?? null;
  const selectedMovement: MovementInfo | undefined =
    selectedNode?.movement ?? movementMap[selectedTaskId ?? ''];
  const selectedIsLocked = selectedNode ? Boolean(lockedTasks[selectedNode.id]) : false;

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

        {planNarrative && (
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
          {isLoadingTasks ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-12 rounded-lg" />
              ))}
            </div>
          ) : activeTasks.length === 0 ? (
            <div className="px-2 py-4 text-sm text-muted-foreground">
              All current priorities are complete. Rerun the agent when new work arrives.
            </div>
          ) : (
            <ScrollArea className="max-h-[560px]">
              <div className="sticky top-0 z-10 hidden grid-cols-[48px_minmax(0,1fr)_120px_96px_48px] gap-2 border-b border-border/60 bg-background/95 px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground backdrop-blur lg:grid">
                <span>#</span>
                <span className="text-left">Task</span>
                <span className="text-left">Depends</span>
                <span className="text-right">Movement</span>
                <span className="text-right">Done</span>
              </div>
        <div className="flex flex-col gap-4 lg:gap-0 lg:divide-y lg:divide-border/60">
          {activeTasks.map(task => (
            <TaskRow
              key={`active-${task.id}`}
              taskId={task.id}
              order={task.displayOrder}
              title={task.title}
              category={task.category}
              isLocked={task.isLocked}
              dependencyLinks={task.dependencyLinks}
              movement={task.movement}
              checked={task.checked}
              isAiGenerated={task.isAiGenerated}
              isManual={task.isManual}
              isPrioritizing={task.isPrioritizing}
              isSelected={selectedTaskId === task.id && isDrawerOpen}
              isHighlighted={highlightedIds.has(task.id)}
              onSelect={handleSelectTask}
              onToggleCompleted={handleToggleCompleted}
              onToggleLock={() => handleToggleLock(task.id, task.displayOrder)}
              isEditingDisabled={sessionStatus === 'running'}
              onTaskTitleChange={handleTaskTitleChange}
              outcomeId={outcomeId}
              onEditSuccess={handleTaskEditSuccess}
              clarityScore={taskLookup[task.id]?.clarityScore}
              badgeColor={taskLookup[task.id]?.badgeColor}
              badgeLabel={taskLookup[task.id]?.badgeLabel}
              qualityMetadata={taskLookup[task.id]?.qualityMetadata}
              onRefineClick={() => handleRefineTask(task.id, task.title)}
              isRecalculating={isRecalculating}
              onQualityUpdate={handleQualityUpdate}
            />
          ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </section>

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
              }
            : null
        }
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
        isLocked={selectedIsLocked}
        onRemoveDependency={handleRemoveDependency}
      onAddDependency={handleAddDependency}
      taskOptions={taskOptions}
      />

      <ManualTaskModal
        open={isManualTaskModalOpen}
        onOpenChange={setIsManualTaskModalOpen}
        outcomeId={outcomeId}
        onTaskCreated={handleManualTaskCreated}
        onDuplicateTaskFound={handleDuplicateTaskFound}
      />

      <DiscardReviewModal
        open={showDiscardReview}
        candidates={discardCandidates}
        onOpenChange={handleDiscardModalOpenChange}
        onToggleCandidate={handleToggleDiscardCandidate}
        onApplyChanges={handleApplyDiscardDecisions}
        onCancelAll={handleCancelAllDiscards}
      />

      <RefinementModal
        isOpen={showRefinementModal}
        onClose={() => setShowRefinementModal(false)}
        originalTaskId={refinementTaskId || ''}
        originalTaskText={refinementTaskText}
        onApplyRefinement={handleApplyRefinement}
      />
    </div>
  );
}
