'use client';

import type { ReflectionWithWeight } from '@/lib/schemas/reflectionSchema';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { Loader2, Trash2 } from 'lucide-react';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface ReflectionListProps {
  reflections: ReflectionWithWeight[];
  isLoading?: boolean;
  onToggle?: (reflectionId: string, isActive: boolean) => void;
  onDelete?: (reflectionId: string) => void;
  pendingIds?: Set<string>;
  deletingIds?: Set<string>;
}

export function ReflectionList({
  reflections,
  isLoading,
  onToggle,
  onDelete,
  pendingIds,
  deletingIds,
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
      <div className="space-y-6 py-8 px-4">
        <div className="text-center space-y-2">
          <p className="text-4xl" role="img" aria-label="Thinking bubble">💭</p>
          <h3 className="font-semibold text-text-heading">No reflections yet</h3>
          <p className="text-sm text-text-muted max-w-xs mx-auto">
            Capture your current context to help AI prioritize tasks effectively.
          </p>
        </div>

        <div className="bg-info-bg rounded-lg p-4 space-y-3 shadow-2layer-sm">
          <p className="text-xs font-medium text-info-text">Examples to get started:</p>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <span className="text-base" role="img" aria-label="Battery">🔋</span>
              <span className="text-text-body flex-1">&quot;High energy after exercise, ready for complex tasks&quot;</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-base" role="img" aria-label="Clock">⏱️</span>
              <span className="text-text-body flex-1">&quot;Only 30 mins before meeting, need quick wins&quot;</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-base" role="img" aria-label="Roadblock">🚧</span>
              <span className="text-text-body flex-1">&quot;Blocked on design review, focusing on backend work&quot;</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-base" role="img" aria-label="Target">🎯</span>
              <span className="text-text-body flex-1">&quot;Deep work mode, tackling the hardest problem first&quot;</span>
            </li>
          </ul>
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
          const isActive =
            typeof reflection.is_active_for_prioritization === 'boolean'
              ? reflection.is_active_for_prioritization
              : true;
          const isPending = pendingIds?.has(reflection.id) ?? false;
          const isDeleting = deletingIds?.has(reflection.id) ?? false;
          const canToggle = UUID_PATTERN.test(reflection.id);
          const canDelete = UUID_PATTERN.test(reflection.id);

          return (
            <div
              key={reflection.id}
              className={cn(
                'rounded-lg px-4 py-3 transition-all',
                isActive
                  ? 'bg-bg-layer-3 shadow-2layer-sm hover:shadow-2layer-md hover:bg-bg-layer-4'
                  : 'bg-info-bg shadow-2layer-sm opacity-70',
                isDeleting && 'opacity-50'
              )}
              tabIndex={0}
              role="article"
              aria-label={`Reflection: ${reflection.text}`}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm leading-relaxed text-text-body flex-1 break-words">{reflection.text}</p>
                <div className="flex items-start gap-2 flex-shrink-0">
                  {/* Delete button */}
                  {canDelete && (
                    <button
                      onClick={() => onDelete?.(reflection.id)}
                      disabled={isDeleting || isPending}
                      className="p-1.5 hover:bg-destructive-bg rounded transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
                      aria-label={`Delete reflection "${reflection.text}"`}
                    >
                      {isDeleting ? (
                        <Loader2 className="h-4 w-4 text-destructive-text animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4 text-text-muted group-hover:text-destructive-text" />
                      )}
                    </button>
                  )}

                  {/* Toggle switch */}
                  <div className="flex flex-col items-end gap-1">
                    <Switch
                      checked={isActive}
                      onCheckedChange={(checked) => {
                        void onToggle?.(reflection.id, checked);
                      }}
                      aria-label={`Toggle reflection "${reflection.text}"`}
                      disabled={isPending || !canToggle || isDeleting}
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
              </div>
              <div className="mt-2">
                <span className="text-xs text-text-muted">{reflection.relative_time}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
