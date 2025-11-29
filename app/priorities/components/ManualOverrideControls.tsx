'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Loader2, X } from 'lucide-react';

import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import type { ManualOverrideState } from '@/lib/schemas/manualOverride';
import type { StrategicScore } from '@/lib/schemas/strategicScore';
import { calculatePriority } from '@/lib/utils/strategicPriority';

const MAX_REASON_LENGTH = 500;

type ManualOverrideControlsProps = {
  taskId: string;
  open: boolean;
  manualOverride: ManualOverrideState | null;
  aiScore: StrategicScore | null;
  onManualOverrideChange?: (override: ManualOverrideState | null) => void;
  onApply?: (override: ManualOverrideState) => Promise<void>;
  onCancel?: () => void;
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
  onApply,
  onCancel,
}: ManualOverrideControlsProps) {
  // Local state for pending changes (staged until Apply is clicked)
  const [pendingImpact, setPendingImpact] = useState<number | null>(
    resolveInitialValue(manualOverride, aiScore, 'impact')
  );
  const [pendingEffort, setPendingEffort] = useState<number | null>(
    resolveInitialValue(manualOverride, aiScore, 'effort')
  );
  const [pendingReason, setPendingReason] = useState(manualOverride?.reason ?? '');
  const [isApplying, setIsApplying] = useState(false);

  // Track original values to detect changes
  const originalValuesRef = useRef({
    impact: resolveInitialValue(manualOverride, aiScore, 'impact'),
    effort: resolveInitialValue(manualOverride, aiScore, 'effort'),
    reason: manualOverride?.reason ?? '',
  });

  // Reset pending state when drawer opens/closes or values change
  useEffect(() => {
    if (!open) {
      // Reset to original values when drawer closes
      const originalImpact = resolveInitialValue(manualOverride, aiScore, 'impact');
      const originalEffort = resolveInitialValue(manualOverride, aiScore, 'effort');
      const originalReason = manualOverride?.reason ?? '';

      setPendingImpact(originalImpact);
      setPendingEffort(originalEffort);
      setPendingReason(originalReason);

      originalValuesRef.current = {
        impact: originalImpact,
        effort: originalEffort,
        reason: originalReason,
      };
    }
  }, [open, manualOverride, aiScore]);

  // Update when override changes from external source (after Apply succeeds)
  useEffect(() => {
    if (open && !isApplying) {
      const newImpact = resolveInitialValue(manualOverride, aiScore, 'impact');
      const newEffort = resolveInitialValue(manualOverride, aiScore, 'effort');
      const newReason = manualOverride?.reason ?? '';

      setPendingImpact(newImpact);
      setPendingEffort(newEffort);
      setPendingReason(newReason);

      originalValuesRef.current = {
        impact: newImpact,
        effort: newEffort,
        reason: newReason,
      };
    }
  }, [manualOverride, aiScore, open, isApplying]);

  const resolvedConfidence = typeof aiScore?.confidence === 'number' ? aiScore.confidence : null;
  const canEditScores =
    typeof pendingImpact === 'number' &&
    typeof pendingEffort === 'number' &&
    typeof resolvedConfidence === 'number';

  const priorityPreview = useMemo(() => {
    if (
      typeof pendingImpact === 'number' &&
      typeof pendingEffort === 'number' &&
      typeof resolvedConfidence === 'number'
    ) {
      return calculatePriority(pendingImpact, pendingEffort, resolvedConfidence);
    }
    return null;
  }, [pendingImpact, pendingEffort, resolvedConfidence]);

  // Check if there are pending changes
  const hasPendingChanges =
    pendingImpact !== originalValuesRef.current.impact ||
    pendingEffort !== originalValuesRef.current.effort ||
    pendingReason !== originalValuesRef.current.reason;

  const handleImpactChange = (value: number[]) => {
    const nextValue = value[0];
    if (typeof nextValue !== 'number') {
      return;
    }
    const clamped = Math.min(Math.max(nextValue, 0), 10);
    setPendingImpact(clamped);
  };

  const handleEffortChange = (event: ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value;
    if (raw.trim().length === 0) {
      setPendingEffort(null);
      return;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      return;
    }
    const clamped = Math.min(Math.max(parsed, 0.5), 160);
    setPendingEffort(clamped);
  };

  const handleApplyClick = async () => {
    if (typeof pendingImpact !== 'number' || typeof pendingEffort !== 'number') {
      return;
    }

    setIsApplying(true);

    try {
      const override: ManualOverrideState = {
        impact: pendingImpact,
        effort: pendingEffort,
        reason: pendingReason.trim().length > 0 ? pendingReason.trim() : undefined,
      };

      // If onApply callback provided, use it (for tests and instant re-ranking)
      if (onApply) {
        await onApply(override);
      }

      // Also call the old callback for backward compatibility
      if (onManualOverrideChange) {
        onManualOverrideChange(override);
      }

      // Update original values ref after successful apply
      originalValuesRef.current = {
        impact: pendingImpact,
        effort: pendingEffort,
        reason: pendingReason,
      };
    } finally {
      setIsApplying(false);
    }
  };

  const handleCancelClick = () => {
    // Reset to original values
    setPendingImpact(originalValuesRef.current.impact);
    setPendingEffort(originalValuesRef.current.effort);
    setPendingReason(originalValuesRef.current.reason);

    // Call onCancel callback if provided
    if (onCancel) {
      onCancel();
    }
  };

  const disableApply =
    isApplying ||
    !canEditScores ||
    !hasPendingChanges ||
    pendingReason.length > MAX_REASON_LENGTH ||
    typeof resolvedConfidence !== 'number';

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label htmlFor="impact-slider">Impact</Label>
          <span className="text-sm text-muted-foreground">
            {typeof pendingImpact === 'number' ? pendingImpact.toFixed(1) : '—'}
          </span>
        </div>
        <Slider
          id="impact-slider"
          aria-label="Impact"
          min={0}
          max={10}
          step={0.5}
          disabled={!canEditScores}
          value={typeof pendingImpact === 'number' ? [pendingImpact] : [0]}
          onValueChange={handleImpactChange}
        />
        <p className="text-xs text-muted-foreground">
          Drag to override the AI&apos;s strategic impact estimate (0 – 10).
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
          value={typeof pendingEffort === 'number' ? pendingEffort : ''}
          onChange={handleEffortChange}
          disabled={!canEditScores}
        />
        <p className="text-xs text-muted-foreground">
          Use decimal hours for partial days (0.5 h minimum, 160 h maximum).
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="override-reason">Reason (optional)</Label>
          <span className="text-xs text-muted-foreground">
            {pendingReason.length}/{MAX_REASON_LENGTH}
          </span>
        </div>
        <Textarea
          id="override-reason"
          value={pendingReason}
          onChange={event => setPendingReason(event.target.value.slice(0, MAX_REASON_LENGTH))}
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
          {hasPendingChanges && !isApplying && (
            <p className="text-xs text-amber-600 dark:text-amber-500">
              Changes pending (click Apply to save)
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleCancelClick}
            variant="outline"
            disabled={!hasPendingChanges || isApplying}
            aria-label="Cancel changes"
          >
            <X className="mr-2 h-4 w-4" />
            Cancel
          </Button>
          <Button
            onClick={handleApplyClick}
            disabled={disableApply}
            aria-label="Apply changes"
          >
            {isApplying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Apply
          </Button>
        </div>
      </div>
    </div>
  );
}
