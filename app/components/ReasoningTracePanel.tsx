'use client';

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { CheckCircle2, CircleDashed, CircleSlash, Loader2 } from 'lucide-react';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { ExecutionMetadata, ReasoningStep, ReasoningTraceRecord } from '@/lib/types/agent';
import { FilterControls } from './reasoning-trace/FilterControls';
import { ErrorSummaryBanner } from './reasoning-trace/ErrorSummaryBanner';
import { ExportButton } from './reasoning-trace/ExportButton';

type ContextReflection = {
  id: string;
  text: string;
  recency_weight: number;
  created_at: string;
};

type ReasoningContextSummary = {
  baseline?: ContextReflection[];
  adjustment?: ContextReflection[];
  baselineCreatedAt?: string | null;
};

type ReasoningTracePanelProps = {
  sessionId: string;
  open: boolean;
  onTraceUnavailable?: () => void;
  executionMetadata?: ExecutionMetadata | null;
  contextSummary?: ReasoningContextSummary | null;
};

type ReasoningTrace = ReasoningTraceRecord & {
  created_at?: string;
};

type TraceResponse = {
  trace: ReasoningTrace;
};

type TraceStatusFilters = {
  success: boolean;
  failed: boolean;
  skipped: boolean;
};

type TraceFilters = {
  toolType: string;
  statusFilters: TraceStatusFilters;
  showOnlyFailed: boolean;
};

const createDefaultStatusFilters = (): TraceStatusFilters => ({
  success: true,
  failed: true,
  skipped: true,
});

function formatDurationMs(value: number): string {
  if (!Number.isFinite(value)) {
    return '0ms';
  }

  if (value < 1000) {
    return `${Math.round(value)}ms`;
  }

  const seconds = Math.round((value / 1000) * 10) / 10;
  return `${seconds}s`;
}

