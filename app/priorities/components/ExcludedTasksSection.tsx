'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, X } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import type { ExcludedTask } from '@/lib/schemas/excludedTaskSchema';

interface ExcludedTasksSectionProps {
  excludedTasks: ExcludedTask[];
}

export function ExcludedTasksSection({ excludedTasks }: ExcludedTasksSectionProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (!excludedTasks || excludedTasks.length === 0) {
    return null;
  }

  return (
    <div className="mt-8 space-y-4">
      <Collapsible open={isOpen} onOpenChange={setIsOpen} className="w-full">
        <div className="flex items-center justify-between">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="flex items-center gap-2 p-0 hover:bg-transparent">
              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <span className="font-medium text-muted-foreground">
                Show {excludedTasks.length} excluded task{excludedTasks.length === 1 ? '' : 's'}
              </span>
            </Button>
          </CollapsibleTrigger>
        </div>

        <CollapsibleContent className="mt-4 space-y-3">
          {excludedTasks.map((task) => (
            <Card key={task.task_id} className="bg-muted/30 border-muted/60">
              <CardContent className="p-4">
                <div className="flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-sm font-medium text-muted-foreground line-through decoration-muted-foreground/50">
                      {task.task_text}
                    </span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge 
                          variant="outline" 
                          className="shrink-0 inline-flex items-center gap-1 border-muted-foreground/20 bg-muted text-xs font-medium text-muted-foreground cursor-help"
                        >
                          <X className="h-3 w-3" />
                          <span className="max-w-[200px] truncate">{task.exclusion_reason}</span>
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{task.exclusion_reason}</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
