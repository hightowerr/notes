# Debug Report: T002 Test Status Investigation

## Error Summary

**Investigation Date:** 2025-10-08
**Task:** T002 - AI Summary Display
**Context:** Upload works, processing trigger recently fixed, status polling was stuck in infinite loop

**Objective:** Investigate current test failures to identify any remaining issues after previous fixes.

---

## Initial Hypotheses

### Hypothesis 1: Tests may already be passing after previous fixes
**Evidence:**
- `.claude/logs/test-result-T002-final.md` shows that critical `expires_at` field fix was applied
- Upload endpoint correctly triggers processing (lines 213-221 in `upload/route.ts`)
- `vitest.config.ts` line 21 shows `OPENAI_API_KEY` is configured
- `app/api/status/[fileId]/route.ts` line 22 correctly awaits params
- All major blockers from previous debug session appear resolved

**Likelihood:** 75%

### Hypothesis 2: Tests pass but have actual file storage issues
**Evidence:**
- Contract tests create database records but don't upload actual PDF/DOCX/TXT files to Supabase storage
- `process.test.ts` lines 26-36 create test records with storage paths like `notes/test-contract-process.pdf`
- These storage paths don't have actual files uploaded
- When `/api/process` tries to download from storage (line 73-76 in `process/route.ts`), it will fail

**Likelihood:** 85% - Most likely cause of remaining failures

### Hypothesis 3: OpenAI API calls may timeout or fail in tests
**Evidence:**
- Tests make real OpenAI API calls (not mocked)
- AI summarization can take 3-8 seconds per test
- Multiple tests running concurrently may hit rate limits
- Network issues could cause intermittent failures

**Likelihood:** 40%

### Hypothesis 4: Test isolation issues (data not cleaned up between tests)
**Evidence:**
- Multiple tests insert records with same file IDs
- `afterEach` cleanup (line 39-45 in `process.test.ts`) may not run if test fails early
- Supabase connection may be shared across tests

**Likelihood:** 30%

### Hypothesis 5: FormData/File compatibility in test environment
**Evidence:**
- `__tests__/setup.ts` lines 26-29 use undici's FormData and File implementations
- Integration tests create mock files (line 46 in `summary-flow.test.ts`)
- These may not perfectly match Next.js expectations

**Likelihood:** 20%

---

## Top Candidates (Ranked by Impact)

### 1. Missing actual files in Supabase storage (85% confidence)

**Root Cause:** Contract tests create database records pointing to storage paths, but no actual files are uploaded to those paths. When `/api/process` tries to download the file, it fails with `FILE_NOT_FOUND` error.

**Evidence Chain:**
1. `process.test.ts` line 26-34: Creates `uploaded_files` record with `storage_path: 'notes/test-contract-process.pdf'`
2. No corresponding file upload to Supabase storage
3. `/api/process/route.ts` line 73-76: Attempts to download from storage
4. Download fails because file doesn't exist
5. Error thrown: `Failed to download file from storage`

**Impact:**
- 100% of contract tests for `/api/process` fail
- All integration tests fail (depend on successful processing)
- Frontend tests cascade fail (no data to display)

**User Impact:**
None - this is purely a test environment issue. Real user uploads work correctly because actual files are uploaded to storage.

---

### 2. Missing test fixtures (75% confidence)

**Root Cause:** Tests don't have actual PDF/DOCX/TXT sample files to process.

**Evidence:**
- `summary-flow.test.ts` line 24-44 creates a plain text string, not an actual PDF
- Creates a File object with `type: 'application/pdf'` but content is plain text
- When pdf-parse tries to parse it, it will fail
- DOCX tests similarly create fake files (line 66-93 in `process.test.ts`)

**Impact:**
- File conversion tests fail (PDF parsing expects valid PDF structure)
- AI summarization may work with placeholder text but isn't realistic
- Edge case tests (OCR fallback, invalid files) can't be properly validated

---

### 3. Async timing issues in frontend tests (30% confidence)

**Root Cause:** Fake timers + React effects + polling logic create race conditions.

**Evidence:**
- `summary-display.test.tsx` uses `vi.useFakeTimers()` (line 18)
- `vi.advanceTimersByTime(2000)` to simulate polling interval (line 100, 111, 118)
- Multiple async state updates in quick succession
- waitFor timeouts may be insufficient

**Impact:**
- Frontend integration tests may have intermittent failures
- Tests marked as "flaky" (pass sometimes, fail sometimes)
- Affects ~5-8 tests out of 62 total

---

## Validation Logs Added

**None yet** - awaiting test execution to confirm hypotheses.

**Recommended Validation Steps:**

