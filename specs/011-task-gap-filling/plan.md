# Implementation Plan: Task Gap Filling with AI

**Branch**: `011-task-gap-filling` | **Date**: 2025-11-05 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/home/yunix/learning-agentic/ideas/Note-synth/notes/specs/011-task-gap-filling/spec.md`

## Execution Flow (/plan command scope)
```
1. Load feature spec from Input path
   → ✅ Loaded - comprehensive spec with 28 FRs, 5 scenarios, 4 entities
2. Fill Technical Context (scan for NEEDS CLARIFICATION)
   → ✅ All technical decisions clear from spec and existing codebase
   → Project Type: Web (Next.js 15 App Router)
   → Structure Decision: Next.js with app/ and lib/ directories
3. Fill the Constitution Check section
   → ✅ Completed below
4. Evaluate Constitution Check section
   → ⚠️  One violation: Manual trigger (button click) required
   → ✅ Justified in Complexity Tracking - user approval for AI-generated tasks
   → Update Progress Tracking: Initial Constitution Check PASS WITH JUSTIFICATION
5. Execute Phase 0 → research.md
   → ✅ Research gaps/strategies documented
6. Execute Phase 1 → contracts, data-model.md, quickstart.md, CLAUDE.md
   → ✅ Design artifacts generated
7. Re-evaluate Constitution Check section
   → ✅ No new violations after design
   → Update Progress Tracking: Post-Design Constitution Check PASS
8. Plan Phase 2 → Task generation approach described
   → ✅ Vertical slice strategy documented
9. STOP - Ready for /tasks command
```

## Summary

**Primary Requirement**: Enable users to detect logical gaps in their prioritized task plans and fill those gaps with AI-generated bridging tasks for user approval.

**Technical Approach**: Extend existing Mastra agent infrastructure with new `suggest-bridging-tasks` tool. Add gap detection heuristics to `taskOrchestrator.ts` using 4 indicators (time, action type, dependency, skill jump). Create modal UI for reviewing/editing suggestions. Implement task insertion with dependency validation to prevent cycles.

**Key Innovation**: Leverages existing semantic search against past user documents (no external APIs) to ground AI suggestions in user's historical patterns. Conservative 3+ indicator threshold minimizes false positives.

## Technical Context

**Language/Version**: TypeScript 5.x with strict mode, React 19, Next.js 15 (App Router)
**Primary Dependencies**:
- Mastra (@mastra/core ^0.21.1) - Tool creation, agent orchestration, telemetry
- Vercel AI SDK (@ai-sdk/openai ^1.0.0, ai ^4.0.0) - Structured generation with Zod schemas
- Supabase (@supabase/supabase-js ^2.58.0) - Data persistence, task storage
- Zod (^3.24.1) - Runtime schema validation
- shadcn/ui + Radix - UI components (Dialog, Checkbox, Button, Badge)

**Storage**: Supabase PostgreSQL (existing tables: `agent_sessions`, `task_embeddings`; new: gap analysis metadata in sessions)
**Testing**: Vitest (^2.1.8) + Testing Library (^16.1.0) - TDD with manual test guides where needed
**Target Platform**: Web browsers (Chrome, Firefox, Safari latest 2 versions)
**Project Type**: Web application (Next.js SSR/CSR hybrid with App Router)
**Performance Goals**:
- Gap detection: <2s for analyzing 50-task plan
- Task generation: <5s per gap (FR-020)
- Modal interaction: <100ms response time
- Overall E2E: <10s from button click to suggestions displayed

**Constraints**:
- Max 3 bridging tasks per gap (FR-025)
- Single-pass detection only, no recursion (FR-026)
- No external web research APIs (FR-027)
- Must preserve original user tasks (FR-028)
- Conservative detection: 3+ indicators required to flag gap (FR-002)
- False positive rate: <20% (FR-022)

**Scale/Scope**:
- Typical plan size: 10-30 tasks
- Max plan size: 50 tasks supported
- Expected gaps per plan: 1-3
- Suggestions per gap: 1-3 tasks
- User base: Existing AI Note Synthesiser users (Phase 5 enhancement)

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with AI Note Synthesiser Constitution v1.1.7:

- [x] **Autonomous by Default**: ⚠️ VIOLATION - Requires manual button click to trigger
  - **Justification**: User approval is mandatory for AI-generated task insertion (FR-014)
  - **Rationale**: Inserting tasks without review violates user agency and could corrupt plans
  - **Documented in**: Complexity Tracking section below
- [x] **Deterministic Outputs**: ✅ COMPLIANT
  - Zod schemas for BridgingTask, Gap, GapAnalysisSession
  - Structured generation via Vercel AI SDK generateObject()
  - Retry logic for AI failures (FR-024)
- [x] **Modular Architecture**: ✅ COMPLIANT
  - New Mastra tool: `suggest-bridging-tasks` (independent, testable)
  - Gap detection logic: Pure functions in `lib/services/gapDetection.ts`
  - UI component: `SuggestedTasksModal.tsx` (isolated, reusable)
  - API endpoint: `POST /api/agent/suggest-gaps` (standard contract)
- [x] **Test-First Development**: ✅ COMPLIANT
  - TDD approach: Write tests for gap detection heuristics first
  - Contract tests for API endpoint before implementation
  - Integration tests for full flow (detect → generate → insert)
  - Manual test guide for UI interactions (if Vitest fails on modal state)
- [x] **Observable by Design**: ✅ COMPLIANT
  - Mastra telemetry captures tool execution traces
  - GapAnalysisSession entity logs: gaps detected, tasks generated, user decisions
  - Performance metrics: detection time, generation time, confidence scores
  - Error logging: AI failures, validation errors, circular dependency detection
- [x] **Vertical Slice Architecture**: ✅ COMPLIANT
  - User can: SEE "Find Missing Tasks" button → DO click it → VERIFY modal shows suggestions
  - Complete slice: Button → API endpoint → Mastra tool → Modal → Task insertion
  - No backend-only or frontend-only tasks

**Gate Result**: PASS WITH JUSTIFICATION (Autonomous violation justified for user approval requirement)

## Project Structure

### Documentation (this feature)
```
specs/011-task-gap-filling/
├── plan.md              # This file (/plan command output)
├── spec.md              # Feature specification (existing)
├── research.md          # Phase 0 output (gap detection strategies)
├── data-model.md        # Phase 1 output (Gap, BridgingTask entities)
├── quickstart.md        # Phase 1 output (E2E test scenarios)
└── contracts/           # Phase 1 output (API contracts)
    └── suggest-gaps-api.yaml
