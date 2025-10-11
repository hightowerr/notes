# Quickstart Guide: Outcome Management

**Feature**: Outcome Management
**Date**: 2025-10-11
**Purpose**: Manual testing scenarios for verifying complete feature functionality

## Prerequisites

1. **Database Migration Applied**
   ```bash
   # Apply migration 004
   cd supabase
   # Run SQL in Supabase Dashboard SQL Editor or via CLI
   # Content: specs/002-outcome-management-shape/data-model.md (migration script section)
   ```

2. **Dev Server Running**
   ```bash
   npm run dev
   # App accessible at http://localhost:3000
   ```

3. **Browser DevTools Open**
   - Console tab (for logs)
   - Application tab → Local Storage (for draft inspection)
   - Network tab (for API calls)

---

## Scenario 1: First-Time Outcome Creation

**Goal**: Verify user can create their first outcome statement from scratch

### Steps

1. **Open App** (no outcome set yet)
   - Navigate to `http://localhost:3000`
   - **Expected**: No outcome banner visible at top

2. **Open Outcome Builder**
   - Click "Set Outcome" button or link (location TBD during implementation)
   - **Expected**: Modal/page displays with 4-field form

3. **Fill Form Fields**
   - Direction: Select "Increase" from dropdown
   - Object: Type "monthly recurring revenue"
   - Metric: Type "25% within 6 months"
   - Clarifier: Type "enterprise customer acquisition"

4. **Observe Real-Time Preview**
   - **Expected**: Preview updates as you type (within 1 second of last keystroke)
   - **Preview Text**: "Increase the monthly recurring revenue by 25% within 6 months through enterprise customer acquisition"

5. **Submit Form**
   - Click "Set Outcome Statement" button
   - **Expected**:
     - Success toast appears: "✅ Outcome updated. Re-scoring N actions..."
     - Modal closes (if modal) or redirects (if page)
     - Network tab shows: `POST /api/outcomes` → 201 response

6. **Verify Display**
   - **Expected**: Outcome banner now visible at top of page
   - **Banner Text**: "🎯 Increase the monthly recurring revenue by 25% within 6 months through enterprise customer acquisition"
   - **Edit Icon**: ✏️ icon visible next to outcome text

7. **Verify Database**
   - Check Supabase → `user_outcomes` table
   - **Expected**:
     - 1 row with `is_active = true`
     - `assembled_text` matches preview
     - `created_at` timestamp is recent

8. **Verify Recompute Job** (check console logs)
   - **Expected**: Console log: `[Recompute] Queued job for outcome {id}, {count} actions`

### Success Criteria
- ✅ Form fields validate correctly (min 3 chars)
- ✅ Preview updates within <1000ms
- ✅ Outcome persists to database
- ✅ Banner displays on all pages
- ✅ Recompute job enqueued

---

## Scenario 2: Edit Existing Outcome

**Goal**: Verify user can edit and replace active outcome with confirmation

### Prerequisites
- Scenario 1 completed (active outcome exists)

### Steps

1. **Open Edit Modal**
   - Click ✏️ icon next to outcome in banner
   - **Expected**: Modal opens with 4 fields pre-filled from existing outcome

2. **Modify Fields**
   - Direction: Change from "Increase" → "Decrease"
   - Object: Change from "monthly recurring revenue" → "customer churn rate"
   - Metric: Leave as "25% within 6 months" (unchanged)
   - Clarifier: Change from "enterprise customer acquisition" → "proactive onboarding support"

3. **Observe Preview Update**
   - **Expected**: Preview updates to: "Decrease the customer churn rate by 25% within 6 months through proactive onboarding support"

4. **Submit Form**
   - Click "Update Outcome" button
   - **Expected**: Confirmation dialog appears

5. **Confirmation Dialog**
   - **Dialog Title**: "Replace existing outcome?"
   - **Dialog Text**: "This will replace your current outcome statement. Previous outcome will be deleted (not archived)."
   - **Actions**: "Cancel" | "Yes, Replace"

