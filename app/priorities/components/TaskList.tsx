'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

import { supabase } from '@/lib/supabase';
import type { ExecutionMetadata, PrioritizedTaskPlan, TaskDependency } from '@/lib/types/agent';
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
  }
>;

type TaskRenderNode = {
  id: string;
  title: string;
  confidence: number | null;
  dependencies: TaskDependency[];
  dependents: TaskDependency[];
  movement?: MovementInfo;
  planRank?: number | null;
};

type TaskListProps = {
  plan: PrioritizedTaskPlan;
  executionMetadata?: ExecutionMetadata | null;
  sessionId: string | null;
  planVersion: number;
  outcomeId: string | null;
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
  ranks: Record<string, number>
) {
  return dependencies.map(dependency => ({
    taskId: dependency.source_task_id,
    rank: ranks[dependency.source_task_id] ?? null,
    label: `Depends on #${ranks[dependency.source_task_id] ?? '?'}`,
  }));
}

function buildDependentLinks(
  dependents: TaskDependency[],
  ranks: Record<string, number>
) {
  return dependents.map(dependency => ({
    taskId: dependency.target_task_id,
    rank: ranks[dependency.target_task_id] ?? null,
    label: `Unblocks #${ranks[dependency.target_task_id] ?? '?'}`,
  }));
}

