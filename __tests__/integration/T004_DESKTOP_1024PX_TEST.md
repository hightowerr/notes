# T004: Manual Test Guide - Desktop Regression (1024px+)

**Feature**: Mobile-First Transformation
**Task ID**: T004
**Objective**: Verify zero layout changes on ≥1024px viewports (desktop parity validation)
**Reference**: `specs/012-mobile-first-transformation/quickstart.md` § T004

---

## Test Environment Setup

### Prerequisites
- Development server running: `npm run dev`
- Browser: Chrome/Edge (recommended) or Safari
- Target URL: http://localhost:3000
- **IMPORTANT**: Test on actual desktop screen or simulated 1920×1080px viewport

### Configure DevTools Responsive Mode

**Chrome/Edge:**
1. Open DevTools: `Cmd+Opt+I` (Mac) or `Ctrl+Shift+I` (Windows/Linux)
2. Toggle Device Toolbar: `Cmd+Shift+M` (Mac) or `Ctrl+Shift+M` (Windows/Linux)
3. Select **Responsive** mode
4. Set dimensions: **1920×1080px**
5. Set zoom: **100%**
6. Throttling: **No throttling**

**Safari:**
1. Enable Developer menu: Safari > Preferences > Advanced > Show Develop menu
2. Develop > Enter Responsive Design Mode: `Cmd+Opt+R`
3. Set dimensions: **1920×1080px**

**Alternative**: Use full-screen browser window on actual desktop (preferred for accurate regression testing).

---

## Test Scenarios

### S004-1: Multi-Column Grid Activation

**Objective**: Verify multi-column grids activate correctly at 1024px breakpoint.

**Steps:**
1. Navigate to http://localhost:3000/priorities
2. View task grid layout
3. Count columns and inspect spacing

**Pass Criteria:**
- [ ] ✅ Tasks display in **multi-column grid** (2-3 columns)
- [ ] ✅ Grid uses `lg:grid-cols-2` or `lg:grid-cols-3` classes
- [ ] ✅ Spacing between columns appropriate (gap-4 = 16px or gap-6 = 24px)
- [ ] ✅ No layout shift when resizing between 1023px ↔ 1024px
- [ ] ✅ Cards fill grid evenly (no orphaned cards with excessive width)
- [ ] ✅ Grid maintains consistent column count across viewport widths (1024px - 1920px+)

**Expected Behavior**:
Multi-column layout activates smoothly at 1024px breakpoint (lg:). Task cards distribute evenly across 2-3 columns depending on grid configuration. This is the FIRST viewport width where multi-column grids appear (mobile and tablet remain single-column).

**Verification Method**:
1. Visual: Count task cards per row (should be 2-3)
2. DevTools: Inspect grid container
3. Check Computed tab:
   - `grid-template-columns: repeat(2, 1fr)` or `repeat(3, 1fr)`
4. Verify Classes tab:
   - `grid-cols-1` (base, mobile-first)
   - `lg:grid-cols-2` or `lg:grid-cols-3` (active at 1024px+)
5. **Boundary Test**:
   - Resize to 1023px → should be single column
   - Resize to 1024px → should activate multi-column
   - Confirm smooth transition (no jarring layout shift)

---

### S004-2: Button Sizing Consistency

**Objective**: Verify all buttons use desktop sizing (36px height) with no regressions.

**Steps:**
1. Navigate through all pages (home, /priorities, /dashboard)
2. Inspect buttons in various locations:
   - Header buttons (Reflections, Outcome, Upload)
   - Modal buttons (Submit, Cancel)
   - Dashboard action buttons (Filter, Export)
3. Test mouse interaction paradigm

**Pass Criteria:**
- [ ] ✅ Button heights: 36px (via `sm:h-9`) across all pages
- [ ] ✅ No mobile tap feedback (active:scale-[0.98] disabled via `sm:active:scale-100`)
- [ ] ✅ Hover states work correctly (brightness-90, shadow lift, etc.)
- [ ] ✅ Touch targets remain comfortably clickable with mouse (even though <44px)
- [ ] ✅ Button padding and spacing unchanged from pre-implementation
- [ ] ✅ Button text labels fully visible (no truncation)

**Expected Behavior**:
Desktop sizing preserved exactly as before mobile-first implementation. Buttons use 36px height for desktop density. Mobile tap feedback (scale transform) disabled via `sm:active:scale-100` override, allowing standard hover interactions only.

**Verification Method**:
1. Right-click any button → Inspect
2. Check Computed tab:
   - `height: 36px` (or `2.25rem`)
3. Verify Classes tab:
   - `h-11` present (mobile base)
   - `sm:h-9` present AND active (not crossed out)
4. **Interaction Test**:
   - Hover button → should see hover effect (brightness/shadow change)
   - Click button → should NOT see scale animation (desktop paradigm)
   - Verify `transition-transform` present but `sm:active:scale-100` prevents shrink
5. **Before/After Comparison** (if available):
   - Compare with screenshots from before implementation
   - Verify button heights identical (36px)

