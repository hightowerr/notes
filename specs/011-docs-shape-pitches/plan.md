# Implementation Plan: Document Reprocessing

**Branch**: `011-docs-shape-pitches` | **Date**: 2025-11-05 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/home/yunix/learning-agentic/ideas/Note-synth/notes/specs/011-docs-shape-pitches/spec.md`

## Summary

Enable users to re-analyze existing documents with improved OCR and AI extraction capabilities without manual deletion and re-upload. Users click a "Reprocess" action on document cards in the dashboard, which triggers the complete processing pipeline (conversion → AI extraction → embedding generation) using the latest system improvements. For Google Drive documents, the system downloads the latest version from Drive. The feature preserves original metadata while replacing analysis results, handles errors gracefully, and respects existing queue limits (max 3 concurrent).

**Technical Approach**: Add new POST endpoint `/api/documents/[id]/reprocess` that validates document eligibility, handles source-specific logic (Drive re-download vs stored file), deletes old processed data via CASCADE, resets status to 'pending', and triggers existing `/api/process` pipeline. Frontend adds dropdown menu to document cards with "Reprocess" and "Delete" options, loading states, and toast notifications.

## Technical Context

**Language/Version**: TypeScript 5+ / Node.js 20+
**Primary Dependencies**: Next.js 15, React 19, @supabase/supabase-js, Vercel AI SDK, googleapis (Drive API)
**Storage**: Supabase PostgreSQL with pgvector, Supabase Storage buckets
**Testing**: Vitest + React Testing Library (automated when possible, manual test guides for FormData limitations)
**Target Platform**: Web (Next.js App Router)
**Project Type**: Web application (Next.js fullstack)
**Performance Goals**: <15s reprocessing time for documents under 10MB, <500ms dashboard responsiveness
**Constraints**: Must preserve Google Drive sync state, CASCADE deletes must not orphan data, respect processing queue limit (3 concurrent)
**Scale/Scope**: Support reprocessing for hundreds of existing documents, handle Drive API rate limits and auth errors

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with AI Note Synthesiser Constitution v1.1.7:

- [x] **Autonomous by Default**: ⚠️ **JUSTIFIED VIOLATION** - Feature requires manual user trigger (click "Reprocess").
  **Justification**: Reprocessing is a potentially destructive operation that replaces existing analysis. User must explicitly confirm intent to avoid accidental data loss. Constitution Principle I allows manual triggers for "destructive operations."

- [x] **Deterministic Outputs**: JSON schemas already documented (`processed_documents` table schema), reprocessing uses existing pipeline with same validation

- [x] **Modular Architecture**: Reuses existing services (`noteProcessor`, `aiSummarizer`, `embeddingService`, `googleDriveService`), new endpoint is thin orchestration layer

- [x] **Test-First Development**: TDD planned with contract tests for new endpoint, integration tests for reprocessing flow, manual test guide for Drive integration

- [x] **Observable by Design**: Structured logging via `processing_logs` table (existing), reprocessing events logged with 'reprocess' operation type

- [x] **Vertical Slice Architecture**: Complete slice: UI action (dropdown menu) + Backend endpoint + Data cleanup + User feedback (loading + toast notifications)

**Violations documented in Complexity Tracking**: Manual trigger justified for destructive operation safety.

## Project Structure

### Documentation (this feature)
```
specs/011-docs-shape-pitches/
├── plan.md              # This file (/plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── reprocess-endpoint.yaml
└── tasks.md             # Phase 2 output (/tasks command)
```

### Source Code (repository root)
```
app/
├── api/
│   ├── documents/
│   │   └── [id]/
│   │       ├── route.ts           # Existing (GET/DELETE)
│   │       └── reprocess/
│   │           └── route.ts       # NEW: POST reprocess endpoint
│   └── process/
│       └── route.ts               # Existing (reused for pipeline)
├── dashboard/
│   └── page.tsx                   # MODIFIED: Add dropdown menu, reprocess handler
└── components/
    └── (existing UI components)   # Reused (Button, DropdownMenu, toast)

lib/
├── services/
│   ├── googleDriveService.ts      # MODIFIED: Add downloadFileById()
│   ├── processingQueue.ts         # Existing (reused)
│   ├── noteProcessor.ts           # Existing (reused)
│   ├── aiSummarizer.ts            # Existing (reused)
│   └── embeddingService.ts        # Existing (reused)
└── hooks/
    └── useDocuments.ts            # MODIFIED: Add reprocessDocument()

