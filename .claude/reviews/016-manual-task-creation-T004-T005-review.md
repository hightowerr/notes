# Code Review: Manual Task Creation - Tasks T004-T005 Service & Schema Layer

## Status
**NEEDS REVISION**

## Summary
Reviewed tasks T004-T005 for the Manual Task Creation feature (Phase 18). These tasks define the service layer (manual task placement) and schema validation layer. While the technical specifications are solid and align with existing architecture, **both tasks violate vertical slice principles** as they deliver no user-testable value independently. Constitution v1.1.0 explicitly forbids infrastructure-only tasks. Tasks must be restructured to integrate into complete user journeys.

---

## Issues Found

### CRITICAL

**T004-T005: Violate Vertical Slice Principle (Infrastructure-Only Pattern)**

**File**: tasks.md (lines 108-165)
**Issue**: Both T004 (service layer) and T005 (schema layer) are backend infrastructure without user-facing value, violating Constitution v1.1.0 Section I "Infrastructure Integration Rules".

**Evidence from Constitution v1.1.0:**
```markdown
Infrastructure work (database migrations, test fixtures, build configuration) is NEVER a standalone slice.

Validation Rule:
- Ask: "Can a non-technical person test this task's output?"
- If NO → It's infrastructure and must be absorbed into a user-testable slice
```

**Current T004 behavior (lines 108-138):**
- **SEE**: Service file created with exported functions ❌ (Developer-only, not user-visible)
- **DO**: Implement analyzeManualTask(), getAnalysisStatus() ❌ (Not a user action)
- **VERIFY**: T003 integration test passes (GREEN phase) ⚠️ (Test outcome, not user outcome)

**Ask: "Can a non-technical person test T004's output?"**
Answer: NO - They cannot test service functions directly, only through UI that calls them.

**Current T005 behavior (lines 139-165):**
- **SEE**: Schema file with Zod validators ❌ (Developer-only artifact)
- **DO**: Define schemas for input/output validation ❌ (Not a user action)
- **VERIFY**: Schemas validate correct inputs, reject invalid ones ⚠️ (Unit test verification, not user verification)

**Ask: "Can a non-technical person test T005's output?"**
Answer: NO - Schema validation is backend infrastructure, not user-testable.

**Why This Is Critical:**
From previous review (016-manual-task-creation-T001-T003-task-definition-review.md):
- T001 [SETUP] was flagged for identical violation
- Constitution v1.1.0 Section I explicitly forbids standalone infrastructure tasks
- **Consistency violation**: Approving T004-T005 contradicts T001 rejection

**Fix Required:**
Restructure T004-T005 into existing vertical slices or merge with user-facing tasks.

**Option A (Recommended): Merge into API Implementation Slice (T006)**

Current structure:
```markdown
T004 [P] [SLICE] [US1] Create manual task placement service
T005 [P] [SLICE] [US1] Create manual task placement schemas
T006 [SLICE] [US1] Implement GET /api/tasks/manual/[id]/status endpoint
```

Corrected structure:
```markdown
T006 [SLICE] [US1] Implement manual task status endpoint with service layer
  - **Prerequisites** (implemented within this task):
    1. Create lib/schemas/manualTaskPlacementSchemas.ts (analyzeManualTaskInputSchema, manualTaskAnalysisResultSchema)
    2. Create lib/services/manualTaskPlacement.ts (analyzeManualTask, getAnalysisStatus functions)
    3. Create app/api/tasks/manual/[id]/status/route.ts (endpoint handler)
  - **SEE**: API responds to GET requests at /api/tasks/manual/[id]/status
  - **DO**: Call endpoint with task ID, receive status response
  - **VERIFY**: T002 contract test passes (GREEN phase), can curl endpoint and see JSON response
  - **Test**: Unit tests for schemas, service layer, and API handler all pass
  - **User Value**: Users (via UI) can poll task status to see placement progress
```

**Option B: Merge into Test Tasks (T002-T003)**

Absorb service/schema creation into test setup:
```markdown
T002-T003 [SLICE] [US1] Contract + Integration tests with service implementation
  - **Phase 1**: Write failing tests (RED)
  - **Phase 2**: Implement minimal service layer to pass tests (GREEN)
    - Create schemas: lib/schemas/manualTaskPlacementSchemas.ts
    - Create service: lib/services/manualTaskPlacement.ts  
    - Create endpoint: app/api/tasks/manual/[id]/status/route.ts
  - **Phase 3**: Verify all tests pass, refactor if needed
```

**Recommendation**: Use Option A. It maintains clear separation between test definition (T002-T003) and implementation (T006), while ensuring T006 delivers complete user value by including all necessary infrastructure.

---

### HIGH

**T004: Service Implementation Depends on Non-Existent Prioritization Agent Extension**

