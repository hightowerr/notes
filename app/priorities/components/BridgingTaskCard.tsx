'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
};

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
}: BridgingTaskCardProps) {
  const displayText = task.edited_task_text ?? task.task_text;
  const displayHours = task.edited_estimated_hours ?? task.estimated_hours;
  const descriptionId = `bridging-description-${task.id}`;
  const hoursId = `bridging-hours-${task.id}`;
  const [isReasoningOpen, setIsReasoningOpen] = useState(false);

  return (
    <Card className="border-border/70 shadow-sm hover:shadow-md transition-shadow">
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
              <label
                htmlFor={descriptionId}
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground block"
              >
                Task description
              </label>
              <Textarea
                id={descriptionId}
                value={displayText}
                onChange={event =>
                  onEditTask?.({
                    edited_task_text: event.target.value,
                  })
                }
                disabled={disableEdits}
                className="min-h-[80px] resize-y text-sm leading-relaxed w-full"
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground">
                {displayText.length}/500 characters
              </p>
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
                <CollapsibleContent className="overflow-hidden text-sm text-muted-foreground leading-relaxed data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
                  <p>{task.reasoning}</p>
                </CollapsibleContent>
              </Collapsible>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-2 flex-1">
            <label htmlFor={hoursId} className="text-xs font-medium uppercase text-muted-foreground whitespace-nowrap">
              Hours
            </label>
            <Input
              type="number"
              id={hoursId}
              min={8}
              max={160}
              value={displayHours}
              disabled={disableEdits}
              className="h-9 w-20 text-center text-sm"
              onChange={event => {
                const nextValue = Number.parseInt(event.target.value, 10);
                if (Number.isNaN(nextValue)) {
                  return;
                }
                const clamped = Math.min(160, Math.max(8, nextValue));
                onEditTask?.({
                  edited_estimated_hours: clamped,
                });
              }}
            />
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {formatEstimatedHours(displayHours)}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="rounded-md border-border/70 text-xs">
              Cognition: {task.cognition_level}
            </Badge>
            <Badge variant="outline" className="rounded-md border-border/70 text-xs">
              Confidence: {formatConfidence(task.confidence)}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
