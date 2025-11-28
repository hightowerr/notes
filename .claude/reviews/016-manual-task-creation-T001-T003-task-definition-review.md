# Code Review: Manual Task Creation - Tasks T001-T003 Definition Review

## Status
**NEEDS REVISION**

## Summary
Reviewed task definitions T001-T003 for the Manual Task Creation feature (Phase 18). Tasks demonstrate solid understanding of TDD principles and database-first approach. However, T001 violates vertical slice principles as pure infrastructure setup, and test tasks (T002-T003) need minor adjustments to ensure proper TDD workflow and dependency clarity.

---

## Issues Found

### CRITICAL
**None** - No blocking issues that would prevent implementation.

### HIGH

**T001: Violates Vertical Slice Principle**

**File**: tasks.md (lines 34-46)
**Issue**: T001 is marked [SETUP] and described as "Database Foundation (Blocking All Slices)" which explicitly violates the SEE-DO-VERIFY principle from `.claude/SYSTEM_RULES.md`.

**Evidence from SYSTEM_RULES.md:**
- "NEVER deliver 'infrastructure' or 'setup' as a slice" (line 66)
- Every task must enable user to: SEE IT, DO IT, VERIFY IT (lines 11-17)

**Current T001 behavior:**
- SEE: Migration file in supabase/migrations/ ❌ (Developer-only, not user-facing)
- DO: Developer runs `supabase db push` ❌ (Not a user action)
- VERIFY: Query returns empty result ❌ (Not user-testable)

**Fix Required:**
Either:
1. **Option A (Recommended)**: Merge T001 into T002-T003 as prerequisite setup step
   - T002/T003 first action: "Run migration if not exists"
   - Migration becomes implicit requirement, not standalone task
   - Tests verify table exists as part of contract validation

2. **Option B**: Restructure T001 as minimal vertical slice
   - Add simple admin UI showing "Manual tasks table ready" status
   - User (admin/developer) can SEE table exists via UI
   - User can DO nothing yet, but table status is VERIFIABLE
   - (Less preferred - adds complexity for minimal value)

**Recommendation**: Use Option A. Database migrations are prerequisites, not slices. The first real slice (T002) should validate table existence as part of its contract test setup.

---

### MEDIUM

**T002-T003: Test Execution Order Not Explicit**

**File**: tasks.md (lines 62-85)
**Issue**: Both tasks correctly marked [P] for parallel execution, but TDD workflow requires tests to FAIL before implementation. Current description doesn't explicitly state that these tests should be written and verified as failing BEFORE moving to implementation tasks (T004-T010).

**Current description (T002 line 66):**
```
VERIFY: Test fails with "route not found" (RED phase)
```

**Concern**: This assumes test will fail, but doesn't enforce workflow where developer MUST verify RED phase before proceeding.

**Fix**: Add explicit execution checkpoint to task description:
```markdown
**CRITICAL TDD WORKFLOW:**
1. Write test code in __tests__/contract/manual-task-status.test.ts
2. Run test: `pnpm test:run __tests__/contract/manual-task-status.test.ts`
3. VERIFY test FAILS with "route not found" error (RED phase confirmed)
4. Mark T002 complete ONLY after confirming RED phase
5. Proceed to implementation tasks (T004+) which will make tests GREEN
```

**Why this matters**: TDD discipline requires explicit RED confirmation. Without this, developers might write tests that accidentally pass (false positive) and never detect if tests are actually validating behavior.

**Applies to**: Both T002 and T003

---

**T003: Integration Test Scope Slightly Ambiguous**

**File**: tasks.md (lines 75-85)
**Issue**: Test description says "create outcome → create manual task → wait for analysis → verify placement" but doesn't specify HOW to wait (polling? fixed delay? test timeout?).

**Current description (line 78):**
```
DO: Write end-to-end test: create outcome → create manual task → wait for analysis → verify placement
```

**Concern**: "wait for analysis" could mean:
- Fixed `setTimeout(10000)` delay (brittle)
- Polling with retry logic (correct)
- Test timeout without retry (fails intermittently)

**Fix**: Add implementation guidance to test description:
```markdown
**Test Implementation:**
- Use polling pattern with max 20 attempts (20s timeout)
- Poll GET /api/tasks/manual/[id]/status every 1s
- Assert final status is 'prioritized' OR 'not_relevant'
- Fail test if status remains 'analyzing' after 20s
```

**Why this matters**: Integration tests that use fixed delays are fragile. Explicit polling guidance ensures consistent, reliable test implementation.

---

### LOW

**T002: Contract Reference Could Be More Specific**

**File**: tasks.md (line 72)
**Issue**: Contract reference says "See `contracts/manual-task-placement-api.yaml` paths.'/api/tasks/manual/{id}/status'" but doesn't specify which HTTP method or response schema name to validate against.

