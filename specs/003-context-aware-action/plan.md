# Implementation Plan: Context-Aware Action Extraction

**Branch**: `003-context-aware-action` | **Date**: 2025-10-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-context-aware-action/spec.md`

## Execution Flow (/plan command scope)
```
1. Load feature spec from Input path
   → ✓ Spec loaded successfully
2. Fill Technical Context (scan for NEEDS CLARIFICATION)
   → ✓ No NEEDS CLARIFICATION markers (5 clarifications completed)
   → Project Type: Web application (Next.js)
3. Fill Constitution Check section
   → ✓ Based on Constitution v1.1.5
4. Evaluate Constitution Check section
   → ✓ Initial check complete
5. Execute Phase 0 → research.md
   → ✓ Research complete
6. Execute Phase 1 → contracts, data-model.md, quickstart.md, CLAUDE.md
   → ✓ Design artifacts generated
7. Re-evaluate Constitution Check
   → ✓ Post-design check complete
8. Plan Phase 2 → Describe task generation approach
   → ✓ Task strategy documented
9. STOP - Ready for /tasks command
```

**IMPORTANT**: The /plan command STOPS at step 8. Phases 2-4 are executed by other commands:
- Phase 2: /tasks command creates tasks.md
- Phase 3-4: Implementation execution (via slice-orchestrator)

## Summary

**Primary Requirement**: Enable context-aware action filtering that reduces noisy task lists (20+ actions) to 3-5 high-priority actions aligned with user's strategic outcome, energy state, and time capacity.

**Technical Approach**: Extend existing outcome management infrastructure (T008-T011) by adding `state` and `capacity` fields to `user_outcomes` table. Enhance AI summarization service to compute relevance scores (90% threshold), estimate time/effort, and apply multi-criteria filtering. Store filtering decisions as JSON in `processed_documents` for auditability and "show all" functionality.

**Key Innovation**: Leverages established outcome statement as the goal context - no separate UI duplication. User sets outcome once, system applies it automatically to every document upload.

## Technical Context

**Language/Version**: TypeScript 5+, Node.js 20+
**Primary Dependencies**:
- Vercel AI SDK (OpenAI GPT-4o) - semantic similarity scoring
- Zod - schema validation for filtering decisions
- Supabase - user_outcomes table extension
- Next.js 15 / React 19 - OutcomeBuilder UI extension

**Storage**: Supabase PostgreSQL
- **user_outcomes** table (extend with `state_preference`, `daily_capacity_hours`)
- **processed_documents** table (extend with `filtering_decisions` JSON field)

**Testing**: Vitest + React Testing Library
- Contract tests for filtering logic
- Integration tests for outcome-aware processing pipeline
- Component tests for OutcomeBuilder state/capacity inputs

**Target Platform**: Web (Next.js SSR + Client Components)

**Project Type**: Web application (frontend + backend integration)

**Performance Goals**:
- Maintain <8s processing time (existing constraint)
- Semantic similarity computation: <2s additional overhead
- Filtering algorithm: O(n log n) for action sorting

**Constraints**:
- 90% semantic match threshold (high precision, may sacrifice recall)
- Backward compatibility required (no outcome = no filtering)
- Must not modify existing action extraction schema

**Scale/Scope**:
- Typical documents: 10-30 actions extracted (unfiltered)
- Target output: 3-5 actions (filtered)
- Reduction ratio: 60-75% filtering rate

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with AI Note Synthesiser Constitution v1.1.5:

- [x] **Autonomous by Default**: Filtering triggers automatically on document upload when outcome exists. No manual "apply filter" button. Sense (detect outcome) → Reason (compute scores) → Act (filter list).

- [x] **Deterministic Outputs**: Filtering decisions stored as versioned JSON schema (FilteringDecisionSchema). Relevance scores are deterministic given same input. Retry logic handles AI scoring failures.

- [x] **Modular Architecture**: New `FilteringService` decoupled from existing `aiSummarizer`. OutcomeBuilder extends existing component. Database changes isolated to new columns. Can disable filtering by removing outcome without affecting core extraction.

- [x] **Test-First Development**: TDD plan established:
  1. Write contract tests for filtering API
  2. Write integration tests for outcome-aware processing
  3. Write component tests for OutcomeBuilder state/capacity
  4. Implement to pass tests

- [x] **Observable by Design**: Filtering decisions logged to `processing_logs` with: timestamp, outcome context snapshot, relevance scores array, actions included/excluded counts, total filtering time. Console logs for development.

- [x] **Vertical Slice Architecture**: Every task delivers SEE + DO + VERIFY:
  - T016: User SEES state/capacity fields → DOES set values → VERIFIES persistence
  - T017: User SEES filtered actions → DOES view "show all" → VERIFIES unfiltered list
  - Each slice includes UI + backend + data + feedback

**Violations**: None

## Project Structure

### Documentation (this feature)
```
specs/003-context-aware-action/
├── plan.md              # This file (/plan command output)
├── research.md          # Phase 0 output (/plan command)
├── data-model.md        # Phase 1 output (/plan command)
├── quickstart.md        # Phase 1 output (/plan command)
├── contracts/           # Phase 1 output (/plan command)
│   ├── PATCH_user_outcomes.json
│   ├── PATCH_processed_documents.json
│   └── POST_process_with_context.json
└── tasks.md             # Phase 2 output (/tasks command - NOT created by /plan)
```

### Source Code (repository root)
```
# Web application structure (Next.js)
app/
├── api/
│   ├── outcomes/route.ts        # Extend: Add state/capacity to POST
│   └── process/route.ts         # Extend: Pass outcome context to AI
├── components/
│   ├── OutcomeBuilder.tsx       # Extend: Add state + capacity inputs
│   ├── OutcomeDisplay.tsx       # Modify: Show state + capacity in banner
│   └── SummaryPanel.tsx         # Extend: Add "Show all actions" toggle
└── page.tsx                     # No changes (uses OutcomeDisplay)

