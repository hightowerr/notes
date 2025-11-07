# T003: Manual Test Guide - Tablet Portrait (768px)

**Feature**: Mobile-First Transformation
**Task ID**: T003
**Objective**: Verify tablet-friendly layout without activating desktop multi-column grids prematurely
**Reference**: `specs/012-mobile-first-transformation/quickstart.md` § T003

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
4. Set dimensions: **768×1024px**
5. Set zoom: **100%**
6. Throttling: **No throttling**

**Safari:**
1. Enable Developer menu: Safari > Preferences > Advanced > Show Develop menu
2. Develop > Enter Responsive Design Mode: `Cmd+Opt+R`
3. Set dimensions: **768×1024px**

---

## Test Scenarios

### S003-1: Header Layout

**Objective**: Verify header transitions to desktop layout (sm: breakpoint) while maintaining functionality.

**Steps:**
1. Navigate to http://localhost:3000
2. View header section at top of page
3. Inspect button layout and sizing

**Pass Criteria:**
- [ ] ✅ Header buttons display in horizontal row (`sm:flex-row` activated)
- [ ] ✅ Button heights: 36px (`sm:h-9` - desktop sizing)
- [ ] ✅ Document count badge inline (not wrapped to separate row)
- [ ] ✅ Theme toggle visible and positioned inline
- [ ] ✅ No horizontal scroll required
- [ ] ✅ Button spacing appropriate (gap between elements ≥8px)
- [ ] ✅ All header content fits within 768px width

**Expected Behavior**:
Header transitions to compact desktop layout at 640px+ breakpoint (sm:). Buttons use desktop sizing (36px height) instead of mobile sizing (44px). Layout changes from vertical stack to horizontal row.

**Verification Method**:
1. Right-click header → Inspect
2. Check Computed tab:
   - Container: `flex-direction: row` (not column)
   - Buttons: `height: 36px` (not 44px)
3. Verify Classes tab shows:
   - `sm:flex-row` class applied
   - `sm:h-9` class applied to buttons
4. Visual: All header elements in single horizontal row

---

### S003-2: Task Grid (Still Single Column)

**Objective**: Verify task grid remains single-column (multi-column grid NOT activated yet).

**Steps:**
1. Navigate to http://localhost:3000/priorities
2. View task grid layout
3. Check grid column count

**Pass Criteria:**
- [ ] ✅ Tasks still display in **single-column** layout (`grid-cols-1`)
- [ ] ✅ Multi-column grid **does not** activate (requires ≥1024px)
- [ ] ✅ Each task card wider than mobile (more breathing room)
- [ ] ✅ Card spacing appropriate (vertical gap maintained)
- [ ] ✅ No horizontal scroll required
- [ ] ✅ Cards centered or left-aligned (not spanning multiple columns)

**Expected Behavior**:
Single-column layout preserved until 1024px breakpoint (lg:). This viewport (768px) falls between mobile (375px) and desktop (1024px), so grid should remain single-column for optimal readability on tablets.

**Verification Method**:
1. Visual: Count task cards per row (should be exactly 1)
2. DevTools: Inspect grid container
3. Check Computed tab:
   - `grid-template-columns: 1fr` (single column)
   - NOT `grid-template-columns: repeat(2, 1fr)` or higher
4. Verify Classes tab:
   - `grid-cols-1` present
   - `lg:grid-cols-2` or `lg:grid-cols-3` present but NOT active
5. Resize to 1023px → should remain single column
6. Resize to 1024px → should activate multi-column (test boundary)

---

### S003-3: Modal Desktop Sizing

**Objective**: Verify modals use desktop sizing (80vh height, 24px padding, 14px font).

**Steps:**
1. Navigate to http://localhost:3000
2. Tap **Outcome** button to open modal
3. Inspect modal dimensions and input styling

**Pass Criteria:**
- [ ] ✅ Modal height: 80vh (≤819px of 1024px viewport height)
- [ ] ✅ Padding: 24px (`sm:p-6` - desktop sizing)
- [ ] ✅ Input font size: 14px (`sm:text-sm` - desktop sizing)
- [ ] ✅ Input height: 40px (`sm:h-10` - desktop sizing)
- [ ] ✅ Radio button groups display horizontally (if width ≥475px)
- [ ] ✅ Modal scrollable if content exceeds height
- [ ] ✅ Close button (X) functional and positioned correctly

**Expected Behavior**:
Desktop modal styling activates at 640px+ breakpoint (sm:). Modal has more padding and breathing room compared to mobile. Inputs use desktop density (14px font, 40px height) instead of mobile sizing.

**Verification Method**:
1. Right-click modal → Inspect
2. Check Computed tab:
   - `max-height: 80vh` or equivalent ≤819px (80% of 1024px)
   - `padding: 24px` (or `1.5rem`)
3. Inspect input fields:
   - `height: 40px` (or `2.5rem`) - NOT 48px
   - `font-size: 14px` (or `0.875rem`) - NOT 16px
4. Verify Classes tab:
   - Modal: `sm:max-h-[80vh]` active, `sm:p-6` active
   - Inputs: `sm:h-10` active, `sm:text-sm` active
