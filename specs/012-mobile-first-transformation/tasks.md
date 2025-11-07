# Tasks: Mobile-First Transformation

**Feature**: Mobile-First Transformation
**Branch**: `012-mobile-first-transformation`
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

## Overview

This task list implements mobile-responsive UI/UX improvements across 4 viewport breakpoints (320px, 375px, 768px, 1024px+). Each task is a vertical slice delivering complete user-visible value (SEE + DO + VERIFY). All tasks use pure CSS (Tailwind utilities) with zero JavaScript additions.

**Constitution Compliance**: All 6 principles validated (Autonomous, Deterministic, Modular, TDD, Observable, Vertical Slice).

---

## Task Ordering Strategy

1. **Test Infrastructure First** (T001-T004): Manual test guides before implementation
2. **Foundation Components** (T005-T008): Button, Input, Dialog base components
3. **Critical Fixes** (T009-T011): Header overflow, grid responsiveness
4. **UX Optimizations** (T012-T015): Forms, modals, tabs
5. **Visual Polish** (T016-T017): Tactile feedback, shadows
6. **Validation** (T018-T020): Desktop regression, accessibility, performance

**Parallelization**: Tasks marked [P] can be executed in parallel (independent files/components). Sequential tasks modify shared components or require previous task completion.

---

## T001: Create Manual Test Guide - Minimum Viewport (320px) [SETUP]

**User Story**: As a QA tester, I can run structured viewport tests on 320px width to verify minimum viable mobile experience, so that I can catch critical usability issues before deployment.

**Why This Matters**: 320px is the absolute minimum viewport (iPhone SE 1st gen). Content must be accessible without horizontal scroll on this extreme edge case.

**Implementation Scope**:
- Create `__tests__/integration/T001_MOBILE_320PX_TEST.md`
- Document test scenarios from quickstart.md § T001:
  - S001-1: Header section (no horizontal scroll, all buttons visible)
  - S001-2: Upload card (content fits, text readable)
  - S001-3: Button touch targets (≥44px height, tap without zoom)
- Include setup instructions (DevTools responsive mode, viewport configuration)
- Provide pass/fail checklist with expected behaviors

**UI Entry Point**: Browser DevTools → Responsive Design Mode → 320×568px viewport

**Test Scenario**:
1. Open quickstart.md § T001 test scenarios
2. Follow S001-1, S001-2, S001-3 procedures
3. Verify checklist items pass
4. **SUCCESS**: All content accessible without horizontal scroll, buttons ≥44px

**Acceptance Criteria**:
- [X] Test guide exists at `__tests__/integration/T001_MOBILE_320PX_TEST.md`
- [X] All 3 scenarios documented with step-by-step instructions
- [X] Pass/fail checklist included
- [X] Guide references quickstart.md § T001

**Dependencies**: None

**Estimated Effort**: 30 minutes

---

## T002: Create Manual Test Guide - Standard Mobile (375px) [SETUP] [P]

**User Story**: As a QA tester, I can run comprehensive mobile tests on 375px viewport to validate the primary mobile experience, so that I can ensure optimal UX for the most common mobile device.

**Why This Matters**: 375px represents iPhone SE 3rd gen and iPhone 12/13 Mini - the most common mobile viewport in current usage.

**Implementation Scope**:
- Create `__tests__/integration/T002_MOBILE_375PX_TEST.md`
- Document test scenarios from quickstart.md § T002:
  - S002-1: Document upload flow (single-column, no overflow)
  - S002-2: Modal interaction (95vh height, 12px padding, no iOS zoom)
  - S002-3: Task grid layout (single-column, no horizontal scroll)
  - S002-4: Form input without auto-zoom (16px font, 48px height)
- Include detailed verification steps for iOS auto-zoom prevention
- Provide comprehensive pass/fail checklist

**UI Entry Point**: Browser DevTools → Responsive Design Mode → 375×667px viewport

**Test Scenario**:
1. Open quickstart.md § T002 test scenarios
2. Follow S002-1 through S002-4 procedures
3. Verify modal optimization (95vh, p-3, text-base)
4. **SUCCESS**: Complete mobile UX validated, no iOS auto-zoom

**Acceptance Criteria**:
- [X] Test guide exists at `__tests__/integration/T002_MOBILE_375PX_TEST.md`
- [X] All 4 scenarios documented (upload, modal, grid, forms)
- [X] iOS auto-zoom prevention verification included
- [X] Guide references quickstart.md § T002

**Dependencies**: None (parallel with T001)

**Estimated Effort**: 45 minutes

---

## T003: Create Manual Test Guide - Tablet Portrait (768px) [SETUP] [P]

**User Story**: As a QA tester, I can validate tablet-specific responsive behavior on 768px viewport to ensure proper transition from mobile to desktop layouts, so that iPad users have an optimal experience.

**Why This Matters**: 768px (iPad Mini portrait) is the critical transition point where desktop sizing activates but multi-column grids remain disabled.

**Implementation Scope**:
- Create `__tests__/integration/T003_TABLET_768PX_TEST.md`
- Document test scenarios from quickstart.md § T003:
  - S003-1: Header layout (horizontal buttons, 36px height via sm:h-9)
  - S003-2: Task grid still single-column (lg: breakpoint not active yet)
  - S003-3: Modal desktop sizing (80vh height, 24px padding, 14px font)
- Verify breakpoint transitions (640px activates desktop sizing, 1024px does not activate grids)

**UI Entry Point**: Browser DevTools → Responsive Design Mode → 768×1024px viewport

**Test Scenario**:
1. Open quickstart.md § T003 test scenarios
2. Verify header transitions to desktop layout (sm: breakpoint)
3. Confirm grids remain single-column (lg: breakpoint not active)
4. **SUCCESS**: Desktop sizing active, multi-column grids still disabled

**Acceptance Criteria**:
- [X] Test guide exists at `__tests__/integration/T003_TABLET_768PX_TEST.md`
- [X] All 3 scenarios documented (header, grids, modals)
- [X] Breakpoint behavior clearly explained (sm: active, lg: inactive)
- [X] Guide references quickstart.md § T003

**Dependencies**: None (parallel with T001, T002)

**Estimated Effort**: 30 minutes

---

## T004: Create Manual Test Guide - Desktop Regression (1024px+) [SETUP] [P]

**User Story**: As a QA tester, I can run desktop regression tests to verify zero layout changes on ≥1024px viewports, so that existing desktop users experience no disruption.

**Why This Matters**: Desktop users (1920×1080 and above) must see identical layouts post-implementation. This is a critical no-regression requirement.