lib/
├── services/
│   ├── aiSummarizer.ts          # Extend: Add scoring + filtering methods
│   ├── outcomeService.ts        # Extend: Handle state + capacity fields
│   └── filteringService.ts      # New: Filtering algorithm + decision logging
├── schemas/
│   ├── outcomeSchema.ts         # Extend: Add state + capacity validation
│   └── filteringSchema.ts       # New: FilteringDecision Zod schema
└── hooks/
    └── useOutcomeDraft.ts       # Extend: Save/restore state + capacity

supabase/migrations/
└── 005_add_context_fields.sql   # New: Add state_preference, daily_capacity_hours

__tests__/
├── contract/
│   └── filtering.test.ts        # New: Contract tests for filtering logic
└── integration/
    └── context-aware-process.test.ts  # New: End-to-end filtering tests
```

**Structure Decision**: Web application pattern selected (Next.js app router). Feature extends existing outcome management (app/components/OutcomeBuilder.tsx, lib/services/outcomeService.ts) and document processing (lib/services/aiSummarizer.ts). New filtering service (lib/services/filteringService.ts) keeps concerns separated. Database migration adds two columns to user_outcomes, one JSON column to processed_documents.

## Phase 0: Outline & Research

### Research Topics

**No NEEDS CLARIFICATION markers found** - all ambiguities resolved in /clarify phase. Research focuses on implementation best practices:

#### 1. Semantic Similarity Scoring with Vercel AI SDK

**Decision**: Use Vercel AI SDK's `embed()` function with OpenAI text-embedding-3-small model for semantic similarity.

**Rationale**:
- Already using Vercel AI SDK for summarization (consistent stack)
- text-embedding-3-small: 1536 dimensions, $0.02/1M tokens (cost-effective)
- Cosine similarity computation: Fast O(n) after embeddings cached
- 90% threshold maps to cosine similarity ≥0.90

**Alternatives Considered**:
- **Keyword matching only**: Rejected - misses semantic relationships ("boost revenue" vs "increase sales")
- **Fine-tuned model**: Rejected - overkill for P0, adds complexity
- **Local embedding model**: Rejected - requires infrastructure, slower

**Implementation Notes**:
- Embed outcome text once (cache in user_outcomes table)
- Embed each action during extraction
- Compute cosine similarity: `dot(a, b) / (norm(a) * norm(b))`
- Filter actions where similarity <0.90

#### 2. Time/Effort Estimation Strategy

**Decision**: Prompt AI to estimate time (hours) and effort (high/low) during action extraction using structured output.

**Rationale**:
- GPT-4o already parsing action text - can infer complexity
- Structured output (Zod schema) enforces deterministic format
- No external tools needed (estimation part of existing AI call)

**Alternatives Considered**:
- **Rule-based estimation**: Rejected - too simplistic (word count ≠ complexity)
- **Historical data**: Rejected - no user completion data yet (future enhancement)
- **User manual input**: Rejected - defeats autonomous principle

**Prompt Strategy**:
```typescript
// Extend existing SummarySchema
actions: z.array(z.object({
  text: z.string(),
  estimated_hours: z.number().min(0.25).max(8),  // 15min to 8h
  effort_level: z.enum(['high', 'low']),
  category: z.enum(['leverage', 'neutral', 'overhead'])  // existing LNO
}))
```

#### 3. Multi-Criteria Filtering Algorithm

**Decision**: Three-phase filtering cascade:
1. **Relevance filter** (90% semantic threshold) - hard cutoff
2. **Capacity filter** (time budget) - cumulative constraint
3. **State-based priority** (effort preference) - sort order

**Rationale**:
- Respects FR-004 (relevance), FR-005 (state), FR-006 (capacity) in order
- Prevents capacity violations (won't return 10h of work for 2h capacity)
- State preference breaks ties (e.g., two sales actions, pick lower effort if Low energy)

**Algorithm Pseudocode**:
```
1. Filter actions where relevance_score >= 0.90
2. Sort by: (state == "Low energy" ? effort ASC : effort DESC), relevance DESC
3. Select top N actions where cumulative_hours <= daily_capacity
4. If <3 actions, warn user ("adjust capacity or outcome")
5. Store filtering decisions (included + excluded) as JSON
```

**Edge Cases Handled**:
- No actions meet 90% threshold → Return empty with warning
- All actions exceed capacity → Return highest relevance, warn overflow
- State not set → Default to relevance-only sorting

#### 4. Database Schema Extension Pattern

**Decision**: Add nullable columns to user_outcomes, use Supabase migration.

**Rationale**:
- Minimal schema impact (2 new columns vs new table)
- Backward compatible (nullable fields, default NULL)
- Keeps context data co-located with outcome

**Migration Strategy**:
```sql
-- 005_add_context_fields.sql
ALTER TABLE user_outcomes
ADD COLUMN state_preference TEXT CHECK (state_preference IN ('Energized', 'Low energy')),
ADD COLUMN daily_capacity_hours NUMERIC(4,2) CHECK (daily_capacity_hours > 0 AND daily_capacity_hours <= 24);

