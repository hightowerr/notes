# Research: Reflection Capture Technical Implementation

**Feature**: 004-reflection-capture-quick
**Date**: 2025-10-16
**Phase**: Phase 0 - Technical Research

## Overview

This document consolidates research findings for 8 technical unknowns identified during planning. Each section documents the chosen approach, rationale, alternatives considered, and provides minimal code examples demonstrating the pattern.

---

## 1. Exponential Decay Implementation

**Decision**: Use `Math.pow(0.5, ageInDays / 7)` with JavaScript's native Math API

**Rationale**:
- JavaScript's `Math.pow()` provides sufficient precision for weight calculations (double-precision floating point)
- Formula `weight = 0.5^(age_in_days/7)` maps directly to `Math.pow(0.5, ageInDays / 7)`
- No external library needed—built-in Math API is performant and reliable
- Results are deterministic and testable (same input always produces same output)

**Alternatives Considered**:
- **Custom exponential function**: Rejected - unnecessary complexity, Math.pow is optimized
- **Lookup table**: Rejected - premature optimization, dynamic calculation is fast enough
- **Math.exp with natural log**: Rejected - less readable, equivalent performance

**Code Example**:
```typescript
// lib/services/reflectionService.ts
export function calculateRecencyWeight(createdAt: Date): number {
  const now = new Date();
  const ageInMs = now.getTime() - createdAt.getTime();
  const ageInDays = ageInMs / (1000 * 60 * 60 * 24);
  const halfLife = 7; // days

  const weight = Math.pow(0.5, ageInDays / halfLife);

  // Floor at 0.06 (30 days old, effectively zero)
  return weight < 0.06 ? 0 : weight;
}

// Test examples:
// today: weight = 1.0
// 7 days old: weight = 0.5
// 14 days old: weight = 0.25
// 30 days old: weight = ~0.06 (floored to 0)
```

---

## 2. Debounce Strategy

**Decision**: Custom debounce with Map-based rate limiting, no external library

**Rationale**:
- Requirement: 2-second debounce + 1 per 10 seconds rate limit per user
- Lodash debounce doesn't support per-user rate limiting—need custom solution
- Use Map to track last execution time per user
- TypeScript provides clear types without runtime dependency

**Alternatives Considered**:
- **Lodash debounce**: Rejected - no built-in rate limiting, adds dependency
- **RxJS throttle**: Rejected - overkill for simple use case, large bundle size
- **use-debounce hook**: Rejected - doesn't handle server-side rate limiting

**Code Example**:
```typescript
// lib/services/recomputeDebounce.ts
const userTimers = new Map<string, NodeJS.Timeout>();
const userLastExecution = new Map<string, number>();

export function debounceRecompute(
  userId: string,
  triggerFn: () => Promise<void>,
  debounceMs: number = 2000,
  rateLimitMs: number = 10000
): void {
  // Check rate limit
  const lastExec = userLastExecution.get(userId) || 0;
  const now = Date.now();

  if (now - lastExec < rateLimitMs) {
    console.log(`Rate limit: User ${userId} must wait ${rateLimitMs - (now - lastExec)}ms`);
    return; // Silently skip - rate limited
  }

  // Clear existing timer
  const existingTimer = userTimers.get(userId);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  // Set new debounced timer
  const timer = setTimeout(async () => {
    userLastExecution.set(userId, Date.now());
    userTimers.delete(userId);
    await triggerFn();
  }, debounceMs);

  userTimers.set(userId, timer);
}

// Usage in API route:
debounceRecompute(userId, async () => {
  await triggerRecomputeJob(userId, 'reflection_added');
});
```

---

## 3. Keyboard Shortcut Handling

**Decision**: Use `useEffect` with `keydown` event listener, check `metaKey` (Mac) or `ctrlKey` (Windows) + `key === 'r'`

**Rationale**:
- React's `useEffect` for global event listener cleanup pattern
- `metaKey` detects Command on Mac, `ctrlKey` detects Ctrl on Windows/Linux
- Prevent default to stop browser refresh (Cmd+R / Ctrl+R native behavior)
- Single event listener at root level—no per-component overhead

**Alternatives Considered**:
- **react-hotkeys-hook**: Rejected - adds dependency for simple use case
- **mousetrap library**: Rejected - overkill, large bundle for one shortcut
- **Custom hook per component**: Rejected - multiple listeners inefficient

