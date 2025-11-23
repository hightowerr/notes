# Tasks: Outcome-Driven Prioritization (Evaluator-Optimizer Pattern)

**Input**: Design documents from `/specs/012-docs-shape-pitches/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Feature**: Phase 14 - Unified prioritization with hybrid evaluation loop
**Branch**: `012-docs-shape-pitches`
**Tech Stack**: Next.js 15, React 19, TypeScript, Mastra, GPT-4o/GPT-4o-mini, Supabase, Zod

**Organization**: Tasks organized by user story to enable independent implementation and testing. Each task is a complete vertical slice (SEE → DO → VERIFY).

## Format: `[ID] [P?] [Type] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Type]**: [SLICE] = complete vertical slice, [SETUP] = blocking infrastructure, [POLISH] = enhancement
- **[Story]**: Which user story this task belongs to (US1-US5)
- File paths relative to repository root

---

## Phase 1: Foundation (Blocking Prerequisites)

**Purpose**: Database schema and core schemas that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Database Migration

- [X] T001 [SETUP] **Database migration with validation**
  - **User Story**: Foundation for all stories
  - **SEE**: New columns `excluded_tasks` and `evaluation_metadata` visible in agent_sessions table
  - **DO**: Run migration script, create GIN indexes, add validation functions
  - **VERIFY**: Query `information_schema.columns` confirms columns added, indexes created, validation functions return true for valid JSONB
  - **Files**:
    - Migration: `supabase/migrations/026_add_unified_prioritization_columns.sql` (already exists)
    - Verification: Run verification queries from migration file lines 172-210
  - **Test**: Manual SQL tests in migration script
  - **Dependencies**: Requires existing `agent_sessions` table from Phase 3
  - **Implementation**:
    1. Run migration via `psql $DATABASE_URL -f specs/012-docs-shape-pitches/contracts/database-migration.sql`
    2. Execute verification queries (lines 172-187)
    3. Test validation functions with sample JSONB data
    4. Confirm indexes exist via `pg_indexes` query

### Zod Schemas

- [X] T002 [P] [SETUP] **PrioritizationResult schema with tests**
  - **User Story**: Foundation for all stories
  - **SEE**: Schema validates correct structure, rejects invalid data with clear error messages
  - **DO**: Create Zod schema matching data-model.md structure, write comprehensive tests
  - **VERIFY**: Tests pass for valid data, fail for invalid data (confidence > 1, missing fields, wrong types)
  - **Files**:
    - Schema: `lib/schemas/prioritizationResultSchema.ts` (new)
    - Tests: `lib/schemas/__tests__/prioritizationResultSchema.test.ts` (new)
  - **Test Scenarios**:
    - Valid complete structure → success
    - Missing required field (thoughts.outcome_analysis) → fail with clear message
    - Invalid confidence (1.5) → fail
    - Empty included_tasks array → fail (min 1 required)
    - Alignment score outside 0-10 range → fail
  - **Dependencies**: None (can run in parallel)

- [X] T003 [P] [SETUP] **EvaluationResult schema with tests**
  - **User Story**: Foundation for US4 (quality evaluation)
  - **SEE**: Schema validates evaluator output structure
  - **DO**: Create Zod schema for evaluator agent responses, write tests
  - **VERIFY**: Tests pass for PASS/NEEDS_IMPROVEMENT/FAIL statuses, criteria scores validation
  - **Files**:
    - Schema: `lib/schemas/evaluationResultSchema.ts` (new)
    - Tests: `lib/schemas/__tests__/evaluationResultSchema.test.ts` (new)
  - **Test Scenarios**:
    - Valid PASS status with criteria scores → success
    - Invalid status "MAYBE" → fail
    - Criteria score outside 0-10 range → fail
    - Missing feedback field → fail
  - **Dependencies**: None (can run in parallel)

- [X] T004 [P] [SETUP] **HybridLoopMetadata, ExcludedTask, TaskScore schemas with tests**
  - **User Story**: Foundation for US3 (reasoning display), US4 (evaluation loop)
  - **SEE**: All supporting schemas validate correctly
  - **DO**: Create 3 Zod schemas, write comprehensive tests
  - **VERIFY**: Tests pass for valid structures, fail for invalid data
  - **Files**:
    - Schemas: `lib/schemas/hybridLoopMetadataSchema.ts` (new), `lib/schemas/excludedTaskSchema.ts` (new), `lib/schemas/taskScoreSchema.ts` (new)
    - Tests: `lib/schemas/__tests__/hybridLoopMetadataSchema.test.ts` (new), `lib/schemas/__tests__/excludedTaskSchema.test.ts` (new), `lib/schemas/__tests__/taskScoreSchema.test.ts` (new)
  - **Test Scenarios**:
    - HybridLoopMetadata: iterations > 3 → fail, chain_of_thought with >3 steps → fail
    - ExcludedTask: alignment_score = 15 → fail
    - TaskScore: effort = 0.3 → fail (min 0.5h)
  - **Dependencies**: None (can run in parallel)

**Checkpoint**: Foundation ready - all schemas validated, database migrated. User story implementation can now begin in parallel.

---

## Phase 2: User Story 1 - Outcome-Aligned Filtering (Priority: P1) 🎯 MVP

**Goal**: As a user with an active outcome, I want tasks to be filtered based on their direct impact on my outcome metric, so that I only see tasks that genuinely advance my goal.

**Independent Test**: Set outcome "Increase credit payment conversion by 20%", run prioritization, verify payment tasks INCLUDED with reasoning, documentation tasks EXCLUDED with reasoning.