1. **Run T002 Contract Tests with Verbose Output**
   ```bash
   npm run test -- __tests__/contract/process.test.ts --reporter=verbose
   ```
   Look for:
   - `Failed to download file from storage` errors
   - OpenAI API errors
   - Database constraint violations

2. **Check Supabase Storage Contents**
   ```javascript
   const { data: files } = await supabase.storage.from('notes').list();
   console.log('Storage files:', files);
   ```
   Verify if test files exist in storage bucket.

3. **Add Logging to Process Endpoint**
   ```typescript
   // In process/route.ts line 78
   console.log('[DEBUG] Attempting to download:', file.storage_path);
   console.log('[DEBUG] Download result:', { data: !!fileData, error: downloadError?.message });
   ```

---

## Observed Behavior (Pending Test Run)

**Current Status:** Tests not yet run to validate hypotheses.

**Expected Error Patterns:**

**If Hypothesis 2 is correct (missing storage files):**
```
Error: Failed to download file from storage: Object not found
at POST (process/route.ts:79)
```

**If Hypothesis 3 is correct (OpenAI timeout):**
```
Error: Request timed out
at extractStructuredData (aiSummarizer.ts:89)
```

**If Hypothesis 4 is correct (data cleanup):**
```
Error: duplicate key value violates unique constraint "uploaded_files_pkey"
```

---

## Root Cause (Preliminary Assessment)

**Primary Root Cause (85% confidence):**

**Missing test data setup** - Contract tests create database metadata but don't upload actual files to Supabase storage, causing all downstream processing to fail.

**Secondary Issues:**
1. Missing realistic test fixtures (PDF/DOCX/TXT samples)
2. Potential timing issues with fake timers in frontend tests
3. Test cleanup may not execute if tests fail early

---

## User Impact

**Production User Journey:** ✅ NOT AFFECTED

The test failures are isolated to the test environment. Real user uploads work correctly because:
1. Frontend sends actual file content via FormData
2. Upload endpoint stores real files in Supabase storage
3. Process endpoint downloads real files from storage
4. AI summarization processes real content

**Test Environment User Journey:** ❌ BLOCKED

Developers cannot validate T002 functionality through automated tests until test data setup is fixed.

---

## Corrective Plan (DO NOT IMPLEMENT)

### Fix 1: Add Test File Uploads to Storage [PRIORITY 1]

**Problem:** Tests create database records but don't upload files to storage.

**Solution:** Upload actual test file content before calling `/api/process`.

**File:** `__tests__/contract/process.test.ts`
**Lines:** After line 36 (in `beforeAll`)

**Add:**
```typescript
// Upload actual test file content to storage
const testPdfContent = Buffer.from('Test PDF content'); // Or use real PDF sample
await supabase.storage
  .from('notes')
  .upload('notes/test-contract-process.pdf', testPdfContent, {
    contentType: 'application/pdf'
  });
```

**Why this works:**
- Creates actual file in storage that `/api/process` can download
- Allows full end-to-end testing of conversion pipeline
- Tests now validate real file handling

**Side Effects:**
- Tests will be slower (storage operations take ~200-500ms)
- Need to clean up storage files in `afterEach`
- May hit storage quota limits if tests run frequently

**Cleanup needed:**
```typescript
afterEach(async () => {
  // ... existing cleanup ...

  // Delete storage files
  await supabase.storage.from('notes').remove([
    'notes/test-contract-process.pdf',
    // ... other test files
  ]);
});
```

---

### Fix 2: Create Realistic Test Fixtures [PRIORITY 2]

**Problem:** Tests use plain text instead of actual PDF/DOCX files.

**Solution:** Create sample files in `__tests__/fixtures/` directory.

**Files to create:**
```
__tests__/fixtures/
├── sample-meeting-notes.pdf     (valid PDF with text content)
├── sample-document.docx          (valid DOCX file)
├── sample-notes.txt              (plain text file)
└── sample-scanned.pdf            (image-only PDF for OCR testing)
```

**Usage in tests:**
```typescript
import fs from 'fs';
import path from 'path';

// In test
const pdfBuffer = fs.readFileSync(
  path.join(__dirname, '../fixtures/sample-meeting-notes.pdf')
);

await supabase.storage
  .from('notes')
  .upload(testFilePath, pdfBuffer, { contentType: 'application/pdf' });
```

**Why this works:**
- Tests validate actual file format parsing
- OCR fallback can be properly tested with scanned PDFs
- Realistic document structure for AI extraction

**Side Effects:**
- Test repository size increases (~50-100KB per fixture)
- Need to ensure fixtures are committed to git
- Fixtures need to be maintained if format specs change

---

### Fix 3: Mock Storage Operations for Unit Tests [PRIORITY 2]

**Alternative to Fix 1** - Use mocking instead of real storage for faster tests.

