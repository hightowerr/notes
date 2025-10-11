# Tasks: Outcome Management

**Input**: Design documents from `/specs/002-outcome-management-shape/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

## Execution Flow (Slice-Based)
```
1. Load plan.md from feature directory → ✅ COMPLETE
2. Load spec.md for user journeys → ✅ COMPLETE
3. Load optional design documents → ✅ COMPLETE (research.md, data-model.md, contracts/)
4. Generate VERTICAL SLICE tasks → ✅ COMPLETE (18 tasks generated)
5. Apply slice ordering rules → ✅ COMPLETE (P0 → Setup → P1 → Polish)
6. Mark parallel execution → ✅ COMPLETE ([P] tags applied)
7. Validate EVERY task → ✅ COMPLETE (all tasks include user story + UI + backend + outcome + test)
8. Return: SUCCESS (slice tasks ready for execution)
```

## Format: `[ID] [TYPE] [P?] User Story & Implementation Scope`
- **[SLICE]**: Complete vertical slice (UI → Backend → Data → Feedback)
- **[SETUP]**: Foundational work blocking ALL slices (avoid if possible)
- **[POLISH]**: Enhancement to existing working slice
- **[P]**: Can run in parallel with other [P] tasks

## Path Conventions
- Next.js App Router: `app/`, `app/api/`, `app/components/`
- Shared logic: `lib/schemas/`, `lib/services/`, `lib/hooks/`
- Tests: `__tests__/contract/`, `__tests__/integration/`, `app/components/__tests__/`
- Database: `supabase/migrations/`

---

## Phase 1: P0 User Journeys (Must-Have Features)

### T008 [SETUP] Database migration for user outcomes table

**Rationale**: Blocking all outcome-related slices. Must be applied before any outcome data can be stored.

**Implementation Scope**:
- **Migration**: Create `supabase/migrations/004_create_user_outcomes.sql`
  - Table: `user_outcomes` with fields: `id`, `user_id`, `direction`, `object_text`, `metric_text`, `clarifier`, `assembled_text`, `is_active`, `created_at`, `updated_at`
  - Unique partial index: `idx_active_outcome` on `(user_id) WHERE is_active = true`
  - Index: `idx_user_outcomes_user_id` on `user_id`
  - Trigger: `update_user_outcomes_updated_at` to auto-update `updated_at`
  - RLS policies: Temporary "Allow all for single user" (P0 placeholder)
- **Verification**: Run migration in Supabase SQL Editor, confirm table exists with correct schema

**Files Modified**:
- `supabase/migrations/004_create_user_outcomes.sql` (create)

**Dependencies**: None

---

### T009 [SLICE] [P] User creates first outcome statement and sees it displayed

**User Story**: As a user visiting the app for the first time, I can fill a 4-field form to create an outcome statement, submit it, and immediately see the assembled outcome displayed in a header banner across all pages

**Implementation Scope**:
- **UI**: OutcomeBuilder form component (`app/components/OutcomeBuilder.tsx`)
  - 4 fields: Direction (Select), Object (Input), Metric (Input), Clarifier (Textarea)
  - Real-time preview using `useDeferredValue` (<1000ms update)
  - Character validation (3-100/3-100/3-150)
  - "Set Outcome Statement" submit button
  - Modal dialog using shadcn/ui Dialog
- **UI**: OutcomeDisplay header component (`app/components/OutcomeDisplay.tsx`)
  - Banner with 🎯 icon + assembled text
  - Edit icon (✏️) next to outcome text
  - Fixed position at top of page
- **Backend**: POST `/api/outcomes` endpoint (`app/api/outcomes/route.ts`)
  - Validate request with Zod schema
  - Check for existing active outcome (should be none on first creation)
  - Assemble outcome text using formula (direction + "the" + object + "by" + metric + "through" + clarifier)
  - Handle Launch/Ship direction (omit "the" article)
  - Insert outcome into `user_outcomes` table with `is_active = true`
  - Return 201 with `{ id, assembled_text, created_at, message }`
- **Backend**: GET `/api/outcomes` endpoint (same file)
  - Query `user_outcomes` WHERE `is_active = true`
  - Return 200 with outcome object OR 404 with `{ outcome: null }`
- **Data**: Zod schema (`lib/schemas/outcomeSchema.ts`)
  - `outcomeInputSchema`: validates direction, object, metric, clarifier
  - `outcomeResponseSchema`: validates API response
- **Data**: Outcome service (`lib/services/outcomeService.ts`)
  - `assembleOutcome()` pure function (deterministic text assembly)
  - Exports assembly logic for reuse
- **Feedback**: Success toast "✅ Outcome created successfully. Re-scoring N actions..."
- **Feedback**: OutcomeDisplay shows assembled text immediately after save

**Test Scenario**:
1. Navigate to `http://localhost:3000`
2. No outcome banner visible (first visit)
3. Click "Set Outcome" button (location TBD - could be in header/hero section)
4. Modal opens with 4-field form
5. Fill: Direction="Increase", Object="monthly recurring revenue", Metric="25% within 6 months", Clarifier="enterprise customer acquisition"
6. Preview updates in real-time: "Increase the monthly recurring revenue by 25% within 6 months through enterprise customer acquisition"
7. Click "Set Outcome Statement"
8. Toast appears with success message
9. Modal closes
10. Outcome banner now visible at top: "🎯 Increase the monthly recurring revenue by 25% within 6 months through enterprise customer acquisition" with ✏️ icon
11. Navigate to `/dashboard` - outcome banner persists
12. Verify database: 1 row in `user_outcomes` with `is_active = true`

