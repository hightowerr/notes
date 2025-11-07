'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/lib/supabase';
import type { Gap } from '@/lib/schemas/gapSchema';
import type { BridgingTask } from '@/lib/schemas/bridgingTaskSchema';

import { BridgingTaskCard } from '@/app/priorities/components/BridgingTaskCard';

export type BridgingTaskWithSelection = BridgingTask & { checked: boolean };

export type GapSuggestionState = {
  gap: Gap;
  status: 'loading' | 'success' | 'error' | 'requires_examples';
  tasks: BridgingTaskWithSelection[];
  error?: string;
  requiresManualExamples?: boolean;
  metadata?: {
    search_results_count: number;
    generation_duration_ms: number;
  };
};

export type GapAcceptanceErrorInfo = {
  message: string;
  details?: string[];
  code?: string;
};

type GapDetectionModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detectionStatus: 'idle' | 'detecting' | 'success' | 'error';
  detectionError: string | null;
  detectionResult: { gaps: Gap[]; metadata: { analysis_duration_ms: number; gaps_detected: number } } | null;
  suggestions: GapSuggestionState[];
  isGenerating: boolean;
  onToggleTask: (gapId: string, taskId: string, checked: boolean) => void;
  onEditTask: (
    gapId: string,
    taskId: string,
    updates: Pick<Partial<BridgingTask>, 'edited_task_text' | 'edited_estimated_hours'>
  ) => void;
  onRetryWithExamples: (gapId: string, examples: string[]) => void;
  onSkipExamples: (gapId: string) => void;
  onRetryGeneration: (gapId: string) => void; // T005: Manual retry for AI failures
  onAcceptSelected: () => void;
  isAccepting: boolean;
  acceptError: GapAcceptanceErrorInfo | null;
  generationProgress: number;
  generationDurationMs: number | null;
  onRetryAnalysis?: () => void;
  performanceMetrics?: {
    detection_ms: number;
    generation_ms: number;
    total_ms: number;
    search_query_count?: number;
  } | null;
};

type TaskLookup = Record<string, string>;

const INDICATOR_LABELS: Record<keyof Gap['indicators'], string> = {
  time_gap: 'Time gap',
  action_type_jump: 'Workflow jump',
  no_dependency: 'No dependency',
  skill_jump: 'Skill change',
};

function formatTaskTitle(taskId: string, lookup: TaskLookup): string {
  return lookup[taskId] ?? taskId;
}

function IndicatorBadges({ gap }: { gap: Gap }) {
  return (
    <div className="flex flex-wrap gap-2">
      {(Object.keys(gap.indicators) as Array<keyof Gap['indicators']>)
        .filter(key => gap.indicators[key])
        .map(key => (
          <Badge key={key} variant="outline" className="rounded-md border-border/70 bg-muted/40">
            {INDICATOR_LABELS[key]}
          </Badge>
        ))}
    </div>
  );
}

