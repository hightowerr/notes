# Quickstart: Mobile-First Transformation

**Feature**: Mobile-First Transformation
**Branch**: `012-mobile-first-transformation`
**Prerequisites**: Node.js 20+, dependencies installed (`npm install`)

## Overview

This quickstart guide provides manual testing procedures for validating mobile responsiveness across 4 key viewports. Since this is a CSS-only feature with no backend logic, automated visual regression tests are optional—manual viewport testing is the primary validation method.

---

## Test Environment Setup

### 1. Start Development Server

```bash
npm run dev
```

Navigate to: http://localhost:3000

### 2. Configure Browser DevTools

**Chrome/Edge DevTools** (Recommended):
1. Open DevTools → `Cmd+Opt+I` (Mac) or `Ctrl+Shift+I` (Windows/Linux)
2. Click **Device Toolbar** icon → `Cmd+Shift+M` (Mac) or `Ctrl+Shift+M` (Windows/Linux)
3. Select **Responsive** mode
4. Set **Throttling** → **No throttling** (for accurate layout testing)

**Safari Responsive Design Mode**:
1. Enable Developer menu → Safari > Preferences > Advanced > Show Develop menu
2. Develop > Enter Responsive Design Mode → `Cmd+Opt+R`

---

## Test Viewport Matrix

| Viewport | Width | Device | Primary Test Goal |
|----------|-------|--------|-------------------|
| **T001** | 320px | iPhone SE 1st gen | Minimum viable (edge case) |
| **T002** | 375px | iPhone SE 3rd gen | Most common mobile viewport |
| **T003** | 768px | iPad Mini portrait | Tablet transition point |
| **T004** | 1024px+ | Desktop/iPad Pro landscape | Desktop parity verification |

---

## T001: Minimum Viewport (320px) - Extreme Edge Case

**Objective**: Verify all content accessible without horizontal scroll on smallest viewport.

**Setup**:
- Viewport: **320×568px** (iPhone SE 1st gen)
- Zoom: 100%

### Test Scenarios

#### S001-1: Header Section
1. Navigate to http://localhost:3000
2. **Verify**:
   - ✅ No horizontal scrollbar appears
   - ✅ All header buttons visible (text labels on separate rows if needed)
   - ✅ Document count badge wraps to new row (not cut off)
   - ✅ Theme toggle visible and tappable

**Expected Behavior**: Content stacks vertically, no content hidden or truncated.

#### S001-2: Upload Card
1. Scroll to upload section
2. **Verify**:
   - ✅ Upload card fits within 320px width
   - ✅ "Upload your documents" text fully visible
   - ✅ Icon centered and properly sized
   - ✅ File type hints ("PDF, DOCX, TXT, MD") fully readable

**Expected Behavior**: Card content scales down gracefully, maintains readability.

#### S001-3: Button Touch Targets
1. Tap any button (Reflections, Outcome, Upload)
2. **Verify**:
   - ✅ Button height ≥44px (use DevTools Inspect → Computed tab)
   - ✅ Tap triggers action without zooming
   - ✅ Visible tap feedback (highlight + scale)
   - ✅ No accidental double-tap zoom

**Expected Behavior**: All buttons meet 44×44px minimum, respond to single tap.

---

## T002: Standard Mobile (375px) - Primary Mobile Viewport

**Objective**: Validate optimal mobile UX on most common viewport (iPhone SE 3rd gen, iPhone 12/13 Mini).

**Setup**:
- Viewport: **375×667px** (iPhone SE 3rd gen)
- Zoom: 100%

### Test Scenarios

#### S002-1: Document Upload Flow
1. Navigate to http://localhost:3000
2. Tap **Choose File** (or drag file to upload card)
3. Upload a test PDF (e.g., `sample.pdf`)
4. **Verify**:
   - ✅ Upload progress visible without horizontal scroll
   - ✅ Status badges (Uploading → Processing → Complete) fully visible
   - ✅ File name doesn't overflow or truncate excessively
   - ✅ Summary panel appears below document card (not overlapping)

**Expected Behavior**: Entire upload → processing → summary flow visible in single column layout.

#### S002-2: Modal/Dialog Interaction
1. Tap **Outcome** button in header
2. OutcomeBuilder modal opens
3. **Verify**:
   - ✅ Modal uses ≥95% of viewport height (`max-h-[95vh]`)
   - ✅ Padding reduced to 12px (p-3) vs desktop 24px
   - ✅ Input fields:
     - Height: 48px (h-12)
     - Font size: 16px (text-base) - prevents iOS auto-zoom
   - ✅ Radio button groups stack vertically
   - ✅ Close button (X) easily tappable (≥44×44px)

**Expected Behavior**: Modal fills screen efficiently, inputs don't trigger iOS zoom.

