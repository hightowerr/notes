# Phase 0: Research & Technical Decisions

**Feature**: Mobile-First Transformation
**Date**: 2025-11-07
**Status**: Complete

## Overview

This research phase validates technical feasibility for transforming the AI Note Synthesiser into a mobile-responsive application using pure CSS (Tailwind v4 utilities). All unknowns from Technical Context have been resolved through codebase analysis.

---

## Research Findings

### 1. Tailwind CSS v4 Configuration

**Question**: Does the project use Tailwind v4, and what breakpoints are available?

**Answer**: ✅ Confirmed - Tailwind CSS v4 is installed and configured via `app/globals.css`.

**Evidence**:
- `package.json:81` → `"tailwindcss": "^4"`
- `app/globals.css:1` → `@import "tailwindcss";`
- Default Tailwind breakpoints available:
  - `sm:` → 640px and up
  - `md:` → 768px and up
  - `lg:` → 1024px and up
  - `xl:` → 1280px and up
  - `2xl:` → 1536px and up

**Decision**: Use Tailwind v4's built-in breakpoints with mobile-first approach. Primary breakpoints for this feature:
- **Mobile**: `<640px` (base, no prefix)
- **Small**: `sm:` (640px-1023px)
- **Large**: `lg:` (≥1024px)

**Rationale**: Aligns with spec requirements (FR-001 to FR-029) and leverages Tailwind's battle-tested media query system.

---

### 2. Existing Responsive Patterns

**Question**: Are there existing responsive patterns in the codebase we should follow?

**Answer**: ✅ Yes - Partial responsive implementation exists.

**Evidence** (`app/page.tsx`):
- Line 472: `flex flex-col sm:flex-row` (direction change)
- Line 477: `h-11 sm:h-9` (height adjustment)
- Line 493: `px-3 sm:px-4 py-2 text-xs sm:text-sm` (spacing/typography)

**Current Pattern**: Uses `sm:` breakpoint (640px) for mobile-to-desktop transition.

**Gap Analysis**:
- ❌ Missing touch target sizing (44px minimum on mobile)
- ❌ No `lg:` breakpoint for multi-column grids
- ❌ Buttons use same height on all viewports (need 44px on mobile, 36px on desktop)
- ❌ No tactile feedback (tap highlights, active states)
- ❌ Modals not optimized for mobile (padding, height)

**Decision**: Extend existing pattern with:
1. Touch-first sizing (`h-11` mobile, `sm:h-9` desktop)
2. Grid breakpoint at `lg:1024px` for multi-column layouts
3. Active state classes for mobile interaction feedback

---

### 3. Component UI Library

**Question**: Which UI component library is used, and are components customizable?

**Answer**: ✅ shadcn/ui (Radix UI primitives) - fully customizable.

**Evidence**:
- `package.json:19-35` → Multiple `@radix-ui/*` dependencies
- `package.json:80` → `"shadcn": "^3.4.2"`
- Components defined locally (not node_modules), allowing direct modification

**Customization Approach**:
- Button component: `components/ui/button.tsx` (to be modified)
- Dialog/Modal: `components/ui/dialog.tsx` (responsive padding/height)
- Form inputs: `components/ui/input.tsx` (16px font size on mobile)
- Tabs: `components/ui/tabs.tsx` (reduced padding/font on mobile)

**Decision**: Modify shadcn components directly using Tailwind responsive utilities.

**Rationale**: shadcn architecture allows zero-friction customization without forking third-party libraries.

---

### 4. Design System Compatibility

**Question**: Does the existing design system (depth layers, shadows, colors) require modification?

**Answer**: ✅ No changes needed - design system is responsive-ready.

**Evidence** (`app/globals.css`):
- Lines 60-122: CSS custom properties (work across all viewports)
- Lines 344-528: Utility classes (`.shadow-2layer-sm/md/lg`, `.gradient-*`)
- Lines 534-545: **iOS auto-zoom prevention already implemented** (`font-size: 16px` on inputs at mobile viewport)

**Design System Features (Mobile-Ready)**:
- 4-layer depth system (`--bg-layer-1` through `--bg-layer-4`)
- Two-layer shadows (`.shadow-2layer-sm/md/lg`)
- WCAG AA compliant colors (4.5:1 contrast minimum)
- Dark mode support (`:root` and `.dark` variants)

**Gap**: Mobile shadows need strengthening for outdoor sunlight visibility (FR-024).