```

### Source Code (repository root)
```
app/
├── api/
│   └── agent/
│       └── suggest-gaps/
│           └── route.ts              # NEW: POST endpoint for gap detection/generation
├── components/
│   ├── SuggestedTasksModal.tsx       # NEW: Modal for reviewing bridging tasks
│   └── __tests__/
│       └── SuggestedTasksModal.test.tsx  # NEW: Component tests
└── priorities/
    └── page.tsx                      # MODIFIED: Add "Find Missing Tasks" button

lib/
├── mastra/
│   ├── tools/
│   │   └── suggestBridgingTasks.ts   # NEW: Mastra tool for task generation
│   └── agents/
│       └── taskOrchestrator.ts       # MODIFIED: Add gap detection logic
├── services/
│   ├── gapDetection.ts               # NEW: Gap detection heuristics (pure functions)
│   ├── taskInsertion.ts              # NEW: Insert tasks with dependency validation
│   └── __tests__/
│       ├── gapDetection.test.ts      # NEW: Unit tests for heuristics
│       └── taskInsertion.test.ts     # NEW: Dependency validation tests
└── schemas/
    └── gapAnalysis.ts                # NEW: Zod schemas for Gap, BridgingTask, etc.

__tests__/
├── contract/
│   └── suggest-gaps.test.ts          # NEW: API contract tests
└── integration/
    └── gap-filling-flow.test.ts      # NEW: E2E flow test