**Current:**
```
Contract: See `contracts/manual-task-placement-api.yaml` paths.'/api/tasks/manual/{id}/status'
```

**Better:**
```
Contract: GET /api/tasks/manual/{id}/status
  - Request: Path param `id` (string)
  - Response: ManualTaskStatusResponse schema (200)
  - Errors: 404 NotFound schema
  - Reference: contracts/manual-task-placement-api.yaml
```

**Why this matters**: Explicit contract details reduce ambiguity during test implementation.

---

## Standards Compliance

### Tech Stack Patterns
- ✅ Migration file location correct: `supabase/migrations/029_create_manual_tasks.sql`
- ✅ Test file locations follow convention: `__tests__/contract/`, `__tests__/integration/`
- ✅ API route structure matches Next.js 15 App Router patterns
- ✅ Zod schemas planned for validation (T005)
- ✅ TypeScript strict mode compliance expected

### File Scope
- ✅ T001: Single migration file, clear scope
- ✅ T002: Single contract test file
- ✅ T003: Single integration test file
- ✅ No cross-file modifications in test tasks

### TDD Workflow
- ⚠️ T002-T003 marked correctly as tests-first
- ⚠️ RED phase mentioned but not enforced as checkpoint
- ✅ Implementation tasks (T004+) correctly depend on test tasks
- ⚠️ No explicit verification that tests remain GREEN after implementation

**Recommendation**: Add explicit TDD checkpoints:
1. After T002-T003: "Verify RED phase - tests must fail"
2. After T006: "Verify GREEN phase - T002 contract test must pass"
3. After T007: "Verify GREEN phase - T003 integration test must pass"

---

## Implementation Quality

### Database Schema (T001)
- ✅ Schema matches data-model.md exactly
- ✅ Indexes appropriate (partial index on status, outcome_id, created_at)
- ✅ Foreign keys with correct CASCADE/SET NULL behaviors
- ✅ CHECK constraint on status enum
- ✅ Updated_at trigger included
- ✅ Rollback SQL documented in data-model.md

**Concerns:**
- ⚠️ Migration number 029 assumes all previous migrations (001-028) exist and have been applied
- ⚠️ No validation that migration hasn't already been applied (Supabase handles this, but worth noting)

### Test Coverage (T002-T003)
- ✅ T002 covers all critical status transitions (analyzing → prioritized/not_relevant)
- ✅ T002 includes 404 error case
- ✅ T003 covers end-to-end user journey
- ✅ T003 includes three distinct scenarios (relevant, irrelevant, no outcome)
- ✅ Tests designed to fail before implementation (good TDD)

**Strengths:**
- Test descriptions are specific about expected failures
- Contract test (T002) validates API shape before integration test (T003)
- Integration test validates actual business logic, not just HTTP contract

**Missing:**
- ⚠️ No mention of test data cleanup between test runs
- ⚠️ No explicit mock strategy for agent analysis (will tests call real agent or mock?)
- ⚠️ T003 doesn't specify if it tests with real Supabase or test database

**Recommendations:**
1. Add to T003 description: "Use test database (not production) with cleanup after each test"
2. Add to T003 description: "Mock agent analysis for deterministic test results (or use test agent with fixed responses)"

---

## Vertical Slice Check

### T001 [SETUP] Create manual_tasks table migration
- ❌ **SEE**: Migration file is not user-visible (developer artifact)
- ❌ **DO**: Running migration is not a user action (developer task)
- ❌ **VERIFY**: SQL query result is not user-verifiable (developer validation)
- ❌ **Integration**: No frontend-backend integration (pure database)
- **Verdict**: NOT A VERTICAL SLICE (violates core principle)

### T002 [P] [SLICE] [US1] Contract test for manual task status polling
- ✅ **SEE**: Test file exists and runs
- ✅ **DO**: Developer writes and executes test
- ⚠️ **VERIFY**: Test failures are visible, but user can't verify (developer-only)
- ❌ **Integration**: Test only, no user-facing feature
- **Verdict**: ACCEPTABLE as TDD prerequisite, but NOT standalone user value

**Note:** Test tasks are exempt from strict vertical slice requirements IF they:
1. Are explicitly marked as prerequisites to implementation slices
2. Block user-facing slices until complete (T002-T003 correctly block T004+)
3. Validate user-facing behavior (both tests validate API that users will call)

### T003 [P] [SLICE] [US1] Integration test for manual task placement flow
- ✅ **SEE**: Test output shows placement behavior
- ✅ **DO**: Test simulates complete user workflow
- ✅ **VERIFY**: Test assertions validate user-visible outcomes
- ⚠️ **Integration**: Tests integration but doesn't deliver it to users
- **Verdict**: ACCEPTABLE as TDD prerequisite (validates full user journey)

---

## Dependencies & Execution Order