#### S002-3: Task Grid Layout
1. Navigate to http://localhost:3000/priorities
2. **Verify**:
   - ✅ Tasks display in **single-column** layout (not 3-column grid)
   - ✅ No horizontal scrolling
   - ✅ Each task card readable without zoom
   - ✅ Tap any task card → no layout shift

**Expected Behavior**: Single-column layout prevents horizontal scroll, maintains readability.

#### S002-4: Form Input Without Auto-Zoom
1. Tap **Reflections** button
2. Tap any text input field
3. **Verify**:
   - ✅ iOS does **not** auto-zoom the page
   - ✅ Input font size ≥16px (inspect with DevTools)
   - ✅ Input height 48px (h-12)
   - ✅ Keyboard appears without layout shift

**Expected Behavior**: 16px font size prevents iOS auto-zoom, input remains visible above keyboard.

---

## T003: Tablet Portrait (768px) - Transition Point

**Objective**: Verify tablet-friendly layout without activating desktop multi-column grids prematurely.

**Setup**:
- Viewport: **768×1024px** (iPad Mini portrait)
- Zoom: 100%

### Test Scenarios

#### S003-1: Header Layout
1. Navigate to http://localhost:3000
2. **Verify**:
   - ✅ Header buttons display in horizontal row (sm:flex-row)
   - ✅ Button heights: 36px (sm:h-9) - desktop sizing
   - ✅ Document count badge inline (not wrapped)
   - ✅ No horizontal scroll

**Expected Behavior**: Header transitions to compact desktop layout (640px+ breakpoint).

#### S003-2: Task Grid (Still Single Column)
1. Navigate to http://localhost:3000/priorities
2. **Verify**:
   - ✅ Tasks still display in **single-column** layout (grid-cols-1)
   - ✅ Multi-column grid **does not** activate yet (requires ≥1024px)
   - ✅ Each task card wider than mobile (more breathing room)

**Expected Behavior**: Single-column layout preserved until 1024px breakpoint.

#### S003-3: Modal Sizing
1. Open OutcomeBuilder modal
2. **Verify**:
   - ✅ Modal height: 80vh (desktop sizing via sm:max-h-[80vh])
   - ✅ Padding: 24px (sm:p-6)
   - ✅ Input font size: 14px (sm:text-sm)
   - ✅ Radio button groups display horizontally (if width ≥475px)

**Expected Behavior**: Desktop modal styling activates at 640px+ breakpoint.

---

## T004: Desktop (1024px+) - Regression Verification

**Objective**: Ensure zero regressions to existing desktop experience.

**Setup**:
- Viewport: **1920×1080px** (Full HD desktop)
- Zoom: 100%

### Test Scenarios

#### S004-1: Multi-Column Grid Activation
1. Navigate to http://localhost:3000/priorities
2. **Verify**:
   - ✅ Tasks display in **multi-column grid** (2-3 columns)
   - ✅ Grid uses `lg:grid-cols-2` or `lg:grid-cols-3` classes
   - ✅ Spacing between columns appropriate (gap-4 or gap-6)
   - ✅ No layout shift when resizing between 1023px ↔ 1024px

**Expected Behavior**: Multi-column layout activates smoothly at 1024px breakpoint.

#### S004-2: Button Sizing Consistency
1. Inspect all buttons across site (Upload, Reflections, Outcome, etc.)
2. **Verify**:
   - ✅ Button heights: 36px (sm:h-9) - desktop sizing
   - ✅ No mobile tap feedback (active:scale-[0.98] disabled via sm:active:scale-100)
   - ✅ Hover states work (brightness-90, shadow lift)
   - ✅ Touch targets remain comfortably clickable (even though <44px)

**Expected Behavior**: Desktop sizing preserved, mouse interaction paradigm unchanged.

#### S004-3: Form Input Sizing
1. Open any modal with form inputs
2. **Verify**:
   - ✅ Input heights: 40px (sm:h-10) - desktop sizing
   - ✅ Input font size: 14px (sm:text-sm)
   - ✅ Labels and placeholders aligned correctly

**Expected Behavior**: Desktop form density unchanged, no visual regressions.

#### S004-4: Dashboard Grid Layout
1. Navigate to http://localhost:3000/dashboard
2. **Verify**:
   - ✅ Document cards display in multi-column grid (lg:grid-cols-2 or lg:grid-cols-3)
   - ✅ Grid adapts to viewport width (2 cols at 1024px, 3 cols at 1280px)
   - ✅ Spacing and alignment consistent with previous design

**Expected Behavior**: Dashboard maintains existing desktop layout.

---

## Cross-Viewport Rotation Test

**Objective**: Verify layout adapts correctly when device orientation changes.

**Test Procedure**:
1. Set viewport to **375×667px** (portrait)
2. Verify single-column layout active
3. Rotate to **667×375px** (landscape)
4. **Verify**:
   - ✅ Layout adapts using same breakpoint rules
   - ✅ Content still accessible (no horizontal scroll)
   - ✅ Header remains functional
