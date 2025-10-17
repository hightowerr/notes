# Tasks: Reflection Capture (Quick Context Input)

**Input**: Design documents from `/specs/004-reflection-capture-quick/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

## Execution Flow (Slice-Based)
- Each task delivers complete vertical slice (UI → Backend → Data → Feedback)
- Tasks ordered by user value and user journey priority
- [P] indicates parallel execution possible (independent features)
- All paths relative to repository root: `/home/yunix/learning-agentic/ideas/Note-synth/notes/`

---

## Phase 1: Core User Journey (P0 - Must Have)

### T020 [X] [SETUP] Create reflections database table and API foundation

**Why Needed**: Blocks ALL reflection slices - required for any reflection storage/retrieval

**Implementation Scope**:
- **Database**: Apply migration `supabase/migrations/006_create_reflections.sql`
  - Create `reflections` table (id, user_id, text, created_at)
  - Add composite index (user_id, created_at DESC)
  - Enable RLS policies (read/insert only, no update/delete)
- **Schema**: Create Zod validation schema (`lib/schemas/reflectionSchema.ts`)
  - `reflectionSchema`: text (10-500 chars, trimmed)
  - Export `ReflectionInput` type
- **Service**: Create core service module (`lib/services/reflectionService.ts`)
  - `calculateRecencyWeight(createdAt)`: Math.pow(0.5, ageInDays/7) with 0.06 floor
  - `formatRelativeTime(createdAt)`: date-fns formatDistanceToNow with "7+ days ago" cutoff
  - `fetchRecentReflections(userId, limit)`: Query with weights calculated
- **Debounce**: Create debounce utility (`lib/services/recomputeDebounce.ts`)
  - Map-based per-user timers (2s debounce + 10s rate limit)
  - Export `debounceRecompute(userId, triggerFn)` function

**Validation**:
- Migration applies successfully in Supabase Dashboard
- Zod schema validates 10-500 char range correctly
- `calculateRecencyWeight()` returns: today=1.0, 7 days=0.5, 30 days=0
- `formatRelativeTime()` returns "Just now", "3 hours ago", "2 days ago", "7+ days ago"
- Debounce utility tested with rapid calls (single execution after 2s)

**Files Created**:
- `supabase/migrations/006_create_reflections.sql`
- `lib/schemas/reflectionSchema.ts`
- `lib/services/reflectionService.ts`
- `lib/services/recomputeDebounce.ts`

---

### T021 [X] [SLICE] User adds reflection via keyboard shortcut and sees it in panel

**User Story**: As a user, I can press `Cmd+R` (Mac) or `Ctrl+R` (Windows/Linux) to open a reflection panel, type my current context (energy/constraints/blockers), submit it, and immediately see the textarea clear within 200ms while my reflection appears at the top of the recent list

**Implementation Scope**:
- **UI**: Reflection panel component (`app/components/ReflectionPanel.tsx`)
  - Desktop: Collapsible sidebar (right side, 320px width, slide transition)
  - Mobile: Full-screen modal using shadcn Dialog
  - Auto-focus textarea when opened via keyboard shortcut
  - Character counter (hidden until 450 chars, visible 450-500 with gentle message at 500)
  - "Add Reflection" button (primary style with keyboard hint "Cmd+Enter")
  - Recent reflections list (max 5, sorted by date DESC)
  - Empty state with guidance ("Add your first reflection", examples, bullet points)
- **UI**: Keyboard shortcut hook (`lib/hooks/useReflectionShortcut.ts`)
  - Listen for `metaKey || ctrlKey + key === 'r'`
  - Prevent default (stop browser refresh)
  - Call toggle callback
- **UI**: Reflection input component (`app/components/ReflectionInput.tsx`)
  - Textarea with maxLength={500}
  - Client-side validation (Zod schema)
  - Optimistic UI update pattern:
    1. Add temp reflection to local state immediately
    2. Clear textarea (<200ms)
    3. Show success toast
    4. POST to API in background
    5. Replace temp with real data on success
    6. Rollback and restore text on error
- **Backend**: POST `/api/reflections` endpoint (`app/api/reflections/route.ts`)
  - Authenticate user via Supabase auth
  - Validate with Zod `reflectionSchema`
  - Insert to `reflections` table (user_id, text, created_at)
  - Trigger debounced recompute: `debounceRecompute(userId, triggerRecomputeJob)`
  - Return 201 with reflection data
  - Handle errors: 400 (validation), 401 (unauthorized), 500 (server error)
- **Integration**: Add toggle button to main header (`app/components/Header.tsx` or `app/page.tsx`)
  - 💭 icon with tooltip "Reflections (Cmd+R)"
  - Call `useReflectionShortcut` hook
  - Pass `isOpen` and `onOpenChange` to ReflectionPanel
- **Data**: Store in `reflections` table via RLS-secured insert
- **Feedback**:
  - Textarea clears instantly (<200ms perceived latency)
  - Success toast: "✅ Reflection added"
  - Network error toast: "No connection. Please try again when online." (text preserved)
  - Server error toast: "Could not save reflection. Your reflection was not saved." (text preserved)
  - Mobile only: Auto-close modal on success + toast "Add Another" button

**Test Scenario**:
1. Navigate to upload page (`http://localhost:3000`)
2. Press `Cmd+R` (Mac) or `Ctrl+R` (Windows)
3. Verify panel opens (sidebar on desktop >1400px, modal on mobile <768px)
4. Verify textarea auto-focused (cursor blinking)
5. Type: "Feeling energized after client win, ready to tackle hard problems" (63 chars)
6. Verify no character counter visible (<450 chars)
7. Click "Add Reflection" button
8. Verify textarea clears within 200ms (instant feel)
9. Verify reflection appears at top of recent list with "Just now" timestamp
10. Verify success toast displays
11. Press `Cmd+R` again to close panel
12. Reopen panel and verify reflection persists (saved to database)
13. Test error: Disconnect network, add reflection, verify error toast and text preservation
14. Reconnect network, submit again, verify success