### Implementation for User Story 1

- [X] T005 [SLICE] [US1] **Unified generator agent with filtering logic**
  - **User Story**: US1 - Outcome-aligned filtering
  - **SEE**: Agent generates prioritization with clear included/excluded split, each task has reasoning
  - **DO**: Create Mastra agent with filtering prompt, implement single-pass generation
  - **VERIFY**: Test with sample outcome "Increase payments", verify payment tasks included, docs excluded, all tasks have reasoning
  - **Files**:
    - Agent: `lib/mastra/agents/prioritizationGenerator.ts` (new)
    - Tests: `__tests__/contract/prioritization-generator.test.ts` (new)
  - **UI Entry Point**: `/priorities` page triggers prioritization
  - **Backend**: Agent processes outcome + tasks → returns PrioritizationResult
  - **Data Layer**: Stores result in `agent_sessions.prioritized_plan`
  - **Visible Outcome**: User sees tasks split into included (with inclusion_reason) and excluded (with exclusion_reason)
  - **Test Scenario**:
    ```typescript
    // Outcome: "Increase credit payment conversion by 20%"
    // Tasks: "Implement Apple Pay V6", "Update API docs", "Optimize checkout flow"
    // Expected: Apple Pay + checkout INCLUDED, docs EXCLUDED
    // Verify: Each has reasoning explaining decision
    ```
  - **Implementation Steps**:
    1. Create agent file with GPT-4o model config
    2. Write filtering prompt (Step 1 from quickstart.md lines 176-180)
    3. Write prioritization prompt (Step 2 from quickstart.md lines 182-189)
    4. Add inline self-evaluation prompt (Step 3 from quickstart.md lines 191-199)
    5. Define JSON output schema in prompt
    6. Write contract test with mock outcome/tasks
    7. Verify PrioritizationResultSchema validation passes
  - **Dependencies**: T002 (PrioritizationResult schema)

- [X] T006 [SLICE] [US1] **Update API endpoint to call unified agent**
  - **User Story**: US1 - Outcome-aligned filtering
  - **SEE**: POST /api/agent/prioritize returns session with excluded_tasks field populated
  - **DO**: Update route handler to call unified agent instead of old system, store excluded_tasks in database
  - **VERIFY**: API returns 202 with session_id, GET /api/agent/sessions/{id} shows excluded_tasks array with reasoning
  - **Files**:
    - API Route: `app/api/agent/prioritize/route.ts` (update existing)
    - API Route: `app/api/agent/sessions/[session_id]/route.ts` (update existing)
    - Service: `lib/mastra/services/agentOrchestration.ts` (update existing)
    - Tests: `__tests__/contract/unified-prioritization.test.ts` (new)
  - **UI Entry Point**: User clicks "Prioritize" button on /priorities page
  - **Backend**: Endpoint orchestrates agent call, validates output, persists to database
  - **Data Layer**: INSERT into agent_sessions with excluded_tasks JSONB
  - **Visible Outcome**: Loading spinner shows progress, then page updates with included + excluded tasks
  - **Test Scenario**:
    ```typescript
    // POST /api/agent/prioritize with outcome_id
    // Expect: 202 response with session_id
    // GET /api/agent/sessions/{session_id}
    // Expect: 200 with prioritized_plan AND excluded_tasks array
    // Verify: excluded_tasks[0].exclusion_reason is populated
    ```
  - **Implementation Steps**:
    1. Update `agentOrchestration.ts` to call `prioritizationGenerator` instead of old agent
    2. Validate output with `prioritizationResultSchema.parse()`
    3. Store `excluded_tasks` to database (UPDATE agent_sessions SET excluded_tasks = $1)
    4. Update GET /api/agent/sessions/[id] to return excluded_tasks field
    5. Write contract test for POST → GET flow
    6. Add error handling for validation failures (FR-022)
  - **Dependencies**: T001 (database migration), T005 (generator agent)

- [X] T007 [SLICE] [US1] **Excluded tasks UI section with collapsible display**
  - **User Story**: US1 - Outcome-aligned filtering
  - **SEE**: Priorities page shows collapsible section "Show 150 excluded tasks", expanding reveals list with exclusion reasons
  - **DO**: Create ExcludedTasksSection component, integrate into priorities page, add toggle state
  - **VERIFY**: User can expand/collapse section, sees task text + exclusion reason for each task, count matches excluded_tasks array length
  - **Files**:
    - Component: `app/priorities/components/ExcludedTasksSection.tsx` (new)
    - Page: `app/priorities/page.tsx` (update existing)
    - Tests: `app/priorities/components/__tests__/ExcludedTasksSection.test.tsx` (new)
  - **UI Entry Point**: Priorities page, below active task list
  - **Backend**: Data fetched via existing session API (T006)
  - **Data Layer**: Reads from `excluded_tasks` JSONB column
  - **Visible Outcome**: User sees clear separation of included vs excluded, understands why each task was filtered out
  - **Test Scenario**:
    ```tsx
    // Render ExcludedTasksSection with 3 excluded tasks
    // Verify: Shows "Show 3 excluded tasks" trigger
    // User clicks trigger
    // Verify: Section expands, shows 3 task cards with exclusion_reason
    // User clicks again
    // Verify: Section collapses
    ```
  - **Implementation Steps**:
    1. Create component using shadcn/ui Collapsible
    2. Map over excluded_tasks array
    3. Render task_text + exclusion_reason in card format
    4. Add to priorities page below TaskList component
    5. Write component test with @testing-library/react
    6. Test expand/collapse interaction
  - **Dependencies**: T006 (API returns excluded_tasks)