**File**: tasks.md (line 135)
**Issue**: Task description states "Extends lib/mastra/agents/prioritizationGenerator.ts (existing)" but doesn't specify what extension is needed or if the agent supports manual task analysis.

**Current description (line 135):**
```markdown
Dependencies: Extends `lib/mastra/agents/prioritizationGenerator.ts` (existing)
```

**Evidence from lib/mastra/agents/prioritizationGenerator.ts:**
- Current agent prompt (GENERATOR_PROMPT) designed for batch task filtering, not single-task placement
- No existing logic for manual task priority boost (1.2x multiplier per spec FR-015)
- Agent expects full context (outcome, reflections, task list, baseline) - manual task has minimal context

**Missing Specification:**
1. Does analyzeManualTask() call existing agent or require new agent?
2. How is 1.2x priority boost applied (in prompt, post-processing, or service layer)?
3. How does single-task analysis differ from batch prioritization?
4. What happens if agent is unavailable or times out?

**Current Implementation in lib/services/manualTaskPlacement.ts (lines 149-208):**
```typescript
// Service ALREADY EXISTS and calls prioritizationGenerator
const agent = createPrioritizationAgent(instructions, initializeMastra());
const agentResult = await agent.run({
  task_id: params.taskId,
  task_text: params.taskText,
  outcome_id: params.outcomeId,
  is_manual: true,
});
```

**Observation:** Service file already exists! Task T004 describes implementing a service that's already implemented.

**Fix Required:**
Update T004 to reflect actual implementation status:
- If service already complete: Mark T004 as [COMPLETE] or remove from tasks
- If service needs updates: Specify exact changes needed (e.g., add boost logic, improve error handling)
- If service needs testing: Focus T004 on test coverage, not implementation

---

**T004: Missing Agent Prompt Strategy for Single-Task Analysis**

**File**: tasks.md (lines 128-134)
**Issue**: Task doesn't specify how to adapt batch prioritization agent for single-task placement.

**Current agent prompt context (from prioritizationGenerator.ts):**
```typescript
export interface PrioritizationContext {
  outcome: string;
  reflections: string;
  taskCount: number;
  newTaskCount?: number;
  tasks: string;              // Expects multiple tasks
  baselineSummary?: string;
  previousPlan: string;
  dependencyConstraints: string;
}
```

**Manual task analysis context (from manualTaskPlacement.ts lines 165-174):**
```typescript
const context: PrioritizationContext = {
  outcome: buildOutcomeText(outcome),
  reflections: 'Manual task placement',      // Not real reflections
  taskCount: 1,                              // Single task
  newTaskCount: 1,
  tasks: params.taskText,                     // Single task text
  previousPlan: 'N/A',                        // No plan context
  dependencyConstraints: 'None',
  baselineSummary: 'Manual task placement request',
};
```

**Concern**: Agent designed for comparative ranking of multiple tasks, now used for binary include/exclude decision on single task. This might produce low-quality decisions.

**Missing from T004:**
- Should we create separate agent for manual task placement?
- Should we modify existing agent prompt to handle single-task mode?
- How do we ensure agent makes binary decision (include/exclude) vs ranked list?
- How do we apply 1.2x boost if agent can't compare to other tasks?

**Fix**: Add technical design decision to T004:
```markdown
**Agent Strategy Decision:**
Option 1: Use existing prioritizationGenerator with minimal context (current implementation)
  - Pro: No new agent needed, reuses existing logic
  - Con: Agent optimized for batch ranking, not binary placement

Option 2: Create dedicated manualTaskPlacementAgent with simplified prompt
  - Pro: Clearer decision criteria, faster execution, lower cost
  - Con: Duplicate agent logic, more maintenance overhead

**Selected**: Option 1 (current implementation), with future optimization to Option 2 if needed

**1.2x Boost Implementation**: Applied in service layer AFTER agent decision:
- If agent returns decision='include', multiply agent_rank by 1.2
- Store boosted rank in manual_tasks.agent_rank
- Document boost in placement_reason field
```

---

### MEDIUM

**T005: Schema Design Doesn't Match Existing Service Implementation**

**File**: tasks.md (lines 144-162)
**Issue**: Task defines schemas that don't align with actual service function signatures in lib/services/manualTaskPlacement.ts.

**T005 proposed schema (lines 146-151):**
```typescript
export const analyzeManualTaskInputSchema = z.object({
  taskId: z.string().uuid(),
  taskText: z.string().min(1).max(500),
  outcomeId: z.string().uuid(),
});
```

**Actual service signature (manualTaskPlacement.ts line 149):**
```typescript
export async function analyzeManualTask(params: {
  taskId: string;
  taskText: string;
  outcomeId: string;
}): Promise<ManualTaskAnalysisResult>
```