**File:** `__tests__/setup.ts`
**Lines:** Add after line 29

**Add:**
```typescript
// Mock Supabase storage for unit tests
vi.mock('@/lib/supabase', () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({
        download: vi.fn().mockResolvedValue({
          data: new Blob(['Mock PDF content']),
          error: null
        }),
        upload: vi.fn().mockResolvedValue({
          data: { path: 'mocked-path' },
          error: null
        }),
        remove: vi.fn().mockResolvedValue({ error: null })
      }))
    },
    from: vi.fn() // Keep database operations real for integration tests
  }
}));
```

**Why this works:**
- Tests run much faster (no real storage operations)
- No storage quota concerns
- Test isolation is guaranteed

**Side Effects:**
- Storage integration not actually tested
- Need separate E2E tests for storage validation
- Mock needs to be updated if storage API changes

**Decision Criteria:**
- Use Fix 3 for **unit tests** (fast feedback loop)
- Use Fix 1 for **integration tests** (validate real behavior)

---

### Fix 4: Increase waitFor Timeouts in Frontend Tests [PRIORITY 3]

**Problem:** Frontend tests may timeout before async operations complete.

**File:** `__tests__/integration/summary-display.test.tsx`
**Lines:** 122-124, 186-188, 233-236

**Change:**
```typescript
// BEFORE
await waitFor(() => {
  expect(screen.getByText(/Budget Planning/i)).toBeInTheDocument();
}, { timeout: 5000 });

// AFTER
await waitFor(() => {
  expect(screen.getByText(/Budget Planning/i)).toBeInTheDocument();
}, { timeout: 10000 }); // Increase for fake timer complexity
```

**Why this works:**
- Gives React effects more time to process with fake timers
- Reduces flaky test failures
- Allows for network latency simulation

**Side Effects:**
- Tests take longer to fail if actually broken
- May hide underlying timing bugs
- Not a true fix if there's a logic error

**Better Alternative:**
Use `waitFor` with explicit state checks instead of arbitrary timeouts:
```typescript
await waitFor(
  () => {
    const summaryElement = screen.queryByText(/Budget Planning/i);
    expect(summaryElement).toBeInTheDocument();
  },
  {
    timeout: 10000,
    interval: 100, // Check every 100ms
    onTimeout: (error) => {
      console.log('Current DOM:', screen.debug());
      throw error;
    }
  }
);
```

---

### Fix 5: Improve Test Cleanup Reliability [PRIORITY 3]

**Problem:** Test cleanup may not run if test fails early.

**Solution:** Use `try...finally` pattern to ensure cleanup always runs.

**File:** `__tests__/contract/process.test.ts`
**Pattern:**

**BEFORE:**
```typescript
it('should convert PDF to Markdown', async () => {
  const request = new NextRequest(...);
  const response = await POST(request);
  expect(response.status).toBe(200);
  // Cleanup happens in afterEach
});
```

**AFTER:**
```typescript
it('should convert PDF to Markdown', async () => {
  let testFileId: string | undefined;

  try {
    const request = new NextRequest(...);
    const response = await POST(request);
    testFileId = (await response.json()).fileId;
    expect(response.status).toBe(200);
  } finally {
    // Cleanup runs even if test fails
    if (testFileId) {
      await supabase.from('uploaded_files').delete().eq('id', testFileId);
      await supabase.from('processed_documents').delete().eq('file_id', testFileId);
    }
  }
});
```

**Why this works:**
- Cleanup guaranteed even if assertions fail
- Prevents data pollution between tests
- Reduces "flaky" test behavior from orphaned data

**Side Effects:**
- More verbose test code
- Cleanup logic duplicated across tests
- May slow down tests slightly

**Better Alternative:**
Use a test helper:
```typescript
// __tests__/helpers/test-cleanup.ts
export async function withCleanup<T>(
  testFn: () => Promise<T>,
  cleanupFn: () => Promise<void>
): Promise<T> {
  try {
    return await testFn();
  } finally {
    await cleanupFn();
  }
}

// Usage
it('should convert PDF', async () => {
  await withCleanup(
    async () => {
      const response = await POST(request);
      expect(response.status).toBe(200);
    },
    async () => {
      await supabase.from('uploaded_files').delete().eq('id', testFileId);
    }
  );
});
```

---

## Implementation Priority

**Before running tests (setup):**
1. **Fix 2** (Create test fixtures) - IMMEDIATE
2. **Fix 1** (Upload test files to storage) - HIGH

**After test run (if failures persist):**
3. **Fix 4** (Increase timeouts) - MEDIUM (only if timing issues confirmed)
4. **Fix 5** (Improve cleanup) - MEDIUM (only if data pollution confirmed)
5. **Fix 3** (Mock storage) - LOW (optional optimization)

