# Feature Specification: Cloud Storage Sync and Direct Text Input

**Feature Branch**: `010-cloud-sync`
**Created**: 2025-10-31
**Status**: Draft
**Input**: User description: "@docs/shape-up-pitches/phase-5-cloud-sync.md"

## Execution Flow (main)
```
1. Parse user description from Input
   → ✅ Complete: Phase 5 pitch document analyzed
2. Extract key concepts from description
   → ✅ Identified: Google Drive sync, text input, OAuth flow, webhooks
3. For each unclear aspect:
   → No [NEEDS CLARIFICATION] - pitch is comprehensive
4. Fill User Scenarios & Testing section
   → ✅ Complete: Drive sync and text input flows defined
5. Generate Functional Requirements
   → ✅ Complete: All requirements testable and measurable
6. Identify Key Entities (if data involved)
   → ✅ Complete: CloudConnection, SyncEvent, VirtualDocument
7. Run Review Checklist
   → ✅ PASS: No implementation details, user-focused
8. Return: SUCCESS (spec ready for planning)
```

---

## ⚡ Quick Guidelines
- ✅ Focus on WHAT users need and WHY
- ❌ Avoid HOW to implement (no tech stack, APIs, code structure)
- 👥 Written for business stakeholders, not developers

---

## User Scenarios & Testing *(mandatory)*

### Primary User Story
**As a user maintaining notes in Google Drive, I want the system to automatically detect and process new or updated documents so that I don't have to manually download and re-upload files every time I make changes.**

**As a user with quick thoughts or copy-pasted content, I want to directly input text without creating a file so that I can capture ideas immediately without file management overhead.**

### Acceptance Scenarios

#### Google Drive Sync Flow
1. **Given** I have meeting notes stored in a Google Drive folder, **When** I connect my Google Drive account and select that folder, **Then** the system automatically processes all existing documents in that folder
2. **Given** my Drive folder is connected, **When** I create a new document in that folder, **Then** the system detects and processes it within 30 seconds without any action from me
3. **Given** my Drive folder is connected, **When** I update an existing document, **Then** the system automatically reprocesses it and updates the extracted insights
4. **Given** I have already uploaded a document manually, **When** the same document appears in my synced Drive folder, **Then** the system recognizes it's a duplicate and skips reprocessing
5. **Given** I am on the cloud settings page, **When** I disconnect my Google Drive, **Then** sync stops and no further Drive changes are processed

#### Direct Text Input Flow
1. **Given** I have markdown or plain text content to process, **When** I click "Quick Capture" and paste the content, **Then** the system processes it immediately without requiring file creation
2. **Given** I am typing in the Quick Capture modal, **When** I accidentally close it, **Then** my draft content is preserved and restored when I reopen the modal
3. **Given** I have processed text input, **When** I view it in the dashboard, **Then** it appears alongside uploaded files with a clear "Text Input" indicator
4. **Given** I paste 150KB of text, **When** I try to process it, **Then** the system rejects it with a clear error message about the 100KB limit

### Edge Cases
- What happens when Google Drive authentication expires? → System attempts token refresh automatically; if refresh fails, notifies user to reconnect
- What happens if Drive webhook fails to deliver? → Webhook retries with exponential backoff; manual "Sync Now" button available as fallback
- What happens if the same file is modified multiple times rapidly? → System queues changes and processes the latest version once; deduplication prevents redundant processing
- What happens if Drive API quota is exceeded? → System logs error, pauses sync, and notifies user with retry schedule
- What happens if text input contains only whitespace? → System validates content before processing and shows error: "Content cannot be empty"
- What happens if user tries to connect multiple Google accounts? → System restricts to one connection per user in Phase 5; shows message: "Disconnect existing account first"

---

## Requirements *(mandatory)*

### Functional Requirements

