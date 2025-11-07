# T001: Manual Test Guide - Minimum Viewport (320px)

**Feature**: Mobile-First Transformation
**Task ID**: T001
**Objective**: Verify all content accessible without horizontal scroll on smallest viewport (320px - iPhone SE 1st gen)
**Reference**: `specs/012-mobile-first-transformation/quickstart.md` § T001

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
4. Set dimensions: **320×568px**
5. Set zoom: **100%**
6. Throttling: **No throttling**

**Safari:**
1. Enable Developer menu: Safari > Preferences > Advanced > Show Develop menu
2. Develop > Enter Responsive Design Mode: `Cmd+Opt+R`
3. Set dimensions: **320×568px**

---

## Test Scenarios

### S001-1: Header Section

**Objective**: Verify header content accessible without horizontal scroll.

**Steps:**
1. Navigate to http://localhost:3000
2. View header section (top of page)
3. Inspect layout with DevTools

**Pass Criteria:**
- [ ] ✅ No horizontal scrollbar appears
- [ ] ✅ All header buttons visible ("Reflections", "Outcome", "Upload")
- [ ] ✅ Button text labels visible (may stack on separate rows if needed)
- [ ] ✅ Document count badge visible (wraps to new row if needed, not cut off)
- [ ] ✅ Theme toggle visible and tappable

**Expected Behavior**:
Content stacks vertically using `flex-col` layout. All elements fit within 320px width with no content hidden or truncated.

**Verification Method**:
- Visual: Check for horizontal scrollbar at bottom of viewport
- DevTools: Right-click header → Inspect → Check `width` in Computed tab (should be ≤320px)

---

### S001-2: Upload Card

**Objective**: Verify upload card content fits and remains readable.

**Steps:**
1. Scroll down to upload section (main content area)
2. View upload card/drop zone
3. Inspect text and icon sizing

**Pass Criteria:**
- [ ] ✅ Upload card fits within 320px width (no horizontal overflow)
- [ ] ✅ "Upload your documents" heading fully visible
- [ ] ✅ Upload icon centered and properly sized
- [ ] ✅ File type hints ("PDF, DOCX, TXT, MD") fully readable (no text cut off)
- [ ] ✅ Card padding appropriate (content not cramped against edges)

**Expected Behavior**:
Card content scales down gracefully using responsive padding and font sizes. Text remains readable at 14px minimum.

**Verification Method**:
- Visual: Read all text without zooming
- DevTools: Inspect card element → Check `max-width: 95vw` or similar responsive class applied

---

### S001-3: Button Touch Targets

**Objective**: Verify all buttons meet 44×44px minimum touch target (WCAG AAA).

**Steps:**
1. Locate any button ("Reflections", "Outcome", "Choose File")
2. Tap the button with mouse/touch simulation
3. Inspect button dimensions in DevTools

**Pass Criteria:**
- [ ] ✅ Button height ≥44px (use DevTools → Computed tab → `height`)
- [ ] ✅ Tap triggers action without zooming
- [ ] ✅ Visible tap feedback appears (button scales to 98% + brightness reduction)
- [ ] ✅ No accidental double-tap zoom occurs (`touch-action: manipulation` applied)
- [ ] ✅ Button fully tappable (entire 44px area responsive, not just text)

**Expected Behavior**:
All buttons use `h-11` class (44px) on mobile viewports (<640px). Tap feedback animations visible via `active:scale-[0.98]` and `active:brightness-95`.

**Verification Method**:
1. Right-click button → Inspect
2. Check Computed tab:
   - `height: 44px` (or `2.75rem`)
   - `touch-action: manipulation`
3. Click button and hold → observe scale animation
4. Check Styles tab for classes: `h-11`, `active:scale-[0.98]`, `active:brightness-95`

---

## Pass/Fail Checklist

Complete all scenarios before marking T001 as PASS:

### Overall Test Status
- [ ] S001-1: Header Section (PASS/FAIL)
- [ ] S001-2: Upload Card (PASS/FAIL)
- [ ] S001-3: Button Touch Targets (PASS/FAIL)

### Critical Issues (any FAIL = test FAIL)
- [ ] No horizontal scrollbar present
- [ ] All buttons ≥44px height
- [ ] All text readable without zoom

### Test Result
- [ ] **PASS** - All scenarios passed, ready for next task
- [ ] **FAIL** - Issues detected, see notes below

---

## Troubleshooting

### Issue: Horizontal Scrollbar Appears

**Cause**: Fixed-width element or padding overflow exceeds 320px.

**Debug Steps:**
1. Open DevTools → Elements tab
2. Hover over elements in DOM tree
3. Find element with `width > 320px` highlighted
4. Inspect element's CSS

**Solution**: Replace fixed width with responsive classes:
```tsx
// Before (problematic):
<div style="width: 400px">...</div>

// After (responsive):
<div className="w-full max-w-[95vw]">...</div>
```

### Issue: Button Height < 44px

**Cause**: Missing mobile height class or desktop override applied too early.

**Debug Steps:**
1. Inspect button → Styles tab
2. Check for `h-11` class (should be present)
3. Check for `sm:h-9` class (should NOT apply at 320px)

**Solution**: Ensure button component uses mobile-first sizing:
```tsx
<Button className="h-11 sm:h-9">Label</Button>
```

### Issue: Text Labels Cut Off

**Cause**: Insufficient padding or fixed min-width on container.

**Solution**: Apply responsive padding:
```tsx
<div className="px-3 sm:px-6">Content</div>
```

---

## Notes Section

Use this space to record observations during testing:

**Test Date**: _______________
**Tester**: _______________
**Browser**: Chrome / Safari / Edge / Firefox
**Device Simulation**: Chrome DevTools / Safari Responsive / Real Device

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

✅ **T001 Test PASSES** when:
1. All 3 scenarios (S001-1, S001-2, S001-3) pass
2. No horizontal scrollbar present at 320px viewport
3. All buttons meet 44px minimum touch target
4. All text readable without zooming
5. Content stacks vertically without overflow

**Next Step**: Proceed to T002 (Standard Mobile 375px Test Guide)

---

## Related Documentation

- Quickstart Guide: `specs/012-mobile-first-transformation/quickstart.md`
- Feature Spec: `specs/012-mobile-first-transformation/spec.md` (FR-001, FR-002, FR-003)
- Tasks List: `specs/012-mobile-first-transformation/tasks.md` (T001)
- Implementation Plan: `specs/012-mobile-first-transformation/plan.md`

---

*Test guide created for mobile-first transformation vertical slice implementation.*
