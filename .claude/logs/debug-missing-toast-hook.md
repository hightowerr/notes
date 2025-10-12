# Debug Report: Missing Toast Hook Module

## Error Summary
**Component**: `OutcomeBuilder.tsx:33`
**Error**: `Module not found: Can't resolve '@/hooks/use-toast'`
**Impact**: Next.js dev server compilation failure - application cannot start

---

## Hypothesis Analysis

### Initial Hypotheses
1. **Missing shadcn/ui toast component installation**: `use-toast` hook not installed via shadcn CLI → CONFIRMED
2. **Wrong import path**: Hook exists but imported from incorrect location → REJECTED (no hook exists anywhere)
3. **Missing hooks directory**: Directory structure doesn't exist → CONFIRMED (no `/hooks` directory)

### Top Candidates
1. **Most likely**: Toast component never installed via shadcn CLI (missing installation step)
2. **Second likely**: Project uses alternative toast library (sonner) instead of shadcn toast

---

## Validation

**Directory Check**:
```bash
ls -la /home/yunix/learning-agentic/ideas/Note-synth/notes/hooks/
# Result: ls: cannot access '/home/yunix/learning-agentic/ideas/Note-synth/notes/hooks/': No such file or directory
```

**File Search Results**:
```bash
# Search for use-toast.ts or use-toast.tsx
Glob pattern: **/use-toast.ts
Result: No files found

Glob pattern: **/use-toast.tsx
Result: No files found
```

**Existing Toast Implementation**:
```typescript
// app/page.tsx:12
import { toast, Toaster } from 'sonner';

// app/dashboard/page.tsx:21
import { toast } from 'sonner';

// app/components/SummaryPanel.tsx:13
import { toast } from 'sonner';
```

**Package.json Dependencies**:
```json
{
  "dependencies": {
    "sonner": "^1.7.3"  // ✅ Sonner installed
    // ❌ No @radix-ui/react-toast (shadcn toast dependency)
  }
}
```

**Observed Behavior**:
- Project consistently uses `sonner` library for toast notifications across all existing components
- No `hooks/` directory exists in project structure
- No `use-toast.ts` file exists anywhere in codebase
- shadcn toast component was never installed

---

## Root Cause

**Confirmed**: Missing shadcn/ui toast component installation

**Evidence**:
- No `/hooks/use-toast.ts` file exists in codebase
- No `/hooks` directory exists at project root
- Package.json does not include `@radix-ui/react-toast` (required dependency for shadcn toast)
- `OutcomeBuilder.tsx` imports `useToast` from non-existent path

**Location**: `/home/yunix/learning-agentic/ideas/Note-synth/notes/app/components/OutcomeBuilder.tsx:33`

**Why This Breaks**:
- Next.js bundler cannot resolve `@/hooks/use-toast` import path
- Module resolution fails during compilation phase
- Dev server cannot start until import is resolved

**User Impact**:
- What user action fails: Cannot start development server (`npm run dev`)
- What user sees: Next.js compilation error in terminal
- User journey blocked: All development work blocked until resolved

---

## Corrective Plan

### Architectural Decision Required

**Two valid approaches:**

#### Option A: Use Existing Sonner Library (RECOMMENDED)

**Rationale**:
- Project already uses `sonner` library consistently (app/page.tsx, app/dashboard/page.tsx, app/components/SummaryPanel.tsx)
- `sonner` is already installed and configured
- Maintains consistency with existing codebase
- Zero additional dependencies needed
- Simpler implementation

**Step 1**: Replace shadcn toast import with sonner
- **File**: `/home/yunix/learning-agentic/ideas/Note-synth/notes/app/components/OutcomeBuilder.tsx`
- **Line**: 33
- **Current**: `import { useToast } from '@/hooks/use-toast';`
- **Change To**: `import { toast } from 'sonner';`
- **Reason**: Use existing toast library instead of shadcn toast

**Step 2**: Update toast usage pattern
- **File**: `/home/yunix/learning-agentic/ideas/Note-synth/notes/app/components/OutcomeBuilder.tsx`
- **Line**: 57, 123-127, 147-152
- **Current**:
```typescript
const { toast } = useToast();

// Usage:
toast({
  title: '✅ Outcome saved',
  description: result.message || 'Your outcome has been set successfully.',
  duration: 5000
});
```
- **Change To**:
```typescript
// Remove: const { toast } = useToast();

// Usage:
toast.success(result.message || '✅ Outcome saved successfully', {
  description: 'Your outcome has been set.',
  duration: 5000
});

// For errors:
toast.error('❌ Failed to save outcome', {
  description: error instanceof Error ? error.message : 'An unexpected error occurred',
  duration: 5000
});
```
- **Reason**: Match sonner API pattern used in app/page.tsx and app/dashboard/page.tsx

#### Option B: Install shadcn Toast Component (NOT RECOMMENDED)

**Why not recommended**:
- Introduces inconsistency (two toast libraries in same project)
- Adds unnecessary dependencies (@radix-ui/react-toast, hooks directory)
- Requires additional setup (Toaster component in layout, CSS variables)
- Violates project pattern of using sonner

**Only use if**:
- User specifically requests shadcn toast for UX reasons
- User wants to migrate entire project from sonner to shadcn toast

**If chosen, requires**:
1. Install shadcn toast: `pnpm dlx shadcn@latest add toast`
2. Add `<Toaster />` to root layout
3. Configure theme CSS variables for toast
4. Consider migrating other components to shadcn toast for consistency

---

## Side Effects

**Potential Issues**:
- None if using Option A (sonner already used everywhere)
- If using Option B (shadcn toast):
  - Two different toast libraries in same project
  - Inconsistent UX (sonner vs shadcn styling)
  - Users may see different toast styles on different pages

**Related Code**:
- `/home/yunix/learning-agentic/ideas/Note-synth/notes/app/page.tsx` - Uses sonner toast
- `/home/yunix/learning-agentic/ideas/Note-synth/notes/app/dashboard/page.tsx` - Uses sonner toast
- `/home/yunix/learning-agentic/ideas/Note-synth/notes/app/components/SummaryPanel.tsx` - Uses sonner toast
- All should continue using sonner for consistency

---

## Prevention

**How to avoid this**:
- Always check existing project dependencies before importing new libraries
- Use `Grep` to search for existing toast implementations before choosing library
- Reference `.claude/standards.md` section on "Error Handling Standards" (line 541) which mentions toast notifications but doesn't specify library
- Update standards.md to document that project uses `sonner` for toast notifications

**Pattern to follow**:
1. Search codebase for existing implementations: `import.*toast`
2. Check package.json for installed libraries
3. Use existing patterns unless explicitly asked to change
4. Document library choices in standards.md for future reference

**Validation to include**:
- Before importing UI libraries, check if component already installed
- Before using shadcn components, verify they exist via `ls components/ui/`
- Cross-reference with existing components using similar functionality

---

## Next Steps

1. **Immediate fix**: Apply Option A (use sonner) - maintains project consistency
2. **Verify compilation**: Run `npm run dev` to confirm dev server starts
3. **Test toast functionality**: Trigger success/error cases in OutcomeBuilder form
4. **Update standards.md**: Document that project uses `sonner` for toast notifications
5. **Code review**: Verify toast usage matches existing patterns in app/page.tsx

**Recommended approach**: Option A (sonner)
**Estimated fix time**: 5 minutes
**Risk level**: Low (simple import change, existing library)