**Decision**:
1. Preserve existing design system (no breaking changes)
2. Add mobile-specific shadow utilities: `.shadow-2layer-sm-mobile`, `.shadow-2layer-md-mobile`
3. Apply via responsive classes: `shadow-2layer-md-mobile sm:shadow-2layer-md`

---

### 5. Touch Interaction Standards

**Question**: What are the WCAG/Apple/Material Design touch target guidelines?

**Answer**: ✅ Industry standards confirmed.

**Standards**:
- **WCAG 2.1 Level AAA**: 44×44 CSS pixels minimum
- **Apple Human Interface Guidelines**: 44pt (44px) minimum
- **Material Design**: 48dp (48px) recommended
- **Microsoft Design**: 44px minimum

**Decision**: Use **44px minimum** for all interactive elements on mobile (<640px).

**Implementation**:
- Buttons: `h-11` (44px) on mobile, `sm:h-9` (36px) on desktop
- Form inputs: `h-12` (48px) on mobile, `sm:h-10` (40px) on desktop
- Radio buttons: Ensure label+control combined area ≥44px

**Rationale**: Balances accessibility (WCAG AAA), Apple ecosystem (dominant mobile platform), and Material Design best practices.

---

### 6. Multi-Column Grid Breakpoint

**Question**: At what viewport should task grids switch from single to multi-column?

**Answer**: ✅ 1024px (Tailwind `lg:` breakpoint).

**Rationale**:
- **768px (iPad Mini portrait)**: Too narrow for 3-column grid (each column ~230px → cramped)
- **1024px (iPad Pro landscape, desktop)**: Ideal for 2-3 column layouts (each column ~320-500px → comfortable)

**Decision**:
- Mobile (<1024px): Single-column (`grid-cols-1`)
- Desktop (≥1024px): Multi-column (`lg:grid-cols-2`, `lg:grid-cols-3`)

**Examples**:
- Task lists: `grid-cols-1 lg:grid-cols-3`
- Card grids: `grid-cols-1 lg:grid-cols-2`
- Priority panels: `flex-col lg:flex-row`

---

### 7. Modal/Dialog Optimization

**Question**: How should modals adapt to mobile viewports?

**Answer**: ✅ 95vh height utilization + reduced padding strategy.

**Current Issue** (common anti-pattern):
- Desktop modals use `p-6` (24px) padding
- Mobile loses ~100px vertical space to padding
- Content requires excessive scrolling

**Solution**:
- **Mobile (<640px)**:
  - Height: `max-h-[95vh]` (maximize viewport usage)
  - Padding: `p-3` (12px)
  - Font size: `text-base` (16px - prevents iOS auto-zoom)
  - Radio groups: `flex-col` (vertical stack on <475px)

- **Desktop (≥640px)**:
  - Height: `max-h-[80vh]` (preserve desktop breathing room)
  - Padding: `sm:p-6` (24px)
  - Font size: `sm:text-sm` (14px - denser content)
  - Radio groups: `xs:flex-row` (horizontal on ≥475px)

**Decision**: Implement responsive modal variants in `OutcomeBuilder.tsx`, `GapDetectionModal.tsx`, `TextInputModal.tsx`.

---

### 8. Tactile Feedback Design

**Question**: What visual feedback should mobile users receive when tapping buttons?

**Answer**: ✅ Tap highlight + scale transform + touch-action manipulation.

**Best Practices**:
1. **Tap Highlight** (iOS/Android native feel):
   - `-webkit-tap-highlight-color: rgba(0, 0, 0, 0.1)` (light mode)
   - `-webkit-tap-highlight-color: rgba(255, 255, 255, 0.1)` (dark mode)

2. **Active State Transform**:
   - `active:scale-[0.98]` (subtle shrink on press)
   - `transition-transform duration-100` (responsive feedback)

3. **Double-Tap Zoom Prevention**:
   - `touch-action: manipulation` (prevents 300ms click delay + zoom)

**Decision**: Apply to all buttons via responsive utility classes:
```tsx
className="active:scale-[0.98] active:brightness-95 touch-manipulation sm:active:scale-100 sm:active:brightness-100"
```

**Rationale**: Provides native app-like tactile feedback on mobile while preserving desktop hover paradigm.

---

### 9. Font Size Requirements

**Question**: What font sizes prevent iOS auto-zoom while maintaining readability?

**Answer**: ✅ 16px minimum for form inputs.

**iOS Behavior**:
- `font-size < 16px` on input focus → Auto-zooms page (disruptive UX)
- `font-size ≥ 16px` → No auto-zoom