__tests__/
├── contract/
│   └── reprocess.test.ts          # NEW: Contract test for reprocess endpoint
└── integration/
    └── reprocess-flow.test.ts     # NEW: Full reprocessing integration test

.claude/testing/
└── T011-reprocess-manual.md       # NEW: Manual test guide for Drive integration
```

**Structure Decision**: Next.js App Router fullstack structure with `app/api/` for backend routes, `app/dashboard/` for pages, `lib/services/` for business logic. This matches existing project structure and keeps reprocessing logic modular.

## Phase 0: Outline & Research

**No NEEDS CLARIFICATION items** - All technical context is well-defined from existing codebase and Shape Up pitch.

### Research Topics

1. **CASCADE Delete Verification**
   - **Decision**: Use Supabase CASCADE foreign key constraints
   - **Rationale**: Database `processed_documents` table has CASCADE DELETE to `task_embeddings` and `task_relationships` (verified in migrations 007-009)
   - **Verification Required**: Manual SQL query to confirm CASCADE works without orphans before ship

2. **Google Drive API - Download Latest File**
   - **Decision**: Use existing `googleapis` client with `files.get` and `alt=media` for binary download
   - **Rationale**: Already implemented in `googleDriveService.ts` for initial sync, reuse pattern
   - **Implementation**: Extract `downloadFileById(fileId, tokens)` as reusable function

3. **Processing Queue Integration**
   - **Decision**: Reuse existing `processingQueue.ts` singleton (max 3 concurrent)
   - **Rationale**: Reprocessing is identical to initial processing from queue's perspective
   - **Implementation**: POST to `/api/process` with `fileId`, queue handles concurrency

4. **Error Handling Patterns**
   - **Decision**: Follow existing error handling in `/api/upload` and `/api/process`
   - **Patterns**:
     - Drive file deleted → 404 with message "File no longer available in Google Drive"
     - Token expired → 401 with message "Please reconnect Google Drive"
     - Processing fails → Preserve old data, return 500, user can retry
     - Concurrent reprocess → 409 with message "Document is already being processed"

**Output**: research.md (see separate file)

## Phase 1: Design & Contracts

*Prerequisites: research.md complete*

### Data Model

**No new entities required** - Reprocessing uses existing database schema.

**State Transitions**:
```
uploaded_files.status:
  completed/failed/review_required → pending (on reprocess trigger)
  pending → processing (via queue)
  processing → completed/failed/review_required (after pipeline)

processed_documents:
  [existing record] → [deleted]
  → [new record created by pipeline]
```

**Metadata Preservation**:
- `uploaded_files`: Preserve `id`, `name`, `source`, `external_id`, `uploaded_at`, `storage_path`
- Update: `status`, `processed_at`, `queue_position`

**Output**: data-model.md (see separate file)

### API Contracts

**New Endpoint**: `POST /api/documents/[id]/reprocess`

**Request**:
```typescript
// Path parameter
id: string  // Document UUID