**Mismatch:**
- T005 schema expects UUID validation: `z.string().uuid()`
- Service signature uses plain `string` (no runtime validation)
- No Zod schema is actually imported or used in service file

**Check actual implementation:**
```bash
# manualTaskPlacement.ts line 154-156
if (!params.taskId || !params.taskText) {
  throw new ManualTaskPlacementError('taskId and taskText are required');
}
```

**Observation:** Service does manual validation, doesn't use Zod schema from T005 at all!

**Fix Required:**
Either:
1. Update T005 to match actual implementation (no Zod schema needed, service validates manually)
2. Update service to use Zod schema validation (refactor analyzeManualTask to validate with schema)
3. Clarify that T005 schema is for API endpoint validation, not service layer

**Recommendation:** Option 3 - Schema is for API endpoint (T006), not service internal validation. Update T005 description:
```markdown
**Purpose**: Define Zod schemas for API endpoint request/response validation (used in T006)
**Schemas**:
  - analyzeManualTaskInputSchema: Validates POST request body to trigger analysis
  - manualTaskAnalysisResultSchema: Validates GET response from status endpoint
**Note**: Service layer (analyzeManualTask) validates internally, schemas are for API boundary
```

---

**T004-T005: Marked [P] for Parallel Execution but Incorrect Dependency Claims**

**File**: tasks.md (lines 108, 139)
**Issue**: Both tasks marked [P] claiming "runs in parallel" but have implicit dependencies.

**T004 description (line 137):**
```markdown
Dependencies: Extends `lib/mastra/agents/prioritizationGenerator.ts` (existing)
Test: T003 integration test validates end-to-end flow
```

**T005 description (line 164):**
```markdown
Dependencies: None (runs in parallel with T004)
```

