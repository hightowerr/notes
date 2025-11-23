# Code Review: Task Intelligence - Draft Generation & Quality Refinement (T010-T015)

## Status
**FAIL**

## Summary
Tasks T010-T015 implement Draft Task Generation & Approval (User Story 3) and Quality Refinement (User Story 4). The implementation includes comprehensive test coverage and functional vertical slices. However, there are **5 critical blocking issues** that prevent production deployment: missing contract test file (T014), incorrect Supabase client usage in API routes, wrong function signatures in quality evaluation calls, missing cycle detection implementation, and wrong parameters in coverage analysis. Additionally, there are **7 high-priority issues** including hardcoded P5 trigger logic and unused utility functions.

---

## Issues Found

### CRITICAL

**File**: `__tests__/contract/quality-refinement.test.ts`  
**Line**: N/A  
**Issue**: Test file does not exist but T014 marked as complete in tasks.md  
**Fix**: Create the missing contract test file with test cases for:
- Valid request with vague task → returns split suggestion
- Task with missing prerequisites → returns insert suggestion  
- Near-duplicate tasks → returns merge suggestion
- Already clear task (score >0.8) → returns empty suggestions

---

**File**: `app/api/agent/generate-draft-tasks/route.ts`  
**Line**: 9  
**Issue**: Uses wrong Supabase client - imports from `@/lib/supabase` (browser client) instead of server client  
**Fix**: Change import to:
```typescript
import { createClient } from '@/lib/supabase/server';
// Then in the handler:
const supabase = await createClient();
```

---

**File**: `app/api/agent/accept-draft-tasks/route.ts`  
**Line**: 4  
**Issue**: Uses wrong Supabase client - imports from `@/lib/supabase` (browser client) instead of server client  
**Fix**: Change import to:
```typescript
import { createClient } from '@/lib/supabase/server';
// Then in the handler:
const supabase = await createClient();
```

---

**File**: `lib/services/qualityRefinement.ts`  
**Line**: 5  
**Issue**: Uses wrong Supabase client - imports from `@/lib/supabase` (browser client) instead of server client  
**Fix**: This is a service file called from API routes. Either:
1. Pass supabase client as parameter to `suggestRefinements()`, OR
2. Import and use server client directly (requires making function accept/return async)

Recommended approach:
```typescript
export async function suggestRefinements({
  taskId,
  taskText,
  qualityIssues,
  supabaseClient, // Add parameter
}: QualityRefinementInput & { supabaseClient: SupabaseClient }): Promise<QualityRefinementOutput>
```

---

**File**: `app/api/agent/accept-draft-tasks/route.ts`  
**Line**: 94  
**Issue**: Wrong function signature for `evaluateQuality()` - called with `(draft.id, draft.task_text)` but actual signature is `(taskText: string, forceHeuristic?: boolean)`  
**Fix**: Change line 94 to:
```typescript
const qualityResult = await evaluateQuality(draft.task_text, false);
```

---

**File**: `app/api/agent/accept-draft-tasks/route.ts`  
**Line**: 217  
**Issue**: Cycle detection not implemented - hardcoded to `false` (violates FR-007 requirement)  
**Fix**: Implement cycle detection using existing `insertTaskWithEmbedding` utility or Kahn's algorithm:
```typescript
// Option 1: Use existing utility (recommended)
import { insertTaskWithEmbedding } from '@/lib/services/taskInsertionService';
// Replace manual insertion (lines 97-128) with:
const { task_ids, cycle_detected } = await insertTaskWithEmbedding(acceptedDrafts, user.id);

// Option 2: Implement Kahn's algorithm directly (similar to taskInsertionService.ts:271-357)
```

---