// No request body
```

**Responses**:

**200 Success**:
```json
{
  "success": true,
  "status": "processing",
  "message": "Document queued for reprocessing"
}
```

**400 Bad Request** (text input document):
```json
{
  "error": "Cannot reprocess text input documents - no file stored"
}
```

**404 Not Found** (Drive file deleted):
```json
{
  "error": "File no longer available in Google Drive"
}
```

**401 Unauthorized** (Drive token expired):
```json
{
  "error": "Google Drive authentication expired. Please reconnect your account."
}
```

**409 Conflict** (already processing):
```json
{
  "error": "Document is already being processed. Please wait for current operation to complete."
}
```

**500 Internal Server Error**:
```json
{
  "error": "Reprocessing failed. Please try again."
}
```

**Output**: `contracts/reprocess-endpoint.yaml` (OpenAPI 3.0 spec)

### Contract Tests

**File**: `__tests__/contract/reprocess.test.ts`

```typescript
describe('POST /api/documents/[id]/reprocess', () => {
  it('should return 200 and queue document for reprocessing', async () => {
    // Arrange: Create completed document
    const doc = await createTestDocument({ status: 'completed' });

    // Act
    const response = await fetch(`/api/documents/${doc.id}/reprocess`, {
      method: 'POST'
    });

    // Assert
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toMatchObject({
      success: true,
      status: 'processing'
    });
  });

  it('should return 400 for text input documents', async () => {
    const doc = await createTestDocument({ source: 'text_input' });
    const response = await fetch(`/api/documents/${doc.id}/reprocess`, {
      method: 'POST'
    });
    expect(response.status).toBe(400);
  });

  it('should return 409 when document already processing', async () => {
    const doc = await createTestDocument({ status: 'processing' });
    const response = await fetch(`/api/documents/${doc.id}/reprocess`, {
      method: 'POST'
    });
    expect(response.status).toBe(409);
  });
});
```

**Tests must fail initially** (endpoint not implemented yet).

### Quickstart Test Scenario

**File**: `quickstart.md`

**User Journey**:
1. Navigate to dashboard (`/dashboard`)
2. Locate document with low-quality results (e.g., "Guest Lecture Dexter Horthy.pdf")
3. Click three-dot menu (⋮) on document card
4. Click "Reprocess" option
5. Observe loading spinner on card
6. Wait for completion (should see toast notification within 15s)
7. Verify updated summary shows improved confidence score
8. Check database: old `processed_documents` deleted, new record created

**Edge Case Tests**:
- Attempt to reprocess text input → See error message
- Attempt to reprocess document already processing → See "already processing" message
- Google Drive file deleted → See "file no longer available" error

**Output**: `quickstart.md` (see separate file)

### Update CLAUDE.md

**No updates required** - Feature uses existing tech stack (Next.js, Supabase, Google Drive API). CLAUDE.md already documents these dependencies and patterns.

**Verification**: Run `.specify/scripts/bash/update-agent-context.sh claude` (O(1) operation, no new context to add)

## Phase 2: Task Planning Approach

*This section describes what the /tasks command will do - DO NOT execute during /plan*

**Task Generation Strategy**:

The /tasks command will generate **vertical slice tasks** from Phase 1 design:

1. **Contract Tests** (from `contracts/reprocess-endpoint.yaml`):
   - T001: [TEST] Contract test for POST /api/documents/[id]/reprocess endpoint

2. **Backend Implementation** (from data model + API contract):
   - T002: [SLICE] User can reprocess manually uploaded document
     - UI: Dropdown menu with "Reprocess" option
     - Backend: POST `/api/documents/[id]/reprocess` for manual uploads
     - Data: CASCADE delete + status reset + trigger pipeline
     - Feedback: Loading spinner + success toast

   - T003: [SLICE] User can reprocess Google Drive document
     - UI: Same dropdown (Drive source detection)
     - Backend: Download latest from Drive + reprocess
     - Data: Same CASCADE logic
     - Feedback: Loading + toast (+ Drive error handling)

3. **Integration Tests** (from quickstart.md):
   - T004: [TEST] Integration test for complete reprocessing flow

4. **Manual Test Guide** (FormData limitation workaround):
   - T005: [DOC] Manual test guide for Drive file reprocessing

**Ordering Strategy**:
- TDD order: T001 (contract test) → T002 (manual upload slice) → T003 (Drive slice) → T004 (integration test) → T005 (manual test doc)
- Dependencies: T002 and T003 can run in parallel after T001
- Mark T002 and T003 as [P] for parallel execution

**Estimated Output**: 5-6 numbered tasks in tasks.md

**Vertical Slice Validation**:
- T002: ✅ SEE (dropdown menu) + DO (click reprocess) + VERIFY (see updated results)
- T003: ✅ SEE (same UI) + DO (reprocess Drive doc) + VERIFY (latest version analyzed)

**IMPORTANT**: This phase is executed by the /tasks command, NOT by /plan

## Phase 3+: Future Implementation

*These phases are beyond the scope of the /plan command*

**Phase 3**: Task execution (/tasks command creates tasks.md)
**Phase 4**: Implementation (execute tasks.md following constitutional principles)
**Phase 5**: Validation (run tests, execute quickstart.md, performance validation)

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Manual trigger (Principle I: Autonomous by Default) | Reprocessing replaces existing analysis - destructive operation requiring user confirmation | Automatic reprocessing on every code change would be too expensive (hundreds of documents, API costs). User must opt-in per document. |

**Justification**: Constitution Principle I explicitly allows manual triggers for "destructive operations." Reprocessing deletes old analysis data, so user confirmation is required.

## Progress Tracking

*This checklist is updated during execution flow*

**Phase Status**:
- [x] Phase 0: Research complete (/plan command)
- [x] Phase 1: Design complete (/plan command)
- [x] Phase 2: Task planning complete (/plan command - describe approach only)
- [ ] Phase 3: Tasks generated (/tasks command)
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: Validation passed

**Gate Status**:
- [x] Initial Constitution Check: PASS (with justified violation)
- [x] Post-Design Constitution Check: PASS
- [x] All NEEDS CLARIFICATION resolved (none existed)
- [x] Complexity deviations documented

---
*Based on Constitution v1.1.7 - See `.specify/memory/constitution.md`*
