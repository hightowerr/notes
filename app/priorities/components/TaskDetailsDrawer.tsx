'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { MovementBadge, type MovementInfo } from '@/app/priorities/components/MovementBadge';
import { ReasoningTracePanel } from '@/app/components/ReasoningTracePanel';
import type { TaskDependency } from '@/lib/types/agent';
import { cn } from '@/lib/utils';

type TaskStatus = 'active' | 'completed' | 'discarded';

type TaskSummary = {
  id: string;
  title: string;
  rank: number | null;
  confidence: number | null;
  movement: MovementInfo | null;
  dependencies: TaskDependency[];
  dependents: TaskDependency[];
  dependencyLinks: Array<{ taskId: string; rank: number | null; label: string }>;
  dependentLinks: Array<{ taskId: string; rank: number | null; label: string }>;
};

type TaskDetailsDrawerProps = {
  open: boolean;
  onClose: () => void;
  task: TaskSummary | null;
  status: TaskStatus;
  removalReason?: string;
  onMarkDone: () => void;
  onMarkActive: () => void;
  onReturnToActive: () => void;
  onNavigateToTask: (taskId: string) => void;
  getTaskTitle: (taskId: string) => string;
  sessionId: string | null;
};

export function TaskDetailsDrawer({
  open,
  onClose,
  task,
  status,
  removalReason,
  onMarkDone,
  onMarkActive,
  onReturnToActive,
  onNavigateToTask,
  getTaskTitle,
  sessionId,
}: TaskDetailsDrawerProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [showTrace, setShowTrace] = useState(false);
  const [traceAvailable, setTraceAvailable] = useState(true);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setShowTrace(false);
    }
  }, [open]);

  useEffect(() => {
    setTraceAvailable(true);
  }, [sessionId]);

  const confidenceLabel = useMemo(() => {
    if (!task || typeof task.confidence !== 'number') {
      return null;
    }

    const percent = Math.round(task.confidence * 100);
    return `${percent}%`;
  }, [task]);

  if (!isMounted || !open) {
    return null;
  }

  const isActive = status === 'active';
  const isCompleted = status === 'completed';
  const isDiscarded = status === 'discarded';

  const statusBadge = (() => {
    if (isCompleted) {
      return 'bg-muted text-muted-foreground';
    }
    if (isDiscarded) {
      return 'bg-amber-500/10 text-amber-600';
    }
    return 'bg-primary/10 text-primary';
  })();

  return createPortal(
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <aside
        className="relative ml-auto flex h-full w-full max-w-xl flex-col gap-6 bg-background px-6 py-8 shadow-2layer-md sm:max-w-md"
        role="dialog"
        aria-modal="true"
        aria-label={task ? `Details for ${task.title}` : 'Task details'}
      >
        <header className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            {task ? (
              <>
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  {typeof task.rank === 'number' && task.rank !== null && (
                    <Badge variant="secondary">#{task.rank}</Badge>
                  )}
                  {task.movement && <MovementBadge movement={task.movement} />}
                  {confidenceLabel && (
                    <Badge variant="outline" className="bg-muted/60">
                      Confidence {confidenceLabel}
                    </Badge>
                  )}
                  <Badge variant="outline" className={cn(statusBadge)}>
                    {isCompleted ? 'Completed' : isDiscarded ? 'Discarded' : 'To do'}
                  </Badge>
                </div>
                <h2 className="text-xl font-semibold text-foreground">{task.title}</h2>
              </>
            ) : (
              <h2 className="text-lg font-semibold text-foreground">Task details</h2>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </header>

        {task ? (
          <div className="flex flex-1 flex-col gap-6 overflow-y-auto pr-3">
            {isDiscarded && removalReason && (
              <div className="rounded-md border border-dashed border-border/60 bg-background/60 px-3 py-2 text-xs text-muted-foreground">
                {removalReason}
              </div>
            )}

            <section className="space-y-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Depends on</p>
              {task.dependencies.length === 0 ? (
                <p className="text-sm text-muted-foreground">No upstream dependencies.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {task.dependencies.map(dependency => {
                    const sourceTitle = getTaskTitle(dependency.source_task_id);
                    const rank = task.dependencyLinks.find(link => link.taskId === dependency.source_task_id)?.rank;
                    return (
                      <button
                        key={`${task.id}-drawer-dep-${dependency.source_task_id}`}
                        type="button"
                        onClick={() => onNavigateToTask(dependency.source_task_id)}
                        className="flex flex-col items-start rounded-md border border-transparent px-3 py-2 text-left text-sm transition-colors hover:border-border/60 hover:bg-muted/40"
                      >
                        <span className="font-medium text-foreground">
                          #{rank ?? '?'} • {sourceTitle}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Relationship: {dependency.relationship_type} • via{' '}
                          {dependency.detection_method === 'ai_inference' ? 'AI inference' : 'stored graph'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            <Separator />

            <section className="space-y-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Unblocks</p>
              {task.dependents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No downstream tasks rely on this yet.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {task.dependents.map(dependency => {
                    const targetTitle = getTaskTitle(dependency.target_task_id);
                    const rank = task.dependentLinks.find(link => link.taskId === dependency.target_task_id)?.rank;
                    return (
                      <button
                        key={`${task.id}-drawer-dependents-${dependency.target_task_id}`}
                        type="button"
                        onClick={() => onNavigateToTask(dependency.target_task_id)}
                        className="flex flex-col items-start rounded-md border border-transparent px-3 py-2 text-left text-sm transition-colors hover:border-border/60 hover:bg-muted/40"
                      >
                        <span className="font-medium text-foreground">
                          #{rank ?? '?'} • {targetTitle}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Relationship: {dependency.relationship_type} • via{' '}
                          {dependency.detection_method === 'ai_inference' ? 'AI inference' : 'stored graph'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            <Separator />

            <div className="flex flex-wrap items-center gap-2">
              {isActive && (
                <Button variant="outline" size="sm" onClick={onMarkDone}>
                  Mark as done
                </Button>
              )}
              {isCompleted && (
                <Button variant="outline" size="sm" onClick={onMarkActive}>
                  Move to active
                </Button>
              )}
              {isDiscarded && (
                <Button variant="secondary" size="sm" onClick={onReturnToActive}>
                  Return to active
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                disabled={!sessionId || !traceAvailable}
                onClick={() => setShowTrace(value => !value)}
              >
                {showTrace ? 'Hide reasoning trace' : 'Open reasoning trace'}
              </Button>
            </div>

            {!traceAvailable && (
              <p className="text-xs text-muted-foreground">
                Reasoning trace expired for this session. Run prioritization again to capture a fresh trace.
              </p>
            )}

            {showTrace && sessionId && traceAvailable && (
              <ReasoningTracePanel
                sessionId={sessionId}
                open={showTrace}
                onTraceUnavailable={() => {
                  setTraceAvailable(false);
                  setShowTrace(false);
                }}
              />
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Select a task from the list to view its details.</p>
        )}
      </aside>
    </div>,
    document.body
  );
}