**Implementation Scope**:
- Create `__tests__/integration/T004_DESKTOP_1024PX_TEST.md`
- Document test scenarios from quickstart.md § T004:
  - S004-1: Multi-column grid activation (lg:grid-cols-2/3)
  - S004-2: Button sizing consistency (36px height via sm:h-9)
  - S004-3: Form input sizing (40px height, 14px font via sm:)
  - S004-4: Dashboard grid layout (multi-column, no regressions)
- Include before/after comparison checklist
- Document expected mouse interaction paradigm (hover, no tap feedback)

**UI Entry Point**: Browser DevTools → Responsive Design Mode → 1920×1080px viewport

**Test Scenario**:
1. Open quickstart.md § T004 test scenarios
2. Verify multi-column grids activate at 1024px breakpoint
3. Confirm desktop button/input sizing unchanged
4. **SUCCESS**: Zero regressions, all desktop layouts preserved

**Acceptance Criteria**:
- [X] Test guide exists at `__tests__/integration/T004_DESKTOP_1024PX_TEST.md`
- [X] All 4 scenarios documented (grids, buttons, forms, dashboard)
- [X] Before/after comparison checklist included
- [X] Guide references quickstart.md § T004

**Dependencies**: None (parallel with T001-T003)

**Estimated Effort**: 45 minutes

---

## T005: Make Button Component Mobile-Responsive (Touch Targets) [SLICE]

**User Story**: As a mobile user, I can tap any button with ease using my thumb without accidental mis-taps or zooming, so that I can navigate the app as smoothly as on desktop.

**Why This Matters**: FR-001, FR-002, FR-003 - 44px minimum touch targets are WCAG AAA compliant and prevent user frustration. This is the foundation for all interactive elements.

**Implementation Scope**:
- Modify `components/ui/button.tsx` (shadcn component)
- Add responsive height classes:
  - Mobile (<640px): `h-11` (44px minimum touch target)
  - Desktop (≥640px): `sm:h-9` (36px for density)
- Add mobile tactile feedback (FR-003, FR-022, FR-023):
  - `active:scale-[0.98]` (subtle shrink on tap)
  - `sm:active:scale-100` (disable on desktop)
  - `active:brightness-95` (visual tap highlight)
- Add `touch-action: manipulation` class (FR-025 - prevents double-tap zoom)
- Preserve all existing variants (default, outline, ghost, destructive, link)

**UI Entry Point**:
- `app/page.tsx` → "Reflections", "Outcome", "Upload" buttons
- `app/priorities/page.tsx` → Action buttons
- `app/dashboard/page.tsx` → Filter/export buttons

**Frontend Work**:
```tsx
// components/ui/button.tsx
// Update buttonVariants to include responsive sizing
const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors " +
  "h-11 sm:h-9 px-4 py-2 " + // Responsive height
  "active:scale-[0.98] sm:active:scale-100 active:brightness-95 " + // Mobile tap feedback
  "touch-manipulation " + // Prevent double-tap zoom
  "focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: { /* existing variants */ }
  }
);
```

**Backend Work**: N/A (CSS-only changes)

**Data Layer**: N/A (no data persistence)

**Visible Outcome**:
- SEE: Buttons taller on mobile (44px vs 36px), visible tap feedback
- DO: Resize browser to 375px, tap any button
- VERIFY: Button height ≥44px (inspect in DevTools), tap causes scale animation, no double-tap zoom

**Test Scenario** (using T002 test guide):
1. Run T002_MOBILE_375PX_TEST.md → S002-4
2. Navigate to http://localhost:3000 in 375px viewport
3. Tap "Reflections" button
4. **PASS**: Button height = 44px, shows tap feedback (scale 0.98), no zoom
5. Resize to 1024px+ viewport
6. Hover over button
7. **PASS**: Button height = 36px, no tap feedback, hover works

**Acceptance Criteria**:
- [X] Button component has `h-11 sm:h-9` classes
- [X] Mobile tap feedback applied (`active:scale-[0.98] sm:active:scale-100`)
- [X] `touch-manipulation` class prevents double-tap zoom
- [X] All button variants (default, outline, ghost, destructive) responsive
- [ ] T002 § S002-4 test passes
- [ ] Desktop regression test (T004 § S004-2) passes

**Dependencies**: T002 test guide complete

**Estimated Effort**: 1 hour

---

## T006: Make Input Component Mobile-Responsive (iOS Auto-Zoom Prevention) [SLICE]

**User Story**: As a mobile user filling out forms, I can tap input fields without the page auto-zooming, so that I can maintain context and complete forms efficiently.

**Why This Matters**: FR-009, FR-010, FR-011, FR-012 - iOS auto-zooms when input font size <16px. This is the #1 mobile form UX complaint.

**Implementation Scope**:
- Modify `components/ui/input.tsx` (shadcn component)
- Add responsive sizing:
  - Mobile (<640px): `h-12` (48px height), `text-base` (16px font - prevents zoom)
  - Desktop (≥640px): `sm:h-10` (40px), `sm:text-sm` (14px)
- Remove global CSS rule from `app/globals.css` lines 534-545 (conflicts with utility-first approach)
- Apply `touch-manipulation` class (prevents double-tap zoom)

**UI Entry Point**:
- `app/components/OutcomeBuilder.tsx` → Direction, Object, Metric inputs
- `app/components/TextInputModal.tsx` → Text input field
- `app/components/ReflectionInput.tsx` → Reflection text input

**Frontend Work**:
```tsx
// components/ui/input.tsx
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex w-full rounded-md border border-input bg-background " +
          "h-12 sm:h-10 px-3 py-2 " + // Responsive height
          "text-base sm:text-sm " + // Responsive font (16px mobile, 14px desktop)
          "touch-manipulation " + // Prevent double-tap zoom
          "ring-offset-background file:border-0 file:bg-transparent " +
          "placeholder:text-muted-foreground focus-visible:outline-none " +
          "focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
```

**Backend Work**: N/A (CSS-only changes)

**Data Layer**: N/A (no data persistence)

**Visible Outcome**:
- SEE: Input fields taller on mobile (48px vs 40px), larger text (16px vs 14px)
- DO: Resize to 375px, tap input field in OutcomeBuilder modal
- VERIFY: No iOS auto-zoom, input remains in view, font size ≥16px

**Test Scenario** (using T002 test guide):
1. Run T002_MOBILE_375PX_TEST.md → S002-4
2. Navigate to http://localhost:3000 in 375px viewport
3. Tap "Outcome" button to open modal
4. Tap "Direction" input field
5. **PASS**: Page does NOT zoom, input font = 16px, height = 48px
6. Resize to 1024px+ viewport
7. Open modal again
8. **PASS**: Input font = 14px, height = 40px

