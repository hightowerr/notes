# Outcome Management Manual Test Guide (T019)

## Purpose
Validate the end-to-end outcome management experience in a real browser, confirming users can create, edit, recover, and rely on outcome statements across the app with accessible, responsive UI and resilient feedback.

## Environment & Setup
- **Branch**: `002-outcome-management-shape`
- **Build**: `npm run build && npm run start` (or `npm run dev` for local iteration)
- **Supabase**: Ensure local project seeded with `supabase/migrations/004_create_user_outcomes.sql`
- **Test Account**: Default single-user context (`default-user`) – no auth flows required
- **Browser**: Latest Chrome or Edge; enable DevTools for mobile emulation and performance metrics
- **Reset State**: Clear `user_outcomes` table between runs if needed (`DELETE FROM user_outcomes WHERE user_id = 'default-user';`)

## Scenario 1 – First-Time Outcome Creation
1. Navigate to `/`.
2. Click **Set Outcome** to open the modal.
3. Fill fields:
   - Direction: Increase
   - Object: monthly recurring revenue
   - Metric: 25% within 6 months
   - Clarifier: enterprise customer acquisition
4. Observe preview update live.
5. Submit via **Set Outcome Statement**.
6. Confirm toast: `✅ Outcome created successfully. Re-scoring N actions...`.
7. Verify modal closes, draft cleared, and header banner displays assembled statement with 🎯 icon.

## Scenario 2 – Edit Existing Outcome with Confirmation
1. With an active outcome, click the ✏️ icon on the banner.
2. Update fields (e.g., change Metric to `40% within 4 months`).
3. Submit via **Update Outcome**.
4. Confirm toast: `✅ Outcome updated. Re-scoring N actions...`.
5. Check banner reflects new text immediately.
6. Inspect Supabase: previous outcome `is_active = false`, new outcome `is_active = true`.

## Scenario 3 – Draft Recovery After Accidental Close
1. Open modal and enter partial data.
2. Close modal without saving (press **Cancel** or ⓧ).
3. Re-open modal within 24 hours.
4. Expect draft prompt: “You have an unsaved draft…”.
5. Choose **Yes** to resume → fields repopulated.
6. Choose **No** in a separate run to ensure draft clears.

## Scenario 4 – Launch/Ship Article Omission
1. Open modal, set Direction to **Launch**.
2. Enter:
   - Object: beta product to 50 users
   - Metric: by Q2
   - Clarifier: targeted outreach
3. Verify preview reads “Launch beta product to 50 users by Q2 through targeted outreach” (no “the”).
4. Save and confirm banner + database entry omit “the”.

## Scenario 5 – Validation Errors & Character Limits
1. Attempt submit with empty fields → field errors (`must be at least 3 characters`).
2. Enter 101+ chars in Object; ensure input stops at 100.
3. Metric: enter single character → error persists.
4. Clarifier: exceed 150 chars → input stops at limit.
5. Use DevTools to tamper POST payload (e.g., object `"ab"`) → API responds 400 with validation details.

## Scenario 6 – Recompute Failure Warning
1. Temporarily force `throw new Error('Mock failure')` at start of `recomputeService.executeJob`.
2. Save outcome to trigger recompute.
3. Wait ~7 seconds (retries at 1s, 2s, 4s).
4. Expect console logs showing retries and permanent failure.
5. Confirm toast warning: `⚠️ Some actions may show outdated scores`.
6. Restore service code after validation.

## Scenario 7 – Mobile Responsive Workflow
1. Enable device emulation (e.g., iPhone 12 Pro 390×844).
2. Open modal.
3. Validate:
   - Fields stacked vertically, no horizontal scroll.
   - Direction rendered as segmented control.
   - Preview stays sticky at bottom while scrolling.
4. Test touch inputs, “Next” keyboard navigation, and submit flow.
5. Confirm toasts and banner behave as desktop.

## Scenario 8 – Cross-Page Banner Consistency
1. Ensure outcome exists.
2. Visit `/`, `/dashboard`, and any other routed pages.
3. Confirm banner visible on each, with identical styling.
4. Click banner text (no action) and ✏️ icon (modal opens) on every page.
5. Ensure only a single banner instance renders per page.

## Performance Validation (Informational)
1. Capture typing in OutcomeBuilder with DevTools Performance tab → preview updates <1000ms (NFR-001).
2. Measure `POST /api/outcomes` in Network tab → response <2000ms under normal conditions (NFR-002).
3. Note recompute console logs for completion duration (<30s for ~100 actions).

## Recording Results
- Log outcomes per scenario (Pass/Fail, notes, screenshots) in QA tracker or issue comments.
- File issues with reproduction steps for any failures; include console/network traces where relevant.
- Re-run impacted scenarios after fixes and update this guide if behavior changes.

## Completion Criteria
- All eight scenarios plus performance checks pass without regression.
- Toasts, banners, and database state align with expectations.
- Accessibility basics verified (keyboard focus, visible indicators, touch targets).
- Outstanding issues documented and assigned.
