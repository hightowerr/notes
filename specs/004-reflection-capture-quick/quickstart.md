# Quickstart: Reflection Capture Manual Testing Guide

**Feature**: 004-reflection-capture-quick
**Date**: 2025-10-16
**Phase**: Phase 1 - Manual Test Guide
**Prerequisites**: Database migration 006 applied, feature implementation complete

---

## Overview

This guide provides step-by-step manual testing scenarios for the Reflection Capture feature. Use this guide to validate the implementation matches specification requirements when automated tests are blocked by technical limitations (e.g., network error simulation, keyboard shortcuts).

**Test Environment**:
- Development server running (`npm run dev`)
- Database migration 006 applied successfully
- Valid user session (logged in via Supabase auth)
- Browser: Chrome/Firefox/Safari (desktop + mobile responsive)

---

## Scenario 1: Panel Discovery & Keyboard Shortcut

**Objective**: Verify reflection panel is accessible and responds to keyboard shortcut

**Steps**:
1. Navigate to upload page (`http://localhost:3000`)
2. Verify reflection panel is **collapsed by default** (not visible)
3. Look for toggle icon/button in header (e.g., 💭 icon)
4. Press `Cmd+R` (Mac) or `Ctrl+R` (Windows/Linux)
5. Verify panel expands from right side (desktop) or opens as full-screen modal (mobile)
6. Verify textarea is **auto-focused** (cursor blinking in input)
7. Press `Cmd+R` again
8. Verify panel closes

**Expected Results**:
- ✅ Panel collapsed on page load
- ✅ Keyboard shortcut toggles panel open/close
- ✅ Auto-focus when opened via keyboard
- ✅ Browser refresh (default Cmd+R behavior) is prevented

**Spec Ref**: FR-029, FR-030, FR-031, FR-032

---

## Scenario 2: Reflection Submission & Optimistic Update

**Objective**: Verify submission flow and <200ms clear latency

**Steps**:
1. Open reflection panel (`Cmd+R`)
2. Type: `"Feeling energized after client win, ready to tackle hard problems"` (63 chars)
3. Click "Add Reflection" button (or press `Cmd+Enter`)
4. **Start stopwatch** - measure textarea clear time
5. Verify textarea clears **immediately** (<200ms perceived latency)
6. Verify new reflection appears at **top of recent list**
7. Verify toast notification shows: `"✅ Reflection added"`
8. Wait 2-3 seconds for API response
9. Verify reflection remains in list (not rolled back)

**Expected Results**:
- ✅ Textarea clears within 200ms (instant feel)
- ✅ Reflection appears in list before server confirmation
- ✅ Toast shows success message
- ✅ Reflection persists after server responds

**Spec Ref**: FR-009, FR-010, FR-011, NFR-002

---

## Scenario 3: Character Counter Behavior

**Objective**: Verify character counter appears only at 450+ chars

**Steps**:
1. Open reflection panel
2. Type 40 characters: `"Burnt out today, need lighter tasks now"` (40 chars)
3. Verify **no character counter visible** (anxiety-free UX)
4. Continue typing until reaching 450 characters (add filler text)
5. Verify character counter **appears** showing `"450/500 characters"`
6. Type 50 more characters to reach 500
7. Verify counter shows `"500/500 characters"`
8. Verify gentle message: `"Reflections work best when concise. Wrap up this thought."`
9. Attempt to type more
10. Verify input stops at 500 (hard limit)

**Expected Results**:
- ✅ Counter hidden until 450 chars
- ✅ Counter visible at 450-500 chars
- ✅ Gentle message at 500 chars (no hard error)
- ✅ Hard limit enforced at 500 (cannot type more)

**Spec Ref**: FR-004, FR-005

---

## Scenario 4: Recency Weight Display

**Objective**: Verify reflections display with correct visual fade

**Steps**:
1. Add 5 reflections with different timestamps (manually adjust database if needed):
   - Reflection 1: Today (weight = 1.0)
   - Reflection 2: 2 days ago (weight ≈ 0.76)
   - Reflection 3: 5 days ago (weight ≈ 0.57)
   - Reflection 4: 7 days ago (weight = 0.5)
   - Reflection 5: 14 days ago (weight = 0.25)