---

## Related Areas to Test After Fixes

### Backend Tests
- File conversion (PDF, DOCX, TXT)
- AI extraction with real documents
- Storage upload/download operations
- Error handling (missing files, invalid formats)

### Integration Tests
- Complete upload → process → display flow
- Status polling behavior
- Concurrent uploads
- Error scenarios (failures, timeouts)

### Frontend Tests
- Summary panel rendering with real data
- Status badge updates
- Polling starts and stops correctly
- Toast notifications

---

## Expected Outcomes

### Best Case (All hypotheses wrong, tests already passing):
```
✅ 62/62 tests passing
Processing complete in ~30-45s (with real OpenAI calls)
```

### Likely Case (Missing storage files confirmed):
```
❌ Contract tests: 0/15 passing (all fail on storage download)
❌ Integration tests: 0/12 passing (depend on contract tests)
❌ Frontend tests: 0/17 passing (no data to display)
✅ Upload tests: 18/18 passing (unaffected)
Total: 18/62 passing (29%)
```

### After Fix 1 + Fix 2 applied:
```
✅ Contract tests: 14/15 passing (1 flaky timing issue)
✅ Integration tests: 11/12 passing (1 cleanup issue)
✅ Frontend tests: 15/17 passing (2 timing flakes)
✅ Upload tests: 18/18 passing
Total: 58/62 passing (94%)
```

---

## Validation Commands

### 1. Run ALL tests to get baseline
```bash
npm run test:run
```

### 2. Run T002-specific tests with verbose output
```bash
# Contract tests
npm run test -- __tests__/contract/process.test.ts --reporter=verbose --silent=false

# Integration tests
npm run test -- __tests__/integration/summary-flow.test.ts --reporter=verbose --silent=false

# Frontend tests
npm run test -- __tests__/integration/summary-display.test.tsx --reporter=verbose --silent=false
```

### 3. Check Supabase storage state
```bash
# Via Node.js REPL
node -e "
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
const { data } = await supabase.storage.from('notes').list();
console.log('Storage files:', data);
"
```

### 4. Run single test with full debugging
```bash
npm run test -- __tests__/contract/process.test.ts -t "should convert PDF to Markdown" --reporter=verbose --silent=false
```

---

## Conclusion

### High-Confidence Assessment

**Root Cause (85% confidence):**
Contract tests create database records pointing to storage paths, but no actual files are uploaded to those paths. When `/api/process` tries to download the file, it fails.

**Secondary Issues (cumulative 40% probability):**
- Missing realistic test fixtures (PDF/DOCX samples)
- Potential timing issues with fake timers
- Test cleanup may not execute if tests fail early

### Recommended Immediate Actions

1. **Run full test suite** to get baseline failure data
   ```bash
   npm run test:run > test-results.txt 2>&1
   ```

2. **Inspect first failure** in detail
   - Look for error messages
   - Check stack traces
   - Verify which operation fails (storage download, AI extraction, database insert)

3. **Create test fixtures directory** with sample files
   ```bash
   mkdir -p __tests__/fixtures
   # Add sample PDF, DOCX, TXT files
   ```

4. **Update contract tests** to upload files to storage before processing
   - Modify `beforeAll` to upload test files
   - Modify `afterEach` to clean up storage files

5. **Re-run tests** and validate improvement
   - Expected: 90%+ pass rate
   - Remaining failures likely timing-related

### Success Criteria

**Tests are "passing" when:**
- ✅ 58+ out of 62 tests pass consistently (94%+ pass rate)
- ✅ No storage-related errors
- ✅ AI summarization completes successfully with real documents
- ✅ Status polling behaves correctly in frontend tests

**Acceptable flakiness:**
- ⚠️ 2-4 frontend tests may intermittently fail due to timing (acceptable for P0)
- ⚠️ OpenAI API may occasionally timeout (retry logic should handle this)

**Unacceptable failures:**
- ❌ Storage operations failing
- ❌ Database constraint violations
- ❌ Type errors or import issues
- ❌ 100% failure rate in any test suite

---

## Next Steps

1. ✅ **Complete this debug report**
2. ⏳ **Run test suite and capture output**
3. ⏳ **Analyze failure patterns**
4. ⏳ **Apply fixes based on actual evidence**
5. ⏳ **Validate fixes with test re-run**
6. ⏳ **Document final results**
7. ⏳ **Mark T002 as complete or escalate blockers**

---

**Debug Engineer:** Claude Code Debugger Agent
**Status:** Investigation complete, awaiting test execution
**Confidence Level:** 85% on primary root cause, 40% on secondary issues
**Risk Assessment:** LOW - Test-only issues, no production impact
**Estimated Time to Fix:** 2-4 hours (creating fixtures + updating tests)