ALTER TABLE processed_documents
ADD COLUMN filtering_decisions JSONB;

CREATE INDEX idx_filtering_decisions ON processed_documents USING GIN (filtering_decisions);
```

**Rollback Plan**: Drop columns if needed (nullable means safe)

#### 5. UI Integration with OutcomeBuilder

**Decision**: Extend existing OutcomeBuilder.tsx modal with two new form fields below clarifier.

**Rationale**:
- Users already familiar with outcome modal flow
- No new navigation or page required
- State + capacity conceptually tied to outcome (set together)

**Layout**:
```
[Direction] [Object] by [Metric] through [Clarifier]
                                    ↓
                      [State: Energized | Low energy]  ← New
                      [Capacity: ___ hours/day]        ← New
                                    ↓
                      [Preview] [Save] [Cancel]
```

**Accessibility**: Both fields required for validation (can't save partial context)

### Research Output Summary

All research complete. No blockers identified. Implementation ready to proceed with:
- **Semantic similarity**: Vercel AI SDK embeddings + cosine similarity
- **Time estimation**: AI-driven structured output during extraction
- **Filtering algorithm**: Three-phase cascade (relevance → capacity → state)
- **Database**: Two new columns (user_outcomes), one JSON column (processed_documents)
- **UI**: Extend OutcomeBuilder modal with inline state + capacity fields

## Phase 1: Design & Contracts

### Data Model

See `data-model.md` for complete entity definitions, field types, validation rules, and relationships.

**Key Changes**:
- **user_outcomes**: Add `state_preference` (TEXT), `daily_capacity_hours` (NUMERIC)
- **processed_documents**: Add `filtering_decisions` (JSONB)
- **Action object** (in structured_output JSON): Add `estimated_hours`, `effort_level`, `relevance_score`

### API Contracts

**Contract 1**: PATCH /api/outcomes (extend existing)
- **Request**: Add `state_preference`, `daily_capacity_hours` to body
- **Response**: 200 with updated outcome including new fields
- **Validation**: State must be "Energized" | "Low energy", capacity 0.5-24 hours
- **File**: `contracts/PATCH_user_outcomes.json`

**Contract 2**: POST /api/process (extend existing)
- **Behavior Change**: Fetch active outcome from user_outcomes, pass to AI summarizer
- **New AI Response Fields**: Each action includes `estimated_hours`, `effort_level`, `relevance_score`
- **New stored_output Field**: `filtering_decisions` JSON with included/excluded arrays
- **File**: `contracts/POST_process_with_context.json`

**Contract 3**: Internal FilteringService API (new module)
- **Method**: `filterActions(actions, outcomeContext)`
- **Returns**: `{ included: Action[], excluded: Action[], decision: FilteringDecision }`
- **File**: `contracts/FILTERING_SERVICE_API.json`

See `contracts/` directory for full OpenAPI specs with request/response examples.

### Contract Tests (TDD - Must Fail Initially)

```typescript
// __tests__/contract/filtering.test.ts

