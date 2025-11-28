'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Lightbulb, Loader2, Lock, Pencil, Unlock, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MovementBadge, type MovementInfo } from '@/app/priorities/components/MovementBadge';
import { QUADRANT_CONFIGS, getQuadrant, type Quadrant } from '@/lib/schemas/quadrant';
import { ScoreBreakdownModal } from '@/app/priorities/components/ScoreBreakdownModal';
import { ManualOverrideControls } from '@/app/priorities/components/ManualOverrideControls';
import type { ManualOverrideState } from '@/lib/schemas/manualOverride';
import type { StrategicScore, TaskWithScores } from '@/lib/schemas/strategicScore';
import type { RetryStatusEntry } from '@/lib/schemas/retryStatus';
import type { ReflectionEffect } from '@/lib/services/reflectionAdjuster';
import { ReflectionAttributionBadge } from '@/app/priorities/components/ReflectionAttributionBadge';
import {
  ManualTaskBadge,
  type ManualTaskBadgeStatus,
} from '@/app/priorities/components/ManualTaskBadge';

type EditMode = 'idle' | 'editing' | 'saving' | 'error';

type EditState = {
  mode: EditMode;
  draftText: string;
  originalText: string;
  errorMessage: string | null;
};

const SAVE_DEBOUNCE_MS = 500;
const SUCCESS_INDICATOR_MS = 1000;
const MIN_TEXT_LENGTH = 10;
const MAX_TEXT_LENGTH = 500;

type DependencyLink = {
  taskId: string;
  rank: number | null;
  label: string;
};

type TaskRowProps = {
  taskId: string;
  order: number;
  impact?: number | null;
  effort?: number | null;
  confidence?: number | null;
  priority?: number | null;
  strategicDetails?: TaskWithScores | null;
  title: string;
  category?: 'leverage' | 'neutral' | 'overhead' | null;
  isLocked: boolean;
  dependencyLinks: DependencyLink[];
  movement: MovementInfo | undefined;
  checked: boolean;
  isAiGenerated: boolean;
  isManual?: boolean;
  manualStatus?: ManualTaskBadgeStatus;
  manualStatusDetail?: string | null;
  isPrioritizing?: boolean;
  retryStatus?: RetryStatusEntry | null;
  isSelected: boolean;
  isHighlighted: boolean;
  onSelect: (taskId: string) => void;
  onToggleCompleted: (taskId: string, nextChecked: boolean) => void;
  onToggleLock: (taskId: string) => void;
  isEditingDisabled: boolean;
  onTaskTitleChange?: (taskId: string, nextTitle: string) => void;
  outcomeId?: string | null;
  onEditSuccess?: (taskId: string, options: { prioritizationTriggered: boolean }) => void;
  hasManualOverride?: boolean;
  manualOverride?: ManualOverrideState | null;
  baselineScore?: StrategicScore | null;
  onManualOverrideChange?: (override: ManualOverrideState | null) => void;
  inclusionReason?: string | null;
  reflectionEffects?: ReflectionEffect[];
  onEditManual?: () => void;
  onMarkManualDone?: () => void;
  onDeleteManual?: () => void;
};

function MobileFieldLabel({ children }: { children: string }) {
  return (
    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground lg:hidden">
      {children}
    </span>
  );
}