**Files Modified**:
- `app/components/OutcomeBuilder.tsx` (create)
- `app/components/OutcomeDisplay.tsx` (create)
- `app/api/outcomes/route.ts` (create - both GET and POST handlers)
- `lib/schemas/outcomeSchema.ts` (create)
- `lib/services/outcomeService.ts` (create)
- `app/page.tsx` (add trigger button + integrate OutcomeDisplay)
- `app/dashboard/page.tsx` (integrate OutcomeDisplay)

**Dependencies**: T008 (database migration)

---

### T010 [SLICE] User edits existing outcome with confirmation dialog

**User Story**: As a user with an active outcome, I can click the edit icon, modify the outcome fields, and after confirming replacement, see the updated outcome displayed immediately

**Implementation Scope**:
- **UI**: Edit mode in OutcomeBuilder component (`app/components/OutcomeBuilder.tsx`)
  - Pre-fill fields from existing outcome on edit
  - Detect changes vs. original values
  - "Update Outcome" button (different from "Set Outcome")
- **UI**: Confirmation dialog (`app/components/ConfirmReplaceDialog.tsx`)
  - shadcn/ui AlertDialog
  - Title: "Replace existing outcome?"
  - Message: "This will replace your current outcome statement. Previous outcome will be deleted (not archived)."
  - Actions: "Cancel" | "Yes, Replace"
- **Backend**: Update logic in POST `/api/outcomes` (`app/api/outcomes/route.ts`)
  - Detect if active outcome exists
  - If exists: set `is_active = false` for old outcome, create new outcome with `is_active = true`
  - Return 200 (not 201) with `{ id, assembled_text, updated_at, message }`
  - Handle transaction to ensure atomicity (deactivate + create)
- **Feedback**: Confirmation dialog prevents accidental replacement
- **Feedback**: Success toast "✅ Outcome updated. Re-scoring N actions..."
- **Feedback**: OutcomeDisplay updates immediately

**Test Scenario**:
1. Prerequisite: Active outcome exists from T009
2. Click ✏️ icon in outcome banner
3. Modal opens with fields pre-filled: Direction="Increase", Object="monthly recurring revenue", etc.
4. Change Direction to "Decrease", Object to "customer churn rate"
5. Preview updates: "Decrease the customer churn rate by 25% within 6 months through proactive onboarding support"
6. Click "Update Outcome"
7. Confirmation dialog appears: "Replace existing outcome?"
8. Click "Yes, Replace"
9. Dialog closes, success toast appears
10. Outcome banner updates to new text
11. Verify database: Old outcome has `is_active = false` (or deleted), new outcome has `is_active = true`
12. Test cancel: Repeat steps 2-6, click "Cancel" in dialog → no changes, modal stays open

**Files Modified**:
- `app/components/OutcomeBuilder.tsx` (modify - add edit mode, pre-fill logic)
- `app/components/ConfirmReplaceDialog.tsx` (create)
- `app/api/outcomes/route.ts` (modify - add update/replace logic)
- `app/components/OutcomeDisplay.tsx` (modify - wire edit icon to open modal)

