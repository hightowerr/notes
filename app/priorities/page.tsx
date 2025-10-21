'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Loader2, ExternalLink, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { MainNav } from '@/components/main-nav';
import { TaskList } from '@/app/priorities/components/TaskList';
import { prioritizedPlanSchema } from '@/lib/schemas/prioritizedPlanSchema';
import { executionMetadataSchema } from '@/lib/schemas/executionMetadataSchema';
import type { ExecutionMetadata, PrioritizedTaskPlan } from '@/lib/types/agent';

const DEFAULT_USER_ID = 'default-user';
const POLL_INTERVAL_MS = 2000;

type OutcomeResponse = {
  id: string;
  assembled_text: string;
  state_preference: string | null;
  daily_capacity_hours: number | null;
};

type SessionStatus = 'idle' | 'running' | 'completed' | 'failed';

type PrioritizeResponse = {
  session_id: string;
  status: SessionStatus | 'running' | 'completed' | 'failed';
};

export default function TaskPrioritiesPage() {
  const [outcomeLoading, setOutcomeLoading] = useState(true);
  const [activeOutcome, setActiveOutcome] = useState<OutcomeResponse | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [sessionStatus, setSessionStatus] = useState<SessionStatus>('idle');
  const [triggerError, setTriggerError] = useState<string | null>(null);
  const [isTriggering, setIsTriggering] = useState(false);

  const [prioritizedPlan, setPrioritizedPlan] = useState<PrioritizedTaskPlan | null>(null);
  const [executionMetadata, setExecutionMetadata] = useState<ExecutionMetadata | null>(null);
  const [resultsError, setResultsError] = useState<string | null>(null);
  const [isLoadingResults, setIsLoadingResults] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [hasTriggered, setHasTriggered] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [planVersion, setPlanVersion] = useState(0);
  const [planStatusMessage, setPlanStatusMessage] = useState<string | null>(null);
  const [hasFetchedInitialPlan, setHasFetchedInitialPlan] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch active outcome on mount
  useEffect(() => {
    const fetchOutcome = async () => {
      try {
        setOutcomeLoading(true);
        setFetchError(null);

        const response = await fetch('/api/outcomes');

        if (response.status === 404) {
          setActiveOutcome(null);
          return;
        }

        if (!response.ok) {
          throw new Error('Failed to fetch active outcome');
        }

        const data = await response.json();
        setActiveOutcome(data.outcome);
      } catch (error) {
        console.error('[Task Priorities] Failed to load outcome:', error);
        setFetchError('Unable to load active outcome. Please try again.');
      } finally {
        setOutcomeLoading(false);
      }
    };

    fetchOutcome();

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, []);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const applySessionResults = useCallback((session: unknown) => {
    if (!session || typeof session !== 'object' || session === null) {
      return;
    }

    let statusNote: string | null | undefined;

    const metadataResult = executionMetadataSchema.safeParse(
      (session as { execution_metadata?: unknown }).execution_metadata
    );
    if (metadataResult.success) {
      setExecutionMetadata(metadataResult.data);
      statusNote = metadataResult.data.status_note ?? null;
    }

    const planResult = prioritizedPlanSchema.safeParse(
      (session as { prioritized_plan?: unknown }).prioritized_plan
    );
    if (planResult.success) {
      setPrioritizedPlan(planResult.data);
      setResultsError(null);
      setHasTriggered(true);
      setPlanVersion(prev => prev + 1);
      setIsRecalculating(false);
      setIsLoadingResults(false);
      setPlanStatusMessage(null);
      return;
    }

    const rawStatus = (session as { status?: unknown }).status;
    const status = typeof rawStatus === 'string' ? rawStatus : undefined;
    if (status === 'completed') {
      setPrioritizedPlan(null);
      setResultsError(
        statusNote && statusNote.length > 0
          ? statusNote
          : 'Prioritized plan is unavailable. Please run prioritization again.'
      );
      setHasTriggered(true);
      setIsRecalculating(false);
      setIsLoadingResults(false);
    }
  }, []);

  const pollSessionStatus = (id: string) => {
    stopPolling();

    const poll = async () => {
      try {
        const res = await fetch(`/api/agent/sessions/${id}`);
        if (!res.ok) {
          if (res.status === 404) {
            stopPolling();
            setTriggerError('Session not found. Please try again.');
            setSessionStatus('failed');
            setIsRecalculating(false);
            return;
          }
          throw new Error('Failed to fetch session status');
        }

        const { session } = await res.json();
        setTriggerError(null);
        setSessionStatus(session.status as SessionStatus);
        setCurrentSessionId(typeof session.id === 'string' ? session.id : null);
        applySessionResults(session);

        if (session.status === 'completed' || session.status === 'failed') {
          setIsLoadingResults(false);
          setIsRecalculating(false);
        }

        if (session.status !== 'running') {
          stopPolling();
        }
      } catch (error) {
        console.error('[Task Priorities] Polling error:', error);
        setTriggerError('Lost connection while checking progress. Retrying…');
      }
    };

    poll();
    pollRef.current = setInterval(poll, POLL_INTERVAL_MS);
  };

  const handleAnalyzeTasks = async () => {
    if (!activeOutcome) {
      return;
    }

    const hasExistingPlan = prioritizedPlan !== null;

    setIsTriggering(true);
    setTriggerError(null);
    setResultsError(null);
    setPlanStatusMessage(null);
    setCurrentSessionId(null);
    setHasTriggered(true);

    if (hasExistingPlan) {
      setIsRecalculating(true);
      setIsLoadingResults(false);
    } else {
      setPrioritizedPlan(null);
      setExecutionMetadata(null);
      setIsLoadingResults(true);
    }

    setCurrentSessionId(null);

    try {
      const response = await fetch('/api/agent/prioritize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          outcome_id: activeOutcome.id,
          user_id: DEFAULT_USER_ID,
        }),
      });

      if (response.status === 403) {
        setTriggerError('Active outcome required for prioritization.');
        setSessionStatus('failed');
        setIsLoadingResults(false);
        return;
      }

      if (!response.ok) {
        throw new Error('Failed to start prioritization');
      }

      const data: PrioritizeResponse = await response.json();
      setSessionStatus('running');
      setCurrentSessionId(data.session_id);
      pollSessionStatus(data.session_id);
    } catch (error) {
      console.error('[Task Priorities] Failed to trigger agent:', error);
      setTriggerError('Could not start prioritization. Please retry.');
      setSessionStatus('failed');
      setIsLoadingResults(false);
      setIsRecalculating(false);
    } finally {
      setIsTriggering(false);
    }
  };

  const isButtonDisabled =
    !activeOutcome || outcomeLoading || isTriggering || sessionStatus === 'running';

  const showProgress = sessionStatus === 'running';
  const showCollapsedPrimaryCard = hasTriggered && !outcomeLoading;
  const hasPlan = prioritizedPlan !== null;
  const analyzeButtonLabel = () => {
    if (isTriggering) {
      return 'Initializing…';
    }
    if (sessionStatus === 'running') {
      return hasPlan ? 'Recalculating…' : 'Analyzing…';
    }
    return hasPlan ? 'Recalculate priorities' : 'Analyze Tasks';
  };

  const handleDiffSummary = useCallback(
    ({ hasChanges, isInitial }: { hasChanges: boolean; isInitial: boolean }) => {
      if (isInitial) {
        setPlanStatusMessage(null);
        return;
      }
      setPlanStatusMessage(hasChanges ? null : 'No changes to prioritization.');
    },
    []
  );

  useEffect(() => {
    if (!activeOutcome || prioritizedPlan || hasFetchedInitialPlan) {
      return;
    }

    let isCancelled = false;

    const loadLatestPlan = async () => {
      try {
        setIsLoadingResults(true);
        const params = new URLSearchParams({ outcomeId: activeOutcome.id, userId: DEFAULT_USER_ID });
        const response = await fetch(`/api/agent/sessions/latest?${params.toString()}`);

        if (isCancelled) {
          return;
        }

        if (response.status === 404) {
          setIsLoadingResults(false);
          setHasFetchedInitialPlan(true);
          return;
        }

        if (!response.ok) {
          throw new Error('Failed to load latest session');
        }

        const { session } = await response.json();
        if (session) {
          setSessionStatus(session.status as SessionStatus);
          setCurrentSessionId(typeof session.id === 'string' ? session.id : null);
          applySessionResults(session);
          setHasTriggered(true);
          setPlanStatusMessage(null);
        } else {
          setIsLoadingResults(false);
        }
      } catch (error) {
        if (!isCancelled) {
          console.error('[Task Priorities] Failed to load latest session:', error);
          setIsLoadingResults(false);
        }
      } finally {
        if (!isCancelled) {
          setHasFetchedInitialPlan(true);
        }
      }
    };

    loadLatestPlan();

    return () => {
      isCancelled = true;
    };
  }, [activeOutcome, prioritizedPlan, hasFetchedInitialPlan, applySessionResults]);

  return (
    <div className="min-h-screen bg-muted/30">
      <MainNav />

      <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-12">
        <div className="flex flex-col gap-3 text-left">
          <h1 className="text-3xl font-semibold text-foreground">Task Priorities</h1>
          <p className="text-muted-foreground max-w-2xl">
            Trigger the autonomous agent to analyze your tasks, then work from a focused, dependency-aware list.
          </p>
        </div>

        <Card className={showCollapsedPrimaryCard ? 'border-border/70 shadow-1layer-sm' : undefined}>
          {showCollapsedPrimaryCard ? (
            <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <CardTitle className="text-lg font-semibold">
                  {hasPlan ? 'Recalculate priorities' : 'Prioritize Tasks'}
                </CardTitle>
                <CardDescription className="flex flex-col gap-1 text-sm">
                  <span>
                    {sessionStatus === 'running'
                      ? hasPlan
                        ? 'Recalculating based on your latest changes…'
                        : 'Analyzing your task set…'
                      : sessionStatus === 'failed'
                        ? 'Last run failed. Try again when ready.'
                        : hasPlan
                          ? 'Last plan is ready. Recalculate whenever your task stack changes.'
                          : 'Run the agent to build your first prioritized list.'}
                  </span>
                  {activeOutcome && (
                    <span className="truncate text-muted-foreground">
                      Outcome: {activeOutcome.assembled_text}
                    </span>
                  )}
                </CardDescription>
              </div>
              <div className="flex items-center gap-3">
                {sessionStatus === 'running' && (
                  <Badge variant="secondary" className="gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                    In progress
                  </Badge>
                )}
                <Button onClick={handleAnalyzeTasks} disabled={isButtonDisabled}>
                  {sessionStatus === 'running' ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      {analyzeButtonLabel()}
                    </>
                  ) : isTriggering ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {analyzeButtonLabel()}
                    </>
                  ) : (
                    analyzeButtonLabel()
                  )}
                </Button>
              </div>
              {triggerError && (
                <p className="text-sm text-destructive">{triggerError}</p>
              )}
            </CardHeader>
          ) : (
            <>
              <CardHeader>
                <CardTitle>Prioritize Tasks</CardTitle>
                <CardDescription>
                  Provide the agent with your active outcome, then let it assemble a ranked task list with dependency guidance.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {fetchError && (
                  <Alert variant="destructive">
                    <AlertTitle>Unable to fetch outcome</AlertTitle>
                    <AlertDescription>{fetchError}</AlertDescription>
                  </Alert>
                )}

                {!fetchError && (
                  <div className="space-y-4">
                    {outcomeLoading ? (
                      <div className="h-16 animate-pulse rounded-lg bg-muted" />
                    ) : activeOutcome ? (
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-muted-foreground">Active Outcome</p>
                        <div className="rounded-lg border border-border bg-background px-4 py-3">
                          <p className="text-base leading-relaxed text-foreground">{activeOutcome.assembled_text}</p>
                          <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                            {activeOutcome.state_preference && (
                              <Badge variant="secondary">
                                State Preference: {activeOutcome.state_preference}
                              </Badge>
                            )}
                            {activeOutcome.daily_capacity_hours !== null && (
                              <Badge variant="outline">
                                Daily Capacity: {activeOutcome.daily_capacity_hours}h
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <Alert>
                        <AlertTitle>Active outcome required</AlertTitle>
                        <AlertDescription className="flex flex-col gap-2 text-sm">
                          <span>
                            Create an outcome before running prioritization. This provides the agent with context for ranking your tasks.
                          </span>
                          <Button asChild variant="link" className="px-0 text-base">
                            <Link href="/?openOutcome=1" prefetch>
                              Open outcome builder
                              <ExternalLink className="ml-2 inline h-4 w-4" />
                            </Link>
                          </Button>
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                )}

                <div className="flex flex-col gap-3">
                  <Button onClick={handleAnalyzeTasks} disabled={isButtonDisabled} className="w-fit">
                    {sessionStatus === 'running' ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        {analyzeButtonLabel()}
                      </>
                    ) : isTriggering ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {analyzeButtonLabel()}
                      </>
                    ) : (
                      analyzeButtonLabel()
                    )}
                  </Button>

                  {triggerError && (
                    <p className="text-sm text-destructive">{triggerError}</p>
                  )}
                </div>
              </CardContent>
            </>
          )}

          {!showCollapsedPrimaryCard && showProgress && (
            <CardContent>
              <div className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span>Analyzing tasks… This may take up to 30 seconds.</span>
              </div>
            </CardContent>
          )}

          {showCollapsedPrimaryCard && showProgress && (
            <CardContent className="pt-0">
              <div className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span>Analyzing tasks… This may take up to 30 seconds.</span>
              </div>
            </CardContent>
          )}

          {sessionStatus === 'failed' && !showProgress && triggerError && (
            <CardContent className="pt-0">
              <Alert variant="destructive">
                <AlertTitle>Prioritization failed</AlertTitle>
                <AlertDescription>{triggerError}</AlertDescription>
              </Alert>
            </CardContent>
          )}
        </Card>

        {resultsError && (
          <Alert variant="destructive">
            <AlertTitle>Unable to load prioritization results</AlertTitle>
            <AlertDescription>{resultsError}</AlertDescription>
          </Alert>
        )}

        {isLoadingResults && (
          <Card className="border-dashed border-border/70 bg-muted/40">
            <CardHeader>
              <CardTitle>Preparing prioritized list</CardTitle>
              <CardDescription>
                We will surface the updated ranking as soon as the agent finishes synthesizing dependencies.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-5 w-48" />
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton key={index} className="h-12 rounded-lg" />
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {prioritizedPlan ? (
          <>
            {isRecalculating && (
              <Alert>
                <AlertTitle>Recalculating priorities</AlertTitle>
                <AlertDescription>Hold tight while we align the list with your latest changes.</AlertDescription>
              </Alert>
            )}
            {planStatusMessage && !isRecalculating && (
              <Alert>
                <AlertDescription>{planStatusMessage}</AlertDescription>
              </Alert>
            )}
            <TaskList
              plan={prioritizedPlan}
              executionMetadata={executionMetadata ?? undefined}
              sessionId={currentSessionId}
              planVersion={planVersion}
              outcomeId={activeOutcome?.id ?? null}
              onDiffSummary={handleDiffSummary}
            />
          </>
        ) : (
          !isLoadingResults &&
          sessionStatus !== 'running' && (
            <Card className="border-dashed border-border/70 bg-muted/30">
              <CardHeader>
                <CardTitle>No prioritization results yet</CardTitle>
                <CardDescription>
                  Run the agent to generate a ranked list of your tasks along with dependencies and movement markers.
                </CardDescription>
              </CardHeader>
            </Card>
          )
        )}
      </main>
    </div>
  );
}