**Actual Dependencies:**
- T004 depends on T005 if service uses schemas for validation (currently doesn't, but T005 suggests it should)
- T005 schema design depends on understanding T004 service function signatures
- Both depend on T002-T003 tests being written (need to know what tests expect)

**Evidence from tasks.md (line 112):**
```markdown
VERIFY: T003 integration test passes (GREEN phase)
```

**This means**: T004 cannot be complete until T003 exists and passes. But T003 is marked [P] with T002 (parallel execution). So execution order should be:

```
T002 [P] + T003 [P] → Define tests (RED phase)
  ↓
T004 + T005 → Implement service/schemas (GREEN phase)
  ↓
T006 → Implement API endpoint (GREEN phase)
```

**But T004-T005 marked [P] suggests they run in parallel with tests, which is incorrect for TDD workflow.**

**Fix Required:**
Remove [P] flag from T004-T005, or clarify execution order:
```markdown
T004 [SLICE] [US1] Create manual task placement service
  - **Dependencies**: T002-T003 complete (tests must fail first - TDD RED phase)
  - **Sequential with**: T005 (schema layer)
  - **Test**: T003 integration test must pass after T004 complete (GREEN phase)

T005 [SLICE] [US1] Create manual task placement schemas  
  - **Dependencies**: T002-T003 complete (need to know expected API contract)
  - **Sequential with**: T004 (service layer uses schemas)
  - **Test**: Unit test validates schema validation logic
```

---

### LOW

**T005: Unit Test File Path Not Specified in Main Task Description**

**File**: tasks.md (line 165)
**Issue**: Task mentions "Create unit test" but path only in last line, easy to miss.

**Current description (line 165):**
```markdown
Test: Create unit test in `__tests__/unit/schemas/manualTaskPlacementSchemas.test.ts`
```

**Better structure:**
```markdown
**Files**:
  - lib/schemas/manualTaskPlacementSchemas.ts (schemas)
  - __tests__/unit/schemas/manualTaskPlacementSchemas.test.ts (unit tests)

**Test Coverage**:
  - Valid inputs pass validation
  - Invalid inputs rejected with clear error messages
  - Edge cases: empty strings, null values, malformed UUIDs
  - Run with: `pnpm test:run __tests__/unit/schemas/manualTaskPlacementSchemas.test.ts`
```

---

## Standards Compliance

### Tech Stack Patterns
- ✅ Service file location correct: `lib/services/manualTaskPlacement.ts`
- ✅ Schema file location correct: `lib/schemas/manualTaskPlacementSchemas.ts`
- ✅ Zod validation planned (industry standard for TypeScript)
- ⚠️ Service already exists (T004 may be duplicate work)
- ✅ TypeScript strict mode expected

### File Scope
- ✅ T004: Single service file, clear scope
- ✅ T005: Single schema file, clear scope
- ⚠️ T004 claims to extend prioritizationGenerator.ts (violates single-file scope)

### TDD Workflow
- ⚠️ T004 depends on T003 passing (GREEN phase) - correct TDD order
- ⚠️ T005 marked as parallel with T004 but no clear test-first workflow
- ❌ Neither task follows "write test FIRST" mandate from SYSTEM_RULES.md
- ⚠️ T005 unit test mentioned but not emphasized as TDD requirement

**From SYSTEM_RULES.md (lines 38-44):**
```markdown
Step 2: TDD Enforcement
NO EXCEPTIONS TO THIS ORDER:
1. Write failing test FIRST
2. Implement minimal code to pass
3. Review code quality
4. Run all tests
5. Validate user journey
```

**T004-T005 current order:**
1. ❌ Implement service (T004)
2. ❌ Implement schemas (T005)
3. ✅ Verify T003 passes (test comes AFTER implementation)

**Should be:**
1. ✅ Write T003 integration test (FIRST)
2. ✅ Write T005 schema unit tests (FIRST)
3. ❌ Implement T005 schemas (GREEN)
4. ❌ Implement T004 service using T005 schemas (GREEN)
5. ✅ Verify all tests pass

**Fix Required:**
Reorder tasks or merge into test-driven implementation slice.

---

## Implementation Quality

### Service Architecture (T004)
- ✅ Service already exists in lib/services/manualTaskPlacement.ts (189 lines)
- ✅ Exports analyzeManualTask() and getAnalysisStatus() functions as specified
- ✅ Error handling with custom error classes (ManualTaskPlacementError, ManualTaskNotFoundError)
- ✅ Agent integration working (calls prioritizationGenerator)
- ⚠️ No 1.2x boost implementation visible (spec FR-015 requires this)
- ⚠️ Agent decision mapping uses fallback to 'not_relevant' on error (line 143-146)

**Strengths:**
- Clean separation of concerns (fetch, build, analyze, map, update)
- Helper functions well-named (fetchManualTask, fetchOutcome, buildOutcomeText, mapAgentDecision)
- Async/await properly used throughout
- Database queries use Supabase client correctly

**Concerns:**
- Service doesn't validate inputs with Zod (T005 schemas unused)
- 1.2x boost not implemented (spec requirement missing)
- Agent context is minimal (may produce low-quality decisions)
- No retry logic if agent fails (single-shot analysis)

**T004 Claims to Implement:**
```markdown
Apply 1.2x priority boost to manual tasks (per spec FR-015)
```

**Actual Implementation:**
```typescript
// manualTaskPlacement.ts line 113-120
function mapAgentDecision(result: Record<string, any>): ManualTaskAnalysisResult {
  if (result?.decision === 'include') {
    return {
      status: 'prioritized',
      rank: typeof result.agent_rank === 'number' ? result.agent_rank : undefined,
      placementReason: result.placement_reason ?? result.reason ?? 'Agent included manual task',
    };
  }
  // ...
}
```

**No 1.2x boost applied!** Rank is passed through unchanged from agent.

**Fix Required:**
Add boost logic to T004 specification or clarify that boost is applied elsewhere (e.g., in agent prompt or during reprioritization).

---

### Schema Design (T005)
- ⚠️ Proposed schemas don't match existing manual task schemas in lib/schemas/manualTaskSchemas.ts
- ⚠️ Duplicate schema definitions may cause confusion

**Existing schemas (manualTaskSchemas.ts):**
```typescript
export const manualTaskInputSchema = z.object({
  task_text: z.string().trim().min(10).max(500),
  estimated_hours: z.number().int().min(8).max(160).optional(),
  outcome_id: z.string().uuid().optional(),
});
```

**T005 proposes NEW schemas:**
```typescript
export const analyzeManualTaskInputSchema = z.object({
  taskId: z.string().uuid(),
  taskText: z.string().min(1).max(500),
  outcomeId: z.string().uuid(),
});
```

**Differences:**
- T005 uses `taskId` + `taskText` + `outcomeId` (camelCase)
- Existing uses `task_text` + `estimated_hours` + `outcome_id` (snake_case)
- T005 max(500), existing max(500) - same
- T005 min(1), existing min(10) - different minimums!

**Concern:** Schema inconsistency between task creation (existing) and task analysis (T005). This violates DRY principle and creates confusion about validation rules.

**Fix Required:**
Option 1: Reuse existing `manualTaskInputSchema` instead of creating new schema
Option 2: Clarify that T005 schemas are for different purpose (analysis status endpoint, not task creation)
Option 3: Consolidate all manual task schemas in single file

**Recommendation:** Option 2 - Keep schemas separate by purpose, but ensure naming consistency (snake_case vs camelCase).

---

## Vertical Slice Check

### T004 [P] [SLICE] [US1] Create manual task placement service
- ❌ **SEE**: Service code is not user-visible (developer artifact)
- ❌ **DO**: Service functions not directly callable by users (backend only)
- ⚠️ **VERIFY**: Test pass/fail is not user-verifiable outcome (developer validation)
- ❌ **Integration**: No UI, no API endpoint, no user interaction
- **Verdict**: NOT A VERTICAL SLICE - Pure backend infrastructure

**Ask: "Can a non-technical person test this task's output?"**
Answer: NO - Service layer is internal, requires developer knowledge to test.

**Ask: "Could my mom test this feature?" (SYSTEM_RULES.md line 73)**
Answer: NO - She cannot call TypeScript functions or inspect service layer code.

---

### T005 [P] [SLICE] [US1] Create manual task placement schemas
- ❌ **SEE**: Schema definitions not visible to users (code-level artifact)
- ❌ **DO**: Zod validators not interactive for users (validation logic)
- ⚠️ **VERIFY**: Unit tests confirm validation but not user-testable
- ❌ **Integration**: No UI, no API endpoint, no user interaction
- **Verdict**: NOT A VERTICAL SLICE - Pure validation infrastructure

**Ask: "Can a non-technical person test this task's output?"**
Answer: NO - Schema validation is backend infrastructure, invisible to users.

**Ask: "Could my mom test this feature?"**
Answer: NO - She cannot write Zod schemas or understand validation errors.

---

**Constitution v1.1.0 Violation Analysis:**

From Section I "Infrastructure Integration Rules":
```markdown
Infrastructure work (database migrations, test fixtures, build configuration) is NEVER a standalone slice.

Validation Rule:
- Ask: "Can a non-technical person test this task's output?"
- If NO → It's infrastructure and must be absorbed into a user-testable slice
```

**T004 + T005 fail this validation:**
- Neither delivers user-testable value independently
- Both are backend infrastructure (service layer + validation layer)
- No UI entry point, no user action, no visible outcome

**From Constitution v1.1.0 Section I examples:**
```markdown
FORBIDDEN: [SETUP] Tasks (Pure infrastructure):
- ❌ Database migrations without user-testable feature
- ❌ "Configure linting" without feature using it
- ❌ "Setup authentication framework" without login flow
- ❌ Any task where answer to "Can user test this?" is NO
```

**T004-T005 equivalent forbidden patterns:**
- ❌ "Create service layer" without API endpoint using it
- ❌ "Define validation schemas" without form using them
- ❌ Backend-only tasks without user-facing integration

**Consistency Check:**
Previous review flagged T001 [SETUP] for identical violation. Approving T004-T005 would be inconsistent.

---

## Dependencies & Execution Order

### T004 Actual Dependencies
**Declared (line 135):**
```markdown
Dependencies: Extends `lib/mastra/agents/prioritizationGenerator.ts` (existing)
Test: T003 integration test validates end-to-end flow
```

**Actual:**
- Depends on T002-T003 written and failing (TDD RED phase required)
- Depends on manual_tasks table existing (T001 migration applied)
- Depends on prioritizationGenerator agent operational
- Depends on T005 schemas if service should validate inputs with Zod

**Missing from declaration:**
- No mention of T001 prerequisite (manual_tasks table must exist)
- No mention of OpenAI API key requirement (agent needs this)
- No mention of Supabase admin client configuration

---

### T005 Actual Dependencies
**Declared (line 164):**
```markdown
Dependencies: None (runs in parallel with T004)
```

**Actual:**
- Depends on understanding T004 service function signatures (to design schemas correctly)
- Depends on data-model.md ManualTaskAnalysisResult type definition
- Depends on existing manualTaskSchemas.ts patterns for consistency

**Parallel Execution Claim:**
Technically true (different files), but schema design should inform service implementation, suggesting sequential order might be better:
```
T005 (schemas) → T004 (service uses schemas)
```

However, current implementation shows T004 doesn't use T005 schemas at all, so parallel execution is valid IF:
- T005 schemas are for API endpoint validation only (T006)
- T004 service does internal validation (current implementation)

**Fix Required:**
Clarify purpose of T005 schemas:
```markdown
**Purpose**: Define Zod schemas for API endpoint request/response validation (T006 will use these)
**Note**: Service layer (T004) validates internally, schemas are for API boundary protection
**Dependencies**: T004 service signature design (need to know function parameters)
**Parallel with**: Can run parallel with T004 if schema purpose is API-only, not service-layer
```

---

## Completion Criteria

### What's Well-Defined

**T004:**
- ✅ File path specified: `lib/services/manualTaskPlacement.ts`
- ✅ Function signatures documented (analyzeManualTask, getAnalysisStatus)
- ✅ Logic flow outlined (check outcome, call agent, parse response, update DB)
- ✅ Expected output schema documented (ManualTaskAnalysisResult from data-model.md)

**T005:**
- ✅ File path specified: `lib/schemas/manualTaskPlacementSchemas.ts`
- ✅ Schema definitions provided (analyzeManualTaskInputSchema, manualTaskAnalysisResultSchema)
- ✅ Validation rules clear (uuid, min/max length, optional fields)
- ✅ Unit test file path specified

---

### What's Missing

**T004:**
- ⚠️ How to implement 1.2x priority boost (spec FR-015 requirement)
- ⚠️ Error handling strategy (retry? timeout? fallback?)
- ⚠️ Agent prompt adaptation for single-task analysis
- ⚠️ Performance target (must complete in <10s per spec SC-012)
- ⚠️ Telemetry/logging requirements (observable by design principle)

**T005:**
- ⚠️ Relationship to existing manualTaskSchemas.ts unclear
- ⚠️ Unit test implementation details (edge cases to test?)
- ⚠️ Schema usage context (API only? Service layer? Both?)
- ⚠️ Validation error message requirements (user-friendly? developer-friendly?)

**Both:**
- ❌ No clear user story mapping (how do these enable US1?)
- ❌ No definition of done (when is task complete?)
- ❌ No demo steps (how to show this works?)
- ❌ No integration with UI (which component uses these?)

---

## Strengths

### Technical Accuracy
- ✅ T004 function signatures match data-model.md specifications exactly
- ✅ T005 Zod schemas follow TypeScript best practices
- ✅ Both tasks align with existing architecture patterns
- ✅ Service layer design is modular and testable
- ✅ Schema validation follows industry standards (Zod)

### Code Organization
- ✅ Clear file paths in lib/services/ and lib/schemas/ (follows conventions)
- ✅ Exported functions have clear purpose (single responsibility)
- ✅ Type definitions use TypeScript interfaces (strongly typed)
- ✅ Error handling planned (ManualTaskPlacementError classes)

### Architectural Alignment
- ✅ Service layer separated from API layer (good separation of concerns)
- ✅ Schemas reusable across multiple endpoints (DRY principle)
- ✅ Agent integration follows existing Mastra patterns
- ✅ Database queries use Supabase client correctly

---

## Recommendations

### Priority 1: Restructure as Vertical Slices (CRITICAL)

**Action:** Merge T004-T005 into user-testable slices

**Option A (Recommended): Merge into T006 API Implementation**
```markdown
T006 [SLICE] [US1] Implement manual task status endpoint with full stack
  - **Prerequisites** (all implemented within this task):
    1. Schema Layer (previously T005):
       - File: lib/schemas/manualTaskPlacementSchemas.ts
       - Schemas: analyzeManualTaskInputSchema, manualTaskAnalysisResultSchema
       - Unit tests: __tests__/unit/schemas/manualTaskPlacementSchemas.test.ts
    
    2. Service Layer (previously T004):
       - File: lib/services/manualTaskPlacement.ts
       - Functions: analyzeManualTask(), getAnalysisStatus()
       - Includes 1.2x boost logic (spec FR-015)
       - Integration tests: T003 validates end-to-end
    
    3. API Layer:
       - File: app/api/tasks/manual/[id]/status/route.ts
       - Endpoint: GET /api/tasks/manual/{id}/status
       - Validation: Uses schemas from step 1
       - Handler: Calls service from step 2
  
  - **SEE**: API responds to curl requests with JSON status
  - **DO**: HTTP GET request to /api/tasks/manual/[task-id]/status
  - **VERIFY**: 
    - Contract test T002 passes (GREEN)
    - curl returns {"status":"analyzing"} or similar
    - Postman/Insomnia can hit endpoint successfully
  
  - **User Value**: Enables UI polling for task status (foundation for US1 UX)
  - **TDD Flow**:
    1. T002 contract test already written and failing (RED)
    2. Implement schemas (GREEN schema unit tests)
    3. Implement service (GREEN integration test T003)
    4. Implement API endpoint (GREEN contract test T002)
  
  - **Definition of Done**:
    - ✅ All tests pass (unit + contract + integration)
    - ✅ Endpoint callable via curl/Postman
    - ✅ Code reviewed and approved
    - ✅ Can demo to non-technical person: "Call this URL, see task status"
```

**Option B: Absorb into Test-Driven Development Slice (T002-T003)**
```markdown
T002-T003 [SLICE] [US1] Test-driven implementation of manual task status system
  - **Phase 1: RED** - Write failing tests
    - Contract test: __tests__/contract/manual-task-status.test.ts
    - Integration test: __tests__/integration/manual-task-placement-flow.test.ts
    - Run tests: All fail as expected
  
  - **Phase 2: GREEN** - Implement minimal working system
    - Schemas: lib/schemas/manualTaskPlacementSchemas.ts
    - Service: lib/services/manualTaskPlacement.ts
    - API: app/api/tasks/manual/[id]/status/route.ts
    - Run tests: All pass
  
  - **Phase 3: REFACTOR** - Improve code quality
    - Add 1.2x boost logic
    - Improve error messages
    - Add telemetry
  
  - **SEE**: Test suite green, endpoint operational
  - **DO**: Execute `pnpm test:run __tests__/contract/manual-task-status.test.ts`
  - **VERIFY**: All tests pass, can curl endpoint successfully
```

**Rationale for Option A:**
- Maintains separation between test definition (T002-T003) and implementation
- Clear user-testable outcome (working API endpoint)
- Follows Constitution's "absorb infrastructure into user slice" guidance
- Easier to demo ("here's a working endpoint" vs "here's a passing test")

---

### Priority 2: Add 1.2x Boost Implementation Details

**Action:** Specify where and how 1.2x boost is applied

**Add to T004 (or merged T006):**
```markdown
**1.2x Priority Boost Implementation (Spec FR-015):**

Location: Apply in service layer AFTER agent decision, BEFORE database update

Logic:
```typescript
// In analyzeManualTask() after mapAgentDecision()
if (analysis.status === 'prioritized' && analysis.rank) {
  // Apply 1.2x boost to manual tasks
  const boostedRank = Math.round(analysis.rank * 1.2);
  analysis.rank = boostedRank;
  
  // Document boost in placement reason
  const boostNote = `[Manual task priority boost applied: ${analysis.rank} → ${boostedRank}]`;
  analysis.placementReason = `${analysis.placementReason} ${boostNote}`;
}
```

Rationale:
- Service layer is appropriate (single source of truth for boost logic)
- Applied after agent decision (boost doesn't affect agent's judgment)
- Documented in placement_reason (transparent to users)

Alternative: Apply in agent prompt
- Pro: Agent considers boost when comparing tasks
- Con: Requires agent to understand manual task metadata
- Decision: Service-layer boost preferred for simplicity
```

---

### Priority 3: Clarify Schema Purpose and Usage

**Action:** Update T005 to specify where schemas are used

**Add to T005 (or merged T006):**
```markdown
**Schema Usage Context:**

1. analyzeManualTaskInputSchema:
   - Used by: API endpoint validation (app/api/tasks/manual/route.ts for POST)
   - NOT used by: Service layer (analyzeManualTask validates internally)
   - Purpose: Protect API boundary from invalid requests

2. manualTaskAnalysisResultSchema:
   - Used by: API endpoint response validation (GET /api/tasks/manual/[id]/status)
   - NOT used by: Service layer (getAnalysisStatus returns typed object)
   - Purpose: Ensure consistent API response shape

**Relationship to Existing Schemas:**
- manualTaskSchemas.ts: Task creation (POST /api/tasks/manual)
- manualTaskPlacementSchemas.ts: Task analysis status (GET /api/tasks/manual/[id]/status)
- Different files for different API endpoints (clear separation)

**Naming Convention:**
- Existing uses snake_case (task_text, outcome_id)
- T005 proposes camelCase (taskText, outcomeId)
- Decision: Keep camelCase for API layer, snake_case for database layer
- Conversion handled in service layer
```

---

### Priority 4: Add TDD Checkpoints

**Action:** Make TDD workflow explicit and enforceable

**Add to T004-T005 (or merged T006):**
```markdown
**TDD Enforcement Checkpoints:**

Checkpoint 1: RED Phase Confirmation
- [ ] T002 contract test written and failing
- [ ] T003 integration test written and failing
- [ ] Error messages confirm expected failures ("route not found", "service not found")
- [ ] Screenshot or CI log proves RED phase

Checkpoint 2: GREEN Phase Implementation
- [ ] Schemas implemented (T005 unit tests pass)
- [ ] Service implemented (T003 integration test passes)
- [ ] API implemented (T002 contract test passes)
- [ ] All tests green in CI

Checkpoint 3: REFACTOR Phase (Optional)
- [ ] Code reviewed for quality
- [ ] Performance optimized if needed
- [ ] Error handling improved
- [ ] Documentation updated

**Rule:** Cannot proceed to next checkpoint until current checkpoint complete.
```

---

### Priority 5: Add Definition of Done

**Action:** Define explicit completion criteria

**Add to T004-T005 (or merged T006):**
```markdown
**Definition of Done:**

Technical:
- ✅ All unit tests pass (schemas validated)
- ✅ All integration tests pass (service behavior correct)
- ✅ All contract tests pass (API shape correct)
- ✅ Code coverage ≥80% for new code
- ✅ TypeScript strict mode clean (no `any`, no `@ts-ignore`)
- ✅ ESLint passes with no warnings

Functional:
- ✅ Can curl endpoint and get valid JSON response
- ✅ Can call service functions from Node REPL
- ✅ Error cases return appropriate HTTP status codes (404, 400, 500)
- ✅ Agent analysis completes in <10s (spec SC-012)

Documentation:
- ✅ Function signatures documented with JSDoc comments
- ✅ Schema fields have description annotations
- ✅ API endpoint added to contracts/manual-task-placement-api.yaml
- ✅ README.md updated with new endpoint

Demo:
- ✅ Can demonstrate working endpoint to non-technical stakeholder
- ✅ Can show test suite passing in CI
- ✅ Can explain user value: "This enables UI to show task status"
```

---

## Next Steps

### If Review PASSES (After Revisions)
1. Restructure T004-T005 per Priority 1 recommendation (merge into T006)
2. Add 1.2x boost implementation details per Priority 2
3. Clarify schema usage per Priority 3
4. Add TDD checkpoints per Priority 4
5. Add definition of done per Priority 5
6. Resubmit for final approval
7. Proceed to merged implementation with clear user value

### If Review FAILS (Current State)
1. **BLOCK implementation until fixes applied**
2. Cannot approve T004-T005 as standalone [SLICE] tasks (Constitution v1.1.0 violation)
3. Must restructure into user-testable vertical slice
4. Previous review rejected T001 for identical issue (consistency required)
5. Tasks violate TDD workflow (implementation before test verification)

### Handoff to Orchestrator
```json
{
  "review_file": ".claude/reviews/016-manual-task-creation-T004-T005-review.md",
  "status": "needs_revision",
  "critical_issues": 1,
  "high_issues": 2,
  "medium_issues": 2,
  "low_issues": 1,
  "blocking_issue": "T004-T005 violate vertical slice principle (Constitution v1.1.0 Section I)",
  "consistency_violation": "Approving T004-T005 contradicts T001 rejection for identical issue",
  "recommended_action": "Merge T004-T005 into T006 API implementation as complete vertical slice",
  "proceed_to": "task_restructuring_required",
  "estimated_fix_time": "30-45 minutes (task reorganization + documentation updates)"
}
```

---

## Review Standards Applied

### Constitution v1.1.0 Compliance
- ✅ Reviewed against Section I "Vertical Slice Development"
- ✅ Checked Section I "Infrastructure Integration Rules"
- ✅ Applied "Can non-technical person test?" validation rule
- ❌ **Found violation**: Both tasks fail non-technical user test
- ❌ **Found violation**: Pure infrastructure without user-testable value

### SYSTEM_RULES.md Compliance
- ✅ Checked Three Laws (SEE-DO-VERIFY)
- ✅ Checked TDD Enforcement (Step 2)
- ✅ Checked Forbidden Actions (lines 60-66)
- ❌ **Found violation**: "Never write backend code without corresponding UI"
- ❌ **Found violation**: Tasks marked complete without user journey test

### Standards Compliance (.claude/standards.md)
- ✅ File paths follow project conventions
- ✅ TypeScript patterns align with existing code
- ✅ Zod validation follows best practices
- ✅ Service architecture modular and testable
- ⚠️ TDD workflow not explicit in task descriptions

### Consistency with Previous Reviews
- ✅ T001 rejected for [SETUP] infrastructure-only pattern
- ❌ **Inconsistency**: T004-T005 have identical pattern but marked [SLICE]
- ✅ Constitution update v1.1.0 explicitly forbids [SETUP] tasks
- ❌ **Violation**: Approving T004-T005 contradicts Constitution guidance

---

## Approval Status
**NEEDS REVISION**

**Required Changes:**
1. **[CRITICAL]** Restructure T004-T005 into user-testable vertical slice (Constitution v1.1.0 violation)
2. **[HIGH]** Clarify service implementation status (appears already complete)
3. **[HIGH]** Add 1.2x boost implementation details (spec FR-015 requirement)
4. **[MEDIUM]** Align schema design with service implementation
5. **[MEDIUM]** Fix parallel execution claims and dependencies
6. **[LOW]** Specify unit test implementation details

**Estimated Fix Time:** 30-45 minutes (task reorganization + documentation)

**After Fixes:** Must re-review for Constitution compliance before proceeding

**Consistency Note:** Cannot approve T004-T005 as [SLICE] tasks while T001 rejected for identical infrastructure-only pattern. Either:
- Approve both (violates Constitution) - NOT RECOMMENDED
- Reject both (enforces Constitution) - RECOMMENDED
- Restructure both into vertical slices (follows Constitution) - REQUIRED

---

**Review Completed By:** code-reviewer agent  
**Review Date:** 2025-01-27  
**Tasks Reviewed:** T004, T005  
**Feature:** Manual Task Creation (Phase 18, spec: 016-manual-task-creation)  
**Focus:** Vertical slice compliance, Constitution v1.1.0 adherence, service/schema layer quality
