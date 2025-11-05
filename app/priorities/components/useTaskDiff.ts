'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { MovementInfo } from '@/app/priorities/components/MovementBadge';

type TaskDiffResult = {
  movementMap: Record<string, MovementInfo>;
  highlightedIds: Set<string>;
  flashTask: (taskId: string) => void;
};

type TaskAnnotationLite = {
  task_id: string;
  state?: 'active' | 'completed' | 'discarded' | 'manual_override' | 'reintroduced';
  confidence_delta?: number | null;
  manual_override?: boolean;
};

type TaskDiffOptions = {
  annotations?: TaskAnnotationLite[] | null;
};

export function useTaskDiff(taskIds: string[], options?: TaskDiffOptions): TaskDiffResult {
  const previousOrderRef = useRef<string[] | null>(null);
  const [movementMap, setMovementMap] = useState<Record<string, MovementInfo>>({});
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set());
  const timeoutRef = useRef<number | null>(null);

  const annotationMap = useMemo(() => {
    const map = new Map<string, TaskAnnotationLite>();
    if (options?.annotations) {
      for (const annotation of options.annotations) {
        if (annotation && typeof annotation.task_id === 'string') {
          map.set(annotation.task_id, annotation);
        }
      }
    }
    return map;
  }, [options?.annotations]);

  useEffect(() => {
    const prevOrder = previousOrderRef.current;
    const nextMovement: Record<string, MovementInfo> = {};
    const idsToHighlight: string[] = [];

    if (!taskIds || taskIds.length === 0) {
      setMovementMap({});
      setHighlightedIds(new Set());
      previousOrderRef.current = taskIds;
      return;
    }

    if (!prevOrder) {
      for (const taskId of taskIds) {
        const annotation = annotationMap.get(taskId);
        if (annotation?.state === 'reintroduced') {
          nextMovement[taskId] = { type: 'reintroduced' };
        } else if (annotation?.manual_override) {
          nextMovement[taskId] = { type: 'manual' };
        } else {
          nextMovement[taskId] = { type: 'new' };
        }
        idsToHighlight.push(taskId);
      }
    } else {
      for (const [index, taskId] of taskIds.entries()) {
        const previousIndex = prevOrder.indexOf(taskId);
        const annotation = annotationMap.get(taskId);
        if (previousIndex === -1) {
          if (annotation?.state === 'reintroduced') {
            nextMovement[taskId] = { type: 'reintroduced' };
          } else if (annotation?.manual_override) {
            nextMovement[taskId] = { type: 'manual' };
          } else {
            nextMovement[taskId] = { type: 'new' };
          }
          idsToHighlight.push(taskId);
          continue;
        }

        if (previousIndex === index) {
          nextMovement[taskId] = { type: 'none' };
        } else if (previousIndex > index) {
          const delta = previousIndex - index;
          nextMovement[taskId] = { type: 'up', delta };
          idsToHighlight.push(taskId);
        } else {
          const delta = index - previousIndex;
          nextMovement[taskId] = { type: 'down', delta };
          idsToHighlight.push(taskId);
        }

        if (annotation?.manual_override) {
          nextMovement[taskId] = { type: 'manual' };
          if (!idsToHighlight.includes(taskId)) {
            idsToHighlight.push(taskId);
          }
          continue;
        }

        if (annotation?.state === 'reintroduced') {
          nextMovement[taskId] = { type: 'reintroduced' };
          if (!idsToHighlight.includes(taskId)) {
            idsToHighlight.push(taskId);
          }
          continue;
        }

        if (
          typeof annotation?.confidence_delta === 'number' &&
          annotation.confidence_delta <= -0.15
        ) {
          nextMovement[taskId] = {
            type: 'confidence-drop',
            delta: Math.abs(annotation.confidence_delta),
          };
          if (!idsToHighlight.includes(taskId)) {
            idsToHighlight.push(taskId);
          }
        }
      }
    }

    previousOrderRef.current = taskIds;
    setMovementMap(nextMovement);

    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
    }

    if (idsToHighlight.length > 0) {
      setHighlightedIds(new Set(idsToHighlight));
      timeoutRef.current = window.setTimeout(() => {
        setHighlightedIds(new Set());
        timeoutRef.current = null;
      }, 1800);
    } else {
      setHighlightedIds(new Set());
    }
  }, [taskIds, annotationMap]);

  const flashTask = (taskId: string) => {
    setHighlightedIds(prev => {
      const next = new Set(prev);
      next.add(taskId);
      return next;
    });

    window.setTimeout(() => {
      setHighlightedIds(prev => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    }, 1200);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return useMemo(
    () => ({
      movementMap,
      highlightedIds,
      flashTask,
    }),
    [movementMap, highlightedIds]
  );
}