**File**: `app/api/agent/accept-draft-tasks/route.ts`  
**Line**: 185  
**Issue**: Wrong function signature for `analyzeCoverage()` - missing required parameters `taskTexts` and `taskEmbeddings`  
**Fix**: Fetch task texts and embeddings before calling:
```typescript
// Fetch all tasks with embeddings
const { data: allTasksData, error: tasksError } = await supabase
  .from('task_embeddings')
  .select('task_id, task_text, embedding')
  .eq('user_id', user.id);

if (allTasksData && !tasksError) {
  const taskIds = allTasksData.map(t => t.task_id);
  const taskTexts = allTasksData.map(t => t.task_text);
  const taskEmbeddings = allTasksData.map(t => t.embedding);
  
  const coverageResult = await analyzeCoverage(
    outcome.outcome_text,
    taskIds,
    taskTexts,
    taskEmbeddings
  );
  newCoveragePercentage = coverageResult.coverage_percentage;
}
```

---

### HIGH

**File**: `app/api/agent/generate-draft-tasks/route.ts`  
**Line**: 66  
**Issue**: P5 trigger logic hardcoded to `true` instead of checking actual coverage <80% (violates FR-025)  
**Fix**: Calculate actual coverage after P10 hypothetically and check threshold:
```typescript
// After P10 generation (line 56), calculate hypothetical coverage
const hypotheticalTaskTexts = [...existingTaskTexts, ...p10Drafts.map(d => d.task_text)];
const hypotheticalEmbeddings = [...existingEmbeddings, ...p10Drafts.map(d => d.embedding)];

const hypotheticalCoverage = await analyzeCoverage(
  outcome_text,
  [...existing_task_ids, ...p10Drafts.map(d => d.id)],
  hypotheticalTaskTexts,
  hypotheticalEmbeddings
);

phase5Triggered = hypotheticalCoverage.coverage_percentage < 80;
```

---

**File**: `app/api/agent/accept-draft-tasks/route.ts`  
**Line**: 9  
**Issue**: Imports `insertTaskWithEmbedding` utility but never uses it - manual insertion used instead  
**Fix**: Replace manual task insertion (lines 97-128) with utility function call:
```typescript
// Remove manual insertion code
// Use the imported utility instead:
const insertResult = await insertTaskWithEmbedding(acceptedDrafts, user.id, supabase);
insertedTaskIds.push(...insertResult.task_ids);
```

---

**File**: `app/api/agent/generate-draft-tasks/route.ts`  
**Line**: 115-120  
**Issue**: Fetches existing session but doesn't validate user ownership until update (security gap)  
**Fix**: Add user ownership check immediately after fetch:
```typescript
if (fetchSessionError || !existingSession) {
  return Response.json({ error: 'Session not found' }, { status: 404 });
}

// Verify session belongs to user BEFORE using data
const { data: sessionOwner } = await supabase
  .from('agent_sessions')
  .select('user_id')
  .eq('id', session_id)
  .single();

if (sessionOwner?.user_id !== user.id) {
  return Response.json({ error: 'Unauthorized' }, { status: 403 });
}
```

---

**File**: `app/api/agent/generate-draft-tasks/route.ts`  
**Line**: N/A  
**Issue**: Missing performance logging - no execution time tracking (violates observability principle)  
**Fix**: Add timing measurements:
```typescript
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  try {
    // ... existing code ...
    
    const p10StartTime = Date.now();
    const { drafts: p10Drafts } = await generateDrafts(...);
    const p10Duration = Date.now() - p10StartTime;
    
    // ... P5 logic ...
    const p5Duration = Date.now() - p5StartTime;
    
    const totalDuration = Date.now() - startTime;
    
    console.log('[API:GenerateDrafts] Performance', {
      total_duration_ms: totalDuration,
      p10_duration_ms: p10Duration,
      p5_duration_ms: p5Duration,
      drafts_count: allDrafts.length,
    });
  }
}
```

---