6. **Confirm Replacement**
   - Click "Yes, Replace" button
   - **Expected**:
     - Dialog closes
     - Success toast: "✅ Outcome updated. Re-scoring N actions..."
     - Network tab shows: `POST /api/outcomes` → 200 response

7. **Verify Updated Display**
   - **Expected**: Banner text updated to new outcome
   - **Banner Text**: "🎯 Decrease the customer churn rate by 25% within 6 months through proactive onboarding support"

8. **Verify Database**
   - Check Supabase → `user_outcomes` table
   - **Expected**:
     - Old outcome: `is_active = false` OR deleted (implementation choice)
     - New outcome: `is_active = true`, `updated_at` timestamp is recent

9. **Test Cancel Flow**
   - Click ✏️ icon again
   - Make changes
   - Click "Update Outcome"
   - Click "Cancel" in confirmation dialog
   - **Expected**: Dialog closes, no API call, outcome unchanged

### Success Criteria
- ✅ Edit modal pre-fills existing values
- ✅ Confirmation dialog prevents accidental replacement
- ✅ Cancel button works (no API call)
- ✅ Replacement succeeds and updates display
- ✅ Old outcome deactivated/deleted

---

## Scenario 3: Draft Recovery After Accidental Close

**Goal**: Verify drafts are saved to localStorage and recoverable within 24 hours

### Steps

1. **Open Outcome Builder**
   - Click "Set Outcome" or ✏️ icon (if outcome exists)
   - **Expected**: Form opens empty or pre-filled

2. **Fill Partial Data** (do NOT submit)
   - Direction: Select "Launch"
   - Object: Type "beta product to 50 users"
   - Metric: Type "by Q2"
   - Clarifier: Type "targeted outreach" (partial, <3 chars OK for draft)

3. **Close Modal Accidentally**
   - Click outside modal (if using modal) OR close tab (if using page)
   - **Expected**: No save confirmation (draft auto-saves)

4. **Verify Draft in localStorage**
   - DevTools → Application → Local Storage → `http://localhost:3000`
   - **Key**: `outcome_draft_v1`
   - **Value**: JSON with `{ direction, object, metric, clarifier, expiresAt }`
   - **expiresAt**: Timestamp ~24 hours in future

5. **Reopen Outcome Builder** (within 24 hours)
   - Click "Set Outcome" or ✏️ icon
   - **Expected**: Prompt appears: "Resume editing?"
   - **Actions**: "Yes" | "No"

6. **Resume Draft**
   - Click "Yes" button
   - **Expected**:
     - All 4 fields restore from draft
     - Preview shows assembled text from draft

7. **Submit Resumed Draft**
   - Add clarifier to meet 3-char minimum: "targeted outreach campaigns"
   - Click "Set Outcome Statement"
   - **Expected**:
     - Outcome saves successfully
     - Draft removed from localStorage

8. **Test Expiry** (simulate 24+ hours)
   - Manually edit `expiresAt` in localStorage to past timestamp
   - Reopen Outcome Builder
   - **Expected**: No "Resume editing?" prompt, fresh form

