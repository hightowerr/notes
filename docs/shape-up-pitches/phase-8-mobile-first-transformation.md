# Shape Up Pitch: Phase 8 - Mobile-First Transformation

## Problem

**The app has a solid desktop experience, but mobile users face critical usability issues that prevent confident mobile launch.**

Current mobile experience has significant gaps:
1. **Header overflow on small screens (320-375px)** - Button labels hidden, badge overflows, poor layout
2. **Horizontal scrolling on tablets** - LNO tasks grid breaks at 768px instead of 1024px
3. **Touch targets too small** - 32px buttons violate Apple/Android 44px minimum guideline
4. **Inconsistent form inputs** - Mix of mobile-friendly (h-11) and desktop-only (h-10) sizing
5. **Modal usability issues** - Poor padding, stacked elements on mobile, insufficient viewport usage

**Pain points:**
- Users on iPhone SE (375px) cannot tap buttons reliably without zooming
- Dashboard grids cause horizontal scrolling between 768-1024px breakpoints
- Forms trigger auto-zoom on iOS despite 16px font-size prevention
- Modals consume too much vertical space, requiring excessive scrolling
- No visual feedback for touch interactions (tap highlights)

**Current state:**
- ✅ iOS auto-zoom prevention (16px input font)
- ✅ Depth-based color system (responsive shadows)
- ✅ ReflectionPanel mobile/desktop detection
- ✅ OutcomeBuilder partial mobile sizing (h-11 md:h-10)
- ⚠️ Header overflow on 320-375px screens (app/page.tsx:470-496)
- ⚠️ SummaryPanel LNO tasks horizontal scroll (md:grid-cols-3 → should be lg:)
- ⚠️ Touch targets too small (32px size="sm" buttons, need 44px minimum)

**Mobile usage data:**
- 40-50% of users access web apps via mobile devices (industry standard)
- iPhone SE (375x667) and iPhone 14 (390x844) are dominant viewport sizes
- WCAG 2.1 Success Criterion 2.5.5 requires 44x44px minimum touch targets

**Example user story:**
> "I tried using the app on my iPhone during my commute, but I kept accidentally tapping the wrong buttons. The dashboard also scrolled sideways even though I'm on a phone. I gave up and waited until I got to my laptop."

---

## Solution

**Transform the app to mobile-first with 44px touch targets, responsive grids, and optimized modals—without breaking desktop experience.**

### Appetite: 1.5 weeks (7-8 working days)

### Breadboard Sketch