**Acceptance Criteria**:
- [X] Input component has `h-12 sm:h-10` classes
- [X] Input component has `text-base sm:text-sm` classes
- [X] Global CSS rule removed from `app/globals.css:534-545`
- [X] `touch-manipulation` class applied
- [ ] T002 § S002-4 test passes (no iOS auto-zoom)
- [ ] Desktop regression test (T004 § S004-3) passes

**Dependencies**: T002 test guide complete

**Estimated Effort**: 1 hour

---

## T007: Make Dialog Component Mobile-Responsive (Modal Optimization) [SLICE]

**User Story**: As a mobile user opening modals, I can see more content without excessive scrolling, so that I can complete forms and view information efficiently on my small screen.

**Why This Matters**: FR-013, FR-014, FR-015 - Desktop modals waste ~100px vertical space with excessive padding. 95vh utilization is critical for mobile usability.

**Implementation Scope**:
- Modify `components/ui/dialog.tsx` (shadcn component)
- Update `DialogContent` component with responsive sizing:
  - Mobile (<640px): `max-h-[95vh]` (maximize viewport), `p-3` (12px padding)
  - Desktop (≥640px): `sm:max-h-[80vh]` (breathing room), `sm:p-6` (24px padding)
- Ensure modal remains scrollable when content exceeds height (`overflow-y-auto`)
- Apply responsive width: `max-w-[95vw] sm:max-w-lg`

**UI Entry Point**:
- `app/components/OutcomeBuilder.tsx` → Outcome creation modal
- `app/priorities/components/GapDetectionModal.tsx` → Gap detection modal
- `app/components/TextInputModal.tsx` → Text input modal

**Frontend Work**:
```tsx
// components/ui/dialog.tsx
const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-50 grid w-full translate-x-[-50%] translate-y-[-50%] " +
        "max-w-[95vw] sm:max-w-lg " + // Responsive width
        "max-h-[95vh] sm:max-h-[80vh] " + // Responsive height
        "gap-4 border bg-background p-3 sm:p-6 " + // Responsive padding
        "overflow-y-auto " + // Scrollable when content exceeds height
        "shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out " +
        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 " +
        "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 " +
        "data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] " +
        "data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] " +
        "sm:rounded-lg",
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
))
```

**Backend Work**: N/A (CSS-only changes)

**Data Layer**: N/A (no data persistence)

**Visible Outcome**:
- SEE: Modals fill more screen on mobile (95vh vs 80vh), less padding (12px vs 24px)
- DO: Resize to 375px, open OutcomeBuilder modal
- VERIFY: Modal height ≥95% of viewport, padding = 12px, content not cramped

**Test Scenario** (using T002 test guide):
1. Run T002_MOBILE_375PX_TEST.md → S002-2
2. Navigate to http://localhost:3000 in 375px viewport
3. Tap "Outcome" button
4. **PASS**: Modal height ≥635px (95% of 667px), padding = 12px
5. Inspect modal in DevTools: verify `max-h-[95vh]`, `p-3`
6. Resize to 1024px+ viewport
7. Open modal again
8. **PASS**: Modal height ≤864px (80% of 1080px), padding = 24px

**Acceptance Criteria**:
- [X] DialogContent has `max-h-[95vh] sm:max-h-[80vh]` classes
- [X] DialogContent has `p-3 sm:p-6` classes
- [X] DialogContent has `overflow-y-auto` for scrolling
- [X] Modal width responsive: `max-w-[95vw] sm:max-w-lg`
- [ ] T002 § S002-2 test passes
- [ ] Desktop regression test (T004) passes

**Dependencies**: T002 test guide complete

**Estimated Effort**: 1 hour

---

## T008: Make Tabs Component Mobile-Responsive (Reduced Sizing) [SLICE] [P]

**User Story**: As a mobile user viewing tabbed interfaces, I can see all tab labels clearly without horizontal scrolling, so that I can navigate between sections efficiently.

**Why This Matters**: FR-018, FR-019, FR-020, FR-021 - Desktop tab sizing causes overflow on mobile. Reduced font (12px) and padding (8px) maintain readability while fitting narrow viewports.

**Implementation Scope**:
- Modify `components/ui/tabs.tsx` (shadcn component)
- Update `TabsList` and `TabsTrigger` with responsive sizing:
  - Mobile (<640px): `text-xs` (12px font), `px-2` (8px padding)
  - Desktop (≥640px): `sm:text-sm` (14px font), `sm:px-4` (16px padding)
- Ensure `TabsList` wraps on mobile if tabs exceed width (`flex-wrap`)

**UI Entry Point**:
- `app/components/SummaryPanel.tsx` → Topics/Decisions/Actions/LNO tabs
- `app/priorities/page.tsx` → Task tabs (if present)

**Frontend Work**:
```tsx
// components/ui/tabs.tsx
const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-sm " +
      "px-2 sm:px-4 py-1.5 " + // Responsive padding
      "text-xs sm:text-sm " + // Responsive font size
      "font-medium ring-offset-background transition-all " +
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 " +
      "disabled:pointer-events-none disabled:opacity-50 " +
      "data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
      className
    )}
    {...props}
  />
))
```

**Backend Work**: N/A (CSS-only changes)

**Data Layer**: N/A (no data persistence)

**Visible Outcome**:
- SEE: Tab labels smaller on mobile (12px vs 14px), less padding (8px vs 16px)
- DO: Resize to 375px, view SummaryPanel with tabs
- VERIFY: All tabs visible, no horizontal scroll, labels readable

**Test Scenario** (using T002 test guide):
1. Upload a test document to generate SummaryPanel
2. Run T002_MOBILE_375PX_TEST.md (custom scenario for tabs)
3. Navigate to document summary in 375px viewport
4. View "Topics", "Decisions", "Actions", "LNO" tabs
5. **PASS**: All 4 tabs visible, no horizontal scroll, font = 12px
6. Resize to 1024px+ viewport
7. **PASS**: Tab font = 14px, padding = 16px, no layout changes

**Acceptance Criteria**:
- [X] TabsTrigger has `text-xs sm:text-sm` classes
- [X] TabsTrigger has `px-2 sm:px-4` classes
- [X] TabsList wraps on mobile if needed (`flex-wrap`)
- [ ] Tabs visible on 375px viewport without horizontal scroll
- [ ] Desktop regression test (T004) passes

**Dependencies**: T002 test guide complete (parallel with T005-T007)

**Estimated Effort**: 45 minutes

---

## T009: Fix Header Overflow on Mobile (MainNav Component) [SLICE]

**User Story**: As a mobile user, I can see all header buttons and the document count without horizontal scrolling, so that I can access navigation controls on my small screen.

**Why This Matters**: FR-004, FR-005, FR-008 - Header overflow is the most visible mobile usability issue. This is a critical P0 fix.