**Checkpoint**: User Story 1 complete. User can trigger prioritization, see included tasks with inclusion reasoning, and expand excluded tasks section to see why each task was filtered out. Test independently before proceeding.

---

## Phase 3: User Story 2 - Reflection-Based Prioritization (Priority: P2)

**Goal**: As a user who writes reflections like "ignore wishlist related items", I want the system to correctly deprioritize or exclude wishlist tasks (not boost them to the top), so that my reflections actually guide prioritization.

**Independent Test**: Write reflection "ignore documentation tasks", run prioritization, verify "Update API docs" is excluded (not in top 10).

### Implementation for User Story 2

- [X] T008 [SLICE] [US2] **Reflection negation handling in generator prompt**
  - **User Story**: US2 - Reflection-based prioritization with correct negation
  - **SEE**: Agent correctly interprets "ignore X" to EXCLUDE X tasks, not boost them
  - **DO**: Update generator agent prompt to explicitly handle reflection negations, add semantic understanding instructions
  - **VERIFY**: Test with reflection "ignore wishlist items" + task "Add wishlist export" → task excluded, not included
  - **Files**:
    - Agent: `lib/mastra/agents/prioritizationGenerator.ts` (update from T005)
    - Tests: `__tests__/integration/reflection-negation.test.ts` (new)
  - **UI Entry Point**: User writes reflection on /dashboard or /priorities page
  - **Backend**: Agent processes reflections as context, applies semantic filtering
  - **Data Layer**: Reads from `reflections` table, stores result with reflection influence noted in reasoning
  - **Visible Outcome**: User sees reflection correctly applied (exclusions work, boosts work, focus adjustments work)
  - **Test Scenario**:
    ```typescript
    // Reflection: "ignore documentation tasks"
    // Tasks: "Update API docs", "Write user guide", "Implement Apple Pay"
    // Expected: Docs tasks EXCLUDED with reasoning mentioning reflection
    // Apple Pay INCLUDED (not affected by negation)
    ```
  - **Implementation Steps**:
    1. Add to generator prompt: "Handle negations: 'ignore X' means EXCLUDE X, not boost it"
    2. Add reflection processing section in prompt
    3. Update prompt to mention specific reflection text in reasoning
    4. Write integration test with reflection + tasks
    5. Verify 95% accuracy target (SC-001)
    6. Test multiple negations in one reflection
  - **Dependencies**: T005 (generator agent base), existing reflection system (Phase 7)

- [X] T009 [SLICE] [US2] **Reflection influence display in task reasoning**
  - **User Story**: US2 - Reflection-based prioritization
  - **SEE**: Task cards show "Reasoning: [score explanation] | Reflection: [specific reflection that influenced this]"
  - **DO**: Update TaskRow component to display reflection influence when present in reasoning
  - **VERIFY**: Task affected by reflection shows reflection text, unaffected tasks show no reflection mention
  - **Files**:
    - Component: `app/priorities/components/TaskRow.tsx` (update existing)
    - Schema: Add reflection_influence field to PrioritizationResult per_task_scores
    - Tests: `app/priorities/components/__tests__/TaskRow.test.tsx` (update existing)
  - **UI Entry Point**: Task row in priorities list
  - **Backend**: Generator agent includes reflection influence in per_task_scores.reasoning
  - **Data Layer**: Stored in agent_sessions.prioritized_plan
  - **Visible Outcome**: User sees which reflections affected which tasks, validates reflection understanding
  - **Test Scenario**:
    ```tsx
    // Task with reflection influence: "focus on mobile"
    // Verify: Shows "Reflection: 'focus on mobile' boosted mobile-related tasks"
    // Task without influence
    // Verify: No reflection text displayed
    ```
  - **Implementation Steps**:
    1. Update generator prompt to include reflection_influence in reasoning
    2. Update TaskRow to parse and display reflection mentions
    3. Add conditional rendering for reflection badge/note
    4. Write component test for both cases
    5. Verify accessibility (screen reader announces reflection)
  - **Dependencies**: T008 (reflection negation handling)

**Checkpoint**: User Story 2 complete. User can write reflections with negations ("ignore X"), run prioritization, and verify X tasks are excluded with clear reasoning. Reflection influence visible on affected tasks.

---

## Phase 4: User Story 3 - Transparent Reasoning Display (Priority: P2)

**Goal**: As a user viewing my priority list, I want to see clear explanations for why each task was included/excluded and how it was scored, so that I can trust the system's decisions.

**Independent Test**: View any task, see impact score, effort estimate, confidence level, and reasoning text explaining the scoring rationale.

### Implementation for User Story 3

