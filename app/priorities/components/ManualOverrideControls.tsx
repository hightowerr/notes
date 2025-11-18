'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import type { ManualOverrideState } from '@/lib/schemas/manualOverride';
import type { StrategicScore } from '@/lib/schemas/strategicScore';
import { calculatePriority } from '@/lib/utils/strategicPriority';

const SAVE_DEBOUNCE_MS = 500;
const SUCCESS_INDICATOR_MS = 1200;
const MAX_REASON_LENGTH = 500;

type ManualOverrideControlsProps = {
  taskId: string;
  open: boolean;
  manualOverride: ManualOverrideState | null;
  aiScore: StrategicScore | null;
  onManualOverrideChange?: (override: ManualOverrideState | null) => void;
};

function resolveInitialValue(
  manualOverride: ManualOverrideState | null,
  aiScore: StrategicScore | null,
  field: 'impact' | 'effort'
): number | null {
  if (manualOverride && typeof manualOverride[field] === 'number') {
    return manualOverride[field] as number;
  }
  if (aiScore && typeof aiScore[field] === 'number') {
    return aiScore[field] as number;
  }
  return null;
}

export function ManualOverrideControls({
  taskId,
  open,
  manualOverride,
  aiScore,
  onManualOverrideChange,
}: ManualOverrideControlsProps) {
  const [impactValue, setImpactValue] = useState<number | null>(
    resolveInitialValue(manualOverride, aiScore, 'impact')
  );
  const [effortValue, setEffortValue] = useState<number | null>(
    resolveInitialValue(manualOverride, aiScore, 'effort')
  );
  const [reasonValue, setReasonValue] = useState(manualOverride?.reason ?? '');
  const [autoSaveState, setAutoSaveState] = useState<'idle' | 'saving' | 'error'>('idle');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'success'>('idle');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPayloadRef = useRef<{ impact?: number; effort?: number } | null>(null);
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastStableOverrideRef = useRef<ManualOverrideState | null>(manualOverride ?? null);

  useEffect(() => {
    if (!manualOverride || manualOverride.optimistic) {
      return;
    }
    lastStableOverrideRef.current = manualOverride;
  }, [manualOverride]);

  useEffect(() => {
    if (!open) {
      setImpactValue(resolveInitialValue(manualOverride, aiScore, 'impact'));
      setEffortValue(resolveInitialValue(manualOverride, aiScore, 'effort'));
      setReasonValue(manualOverride?.reason ?? '');
      setSaveState('idle');
      setAutoSaveState('idle');
    }
  }, [open, manualOverride, aiScore]);

  useEffect(() => {
    if (!open || manualOverride?.optimistic) {
      return;
    }
    const nextImpact = resolveInitialValue(manualOverride, aiScore, 'impact');
    if (typeof nextImpact === 'number') {
      setImpactValue(prev => (prev !== nextImpact ? nextImpact : prev));
    }
    const nextEffort = resolveInitialValue(manualOverride, aiScore, 'effort');
    if (typeof nextEffort === 'number') {
      setEffortValue(prev => (prev !== nextEffort ? nextEffort : prev));
    }
    const targetReason = manualOverride?.reason ?? '';
    setReasonValue(prev => (prev === targetReason ? prev : targetReason));
  }, [manualOverride, aiScore, open]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
      }
    };
  }, []);

  const resolvedConfidence = typeof aiScore?.confidence === 'number' ? aiScore.confidence : null;
  const canEditScores =
    typeof impactValue === 'number' &&
    typeof effortValue === 'number' &&
    typeof resolvedConfidence === 'number';

  const priorityPreview = useMemo(() => {
    if (
      typeof impactValue === 'number' &&
      typeof effortValue === 'number' &&
      typeof resolvedConfidence === 'number'
    ) {
      return calculatePriority(impactValue, effortValue, resolvedConfidence);
    }
    return null;
  }, [impactValue, effortValue, resolvedConfidence]);

  const emitOptimisticUpdate = useCallback(
    (nextImpact: number, nextEffort: number) => {
      if (!onManualOverrideChange) {
        return;
      }
      const stable = lastStableOverrideRef.current;
      onManualOverrideChange({
        impact: nextImpact,
        effort: nextEffort,
        reason: stable?.reason,
        timestamp: stable?.timestamp,
        session_id: stable?.session_id,
        optimistic: true,
      });
    },
    [onManualOverrideChange]
  );

  const handleApiError = useCallback(
    (message: string, mode: 'auto' | 'manual') => {
      toast.error(message);
      if (mode === 'auto') {
        setAutoSaveState('error');
      } else {
        setSaveState('idle');
      }
      if (onManualOverrideChange) {
        onManualOverrideChange(lastStableOverrideRef.current ?? null);
      }
    },
    [onManualOverrideChange]
  );

  const submitOverride = useCallback(
    async (
      payload: { impact?: number; effort?: number; reason?: string },
      options: { mode: 'auto' | 'manual' }
    ) => {
      const trimmedReason =
        typeof payload.reason === 'string' && payload.reason.trim().length > 0
          ? payload.reason.trim()
          : undefined;
      if (
        typeof payload.impact !== 'number' &&
        typeof payload.effort !== 'number' &&
        typeof trimmedReason === 'undefined'
      ) {
        return;
      }
      if (options.mode === 'auto') {
        setAutoSaveState('saving');
      } else {
        setSaveState('saving');
      }
      try {
        const response = await fetch(`/api/tasks/${taskId}/override`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            impact: payload.impact,
            effort: payload.effort,
            reason: trimmedReason,
          }),
        });
        if (!response.ok) {
          throw new Error('Failed to save override');
        }
        const data = (await response.json()) as {
          override: ManualOverrideState;
        };
        if (onManualOverrideChange) {
          onManualOverrideChange({ ...data.override, optimistic: false });
        }
        if (options.mode === 'auto') {
          setAutoSaveState('idle');
        } else {
          setSaveState('success');
          successTimeoutRef.current = setTimeout(() => {
            setSaveState('idle');
          }, SUCCESS_INDICATOR_MS);
        }
      } catch (error) {
        handleApiError(
          options.mode === 'auto'
            ? 'Unable to save slider update'
            : 'Failed to save manual override',
          options.mode
        );
      } finally {
        if (options.mode === 'auto' && pendingPayloadRef.current === null) {
          setAutoSaveState('idle');
        }
      }
    },
    [taskId, onManualOverrideChange, handleApiError]
  );

  const scheduleAutoSave = useCallback(
    (partial: { impact?: number; effort?: number }) => {
      pendingPayloadRef.current = {
        ...pendingPayloadRef.current,
        ...partial,
      };
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        const payload = pendingPayloadRef.current;
        pendingPayloadRef.current = null;
        if (payload) {
          void submitOverride(payload, { mode: 'auto' });
        }
      }, SAVE_DEBOUNCE_MS);
    },
    [submitOverride]
  );

  const handleImpactChange = (value: number[]) => {
    const nextValue = value[0];
    if (typeof nextValue !== 'number' || typeof effortValue !== 'number') {
      return;
    }
    const clamped = Math.min(Math.max(nextValue, 0), 10);
    setImpactValue(clamped);
    emitOptimisticUpdate(clamped, effortValue);
    scheduleAutoSave({ impact: clamped });
  };

  const handleEffortChange = (event: ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value;
    if (raw.trim().length === 0) {
      setEffortValue(null);
      return;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || typeof impactValue !== 'number') {
      return;
    }
    const clamped = Math.min(Math.max(parsed, 0.5), 160);
    setEffortValue(clamped);
    emitOptimisticUpdate(impactValue, clamped);
    scheduleAutoSave({ effort: clamped });
  };

  const handleSaveClick = () => {
    if (typeof impactValue !== 'number' || typeof effortValue !== 'number') {
      return;
    }
    void submitOverride(
      {
        impact: impactValue,
        effort: effortValue,
        reason: reasonValue,
      },
      { mode: 'manual' }
    );
  };

  const disableSave =
    saveState === 'saving' ||
    !canEditScores ||
    reasonValue.length > MAX_REASON_LENGTH ||
    typeof resolvedConfidence !== 'number';

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label htmlFor="impact-slider">Impact</Label>
          <span className="text-sm text-muted-foreground">
            {typeof impactValue === 'number' ? impactValue.toFixed(1) : '—'}
          </span>
        </div>
        <Slider
          id="impact-slider"
          aria-label="Impact"
          min={0}
          max={10}
          step={0.5}
          disabled={!canEditScores}
          value={typeof impactValue === 'number' ? [impactValue] : [0]}
          onValueChange={handleImpactChange}
        />
        <p className="text-xs text-muted-foreground">
          Drag to override the AI&apos;s strategic impact estimate (0 – 10).
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="effort-input">Effort (hours)</Label>
        <Input
          id="effort-input"
          type="number"
          min={0.5}
          max={160}
          step={0.5}
          value={typeof effortValue === 'number' ? effortValue : ''}
          onChange={handleEffortChange}
          disabled={!canEditScores}
        />
        <p className="text-xs text-muted-foreground">
          Use decimal hours for partial days (0.5 h minimum, 160 h maximum).
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="override-reason">Reason (optional)</Label>
          <span className="text-xs text-muted-foreground">
            {reasonValue.length}/{MAX_REASON_LENGTH}
          </span>
        </div>
        <Textarea
          id="override-reason"
          value={reasonValue}
          onChange={event => setReasonValue(event.target.value.slice(0, MAX_REASON_LENGTH))}
          maxLength={MAX_REASON_LENGTH}
          placeholder="Explain why this estimate differs from the AI suggestion."
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-border/70 bg-bg-layer-1 px-3 py-2">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Priority preview
          </p>
          <p className="text-base font-semibold text-foreground">
            {priorityPreview !== null
              ? priorityPreview.toFixed(1)
              : resolvedConfidence === null
                ? 'Run prioritization to enable overrides'
                : '—'}
          </p>
          {autoSaveState === 'saving' && (
            <p className="text-xs text-muted-foreground">Saving impact/effort…</p>
          )}
          {autoSaveState === 'error' && (
            <p className="text-xs text-destructive">Auto-save failed. Check your network.</p>
          )}
        </div>
        <Button onClick={handleSaveClick} disabled={disableSave}>
          {saveState === 'saving' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {saveState === 'success' && <Check className="mr-2 h-4 w-4 text-emerald-500" />}
          Save
        </Button>
      </div>
    </div>
  );
}