**Implementation Scope**:
- Modify `app/components/MainNav.tsx` (if exists) or `app/page.tsx` header section
- Apply responsive layout:
  - Mobile (<640px): `flex-col` (vertical stack), `items-stretch` (full width buttons)
  - Desktop (≥640px): `sm:flex-row` (horizontal), `sm:items-center`
- Ensure buttons inherit mobile sizing from T005 (`h-11 sm:h-9`)
- Badge component: `flex-1 sm:flex-initial` (full width on mobile, inline on desktop)

**UI Entry Point**: `app/page.tsx` → Header section with "Reflections", "Outcome" buttons + document count badge

**Frontend Work**:
```tsx
// app/page.tsx (MainNav actions prop)
<div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">
  <div className="flex items-center gap-2">
    <Button
      variant="outline"
      onClick={() => setReflectionPanelOpen(true)}
      className="gap-2 h-11 sm:h-9 flex-1 sm:flex-initial"
      title="Reflections (Cmd+Shift+R / Ctrl+Shift+R)"
    >
      <MessageSquare className="h-4 w-4" />
      <span className="text-sm">Reflections</span>
    </Button>
    <Button
      variant="outline"
      onClick={() => setOutcomeModalOpen(true)}
      className="gap-2 h-11 sm:h-9 flex-1 sm:flex-initial"
    >
      <Target className="h-4 w-4" />
      <span className="text-sm">Outcome</span>
    </Button>
  </div>
  <div className="flex items-center justify-between sm:justify-start gap-2">
    <Badge variant="secondary" className="px-3 sm:px-4 py-2 text-xs sm:text-sm whitespace-nowrap">
      {files.length} {files.length === 1 ? 'Doc' : 'Docs'}
    </Badge>
    <ThemeToggle />
  </div>
</div>
```

**Backend Work**: N/A (CSS-only changes)

**Data Layer**: N/A (no data persistence)

**Visible Outcome**:
- SEE: Header buttons stack vertically on mobile, no overflow
- DO: Resize to 320px (extreme edge case), view header
- VERIFY: All buttons visible, no horizontal scroll, badge wraps to new row

**Test Scenario** (using T001 test guide):
1. Run T001_MOBILE_320PX_TEST.md → S001-1
2. Navigate to http://localhost:3000 in 320px viewport
3. View header section
4. **PASS**: No horizontal scrollbar, all buttons visible
5. Verify button heights = 44px (from T005)
6. Resize to 1024px+ viewport
7. **PASS**: Header horizontal layout, buttons = 36px height

**Acceptance Criteria**:
- [X] Header uses `flex-col sm:flex-row` layout
- [X] Buttons use `h-11 sm:h-9` from T005 Button component
- [X] Badge responsive: `px-3 sm:px-4` and `text-xs sm:text-sm`
- [ ] T001 § S001-1 test passes (320px viewport)
- [ ] T002 test passes (375px viewport)
- [ ] Desktop regression test (T004 § S004-2) passes

**Dependencies**: T001 test guide complete, T005 Button component complete

**Estimated Effort**: 1 hour

---

## T010: Make Task Grids Mobile-Responsive (Single-Column Layout) [SLICE]

**User Story**: As a mobile user viewing task lists, I can read each task card fully without horizontal scrolling or zooming, so that I can review and prioritize tasks comfortably.

**Why This Matters**: FR-006, FR-007 - Multi-column grids on mobile cause horizontal scroll and unreadable text. Single-column layout is essential for mobile readability.

**Implementation Scope**:
- Modify `app/priorities/page.tsx` and/or `app/priorities/components/TaskList.tsx`
- Apply responsive grid classes:
  - Mobile (<1024px): `grid-cols-1` (single column)
  - Desktop (≥1024px): `lg:grid-cols-2` or `lg:grid-cols-3` (multi-column)
- Ensure gap spacing responsive: `gap-4` (16px, sufficient for both layouts)
- Verify no horizontal scroll on mobile viewports

**UI Entry Point**: `app/priorities/page.tsx` → Task grid layout

**Frontend Work**:
```tsx
// app/priorities/page.tsx or TaskList.tsx
<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
  {tasks.map((task) => (
    <TaskCard key={task.id} task={task} />
  ))}
</div>
```

**Backend Work**: N/A (CSS-only changes)

**Data Layer**: N/A (no data persistence)

**Visible Outcome**:
- SEE: Tasks display in single column on mobile, multi-column on desktop
- DO: Resize to 375px, navigate to /priorities
- VERIFY: Tasks in single column, no horizontal scroll, each card readable

**Test Scenario** (using T002 and T004 test guides):
1. Run T002_MOBILE_375PX_TEST.md → S002-3
2. Navigate to http://localhost:3000/priorities in 375px viewport
3. **PASS**: Tasks in single column (grid-cols-1), no horizontal scroll
4. Resize to 1024px viewport
5. **PASS**: Multi-column grid activates (lg:grid-cols-2 or lg:grid-cols-3)
6. Run T004_DESKTOP_1024PX_TEST.md → S004-1
7. **PASS**: Grid spacing and alignment consistent with previous design

**Acceptance Criteria**:
- [X] Task grid has `grid-cols-1 lg:grid-cols-3` (or `lg:grid-cols-2`)
- [X] Grid gap appropriate: `gap-4` or `gap-6`
- [ ] T002 § S002-3 test passes (single-column on 375px)
- [ ] T003 § S003-2 test passes (single-column on 768px)
- [ ] T004 § S004-1 test passes (multi-column on 1024px+)

**Dependencies**: T002, T003, T004 test guides complete

**Estimated Effort**: 45 minutes

---

## T011: Make Dashboard Grid Mobile-Responsive (Document Cards) [SLICE] [P]

**User Story**: As a mobile user viewing my document library, I can scroll through documents in a readable single-column list, so that I can quickly find and access my uploaded files.

**Why This Matters**: FR-006, FR-007 - Dashboard document grid must follow same responsive pattern as task grids for consistency.

**Implementation Scope**:
- Modify `app/dashboard/page.tsx`
- Apply responsive grid classes to document card grid:
  - Mobile (<1024px): `grid-cols-1` (single column)
  - Desktop (≥1024px): `lg:grid-cols-2` or `lg:grid-cols-3` (multi-column)
- Ensure card content responsive (titles, metadata, action buttons)

**UI Entry Point**: `app/dashboard/page.tsx` → Document grid layout

**Frontend Work**:
```tsx
// app/dashboard/page.tsx
<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
  {documents.map((doc) => (
    <Card key={doc.id}>
      {/* Document card content */}
    </Card>
  ))}
</div>
```

**Backend Work**: N/A (CSS-only changes)

**Data Layer**: N/A (no data persistence)

