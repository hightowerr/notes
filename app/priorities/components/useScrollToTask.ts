'use client';

import { useCallback } from 'react';

type ScrollOptions = {
  flashTask?: (taskId: string) => void;
};

export function useScrollToTask({ flashTask }: ScrollOptions = {}) {
  return useCallback(
    (taskId: string) => {
      if (!taskId) {
        return;
      }

      const element = document.querySelector<HTMLElement>(`[data-task-id="${taskId}"]`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.focus?.();
      }

      flashTask?.(taskId);
    },
    [flashTask]
  );
}
