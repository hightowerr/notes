'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { MovementInfo } from '@/app/priorities/components/MovementBadge';

type TaskDiffResult = {
  movementMap: Record<string, MovementInfo>;
  highlightedIds: Set<string>;
  flashTask: (taskId: string) => void;
};

export function useTaskDiff(taskIds: string[]): TaskDiffResult {
  const previousOrderRef = useRef<string[] | null>(null);
  const [movementMap, setMovementMap] = useState<Record<string, MovementInfo>>({});
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set());
  const timeoutRef = useRef<number | null>(null);

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
        nextMovement[taskId] = { type: 'new' };
        idsToHighlight.push(taskId);
      }
    } else {
      for (const [index, taskId] of taskIds.entries()) {
        const previousIndex = prevOrder.indexOf(taskId);
        if (previousIndex === -1) {
          nextMovement[taskId] = { type: 'new' };
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
  }, [taskIds]);

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