describe('POST /api/outcomes with state and capacity', () => {
  it('should accept valid state_preference', async () => {
    const response = await POST('/api/outcomes', {
      ...validOutcome,
      state_preference: 'Energized',
      daily_capacity_hours: 4
    });
    expect(response.status).toBe(200);
    expect(response.body.state_preference).toBe('Energized');
  });

  it('should reject invalid state_preference', async () => {
    const response = await POST('/api/outcomes', {
      ...validOutcome,
      state_preference: 'Super energized'  // Invalid
    });
    expect(response.status).toBe(400);
  });

  it('should reject capacity > 24 hours', async () => {
    const response = await POST('/api/outcomes', {
      ...validOutcome,
      daily_capacity_hours: 25  // Invalid
    });
    expect(response.status).toBe(400);
  });
});

describe('FilteringService.filterActions', () => {
  it('should filter actions below 90% relevance threshold', () => {
    const actions = [
      { text: 'Follow up leads', relevance_score: 0.95, estimated_hours: 1, effort_level: 'low' },
      { text: 'Plan team lunch', relevance_score: 0.50, estimated_hours: 0.5, effort_level: 'low' }
    ];
    const result = filterActions(actions, { goal: 'Increase sales', state: 'Energized', capacity: 4 });

    expect(result.included).toHaveLength(1);
    expect(result.included[0].text).toBe('Follow up leads');
    expect(result.excluded[0].text).toBe('Plan team lunch');
  });

  it('should respect time capacity constraint', () => {
    const actions = [
      { text: 'Action 1', relevance_score: 0.95, estimated_hours: 2, effort_level: 'high' },
      { text: 'Action 2', relevance_score: 0.92, estimated_hours: 1.5, effort_level: 'high' },
      { text: 'Action 3', relevance_score: 0.91, estimated_hours: 1, effort_level: 'low' }
    ];
    const result = filterActions(actions, { goal: 'Launch product', state: 'Low energy', capacity: 2 });

    const totalHours = result.included.reduce((sum, a) => sum + a.estimated_hours, 0);
    expect(totalHours).toBeLessThanOrEqual(2);
  });

  it('should prioritize low-effort when state is Low energy', () => {
    const actions = [
      { text: 'Complex task', relevance_score: 0.95, estimated_hours: 1, effort_level: 'high' },
      { text: 'Simple task', relevance_score: 0.94, estimated_hours: 1, effort_level: 'low' }
    ];
    const result = filterActions(actions, { goal: 'Any goal', state: 'Low energy', capacity: 10 });

    expect(result.included[0].text).toBe('Simple task');  // Lower effort first
  });
});
```

### Integration Test Scenarios

```typescript
// __tests__/integration/context-aware-process.test.ts