**Code Example**:
```typescript
// lib/hooks/useReflectionShortcut.ts
import { useEffect } from 'react';

export function useReflectionShortcut(onToggle: () => void) {
  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      // Cmd+R on Mac or Ctrl+R on Windows/Linux
      if ((e.metaKey || e.ctrlKey) && e.key === 'r') {
        e.preventDefault(); // Prevent browser refresh
        onToggle();
      }
    }

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [onToggle]);
}

// Usage in component:
useReflectionShortcut(() => setIsPanelOpen(prev => !prev));
```

---

## 4. Optimistic UI Update Pattern

**Decision**: Update local state immediately, rollback on error

**Rationale**:
- Spec requires textarea clear within 200ms (instant feel)
- Optimistic update provides immediate feedback while API request in flight
- Rollback pattern maintains data integrity if server rejects
- React's `useState` + async/await pattern is standard approach

**Alternatives Considered**:
- **Wait for server confirmation**: Rejected - violates <200ms latency requirement
- **SWR/React Query**: Rejected - overkill for single POST, adds dependency
- **Pessimistic update**: Rejected - poor UX, feels laggy

**Code Example**:
```typescript
// app/components/ReflectionInput.tsx
async function handleSubmit(text: string) {
  // 1. Optimistic update (immediate)
  const tempReflection = {
    id: `temp-${Date.now()}`,
    text,
    created_at: new Date().toISOString(),
    weight: 1.0,
    relative_time: 'Just now'
  };

  setReflections(prev => [tempReflection, ...prev]); // Prepend
  setInputValue(''); // Clear textarea (<200ms)
  toast.success('✅ Reflection added');

  // 2. Server request (async)
  try {
    const response = await fetch('/api/reflections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });

    if (!response.ok) throw new Error('Network error');

    const saved = await response.json();

    // 3. Replace temp with real data
    setReflections(prev =>
      prev.map(r => r.id === tempReflection.id ? saved : r)
    );
  } catch (error) {
    // 4. Rollback on error
    setReflections(prev => prev.filter(r => r.id !== tempReflection.id));
    setInputValue(text); // Restore text for retry
    toast.error('❌ Could not save reflection. Try again.');
  }
}
```

---

## 5. Relative Timestamp Formatting

**Decision**: Use `date-fns/formatDistanceToNow` (already installed via dependencies)

**Rationale**:
- date-fns is lightweight modular library (tree-shakeable)
- `formatDistanceToNow` produces "Just now", "3 hours ago", "2 days ago" format
- Already in project dependencies (no new install needed)
- Handles edge cases (pluralization, minute/hour/day boundaries)

**Alternatives Considered**:
- **Custom implementation**: Rejected - reinventing wheel, edge cases are tricky
- **Intl.RelativeTimeFormat**: Rejected - requires polyfill for older browsers
- **moment.js**: Rejected - too large (59KB), deprecated in favor of date-fns

**Code Example**:
```typescript
// lib/services/reflectionService.ts
import { formatDistanceToNow } from 'date-fns';

export function formatRelativeTime(createdAt: Date): string {
  const ageInDays = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);

  // Spec requires "7+ days ago" for anything older than 7 days
  if (ageInDays > 7) {
    return '7+ days ago';
  }

  return formatDistanceToNow(createdAt, { addSuffix: true });
  // Examples: "just now", "3 hours ago", "2 days ago"
}

// Test examples:
// 30 seconds ago: "less than a minute ago"
// 3 hours ago: "3 hours ago"
// 2 days ago: "2 days ago"
// 10 days ago: "7+ days ago"
```

---

## 6. Character Counter UX

**Decision**: Conditional rendering with `{charCount >= 450 && <CounterUI />}` pattern

**Rationale**:
- Spec requires counter hidden until 450 chars (anxiety-free UX)
- React conditional rendering is performant—no need for CSS hide/show
- Single state variable (`inputValue.length`) drives visibility
- Gentle message at 500 chars, no hard block

**Alternatives Considered**:
- **CSS visibility:hidden**: Rejected - still takes layout space
- **Always show counter**: Rejected - violates spec (anxiety-inducing)
- **Tooltip on hover**: Rejected - spec requires visible persistent counter at 450+