**File**: `app/api/agent/accept-draft-tasks/route.ts`  
**Line**: 97-128  
**Issue**: No error handling for duplicate `task_id` insertions - will fail silently or throw generic error  
**Fix**: Add duplicate check before insertion:
```typescript
// Before insertion loop (line 88):
const existingIds = new Set(
  (await supabase
    .from('task_embeddings')
    .select('task_id')
    .in('task_id', acceptedDrafts.map(d => d.id))
  ).data?.map(t => t.task_id) || []
);

if (existingIds.size > 0) {
  return Response.json(
    { error: 'Duplicate task IDs detected', duplicate_ids: Array.from(existingIds) },
    { status: 400 }
  );
}
```

---

**File**: `app/api/tasks/[id]/refine/route.ts`  
**Line**: 29-32  
**Issue**: Redundant validation - validates `task_id` from URL params against itself  
**Fix**: Remove unnecessary validation or validate against request body if needed:
```typescript
// Remove lines 29-32:
// const validatedBody = validateRequestSchema(
//   refineTaskRequestSchema, 
//   { task_id: taskId }
// );

// Just use taskId directly from params
const taskId = params.id;
```

---

**File**: `lib/services/qualityRefinement.ts`  
**Line**: N/A  
**Issue**: No retry logic for AI failures (unlike `qualityEvaluation.ts` which has retry after 2s delay)  
**Fix**: Add retry logic consistent with qualityEvaluation pattern:
```typescript
export async function suggestRefinements(...): Promise<QualityRefinementOutput> {
  try {
    return await generateRefinementsAI(...);
  } catch (error) {
    console.error('[QualityRefinement] AI refinement failed, retrying after 2s...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    try {
      return await generateRefinementsAI(...);
    } catch (retryError) {
      console.error('[QualityRefinement] AI refinement failed again');
      throw new QualityRefinementError(
        'Failed to generate refinements after retry',
        'AI_GENERATION_FAILED'
      );
    }
  }
}
```

---

### MEDIUM

**File**: `lib/services/draftTaskGeneration.ts`  
**Line**: 139-150  
**Issue**: `createTimeout()` function defined but never used in `generateDrafts()`  
**Fix**: Either use the timeout or remove the function:
```typescript
// Option 1: Add timeout to generation
const { drafts } = await Promise.race([
  generateDrafts(...),
  createTimeout(10000) // 10s timeout
]);

// Option 2: Remove unused function (lines 139-150)
```

---

**File**: `lib/services/deduplication.ts`  
**Line**: 12-42  
**Issue**: No input validation - doesn't handle empty arrays or null embeddings gracefully  
**Fix**: Add validation at function start:
```typescript
export function deduplicateDrafts(...): DraftTask[] {
  // Validate inputs
  if (!Array.isArray(p10Drafts) || !Array.isArray(p5Drafts)) {
    console.warn('[Deduplication] Invalid input arrays');
    return [];
  }
  
  // Check for null embeddings
  const validP10 = p10Drafts.filter(d => d.embedding && d.embedding.length > 0);
  const validP5 = p5Drafts.filter(d => d.embedding && d.embedding.length > 0);
  
  // ... rest of logic with validP10, validP5
}
```

---

**File**: `lib/services/deduplication.ts`  
**Line**: 21-33  
**Issue**: O(n*m) algorithm performance concern for large draft sets (could be slow)  
**Fix**: Document performance characteristics or optimize if needed:
```typescript
/**
 * Deduplicates P10 and P5 drafts based on embedding similarity
 * 
 * Performance: O(n*m) where n = P10 count, m = P5 count
 * Expected: <100ms for typical case (3 P10 drafts × 2 P5 drafts = 6 comparisons)
 * Warning: May be slow if P10 or P5 count > 20 drafts
 * 
 * @param p10Drafts - Drafts generated by Phase 10 (semantic gap filling)
 * ...
 */
```

---

**File**: `app/priorities/components/DraftTaskCard.tsx`  
**Line**: 43-46  
**Issue**: Checkbox state not connected to `onAccept` - clicking accept doesn't check the box  
**Fix**: Update checkbox state when accept is clicked:
```typescript
const handleAccept = () => {
  setIsChecked(true); // Check the box
  onAccept(draft.id);
};
```
Or remove checkbox if not needed for selection tracking.

