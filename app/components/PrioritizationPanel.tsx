'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, AlertTriangle, Layers, PlayCircle } from 'lucide-react';

import { supabase } from '@/lib/supabase';
import type { ExecutionMetadata, PrioritizedTaskPlan } from '@/lib/types/agent';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

type PrioritizationPanelProps = {
  plan: PrioritizedTaskPlan;
  executionMetadata?: ExecutionMetadata | null;
  className?: string;
};

type TaskLookup = Record<
  string,
  {
    title: string;
  }
>;

function getConfidenceTone(score: number): string {
  if (score >= 0.8) {
    return 'bg-emerald-500/10 text-emerald-700 ring-1 ring-inset ring-emerald-500/30';
  }

  if (score >= 0.6) {
    return 'bg-amber-500/10 text-amber-700 ring-1 ring-inset ring-amber-500/30';
  }

  return 'bg-rose-500/10 text-rose-700 ring-1 ring-inset ring-rose-500/30';
}

function formatConfidence(score: number): string {
  const percent = Math.round(score * 100);
  return `${percent}%`;
}

function formatTaskId(taskId: string): string {
  if (!taskId) {
    return 'Unknown task';
  }

  const parts = taskId.split('::');
  const lastPart = parts[parts.length - 1];
  return lastPart.replace(/[-_]/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

function getTaskTitle(taskLookup: TaskLookup, taskId: string): string {
  return taskLookup[taskId]?.title ?? formatTaskId(taskId);
}

export function PrioritizationPanel({ plan, executionMetadata, className }: PrioritizationPanelProps) {
  const [taskLookup, setTaskLookup] = useState<TaskLookup>({});
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  const [taskError, setTaskError] = useState<string | null>(null);

  const orderedTaskIds = useMemo(() => Array.from(new Set(plan.ordered_task_ids)), [plan]);

  useEffect(() => {
    let isMounted = true;

    async function loadTasks(ids: string[]) {
      if (ids.length === 0) {
        if (isMounted) {
          setTaskLookup({});
        }
        return;
      }

      try {
        setIsLoadingTasks(true);
        setTaskError(null);

        const { data, error } = await supabase
          .from('task_embeddings')
          .select('task_id, task_text')
          .in('task_id', ids);

        if (error) {
          throw error;
        }

        if (!isMounted) {
          return;
        }

        const lookup: TaskLookup = {};
        for (const task of data ?? []) {
          lookup[task.task_id] = {
            title: task.task_text ?? formatTaskId(task.task_id),
          };
        }

        setTaskLookup(lookup);
      } catch (error) {
        console.error('[PrioritizationPanel] Failed to fetch task titles', error);
        if (isMounted) {
          setTaskError('Unable to fetch task titles. Displaying task IDs instead.');
          setTaskLookup({});
        }
      } finally {
        if (isMounted) {
          setIsLoadingTasks(false);
        }
      }
    }

    loadTasks(orderedTaskIds);

    return () => {
      isMounted = false;
    };
  }, [orderedTaskIds]);

  const renderWaveTasks = (taskIds: string[]) => {
    return taskIds.map(taskId => {
      const confidence = plan.confidence_scores[taskId];
      return (
        <li
          key={taskId}
          className="rounded-lg border border-border bg-background/80 px-4 py-3 shadow-1layer-sm"
        >
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-foreground">
              {getTaskTitle(taskLookup, taskId)}
            </span>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <code className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground/80">
                {taskId}
              </code>
              {typeof confidence === 'number' && (
                <Badge className={cn(getConfidenceTone(confidence), 'font-medium')} variant="outline">
                  Confidence {formatConfidence(confidence)}
                </Badge>
              )}
            </div>
          </div>
        </li>
      );
    });
  };

  return (
    <Card className={cn('border-border/70 shadow-2layer-md', className)}>
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Layers className="h-5 w-5 text-primary" />
              Execution Waves
            </CardTitle>
            <CardDescription className="text-sm text-muted-foreground">
              Tasks grouped into sequential waves with confidence indicators and dependency highlights.
            </CardDescription>
          </div>
          {executionMetadata && (
            <div className="flex flex-col items-end gap-1 text-xs text-muted-foreground">
              <span>{executionMetadata.steps_taken} steps</span>
              <span>{Math.round(executionMetadata.total_time_ms / 100) / 10}s total runtime</span>
            </div>
          )}
        </div>

        <Alert className="border-primary/30 bg-primary/5">
          <PlayCircle className="h-5 w-5 text-primary" />
          <AlertTitle>Summary</AlertTitle>
          <AlertDescription className="text-sm leading-relaxed text-foreground">
            {plan.synthesis_summary}
          </AlertDescription>
        </Alert>

        {taskError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Task details unavailable</AlertTitle>
            <AlertDescription>{taskError}</AlertDescription>
          </Alert>
        )}
      </CardHeader>

      <CardContent className="space-y-8">
        <section className="space-y-4">
          {isLoadingTasks ? (
            <div className="grid gap-4 md:grid-cols-2">
              {Array.from({ length: plan.execution_waves.length || 2 }).map((_, index) => (
                <Skeleton key={index} className="h-36 rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2">
              {plan.execution_waves.map(wave => (
                <div
                  key={wave.wave_number}
                  className="flex h-full flex-col gap-4 rounded-xl border border-border/60 bg-muted/40 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="uppercase tracking-wide">
                        Wave {wave.wave_number}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {wave.parallel_execution ? 'Runs in parallel' : 'Sequential step'}
                      </span>
                    </div>
                    {typeof wave.estimated_duration_hours === 'number' && (
                      <Badge variant="outline">
                        ~{wave.estimated_duration_hours}h
                      </Badge>
                    )}
                  </div>

                  <ul className="flex flex-col gap-3">{renderWaveTasks(wave.task_ids)}</ul>
                </div>
              ))}
            </div>
          )}
        </section>

        <Separator />

        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">Dependencies</Badge>
            <span className="text-sm text-muted-foreground">
              {plan.dependencies.length > 0
                ? 'Tasks that must occur in a specific order.'
                : 'No blocking dependencies detected.'}
            </span>
          </div>

          {plan.dependencies.length > 0 && (
            <ul className="space-y-3">
              {plan.dependencies.map(dependency => {
                const sourceTitle = getTaskTitle(taskLookup, dependency.source_task_id);
                const targetTitle = getTaskTitle(taskLookup, dependency.target_task_id);

                return (
                  <li
                    key={`${dependency.source_task_id}-${dependency.target_task_id}-${dependency.relationship_type}`}
                    className="rounded-lg border border-border bg-background/80 px-4 py-3 text-sm shadow-1layer-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-foreground">{sourceTitle}</span>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-medium text-foreground">{targetTitle}</span>
                      <Badge variant="outline" className="uppercase tracking-wide">
                        {dependency.relationship_type}
                      </Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span>
                        Confidence: {formatConfidence(dependency.confidence)}
                      </span>
                      <span className="text-muted-foreground/80">
                        via {dependency.detection_method === 'ai_inference' ? 'AI inference' : 'stored graph'}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <Separator />

        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">Confidence Scores</Badge>
            <span className="text-sm text-muted-foreground">
              Higher scores indicate stronger certainty in prioritization.
            </span>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {orderedTaskIds.map(taskId => {
              const score = plan.confidence_scores[taskId];
              if (typeof score !== 'number') {
                return null;
              }

              return (
                <div
                  key={`confidence-${taskId}`}
                  className="flex items-center justify-between rounded-lg border border-border/60 bg-background/80 px-3 py-2 text-sm"
                >
                  <span className="truncate pr-3 text-foreground" title={getTaskTitle(taskLookup, taskId)}>
                    {getTaskTitle(taskLookup, taskId)}
                  </span>
                  <Badge className={cn(getConfidenceTone(score), 'min-w-[72px] justify-center')} variant="outline">
                    {formatConfidence(score)}
                  </Badge>
                </div>
              );
            })}
          </div>
        </section>
      </CardContent>
    </Card>
  );
}

