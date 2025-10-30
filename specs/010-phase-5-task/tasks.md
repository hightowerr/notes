# Tasks: Task Gap Filling

**Input**: Design documents from `/home/yunix/learning-agentic/ideas/Note-synth/notes/specs/010-phase-5-task/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/
**Branch**: `010-phase-5-task`

## Execution Flow (Slice-Based)
```
1. Load plan.md → Extract tech stack (Next.js 15, React 19, Mastra 0.21.1, TypeScript 5.x)
2. Load spec.md → User journeys: Detect gaps → Generate suggestions → Review/edit → Accept tasks
3. Load contracts/ → 3 API endpoints (detect, generate, accept)
4. Load data-model.md → Entities: Gap, BridgingTask, GapIndicators
5. Load research.md → Technical decisions: 4 heuristics, semantic search, Mastra agent, topological sort
6. Generate VERTICAL SLICE tasks:
   → Each user action = ONE complete slice (UI + Backend + Data + Feedback)
   → Validate: User can SEE, DO, and VERIFY each slice
7. Order by user value: P0 core journeys → Setup (if blocking) → P1 enhancements → Polish
8. Mark parallel execution where tasks operate on independent features
```

## Format: `[ID] [TYPE] [P?] User Story & Implementation Scope`
- **[SLICE]**: Complete vertical slice (UI → Backend → Data → Feedback)
- **[SETUP]**: Foundational work blocking ALL slices (minimal, avoid if possible)
- **[POLISH]**: Enhancement to existing working slice
- **[P]**: Can run in parallel with other [P] tasks

---

## Phase 1: P0 User Journeys (Must-Have Features)

### T001 [X] [SLICE] User clicks "Find Missing Tasks" and sees gap analysis results
**User Story**: As a user reviewing my task plan, I can click "Find Missing Tasks" to trigger gap detection and see which task pairs have logical discontinuities

**Implementation Scope**:
- **UI**:
  - Add "Find Missing Tasks" button to priorities page (`app/priorities/page.tsx`)
  - Show loading state during analysis ("Analyzing task sequence...")
  - Display modal with gap results or "No gaps detected" message
- **Backend**:
  - Schema: `lib/schemas/gapSchema.ts` (Gap entity with 4 indicators, confidence score)
  - Service: `lib/services/gapDetectionService.ts`
    * Implement 4 heuristics: time gap (>1 week), action type jump, missing dependency, skill jump
    * Calculate confidence scores (0.75-1.0 based on indicator count)
    * Filter to top 3 gaps with highest confidence
  - API: `POST /api/gaps/detect` (`app/api/gaps/detect/route.ts`)
    * Accept task_ids array
    * Call gapDetectionService.detectGaps()
    * Return gaps array with metadata (analysis duration, gap count)
- **Data**: Query existing `task_embeddings` and `task_relationships` tables (no new tables needed)
- **Feedback**: Modal shows gap count (e.g., "3 gaps detected") or success message ("Plan is complete - no gaps found")

**Test Scenario**:
1. Navigate to `/priorities` with 5+ tasks in plan
2. Click "Find Missing Tasks" button
3. Observe loading state (<2 seconds)
4. Verify modal displays:
   - If gaps: "X gaps detected" with predecessor → successor context
   - If no gaps: "Your plan is complete" success message
5. Check contract test: `pnpm test:run __tests__/contract/gaps-detect.test.ts`
6. Check integration test: `pnpm test:run __tests__/integration/gap-detection-flow.test.ts`

**Files Modified**:
- `lib/schemas/gapSchema.ts` (create)
- `lib/services/gapDetectionService.ts` (create)
- `app/api/gaps/detect/route.ts` (create)
- `app/priorities/page.tsx` (add button + modal trigger)
- `__tests__/contract/gaps-detect.test.ts` (create)
- `__tests__/integration/gap-detection-flow.test.ts` (create)
- `__tests__/unit/services/gapDetectionService.test.ts` (create)

**Success Criteria**:
- ✅ User can trigger gap detection with button click
- ✅ Gap detection completes in <2s for 20 tasks
- ✅ 3+ indicators required before flagging gap (conservative threshold)
- ✅ Modal displays results (gaps or no-gaps message)
- ✅ All tests pass (contract + integration + unit)

---

### T002 [X] [SLICE] User sees AI-generated bridging task suggestions for detected gaps
**User Story**: As a user who has detected gaps, I can see 1-3 bridging task suggestions per gap with descriptions, time estimates, cognitive load, confidence scores, and reasoning

**Implementation Scope**:
- **UI**:
  - `GapDetectionModal.tsx` component (`app/priorities/components/GapDetectionModal.tsx`)
    * Display detected gaps with predecessor → successor context
    * Show "Generating suggestions..." loading state
    * Render bridging task cards with all fields visible
  - `BridgingTaskCard.tsx` component (`app/priorities/components/BridgingTaskCard.tsx`)
    * Display: task description, estimated hours, cognition level badge, confidence percentage
    * Show reasoning explanation (collapsible)
    * Pre-check checkbox for opt-out model
- **Backend**:
  - Schema: `lib/schemas/bridgingTaskSchema.ts` (BridgingTask entity with editable fields)
  - Service: `lib/services/taskGenerationService.ts`
    * Query semantic search: `POST /api/embeddings/search` with combined predecessor + successor text
    * Build Mastra agent prompt with search results (top 5), outcome statement, document context
    * Call Mastra agent with structured generation (Zod schema)
    * Generate 1-3 tasks per gap in parallel (Promise.all)
    * Check for semantic duplicates (cosine similarity >0.9)
  - Agent: `lib/mastra/agents/gapFillingAgent.ts` (Mastra agent using existing semanticSearch tool)
  - API: `POST /api/gaps/generate` (`app/api/gaps/generate/route.ts`)
    * Accept gap_id, predecessor_task_id, successor_task_id, optional outcome_statement
    * Call taskGenerationService.generateBridgingTasks()
    * Return bridging_tasks array with generation metadata
- **Data**: Use existing `task_embeddings` table for semantic search, no writes yet
- **Feedback**: Modal updates to show suggestion cards with all details, user can scroll through suggestions

**Test Scenario**:
1. Complete T001 to detect gaps
2. Observe "Generating suggestions..." for each gap
3. Wait for suggestions to appear (<5s per gap)
4. Verify each suggestion displays:
   - Task description (10-500 chars)
   - Estimated hours (8-160 range)
   - Cognition level (low/medium/high badge)
   - Confidence score (≥0.7)
   - Reasoning explanation
   - Pre-checked checkbox
5. Check contract test: `pnpm test:run __tests__/contract/gaps-generate.test.ts`
6. Check integration test: `pnpm test:run __tests__/integration/task-generation-flow.test.ts`

**Files Modified**:
- `lib/schemas/bridgingTaskSchema.ts` (create)
- `lib/services/taskGenerationService.ts` (create)
- `lib/mastra/agents/gapFillingAgent.ts` (create)
- `app/api/gaps/generate/route.ts` (create)
- `app/priorities/components/GapDetectionModal.tsx` (create)
- `app/priorities/components/BridgingTaskCard.tsx` (create)
- `__tests__/contract/gaps-generate.test.ts` (create)
- `__tests__/integration/task-generation-flow.test.ts` (create)
- `__tests__/unit/services/taskGenerationService.test.ts` (create)

**Success Criteria**:
- ✅ User sees 1-3 suggestions per gap
- ✅ Generation completes in <5s per gap
- ✅ Average confidence ≥0.7
- ✅ All suggestion fields populated and visible
- ✅ Semantic search provides context (5 results at 0.6 threshold)
- ✅ All tests pass

---

### T003 [X] [SLICE] User edits, selects, and accepts bridging tasks to insert into plan
**User Story**: As a user reviewing suggestions, I can uncheck tasks I don't want, edit descriptions and time estimates, then click "Accept Selected" to insert the approved tasks into my plan with proper dependencies

**Implementation Scope**:
- **UI** (in `GapDetectionModal.tsx`):
  - Make task description inline-editable (click to edit text area)
  - Make estimated hours inline-editable (number input)
  - Add checkbox to each card (pre-checked by default)
  - Add "Accept Selected" and "Cancel" buttons at modal bottom
  - Show confirmation loading state during insertion
  - Close modal on success, show updated priorities page
- **Backend**:
  - Service: `lib/services/taskInsertionService.ts`
    * Validate accepted tasks (edited fields take precedence)
    * Check for semantic duplicates against existing tasks (similarity >0.9)
    * Build dependency graph from `task_relationships` table
    * Validate topological sort for cycles (Kahn's algorithm)
    * Insert accepted tasks to `task_embeddings` with `source='ai_generated'`
    * Create 2 relationships per task: predecessor → bridging, bridging → successor
    * Log acceptance metrics (gap count, accepted count, acceptance rate)
  - API: `POST /api/gaps/accept` (`app/api/gaps/accept/route.ts`)
    * Accept array of {task, predecessor_id, successor_id}
    * Call taskInsertionService.insertBridgingTasks()
    * Return inserted_count, task_ids, relationships_created
- **Data**:
  - INSERT into `task_embeddings` (existing table)
  - INSERT into `task_relationships` (2 rows per task)
  - Log to `processing_logs` (gap_count, generation_latency_ms, acceptance_rate)
- **Feedback**:
  - Modal closes
  - Priorities page refreshes to show new tasks in correct sequence
  - Toast: "X tasks added to your plan"
  - Dependency arrows show predecessor → bridging → successor

**Test Scenario**:
1. Complete T002 to generate suggestions
2. Uncheck 1 suggestion (to test partial acceptance)
3. Click on task description → edit to "Build mobile app with authentication"
4. Click on estimated hours → change from 80 to 96
5. Click "Accept Selected" button
6. Verify modal closes and priorities page updates
7. Check accepted tasks appear between predecessor and successor
8. Verify database:
   - `SELECT * FROM task_embeddings WHERE source = 'ai_generated'`
   - `SELECT * FROM task_relationships WHERE predecessor_id IN (...)`
9. Check contract test: `pnpm test:run __tests__/contract/gaps-accept.test.ts`
10. Check integration test: End-to-end accept flow

**Files Modified**:
- `lib/services/taskInsertionService.ts` (create)
- `app/api/gaps/accept/route.ts` (create)
- `app/priorities/components/GapDetectionModal.tsx` (update with edit UI + accept button)
- `app/priorities/components/BridgingTaskCard.tsx` (update with inline editing)
- `app/priorities/page.tsx` (update to refresh after acceptance)
- `__tests__/contract/gaps-accept.test.ts` (create)
- `__tests__/integration/gap-acceptance-flow.test.ts` (create)

**Success Criteria**:
- ✅ User can check/uncheck tasks
- ✅ User can edit description and hours inline
- ✅ Edits preserved during acceptance
- ✅ Accepted tasks inserted to database with `source='ai_generated'`
- ✅ Dependencies created correctly (2 per task)
- ✅ No circular dependencies (topological sort validation)
- ✅ No duplicates (semantic check >0.9 similarity)
- ✅ Priorities page shows updated plan
- ✅ All tests pass

---

## Phase 2: P1 User Journeys (Important Enhancements)

### T004 [X] [P] [SLICE] User provides manual examples when semantic search returns zero results
**User Story**: As a user in a novel domain where semantic search finds no similar tasks, I can provide 1-2 example tasks manually to help the AI generate relevant suggestions

**Implementation Scope**:
- **UI** (in `GapDetectionModal.tsx`):
  - Detect 422 response from generate endpoint (zero results error)
  - Display prompt: "No similar tasks found. Provide 1-2 example tasks to help generate suggestions."
  - Show 2 text input fields (10-200 chars each)
  - Add "Generate with Examples" button
  - Add "Skip" button (generates with lower confidence)
  - Show lower confidence indicator if user skips
- **Backend** (in `taskGenerationService.ts`):
  - Accept optional `manual_examples?: string[]` parameter
  - Check semantic search result count
  - If zero results and no manual examples: return 422 error with `requires_manual_examples: true`
  - If manual examples provided: use in Mastra prompt as reference context
  - If user skips: mark generated tasks with lower confidence (<0.7) in metadata
- **Data**: No schema changes, just optional parameter handling
- **Feedback**:
  - Prompt displays when zero results detected
  - Suggestions generate after examples provided
  - Lower confidence badge visible if user skipped

**Test Scenario**:
1. Create task list in novel domain (e.g., quantum computing)
2. Trigger gap detection
3. Observe "No similar tasks found" prompt in modal
4. Enter 2 manual examples:
   - "Implement quantum circuit simulator"
   - "Optimize qubit error correction"
5. Click "Generate with Examples"
6. Verify suggestions generated using examples as context
7. Alternative: Click "Skip" and verify lower confidence flag (<0.7)
8. Check unit test for zero-result handling

**Files Modified**:
- `lib/services/taskGenerationService.ts` (update)
- `app/api/gaps/generate/route.ts` (update to accept manual_examples)
- `app/priorities/components/GapDetectionModal.tsx` (update with manual input UI)
- `__tests__/integration/zero-result-handling.test.ts` (create)

**Success Criteria**:
- ✅ Zero results detected and prompts user
- ✅ Manual examples accepted and used in generation
- ✅ Skip option works and flags lower confidence
- ✅ Suggestions relevant to manual examples
- ✅ All tests pass

---

### T005 [X] [P] [SLICE] User retries when AI generation fails
**User Story**: As a user experiencing AI generation timeout or error, I can see a clear error message and click "Try Again" to manually retry the generation

**Implementation Scope**:
- **UI** (in `GapDetectionModal.tsx`):
  - Detect 500/504 error from generate endpoint
  - Display error state: "Failed to generate suggestions. Please try again."
  - Show "Try Again" button (replaces suggestion cards)
  - Allow user to dismiss error and close modal
  - Track retry count in component state (show "Retry X of 3" if needed)
- **Backend** (in `taskGenerationService.ts`):
  - Set 8-second timeout for Mastra agent generation
  - Catch timeout errors and return 504 status
  - Catch AI service errors (invalid API key, rate limit) and return 500 status
  - Log failures to `processing_logs` table with error details
  - NO automatic retries (user-initiated only per FR-034-A)
- **Data**: Log failure metrics (gap_id, error_type, timestamp)
- **Feedback**:
  - Clear error message displays
  - User can retry manually with button
  - Success on retry shows suggestions normally

**Test Scenario**:
1. Temporarily set invalid `OPENAI_API_KEY` in .env.local
2. Trigger gap detection and generation
3. Observe error message: "Failed to generate suggestions. Please try again."
4. Verify "Try Again" button visible
5. Restore correct API key
6. Click "Try Again"
7. Verify suggestions generate successfully on retry
8. Check unit test for timeout handling
9. Check integration test for error → retry flow

**Files Modified**:
- `lib/services/taskGenerationService.ts` (update with timeout + error handling)
- `app/api/gaps/generate/route.ts` (update error responses)
- `app/priorities/components/GapDetectionModal.tsx` (update with error state + retry button)
- `__tests__/unit/services/taskGenerationService.test.ts` (update with timeout test)
- `__tests__/integration/ai-failure-retry.test.ts` (create)

**Success Criteria**:
- ✅ Errors detected (timeout, AI failure) and displayed clearly
- ✅ "Try Again" button functional
- ✅ NO automatic retries (user-initiated only)
- ✅ Failures logged with error details
- ✅ Success on retry works normally
- ✅ All tests pass

---

### T006 [X] [P] [SLICE] User is prevented from creating circular dependencies
**User Story**: As a user accepting bridging tasks, I am prevented from inserting tasks that would create circular dependencies, with a clear explanation of the cycle

**Implementation Scope**:
- **UI** (in `GapDetectionModal.tsx`):
  - Detect 409 error from accept endpoint (circular dependency detected)
  - Display error modal: "Circular dependency detected: cannot insert task"
  - Show cycle explanation: "Task creates cycle: A → B → C → A"
  - Provide "OK" button to dismiss and return to suggestion review
  - Allow user to uncheck problematic task and retry acceptance
- **Backend** (in `taskInsertionService.ts`):
  - Implement topological sort validation (Kahn's algorithm)
  - Query all existing relationships from `task_relationships` table
  - Build adjacency list with proposed bridging task edges
  - Run topological sort before INSERT
  - If cycle detected: return 409 error with cycle path
  - If validation passes: proceed with INSERT
- **Data**: Query `task_relationships` for graph validation (no writes if cycle detected)
- **Feedback**:
  - Error modal shows cycle explanation
  - User can adjust selection and retry
  - Database integrity maintained (no partial writes)

**Test Scenario**:
1. Create task list with potential cycle: Task A → Task B → Task C
2. Manually trigger gap detection between C and A
3. Accept generated bridging task (would create C → Bridging → A cycle)
4. Verify 409 error displayed: "Circular dependency detected"
5. Check explanation shows cycle path
6. Uncheck problematic task
7. Accept different tasks successfully
8. Check unit test for topological sort
9. Check integration test for cycle prevention

**Files Modified**:
- `lib/services/taskInsertionService.ts` (update with topological sort validation)
- `app/api/gaps/accept/route.ts` (update to return 409 on cycle)
- `app/priorities/components/GapDetectionModal.tsx` (update with cycle error state)
- `__tests__/unit/services/taskInsertionService.test.ts` (update with cycle tests)
- `__tests__/integration/circular-dependency-prevention.test.ts` (create)

**Success Criteria**:
- ✅ Circular dependencies detected before insertion
- ✅ Clear error message with cycle path
- ✅ No database writes occur when cycle detected
- ✅ User can adjust selection and retry
- ✅ 100% dependency chain integrity maintained
- ✅ All tests pass

---

### T007 [X] [P] [SLICE] User is prevented from creating duplicate tasks
**User Story**: As a user accepting bridging tasks, I am prevented from inserting tasks that semantically duplicate existing tasks, with a reference to the similar existing task

**Implementation Scope**:
- **UI** (in `GapDetectionModal.tsx`):
  - Detect 422 error from accept endpoint (duplicate detected)
  - Display error modal: "Duplicate task detected"
  - Show explanation: "Task 'Create mobile app UI' duplicates existing task 'Build mobile app frontend' (similarity: 0.94)"
  - Allow user to edit task description to differentiate
  - Provide "OK" button to return to suggestion review
- **Backend** (in `taskInsertionService.ts`):
  - Before INSERT, query all existing task embeddings
  - Calculate cosine similarity between bridging task text and existing tasks
  - If similarity >0.9: return 422 error with duplicate details
  - If validation passes: proceed with INSERT
- **Data**: Query `task_embeddings.embedding` for similarity check (use existing vector index)
- **Feedback**:
  - Error modal shows duplicate with similarity score
  - User can edit description to differentiate
  - Retry acceptance after edit

**Test Scenario**:
1. Create existing task: "Build mobile app frontend"
2. Trigger gap detection that generates suggestion: "Create mobile app UI"
3. Accept suggestion
4. Verify 422 error displayed: "Duplicate task detected"
5. Check explanation references existing task and similarity score (0.94)
6. Edit description to "Build authentication flow for mobile app"
7. Retry acceptance successfully
8. Check unit test for duplicate detection
9. Check integration test for duplicate prevention

**Files Modified**:
- `lib/services/taskInsertionService.ts` (update with similarity check)
- `app/api/gaps/accept/route.ts` (update to return 422 on duplicate)
- `app/priorities/components/GapDetectionModal.tsx` (update with duplicate error state)
- `__tests__/unit/services/taskInsertionService.test.ts` (update with duplicate tests)
- `__tests__/integration/duplicate-task-prevention.test.ts` (create)

**Success Criteria**:
- ✅ Semantic duplicates detected (>0.9 similarity)
- ✅ Clear error message with existing task reference
- ✅ User can edit to differentiate
- ✅ Zero duplicate tasks inserted
- ✅ All tests pass

---

## Phase 3: Polish (Enhancements)

### T008 [X] [P] [POLISH] Add parallel gap processing with progress indicator
**Enhancement to**: T002 (task generation)

**Implementation Scope**:
- Update `taskGenerationService.ts` to process multiple gaps in parallel (Promise.all)
- Add progress tracking: "Generating 1/3 gaps..."
- Display progress indicator in modal
- Show total generation time in metadata

**Test Scenario**:
1. Detect 3 gaps in task list
2. Observe parallel generation (3 concurrent API calls)
3. Verify progress updates: "Generating 1/3", "2/3", "3/3"
4. Confirm total time ≈ max(individual times), not sum
5. Verify all suggestions displayed correctly

**Files Modified**:
- `lib/services/taskGenerationService.ts` (update)
- `app/priorities/components/GapDetectionModal.tsx` (update with progress UI)

**Success Criteria**:
- ✅ Multiple gaps processed in parallel
- ✅ Total time <6s for 3 gaps
- ✅ Progress indicator accurate
- ✅ No race conditions

---

### T009 [X] [P] [POLISH] Add reasoning explanation collapsible section
**Enhancement to**: T002 (bridging task cards)

**Implementation Scope**:
- Make reasoning field collapsible in `BridgingTaskCard.tsx`
- Show/hide on click with smooth animation
- Default to collapsed state (show "Why this task?" expand trigger)

**Test Scenario**:
1. View bridging task suggestions
2. Click "Why this task?" on a card
3. Verify reasoning expands with animation
4. Click again to collapse

**Files Modified**:
- `app/priorities/components/BridgingTaskCard.tsx` (update)

**Success Criteria**:
- ✅ Reasoning collapsible with smooth animation
- ✅ Defaults to collapsed
- ✅ Improves card density

---

## Dependencies

```
T001 (Gap Detection) → [enables] → T002 (Task Generation)
T002 (Task Generation) → [enables] → T003 (Task Acceptance)
T003 (Task Acceptance) → [enables] → T004, T005, T006, T007 (Edge cases)
T002 → [enables] → T008 (Parallel processing polish)
T002 → [enables] → T009 (Reasoning collapse polish)
```

**Sequential Execution** (Must complete in order):
1. T001 (Gap Detection) - Foundation for all other slices
2. T002 (Task Generation) - Depends on T001 results
3. T003 (Task Acceptance) - Depends on T002 suggestions

**Parallel Execution** (After T003 completes):
- T004, T005, T006, T007 can run in parallel (independent edge cases)
- T008, T009 can run in parallel after T002 (independent polishes)

---

## Validation Checklist

**Pre-Implementation Validation**:
- [x] Every [SLICE] task has a user story
- [x] Every [SLICE] task includes UI + Backend + Data + Feedback
- [x] Every [SLICE] task has a test scenario
- [x] No backend-only or frontend-only tasks exist
- [x] Setup tasks minimal (none in this feature - reuses existing infrastructure)
- [x] Tasks ordered by user value (P0 core flow → P1 edge cases → Polish)
- [x] Parallel tasks operate on independent features (T004-T007 independent edge cases)
- [x] Each task specifies exact file paths to modify

**Slice Compliance**:
- [x] T001: User can SEE gap analysis results, DO trigger detection, VERIFY gaps displayed
- [x] T002: User can SEE suggestions, DO review details, VERIFY all fields visible
- [x] T003: User can SEE editable fields, DO accept tasks, VERIFY updated plan
- [x] T004: User can SEE manual prompt, DO provide examples, VERIFY generation uses examples
- [x] T005: User can SEE error message, DO retry generation, VERIFY success on retry
- [x] T006: User can SEE cycle error, DO adjust selection, VERIFY integrity maintained
- [x] T007: User can SEE duplicate warning, DO edit task, VERIFY uniqueness enforced

**Performance Targets**:
- Gap detection: <100ms (p95) - T001
- Task generation: <5s per gap (p95) - T002
- Task insertion: <500ms (p95) - T003
- False positive rate: <20% - T001 validation
- User acceptance rate: ≥60% - T003 tracking

---

## Notes

- **[SLICE]** tasks deliver complete user value (UI → Backend → Data → Feedback)
- **[P]** tasks can run in parallel (T004-T007 are independent edge cases)
- No [SETUP] tasks needed - feature reuses existing infrastructure (task_embeddings, task_relationships, semantic search, Mastra)
- Each slice is independently testable and demoable
- TDD: Write contract + integration tests BEFORE implementing each slice
- Performance validated via quickstart.md scenarios (8 test scenarios total)

**Tech Stack** (from plan.md):
- Frontend: Next.js 15.5.4, React 19.1.0, TypeScript 5.x
- Backend: Next.js API Routes, Mastra 0.21.1, Vercel AI SDK 4.0.0
- Data: Supabase PostgreSQL with pgvector, Zod 3.24.1 validation
- Testing: Vitest 2.1.8, Testing Library

**Key Technical Decisions** (from research.md):
- 4 heuristics for gap detection (time gap, action type jump, missing dependency, skill jump)
- Conservative threshold: 3+ indicators required to flag gap
- Semantic search: top 5 results at 0.6 similarity threshold
- Mastra agent with structured generation (Zod schema)
- Topological sort for cycle prevention (Kahn's algorithm)
- Cosine similarity >0.9 for duplicate detection
- Manual retry only for AI failures (no automatic retries)

---

**Ready for Implementation**: All 9 tasks defined as vertical slices with complete user journeys.