**Visible Outcome**:
- SEE: Document cards in single column on mobile, multi-column on desktop
- DO: Resize to 375px, navigate to /dashboard
- VERIFY: Cards in single column, no horizontal scroll, metadata readable

**Test Scenario** (using T002 and T004 test guides):
1. Upload test documents to populate dashboard
2. Run T002 mobile test (custom scenario for dashboard)
3. Navigate to http://localhost:3000/dashboard in 375px viewport
4. **PASS**: Documents in single column, no horizontal scroll
5. Resize to 1024px viewport
6. **PASS**: Multi-column grid activates
7. Run T004_DESKTOP_1024PX_TEST.md → S004-4
8. **PASS**: Grid spacing consistent with previous design

**Acceptance Criteria**:
- [X] Dashboard grid has `grid-cols-1 lg:grid-cols-2` (or `lg:grid-cols-3`)
- [X] Card content responsive (no overflow on mobile)
- [ ] T002 custom dashboard test passes (single-column on 375px)
- [ ] T004 § S004-4 test passes (multi-column on 1024px+)

**Dependencies**: T002, T004 test guides complete (parallel with T010)

**Estimated Effort**: 45 minutes

---

## T012: Apply Input Component to All Form Modals [SLICE]

**User Story**: As a mobile user filling out forms across the app, I can tap any input field without iOS auto-zoom, so that I can maintain context while entering data in modals and forms.

**Why This Matters**: FR-009 to FR-012 - Ensures iOS auto-zoom prevention (from T006) is applied consistently across all forms.

**Implementation Scope**:
- Update `app/components/OutcomeBuilder.tsx` to use responsive Input component (from T006)
- Update `app/components/TextInputModal.tsx` to use responsive Input component
- Update `app/components/ReflectionInput.tsx` to use responsive Input component
- Verify all inputs use `text-base sm:text-sm` and `h-12 sm:h-10`
- Apply to Textarea components as well (same responsive pattern)

**UI Entry Point**:
- `app/components/OutcomeBuilder.tsx` → Direction, Object, Metric, Clarifier inputs
- `app/components/TextInputModal.tsx` → Text input field
- `app/components/ReflectionInput.tsx` → Reflection text area

**Frontend Work**:
```tsx
// app/components/OutcomeBuilder.tsx (example)
<Input
  id="direction"
  placeholder="e.g., Increase, Decrease, Maintain"
  {...form.register('direction')}
  className="text-base sm:text-sm h-12 sm:h-10" // Already in component from T006
/>

<Textarea
  id="clarifier"
  placeholder="Optional: Add context or constraints"
  {...form.register('clarifier')}
  className="text-base sm:text-sm min-h-[96px] sm:min-h-[80px]" // Responsive min-height
/>
```

**Backend Work**: N/A (CSS-only changes)

**Data Layer**: N/A (no data persistence)

**Visible Outcome**:
- SEE: All form inputs in modals use mobile-responsive sizing
- DO: Open OutcomeBuilder, TextInputModal, ReflectionPanel on 375px viewport
- VERIFY: Tap each input, no iOS auto-zoom, consistent sizing across all forms

**Test Scenario** (using T002 test guide):
1. Run T002_MOBILE_375PX_TEST.md → S002-4
2. Navigate to http://localhost:3000 in 375px viewport
3. Open OutcomeBuilder modal, tap "Direction" input
4. **PASS**: No auto-zoom, font = 16px, height = 48px
5. Open TextInputModal, tap text input
6. **PASS**: No auto-zoom, font = 16px, height = 48px
7. Open ReflectionPanel, tap reflection textarea
8. **PASS**: No auto-zoom, font = 16px, min-height = 96px

**Acceptance Criteria**:
- [X] OutcomeBuilder inputs use responsive Input component
- [X] TextInputModal input uses responsive Input component
- [X] ReflectionInput textarea uses responsive sizing
- [ ] T002 § S002-4 test passes for all 3 modals
- [ ] Desktop regression test (T004 § S004-3) passes

**Dependencies**: T006 Input component complete

**Estimated Effort**: 1 hour

---

## T013: Apply Dialog Component to All Modals (Mobile Optimization) [SLICE]

**User Story**: As a mobile user interacting with any modal in the app, I can see more content and interact comfortably without excessive scrolling, so that modal-based workflows are as efficient as desktop.

**Why This Matters**: FR-013 to FR-015 - Ensures modal optimization (from T007) is applied consistently across all dialogs.

**Implementation Scope**:
- Verify `app/components/OutcomeBuilder.tsx` uses responsive Dialog (from T007)
- Verify `app/priorities/components/GapDetectionModal.tsx` uses responsive Dialog
- Verify `app/components/TextInputModal.tsx` uses responsive Dialog
- Ensure all modals inherit `max-h-[95vh] sm:max-h-[80vh]` and `p-3 sm:p-6`
- Check for any custom modal implementations that bypass Dialog component

**UI Entry Point**:
- OutcomeBuilder → Outcome creation flow
- GapDetectionModal → Gap analysis flow
- TextInputModal → Quick text input

**Frontend Work**:
```tsx
// Verify each modal uses Dialog component properly
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// All modals should automatically inherit responsive sizing from T007 Dialog component
<Dialog open={open} onOpenChange={onOpenChange}>
  <DialogContent> {/* Already has max-h-[95vh] sm:max-h-[80vh] p-3 sm:p-6 */}
    <DialogHeader>
      <DialogTitle>Modal Title</DialogTitle>
    </DialogHeader>
    {/* Modal content */}
  </DialogContent>
</Dialog>
```

**Backend Work**: N/A (CSS-only changes)

**Data Layer**: N/A (no data persistence)

**Visible Outcome**:
- SEE: All modals fill 95% of mobile viewport, reduced padding (12px)
- DO: Open each modal on 375px viewport, measure height
- VERIFY: Modal height ≥635px (95% of 667px), padding = 12px, content not cramped

**Test Scenario** (using T002 test guide):
1. Run T002_MOBILE_375PX_TEST.md → S002-2
2. Navigate to http://localhost:3000 in 375px viewport
3. Test OutcomeBuilder modal:
   - Tap "Outcome" button
   - **PASS**: Modal height ≥635px, padding = 12px
4. Test GapDetectionModal (if accessible):
   - Open gap detection flow
   - **PASS**: Modal height ≥635px, padding = 12px
5. Test TextInputModal:
   - Open text input flow
   - **PASS**: Modal height ≥635px, padding = 12px

**Acceptance Criteria**:
- [X] OutcomeBuilder uses responsive Dialog component
- [X] GapDetectionModal uses responsive Dialog component
- [X] TextInputModal uses responsive Dialog component
- [ ] T002 § S002-2 test passes for all 3 modals
- [ ] Desktop regression test (T004) passes (80vh height, 24px padding)