#### Google Drive Integration
- **FR-001**: System MUST allow users to connect their Google Drive account using OAuth authentication with read-only permissions
- **FR-002**: System MUST allow users to select a specific folder in their Google Drive to monitor for documents
- **FR-003**: System MUST automatically detect new files added to the monitored folder within 30 seconds
- **FR-004**: System MUST automatically detect when existing files in the monitored folder are updated
- **FR-005**: System MUST download and process files from Google Drive using the same processing pipeline as manual uploads
- **FR-006**: System MUST support PDF, DOCX, and TXT file formats from Google Drive (same as manual upload)
- **FR-007**: System MUST deduplicate files by content hash to prevent processing the same document twice
- **FR-008**: System MUST allow users to disconnect their Google Drive account and stop sync
- **FR-009**: System MUST automatically refresh expired OAuth tokens without user intervention
- **FR-010**: System MUST notify users when OAuth tokens cannot be refreshed and re-authentication is required
- **FR-011**: System MUST display sync status for each connected cloud provider (connected, syncing, error)
- **FR-012**: System MUST log all sync events (file added, modified, deleted, errors) for audit purposes
- **FR-035**: System MUST enforce one Google Drive connection per user through:
  - Database UNIQUE constraint on (user_id, provider) in cloud_connections table
  - Backend validation returning 409 Conflict if connection already exists
  - UI prevention: disable "Connect" button and show "Disconnect existing account first" message

#### Direct Text Input
- **FR-013**: System MUST provide a "Quick Capture" interface for users to input text directly
- **FR-014**: System MUST accept markdown and plain text content in the Quick Capture interface
- **FR-015**: System MUST process text input immediately without requiring file storage
- **FR-016**: System MUST enforce a 100KB maximum size limit for text input
- **FR-017**: System MUST validate that text input is not empty before processing
- **FR-018**: System MUST preserve draft text in the browser if user closes the Quick Capture modal
- **FR-019**: System MUST allow users to provide an optional title for text input documents
- **FR-020**: System MUST display text input documents in the dashboard alongside uploaded files
- **FR-021**: System MUST clearly differentiate text input documents from file uploads (visual indicator)
- **FR-022**: System MUST show character count in real-time as user types in Quick Capture

#### Data Management
- **FR-023**: System MUST store the source of each document (manual upload, Google Drive, or text input)
- **FR-024**: System MUST store Google Drive file IDs for synced documents to track updates
- **FR-025**: System MUST store sync event history for troubleshooting and analytics
- **FR-026**: System MUST encrypt OAuth access tokens and refresh tokens at rest
- **FR-027**: System MUST maintain webhook registration state to detect when re-registration is needed

#### Performance Requirements
- **FR-028**: System MUST acknowledge Drive webhook notifications within:
  - p50 (median): <100ms
  - p95: <200ms
  - p99: <500ms
  - Acceptable timeout rate: <0.1% of all webhook requests
  - Measured: HTTP response time from webhook POST to 200 OK
- **FR-029**: System MUST complete text input processing (from API request to status='completed') within:
  - p50 (median): <3 seconds
  - p95: <5 seconds
  - p99: <8 seconds
  - Measured: Time from POST /api/text-input to uploaded_files.status='completed'
  - No file I/O overhead (content processed in-memory)
- **FR-030**: System MUST download files from Google Drive within:
  - p50 (median): <2 seconds for files up to 10MB
  - p95: <3 seconds for files up to 10MB
  - p99: <5 seconds for files up to 10MB (network latency tolerance)
  - Measured: Time from Drive API request to file buffer in memory

#### Security Requirements
- **FR-031**: System MUST request only read-only permissions from Google Drive (no write access)
- **FR-032**: System MUST validate webhook authenticity using token verification
- **FR-033**: System MUST encrypt OAuth tokens before storing in database
- **FR-034**: System MUST use HTTPS for all webhook endpoints

### Key Entities

- **CloudConnection**: Represents an authenticated connection to a cloud storage provider (Google Drive in Phase 5). Tracks OAuth tokens, folder selection, webhook registration, and connection status. One connection per user.

- **SyncEvent**: Audit log entry for each sync operation. Records event type (file added/modified/deleted/error), external file ID, processing status, error messages, and timestamp. Used for troubleshooting and analytics.

- **VirtualDocument**: Document created from direct text input without an underlying file. Has all attributes of uploaded documents (content, embeddings, summaries) but marked with source="text_input" and no storage bucket reference.

---

## Review & Acceptance Checklist
*GATE: Automated checks run during main() execution*

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
*Updated by main() during processing*

- [x] User description parsed
- [x] Key concepts extracted
- [x] Ambiguities marked
- [x] User scenarios defined
- [x] Requirements generated
- [x] Entities identified
- [x] Review checklist passed

---