export function TaskRow({
  taskId,
  order,
  impact = null,
  effort = null,
  confidence = null,
  priority = null,
  strategicDetails = null,
  title,
  category,
  isLocked,
  dependencyLinks,
  movement,
  checked,
  isAiGenerated,
  isManual = false,
  manualStatus,
  manualStatusDetail = null,
  isPrioritizing = false,
  retryStatus = null,
  isSelected,
  isHighlighted,
  onSelect,
  onToggleCompleted,
  onToggleLock,
  isEditingDisabled,
  onTaskTitleChange,
  outcomeId,
  onEditSuccess,
  hasManualOverride = false,
  manualOverride = null,
  baselineScore = null,
  onManualOverrideChange,
  inclusionReason,
  reflectionEffects = [],
  onEditManual,
  onMarkManualDone,
  onDeleteManual,
}: TaskRowProps) {
  const categoryLabel = category
    ? category === 'leverage'
      ? 'Leverage'
      : category === 'neutral'
        ? 'Neutral'
        : 'Overhead'
    : null;
  const dependencyBadges = dependencyLinks.length ? (
    <div className="flex flex-wrap gap-1">
      {dependencyLinks.map(link => (
        <span
          key={`${taskId}-dep-${link.taskId}`}
          className="inline-flex items-center gap-1 rounded-full bg-bg-layer-2 px-2 py-1 text-xs text-muted-foreground"
        >
          <span className="font-semibold">{link.rank ? `#${link.rank}` : '—'}</span>
          <span className="text-muted-foreground/70">•</span>
          <span className="max-w-[160px] truncate">{link.label}</span>
        </span>
      ))}
    </div>
  ) : (
    <span className="text-sm text-muted-foreground">None</span>
  );
  const retryState = retryStatus?.status;
  const maxRetryAttempts = retryStatus?.max_attempts ?? 3;
  const retryAttempts = retryStatus?.attempts ?? 0;
  const isScoring = retryState === 'pending' || retryState === 'in_progress';
  const isRetryFailed = retryState === 'failed';
  const scoringAttemptNumber = isScoring
    ? Math.min(
        maxRetryAttempts,
        Math.max(
          1,
          retryState === 'pending' ? retryAttempts + 1 : retryAttempts === 0 ? 1 : retryAttempts
        )
      )
    : null;

  const [editState, setEditState] = useState<EditState>({
    mode: 'idle',
    draftText: title,
    originalText: title,
    errorMessage: null,
  });
  const [showSuccess, setShowSuccess] = useState(false);
  const [recentlyEdited, setRecentlyEdited] = useState(false);
  const [isScoreModalOpen, setIsScoreModalOpen] = useState(false);
  const [isManualOverrideOpen, setIsManualOverrideOpen] = useState(false);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const editorContentRef = useRef<string>(title);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editHighlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isEditLocked = isEditingDisabled || isPrioritizing || editState.mode === 'saving';

  const clearSaveTimer = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
  }, []);

  const clearSuccessTimer = useCallback(() => {
    if (successTimeoutRef.current) {
      clearTimeout(successTimeoutRef.current);
      successTimeoutRef.current = null;
    }
  }, []);

  const clearErrorTimer = useCallback(() => {
    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current);
      errorTimeoutRef.current = null;
    }
  }, []);

  const clearEditHighlightTimer = useCallback(() => {
    if (editHighlightTimeoutRef.current) {
      clearTimeout(editHighlightTimeoutRef.current);
      editHighlightTimeoutRef.current = null;
    }
  }, []);

  const focusEditor = useCallback(() => {
    requestAnimationFrame(() => {
      const node = editorRef.current;
      if (!node) {
        return;
      }
      node.focus();
      const selection = window.getSelection();
      if (!selection) {
        return;
      }
      const range = document.createRange();
      range.selectNodeContents(node);
      selection.removeAllRanges();
      selection.addRange(range);
    });
  }, []);

  const resetToOriginal = useCallback(() => {
    clearSaveTimer();
    clearErrorTimer();
    setEditState(prev => ({
      ...prev,
      mode: 'idle',
      draftText: prev.originalText,
      errorMessage: null,
    }));
  }, [clearSaveTimer, clearErrorTimer]);

  const performSave = useCallback(
    async (nextValue: string) => {
      try {
        const response = await fetch(`/api/tasks/${taskId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            task_text: nextValue,
            outcome_id: outcomeId ?? undefined,
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          const message = typeof payload?.error === 'string' ? payload.error : 'Failed to save task';
          throw new Error(message);
        }
        const updatedText =
          typeof payload?.task?.task_text === 'string' ? payload.task.task_text : nextValue;
        setEditState({
          mode: 'idle',
          draftText: updatedText,
          originalText: updatedText,
          errorMessage: null,
        });
        onTaskTitleChange?.(taskId, updatedText);
        onEditSuccess?.(taskId, {
          prioritizationTriggered: Boolean(payload?.prioritization_triggered),
        });
        setShowSuccess(true);
        setRecentlyEdited(true);
        clearSuccessTimer();
        successTimeoutRef.current = window.setTimeout(() => {
          setShowSuccess(false);
          successTimeoutRef.current = null;
        }, SUCCESS_INDICATOR_MS);
        clearEditHighlightTimer();
        editHighlightTimeoutRef.current = setTimeout(() => {
          setRecentlyEdited(false);
          editHighlightTimeoutRef.current = null;
        }, SUCCESS_INDICATOR_MS * 1.5);
      } catch (error) {
        console.error('[TaskRow] Failed to save task', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to save task';
        setEditState(prev => ({
          ...prev,
          mode: 'error',
          draftText: prev.originalText,
          errorMessage,
        }));
        setShowSuccess(false);
        
        // Auto-exit error mode after 3 seconds
        clearErrorTimer();
        errorTimeoutRef.current = window.setTimeout(() => {
          setEditState(prev => ({
            ...prev,
            mode: 'idle',
            errorMessage: null,
          }));
          errorTimeoutRef.current = null;
        }, 3000);
      }
    },
    [clearEditHighlightTimer, clearSuccessTimer, onEditSuccess, onTaskTitleChange, outcomeId, taskId]
  );

  const scheduleSave = useCallback(
    (nextValue: string) => {
      clearSaveTimer();
      saveTimeoutRef.current = setTimeout(() => {
        void performSave(nextValue);
      }, SAVE_DEBOUNCE_MS);
    },
    [clearSaveTimer, performSave]
  );

  const handleStartEditing = useCallback(
    (event?: React.MouseEvent) => {
      event?.stopPropagation();
      if (isEditLocked) {
        return;
      }
      clearSaveTimer();
      clearErrorTimer();
      setShowSuccess(false);
      const newOriginalText = editState.originalText;
      setEditState(prev => ({
        ...prev,
        mode: 'editing',
        draftText: prev.originalText,
        errorMessage: null,
      }));
      // Update editor content immediately to ensure it's populated
      setTimeout(() => {
        const node = editorRef.current;
        if (node && node.textContent !== newOriginalText) {
          node.textContent = newOriginalText;
          editorContentRef.current = newOriginalText;
        }
        focusEditor();
      }, 0);
    },
    [clearSaveTimer, clearErrorTimer, editState.originalText, focusEditor, isEditLocked]
  );

  const handleEditorInput = useCallback((event: React.FormEvent<HTMLDivElement>) => {
    event.stopPropagation();
    let value = event.currentTarget.textContent ?? '';
    if (value.length > MAX_TEXT_LENGTH) {
      value = value.slice(0, MAX_TEXT_LENGTH);
      event.currentTarget.textContent = value;
    }
    editorContentRef.current = value;
    setEditState(prev => ({
      ...prev,
      draftText: value,
      errorMessage: null,
    }));
  }, []);

  const commitChanges = useCallback(
    (rawValue: string) => {
      if (isEditLocked) {
        return;
      }
      const normalized = rawValue.replace(/\s+/g, ' ').trim();
      if (normalized.length < MIN_TEXT_LENGTH) {
        setEditState(prev => ({
          ...prev,
          mode: 'editing',
          errorMessage: `Task text must be at least ${MIN_TEXT_LENGTH} characters`,
        }));
        return;
      }
      if (normalized === editState.originalText) {
        clearErrorTimer(); // Clear error timer when returning to idle
        setEditState(prev => ({
          ...prev,
          mode: 'idle',
          draftText: prev.originalText,
          errorMessage: null,
        }));
        return;
      }
      clearErrorTimer(); // Clear error timer when entering saving mode
      setEditState(prev => ({
        ...prev,
        mode: 'saving',
        errorMessage: null,
      }));
      scheduleSave(normalized);
    },
    [editState.originalText, isEditLocked, scheduleSave, clearErrorTimer]
  );

  const handleEditorBlur = useCallback(
    (event: React.FocusEvent<HTMLDivElement>) => {
      if (editState.mode !== 'editing') {
        return;
      }
      commitChanges(event.currentTarget.textContent ?? editState.draftText);
    },
    [commitChanges, editState.draftText, editState.mode]
  );

  const handleEditorKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        event.currentTarget.blur();
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        resetToOriginal();
      }
    },
    [resetToOriginal]
  );

  useEffect(() => {
    return () => {
      clearSaveTimer();
      clearSuccessTimer();
      clearErrorTimer();
      clearEditHighlightTimer();
    };
  }, [clearEditHighlightTimer, clearSaveTimer, clearSuccessTimer, clearErrorTimer]);

  useEffect(() => {
    setEditState(prev => {
      if (prev.originalText === title) {
        return prev;
      }
      const isCurrentlyEditing = prev.mode === 'editing';
      return {
        ...prev,
        originalText: title,
        draftText: isCurrentlyEditing ? prev.draftText : title,
        mode: isCurrentlyEditing ? prev.mode : 'idle',
        errorMessage: isCurrentlyEditing ? prev.errorMessage : null,
      };
    });
    clearErrorTimer(); // Clear error timer when title changes
  }, [title, clearErrorTimer]);

  useEffect(() => {
    if (!isEditLocked) {
      return;
    }
    if (editState.mode === 'editing' || editState.mode === 'error') {
      resetToOriginal();
    }
  }, [editState.mode, isEditLocked, resetToOriginal]);

  useEffect(() => {
    const node = editorRef.current;
    if (!node) {
      return;
    }
    // Only update the content if it's different to avoid cursor jumping when user is typing
    if (editorContentRef.current !== editState.draftText) {
      node.textContent = editState.draftText;
      editorContentRef.current = editState.draftText;
    }
  }, [editState.draftText]);

  const statusIndicator = useMemo(() => {
    if (editState.mode === 'saving') {
      return (
        <Loader2
          className="h-4 w-4 animate-spin text-amber-600"
          aria-label="Saving task"
        />
      );
    }
    if (showSuccess) {
      return <Check className="h-4 w-4 text-emerald-600" aria-label="Task saved" />;
    }
    if (editState.mode === 'error') {
      return (
        <X
          className="h-4 w-4 text-destructive cursor-pointer"
          aria-label="Failed to save task"
          title={editState.errorMessage ?? 'Failed to save task'}
          onClick={() => {
            // Clear error mode when clicked
            setEditState(prev => ({
              ...prev,
              mode: 'idle',
              errorMessage: null,
            }));
            clearErrorTimer();
          }}
        />
      );
    }
    return null;
  }, [editState.mode, editState.errorMessage, showSuccess]);

  const quadrant = useMemo(() => {
    if (typeof impact === 'number' && typeof effort === 'number') {
      return getQuadrant(impact, effort);
    }
    return null;
  }, [impact, effort]);

  const strategicSummary = useMemo(() => {
    if (
      typeof impact !== 'number' ||
      typeof effort !== 'number' ||
      typeof confidence !== 'number' ||
      typeof priority !== 'number'
    ) {
      return null;
    }
    const formattedImpact = formatDecimal(impact, 1);
    const formattedEffort = `${formatDecimal(effort, 1)}h`;
    const formattedConfidence = confidence.toFixed(2);
    const formattedPriority = Math.round(priority).toString();
    return `Impact: ${formattedImpact} | Effort: ${formattedEffort} | Confidence: ${formattedConfidence} | Priority: ${formattedPriority}`;
  }, [impact, effort, confidence, priority]);

  const quadrantBadge = useMemo(() => {
    if (!quadrant) {
      return null;
    }
    const config = QUADRANT_CONFIGS[quadrant];
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide shadow-sm',
              QUADRANT_BADGE_STYLES[quadrant]
            )}
          >
            <span>{config.emoji}</span>
            <span>{config.label}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">{config.description}</p>
        </TooltipContent>
      </Tooltip>
    );
  }, [quadrant]);

  const modalTask: TaskWithScores | null =
    strategicDetails ??
    (impact !== null && effort !== null && confidence !== null && priority !== null
      ? {
          id: taskId,
          title,
          content: title,
          impact,
          effort,
          confidence,
          priority,
          hasManualOverride,
          quadrant: quadrant ?? 'high_impact_low_effort',
          confidenceBreakdown: null,
        }
      : null);

  return (
    <TooltipProvider delayDuration={200}>
    <div
      data-task-id={taskId}
      role="button"
      tabIndex={0}
      className={cn(
        'group/task grid w-full grid-cols-1 gap-3 rounded-lg border border-border/60 px-3 py-3 text-sm transition-colors',
        'lg:grid-cols-[48px_minmax(0,1fr)_120px_96px_48px] lg:items-center lg:gap-2 lg:rounded-none lg:border-0 lg:border-b lg:border-border/60 lg:px-3 lg:py-2 lg:last:border-b-0',
        isSelected && 'bg-primary/5',
        isHighlighted &&
          (isAiGenerated
            ? 'bg-emerald-100/60 dark:bg-emerald-500/10'
            : 'bg-amber-100/40 dark:bg-amber-500/10'),
        recentlyEdited && 'bg-amber-50/80 ring-amber-300/60 dark:bg-amber-500/10',
        isLocked && 'border-emerald-500/40 ring-1 ring-emerald-500/30',
        'hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
      )}
      onClick={() => onSelect(taskId)}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(taskId);
        }
      }}
    >
      <div className="flex items-center justify-between lg:block">
        <MobileFieldLabel>Rank</MobileFieldLabel>
        {isPrioritizing ? (
          <span className="inline-flex items-center gap-2 text-sm font-medium text-amber-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            Prioritizing…
          </span>
        ) : (
          <span className="text-sm font-medium text-muted-foreground">{order}</span>
        )}
      </div>

      <div className="flex flex-col gap-1 text-left">
        <MobileFieldLabel>Task</MobileFieldLabel>
        <div className="flex flex-col gap-1">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:gap-3">
            <button
              type="button"
              onClick={event => {
                event.stopPropagation();
                onToggleLock(taskId);
              }}
              className={cn(
                'inline-flex h-6 w-6 items-center justify-center rounded-full border',
                isLocked
                  ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700'
                  : 'border-border/70 text-muted-foreground hover:bg-muted/40'
              )}
              aria-label={isLocked ? 'Unlock task' : 'Lock task in place'}
            >
              {isLocked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
            </button>
            <div className="flex flex-1 flex-col gap-1">
              <div
                className="flex flex-col gap-2"
                onClick={event => {
                  event.stopPropagation();
                }}
              >
                {editState.mode === 'editing' || editState.mode === 'saving' ? (
                  <div
                    className={cn(
                      'flex min-h-[40px] w-full items-center rounded-md border border-border bg-background px-2 py-1',
                      isEditLocked && 'pointer-events-none opacity-75'
                    )}
                  >
                    <div
                      ref={editorRef}
                      role="textbox"
                      aria-label="Edit task"
                      aria-disabled={isEditLocked}
                      contentEditable={!isEditLocked}
                      suppressContentEditableWarning
                      className={cn(
                        'min-h-[24px] w-full text-sm font-medium text-foreground focus-visible:outline-none',
                        isEditLocked && 'cursor-not-allowed text-muted-foreground'
                      )}
                      onInput={handleEditorInput}
                      onBlur={handleEditorBlur}
                      onKeyDown={handleEditorKeyDown}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    className="flex w-full cursor-text items-start text-left focus-visible:outline-none"
                    onClick={event => {
                      handleStartEditing(event);
                    }}
                  >
                    <span className="w-full truncate text-sm font-medium text-foreground">
                      {editState.originalText}
                    </span>
                  </button>
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleStartEditing}
                    disabled={isEditLocked}
                    className={cn(
                      'inline-flex h-6 w-6 items-center justify-center rounded-full border border-border/70 text-muted-foreground transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      isEditLocked && 'cursor-not-allowed opacity-50',
                      'lg:opacity-0 lg:group-hover/task:opacity-100'
                    )}
                    aria-label="Edit task"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  {statusIndicator && <span className="inline-flex items-center">{statusIndicator}</span>}
                </div>
              </div>
              {isEditingDisabled && (
                <span className="text-xs text-muted-foreground">
                  Editing disabled during prioritization
                </span>
              )}
              {editState.mode === 'error' && editState.errorMessage && (
                <span className="text-xs text-destructive">{editState.errorMessage}</span>
              )}
                    {strategicSummary && (
                <div className="flex flex-col gap-1">
                  <MobileFieldLabel>Strategic Scores</MobileFieldLabel>
                  <div
                    className="flex flex-wrap items-center gap-2 rounded-md bg-bg-layer-2/80 px-3 py-2 text-xs text-muted-foreground shadow-sm"
                    onClick={event => event.stopPropagation()}
                    onKeyDown={event => event.stopPropagation()}
                  >
                    {quadrantBadge}
                    <span className="font-medium text-foreground">{strategicSummary}</span>
                    {modalTask && (
                      <button
                        type="button"
                        className="text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => setIsScoreModalOpen(true)}
                      >
                        Why this score?
                      </button>
                    )}
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground underline-offset-2 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={event => {
                        event.stopPropagation();
                        setIsManualOverrideOpen(true);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit scores
                    </button>
                  </div>
                  {strategicDetails?.reflection_influence && (
                    <div 
                      className="mt-1 flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400"
                      role="status"
                      aria-label={`Reflection influence: ${strategicDetails.reflection_influence}`}
                    >
                      <Lightbulb className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                      <span className="font-medium">
                        Reflection: {strategicDetails.reflection_influence}
                      </span>
                    </div>
                  )}
                  {reflectionEffects.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2" aria-label="Reflection effects">
                      {reflectionEffects
                        .filter(effect => effect.effect !== 'unchanged')
                        .map(effect => (
                          <ReflectionAttributionBadge
                            key={`${taskId}-${effect.reflection_id}-${effect.effect}`}
                            effect={effect.effect === 'blocked' ? 'blocked' : effect.effect === 'demoted' ? 'demoted' : 'boosted'}
                            reason={effect.reason}
                            reflectionId={effect.reflection_id}
                          />
                        ))}
                    </div>
                  )}
                  {inclusionReason && (
                    <div className="mt-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge 
                            variant="outline" 
                            className="inline-flex items-center gap-1 border-emerald-500/30 bg-emerald-500/5 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400 cursor-help"
                          >
                            <Check className="h-3 w-3" />
                            <span className="max-w-[200px] truncate">{inclusionReason}</span>
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{inclusionReason}</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {category && categoryLabel && (
                <Badge
                  variant="outline"
                  className={cn(
                    'shrink-0 text-[11px] font-semibold uppercase tracking-wide',
                    category === 'leverage' &&
                      'border-emerald-500/50 bg-emerald-500/10 text-emerald-700',
                    category === 'neutral' && 'border-sky-500/50 bg-sky-500/10 text-sky-700',
                    category === 'overhead' && 'border-amber-500/50 bg-amber-500/10 text-amber-700'
                  )}
                >
                  {categoryLabel}
                </Badge>
              )}
              {isManual && (
                <ManualTaskBadge
                  status={manualStatus ?? (isPrioritizing ? 'analyzing' : 'manual')}
                  detail={manualStatusDetail ?? undefined}
                />
              )}
              {isManual && onEditManual && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs font-semibold"
                  onClick={onEditManual}
                >
                  Edit
                </Button>
              )}
              {isManual && onMarkManualDone && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs font-semibold text-emerald-700"
                  onClick={onMarkManualDone}
                >
                  Mark done
                </Button>
              )}
              {isManual && onDeleteManual && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs font-semibold text-destructive"
                  onClick={onDeleteManual}
                >
                  Delete
                </Button>
              )}
              {hasManualOverride && (
                <Badge className="shrink-0 bg-emerald-500/10 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-100">
                  Manual override
                </Badge>
              )}
              {isScoring && (
                <Badge className="shrink-0 bg-amber-500/10 text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:bg-amber-500/20 dark:text-amber-100">
                  Scoring…
                  {typeof scoringAttemptNumber === 'number' && maxRetryAttempts > 0 && (
                    <span className="ml-1 normal-case">
                      (Attempt {scoringAttemptNumber}/{maxRetryAttempts})
                    </span>
                  )}
                </Badge>
              )}
              {isRetryFailed && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge className="shrink-0 border-destructive/40 bg-destructive/10 text-[11px] font-semibold uppercase tracking-wide text-destructive" variant="outline">
                      Scores unavailable
                    </Badge>
                  </TooltipTrigger>
                  {retryStatus?.last_error && (
                    <TooltipContent>
                      <p>{retryStatus.last_error}</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              )}
              {isPrioritizing && (
                <Badge className="shrink-0 bg-amber-500/10 text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:bg-amber-500/20 dark:text-amber-100">
                  Prioritizing…
                </Badge>
              )}
              {isAiGenerated && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="outline"
                      className="shrink-0 border-blue-500/20 bg-blue-500/20 rounded-md px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300 cursor-help"
                    >
                      AI
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>This task was extracted from a document</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <MobileFieldLabel>Depends</MobileFieldLabel>
        {dependencyBadges}
      </div>

      <div className="flex items-center justify-between lg:flex-col lg:items-end lg:gap-1">
        <MobileFieldLabel>Movement</MobileFieldLabel>
        <span className="flex justify-end text-xs text-muted-foreground">
          <MovementBadge movement={movement} />
        </span>
      </div>

      <div
        className="flex items-center justify-between lg:justify-end"
        onClick={event => {
          event.stopPropagation();
        }}
        onKeyDown={event => {
          event.stopPropagation();
        }}
      >
        <MobileFieldLabel>Done</MobileFieldLabel>
        <Checkbox
          id={`task-complete-${taskId}`}
          checked={checked}
          onCheckedChange={value => onToggleCompleted(taskId, value === true)}
          aria-label="Mark as done"
        />
      </div>
    </div>
    <ScoreBreakdownModal task={modalTask} open={isScoreModalOpen} onOpenChange={setIsScoreModalOpen} />
    <Dialog open={isManualOverrideOpen} onOpenChange={setIsManualOverrideOpen}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit impact & effort</DialogTitle>
          <DialogDescription>Adjust the AI estimates to reflect your latest understanding.</DialogDescription>
        </DialogHeader>
        <ManualOverrideControls
          taskId={taskId}
          open={isManualOverrideOpen}
          manualOverride={manualOverride}
          aiScore={baselineScore}
          onManualOverrideChange={onManualOverrideChange}
        />
      </DialogContent>
    </Dialog>
  </TooltipProvider>
);
}

function formatDecimal(value: number, digits: number) {
  const rounded = value.toFixed(digits);
  return rounded.endsWith('.0') ? rounded.replace(/\.0$/, '') : rounded;
}

const QUADRANT_BADGE_STYLES: Record<Quadrant, string> = {
  high_impact_low_effort: 'bg-emerald-500/15 text-emerald-700 ring-1 ring-inset ring-emerald-500/30',
  high_impact_high_effort: 'bg-sky-500/15 text-sky-700 ring-1 ring-inset ring-sky-500/30',
  low_impact_low_effort: 'bg-amber-500/20 text-amber-700 ring-1 ring-inset ring-amber-500/30',
  low_impact_high_effort: 'bg-rose-500/15 text-rose-700 ring-1 ring-inset ring-rose-500/30',
};