components/ui/
└── (existing shadcn components)       # Dialog, Checkbox, Button, Badge
```

**Structure Decision**: Next.js web application with App Router. Frontend in `app/`, backend services in `lib/`, shared UI in `components/ui/`. Mastra tools extend existing agent infrastructure in `lib/mastra/`. Tests colocated with source (`__tests__` subdirectories) for unit tests, centralized `__tests__/` for contract/integration.

## Phase 0: Outline & Research

**No NEEDS CLARIFICATION in Technical Context** - All tech stack decisions clear from existing codebase.

**Research Tasks:**
1. **Gap Detection Strategies**: Research heuristics for detecting task sequence gaps
   - Industry patterns: PERT analysis, critical path gaps, skill transition points
   - Academic: Task dependency inference, workflow mining
2. **AI Prompt Engineering**: Best practices for generating intermediate tasks
   - Context window optimization (fit predecessor/successor + doc context in 8K tokens)
   - Temperature tuning (0.3 vs 0.5 for consistency vs creativity)
   - Few-shot examples from semantic search results
3. **Dependency Validation**: Algorithms for detecting cycles in task DAGs
   - Topological sort for cycle detection (Kahn's algorithm)
   - Insertion point calculation for maintaining sequence integrity
4. **Mastra Tool Patterns**: Review existing tools for consistency
   - Input/output schema conventions
   - Error handling patterns
   - Telemetry best practices

**Output**: `research.md` with consolidated findings

---

## Phase 1: Design & Contracts

### 1. Extract entities from feature spec → `data-model.md`

**Entities:**

**Gap** (detected discontinuity):
- `predecessor_id`: string (task ID before gap)
- `successor_id`: string (task ID after gap)
- `gap_type`: enum ['time', 'action_type', 'skill', 'dependency']
- `confidence`: number (0-1, composite of indicator strengths)
- `indicators`: object
  - `time_gap`: boolean (>1 week estimated between tasks)
  - `action_type_jump`: boolean (skips 2+ phases: research→design→build→test→deploy)
  - `no_dependency`: boolean (successor doesn't depend on predecessor)
  - `skill_jump`: boolean (different skill domains: strategy/design/frontend/backend/qa)
- State transitions: detected → analyzed → filled → dismissed

**BridgingTask** (AI-generated task):
- `text`: string (task description, 10-200 chars)
- `estimated_hours`: number (8-160, represents 1-4 weeks)
- `required_cognition`: enum ['low', 'medium', 'high']
- `confidence`: number (0-1)
- `reasoning`: string (AI explanation for why this task bridges the gap)
- `source`: 'ai_generated' (constant)
- `generated_from`: object { predecessor_id, successor_id }
- `requires_review`: true (constant, user must approve)
- `similarity_score`: number (max similarity to existing tasks, for deduplication)
- State transitions: generated → reviewed → accepted/rejected → inserted (if accepted)

**TaskSuggestion** (UI model, transient):
- `id`: string (UUID for React keys)
- `task_text`: string (editable)
- `estimated_hours`: number (editable, 8-160)
- `cognition_level`: enum ['low', 'medium', 'high']
- `confidence_percentage`: number (0-100, display only)
- `checked`: boolean (acceptance state)
- `edit_mode`: boolean (inline editing active)

**GapAnalysisSession** (audit trail):
- `session_id`: string (UUID, FK to agent_sessions table)
- `trigger_timestamp`: timestamp
- `plan_snapshot`: JSONB (task IDs and texts at analysis time)
- `detected_gaps`: JSONB array of Gap objects
- `generated_tasks`: JSONB array of BridgingTask objects
- `user_acceptances`: JSONB array { task_id, accepted: boolean, edited: boolean }
- `insertion_result`: JSONB { success: boolean, inserted_ids: string[], error?: string }
- `performance_metrics`: JSONB { detection_ms, generation_ms, total_ms }

**Validation Rules:**
- Gap confidence must be ≥0.75 to surface to user (derived from 3+ indicators)
- BridgingTask estimated_hours: 8-160 (1 day to 4 weeks)
- Max 3 BridgingTasks per Gap (FR-025)
- Similarity threshold: Reject if >0.9 similarity to existing task (FR-007)

### 2. Generate API contracts → `/contracts/`

**Endpoint**: `POST /api/agent/suggest-gaps`

**Request**:
```yaml
/api/agent/suggest-gaps:
  post:
    summary: Detect gaps and generate bridging task suggestions
    requestBody:
      required: true
      content:
        application/json:
          schema:
            type: object
            properties:
              session_id:
                type: string
                format: uuid
                description: Agent session ID from latest prioritization
            required:
              - session_id
    responses:
      '200':
        description: Suggestions generated successfully
        content:
          application/json:
            schema:
              type: object
              properties:
                gaps:
                  type: array
                  items:
                    $ref: '#/components/schemas/Gap'
                suggestions:
                  type: array
                  items:
                    $ref: '#/components/schemas/TaskSuggestion'
                analysis_session_id:
                  type: string
                  format: uuid
              required:
                - gaps
                - suggestions
                - analysis_session_id
      '400':
        description: Invalid session ID or no active outcome
        content:
          application/json:
            schema:
              type: object
              properties:
                error:
                  type: string
                  example: "No active outcome found"
      '404':
        description: Session not found
      '500':
        description: AI generation failure or server error
