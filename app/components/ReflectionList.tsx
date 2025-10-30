'use client';

import type { ReflectionWithWeight } from '@/lib/schemas/reflectionSchema';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface ReflectionListProps {
  reflections: ReflectionWithWeight[];
  isLoading?: boolean;
  onToggle?: (reflectionId: string, isActive: boolean) => void;
  pendingIds?: Set<string>;
}

export function ReflectionList({
  reflections,
  isLoading,
  onToggle,
  pendingIds,
}: ReflectionListProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="h-16 rounded-lg bg-bg-layer-3"></div>
          </div>
        ))}
      </div>
    );
  }

  if (reflections.length === 0) {
    return (
      <div className="space-y-4 py-8 text-center">
        <p className="text-2xl">💭</p>
        <div className="space-y-2">
          <p className="font-medium text-text-heading">Add your first reflection</p>
          <p className="mx-auto max-w-xs text-sm text-text-muted">
            Quick capture of your current context:
          </p>
          <ul className="mx-auto max-w-xs list-inside list-disc space-y-1 text-left text-sm text-text-muted">
            <li>Energy levels</li>
            <li>Time constraints</li>
            <li>Current blockers</li>
            <li>Momentum state</li>
          </ul>
          <p className="mx-auto mt-3 max-w-xs text-xs italic text-text-muted">
            Example: &quot;Feeling energized after client win, ready to tackle hard problems&quot;
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-medium text-text-heading">Recent Reflections</h3>
        <span className="text-xs text-text-muted">
          {reflections.length} reflection{reflections.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="space-y-2">
        {reflections.map((reflection) => {
          const opacity = Math.max(0.4, reflection.weight);
          const isActive =
            typeof reflection.is_active_for_prioritization === 'boolean'
              ? reflection.is_active_for_prioritization
              : true;
          const isPending = pendingIds?.has(reflection.id) ?? false;
          const canToggle = UUID_PATTERN.test(reflection.id);

          return (
            <div
              key={reflection.id}
              className={cn(
                'rounded-lg border px-3 py-2 transition-all hover:shadow-2layer-sm',
                isActive ? 'border-border bg-bg-layer-3' : 'border-dashed border-border/60 bg-muted/30'
              )}
              style={{ opacity }}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm leading-relaxed text-text-body">{reflection.text}</p>
                <div className="flex flex-col items-end gap-1">
                    <Switch
                      checked={isActive}
                      onCheckedChange={(checked) => {
                        void onToggle?.(reflection.id, checked);
                      }}
                      aria-label={`Toggle reflection "${reflection.text}"`}
                      disabled={isPending || !canToggle}
                    />
                    <span className="text-[11px] uppercase tracking-wide text-text-muted">
                      {isPending ? (
                        <span className="flex items-center gap-1 text-text-muted">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Saving…
                        </span>
                      ) : canToggle ? (
                        isActive ? 'Active' : 'Inactive'
                      ) : (
                        'View only'
                      )}
                    </span>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-text-muted">
                <span>{reflection.relative_time}</span>
                <span>weight: {reflection.weight.toFixed(2)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
