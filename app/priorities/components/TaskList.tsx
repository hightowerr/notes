'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

import type {
  ExecutionMetadata,
  PrioritizedTaskPlan,
  TaskAnnotation,
  TaskDependency,
  TaskRemoval,
} from '@/lib/types/agent';
import type { AdjustedPlan } from '@/lib/types/adjustment';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { TaskRow } from '@/app/priorities/components/TaskRow';
import { CompletedTasks } from '@/app/priorities/components/CompletedTasks';
import { DiscardedTasks } from '@/app/priorities/components/DiscardedTasks';
import { TaskDetailsDrawer } from '@/app/priorities/components/TaskDetailsDrawer';
import { useTaskDiff } from '@/app/priorities/components/useTaskDiff';
import { useScrollToTask } from '@/app/priorities/components/useScrollToTask';
import type { MovementInfo } from '@/app/priorities/components/MovementBadge';
import {
  DEPENDENCY_OVERRIDE_STORAGE_KEY,
  type DependencyOverrideEntry,
  type DependencyOverrideStore,
} from '@/lib/utils/dependencyOverrides';
import { useLocalStorage } from '@/lib/hooks/useLocalStorage';

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
  }
>;

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
  state?: 'active' | 'completed' | 'discarded' | 'manual_override' | 'reintroduced';
  removalReason?: string | null;
};

type LockedTaskState = {
  order: number;
};

type TaskOption = {
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
};

const DEFAULT_REMOVAL_REASON =
  'Removed in the latest agent recalculation. Review and reinstate if still relevant.';

function formatTaskId(taskId: string): string {
  if (!taskId) {
    return 'Unknown task';
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

export function TaskList({
  plan,
  executionMetadata,
  planVersion,
  outcomeId,
  outcomeStatement,
  adjustedPlan,
  onDiffSummary,
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
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [recentlyDiscarded, setRecentlyDiscarded] = useState<Set<string>>(new Set());
  const [lockStore, setLockStore] = useLocalStorage<Record<string, Record<string, LockedTaskState>>>('locked-tasks', {});
  const [dependencyStore, setDependencyStore] = useLocalStorage<DependencyOverrideStore>(DEPENDENCY_OVERRIDE_STORAGE_KEY, {});
  const outcomeKey = outcomeId ?? 'global';
  const lockedTasks = lockStore[outcomeKey] ?? {};
  const dependencyOverrides = dependencyStore[outcomeKey] ?? {};

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

    const prevPlan = previousPlanRef.current ?? [];
    const currentState = priorityStateRef.current;

    const nextState: PriorityState = {
      statuses: { ...currentState.statuses },
      reasons: { ...currentState.reasons },
      ranks: { ...currentState.ranks },
    };

    let stateChanged = false;
    let ranksChanged = false;
    const newlyDiscarded: string[] = [];

    sanitizedTaskIds.forEach((taskId, index) => {
      const annotation = annotationById.get(taskId);
      const previousStatus = nextState.statuses[taskId];

      if (!previousStatus || previousStatus === 'discarded') {
        nextState.statuses[taskId] = 'active';
        stateChanged = true;
      }

      if (annotation?.state === 'completed' && nextState.statuses[taskId] !== 'completed') {
        nextState.statuses[taskId] = 'completed';
        stateChanged = true;
      }

      if (annotation?.state === 'discarded' && nextState.statuses[taskId] !== 'discarded') {
        nextState.statuses[taskId] = 'discarded';
        stateChanged = true;
        if (!newlyDiscarded.includes(taskId)) {
          newlyDiscarded.push(taskId);
        }
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
        if (!sanitizedTaskIds.includes(taskId)) {
          const status = nextState.statuses[taskId];
          if (status === 'active' || status === 'completed') {
            nextState.statuses[taskId] = 'discarded';
            const removal = removalById.get(taskId);
            if (removal?.removal_reason) {
              nextState.reasons[taskId] = removal.removal_reason;
            } else if (!nextState.reasons[taskId]) {
              const note = statusNote && statusNote.trim().length > 0 ? statusNote.trim() : null;
              nextState.reasons[taskId] = note ?? DEFAULT_REMOVAL_REASON;
            }
            stateChanged = true;
            if (!newlyDiscarded.includes(taskId)) {
              newlyDiscarded.push(taskId);
            }
          }
        }
      });
    }

    removedTasksFromPlan.forEach(removal => {
      const currentStatus = nextState.statuses[removal.task_id];
      if (currentStatus !== 'discarded') {
        nextState.statuses[removal.task_id] = 'discarded';
        stateChanged = true;
        if (!newlyDiscarded.includes(removal.task_id)) {
          newlyDiscarded.push(removal.task_id);
        }
      }

      if (removal.removal_reason) {
        if (nextState.reasons[removal.task_id] !== removal.removal_reason) {
          nextState.reasons[removal.task_id] = removal.removal_reason;
          stateChanged = true;
        }
      } else if (!nextState.reasons[removal.task_id]) {
        nextState.reasons[removal.task_id] = DEFAULT_REMOVAL_REASON;
        stateChanged = true;
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

    if (newlyDiscarded.length > 0) {
      flagRecentlyDiscarded(newlyDiscarded);
    }

    if (onDiffSummary) {
      const isInitial = planVersion <= 1;
      const orderChanged = prevPlan.length === 0 ? false : !arraysEqual(prevPlan, sanitizedTaskIds);
      const hasChanges = isInitial ? false : orderChanged || newlyDiscarded.length > 0;
      onDiffSummary({ hasChanges, isInitial });
    }

    previousPlanRef.current = sanitizedTaskIds;
  }, [
    outcomeId,
    sanitizedTaskIds,
    planVersion,
    onDiffSummary,
    updatePriorityState,
    flagRecentlyDiscarded,
    statusNote,
    annotationById,
    removalById,
    removedTasksFromPlan,
    lockedTasks,
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
            next[task.task_id] = {
              title: task.title ?? formatTaskId(task.task_id),
              documentId: task.document_id ?? null,
              category: task.category ?? null,
              rationale: task.rationale ?? null,
              sourceText: task.original_text ?? null,
            };
          }

          // 🔍 DIAGNOSTIC: Log taskLookup state
          console.log('[TaskList] TaskLookup updated:', {
            totalTasks: Object.keys(next).length,
            newTasks: payload.tasks?.length ?? 0,
            sampleTasks: Object.entries(next).slice(0, 2).map(([id, data]) => ({
              id: id.slice(0, 16) + '...',
              title: data.title?.slice(0, 30) + '...',
              hasCategory: !!data.category
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
    (taskId: string) => taskLookup[taskId]?.title ?? formatTaskId(taskId),
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
      if (existing) {
        snapshot[taskId] = {
          ...existing,
          title: getTaskTitle(taskId),
          movement: movementMap[taskId] ?? existing.movement,
          removalReason:
            existing.removalReason ?? removalById.get(taskId)?.removal_reason ?? null,
          manualOverride:
            existing.manualOverride ??
            annotationById.get(taskId)?.manual_override ??
            !sanitizedTaskIds.includes(taskId),
        };
      } else {
        const annotation = annotationById.get(taskId);
        const removal = removalById.get(taskId);
        const lookup = taskLookup[taskId];
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
              isSelected={selectedTaskId === task.id && isDrawerOpen}
              isHighlighted={highlightedIds.has(task.id)}
              onSelect={handleSelectTask}
              onToggleCompleted={handleToggleCompleted}
              onToggleLock={() => handleToggleLock(task.id, task.displayOrder)}
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
    </div>
  );
}