function ManualExamplesPrompt({
  gapId,
  predecessorTitle,
  successorTitle,
  onRetry,
  onSkip,
  isGenerating,
}: {
  gapId: string;
  predecessorTitle: string;
  successorTitle: string;
  onRetry: (gapId: string, examples: string[]) => void;
  onSkip: (gapId: string) => void;
  isGenerating: boolean;
}) {
  const [example1, setExample1] = useState('');
  const [example2, setExample2] = useState('');

  const handleRetry = () => {
    const examples: string[] = [];
    if (example1.trim().length >= 10) examples.push(example1.trim());
    if (example2.trim().length >= 10) examples.push(example2.trim());

    if (examples.length > 0) {
      onRetry(gapId, examples);
    }
  };

  const hasValidExamples = example1.trim().length >= 10 || example2.trim().length >= 10;

  return (
    <div className="space-y-4 rounded-lg border border-border/60 bg-muted/30 px-4 py-4">
      <Alert>
        <AlertTitle>No similar tasks found</AlertTitle>
        <AlertDescription>
          The system couldn&apos;t find similar tasks in your existing corpus. Provide 1-2 example tasks to help generate relevant suggestions for the gap between &quot;{predecessorTitle}&quot; → &quot;{successorTitle}&quot;.
        </AlertDescription>
      </Alert>
      <div className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor={`example1-${gapId}`}>Example task 1 (optional)</Label>
          <Input
            id={`example1-${gapId}`}
            placeholder="e.g., Implement user authentication with OAuth"
            value={example1}
            onChange={(e) => setExample1(e.target.value)}
            disabled={isGenerating}
            maxLength={200}
          />
          {example1.length > 0 && example1.length < 10 && (
            <p className="text-xs text-muted-foreground">Minimum 10 characters required</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor={`example2-${gapId}`}>Example task 2 (optional)</Label>
          <Input
            id={`example2-${gapId}`}
            placeholder="e.g., Set up database schema and migrations"
            value={example2}
            onChange={(e) => setExample2(e.target.value)}
            disabled={isGenerating}
            maxLength={200}
          />
          {example2.length > 0 && example2.length < 10 && (
            <p className="text-xs text-muted-foreground">Minimum 10 characters required</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button
          onClick={handleRetry}
          disabled={!hasValidExamples || isGenerating}
          size="sm"
        >
          {isGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Generate with Examples
        </Button>
        <Button
          variant="ghost"
          onClick={() => onSkip(gapId)}
          disabled={isGenerating}
          size="sm"
        >
          Skip (lower confidence)
        </Button>
      </div>
    </div>
  );
}

function GapProgressIndicator({
  totalGaps,
  processedGaps,
  successfulGaps,
  isGenerating,
  generationProgress,
  generationDurationMs,
}: {
  totalGaps: number;
  processedGaps: number;
  successfulGaps: number;
  isGenerating: boolean;
  generationProgress: number;
  generationDurationMs: number | null;
}) {
  if (totalGaps === 0) {
    return null;
  }

  const normalizedProgressCount = isGenerating
    ? Math.min(generationProgress, totalGaps)
    : Math.min(processedGaps, totalGaps);

  const percentage = totalGaps > 0 ? Math.round((normalizedProgressCount / totalGaps) * 100) : 0;

  const progressLabel = isGenerating
    ? `Generating ${normalizedProgressCount}/${totalGaps} gaps...`
    : `Gap suggestions ready: ${successfulGaps}/${totalGaps}`;

  const pendingCount = Math.max(totalGaps - processedGaps, 0);

  return (
    <div className="space-y-2 rounded-md border border-border/60 bg-muted/20 px-4 py-3">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 text-muted-foreground">
          {isGenerating && <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />}
          {progressLabel}
        </span>
        <span className="font-medium text-foreground">{percentage}%</span>
      </div>
      <Progress
        value={Math.min(percentage, 100)}
        className="h-2"
        aria-label={
          isGenerating
            ? `Generating gap suggestions: ${normalizedProgressCount} of ${totalGaps}`
            : `Gap suggestions ready for review: ${successfulGaps} of ${totalGaps}`
        }
      />
      {!isGenerating && generationDurationMs != null && (
        <p className="text-xs text-muted-foreground">
          Completed in {(generationDurationMs / 1000).toFixed(1)}s
        </p>
      )}
      {!isGenerating && pendingCount > 0 && (
        <p className="text-xs text-muted-foreground">
          Waiting on {pendingCount} gap{pendingCount === 1 ? '' : 's'} to finish generation.
        </p>
      )}
    </div>
  );
}

function GapContent({
  suggestion,
  taskTitles,
  isLoadingTasks,
  isGenerating,
  onToggleTask,
  onEditTask,
  onRetryWithExamples,
  onSkipExamples,
  onRetryGeneration, // T005: Manual retry for AI failures
  isAccepting,
  editingLookup,
  onToggleTaskEditing,
}: {
  suggestion: GapSuggestionState;
  taskTitles: TaskLookup;
  isLoadingTasks: boolean;
  isGenerating: boolean;
  onToggleTask: (gapId: string, taskId: string, checked: boolean) => void;
  onEditTask: (
    gapId: string,
    taskId: string,
    updates: Pick<Partial<BridgingTask>, 'edited_task_text' | 'edited_estimated_hours'>
  ) => void;
  onRetryWithExamples: (gapId: string, examples: string[]) => void;
  onSkipExamples: (gapId: string) => void;
  onRetryGeneration: (gapId: string) => void; // T005: Manual retry for AI failures
  isAccepting: boolean;
  editingLookup: Record<string, boolean>;
  onToggleTaskEditing: (gapId: string, taskId: string, next: boolean) => void;
}) {
  const gap = suggestion.gap;
  const predecessorTitle = formatTaskTitle(gap.predecessor_task_id, taskTitles);
  const successorTitle = formatTaskTitle(gap.successor_task_id, taskTitles);

  return (
    <div className="space-y-4">
      {/* Gap Header */}
      <div className="space-y-3">
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-foreground break-words">
                Gap between &quot;{predecessorTitle}&quot; → &quot;{successorTitle}&quot;
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Confidence: {Math.round(gap.confidence * 100)}% · Detected at {new Date(gap.detected_at).toLocaleString()}
              </p>
            </div>
            {isLoadingTasks && (
              <span className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                <Loader2 className="h-3 w-3 animate-spin text-primary" />
                Loading…
              </span>
            )}
          </div>
          <IndicatorBadges gap={gap} />
        </div>
        <Separator />
      </div>

      {/* Gap Status/Content */}
      {suggestion.status === 'loading' && (
        <div className="flex items-center gap-2 rounded-md border border-dashed border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span>Generating bridging tasks…</span>
        </div>
      )}

      {/* T005: Error state with retry button for AI failures */}
      {suggestion.status === 'error' && (
        <div className="space-y-3">
          <Alert variant="destructive">
            <AlertTitle>Failed to generate suggestions</AlertTitle>
            <AlertDescription>
              {suggestion.error ?? 'The AI service was unable to propose bridging tasks for this gap.'}
            </AlertDescription>
          </Alert>
          <div className="flex items-center justify-center">
            <Button
              onClick={() => onRetryGeneration(gap.id)}
              disabled={isGenerating}
              variant="outline"
              size="sm"
            >
              {isGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Try Again
            </Button>
          </div>
        </div>
      )}

      {suggestion.status === 'requires_examples' && (
        <ManualExamplesPrompt
          gapId={gap.id}
          predecessorTitle={predecessorTitle}
          successorTitle={successorTitle}
          onRetry={onRetryWithExamples}
          onSkip={onSkipExamples}
          isGenerating={isGenerating}
        />
      )}

      {suggestion.status === 'success' && suggestion.tasks.length > 0 && (
        <div className="space-y-3">
          {suggestion.tasks.map(task => {
            const taskKey = `${gap.id}:${task.id}`;
            return (
              <BridgingTaskCard
                key={task.id}
                task={task}
                checked={task.checked}
                onCheckedChange={checked => onToggleTask(gap.id, task.id, checked)}
                onEditTask={updates => onEditTask(gap.id, task.id, updates)}
                disableEdits={isAccepting}
                isEditing={Boolean(editingLookup[taskKey])}
                onToggleEdit={next => onToggleTaskEditing(gap.id, task.id, next)}
              />
            );
          })}
          {suggestion.metadata && (
            <p className="text-xs text-muted-foreground">
              Semantic search context: {suggestion.metadata.search_results_count} result
              {suggestion.metadata.search_results_count === 1 ? '' : 's'} · Generated in{' '}
              {suggestion.metadata.generation_duration_ms} ms
            </p>
          )}
        </div>
      )}

      {suggestion.status === 'success' && suggestion.tasks.length === 0 && (
        <div className="rounded-md border border-border/70 bg-muted/30 px-4 py-6 text-center">
          <p className="text-sm text-muted-foreground">No bridging tasks suggested for this gap.</p>
        </div>
      )}
    </div>
  );
}

export function GapDetectionModal({
  open,
  onOpenChange,
  detectionStatus,
  detectionError,
  detectionResult,
  suggestions,
  isGenerating,
  onToggleTask,
  onEditTask,
  onRetryWithExamples,
  onSkipExamples,
  onRetryGeneration, // T005: Manual retry for AI failures
  onAcceptSelected,
  isAccepting,
  acceptError,
  generationProgress,
  generationDurationMs,
  onRetryAnalysis,
  performanceMetrics,
}: GapDetectionModalProps) {
  const [taskTitles, setTaskTitles] = useState<TaskLookup>({});
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  const [taskFetchError, setTaskFetchError] = useState<string | null>(null);
  const [editingTasks, setEditingTasks] = useState<Record<string, boolean>>({});
  const [openGapIds, setOpenGapIds] = useState<string[]>([]);
  const makeTaskKey = useCallback((gapId: string, taskId: string) => `${gapId}:${taskId}`, []);

  const handleToggleTaskEditing = useCallback(
    (gapId: string, taskId: string, next: boolean) => {
      const key = makeTaskKey(gapId, taskId);
      setEditingTasks(prev => {
        if (next) {
          if (prev[key]) {
            return prev;
          }
          return { ...prev, [key]: true };
        }
        if (!prev[key]) {
          return prev;
        }
        const copy = { ...prev };
        delete copy[key];
        return copy;
      });
    },
    [makeTaskKey]
  );

  useEffect(() => {
    if (!open || !detectionResult || detectionResult.gaps.length === 0) {
      return;
    }

    const uniqueTaskIds = Array.from(
      new Set(
        detectionResult.gaps.flatMap(gap => [gap.predecessor_task_id, gap.successor_task_id])
      )
    );

    if (uniqueTaskIds.length === 0) {
      return;
    }

    let isCancelled = false;

    const loadTaskTitles = async () => {
      try {
        setIsLoadingTasks(true);
        setTaskFetchError(null);

        const { data, error } = await supabase
          .from('task_embeddings')
          .select('task_id, task_text')
          .in('task_id', uniqueTaskIds);

        if (error) {
          throw new Error(error.message);
        }

        if (isCancelled) {
          return;
        }

        const lookup: TaskLookup = {};
        for (const task of data ?? []) {
          if (task.task_id && task.task_text) {
            lookup[task.task_id] = task.task_text;
          }
        }

        setTaskTitles(prev => ({ ...lookup, ...prev }));
      } catch (error) {
        if (!isCancelled) {
          console.error('[GapDetectionModal] Failed to load task titles:', error);
          setTaskFetchError('Unable to load task details for gap preview.');
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingTasks(false);
        }
      }
    };

    loadTaskTitles();

    return () => {
      isCancelled = true;
    };
  }, [open, detectionResult]);

  const suggestionLookup = useMemo(() => {
    const map = new Map<string, GapSuggestionState>();
    for (const suggestion of suggestions) {
      map.set(suggestion.gap.id, suggestion);
    }
    return map;
  }, [suggestions]);

  const orderedSuggestions = useMemo(() => {
    if (!detectionResult) {
      return [];
    }

    const sortedGaps = [...detectionResult.gaps].sort((a, b) => b.confidence - a.confidence);

    return sortedGaps.map(gap => suggestionLookup.get(gap.id) ?? {
      gap,
      status: 'loading' as const,
      tasks: [],
    });
  }, [detectionResult, suggestionLookup]);

  useEffect(() => {
    if (orderedSuggestions.length === 0) {
      setEditingTasks(prev => (Object.keys(prev).length > 0 ? {} : prev));
      return;
    }

    const activeKeys = new Set<string>();
    for (const suggestion of orderedSuggestions) {
      if (suggestion.status !== 'success') {
        continue;
      }
      for (const task of suggestion.tasks) {
        activeKeys.add(makeTaskKey(suggestion.gap.id, task.id));
      }
    }

    setEditingTasks(prev => {
      let changed = false;
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        if (!activeKeys.has(key)) {
          delete next[key];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [orderedSuggestions, makeTaskKey]);

  useEffect(() => {
    if (!isAccepting) {
      return;
    }
    setEditingTasks(prev => (Object.keys(prev).length > 0 ? {} : prev));
  }, [isAccepting]);

  useEffect(() => {
    if (!open) {
      setOpenGapIds(prev => (prev.length === 0 ? prev : []));
      return;
    }

    if (orderedSuggestions.length === 0) {
      setOpenGapIds(prev => (prev.length === 0 ? prev : []));
      return;
    }

    setOpenGapIds(prev => {
      const validPrev = prev.filter(id => orderedSuggestions.some(suggestion => suggestion.gap.id === id));
      if (validPrev.length > 0) {
        if (validPrev.length === prev.length && validPrev.every((id, index) => id === prev[index])) {
          return prev;
        }
        return validPrev;
      }
      const firstGapId = orderedSuggestions[0]?.gap.id;
      return firstGapId ? [firstGapId] : [];
    });
  }, [open, orderedSuggestions]);

  const processedGaps = useMemo(() => {
    return orderedSuggestions.filter(suggestion => suggestion.status !== 'loading').length;
  }, [orderedSuggestions]);

  const successfulGaps = useMemo(() => {
    return orderedSuggestions.filter(suggestion => suggestion.status === 'success').length;
  }, [orderedSuggestions]);

  const selectedCount = useMemo(() => {
    return orderedSuggestions.reduce((count, suggestion) => {
      if (suggestion.status !== 'success') {
        return count;
      }
      return (
        count +
        suggestion.tasks.filter(task => task.checked).length
      );
    }, 0);
  }, [orderedSuggestions]);

  const suggestedTaskCount = useMemo(() => {
    return orderedSuggestions.reduce((count, suggestion) => {
      if (suggestion.status !== 'success') {
        return count;
      }
      return count + suggestion.tasks.length;
    }, 0);
  }, [orderedSuggestions]);

  const isAnyTaskEditing = useMemo(() => {
    return Object.values(editingTasks).some(Boolean);
  }, [editingTasks]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        onOpenChange(false);
        return;
      }

      if (
        event.key === 'Enter' &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey
      ) {
        const target = event.target as HTMLElement | null;
        const tagName = target?.tagName?.toLowerCase();
        const isTextInput =
          target?.isContentEditable ||
          tagName === 'input' ||
          tagName === 'textarea' ||
          tagName === 'select';
        const isButtonLike =
          tagName === 'button' ||
          tagName === 'a' ||
          Boolean(target?.closest('[role="button"]'));

        if (isTextInput || isButtonLike || isAnyTaskEditing) {
          return;
        }

        if (selectedCount === 0 || isAccepting) {
          return;
        }

        event.preventDefault();
        onAcceptSelected();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onOpenChange, isAnyTaskEditing, selectedCount, isAccepting, onAcceptSelected]);

  const hasGaps = Boolean(detectionResult?.gaps.length);
  const isEmptyState = detectionStatus === 'success' && !hasGaps;

  const gapCount = detectionResult?.gaps.length ?? 0;
  const modalTitle =
    detectionStatus === 'success'
      ? hasGaps
        ? `${gapCount} gap${gapCount === 1 ? '' : 's'} detected · ${suggestedTaskCount} task${suggestedTaskCount === 1 ? '' : 's'} suggested`
        : 'No gaps detected'
      : 'Gap Analysis';

  const modalDescription = (() => {
    if (detectionStatus === 'error') {
      return detectionError ?? 'An error occurred while analyzing your plan. Please try again.';
    }
    if (detectionStatus === 'success') {
      if (!hasGaps) {
        return 'Your plan appears complete. All tasks have a clear, logical progression.';
      }
      if (isGenerating) {
        return 'Generating bridging tasks for each detected gap…';
      }
      return 'Review AI-generated bridging tasks grouped by gap.';
    }
    if (detectionStatus === 'detecting') {
      return 'Analyzing your plan for gaps and missing work.';
    }
    return 'Run a gap analysis to identify missing tasks in your plan.';
  })();

  const metricsDisplay = useMemo(() => {
    if (!performanceMetrics || detectionStatus !== 'success') {
      return null;
    }
    const toSeconds = (ms: number) => (ms / 1000).toFixed(1);
    const detectionSeconds = toSeconds(Math.max(0, performanceMetrics.detection_ms ?? 0));
    const generationSeconds = toSeconds(Math.max(0, performanceMetrics.generation_ms ?? 0));
    const totalSeconds = toSeconds(Math.max(0, performanceMetrics.total_ms ?? 0));
    return `Analysis completed in ${totalSeconds}s (Detection: ${detectionSeconds}s, Generation: ${generationSeconds}s)`;
  }, [performanceMetrics, detectionStatus]);

  const isDuplicateAcceptanceError = acceptError?.code === 'DUPLICATE_TASK';
  const isCycleError = acceptError?.code === 'CYCLE_DETECTED';
  const alertTitle = isCycleError
    ? 'Circular dependency detected'
    : acceptError?.code
      ? acceptError.message
      : 'Unable to accept tasks';
  const shouldShowPrimaryMessage =
    !acceptError?.code || (acceptError?.details?.length ?? 0) === 0 || isCycleError;

  const content = (
    <>
      {/* Header Content */}
      <div className="space-y-3">
        {detectionStatus === 'detecting' && (
          <div className="flex items-center gap-3 rounded-md border border-dashed border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span>Analyzing task sequence…</span>
          </div>
        )}

        {detectionStatus === 'error' && (
          <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-destructive/40 bg-destructive/10 px-8 py-10 text-center dark:border-red-500/30 dark:bg-red-500/10">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/20 text-destructive dark:bg-red-500/20 dark:text-red-200">
              <AlertTriangle className="h-8 w-8" aria-hidden="true" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-destructive dark:text-red-200">
                Unable to generate suggestions
              </h3>
              <p className="text-sm text-destructive/80 dark:text-red-100/70">
                {detectionError ?? 'An error occurred while analyzing your plan. Please try again.'}
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-center">
              {typeof onRetryAnalysis === 'function' && (
                <Button onClick={() => onRetryAnalysis()} className="sm:min-w-[140px]">
                  Try Again
                </Button>
              )}
              <Button
                variant="secondary"
                onClick={() => onOpenChange(false)}
                className="sm:min-w-[140px]"
              >
                Close
              </Button>
            </div>
          </div>
        )}

        {detectionStatus === 'success' && detectionResult && (
          <div className="space-y-4">
            {taskFetchError && (
              <Alert variant="destructive">
                <AlertTitle>Task context unavailable</AlertTitle>
                <AlertDescription>{taskFetchError}</AlertDescription>
              </Alert>
            )}

            {/* Progress Indicator */}
            {hasGaps && (
              <GapProgressIndicator
                totalGaps={detectionResult.gaps.length}
                processedGaps={processedGaps}
                successfulGaps={successfulGaps}
                isGenerating={isGenerating}
                generationProgress={generationProgress}
                generationDurationMs={generationDurationMs}
              />
            )}

            {!hasGaps ? (
              <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-emerald-300/50 bg-emerald-100/30 px-8 py-10 text-center dark:border-emerald-300/20 dark:bg-emerald-500/10">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-700 dark:bg-emerald-400/20 dark:text-emerald-200">
                  <CheckCircle className="h-8 w-8" aria-hidden="true" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-emerald-800 dark:text-emerald-200">
                    No gaps detected
                  </h3>
                  <p className="text-sm text-emerald-900/80 dark:text-emerald-100/70">
                    Your plan appears complete. All tasks have a clear, logical progression.
                  </p>
                </div>
                <Button onClick={() => onOpenChange(false)} size="sm">
                  Close
                </Button>
              </div>
            ) : (
              <Accordion
                type="multiple"
                value={openGapIds}
                onValueChange={value => setOpenGapIds(value)}
                className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60 bg-layer-2"
              >
                {orderedSuggestions.map((suggestion, index) => {
                  const { gap } = suggestion;
                  const predecessorTitle = formatTaskTitle(gap.predecessor_task_id, taskTitles);
                  const successorTitle = formatTaskTitle(gap.successor_task_id, taskTitles);
                  const confidencePercent = Math.round(gap.confidence * 100);

                  const statusSummary = (() => {
                    if (suggestion.status === 'loading') {
                      return 'Generating suggestions…';
                    }
                    if (suggestion.status === 'error') {
                      return 'Generation failed';
                    }
                    if (suggestion.status === 'requires_examples') {
                      return 'Provide manual examples to continue';
                    }
                    const taskCount = suggestion.tasks.length;
                    const taskLabel = taskCount === 1 ? 'task' : 'tasks';
                    return `${taskCount} ${taskLabel} suggested`;
                  })();

                  const indicatorCount = Object.values(gap.indicators).filter(Boolean).length;

                  return (
                    <AccordionItem key={gap.id} value={gap.id}>
                      <AccordionTrigger className="px-4">
                        <div className="flex w-full flex-col gap-1 text-left">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-foreground">
                              Gap {index + 1}: "{predecessorTitle}" → "{successorTitle}"
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span>{confidencePercent}% confidence</span>
                            <span aria-hidden="true">•</span>
                            <span>{indicatorCount}/4 indicators triggered</span>
                            <span aria-hidden="true">•</span>
                            <span>{statusSummary}</span>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-4 pt-0">
                        <GapContent
                          suggestion={suggestion}
                          taskTitles={taskTitles}
                          isLoadingTasks={isLoadingTasks}
                          isGenerating={isGenerating}
                          onToggleTask={onToggleTask}
                          onEditTask={onEditTask}
                          onRetryWithExamples={onRetryWithExamples}
                          onSkipExamples={onSkipExamples}
                          onRetryGeneration={onRetryGeneration}
                          isAccepting={isAccepting}
                          editingLookup={editingTasks}
                          onToggleTaskEditing={handleToggleTaskEditing}
                        />
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            )}
          </div>
        )}
      </div>
    </>
  );

  const footer = (
    <div className="space-y-3">
      {metricsDisplay && (
        <div className="text-xs text-muted-foreground" aria-live="polite">
          {metricsDisplay}
        </div>
      )}
      {hasGaps && acceptError && (
        <Alert variant="destructive">
          <AlertTitle>{alertTitle}</AlertTitle>
          <AlertDescription>
            <div className="space-y-2">
              {shouldShowPrimaryMessage && (
                <p>
                  {isCycleError
                    ? 'Accepting the selected tasks would create a circular dependency in your plan. Adjust your selection or update existing relationships before trying again.'
                    : acceptError.message}
                </p>
              )}
              {acceptError.details && acceptError.details.length > 0 && (
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {acceptError.details.map((detail, index) => (
                    <li key={index}>{detail}</li>
                  ))}
                </ul>
              )}
              {isDuplicateAcceptanceError && (
                <p className="text-sm text-muted-foreground">
                  Edit the task description or estimate to differentiate it from the existing task, then try again.
                </p>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}
      {hasGaps ? (
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground" aria-live="polite" aria-atomic="true">
            {`${selectedCount} task${selectedCount === 1 ? '' : 's'} selected`}
          </div>
          <div className="flex items-center justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => onOpenChange(false)}
              disabled={isAccepting}
            >
              Cancel
            </Button>
            <div className="flex flex-col items-end gap-1">
              <Button
                onClick={onAcceptSelected}
                disabled={isAccepting || selectedCount === 0}
              >
                {isAccepting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isAccepting ? `Accepting ${selectedCount}…` : `Accept Selected (${selectedCount})`}
              </Button>
              {selectedCount > 0 && !isAccepting && (
                <span className="text-xs text-muted-foreground">Press Enter to accept</span>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl flex flex-col gap-4 p-3 sm:p-6">
        <DialogHeader className="px-0 pt-0">
          <DialogTitle>{modalTitle}</DialogTitle>
          <DialogDescription>{modalDescription}</DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto">
          {content}
        </div>
        <DialogFooter className="px-0 pb-0 pt-0">
          {footer}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