5. Rotate back to portrait
6. **Verify**:
   - ✅ Layout returns to original state
   - ✅ No stuck states or broken CSS

**Expected Behavior**: Responsive design works in both portrait and landscape orientations.

---

## Accessibility Validation

### WCAG 2.1 Level AA Compliance

**Test Procedure**:
1. Open browser DevTools → Lighthouse tab
2. Run **Accessibility Audit**
3. **Verify**:
   - ✅ Contrast ratio ≥4.5:1 (WCAG AA minimum)
   - ✅ Touch targets ≥44×44px on mobile (WCAG AAA)
   - ✅ All interactive elements keyboard accessible
   - ✅ No layout shift (CLS score <0.1)

**Expected Results**:
- Accessibility score: ≥90/100
- No critical contrast violations
- Touch target violations: 0

---

## Performance Validation

**Objective**: Confirm zero JavaScript bundle size increase.

**Test Procedure**:

### Before Implementation
```bash
git checkout main
npm run build
# Note: .next/static/chunks/pages/_app-[hash].js size
```

### After Implementation
```bash
git checkout 012-mobile-first-transformation
npm run build
# Compare: .next/static/chunks/pages/_app-[hash].js size
```

**Expected Result**: Bundle size difference ≤100 bytes (insignificant compression variance).

**If bundle size increases >1KB**: Investigate for accidental JavaScript additions (should be CSS-only changes).

---

## Manual Test Checklist

Use this checklist during implementation to track test coverage:

### Viewport Testing
- [ ] T001: 320px viewport (minimum viable)
- [ ] T002: 375px viewport (standard mobile)
- [ ] T003: 768px viewport (tablet portrait)
- [ ] T004: 1024px+ viewport (desktop regression)
- [ ] Cross-viewport rotation test

### Component Coverage
- [ ] Header (MainNav component)
- [ ] Upload card (page.tsx)
- [ ] Buttons (all variants)
- [ ] Modals (OutcomeBuilder, GapDetectionModal, TextInputModal)
- [ ] Form inputs (Input, Textarea, Select)
- [ ] Task grids (priorities page)
- [ ] Dashboard grid (dashboard page)
- [ ] Tabs (SummaryPanel, priorities page)
- [ ] Cards (reflection cards, task cards, bridging task cards)

### Functional Requirements
- [ ] FR-001 to FR-025: Mobile sizing and behavior
- [ ] FR-026 to FR-029: Desktop parity
- [ ] FR-030: Pure CSS implementation
- [ ] FR-031: WCAG AA contrast compliance
- [ ] FR-032: No layout shift
- [ ] FR-033: Zero bundle size increase

### Edge Cases
- [ ] Very long button text (wrapping behavior)
- [ ] Modal content exceeds viewport height (scrolling)
- [ ] Double-tap zoom prevention (touch-action: manipulation)
- [ ] Landscape orientation on mobile

---

## Troubleshooting

### Issue: iOS Auto-Zoom Still Occurs
**Cause**: Input font size <16px
**Solution**: Verify input has `text-base` class (not `text-sm`) on mobile:
```tsx
<Input className="text-base sm:text-sm h-12 sm:h-10" />
```

### Issue: Horizontal Scroll Appears on Mobile
**Cause**: Fixed-width element or padding overflow
**Solution**:
1. Open DevTools → Elements tab
2. Hover over elements to find width >375px
3. Replace fixed width with `max-w-full` or responsive sizing

### Issue: Multi-Column Grid Activates Too Early
**Cause**: Using `sm:grid-cols-2` instead of `lg:grid-cols-2`
**Solution**: Ensure grids use `lg:` prefix (1024px breakpoint):
```tsx
<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
```

### Issue: Buttons Too Small on Mobile
**Cause**: Missing mobile height class
**Solution**: Add `h-11` (44px) for mobile, `sm:h-9` (36px) for desktop:
```tsx
<Button className="h-11 sm:h-9">Label</Button>
```

---

## Success Criteria

✅ **Feature Ready for Production** when:
1. All 4 viewport tests (T001-T004) pass without issues
2. WCAG AA accessibility score ≥90/100
3. JavaScript bundle size increase ≤100 bytes
4. No horizontal scrolling on any viewport (320px-1920px)
5. All touch targets ≥44px on mobile (<640px)
6. iOS auto-zoom prevented on all form inputs
7. Desktop layouts unchanged (regression test pass)
8. Layout shift (CLS) <50ms during breakpoint transitions

---

## Next Steps

After completing quickstart validation:
1. ✅ Mark Phase 1 complete
2. Generate tasks.md via `/tasks` command
3. Begin implementation (Phase 4)
4. Re-run this quickstart guide after each vertical slice completion
5. Final QA pass before PR submission

---

## References

- Feature Spec: `specs/012-mobile-first-transformation/spec.md`
- Research: `specs/012-mobile-first-transformation/research.md`
- Implementation Plan: `specs/012-mobile-first-transformation/plan.md`
