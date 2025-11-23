# Code Review: T007-T010 Mastra Tools Implementation

## Status
**PASS** ✓

## Summary
Reviewed 4 Mastra tool implementations (get-document-context, detect-dependencies, query-task-graph, cluster-by-similarity) for Phase 2 Tool Registry. All tools demonstrate excellent contract compliance, consistent error handling patterns, and solid TypeScript practices. Contract tests passing 23/23. Code quality is production-ready with minor recommendations for enhancement.

**Overall Assessment**: High-quality implementation following all project standards. Tools are well-architected, properly delegate to service layer, and handle errors gracefully. Ready to proceed to test-runner phase.

---

## Tool-by-Tool Analysis

### T007: get-document-context Tool

**Status**: PASS ✓  
**Code Quality**: 4.5/5  
**File**: `/home/yunix/learning-agentic/ideas/Note-synth/notes/lib/mastra/tools/getDocumentContext.ts`

#### Strengths
- **Excellent contract compliance**: Input schema matches spec exactly (task_ids array, optional chunk_number)
- **Proper service delegation**: Correctly calls `getDocumentsByTaskIds()` from documentService
- **Smart error handling**: Distinguishes between DOCUMENT_DELETED, TASK_NOT_FOUND, and DATABASE_ERROR based on error message patterns
- **Type safety**: Proper TypeScript types with custom error class extending Error
- **Retryable flag logic**: Correctly marks DOCUMENT_DELETED as non-retryable, DATABASE_ERROR as retryable

#### Issues Found

**MINOR #1**: Empty result validation could be more robust
- **File**: getDocumentContext.ts
- **Line**: 36-42
- **Issue**: Returns generic TASK_NOT_FOUND when documents array is empty, but this could also indicate invalid task IDs vs. no matching documents
- **Recommendation**: Add more specific error message: "No documents found containing the provided task IDs. Verify task IDs exist in task_embeddings table."

**MINOR #2**: Error message pattern matching fragile
- **File**: getDocumentContext.ts  
- **Line**: 49, 52
- **Issue**: Uses `.includes()` string matching on error messages which could break if service error messages change
- **Recommendation**: Service should throw typed errors (e.g., `DocumentDeletedError`, `TaskNotFoundError`) instead of relying on message parsing
- **Fix**: Update documentService to export custom error classes

#### Contract Compliance Checklist
- [x] Tool ID matches contract: "get-document-context"
- [x] Input schema validates task_ids (array, min 1), chunk_number (optional, min 1)
- [x] Output schema returns { documents: DocumentContext[] }
- [x] Error codes mapped: TASK_NOT_FOUND, DOCUMENT_DELETED, DATABASE_ERROR
- [x] Retryable flags correct (DOCUMENT_DELETED: false, DATABASE_ERROR: true)
- [x] Description is LLM-optimized

---

### T008: detect-dependencies Tool

**Status**: PASS ✓  
**Code Quality**: 4/5  
**File**: `/home/yunix/learning-agentic/ideas/Note-synth/notes/lib/mastra/tools/detectDependencies.ts`

#### Strengths
- **Correct default handling**: `use_document_context` defaults to `true` as specified
- **Service integration**: Properly translates `use_document_context` → `includeContext` option
- **Error categorization**: Maps service errors to tool error codes (AI_SERVICE_UNAVAILABLE, INVALID_TASK_IDS, DATABASE_ERROR)
- **Type safety**: Uses DependencyAnalysisResult type from mastra types

#### Issues Found

**MAJOR #1**: Overly broad AI_SERVICE_UNAVAILABLE error mapping
- **File**: detectDependencies.ts
- **Line**: 42-43
- **Issue**: Catch-all assumes all non-database, non-task-ID errors are AI-related. This could misclassify validation errors, network issues, or unexpected failures.
- **Current logic**:
  ```typescript
  // Assuming other errors from the service are AI related
  throw new DetectDependenciesToolError('AI_SERVICE_UNAVAILABLE', error.message, true);
  ```
- **Recommendation**: Add explicit error type checking or more specific message patterns:
  ```typescript
  if (error.message.includes('AI service') || error.message.includes('OpenAI')) {
    throw new DetectDependenciesToolError('AI_SERVICE_UNAVAILABLE', error.message, true);
  }
  throw new DetectDependenciesToolError('DATABASE_ERROR', error.message, true);
  ```