2. Open reflection panel and view recent list
3. Verify reflections sorted by date (most recent first)
4. Verify visual opacity fade:
   - 1st: 100% opacity (fully visible)
   - 2nd: 85% opacity
   - 3rd: 70% opacity
   - 4th: 55% opacity
   - 5th: 40% opacity (faded but readable)
5. Verify relative timestamps:
   - "Just now" (today)
   - "2 days ago"
   - "5 days ago"
   - "7+ days ago" (7+ days cutoff)

**Expected Results**:
- ✅ Reflections sorted newest first
- ✅ Opacity fade applied correctly
- ✅ Relative timestamps formatted correctly
- ✅ "7+ days ago" shown for old reflections

**Spec Ref**: FR-014, FR-015, FR-016

---

## Scenario 5: Empty State Guidance

**Objective**: Verify empty state shows helpful guidance

**Steps**:
1. Clear all reflections from database (or use new user account)
2. Open reflection panel
3. Verify empty state content displays:
   - Heading: `"💭 Add your first reflection"`
   - Bullet list: Energy levels, constraints, blockers, momentum
   - Example: `"Feeling energized after client win, ready to tackle hard problems"`
4. Verify guidance text is concise (not overwhelming)

**Expected Results**:
- ✅ Empty state visible when no reflections exist
- ✅ Example text provides clear guidance
- ✅ Bullet list explains what to capture

**Spec Ref**: FR-039, FR-040, FR-041, FR-042

---

## Scenario 6: Mobile Responsive Behavior

**Objective**: Verify full-screen modal on mobile, sidebar on desktop

**Steps**:
1. Open page on desktop browser (>1400px width)
2. Press `Cmd+R`
3. Verify sidebar slides in from right (not full-screen)
4. Close panel
5. Resize browser to mobile width (<768px) or use mobile device
6. Press `Cmd+R` (or tap toggle icon)
7. Verify full-screen modal opens (not sidebar)
8. Add reflection and submit
9. Verify modal **auto-closes** after successful submission
10. Verify toast includes "Add Another" button

**Expected Results**:
- ✅ Desktop: Collapsible sidebar (partial screen)
- ✅ Mobile: Full-screen modal
- ✅ Mobile: Modal auto-closes on submit
- ✅ Mobile: Toast offers "Add Another" option

**Spec Ref**: FR-035, FR-036, FR-037, FR-038

---

## Scenario 7: Network Error Handling

**Objective**: Verify fail-fast behavior on offline/network errors

**Steps**:
1. Open reflection panel
2. Type: `"Testing network error handling scenario"` (37 chars)
3. **Disable network** (Chrome DevTools → Network tab → Offline)
4. Click "Add Reflection"
5. Verify error toast immediately: `"No connection. Please try again when online."`
6. Verify reflection does **NOT** appear in recent list
7. Verify textarea **still contains** typed text (preserved for retry)
8. **Re-enable network**
9. Click "Add Reflection" again (same text)
10. Verify reflection saves successfully this time

**Expected Results**:
- ✅ Immediate error toast on network failure
- ✅ Reflection not saved locally
- ✅ Textarea preserves text for retry
- ✅ Successful save after network restored

**Spec Ref**: FR-067, FR-068, FR-069, FR-070, NFR-006

---

## Scenario 8: Recompute Failure Handling

**Objective**: Verify reflection saves even if recompute job fails

**Steps**:
1. **Simulate recompute failure** (temporarily break recompute service or disconnect OpenAI API)
2. Open reflection panel
3. Type: `"Client call went well, momentum building"` (42 chars)
4. Click "Add Reflection"
5. Verify reflection appears in recent list (saved to database)
6. Verify toast shows: `"Could not update priorities. Your reflection was saved."`
7. Check database - confirm reflection exists
8. Verify priorities list did **not** change (recompute failed)

**Expected Results**:
- ✅ Reflection saved to database despite recompute failure
- ✅ Error toast shown (user informed of failure)
- ✅ No automatic retry (user can add another reflection to trigger new recompute)
- ✅ Priorities unchanged (graceful degradation)

