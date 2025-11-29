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
        successTimeoutRef.current = setTimeout(() => {
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
        errorTimeoutRef.current = setTimeout(() => {
          setEditState(prev => ({
            ...prev,
            mode: 'idle',
            errorMessage: null,
          }));
          errorTimeoutRef.current = null;
        }, 3000);
      }
    },
    [clearEditHighlightTimer, clearSuccessTimer, clearErrorTimer, onEditSuccess, onTaskTitleChange, outcomeId, taskId]
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
  }, [editState.mode, editState.errorMessage, showSuccess, clearErrorTimer]);

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
          // Mobile-first: Compact card layout
          'group/task flex flex-col w-full gap-3 rounded-lg p-4 text-sm transition-all',
          'shadow-2layer-sm tap-highlight-light dark:tap-highlight-dark',
          'border border-border/40',
          // Desktop: Even more compact
          'lg:gap-2.5 lg:p-3',
          // States
          isSelected && 'bg-primary/5 ring-2 ring-primary/20',
          isHighlighted &&
          (isAiGenerated
            ? 'bg-emerald-100/60 dark:bg-emerald-500/10'
            : 'bg-amber-100/40 dark:bg-amber-500/10'),
          recentlyEdited && 'bg-amber-50/80 ring-2 ring-amber-300/60 dark:bg-amber-500/10',
          isLocked && 'border-emerald-500/40 ring-1 ring-emerald-500/30',
          'hover:bg-muted/40 hover:shadow-2layer-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
        )}
        onClick={() => onSelect(taskId)}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onSelect(taskId);
          }
        }}
      >
        {/* Task Title with Integrated Rank */}
        <div className="flex items-start gap-3">
          <div
            className="flex-1 min-w-0"
            onClick={event => {
              event.stopPropagation();
            }}
          >
            {editState.mode === 'editing' || editState.mode === 'saving' ? (
              <div
                className={cn(
                  'flex min-h-[48px] w-full items-center rounded-md border-2 border-border bg-background px-3 py-2 lg:min-h-[44px]',
                  isEditLocked && 'pointer-events-none opacity-75'
                )}
              >
                <span className="mr-2 shrink-0 text-sm font-bold text-muted-foreground lg:text-xs">
                  {isPrioritizing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    `#${order}`
                  )}
                </span>
                <div
                  ref={editorRef}
                  role="textbox"
                  aria-label="Edit task"
                  aria-disabled={isEditLocked}
                  contentEditable={!isEditLocked}
                  suppressContentEditableWarning
                  className={cn(
                    'min-h-[24px] w-full text-[15px] font-semibold text-foreground leading-relaxed focus-visible:outline-none lg:text-sm',
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
                className="flex w-full items-start gap-2 cursor-text text-left focus-visible:outline-none"
                onClick={event => {
                  handleStartEditing(event);
                }}
              >
                <span className="shrink-0 mt-0.5 text-sm font-bold text-muted-foreground lg:text-xs">
                  {isPrioritizing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    `#${order}`
                  )}
                </span>
                <span className="flex-1 break-words whitespace-normal text-[15px] font-semibold text-foreground leading-relaxed lg:text-sm">
                  {editState.originalText}
                </span>
              </button>
            )}

            {/* Editing feedback */}
            {isEditingDisabled && (
              <span className="mt-1 block text-xs text-muted-foreground">
                Editing disabled during prioritization
              </span>
            )}
            {editState.mode === 'error' && editState.errorMessage && (
              <span className="mt-1 block text-xs text-destructive">{editState.errorMessage}</span>
            )}
          </div>

          {/* Action buttons - Edit and Status */}
          <div className="flex-shrink-0 flex items-center gap-2">
            {statusIndicator && <span className="inline-flex items-center">{statusIndicator}</span>}
            <button
              type="button"
              onClick={handleStartEditing}
              disabled={isEditLocked}
              className={cn(
                'inline-flex h-11 w-11 items-center justify-center rounded-full border-2 border-border/70 text-muted-foreground transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                'hover:bg-muted/50 hover:border-border active:scale-95',
                isEditLocked && 'cursor-not-allowed opacity-50',
                'lg:h-9 lg:w-9 lg:opacity-0 lg:group-hover/task:opacity-100'
              )}
              aria-label="Edit task"
            >
              <Pencil className="h-5 w-5 lg:h-4 lg:w-4" />
            </button>
          </div>
        </div>

        {/* Badges Row */}
        {(category || isManual || hasManualOverride || isScoring || isRetryFailed || isPrioritizing || isAiGenerated || isLocked) && (
          <div className="flex flex-wrap items-center gap-2">
            {category && categoryLabel && (
              <Badge
                variant="outline"
                className={cn(
                  'shrink-0 text-[10px] font-semibold uppercase tracking-wide',
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
            {hasManualOverride && (
              <Badge className="shrink-0 bg-emerald-500/10 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-100">
                Manual override
              </Badge>
            )}
            {isScoring && (
              <Badge className="shrink-0 bg-amber-500/10 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:bg-amber-500/20 dark:text-amber-100">
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
                  <Badge className="shrink-0 border-destructive/40 bg-destructive/10 text-[10px] font-semibold uppercase tracking-wide text-destructive" variant="outline">
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
              <Badge className="shrink-0 bg-amber-500/10 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:bg-amber-500/20 dark:text-amber-100">
                Prioritizing…
              </Badge>
            )}
            {isAiGenerated && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="outline"
                    className="shrink-0 border-blue-500/20 bg-blue-500/20 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-300 cursor-help"
                  >
                    AI
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>This task was extracted from a document</p>
                </TooltipContent>
              </Tooltip>
            )}
            {isLocked && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={event => {
                      event.stopPropagation();
                      onToggleLock(taskId);
                    }}
                    className={cn(
                      'inline-flex h-11 w-11 items-center justify-center rounded-full border-2 transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:h-9 lg:w-9',
                      'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20'
                    )}
                    aria-label="Unlock task"
                  >
                    <Lock className="h-5 w-5 lg:h-4 lg:w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Task is locked in place. Click to unlock.</p>
                </TooltipContent>
              </Tooltip>
            )}
            {!isLocked && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={event => {
                      event.stopPropagation();
                      onToggleLock(taskId);
                    }}
                    className={cn(
                      'inline-flex h-11 w-11 items-center justify-center rounded-full border-2 border-border/70 text-muted-foreground transition hover:bg-muted/40 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:h-9 lg:w-9 lg:opacity-0 lg:group-hover/task:opacity-100'
                    )}
                    aria-label="Lock task in place"
                  >
                    <Unlock className="h-5 w-5 lg:h-4 lg:w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Lock task in place to prevent reordering</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        )}

        {/* Manual Task Actions */}
        {isManual && (onEditManual || onMarkManualDone || onDeleteManual) && (
          <div className="flex flex-wrap items-center gap-2">
            {onEditManual && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 px-3 text-xs font-semibold"
                onClick={onEditManual}
              >
                Edit
              </Button>
            )}
            {onMarkManualDone && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 px-3 text-xs font-semibold text-emerald-700"
                onClick={onMarkManualDone}
              >
                Mark done
              </Button>
            )}
            {onDeleteManual && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 px-3 text-xs font-semibold text-destructive"
                onClick={onDeleteManual}
              >
                Delete
              </Button>
            )}
          </div>
        )}

        {/* Strategic Scores */}
        {strategicSummary && (
          <div className="flex flex-col gap-2">
            <div
              className="flex flex-wrap items-center gap-2 rounded-md bg-bg-layer-2/60 px-3 py-2 text-xs"
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
                  Details
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
                <Pencil className="h-3 w-3" />
                Edit
              </button>
            </div>

            {strategicDetails?.reflection_influence && (
              <div
                className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400"
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
              <div className="flex flex-wrap gap-2" aria-label="Reflection effects">
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
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="outline"
                    className="inline-flex items-center gap-1 border-emerald-500/30 bg-emerald-500/5 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400 cursor-help self-start"
                  >
                    <Check className="h-3 w-3" />
                    <span className="max-w-[200px] truncate">{inclusionReason}</span>
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{inclusionReason}</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        )}

        {/* Dependencies (only show if exists) */}
        {dependencyLinks.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Depends on:</span>
            {dependencyLinks.map(link => (
              <span
                key={`${taskId}-dep-${link.taskId}`}
                className="inline-flex items-center gap-1 rounded-full bg-bg-layer-2 px-2 py-0.5 text-xs text-muted-foreground"
              >
                <span className="font-semibold">{link.rank ? `#${link.rank}` : '—'}</span>
                <span className="max-w-[120px] truncate lg:max-w-[160px]">{link.label}</span>
              </span>
            ))}
          </div>
        )}

        {/* Bottom Row: Movement and Checkbox */}
        <div className="flex items-center justify-between gap-3 pt-1 border-t border-border/30">
          {/* Movement (only show if exists) */}
          {movement && (
            <div className="flex items-center gap-1.5">
              <MovementBadge movement={movement} />
            </div>
          )}

          {/* Spacer */}
          {!movement && <div />}

          {/* Checkbox with larger touch target */}
          <div
            className="inline-flex h-12 w-12 items-center justify-center rounded-lg lg:h-10 lg:w-10"
            onClick={event => {
              event.stopPropagation();
            }}
          >
            <Checkbox
              id={`task-complete-${taskId}`}
              checked={checked}
              onCheckedChange={value => onToggleCompleted(taskId, value === true)}
              className="h-6 w-6 transition-transform hover:scale-110 active:scale-95"
              aria-label={checked ? 'Mark as not done' : 'Mark as done'}
            />
          </div>
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