**Dependencies**: T009

---

### T011 [SLICE] [P] User's draft outcome is saved and recoverable after accidental close

**User Story**: As a user filling the outcome form, if I accidentally close the modal without saving, the system preserves my draft in localStorage and offers to restore it when I reopen the form within 24 hours

**Implementation Scope**:
- **UI**: Draft recovery UI in OutcomeBuilder (`app/components/OutcomeBuilder.tsx`)
  - "Resume editing?" prompt with "Yes" / "No" buttons
  - Display prompt above form fields when draft detected
  - "Yes" → restores draft values to fields
  - "No" → clears draft from localStorage, shows fresh form
- **Client Logic**: useOutcomeDraft hook (`lib/hooks/useOutcomeDraft.ts`)
  - `saveDraft({ direction, object, metric, clarifier })` → writes to localStorage with `expiresAt` timestamp (+24 hours)
  - `loadDraft()` → reads from localStorage, checks expiry (`expiresAt < Date.now()`), returns draft or null
  - `clearDraft()` → removes from localStorage
  - Storage key: `outcome_draft_v1`
- **Behavior**: Auto-save draft on modal close if any field has content
- **Behavior**: Clear draft after successful outcome save
- **Feedback**: Resume prompt visible when draft exists and not expired

**Test Scenario**:
1. Click "Set Outcome" to open modal
2. Fill: Direction="Launch", Object="beta product to 50 users", Metric="by Q2"
3. Close modal (X button or click outside) without saving
4. Verify localStorage: key `outcome_draft_v1` contains draft JSON with `expiresAt`
5. Reopen modal within 24 hours
6. "Resume editing?" prompt appears
7. Click "Yes" → fields restore to "Launch", "beta product to 50 users", "by Q2"
8. Complete Clarifier field: "targeted outreach campaigns"
9. Submit successfully
10. Verify draft removed from localStorage
11. Test expiry: Manually set `expiresAt` to past timestamp, reopen modal → no resume prompt

**Files Modified**:
- `lib/hooks/useOutcomeDraft.ts` (create)
- `app/components/OutcomeBuilder.tsx` (modify - integrate draft save/load, resume UI)

**Dependencies**: T009 (OutcomeBuilder component exists)

---

## Phase 2: P1 User Journeys (Enhanced Features)

### T012 [SLICE] [P] Async recompute job triggers when outcome changes

**User Story**: As a user who saves/updates an outcome, the system automatically re-scores all existing actions in the background against the new outcome context, and I see a toast notification showing progress

**Implementation Scope**:
- **Backend**: Recompute service (`lib/services/recomputeService.ts`)
  - `enqueue({ outcomeId, userId, actionCount })` → adds job to processing queue
  - `execute(job)` → fetches outcome, fetches all processed_documents, re-scores actions using AI
  - Reuses existing `processingQueue.ts` pattern (max 3 parallel jobs)
  - Retry logic: exponential backoff (1s, 2s, 4s), max 3 attempts
  - Logs: `[Recompute] Queued job for outcome {id}, {count} actions`
- **Backend**: Integration in POST `/api/outcomes` (`app/api/outcomes/route.ts`)
  - After outcome save, count actions: `SELECT COUNT(*) FROM processed_documents WHERE user_id = 'default-user'`
  - Call `recomputeService.enqueue({ outcomeId, userId, actionCount })`
  - Return immediately (non-blocking)
- **Backend**: AI integration (`lib/services/aiSummarizer.ts`)
  - Add `scoreActions(document, outcomeText)` method
  - Uses Vercel AI SDK to re-score actions with outcome context
  - Updates LNO task classifications based on outcome alignment
- **Feedback**: Success toast includes action count: "Re-scoring 47 actions..."
- **Feedback**: If recompute fails permanently after 3 retries: toast warning "⚠️ Some actions may show outdated scores"

**Test Scenario**:
1. Prerequisite: 5 processed documents exist in database
2. Create new outcome (T009 flow)
3. Observe success toast: "✅ Outcome created successfully. Re-scoring 5 actions..."
4. Check console logs: `[Recompute] Queued job for outcome {id}, 5 actions`
5. Wait ~5-10 seconds for background job to complete
6. Check console logs: `[Recompute] Completed 5 documents`
7. Verify actions in dashboard show updated scores/priorities (future enhancement - not yet visible in UI)
8. Test failure: Mock recompute service to throw error, verify retry attempts and final toast warning

