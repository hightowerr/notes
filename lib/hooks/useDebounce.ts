'use client';

import { useEffect, useState } from 'react';

/**
 * Debounce any changing value by the specified delay.
 * Returns the latest value once the delay elapses without further changes.
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = window.setTimeout(() => setDebouncedValue(value), delay);
    return () => window.clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}
