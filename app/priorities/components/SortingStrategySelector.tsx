'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { SortingStrategy } from '@/lib/schemas/sortingStrategy';
import { STRATEGY_CONFIGS } from '@/lib/schemas/sortingStrategy';

type SortingStrategySelectorProps = {
  value: SortingStrategy;
  onChange: (strategy: SortingStrategy) => void;
  disabled?: boolean;
};

export function SortingStrategySelector({
  value,
  onChange,
  disabled = false,
}: SortingStrategySelectorProps) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Sort Strategy
      </span>
      <Select
        value={value}
        onValueChange={nextValue => onChange(nextValue as SortingStrategy)}
        disabled={disabled}
      >
        <SelectTrigger aria-label="Sort Strategy" className="min-w-[220px]">
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
    </div>
  );
}

