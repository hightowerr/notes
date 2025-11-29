'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, RotateCcw, Trash2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type DiscardPileTask = {
  task_id: string;
  task_text: string;
  exclusion_reason: string | null;
  created_at: string | null;
  is_manual: boolean;
  outcome_id?: string | null;
};

type DiscardPileSectionProps = {
  outcomeId?: string | null;
  onOverride?: (taskId: string) => void;
  onConfirmDiscard?: (taskId: string) => void;
  isLoading?: boolean;
};

export function DiscardPileSection({
  outcomeId,
  onOverride,
  onConfirmDiscard,
  isLoading = false,
}: DiscardPileSectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [tasks, setTasks] = useState<DiscardPileTask[]>([]);
  const [isFetching, setIsFetching] = useState(false);

  const loadTasks = useMemo(
    () => async () => {
      setIsFetching(true);
      try {
        const url = new URL('/api/tasks/discard-pile', window.location.origin);
        if (outcomeId) {
          url.searchParams.set('outcome_id', outcomeId);
        }
        const response = await fetch(url.toString());
        if (!response.ok) {
          throw new Error(`Failed to load discard pile: ${response.status}`);
        }
        const payload = (await response.json()) as { tasks: DiscardPileTask[] };
        setTasks(payload.tasks ?? []);
      } catch (error) {
        console.error('[DiscardPileSection] Failed to load discard pile', error);
        toast.error('Unable to load discard pile');
      } finally {
        setIsFetching(false);
      }
    },
    [outcomeId]
  );

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  const handleOverride = async (taskId: string) => {
    try {
      const response = await fetch(`/api/tasks/manual/${taskId}/override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const message = payload?.error || 'Failed to override discard decision';
        throw new Error(message);
      }
      setTasks(prev => prev.filter(task => task.task_id !== taskId));
      onOverride?.(taskId);
      toast.success('Task sent back for re-analysis');
    } catch (error) {
      console.error('[DiscardPileSection] Override failed', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to send task for re-analysis'
      );
    }
  };

  const handleConfirmDiscard = async (taskId: string) => {
    if (typeof window !== 'undefined' && !window.confirm('Are you sure? This task will be recoverable for 30 days.')) {
      return;
    }

    try {
      const response = await fetch(`/api/tasks/manual/${taskId}/confirm-discard`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to discard task');
      }

      setTasks(prev => prev.filter(task => task.task_id !== taskId));
      onConfirmDiscard?.(taskId);
      toast.info('Task discarded (recoverable for 30 days)');
    } catch (error) {
      console.error('[DiscardPileSection] Discard failed', error);
      toast.error('Failed to discard task');
    }
  };

  return (
    <section className="relative z-20 rounded-xl border border-border/60 bg-bg-layer-2/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-foreground">Discard Pile</h2>
          <p className="text-sm text-muted-foreground">
            Tasks excluded by the agent. Override to request re-analysis.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          onClick={() => setIsOpen(value => !value)}
          aria-expanded={isOpen}
        >
          {isOpen ? (
            <>
              <ChevronUp className="h-4 w-4" />
              Hide
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4" />
              Show discarded ({tasks.length})
            </>
          )}
        </button>
      </div>

      {isOpen && (
        <div className="mt-3 divide-y divide-border/60 rounded-lg border border-border/60 bg-background/80 shadow-1layer-sm">
          {isFetching || isLoading ? (
            <div className="px-3 py-4 text-sm text-muted-foreground">Loading…</div>
          ) : tasks.length === 0 ? (
            <div className="px-3 py-4 text-sm text-muted-foreground">
              No tasks in the discard pile.
            </div>
          ) : (
            tasks.map(task => (
              <div
                key={`discard-${task.task_id}`}
                className={cn(
                  'flex flex-col gap-2 px-3 py-3 text-sm transition-colors hover:bg-muted/30 md:flex-row md:items-center md:justify-between'
                )}
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 text-foreground">
                    <span className="truncate font-medium">{task.task_text}</span>
                    {task.created_at && (
                      <span className="text-[11px] uppercase text-muted-foreground">
                        Added {new Date(task.created_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  {task.exclusion_reason && (
                    <p className="text-xs text-muted-foreground">{task.exclusion_reason}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-primary transition hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    onClick={() => handleOverride(task.task_id)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Override
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-destructive transition hover:text-destructive/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-2"
                    onClick={() => handleConfirmDiscard(task.task_id)}
                    title="Permanently discard this task"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Confirm discard
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
}