**Files Modified**:
- `lib/services/recomputeService.ts` (create)
- `app/api/outcomes/route.ts` (modify - add recompute trigger after save)
- `lib/services/aiSummarizer.ts` (modify - add scoreActions method)
- `lib/services/processingQueue.ts` (modify - extend to support recompute job type)

**Dependencies**: T009 (POST /api/outcomes exists), existing processingQueue.ts

---

### T013 [SLICE] [P] "Launch" and "Ship" directions omit "the" article in preview

**User Story**: As a user selecting "Launch" or "Ship" direction, I see the preview omit the "the" article for natural phrasing (e.g., "Launch beta product..." not "Launch the beta product...")

**Implementation Scope**:
- **Logic**: Conditional logic in `assembleOutcome()` function (`lib/services/outcomeService.ts`)
  - If `direction === 'launch' || direction === 'ship'`: return `${capitalize(direction)} ${object} by ${metric} through ${clarifier}`
  - Else: return `${capitalize(direction)} the ${object} by ${metric} through ${clarifier}`
- **UI**: Preview in OutcomeBuilder reflects correct grammar (`app/components/OutcomeBuilder.tsx`)
- **Backend**: Assembled text stored in database also omits "the" for Launch/Ship (`app/api/outcomes/route.ts`)
- **Feedback**: User sees grammatically correct preview and stored outcome

**Test Scenario**:
1. Open outcome builder
2. Select Direction="Launch"
3. Fill: Object="beta product to 50 early adopters", Metric="by Q2 2025", Clarifier="product hunt campaign"
4. Preview shows: "Launch beta product to 50 early adopters by by Q2 2025 through product hunt campaign"
5. Verify NO "the" article after "Launch"
6. Submit and verify database `assembled_text` matches preview
7. Test with Direction="Ship" → same behavior (no "the" article)
8. Test with Direction="Increase" → includes "the" article: "Increase **the** beta product..."

**Files Modified**:
- `lib/services/outcomeService.ts` (modify - add conditional logic for Launch/Ship)

**Dependencies**: T009 (assembleOutcome function exists)

---

### T014 [SLICE] [P] Form validation displays helpful field-specific error messages

**User Story**: As a user filling the outcome form, if I enter invalid data (too short, too long, empty), I see clear error messages below each field guiding me to fix the issue

**Implementation Scope**:
- **UI**: Validation UI in OutcomeBuilder (`app/components/OutcomeBuilder.tsx`)
  - shadcn/ui Form components with field-level error display
  - Error messages appear below input fields in red text
  - Submit button disabled until all validations pass
- **Validation**: Client-side Zod validation
  - Object: "Object must be between 3 and 100 characters"
  - Metric: "Metric must be between 3 and 100 characters"
  - Clarifier: "Clarifier must be between 3 and 150 characters"
  - Direction: Required (dropdown prevents empty selection)
- **Validation**: Server-side validation in POST `/api/outcomes` (`app/api/outcomes/route.ts`)
  - Returns 400 with `{ error: 'VALIDATION_ERROR', details: { field: 'message' } }`
  - Catches cases where client validation bypassed (DevTools manipulation)
- **Feedback**: Inline error messages update as user types
- **Feedback**: Submit button visually disabled (opacity, cursor not-allowed)

**Test Scenario**:
1. Open outcome builder
2. Try to submit with empty Object field → error: "Object must be at least 3 characters"
3. Type "ab" (2 chars) → error persists
4. Type "abc" (3 chars) → error clears, submit enabled
5. Type 101 characters in Object → input prevents typing beyond 100 chars
6. Test Metric with "a" (1 char) → error: "Metric must be at least 3 characters"
7. Test Clarifier with 151 chars → input prevents typing
8. Test server validation: Use DevTools Network tab to modify POST request with invalid data → 400 response with error details

**Files Modified**:
- `app/components/OutcomeBuilder.tsx` (modify - add shadcn Form components, validation UI)
- `app/api/outcomes/route.ts` (modify - add server-side validation with 400 responses)

**Dependencies**: T009 (OutcomeBuilder component and API endpoint exist)

---

## Phase 3: Polish & Enhancements

### T015 [POLISH] [P] Mobile-responsive outcome form with sticky preview