- [X] T010 [SLICE] [US3] **Per-task score breakdown with reasoning**
  - **User Story**: US3 - Transparent reasoning
  - **SEE**: Each task shows impact (X/10), effort (Yh), confidence (Z%), with expandable reasoning modal
  - **DO**: Create ScoreBreakdownModal component, add "[Why this score?]" button to task rows
  - **VERIFY**: User clicks button, modal opens showing impact/effort/confidence breakdown + reasoning text
  - **Files**:
    - Component: `app/priorities/components/ScoreBreakdownModal.tsx` (may already exist, update if so)
    - Component: `app/priorities/components/TaskRow.tsx` (update to add button)
    - Tests: `app/priorities/components/__tests__/ScoreBreakdownModal.test.tsx` (update/create)
  - **UI Entry Point**: Task row in priorities list, "[Why?]" button
  - **Backend**: Data from per_task_scores in PrioritizationResult
  - **Data Layer**: Stored in agent_sessions.prioritized_plan.per_task_scores
  - **Visible Outcome**: User sees detailed breakdown, understands scoring logic, builds trust in AI decisions
  - **Test Scenario**:
    ```tsx
    // Render TaskRow with per_task_scores data
    // Click "[Why this score?]" button
    // Verify: Modal opens showing:
    // - Impact: 8/10 (high revenue impact)
    // - Effort: 12h (based on similar integrations)
    // - Confidence: 85% (agent certainty)
    // - Reasoning: "Apple Pay integration directly adds new payment method..."
    ```
  - **Implementation Steps**:
    1. Create/update ScoreBreakdownModal component
    2. Add button to TaskRow component
    3. Pass per_task_scores[task_id] data to modal
    4. Display impact/effort/confidence as visual bars or numbers
    5. Show reasoning text below scores
    6. Add close button, backdrop click to close
    7. Write component test for modal open/close/data display
  - **Dependencies**: T005 (generator returns per_task_scores)

- [X] T011 [SLICE] [US3] **Inclusion/exclusion reason badges on task cards**
  - **User Story**: US3 - Transparent reasoning
  - **SEE**: Included tasks show green badge "✓ High payment impact", excluded tasks show gray badge "✗ Doesn't advance metric"
  - **DO**: Add inclusion_reason/exclusion_reason badges to TaskRow and ExcludedTaskCard components
  - **VERIFY**: All tasks display reason badge, colors match status (green = included, gray = excluded)
  - **Files**:
    - Component: `app/priorities/components/TaskRow.tsx` (update)
    - Component: `app/priorities/components/ExcludedTasksSection.tsx` (update)
    - Tests: Component tests updated
  - **UI Entry Point**: Task cards in both included and excluded sections
  - **Backend**: inclusion_reason and exclusion_reason from PrioritizationResult
  - **Data Layer**: Stored in agent_sessions (included_tasks, excluded_tasks)
  - **Visible Outcome**: User immediately sees why each task is in its current list
  - **Test Scenario**:
    ```tsx
    // Included task with inclusion_reason: "Directly enables new payment option"
    // Verify: Shows green badge with checkmark + reason
    // Excluded task with exclusion_reason: "Documentation doesn't advance metric"
    // Verify: Shows gray badge with X + reason
    ```
  - **Implementation Steps**:
    1. Add Badge component to TaskRow (if not exists, use shadcn/ui)
    2. Conditionally render green badge for included tasks
    3. Add gray badge to ExcludedTasksSection task cards
    4. Truncate long reasons with tooltip on hover
    5. Write component tests for both states
    6. Verify WCAG AA contrast for badge colors
  - **Dependencies**: T005 (generator returns reasons), T007 (ExcludedTasksSection)

**Checkpoint**: User Story 3 complete. User sees clear reasoning for every task decision, can drill down into score breakdowns, understands AI logic. Transparency builds trust.

---

## Phase 5: User Story 4 - Quality Self-Evaluation with Hybrid Loop (Priority: P3)

**Goal**: As a user, I want the system to self-check its prioritization quality and automatically refine when confidence is low, so that I get reliable results even when the agent is uncertain.

**Independent Test**: Trigger prioritization with ambiguous tasks, verify evaluation loop triggers when confidence < 0.7, see iteration history in reasoning chain.

### Implementation for User Story 4

- [X] T012 [SLICE] [US4] **Evaluator agent with quality criteria**
  - **User Story**: US4 - Quality self-evaluation
  - **SEE**: Evaluator agent returns PASS/NEEDS_IMPROVEMENT/FAIL with specific feedback and criteria scores
  - **DO**: Create prioritizationEvaluator agent with GPT-4o-mini, implement 4 evaluation criteria
  - **VERIFY**: Test with low-quality prioritization → NEEDS_IMPROVEMENT with actionable feedback
  - **Files**:
    - Agent: `lib/mastra/agents/prioritizationEvaluator.ts` (new)
    - Tests: `__tests__/contract/evaluation-agent.test.ts` (new)
  - **UI Entry Point**: Runs automatically during prioritization (not user-triggered)
  - **Backend**: Agent evaluates PrioritizationResult, returns EvaluationResult
  - **Data Layer**: Stored in agent_sessions.evaluation_metadata
  - **Visible Outcome**: User sees higher quality results, fewer manual corrections needed
  - **Test Scenario**:
    ```typescript
    // Poor prioritization: Payment tasks excluded, docs included
    // Expected: Evaluator returns NEEDS_IMPROVEMENT
    // Feedback: "Payment tasks wrongly excluded - these advance revenue metric"
    // Criteria scores: outcome_alignment: 3/10, strategic_coherence: 5/10
    ```
  - **Implementation Steps**:
    1. Create evaluator agent file with GPT-4o-mini model
    2. Write evaluation prompt with 4 criteria (from quickstart.md lines 256-275)
    3. Define status thresholds (PASS: all ≥7, NEEDS_IMPROVEMENT: some <7, FAIL: critical <5)
    4. Write contract test with poor/good prioritizations
    5. Verify EvaluationResultSchema validation passes
    6. Test cost (<$0.01 per evaluation, using mini model)
  - **Dependencies**: T003 (EvaluationResult schema), T005 (generator agent)