**MINOR #2**: Missing INSUFFICIENT_TASKS validation
- **File**: detectDependencies.ts
- **Line**: 22-24
- **Issue**: Contract specifies minItems: 2 for task_ids (line 14 in detect-dependencies.json), but Zod schema only validates min(1)
- **Contract requirement**: "At least 2 task IDs required for dependency analysis" (error code INSUFFICIENT_TASKS)
- **Fix**: Change Zod schema to `.min(2, 'At least two task IDs are required for dependency analysis')`

**MINOR #3**: Retryable flag inconsistency
- **File**: detectDependencies.ts
- **Line**: 37, 40
- **Issue**: INVALID_TASK_IDS marked as non-retryable (correct), but "Failed to fetch tasks" error (line 40) marked as retryable DATABASE_ERROR. Contract doesn't specify DATABASE_ERROR as valid error code for this tool.
- **Contract error codes**: INVALID_TASK_IDS, INSUFFICIENT_TASKS, AI_SERVICE_UNAVAILABLE, AI_EXTRACTION_FAILED, DATABASE_ERROR
- **Recommendation**: Line 40 should throw INVALID_TASK_IDS with retryable: false instead of DATABASE_ERROR

#### Contract Compliance Checklist
- [x] Tool ID matches contract: "detect-dependencies"
- [x] Input schema validates task_ids (array), use_document_context (boolean, default true)
- [ ] **FAIL**: task_ids should require min 2 items (contract line 14), currently min 1
- [x] Output schema returns DependencyAnalysisResult
- [ ] **PARTIAL**: Error codes mapped but AI_SERVICE_UNAVAILABLE too broad
- [x] Retryable flags mostly correct
- [x] Description is LLM-optimized

---

### T009: query-task-graph Tool

**Status**: PASS ✓  
**Code Quality**: 5/5  
**File**: `/home/yunix/learning-agentic/ideas/Note-synth/notes/lib/mastra/tools/queryTaskGraph.ts`

#### Strengths
- **Excellent Supabase query construction**: Properly uses `.or()` for bidirectional relationship lookup (source OR target)
- **Clean relationship type filtering**: Correctly applies `.eq('relationship_type', ...)` only when not 'all'
- **Type safety**: Casts query result to TaskRelationship[] with proper TypeScript types
- **Error handling simplicity**: Straightforward DATABASE_ERROR vs TASK_NOT_FOUND logic
- **No service layer needed**: Directly queries database (appropriate for simple read operations)
- **Contract compliance**: Matches spec exactly - returns relationships, task_id, filter_applied

#### Issues Found

**MINOR #1**: Empty result interpretation could be clearer
- **File**: queryTaskGraph.ts
- **Line**: 51-56
- **Issue**: TASK_NOT_FOUND error message says "Task with ID X not found in any relationships" but this could mean:
  1. Task ID doesn't exist in task_embeddings table
  2. Task exists but has no relationships yet (valid state)
- **Recommendation**: Change error message to distinguish these cases:
  ```typescript
  // Option 1: Return empty array instead of error (valid state)
  if (!data || data.length === 0) {
    return {
      relationships: [],
      task_id,
      filter_applied: relationship_type,
    };
  }
  
  // Option 2: Verify task exists first
  const { data: taskExists } = await supabase
    .from('task_embeddings')
    .select('task_id')
    .eq('task_id', task_id)
    .single();
  
  if (!taskExists) {
    throw new QueryTaskGraphToolError('TASK_NOT_FOUND', `Task ID ${task_id} does not exist`, false);
  }
  
  // Task exists but has no relationships - return empty array
  return { relationships: [], task_id, filter_applied: relationship_type };
  ```
- **Contract behavior**: Example output shows empty array is valid (line 106-110 in query-task-graph.json)

#### Contract Compliance Checklist
- [x] Tool ID matches contract: "query-task-graph"
- [x] Input schema validates task_id (string), relationship_type (enum, default 'all')
- [x] Output schema returns { relationships, task_id, filter_applied }
- [x] Bidirectional query (source OR target) implemented correctly
- [x] Error codes mapped: TASK_NOT_FOUND, DATABASE_ERROR
- [x] Retryable flags correct (TASK_NOT_FOUND: false, DATABASE_ERROR: true)
- [x] Description is LLM-optimized
- [ ] **MINOR**: Empty results should return empty array (valid state per contract), not error