```
┌──────────────────────────────────────────────────────────┐
│  Phase 1: CRITICAL FIXES (3 days)                        │
│                                                           │
│  Goal: Make app usable on 320-414px screens              │
│                                                           │
│  ✅ Fix header overflow (app/page.tsx)                   │
│     Before: [🔄 Process] hidden sm:inline → overflows    │
│     After:  [🔄 Process] always visible, 44px tall       │
│                                                           │
│  ✅ Fix SummaryPanel grid breakpoints                    │
│     Before: md:grid-cols-3 (768px) → horizontal scroll   │
│     After:  lg:grid-cols-3 (1024px) → no scroll          │
│                                                           │
│  ✅ Universal touch target fix (44px minimum)            │
│     Before: size="sm" (h-9, 36px) → hard to tap          │
│     After:  h-11 sm:h-9 (44px → 36px) → easy taps        │
│                                                           │
│  ✅ Add xs: breakpoint (475px)                           │
│     New: Fine-grained control between mobile and sm      │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  Phase 2: IMPORTANT UX IMPROVEMENTS (4 days)             │
│                                                           │
│  ✅ Form input consistency                               │
│     Pattern: h-12 sm:h-10 text-base sm:text-sm          │
│     Files: OutcomeBuilder, ReflectionInput, all forms    │
│                                                           │
│  ✅ Modal mobile optimization                            │
│     - Increase max-height: max-h-[95vh] sm:max-h-[90vh]  │
│     - Reduce padding: p-3 sm:p-6                         │
│     - Stack radio buttons: flex-col xs:flex-row          │
│     - Compact preview sections                           │
│                                                           │
│  ✅ SummaryPanel tab navigation                          │
│     - Reduce padding: px-2 sm:px-4                       │
│     - Smaller text: text-xs sm:text-sm                   │
│     - Tighter gaps: gap-1 sm:gap-2                       │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  Phase 3: POLISH & ENHANCEMENTS (3 days)                 │
│                                                           │
│  ✅ Mobile tap highlights                                │
│     CSS: -webkit-tap-highlight-color + scale(0.98)       │
│     Reason: Visual feedback for touch interactions       │
│                                                           │
│  ✅ Strengthen mobile shadows                            │
│     Add: Mobile-specific shadow utilities                │
│     Reason: Better visibility in bright sunlight         │
│                                                           │
│  ✅ Upload zone text enhancement                         │
│     Fix: text-lg sm:text-xl for readability              │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  Visual Example: Header Transformation                   │
│                                                           │
│  BEFORE (320px):                                         │
│  ┌────────────────────────────┐                          │
│  │ [🔄] hidden 📊 5 docs overflow│                      │
│  └────────────────────────────┘                          │
│                                                           │
│  AFTER (320px):                                          │
│  ┌────────────────────────────┐                          │
│  │ [🔄 Process] (44px tall)   │                          │
│  │ 📊 5 documents uploaded    │                          │
│  └────────────────────────────┘                          │
│                                                           │
│  Desktop (≥640px) unchanged: horizontal layout           │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  Visual Example: Grid Transformation                     │
│                                                           │
│  BEFORE (768px iPad):                                    │
│  ┌──────────────────────────────────────┐                │
│  │ [Task 1] [Task 2] [Task 3→scroll→]  │                │
│  └──────────────────────────────────────┘                │
│                                                           │
│  AFTER (768px iPad):                                     │
│  ┌──────────────────────────────────────┐                │
│  │ [Task 1]                             │                │
│  │ [Task 2]                             │                │
│  │ [Task 3]                             │                │
│  └──────────────────────────────────────┘                │
│                                                           │
│  Desktop (≥1024px): 3-column grid (unchanged)            │
└──────────────────────────────────────────────────────────┘
```

### Technical Implementation

**1. Tailwind Configuration Extension**

**File: `tailwind.config.ts` (create if not exists)**
```typescript
import type { Config } from 'tailwindcss';

const config: Config = {
  // ... existing config
  theme: {
    extend: {
      screens: {
        'xs': '475px', // New breakpoint between mobile and sm (640px)
      },
      // Mobile-friendly touch target utilities
      height: {
        '11': '2.75rem', // 44px - Apple/Android touch target minimum
      },
    },
  },
};

export default config;
```

**2. Global Mobile CSS Enhancements**

**File: `app/globals.css`**
```css
/* Add to existing file */

/* Mobile tap highlights and feedback */
@media (max-width: 640px) {
  /* Visual feedback for all interactive elements */
  button,
  a,
  [role="button"],
  [role="tab"] {
    -webkit-tap-highlight-color: rgba(var(--primary-2), 0.2);
    transition: transform 0.1s ease;
  }

  /* Subtle scale feedback on tap */
  button:active,
  a:active,
  [role="button"]:active {
    transform: scale(0.98);
  }

  /* Prevent double-tap zoom on buttons */
  button,
  [role="button"] {
    touch-action: manipulation;
  }
}

/* Stronger shadows for mobile (sunlight visibility) */
@media (max-width: 640px) {
  .shadow-2layer-sm {
    box-shadow:
      0 1px 3px 0 rgba(0, 0, 0, 0.12),
      inset 0 1px 0 0 rgba(255, 255, 255, 0.15);
  }

  .shadow-2layer-md {
    box-shadow:
      0 4px 8px -2px rgba(0, 0, 0, 0.15),
      inset 0 1px 0 0 rgba(255, 255, 255, 0.18);
  }

  .shadow-2layer-lg {
    box-shadow:
      0 10px 20px -5px rgba(0, 0, 0, 0.18),
      inset 0 1px 0 0 rgba(255, 255, 255, 0.2);
  }
}
```

**3. Component Updates (Detailed)**

**Phase 1, Task 1.1: Header Overflow Fix**

**File: `app/page.tsx` (lines 470-496)**

