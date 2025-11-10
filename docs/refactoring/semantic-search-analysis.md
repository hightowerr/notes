# Semantic Search Tool - Refactoring Analysis

**Date:** 2025-11-10
**File:** `lib/mastra/tools/semanticSearch.ts`
**Status:** Analysis Complete - Ready for Refactoring

---

## Executive Summary

The semantic search tool has **over-engineered input handling** that duplicates Zod's built-in functionality. While the core logic (embedding generation, similarity search, dynamic threshold fallback) is excellent, the input normalization adds ~80 lines of unnecessary complexity and introduces type safety issues.

**Recommendation:** Simplify by trusting Zod for all input validation and removing manual normalization layers.

---

## Critical Issues

### 1. Type Safety Bug - Ghost "context" Property

**Location:** Lines 67-83

```typescript
const raw = input ?? {};
const context = extractProperty(raw, 'context');  // ⚠️ NOT in schema!

const normalized = {
  query: normalizeQuery(
    extractProperty(raw, 'query') ?? extractProperty(context, 'query')  // ❌ Bug
  ),
  // ...
};
```

**Problem:**
- Schema has NO `context` field defined
- Code attempts to extract from non-existent property
- Creates type confusion and maintenance burden

**Impact:** Medium - Code works but is confusing and error-prone

---

### 2. Redundant Normalization Functions

**Location:** Lines 201-233

The following functions duplicate Zod's `.coerce` functionality:

#### `normalizeQuery()` (Lines 201-220)
```typescript
function normalizeQuery(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return String(value.find(item => typeof item === 'string') ?? '');
  return String(value);
}
```
**Unnecessary because:** Zod's `.string().transform(v => v.trim())` already handles this

#### `normalizeNumber()` (Lines 222-233)
```typescript
function normalizeNumber(value: unknown): unknown {
  if (typeof value === 'number' || typeof value === 'bigint') return Number(value);
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return value;
}
```
**Unnecessary because:** Zod's `.coerce.number()` already does this conversion

---

### 3. Over-Engineered Property Extraction

**Location:** Lines 235-277

```typescript
function extractProperty(source: unknown, key: string): unknown {
  if (!source) return undefined;

  if (typeof source === 'object') {
    // Standard property access
    if (key in (source as Record<string, unknown>)) { ... }

    // Map support
    if (source instanceof Map) { return source.get(key); }

    // Custom .get() method support
    const getter = candidate.get;
    if (typeof getter === 'function') { ... }

    // Iterator support
    const entries = candidate.entries;
    if (typeof entries === 'function') { ... }
  }

  return undefined;
}
```

**Problem:**
- 40+ lines handling Map, Iterator, custom `.get()` methods
- Type-unsafe (returns `unknown`)
- All for inputs that **should already match your Zod schema**

**Impact:** High - Adds complexity without clear benefit

---

### 4. Double Validation - Manual Range Checks After Zod

**Location:** Lines 108-122

```typescript
// After Zod already validated, you're checking again manually
if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
  throw new SemanticSearchToolError('INVALID_THRESHOLD', ...);
}

if (!Number.isFinite(limit) || !Number.isInteger(limit) || limit < 1 || limit > 100) {
  throw new SemanticSearchToolError('INVALID_LIMIT', ...);
}
```

**Problem:**
- These validations should be in the Zod schema
- Current schema (lines 25-33) only has `.coerce.number().default(...)` with NO constraints

**Impact:** Medium - Works but violates DRY principle

---

## What's Working Well ✅

### 1. Error Handling (Lines 175-198)
```typescript
if (error instanceof EmbeddingError) {
  const retryable = isRetryableEmbeddingError(error);
  throw new SemanticSearchToolError(
    retryable ? 'EMBEDDING_SERVICE_UNAVAILABLE' : 'EMBEDDING_GENERATION_FAILED',
    error.message,
    retryable
  );
}
```
**Excellent:** Properly classifies retryable vs. non-retryable errors

### 2. Dynamic Threshold Fallback (Lines 127-168)
```typescript
const MIN_DYNAMIC_THRESHOLD = 0.4;
const FALLBACK_STEP = 0.2;
const MAX_FALLBACK_ATTEMPTS = 2;

while (attempts <= MAX_FALLBACK_ATTEMPTS) {
  const results = await searchSimilarTasks(embedding, currentThreshold, limit);
  filtered = results.filter(...).sort(...).slice(0, limit);

  if (filtered.length > 0 || currentThreshold <= MIN_DYNAMIC_THRESHOLD) break;

  currentThreshold = Math.max(MIN_DYNAMIC_THRESHOLD, currentThreshold - FALLBACK_STEP);
  attempts += 1;
}
```
**Brilliant:** Progressively relaxes threshold (0.7 → 0.5 → 0.4) for better UX

