'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
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
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/lib/supabase';
import type { Gap } from '@/lib/schemas/gapSchema';
import type { BridgingTask } from '@/lib/schemas/bridgingTaskSchema';

import { BridgingTaskCard } from '@/app/priorities/components/BridgingTaskCard';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';

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
          {suggestion.tasks.map(task => (
            <BridgingTaskCard
              key={task.id}
              task={task}
              checked={task.checked}
              onCheckedChange={checked => onToggleTask(gap.id, task.id, checked)}
              onEditTask={(updates) => onEditTask(gap.id, task.id, updates)}
              disableEdits={isAccepting}
            />
          ))}
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

function GapNavigator({
  currentIndex,
  totalGaps,
  onPrevious,
  onNext,
  gaps,
  taskTitles,
  onChange,
  isMobile = false,
}: {
  currentIndex: number;
  totalGaps: number;
  onPrevious: () => void;
  onNext: () => void;
  gaps: Gap[];
  taskTitles: TaskLookup;
  onChange: (index: number) => void;
  isMobile?: boolean;
}) {
  if (isMobile) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-layer-2 px-4 py-3 shadow-sm">
        <Button
          variant="outline"
          size="sm"
          onClick={onPrevious}
          disabled={currentIndex === 0}
          className="h-9 shrink-0"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="sr-only">Previous gap</span>
        </Button>
        <div className="flex flex-col items-center gap-1 min-w-0 flex-1">
          <span className="text-xs font-medium text-muted-foreground">
            Gap {currentIndex + 1} of {totalGaps}
          </span>
          <span className="text-xs text-foreground truncate max-w-full">
            {formatTaskTitle(gaps[currentIndex]?.predecessor_task_id, taskTitles)} → {formatTaskTitle(gaps[currentIndex]?.successor_task_id, taskTitles)}
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onNext}
          disabled={currentIndex === totalGaps - 1}
          className="h-9 shrink-0"
        >
          <ChevronRight className="h-4 w-4" />
          <span className="sr-only">Next gap</span>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <Label htmlFor="gap-selector" className="text-sm font-medium shrink-0">
        Viewing:
      </Label>
      <Select
        value={currentIndex.toString()}
        onValueChange={(value) => onChange(parseInt(value, 10))}
      >
        <SelectTrigger id="gap-selector" className="w-full max-w-md">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {gaps.map((gap, index) => (
            <SelectItem key={gap.id} value={index.toString()}>
              Gap {index + 1}: {formatTaskTitle(gap.predecessor_task_id, taskTitles)} → {formatTaskTitle(gap.successor_task_id, taskTitles)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="outline"
          size="icon"
          onClick={onPrevious}
          disabled={currentIndex === 0}
          className="h-9 w-9"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="sr-only">Previous gap</span>
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={onNext}
          disabled={currentIndex === totalGaps - 1}
          className="h-9 w-9"
        >
          <ChevronRight className="h-4 w-4" />
          <span className="sr-only">Next gap</span>
        </Button>
      </div>
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
}: GapDetectionModalProps) {
  const [taskTitles, setTaskTitles] = useState<TaskLookup>({});
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  const [taskFetchError, setTaskFetchError] = useState<string | null>(null);
  const [activeGapIndex, setActiveGapIndex] = useState(0);
  const isDesktop = useMediaQuery('(min-width: 768px)');

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
    return detectionResult.gaps.map(gap => suggestionLookup.get(gap.id) ?? {
      gap,
      status: 'loading' as const,
      tasks: [],
    });
  }, [detectionResult, suggestionLookup]);

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

  const isDuplicateAcceptanceError = acceptError?.code === 'DUPLICATE_TASK';
  const alertTitle = acceptError?.code ? acceptError.message : 'Unable to accept tasks';
  const shouldShowPrimaryMessage =
    !acceptError?.code || (acceptError?.details?.length ?? 0) === 0;

  const handlePreviousGap = () => {
    setActiveGapIndex(prev => Math.max(0, prev - 1));
  };

  const handleNextGap = () => {
    setActiveGapIndex(prev => Math.min(orderedSuggestions.length - 1, prev + 1));
  };

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

        {detectionStatus === 'error' && detectionError && (
          <Alert variant="destructive">
            <AlertTitle>Gap detection failed</AlertTitle>
            <AlertDescription>{detectionError}</AlertDescription>
          </Alert>
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
            {detectionResult.gaps.length > 0 && (
              <GapProgressIndicator
                totalGaps={detectionResult.gaps.length}
                processedGaps={processedGaps}
                successfulGaps={successfulGaps}
                isGenerating={isGenerating}
                generationProgress={generationProgress}
                generationDurationMs={generationDurationMs}
              />
            )}

            {detectionResult.gaps.length === 0 ? (
              <div className="rounded-lg border border-border/70 bg-muted/30 px-6 py-8 text-center">
                <p className="text-sm font-medium text-muted-foreground">
                  Your plan is complete — no gaps detected between consecutive tasks.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Gap Navigator */}
                <GapNavigator
                  currentIndex={activeGapIndex}
                  totalGaps={orderedSuggestions.length}
                  onPrevious={handlePreviousGap}
                  onNext={handleNextGap}
                  gaps={detectionResult.gaps}
                  taskTitles={taskTitles}
                  onChange={setActiveGapIndex}
                  isMobile={!isDesktop}
                />

                {/* Gap Content */}
                <div className="min-h-[300px]">
                  {orderedSuggestions[activeGapIndex] && (
                    <GapContent
                      suggestion={orderedSuggestions[activeGapIndex]}
                      taskTitles={taskTitles}
                      isLoadingTasks={isLoadingTasks}
                      isGenerating={isGenerating}
                      onToggleTask={onToggleTask}
                      onEditTask={onEditTask}
                      onRetryWithExamples={onRetryWithExamples}
                      onSkipExamples={onSkipExamples}
                      onRetryGeneration={onRetryGeneration}
                      isAccepting={isAccepting}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );

  const footer = (
    <div className="space-y-3">
      {acceptError && (
        <Alert variant="destructive">
          <AlertTitle>{alertTitle}</AlertTitle>
          <AlertDescription>
            <div className="space-y-2">
              {shouldShowPrimaryMessage && <p>{acceptError.message}</p>}
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
      <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-muted-foreground" aria-live="polite" aria-atomic="true">
          {detectionResult?.gaps.length
            ? `${selectedCount} task${selectedCount === 1 ? '' : 's'} selected`
            : null}
        </div>
        <div className="flex items-center justify-end gap-3">
          <Button
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={isAccepting}
          >
            Cancel
          </Button>
          <Button
            onClick={onAcceptSelected}
            disabled={isAccepting || selectedCount === 0}
          >
            {isAccepting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isAccepting ? 'Accepting…' : 'Accept Selected'}
          </Button>
        </div>
      </div>
    </div>
  );

  if (!isDesktop) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader>
            <DrawerTitle>Gap Analysis</DrawerTitle>
            <DrawerDescription>
              Review AI-generated tasks to bridge gaps in your plan.
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-4 overflow-y-auto">
            <ScrollArea className="h-full max-h-[calc(85vh-200px)]">
              {content}
            </ScrollArea>
          </div>
          <DrawerFooter className="border-t border-border/60">
            {footer}
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 shrink-0 border-b border-border/60">
          <DialogTitle>Gap Analysis</DialogTitle>
          <DialogDescription>
            Detect missing tasks between consecutive steps and review AI-generated bridging suggestions.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
          {content}
        </div>
        <DialogFooter className="px-6 pb-6 pt-4 shrink-0 border-t border-border/60">
          {footer}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
