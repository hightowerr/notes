# Research: Reasoning Trace Enhancements

**Feature**: 009-docs-shape-pitches
**Date**: 2025-10-23
**Status**: Complete

## Research Questions

All technical decisions were resolved during the `/clarify` command phase. This document consolidates the rationale for key architectural choices.

## 1. Auto-Expand Behavior Scope

**Question**: How should "first visit" auto-expand be scoped to balance discoverability with user control?

**Decision**: Browser session-based using `sessionStorage` (resets on tab close)

**Rationale**:
- **Discoverability**: New visitors see the trace automatically, reducing "hidden feature" problem
- **User Control**: Users can collapse trace within session and it stays collapsed on page reload
- **Non-intrusive**: Resets on tab close prevents "trace always expanded" annoyance after initial discovery
- **Implementation Simplicity**: sessionStorage is widely supported, requires no backend state

**Alternatives Considered**:
- **Permanent localStorage flag** (once ever per user): Rejected - too aggressive, user loses control after first visit
- **Once per agent session** (new flag per trace): Rejected - adds complexity tracking which traces user has seen
- **Based on collapse/expand history**: Rejected - conflates user preference with discovery mechanism

**Code Pattern**:
```typescript
// useSessionStorage hook
const [hasSeenTrace, setHasSeenTrace] = useSessionStorage('trace-first-visit', false);
const shouldAutoExpand = !hasSeenTrace && traceSteps.length > 0;
```

---

## 2. Filter Persistence Strategy

**Question**: Should filter selections (tool type, status) persist across page reloads?

**Decision**: Session-only state (React `useState`), resets on page reload

**Rationale**:
- **Debugging Context**: Filters are debugging tools, not user preferences. Fresh start on reload reduces confusion.
- **Mental Model**: Users expect filters to apply to current debugging session, not persist indefinitely
- **Reduced Complexity**: No localStorage management, no state synchronization across tabs
- **Performance**: React state updates are instant (<100ms target easily met)

**Alternatives Considered**:
- **Persist to localStorage**: Rejected - adds complexity without clear user value, can cause confusion if user reloads and forgets filters are active
- **Persist per trace/session**: Rejected - complex state management, unclear UX benefit
- **Reset when trace panel collapsed**: Rejected - too aggressive, user loses filters when toggling panel

**Code Pattern**:
```typescript
// Component state - resets on unmount/reload
const [selectedTool, setSelectedTool] = useState<string>('all');
const [statusFilters, setStatusFilters] = useState({ success: true, failed: true, skipped: true });
```

---

## 3. Export Failure Handling

**Question**: When trace export fails (network issues, browser blocks download, quota exceeded), what fallback should the system provide?

**Decision**: Automatic fallback to clipboard copy with user notification

**Rationale**:
- **User Goal**: User wants trace data regardless of delivery mechanism (file vs clipboard)
- **Reliability**: Clipboard API has broader support than download in some contexts (e.g., sandboxed environments)
- **User Experience**: Seamless fallback with toast notification ("Downloaded" vs "Copied to clipboard") keeps user informed
- **Simplicity**: No retry logic, no manual intervention required

**Alternatives Considered**:
- **Show error with manual retry button**: Rejected - adds UI complexity, forces user action
- **Automatically retry 2-3 times**: Rejected - delays feedback, likely to fail again for same reason (e.g., browser security policy)
- **Offer multiple export formats**: Rejected - out of scope, JSON is sufficient for debugging

**Code Pattern**:
```typescript
const handleExport = async () => {
  try {
    // Attempt file download
    const blob = new Blob([JSON.stringify(trace, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reasoning-trace-${sessionId}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Trace exported successfully');
  } catch (error) {
    // Fallback to clipboard
    await navigator.clipboard.writeText(JSON.stringify(trace, null, 2));
    toast.info('Export failed, trace copied to clipboard');
  }
};
```

---

## 4. Tool Filter Population Strategy

**Question**: Should the tool filter dropdown show all possible tools or only tools used in the current trace?

**Decision**: Show all Mastra tools, disable (gray out) tools not present in the current trace

**Rationale**:
- **Discoverability**: Users learn which tools exist in the system, even if not used in current trace
- **Consistency**: Dropdown options don't change between traces, reducing cognitive load
- **Context**: Disabled state clearly communicates "this tool exists but wasn't used here"
- **Future-Proof**: New tools can be added to registry without changing filter UI logic