```typescript
// BEFORE (desktop-first, mobile-hostile)
<div className="flex items-center gap-3">
  <Button
    onClick={() => reprocessAllHandler()}
    size="sm"  // ❌ 36px - too small for mobile
    className="flex items-center gap-2"
  >
    <RefreshCw className="h-4 w-4" />
    <span className="hidden sm:inline">Process</span> {/* ❌ Hidden on mobile */}
  </Button>

  <Badge variant="secondary" className="whitespace-nowrap">
    📊 {uploadedCount} documents uploaded {/* ❌ Overflows on 320px */}
  </Badge>
</div>

// AFTER (mobile-first, desktop-optimized)
<div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
  {/* Touch-friendly button (44px on mobile) */}
  <Button
    onClick={() => reprocessAllHandler()}
    size="sm"
    className="h-11 sm:h-9 flex items-center justify-center gap-2"
  >
    <RefreshCw className="h-4 w-4" />
    <span>Process</span> {/* ✅ Always visible */}
  </Button>

  {/* Badge on separate row on mobile */}
  <Badge variant="secondary" className="whitespace-nowrap text-center sm:text-left">
    📊 {uploadedCount} documents
  </Badge>
</div>
```

**Phase 1, Task 1.2: SummaryPanel Grid Fix**

**File: `app/components/SummaryPanel.tsx` (line 144, 245)**

```typescript
// BEFORE (causes horizontal scroll 768-1024px)
<div className="grid gap-3 md:grid-cols-2"> {/* Line 144 - Actions */}
<div className="grid gap-3 md:grid-cols-3"> {/* Line 245 - LNO Tasks */}

// AFTER (single-column until desktop)
<div className="grid gap-3 lg:grid-cols-2"> {/* ✅ 1024px+ only */}
<div className="grid gap-3 lg:grid-cols-3"> {/* ✅ 1024px+ only */}

// Additional mobile optimization for section headers
<h3 className="text-base sm:text-lg font-semibold mb-3">
  {/* ✅ Smaller text on mobile */}
</h3>
```

**Phase 1, Task 1.3: Universal Touch Target Fix**

**Files: Multiple components with `size="sm"` buttons**

**Pattern to apply:**
```typescript
// BEFORE
<Button size="sm">Action</Button>

// AFTER
<Button size="sm" className="h-11 sm:h-9">Action</Button>
```

**Affected files (search for `size="sm"`)**:
- `app/page.tsx` - All action buttons
- `app/priorities/page.tsx` - "Analyze Tasks", "View Gaps" buttons
- `app/components/SummaryPanel.tsx:196-217` - Export buttons
- `app/priorities/components/TaskRow.tsx` - Task action buttons
- `app/priorities/components/GapDetectionModal.tsx` - Action buttons

**Phase 2, Task 2.1: Form Input Consistency**

**Files: All form components**

**Pattern:**
```typescript
// BEFORE (inconsistent)
<Input className="h-10 text-sm" /> {/* Some components */}
<Input className="h-11 text-base" /> {/* Other components */}

// AFTER (consistent mobile-first)
<Input className="h-12 sm:h-10 text-base sm:text-sm" />
<Textarea className="text-base sm:text-sm" />
<Select className="h-12 sm:h-10 text-base sm:text-sm" />
```

**Affected files:**
- `app/components/OutcomeBuilder.tsx` - Already has some, standardize all
- `app/components/ReflectionInput.tsx` - Input fields and textarea
- `app/components/TextInputModal.tsx` - Title and content inputs
- `app/priorities/components/GapDetectionModal.tsx` - Task edit inputs

**Phase 2, Task 2.2: Modal Mobile Optimization**

**File: `app/components/OutcomeBuilder.tsx`**

```typescript
// BEFORE
<DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-6">
  <div className="space-y-6">
    {/* Radio buttons horizontal on all screens */}
    <div className="flex gap-4">
      <RadioGroupItem value="timebound" />
      <RadioGroupItem value="continuous" />
    </div>

// AFTER (mobile-optimized)
<DialogContent className="max-w-2xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto p-3 sm:p-6">
  <div className="space-y-4 sm:space-y-6">
    {/* Radio buttons stack on mobile */}
    <div className="flex flex-col xs:flex-row gap-3 xs:gap-4">
      <RadioGroupItem value="timebound" className="h-11 xs:h-auto" />
      <RadioGroupItem value="continuous" className="h-11 xs:h-auto" />
    </div>

    {/* Compact preview section on mobile */}
    <div className="text-sm sm:text-base p-3 sm:p-4 bg-layer-2 rounded-md">
      {preview}
    </div>
```