**Files Created**:
- `app/components/ReflectionPanel.tsx`
- `app/components/ReflectionInput.tsx`
- `lib/hooks/useReflectionShortcut.ts`
- `app/api/reflections/route.ts`

**Files Modified**:
- `app/page.tsx` (add ReflectionPanel integration and toggle button)
- `app/components/Header.tsx` (if separate header exists, add toggle button)

**Dependencies**: Requires T020 complete (database, schemas, services)

---

### T022 [X] [SLICE] User views recent reflections with visual recency weights

**User Story**: As a user, when I open the reflection panel, I can see my 5 most recent reflections displayed with visual opacity fade based on age, relative timestamps like "3 hours ago" or "7+ days ago", and the newest reflections have higher visual prominence

**Implementation Scope**:
- **UI**: Reflection list component (`app/components/ReflectionList.tsx`)
  - Fetch recent reflections on mount
  - Map reflections to list items with:
    - Text content (10-500 chars)
    - Relative timestamp (e.g., "Just now", "3 hours ago", "2 days ago", "7+ days ago")
    - Opacity based on weight: `opacity: Math.max(0.4, weight)` (40-100% range)
  - Sort by `created_at DESC` (newest first)
  - Limit 5 reflections displayed
  - Loading state while fetching
  - Empty state if no reflections exist (matches empty state in ReflectionInput)
- **Backend**: GET `/api/reflections` endpoint (`app/api/reflections/route.ts`)
  - Authenticate user via Supabase auth
  - Query param: `limit` (default 5, max 10)
  - Call `fetchRecentReflections(userId, limit)` from service
  - Return 200 with `{ reflections: [...] }` (each with id, text, created_at, weight, relative_time)
  - Handle errors: 401 (unauthorized), 500 (server error)
