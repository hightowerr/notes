'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Lock, Unlock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { MovementBadge, type MovementInfo } from '@/app/priorities/components/MovementBadge';
import { ManualTaskBadge, type ManualTaskBadgeStatus } from '@/app/priorities/components/ManualTaskBadge';
import { ScoreBreakdownModal } from '@/app/priorities/components/ScoreBreakdownModal';
import { QuadrantViz, type QuadrantVizTask } from '@/app/priorities/components/QuadrantViz';
import { ManualOverrideControls } from '@/app/priorities/components/ManualOverrideControls';
import { QUADRANT_CONFIGS, getQuadrant, type Quadrant } from '@/lib/schemas/quadrant';
import type { TaskWithScores, StrategicScore } from '@/lib/schemas/strategicScore';
import type { ManualOverrideState } from '@/lib/schemas/manualOverride';
import type { TaskDependency } from '@/lib/types/agent';
import { cn } from '@/lib/utils';

type StrategicScoreData = {
  impact: number;
  effort: number;
  confidence: number;
  priority: number;
} | null;

type TaskStatus = 'active' | 'completed' | 'discarded';

const ACRONYM_HINTS: Record<string, string> = {
  PDP: 'Product Detail Page',
};

type ClaritySuggestion = {
  rephrased: string;
  reason: string;
};

function buildClaritySuggestion(taskText: string | null | undefined): ClaritySuggestion | null {
  const base = (taskText ?? '').trim();
  if (!base) {
    return null;
  }

  const acronyms = Array.from(new Set(base.match(/\b[A-Z]{2,}\b/g) ?? []));
  const expansions: string[] = [];
  let rephrased = base;

  acronyms.forEach(acronym => {
    const expansion = ACRONYM_HINTS[acronym];
    if (!expansion) {
      return;
    }
    expansions.push(`${acronym} = ${expansion}`);
    rephrased = rephrased.replace(new RegExp(`\\b${acronym}\\b`, 'g'), `${expansion} (${acronym})`);

    if (acronym === 'PDP' && /availability/i.test(base)) {
      rephrased = rephrased.replace(
        /PDP[^ ]* parts?/i,
        'Product Detail Page (PDP) availability signals like stock badges, variant selectors, and add-to-cart gating'
      );
    }
  });

  if (expansions.length === 0 || rephrased === base) {
    return null;
  }

  return {
    rephrased,
    reason: `Expanded ${expansions.join(', ')} for clarity.`,
  };
}

type TaskSummary = {
  id: string;
  title: string;
  documentId?: string | null;
  rank: number | null;
  confidence: number | null;
  confidenceDelta?: number | null;
  movement: MovementInfo | null;
  dependencies: TaskDependency[];
  dependents: TaskDependency[];
  dependencyLinks: Array<{ taskId: string; rank: number | null; label: string }>;
  dependentLinks: Array<{ taskId: string; rank: number | null; label: string }>;
  reasoning?: string | null;
  dependencyNotes?: string | null;
  manualOverride?: boolean;
  state?: 'active' | 'completed' | 'discarded' | 'manual_override' | 'reintroduced';
  lnoCategory?: 'leverage' | 'neutral' | 'overhead' | null;
  outcomeRationale?: string | null;
  sourceText?: string | null;
  sourceDocumentTitle?: string | null;
  isManual?: boolean;
  manualStatus?: ManualTaskBadgeStatus;
  manualStatusDetail?: string | null;
};

type TaskDetailsDrawerProps = {
  open: boolean;
  onClose: () => void;
  task: TaskSummary | null;
  strategicScore?: StrategicScoreData;
  status: TaskStatus;
  removalReason?: string;
  onMarkDone: () => void;
  onMarkActive: () => void;
  onReturnToActive: () => void;
  onNavigateToTask: (taskId: string) => void;
  getTaskTitle: (taskId: string) => string;
  outcomeStatement?: string | null;
  isLocked?: boolean;
  onRemoveDependency?: (taskId: string, dependencyId: string) => void;
  onAddDependency?: (
    taskId: string,
    dependencyId: string,
    relationship: TaskDependency['relationship_type']
  ) => void;
  taskOptions?: Array<{ id: string; title: string }>;
};