---

**File**: `app/priorities/components/DraftTaskCard.tsx`  
**Line**: 25-27  
**Issue**: onEdit callback called on save but parent might expect onAccept separately  
**Fix**: Clarify component contract - document that editing triggers onEdit, accepting triggers onAccept:
```typescript
interface DraftTaskCardProps {
  draft: DraftTask;
  onEdit: (id: string, newText: string) => void; // Called when user saves edit
  onAccept: (id: string) => void; // Called when user clicks Accept (after optional edit)
  onDismiss: (id: string) => void;
}
```

---

**File**: `app/priorities/components/DraftTaskCard.tsx`  
**Line**: 30-32, 114-124  
**Issue**: No visual feedback during accept/dismiss (loading state)  
**Fix**: Add loading state:
```typescript
const [isAccepting, setIsAccepting] = useState(false);
const [isDismissing, setIsDismissing] = useState(false);

const handleAccept = async () => {
  setIsAccepting(true);
  await onAccept(draft.id);
  // Parent should remove card after success
};

// Update button:
<button
  onClick={handleAccept}
  disabled={isAccepting}
  className={`px-3 py-1 text-sm ${isAccepting ? 'opacity-50' : ''} ...`}
>
  {isAccepting ? 'Accepting...' : '✓ Accept'}
</button>
```

---

**File**: `app/priorities/components/RefinementModal.tsx`  
**Line**: 32-56  
**Issue**: No error retry mechanism - user must close and reopen modal to retry  
**Fix**: Add retry button in error state:
```typescript
{error ? (
  <div className="text-center py-8">
    <div className="text-red-500 mb-4">{error}</div>
    <button
      onClick={loadRefinementSuggestions}
      className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
    >
      Retry
    </button>
  </div>
) : ...}
```

---

**File**: `app/priorities/components/RefinementModal.tsx`  
**Line**: 63  
**Issue**: `onApplyRefinement` callback receives new texts but not the action type (split/merge/rephrase)  
**Fix**: Pass the full suggestion or at minimum the action type:
```typescript
const handleApplyRefinement = () => {
  if (selectedSuggestionIndex === null || !refinementSuggestions) return;

  const selectedSuggestion = refinementSuggestions.suggestions[selectedSuggestionIndex];
  onApplyRefinement(originalTaskId, selectedSuggestion.new_task_texts, selectedSuggestion.action);
  onClose();
};

// Update interface:
interface RefinementModalProps {
  onApplyRefinement: (taskId: string, newTexts: string[], action: 'split' | 'merge' | 'rephrase') => void;
}
```

---

### LOW

**File**: `__tests__/contract/draft-generation.test.ts`  
**Line**: N/A  
**Issue**: Tests are mocks only - no actual API calls made  
**Fix**: Consider adding integration tests that make real API calls to validate end-to-end flow

---

**File**: `__tests__/contract/draft-generation.test.ts`  
**Line**: N/A  
**Issue**: Missing test for edited draft handling  
**Fix**: Add test case:
```typescript
it('should accept edited drafts and use edited text', async () => {
  const acceptRequest = {
    session_id: 'session-123',
    accepted_draft_ids: ['draft-001'],
    edited_drafts: [{
      id: 'draft-001',
      task_text: 'Edited task text with more specificity'
    }]
  };
  
  // Verify edited text is used instead of original
  expect(insertedTask.task_text).toBe('Edited task text with more specificity');
});
```

---

**File**: `__tests__/integration/phase10-phase5-integration.test.ts`  
**Line**: N/A  
**Issue**: No tests for actual P10 → P5 sequential trigger based on coverage  
**Fix**: Add integration test:
```typescript
it('should trigger P5 only when P10 coverage is <80%', async () => {
  // Mock P10 to generate drafts that result in 75% coverage
  const p10Coverage = await calculateCoverageAfterDrafts(p10Drafts);
  expect(p10Coverage).toBeLessThan(80);
  
  // Verify P5 was triggered
  expect(phase5_triggered).toBe(true);
});
```