- **Data**: Query `reflections` table filtered by user_id, created_at >= 30 days ago, order by created_at DESC
- **Feedback**:
  - Reflections display with visual fade (newest 100% opacity, oldest 40% opacity)
  - Timestamps update based on calculation (not real-time, calculated on fetch)
  - Empty state shown if no reflections: "💭 Add your first reflection" with examples

**Test Scenario**:
1. Add 5 reflections manually or via T021:
   - Reflection 1: Today (weight = 1.0)
   - Reflection 2: Adjust database timestamp to 2 days ago (weight ≈ 0.76)
   - Reflection 3: Adjust to 5 days ago (weight ≈ 0.57)
   - Reflection 4: Adjust to 7 days ago (weight = 0.5)
   - Reflection 5: Adjust to 14 days ago (weight = 0.25)
2. Open reflection panel
3. Verify reflections sorted newest first
4. Verify opacity fade applied correctly:
   - 1st: 100% opacity (fully visible)
   - 2nd: 85% opacity
   - 3rd: 70% opacity
   - 4th: 55% opacity
   - 5th: 40% opacity (faded but readable)
5. Verify relative timestamps:
   - "Just now" (today)
   - "2 days ago"
   - "5 days ago"
   - "7+ days ago" (for 7+ days old)
6. Clear database and reload panel
7. Verify empty state displays with guidance text

**Files Created**:
- `app/components/ReflectionList.tsx`

**Files Modified**:
- `app/api/reflections/route.ts` (add GET handler)
- `app/components/ReflectionPanel.tsx` (integrate ReflectionList component)

**Dependencies**: Requires T020 (services), T021 (panel structure)

---

## Phase 2: Integration & Polish (P1 - Nice to Have)

### T023 [X] [P] [SLICE] Reflections automatically trigger priority recomputation with debouncing

**User Story**: As a user, when I add multiple reflections in quick succession, the system waits 2 seconds after my last reflection before triggering a single priority recomputation job, and I'm rate-limited to 1 recomputation per 10 seconds to prevent spam

**Implementation Scope**:
- **Backend**: Modify POST `/api/reflections` to trigger debounced recompute after save
  - Already implemented in T021 via `debounceRecompute(userId, triggerRecomputeJob)`
  - Verify 2s debounce works (multiple rapid POSTs → single recompute)
  - Verify 10s rate limit enforced (POSTs within 10s → silently skip recompute)
- **Backend**: Extend `lib/services/recomputeService.ts` (from T012)
  - Add new trigger reason: `"reflection_added"`
  - Modify `triggerRecomputeJob` to accept reason parameter
  - Fetch reflections via `fetchRecentReflections(userId, 5)`
  - Filter reflections with weight >= 0.10 (exclude aged)
  - Inject into AI prompt:
    ```
    RECENT REFLECTIONS (weighted by recency):
    1. "Text here" (weight: 1.00, Just now)
    2. "Text here" (weight: 0.76, 2 days ago)
    ```
  - Pass to existing `aiSummarizer.scoreActions()` method
- **Integration**: Modify `lib/services/aiSummarizer.ts` (scoreActions method)
  - Accept optional `reflectionContext` parameter (formatted string)
  - Inject reflection context BEFORE outcome in AI prompt
  - Update prompt template to include reflection section
- **Feedback**:
  - Success toast: "✅ Reflection added. Updating priorities..." (single toast for rapid adds)
  - Rate limit toast: "Rate limit: must wait Xs" (if <10s elapsed since last recompute)
  - Recompute failure toast: "Could not update priorities. Your reflection was saved." (graceful degradation)

**Test Scenario**:
1. Open reflection panel
2. Add reflection 1: "First reflection" (17 chars)
3. **Immediately** add reflection 2: "Second reflection" (18 chars) - within 2 seconds
4. **Immediately** add reflection 3: "Third reflection" (17 chars) - within 2 seconds
5. Open browser Network tab
6. Verify **only 1 recompute request** triggered (after 2s debounce from last add)
7. Verify success toast shows: "✅ 3 reflections added. Updating priorities..."
8. Wait 5 seconds
9. Add reflection 4: "Fourth reflection" (18 chars)
10. Verify rate limit message if <10s elapsed: "Rate limit: must wait Xs"
11. Wait until 10s elapsed, add reflection 5
12. Verify recompute triggers successfully
13. Upload test document, verify AI summary includes reflection context in logs
14. Simulate recompute failure (break OpenAI connection), add reflection
15. Verify reflection saved despite failure, error toast shown