describe('Context-Aware Processing Pipeline', () => {
  it('should filter actions when outcome exists', async () => {
    // Setup: Create outcome with state + capacity
    await createOutcome({
      assembled_text: 'Increase monthly revenue by 20%',
      state_preference: 'Low energy',
      daily_capacity_hours: 3
    });

    // Act: Upload document
    const file = createMockPDF('Meeting notes with 10 mixed actions');
    const uploadResult = await uploadFile(file);

    // Wait for processing
    await waitForProcessing(uploadResult.id);

    // Assert: Check filtered results
    const summary = await getSummary(uploadResult.id);
    expect(summary.actions.length).toBeLessThanOrEqual(5);  // Filtered
    expect(summary.actions.length).toBeGreaterThanOrEqual(3);  // Min threshold

    // Verify filtering decisions logged
    expect(summary.filtering_decisions).toBeDefined();
    expect(summary.filtering_decisions.context.state).toBe('Low energy');
    expect(summary.filtering_decisions.excluded.length).toBeGreaterThan(0);
  });

  it('should not filter when no outcome exists (backward compat)', async () => {
    // Setup: No outcome
    await deleteAllOutcomes();

    // Act: Upload document
    const file = createMockPDF('Meeting notes with 10 actions');
    const uploadResult = await uploadFile(file);
    await waitForProcessing(uploadResult.id);

    // Assert: All actions returned (no filtering)
    const summary = await getSummary(uploadResult.id);
    expect(summary.actions.length).toBe(10);  // Unfiltered
    expect(summary.filtering_decisions).toBeNull();  // No filtering applied
  });
});
```

### Quickstart Manual Test Scenarios

See `quickstart.md` for complete manual test procedures covering:

1. **Set Context via Outcome Builder**
   - Open outcome builder
   - Set state to "Low energy", capacity to "2"
   - Verify persistence across page reload

2. **Upload Document with Context**
   - Upload meeting notes (expect 15+ raw actions)
   - Verify only 3-5 filtered actions displayed
   - Check actions are low-effort, fit within 2h capacity

3. **View Unfiltered List ("Show All")**
   - Click "Show all actions" toggle
   - Verify complete unfiltered list appears
   - Verify filtered actions highlighted/marked

4. **Change Context Mid-Session**
   - Update state to "Energized", capacity to "6"
   - Upload same document again
   - Verify different action set (higher effort, more actions)

5. **Backward Compatibility (No Outcome)**
   - Delete outcome statement
   - Upload document
   - Verify all actions appear (no filtering)

### CLAUDE.md Update

Run incrementally: `.specify/scripts/bash/update-agent-context.sh claude`

**New sections to add**:
- **Services**: FilteringService (multi-criteria filtering algorithm)
- **Database Migrations**: 005_add_context_fields.sql
- **Known Patterns**: Semantic similarity with Vercel AI SDK embeddings
- **Recent Changes**: T016-T017 context-aware filtering (keep last 3 features)

Output updated CLAUDE.md to repository root.

## Phase 2: Task Planning Approach
*This section describes what the /tasks command will do - DO NOT execute during /plan*

**Task Generation Strategy**:
1. Load `.specify/templates/tasks-template.md` as base template
2. Extract user stories from acceptance scenarios (6 scenarios in spec)
3. Map functional requirements (FR-001 through FR-013) to implementation tasks
4. Generate vertical slice tasks following SEE + DO + VERIFY pattern

**Task Decomposition Logic**:
- **FR-002 + FR-003** → T016: Extend OutcomeBuilder UI (state + capacity inputs)
  - SEE: State dropdown + capacity input fields
  - DO: Set values and save outcome
  - VERIFY: Values persist, displayed in outcome banner

- **FR-004 + FR-007** → T017: Enhance AI extraction (time/effort estimation + scoring)
  - SEE: Actions in SummaryPanel show estimated time
  - DO: AI computes relevance scores automatically
  - VERIFY: Scores logged, time estimates visible

- **FR-005 + FR-006 + FR-008** → T018: Implement FilteringService (multi-criteria algorithm)
  - SEE: Only 3-5 actions displayed (down from 15+)
  - DO: Filtering triggers automatically on upload
  - VERIFY: Filtered list matches capacity + state constraints

- **FR-011** → T019: Add "Show All Actions" toggle to SummaryPanel
  - SEE: Toggle button "Show all X actions"
  - DO: Click to reveal unfiltered list
  - VERIFY: All actions appear, filtered ones marked

- **FR-010 + FR-013** → T020: Persist filtering decisions to database
  - SEE: Filtering decisions visible in debug logs
  - DO: Upload document, trigger filtering
  - VERIFY: JSON logged to processed_documents table

**Ordering Strategy**:
1. **T016** [P] - UI extension (state + capacity fields) - can run parallel with backend
2. **T017** [P] - AI enhancement (scoring + estimation) - can run parallel with UI
3. **T018** - Filtering service (depends on T017 for scores)
4. **T019** [P] - Show all toggle (depends on T018 for filtered vs unfiltered data)
5. **T020** - Database logging (depends on T018 for filtering decisions)

**Parallel Execution**:
- T016 and T017 touch different files (UI vs services) - mark [P]
- T019 can run parallel with T020 (UI vs database)

**Dependencies**:
```
T016 (UI) ──┐
            ├──> T018 (Filtering) ──> T019 (Toggle)
