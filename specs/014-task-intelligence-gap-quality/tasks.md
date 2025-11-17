# Tasks: Task Intelligence (Gap & Quality Detection)

**Input**: Design documents from `/specs/014-task-intelligence-gap-quality/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Organization**: Tasks are grouped by user story (US1-US4) to enable independent implementation and testing of each vertical slice.

## Format: `[ID] [P?] [Story] [Tag] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)
- **[Tag]**: [SLICE] = complete vertical slice, [SETUP] = blocking infrastructure, [POLISH] = enhancement
- All file paths are absolute from repository root

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Database schema and shared utilities required for ALL user stories

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] **T001 [SETUP]** Create database migration 025 - Add quality_metadata JSONB column to task_embeddings
  - **File**: `supabase/migrations/025_add_quality_metadata.sql`
  - **Scope**: ALTER TABLE to add column, create GIN index on quality_metadata, create partial index for clarity_score <0.5
  - **Validation**: Run migration on test database, verify indexes created, confirm no impact on existing queries
  - **Blocker for**: US2, US3, US4 (quality metadata storage required)

- [X] **T002 [P] [SETUP]** Create Zod schemas for Task Intelligence data types
  - **File**: `lib/schemas/taskIntelligence.ts`
  - **Scope**: Define QualityMetadataSchema, CoverageAnalysisSchema, DraftTaskSchema, QualitySummarySchema per data-model.md
  - **Validation**: Unit test schema validation with valid/invalid inputs
  - **Blocker for**: All API endpoints (input validation)

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 2: User Story 1 - Goal Coverage Analysis (Priority: P1) 🎯 MVP

**Goal**: Users see coverage percentage showing how well tasks align with their outcome goal

**User Story**: As a user who has set an outcome and run prioritization, I can see a coverage analysis that shows me what percentage of my goal is addressed by existing tasks and which conceptual areas are missing.

**Independent Test**: Set outcome "Increase ARR 15%", upload 10 tasks, run prioritization, see "72% Goal Coverage" with missing areas ["pricing experiments", "upsell flow"]

### Tests for User Story 1 (TDD - Write FIRST, ensure they FAIL)

- [X] **T003 [P] [US1]** Contract test for coverage analysis API endpoint
  - **File**: `__tests__/contract/coverage-analysis.test.ts`
  - **Scope**: Test `POST /api/agent/coverage-analysis` with valid/invalid inputs, verify response schema matches coverage-analysis-api.yaml, and run payloads through `CoverageAnalysisResponseSchema` from `lib/schemas/taskIntelligence.ts`
  - **Test Cases**:
      1. Valid request with 10 task IDs → returns coverage_percentage (0-100), missing_areas array
      2. Invalid outcome_id (not found) → returns 404 with error code "OUTCOME_NOT_FOUND"
      3. Empty task_ids array → returns 400 with error code "INSUFFICIENT_TASKS"
      4. >50 tasks → returns 400 with error code "TOO_MANY_TASKS"
      5. OpenAI scoring timeout (FR-018) → returns 503 with error code "AI_TIMEOUT" and `retry_banner=true`
      6. OpenAI rate limit exceeded (FR-019) → returns 429 with error code "RATE_LIMITED" plus `backoff_seconds`
      7. AI unavailable fallback → returns 200 with `calculation_method="heuristic"` populated in response metadata
  - **Execution Mode**: Schema-only contract test using mocked payloads (no live HTTP); AI timeout/rate-limit cases simulate OpenAI SDK exceptions and validate the resulting error schemas
  - **Must FAIL initially**: `CoverageAnalysisSchema` + API handler stubs are missing, so imports/validations fail until T002/T005 land

- [X] **T004 [P] [US1]** Unit test for coverage algorithm (cosine similarity)
  - **File**: `__tests__/unit/services/coverageAlgorithm.test.ts`
  - **Scope**: Test centroid calculation, cosine similarity function, threshold-based gap detection
  - **Test Cases**:
    1. 10 task embeddings → correct centroid (average of vectors)
    2. Outcome embedding vs centroid → similarity score matches expected (0.72 for test data)
    3. Coverage <70% → should_generate_drafts = true
    4. Coverage ≥70% → should_generate_drafts = false
  - **Must FAIL initially**: No service implementation exists yet

### Implementation for User Story 1

