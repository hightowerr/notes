# Tasks: Reflection Intelligence

**Input**: Design documents from `/specs/015-reflection-intelligence/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- **[SLICE]**: Complete vertical slice (UI + Backend + Data + Feedback)
- **[SETUP]**: Blocking setup work (rare, avoid if possible)
- **[POLISH]**: Enhancement to working feature

---

## Phase 1: Code Cleanup (Foundation)

**Purpose**: Remove technical debt blocking the intelligence layer. These tasks fix broken patterns and clear deprecated code before adding new features.

- [X] T001 [SLICE] [US4] **Delete deprecated reflectionBasedRanking.ts and verify no regressions**

  **User Story**: As a developer, I can remove deprecated code so the codebase is cleaner and uses the canonical utilities.

  **Scope**:
  - DELETE: `lib/services/reflectionBasedRanking.ts` (340 lines)
  - VERIFY: No imports reference this file (`grep -r "reflectionBasedRanking"`)
  - TEST: Run `pnpm test:run` to ensure no test failures

  **Visible Outcome**: Build passes, grep returns no matches, all tests green.

  **Test Scenario**: `pnpm build && grep -r "reflectionBasedRanking" . --include="*.ts" | wc -l` returns 0.

- [X] T002 [SLICE] [US4] **Remove duplicate utilities from priorities/page.tsx**

  **User Story**: As a developer, I can use canonical utilities from reflectionService.ts so there's no duplicate code.

  **Scope**:
  - MODIFY: `app/priorities/page.tsx` - Remove ~90 lines of duplicate functions:
    - Delete `calculateFallbackWeight()` (lines ~124-141)
    - Delete `formatFallbackRelativeTime()` (lines ~143-171)
    - Delete `normalizeReflection()` (lines ~173-230)
  - MODIFY: Import from `lib/services/reflectionService.ts`:
    - `import { calculateRecencyWeight, formatRelativeTime, enrichReflection } from '@/lib/services/reflectionService'`
  - TEST: Verify reflections display correctly on Priorities page

  **Visible Outcome**: Priorities page loads, reflections show correct relative times and weights.

  **Test Scenario**: Add a reflection, verify `relative_time` shows "just now" and `recency_weight` shows 1.0.

- [X] T003 [SLICE] [US4] **Fix duplicate "Add Context" buttons in ContextCard**

  **User Story**: As a user, I see only one "Add Context" button so the UI is not confusing.

  **Scope**:
  - MODIFY: `app/priorities/components/ContextCard.tsx`
    - Remove lines 271-274 (duplicate button in empty state)
    - Update empty state text to be more engaging:
      ```
      "Share what's blocking you or where to focus, and watch your priorities adjust"
      ```
  - VERIFY: Only one button visible in both states (with/without reflections)

  **Visible Outcome**: Exactly ONE "Add Current Context" button visible on Priorities page.

  **Test Scenario**: Navigate to /priorities, clear all reflections, verify single button. Add reflection, verify still single button in header.

**Checkpoint**: Technical debt cleared. Ready for intelligence layer.

---

## Phase 2: User Story 1 - Immediate Reflection Effect (Priority: P1)

**Goal**: When user adds a reflection, tasks immediately adjust with visible explanation.

**Independent Test**: Add reflection "Legal blocked outreach", verify outreach tasks demoted within 3 seconds.

### T004-T006: Intelligence Services

- [X] T004 [SLICE] [US1] **Create reflection intent schema and interpreter service**

  **User Story**: As a user, when I add a reflection, the system understands my intent (blocker vs focus vs energy signal).

  **Scope**:
  - CREATE: `lib/schemas/reflectionIntent.ts` - Zod schemas for ReflectionIntent
  - CREATE: `lib/services/reflectionInterpreter.ts`:
    - `interpretReflection(text: string): Promise<ReflectionIntent>`
    - GPT-4o-mini structured output call
    - Single retry with 1s delay on failure
    - Fallback to "information/context-only" if all fails
  - CREATE: `app/api/reflections/interpret/route.ts` - Preview endpoint
  - TEST: `__tests__/contract/reflection-interpret.test.ts`

  **Visible Outcome**: POST `/api/reflections/interpret` with text returns classified intent.

  **Test Scenario**:
  ```bash
  # Functional test
  curl -X POST /api/reflections/interpret -d '{"text":"Legal blocked outreach"}'
  # Returns: { "intent": { "type": "constraint", "subtype": "blocker", ... }, "latency_ms": <number> }

  # Performance assertion (FR-001: <200ms)
  # Response must include latency_ms field; value MUST be <200ms for 95th percentile
  ```

  **Contract Test Must Assert**:
  - Response includes `latency_ms` field
  - `latency_ms < 200` for simple reflection text
  - Test file: `__tests__/contract/reflection-interpret.test.ts`

- [X] T005 [SLICE] [US1] **Create reflection adjuster service for fast task effects**

  **User Story**: As a user, my tasks immediately adjust based on reflection intent without waiting for full re-prioritization.

  **Scope**:
  - CREATE: `lib/services/reflectionAdjuster.ts`:
    - `applyReflectionEffects(reflectionIds: string[], taskIds?: string[]): Promise<ReflectionEffect[]>`
    - Match reflection keywords to task text (semantic/keyword matching)
    - Apply effects: blocked, demoted, boosted, unchanged
    - Enforce minimum 5-task floor with warning
    - Update `task_embeddings.reflection_effects` column
  - CREATE: `app/api/reflections/adjust/route.ts` - Adjustment endpoint
  - TEST: `__tests__/integration/reflection-adjustment.test.ts`

  **Visible Outcome**: POST `/api/reflections/adjust` applies effects to tasks.

  **Test Scenario 1 (Happy Path)**:
  Create reflection "Focus on analytics", call adjust endpoint, verify analytics tasks have `effect: boosted`.

  **Test Scenario 2 (Zero Match - Edge Case from spec.md:L103)**:
  1. Create reflection "Focus on quantum computing" (no matching tasks exist)
  2. Call POST `/api/reflections/adjust` with reflection ID
  3. Response returns `{ effects: [], tasks_affected: 0, message: "No tasks matched this reflection" }`
  4. UI should display "0 tasks affected" with explanation

  **Contract Test Must Assert**:
  - Empty `effects` array when no tasks match
  - `tasks_affected: 0` in response
  - Graceful handling (no errors) for zero-match scenario

- [ ] T006 [SLICE] [US1] **Create reflection_intents table and verify via interpret endpoint**

  **User Story**: As a user, when I interpret a reflection, I can see the intent is persisted and retrievable.

  **Scope**:
  - CREATE: `supabase/migrations/027_add_reflection_intents.sql`
    - Copy from `specs/015-reflection-intelligence/contracts/database-migration.sql`
  - RUN: `supabase db push` or `supabase migration up`
  - MODIFY: `app/api/reflections/interpret/route.ts` (from T004):
    - After classification, INSERT intent into `reflection_intents` table
    - Return `{ intent, persisted: true }` in response
  - VERIFY: POST to interpret endpoint, then SELECT from table shows matching record

  **Visible Outcome**: Interpret endpoint returns `persisted: true` and database contains the intent.

  **Test Scenario**:
  1. POST `/api/reflections/interpret` with text "Legal blocked outreach"
  2. Response includes `{ intent: {...}, persisted: true }`
  3. Query `SELECT * FROM reflection_intents WHERE summary LIKE '%outreach%'` returns 1 row

### T007: Auto-Trigger Integration

- [X] T007 [SLICE] [US1] **Wire up auto-trigger: reflection add → interpret → adjust → UI update**

  **User Story**: As a user, when I add a reflection, my task list updates within 3 seconds with no manual action.

  **Scope**:
  - MODIFY: `app/api/reflections/route.ts` POST handler:
    - After `createReflection()`, call `interpretReflection(text)`
    - Store intent in `reflection_intents` table
    - Call `applyReflectionEffects([reflectionId])`
    - Return `{ reflection, intent, effects }` in response
  - MODIFY: `app/priorities/page.tsx`:
    - Update `onReflectionAdded()` to trigger UI refresh
    - Add loading state: "Applying your context..."
    - Update task list from returned effects
  - TEST: `__tests__/contract/reflection-auto-adjust.test.ts`

  **Visible Outcome**: Add reflection → see task positions change within 3 seconds.

  **Test Scenario**:
  1. Navigate to /priorities with tasks including "Email campaign"
  2. Add reflection "Legal blocked customer outreach"
  3. See "Email campaign" task demoted/blocked within 3 seconds
  4. No manual "Analyze" button click needed

**Checkpoint**: User Story 1 complete. Reflections immediately affect task priorities.

---

## Phase 3: User Story 2 - Fast Toggle Adjustment (Priority: P2)

**Goal**: Toggle reflection on/off adjusts tasks within 500ms using cached intent.

**Independent Test**: Toggle existing reflection off, verify tasks restore within 500ms.

- [X] T008 [SLICE] [US2] **Implement fast toggle path with cached intent lookup**

  **User Story**: As a user, when I toggle a reflection off, tasks restore to baseline within 500ms.

  **Scope**:
  - MODIFY: `app/api/reflections/[id]/route.ts` PATCH handler:
    - Read cached intent from `reflection_intents` table (no LLM call)
    - Call `reflectionAdjuster.toggleReflectionEffect(id, isActive)`
    - If toggling ON: re-apply effects
    - If toggling OFF: remove effects from affected tasks
    - Return `{ reflection, effects_applied, effects_removed, latency_ms }`
  - MODIFY: `lib/services/reflectionAdjuster.ts`:
    - Add `toggleReflectionEffect(reflectionId: string, isActive: boolean)`
    - Use cached intent - skip LLM entirely
  - VERIFY: Response time <500ms (check Network tab)

  **Visible Outcome**: Toggle switch changes task positions instantly.

  **Test Scenario**:
  1. Have active reflection affecting 3 tasks
  2. Toggle OFF → tasks restore positions within 500ms
  3. Toggle ON → tasks re-adjust within 500ms
  4. Check Network tab: PATCH request completes <500ms

**Checkpoint**: User Story 2 complete. Fast toggles work without LLM delay.

---

## Phase 4: User Story 3 - Reflection Attribution (Priority: P3)

**Goal**: Every moved task shows which reflection caused the change and why.

**Independent Test**: View task card, see "Blocked: Legal hold" badge with tooltip.

- [X] T009 [SLICE] [US3] **Create ReflectionAttributionBadge component**

  **User Story**: As a user, I can see which reflections affected each task with clear badges.

  **Scope**:
  - CREATE: `app/priorities/components/ReflectionAttributionBadge.tsx`:
    - Props: `{ effect: 'blocked' | 'demoted' | 'boosted', reason: string, reflectionId: string }`
    - Badge variants:
      - Blocked: Red badge with 🚫 "Blocked: {reason}"
      - Demoted: Amber badge with ⬇️ "Demoted: {reason}"
      - Boosted: Emerald badge with ⬆️ "Boosted: {reason}"
    - Tooltip: Shows full explanation on hover
    - Click: Highlights source reflection in ContextCard
  - EXPORT: Add to priorities/components barrel export

  **Visible Outcome**: Badge component renders with correct styling per effect type.

  **Test Scenario**: Render badge with `effect="blocked" reason="Legal hold"`, verify red styling and 🚫 icon.

- [X] T010 [SLICE] [US3] **Wire attribution badges into TaskRow component**

  **User Story**: As a user, I see attribution badges on tasks affected by my reflections.

  **Scope**:
  - MODIFY: `app/priorities/components/TaskRow.tsx`:
    - Add prop: `reflectionEffects?: ReflectionEffect[]`
    - Render `<ReflectionAttributionBadge>` for each effect
    - Position below task title, before strategic scores
    - Handle multiple badges (task affected by multiple reflections)
  - MODIFY: `app/priorities/page.tsx`:
    - Pass `reflection_effects` data to TaskRow
    - Fetch effects from task data or separate API call
  - VERIFY: Badges appear only on affected tasks

  **Visible Outcome**: Tasks show "Blocked: Legal hold" or "Boosted: Matches focus area" badges.

  **Test Scenario**:
  1. Add reflection "Legal blocked outreach"
  2. View task "Email campaign"
  3. See red badge: "🚫 Blocked: Legal hold"
  4. Hover badge → see full explanation tooltip

**Checkpoint**: User Story 3 complete. Every priority change has clear attribution.

---

## Phase 5: User Story 4 - Code Cleanup (Completed in Phase 1)

**Note**: T001-T003 already address User Story 4 (duplicate code removal).

---

## Phase 6: User Story 5 - Unified Home + Priorities (Priority: P5)

**Goal**: Reflections added on Home page affect Priorities immediately with cross-page notification.

- [X] T011 [SLICE] [US5] **Add cross-page notification for Home → Priorities flow**

  **User Story**: As a user, when I add a reflection on Home page, I see a prompt to view the effect in Priorities.

  **Scope**:
  - MODIFY: `app/page.tsx`:
    - Update `onReflectionAdded()` callback
    - Show toast: "Saved! View effect in Priorities →" with link
    - Use `sonner` toast with action button
  - VERIFY: Clicking link navigates to /priorities
  - VERIFY: Effects already applied when arriving at Priorities

  **Visible Outcome**: Toast appears with link to Priorities page.

  **Test Scenario**:
  1. Navigate to Home page (/)
  2. Add reflection via ReflectionPanel
  3. See toast: "Saved! View effect in Priorities →"
  4. Click toast link
  5. Arrive at /priorities with effects already applied

**Checkpoint**: User Story 5 complete. Cross-page experience unified.

---

## Phase 7: Polish & UX Enhancements

**Purpose**: Improve discoverability and user guidance.

- [X] T012 [POLISH] [US1] **Add intent preview before saving reflection**

  **User Story**: As a user, I can see how my reflection will be interpreted before saving.

  **Scope**:
  - MODIFY: `app/components/ReflectionPanel.tsx`:
    - On text input blur/debounce, call `/api/reflections/interpret` preview
    - Display detected intent as badge below input
    - Show: "Detected: 🚫 Constraint - blocks outreach tasks"
    - Allow edit before confirm
  - ADD: 500ms debounce before calling preview API
  - HANDLE: Loading state during preview fetch

  **Visible Outcome**: Intent badge appears as user types reflection.

  **Test Scenario**: Type "Legal blocked outreach", wait 500ms, see "Constraint/Blocker" badge appear.

- [X] T013 [POLISH] [US1] **Add helpful prompts and examples to ReflectionInput**

  **User Story**: As a user, I understand what kinds of reflections work best.

  **Scope**:
  - MODIFY: `app/components/ReflectionInput.tsx`:
    - Update placeholder: "What's blocking you? What should we focus on?"
    - Add character counter (10-500 chars)
    - Add minimum 3-word validation with helpful error
    - Add example prompts below input:
      ```
      Try: "Legal blocked outreach" • "Focus on analytics" • "Low energy today"
      ```

  **Visible Outcome**: Input shows helpful placeholder and examples.

  **Test Scenario**: Open ReflectionPanel, see placeholder text and example prompts.

- [X] T014 [POLISH] **Add "affected tasks" count to reflection card**

  **User Story**: As a user, I can see how many tasks each reflection affects.

  **Scope**:
  - MODIFY: `app/priorities/components/ContextCard.tsx`:
    - For each reflection, show affected count: "3 tasks affected"
    - Color code: Red if blocking, Amber if demoting, Emerald if boosting
  - FETCH: Count from `task_embeddings.reflection_effects` column

  **Visible Outcome**: Reflection cards show "🚫 3 tasks blocked" or "⬆️ 2 tasks boosted".

  **Test Scenario**: Add blocking reflection, see "3 tasks blocked" count on reflection card.

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Cleanup: T001-T003)
    │
    ▼
Phase 2 (US1: T004-T007) ─── Database migration T006 blocks T007
    │
    ▼
Phase 3 (US2: T008) ─── Depends on T004-T007 being complete
    │
    ▼
Phase 4 (US3: T009-T010) ─── Depends on T007 for effect data
    │
    ▼
Phase 6 (US5: T011) ─── Depends on T007 for auto-trigger
    │
    ▼
Phase 7 (Polish: T012-T014) ─── Can start after T007
```

