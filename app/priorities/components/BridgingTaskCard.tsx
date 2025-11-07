'use client';

import { useEffect, useState, type KeyboardEvent } from 'react';
import { ChevronDown, Info } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { BridgingTask } from '@/lib/schemas/bridgingTaskSchema';
import { cn } from '@/lib/utils';

type BridgingTaskCardProps = {
  task: BridgingTask;
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disableCheckbox?: boolean;
  onEditTask?: (
    updates: Pick<Partial<BridgingTask>, 'edited_task_text' | 'edited_estimated_hours'>
  ) => void;
  disableEdits?: boolean;
  isEditing?: boolean;
  onToggleEdit?: (next: boolean) => void;
};

const MIN_TASK_CHARACTERS = 10;
const MAX_TASK_CHARACTERS = 200;
const MIN_ESTIMATED_HOURS = 8;
const MAX_ESTIMATED_HOURS = 160;

function formatEstimatedHours(hours: number): string {
  if (hours % 40 === 0) {
    const weeks = hours / 40;
    return `${weeks} week${weeks === 1 ? '' : 's'} (${hours}h)`;
  }
  return `${hours} hours`;
}

function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

export function BridgingTaskCard({
  task,
  checked,
  onCheckedChange,
  disableCheckbox = false,
  onEditTask,
  disableEdits = false,
  isEditing = false,
  onToggleEdit,
}: BridgingTaskCardProps) {
  const displayText = task.edited_task_text ?? task.task_text;
  const displayHours = task.edited_estimated_hours ?? task.estimated_hours;
  const descriptionId = `bridging-description-${task.id}`;
  const hoursId = `bridging-hours-${task.id}`;
  const [isReasoningOpen, setIsReasoningOpen] = useState(false);
  const [draftText, setDraftText] = useState(displayText);
  const [draftHours, setDraftHours] = useState(String(displayHours));
  const [textError, setTextError] = useState<string | null>(null);
  const [hoursError, setHoursError] = useState<string | null>(null);

  useEffect(() => {
    if (isEditing) {
      setDraftText(displayText);
      setDraftHours(String(displayHours));
      setTextError(null);
      setHoursError(null);
    }
  }, [isEditing, displayText, displayHours]);

  const parsedDraftHours = Number.parseInt(draftHours, 10);
  const draftHoursLabel = Number.isNaN(parsedDraftHours)
    ? '—'
    : formatEstimatedHours(parsedDraftHours);

  const validateText = (value: string): string | null => {
    const trimmed = value.trim();
    if (trimmed.length < MIN_TASK_CHARACTERS) {
      return `Task description must be at least ${MIN_TASK_CHARACTERS} characters.`;
    }
    if (trimmed.length > MAX_TASK_CHARACTERS) {
      return `Task description must be ${MAX_TASK_CHARACTERS} characters or fewer.`;
    }
    return null;
  };

  const validateHours = (value: string): string | null => {
    if (value.trim().length === 0) {
      return 'Estimated hours is required.';
    }
    if (!/^-?\d+$/.test(value.trim())) {
      return 'Estimated hours must be a whole number.';
    }
    const parsed = Number.parseInt(value, 10);
    if (parsed < MIN_ESTIMATED_HOURS || parsed > MAX_ESTIMATED_HOURS) {
      return `Estimated hours must be between ${MIN_ESTIMATED_HOURS} and ${MAX_ESTIMATED_HOURS}.`;
    }
    return null;
  };

  const commitText = () => {
    if (!onEditTask) {
      return true;
    }
    const error = validateText(draftText);
    setTextError(error);
    if (error) {
      return false;
    }
    onEditTask({
      edited_task_text: draftText.trim(),
    });
    return true;
  };

  const commitHours = () => {
    if (!onEditTask) {
      return true;
    }
    const error = validateHours(draftHours);
    setHoursError(error);
    if (error) {
      return false;
    }
    onEditTask({
      edited_estimated_hours: Number.parseInt(draftHours, 10),
    });
    return true;
  };

  const handleTextBlur = () => {
    if (!isEditing) {
      return;
    }
    commitText();
  };

  const handleHoursBlur = () => {
    if (!isEditing) {
      return;
    }
    commitHours();
  };

  const handleHoursKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && isEditing) {
      event.preventDefault();
      commitHours();
    }
  };

  const handleSave = () => {
    const textOk = commitText();
    const hoursOk = commitHours();
    if (textOk && hoursOk) {
      onToggleEdit?.(false);
    }
  };

  const handleCancel = () => {
    setDraftText(displayText);
    setDraftHours(String(displayHours));
    setTextError(null);
    setHoursError(null);
    onToggleEdit?.(false);
  };

  const handleEditClick = () => {
    if (disableEdits) {
      return;
    }
    onToggleEdit?.(true);
  };

  return (
    <Card
      className={cn(
        'border-border/70 shadow-sm transition-shadow hover:shadow-md',
        !checked && 'opacity-60'
      )}
    >
      <CardHeader className="space-y-3 pb-3">
        <div className="flex w-full items-start gap-3">
          <Checkbox
            checked={checked}
            disabled={disableCheckbox}
            onCheckedChange={value => onCheckedChange?.(Boolean(value))}
            className="mt-1 shrink-0"
            aria-label="Select this bridging task"
          />
          <div className="flex-1 min-w-0 space-y-3">
            <div className="space-y-2">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2 flex-1 min-w-0">
                  <label
                    htmlFor={descriptionId}
                    className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    Task description
                  </label>
                  {isEditing ? (
                    <>
                      <Textarea
                        id={descriptionId}
                        value={draftText}
                        onChange={event => {
                          setDraftText(event.target.value);
                          if (textError) {
                            setTextError(null);
                          }
                        }}
                        onBlur={handleTextBlur}
                        disabled={disableEdits}
                        className="min-h-[80px] w-full resize-y text-sm leading-relaxed"
                        maxLength={MAX_TASK_CHARACTERS}
                      />
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{draftText.length}/{MAX_TASK_CHARACTERS} characters</span>
                        <span>
                          {draftText.trim().length < MIN_TASK_CHARACTERS
                            ? `${Math.max(0, MIN_TASK_CHARACTERS - draftText.trim().length)} more needed`
                            : ''}
                        </span>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words">
                      {displayText}
                    </p>
                  )}
                  {textError && (
                    <p className="text-xs text-destructive">{textError}</p>
                  )}
                </div>
                <div className="flex flex-row items-center gap-2 sm:flex-col sm:items-end">
                  {isEditing ? (
                    <>
                      <Button
                        size="sm"
                        onClick={handleSave}
                        disabled={disableEdits}
                      >
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleCancel}
                        disabled={disableEdits}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleEditClick}
                      disabled={disableEdits}
                    >
                      Edit
                    </Button>
                  )}
                </div>
              </div>
            </div>
            <div className="space-y-1">
              <Collapsible
                open={isReasoningOpen}
                onOpenChange={setIsReasoningOpen}
                className="space-y-2"
              >
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-2 text-sm font-medium text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    Why this task?
                    <ChevronDown
                      className={cn(
                        'h-4 w-4 transition-transform duration-200',
                        isReasoningOpen && 'rotate-180'
                      )}
                    />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="overflow-hidden text-sm leading-relaxed text-muted-foreground data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
                  <p>{task.reasoning}</p>
                </CollapsibleContent>
              </Collapsible>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
          <div className="flex flex-col gap-2 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <label
                htmlFor={hoursId}
                className="text-xs font-medium uppercase text-muted-foreground whitespace-nowrap"
              >
                Hours
              </label>
              {isEditing ? (
                <>
                  <Input
                    type="number"
                    inputMode="numeric"
                    pattern="\d*"
                    id={hoursId}
                    min={MIN_ESTIMATED_HOURS}
                    max={MAX_ESTIMATED_HOURS}
                    value={draftHours}
                    disabled={disableEdits}
                    className="h-9 w-24 text-center text-sm"
                    onChange={event => {
                      setDraftHours(event.target.value);
                      if (hoursError) {
                        setHoursError(null);
                      }
                    }}
                    onBlur={handleHoursBlur}
                    onKeyDown={handleHoursKeyDown}
                  />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {Number.isNaN(parsedDraftHours) ? '—' : draftHoursLabel}
                  </span>
                </>
              ) : (
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  {formatEstimatedHours(displayHours)}
                </span>
              )}
            </div>
            {hoursError && (
              <p className="text-xs text-destructive">{hoursError}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="rounded-md border-border/70 text-xs">
              Cognition: {task.cognition_level}
            </Badge>
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="group inline-flex items-center gap-1 rounded bg-transparent p-0 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background cursor-pointer"
                    aria-label="How this confidence score is calculated"
                  >
                    <Badge variant="outline" className="rounded-md border-border/70 text-xs">
                      Confidence: {formatConfidence(task.confidence)}
                    </Badge>
                    <Info
                      aria-hidden="true"
                      className="h-3.5 w-3.5 text-muted-foreground transition-colors group-hover:text-foreground"
                    />
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  align="start"
                  className="max-w-xs space-y-1 text-left"
                >
                  <p className="font-semibold">Confidence calculation:</p>
                  <ul className="list-disc space-y-0.5 pl-4">
                    <li>40% Semantic similarity to past tasks</li>
                    <li>30% Gap indicator strength</li>
                    <li>30% AI model confidence</li>
                  </ul>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