- [X] **T005 [US1] [SLICE]** Implement Coverage Analysis Complete Vertical Slice
  - **User Story**: As a user, I can see goal coverage percentage after prioritization to know if my tasks are comprehensive
  - **UI Entry Point**: `/priorities` page - user clicks "Prioritize Tasks" button
  - **Backend Work**:
    - Create service `lib/services/taskIntelligence.ts`:
      - `analyzeCoverage(outcomeText, taskIds)` function
      - Calculate task cluster centroid (average embeddings)
      - Compute cosine similarity (reuse existing `calculateCosineSimilarity` from aiSummarizer.ts:line 281)
      - Extract missing concepts via GPT-4o-mini when coverage <70%
    - Create API route `app/api/agent/coverage-analysis/route.ts`:
      - POST handler with Zod validation
      - Load outcome and task embeddings from Supabase
      - Call `analyzeCoverage` service
      - Store results in `agent_sessions.result.coverage_analysis` JSONB field
      - Return coverage_percentage, missing_areas, should_generate_drafts
    - Modify `app/api/agent/prioritize/route.ts`:
      - After prioritization completes, trigger async coverage analysis
      - Don't block prioritization results
  - **Data Layer**:
    - Read from `user_outcomes` table (outcome text)
    - Read from `task_embeddings` table (batch fetch by task_ids)
    - Write to `agent_sessions.result` JSONB column (coverage_analysis sub-object)
    - Persist `coverage_analysis.total_duration_ms` + `task_count` telemetry inside `agent_sessions.execution_metadata` for FR-012 audits (console.time output alone isn't durable)
  - **Frontend Work**:
    - Create component `app/components/CoverageBar.tsx`:
      - Display coverage percentage as progress bar
      - Color code: <70% red, 70-85% yellow, >85% green
      - Show missing areas as chips below bar
      - Auto-open Gap Detection Modal if coverage <70% (FR-010)
    - Modify `app/priorities/page.tsx`:
      - Add CoverageBar component above task list
      - Poll coverage analysis endpoint after prioritization
      - Handle loading state (spinner) during async analysis
  - **Visible Outcome**: User sees "72% Goal Coverage" bar with chips ["pricing experiments", "upsell flow"], Gap Detection Modal opens if <70%
  - **Test Scenario**:
    1. User sets outcome, uploads docs, clicks "Prioritize Tasks"
    2. Task list appears within 3s
    3. Coverage bar loads within additional 2s (async)
    4. If <70%, modal opens showing missing areas
    5. User can dismiss modal or proceed to generate drafts
  - **Dependencies**: Requires T001 (migration), T002 (schemas) complete
  - **Performance Target**: Coverage analysis <3s p95 (FR-012), measured via console.time in API route

**Checkpoint**: User Story 1 complete - users can see coverage analysis and missing areas

---

## Phase 3: User Story 2 - Task Quality Evaluation (Priority: P1) 🎯 MVP

**Goal**: Users see quality badges on task cards to identify which tasks need refinement before starting work

**User Story**: As a user viewing my prioritized task list, I can see quality badges (Clear/Review/Needs Work) on each task card indicating clarity level.

**Independent Test**: Have tasks with varying clarity ("Build pricing page" vs "Improve UX"), run prioritization, see color-coded badges (🟢🟡🔴) on task cards with hover tooltips

### Tests for User Story 2 (TDD - Write FIRST, ensure they FAIL)

- [X] **T006 [P] [US2]** Contract test for quality evaluation API endpoint
  - **File**: `__tests__/contract/quality-evaluation.test.ts`
  - **Scope**: Test `POST /api/tasks/evaluate-quality` with batch of tasks, verify response schema matches quality-evaluation-api.yaml, and validate payloads with `QualityEvaluationResponseSchema` from `lib/schemas/taskIntelligence.ts`
    - **Test Cases**:
      1. Valid request with 10 tasks → returns evaluations array with clarity_score, badge_color, badge_label
      2. Task "Build pricing page" → receives badge_color="green", clarity_score ≥0.8
      3. Task "Improve UX" → receives badge_color="red", clarity_score <0.5
      4. force_heuristic=true → uses fallback logic, calculation_method="heuristic"
      5. >50 tasks → returns 400 with error code
      6. OpenAI evaluation timeout (FR-018) → returns 503 with error code "AI_TIMEOUT" and `retry_banner=true`
      7. Rate limit exceeded (FR-019) → returns 429 with error code "RATE_LIMITED" plus `backoff_seconds`
      8. AI evaluation unavailable → returns 200 with `calculation_method="heuristic"` even without `force_heuristic`
  - **Execution Mode**: Schema-only contract assertions with mocked evaluation payloads (no HTTP)
  - **Must FAIL initially**: Quality evaluation schema/service not implemented yet, so tests referencing them should error until T006 code exists

- [X] **T007 [P] [US2]** Unit test for quality heuristics fallback
  - **File**: `lib/services/__tests__/qualityEvaluation.test.ts`
  - **Scope**: Test heuristic scoring logic (FR-020) without AI calls
  - **Test Cases**:
    1. Task length 10-30 chars → base score 0.7
    2. Task length 31-80 chars → base score 0.9
    3. Task with strong verb ("Build", "Test") → +0.1 bonus
    4. Task with metrics ("from 5 to 3") → +0.2 bonus
    5. Task combining all → final score 0.9+0.1+0.2 = capped at 1.0
  - **Must FAIL initially**: No service implementation exists yet

### Implementation for User Story 2

- [X] **T008 [US2] [SLICE]** Implement Quality Evaluation Complete Vertical Slice
  - **User Story**: As a user, I can see quality badges on each task card to identify which tasks need refinement
  - **UI Entry Point**: `/priorities` page - task cards display after prioritization
  - **Backend Work**:
    - Create service `lib/services/qualityEvaluation.ts`:
      - `evaluateQuality(taskText, forceHeuristic=false)` function
      - Try AI evaluation first (GPT-4o-mini, FR-015):
        - Analyze verb strength, specificity, granularity
        - Generate improvement suggestions
      - On AI failure (timeout/rate limit):
        - Retry once after 2s delay (FR-018)
        - If still fails, use heuristic fallback (FR-020):
          - Length check: 10-30=0.7, 31-80=0.9, <10 or >100=0.4
          - Strong verbs: Build/Test/Deploy=0.9, Improve/Fix=0.5
          - Metric detection: regex for numbers (+0.2 bonus)
      - Return QualityMetadata with calculation_method
    - Create API route `app/api/tasks/evaluate-quality/route.ts`:
      - POST handler accepting tasks array (max 50, FR-017)
      - Batch evaluation using Promise.all for parallel processing
      - Store quality_metadata in task_embeddings table
      - Return evaluations array + summary (avg clarity, counts per badge color)
    - Modify `app/api/agent/prioritize/route.ts`:
      - After prioritization, trigger batch quality evaluation
      - Pass all task_ids for evaluation
      - Don't block prioritization results (async)
  - **Data Layer**:
    - Read from `task_embeddings` table (task_text)
    - Write to `task_embeddings.quality_metadata` JSONB column
    - Update records in batch using Supabase client
  - **Frontend Work**:
    - Create component `app/components/QualityBadge.tsx`:
      - Display colored badge based on clarity_score: 🟢 ≥0.8, 🟡 0.5-0.8, 🔴 <0.5
      - Labels: "Clear", "Review", "Needs Work"
      - Pulsing animation during recalculation (FR-023)
    - Create component `app/components/QualityTooltip.tsx`:
      - Hover tooltip showing quality breakdown (FR-011):
        - Clarity score (0.0-1.0)
        - Verb strength (strong/weak)
        - Specificity indicators (has_metrics, contains_numbers)
        - Improvement suggestions array
      - Links to "Refine This Task" action (US4 placeholder)
    - Modify `app/priorities/components/ContextCard.tsx`:
      - Add QualityBadge component to each task card
      - Wire tooltip on hover
      - Handle loading state during evaluation
  - **Visible Outcome**: User sees 🟢 badge on "Build pricing page" task, 🔴 badge on "Improve UX" task, hovers to see detailed breakdown
  - **Test Scenario**:
    1. User runs prioritization with mix of clear/vague tasks
    2. Task list appears with quality badges
    3. Badge colors match task clarity (green for specific, red for vague)
    4. Hover shows tooltip with score breakdown
    5. If AI fails, see banner "AI analysis unavailable. Showing basic quality scores. [Retry]"
  - **Dependencies**: Requires T001 (migration), T002 (schemas) complete
  - **Performance Logging**: Capture evaluation + render durations and store under `agent_sessions.execution_metadata.quality_evaluation` with timestamps so SC-007/SC-009 performance budgets can be reported
  - **Performance Target**: Badge render <500ms p95 (SC-007), evaluation uses batch API call

- [X] **T009a [P] [US2]** Unit test for optimistic UI + debounce logic
  - **File**: `app/components/__tests__/quality-badge-optimistic.test.tsx`
  - **Scope**: Validate debounce timings via `vi.useFakeTimers()`, optimistic state transitions, and animation toggles without hitting the network (FR-021, FR-022); assert API callback count when multiple edits happen inside the 300ms window
  - **Test Cases**:
    1. Edit "Fix bugs" → "Fix login timeout (max 3s)" → badge flips 🔴→🟢 instantly, sets optimistic flag
    2. Debounce timer (300ms) batches rapid edits; 3 edits within window result in single recalculation call invocation
    3. While debounce pending → pulsing animation flag true, cleared once request promise resolves or rejects
    4. Error path → optimistic state reverts and surfaces inline error message
  - **Must RUN after**: T008 implemented

- [X] **T009b [P] [US2]** Integration test for real-time quality badge updates
  - **File**: `__tests__/integration/real-time-quality-update.test.ts`
  - **Scope**: End-to-end check of API wiring + SSE updates + animation handoff (FR-021, FR-022, FR-023) with `vi.useFakeTimers()` controlling the debounce clock to verify only one API call fires per 300ms window during rapid edits
  - **Test Cases**:
    1. User edits task "Fix bugs" → "Fix login timeout (max 3s)" → optimistic badge update occurs
    2. After debounce → API request issued, mock returns higher clarity score
    3. During recalculation → badge shows pulsing animation and disabled state
    4. After response → actual score appears, optimistic flag cleared, metadata tooltip refreshed
    5. Rate limited response → banner shown, retry button schedules next call after backoff
  - **Must RUN after**: T008 implemented
  - **Validation**: Measure latency with Performance API, confirm <500ms (SC-009)

**Checkpoint**: User Story 2 complete - users see quality badges with real-time updates

---

## Phase 4: User Story 3 - Draft Task Generation & Approval (Priority: P2)

**Goal**: Users can generate AI-suggested draft tasks to fill coverage gaps and accept them into their plan

**User Story**: As a user who sees missing coverage areas, I can click "Generate Draft Tasks" to get AI-suggested tasks that fill detected gaps, review them, edit if needed, and accept them for insertion.

**Independent Test**: Have coverage <70%, click "Generate Draft Tasks", see 2-3 drafts with reasoning, edit one, accept another, verify both appear in task list with dependencies

### Tests for User Story 3 (TDD - Write FIRST, ensure they FAIL)

- [ ] **T010 [P] [US3]** Contract test for draft generation API endpoint
  - **File**: `__tests__/contract/draft-generation.test.ts`
  - **Scope**: Test `POST /api/agent/generate-draft-tasks` and `POST /api/agent/accept-draft-tasks`, verify schemas match draft-generation-api.yaml, and explicitly parse payloads with `DraftGenerationResponseSchema` / `DraftAcceptanceResponseSchema` from `lib/schemas/taskIntelligence.ts`
    - **Test Cases**:
      1. Valid generation request with missing_areas → returns drafts array with task_text, reasoning, confidence_score
      2. Max 3 drafts per area (FR-005) → 2 missing areas = max 6 total drafts
      3. Acceptance request with 2 draft_ids → returns inserted_task_ids array
      4. Acceptance with cycle (self-referencing dependency) → returns 400 with "DEPENDENCY_CYCLE" error
      5. Phase 5 fallback triggered when coverage <80% → returns drafts with source="phase5_dependency"
      6. OpenAI draft generation timeout (FR-018) → returns 503 with error code "AI_TIMEOUT" and retry banner metadata
      7. Rate limit exceeded (FR-019) → returns 429 with error code "RATE_LIMITED" and `backoff_seconds`
      8. AI fallback to heuristics → returns 200 with drafts carrying `calculation_method="heuristic"`
  - **Execution Mode**: Contract test validates mocked request/response payloads (unit T010a + integration T011 cover logic)
  - **Must FAIL initially**: Draft generation schemas/routes aren't implemented, so imports + validation helpers fail until backend work (T010a, T012/T013)

- [ ] **T010a [P] [US3]** Unit test for Phase10/Phase5 deduplication service
  - **File**: `__tests__/unit/services/deduplication.test.ts`
  - **Scope**: Test `deduplicateDrafts` in `lib/services/deduplication.ts` (FR-025, FR-027) prior to integration wiring
  - **Test Cases**:
    1. P5 draft with cosine similarity ≥0.85 to any P10 draft is suppressed (ensuring SHA-256 dedup hash + embeddings work)
    2. P5 drafts below threshold remain and retain `source_label="🔗 Dependency Gap"`
    3. Handles malformed embeddings gracefully (drops entries, logs warning)
  - **Execution Mode**: Pure unit tests with mocked embedding similarity function
  - **Must FAIL initially**: `deduplicateDrafts` not implemented yet; add immediately after T012 service scaffolding and before T011 integration

- [X] **T011 [P] [US3]** Integration test for P10+P5 deduplication flow
  - **File**: `__tests__/integration/phase10-phase5-integration.test.ts`
  - **Scope**: Test sequential execution and embedding similarity deduplication (FR-025, FR-026, FR-027)
  - **Test Cases**:
    1. P10 generates 3 drafts, coverage still <80% → P5 triggers
    2. P5 generates 2 drafts, 1 similar to P10 (embedding similarity >0.85) → suppressed
    3. Final modal shows 3 P10 drafts labeled "🎯 Semantic Gap" + 1 P5 draft labeled "🔗 Dependency Gap"
    4. User accepts mix of P10 and P5 drafts → both insert successfully
  - **Must RUN after**: T010a, T012, T013 implemented
  - **Validation**: Verify deduplication logic prevents duplicates, labels correct

### Implementation for User Story 3

- [X] **T012 [US3] [SLICE]** Implement Draft Task Generation Complete Vertical Slice
  - **User Story**: As a user, I can generate AI draft tasks to fill coverage gaps
  - **UI Entry Point**: Gap Detection Modal - user clicks "Generate Draft Tasks" button
  - **Backend Work**:
    - Create service `lib/services/draftTaskGeneration.ts`:
      - `generateDrafts(outcomeText, missingAreas, existingTasks, maxPerArea=3)` function
      - For each missing area:
        - Use GPT-4o-mini to generate max 3 draft tasks (FR-005, FR-015)
        - Each draft includes: task_text, estimated_hours, cognition_level, reasoning, confidence_score
        - Generate embedding for each draft (for deduplication)
        - Calculate deduplication_hash (SHA-256 of normalized text)
      - Return DraftTask[] with source="phase10_semantic"
    - Create service `lib/services/deduplication.ts`:
      - `deduplicateDrafts(p10Drafts, p5Drafts)` function
      - Compare embeddings using cosine similarity
      - If P5 draft similarity >0.85 to any P10 draft → suppress P5 draft (FR-027)
      - Return combined array with labels: P10 get "🎯 Semantic Gap", P5 get "🔗 Dependency Gap" (FR-026)
    - Create API route `app/api/agent/generate-draft-tasks/route.ts`:
      - POST handler with Zod validation
      - Call Phase 10: `generateDrafts(...)` → get P10 drafts
      - Calculate coverage after P10 drafts hypothetically accepted
      - If coverage <80%: trigger Phase 5 fallback (FR-025):
        - Call existing `suggestBridgingTasks` tool (lib/mastra/tools/suggestBridgingTasks.ts)
        - Get P5 drafts
        - Run deduplication: `deduplicateDrafts(p10Drafts, p5Drafts)`
      - Store combined drafts in `agent_sessions.result.draft_tasks.generated`
      - Return drafts array, phase5_triggered boolean, deduplication_stats
    - Modify `lib/mastra/tools/suggestBridgingTasks.ts`:
      - Add source="phase5_dependency" to returned tasks
      - Add embedding field for deduplication
  - **Data Layer**:
    - Read from `user_outcomes`, `task_embeddings` tables
    - Write to `agent_sessions.result.draft_tasks` JSONB sub-object
    - Track dismissed draft IDs in session (FR-014)
  - **Frontend Work**:
    - Create component `app/priorities/components/DraftTaskCard.tsx`:
      - Display draft task with reasoning, confidence score, hours estimate
      - Show source label: "🎯 Semantic Gap" or "🔗 Dependency Gap"
      - Inline edit mode: text input for task_text modification (FR-006)
      - Actions: [Edit] [✓ Accept] [✗ Dismiss]
    - Modify `app/priorities/components/GapDetectionModal.tsx`:
      - Add "Generate Draft Tasks" button (appears when coverage <70%)
      - Show loading state during generation
      - Render DraftTaskCard for each generated draft
      - Group by source: P10 section first, then P5 section
      - Track accepted/dismissed IDs
      - "Accept Selected" button triggers acceptance API call
  - **Performance Logging**: Store `total_duration_ms`, `p10_duration_ms`, and `p5_duration_ms` from the API route inside `agent_sessions.execution_metadata.draft_generation` (and optionally `processing_logs`) so FR-025/FR-027 latency SLAs have persisted evidence
  - **Visible Outcome**: User clicks button, sees 3-4 draft tasks with reasoning, can edit text, clicks accept, tasks appear in list
  - **Test Scenario**:
    1. Coverage <70% → modal shows "Generate Draft Tasks" button
    2. User clicks → loading spinner for ~4s
    3. Modal updates with 3 P10 drafts ("🎯 Semantic Gap")
    4. Coverage still <80% → P5 triggers, adds 1 more draft ("🔗 Dependency Gap")
    5. User edits one draft, accepts 2 others
    6. Tasks appear in prioritized list with quality badges
  - **Dependencies**: Requires T005 (coverage analysis), T008 (quality evaluation) complete
  - **Performance Target**: Draft generation <5s p95, measured in API route

- [X] **T013 [US3] [SLICE]** Implement Draft Task Acceptance Complete Vertical Slice
  - **User Story**: As a user, I can accept draft tasks to insert them into my prioritized plan
  - **UI Entry Point**: Gap Detection Modal - user clicks "Accept Selected" button
  - **Backend Work**:
    - Create API route `app/api/agent/accept-draft-tasks/route.ts`:
      - POST handler accepting session_id, accepted_draft_ids, edited_drafts
      - Load drafts from `agent_sessions.result.draft_tasks.generated`
      - Validate accepted_draft_ids exist
      - Apply edits from edited_drafts array
      - Run cycle detection using existing Kahn's algorithm (lib/services/taskInsertion.ts, FR-007)
      - If cycle detected → return 400 error with cycle details
      - If valid → insert tasks into `task_embeddings` table:
        - Generate embeddings for new tasks
        - Store with quality_metadata (evaluated at insertion time)
        - Create dependency links in `task_relationships` table (if applicable)
      - Update `agent_sessions.result.draft_tasks.accepted` array with inserted task_ids
      - Recalculate coverage percentage after insertion
      - Return inserted_task_ids, cycle_detected boolean, new coverage percentage
  - **Data Layer**:
    - Read from `agent_sessions.result.draft_tasks`
    - Write to `task_embeddings` table (new task rows)
    - Write to `task_relationships` table (dependency links)
    - Update `agent_sessions.result.draft_tasks.accepted` array
    - Update `agent_sessions.result.coverage_analysis.coverage_percentage`
  - **Frontend Work**:
    - In `GapDetectionModal.tsx`:
      - Handle "Accept Selected" button click
      - Show loading state during insertion
      - On success:
        - Close modal
        - Refresh task list to show new tasks
        - Show toast: "✅ 2 tasks added. Coverage: 72% → 86%"
      - On cycle error:
        - Show error message with affected tasks
        - Keep modal open for user to adjust
  - **Visible Outcome**: User accepts drafts, modal closes, task list refreshes with new tasks visible, coverage bar updates
  - **Test Scenario**:
    1. User selects 2 drafts in modal (one edited, one original)
    2. Clicks "Accept Selected (2)"
    3. Loading spinner for ~1.5s
    4. Modal closes
    5. Task list refreshes showing 2 new tasks with quality badges
    6. Coverage bar updates from 72% → 86%
  - **Dependencies**: Requires T012 complete
  - **Performance Logging**: Record insertion latency + cycle detection duration into `agent_sessions.execution_metadata.draft_acceptance` for SC-005 audits
  - **Performance Target**: Insertion + cycle check <2s, measured in API route

**Checkpoint**: User Story 3 complete - users can generate and accept draft tasks with P10/P5 integration

---

## Phase 5: User Story 4 - Quality Issue Remediation (Priority: P3)

**Goal**: Users can get AI suggestions to refine vague tasks and apply them to improve task clarity

**User Story**: As a user who sees a task flagged with quality issues, I can click "Refine" button to get AI-suggested improvements (e.g., split vague task into 2 specific sub-tasks), preview suggestions, and apply them.

**Independent Test**: Have task "Improve site performance" flagged as 🔴 "Needs Work", click "Refine", see split suggestion ("Audit page load times" + "Reduce bundle size by 30%"), accept to replace original

### Tests for User Story 4 (TDD - Write FIRST, ensure they FAIL)

- [X] **T014 [P] [US4]** Contract test for quality refinement API endpoint
  - **File**: `__tests__/contract/quality-refinement.test.ts`
  - **Scope**: Test `POST /api/tasks/[id]/refine` endpoint
  - **Test Cases**:
    1. Valid request with vague task "Fix bugs" → returns suggestions array with action="split", new_task_texts=["Fix login timeout", "Fix checkout validation"]
    2. Task with missing prerequisites → returns action="insert", new_task_texts=["Run QA smoke tests"]
    3. Near-duplicate tasks → returns action="merge"
    4. Already clear task (score >0.8) → returns empty suggestions array
  - **Execution Mode**: Mocked contract payload validation (no live API call) until the vertical slice is available
  - **Must FAIL initially**: Refinement schemas/routes don't exist yet, so tests referencing them fail until T015 ships

### Implementation for User Story 4

- [X] **T015 [US4] [SLICE]** Implement Quality Refinement Complete Vertical Slice
  - **User Story**: As a user, I can refine vague tasks to improve clarity
  - **UI Entry Point**: Task card - user clicks "Refine" button on 🔴 "Needs Work" badge
  - **Dependencies**: Requires T014 (contract test) complete
  - **Backend Work**:
    - Create service `lib/services/qualityRefinement.ts`:
      - `suggestRefinements(taskId, taskText, qualityIssues)` function
      - Use GPT-4o-mini to analyze task + quality issues (FR-015)
      - Generate refinement suggestions:
        - Split: vague task → 2 specific sub-tasks
        - Insert prerequisite: add dependency task before current
        - Merge: combine near-duplicates
      - Each suggestion includes: action type, new_task_texts array, reasoning
      - Return RefinementSuggestion[]
    - Create API route `app/api/tasks/[id]/refine/route.ts`:
      - POST handler with task_id parameter
      - Load task from `task_embeddings` table
      - Load quality_metadata to get improvement_suggestions
      - Call `suggestRefinements(...)` service
      - Return suggestions array
  - **Data Layer**:
    - Read from `task_embeddings` table (task_text, quality_metadata)
    - When user accepts refinement:
      - Archive original task (set archived=true, preserve for audit, FR-016)
      - Insert new task(s) into `task_embeddings`
      - Generate embeddings and quality scores for new tasks
  - **Frontend Work**:
    - Modify `app/components/QualityTooltip.tsx`:
      - Add "Refine This Task" button (only shows for 🔴 or 🟡 badges)
      - On click, opens refinement modal
    - Create component `app/priorities/components/RefinementModal.tsx`:
      - Show original task text
      - Display AI-suggested refinements:
        - Split: "Split into 2 tasks: [Task A] [Task B]"
        - Insert: "Add prerequisite: [Prerequisite Task]"
      - Each suggestion has quality score preview
      - Actions: [Apply Refinement] [Cancel]
    - Create API route handler for applying refinement:
      - POST `/api/tasks/[id]/apply-refinement`
      - Archive original task
      - Insert new tasks
      - Recalculate quality scores
      - Return inserted_task_ids
  - **Visible Outcome**: User clicks "Refine" on vague task, sees split suggestions, applies it, original task disappears, 2 new clear tasks appear with 🟢 badges
  - **Test Scenario**:
    1. Task "Fix bugs" shows 🔴 badge with score 0.42
    2. User hovers → tooltip shows "Refine This Task" button
    3. Clicks → modal opens with 2 suggestions
    4. Suggestion 1: Split into "Fix login timeout (max 3s)" + "Fix checkout validation on mobile"
    5. User clicks "Apply Refinement"
    6. Modal closes, task list refreshes
    7. Original task archived, 2 new tasks appear with 🟢 badges (score 0.88, 0.85)
  - **Dependencies**: Requires T008 (quality evaluation) complete
  - **Performance Logging**: Persist `refinement_generation_ms` + reasoning token counts to `agent_sessions.execution_metadata.quality_refinement` (and processing logs) so FR-015/SC-007 metrics survive beyond console output
  - **Performance Target**: Refinement suggestions <3s, measured in API route

**Checkpoint**: User Story 4 complete - users can refine vague tasks with AI assistance

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Enhancements and error handling affecting multiple user stories

- [X] **T016 [P] [POLISH]** Add error banner for AI service failures
  - **File**: `app/components/ErrorBanner.tsx`
  - **Scope**: Create reusable banner component for FR-019
  - **Display**: "AI analysis unavailable. Showing basic quality scores. [Retry]"
  - **Action**: Retry button triggers manual API retry (max 3 total attempts)
  - **After 3 failures**: Disable retry button, show "AI service temporarily unavailable. Quality scores based on basic heuristics."
  - **Integration**: Wire into quality evaluation flow, draft generation flow

- [ ] **T017 [P] [POLISH]** Add 50-task limit warning banner
  - **File**: Modify `app/priorities/page.tsx`
  - **Scope**: Display warning when task count >50 (FR-017)
  - **Message**: "Analysis limited to top 50 tasks. Consider archiving completed tasks to improve coverage accuracy."
  - **Behavior**: Analyze top 50 by priority/confidence, ignore rest

- [ ] **T018 [P] [POLISH]** Add <5 tasks coverage warning
  - **File**: Modify `app/components/CoverageBar.tsx`
  - **Scope**: Display warning when task count <5 (from research.md Open Questions)
  - **Message**: "Coverage analysis requires ≥5 tasks for accuracy"
  - **Behavior**: Still calculate coverage but show warning icon

- [ ] **T019 [POLISH]** Add telemetry logging for observability
  - **Files**: Modify all service files and API routes
  - **Scope**: Add structured logging per Principle V (Observable by Design)
  - **Metrics**:
    - Coverage analysis duration → `agent_sessions.execution_metadata`
    - Quality evaluation method (ai vs heuristic) → `quality_metadata.calculation_method`
    - Draft generation metrics (P10 vs P5 count, deduplication stats) → `draft_tasks` metadata
    - Real-time recalculation latency → console.log with Performance API timing
  - **Validation**: Check logs contain required fields, no PII leaked

- [ ] **T020 [POLISH]** Run end-to-end validation using quickstart.md
  - **File**: Manual test following `specs/014-task-intelligence-gap-quality/quickstart.md`
  - **Scope**: Complete user journey from Step 1-7
  - **Validation Points**:
    1. Coverage bar displays after prioritization
    2. Quality badges appear on all task cards
    3. Gap Detection Modal opens when coverage <70%
    4. Draft generation completes in <5s
    5. Draft acceptance inserts tasks successfully
    6. Real-time quality updates work with 300ms debounce
    7. Refinement flow splits vague tasks correctly
  - **Sign-off**: Product owner demo, confirm all acceptance scenarios pass

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - MUST complete before ANY user story begins (T001 and T002 can run in parallel)
  - T001 (migration) blocks T005, T008 (stores quality_metadata)
  - T002 (schemas) blocks T003-T015 (all API validation)

- **User Story 1 (Phase 2)**: Depends on Setup (T001, T002) complete
  - Can start after foundation ready
  - No dependencies on other user stories

- **User Story 2 (Phase 3)**: Depends on Setup (T001, T002) complete
  - Can run in parallel with US1 (different files)
  - Shares migration T001 with US1

- **User Story 3 (Phase 4)**: Depends on US1 (T005) and US2 (T008) complete
  - Requires coverage analysis (US1) to detect gaps
  - Requires quality evaluation (US2) to score inserted drafts
  - Sequential dependency: US1 → US2 → US3

- **User Story 4 (Phase 5)**: Depends on US2 (T008) complete
  - Requires quality evaluation to flag issues
  - Can run in parallel with US3 (different files)

- **Polish (Phase 6)**: Depends on all desired user stories being complete
  - Can start incrementally as each US completes
  - T016-T018 can run in parallel (different files)
  - T020 (E2E test) must run last

### Within Each User Story

- Tests (T003, T004, T006, T007, T010, T011, T014) MUST be written FIRST and FAIL before implementation
- Implementation tasks (T005, T008, T012, T013, T015) can only start after tests fail
- Integration tests (T009, T011) run after implementation complete to validate

### Parallel Opportunities

- **Setup phase**: T001 and T002 can run in parallel (different tables/files)
- **US1 tests**: T003 and T004 can run in parallel (different test files)
- **US2 tests**: T006 and T007 can run in parallel (different test files)
- **US1 and US2 implementation**: Cannot run in parallel (both modify prioritize/route.ts)
- **US3 and US4**: T015 can run in parallel with T012-T013 (different files: refine vs generate/accept)
- **Polish**: T016, T017, T018, T019 can all run in parallel (different files)

---

## Implementation Strategy

### MVP First (US1 + US2 Only)

1. Complete Phase 1: Setup (T001, T002)
2. Complete Phase 2: User Story 1 (T003-T005)
3. Complete Phase 3: User Story 2 (T006-T009)
4. **STOP and VALIDATE**: Test coverage analysis + quality badges work independently
5. Deploy/demo MVP (users can see gaps and quality, but can't fix them yet)

### Full Feature (All User Stories)

1. Setup → US1 → US2 → **MVP checkpoint**
2. Add US3 (draft generation) → Test independently
3. Add US4 (refinement) → Test independently
4. Polish → E2E validation
5. Deploy complete feature

### Parallel Team Strategy

With 2-3 developers after Setup complete:

1. **Dev A**: US1 (coverage analysis) - T003-T005
2. **Dev B**: US2 (quality evaluation) - T006-T009
3. Wait for Dev A + Dev B to finish (US1 and US2 block US3)
4. **Dev A**: US3 (draft generation) - T010-T013
5. **Dev C** (or Dev B): US4 (refinement) - T014-T015
6. **All devs**: Polish tasks in parallel - T016-T019
7. **Product owner**: E2E validation - T020

---

## Notes

- [SLICE] tasks are complete vertical slices (UI + Backend + Data + Feedback)
- [SETUP] tasks are blocking infrastructure (only T001, T002)
- [POLISH] tasks are enhancements (can be deferred post-MVP)
- [P] tasks = different files, no dependencies, can run in parallel
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Stop at Phase 2 checkpoint for MVP deployment (US1 + US2)
- Verify ALL tests fail before implementing (TDD mandatory)
- Commit after each task completion
- Performance targets tracked per task in "Performance Target" field
- Use absolute file paths from repository root for all references
