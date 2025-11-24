# Quickstart: Reflection Intelligence

**Feature Branch**: `015-reflection-intelligence`
**Estimated Total**: 15-21 hours across 8 slices

## Prerequisites

- Node.js 20+ (`nvm use`)
- pnpm installed
- Supabase CLI configured
- OpenAI API key (for GPT-4o-mini)

## Setup Steps

### 1. Create Feature Branch (if not exists)

```bash
git checkout -b 015-reflection-intelligence
```

### 2. Run Database Migration

```bash
# Apply the reflection_intents migration
supabase db push

# Or run manually:
supabase migration new 027_add_reflection_intents
# Copy contents from specs/015-reflection-intelligence/contracts/database-migration.sql
supabase db reset --local
```

### 3. Install Dependencies (if any new)

```bash
pnpm install
```

### 4. Start Development Server

```bash
pnpm dev
```

## Development Workflow

### Week 1: Cleanup (Slices 1-2)

**Slice 1: Code Consolidation**
```bash
# Run tests to establish baseline
pnpm test:run lib/services/__tests__/

# Delete deprecated service
rm lib/services/reflectionBasedRanking.ts

# Update imports in any files that referenced it
grep -r "reflectionBasedRanking" --include="*.ts" --include="*.tsx"

# Run tests again to verify nothing broke
pnpm test:run
```

**Slice 2: Fix Duplicate CTAs**
```bash
# Edit ContextCard.tsx - remove duplicate button from empty state
# Keep only the header button

# Visual test:
# 1. Open http://localhost:3000/priorities
# 2. Clear all reflections
# 3. Verify only ONE "Add Current Context" button appears
```

### Week 2: Intelligence Layer (Slices 3-4)

**Slice 3: Reflection Interpreter Service**
```bash
# Create new service
touch lib/services/reflectionInterpreter.ts

# Create schema
touch lib/schemas/reflectionIntent.ts

# Write contract test FIRST (TDD)
touch __tests__/contract/reflection-interpret.test.ts

# Run failing test
pnpm test:run __tests__/contract/reflection-interpret.test.ts

# Implement service until test passes
```

**Slice 4: Fast Adjustment Engine**
```bash
# Create adjuster service
touch lib/services/reflectionAdjuster.ts

# Write integration test FIRST
touch __tests__/integration/reflection-adjustment.test.ts

# Run failing test
pnpm test:run __tests__/integration/reflection-adjustment.test.ts

# Implement until test passes
```

### Week 3: Integration (Slices 5-6)

**Slice 5: Auto-Trigger on Add**
```bash
# Update API route
# Edit app/api/reflections/route.ts

# Write contract test
touch __tests__/contract/reflection-auto-adjust.test.ts

# Test manually:
# 1. Add reflection "Legal blocked outreach"
# 2. Verify task list updates within 3 seconds
# 3. Check browser console for timing logs
```

**Slice 6: Attribution UI**
```bash
# Update TaskRow component
# Edit app/priorities/components/TaskRow.tsx

# Add attribution badge component
touch app/priorities/components/ReflectionAttributionBadge.tsx

# Visual test:
# 1. Add reflection that affects tasks
# 2. Verify affected tasks show attribution badge
# 3. Verify badge shows source reflection
```

### Week 4: Polish (Slices 7-8)

**Slice 7: Helpful Prompts**
```bash
# Update ReflectionInput component
# Edit app/components/ReflectionInput.tsx

# Add intent preview modal
# Edit app/components/ReflectionPanel.tsx

# Visual test:
# 1. Open reflection panel
# 2. Type reflection text
# 3. Verify intent preview appears before save
```

**Slice 8: Unified Experience**
```bash
# Update Home page
# Edit app/page.tsx

# Add cross-page notification
# Test flow:
# 1. Add reflection on Home page
# 2. See "Saved! View effect in Priorities →" prompt
# 3. Click link
# 4. Verify effects already applied on Priorities page
```

## Verification Checklist

### Performance Targets

| Metric | Target | Test Command |
|--------|--------|--------------|
| Interpretation latency | <200ms | Check console logs |
| Toggle adjustment | <500ms | Browser Network tab |
| New reflection → effect | <3s | Manual timing |

### Functional Tests

```bash
# All tests should pass
pnpm test:run

# Contract tests specifically
pnpm test:run __tests__/contract/reflection-*.test.ts

# Integration tests
pnpm test:run __tests__/integration/reflection-*.test.ts
```

### Manual Verification

1. **Immediate Effect Test**
   - Add reflection "Legal blocked customer outreach"
   - Verify outreach tasks demoted within 3 seconds
   - Verify attribution badge appears

2. **Fast Toggle Test**
   - Toggle existing reflection off
   - Verify tasks restore within 500ms
   - Toggle back on
   - Verify effects re-apply within 500ms

3. **Attribution Test**
   - View task affected by reflection
   - Verify "Blocked: Legal hold" or similar badge
   - Verify clicking badge shows source reflection

4. **Single CTA Test**
   - Navigate to Priorities page
   - Clear all reflections
   - Verify only ONE "Add Context" button visible

5. **Code Cleanup Test**
   - Run: `grep -r "reflectionBasedRanking" .`
   - Should return no matches
   - Run: `grep -r "calculateFallbackWeight" app/priorities/page.tsx`
   - Should return no matches

## Troubleshooting

### LLM Interpretation Fails

If GPT-4o-mini times out or errors:
1. Check `OPENAI_API_KEY` is set
2. Verify network connectivity
3. Fallback behavior: Should default to "information/context-only" type
4. Check console for specific error message

### Toggle Not Fast Enough

If toggles take >500ms:
1. Check if intent is cached in `reflection_intents` table
2. Verify no LLM call on toggle path
3. Check database query performance
4. Look for N+1 queries in task effect application

### Tests Failing

```bash
# Run specific test in watch mode for debugging
pnpm test:run --reporter=verbose <test-file>

# Check for missing migrations
supabase db diff

# Reset local database if needed
supabase db reset --local
```

## Success Criteria

Feature is complete when:

- [ ] User adds "Legal blocked outreach" → outreach tasks drop immediately (<3s)
- [ ] User toggles reflection → tasks adjust within 500ms
- [ ] Every moved task shows which reflection caused the change
- [ ] Single "Add Context" button on Priorities page
- [ ] Zero duplicate utility code
- [ ] `reflectionBasedRanking.ts` deleted
- [ ] All tests pass
- [ ] Performance targets met