**File: `app/priorities/components/GapDetectionModal.tsx`**

```typescript
// Similar pattern - increase viewport usage, reduce padding
<DialogContent className="max-w-4xl max-h-[95vh] sm:max-h-[90vh] p-3 sm:p-6">
  {/* Task cards with better mobile spacing */}
  <div className="space-y-3 sm:space-y-4">
    {tasks.map(task => (
      <Card className="p-3 sm:p-4">
        {/* Editable fields with mobile sizing */}
        <Input className="h-12 sm:h-10 text-base sm:text-sm" />
      </Card>
    ))}
  </div>
</DialogContent>
```

**Phase 2, Task 2.3: SummaryPanel Tab Navigation**

**File: `app/components/SummaryPanel.tsx` (lines 242-254)**

```typescript
// BEFORE (tabs too cramped on mobile)
<Tabs defaultValue="topics" className="w-full">
  <TabsList className="grid w-full grid-cols-4 gap-2">
    <TabsTrigger value="topics" className="px-4 flex items-center gap-2">
      <BookOpen className="h-4 w-4" />
      <span className="text-sm">Topics</span>

// AFTER (mobile-optimized tabs)
<Tabs defaultValue="topics" className="w-full">
  <TabsList className="grid w-full grid-cols-4 gap-1 sm:gap-2">
    <TabsTrigger
      value="topics"
      className="px-2 sm:px-4 flex items-center gap-1 sm:gap-2"
    >
      <BookOpen className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
      <span className="text-xs sm:text-sm">Topics</span>
    </TabsTrigger>
    {/* Repeat for all tabs */}
```

**Phase 3, Task 3.1: Mobile Tap Highlights**

Already covered in `app/globals.css` section above.

**Phase 3, Task 3.2: Strengthen Mobile Shadows**

Already covered in `app/globals.css` section above.

**Phase 3, Task 3.3: Upload Zone Text Enhancement**

**File: `app/page.tsx` (lines 542-545)**

```typescript
// BEFORE
<p className="text-xl text-muted-foreground">

// AFTER
<p className="text-lg sm:text-xl text-muted-foreground">
```

---

## Rabbit Holes

**1. Building responsive design system from scratch**
- **Risk:** Trying to refactor entire design system, creating new utilities, redesigning component library
- **Timebox:** Only fix existing components. Don't create new design abstractions.
- **Why it doesn't matter yet:** Current system works. We're fixing mobile gaps, not redesigning architecture.

**2. Supporting every possible mobile device**
- **Risk:** Testing on 20+ device viewports, handling Android fragmentation, supporting tablets
- **Timebox:** Focus on 4 key viewports: 320px, 375px, 768px, 1024px
- **Why it doesn't matter yet:** These cover 90% of users (iPhone SE, iPhone 14, iPad Mini, desktop)

**3. Progressive Web App (PWA) features**
- **Risk:** Adding service workers, offline mode, install prompts, push notifications
- **Timebox:** Not in scope. Mobile-responsive web app only.
- **Why it doesn't matter yet:** Users can access via browser. PWA is Phase 9+ if needed.

**4. Mobile-specific features (gestures, haptics)**
- **Risk:** Implementing swipe actions, pull-to-refresh, haptic feedback
- **Timebox:** Standard web interactions only. No native mobile patterns.
- **Why it doesn't matter yet:** Users expect web apps to behave like web apps, not native apps.

**5. Responsive images and performance optimization**
- **Risk:** Adding srcset, picture elements, lazy loading, image optimization
- **Timebox:** Not in scope. App has minimal images (icons only).
- **Why it doesn't matter yet:** No performance issues detected. Premature optimization.

**6. Landscape mode optimization**
- **Risk:** Building separate layouts for landscape vs portrait on phones
- **Timebox:** Portrait-first. Landscape inherits responsive behavior.
- **Why it doesn't matter yet:** Most document reading happens in portrait. Good enough for Phase 8.

---

## No-Gos

**❌ Native mobile app (iOS/Android)**
- Web app only. Native apps are Phase 10+ if user demand validates it.

**❌ Tablet-specific layouts**
- Tablets use responsive breakpoints (768px+). No iPad-specific UI.