9. **Test "No" Button**
   - Create another draft (don't save)
   - Close modal
   - Reopen → Click "No" on resume prompt
   - **Expected**: Draft cleared from localStorage, fresh form

### Success Criteria
- ✅ Draft saved to localStorage on modal close
- ✅ Draft includes expiresAt timestamp
- ✅ Resume prompt appears within 24 hours
- ✅ Fields restore correctly on resume
- ✅ Draft cleared after successful save
- ✅ Expired drafts ignored (no prompt)

---

## Scenario 4: "Launch" Direction Article Omission

**Goal**: Verify "Launch" and "Ship" directions omit "the" article in assembled text

### Steps

1. **Open Outcome Builder**

2. **Fill Form with Launch Direction**
   - Direction: Select "Launch"
   - Object: Type "beta product to 50 early adopters"
   - Metric: Type "by Q2 2025"
   - Clarifier: Type "product hunt campaign"

3. **Verify Preview**
   - **Expected Preview**: "Launch beta product to 50 early adopters by by Q2 2025 through product hunt campaign"
   - **Note**: "the" article should NOT appear after "Launch"

4. **Submit and Verify Database**
   - Save outcome
   - Check `assembled_text` in database
   - **Expected**: Matches preview (no "the" article)

5. **Test Ship Direction**
   - Edit outcome
   - Change Direction to "Ship"
   - **Expected Preview**: "Ship beta product to 50 early adopters..."
   - **Note**: Still no "the" article

6. **Test Increase Direction** (control test)
   - Edit outcome
   - Change Direction to "Increase"
   - **Expected Preview**: "Increase **the** beta product to 50 early adopters..."
   - **Note**: "the" article should appear

### Success Criteria
- ✅ Launch direction omits "the" article
- ✅ Ship direction omits "the" article
- ✅ Increase/Decrease/Maintain include "the" article

---

## Scenario 5: Validation Errors

**Goal**: Verify client-side and server-side validation with helpful error messages

### Steps

1. **Test Object Too Short**
   - Direction: "Increase"
   - Object: "ab" (2 chars)
   - Metric: "50% in Q1"
   - Clarifier: "new marketing strategy"
   - **Expected**: Error message below Object field: "Object must be at least 3 characters"
   - **Expected**: Save button disabled OR submit shows error toast

2. **Test Object Too Long**
   - Object: Type 101+ characters
   - **Expected**: Input field prevents typing beyond 100 chars OR shows error

3. **Test Empty Fields**
   - Leave Object field empty
   - Try to submit
   - **Expected**: Error message: "Object must be at least 3 characters"

4. **Test Metric Edge Case** (valid non-numeric metric per FR-009)
   - Metric: "by Q2" (no percentage, still valid)
   - **Expected**: Validation passes (FR-009 allows binary outcomes)

5. **Test Clarifier Max Length**
   - Clarifier: Type exactly 150 characters
   - **Expected**: Validation passes
   - Clarifier: Type 151 characters
   - **Expected**: Input prevents OR shows error

6. **Test Server-Side Validation** (if client validation bypassed)
   - Use DevTools Network tab to modify request
   - Send POST /api/outcomes with `{ object: "ab" }`
   - **Expected**: 400 response with validation details

### Success Criteria
- ✅ Client-side validation prevents invalid submissions
- ✅ Error messages are field-specific and helpful
- ✅ Server-side validation catches bypassed client checks
- ✅ Character limits enforced (100/100/150)

---

## Scenario 6: Recompute Job Failure Handling

**Goal**: Verify user sees toast warning if recompute fails permanently

### Prerequisites
- Mock recompute service to throw error after retries

### Steps

1. **Create Outcome** (triggers recompute)
   - Fill form and submit
   - **Expected**: Success toast shows immediately

2. **Simulate Recompute Failure** (requires dev intervention)
   - In `lib/services/recomputeService.ts`, force `throw new Error('Mock failure')`
   - Wait for 3 retry attempts (1s, 2s, 4s = ~7s total)

3. **Verify Failure Toast**
   - **Expected**: After ~7 seconds, toast appears:
     - "⚠️ Some actions may show outdated scores"
   - **Note**: Original success toast already dismissed

4. **Verify Console Logs**
   - **Expected**: Error logs in console:
     - `[Recompute] Failed for outcome {id}: Mock failure`
     - `[Recompute] Retry attempt 1/3...`
     - `[Recompute] Retry attempt 2/3...`
     - `[Recompute] Retry attempt 3/3...`
     - `[Recompute] Permanent failure after 3 retries`

5. **Verify Database State**
   - **Expected**: Outcome still saved successfully (recompute failure doesn't rollback outcome save)

### Success Criteria
- ✅ User sees immediate success for outcome save
- ✅ Background recompute failure doesn't block save
- ✅ Retry logic attempts 3 times with backoff
- ✅ User notified of failure via toast warning

---

## Scenario 7: Mobile Responsive Design

**Goal**: Verify form layout adapts correctly on mobile devices

### Steps

1. **Open DevTools Device Emulation**
   - Toggle device toolbar (Ctrl+Shift+M)
   - Select "iPhone 12 Pro" or similar (390x844)

2. **Open Outcome Builder**
   - **Expected**:
     - 4 fields stacked vertically (no horizontal scroll)
     - Preview fixed at bottom (sticky)
     - Direction options as segmented control (not dropdown)

3. **Test Touch Interactions**
   - Tap each field → keyboard appears
   - Type in each field
   - **Expected**: No zoom on input focus (viewport meta tag correct)

4. **Test Preview Sticky Behavior**
   - Scroll down (if modal/page is scrollable)
   - **Expected**: Preview stays visible at bottom

5. **Test Keyboard Navigation**
   - Tap Object field
   - Press "Next" on mobile keyboard
   - **Expected**: Focus moves to Metric field (then Clarifier, then Save button)

6. **Test Submit on Mobile**
   - Fill form and submit
   - **Expected**: Same behavior as desktop (toast, banner update)

### Success Criteria
- ✅ No horizontal scroll required
- ✅ All fields accessible without zoom
- ✅ Preview remains visible (sticky)
- ✅ Direction control adapts to segmented UI
- ✅ Keyboard "Next" navigation works

---

## Scenario 8: Multi-Page Outcome Display

**Goal**: Verify outcome banner appears consistently across all pages

### Steps

1. **Create Outcome** (if not already)
   - Follow Scenario 1 steps

2. **Navigate to Home Page** (`/`)
   - **Expected**: Outcome banner visible at top
   - **Banner**: "🎯 [assembled_text]" with ✏️ icon

3. **Navigate to Dashboard** (`/dashboard`)
   - **Expected**: Same outcome banner visible

4. **Navigate to Any Other Page** (TBD based on app routes)
   - **Expected**: Outcome banner persists

5. **Test Banner Click**
   - Click anywhere on banner text (not edit icon)
   - **Expected**: No action (banner is display-only, edit via icon)

6. **Test Edit from Different Pages**
   - On Dashboard: Click ✏️ icon → modal opens
   - On Home: Click ✏️ icon → modal opens
   - **Expected**: Edit modal works consistently from any page

### Success Criteria
- ✅ Banner appears on all pages
- ✅ Edit icon functional from any page
- ✅ Banner styling consistent across pages
- ✅ No duplicate banners (single shared component)

---

## Performance Validation

### Target Metrics (from NFR-001, NFR-002)

1. **Preview Assembly Latency**
   - **Target**: <1000ms from last keystroke to visible update
   - **Test**: Use DevTools Performance tab to measure render time after typing
   - **Pass Condition**: 95% of updates complete within 1000ms

2. **Outcome Save Operation**
   - **Target**: <2000ms under normal network conditions
   - **Test**: Network tab shows `POST /api/outcomes` request/response time
   - **Pass Condition**: API response within 2000ms (excluding slow 3G simulation)

3. **Recompute Job Duration** (informational, not blocking)
   - **Target**: <30s for 100 actions
   - **Test**: Console logs show start/end timestamps
   - **Pass Condition**: Advisory only (doesn't block user)

---

## Summary

**Total Scenarios**: 8 core + 1 performance validation

**Coverage**:
- ✅ Create, edit, delete flows
- ✅ Draft persistence and recovery
- ✅ Validation (client + server)
- ✅ Article omission logic
- ✅ Confirmation dialog
- ✅ Error handling and retry
- ✅ Mobile responsiveness
- ✅ Multi-page display

**Next Steps**:
1. Execute scenarios in order
2. Document any failures in GitHub issues
3. Re-test after bug fixes
4. Mark feature as production-ready when all scenarios pass