5. Test iOS zoom: Tapping input should NOT zoom (16px minimum prevents zoom, but 14px at this width is acceptable for tablets)

---

## Pass/Fail Checklist

Complete all scenarios before marking T003 as PASS:

### Overall Test Status
- [ ] S003-1: Header Layout (PASS/FAIL)
- [ ] S003-2: Task Grid Still Single Column (PASS/FAIL)
- [ ] S003-3: Modal Desktop Sizing (PASS/FAIL)

### Critical Breakpoint Validation
- [ ] sm: breakpoint (640px) active → desktop sizing applies
- [ ] lg: breakpoint (1024px) NOT active → grids remain single-column
- [ ] Header horizontal layout active (sm:flex-row)
- [ ] Button heights = 36px (sm:h-9)

### Tablet-Specific Checks
- [ ] No layout shift when resizing 767px ↔ 768px
- [ ] Content comfortably readable (not cramped like mobile, not sprawling like desktop)
- [ ] Touch targets adequate (buttons clickable without difficulty)

### Test Result
- [ ] **PASS** - All scenarios passed, ready for next task
- [ ] **FAIL** - Issues detected, see notes below

---

## Troubleshooting

### Issue: Multi-Column Grid Activates Too Early

**Cause**: Using `md:grid-cols-2` or `sm:grid-cols-2` instead of `lg:grid-cols-2`.

**Debug Steps:**
1. Inspect grid container → Styles tab
2. Check breakpoint prefixes on `grid-cols-*` classes
3. Verify which breakpoint activates multi-column

**Solution**: Ensure grids use `lg:` prefix (1024px):
```tsx
// Incorrect (activates too early)
<div className="grid grid-cols-1 md:grid-cols-2 gap-4">

// Correct (activates at 1024px)
<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
```

### Issue: Header Still Vertical

**Cause**: Missing `sm:flex-row` class or incorrect breakpoint.

**Debug Steps:**
1. Inspect header container → Styles tab
2. Check for `flex-col` and `sm:flex-row` classes
3. Verify `sm:` breakpoint active at 768px (should be, since 768 > 640)

**Solution**: Update header layout:
```tsx
<div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
```

### Issue: Buttons Still 44px Height

**Cause**: Missing `sm:h-9` responsive class on buttons.

**Debug Steps:**
1. Inspect any button → Styles tab
2. Check for both `h-11` and `sm:h-9` classes
3. Verify `sm:h-9` is NOT crossed out (should be active at 768px)

**Solution**: Ensure Button component has responsive height:
```tsx
<Button className="h-11 sm:h-9">Label</Button>
```

### Issue: Modal Still Using Mobile Sizing

**Cause**: Missing `sm:` responsive classes on Dialog component.

**Debug Steps:**
1. Inspect modal → Styles tab
2. Check for `max-h-[95vh]` and `sm:max-h-[80vh]`
3. Verify `sm:max-h-[80vh]` active at 768px (not crossed out)
4. Check padding: should have both `p-3` and `sm:p-6`

**Solution**: Update Dialog component:
```tsx
<DialogContent className="max-h-[95vh] sm:max-h-[80vh] p-3 sm:p-6">
```

---

## Breakpoint Reference

For troubleshooting, here's the Tailwind CSS breakpoint system:

| Prefix | Min Width | Description |
|--------|-----------|-------------|
| (default) | 0px | Mobile-first base styles |
| `sm:` | 640px | Small tablets and large phones (landscape) |
| `md:` | 768px | Tablets (portrait) |
| `lg:` | 1024px | Desktops and tablets (landscape) |
| `xl:` | 1280px | Large desktops |
| `2xl:` | 1536px | Extra large desktops |

**At 768px viewport:**
- ✅ `sm:` prefix classes ARE active (768 ≥ 640)
- ❌ `lg:` prefix classes are NOT active (768 < 1024)

---

## Notes Section

Use this space to record observations during testing:

**Test Date**: _______________
**Tester**: _______________
**Browser**: Chrome / Safari / Edge / Firefox
**Device Simulation**: Chrome DevTools / Safari Responsive / Real iPad Mini

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

✅ **T003 Test PASSES** when:
1. All 3 scenarios (S003-1 through S003-3) pass
2. Header uses desktop horizontal layout (sm:flex-row)
3. Button heights = 36px (sm:h-9 active)
4. Task grids remain single-column (lg: NOT active yet)
5. Modals use desktop sizing (80vh, 24px padding, 14px font)
6. No horizontal scroll on any page

**Next Step**: Proceed to T004 (Desktop Regression 1024px+ Test Guide)

---

## Related Documentation

- Quickstart Guide: `specs/012-mobile-first-transformation/quickstart.md`
- Feature Spec: `specs/012-mobile-first-transformation/spec.md`
- Tasks List: `specs/012-mobile-first-transformation/tasks.md` (T003)
- Implementation Plan: `specs/012-mobile-first-transformation/plan.md`
- Tailwind Breakpoints: https://tailwindcss.com/docs/responsive-design

---

*Test guide created for mobile-first transformation vertical slice implementation.*