```

**Components Schema** (OpenAPI):
```yaml
components:
  schemas:
    Gap:
      type: object
      properties:
        predecessor_id:
          type: string
        successor_id:
          type: string
        gap_type:
          type: string
          enum: [time, action_type, skill, dependency]
        confidence:
          type: number
          minimum: 0
          maximum: 1
        indicators:
          type: object
          properties:
            time_gap:
              type: boolean
            action_type_jump:
              type: boolean
            no_dependency:
              type: boolean
            skill_jump:
              type: boolean
      required:
        - predecessor_id
        - successor_id
        - gap_type
        - confidence
        - indicators

    TaskSuggestion:
      type: object
      properties:
        id:
          type: string
          format: uuid
        task_text:
          type: string
          minLength: 10
          maxLength: 200
        estimated_hours:
          type: number
          minimum: 8
          maximum: 160
        cognition_level:
          type: string
          enum: [low, medium, high]
        confidence_percentage:
          type: integer
          minimum: 0
          maximum: 100
        checked:
          type: boolean
          default: true
        gap_context:
          type: object
          properties:
            predecessor_id:
              type: string
            successor_id:
              type: string
      required:
        - id
        - task_text
        - estimated_hours
        - cognition_level
        - confidence_percentage
        - checked
        - gap_context
```

**Endpoint**: `POST /api/agent/accept-suggestions` (for task insertion)

```yaml
/api/agent/accept-suggestions:
  post:
    summary: Insert accepted bridging tasks into plan
    requestBody:
      required: true
      content:
        application/json:
          schema:
            type: object
            properties:
              analysis_session_id:
                type: string
                format: uuid
              accepted_task_ids:
                type: array
                items:
                  type: string
                  format: uuid
              edited_tasks:
                type: array
                items:
                  type: object
                  properties:
                    id:
                      type: string
                      format: uuid
                    task_text:
                      type: string
                    estimated_hours:
                      type: number
            required:
              - analysis_session_id
              - accepted_task_ids
    responses:
      '200':
        description: Tasks inserted successfully
        content:
          application/json:
            schema:
              type: object
              properties:
                inserted_task_ids:
                  type: array
                  items:
                    type: string
                success:
                  type: boolean
                updated_plan:
                  type: object
                  description: Refreshed task plan with new tasks
      '400':
        description: Validation error (circular dependency detected)
        content:
          application/json:
            schema:
              type: object
              properties:
                error:
                  type: string
                  example: "Cannot insert tasks - would create circular dependency"
      '500':
        description: Insertion failure