export function TaskDetailsDrawer({
  open,
  onClose,
  task,
  strategicScore,
  status,
  removalReason,
  onMarkDone,
  onMarkActive,
  onReturnToActive,
  onNavigateToTask,
  getTaskTitle,
  outcomeStatement,
  isLocked = false,
  onRemoveDependency,
  onAddDependency,
  taskOptions = [],
}: TaskDetailsDrawerProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const confidenceLabel = useMemo(() => {
    if (!task || typeof task.confidence !== 'number') {
      return null;
    }

    const percent = Math.round(task.confidence * 100);
    return `${percent}%`;
  }, [task]);

  const confidenceDeltaLabel = useMemo(() => {
    if (!task || typeof task.confidenceDelta !== 'number' || task.confidenceDelta === 0) {
      return null;
    }

    const percent = Math.round(task.confidenceDelta * 100);
    if (percent === 0) {
      return null;
    }
    return `${percent > 0 ? '+' : ''}${percent}%`;
  }, [task]);

  const manualOverride = Boolean(task?.manualOverride);
  const categoryLabel = useMemo(() => {
    if (!task?.lnoCategory) {
      return null;
    }
    if (task.lnoCategory === 'leverage') {
      return 'Leverage task';
    }
    if (task.lnoCategory === 'neutral') {
      return 'Neutral task';
    }
    if (task.lnoCategory === 'overhead') {
      return 'Overhead task';
    }
    return null;
  }, [task]);

  const alignmentCopy = useMemo(() => {
    if (!task) {
      return null;
    }
    const goalLabel = outcomeStatement ? `“${outcomeStatement}”` : 'your stated outcome';
    if (task.lnoCategory && task.sourceText) {
      switch (task.lnoCategory) {
        case 'leverage':
          return `High-leverage work on ${task.sourceText} keeps pressure on ${goalLabel}.`;
        case 'neutral':
          return `Operational guardrail: ${task.sourceText} protects ${goalLabel}.`;
        case 'overhead':
          return `Removes overhead by tackling ${task.sourceText}, freeing focus for ${goalLabel}.`;
        default:
          break;
      }
    }
    return task.outcomeRationale ?? null;
  }, [task, outcomeStatement]);

  const claritySuggestion = useMemo(
    () => buildClaritySuggestion(task?.sourceText ?? task?.title ?? null),
    [task?.sourceText, task?.title]
  );

  const [isEditingDependencies, setIsEditingDependencies] = useState(false);
  const [newDependencyId, setNewDependencyId] = useState('');
  const [newRelationship, setNewRelationship] =
    useState<TaskDependency['relationship_type']>('prerequisite');
  const [isScoreModalOpen, setIsScoreModalOpen] = useState(false);
  const [isManualOverrideOpen, setIsManualOverrideOpen] = useState(false);

  useEffect(() => {
    setIsEditingDependencies(false);
    setNewDependencyId('');
    setIsScoreModalOpen(false);
    setIsManualOverrideOpen(false);
  }, [task?.id, open]);

  const availableDependencyOptions = useMemo(() => {
    if (!task) {
      return [];
    }
    const existing = new Set(task.dependencies.map(dependency => dependency.source_task_id));
    return taskOptions.filter(option => option.id !== task.id && !existing.has(option.id));
  }, [task, taskOptions]);

  if (!isMounted || !open) {
    return null;
  }

  const isActive = status === 'active';
  const isCompleted = status === 'completed';
  const isDiscarded = status === 'discarded';

  const statusBadge = (() => {
    if (isCompleted) {
      return 'bg-muted text-muted-foreground';
    }
    if (isDiscarded) {
      return 'bg-amber-500/10 text-amber-600';
    }
    return 'bg-primary/10 text-primary';
  })();

  return createPortal(
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <aside
        className="relative ml-auto flex h-full w-full max-w-xl flex-col gap-6 bg-background px-6 py-8 shadow-2layer-md sm:max-w-md"
        role="dialog"
        aria-modal="true"
        aria-label={task ? `Details for ${task.title}` : 'Task details'}
      >
        <header className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            {task ? (
              <>
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  {typeof task.rank === 'number' && task.rank !== null && (
                    <Badge variant="secondary">#{task.rank}</Badge>
                  )}
                  {task.movement && <MovementBadge movement={task.movement} />}
                  {confidenceLabel && (
                    <Badge variant="outline" className="bg-muted/60">
                      Confidence {confidenceLabel}
                    </Badge>
                  )}
                  {confidenceDeltaLabel && (
                    <Badge
                      variant="outline"
                      className={cn(
                        'bg-muted/60',
                        task.confidenceDelta && task.confidenceDelta < 0
                          ? 'border-amber-400 text-amber-700'
                          : 'border-emerald-400 text-emerald-700'
                      )}
                    >
                      Δ {confidenceDeltaLabel}
                    </Badge>
                  )}
                  {manualOverride && (
                    <Badge variant="outline" className="bg-slate-600/10 text-slate-700">
                      Manual override
                    </Badge>
                  )}
                  {task?.isManual && task.manualStatus && (
                    <ManualTaskBadge 
                      status={task.manualStatus} 
                      detail={task.manualStatusDetail || undefined}
                    />
                  )}
                  {isLocked && (
                    <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700">
                      Locked
                    </Badge>
                  )}
                  {categoryLabel && (
                    <Badge variant="outline" className="bg-muted/60">
                      {categoryLabel}
                    </Badge>
                  )}
                  <Badge variant="outline" className={cn(statusBadge)}>
                    {isCompleted ? 'Completed' : isDiscarded ? 'Discarded' : 'To do'}
                  </Badge>
                </div>
                <h2 className="text-xl font-semibold text-foreground">{task.title}</h2>
              </>
            ) : (
              <h2 className="text-lg font-semibold text-foreground">Task details</h2>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </header>

        {task ? (
          <div className="flex flex-1 flex-col gap-6 overflow-y-auto pr-3">
            {isDiscarded && removalReason && (
              <div className="rounded-md border border-dashed border-border/60 bg-background/60 px-3 py-2 text-xs text-muted-foreground">
                {removalReason}
              </div>
            )}

            {task.reasoning && (
              <section className="space-y-2 text-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Agent rationale
                </p>
                <p className="rounded-md border border-border/60 bg-muted/10 px-3 py-2 text-sm text-foreground">
                  {task.reasoning}
                </p>
              </section>
            )}

            {(alignmentCopy || task?.sourceText || task?.sourceDocumentTitle) && (
              <section className="space-y-2 text-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Outcome alignment
                </p>
                <div className="rounded-md border border-border/60 bg-primary/5 px-3 py-2 space-y-1">
                  {task.sourceText && (
                    <p className="text-sm font-medium text-foreground">“{task.sourceText}”</p>
                  )}
                  {(task.sourceDocumentTitle || task.documentId) && (
                    <p className="text-xs text-muted-foreground">
                      Source:{' '}
                      <span className="font-medium text-foreground">
                        {task.sourceDocumentTitle ?? 'Document'}
                      </span>
                      {task.documentId && (
                        <>
                          {' '}
                          ·{' '}
                          <a
                            href={`/dashboard?documentId=${task.documentId}`}
                            className="font-medium text-primary hover:underline"
                          >
                            View document
                          </a>
                        </>
                      )}
                    </p>
                  )}
                  {alignmentCopy && (
                    <p className="text-sm text-muted-foreground">{alignmentCopy}</p>
                  )}
                  {outcomeStatement && (
                    <p className="text-xs text-muted-foreground">Goal: “{outcomeStatement}”</p>
                  )}
                </div>
              </section>
            )}

            {claritySuggestion && (
              <section className="space-y-2 text-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Clarity check
                </p>
                <div className="rounded-md border border-amber-200 bg-amber-50/70 px-3 py-2 space-y-1">
                  <p className="text-sm font-medium text-foreground">{claritySuggestion.rephrased}</p>
                  <p className="text-xs text-amber-700">{claritySuggestion.reason}</p>
                </div>
              </section>
            )}

            {task.dependencyNotes && (
              <section className="space-y-2 text-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Dependency notes
                </p>
                <p className="rounded-md border border-border/60 bg-muted/10 px-3 py-2 text-sm text-foreground">
                  {task.dependencyNotes}
                </p>
              </section>
            )}

            {typeof task.confidenceDelta === 'number' && task.confidenceDelta <= -0.1 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                Confidence dropped by {Math.abs(Math.round(task.confidenceDelta * 100))}% since the previous run.
                Review supporting evidence or reintroduce context before prioritising.
              </div>
            )}

            {manualOverride && (
              <div className="rounded-md border border-slate-400 bg-slate-100 px-3 py-2 text-xs text-slate-700">
                This task stays active because it was manually restored. The agent will keep it unless you remove the override.
              </div>
            )}

            <section className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Depends on
                </p>
                {onAddDependency && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => setIsEditingDependencies(value => !value)}
                  >
                    {isEditingDependencies ? 'Done' : 'Edit'}
                  </Button>
                )}
              </div>
              {task.dependencies.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {isEditingDependencies
                    ? 'No prerequisites yet. Add one below.'
                    : 'No upstream dependencies.'}
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {task.dependencies.map(dependency => {
                    const sourceTitle = getTaskTitle(dependency.source_task_id);
                    const rank = task.dependencyLinks.find(link => link.taskId === dependency.source_task_id)?.rank;
                    return (
                      <div
                        key={`${task.id}-drawer-dep-${dependency.source_task_id}`}
                        className="rounded-md border border-transparent px-3 py-2 transition-colors hover:border-border/60 hover:bg-muted/40"
                      >
                        <button
                          type="button"
                          onClick={() => onNavigateToTask(dependency.source_task_id)}
                          className="flex w-full flex-col items-start text-left text-sm"
                        >
                          <span className="font-medium text-foreground">
                            #{rank ?? '?'} • {sourceTitle}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Relationship: {dependency.relationship_type} • via{' '}
                            {dependency.detection_method === 'ai_inference' ? 'AI inference' : 'stored graph'}
                          </span>
                        </button>
                        {isEditingDependencies && onRemoveDependency && (
                          <div className="mt-2 flex justify-end">
                            <Button
                              type="button"
                              variant="outline"
                              size="xs"
                              onClick={() => onRemoveDependency(task.id, dependency.source_task_id)}
                            >
                              Remove
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {isEditingDependencies && onAddDependency && (
                <div className="space-y-2 rounded-md border border-dashed border-border/60 p-3">
                  {availableDependencyOptions.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      All tasks are already linked as dependencies.
                    </p>
                  ) : (
                    <form
                      className="flex flex-col gap-2"
                      onSubmit={event => {
                        event.preventDefault();
                        if (!newDependencyId) {
                          return;
                        }
                        onAddDependency(task.id, newDependencyId, newRelationship);
                        setNewDependencyId('');
                      }}
                    >
                      <label className="text-xs font-medium text-muted-foreground">
                        Add dependency
                        <select
                          className="mt-1 w-full rounded-md border border-border/60 bg-background px-2 py-1 text-sm"
                          value={newDependencyId}
                          onChange={event => setNewDependencyId(event.target.value)}
                        >
                          <option value="">Select a task…</option>
                          {availableDependencyOptions.map(option => (
                            <option key={`dep-option-${option.id}`} value={option.id}>
                              {option.title}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs font-medium text-muted-foreground">
                        Relationship
                        <select
                          className="mt-1 w-full rounded-md border border-border/60 bg-background px-2 py-1 text-sm"
                          value={newRelationship}
                          onChange={event =>
                            setNewRelationship(event.target.value as TaskDependency['relationship_type'])
                          }
                        >
                          <option value="prerequisite">Prerequisite</option>
                          <option value="blocks">Blocks</option>
                          <option value="related">Related</option>
                        </select>
                      </label>
                      <Button type="submit" size="xs" disabled={!newDependencyId}>
                        Add dependency
                      </Button>
                    </form>
                  )}
                </div>
              )}
            </section>

            <Separator />

            <section className="space-y-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Unblocks</p>
              {task.dependents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No downstream tasks rely on this yet.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {task.dependents.map(dependency => {
                    const targetTitle = getTaskTitle(dependency.target_task_id);
                    const rank = task.dependentLinks.find(link => link.taskId === dependency.target_task_id)?.rank;
                    return (
                      <button
                        key={`${task.id}-drawer-dependents-${dependency.target_task_id}`}
                        type="button"
                        onClick={() => onNavigateToTask(dependency.target_task_id)}
                        className="flex flex-col items-start rounded-md border border-transparent px-3 py-2 text-left text-sm transition-colors hover:border-border/60 hover:bg-muted/40"
                      >
                        <span className="font-medium text-foreground">
                          #{rank ?? '?'} • {targetTitle}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Relationship: {dependency.relationship_type} • via{' '}
                          {dependency.detection_method === 'ai_inference' ? 'AI inference' : 'stored graph'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            <Separator />

            {/* Strategic Scores Section - T017 Enhancement */}
            {strategicScore && (
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">Strategic Scores</h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsScoreModalOpen(true)}
                    className="text-xs"
                  >
                    View breakdown →
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md border border-border/60 bg-background/60 px-3 py-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Impact
                      </span>
                      <span className="text-lg font-bold text-foreground">
                        {strategicScore.impact.toFixed(1)}
                      </span>
                    </div>
                  </div>
                  <div className="rounded-md border border-border/60 bg-background/60 px-3 py-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Effort
                      </span>
                      <span className="text-lg font-bold text-foreground">
                        {strategicScore.effort.toFixed(1)}h
                      </span>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* Quadrant Visualization Section - T017 Enhancement */}
            {strategicScore && (
              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground">Position</h3>
                <div className="rounded-md border border-border/60 bg-background/60 p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{getQuadrant(strategicScore.impact, strategicScore.effort) === 'high_impact_low_effort' ? '🌟' : getQuadrant(strategicScore.impact, strategicScore.effort) === 'high_impact_high_effort' ? '🚀' : getQuadrant(strategicScore.impact, strategicScore.effort) === 'low_impact_low_effort' ? '⚡' : '⚠️'}</span>
                      <div>
                        <p className="text-sm font-medium text-foreground">{QUADRANT_CONFIGS[getQuadrant(strategicScore.impact, strategicScore.effort)].label}</p>
                        <p className="text-xs text-muted-foreground">{QUADRANT_CONFIGS[getQuadrant(strategicScore.impact, strategicScore.effort)].description}</p>
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      Priority #{task?.rank || '—'}
                    </Badge>
                  </div>
                </div>
              </section>
            )}

            {/* Manual Override Controls Section - T017 Enhancement */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Manual Override</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsManualOverrideOpen(true)}
                  className="text-xs"
                >
                  Adjust scores →
                </Button>
              </div>
              <div className="rounded-md border border-amber-200 bg-amber-50/70 px-3 py-2">
                <p className="text-xs text-amber-700">
                  Use manual controls to adjust AI estimates based on your latest understanding.
                </p>
              </div>
            </section>

            {/* Task Source Metadata - T017 Enhancement */}
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">Source & Metadata</h3>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Source:</span>
                  <span className="text-foreground">
                    {task.isManual ? 'Manual Task' : 'AI Generated'}
                  </span>
                </div>
                {task.movement && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Movement:</span>
                    <MovementBadge movement={task.movement} />
                  </div>
                )}
                {task.lnoCategory && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Category:</span>
                    <Badge variant="outline" className="text-xs">
                      {task.lnoCategory === 'leverage' ? 'Leverage' : 
                       task.lnoCategory === 'neutral' ? 'Neutral' : 'Overhead'}
                    </Badge>
                  </div>
                )}
              </div>
            </section>

            {/* Lock/Unlock Controls - T017 Enhancement */}
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">Task Controls</h3>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {/* TODO: Add lock/unlock handler */}}
                  className="flex items-center gap-2 text-xs"
                >
                  <Lock className="h-3 w-3" />
                  Lock Task
                </Button>
                <span className="text-xs text-muted-foreground">
                  Prevent automatic reordering
                </span>
              </div>
            </section>

            <Separator />

            <div className="flex flex-wrap items-center gap-2">
              {isActive && (
                <Button variant="outline" size="sm" onClick={onMarkDone}>
                  Mark as done
                </Button>
              )}
              {isCompleted && (
                <Button variant="outline" size="sm" onClick={onMarkActive}>
                  Move to active
                </Button>
              )}
              {isDiscarded && (
                <Button variant="secondary" size="sm" onClick={onReturnToActive}>
                  Return to active
                </Button>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Select a task from the list to view its details.</p>
        )}
      </aside>
    </div>,
    document.body
  );
}