---

**File**: `__tests__/integration/phase10-phase5-integration.test.ts`  
**Line**: N/A  
**Issue**: No tests for coverage recalculation after P10  
**Fix**: Add test to verify coverage increases after P10 draft acceptance

---

## Standards Compliance

- [X] Tech stack patterns followed (Next.js 15, React 19, TypeScript, Vercel AI SDK)
- [ ] **FAIL**: TypeScript strict mode compliance (wrong function signatures in 3 places)
- [ ] **FAIL**: Files in scope only (missing critical test file T014)
- [X] TDD workflow followed (tests written before implementation for T010, T011)
- [ ] **FAIL**: Error handling proper (missing cycle detection, no duplicate ID checks)

## Implementation Quality

**Frontend**:
- [X] ShadCN CLI used (components properly structured)
- [X] Accessibility WCAG 2.1 AA (semantic HTML, ARIA labels, keyboard navigation)
- [X] Responsive design (modal uses max-w-2xl, proper spacing)
- [ ] **PARTIAL**: Backend integration verified (wrong Supabase client, wrong function signatures)

**Backend**:
- [X] Zod validation present (all API routes have schema validation)
- [X] Error logging proper (console.error with context)
- [ ] **FAIL**: API contract documented (T014 contract test missing)
- [ ] **FAIL**: Service layer properly structured (wrong Supabase client usage)

## Vertical Slice Check

- [X] User can SEE result (draft cards, quality badges, refinement modal)
- [X] User can DO action (generate drafts, accept drafts, refine tasks)
- [ ] **FAIL**: User can VERIFY outcome (cycle detection not implemented, may silently fail)
- [ ] **FAIL**: Integration complete (wrong function signatures prevent execution)

---

## Strengths

1. **Excellent Test Coverage**: T010 and T011 provide comprehensive contract and integration tests for draft generation and deduplication
2. **Clean Component Architecture**: DraftTaskCard and RefinementModal are well-structured with clear props interfaces
3. **Proper State Management**: Components use appropriate React hooks (useState, useEffect) with correct dependencies
4. **Strong Deduplication Logic**: Embedding similarity-based deduplication with 0.85 threshold is well-implemented
5. **Good Error Handling Patterns**: Custom error classes (DraftTaskGenerationError, QualityRefinementError) with error codes
6. **Vercel AI SDK Migration**: Consistent use of `generateObject()` for structured output validation
7. **Comprehensive Zod Schemas**: All API inputs validated with detailed schemas

---

## Recommendations

### Immediate (Must Fix Before Deployment)

1. **Create T014 Contract Test**: Write `__tests__/contract/quality-refinement.test.ts` with 4 test cases per tasks.md specification
2. **Fix Supabase Client Usage**: Update 3 files to use server client instead of browser client
3. **Fix Function Signatures**: Correct `evaluateQuality()` call in accept-draft-tasks/route.ts line 94
4. **Implement Cycle Detection**: Replace placeholder on line 217 with actual Kahn's algorithm or use existing utility
5. **Fix Coverage Analysis Call**: Add required parameters (taskTexts, taskEmbeddings) on line 185
6. **Fix P5 Trigger Logic**: Calculate actual coverage after P10 instead of hardcoding to `true`
7. **Add Duplicate ID Check**: Prevent insertion failures from duplicate task_id values

### High Priority (Should Fix Soon)

8. **Add Performance Logging**: Implement timing measurements in all API routes per observability principle
9. **Add Retry Logic**: Implement 2s retry in qualityRefinement.ts consistent with qualityEvaluation.ts
10. **Add User Ownership Check**: Validate session ownership before using session data (security)
11. **Use Existing Utility**: Replace manual task insertion with `insertTaskWithEmbedding` utility

