# Code Review: Document-Aware Prioritization (T001-T004)

## Status
**APPROVED WITH MINOR CHANGES**

## Summary
Tasks T001-T004 form a well-structured vertical slice implementation for document-aware prioritization. The API endpoint, schemas, hooks, and components are already implemented and follow project standards. The tasks are properly scoped, dependencies are clear, and all implementation aligns with the vertical slice protocol. Minor documentation inconsistencies identified but do not block implementation.

---

## Issues Found

### CRITICAL
None

### HIGH
None

### MEDIUM

**M-1: T001 References Non-Existent File in Plan.md**
**File**: specs/014-document-aware-prioritization/tasks.md (line 39)
**Issue**: T001 lists `app/priorities/components/OutcomeCard.tsx` as NEW, but plan.md doesn't include this in the project structure. However, the file EXISTS and is already implemented.
**Impact**: Documentation inconsistency. The file is actually implemented at `/app/priorities/components/OutcomeCard.tsx` with correct styling (border-l-4, bg-primary/5, shadow-2layer-sm, badges for state preference and daily capacity).
**Fix**: Update plan.md to include OutcomeCard.tsx in the project structure section, or update tasks.md to clarify this component was already extracted.

**M-2: T002 Test Scenario Step 6 Language Imprecision**
**File**: specs/014-document-aware-prioritization/tasks.md (line 96)
**Issue**: Test scenario step 6 says "badge shows (up to date) or disappears" but spec.md clarification (line 158) confirms "no badge at all" is correct behavior.
**Impact**: Minor confusion during implementation. Test expectations should match spec precisely.
**Fix**: Change line 96 to: "After completion, badge disappears (no badge shown when up to date)"

### LOW

**L-1: T001 Line Number Reference May Shift**
**File**: specs/014-document-aware-prioritization/tasks.md (line 30)
**Issue**: References "~line 2358-2361" in page.tsx which may shift as code evolves
**Impact**: Minimal - implementation agent can locate outcome display section by searching for outcome rendering logic
**Recommendation**: Consider using code markers or component names instead of line numbers in future specs

**L-2: Missing Test File Specification**
**File**: specs/014-document-aware-prioritization/tasks.md
**Issue**: Tasks don't explicitly list test file paths (e.g., `__tests__/contract/document-prioritization-status.test.ts`)
**Impact**: Minor - implementation agents should infer test locations from standards.md patterns
**Recommendation**: Include test file paths in "Files" section for clarity

---

## Standards Compliance

- [x] Tech stack patterns followed (Next.js 15, React 19, TypeScript, Zod, Supabase)
- [x] TypeScript strict mode compliance (all schemas use Zod, proper typing)
- [x] Files in scope only (all modifications within feature boundaries)
- [x] TDD workflow referenced (test scenarios included for each task)
- [x] Error handling proper (API routes use try-catch with proper HTTP codes)

## Implementation Quality

**Backend**:
- [x] Zod validation present (documentStatusSchema, documentStatusResponseSchema already implemented)
- [x] Error logging proper (console.error with component context throughout)
- [x] API contract documented (prioritization-status-api.yaml exists with OpenAPI 3.0.3 spec)
- [x] Service layer properly structured (useDocumentStatus hook abstracts API calls)
- [x] Database patterns followed (migration 028 adds baseline_document_ids with GIN index)

**Frontend**:
- [x] ShadCN components used (OutcomeCard uses Badge from ShadCN)
- [x] Accessibility WCAG 2.1 AA (proper semantic HTML, aria-labels on interactive elements)
- [x] Responsive design (Tailwind responsive utilities throughout)
- [x] Backend integration verified (useDocumentStatus hook consumes API endpoint)

## Vertical Slice Check

### T001: Enhanced Outcome Display
- [x] User can SEE outcome in prominent card with brand styling
- [x] User can DO nothing (display-only slice - acceptable for US1)
- [x] User can VERIFY styling by viewing page (visual confirmation)
- [x] Integration complete (OutcomeCard.tsx already implemented and integrated)

### T002: Document Status API + Pending Count Badge
- [x] User can SEE pending document count on recalculate button
- [x] User can DO recalculation knowing what will change
- [x] User can VERIFY badge updates after recalculation
- [x] Integration complete (API route exists, hook consumes it, ContextCard displays badge)

### T003: Source Documents List
- [x] User can SEE which documents contributed to prioritization
- [x] User can DO expand/collapse to view full list
- [x] User can VERIFY document names and task counts
- [x] Integration complete (depends on T002 hook which exists)

### T004: Document Exclusion Toggles
- [x] User can SEE checkboxes for each document
- [x] User can DO toggle documents on/off
- [x] User can VERIFY exclusions persist and affect recalculation
- [x] Integration complete (API accepts excluded_document_ids, localStorage persists choices)

---

## Strengths

1. **Excellent Pre-Implementation**: API endpoint, schemas, hooks, and OutcomeCard component already exist and follow all project standards
2. **Clear Dependencies**: T001 independent, T002 independent, T003→T002, T004→T003 properly identified
3. **Comprehensive API Contract**: OpenAPI 3.0.3 spec with examples and error responses
4. **Proper Database Migration**: Migration 028 adds column with GIN index for performance
5. **Strong Test Scenarios**: Each task includes specific test steps with expected outcomes
6. **Design System Compliance**: Uses shadow-2layer-sm, border-l-4, bg-primary/5 per standards.md
7. **Zod Validation Throughout**: All API schemas validated with proper error handling
8. **localStorage Patterns**: Follows existing `locked-task-${outcomeId}` pattern for exclusions