### T001 Dependencies
- **Declared**: None (foundation task)
- **Actual**: Assumes migrations 001-028 exist and are applied
- **Recommendation**: Add prerequisite check: "Verify migrations 001-028 applied before creating 029"

### T002-T003 Dependencies
- **Declared**: None (marked [P] for parallel execution)
- **Actual**: Both depend on T001 complete (can't test against non-existent table)
- ⚠️ **Issue**: Tasks marked as [P] but actually depend on [SETUP] task

**Fix Required:**
Remove [P] flag from T002-T003 until T001 is complete, OR restructure to merge T001 into T002-T003 setup.

**Corrected dependency flow should be:**
```
Phase 1: Database Foundation
  T001 [SETUP] → Blocks T002-T003

Phase 2: Test Definition (after T001 complete)
  T002 [P] [SLICE] [US1] ← Can run parallel with T003
  T003 [P] [SLICE] [US1] ← Can run parallel with T002
  ↓ (both complete)
Phase 3: Implementation
  T004-T010 [SLICE] [US1]
```

**Current task description (line 73):**
```
Dependencies: None (runs in parallel with T003)
```

**Should be:**
```
Dependencies: T001 complete (table must exist for contract test)
Parallel with: T003 (after T001 complete)
```

---

## Completion Criteria

### What's Well-Defined

**T001:**
- ✅ Exact SQL schema provided in data-model.md
- ✅ File path specified: `supabase/migrations/029_create_manual_tasks.sql`
- ✅ Verification method clear: "Query SELECT * FROM manual_tasks returns empty result"
- ✅ Rollback procedure documented

**T002:**
- ✅ Test file path specified
- ✅ All test cases enumerated (analyzing, prioritized, not_relevant, 404)
- ✅ Expected failure mode defined ("route not found")
- ✅ Contract reference provided

**T003:**
- ✅ Test scenarios clearly defined (3 cases)
- ✅ End-to-end flow documented
- ✅ Expected failure defined ("manualTaskPlacement service not found")

### What's Missing

**T001:**
- ⚠️ No validation that migration is idempotent (safe to run multiple times)
- ⚠️ No instruction to verify migration applied successfully via `supabase migration list`

**T002:**
- ⚠️ No test data cleanup strategy
- ⚠️ No guidance on test isolation (parallel-safe?)

**T003:**
- ⚠️ Polling implementation not specified
- ⚠️ Mock vs real agent not specified
- ⚠️ Test database vs production database not specified
- ⚠️ Performance target not mentioned (should complete in <30s?)

---

## Strengths

### Task Organization
- ✅ Clear phase separation (Database → Tests → Implementation)
- ✅ Dependency blocking correctly identified (Phase 1 blocks Phase 2)
- ✅ Parallel execution opportunities marked with [P]
- ✅ User story tagging ([US1]) maps back to spec.md
- ✅ Contract references provided for validation

### TDD Readiness
- ✅ Tests written before implementation (T002-T003 before T004+)
- ✅ Expected failure modes documented (RED phase defined)
- ✅ Contract-driven development (API contract exists before tests)
- ✅ Integration test validates complete user journey

### Specification Alignment
- ✅ T001 schema matches data-model.md exactly
- ✅ T002 test cases align with spec.md acceptance criteria (US1, scenarios 2-3)
- ✅ T003 validates end-to-end flow from spec.md (US1, scenario 4)
- ✅ Status enum values match spec requirements (analyzing, prioritized, not_relevant, conflict)

### Documentation Quality
- ✅ Each task has clear SEE-DO-VERIFY breakdown
- ✅ File paths are absolute and unambiguous
- ✅ Test cases are specific (not vague "test basic functionality")
- ✅ Contract references link back to source of truth

---

## Recommendations

### Priority 1: Fix T001 Vertical Slice Violation
**Action:** Restructure T001 as implicit prerequisite, not standalone task
**Implementation:**
```markdown
## Phase 1: Database Foundation (Prerequisite)

**Migration Required**: Create `manual_tasks` table before any test execution

- File: `supabase/migrations/029_create_manual_tasks.sql`
- Schema: See contracts/database-migration.sql
- Verification: Tests in Phase 2 will validate table exists

**NOTE**: This is NOT a vertical slice - it's infrastructure. Tests (T002-T003) validate the migration was applied correctly.
```

Then merge into T002-T003:
```markdown
- [ ] T002 [SLICE] [US1] Contract test for manual task status polling
  - **Prerequisites**: 
    1. Ensure migration 029 applied: `supabase migration list`
    2. If not applied: `supabase db push`
    3. Verify table exists: Test setup validates schema
  - **File**: `__tests__/contract/manual-task-status.test.ts`
  - **SEE**: Test file with contract validations
  - **DO**: Execute test suite, confirm RED phase
  - **VERIFY**: All tests fail with "route not found" (expected)
```

### Priority 2: Add Explicit TDD Checkpoints
**Action:** Add workflow validation steps to T002-T003
**Add to each task:**
```markdown
**TDD WORKFLOW ENFORCEMENT:**
1. ✅ Write test code
2. ✅ Run test: `pnpm test:run <test-file>`
3. ✅ VERIFY RED: Test must fail with expected error
4. ✅ Mark task complete ONLY after RED confirmed
5. ⏸️ STOP: Do NOT implement solution yet (that's T004+)
```

### Priority 3: Specify Integration Test Implementation Details
**Action:** Add technical guidance to T003
**Add to task description:**
```markdown
**Technical Implementation:**
- **Database**: Use Supabase test project (not production)
- **Agent Mock**: Mock `analyzeManualTask()` for deterministic results
  - Mock "relevant" return: status='prioritized', agent_rank=2
  - Mock "irrelevant" return: status='not_relevant', exclusion_reason="Test reason"
- **Polling**: 20 attempts × 1s interval = 20s max wait
- **Cleanup**: Delete test data after each test run
- **Isolation**: Tests must be safe to run in parallel
```

### Priority 4: Clarify Dependencies
**Action:** Update dependency declarations
**T002-T003 should state:**
```markdown
Dependencies: Migration 029 applied (validate in test setup)
Parallel with: T002 ↔ T003 (independent of each other)
Blocks: T004-T010 (implementation requires failing tests)
```

### Priority 5: Add Completion Validation
**Action:** Add explicit completion criteria to each task
**Add to T002:**
```markdown
**Task Complete When:**
- ✅ Test file committed to repo
- ✅ Test execution confirmed (screenshot or CI log)
- ✅ RED phase verified (test fails as expected)
- ✅ Test code reviewed for correctness
- ✅ Ready to unblock implementation tasks
```

---

## Next Steps

### If Review PASSES (After Revisions)
1. Apply recommended fixes to tasks.md
2. Resubmit for final approval
3. Proceed to implementation phase with clear TDD workflow

### If Review FAILS (Current State)
1. **BLOCK implementation until fixes applied**
2. Restructure T001 per Priority 1 recommendation
3. Add TDD checkpoints per Priority 2 recommendation
4. Clarify T003 implementation per Priority 3 recommendation
5. Update dependency declarations per Priority 4 recommendation
6. Add completion criteria per Priority 5 recommendation

### Handoff to Orchestrator
```json
{
  "review_file": ".claude/reviews/016-manual-task-creation-T001-T003-task-definition-review.md",
  "status": "needs_revision",
  "critical_issues": 0,
  "high_issues": 1,
  "medium_issues": 2,
  "low_issues": 1,
  "blocking_issue": "T001 violates vertical slice principle (infrastructure-only task)",
  "recommended_action": "Merge T001 into T002-T003 as implicit prerequisite setup",
  "proceed_to": "task_restructuring_required",
  "estimated_fix_time": "15-30 minutes (documentation updates only)"
}
```

---

## Review Standards Applied

### Vertical Slice Compliance (SYSTEM_RULES.md)
- ✅ Reviewed against Three Laws (SEE-DO-VERIFY)
- ✅ Checked for forbidden infrastructure-only tasks
- ✅ Validated user-testable outcomes
- ❌ **Found violation in T001** (infrastructure-only setup)

### TDD Readiness (.claude/standards.md)
- ✅ Tests marked to run before implementation
- ⚠️ RED phase mentioned but not enforced as checkpoint
- ✅ Test coverage appears comprehensive
- ⚠️ Missing mock strategy and test isolation details

### Standards Compliance (.claude/standards.md)
- ✅ File paths follow project conventions
- ✅ TypeScript strict mode expected
- ✅ Zod validation planned
- ✅ Database patterns follow existing migrations

### Schema Alignment (data-model.md)
- ✅ T001 schema matches data model exactly
- ✅ Foreign key relationships correct
- ✅ Indexes appropriate for query patterns
- ✅ Status enum values match spec requirements

---

## Approval Status
**NEEDS REVISION**

**Required Changes:**
1. **[HIGH]** Restructure T001 to eliminate vertical slice violation
2. **[MEDIUM]** Add explicit TDD workflow checkpoints to T002-T003
3. **[MEDIUM]** Specify integration test implementation details in T003
4. **[LOW]** Update contract references with HTTP method/schema names

**Estimated Fix Time:** 15-30 minutes (documentation updates only)

**After Fixes:** Re-review recommended before proceeding to implementation

---

**Review Completed By:** code-reviewer agent  
**Review Date:** 2025-01-27  
**Tasks Reviewed:** T001, T002, T003  
**Feature:** Manual Task Creation (Phase 18, spec: 016-manual-task-creation)  
**Focus:** Task definition quality for TDD-ready implementation