**Dependencies**: T007 Dialog component complete

**Estimated Effort**: 45 minutes

---

## T014: Make Radio Button Groups Mobile-Responsive (Vertical Stacking) [SLICE]

**User Story**: As a mobile user selecting options in forms, I can tap radio buttons comfortably in a vertical list, so that I can make selections without accidental mis-taps or scrolling.

**Why This Matters**: FR-016, FR-017 - Horizontal radio groups on mobile cause cramped tap targets and accidental selections. Vertical stacking provides ≥44px tap areas.

**Implementation Scope**:
- Modify `app/components/OutcomeBuilder.tsx` radio button groups (Direction field)
- Apply responsive flex direction:
  - Mobile (<475px): `flex-col` (vertical stack for tap targets)
  - Larger (≥475px): `xs:flex-row` (horizontal on wide enough viewports)
- Ensure each radio option has ≥44px height on mobile
- May require custom Tailwind config for `xs:` breakpoint (475px)

**UI Entry Point**: `app/components/OutcomeBuilder.tsx` → Direction field radio buttons

**Frontend Work**:
```tsx
// app/components/OutcomeBuilder.tsx
// RadioGroup for Direction field
<RadioGroup
  onValueChange={field.onChange}
  defaultValue={field.value}
  className="flex flex-col xs:flex-row gap-2 xs:gap-4"
>
  <div className="flex items-center space-x-2">
    <RadioGroupItem value="increase" id="increase" />
    <Label htmlFor="increase" className="cursor-pointer">
      Increase
    </Label>
  </div>
  {/* Other radio options... */}
</RadioGroup>

// May need to add xs: breakpoint to tailwind.config.ts:
// screens: {
//   xs: '475px',
//   sm: '640px',
//   lg: '1024px',
// }
```

**Backend Work**: N/A (CSS-only changes)

**Data Layer**: N/A (no data persistence)

**Visible Outcome**:
- SEE: Radio buttons stack vertically on narrow mobile (<475px), horizontal on wider viewports
- DO: Resize to 375px, open OutcomeBuilder
- VERIFY: Radio buttons vertical, each option ≥44px height, easy to tap

**Test Scenario** (using T002 test guide):
1. Run T002_MOBILE_375PX_TEST.md → S002-2
2. Navigate to http://localhost:3000 in 375px viewport
3. Open OutcomeBuilder modal
4. View "Direction" radio button group
5. **PASS**: Radio buttons stacked vertically, tap area ≥44px per option
6. Resize to 768px viewport
7. **PASS**: Radio buttons display horizontally (xs:flex-row if width ≥475px)

**Acceptance Criteria**:
- [X] Radio button group uses `flex-col xs:flex-row` layout
- [X] Each radio option has ≥44px touch target on mobile
- [X] `xs:` breakpoint configured in tailwind.config if needed
- [ ] T002 § S002-2 test passes (vertical on 375px)
- [ ] T003 § S003-3 test passes (horizontal on 768px if ≥475px)

**Dependencies**: T007 Dialog component complete, T002 test guide complete

**Estimated Effort**: 1 hour

---

## T015: Apply Tab Component to SummaryPanel [SLICE] [P]

**User Story**: As a mobile user viewing document summaries, I can navigate between Topics, Decisions, Actions, and LNO tabs without horizontal scrolling, so that I can access all summary sections on my small screen.

**Why This Matters**: FR-018 to FR-021 - Ensures tab optimization (from T008) is applied to the primary tab interface (SummaryPanel).

**Implementation Scope**:
- Verify `app/components/SummaryPanel.tsx` uses responsive Tabs component (from T008)
- Ensure TabsList and TabsTrigger inherit responsive sizing automatically
- Test with 4 tabs (Topics, Decisions, Actions, LNO) on 320px viewport (extreme edge case)
- Verify tabs wrap to second row if needed on very narrow viewports

**UI Entry Point**: `app/components/SummaryPanel.tsx` → Tab navigation for document summary sections

**Frontend Work**:
```tsx
// app/components/SummaryPanel.tsx
// Should automatically use responsive Tabs component from T008
<Tabs defaultValue="topics" className="w-full">
  <TabsList className="grid w-full grid-cols-4"> {/* May need responsive cols */}
    <TabsTrigger value="topics">Topics</TabsTrigger>
    <TabsTrigger value="decisions">Decisions</TabsTrigger>
    <TabsTrigger value="actions">Actions</TabsTrigger>
    <TabsTrigger value="lno">LNO</TabsTrigger>
  </TabsList>
  {/* Tab content panels... */}
</Tabs>
```

**Backend Work**: N/A (CSS-only changes)

**Data Layer**: N/A (no data persistence)

**Visible Outcome**:
- SEE: Tabs display with 12px font and 8px padding on mobile, 14px/16px on desktop
- DO: Upload document to generate SummaryPanel, view on 375px viewport
- VERIFY: All 4 tabs visible, no horizontal scroll, labels readable

**Test Scenario** (using T002 test guide):
1. Upload test document to generate summary
2. Run T002_MOBILE_375PX_TEST.md (custom tab scenario)
3. View SummaryPanel tabs on 375px viewport
4. **PASS**: All 4 tabs visible, font = 12px, padding = 8px, no horizontal scroll
5. Resize to 320px viewport (extreme edge case)
6. **PASS**: Tabs still visible, may wrap to second row if needed
7. Resize to 1024px viewport
8. **PASS**: Tabs font = 14px, padding = 16px, horizontal layout

**Acceptance Criteria**:
- [X] SummaryPanel uses responsive Tabs component from T008
- [ ] All 4 tabs visible on 320px viewport (wrapping allowed)
- [ ] Tabs readable and tappable on 375px viewport
- [ ] T002 custom tab test passes
- [ ] Desktop regression test (T004) passes

**Dependencies**: T008 Tabs component complete (parallel with T012-T014)

**Estimated Effort**: 30 minutes

---

## T016: Add Mobile Tactile Feedback (Tap Highlights & Transforms) [POLISH]

**User Story**: As a mobile user tapping interactive elements, I can see immediate visual feedback, so that I know my tap was registered and feel confident interacting with the app.

**Why This Matters**: FR-022, FR-023 - Native app-like tactile feedback improves perceived responsiveness and user confidence.

**Implementation Scope**:
- Add mobile tap feedback utilities to `app/globals.css`:
  - `.tap-highlight-light` → `rgba(0, 0, 0, 0.1)` for light mode
  - `.tap-highlight-dark` → `rgba(255, 255, 255, 0.1)` for dark mode