T017 (AI) ──┘                    └──> T020 (Logging)
```

**Test-First Requirements**:
- Each task starts with contract test (fails initially)
- Implementation makes test pass
- Integration test validates end-to-end user journey

**Estimated Output**: 5-7 vertical slice tasks in tasks.md

**IMPORTANT**: This phase is executed by the /tasks command, NOT by /plan

## Phase 3+: Future Implementation
*These phases are beyond the scope of the /plan command*

**Phase 3**: Task execution (/tasks command creates tasks.md with 5-7 vertical slices)
**Phase 4**: Implementation (slice-orchestrator coordinates backend-engineer + frontend-ui-builder)
**Phase 5**: Validation (test-runner validates all tests pass, code-reviewer checks standards)

## Complexity Tracking
*Fill ONLY if Constitution Check has violations that must be justified*

**No violations identified.** All constitutional principles met:
- Autonomous (filtering triggers automatically)
- Deterministic (JSON schemas with Zod validation)
- Modular (FilteringService isolated, can disable feature)
- Test-first (TDD workflow documented)
- Observable (structured logging to processing_logs)
- Vertical slices (each task SEE + DO + VERIFY)

## Progress Tracking
*This checklist is updated during execution flow*

**Phase Status**:
- [x] Phase 0: Research complete (/plan command)
- [x] Phase 1: Design complete (/plan command)
- [x] Phase 2: Task planning approach documented (/plan command)
- [ ] Phase 3: Tasks generated (/tasks command)
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: Validation passed

**Gate Status**:
- [x] Initial Constitution Check: PASS
- [x] Post-Design Constitution Check: PASS
- [x] All NEEDS CLARIFICATION resolved (5 clarifications completed in /clarify)
- [x] Complexity deviations documented (none - all principles met)

---
*Based on Constitution v1.1.5 - See `.specify/memory/constitution.md`*