**Alternatives Considered**:
- **Dynamic-only list** (only show used tools): Rejected - doesn't help users understand tool ecosystem, list changes per trace
- **Fixed list with no disabled state**: Rejected - confusing when filter shows 0 results
- **Dynamically populate on scroll**: Rejected - over-engineered for static list of 5-7 tools

**Implementation Details**:
- Tool registry: `['semantic-search', 'detect-dependencies', 'get-document-context', 'query-task-graph', 'cluster-by-similarity']`
- Disabled state determined by: `!traceSteps.some(step => step.toolName === tool)`

**Code Pattern**:
```typescript
const ALL_MASTRA_TOOLS = ['semantic-search', 'detect-dependencies', ...];
const usedTools = new Set(traceSteps.map(step => step.toolName));

<Select>
  {ALL_MASTRA_TOOLS.map(tool => (
    <SelectItem key={tool} value={tool} disabled={!usedTools.has(tool)}>
      {tool} {!usedTools.has(tool) && '(not used)'}
    </SelectItem>
  ))}
</Select>
```

---

## 5. Keyboard Accessibility Approach

**Question**: Should trace panel interactions support custom keyboard navigation beyond native browser behavior?

**Decision**: Follow browser defaults (no custom keyboard handlers)

**Rationale**:
- **ShadCN Baseline**: All UI components (Select, Checkbox, Accordion, Button) provide WCAG-compliant keyboard navigation
- **Complexity vs. Value**: Custom shortcuts (e.g., Ctrl+F to focus filter, Escape to clear) add development time without clear user demand
- **Scope Management**: 2-3 day enhancement should focus on core UX improvements, not advanced accessibility features
- **Future Path**: Can add custom shortcuts in Phase 6+ based on user feedback

**Alternatives Considered**:
- **Full ARIA keyboard navigation** (Tab, Enter, Arrow keys, Escape): Rejected - significant development effort, out of scope
- **Basic shortcuts** (Tab and Enter only): Rejected - ShadCN already provides this, no additional work needed
- **Screen reader optimization**: Rejected - requires ARIA labels and live regions, better suited for dedicated accessibility sprint

**Baseline Accessibility**:
- ShadCN components handle focus management
- Logical tab order (filters → trace steps → export button)
- Enter/Space activate buttons and checkboxes
- Arrow keys navigate Select dropdown options

---

## Technology Stack Summary

**UI Framework**: React 19 + Next.js 15 (App Router)
**Component Library**: ShadCN UI (Accordion, Select, Checkbox, Badge, Alert, Button)
**Styling**: Tailwind CSS v4 with custom depth layer system
**State Management**: React hooks (useState, useMemo, useCallback)
**Storage**: Browser APIs (localStorage, sessionStorage, clipboard)
**Testing**: Manual testing guide (automated tests follow existing Vitest + React Testing Library pattern)

**Performance Targets**:
- Filtering operations: <100ms (client-side memoized array filtering)
- Export generation: <500ms for 10-20 steps (JSON.stringify is fast)
- No jank on expand/collapse (CSS transitions only, no layout recalculation)

**Browser Support**:
- Modern browsers (Chrome 90+, Firefox 88+, Safari 14+, Edge 90+)
- localStorage/sessionStorage required (fallback: feature degrades gracefully)
- Clipboard API required for export fallback (widely supported in modern browsers)

---

## Implementation Priorities

1. **Hooks First** (useLocalStorage, useSessionStorage): Foundation for all features
2. **Filtering** (FilterControls + integration): Highest user value (reduces cognitive load)
3. **Error Highlighting** (ErrorSummaryBanner + visual styles): Critical for debugging failures
4. **Export** (ExportButton + clipboard fallback): Enables external debugging workflows
5. **Discoverability** (View Reasoning button + auto-expand): Increases feature adoption

Each priority delivers complete user value (SEE + DO + VERIFY) per vertical slice architecture.

---

## Open Questions

**None** - all technical decisions resolved during clarification phase.

---

## References

- Phase 4 pitch: `docs/shape-up-pitches/phase-4-integration-ui.md`
- Existing component: `app/components/ReasoningTracePanel.tsx`
- Design system: `.claude/standards.md` (depth layers, color semantics, WCAG AA compliance)
- Clarifications: `specs/009-docs-shape-pitches/spec.md` (Session 2025-10-23)
