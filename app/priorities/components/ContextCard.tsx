'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Loader2, MessageSquare, RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { ReflectionWithWeight } from '@/lib/schemas/reflectionSchema';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { toast } from 'sonner';
import { toggleReflection } from '@/lib/api/toggleReflection';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

type ContextCardProps = {
  reflections: ReflectionWithWeight[];
  isLoading: boolean;
  error?: string | null;
  onAddContext: () => void;
  onActiveReflectionsChange?: (activeReflectionIds: string[]) => void;
  togglesDisabled?: boolean;
  toggleDisabledLabel?: string | null;
  baselineAgeLabel?: string | null;
  isBaselineStale?: boolean;
  isBaselineExpired?: boolean;
  onRecalculate?: () => void | Promise<void>;
  disableRecalculate?: boolean;
  pendingDocumentCount?: number | null;
  hasBaselineDocuments?: boolean;
  completionTime?: Date;
  qualityCheckPassed?: boolean;
};

type ReflectionWithLocalState = ReflectionWithWeight & {
  is_active_for_prioritization: boolean;
};

const MAX_REFLECTIONS = 5;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const prepareReflections = (entries: ReflectionWithWeight[]): ReflectionWithLocalState[] => {
  return [...entries]
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() -
        new Date(a.created_at).getTime()
    )
    .slice(0, MAX_REFLECTIONS)
    .map((reflection) => ({
      ...reflection,
      is_active_for_prioritization:
        typeof reflection.is_active_for_prioritization === 'boolean'
          ? reflection.is_active_for_prioritization
          : true
    }));
};

const SHOULD_CLAMP_CHARACTER_COUNT = 220;

