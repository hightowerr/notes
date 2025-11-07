# T002: Manual Test Guide - Standard Mobile (375px)

**Feature**: Mobile-First Transformation
**Task ID**: T002
**Objective**: Validate optimal mobile UX on most common viewport (iPhone SE 3rd gen, iPhone 12/13 Mini)
**Reference**: `specs/012-mobile-first-transformation/quickstart.md` § T002

---

## Test Environment Setup

### Prerequisites
- Development server running: `npm run dev`
- Browser: Chrome/Edge (recommended) or Safari
- Target URL: http://localhost:3000

### Configure DevTools Responsive Mode

**Chrome/Edge:**
1. Open DevTools: `Cmd+Opt+I` (Mac) or `Ctrl+Shift+I` (Windows/Linux)
2. Toggle Device Toolbar: `Cmd+Shift+M` (Mac) or `Ctrl+Shift+M` (Windows/Linux)
3. Select **Responsive** mode
4. Set dimensions: **375×667px**
5. Set zoom: **100%**
6. Throttling: **No throttling**

**Safari:**
1. Enable Developer menu: Safari > Preferences > Advanced > Show Develop menu
2. Develop > Enter Responsive Design Mode: `Cmd+Opt+R`
3. Set dimensions: **375×667px**

---

## Test Scenarios

### S002-1: Document Upload Flow

**Objective**: Verify complete upload flow displays in single-column layout without overflow.

**Steps:**
1. Navigate to http://localhost:3000
2. Prepare a test PDF file (e.g., `sample.pdf`)
3. Upload using either method:
   - Click **Choose File** button
   - Or drag file to upload card
4. Monitor upload progress

**Pass Criteria:**
- [ ] ✅ Upload progress visible without horizontal scroll
- [ ] ✅ Status badges (Uploading → Processing → Complete) fully visible
- [ ] ✅ File name displayed (truncation acceptable if >30 chars, must use ellipsis)
- [ ] ✅ Summary panel appears below document card (not overlapping)
- [ ] ✅ All content in single-column layout
- [ ] ✅ No horizontal scrollbar at any stage

**Expected Behavior**:
Entire upload → processing → summary workflow displays vertically. All status updates visible without requiring horizontal scroll or zoom.

**Verification Method**:
- Visual: Monitor entire flow from upload click through summary display
- DevTools: Check for `overflow-x: hidden` or absence of horizontal scrollbar
- Functional: Complete full upload cycle successfully

---

### S002-2: Modal/Dialog Interaction

**Objective**: Verify modals optimized for mobile (95vh height, 12px padding, no iOS zoom).

**Steps:**
1. Navigate to http://localhost:3000
2. Tap **Outcome** button in header
3. OutcomeBuilder modal opens
4. Inspect modal dimensions and input fields

**Pass Criteria:**
- [ ] ✅ Modal uses ≥95% of viewport height (≥635px of 667px)
- [ ] ✅ Padding reduced to 12px (`p-3` class)
- [ ] ✅ Input fields configuration:
  - Height: 48px (`h-12`)
  - Font size: 16px (`text-base`) - prevents iOS auto-zoom
- [ ] ✅ Radio button groups stack vertically (if present)
- [ ] ✅ Close button (X) easily tappable (≥44×44px area)
- [ ] ✅ Modal scrollable if content exceeds viewport height
- [ ] ✅ Modal width ≤95% of viewport width (no horizontal overflow)

**Expected Behavior**:
Modal fills screen efficiently, maximizing visible content. Inputs don't trigger iOS zoom (16px font size critical). All interactive elements have adequate touch targets.

**Verification Method**:
1. Right-click modal → Inspect
2. Check Computed tab:
   - `max-height: 95vh` or equivalent pixel value ≥635px
   - `padding: 12px` (or `0.75rem`)
3. Inspect input fields:
   - `height: 48px` (or `3rem`)
   - `font-size: 16px` (or `1rem`)
4. Tap input field → verify page does NOT zoom

---

### S002-3: Task Grid Layout

**Objective**: Verify task grid displays in single-column layout on mobile.

**Steps:**
1. Navigate to http://localhost:3000/priorities
2. View task grid layout
3. Scroll through tasks

**Pass Criteria:**
- [ ] ✅ Tasks display in **single-column** layout (not 3-column grid)
- [ ] ✅ No horizontal scrolling required
- [ ] ✅ Each task card fully readable without zoom
- [ ] ✅ Card spacing appropriate (vertical gap ≥16px)
- [ ] ✅ Tap any task card → no layout shift or reflow
- [ ] ✅ All card content visible (titles, descriptions, metadata)

**Expected Behavior**:
Single-column layout prevents horizontal scroll and maintains readability. Tasks stack vertically with clear visual separation.

**Verification Method**:
1. Visual: Confirm only 1 task card per row
2. DevTools: Inspect grid container → verify `grid-cols-1` class
3. Check for absence of `lg:grid-cols-2` or `lg:grid-cols-3` activation
4. Horizontal scroll test: Attempt to scroll left/right (should not move)

---

### S002-4: Form Input Without Auto-Zoom

**Objective**: Verify iOS auto-zoom prevention on all form inputs.

**Steps:**
1. Navigate to http://localhost:3000
2. Test multiple input scenarios:
   - Tap **Reflections** button → tap reflection input
   - Tap **Outcome** button → tap Direction/Object/Metric inputs
   - Any other text input fields present
3. Monitor page zoom behavior

