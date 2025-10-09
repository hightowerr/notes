# Debug Report: T002 Test Failures

**Date:** 2025-10-08
**Task:** T002 [SLICE] User sees AI summary appear automatically
**Test Results:** 30 failed | 23 passed | 9 skipped (62 total tests)
**Duration:** 26.80s

## Error Summary

Test suite shows 30 failures across 5 test files after T002 implementation (backend AI summarization + frontend display). T001 tests (18 passing) appear unaffected, suggesting T002-specific issues.

## Initial Hypotheses

### **1. Missing OPENAI_API_KEY in Test Environment [HIGH CONFIDENCE]**
**Evidence:**
- `vitest.config.ts` (lines 17-21) only exposes Supabase env variables
- `.env.local` contains `OPENAI_API_KEY=sk-proj-XE5-YAW...`
- `/app/api/process/route.ts` line 18 imports `extractStructuredData` from `aiSummarizer`
- `aiSummarizer` service likely requires OpenAI API key for structured data extraction
- T002 contract tests call `/api/process` which will fail without API key

**Supporting Evidence:**
```typescript
// vitest.config.ts - MISSING OPENAI_API_KEY
env: {
  NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL || 'https://test.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'test-key-placeholder',
  // ❌ OPENAI_API_KEY is NOT exposed to test environment
},
```

**Contradicting Evidence:** None - this is a clear configuration gap.

---

### **2. Next.js 15 Dynamic Route Params Await Requirement [MEDIUM CONFIDENCE]**
**Evidence:**
- Next.js 15 made route params async (requires `await params`)
- `/app/api/status/[fileId]/route.ts` line 22 uses: `const { fileId } = params;`
- Should be: `const { fileId } = await params;` in Next.js 15

**Supporting Evidence:**
- Next.js 15 release notes document this breaking change
- Status endpoint tests (`summary-flow.test.ts` lines 109, 139) call `/api/status/[fileId]`

**Contradicting Evidence:**
- Some Next.js 15 apps still work with old syntax (TypeScript may not catch this)
- Would only affect status endpoint tests, not all 30 failures

---

### **3. Missing Database Tables/Migration [MEDIUM CONFIDENCE]**
**Evidence:**
- Tests reference `processed_documents` table (lines 170, 196, 222 in `summary-flow.test.ts`)
- Backend implementation creates records in `processed_documents` (line 169 in `process/route.ts`)
- Migration file may not have been applied to test database

**Supporting Evidence:**
- Integration tests directly query `processed_documents` table
- Database schema needs: `id`, `file_id`, `markdown_storage_path`, `json_storage_path`, `structured_output`, `confidence`, `processing_duration`, `processed_at`, `expires_at`

**Contradicting Evidence:**
- T001 tests pass, suggesting database connection works
- Supabase setup appears complete based on T001 success

---

### **4. Service Files Missing Exports [LOW CONFIDENCE]**
**Evidence:**
- `process/route.ts` imports `convertToMarkdown`, `extractStructuredData`, `calculateLowConfidence`
- These functions must exist in `/lib/services/noteProcessor.ts` and `/lib/services/aiSummarizer.ts`

**Supporting Evidence:**
- Files exist (confirmed via Grep)
- May have implementation issues or missing exports

**Contradicting Evidence:**
- TypeScript would catch missing imports at build time
- Less likely to be root cause

---

### **5. React Testing Library + React 19 Compatibility [MEDIUM CONFIDENCE]**
**Evidence:**
- Component tests use `@testing-library/react@^16.1.0` with React 19
- Frontend tests (`summary-display.test.tsx`, `SummaryPanel.test.tsx`) may have rendering issues
- `userEvent.setup()` with `{ delay: null }` used in tests (line 28 in `summary-display.test.tsx`)

**Supporting Evidence:**
- React 19 is brand new, testing library may have compatibility issues
- Fake timers used (`vi.useFakeTimers()` line 18) which can cause timing issues

**Contradicting Evidence:**
- Testing Library typically maintains React compatibility
- Would only affect 2 frontend test files, not backend contract tests

---

### **6. Mock Fetch Implementation Issues [MEDIUM CONFIDENCE]**
**Evidence:**
- `summary-display.test.tsx` line 14 mocks global fetch: `global.fetch = mockFetch;`
- Complex mock implementation with polling logic (lines 41-76)
- Mock uses `pollCount` state variable that may not reset between tests

