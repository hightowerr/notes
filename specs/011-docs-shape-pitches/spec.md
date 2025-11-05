# Feature Specification: Document Reprocessing

**Feature Branch**: `011-docs-shape-pitches`
**Created**: 2025-11-05
**Status**: Draft
**Input**: User description: "@docs/shape-up-pitches/phase-6-document-reprocessing.md"

---

## User Scenarios & Testing

### Primary User Story
A user has previously uploaded hundreds of documents that were processed with older OCR or AI extraction logic. After system improvements (better gibberish detection, improved confidence scoring, enhanced extraction), the user wants to re-analyze existing documents to benefit from these improvements without manually deleting and re-uploading each file.

The user navigates to their document dashboard, selects a document that shows low-quality results (e.g., gibberish tasks with artificially high confidence), clicks a "Reprocess" action, and receives updated analysis with the latest system capabilities.

### Acceptance Scenarios

1. **Given** a document uploaded via manual file upload (PDF/DOCX/TXT) with existing processed results, **When** user clicks "Reprocess" on that document, **Then** the system re-analyzes the document using current OCR and AI extraction logic and displays updated summary with new confidence scores.

2. **Given** a document synced from Google Drive with existing processed results, **When** user clicks "Reprocess", **Then** the system downloads the latest version from Google Drive, re-analyzes it, and displays updated results.

3. **Given** a document that was created via direct text input (no file), **When** user attempts to reprocess it, **Then** the system displays an error message explaining that text input documents cannot be reprocessed.

4. **Given** a document currently being processed (status: processing), **When** user attempts to reprocess it, **Then** the system prevents reprocessing and shows a message indicating the document is already being processed.

5. **Given** a document with existing analysis, **When** reprocessing completes successfully, **Then** the old analysis data (summary, embeddings, relationships) is replaced with new analysis results and the user sees a success notification.

6. **Given** a Google Drive document that was deleted from Drive, **When** user attempts to reprocess it, **Then** the system displays an error message indicating the file is no longer available in Google Drive.

### Edge Cases

- What happens when reprocessing fails midway (e.g., AI service timeout)?
  - Old data remains intact; user can retry reprocessing

- How does the system handle concurrent reprocessing attempts on the same document?
  - Second request is rejected; user sees "already processing" message

- What happens if user has insufficient Google Drive permissions when reprocessing?
  - System displays authentication error; user must reconnect Google Drive account

- What happens to processing queue limits (max 3 concurrent)?
  - Reprocessing follows same queue rules as initial upload; user sees queue position if limit reached

- What happens to document's upload timestamp and metadata?
  - Upload timestamp preserved; only processing timestamp and results updated

---

## Requirements

### Functional Requirements

- **FR-001**: System MUST allow users to trigger reprocessing for documents uploaded via file upload (PDF, DOCX, TXT)
- **FR-002**: System MUST allow users to trigger reprocessing for documents synced from Google Drive
- **FR-003**: System MUST prevent reprocessing of documents created via direct text input
- **FR-004**: System MUST download the latest version from Google Drive when reprocessing Drive-synced documents
- **FR-005**: System MUST use the existing stored file when reprocessing manually uploaded documents
- **FR-006**: System MUST delete all existing processed data (summary, embeddings, task relationships) before generating new analysis
- **FR-007**: System MUST preserve the original upload metadata (filename, upload timestamp, source type, external ID) during reprocessing
- **FR-008**: System MUST display a loading state on the document card while reprocessing is in progress
- **FR-009**: System MUST show a success notification when reprocessing completes successfully
- **FR-010**: System MUST show an error notification when reprocessing fails, with a user-friendly explanation
- **FR-011**: System MUST prevent concurrent reprocessing attempts on the same document
- **FR-012**: System MUST respect the existing processing queue limits (maximum 3 concurrent documents)
- **FR-013**: System MUST handle Google Drive authentication errors gracefully (expired tokens, deleted files, insufficient permissions)
- **FR-014**: System MUST preserve processing history logs (original processing date, reprocessing dates, status changes)
- **FR-015**: Users MUST be able to access the reprocess action from the document dashboard
- **FR-016**: System MUST complete reprocessing within 15 seconds for typical documents
- **FR-017**: System MUST clean up all orphaned data (embeddings, relationships) when replacing old analysis results

### Performance Requirements

- **PR-001**: Reprocessing must complete within 15 seconds for documents under 10MB
- **PR-002**: Dashboard must remain responsive during reprocessing (no UI blocking)
- **PR-003**: System must handle reprocessing without memory leaks from data cleanup operations

### Data Integrity Requirements

- **DR-001**: Old analysis data must only be deleted after new processing succeeds (preserve on failure)
- **DR-002**: CASCADE deletion must remove all related data (embeddings, relationships) without orphans
- **DR-003**: Google Drive sync state must be maintained (external_id, folder relationships preserved)
- **DR-004**: Processing logs must record all reprocessing attempts for audit trail

### Key Entities

- **Document**: Represents an uploaded or synced file with metadata (name, source type, upload timestamp, storage location, external ID for Drive files, current processing status)
- **Processed Document**: Analysis results for a document (summary JSON, extracted topics/decisions/actions, confidence scores, processing timestamp)
- **Document Source**: Origin of the document (manual upload, Google Drive sync, or text input) - determines reprocessing eligibility
- **Processing Status**: Current state of document processing (pending, processing, completed, failed, review_required)

---

## Review & Acceptance Checklist

### Content Quality
- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

### Requirement Completeness
- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

---

## Execution Status

- [x] User description parsed
- [x] Key concepts extracted
- [x] Ambiguities marked
- [x] User scenarios defined
- [x] Requirements generated
- [x] Entities identified
- [x] Review checklist passed

---