- Apply `-webkit-tap-highlight-color` to buttons (already in T005)
- Verify `active:scale-[0.98]` and `active:brightness-95` from T005 working
- Add `transition-transform duration-100` for smooth animation
- Ensure desktop disables tap feedback via `sm:active:scale-100`

**UI Entry Point**: All buttons and interactive elements across the app

**Frontend Work**:
```css
/* app/globals.css */
@layer utilities {
  /* Mobile tap highlight colors */
  .tap-highlight-light {
    -webkit-tap-highlight-color: rgba(0, 0, 0, 0.1);
  }

  .tap-highlight-dark {
    -webkit-tap-highlight-color: rgba(255, 255, 255, 0.1);
  }

  /* Already applied in Button component from T005:
     active:scale-[0.98] sm:active:scale-100 active:brightness-95
     transition-transform duration-100 */
}
```

**Backend Work**: N/A (CSS-only changes)

**Data Layer**: N/A (no data persistence)

**Visible Outcome**:
- SEE: Buttons shrink slightly (98%) and darken when tapped on mobile
- DO: Tap any button on 375px viewport
- VERIFY: Visual feedback (scale + brightness), smooth 100ms transition

**Test Scenario** (using T002 test guide):
1. Run T002_MOBILE_375PX_TEST.md (custom tactile feedback test)
2. Navigate to http://localhost:3000 in 375px viewport
3. Tap and hold "Reflections" button
4. **PASS**: Button scales to 98%, brightness reduces, animation smooth
5. Release tap
6. **PASS**: Button returns to normal size immediately
7. Resize to 1024px viewport
8. Click button with mouse
9. **PASS**: No scale animation (sm:active:scale-100 disables it)

**Acceptance Criteria**:
- [X] Tap highlight utilities added to globals.css
- [X] Button component has tap feedback (from T005)
- [X] Transition smooth (`transition-transform duration-100`)
- [X] Desktop disables tap feedback (`sm:active:scale-100`)
- [ ] T002 custom tactile feedback test passes

**Dependencies**: T005 Button component complete

**Estimated Effort**: 30 minutes

---

## T017: Strengthen Mobile Shadows (Sunlight Visibility) [POLISH] [P]

**User Story**: As a mobile user viewing the app outdoors in sunlight, I can still see interface depth and boundaries clearly, so that I can navigate and interact without straining my eyes.

**Why This Matters**: FR-024 - Mobile devices are often used outdoors. Stronger shadows improve sunlight visibility without affecting desktop UX.

**Implementation Scope**:
- Add mobile-specific shadow utilities to `app/globals.css`:
  - `.shadow-2layer-sm-mobile` → Enhanced version of `.shadow-2layer-sm` (stronger)
  - `.shadow-2layer-md-mobile` → Enhanced version of `.shadow-2layer-md`
- Apply responsive shadows to key components:
  - Cards: `shadow-2layer-md-mobile sm:shadow-2layer-md`
  - Buttons: `shadow-2layer-sm-mobile sm:shadow-2layer-sm`
  - Modals: Already have `.shadow-lg` (sufficient)

**UI Entry Point**: Card components throughout the app (upload cards, task cards, document cards)

**Frontend Work**:
```css
/* app/globals.css */
@layer utilities {
  /* Enhanced mobile shadows for sunlight visibility */
  .shadow-2layer-sm-mobile {
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.15),
      0 2px 4px rgba(0, 0, 0, 0.2); /* Stronger outer shadow */
  }

  .dark .shadow-2layer-sm-mobile {
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.08),
      0 2px 4px rgba(0, 0, 0, 0.5); /* Stronger for dark mode */
  }

  .shadow-2layer-md-mobile {
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.2),
      0 4px 8px rgba(0, 0, 0, 0.25); /* Stronger outer shadow */
  }

  .dark .shadow-2layer-md-mobile {
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.1),
      0 4px 8px rgba(0, 0, 0, 0.6);
  }
}
```

**Backend Work**: N/A (CSS-only changes)

**Data Layer**: N/A (no data persistence)

**Visible Outcome**:
- SEE: Cards and buttons have stronger shadows on mobile, same shadows on desktop
- DO: View app on 375px viewport, inspect shadow depth
- VERIFY: Shadows more pronounced on mobile, desktop unchanged

**Test Scenario**:
1. Navigate to http://localhost:3000 in 375px viewport
2. View upload card shadow depth
3. **PASS**: Shadow visible and stronger than desktop (inspect in DevTools)
4. Resize to 1024px viewport
5. **PASS**: Shadow returns to standard `.shadow-2layer-md`
6. No visual regressions on desktop (T004)

**Acceptance Criteria**:
- [X] Mobile shadow utilities added to globals.css
- [X] Responsive shadow classes applied to cards and buttons
- [X] Shadows stronger on mobile (<640px), standard on desktop (≥640px)
- [ ] Desktop regression test (T004) passes (no shadow changes)

**Dependencies**: None (parallel with T016)

**Estimated Effort**: 45 minutes

---

## T018: Run Desktop Regression Test Suite (1024px+) [SLICE]

**User Story**: As a desktop user, I can continue using the app with identical layouts and functionality post-mobile-optimization, so that my workflow is not disrupted by mobile improvements.

**Why This Matters**: FR-026 to FR-029 - Zero desktop regressions is a hard requirement. This validates all desktop layouts remain unchanged.

**Implementation Scope**:
- Execute `T004_DESKTOP_1024PX_TEST.md` manual test guide
- Run all 4 scenarios (S004-1 through S004-4):
  - Multi-column grid activation (lg:grid-cols-2/3)
  - Button sizing consistency (36px via sm:h-9)
  - Form input sizing (40px via sm:h-10, 14px font via sm:text-sm)
  - Dashboard grid layout (multi-column, no regressions)
- Document any visual regressions found
- Verify no layout changes from pre-mobile-optimization state

**UI Entry Point**: All pages and components on 1920×1080px viewport

**Test Scenario** (using T004 test guide):
1. Run T004_DESKTOP_1024PX_TEST.md → All scenarios
2. Navigate to http://localhost:3000 in 1920×1080px viewport
3. Execute S004-1: Priorities page multi-column grid
   - **PASS**: Tasks in 2-3 column grid (lg:grid-cols-3)
4. Execute S004-2: Button sizing across pages
   - **PASS**: All buttons 36px height (sm:h-9)
5. Execute S004-3: Form input sizing in modals
   - **PASS**: Inputs 40px height, 14px font (sm:h-10 sm:text-sm)
6. Execute S004-4: Dashboard grid layout
   - **PASS**: Documents in multi-column grid, no visual changes

