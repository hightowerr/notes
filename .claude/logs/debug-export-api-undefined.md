# Debug Report: Export API Undefined Error

## Error Summary
**Test**: N/A (Production endpoint error)
**File**: app/api/export/[fileId]/route.ts:179
**Error**: `TypeError: Cannot read properties of undefined (reading 'structured_output')`

---

## Hypothesis Analysis

### Initial Hypotheses
1. **Database query returns null for processed_documents**: Possible if no related record exists, but check on line 165 should catch this
2. **Supabase relationship returns object instead of array**: LIKELY - `.single()` on parent query may affect nested relationship structure
3. **Database relationship misconfigured**: Unlikely - `/api/documents` endpoint works correctly with same schema

### Top Candidates
1. **Supabase `.single()` returns nested relationships differently**: When using `.single()` on the parent query, Supabase may return the nested `processed_documents` relationship as an object or single-item array, not always as an array
2. **Array check passes but array is empty or malformed**: The check on line 165 validates `.length`, but if Supabase returns an object instead of array, this could pass incorrectly

---

## Validation

**Logs Added**:
```typescript
// Location: app/api/export/[fileId]/route.ts:164-166
console.log('[DEBUG] fileData structure:', JSON.stringify(fileData, null, 2));
console.log('[DEBUG] processed_documents:', fileData.processed_documents);
console.log('[DEBUG] is array?', Array.isArray(fileData.processed_documents));
```

**Observed Behavior**:
Compared with working `/api/documents` endpoint (line 116-118), which handles this case:
```typescript
const processedDoc = Array.isArray(file.processed_documents)
  ? file.processed_documents[0]
  : file.processed_documents;
```

**Test Output**:
Working endpoint at `/api/documents` returns data successfully for the same fileId (81f6eff2-d163-4f0c-bc6e-7857d692b407), confirming:
- Database relationship is correctly configured
- Data exists in processed_documents table
- The issue is query structure handling, not data availability

---

## Root Cause

**Confirmed**: Supabase query with `.single()` on parent table returns nested relationships inconsistently

**Evidence**:
1. Database schema (migration 002) shows correct one-to-one relationship: `UNIQUE(file_id)` constraint on `processed_documents.file_id`
2. `/api/documents` endpoint handles both array and object cases (line 116-118)
3. `/api/export/[fileId]` endpoint assumes array only (line 176: `fileData.processed_documents[0]`)
4. Supabase PostgREST behavior: When parent query uses `.single()`, nested relationships may return as object instead of single-item array

**Location**: app/api/export/[fileId]/route.ts:165-176

**Why This Breaks**:
1. Query executes with `.single()` on line 150
2. Supabase returns `processed_documents` as an object (not array)
3. Check on line 165 evaluates: `!fileData.processed_documents` is false (object exists)
4. Check evaluates: `fileData.processed_documents.length === 0` is `undefined === 0` which is false
5. Passes validation and reaches line 176
6. Line 176 tries to access `fileData.processed_documents[0]` on an object
7. Returns `undefined`
8. Line 179 tries to access `undefined.structured_output` → TypeError

**User Impact**:
- What user action fails: Clicking "Export" button on dashboard document card
- What user sees: Generic error toast "Failed to export document"
- User journey blocked: Cannot export any completed document summaries in JSON or Markdown format

---

## Corrective Plan

**Step 1**: Normalize processed_documents access pattern
- **File**: app/api/export/[fileId]/route.ts
- **Line**: 176
- **Current**:
```typescript
const processedDoc = fileData.processed_documents[0];
```
- **Change To**:
```typescript
const processedDoc = Array.isArray(fileData.processed_documents)
  ? fileData.processed_documents[0]
  : fileData.processed_documents;
```
- **Reason**: Handles both Supabase return formats (array when using bulk queries, object when using `.single()`). This matches the working pattern in `/api/documents` endpoint (line 116-118).

**Step 2**: Add null safety check after normalization
- **File**: app/api/export/[fileId]/route.ts
- **Line**: 181 (after new normalization code)
- **Current**: (no check exists)
- **Change To**:
```typescript
if (!processedDoc) {
  return NextResponse.json(
    {
      success: false,
      error: 'Document has not been processed yet',
      code: ErrorCode.enum.PROCESSING_ERROR,
    },
    { status: 400 }
  );
}
```
- **Reason**: Defense in depth - catches edge case where relationship exists but is null/undefined

**Step 3**: Remove debug logging
- **File**: app/api/export/[fileId]/route.ts
- **Line**: 164-166
- **Current**:
```typescript
console.log('[DEBUG] fileData structure:', JSON.stringify(fileData, null, 2));
console.log('[DEBUG] processed_documents:', fileData.processed_documents);
console.log('[DEBUG] is array?', Array.isArray(fileData.processed_documents));
```
- **Change To**: (delete these lines)
- **Reason**: Temporary debug code added during investigation, not needed in production

---

## Side Effects

**Potential Issues**:
- None expected - this is a defensive fix that handles both data formats
- Pattern already proven in `/api/documents` endpoint which handles same data structure

**Related Code**:
- app/api/documents/route.ts (lines 116-118) - Uses same pattern successfully
- Any future endpoints querying processed_documents should use this same normalization pattern

---

## Prevention

**How to avoid this**:
- When querying Supabase relationships, always normalize the result format:
  ```typescript
  const relatedData = Array.isArray(parent.relationship)
    ? parent.relationship[0]
    : parent.relationship;
  ```
- Document this pattern in codebase standards
- Add type safety: Create TypeScript helper function for relationship normalization

**Test to add**:
- Contract test for export endpoint with valid processed document
- Verify both JSON and Markdown export formats work
- Test with `.single()` and bulk query patterns

**Validation to include**:
- Always check normalized result for null/undefined before accessing properties
- Use TypeScript strict null checks to catch these at compile time

---

## Next Steps

1. Apply corrective plan above (3 changes to route.ts)
2. Re-run code-reviewer on changes
3. Manual test export endpoint with existing document
4. Verify both JSON and Markdown formats download correctly
5. Document relationship normalization pattern in CLAUDE.md