**❌ Mobile-only features (no desktop parity)**
- Every feature works on both mobile and desktop. No platform fragmentation.

**❌ Redesigning existing components**
- Only add responsive classes. Don't refactor component architecture.

**❌ Dark mode for mobile**
- Already exists system-wide. Don't create mobile-specific dark mode.

**❌ Performance profiling and optimization**
- Only fix usability issues. Performance work is separate if needed.

**❌ Accessibility audit beyond touch targets**
- WCAG AA compliance maintained. No additional accessibility work in this phase.

---

## Success Metrics

**Critical Fixes (Phase 1):**
- ✅ No horizontal scrolling on any viewport (320px - 1920px)
- ✅ All interactive elements ≥44px touch targets on mobile (<640px)
- ✅ Header fully functional on iPhone SE (375x667)
- ✅ SummaryPanel grids single-column until 1024px
- ✅ xs: breakpoint (475px) available for all components

**UX Improvements (Phase 2):**
- ✅ All form inputs use consistent sizing pattern (h-12 sm:h-10)
- ✅ Modals use ≥95vh on mobile (maximize viewport usage)
- ✅ Modal padding reduces to p-3 on mobile (more content space)
- ✅ Radio buttons stack vertically on mobile (<475px)
- ✅ Tab navigation readable with text-xs on mobile

**Polish (Phase 3):**
- ✅ Tap highlights visible on all interactive elements
- ✅ Active state scale feedback (0.98) on touch
- ✅ Stronger shadows on mobile (better sunlight visibility)
- ✅ Upload zone text readable on small screens

**Responsive Behavior:**
- ✅ 320px (iPhone SE 1st gen): No overflow, all buttons tappable
- ✅ 375px (iPhone SE 3rd gen): Comfortable spacing, no zoom needed
- ✅ 414px (iPhone 14 Pro Max): Optimal layout, single-column forms
- ✅ 768px (iPad Mini): Single-column grids, no horizontal scroll
- ✅ 1024px+ (Desktop): Multi-column layouts activate, desktop sizing

**Performance:**
- ✅ No layout shifts when resizing viewport
- ✅ No JavaScript-based responsive logic (pure CSS)
- ✅ No additional bundle size increase (Tailwind only)

**Accessibility:**
- ✅ WCAG 2.1 Level AA maintained (4.5:1 contrast ratio)
- ✅ Touch targets meet Apple Human Interface Guidelines (44x44pt)
- ✅ Touch targets meet Android Material Design (48x48dp)
- ✅ No double-tap zoom issues (touch-action: manipulation)

**Deliverables:**
- ✅ Tailwind config with xs: breakpoint
- ✅ Global mobile CSS enhancements (tap highlights, shadows)
- ✅ Updated components: Header, SummaryPanel, all forms, all modals
- ✅ Documentation: Mobile testing checklist
- ✅ Manual test results for 4 key viewports

---

## Timeline Breakdown

**Day 1-2: Phase 1 Critical Fixes**
- Create/update `tailwind.config.ts` with xs: breakpoint
- Fix header overflow (app/page.tsx:470-496)
- Fix SummaryPanel grid breakpoints (line 144, 245)
- Search codebase for all `size="sm"` buttons
- Apply h-11 sm:h-9 pattern to all buttons
- Test on 320px, 375px, 768px viewports

**Day 3: Phase 1 Completion + Phase 2 Start**
- Complete any remaining touch target fixes
- Add global mobile CSS (tap highlights, shadows)
- Begin form input consistency updates
- Update OutcomeBuilder, ReflectionInput

**Day 4-5: Phase 2 UX Improvements**
- Complete all form input updates (TextInputModal, GapDetectionModal)
- Optimize OutcomeBuilder modal for mobile
- Optimize GapDetectionModal for mobile
- Update SummaryPanel tab navigation
- Test modals on mobile viewports

**Day 6: Phase 3 Polish**
- Verify tap highlights working across all components
- Test shadow visibility in bright light (manual device test)
- Update upload zone text sizing
- Fix any edge cases discovered during testing

**Day 7: Testing & Documentation**
- Manual testing checklist: 320px, 375px, 768px, 1024px
- Test on real devices (iPhone, iPad, Android if available)
- Document changes in MOBILE_RESPONSIVENESS_REPORT.md
- Create before/after screenshots
- Final cross-browser testing (Safari, Chrome mobile)