**Pass Criteria:**
- [ ] ✅ iOS does **not** auto-zoom the page on any input tap
- [ ] ✅ Input font size ≥16px on all fields (inspect with DevTools)
- [ ] ✅ Input height = 48px (`h-12`) on all fields
- [ ] ✅ Keyboard appears without layout shift
- [ ] ✅ Input remains visible above keyboard
- [ ] ✅ `touch-action: manipulation` applied (prevents double-tap zoom)

**Expected Behavior**:
16px font size on mobile inputs prevents iOS auto-zoom behavior. Page maintains zoom level when input receives focus. Keyboard overlay doesn't obscure input field.

**Verification Method**:
1. **iOS Simulation** (Chrome DevTools):
   - Open DevTools → Settings → Devices
   - Add custom device: "iPhone SE" with iOS user agent
   - Test input focus behavior
2. **Direct Inspection**:
   - Right-click input → Inspect
   - Check Computed tab:
     - `font-size: 16px` (not 14px or smaller)
     - `height: 48px`
     - `touch-action: manipulation`
3. **Real Device Test** (if available):
   - Open on actual iOS device (iPhone SE, iPhone 12/13 Mini)
   - Tap input fields → verify no zoom

---

## Pass/Fail Checklist

Complete all scenarios before marking T002 as PASS:

### Overall Test Status
- [ ] S002-1: Document Upload Flow (PASS/FAIL)
- [ ] S002-2: Modal/Dialog Interaction (PASS/FAIL)
- [ ] S002-3: Task Grid Layout (PASS/FAIL)
- [ ] S002-4: Form Input Without Auto-Zoom (PASS/FAIL)

### Critical Issues (any FAIL = test FAIL)
- [ ] No horizontal scrollbar on any page
- [ ] All inputs ≥48px height with 16px font
- [ ] Modals ≥95% viewport height (≥635px)
- [ ] Tasks display in single column

### iOS-Specific Validation
- [ ] No auto-zoom on input focus (critical for mobile UX)
- [ ] Touch targets ≥44×44px (buttons, close icons, radio buttons)
- [ ] Modal scrolling works smoothly (no stuck scroll)

### Test Result
- [ ] **PASS** - All scenarios passed, ready for next task
- [ ] **FAIL** - Issues detected, see notes below

---

## Troubleshooting

### Issue: iOS Auto-Zoom Still Occurs

**Cause**: Input font size <16px on mobile viewport.

**Debug Steps:**
1. Inspect input → Styles tab
2. Look for `text-base` class (should be present)
3. Look for `sm:text-sm` class (should NOT apply at 375px)
4. Check Computed tab → `font-size` should be exactly 16px

**Solution**: Ensure input component uses mobile-first font sizing:
```tsx
<Input className="text-base sm:text-sm h-12 sm:h-10" />
```

### Issue: Modal Height < 95%

**Cause**: Desktop max-height class applied too early or missing mobile override.

**Debug Steps:**
1. Inspect modal → Styles tab
2. Check for `max-h-[95vh]` class (should be present)
3. Check for `sm:max-h-[80vh]` class (should NOT apply at 375px)
4. Verify Computed tab → `max-height` ≥635px (95% of 667px)

**Solution**: Update Dialog component:
```tsx
<DialogContent className="max-h-[95vh] sm:max-h-[80vh] p-3 sm:p-6">
```

### Issue: Task Grid Shows Multiple Columns

**Cause**: Using `sm:grid-cols-2` instead of `lg:grid-cols-2`.

**Debug Steps:**
1. Inspect grid container → Styles tab
2. Check breakpoint prefix on grid-cols classes
3. Verify `sm:` breakpoint (640px) not activating multi-column too early

**Solution**: Use `lg:` prefix for multi-column activation:
```tsx
<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
```

### Issue: Horizontal Scrollbar Appears

**Cause**: Fixed-width element or insufficient responsive constraints.

**Debug Steps:**
1. Open DevTools → Elements tab
2. Hover over elements to find width >375px
3. Check for `min-width` or fixed `width` properties
4. Look for images or media without `max-w-full`

**Solution**: Apply responsive width constraints:
```tsx
// Fixed width (problematic)
<div style="width: 500px">...</div>

// Responsive width (correct)
<div className="w-full max-w-[95vw]">...</div>
```

---

## Notes Section

Use this space to record observations during testing:

**Test Date**: _______________
**Tester**: _______________
**Browser**: Chrome / Safari / Edge / Firefox
**Device Simulation**: Chrome DevTools / Safari Responsive / Real iOS Device

**Observations:**
-
-
-

**Issues Found:**
-
-
-

**Screenshots** (optional):
- Attach screenshots of any layout issues to feature PR

---

## Success Criteria

✅ **T002 Test PASSES** when:
1. All 4 scenarios (S002-1 through S002-4) pass
2. No horizontal scrollbar present at 375px viewport
3. All inputs prevent iOS auto-zoom (16px font size)
4. Modal height ≥95% of viewport (≥635px)
5. Task grid displays single column
6. Complete upload flow works without layout issues

**Next Step**: Proceed to T003 (Tablet Portrait 768px Test Guide)

---

## Related Documentation

- Quickstart Guide: `specs/012-mobile-first-transformation/quickstart.md`
- Feature Spec: `specs/012-mobile-first-transformation/spec.md` (FR-009 to FR-015)
- Tasks List: `specs/012-mobile-first-transformation/tasks.md` (T002)
- Implementation Plan: `specs/012-mobile-first-transformation/plan.md`

---

*Test guide created for mobile-first transformation vertical slice implementation.*
