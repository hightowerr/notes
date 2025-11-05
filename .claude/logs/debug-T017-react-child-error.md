# Debug Report: T017 - React Child Rendering Error

## Error Summary
**Test**: Manual browser testing of T017 implementation
**File**: Multiple locations across app
**Error**: "Objects are not valid as a React child (found: object with keys {text, effort_level, estimated_hours, relevance_score}). If you meant to render a collection of children, use an array instead."

---

## Hypothesis Analysis

### Initial Hypotheses
1. **[CONFIRMED] Dashboard renders Action objects directly as strings (line 547)**: Dashboard page tries to render entire Action object in JSX `{action}` instead of `{action.text}`
2. **[CONFIRMED] aiSummarizer confidence calculation spreads Action objects into string array (line 231)**: Confidence function tries to `.join(' ')` an array containing Action objects, converting them to `[object Object]`
3. **[NOT THE ISSUE] SummaryPanel Actions tab has incomplete type guard**: SummaryPanel properly extracts `action.text` with type guards (lines 258-264)

### Top Candidates
1. **[Most likely]**: Dashboard page line 547 - directly rendering `{action}` instead of `{action.text}`
2. **[Second likely]**: aiSummarizer line 231 - spreading Action objects into string array for confidence calculation

---

## Validation

**Locations Found**:

### Location 1: Dashboard Page (app/dashboard/page.tsx)
```typescript
// Line 547 - PROBLEM: Renders entire action object
{doc.summary.actions.map((action, idx) => (
  <li key={idx} className="text-muted-foreground">
    {action}  // ⚠️ This renders [object Object] if action is Action type
  </li>
))}
```

### Location 2: AI Summarizer (lib/services/aiSummarizer.ts)
```typescript
// Line 228-235 - PROBLEM: Spreads Action objects into string array
const allContent = [
  ...output.topics,           // string[]
  ...output.decisions,        // string[]
  ...output.actions,          // ⚠️ Action[] (not string[])
  ...output.lno_tasks.leverage,
  ...output.lno_tasks.neutral,
  ...output.lno_tasks.overhead,
].join(' ');  // ⚠️ Converts Action objects to "[object Object]"
```

**Test Output**:
React error thrown during rendering when Action objects are used as React children in Dashboard, or when confidence calculation tries to stringify Action objects.

---

## Root Cause

**Confirmed**: **TWO separate issues** with schema change from `actions: string[]` to `actions: Action[]`

**Issue 1 - Dashboard Rendering (CRITICAL - causes browser crash)**:
- **Location**: app/dashboard/page.tsx:547
- **Problem**: Directly renders `{action}` in JSX where `action` is now an `Action` object
- **Why This Breaks**: React cannot render objects as children - requires primitive types (string, number, etc.)
- **User Impact**:
  - What user action fails: Expanding document details in Dashboard
  - What user sees: "Objects are not valid as a React child" error, page crashes
  - User journey blocked: Cannot view actions in Dashboard expanded view

**Issue 2 - Confidence Calculation (NON-CRITICAL - silent data corruption)**:
- **Location**: lib/services/aiSummarizer.ts:231
- **Problem**: Spreads `output.actions` (Action[]) into array that gets `.join(' ')` for string matching
- **Why This Breaks**: Action objects get converted to "[object Object]" string, breaking pattern matching
- **User Impact**:
  - What user action fails: AI confidence scoring during document processing
  - What user sees: No visible error (silent failure)
  - User journey blocked: Confidence scores may be artificially inflated (placeholder pattern detection fails)

---

## Evidence

1. **Schema Change**: In lib/schemas.ts lines 60-74, `ActionSchema` changed from `z.array(z.string())` to `z.array(ActionSchema)` where ActionSchema is:
   ```typescript
   export const ActionSchema = z.object({
     text: z.string(),
     estimated_hours: z.number().min(0.25).max(8),
     effort_level: z.enum(['high', 'low']),
     relevance_score: z.number().min(0).max(1).optional(),
   });
   ```

2. **SummaryPanel WORKS**: Lines 258-274 properly handle both formats:
   ```typescript
   const actionText = typeof action === 'string' ? action : action?.text || '';
   ```

3. **Dashboard BROKEN**: Lines 545-549 assume string type:
   ```typescript
   {doc.summary.actions.map((action, idx) => (
     <li key={idx}>{action}</li>  // Expects string, gets Action object
   ))}
   ```

4. **Dashboard Type Definition**: Lines 28-36 define `DocumentSummary` with:
   ```typescript
   interface DocumentSummary {
     actions: string[];  // ⚠️ WRONG - should be Action[]
   }
   ```

---

## Corrective Plan

### Step 1: Fix Dashboard Type Definition
- **File**: app/dashboard/page.tsx
- **Line**: 28-36
- **Current**:
  ```typescript
  interface DocumentSummary {
    topics: string[];
    decisions: string[];
    actions: string[];  // ⚠️ Wrong type
    lno_tasks: {
      leverage: string[];
      neutral: string[];
      overhead: string[];
    };
  }
  ```