**Files Modified**:
- `app/api/reflections/route.ts` (already calls debounceRecompute in T021)
- `lib/services/recomputeService.ts` (add reflection context injection)
- `lib/services/aiSummarizer.ts` (accept reflectionContext parameter in scoreActions)

**Dependencies**: Requires T020 (debounce utility), T021 (POST endpoint), T012 (recompute service)

---

### T024 [X] [P] [SLICE] Mobile users access reflection panel via full-screen modal

**User Story**: As a mobile user, when I press `Cmd+R` or tap the reflection toggle button, a full-screen modal opens (not a sidebar), and after submitting a reflection, the modal auto-closes so I can continue my workflow

**Implementation Scope**:
- **UI**: Mobile-specific behavior in `app/components/ReflectionPanel.tsx`
  - Already implemented in T021 using shadcn Dialog for mobile (<768px)
  - Verify full-screen modal styling (w-full h-full max-w-none)
  - Add auto-close logic: `onOpenChange(false)` after successful reflection save
  - Mobile-only toast enhancement: Include "Add Another" button in success toast
    - Button reopens modal when clicked
- **UI**: Ensure responsive breakpoints work correctly
  - Desktop (≥768px): Sidebar with transform translate-x animation
  - Mobile (<768px): Full-screen modal with Dialog component
- **Feedback**:
  - Mobile: Modal auto-closes on successful save
  - Mobile: Success toast includes "Add Another" button
  - Desktop: Sidebar remains open after save (user can add multiple reflections)

**Test Scenario**:
1. Open page on desktop browser (>1400px width)
2. Press `Cmd+R`
3. Verify sidebar slides in from right (not full-screen)
4. Add reflection, verify sidebar stays open
5. Close sidebar manually
6. Resize browser to mobile width (<768px) or use mobile device
7. Press `Cmd+R` (or tap toggle icon)
8. Verify full-screen modal opens (not sidebar)
9. Add reflection: "Testing mobile auto-close behavior" (37 chars)
10. Verify modal **auto-closes** after successful submission
11. Verify toast includes "Add Another" button
12. Tap "Add Another" button, verify modal reopens
13. Close modal manually (X button), verify closes correctly

**Files Modified**:
- `app/components/ReflectionPanel.tsx` (add mobile auto-close logic)
- `app/components/ReflectionInput.tsx` (add "Add Another" button to mobile toast)

**Dependencies**: Requires T021 (panel component with responsive structure)

---

### T025 [X] [P] [POLISH] Add character counter with anxiety-free UX pattern

**Enhancement to**: T021

**User Story**: As a user, I don't see a character counter while typing short reflections (<450 chars) so I can focus without anxiety, but when I approach the 500-char limit, a gentle counter appears at 450+ chars with a helpful message at 500 chars to wrap up my thought

**Implementation Scope**:
- **UI**: Modify `app/components/ReflectionInput.tsx` character counter logic
  - Already implemented in T021 with conditional rendering: `{charCount >= 450 && <CounterUI />}`
  - Verify counter hidden until 450 chars
  - Verify counter visible at 450-500 chars showing "450/500 characters"
  - Verify gentle message at 500 chars: "Reflections work best when concise. Wrap up this thought."
  - Verify hard limit enforced at 500 (textarea maxLength attribute)
  - Use warning color for text at 500 chars (`text-warning-text`)
- **Styling**: Apply design system colors
  - Counter text: `text-text-muted` (450-499 chars)
  - Counter text: `text-warning-text` (500 chars)
  - Message text: `text-warning-text`

