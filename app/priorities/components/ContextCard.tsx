'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, MessageSquare, RefreshCw } from 'lucide-react';
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
}: ContextCardProps) {
  const [localReflections, setLocalReflections] = useState<ReflectionWithLocalState[]>(
    () => prepareReflections(reflections)
  );
  const [pendingToggleIds, setPendingToggleIds] = useState<Set<string>>(new Set());
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

  useEffect(() => {
    setLocalReflections(prepareReflections(reflections));
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
                Add quick notes about your current stage, constraints, or blockers to get relevant
                priorities.
              </p>
              <Button onClick={onAddContext} className="gap-2 sm:w-fit">
                <MessageSquare className="h-4 w-4" />
                Add Current Context
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {disableToggles && !showExpiredBanner && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {disabledMessage}
              </div>
            )}

            {localReflections.map((reflection) => {
              const isPending = pendingToggleIds.has(reflection.id);
              const canToggle = UUID_PATTERN.test(reflection.id);

              return (
                <div
                  key={reflection.id}
                  className={cn(
                    'rounded-lg border px-4 py-3 shadow-sm transition-all',
                    reflection.is_active_for_prioritization
                      ? 'border-border-subtle bg-background'
                      : 'border-dashed border-border/60 bg-muted/30 opacity-75'
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    <p className="text-sm text-foreground leading-relaxed">{reflection.text}</p>
                    <div className="flex flex-col items-end gap-1">
                      <Switch
                        checked={reflection.is_active_for_prioritization}
                        onCheckedChange={(checked) => {
                          void handleToggle(reflection.id, checked);
                        }}
                        aria-label={`Toggle reflection "${reflection.text}"`}
                        disabled={disableToggles || isPending || !canToggle}
                      />
                      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        {disableToggles ? (
                          'Locked'
                        ) : isPending ? (
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Saving…
                          </span>
                        ) : canToggle ? (
                          reflection.is_active_for_prioritization ? 'Active' : 'Inactive'
                        ) : (
                          'View only'
                        )}
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{reflection.relative_time}</span>
                    {typeof reflection.recency_weight === 'number' && (
                      <Badge variant="outline" className="border-primary/30 text-primary">
                        Recency&nbsp;{reflection.recency_weight.toFixed(2)}
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