---

### S004-3: Form Input Sizing

**Objective**: Verify form inputs use desktop sizing (40px height, 14px font) with no regressions.

**Steps:**
1. Navigate to http://localhost:3000
2. Open any modal with form inputs:
   - Tap **Outcome** button → OutcomeBuilder modal
   - Tap **Reflections** button → Reflection input
3. Inspect input field dimensions and typography

**Pass Criteria:**
- [ ] ✅ Input heights: 40px (via `sm:h-10`) in all modals
- [ ] ✅ Input font size: 14px (via `sm:text-sm`) in all modals
- [ ] ✅ Labels and placeholders aligned correctly (no vertical misalignment)
- [ ] ✅ Input padding consistent with pre-implementation design
- [ ] ✅ Focus states work correctly (ring outline, border color change)
- [ ] ✅ No iOS auto-zoom behavior (not applicable on desktop, but verify absence of prevention artifacts)

**Expected Behavior**:
Desktop form density unchanged. Inputs use 40px height and 14px font size for optimal desktop UX. Mobile iOS zoom prevention (16px font) NOT applied at this breakpoint, reverting to standard desktop sizing.

**Verification Method**:
1. Right-click input field → Inspect
2. Check Computed tab:
   - `height: 40px` (or `2.5rem`) - NOT 48px
   - `font-size: 14px` (or `0.875rem`) - NOT 16px
3. Verify Classes tab:
   - `h-12` present (mobile base)
   - `sm:h-10` present AND active
   - `text-base` present (mobile base)
   - `sm:text-sm` present AND active
4. **Focus Test**:
   - Click input field → verify focus ring appears
   - Type text → verify font rendering at 14px (crisp, not enlarged)
5. **Before/After Comparison**:
   - Compare input sizing with pre-implementation state
   - Verify heights identical (40px)

---

### S004-4: Dashboard Grid Layout

**Objective**: Verify dashboard document grid uses multi-column layout with no visual regressions.

**Steps:**
1. Upload test documents to populate dashboard (if not already present)
2. Navigate to http://localhost:3000/dashboard
3. View document card grid layout
4. Inspect spacing, alignment, and card sizing

**Pass Criteria:**
- [ ] ✅ Document cards display in multi-column grid (lg:grid-cols-2 or lg:grid-cols-3)
- [ ] ✅ Grid adapts to viewport width:
  - 1024px-1279px: 2 columns (typical)
  - 1280px+: 2-3 columns depending on configuration
- [ ] ✅ Spacing and alignment consistent with previous design
- [ ] ✅ Card content (titles, metadata, action buttons) fully visible
- [ ] ✅ Hover effects on cards work correctly
- [ ] ✅ No horizontal scroll required
- [ ] ✅ Cards have equal widths within each row

**Expected Behavior**:
Dashboard maintains existing desktop layout. Document cards distribute across multiple columns (typically 2 columns at 1024px, potentially 3 at wider viewports). All spacing, shadows, hover effects, and card content preserved exactly as before mobile-first implementation.

**Verification Method**:
1. Visual: Count document cards per row (should be 2-3)
2. DevTools: Inspect dashboard grid container
3. Check Computed tab:
   - `grid-template-columns: repeat(2, 1fr)` or `repeat(3, 1fr)`
4. Verify Classes tab:
   - `grid-cols-1` (mobile base)
   - `lg:grid-cols-2` or `lg:grid-cols-3` (active)
5. **Spacing Verification**:
   - Measure gap between cards (should be consistent)
   - Check for `gap-4` (16px) or `gap-6` (24px)
6. **Card Content Check**:
   - All text visible and readable
   - Action buttons positioned correctly
   - Hover state triggers on card (if applicable)

---

## Pass/Fail Checklist

Complete all scenarios before marking T004 as PASS:

### Overall Test Status
- [ ] S004-1: Multi-Column Grid Activation (PASS/FAIL)
- [ ] S004-2: Button Sizing Consistency (PASS/FAIL)
- [ ] S004-3: Form Input Sizing (PASS/FAIL)
- [ ] S004-4: Dashboard Grid Layout (PASS/FAIL)

### Critical Regression Checks
- [ ] Zero visual regressions (layouts match pre-implementation exactly)
- [ ] All desktop layouts preserved (no mobile artifacts visible)
- [ ] Button heights = 36px (not 44px)
- [ ] Input heights = 40px (not 48px)
- [ ] Multi-column grids active (not single-column)

### Desktop Interaction Paradigm
- [ ] Mouse hover states work (brightness, shadows, etc.)
- [ ] No mobile tap feedback (scale animations disabled)
- [ ] Keyboard navigation functional (tab order correct)
- [ ] No iOS zoom prevention artifacts (inputs accept standard font sizes)

### Test Result
- [ ] **PASS** - All scenarios passed, zero regressions detected
- [ ] **FAIL** - Regressions detected, see notes below

---

## Troubleshooting