### 3. Logging (Throughout)
```typescript
console.log('[SemanticSearch] Raw input:', input);
console.log('[SemanticSearch] Normalized input:', normalized);
console.log('[SemanticSearch] Parsed values:', { query, limit, threshold });
```
**Helpful:** Comprehensive debug information at each step

---

## Refactoring Plan

### Phase 1: Enhance Zod Schema (Low Risk)

**Current Schema:**
```typescript
const inputSchema = z.object({
  query: z
    .string()
    .min(1, 'Query must contain text')
    .max(500, 'Query cannot exceed 500 characters')
    .transform(value => value.trim()),
  limit: z.coerce.number().default(20),
  threshold: z.coerce.number().default(0.7),
});
```

**Proposed Schema:**
```typescript
const inputSchema = z.object({
  query: z
    .string()
    .min(1, 'Query must contain text')
    .max(500, 'Query cannot exceed 500 characters')
    .transform(value => value.trim()),
  limit: z.coerce
    .number()
    .int('Limit must be an integer')
    .min(1, 'Limit must be at least 1')
    .max(100, 'Limit cannot exceed 100')
    .default(20),
  threshold: z.coerce
    .number()
    .min(0, 'Threshold must be between 0 and 1')
    .max(1, 'Threshold must be between 0 and 1')
    .default(0.7),
});
```

**Benefits:**
- ✅ Self-documenting validation rules
- ✅ Better error messages
- ✅ No need for manual validation (lines 108-122)

---

### Phase 2: Simplify Input Handling (Medium Risk)

**Current Code (Lines 66-106):**
```typescript
const raw = input ?? {};
const context = extractProperty(raw, 'context');

const normalized = {
  query: normalizeQuery(
    extractProperty(raw, 'query') ?? extractProperty(context, 'query')
  ),
  limit: normalizeNumber(
    extractProperty(raw, 'limit') ?? extractProperty(context, 'limit')
  ),
  threshold: normalizeNumber(
    extractProperty(raw, 'threshold') ?? extractProperty(context, 'threshold')
  ),
};

console.log('[SemanticSearch] Raw input:', input);
console.log('[SemanticSearch] Normalized input:', normalized);
console.log('[SemanticSearch] input.context:', context);

let query: string;
let limit: number;
let threshold: number;

try {
  ({ query, limit, threshold } = inputSchema.parse(normalized));
  console.log('[SemanticSearch] Parsed values:', { query, limit, threshold });
} catch (err) {
  console.error('[SemanticSearch] Zod parse failed:', normalized, 'Error:', err);
  throw err;
}

if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
  throw new SemanticSearchToolError('INVALID_THRESHOLD', ...);
}

if (!Number.isFinite(limit) || !Number.isInteger(limit) || limit < 1 || limit > 100) {
  throw new SemanticSearchToolError('INVALID_LIMIT', ...);
}
```

**Proposed Code:**
```typescript
console.log('[SemanticSearch] Input:', input);

let query: string;
let limit: number;
let threshold: number;

try {
  ({ query, limit, threshold } = inputSchema.parse(input));
  console.log('[SemanticSearch] Parsed:', { query, limit, threshold });
} catch (err) {
  console.error('[SemanticSearch] Validation failed:', err);
  throw err;
}
```

**Changes:**
- ❌ Remove `extractProperty()` calls
- ❌ Remove `normalizeQuery()` calls
- ❌ Remove `normalizeNumber()` calls
- ❌ Remove "context" extraction
- ❌ Remove manual validation (lines 108-122)
- ✅ Keep logging
- ✅ Let Zod handle everything

**Lines Removed:** ~40 lines
**Risk:** Low (Zod handles all cases the manual code did)

---

### Phase 3: Delete Helper Functions (Low Risk)

**Functions to Delete:**
1. `extractProperty()` (lines 235-277) - 42 lines
2. `normalizeQuery()` (lines 201-220) - 19 lines
3. `normalizeNumber()` (lines 222-233) - 11 lines

**Total Lines Removed:** ~72 lines

**Risk:** None (no longer called after Phase 2)

---

## Testing Strategy

### Existing Tests (All Should Pass)

From `lib/mastra/tools/__tests__/semanticSearch.test.ts`:

1. ✅ **Returns filtered results** - Tests basic functionality
2. ✅ **Retries with lower threshold** - Tests fallback logic
3. ✅ **Throws on invalid threshold** - Tests validation
4. ✅ **Maps embedding errors** - Tests error handling

### Additional Tests to Add

1. **Schema Validation**
   ```typescript
   it('validates limit is between 1 and 100', async () => {
     await expect(
       semanticSearchTool.execute({ query: 'test', limit: 101 })
     ).rejects.toThrow('Limit cannot exceed 100');
   });
   ```

2. **Coercion Tests**
   ```typescript
   it('coerces string numbers to numbers', async () => {
     const result = await semanticSearchTool.execute({
       query: 'test',
       limit: '5',      // String should be coerced to number
       threshold: '0.8' // String should be coerced to number
     });
     // Should not throw
   });
   ```