**Acceptance Criteria**:
- [ ] T004 § S004-1 passes (multi-column grids active)
- [ ] T004 § S004-2 passes (button sizing = 36px)
- [ ] T004 § S004-3 passes (form sizing = 40px height, 14px font)
- [ ] T004 § S004-4 passes (dashboard unchanged)
- [ ] Zero visual regressions documented
- [ ] All desktop layouts match pre-implementation state

**Dependencies**: All component tasks (T005-T015) complete

**Estimated Effort**: 1 hour (comprehensive testing)

---

## T019: Run Accessibility Audit (WCAG AA Compliance) [SLICE] [P]

**User Story**: As a user with accessibility needs, I can interact with all interface elements comfortably regardless of device, so that the app is inclusive and compliant with accessibility standards.

**Why This Matters**: FR-031 - WCAG 2.1 Level AA compliance is legally required in many jurisdictions and ensures inclusive design.

**Implementation Scope**:
- Run Lighthouse accessibility audit in Chrome DevTools
- Execute on both mobile (375px) and desktop (1920px) viewports
- Verify:
  - Contrast ratios ≥4.5:1 (WCAG AA minimum) - FR-031
  - Touch targets ≥44×44px on mobile (WCAG AAA) - FR-001, FR-002
  - All interactive elements keyboard accessible
  - No layout shift (CLS <0.1) - FR-032
  - ARIA labels present where needed
- Document audit results and fix any critical issues

**UI Entry Point**: All pages, run Lighthouse from Chrome DevTools

**Test Scenario** (using quickstart.md § Accessibility Validation):
1. Open Chrome DevTools → Lighthouse tab
2. Configure: Device = Mobile, Categories = Accessibility
3. Run audit on http://localhost:3000 (375px viewport)
4. **PASS**: Score ≥90/100, no critical violations
5. Verify touch targets ≥44×44px (manual check with DevTools Inspect)
6. Run audit on desktop (1920×1080px viewport)
7. **PASS**: Score ≥90/100, contrast ratios maintained

**Acceptance Criteria**:
- [ ] Lighthouse accessibility score ≥90/100 on mobile (375px)
- [ ] Lighthouse accessibility score ≥90/100 on desktop (1920px)
- [ ] Contrast ratio violations: 0 (all ≥4.5:1)
- [ ] Touch target violations: 0 on mobile (all ≥44×44px)
- [ ] Keyboard accessibility: All interactive elements reachable
- [ ] Layout shift (CLS): <0.1 on viewport resize

**Dependencies**: All component tasks (T005-T015) complete (parallel with T018)

**Estimated Effort**: 45 minutes

---

## T020: Validate Performance (Bundle Size & Layout Shift) [SLICE] [P]

**User Story**: As a user on a slow mobile connection, I can load and interact with the app as quickly as before mobile optimization, so that responsive design does not compromise performance.

**Why This Matters**: FR-030, FR-033 - Pure CSS implementation must not increase JavaScript bundle size. Performance parity is critical for mobile users.

**Implementation Scope**:
- Run `npm run build` and compare bundle sizes (before vs after)
- Execute quickstart.md § Performance Validation procedures
- Verify:
  - JavaScript bundle size increase ≤100 bytes (FR-033)
  - Layout shift <50ms on viewport resize (FR-032)
  - Page load times unchanged (measure via DevTools Network tab)
  - CSS stylesheet increase <1KB (expected from new Tailwind classes)
- Document performance metrics in test results

**UI Entry Point**: Build output analysis + browser DevTools Performance tab

**Test Scenario** (using quickstart.md § Performance Validation):
1. Checkout `main` branch: `git checkout main`
2. Run `npm run build`, note `.next/static/chunks/pages/_app-[hash].js` size
3. Checkout feature branch: `git checkout 012-mobile-first-transformation`
4. Run `npm run build`, compare bundle size
5. **PASS**: Bundle size difference ≤100 bytes
6. Open DevTools → Performance tab, record viewport resize (375px → 1024px)
7. **PASS**: Layout shift <50ms
8. Measure page load time (Network tab, Disable cache)
9. **PASS**: Load time unchanged (±10%)

**Acceptance Criteria**:
- [ ] JavaScript bundle size increase ≤100 bytes
- [ ] CSS stylesheet increase ≤1KB (Tailwind classes only)
- [ ] Layout shift <50ms on viewport resize (375px ↔ 1024px)
- [ ] Page load time unchanged (within ±10% variance)
- [ ] Performance metrics documented in test results

**Dependencies**: All component tasks (T005-T015) complete (parallel with T018-T019)

**Estimated Effort**: 45 minutes

---

## Task Summary

**Total Tasks**: 20
- **[SETUP]**: 4 tasks (T001-T004 - Manual test guides)
- **[SLICE]**: 14 tasks (T005-T015, T018-T020 - Vertical slices)
- **[POLISH]**: 2 tasks (T016-T017 - Visual enhancements)

**Parallelization Opportunities**:
- T002, T003, T004 (test guides) can run parallel with T001
- T008 (Tabs) can run parallel with T005-T007 (Button, Input, Dialog)
- T011 (Dashboard grid) can run parallel with T010 (Task grids)
- T015 (Tab application) can run parallel with T012-T014 (Form applications)
- T017 (Shadows) can run parallel with T016 (Tactile feedback)
- T019, T020 (Audits) can run parallel with T018 (Desktop regression)

**Critical Path**:
T001-T004 → T005-T007 → T009 → T010-T011 → T012-T015 → T016-T017 → T018-T020

**Estimated Total Effort**: ~18-20 hours (1.5-2 days with parallel execution)

**Success Criteria**:
- All 4 manual test guides pass (T001-T004)
- All component modifications complete (T005-T015)
- Visual polish applied (T016-T017)
- Zero desktop regressions (T018)
- WCAG AA compliant (T019)
- Zero bundle size increase (T020)

---

## Implementation Notes

**Constitution Compliance Validation**:
- ✅ Autonomous: CSS media queries activate automatically (no manual triggers)
- ✅ Deterministic: CSS produces consistent, browser-standard rendering
- ✅ Modular: Tailwind utilities isolated to individual components
- ✅ TDD: Manual test guides created first (T001-T004)
- ✅ Observable: Browser DevTools provide complete observability
- ✅ Vertical Slice: Each task delivers complete UI changes (SEE + DO + VERIFY)

**Rollback Plan**:
If critical issues arise, revert individual component changes via git. CSS-only changes have zero risk of data corruption or backend failures.

**Deployment Strategy**:
1. Merge feature branch after all tests pass
2. Deploy to staging for QA validation
3. Run manual test guides (T001-T004) on staging
4. Deploy to production with feature flag (if available)
5. Monitor user feedback and analytics for mobile viewport usage

---

*Based on Constitution v1.1.7 - All tasks are vertical slices delivering complete user value*