**Supporting Evidence:**
- Frontend integration tests require fetch mocking for `/api/upload` and `/api/status`
- Async mock implementation with timers is error-prone

**Contradicting Evidence:**
- `beforeEach()` clears mocks (line 19)
- This pattern is standard for testing fetch calls

---

### **7. Async Timing Issues with Status Polling [HIGH CONFIDENCE]**
**Evidence:**
- Frontend tests rely on polling mechanism with 2-second intervals
- `vi.advanceTimersByTime(2000)` used to simulate polling (lines 100, 111, 118)
- Complex state transitions: processing → processing → completed
- `waitFor()` timeouts may be insufficient

**Supporting Evidence:**
```typescript
// summary-display.test.tsx line 99-108
vi.advanceTimersByTime(2000); // Advance timers
await waitFor(() => { // Wait for effect
  expect(mockFetch).toHaveBeenCalledWith('/api/status/test-file-id', ...)
});
```
- Real implementation in `page.tsx` likely has useEffect polling logic
- Fake timers + async operations = frequent test flakiness

**Contradicting Evidence:**
- Pattern is commonly used in testing
- May just need longer timeout values

---

## Top Candidates (Ranked by Probability)

### **1. Missing OPENAI_API_KEY in Test Environment (90% confidence)**
**Root Cause:** Environment variable not exposed to vitest, causing AI summarization to fail.

**Why this is most probable:**
- Direct evidence in `vitest.config.ts` - variable is simply not configured
- Affects ALL T002 backend tests (process endpoint cannot complete without AI)
- Simple configuration fix with immediate impact

**Impact:**
- All contract tests for `/api/process` fail (15+ tests)
- Integration tests for summary flow fail (10+ tests)
- Frontend tests fail indirectly (no valid summary data to display)

---

### **2. Async Timing Issues with Polling + Fake Timers (70% confidence)**
**Root Cause:** Race conditions between `vi.advanceTimersByTime()` and `await waitFor()` in frontend tests.

**Why this is plausible:**
- Complex async orchestration (upload → poll status → display summary)
- Fake timers can cause React effects to fire out of order
- Multiple async state transitions in short time window

**Impact:**
- Frontend integration tests fail (5-8 tests)
- Component tests may pass since they don't use polling

---

### **3. Next.js 15 Params Await Requirement (60% confidence)**
**Root Cause:** Status endpoint doesn't await params in Next.js 15.

**Why this is plausible:**
- Known breaking change in Next.js 15
- Would cause status endpoint to fail silently
- Affects only status endpoint tests (3-5 tests)

**Impact:**
- Status endpoint returns undefined fileId
- Polling tests fail to fetch status
- Frontend tests cascade fail

---

## Validation Logs Added

**File: `/home/yunix/learning-agentic/ideas/Note-synth/notes/vitest.config.ts`**

No logging added yet - configuration inspection was sufficient.

**Recommended Logging:**
1. Add console.log to `process/route.ts` to check if OPENAI_API_KEY is defined:
   ```typescript
   console.log('[DEBUG] OPENAI_API_KEY present:', !!process.env.OPENAI_API_KEY);
   ```

2. Add logging to status endpoint to verify params:
   ```typescript
   console.log('[DEBUG] Params object:', params);
   console.log('[DEBUG] FileId:', fileId);
   ```

3. Add test-level logging to verify fetch mock behavior:
   ```typescript
   console.log('[TEST DEBUG] Mock fetch called:', mockFetch.mock.calls.length);
   ```

## Observed Behavior

**Not yet observed** - tests need to be run with additional logging to confirm hypotheses.

**Next Steps:**
1. Run tests with verbose output: `npm run test -- --reporter=verbose`
2. Add debug logging to vitest.config.ts to print env variables
3. Check if tests output specific error messages (e.g., "API key required", "params is a Promise")

## Root Cause (Pending Validation)

**Primary Root Cause (90% confidence):**
Missing `OPENAI_API_KEY` in vitest test environment configuration.

**Secondary Root Causes (pending validation):**
1. Next.js 15 params handling in status endpoint
2. Async timing issues with fake timers in frontend tests
3. Missing database migration application

## User Impact

**Critical User Journey Blocked:**
- **T002 User Story:** "User uploads PDF and sees AI summary appear automatically within 8 seconds"

**Specific Breakages:**
1. **Backend Processing:** AI summarization fails without API key
   - User uploads file → status stuck at "processing"
   - No summary ever appears
   - Error logged but not surfaced to user