### Parallel Opportunities

- **T001, T002, T003**: Can run in parallel (different files)
- **T004, T006**: Can run in parallel (schema + migration)
- **T009, T010**: Can run in parallel after T007 (component + wiring)
- **T012, T013, T014**: Can run in parallel (polish tasks)

### Critical Path

```
T001/T002/T003 → T004 → T006 → T007 → T008 → T010
                    ↘           ↗
                      T005 ────┘
```

### User Story Independence

| Story | Tasks | Can Demo Independently |
|-------|-------|----------------------|
| US1 (Immediate Effect) | T004-T007 | Yes - core value proposition |
| US2 (Fast Toggle) | T008 | Yes - after US1 |
| US3 (Attribution) | T009-T010 | Yes - after US1 |
| US4 (Cleanup) | T001-T003 | Yes - immediate |
| US5 (Unified) | T011 | Yes - after US1 |

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: T001-T003 (Cleanup) - 2-3 hours
2. Complete Phase 2: T004-T007 (Immediate Effect) - 6-8 hours
3. **STOP and VALIDATE**: Test "Add reflection → tasks adjust in <3s"
4. Deploy/demo MVP

### Incremental Delivery

1. Cleanup → Immediate Effect (MVP)
2. Add Fast Toggle → Demo 500ms toggle speed
3. Add Attribution → Demo "Blocked: Legal hold" badges
4. Add Unified Experience → Demo Home → Priorities flow
5. Add Polish → Demo intent preview, helpful prompts

---

## Notes

- [P] tasks = different files, no dependencies
- Tests are written as part of service creation (TDD within each SLICE task)
- Each task deliverable can be demoed to non-technical person
- Stop at any checkpoint to validate independently
- Avoid: backend-only tasks, infrastructure-only tasks, tasks without visible outcome