**Spec Ref**: FR-047, FR-048, FR-049

---

## Scenario 9: Debouncing & Rate Limiting

**Objective**: Verify 2s debounce and 10s rate limit enforcement

**Steps**:
1. Open reflection panel
2. Add reflection 1: `"First reflection"` (17 chars)
3. **Immediately** add reflection 2: `"Second reflection"` (18 chars) - within 2 seconds
4. **Immediately** add reflection 3: `"Third reflection"` (17 chars) - within 2 seconds
5. Verify single toast: `"✅ 3 reflections added. Updating priorities..."`
6. Check network tab - verify **only 1 recompute request** triggered (after 2s debounce)
7. Wait 5 seconds
8. Add reflection 4: `"Fourth reflection"` (18 chars)
9. Verify rate limit message (if <10s elapsed): `"Rate limit: must wait Xs"`

**Expected Results**:
- ✅ Multiple rapid reflections trigger single debounced recompute
- ✅ Toast shows count: "3 reflections added"
- ✅ Rate limit prevents spam (1 per 10s per user)
- ✅ User informed of rate limit if exceeded

**Spec Ref**: FR-043, FR-044, FR-045, FR-046

---

## Scenario 10: Concurrent Multi-Device Adds

**Objective**: Verify append-only model supports concurrent inserts

**Steps**:
1. Open page in **two browser windows** (or two devices) with same user session
2. Window 1: Add reflection: `"Device 1 reflection"` (20 chars)
3. Window 2: **Simultaneously** add reflection: `"Device 2 reflection"` (20 chars)
4. Refresh both windows
5. Verify **both reflections** appear in recent list
6. Verify each has unique ID and precise timestamp
7. Verify list sorted by timestamp (most recent first)

**Expected Results**:
- ✅ Both reflections saved successfully (no conflict)
- ✅ Each has unique ID (UUID generated)
- ✅ Timestamps precise enough to determine order
- ✅ No "last write wins" behavior (both persist)

**Spec Ref**: Edge case clarification (append-only model)

---

## Scenario 11: Character Validation (Client + Server)

**Objective**: Verify 10-500 char limits enforced

**Steps**:
1. Open reflection panel
2. Type 5 characters: `"Short"` (5 chars)
3. Click "Add Reflection"
4. Verify client-side error: `"Reflection must be at least 10 characters"`
5. Type 10 characters: `"Ten chars!"` (10 chars)
6. Click "Add Reflection"
7. Verify **accepts** (minimum met)
8. Type 501 characters (copy-paste long text)
9. Verify textarea **stops at 500** (hard limit enforced)
10. **API test**: Bypass client and POST 5-char text directly to `/api/reflections`
11. Verify server returns 400 error with validation message

**Expected Results**:
- ✅ Client validates <10 chars (instant feedback)
- ✅ Client enforces 500 char max (hard limit)
- ✅ Server validates <10 chars (defense in depth)
- ✅ Server validates >500 chars (defense in depth)

**Spec Ref**: FR-003, NFR-005

---

## Scenario 12: No Editing/Deleting (Append-Only)

**Objective**: Verify reflections are immutable after creation

**Steps**:
1. Add reflection: `"Original reflection text"` (24 chars)
2. Verify reflection appears in list
3. Look for edit button - **should not exist**
4. Look for delete button - **should not exist**
5. Right-click reflection - no context menu options
6. **Database test**: Attempt UPDATE query on reflection row
7. Verify RLS policy blocks UPDATE (no update policy exists)
8. **Database test**: Attempt DELETE query on reflection row
9. Verify RLS policy blocks DELETE (no delete policy exists)

**Expected Results**:
- ✅ No edit UI affordances (buttons, icons, menus)
- ✅ No delete UI affordances
- ✅ Database UPDATE blocked by RLS
- ✅ Database DELETE blocked by RLS

**Spec Ref**: FR-007, FR-051, FR-052, FR-054, FR-055

---

## Scenario 13: AI Prompt Injection Verification

**Objective**: Verify reflections injected into AI summarization context

