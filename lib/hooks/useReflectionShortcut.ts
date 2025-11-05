import { useEffect } from 'react';

/**
 * Custom hook for reflection panel keyboard shortcut
 * Feature: 004-reflection-capture-quick
 *
 * Listens for Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows/Linux) to toggle reflection panel
 * Uses Shift modifier to avoid conflict with browser refresh (Cmd+R / Ctrl+R)
 *
 * @param onToggle - Callback function to toggle panel open/close state
 */
export function useReflectionShortcut(onToggle: () => void) {
  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      // Cmd+Shift+R on Mac or Ctrl+Shift+R on Windows/Linux
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'R') {
        e.preventDefault(); // Prevent any default behavior
        onToggle();
      }
    }

    window.addEventListener('keydown', handleKeydown);

    // Cleanup: remove event listener on unmount
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [onToggle]);
}