export function TaskList({
  plan,
  executionMetadata,
  sessionId,
  planVersion,
  outcomeId,
  onDiffSummary,
}: TaskListProps) {
  const sanitizedTaskIds = useMemo(() => sanitizePlanOrder(plan), [plan]);
  const { movementMap, highlightedIds, flashTask } = useTaskDiff(sanitizedTaskIds);
  const scrollToTask = useScrollToTask({ flashTask });

  const statusNote = executionMetadata?.status_note ?? null;
  const hasToolFailures = Boolean(executionMetadata && executionMetadata.error_count > 0);
  const failedTools = executionMetadata?.failed_tools ?? [];

  const [taskLookup, setTaskLookup] = useState<TaskLookup>({});
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

  const storageKey = outcomeId ? `priority-state:${outcomeId}` : null;
  const previousPlanRef = useRef<string[] | null>(null);
  const priorityStateRef = useRef<PriorityState>(priorityState);
  const metadataRef = useRef<Record<string, TaskRenderNode>>({});
  const hasLoadedStoredState = useRef(false);
  const discardTimeoutRef = useRef<number | null>(null);
  const previousStorageKeyRef = useRef<string | null>(null);

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

  useEffect(
    () => () => {
      if (discardTimeoutRef.current) {
        window.clearTimeout(discardTimeoutRef.current);
      }
    },
    []
  );

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
      if (!nextState.statuses[taskId] || nextState.statuses[taskId] === 'discarded') {
        nextState.statuses[taskId] = 'active';
        stateChanged = true;
      }
      if (nextState.ranks[taskId] !== index + 1) {
        nextState.ranks[taskId] = index + 1;
        ranksChanged = true;
      }
    });

    if (prevPlan.length > 0) {
      prevPlan.forEach(taskId => {
        if (!sanitizedTaskIds.includes(taskId)) {
          const status = nextState.statuses[taskId];
          if (status === 'active' || status === 'completed') {
            nextState.statuses[taskId] = 'discarded';
            if (!nextState.reasons[taskId]) {
              const note = statusNote && statusNote.trim().length > 0 ? statusNote.trim() : null;
              nextState.reasons[taskId] = note ?? DEFAULT_REMOVAL_REASON;
            }
            stateChanged = true;
            newlyDiscarded.push(taskId);
          }
        }
      });
    }

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
  ]);

  const trackedTaskIds = useMemo(
    () => Array.from(new Set([...sanitizedTaskIds, ...Object.keys(priorityState.statuses)])),
    [sanitizedTaskIds, priorityState.statuses]
  );

  useEffect(() => {
    if (trackedTaskIds.length === 0) {
      setTaskLookup({});
      return;
    }

    let isMounted = true;

    const loadTasks = async () => {
      try {
        setIsLoadingTasks(true);
        setTaskError(null);

        const { data, error } = await supabase
          .from('task_embeddings')
          .select('task_id, task_text, document_id')
          .in('task_id', trackedTaskIds);

        if (error) {
          throw error;
        }

        if (!isMounted) {
          return;
        }

        setTaskLookup(prev => {
          const next = { ...prev };
          for (const task of data ?? []) {
            next[task.task_id] = {
              title: task.task_text ?? formatTaskId(task.task_id),
              documentId: task.document_id,
            };
          }
          return next;
        });
      } catch (error) {
        console.error('[TaskList] Failed to load task titles', error);
        if (isMounted) {
          setTaskError('Unable to load task titles. Showing task IDs instead.');
        }
      } finally {
        if (isMounted) {
          setIsLoadingTasks(false);
        }
      }
    };

    loadTasks();

    return () => {
      isMounted = false;
    };
  }, [trackedTaskIds]);

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

  const baseNodeMap = useMemo(() => {
    const map: Record<string, TaskRenderNode> = {};
    sanitizedTaskIds.forEach((taskId, index) => {
      map[taskId] = {
        id: taskId,
        title: getTaskTitle(taskId),
        confidence: plan.confidence_scores[taskId] ?? null,
        dependencies: dependenciesByTarget[taskId] ?? [],
        dependents: dependentsBySource[taskId] ?? [],
        movement: movementMap[taskId],
        planRank: index + 1,
      };
    });
    return map;
  }, [sanitizedTaskIds, getTaskTitle, plan.confidence_scores, dependenciesByTarget, dependentsBySource, movementMap]);

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
        };
      } else {
        snapshot[taskId] = {
          id: taskId,
          title: getTaskTitle(taskId),
          confidence: null,
          dependencies: [],
          dependents: [],
          movement: movementMap[taskId],
          planRank: null,
        };
      }
    });

    return snapshot;
  }, [baseNodeMap, priorityState.statuses, getTaskTitle, movementMap]);

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

  const orderedActiveIds = useMemo(
    () => [...activeIdsFromPlan, ...manuallyRestoredIds],
    [activeIdsFromPlan, manuallyRestoredIds]
  );

  const activeTasks = orderedActiveIds
    .map((taskId, index) => {
      const node = nodeMap[taskId];
      if (!node) {
        return null;
      }
      return {
        id: taskId,
        title: node.title,
        movement: node.movement,
        dependencies: buildDependencyLinks(node.dependencies, priorityState.ranks),
        status: priorityState.statuses[taskId] ?? 'active',
        displayOrder: index + 1,
        isManual: !sanitizedTaskIds.includes(taskId),
        previousRank: priorityState.ranks[taskId],
      };
    })
    .filter(Boolean) as Array<{
      id: string;
      title: string;
      movement: MovementInfo;
      dependencies: ReturnType<typeof buildDependencyLinks>;
      status: TaskStatus;
      displayOrder: number;
      isManual: boolean;
      previousRank?: number | null;
    }>;

  const completedTasks = useMemo(
    () =>
      Object.entries(priorityState.statuses)
        .filter(([, status]) => status === 'completed')
        .map(([taskId]) => {
          const node = nodeMap[taskId];
          return {
            id: taskId,
            title: node?.title ?? getTaskTitle(taskId),
            dependencyLinks: buildDependencyLinks(node?.dependencies ?? [], priorityState.ranks),
            movement: movementMap[taskId],
            isHighlighted: highlightedIds.has(taskId),
            lastKnownRank: priorityState.ranks[taskId],
          };
        }),
    [priorityState.statuses, nodeMap, getTaskTitle, priorityState.ranks, movementMap, highlightedIds]
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
            dependencyLinks: buildDependencyLinks(node?.dependencies ?? [], priorityState.ranks),
            movement: movementMap[taskId],
            reason: priorityState.reasons[taskId],
            lastKnownRank: priorityState.ranks[taskId],
            isHighlighted: recentlyDiscarded.has(taskId),
          };
        }),
    [
      priorityState.statuses,
      nodeMap,
      getTaskTitle,
      priorityState.ranks,
      movementMap,
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
          {executionMetadata && (
            <span className="text-xs text-muted-foreground">
              {executionMetadata.steps_taken} steps •{' '}
              {Math.round(executionMetadata.total_time_ms / 100) / 10}s runtime
            </span>
          )}
        </div>

        <p className="text-sm text-muted-foreground">{plan.synthesis_summary}</p>

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
              <div className="divide-y divide-border/60">
                {activeTasks.map(task => (
                  <TaskRow
                    key={`active-${task.id}`}
                    taskId={task.id}
                    order={task.displayOrder}
                    title={task.title}
                    dependencyLinks={task.dependencies}
                    movement={task.movement}
                    status={task.status}
                    isManual={task.isManual}
                    previousRank={task.previousRank}
                    isSelected={selectedTaskId === task.id && isDrawerOpen}
                    isHighlighted={highlightedIds.has(task.id)}
                    onSelect={handleSelectTask}
                    onToggleCompleted={handleToggleCompleted}
                    onDependencyClick={scrollToTask}
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
        onDependencyClick={scrollToTask}
      />

      <DiscardedTasks
        tasks={discardedTasks}
        onReturnToActive={handleReturnToActive}
        onSelect={handleSelectTask}
        onDependencyClick={scrollToTask}
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
                movement: selectedMovement ?? null,
                dependencies: selectedNode.dependencies,
                dependents: selectedNode.dependents,
                dependencyLinks: buildDependencyLinks(selectedNode.dependencies, priorityState.ranks),
                dependentLinks: buildDependentLinks(selectedNode.dependents, priorityState.ranks),
              }
            : null
        }
        status={selectedStatus}
        removalReason={selectedReason}
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
        sessionId={sessionId}
      />
    </div>
  );
}