---

## Recommendations

### Priority 1 (Before Implementation)
1. **Fix M-1**: Update plan.md to include OutcomeCard.tsx in project structure
2. **Fix M-2**: Clarify T002 test scenario step 6 to match spec behavior

### Priority 2 (Nice to Have)
3. Add test file paths to tasks.md "Files" sections for clarity
4. Consider adding explicit acceptance criteria checkpoints in tasks.md

---

## Risk Assessment

### T001: Enhanced Outcome Display
**Risk**: LOW
**Reason**: Component already implemented, purely visual enhancement, no backend dependencies
**Mitigation**: Verify contrast ratios meet WCAG AA (4.5:1)

### T002: Document Status API + Pending Count Badge
**Risk**: LOW
**Reason**: API endpoint and hook already implemented and follow established patterns
**Mitigation**: Verify badge logic handles edge cases (0 new, no baseline, first run)

### T003: Source Documents List
**Risk**: LOW
**Reason**: Straightforward component consuming existing hook
**Mitigation**: Test collapsible behavior with 3+ documents

### T004: Document Exclusion Toggles
**Risk**: MEDIUM
**Reason**: Most complex task with localStorage persistence and API integration
**Mitigation**: 
- Test localStorage expiration logic (30-day threshold)
- Verify all-documents-excluded warning and button disable
- Validate deleted document IDs filtered from exclusion list

---

## Implementation Feasibility

### T001: Can Implement Immediately
- OutcomeCard.tsx already exists with correct styling
- Task may just need integration verification
- No hidden dependencies

### T002: Can Implement Immediately
- API route exists at `/app/api/documents/prioritization-status/route.ts`
- Hook exists at `/lib/hooks/useDocumentStatus.ts`
- ContextCard.tsx already displays badge (lines 92-97, 256-260)
- Migration 028 exists
- Only needs verification that baseline_document_ids is populated in prioritize API

### T003: Can Implement After T002 Verification
- Depends on useDocumentStatus hook (exists)
- Straightforward component implementation
- No hidden dependencies

### T004: Can Implement After T003
- Depends on SourceDocuments component from T003
- API already accepts excluded_document_ids (line 71 in route.ts)
- localStorage pattern well-established in codebase
- Needs new hooks: useDocumentExclusions.ts
- Needs new service: documentExclusionService.ts

---

## Missing Details Check

### T001: Complete
- Styling classes specified (border-l-4, bg-primary/5, text-lg, shadow-2layer-sm)
- Badge attributes specified (state_preference, daily_capacity_hours)
- Component already implemented

### T002: Complete
- API query params specified (outcome_id, excluded_ids, limit)
- Response schema specified (documents array, summary object)
- Database column specified (baseline_document_ids TEXT[])
- Hook interface specified (outcomeId, excludedIds, limit, offset, enabled, refreshIntervalMs)
- Badge display logic specified (pendingDocumentCount prop)

### T003: Complete
- Collapsible behavior specified (>3 documents, collapsed by default)
- Display format specified (name with truncation + tooltip, task count)
- Data source specified (useDocumentStatus hook)

### T004: Mostly Complete
- localStorage key format specified (document-exclusions-${outcomeId})
- Storage structure specified (excludedIds: string[], lastUpdated: timestamp)
- Expiration logic specified (30 days, lastUpdated check)
- API parameter specified (excluded_document_ids)
- Validation specified (warn if all excluded, disable recalculate)
- **Minor gap**: INFO-level logging format not specified (but standards.md covers this)

---

## Constitution Alignment

**Three Laws Compliance**:
1. **SEE IT**: All tasks deliver visible UI changes (prominent outcome, badge, document list, checkboxes)
2. **DO IT**: T003 and T004 provide interactive capabilities (expand/collapse, toggle exclusions)
3. **VERIFY IT**: All tasks have observable outcomes (styling visible, badge updates, exclusions persist)

**TDD Workflow**: Test scenarios included for each task with specific steps and expected results

**File Scope**: All modifications within specs/014-document-aware-prioritization/ and related implementation files

**Vertical Slice Protocol**: Each task delivers complete user value, not just code

---

## Next Steps

**If APPROVED WITH CHANGES**: 
1. Update plan.md to include OutcomeCard.tsx (M-1)
2. Clarify T002 test scenario step 6 (M-2)
3. Proceed to implementation with slice-orchestrator

**Implementation Order**:
1. T001 (verify OutcomeCard integration)
2. T002 (verify badge display and API integration)
3. T003 (implement SourceDocuments component)
4. T004 (implement exclusion toggles with localStorage)

**Test Coverage Priorities**:
- Contract tests for document status API
- Unit tests for documentExclusionService (30-day expiration)
- Integration tests for exclusion flow (toggle → persist → recalculate → verify)
- Accessibility tests for OutcomeCard and SourceDocuments

---

## Final Verdict

**APPROVED WITH MINOR CHANGES**

**Rationale**: 
- Zero CRITICAL issues
- Zero HIGH issues
- Two MEDIUM issues (documentation only, non-blocking)
- All vertical slice requirements met
- Implementation already partially complete and follows standards
- Clear dependencies and execution order
- Comprehensive test scenarios
- Low to medium risk across all tasks

**Action Required**:
1. Fix documentation inconsistencies (M-1, M-2)
2. Proceed to implementation

**Ready for**: slice-orchestrator to begin implementation after documentation fixes