---

## Simplified Final Code (Preview)

```typescript
async function executeSemanticSearch(
  input: z.input<typeof inputSchema>
): Promise<{
  tasks: SimilaritySearchResult[];
  count: number;
  query: string;
}> {
  console.log('[SemanticSearch] Input:', input);

  // Zod handles all validation and coercion
  const { query, limit, threshold } = inputSchema.parse(input);
  console.log('[SemanticSearch] Parsed:', { query, limit, threshold });

  try {
    const embedding = await generateEmbedding(query);

    const MIN_DYNAMIC_THRESHOLD = 0.4;
    const FALLBACK_STEP = 0.2;
    const MAX_FALLBACK_ATTEMPTS = 2;

    let attempts = 0;
    let currentThreshold = threshold;
    let filtered: SimilaritySearchResult[] = [];

    while (attempts <= MAX_FALLBACK_ATTEMPTS) {
      const results = await searchSimilarTasks(embedding, currentThreshold, limit);

      filtered = results
        .filter(
          (task) =>
            typeof task.similarity === 'number' &&
            task.similarity >= currentThreshold &&
            Number.isFinite(task.similarity)
        )
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);

      if (filtered.length > 0 || currentThreshold <= MIN_DYNAMIC_THRESHOLD) {
        break;
      }

      const nextThreshold = Math.max(
        MIN_DYNAMIC_THRESHOLD,
        Number((currentThreshold - FALLBACK_STEP).toFixed(2))
      );

      if (nextThreshold === currentThreshold) {
        break;
      }

      console.log('[SemanticSearch] No matches; retrying with fallback threshold', {
        previousThreshold: currentThreshold,
        nextThreshold,
      });

      currentThreshold = nextThreshold;
      attempts += 1;
    }

    return {
      tasks: filtered,
      count: filtered.length,
      query,
    };
  } catch (error) {
    // Keep excellent error handling
    if (error instanceof SemanticSearchToolError) {
      throw error;
    }

    if (error instanceof EmbeddingError) {
      const retryable = isRetryableEmbeddingError(error);
      throw new SemanticSearchToolError(
        retryable ? 'EMBEDDING_SERVICE_UNAVAILABLE' : 'EMBEDDING_GENERATION_FAILED',
        error.message,
        retryable
      );
    }

    if (error instanceof StorageError) {
      throw new SemanticSearchToolError('DATABASE_ERROR', error.message, true);
    }

    throw new SemanticSearchToolError(
      'DATABASE_ERROR',
      error instanceof Error ? error.message : 'Unknown database error',
      true
    );
  }
}
```

---

## Impact Summary

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| **Lines of Code** | 288 | ~208 | -80 (-28%) |
| **Helper Functions** | 6 | 3 | -3 |
| **Type Safety Issues** | 3 | 0 | ✅ Fixed |
| **Validation Layers** | 3 | 1 | Simplified |
| **Test Coverage** | 4 tests | 6 tests | +2 |

---

## Migration Checklist

- [ ] **Phase 1:** Update Zod schema with constraints
- [ ] **Phase 2:** Simplify `executeSemanticSearch()` input handling
- [ ] **Phase 3:** Delete unused helper functions
- [ ] **Testing:** Run existing tests
- [ ] **Testing:** Add new validation tests
- [ ] **Integration:** Test with agent in `/priorities` page
- [ ] **Monitoring:** Watch logs for any Zod validation errors

---

## Why This Matters

### Current State Problems
1. **Maintenance burden:** 3 helper functions to maintain
2. **Type confusion:** `unknown` types throughout input handling
3. **Hidden bugs:** "context" extraction that doesn't match schema
4. **Duplicated logic:** Validation in 3 places (schema, manual checks, helper functions)

### After Refactoring Benefits
1. **Single source of truth:** Zod schema defines all validation
2. **Type safety:** TypeScript knows exact types after `.parse()`
3. **Clearer code:** What you see is what you get
4. **Faster execution:** Fewer function calls
5. **Better errors:** Zod provides detailed validation error messages

---

## Questions & Concerns

### Q: Why was the complex input handling added?
**A:** Likely defensive programming for Mastra's flexible input format. However, Mastra's `createTool()` should already ensure inputs match your schema before calling `execute()`.

### Q: Will this break existing agent calls?
**A:** No. The external API remains identical - only internal implementation changes.

### Q: What if Mastra passes weird input formats?
**A:** Zod's `.coerce` handles most cases (strings, numbers, etc.). If truly exotic inputs appear, we can add a preprocessing step with proper types rather than using `unknown` everywhere.

---

## References

- **Zod Documentation:** https://zod.dev/
- **Zod Coercion:** https://zod.dev/?id=coercion-for-primitives
- **Mastra Tool API:** https://mastra.ai/docs/tools/creating-tools

---

**Next Steps:** Review this analysis, then proceed with Phase 1 (schema enhancement) as a low-risk first step.