function formatRelativeTimestamp(timestamp?: string): string {
  if (!timestamp) {
    return '';
  }

  const createdAt = new Date(timestamp);
  if (Number.isNaN(createdAt.getTime())) {
    return '';
  }

  return createdAt.toLocaleString();
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function getStatusBadge(step: ReasoningStep) {
  switch (step.status) {
    case 'success':
      return {
        label: 'Success',
        icon: CheckCircle2,
        className: 'bg-emerald-500/10 text-emerald-700 ring-1 ring-inset ring-emerald-500/30',
      };
    case 'failed':
      return {
        label: 'Failed',
        icon: CircleSlash,
        className: 'bg-rose-500/10 text-rose-700 ring-1 ring-inset ring-rose-500/30',
      };
    case 'skipped':
    default:
      return {
        label: 'Skipped',
        icon: CircleDashed,
        className: 'bg-amber-500/10 text-amber-700 ring-1 ring-inset ring-amber-500/30',
      };
  }
}

export function ReasoningTracePanel({ sessionId, open, onTraceUnavailable, executionMetadata, contextSummary }: ReasoningTracePanelProps) {
  const [trace, setTrace] = useState<ReasoningTrace | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);
  const [filters, setFilters] = useState<TraceFilters>(() => ({
    toolType: 'all',
    statusFilters: createDefaultStatusFilters(),
    showOnlyFailed: false,
  }));
  const previousStatusFiltersRef = useRef<TraceStatusFilters>(createDefaultStatusFilters());
  const [highlightedStep, setHighlightedStep] = useState<number | null>(null);
  const highlightTimeoutRef = useRef<number | null>(null);

  const handleToolTypeChange = useCallback((toolType: string) => {
    setFilters(prev => ({
      ...prev,
      toolType,
    }));
  }, []);

  const handleStatusFilterChange = useCallback((status: keyof TraceStatusFilters, checked: boolean) => {
    setFilters(prev => {
      if (prev.showOnlyFailed) {
        return prev;
      }

      const nextStatusFilters: TraceStatusFilters = {
        ...prev.statusFilters,
        [status]: checked,
      };

      if (!Object.values(nextStatusFilters).some(Boolean)) {
        return prev;
      }

      previousStatusFiltersRef.current = nextStatusFilters;

      return {
        ...prev,
        statusFilters: nextStatusFilters,
      };
    });
  }, []);

  const handleShowOnlyFailedChange = useCallback((checked: boolean) => {
    setFilters(prev => {
      if (checked) {
        if (!prev.showOnlyFailed) {
          previousStatusFiltersRef.current = prev.statusFilters;
        }

        return {
          ...prev,
          showOnlyFailed: true,
          statusFilters: {
            success: false,
            failed: true,
            skipped: false,
          },
        };
      }

      const restored = previousStatusFiltersRef.current ?? createDefaultStatusFilters();
      const restoredCopy: TraceStatusFilters = { ...restored };
      if (!Object.values(restoredCopy).some(Boolean)) {
        restoredCopy.failed = true;
      }
      previousStatusFiltersRef.current = restoredCopy;

      return {
        ...prev,
        showOnlyFailed: false,
        statusFilters: restoredCopy,
      };
    });
  }, []);

  useEffect(() => {
    setTrace(null);
    setError(null);
    setHasFetched(false);
    setIsLoading(false);
  }, [sessionId]);

  useEffect(() => {
    let isActive = true;

    const fetchTrace = async () => {
      if (!open || hasFetched) {
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch(`/api/agent/sessions/${sessionId}/trace`);

        if (response.status === 404) {
          if (isActive) {
            setError('Reasoning trace expired (older than 7 days).');
            setHasFetched(true);
            onTraceUnavailable?.();
          }
          return;
        }

        if (!response.ok) {
          throw new Error('Failed to load reasoning trace');
        }

        const data: TraceResponse = await response.json();
        if (isActive) {
          setTrace(data.trace);
          setHasFetched(true);
        }
      } catch (err) {
        console.error('[ReasoningTracePanel] Failed to fetch trace', err);
        if (isActive) {
          setError('Unable to load reasoning steps. Please try again.');
          setHasFetched(true);
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    fetchTrace();

    return () => {
      isActive = false;
    };
  }, [open, sessionId, hasFetched, onTraceUnavailable]);

  const toolsUsed = useMemo(() => {
    if (!trace) {
      return [];
    }

    return Object.entries(trace.tools_used_count ?? {}).sort((a, b) => b[1] - a[1]);
  }, [trace]);

  const availableTools = useMemo(() => toolsUsed.map(([tool]) => tool), [toolsUsed]);

  const filteredSteps = useMemo(() => {
    if (!trace) return [];
    return trace.steps.filter(step => {
      const { toolType, statusFilters, showOnlyFailed } = filters;

      if (showOnlyFailed) {
        return step.status === 'failed';
      }

      const statusMatch = statusFilters[step.status];
      const toolMatch = toolType === 'all' || step.tool_name === toolType;

      return statusMatch && toolMatch;
    });
  }, [trace, filters]);

  const failedSteps = useMemo(() => {
    if (!trace) return [];
    return trace.steps.filter(step => step.status === 'failed');
  }, [trace]);

  useEffect(() => {
    if (highlightedStep === null) {
      return;
    }

    const existsInView = filteredSteps.some(step => step.step_number === highlightedStep);
    if (!existsInView) {
      setHighlightedStep(null);
    }
  }, [filteredSteps, highlightedStep]);

  const handleJumpToFirstFailure = useCallback(() => {
    const firstFailedStep = failedSteps[0];
    if (!firstFailedStep) {
      return;
    }

    const element = document.getElementById(`step-${firstFailedStep.step_number}`);

    if (element instanceof HTMLElement) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      window.requestAnimationFrame(() => {
        element.focus({ preventScroll: true });
      });
    }

    if (highlightTimeoutRef.current !== null) {
      window.clearTimeout(highlightTimeoutRef.current);
    }

    setHighlightedStep(firstFailedStep.step_number);
    highlightTimeoutRef.current = window.setTimeout(() => {
      setHighlightedStep(null);
    }, 1600);
  }, [failedSteps]);

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current !== null) {
        window.clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

  const { baselineContext, adjustmentContext, totalContextCount } = useMemo(() => {
    const baseline = contextSummary?.baseline ?? [];
    const adjustment = contextSummary?.adjustment ?? [];

    if (baseline.length === 0 && adjustment.length === 0) {
      return { baselineContext: baseline, adjustmentContext: adjustment, totalContextCount: 0 } as const;
    }

    const ids = new Set<string>();
    for (const reflection of baseline) {
      ids.add(reflection.id);
    }
    for (const reflection of adjustment) {
      ids.add(reflection.id);
    }

    return { baselineContext: baseline, adjustmentContext: adjustment, totalContextCount: ids.size } as const;
  }, [contextSummary]);

  const hasContextSummary = totalContextCount > 0;

  const renderReflectionRow = useCallback((reflection: ContextReflection) => {
    const weight = Number.isFinite(reflection.recency_weight)
      ? Math.max(0, Math.min(1, reflection.recency_weight))
      : null;
    const formattedWeight = typeof weight === 'number' ? formatRecencyWeight(weight) : null;

    return (
      <div
        key={reflection.id}
        className="rounded-md border border-border/60 bg-muted/20 p-3 text-sm text-foreground"
      >
        <p className="font-medium leading-snug">
          {reflection.text}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {formattedWeight && (
            <Badge variant="outline" className="font-medium">
              Recency {formattedWeight}
            </Badge>
          )}
          <span>Captured {formatRelativeAge(reflection.created_at)}</span>
        </div>
      </div>
    );
  }, []);

  if (!open) {
    return null;
  }

  return (
    <Card className="border-border/70 shadow-2layer-md">
      <CardHeader className="flex-row items-start justify-between">
        <div>
          <CardTitle>Reasoning Trace</CardTitle>
          <CardDescription>
            Step-by-step breakdown of the agent&apos;s decisions, including tool usage and runtime.
          </CardDescription>
        </div>
        {trace && (
          <ExportButton
            sessionId={sessionId}
            traceData={trace}
            executionMetadata={executionMetadata ?? null}
            disabled={trace.steps.length === 0}
          />
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading && (
          <div className="flex items-center gap-3 rounded-lg border border-dashed border-border/70 bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span>Loading reasoning trace…</span>
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertTitle>Unable to load reasoning</AlertTitle>
            <AlertDescription className="flex flex-col gap-3">
              <span>{error}</span>
              <div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setError(null);
                    setHasFetched(false);
                  }}
                >
                  Retry
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {trace && !error && (
          <div className="space-y-6">
            <ErrorSummaryBanner failedSteps={failedSteps} onJumpToFirstFailure={handleJumpToFirstFailure} />

            {hasContextSummary && (
              <Accordion type="single" collapsible className="rounded-md border border-border/60 bg-muted/30">
                <AccordionItem value="context">
                  <AccordionTrigger className="px-4 text-sm font-medium">
                    <div className="flex w-full items-center justify-between text-left">
                      <span>Context Used</span>
                      <Badge variant="secondary" className="font-normal">
                        {totalContextCount} reflection{totalContextCount === 1 ? '' : 's'}
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-4 pt-2">
                    <div className="space-y-4">
                      {baselineContext.length > 0 && (
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                            <span className="font-semibold uppercase tracking-wide text-foreground/80">
                              Baseline analysis
                            </span>
                            {contextSummary?.baselineCreatedAt && (
                              <span>
                                Captured {formatRelativeAge(contextSummary.baselineCreatedAt)}
                              </span>
                            )}
                          </div>
                          <div className="space-y-2">
                            {baselineContext.map(renderReflectionRow)}
                          </div>
                        </div>
                      )}

                      {baselineContext.length > 0 && adjustmentContext.length > 0 && (
                        <Separator />
                      )}

                      {adjustmentContext.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-xs font-semibold uppercase tracking-wide text-foreground/80">
                            Latest adjustment
                          </div>
                          <div className="space-y-2">
                            {adjustmentContext.map(renderReflectionRow)}
                          </div>
                        </div>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}

            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <Badge variant="secondary" className="uppercase tracking-wide">
                {filteredSteps.length} of {trace.total_steps} steps shown
              </Badge>
              <span>{formatDurationMs(trace.total_duration_ms)} total runtime</span>
              {trace.created_at && (
                <span>
                  Recorded {formatRelativeTimestamp(trace.created_at)}
                </span>
              )}
            </div>

            <FilterControls
              filterState={filters}
              availableTools={availableTools}
              onToolChange={handleToolTypeChange}
              onStatusChange={handleStatusFilterChange}
              onShowOnlyFailedChange={handleShowOnlyFailedChange}
            />

            {toolsUsed.length > 0 && (
              <div className="space-y-2">
                <span className="text-sm font-medium text-foreground">Tools used</span>
                <div className="flex flex-wrap gap-2">
                  {toolsUsed.map(([tool, count]) => (
                    <Badge key={tool} variant="outline" className="gap-1">
                      <span className="font-medium">{tool}</span>
                      <span className="rounded bg-muted px-1 text-[11px]">×{count}</span>
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <Separator />

            {trace.steps.length === 0 && (
              <div className="rounded-lg border border-dashed border-border/70 bg-muted/40 px-4 py-6 text-sm text-muted-foreground">
                No reasoning steps were recorded for this agent run.
              </div>
            )}

            {trace.steps.length > 0 && filteredSteps.length === 0 && (
              <div className="rounded-lg border border-dashed border-border/70 bg-muted/40 px-4 py-6 text-sm text-muted-foreground">
                No steps match the current filters.
              </div>
            )}

            {filteredSteps.length > 0 && (
              <ScrollArea className="max-h-[520px] pr-3">
                <Accordion type="single" collapsible className="divide-y rounded-lg border border-border/70">
                  {filteredSteps.map(step => {
                    const badge = getStatusBadge(step);
                    const StatusIcon = badge.icon;
                    const thoughtText =
                      step.thought && step.thought.trim().length > 0
                        ? step.thought.trim()
                        : null;
                    const displayThought = thoughtText ?? 'No thought recorded for this step.';
                    const isFailed = step.status === 'failed';
                    const isHighlighted = highlightedStep === step.step_number;

                    return (
                      <AccordionItem 
                        key={`trace-step-${step.step_number}`} 
                        value={`step-${step.step_number}`}
                        className={cn(
                          isFailed && 'border-destructive/30 bg-destructive/10',
                          isHighlighted && 'ring-2 ring-offset-2 ring-destructive/70 ring-offset-background'
                        )}
                      >
                        <AccordionTrigger id={`step-${step.step_number}`} className={cn("px-4", isFailed && "hover:bg-destructive/20 focus-visible:ring-destructive/60")}>
                          <div className="flex flex-1 flex-col gap-2 text-sm">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="flex flex-wrap items-center gap-2 text-foreground">
                                <span className="font-semibold">Step {step.step_number}</span>
                                <Badge variant="outline">
                                  {formatDurationMs(step.duration_ms)}
                                </Badge>
                              </div>
                              <Badge className={cn('gap-1', badge.className, isFailed && 'text-destructive-foreground bg-destructive')} variant="secondary">
                                <StatusIcon className="h-3.5 w-3.5" />
                                {badge.label}
                              </Badge>
                            </div>

                            <p className={cn("text-sm", isFailed ? "text-destructive-foreground/80" : "text-muted-foreground")}>{displayThought}</p>

                            {step.tool_name && (
                              <span className={cn("text-xs uppercase tracking-wide", isFailed ? "text-destructive-foreground/70" : "text-muted-foreground")}>
                                Tool: {step.tool_name}
                              </span>
                            )}

                            {isFailed && (
                              <p className="text-xs font-medium text-destructive">
                                This step failed. Expand for tool input and output details.
                              </p>
                            )}
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-4">
                          <div className="space-y-4 text-sm text-muted-foreground">
                            <div className="rounded border border-border/60 bg-background/80 px-3 py-2">
                              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
                                Thought
                              </span>
                              <p className="mt-2 text-sm text-foreground">
                                {thoughtText ?? 'No thought was captured for this reasoning step.'}
                              </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground/80">
                              <span>Duration: {formatDurationMs(step.duration_ms)}</span>
                              <span>Recorded at: {new Date(step.timestamp).toLocaleString()}</span>
                            </div>

                            {isFailed && (step.tool_output === undefined || step.tool_output === null) && (
                              <p className="rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                                No output captured because the tool failed.
                              </p>
                            )}

                            {step.tool_input !== undefined && step.tool_input !== null && (
                              <details className="rounded border border-border/60 bg-background/80 px-3 py-2">
                                <summary className="cursor-pointer select-none text-sm font-medium text-foreground">
                                  Tool input
                                </summary>
                                <pre className="mt-2 overflow-x-auto rounded bg-muted/60 p-2 text-xs leading-relaxed text-foreground">
                                  {formatJson(step.tool_input)}
                                </pre>
                              </details>
                            )}

                            {step.tool_output !== undefined && step.tool_output !== null && (
                              <details className="rounded border border-border/60 bg-background/80 px-3 py-2">
                                <summary className="cursor-pointer select-none text-sm font-medium text-foreground">
                                  Tool output
                                </summary>
                                <pre className="mt-2 overflow-x-auto rounded bg-muted/60 p-2 text-xs leading-relaxed text-foreground">
                                  {formatJson(step.tool_output)}
                                </pre>
                              </details>
                            )}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              </ScrollArea>
            )}
          </div>
        )}

        {!isLoading && !trace && !error && (
          <div className="space-y-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-32 rounded-lg" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatRelativeAge(timestamp?: string): string {
  if (!timestamp) {
    return '';
  }

  const value = new Date(timestamp);
  if (Number.isNaN(value.getTime())) {
    return '';
  }

  const diffMs = Date.now() - value.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) {
    return 'just now';
  }

  if (diffHours < 1) {
    return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  }

  if (diffDays < 1) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  }

  if (diffDays < 7) {
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  }

  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 5) {
    return `${diffWeeks} week${diffWeeks === 1 ? '' : 's'} ago`;
  }

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) {
    return `${diffMonths} month${diffMonths === 1 ? '' : 's'} ago`;
  }

  const diffYears = Math.floor(diffDays / 365);
  return `${diffYears} year${diffYears === 1 ? '' : 's'} ago`;
}

function formatRecencyWeight(value: number): string {
  const clamped = Math.max(0, Math.min(1, value));

  if (Number.isInteger(clamped)) {
    return clamped.toFixed(1);
  }

  if (Math.abs(clamped * 10 - Math.round(clamped * 10)) < 1e-6) {
    return clamped.toFixed(1);
  }

  return clamped.toFixed(2);
}