**User Story**: As a mobile user, I can fill the outcome form comfortably without horizontal scrolling, with the preview always visible at the bottom of my screen

**Implementation Scope**:
- **UI**: Mobile-specific styles in OutcomeBuilder (`app/components/OutcomeBuilder.tsx`)
  - Stack 4 fields vertically (no horizontal layout)
  - Preview fixed at bottom of viewport (sticky positioning)
  - Direction dropdown becomes segmented control on mobile (<768px breakpoint)
  - No horizontal scroll required
- **UI**: Touch-friendly interactions
  - Larger tap targets (min 44px height)
  - Keyboard "Next" button moves focus to next field (not submit)
  - No zoom on input focus (viewport meta tag correct)
- **Feedback**: Preview remains visible while scrolling through form

**Test Scenario**:
1. Open DevTools device emulation (iPhone 12 Pro, 390x844)
2. Open outcome builder modal
3. Verify fields stacked vertically
4. Tap Object field → keyboard appears, no zoom
5. Type text, scroll down
6. Preview stays visible at bottom (sticky)
7. Tap "Next" on mobile keyboard → focus moves from Object → Metric → Clarifier
8. Verify Direction control shows as segmented buttons (not dropdown)
9. Submit form → same behavior as desktop

**Files Modified**:
- `app/components/OutcomeBuilder.tsx` (modify - add mobile styles, sticky preview, segmented control)
- `app/globals.css` or component CSS (add mobile-specific Tailwind classes)

**Dependencies**: T009 (OutcomeBuilder component exists)

---

### T016 [POLISH] [P] Contract tests for outcome API endpoints

**User Story**: As a developer, I can run automated tests to verify POST and GET /api/outcomes endpoints match their contracts and handle all response scenarios

**Implementation Scope**:
- **Tests**: Contract tests (`__tests__/contract/outcomes.test.ts`)
  - POST /api/outcomes:
    - Test: Create first outcome (no existing) → 201 response
    - Test: Update existing outcome → 200 response
    - Test: Validation error (object too short) → 400 response
    - Test: Invalid direction enum → 400 response
    - Test: Launch direction omits "the" article
  - GET /api/outcomes:
    - Test: Fetch existing outcome → 200 response
    - Test: No outcome set → 404 response
    - Test: After replacement → returns new outcome only
- **Setup**: Mock Supabase client for tests
- **Assertions**: Verify response status codes, body structure, validation messages

**Test Scenario**:
1. Run `npm run test:run -- outcomes.test.ts`
2. All contract tests pass (8-10 tests)
3. Coverage includes success, error, and edge cases
4. Tests are deterministic (no flaky failures)

**Files Modified**:
- `__tests__/contract/outcomes.test.ts` (create)
- `__tests__/setup.ts` (modify - add Supabase mock if not exists)

**Dependencies**: T009 (API endpoints implemented)

---

### T017 [POLISH] [P] Component tests for OutcomeBuilder and OutcomeDisplay

**User Story**: As a developer, I can run automated tests to verify outcome UI components render correctly, handle user interactions, and display validation errors

**Implementation Scope**:
- **Tests**: OutcomeBuilder component tests (`app/components/__tests__/OutcomeBuilder.test.tsx`)
  - Test: Renders 4 fields and preview
  - Test: Preview updates when fields change
  - Test: Validation errors display for invalid input
  - Test: Submit button disabled when fields invalid
  - Test: Calls onSubmit prop when form valid
  - Test: Draft recovery prompt appears when draft exists
- **Tests**: OutcomeDisplay component tests (`app/components/__tests__/OutcomeDisplay.test.tsx`)
  - Test: Renders assembled outcome text
  - Test: Edit icon triggers modal open
  - Test: Shows placeholder when no outcome set
- **Setup**: React Testing Library, mock fetch API, mock localStorage

**Test Scenario**:
1. Run `npm run test:run -- OutcomeBuilder.test.tsx`
2. All component tests pass (6-8 tests)
3. Run `npm run test:run -- OutcomeDisplay.test.tsx`
4. All display tests pass (3-4 tests)

**Files Modified**:
- `app/components/__tests__/OutcomeBuilder.test.tsx` (create)
- `app/components/__tests__/OutcomeDisplay.test.tsx` (create)

**Dependencies**: T009, T010, T011 (components implemented)