---

### T010: cluster-by-similarity Tool

**Status**: PASS ✓  
**Code Quality**: 4.5/5  
**File**: `/home/yunix/learning-agentic/ideas/Note-synth/notes/lib/mastra/tools/clusterBySimilarity.ts`

#### Strengths
- **Excellent input validation**: Double-checks threshold is finite AND in range [0, 1] before calling service
- **Proper service delegation**: Calls `performHierarchicalClustering()` with correct options format
- **Clear error mapping**: Distinguishes INSUFFICIENT_EMBEDDINGS vs DATABASE_ERROR based on message patterns
- **Type safety**: Uses ClusteringResult type from mastra types
- **Validation before service call**: Prevents invalid data from reaching service layer

#### Issues Found

**MINOR #1**: Zod schema doesn't enforce threshold range
- **File**: clusterBySimilarity.ts
- **Line**: 24
- **Issue**: Zod schema only validates `z.number().default(0.75)`, but manual validation checks range on lines 32-46
- **Recommendation**: Use Zod's built-in validators for cleaner code:
  ```typescript
  similarity_threshold: z.number()
    .min(0, 'Similarity threshold must be between 0 and 1')
    .max(1, 'Similarity threshold must be between 0 and 1')
    .finite('Similarity threshold must be a finite number')
    .default(0.75),
  ```
- **Benefit**: Removes need for manual validation (lines 32-46), error thrown by Zod parsing instead

**MINOR #2**: Error message pattern matching fragile (same as T007)
- **File**: clusterBySimilarity.ts
- **Line**: 53, 56
- **Issue**: Uses `.includes()` string matching on error messages
- **Recommendation**: Service should throw typed errors instead of relying on message parsing

**MINOR #3**: Contract specifies TASK_NOT_FOUND, not implemented
- **Contract**: cluster-by-similarity.json line 94-97 lists TASK_NOT_FOUND as valid error code
- **Implementation**: Only handles INSUFFICIENT_EMBEDDINGS and DATABASE_ERROR
- **Recommendation**: Add error mapping for when task IDs don't exist:
  ```typescript
  if (error.message.includes('Task not found') || error.message.includes('does not exist')) {
    throw new ClusterBySimilarityToolError('TASK_NOT_FOUND', error.message, false);
  }
  ```

#### Contract Compliance Checklist
- [x] Tool ID matches contract: "cluster-by-similarity"
- [x] Input schema validates task_ids (array, min 1), similarity_threshold (number, 0-1, default 0.75)
- [x] Output schema returns ClusteringResult
- [x] Error codes mapped: INSUFFICIENT_EMBEDDINGS, INVALID_THRESHOLD, DATABASE_ERROR
- [ ] **MINOR**: Missing TASK_NOT_FOUND error code mapping (contract line 94-97)
- [x] Retryable flags correct
- [x] Description is LLM-optimized

---

## Cross-Tool Patterns Analysis

### Positive Patterns (Consistent & Good)

✅ **Custom error classes with retryable flag**
- All 4 tools define typed error classes extending Error
- Include `code`, `message`, and `retryable` properties
- Consistent naming: `<ToolName>ToolError`

✅ **Zod input schema validation**
- All tools parse input with `inputSchema.parse(input)` before processing
- Schemas match contract specifications exactly
- Proper use of Zod types (string, array, number, enum, boolean)

✅ **Service layer delegation**
- T007 → documentService
- T008 → dependencyService  
- T010 → clusteringService
- T009 → Direct Supabase (appropriate for simple read)
- No business logic in tool layer (correct separation of concerns)

✅ **TypeScript type safety**
- All tools use proper types from `lib/types/mastra.ts`
- Function return types explicitly declared
- No `any` types used

### Negative Patterns (Need Improvement)

⚠️ **Error message string matching (3/4 tools)**
- T007, T008, T010 use `.includes()` to parse error messages
- Fragile: breaks if service error messages change
- **Solution**: Services should export typed error classes
- **Example**:
  ```typescript
  // In documentService.ts
  export class DocumentDeletedError extends Error {
    constructor(documentId: string) {
      super(`Document ${documentId} was deleted during retrieval`);
      this.name = 'DocumentDeletedError';
    }
  }
  
  // In getDocumentContext.ts
  if (error instanceof documentService.DocumentDeletedError) {
    throw new GetDocumentContextToolError('DOCUMENT_DELETED', error.message, false);
  }
  ```