**Steps**:
1. Add 3 reflections:
   - `"Feeling burnt out today"` (23 chars)
   - `"Ready to tackle strategic work"` (31 chars)
   - `"Only have 1-hour blocks today"` (30 chars)
2. Upload a test note file (PDF/DOCX with action items)
3. Wait for AI processing to complete
4. Check processing logs (console or database)
5. Verify AI prompt includes reflection context block:
   ```
   RECENT REFLECTIONS (weighted by recency):
   1. "Only have 1-hour blocks today" (weight: 1.00, Just now)
   2. "Ready to tackle strategic work" (weight: 0.98, 1h ago)
   3. "Feeling burnt out today" (weight: 0.94, 3h ago)
   ```
6. Verify extracted actions reflect reflection context (e.g., shorter tasks prioritized if "1-hour blocks" reflection exists)

**Expected Results**:
- ✅ Reflections fetched and formatted correctly
- ✅ Weights calculated accurately
- ✅ Relative timestamps included
- ✅ Injected into AI prompt before document content
- ✅ AI output reflects reflection influence

**Spec Ref**: FR-024, FR-025, FR-026, FR-027, FR-028

---

## Scenario 14: Logging & Observability

**Objective**: Verify structured logging meets observability requirements

**Steps**:
1. Open browser console (or check server logs if backend)
2. Add reflection: `"Test logging scenario"` (21 chars)
3. Verify log entry includes:
   - Event type: `"reflection_created"`
   - User ID: (UUID)
   - Timestamp: (ISO 8601)
   - Character count: 21
   - **Does NOT include**: reflection text content (privacy)
4. Wait for recompute trigger
5. Verify log entry includes:
   - Event type: `"recompute_triggered"`
   - User ID: (UUID)
   - Trigger reason: `"reflection_added"`
   - Timestamp: (ISO 8601)

**Expected Results**:
- ✅ Reflection creation logged
- ✅ Recompute trigger logged
- ✅ No reflection text content in logs (privacy)
- ✅ All required fields present (user ID, timestamp, metadata)

**Spec Ref**: NFR-016, NFR-017, NFR-018

---

## Scenario 15: Performance Validation

**Objective**: Verify performance targets met

**Steps**:
1. Open reflection panel
2. Type: `"Performance test reflection text content here"` (46 chars)
3. **Start timer** before clicking "Add Reflection"
4. Click "Add Reflection"
5. **Stop timer** when textarea clears
6. Verify clear latency: <200ms
7. **Start timer** after textarea clears
8. Wait for toast: `"✅ Reflection added"`
9. **Stop timer**
10. Verify submission latency: <300ms p95 (repeat 20 times, check 95th percentile)
11. Verify recompute triggered within 2 seconds of submission

**Expected Results**:
- ✅ Textarea clear: <200ms (NFR-002)
- ✅ Submission latency: <300ms p95 (NFR-001)
- ✅ Recompute trigger: <2s (NFR-003)
- ✅ Panel open/close: <100ms (NFR-004)

**Spec Ref**: NFR-001, NFR-002, NFR-003, NFR-004

---

## Summary Checklist

After completing all 15 scenarios, verify:

- [ ] Panel discovery and keyboard shortcut (Scenario 1)
- [ ] Optimistic UI update and <200ms clear (Scenario 2)
- [ ] Character counter behavior (Scenario 3)
- [ ] Recency weight visual fade (Scenario 4)
- [ ] Empty state guidance (Scenario 5)
- [ ] Mobile responsive modal (Scenario 6)
- [ ] Network error handling (Scenario 7)
- [ ] Recompute failure handling (Scenario 8)
- [ ] Debouncing and rate limiting (Scenario 9)
- [ ] Concurrent multi-device adds (Scenario 10)
- [ ] Character validation (client + server) (Scenario 11)
- [ ] No editing/deleting (append-only) (Scenario 12)
- [ ] AI prompt injection (Scenario 13)
- [ ] Logging and observability (Scenario 14)
- [ ] Performance targets met (Scenario 15)

**All scenarios passing** = Feature ready for production ✅

---

**Quickstart Guide Complete**: 2025-10-16