```

### 3. Generate contract tests

**Test Files**:
- `__tests__/contract/suggest-gaps.test.ts`: Assert request/response schemas match OpenAPI
- `__tests__/contract/accept-suggestions.test.ts`: Assert task insertion contract

**Example Test** (`suggest-gaps.test.ts`):
```typescript
describe('POST /api/agent/suggest-gaps', () => {
  it('returns gaps and suggestions with valid session_id', async () => {
    // Arrange: Create agent session with prioritized tasks
    const sessionId = await createMockAgentSession();

    // Act
    const response = await fetch('/api/agent/suggest-gaps', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId }),
    });

    // Assert
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('gaps');
    expect(data).toHaveProperty('suggestions');
    expect(data).toHaveProperty('analysis_session_id');
    expect(Array.isArray(data.gaps)).toBe(true);
    expect(Array.isArray(data.suggestions)).toBe(true);

    // Schema validation
    if (data.gaps.length > 0) {
      const gap = data.gaps[0];
      expect(gap).toMatchObject({
        predecessor_id: expect.any(String),
        successor_id: expect.any(String),
        gap_type: expect.stringMatching(/^(time|action_type|skill|dependency)$/),
        confidence: expect.any(Number),
        indicators: expect.objectContaining({
          time_gap: expect.any(Boolean),
          action_type_jump: expect.any(Boolean),
          no_dependency: expect.any(Boolean),
          skill_jump: expect.any(Boolean),
        }),
      });
    }
  });

  it('returns 400 when session_id is missing', async () => {
    const response = await fetch('/api/agent/suggest-gaps', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    expect(response.status).toBe(400);
  });
});
```

**Tests must FAIL initially** (no implementation yet).

### 4. Extract test scenarios → `quickstart.md`

**Quickstart Test Scenarios** (manual execution guide):

**Scenario 1: Detect and fill implementation gap**
1. Prerequisites:
   - AI Note Synthesiser running at localhost:3000
   - User logged in with active outcome
   - At least one document processed with prioritized tasks
2. Setup test data:
   - Create mock plan with tasks: #1 "Define goals", #2 "Design mockups", #5 "Launch app"
   - Ensure gap: 3 weeks estimated between #2 and #5
3. Execute:
   - Navigate to `/priorities`
   - Observe task list shows #1, #2, #5 in sequence
   - Click "Find Missing Tasks" button
4. Verify:
   - Modal appears with title "💡 X Tasks Suggested to Fill Gaps"
   - Gap context shown: "#2: Design mockups → #5: Launch app"
   - 2-3 suggestions displayed with confidence scores (≥70%)
   - All suggestions pre-checked by default
   - Each suggestion shows: task text, estimated hours, cognition level, confidence %

**Scenario 2: Review and accept suggestions**
1. Prerequisites: Scenario 1 completed, modal open
2. Execute:
   - Uncheck lowest confidence suggestion (if <75%)
   - Click "Accept Selected (N)" button
3. Verify:
   - Modal closes
   - Task list refreshes
   - New tasks inserted between #2 and #5 (now #3, #4)
   - Dependencies updated: #3 depends on #2, #4 depends on #3, #5 depends on #4
   - New tasks marked with "AI Generated" badge

**Scenario 3: Edit suggestion before accepting**
1. Prerequisites: Modal open with suggestions
2. Execute:
   - Click [Edit] button on first suggestion
   - Modify task text: "Build MVP frontend with core screens only"
   - Reduce estimated hours from 120 to 80
   - Click "Accept Selected"
3. Verify:
   - Edited values saved
   - Task inserted with modified text and hours
   - Original AI confidence score preserved (metadata)

**Scenario 4: No gaps detected**
1. Prerequisites: Complete plan with no gaps (all intermediate steps present)
2. Execute:
   - Click "Find Missing Tasks"
3. Verify:
   - Message appears: "No gaps detected. Your plan appears complete."
   - No modal shown
   - Button remains enabled for future use

**Scenario 5: AI generation failure**
1. Prerequisites: Mock OpenAI API to return error
2. Execute:
   - Click "Find Missing Tasks"
3. Verify:
   - Error message: "Unable to generate suggestions. Please try again."
   - Retry button available
   - Original plan unchanged

### 5. Update CLAUDE.md (incrementally)

Run the update script:
```bash
.specify/scripts/bash/update-agent-context.sh claude
```

**Expected Updates** (script will add these automatically):
- New API endpoints: `/api/agent/suggest-gaps`, `/api/agent/accept-suggestions`
- New Mastra tool: `suggest-bridging-tasks`
- New components: `SuggestedTasksModal.tsx`
- New services: `gapDetection.ts`, `taskInsertion.ts`
- Recent changes: Add Task Gap Filling feature (FR-001 through FR-028)

**Output**: Updated `CLAUDE.md` in repository root (max 150 lines added).

---

## Phase 2: Task Planning Approach
*This section describes what the /tasks command will do - DO NOT execute during /plan*

**Task Generation Strategy**:

**Vertical Slice Principle**: Every task must deliver complete user value (SEE + DO + VERIFY).

**Slice 1: Gap Detection UI (P0 - Foundation)**
- SEE: "Find Missing Tasks" button in priorities view
- DO: Click button, trigger API call
- VERIFY: Loading state, then modal or "no gaps" message
- Files: `app/priorities/page.tsx`, `app/api/agent/suggest-gaps/route.ts` (stub), `SuggestedTasksModal.tsx` (empty state)

**Slice 2: Gap Detection Logic (P0 - Core)**
- SEE: Modal displays detected gaps with context (predecessor/successor)
- DO: System analyzes task sequence using 4 heuristics
- VERIFY: Gaps shown with confidence scores, types (time/action/skill)
- Files: `lib/services/gapDetection.ts`, `lib/mastra/agents/taskOrchestrator.ts` (add detectGaps function)

**Slice 3: Task Generation with AI (P0 - Core)**
- SEE: Modal displays 1-3 bridging task suggestions per gap
- DO: Mastra tool generates tasks using context + semantic search
- VERIFY: Suggestions show text, hours, cognition, confidence (≥70%)
- Files: `lib/mastra/tools/suggestBridgingTasks.ts`, update API route

**Slice 4: Review & Edit Interface (P0 - UX)**
- SEE: Modal with checkboxes, edit buttons, confidence badges
- DO: Uncheck suggestions, edit text/hours inline
- VERIFY: UI updates immediately, edited values preserved
- Files: Complete `SuggestedTasksModal.tsx` implementation

**Slice 5: Task Insertion & Validation (P0 - Critical)**
- SEE: Accepted tasks appear in plan with correct IDs and dependencies
- DO: Insert tasks, validate for cycles, update dependencies
- VERIFY: Plan refreshes, no errors, "AI Generated" badges visible
- Files: `lib/services/taskInsertion.ts`, `app/api/agent/accept-suggestions/route.ts`

**Slice 6: Error Handling & Edge Cases (P1 - Polish)**
- SEE: Friendly error messages for AI failures, cycle detection, no gaps
- DO: Graceful degradation, retry capability
- VERIFY: User can continue using system after errors
- Files: Error boundaries, toast notifications

**Ordering Strategy**:
1. TDD order: Write gap detection tests → implement heuristics
2. Tool development: Mastra tool tests → implementation
3. UI components: Modal component tests → implementation
4. API endpoints: Contract tests → route handlers
5. Integration: E2E test → connect all pieces

**Parallelization**:
- [P] Gap detection logic + Mastra tool (independent modules)
- [P] Modal UI + API routes (can develop with mocks)
- Sequential: Must complete Slices 1-3 before 4-5 (dependencies)

**Estimated Output**: 18-22 vertical slice tasks in tasks.md

---

## Phase 3+: Future Implementation
*These phases are beyond the scope of the /plan command*

**Phase 3**: Task execution - `/tasks` command creates tasks.md with vertical slices
**Phase 4**: Implementation - Execute tasks using slice-orchestrator agent, following TDD
**Phase 5**: Validation - Run quickstart scenarios, verify all FRs, measure performance

---

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| **Autonomous by Default** (Manual button click required) | User must approve AI-generated tasks before insertion (FR-014). Automatic insertion risks corrupting user's carefully crafted plans. | Auto-insertion rejected: Violates user agency. Could insert incorrect tasks that mislead user. High-stakes domain (task planning) requires explicit consent. |

**Justification**: The "Find Missing Tasks" feature enhances user autonomy by surfacing blind spots, but final decision remains with user. Button click is a minor friction point for major safety gain.

---

## Progress Tracking

**Phase Status**:
- [x] Phase 0: Research complete (/plan command)
- [x] Phase 1: Design complete (/plan command)
- [x] Phase 2: Task planning complete (/plan command - describe approach only)
- [ ] Phase 3: Tasks generated (/tasks command)
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: Validation passed

**Gate Status**:
- [x] Initial Constitution Check: PASS WITH JUSTIFICATION
- [x] Post-Design Constitution Check: PASS
- [x] All NEEDS CLARIFICATION resolved (none existed)
- [x] Complexity deviations documented (1 violation justified)

---
*Based on Constitution v1.1.7 - See `.specify/memory/constitution.md`*