- [X] T013 [SLICE] [US4] **Hybrid loop service with conditional evaluation**
  - **User Story**: US4 - Quality self-evaluation with hybrid loop
  - **SEE**: Fast path (<18s) for high confidence (≥0.85), quality path (<30s) for low confidence (<0.7) with evaluation loop
  - **DO**: Create prioritizationLoop service with needsEvaluation logic, implement max 3 iterations, store chain-of-thought
  - **VERIFY**: Test high confidence → 1 iteration, low confidence → 2-3 iterations, both converge or return best effort
  - **Files**:
    - Service: `lib/services/prioritizationLoop.ts` (new)
    - Tests: `__tests__/integration/hybrid-loop-convergence.test.ts` (new)
    - Tests: `lib/services/__tests__/prioritizationLoop.test.ts` (new)
  - **UI Entry Point**: Called by /api/agent/prioritize endpoint
  - **Backend**: Orchestrates generator → evaluator loop, stores metadata
  - **Data Layer**: Stores HybridLoopMetadata in agent_sessions.evaluation_metadata
  - **Visible Outcome**: User gets fast results when agent is confident, quality-checked results when uncertain
  - **Test Scenario**:
    ```typescript
    // High confidence (0.87) prioritization
    // Expected: Fast path, 1 iteration, <18s duration, evaluation_triggered: false

    // Low confidence (0.65) prioritization
    // Expected: Quality path, 2-3 iterations, <30s duration, evaluation_triggered: true
    // Chain of thought shows corrections between iterations
    ```
  - **Implementation Steps**:
    1. Create prioritizationLoop.ts service file
    2. Implement needsEvaluation() function (from quickstart.md lines 336-353)
    3. Implement main loop with max 3 iterations (lines 376-479)
    4. Add chain-of-thought tracking per iteration
    5. Write unit tests for needsEvaluation triggers
    6. Write integration test for full loop convergence
    7. Add performance measurement (duration_ms)
  - **Dependencies**: T005 (generator), T012 (evaluator), T004 (HybridLoopMetadata schema)

- [X] T014 [SLICE] [US4] **Integrate hybrid loop into agent orchestration**
  - **User Story**: US4 - Quality self-evaluation
  - **SEE**: POST /api/agent/prioritize uses hybrid loop, returns evaluation_metadata in response
  - **DO**: Update agentOrchestration.ts to call prioritizeWithHybridLoop instead of old system, store metadata
  - **VERIFY**: API returns session with evaluation_metadata showing iterations, duration, evaluation_triggered status
  - **Files**:
    - Service: `lib/mastra/services/agentOrchestration.ts` (update from T006)
    - Tests: `__tests__/integration/agent-orchestration.test.ts` (update existing)
  - **UI Entry Point**: User clicks "Prioritize" button
  - **Backend**: Orchestration service calls hybrid loop, stores results
  - **Data Layer**: UPDATE agent_sessions SET evaluation_metadata = $1
  - **Visible Outcome**: User gets better quality prioritizations with transparent iteration history
  - **Test Scenario**:
    ```typescript
    // Trigger prioritization via API
    // Fetch session after completion
    // Verify: evaluation_metadata exists
    // Verify: iterations ∈ [1,3], duration_ms recorded
    // Verify: chain_of_thought array has correct length
    ```
  - **Implementation Steps**:
    1. Update runAgent() in agentOrchestration.ts
    2. Replace old agent call with prioritizeWithHybridLoop()
    3. Store returned metadata to database
    4. Update integration tests
    5. Add error handling for loop failures
    6. Verify backward compatibility (feature flag check)
  - **Dependencies**: T013 (hybrid loop service), T006 (API endpoint base)

- [X] T015 [SLICE] [US4] **Reasoning chain display component**
  - **User Story**: US4 - Quality self-evaluation transparency
  - **SEE**: User can expand "Reasoning Chain" section to see each iteration's confidence, corrections, and evaluator feedback
  - **DO**: Create ReasoningChain component, integrate into priorities page, display chain_of_thought steps
  - **VERIFY**: User sees iteration history, confidence progression, corrections made, evaluator feedback (if triggered)
  - **Files**:
    - Component: `app/priorities/components/ReasoningChain.tsx` (new)
    - Page: `app/priorities/page.tsx` (update to add component)
    - Tests: `app/priorities/components/__tests__/ReasoningChain.test.tsx` (new)
  - **UI Entry Point**: Priorities page, expandable section above task list
  - **Backend**: Data from evaluation_metadata.chain_of_thought
  - **Data Layer**: Reads from agent_sessions.evaluation_metadata JSONB
  - **Visible Outcome**: User understands how agent refined its thinking, sees quality loop in action
  - **Test Scenario**:
    ```tsx
    // Render ReasoningChain with 3 iterations
    // Verify: Shows 3 steps in timeline
    // Step 1: Confidence 0.65, "Initially included refactoring task"
    // Step 2: Confidence 0.78, Evaluator: "Refactoring doesn't advance metric"
    // Step 3: Confidence 0.82, "Moved refactoring to excluded"
    ```
  - **Implementation Steps**:
    1. Create ReasoningChain component with Collapsible
    2. Map over chain_of_thought array
    3. Display each step as timeline item (iteration number, confidence, corrections)
    4. Show evaluator_feedback if present
    5. Add visual confidence indicator (color-coded)
    6. Write component test with multi-iteration data
    7. Test expand/collapse interaction
  - **Dependencies**: T014 (evaluation_metadata returned by API)

**Checkpoint**: User Story 4 complete. System self-evaluates prioritizations, triggers quality loop when needed, user sees transparent iteration history. Quality improved without sacrificing speed.

---

## Phase 6: User Story 5 - Performance Optimization (Priority: P3)

