'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { SortingStrategy } from '@/lib/schemas/sortingStrategy';
import { STRATEGY_CONFIGS } from '@/lib/schemas/sortingStrategy';
import { cn } from '@/lib/utils';

type SortingStrategySelectorProps = {
  value: SortingStrategy;
  onChange: (strategy: SortingStrategy) => void;
  disabled?: boolean;
  compact?: boolean;
};

export function SortingStrategySelector({
  value,
  onChange,
  disabled = false,
  compact = false,
}: SortingStrategySelectorProps) {
  const triggerClassName = compact
    ? 'h-9 text-sm px-2 sm:h-9 sm:text-sm'
    : 'h-11 text-base px-4 sm:h-9 sm:text-sm';

  const selector = (
    <Select
      value={value}
      onValueChange={nextValue => onChange(nextValue as SortingStrategy)}
      disabled={disabled}
    >
      <SelectTrigger
        aria-label="Sort Strategy"
        data-testid="sorting-strategy-trigger"
        className={cn('min-w-[220px]', triggerClassName)}
      >
        <SelectValue placeholder="Balanced" />
      </SelectTrigger>
      <SelectContent align="start" className="w-[280px]">
        {(
          Object.entries(STRATEGY_CONFIGS) as Array<
            [SortingStrategy, (typeof STRATEGY_CONFIGS)[SortingStrategy]]
          >
        ).map(([strategy, config]) => (
          <SelectItem key={strategy} value={strategy} className="flex items-start gap-2">
            <div className="flex flex-col text-left">
              <span className="font-semibold text-foreground">{config.label}</span>
              <span className="text-xs text-muted-foreground">{config.description}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const control = (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Sort Strategy
      </span>
      {selector}
    </div>
  );

  if (disabled) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="w-fit cursor-not-allowed">{control}</div>
        </TooltipTrigger>
        <TooltipContent sideOffset={8}>No tasks to sort</TooltipContent>
      </Tooltip>
    );
  }

  return control;
}