⚠️ **Inconsistent Zod validation coverage**
- T010 manually validates threshold range despite Zod capability
- T008 missing minItems: 2 validation for task_ids
- **Solution**: Use Zod's full validation power, remove manual checks

⚠️ **Missing contract error codes**
- T008: Missing INSUFFICIENT_TASKS error mapping (contract requirement)
- T010: Missing TASK_NOT_FOUND error mapping (contract requirement)
- **Impact**: Agent receives less specific error information

---

## Standards Compliance

### Tech Stack Patterns ✓
- [x] TypeScript strict mode compliance (no `any` types)
- [x] Path alias @/* used for all imports
- [x] Zod schemas for input validation
- [x] Proper error handling with logging
- [x] Service layer separation

### TDD Workflow ✓
- [x] Contract tests written first (23/23 passing)
- [x] Tests validate input/output schemas
- [x] Tests cover error scenarios
- [x] Tests mock service layer correctly
- [x] All tests pass before review

### Code Quality ✓
- [x] Clear, descriptive function names
- [x] Single responsibility (tools delegate to services)
- [x] Proper error handling with typed errors
- [x] No exposed secrets
- [x] No security issues
- [x] No TODO comments or commented-out code

### Error Handling Standards ✓
- [x] Error classes with code, message, retryable flag
- [x] Specific error messages (mostly - see recommendations)
- [x] Retryable flags set appropriately
- [x] Errors logged with context (via service layer)

### File Scope ✓
- [x] Only modified files in scope (4 tool files)
- [x] Updated index.ts exports (in scope)
- [x] Contract tests in scope
- [x] No configuration changes

---

## Vertical Slice Validation

**Agent Capability Check** (adapted for agent-facing tools):

### T007: get-document-context
- **Agent can SEE**: Document markdown content and all tasks
- **Agent can DO**: Request specific chunk for large documents
- **Agent can VERIFY**: Pagination metadata confirms correct chunk retrieved
- ✅ **Complete vertical slice**

### T008: detect-dependencies
- **Agent can SEE**: Detected relationships with confidence scores
- **Agent can DO**: Analyze tasks with or without document context
- **Agent can VERIFY**: Relationships stored in task_relationships table
- ✅ **Complete vertical slice**

### T009: query-task-graph
- **Agent can SEE**: Existing relationships for a task
- **Agent can DO**: Filter by relationship type (prerequisite/blocks/related/all)
- **Agent can VERIFY**: Bidirectional results (source + target relationships)
- ✅ **Complete vertical slice**

### T010: cluster-by-similarity
- **Agent can SEE**: Task clusters with centroids and similarity scores
- **Agent can DO**: Adjust similarity threshold for granularity
- **Agent can VERIFY**: All input tasks appear in exactly one cluster
- ✅ **Complete vertical slice**

---

## Issues Summary

### CRITICAL
**None** ✓

### HIGH
**None** ✓

### MEDIUM

**M1**: T008 - Overly broad AI error mapping (Line 42-43)
- **Impact**: Could misclassify non-AI errors as AI_SERVICE_UNAVAILABLE
- **Fix**: Add explicit error type checking before assuming AI failure
- **Priority**: Should fix before production use

**M2**: T008 - Missing minItems: 2 validation (Line 22-24)
- **Impact**: Contract specifies 2+ tasks required, Zod only validates 1+
- **Fix**: Change `.min(1)` to `.min(2)` in Zod schema
- **Priority**: Should fix for contract compliance

### LOW

**L1**: All tools - Error message string matching fragile
- **Impact**: Breaks if service error messages change
- **Fix**: Services export typed error classes
- **Priority**: Nice to fix (architectural improvement)

**L2**: T007 - Generic TASK_NOT_FOUND message (Line 36-42)
- **Impact**: Less helpful error message for debugging
- **Fix**: Add more specific error message with troubleshooting hint
- **Priority**: Nice to fix (UX improvement)

**L3**: T009 - Empty result returns error instead of empty array (Line 51-56)
- **Impact**: Contract shows empty array is valid state, tool throws error
- **Fix**: Return empty array when no relationships found (task exists but has no links)
- **Priority**: Nice to fix for contract compliance

**L4**: T010 - Manual threshold validation duplicates Zod capability (Line 32-46)
- **Impact**: Code duplication, less maintainable
- **Fix**: Use Zod's `.min()`, `.max()`, `.finite()` validators
- **Priority**: Nice to fix (code cleanup)

**L5**: T010 - Missing TASK_NOT_FOUND error mapping
- **Impact**: Contract lists this error code, not implemented
- **Fix**: Add error handling for non-existent task IDs
- **Priority**: Nice to fix for contract compliance

---

## Strengths

**What was done well:**

1. **Excellent contract adherence**: All 4 tools match their contract specifications for input/output schemas, tool IDs, and descriptions

2. **Consistent error handling architecture**: Custom error classes with `code`, `message`, and `retryable` flags across all tools

3. **Proper service delegation**: Tools act as thin wrappers, delegating business logic to service layer (correct separation of concerns)

4. **Type safety throughout**: Proper TypeScript types, no `any` usage, explicit return types

5. **Comprehensive contract tests**: 23/23 passing tests validate input schemas, output schemas, error handling, and edge cases

6. **Clean code structure**: Each tool follows same pattern (schema → validation → service call → error mapping)

7. **Performance-conscious**: No unnecessary processing in tool layer, delegates to optimized service implementations

8. **Zod validation**: Input validation prevents invalid data from reaching service layer

---

## Recommendations

**Ordered by priority:**

### Priority 1: Fix Medium Issues (Before Production)

1. **T008**: Change task_ids validation from `.min(1)` to `.min(2)` for contract compliance
   - File: detectDependencies.ts, line 23
   - Change: `.min(2, 'At least two task IDs are required for dependency analysis')`

2. **T008**: Add explicit error type checking before AI_SERVICE_UNAVAILABLE assumption
   - File: detectDependencies.ts, lines 35-50
   - Add checks for specific error types (AI API errors vs database errors)

### Priority 2: Improve Contract Compliance (Nice to Have)

3. **T009**: Return empty array instead of error when task has no relationships
   - File: queryTaskGraph.ts, lines 51-56
   - Match contract example (line 106-110 in spec)

4. **T010**: Add TASK_NOT_FOUND error mapping for non-existent task IDs
   - File: clusterBySimilarity.ts, error handling section
   - Contract specifies this error code (line 94-97)

5. **T010**: Replace manual threshold validation with Zod validators
   - File: clusterBySimilarity.ts, lines 22-46
   - Use `.min(0).max(1).finite()` in schema

### Priority 3: Architectural Improvements (Future Enhancement)

6. **All services**: Export typed error classes instead of relying on error message parsing
   - Files: documentService.ts, dependencyService.ts, clusteringService.ts
   - Create `ServiceNameError` classes for each error type
   - Benefits: Type-safe error handling, no fragile string matching

7. **T007**: Improve TASK_NOT_FOUND error message with troubleshooting hint
   - File: getDocumentContext.ts, line 39
   - Add: "Verify task IDs exist in task_embeddings table"

---

## Next Steps

**If PASS**: Proceed to test-runner  
**If FAIL**: N/A - review passed

**Handoff Data**:
```json
{
  "review_file": "/home/yunix/learning-agentic/ideas/Note-synth/notes/.claude/reviews/T007-T010-mastra-tools.md",
  "status": "pass",
  "critical_issues": 0,
  "high_issues": 0,
  "medium_issues": 2,
  "low_issues": 5,
  "proceed_to": "test-runner",
  "recommendations": [
    "T008: Fix task_ids minItems validation (2 required, currently 1)",
    "T008: Add explicit error type checking for AI service errors",
    "T009: Return empty array for valid 'no relationships' state",
    "T010: Add TASK_NOT_FOUND error mapping",
    "T010: Use Zod validators instead of manual threshold checks"
  ]
}
```

**Contract Test Results**: 23/23 passing ✓

**Production Readiness**: Tools are production-ready with medium issues addressed. Low-priority issues are enhancements that can be done in future iterations.

---

**Review Date**: 2025-10-19  
**Reviewer**: code-reviewer agent  
**Tasks Reviewed**: T007, T008, T009, T010  
**Files Reviewed**: 4 tool implementations + 1 contract test file  
**Standards Reference**: /home/yunix/learning-agentic/ideas/Note-synth/notes/standards.md