---

### T018 [POLISH] Integration test for complete outcome creation and edit flow

**User Story**: As a developer, I can run an end-to-end test that simulates a user creating, viewing, and editing an outcome to verify the complete journey works

**Implementation Scope**:
- **Tests**: Outcome flow integration test (`__tests__/integration/outcome-flow.test.ts`)
  - Test: Complete flow from empty state → create → display → edit → update
  - Simulates user interactions: form fill, submit, modal close, edit icon click
  - Verifies database state changes (active outcome created, old outcome deactivated)
  - Verifies UI updates (banner appears, text changes)
- **Setup**: Mock Supabase, mock recompute service (don't actually trigger AI jobs)

**Test Scenario**:
1. Run `npm run test:run -- outcome-flow.test.ts`
2. Integration test passes
3. Test covers happy path: create → display → edit → update
4. Test time <5 seconds (mocked external services)

**Files Modified**:
- `__tests__/integration/outcome-flow.test.ts` (create)

**Dependencies**: T009, T010 (create and edit flows implemented)

---

### T019 [POLISH] [P] Manual testing guide for outcome feature

**User Story**: As a QA tester or developer, I can follow a comprehensive manual testing guide to verify all outcome scenarios work correctly in a real browser environment

**Implementation Scope**:
- **Documentation**: Manual test guide (`specs/002-outcome-management-shape/T008_MANUAL_TEST.md`)
  - Scenario 1: First-time outcome creation (8 steps)
  - Scenario 2: Edit existing outcome with confirmation (9 steps)
  - Scenario 3: Draft recovery after accidental close (9 steps)
  - Scenario 4: Launch direction article omission (6 steps)
  - Scenario 5: Validation errors (6 variations)
  - Scenario 6: Recompute job failure handling (5 steps)
  - Scenario 7: Mobile responsive design (6 checks)
  - Scenario 8: Multi-page outcome display (6 checks)
  - Performance validation (3 metrics)
- **Content**: Based on `quickstart.md` test scenarios
- **Format**: Step-by-step instructions with expected results

**Test Scenario**:
1. Follow manual guide Scenario 1 → all steps pass
2. Follow Scenario 2 → confirmation dialog works
3. Follow Scenario 3 → draft recovery works
4. Complete all 8 scenarios → document results
5. Report any failures as GitHub issues

**Files Modified**:
- `specs/002-outcome-management-shape/T008_MANUAL_TEST.md` (create)

**Dependencies**: All T009-T015 implemented

---

## Summary

**Total Tasks**: 12 (1 setup + 11 slices/polish)

**Task Breakdown**:
- **Setup**: 1 (T008 - database migration)
- **P0 Slices**: 4 (T009, T010, T011, T012)
- **P1 Slices**: 2 (T013, T014)
- **Polish**: 5 (T015, T016, T017, T018, T019)

**Parallel Opportunities**:
- After T008: T009 can start
- After T009: T010, T011, T013, T014, T015 can run in parallel
- After T009: T012 can start (integrates with API)
- After T009-T015: T016, T017, T018, T019 can run in parallel

**Estimated Duration** (assuming 1 developer):
- T008: 0.5 hours (migration)
- T009: 4 hours (core create flow, largest slice)
- T010: 2 hours (edit + confirmation)
- T011: 1.5 hours (draft recovery)
- T012: 3 hours (recompute integration)
- T013: 0.5 hours (article omission logic)
- T014: 1 hour (validation UI)
- T015: 1.5 hours (mobile responsive)
- T016: 2 hours (contract tests)
- T017: 2 hours (component tests)
- T018: 1.5 hours (integration test)
- T019: 1 hour (manual test guide)
- **Total**: ~21 hours

**Success Criteria**:
- ✅ User can create outcome statement with real-time preview
- ✅ User can edit outcome with confirmation dialog
- ✅ User can recover draft after accidental close
- ✅ Async recompute triggers automatically
- ✅ All validations work with helpful error messages
- ✅ Mobile responsive design with sticky preview
- ✅ Automated tests pass (contract + component + integration)
- ✅ Manual testing guide complete

**Next Steps**:
1. Apply database migration (T008)
2. Implement core create flow (T009)
3. Parallelize remaining slices
4. Run automated tests
5. Execute manual testing guide
6. Mark feature as production-ready