**Code Example**:
```typescript
// app/components/ReflectionInput.tsx
function ReflectionInput() {
  const [text, setText] = useState('');
  const charCount = text.length;

  return (
    <div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={500} // Hard limit at 500
      />

      {charCount >= 450 && (
        <div className="text-sm text-text-muted mt-2">
          {charCount}/500 characters
          {charCount === 500 && (
            <p className="text-warning-text">
              Reflections work best when concise. Wrap up this thought.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
```

---

## 7. Mobile Modal vs Desktop Sidebar

**Decision**: Use CSS media query + conditional component rendering based on screen width

**Rationale**:
- Spec requires full-screen modal on mobile, collapsible sidebar on desktop
- Tailwind's responsive classes handle breakpoint detection
- Radix UI Dialog for modal, custom sidebar for desktop
- Same content rendered in different containers—DRY principle

**Alternatives Considered**:
- **Separate mobile/desktop components**: Rejected - code duplication
- **useMediaQuery hook**: Rejected - adds dependency, Tailwind handles it
- **CSS-only transform**: Rejected - accessibility issues, needs proper modal

**Code Example**:
```typescript
// app/components/ReflectionPanel.tsx
import { Dialog, DialogContent } from '@/components/ui/dialog';

function ReflectionPanel({ isOpen, onClose }: Props) {
  const content = <ReflectionContent />;

  return (
    <>
      {/* Desktop: Collapsible sidebar */}
      <div className="hidden md:block">
        <aside
          className={`fixed right-0 top-0 h-full w-80 bg-bg-layer-2
                      transform transition-transform duration-300
                      ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
        >
          {content}
        </aside>
      </div>

      {/* Mobile: Full-screen modal */}
      <div className="md:hidden">
        <Dialog open={isOpen} onOpenChange={onClose}>
          <DialogContent className="w-full h-full max-w-none">
            {content}
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
```

---

## 8. API Error Differentiation

**Decision**: Check `response.ok` + `navigator.onLine` for network vs server error detection

**Rationale**:
- `navigator.onLine === false` indicates offline state (network unavailable)
- `response.ok === false` indicates server returned error (4xx/5xx)
- Spec requires different toast messages for each scenario
- Combine checks to differentiate failure modes

**Alternatives Considered**:
- **Catch all errors as "network error"**: Rejected - doesn't meet spec requirements
- **Custom error classes**: Rejected - overkill for simple distinction
- **Timeout-based detection**: Rejected - unreliable, false positives

**Code Example**:
```typescript
// lib/services/reflectionApi.ts
export async function postReflection(text: string) {
  // Check offline first
  if (!navigator.onLine) {
    throw new NetworkError('No connection. Please try again when online.');
  }

  try {
    const response = await fetch('/api/reflections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });

    if (!response.ok) {
      // Server error (4xx/5xx)
      const error = await response.json();
      throw new ServerError(error.message || 'Server error occurred');
    }

    return await response.json();
  } catch (error) {
    // Network error (fetch failed before reaching server)
    if (error instanceof TypeError) {
      throw new NetworkError('No connection. Please try again when online.');
    }
    throw error; // Re-throw ServerError or other errors
  }
}

// Usage in component:
try {
  await postReflection(text);
  toast.success('✅ Reflection added');
} catch (error) {
  if (error instanceof NetworkError) {
    toast.error(error.message); // "No connection..."
  } else if (error instanceof ServerError) {
    toast.error('Could not save reflection. Your reflection was not saved.');
  }
}
```

---

## Summary

All 8 technical unknowns resolved with concrete implementation patterns:

1. ✅ **Exponential Decay**: `Math.pow(0.5, ageInDays / 7)` with 0.06 floor
2. ✅ **Debounce Strategy**: Custom Map-based debounce + rate limiting
3. ✅ **Keyboard Shortcuts**: `metaKey || ctrlKey` + prevent default
4. ✅ **Optimistic UI**: Immediate update, rollback on error
5. ✅ **Relative Timestamps**: date-fns `formatDistanceToNow` with 7+ day cutoff
6. ✅ **Character Counter**: Conditional render at 450+ chars
7. ✅ **Mobile/Desktop**: Media query + Radix Dialog for mobile
8. ✅ **Error Differentiation**: `navigator.onLine` + `response.ok` checks

**No additional research needed.** All patterns have clear implementation paths with code examples. Ready for Phase 1 (Design & Contracts).

---

**Phase 0 Complete**: 2025-10-16