### Medium Priority (Nice to Have)

12. **Add Input Validation**: Handle empty arrays and null embeddings in deduplication.ts
13. **Add Loading States**: Implement visual feedback during accept/dismiss in DraftTaskCard
14. **Add Retry UI**: Allow users to retry failed refinement suggestions
15. **Document Performance**: Add O(n*m) complexity note in deduplication function

### Low Priority (Optional)

16. **Add Integration Tests**: Create real API call tests for end-to-end validation
17. **Add P10→P5 Coverage Test**: Verify sequential trigger logic with actual coverage calculation

---

## Next Steps

**If FAIL**: Return to implementation agents (frontend-ui-builder + backend-engineer) with feedback

**Critical Fixes Required**:
1. Create missing T014 contract test file
2. Fix Supabase client imports in 3 files (generate-draft-tasks, accept-draft-tasks, qualityRefinement)
3. Fix evaluateQuality() call signature (line 94)
4. Implement cycle detection (line 217)
5. Fix analyzeCoverage() call signature (line 185)
6. Fix P5 trigger logic (line 66)
7. Add duplicate ID validation

**Estimated Fix Time**: 4-6 hours for critical issues

**Re-review Required**: Yes - after all critical issues addressed

---

## Security

**Issues Found**:
1. **Session Ownership Gap** (HIGH): User can access session data before ownership validation (generate-draft-tasks/route.ts:115-120)
2. **Supabase Client Misuse** (CRITICAL): Using browser client in API routes bypasses RLS policies, potential data leak

**No SQL Injection Risks**: All queries use parameterized Supabase client methods
**No Authentication Bypass**: All routes properly check `getAuthUser()` before processing

---

## Test Quality Assessment

**Coverage**: Good - 2/3 required tests exist (T010, T011 present; T014 missing)

**Quality**: High - existing tests are well-structured with:
- Clear test case descriptions
- Proper mocking strategy (calculateCosineSimilarity mocked for controlled testing)
- Schema validation checks
- Edge case coverage (cycle detection, deduplication thresholds)

**Gaps**:
- Missing T014 contract test (critical)
- No real API integration tests
- No coverage recalculation tests
- No edited draft acceptance tests

**Pass Rate Estimate**: 85% of implemented tests would pass (if dependencies were correct)

---

## Vertical Slice Compliance

**User Story 3 (Draft Generation & Approval)**:
- SEE IT: ✅ Users can see draft tasks with reasoning and source labels
- DO IT: ✅ Users can edit drafts and accept them
- VERIFY IT: ❌ Cycle detection not implemented, users cannot verify safe insertion

**User Story 4 (Quality Refinement)**:
- SEE IT: ✅ Users can see refinement suggestions in modal
- DO IT: ✅ Users can select and apply refinements
- VERIFY IT: ⚠️ Partial - refinement applies but action type not passed to parent

**Overall Compliance**: PARTIAL - visible and interactive, but verification is incomplete

---

## Performance Analysis

**Draft Generation**:
- Target: <5s p95 (FR requirement)
- Estimate: ~3-4s (GPT-4o-mini is fast, sequential area processing may add latency)
- Risk: Sequential processing in draftTaskGeneration.ts could be parallelized

**Draft Acceptance**:
- Target: <2s (FR requirement)
- Estimate: ~1.5-2s without cycle detection, ~2.5-3s with proper implementation
- Risk: Manual insertion + quality evaluation is slower than using utility function

**Deduplication**:
- Complexity: O(n*m) where n=P10 count, m=P5 count
- Expected: <100ms for typical case (3×2=6 comparisons)
- Risk: None for expected draft counts (<10 total)

**Recommendations**:
1. Add performance logging to measure actual latency
2. Consider parallelizing draft generation for multiple areas
3. Use existing `insertTaskWithEmbedding` utility to improve acceptance speed