2. **Status Polling:** Frontend cannot fetch processing status
   - Polling endpoint returns errors
   - UI shows "Processing..." indefinitely
   - User has no feedback on completion

3. **Summary Display:** No summary data to render
   - Even if processing completes, frontend cannot fetch results
   - SummaryPanel component never appears
   - User sees upload success but no output

**User Experience:**
```
User Action: Drag-and-drop "meeting-notes.pdf"
Expected: See summary with topics, decisions, actions within 8s
Actual: "Processing..." badge stays forever, no summary appears
```

## Corrective Plan (DO NOT IMPLEMENT)

### **Fix 1: Add OPENAI_API_KEY to Vitest Environment [PRIORITY 1]**

**File:** `/home/yunix/learning-agentic/ideas/Note-synth/notes/vitest.config.ts`
**Lines:** 17-21

**Change:**
```typescript
// BEFORE
env: {
  NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL || 'https://test.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'test-key-placeholder',
},

// AFTER
env: {
  NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL || 'https://test.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'test-key-placeholder',
  OPENAI_API_KEY: env.OPENAI_API_KEY || '', // Add OpenAI API key for T002 AI summarization tests
},
```

**Why this fixes the root cause:**
- Exposes OPENAI_API_KEY to test environment
- AI summarization service can authenticate
- Process endpoint completes successfully
- Tests can validate full pipeline

**Side Effects:**
- Tests will make real OpenAI API calls (costs apply)
- Consider adding mock for AI service in tests
- May need rate limiting for test suite

**Testing:**
```bash
# After fix, verify environment variable is set
npm run test -- __tests__/contract/process.test.ts --reporter=verbose

# Look for successful AI extraction in logs
# Expected: "[PROCESS] AI extraction completed with confidence: 0.XX"
```

---

### **Fix 2: Await Params in Next.js 15 Status Endpoint [PRIORITY 2]**

**File:** `/home/yunix/learning-agentic/ideas/Note-synth/notes/app/api/status/[fileId]/route.ts`
**Line:** 22

**Change:**
```typescript
// BEFORE
export async function GET(
  request: NextRequest,
  { params }: { params: { fileId: string } }
) {
  const { fileId } = params;

// AFTER
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> } // params is now a Promise in Next.js 15
) {
  const { fileId } = await params; // Await the params Promise
```

**Why this fixes the root cause:**
- Next.js 15 requires awaiting params in dynamic routes
- Prevents accessing Promise object instead of actual params
- Aligns with Next.js 15 breaking changes

**Side Effects:**
- TypeScript may show errors if types aren't updated
- No functional side effects - this is the correct Next.js 15 pattern

**Testing:**
```bash
# Verify status endpoint returns correct fileId
npm run test -- __tests__/integration/summary-flow.test.ts -t "should poll status endpoint"
```

---

### **Fix 3: Mock OpenAI SDK in Tests [PRIORITY 1 - ALTERNATIVE]**

**Alternative to Fix 1 if real API calls are undesirable**

**File:** `__tests__/setup.ts`
**Lines:** Add after line 31

**Change:**
```typescript
// Mock OpenAI SDK for tests to avoid real API calls
vi.mock('ai', () => ({
  generateObject: vi.fn().mockResolvedValue({
    object: {
      topics: ['Test Topic'],
      decisions: ['Test Decision'],
      actions: ['Test Action'],
      lno_tasks: {
        leverage: ['Test Leverage'],
        neutral: ['Test Neutral'],
        overhead: ['Test Overhead'],
      },
    },
  }),
}));

vi.mock('@ai-sdk/openai', () => ({
  openai: vi.fn().mockReturnValue({
    model: 'gpt-4o-mini',
  }),
}));
```

**Why this fixes the root cause:**
- Provides mock AI responses for tests
- No API key required
- Tests run faster and more reliably
- No API costs

**Side Effects:**
- Tests don't validate real AI integration
- Mock data may not match production behavior
- Need separate E2E tests for AI validation

**Testing:**
```bash
# Verify mocked AI extraction works
npm run test -- __tests__/contract/process.test.ts --reporter=verbose
```

---

### **Fix 4: Increase waitFor Timeout in Frontend Tests [PRIORITY 3]**

**File:** `__tests__/integration/summary-display.test.tsx`
**Lines:** 122-124, 186-188, 233-236, etc.