### Issue: Buttons Still 44px Height

**Cause**: `sm:h-9` class missing or not activating at desktop breakpoint.

**Debug Steps:**
1. Inspect button → Styles tab
2. Check for `h-11` and `sm:h-9` classes
3. Verify `sm:h-9` NOT crossed out (should be active at 1920px)
4. Check viewport width is actually ≥640px (sm: breakpoint)

**Solution**: Ensure Button component has responsive height:
```tsx
// components/ui/button.tsx
const buttonVariants = cva(
  "h-11 sm:h-9 ...", // Mobile 44px, desktop 36px
  // ...
);
```

### Issue: Task Grid Still Single-Column

**Cause**: `lg:grid-cols-*` class missing or using wrong breakpoint.

**Debug Steps:**
1. Inspect grid container → Styles tab
2. Check for `grid-cols-1` and `lg:grid-cols-*` classes
3. Verify `lg:` prefix (NOT `md:` or `sm:`)
4. Confirm viewport width is ≥1024px

**Solution**: Update grid to use `lg:` breakpoint:
```tsx
// Incorrect (activates too early or never)
<div className="grid grid-cols-1 md:grid-cols-3 gap-4">

// Correct (activates at 1024px+)
<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
```

### Issue: Inputs Still Using Mobile Sizing (48px, 16px)

**Cause**: `sm:h-10` or `sm:text-sm` classes missing.

**Debug Steps:**
1. Inspect input → Styles tab
2. Check for responsive classes: `h-12 sm:h-10` and `text-base sm:text-sm`
3. Verify `sm:` classes NOT crossed out at 1920px

**Solution**: Update Input component:
```tsx
// components/ui/input.tsx
className={cn(
  "h-12 sm:h-10 text-base sm:text-sm ...",
  className
)}
```

### Issue: Mobile Tap Feedback Still Visible

**Cause**: Missing `sm:active:scale-100` override class on buttons.

**Debug Steps:**
1. Click button and hold → should NOT shrink to 98%
2. Inspect button → Styles tab
3. Check for `active:scale-[0.98]` and `sm:active:scale-100`
4. Verify `sm:active:scale-100` active (overrides mobile tap feedback)

**Solution**: Ensure Button component disables mobile feedback on desktop:
```tsx
const buttonVariants = cva(
  "active:scale-[0.98] sm:active:scale-100 ...", // Mobile tap, desktop disabled
  // ...
);
```

---

## Before/After Comparison Checklist

Use this checklist to validate zero regressions:

### Visual Comparison
- [ ] Header layout identical (button positions, spacing, alignment)
- [ ] Button sizes identical (36px height maintained)
- [ ] Input field sizes identical (40px height, 14px font)
- [ ] Grid layouts identical (multi-column activation, spacing)
- [ ] Card designs identical (shadows, borders, hover effects)
- [ ] Typography unchanged (font sizes, weights, line heights)

### Functional Comparison
- [ ] Mouse hover interactions unchanged
- [ ] Keyboard navigation unchanged
- [ ] Focus states unchanged (ring colors, outlines)
- [ ] Form submission behavior unchanged
- [ ] Modal animations unchanged (open/close transitions)

### Performance Comparison
- [ ] Page load times equivalent (±10% acceptable variance)
- [ ] JavaScript bundle size increase ≤100 bytes
- [ ] No new console errors or warnings
- [ ] No performance regressions in DevTools Performance tab

---

## Notes Section

Use this space to record observations during testing:

**Test Date**: _______________
**Tester**: _______________
**Browser**: Chrome / Safari / Edge / Firefox
**Viewport**: 1920×1080px / 2560×1440px / Full-screen desktop

**Observations:**
-
-
-

**Issues Found:**
-
-
-

**Before/After Screenshots** (attach):
- Header (before and after)
- Task grid (before and after)
- Modal with inputs (before and after)
- Dashboard grid (before and after)

---

## Success Criteria

✅ **T004 Test PASSES** when:
1. All 4 scenarios (S004-1 through S004-4) pass
2. Zero visual regressions detected (layouts match pre-implementation exactly)
3. Button heights = 36px (sm:h-9 active)
4. Input heights = 40px, font = 14px (sm:h-10, sm:text-sm active)
5. Multi-column grids active at 1024px+ (lg:grid-cols-* working)
6. Desktop interaction paradigm preserved (hover works, tap feedback disabled)

**Next Step**: Proceed to implementation tasks (T005: Button Component, etc.)

---

## Related Documentation

- Quickstart Guide: `specs/012-mobile-first-transformation/quickstart.md`
- Feature Spec: `specs/012-mobile-first-transformation/spec.md` (FR-026 to FR-029)
- Tasks List: `specs/012-mobile-first-transformation/tasks.md` (T004)
- Implementation Plan: `specs/012-mobile-first-transformation/plan.md`
- Desktop Regression Requirements: FR-026 to FR-029 in spec.md

---

*Test guide created for mobile-first transformation vertical slice implementation.*