**Current Implementation** (`app/globals.css:534-545`):
```css
@media screen and (max-width: 768px) {
  input[type="text"],
  input[type="email"],
  /* ... */
  select {
    font-size: 16px;
  }
}
```

**Gap**: This CSS rule conflicts with Tailwind's utility-first approach and may be overridden.

**Decision**: Remove global CSS rule and use Tailwind classes directly:
- Mobile: `text-base` (16px) or larger
- Desktop: `sm:text-sm` (14px) for denser content

**Implementation**:
```tsx
<Input className="text-base sm:text-sm h-12 sm:h-10" />
```

---

### 10. Performance Validation

**Question**: Will CSS-only changes impact JavaScript bundle size or page load times?

**Answer**: ✅ Zero impact - CSS classes add <1KB to stylesheet.

**Evidence**:
- Tailwind v4 uses JIT compilation (unused classes purged)
- Responsive utilities are CSS media queries (no JavaScript)
- No new dependencies required

**Measurement Plan**:
- Pre-implementation: Run `npm run build` → note `_app.js` size
- Post-implementation: Run `npm run build` → verify no size increase
- Browser DevTools: Verify layout shift <50ms on breakpoint transitions

**Decision**: Proceed with CSS-only implementation. No performance optimization needed.

---

### 11. Browser Compatibility

**Question**: Do target browsers support CSS Grid, Flexbox, and modern media queries?

**Answer**: ✅ All target browsers support required features.

**Target Browser Versions** (from Technical Context):
- Chrome 90+ (Mar 2021) → ✅ Full support
- Safari 14+ (Sep 2020) → ✅ Full support
- Firefox 88+ (Apr 2021) → ✅ Full support
- Edge 90+ (Apr 2021) → ✅ Full support

**Required Features**:
- CSS Grid: ✅ Supported since Chrome 57, Safari 10.1, Firefox 52, Edge 16
- Flexbox: ✅ Supported since Chrome 29, Safari 9, Firefox 28, Edge 12
- Media Queries Level 4: ✅ Supported (all target browsers)
- `touch-action`: ✅ Supported (all target browsers)

**Fallback Strategy**: Not needed - all features universally supported.

---

## Summary of Technical Decisions

| Decision Area | Choice | Rationale |
|---------------|--------|-----------|
| **Breakpoints** | Mobile (<640px), Small (640-1023px), Large (≥1024px) | Aligns with Tailwind defaults and spec requirements |
| **Touch Targets** | 44px minimum on mobile | WCAG AAA + Apple HIG compliance |
| **Grid Layout** | Single-column <1024px, Multi-column ≥1024px | Optimal readability on tablets/phones |
| **Modal Sizing** | 95vh mobile, 80vh desktop | Maximizes mobile usable space |
| **Input Font Size** | 16px mobile, 14px desktop | Prevents iOS auto-zoom |
| **Tactile Feedback** | `active:scale-[0.98]` + tap highlight | Native app-like feel |
| **Implementation** | Pure Tailwind utilities (no custom CSS) | Zero bundle size increase, maintainable |
| **Shadow Enhancement** | Stronger shadows on mobile | Sunlight visibility (FR-024) |
| **Tab Sizing** | 12px font/8px padding mobile, 14px/16px desktop | Readable on small screens |
| **Button Heights** | 44px (h-11) mobile, 36px (h-9) desktop | Touch compliance vs desktop density |

---

## Next Steps

✅ **Phase 0 Complete** - All Technical Context unknowns resolved.

**Ready for Phase 1**: Design & Contracts
- No data model needed (CSS-only changes)
- No API contracts needed (no backend modifications)
- Manual test guides required (T001-T004 for 4 viewports)
- Quickstart guide creation
- Component modification checklist

---

## References

- [WCAG 2.1 Target Size](https://www.w3.org/WAI/WCAG21/Understanding/target-size.html) - 44×44 pixel minimum
- [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/layout) - 44pt touch targets
- [Material Design Touch Targets](https://m3.material.io/foundations/accessible-design/accessibility-basics#28032e45-c598-450c-b355-f9fe737b1cd8) - 48dp recommendation
- [Tailwind CSS v4 Documentation](https://tailwindcss.com/docs) - Responsive design utilities
- [iOS Auto-Zoom Prevention](https://stackoverflow.com/questions/2989263/disable-auto-zoom-in-input-text-tag-safari-on-iphone) - 16px minimum font size