**Day 8: Buffer & Deployment**
- Address any test failures or edge cases
- Code review and polish
- Deploy to staging environment
- Validate production build
- Ship to production

---

## Testing Strategy

**Manual Testing Checklist**

**320px (iPhone SE 1st gen):**
- [ ] No horizontal scrolling on all pages
- [ ] All buttons tappable without zoom
- [ ] Header displays correctly (stacked layout)
- [ ] Forms usable without auto-zoom
- [ ] Modals don't exceed viewport

**375px (iPhone SE 3rd gen, most common):**
- [ ] Dashboard filters don't overflow
- [ ] Upload zone fully visible
- [ ] Task cards stack properly
- [ ] Tab navigation readable
- [ ] Gap detection modal usable

**414px (iPhone 14 Pro Max):**
- [ ] Optimal spacing maintained
- [ ] No cramped elements
- [ ] Touch targets comfortable
- [ ] Forms pleasant to use

**768px (iPad Mini portrait):**
- [ ] Single-column grids (no horizontal scroll)
- [ ] No multi-column until 1024px
- [ ] Modals centered and sized appropriately
- [ ] Tab navigation uses sm: sizing

**1024px+ (Desktop):**
- [ ] Multi-column grids activate
- [ ] Button sizing returns to sm (h-9)
- [ ] Forms use desktop sizing (h-10, text-sm)
- [ ] No regressions from mobile changes

**Device Priority:**
1. **High**: iPhone SE (375x667), iPhone 14 (390x844)
2. **Medium**: iPad Mini (768x1024), Samsung Galaxy S21 (360x800)
3. **Low**: Desktop (1920x1080), iPad Pro (1024x1366)

**Browser Testing:**
- [ ] Safari iOS (primary)
- [ ] Chrome Mobile (secondary)
- [ ] Firefox Mobile (tertiary)

**Automated Testing:**
```bash
# Visual regression tests (if time permits Day 8)
npm run test:visual -- --viewport=320x568
npm run test:visual -- --viewport=375x667
npm run test:visual -- --viewport=768x1024

# No new automated tests required - responsive CSS only
```

---

## Dependencies

**Development Tools:**
- Tailwind CSS v4 (already installed)
- Chrome DevTools Device Mode (built-in)
- Safari Responsive Design Mode (built-in)

**Optional (for real device testing):**
- iOS device (iPhone) for Safari testing
- Android device for Chrome Mobile testing
- BrowserStack (if physical devices unavailable)

**Environment:**
- No new environment variables required
- No external API dependencies
- No database migrations needed

**NPM Packages:**
- No new packages required (pure CSS/Tailwind changes)

---

## Future Enhancements (Out of Scope for Phase 8)

**Phase 9 possibilities:**
- Progressive Web App (PWA) features (install prompt, offline mode)
- Mobile-specific gestures (swipe actions, pull-to-refresh)
- Haptic feedback integration
- Native mobile apps (iOS/Android)
- Landscape mode optimization
- Tablet-specific layouts
- Mobile performance optimization (lazy loading, code splitting)
- Mobile-specific analytics (touch heatmaps, session recordings)

**Phase 10 possibilities:**
- Responsive images (srcset, picture elements)
- Mobile-first redesign (component architecture)
- Touch-optimized data visualizations
- Mobile keyboard shortcuts
- Voice input for text fields

---

## Risk Assessment

**Low Risk:**
- ✅ Pure CSS changes (no logic changes)
- ✅ Progressive enhancement (desktop unaffected)
- ✅ Tailwind utilities (battle-tested)
- ✅ No breaking changes to existing features

**Medium Risk:**
- ⚠️ Potential layout shifts if breakpoint changes conflict
- ⚠️ Button sizing changes might affect muscle memory
- ⚠️ Modal height changes might clip content unexpectedly

**Mitigation:**
- Test all pages thoroughly on each viewport
- Compare before/after screenshots
- Verify no desktop regressions
- Test modals with maximum content length

---

**Last Updated:** 2025-11-07
**Status:** Ready for Review
**Appetite:** 1.5 weeks
**Dependencies:** None (pure CSS changes)
**Blocks:** Mobile user acquisition, mobile app launch
**Enables:** Confident mobile deployment, mobile user testing