**Change:**
```typescript
// BEFORE
await waitFor(() => {
  expect(screen.getByText(/Budget Planning/i)).toBeInTheDocument();
}, { timeout: 5000 });

// AFTER
await waitFor(() => {
  expect(screen.getByText(/Budget Planning/i)).toBeInTheDocument();
}, { timeout: 10000 }); // Increase timeout for fake timer interactions
```

**Why this fixes the root cause:**
- Gives React effects more time to process with fake timers
- Reduces flakiness from timing issues
- Allows async state updates to complete

**Side Effects:**
- Tests take longer to run
- May hide underlying timing bugs
- Not a true fix if root cause is logic error

**Testing:**
```bash
# Run frontend tests with increased timeout
npm run test -- __tests__/integration/summary-display.test.tsx
```

---

### **Fix 5: Verify Database Migration Applied [PRIORITY 2]**

**File:** Check Supabase dashboard or run migration manually
**Migration:** `supabase/migrations/001_create_initial_tables.sql` (or similar)

**Steps:**
1. Connect to Supabase project via CLI or dashboard
2. Verify `processed_documents` table exists:
   ```sql
   SELECT * FROM information_schema.tables
   WHERE table_name = 'processed_documents';
   ```
3. If missing, apply migration:
   ```bash
   supabase db push
   # OR
   supabase migration up
   ```

**Why this fixes the root cause:**
- Backend tests insert into `processed_documents` table
- Integration tests query this table
- Missing table causes database errors

**Side Effects:**
- None if migration is idempotent
- May need to reset test data between runs

**Testing:**
```bash
# Verify table exists
psql $DATABASE_URL -c "\dt processed_documents"

# Run integration tests
npm run test -- __tests__/integration/summary-flow.test.ts
```

---

## Implementation Priority

1. **Fix 1 OR Fix 3** (OPENAI_API_KEY or Mock AI) - **IMMEDIATE**
   - Blocks all T002 backend tests
   - Prerequisite for other fixes

2. **Fix 2** (Await params) - **HIGH**
   - Quick TypeScript fix
   - Unblocks status endpoint tests

3. **Fix 5** (Database migration) - **MEDIUM**
   - Verify table exists
   - Run migration if missing

4. **Fix 4** (Timeout increase) - **LOW**
   - Only if timing issues persist after Fixes 1-3
   - May indicate deeper async bugs

---

## Related Areas to Test After Fixes

1. **Full T002 User Journey:**
   ```bash
   # Upload → Process → Status Poll → Display Summary
   npm run test -- __tests__/integration/summary-flow.test.ts
   ```

2. **AI Summarization Edge Cases:**
   - Invalid JSON retry logic
   - Low confidence flagging
   - Processing timeout handling

3. **Status Endpoint Edge Cases:**
   - Non-existent fileId
   - File in "failed" status
   - Concurrent status requests

4. **Frontend Polling Behavior:**
   - Polling stops after completion
   - Error handling during polling
   - Toast notification timing

---

## Additional Notes

**Test Execution Command for Validation:**
```bash
# Run all tests with verbose output
npm run test -- --reporter=verbose --no-coverage

# Run specific test suite with debugging
npm run test -- __tests__/contract/process.test.ts -- --reporter=verbose

# Run with console logs visible
npm run test -- --silent=false
```

**Environment Variables to Verify:**
```bash
# In test environment
echo $OPENAI_API_KEY
echo $NEXT_PUBLIC_SUPABASE_URL
echo $NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

**Files to Inspect for Implementation Details:**
- `/lib/services/aiSummarizer.ts` - AI extraction implementation
- `/lib/services/noteProcessor.ts` - Document conversion logic
- `/app/page.tsx` - Frontend polling implementation

---

## Conclusion

**High-Confidence Root Cause:**
Missing `OPENAI_API_KEY` in vitest configuration is blocking 90%+ of T002 test failures.

**Recommended Action:**
Implement Fix 1 (add OPENAI_API_KEY) OR Fix 3 (mock AI SDK) immediately. Then validate remaining failures and apply Fix 2 (await params) as needed.

**Expected Outcome After Fixes:**
- T002 contract tests: 15/15 passing
- T002 integration tests: 12/12 passing
- T002 frontend tests: 5/5 passing
- Total: ~55-60 passing tests (up from 23)

**Validation Steps:**
1. Apply Fix 1 or Fix 3
2. Run tests: `npm run test`
3. Verify error messages change/disappear
4. Apply remaining fixes based on updated failure patterns
5. Document final results in test log