**Test Scenario**:
1. Open reflection panel
2. Type 40 characters: "Burnt out today, need lighter tasks now" (40 chars)
3. Verify **no character counter visible** (anxiety-free UX)
4. Continue typing until reaching 450 characters (add filler text)
5. Verify character counter **appears** showing "450/500 characters"
6. Verify counter in muted color (`text-text-muted`)
7. Type 50 more characters to reach 500
8. Verify counter shows "500/500 characters" in warning color
9. Verify gentle message appears: "Reflections work best when concise. Wrap up this thought."
10. Attempt to type more
11. Verify input stops at 500 (hard limit enforced)
12. Delete characters to go below 450
13. Verify counter disappears again

**Files Modified**:
- `app/components/ReflectionInput.tsx` (verify/refine character counter logic from T021)

**Dependencies**: Requires T021 (ReflectionInput component)

---

### T026 [X] [P] [POLISH] Add client-side and server-side validation with defense in depth

**Enhancement to**: T021

**User Story**: As a user, if I try to submit a reflection that's too short (<10 chars) or bypass client validation, I receive clear error messages both client-side (instant feedback) and server-side (defense in depth) so I understand exactly what's required

**Implementation Scope**:
- **UI**: Client-side validation in `app/components/ReflectionInput.tsx`
  - Already uses Zod schema validation from T020
  - Verify validation fires before POST request
  - Display validation error below textarea with error styling
  - Error message: "Reflection must be at least 10 characters" (<10 chars)
  - Error message: "Reflection must be at most 500 characters" (>500 chars, shouldn't happen due to maxLength)
  - Clear error on input change
- **Backend**: Server-side validation in `app/api/reflections/route.ts`
  - Already validates with Zod `reflectionSchema` from T020
  - Return 400 with structured error:
    ```json
    {
      "error": "Validation Error",
      "message": "Reflection must be at least 10 characters",
      "field": "text"
    }
    ```
  - Test cases: <10 chars, >500 chars, missing text, null text
- **Testing**: Create contract test (`__tests__/contract/reflections.test.ts`)
  - POST valid reflection (10-500 chars) → 201 success
  - POST too short (<10 chars) → 400 error
  - POST too long (>500 chars, if bypassing maxLength) → 400 error
  - POST missing text field → 400 error
  - POST with empty string → 400 error

**Test Scenario**:
1. Open reflection panel
2. Type 5 characters: "Short" (5 chars)
3. Click "Add Reflection"
4. Verify client-side error: "Reflection must be at least 10 characters"
5. Verify error styled with `text-destructive-text`
6. Type 5 more characters to reach 10: "Short text" (10 chars)
7. Verify error clears
8. Click "Add Reflection"
9. Verify **accepts** (minimum met)
10. **API test**: Use Postman/curl to POST 5-char text directly to `/api/reflections`
11. Verify server returns 400 error with validation message
12. **API test**: POST 501-char text (bypassing client maxLength)
13. Verify server returns 400 error
14. Run contract tests: `npm run test:run __tests__/contract/reflections.test.ts`
15. Verify all validation tests pass

**Files Modified**:
- `app/components/ReflectionInput.tsx` (verify/enhance validation error display)
- `app/api/reflections/route.ts` (verify server-side validation from T021)

**Files Created**:
- `__tests__/contract/reflections.test.ts` (API contract tests)

**Dependencies**: Requires T020 (schema), T021 (components and endpoint)

---

### T027 [X] [P] [POLISH] Add structured logging for observability

**Enhancement to**: T021, T023

**User Story**: As a developer/operator, when I review application logs, I can see structured log entries for reflection creation and recompute triggers with metadata (user ID, timestamp, character count) but without sensitive reflection text content to preserve privacy

**Implementation Scope**:
- **Backend**: Add logging to POST `/api/reflections` route
  - On success: Log `reflection_created` event
    ```typescript
    console.log(JSON.stringify({
      event: 'reflection_created',
      user_id: userId,
      timestamp: new Date().toISOString(),
      char_count: text.length,
      // Do NOT log reflection text (privacy)
    }));
    ```
  - On error: Log `reflection_error` event with error details
- **Backend**: Add logging to recompute trigger in `lib/services/recomputeService.ts`
  - On recompute start: Log `recompute_triggered` event
    ```typescript
    console.log(JSON.stringify({
      event: 'recompute_triggered',
      user_id: userId,
      trigger_reason: 'reflection_added',
      timestamp: new Date().toISOString(),
      reflection_count: reflections.length,
      // Do NOT log reflection text (privacy)
    }));
    ```
  - On recompute complete: Log `recompute_completed` with duration
  - On recompute error: Log `recompute_error` with error details
- **Privacy**: Verify NO reflection text content in logs (only metadata)

**Test Scenario**:
1. Open browser console (or check server logs)
2. Add reflection: "Test logging scenario with metadata here" (42 chars)
3. Verify log entry includes:
   - Event type: `"reflection_created"`
   - User ID: (UUID)
   - Timestamp: (ISO 8601 format)
   - Character count: 42
   - **Does NOT include**: reflection text content (privacy check)
4. Wait for recompute trigger (2s debounce)
5. Verify log entry includes:
   - Event type: `"recompute_triggered"`
   - User ID: (UUID)
   - Trigger reason: `"reflection_added"`
   - Timestamp: (ISO 8601)
   - Reflection count: 1
6. Verify log entry for recompute completion:
   - Event type: `"recompute_completed"`
   - Duration: (milliseconds)
7. Simulate error (disconnect OpenAI), add reflection
8. Verify error log entry includes event type and error details

**Files Modified**:
- `app/api/reflections/route.ts` (add logging to POST handler)
- `lib/services/recomputeService.ts` (add logging to trigger, completion, error)

**Dependencies**: Requires T021 (POST endpoint), T023 (recompute integration)

---

## Dependencies

```
T020 [SETUP] → (required for) → T021, T022
T021 [SLICE] → (enables) → T022, T023, T024, T025, T026, T027
T022 [SLICE] → (enhances) → T021 (parallel after T021)
T023 [SLICE] → (requires) → T012 (recompute service from earlier feature)
T024 [POLISH] → (enhances) → T021
T025 [POLISH] → (enhances) → T021
T026 [POLISH] → (enhances) → T021
T027 [POLISH] → (enhances) → T021, T023
```

**Parallel Execution**:
- T020 must complete first (foundational setup)
- T021 must complete before any other slices (core user journey)
- T022 + T023 + T024 can run in parallel after T021 (independent enhancements)
- T025 + T026 + T027 can run in parallel after T021 (polish tasks)

---

## Notes

- **T020 is the only SETUP task** - it's truly blocking and cannot be integrated into slices
- **T021 is the core vertical slice** - user can SEE panel, DO add reflection, VERIFY it persists
- **T022 extends T021** - adds viewing capability with visual weights
- **T023 integrates with existing system** - connects reflections to priority recomputation (T012)
- **T024-T027 are polish tasks** - enhance UX, validation, logging for production readiness
- All slices are independently testable and demoable
- Mobile-specific behavior (T024) can be tested on any device with responsive design tools

## Validation Checklist

- [x] Every [SLICE] task has a user story
- [x] Every [SLICE] task includes UI + Backend + Data + Feedback
- [x] Every [SLICE] task has a test scenario
- [x] No backend-only or frontend-only tasks exist (except T020 SETUP)
- [x] Setup task (T020) justifies necessity (blocks all reflection features)
- [x] Tasks ordered by user value (core journey → enhancements → polish)
- [x] Parallel tasks operate on independent features/files
- [x] Each task specifies exact file paths to modify/create
- [x] All tasks are demoable to non-technical person

---

**Tasks generated**: 2025-10-16
**Ready for execution via**: `/implement` with `slice-orchestrator` agent
