'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Loader2, Lock, Pencil, Unlock, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { MovementBadge, type MovementInfo } from '@/app/priorities/components/MovementBadge';

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
  title: string;
  category?: 'leverage' | 'neutral' | 'overhead' | null;
  isLocked: boolean;
  dependencyLinks: DependencyLink[];
  movement: MovementInfo | undefined;
  checked: boolean;
  isAiGenerated: boolean;
  isManual?: boolean;
  isPrioritizing?: boolean;
  isSelected: boolean;
  isHighlighted: boolean;
  onSelect: (taskId: string) => void;
  onToggleCompleted: (taskId: string, nextChecked: boolean) => void;
  onToggleLock: (taskId: string) => void;
  isEditingDisabled: boolean;
  onTaskTitleChange?: (taskId: string, nextTitle: string) => void;
  outcomeId?: string | null;
  onEditSuccess?: (taskId: string, options: { prioritizationTriggered: boolean }) => void;
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
  title,
  category,
  isLocked,
  dependencyLinks,
  movement,
  checked,
  isAiGenerated,
  isManual = false,
  isPrioritizing = false,
  isSelected,
  isHighlighted,
  onSelect,
  onToggleCompleted,
  onToggleLock,
  isEditingDisabled,
  onTaskTitleChange,
  outcomeId,
  onEditSuccess,
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

  const [editState, setEditState] = useState<EditState>({
    mode: 'idle',
    draftText: title,
    originalText: title,
    errorMessage: null,
  });
  const [showSuccess, setShowSuccess] = useState(false);
  const [recentlyEdited, setRecentlyEdited] = useState(false);
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
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="outline"
                      className="shrink-0 border-purple-500/20 bg-purple-500/20 rounded-md px-2 py-0.5 text-xs font-medium text-purple-700 dark:text-purple-300 cursor-help"
                    >
                      MANUAL
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>This task was manually added by you</p>
                  </TooltipContent>
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
    </TooltipProvider>
  );
}
