'use client';

import type { ReflectionWithWeight } from '@/lib/schemas/reflectionSchema';

interface ReflectionListProps {
  reflections: ReflectionWithWeight[];
  isLoading?: boolean;
}

export function ReflectionList({ reflections, isLoading }: ReflectionListProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="h-16 bg-bg-layer-3 rounded-lg"></div>
          </div>
        ))}
      </div>
    );
  }

  if (reflections.length === 0) {
    return (
      <div className="text-center py-8 space-y-4">
        <p className="text-2xl">💭</p>
        <div className="space-y-2">
          <p className="text-text-heading font-medium">Add your first reflection</p>
          <p className="text-sm text-text-muted max-w-xs mx-auto">
            Quick capture of your current context:
          </p>
          <ul className="text-sm text-text-muted space-y-1 max-w-xs mx-auto text-left list-disc list-inside">
            <li>Energy levels</li>
            <li>Time constraints</li>
            <li>Current blockers</li>
            <li>Momentum state</li>
          </ul>
          <p className="text-xs text-text-muted italic mt-3 max-w-xs mx-auto">
            Example: &quot;Feeling energized after client win, ready to tackle hard problems&quot;
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-text-heading">Recent Reflections</h3>
        <span className="text-xs text-text-muted">{reflections.length} reflection{reflections.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="space-y-2">
        {reflections.map((reflection) => {
          // Calculate opacity based on weight (40-100% range)
          const opacity = Math.max(0.4, reflection.weight);

          return (
            <div
              key={reflection.id}
              className="p-3 bg-bg-layer-3 rounded-lg transition-all hover:bg-bg-layer-4 hover:shadow-2layer-sm"
              style={{ opacity }}
            >
              <p className="text-sm text-text-body leading-relaxed mb-2">
                {reflection.text}
              </p>
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-muted">{reflection.relative_time}</span>
                <span className="text-xs text-text-muted">
                  weight: {reflection.weight.toFixed(2)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