**Goal**: As a user, I want prioritization to complete in under 20 seconds on average (30% faster than today's 25s), so that I can iterate quickly on my outcome and reflections.

**Independent Test**: Run prioritization 20 times, verify 80%+ complete in <18s (fast path), 100% complete in <30s (quality path).

### Implementation for User Story 5

- [ ] T016 [SLICE] [US5] **Progressive disclosure during prioritization**
  - **User Story**: US5 - Performance with progressive feedback
  - **SEE**: During 15-30s processing window, UI shows tasks being scored in real-time as partial results stream in
  - **DO**: Implement WebSocket or polling for partial results, update UI incrementally as tasks are scored
  - **VERIFY**: User sees task scores appear progressively (0% → 25% → 50% → 100%), not all-or-nothing loading
  - **Files**:
    - API Route: `app/api/agent/prioritize/route.ts` (update to support streaming)
    - Hook: `lib/hooks/usePrioritizationStream.ts` (new)
    - Page: `app/priorities/page.tsx` (update to use streaming hook)
    - Tests: `__tests__/integration/progressive-disclosure.test.ts` (new)
  - **UI Entry Point**: Priorities page during prioritization run
  - **Backend**: Agent emits partial results during processing
  - **Data Layer**: Temporary partial results (not persisted until complete)
  - **Visible Outcome**: User sees progress, doesn't wait staring at spinner for 20s
  - **Test Scenario**:
    ```typescript
    // Trigger prioritization with 200 tasks
    // Verify: Progress indicator shows 0%
    // After 5s: 25% complete, 50 tasks scored
    // After 10s: 50% complete, 100 tasks scored
    // After 15s: 100% complete, all 200 tasks visible
    ```
  - **Implementation Steps**:
    1. Update prioritizeWithHybridLoop to emit progress events
    2. Create WebSocket endpoint or polling mechanism
    3. Create usePrioritizationStream hook to consume updates
    4. Update priorities page to render partial results
    5. Show progress bar with percentage
    6. Write integration test simulating progressive updates
    7. Handle edge case: stream interrupted (resume or fail gracefully)
  - **Dependencies**: T014 (hybrid loop integration)

- [ ] T017 [SLICE] [US5] **Performance monitoring and duration display**
  - **User Story**: US5 - Performance optimization
  - **SEE**: After prioritization completes, user sees "Completed in 17.6s" with evaluation status
  - **DO**: Display duration_ms from evaluation_metadata, show evaluation_triggered badge, add to processing_logs
  - **VERIFY**: User sees completion time, knows if evaluation loop ran, can track performance over time
  - **Files**:
    - Component: `app/priorities/components/PrioritizationSummary.tsx` (new or update existing)
    - Page: `app/priorities/page.tsx` (add summary component)
    - Service: Log duration to `processing_logs` table
    - Tests: Component test for duration display
  - **UI Entry Point**: Top of priorities page after prioritization completes
  - **Backend**: Read duration_ms from evaluation_metadata
  - **Data Layer**: Stored in agent_sessions.evaluation_metadata, logged to processing_logs
  - **Visible Outcome**: User sees performance metrics, validates <20s average target
  - **Test Scenario**:
    ```tsx
    // Render PrioritizationSummary with metadata
    // evaluation_metadata: { duration_ms: 17634, evaluation_triggered: false }
    // Verify: Shows "Completed in 17.6s" (rounded)
    // Verify: Shows "Fast path ⚡" badge (no evaluation)

    // With evaluation_triggered: true
    // Verify: Shows "Quality checked ✓" badge
    ```
  - **Implementation Steps**:
    1. Create/update PrioritizationSummary component
    2. Format duration_ms to seconds (1 decimal place)
    3. Add badge for fast path vs quality path
    4. Log duration to processing_logs (optional, for analytics)
    5. Write component test for both paths
    6. Add to priorities page header
  - **Dependencies**: T014 (evaluation_metadata available)

- [ ] T018 [SLICE] [US5] **Error handling with retry mechanism**
  - **User Story**: US5 - Performance with reliability
  - **SEE**: When LLM validation fails twice, user sees error banner "Prioritization failed" with "Retry" button, previous results stay visible
  - **DO**: Implement retry logic in hybrid loop, preserve UI state on failure, show actionable error message
  - **VERIFY**: Trigger validation failure (mock), verify auto-retry once, then show error banner with manual retry button
  - **Files**:
    - Service: `lib/services/prioritizationLoop.ts` (update with retry logic)
    - Component: `app/priorities/components/ErrorBanner.tsx` (new or update)
    - Page: `app/priorities/page.tsx` (add error banner)
    - Tests: `__tests__/integration/prioritization-error-handling.test.ts` (new)
  - **UI Entry Point**: Error banner appears above task list on failure
  - **Backend**: Retry logic in hybrid loop, error state in API response
  - **Data Layer**: Previous prioritization remains in agent_sessions (not overwritten)
  - **Visible Outcome**: User sees clear error message, can retry without losing previous work
  - **Test Scenario**:
    ```typescript
    // Mock LLM to return malformed JSON
    // Trigger prioritization
    // Verify: Auto-retry once (total 2 attempts)
    // After 2 failures: Error banner appears
    // Verify: Previous prioritization still visible
    // User clicks "Retry" button
    // Verify: New prioritization triggered with same inputs
    ```
  - **Implementation Steps**:
    1. Add retry logic to prioritizeWithHybridLoop (max 1 retry per FR-022)
    2. Catch schema validation errors
    3. Return error state to API endpoint
    4. Create ErrorBanner component with retry button
    5. Update priorities page to show banner on error
    6. Preserve previous agent_sessions record (don't overwrite)
    7. Write integration test with mocked failures
  - **Dependencies**: T013 (hybrid loop service)

**Checkpoint**: User Story 5 complete. Prioritization completes in <20s average, user sees progressive updates during processing, clear error handling with retry. Performance target achieved.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements, cleanup, and documentation after core user stories are complete

- [ ] T019 [P] [POLISH] **Feature flag implementation for gradual rollout**
  - **Type**: Feature flag toggle
  - **SEE**: Environment variable `USE_UNIFIED_PRIORITIZATION` controls old vs new system
  - **DO**: Add feature flag check in agentOrchestration.ts, enable dual-write period
  - **VERIFY**: Flag=false uses old system, flag=true uses new system, both work
  - **Files**:
    - Config: `lib/config/featureFlags.ts` (new)
    - Service: `lib/mastra/services/agentOrchestration.ts` (add flag check)
    - Env: `.env.example` (add NEXT_PUBLIC_USE_UNIFIED_PRIORITIZATION)
  - **Implementation**:
    1. Create featureFlags.ts config file
    2. Add conditional logic in orchestration service
    3. Update .env.example with flag documentation
    4. Test both code paths (old and new)
  - **Dependencies**: All user story tasks complete

- [ ] T020 [P] [POLISH] **Deprecate old reflection ranking service**
  - **Type**: Code cleanup
  - **SEE**: `reflectionBasedRanking.ts` marked @deprecated with migration notice
  - **DO**: Add deprecation comments, update CHANGELOG, remove from new code paths
  - **VERIFY**: Old service not called when feature flag enabled, deprecation warnings in docs
  - **Files**:
    - Service: `lib/services/reflectionBasedRanking.ts` (add @deprecated tag)
    - Docs: Add migration guide to quickstart.md
  - **Implementation**:
    1. Add JSDoc @deprecated to all exports
    2. Add migration notice comment pointing to new system
    3. Update quickstart.md with deprecation timeline
    4. Verify no new imports in Phase 14 code
  - **Dependencies**: T019 (feature flag), all user stories complete

- [ ] T021 [P] [POLISH] **30-day cleanup job for evaluation metadata**
  - **Type**: Data retention automation
  - **SEE**: Metadata older than 30 days auto-deleted daily at 2 AM UTC
  - **DO**: Create cleanup script, schedule via cron or pg_cron, add monitoring
  - **VERIFY**: Run cleanup manually, verify old records deleted, recent records preserved
  - **Files**:
    - Script: `scripts/cleanup-agent-sessions.ts` (new)
    - Cron: Schedule in deployment config or pg_cron
    - Tests: `scripts/__tests__/cleanup-agent-sessions.test.ts` (new)
  - **Implementation**:
    1. Create cleanup script with 30-day cutoff
    2. Add dry-run mode for testing
    3. Schedule via deployment platform (Vercel Cron or pg_cron)
    4. Add logging to processing_logs
    5. Write test with mock data
    6. Document in quickstart.md
  - **Dependencies**: T001 (database migration)

- [ ] T022 [P] [POLISH] **Override logging to processing_logs**
  - **Type**: Observability
  - **SEE**: User manual adjustments (move to excluded, score changes) logged to processing_logs with timestamp
  - **DO**: Implement override capture in UI, POST to logging endpoint, store in database
  - **VERIFY**: User moves task from included to excluded → log entry created with original/user decisions
  - **Files**:
    - API Route: `app/api/tasks/[id]/override/route.ts` (may exist, update)
    - Component: Update manual override components to call logging endpoint
    - Tests: Contract test for override logging
  - **Implementation**:
    1. Update override UI components to call logging endpoint
    2. Create/update override logging API route
    3. INSERT into processing_logs with metadata
    4. Add fields: session_id, task_id, override_type, original_decision, user_decision
    5. Write contract test for logging
    6. Verify 100% capture rate (SC-017)
  - **Dependencies**: Existing manual override functionality

- [ ] T023 [P] [POLISH] **In-app quality survey for reflection accuracy**
  - **Type**: User feedback collection
  - **SEE**: Every 20 prioritization runs, user sees "Did reflections work as expected?" with thumbs up/down
  - **DO**: Implement survey modal, track run count in localStorage, POST feedback to API
  - **VERIFY**: After 20 runs, survey appears, user can submit feedback, counter resets
  - **Files**:
    - Component: `app/priorities/components/QualitySurvey.tsx` (new)
    - API Route: `app/api/feedback/reflection-quality/route.ts` (new)
    - Hook: Track run count in localStorage
    - Tests: Component test for survey trigger logic
  - **Implementation**:
    1. Create QualitySurvey component with thumbs up/down
    2. Track prioritization run count in localStorage
    3. Show modal after 20 runs or 1 week (whichever first)
    4. Create feedback API endpoint
    5. Store feedback in processing_logs or new table
    6. Write component test for trigger logic
    7. Add "Don't show again" option
  - **Dependencies**: None (can run in parallel)

- [ ] T024 [P] [POLISH] **Update quickstart.md with validation checklist**
  - **Type**: Documentation
  - **SEE**: Quickstart.md has comprehensive testing guide and success criteria checklist
  - **DO**: Update quickstart.md with manual testing steps, validation queries, troubleshooting
  - **VERIFY**: Developer can follow quickstart from zero to deployed feature
  - **Files**:
    - Docs: `specs/012-docs-shape-pitches/quickstart.md` (update existing)
  - **Implementation**:
    1. Add manual testing section for each user story
    2. Add SQL verification queries
    3. Add troubleshooting common errors
    4. Add success criteria checklist (from spec.md)
    5. Review and update code samples
  - **Dependencies**: All user story tasks complete (so examples are accurate)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundation (Phase 1)**: No dependencies - can start immediately (T001-T004)
  - Database migration and Zod schemas MUST complete before any user stories
- **User Stories (Phase 2-6)**: All depend on Foundation completion
  - US1 (Phase 2): Can start immediately after Foundation
  - US2 (Phase 3): Depends on US1 completion (T005 generator agent)
  - US3 (Phase 4): Can run in parallel with US2 (both depend on US1)
  - US4 (Phase 5): Depends on US1 completion (needs generator agent)
  - US5 (Phase 6): Depends on US4 completion (needs hybrid loop)
- **Polish (Phase 7)**: Depends on all desired user stories being complete

### Critical Path (Minimum Viable)

For MVP delivery, implement in this order:

1. **T001-T004**: Foundation (database + schemas) - 2-3 days
2. **T005-T007**: US1 (Filtering) - 3-4 days - **First demo checkpoint**
3. **T008-T009**: US2 (Reflections) - 2-3 days - **Second demo checkpoint**
4. **T010-T011**: US3 (Transparency) - 2-3 days - **Third demo checkpoint**
5. **T012-T015**: US4 (Quality loop) - 4-5 days - **Fourth demo checkpoint**
6. **T016-T018**: US5 (Performance) - 3-4 days - **Fifth demo checkpoint**
7. **T019-T024**: Polish - 2-3 days - **Production ready**

**Total Estimated Time**: 18-25 days (4 weeks)

### Parallel Opportunities

**Foundation Phase** (all in parallel):
- T002 (PrioritizationResult schema)
- T003 (EvaluationResult schema)
- T004 (Supporting schemas)

**After US1 Complete**:
- T008-T009 (US2: Reflections)
- T010-T011 (US3: Transparency)
- T012-T015 (US4: Quality loop)

**Polish Phase** (all in parallel):
- T019 (Feature flag)
- T020 (Deprecation)
- T021 (Cleanup job)
- T022 (Override logging)
- T023 (Survey)
- T024 (Docs)

### Task-Level Dependencies

```
T001 (DB migration) → BLOCKS ALL
  ├─→ T002 (Schema) → T005 (Generator) → T006 (API) → T007 (UI)
  ├─→ T003 (Schema) → T012 (Evaluator)
  └─→ T004 (Schema) → T013 (Hybrid loop)

T005 (Generator)
  ├─→ T006 (API integration)
  ├─→ T008 (Reflection negation)
  ├─→ T010 (Score breakdown)
  └─→ T012 (Evaluator needs generator to evaluate)

T006 (API integration)
  └─→ T007 (UI excluded section)

T008 (Reflection negation)
  └─→ T009 (Reflection influence display)

T012 (Evaluator) + T013 (Hybrid loop)
  └─→ T014 (Orchestration integration)
  └─→ T015 (Reasoning chain UI)

T014 (Orchestration)
  └─→ T016 (Progressive disclosure)
  └─→ T017 (Performance monitoring)

T013 (Hybrid loop)
  └─→ T018 (Error handling)

All User Stories Complete
  └─→ T019-T024 (Polish tasks)
```

---

## Verification Checklist

Before marking Phase 14 complete, verify:

### User Story 1 (Filtering)
- [ ] Payment tasks INCLUDED with clear reasoning
- [ ] Documentation tasks EXCLUDED with clear reasoning
- [ ] Excluded section shows all filtered tasks
- [ ] API returns excluded_tasks array in response

### User Story 2 (Reflections)
- [ ] "ignore X" correctly excludes X tasks (95% accuracy)
- [ ] Reflection influence visible on affected tasks
- [ ] Negations don't boost tasks (regression test)

### User Story 3 (Transparency)
- [ ] Every task shows inclusion/exclusion reason
- [ ] Score breakdown modal displays impact/effort/confidence
- [ ] Reasoning text explains scoring logic

### User Story 4 (Quality Loop)
- [ ] High confidence (≥0.85) → fast path, no evaluation
- [ ] Low confidence (<0.7) → quality path, evaluation runs
- [ ] Chain-of-thought shows iteration history
- [ ] Converges in max 3 iterations

### User Story 5 (Performance)
- [ ] Fast path: <18s for 80% of runs
- [ ] Quality path: <30s for 20% of runs
- [ ] Average: ≤20s across 100 test runs
- [ ] Progressive disclosure shows partial results
- [ ] Error handling: retry mechanism works, UI preserved

### Polish
- [ ] Feature flag enables old/new system toggle
- [ ] Old reflection service marked @deprecated
- [ ] 30-day cleanup job scheduled
- [ ] Override logging captures 100% of adjustments
- [ ] Survey appears after 20 runs

### Success Criteria (from spec.md)
- [ ] SC-001: Reflection negation accuracy 95%
- [ ] SC-002: Task classification accuracy 70%+
- [ ] SC-003: Average prioritization time ≤20s
- [ ] SC-006: Evaluation trigger rate 15-25%
- [ ] SC-013: Test coverage ≥85%

---

## Notes

- **[P]** tasks can run in parallel (different files, no blocking dependencies)
- **[SLICE]** tasks are complete vertical slices (SEE → DO → VERIFY)
- **[SETUP]** tasks are blocking infrastructure (database, schemas)
- **[POLISH]** tasks are enhancements after core features work
- Each task includes UI entry point, backend work, data layer, and visible outcome
- Test scenarios provided for all major tasks
- Stop at any checkpoint to independently validate user story
- Feature can be demoed to non-technical users after each user story phase