- **Change To**:
  ```typescript
  import type { Action } from '@/lib/schemas';

  interface DocumentSummary {
    topics: string[];
    decisions: string[];
    actions: Action[];  // ✅ Correct type from T017
    lno_tasks: {
      leverage: string[];
      neutral: string[];
      overhead: string[];
    };
  }
  ```
- **Reason**: Aligns Dashboard types with actual schema from T017 implementation

### Step 2: Fix Dashboard Actions Rendering
- **File**: app/dashboard/page.tsx
- **Line**: 545-549
- **Current**:
  ```typescript
  {doc.summary.actions.map((action, idx) => (
    <li key={idx} className="text-muted-foreground">
      {action}
    </li>
  ))}
  ```
- **Change To**:
  ```typescript
  {doc.summary.actions.map((action, idx) => {
    // Handle both old string format and new Action object format
    const actionText = typeof action === 'string' ? action : action?.text || '';

    return (
      <li key={idx} className="text-muted-foreground">
        {actionText}
        {/* Optional: Show time/effort metadata */}
        {typeof action === 'object' && action.estimated_hours && (
          <span className="text-xs text-muted-foreground ml-2">
            ({action.estimated_hours}h, {action.effort_level} effort)
          </span>
        )}
      </li>
    );
  })}
  ```
- **Reason**: Extracts `text` property from Action object for rendering, with backward compatibility

### Step 3: Fix aiSummarizer Confidence Calculation
- **File**: lib/services/aiSummarizer.ts
- **Line**: 228-235
- **Current**:
  ```typescript
  const allContent = [
    ...output.topics,
    ...output.decisions,
    ...output.actions,  // Action[] gets stringified to "[object Object]"
    ...output.lno_tasks.leverage,
    ...output.lno_tasks.neutral,
    ...output.lno_tasks.overhead,
  ].join(' ');
  ```
- **Change To**:
  ```typescript
  const allContent = [
    ...output.topics,
    ...output.decisions,
    ...output.actions.map(a => a.text),  // ✅ Extract text property
    ...output.lno_tasks.leverage,
    ...output.lno_tasks.neutral,
    ...output.lno_tasks.overhead,
  ].join(' ');
  ```
- **Reason**: Maps Action objects to their text strings before joining, ensures pattern matching works correctly

---

## Side Effects

**Potential Issues**:
- Dashboard may have **OLD data in database** with `actions: string[]` format from before T017
- API `/api/documents` route may need to handle both formats during transition period
- Export functionality in Dashboard uses `/api/export/[fileId]` which already handles Action objects correctly

**Related Code**:
- app/page.tsx (upload page): Uses SummaryPanel which ALREADY handles both formats correctly ✅
- app/api/export/[fileId]/route.ts: Already uses `DocumentOutput` type from schemas (should work) ✅
- __tests__/contract/outcomes.test.ts: May need test fixtures updated for new Action format

---

## Prevention

**How to avoid this**:
1. **Type-First Development**: Always update TypeScript interfaces FIRST when changing schemas
2. **Grep for Usages**: Search codebase for all `.actions` usages when changing action schema
3. **Backward Compatibility Pattern**: Use type guards for gradual migration:
   ```typescript
   const text = typeof action === 'string' ? action : action.text;
   ```
4. **Test Both Renders**: Test both SummaryPanel AND Dashboard when changing data structures

**Tests to add**:
- Dashboard component test for rendering Action objects
- Integration test: Upload document → Process → View in Dashboard (full cycle)
- Contract test validating DocumentOutput schema matches API responses

**Validation to include**:
- Runtime type checking at API boundaries (Zod parse on responses)
- Console warnings when old string format detected: `console.warn('[MIGRATION] Legacy action format detected')`

---

## Next Steps

1. Apply corrective plan (Steps 1-3 above)
2. Re-run code-reviewer on changes
3. Test in browser:
   - Upload new document with T017 schema
   - View in Dashboard expanded view
   - Verify actions render correctly with metadata
   - Check confidence scores are calculated correctly
4. Check for old documents in database - may need migration script
5. If still failing, check API responses for schema mismatches

---

## Technical Notes

**Why SummaryPanel works but Dashboard doesn't**:
- SummaryPanel was updated with T017 changes (line 258-264 type guards)
- Dashboard still uses old string assumption (never updated for T017)

**Type System Caught This**:
- TypeScript should have caught this if `DocumentSummary` interface was aligned with `DocumentOutput`
- Dashboard uses local interface instead of importing from schemas (anti-pattern)

**Migration Strategy**:
- Implement backward-compatible rendering (handle both string and Action)
- Gradually phase out old data through reprocessing
- Eventually remove string compatibility after data migration complete