export function ContextCard({
  reflections,
  isLoading,
  error,
  onAddContext,
  onActiveReflectionsChange,
  togglesDisabled = false,
  toggleDisabledLabel,
  baselineAgeLabel,
  isBaselineStale = false,
  isBaselineExpired = false,
  onRecalculate,
  disableRecalculate = false,
  pendingDocumentCount = null,
  hasBaselineDocuments = false,
  completionTime,
  qualityCheckPassed,
}: ContextCardProps) {
  const [localReflections, setLocalReflections] = useState<ReflectionWithLocalState[]>(
    () => prepareReflections(reflections)
  );
  const [pendingToggleIds, setPendingToggleIds] = useState<Set<string>>(new Set());
  const [expandedReflectionIds, setExpandedReflectionIds] = useState<string[]>([]);
  const disableToggles = Boolean(togglesDisabled);
  const disabledMessage = toggleDisabledLabel ?? 'Baseline plan too old. Run a full analysis to adjust context.';
  const showExpiredBanner = Boolean(isBaselineExpired);
  const showStaleBanner = Boolean(!isBaselineExpired && isBaselineStale);
  const expiredMessage = baselineAgeLabel
    ? 'Baseline plan too old (>7 days). Last analyzed ' +
      `${baselineAgeLabel} ago. Run a full analysis to use context adjustments.`
    : 'Baseline plan too old (>7 days). Run a full analysis to use context adjustments.';
  const staleMessage = baselineAgeLabel
    ? `Your priorities were last analyzed ${baselineAgeLabel} ago. Consider running a full analysis for best results.`
    : 'Your priorities were last analyzed over 24 hours ago. Consider running a full analysis for best results.';
  const showPendingBadge =
    typeof pendingDocumentCount === 'number' &&
    (pendingDocumentCount > 0 || hasBaselineDocuments);
  const pendingBadgeVariant = pendingDocumentCount && pendingDocumentCount > 0 ? 'secondary' : 'outline';
  const pendingBadgeLabel =
    pendingDocumentCount && pendingDocumentCount > 0 ? `${pendingDocumentCount} new` : 'up to date';
  const hasMetadata = Boolean(completionTime) || qualityCheckPassed !== undefined;

  useEffect(() => {
    setLocalReflections(prepareReflections(reflections));
    setExpandedReflectionIds((prev) => prev.filter((id) => reflections.some((reflection) => reflection.id === id)));
  }, [reflections]);

  const setTogglePending = useCallback((reflectionId: string, pending: boolean) => {
    setPendingToggleIds((prev) => {
      const next = new Set(prev);
      if (pending) {
        next.add(reflectionId);
      } else {
        next.delete(reflectionId);
      }
      return next;
    });
  }, []);

  const handleToggle = useCallback(
    async (reflectionId: string, isActive: boolean) => {
      if (disableToggles || pendingToggleIds.has(reflectionId) || !UUID_PATTERN.test(reflectionId)) {
        return;
      }

      let previousState = isActive;

      setLocalReflections((prev) =>
        prev.map((reflection) => {
          if (reflection.id === reflectionId) {
            previousState = reflection.is_active_for_prioritization;
            return { ...reflection, is_active_for_prioritization: isActive };
          }
          return reflection;
        })
      );

      setTogglePending(reflectionId, true);

      try {
        const updatedReflection = await toggleReflection(reflectionId, isActive);

        setLocalReflections((prev) =>
          prev.map((reflection) =>
            reflection.id === reflectionId
              ? {
                  ...reflection,
                  ...updatedReflection,
                  is_active_for_prioritization:
                    typeof updatedReflection.is_active_for_prioritization === 'boolean'
                      ? updatedReflection.is_active_for_prioritization
                      : isActive,
                }
              : reflection
          )
        );
      } catch (error) {
        setLocalReflections((prev) =>
          prev.map((reflection) =>
            reflection.id === reflectionId
              ? { ...reflection, is_active_for_prioritization: previousState }
              : reflection
          )
        );
        const message =
          error instanceof Error ? error.message : 'Failed to update reflection';
        toast.error(message);
      } finally {
        setTogglePending(reflectionId, false);
      }
    },
    [disableToggles, pendingToggleIds, setTogglePending]
  );

  const activeReflectionIds = useMemo(
    () =>
      localReflections
        .filter(
          (reflection) =>
            reflection.is_active_for_prioritization && UUID_PATTERN.test(reflection.id)
        )
        .map((reflection) => reflection.id),
    [localReflections]
  );

  const debouncedActiveReflections = useDebounce(activeReflectionIds, 1000);

  useEffect(() => {
    if (onActiveReflectionsChange) {
      onActiveReflectionsChange(debouncedActiveReflections);
    }
  }, [debouncedActiveReflections, onActiveReflectionsChange]);

  const hasReflections = localReflections.length > 0;
  const expandedReflectionSet = useMemo(() => new Set(expandedReflectionIds), [expandedReflectionIds]);
  const activeReflections = localReflections.filter((reflection) => reflection.is_active_for_prioritization);
  const inactiveReflections = localReflections.filter((reflection) => !reflection.is_active_for_prioritization);

  const toggleExpanded = useCallback((reflectionId: string) => {
    setExpandedReflectionIds((prev) => {
      if (prev.includes(reflectionId)) {
        return prev.filter((id) => id !== reflectionId);
      }
      return [...prev, reflectionId];
    });
  }, []);

  return (
    <Card className="border-border/60 shadow-1layer-sm">
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="text-lg font-semibold text-foreground">
            Current Context
          </CardTitle>
          <CardDescription>
            Capture reflections to help the agent adjust your priorities instantly.
          </CardDescription>
        </div>
        <Button onClick={onAddContext} className="gap-2" variant="outline">
          <MessageSquare className="h-4 w-4" />
          Add Current Context
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {hasMetadata && (
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            {completionTime && (
              <span>
                Completed {formatDistanceToNow(completionTime, { addSuffix: true })}
              </span>
            )}
            {qualityCheckPassed !== undefined && (
              <Badge variant={qualityCheckPassed ? 'default' : 'secondary'}>
                Quality check: {qualityCheckPassed ? '✓ Passed' : '⚠ Review'}
              </Badge>
            )}
          </div>
        )}

        {(showExpiredBanner || showStaleBanner) && (
          <Alert
            variant={showExpiredBanner ? 'destructive' : 'default'}
            className={
              showExpiredBanner
                ? 'border-destructive/40 bg-destructive/10'
                : 'border-amber-500/40 bg-amber-500/10 text-amber-900'
            }
          >
            <AlertTitle>
              {showExpiredBanner ? 'Baseline plan expired' : 'Baseline plan is getting stale'}
            </AlertTitle>
            <AlertDescription className="flex flex-col gap-3 text-sm">
              <span>{showExpiredBanner ? expiredMessage : staleMessage}</span>
              {onRecalculate && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant={showExpiredBanner ? 'destructive' : 'outline'}
                    className={
                      showExpiredBanner
                        ? 'self-start'
                        : 'self-start border-amber-500 text-amber-900 hover:bg-amber-500/20'
                    }
                    onClick={() => {
                      if (!disableRecalculate) {
                        void onRecalculate();
                      }
                    }}
                    disabled={disableRecalculate}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Recalculate
                  </Button>
                  {showPendingBadge && (
                    <Badge variant={pendingBadgeVariant} className="h-6 rounded-full px-2 text-xs">
                      {pendingBadgeLabel}
                    </Badge>
                  )}
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : !hasReflections ? (
          <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border bg-muted/30 p-4 sm:flex-row sm:items-start">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <MessageSquare className="h-5 w-5 text-primary" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-foreground">No context added yet</h3>
              <p className="text-sm text-muted-foreground">
                Share what&apos;s blocking you or where to focus, and watch your priorities adjust.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {disableToggles && !showExpiredBanner && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {disabledMessage}
              </div>
            )}

            {(activeReflections.length > 0 ? [{ label: 'Active for prioritization', reflections: activeReflections }] : [])
              .concat(inactiveReflections.length > 0 ? [{ label: 'Available to reuse', reflections: inactiveReflections }] : [])
              .map((group) => (
                <div key={group.label} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {group.label}
                    </h3>
                    <span className="text-xs text-muted-foreground">
                      {group.reflections.length} {group.reflections.length === 1 ? 'entry' : 'entries'}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {group.reflections.map((reflection) => {
              const isPending = pendingToggleIds.has(reflection.id);
              const canToggle = UUID_PATTERN.test(reflection.id);
              const isExpanded = expandedReflectionSet.has(reflection.id);
              const shouldClamp = !isExpanded && reflection.text.length > SHOULD_CLAMP_CHARACTER_COUNT;
              const effectSummary = reflection.effects_summary;
              const primaryEffect = effectSummary
                ? effectSummary.blocked > 0
                  ? 'blocked'
                  : effectSummary.demoted > 0
                    ? 'demoted'
                    : effectSummary.boosted > 0
                      ? 'boosted'
                      : null
                : null;
              const effectCount =
                primaryEffect === 'blocked'
                  ? effectSummary?.blocked ?? 0
                  : primaryEffect === 'demoted'
                    ? effectSummary?.demoted ?? 0
                    : primaryEffect === 'boosted'
                      ? effectSummary?.boosted ?? 0
                      : effectSummary?.total ?? 0;
              const effectBadgeClass =
                primaryEffect === 'blocked'
                  ? 'border-destructive/50 bg-destructive/10 text-destructive'
                  : primaryEffect === 'demoted'
                    ? 'border-amber-500/50 bg-amber-500/10 text-amber-700'
                    : primaryEffect === 'boosted'
                      ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700'
                      : 'border-muted-foreground/30 text-muted-foreground';
              const effectIcon =
                primaryEffect === 'blocked' ? '🚫' : primaryEffect === 'demoted' ? '⬇️' : primaryEffect === 'boosted' ? '⬆️' : '•';
              const effectLabel =
                primaryEffect === 'blocked'
                  ? 'blocked'
                  : primaryEffect === 'demoted'
                    ? 'demoted'
                    : primaryEffect === 'boosted'
                      ? 'boosted'
                      : 'affected';

              return (
                <div
                  key={reflection.id}
                  className={cn(
                    'rounded-lg border px-4 py-3 shadow-sm transition-all',
                    reflection.is_active_for_prioritization
                      ? 'border-border-subtle bg-background'
                      : 'border-dashed border-border/60 bg-muted/40'
                  )}
                >
                  <div className="flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-4">
                      <p
                        className={cn(
                          'text-sm leading-relaxed text-foreground',
                          shouldClamp && 'line-clamp-3'
                        )}
                      >
                        {reflection.text}
                      </p>
                      <Switch
                        checked={reflection.is_active_for_prioritization}
                        onCheckedChange={(checked) => {
                          void handleToggle(reflection.id, checked);
                        }}
                        aria-label={`Toggle reflection "${reflection.text}"`}
                        disabled={disableToggles || isPending || !canToggle}
                      />
                    </div>

                    {(shouldClamp || expandedReflectionSet.has(reflection.id)) && reflection.text.length > SHOULD_CLAMP_CHARACTER_COUNT && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 w-fit px-2 text-xs text-muted-foreground"
                        onClick={() => toggleExpanded(reflection.id)}
                      >
                        {isExpanded ? (
                          <>
                            Show less
                            <ChevronUp className="ml-1 h-3.5 w-3.5" />
                          </>
                        ) : (
                          <>
                            Show more
                            <ChevronDown className="ml-1 h-3.5 w-3.5" />
                          </>
                        )}
                      </Button>
                    )}

                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{reflection.relative_time}</span>
                      {effectSummary && (
                        <Badge variant="outline" className={cn('gap-1', effectBadgeClass)}>
                          <span aria-hidden="true">{effectIcon}</span>
                          <span className="font-medium">
                            {effectCount} {effectCount === 1 ? 'task' : 'tasks'} {effectLabel}
                          </span>
                        </Badge>
                      )}
                      {typeof reflection.recency_weight === 'number' && (
                        <Badge variant="outline" className="border-primary/30 text-primary">
                          Recency&nbsp;{reflection.recency_weight.toFixed(2)}
                        </Badge>
                      )}
                      {disableToggles ? (
                        <Badge variant="outline" className="border-muted-foreground/30 text-muted-foreground">
                          Locked while baseline is stale
                        </Badge>
                      ) : isPending ? (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Saving…
                        </span>
                      ) : !canToggle ? (
                        <Badge variant="secondary" className="bg-muted/80 text-muted-foreground">
                          View only
                        </Badge>
                      ) : reflection.is_active_for_prioritization ? (
                        <Badge variant="secondary" className="bg-primary/10 text-primary">
                          Included in analysis
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-border-subtle text-muted-foreground">
                          Not included
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              );
                    })}
                  </div>
                </div>
              ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
