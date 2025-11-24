'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Ban, ToggleRight } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ReflectionAttributionBadge } from '@/app/priorities/components/ReflectionAttributionBadge';
import type { ReflectionEffect } from '@/lib/services/reflectionAdjuster';

export type BlockedTask = {
  task_id: string;
  task_text: string;
  blocking_effect: ReflectionEffect;
  reflection_text?: string;
};

interface BlockedTasksSectionProps {
  blockedTasks: BlockedTask[];
  onUnblockReflection?: (reflectionId: string) => void;
}

export function BlockedTasksSection({ blockedTasks, onUnblockReflection }: BlockedTasksSectionProps) {
  const [isOpen, setIsOpen] = useState(true);

  if (!blockedTasks || blockedTasks.length === 0) {
    return null;
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="mt-6 space-y-3" role="region" aria-label="Blocked tasks">
        <Collapsible open={isOpen} onOpenChange={setIsOpen} className="w-full">
          <div className="flex items-center justify-between">
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="flex items-center gap-2 p-0 hover:bg-transparent text-destructive/80 hover:text-destructive"
              >
                {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <Ban className="h-4 w-4" />
                <span className="font-medium">
                  {blockedTasks.length} task{blockedTasks.length === 1 ? '' : 's'} blocked by reflections
                </span>
              </Button>
            </CollapsibleTrigger>
          </div>

          <CollapsibleContent className="mt-3 space-y-2">
            {blockedTasks.map((task) => (
              <Card
                key={task.task_id}
                className="border-destructive/20 bg-destructive/5"
                data-testid={`blocked-task-${task.task_id}`}
              >
                <CardContent className="p-3">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-sm font-medium text-muted-foreground line-through decoration-destructive/50">
                        {task.task_text}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <ReflectionAttributionBadge
                          effect="blocked"
                          reason={task.blocking_effect.reason}
                          reflectionId={task.blocking_effect.reflection_id}
                        />
                        {onUnblockReflection && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                                onClick={() => onUnblockReflection(task.blocking_effect.reflection_id)}
                                aria-label={`Toggle off reflection blocking this task`}
                              >
                                <ToggleRight className="h-4 w-4 mr-1" />
                                Unblock
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <p className="text-xs">Toggle off the reflection to restore this task</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </div>
                    {task.reflection_text && (
                      <p className="text-xs text-muted-foreground/70 italic pl-1 border-l-2 border-destructive/30">
                        &ldquo;{task.reflection_text}&rdquo;
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </CollapsibleContent>
        </Collapsible>
      </div>
    </TooltipProvider>
  );
}
