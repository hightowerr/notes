# Implementation Plan: Cloud Storage Sync and Direct Text Input

**Branch**: `010-cloud-sync` | **Date**: 2025-10-31 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/home/yunix/learning-agentic/ideas/Note-synth/notes/specs/010-cloud-sync/spec.md`

## Execution Flow (/plan command scope)
```
1. Load feature spec from Input path
   → ✅ Loaded from specs/010-cloud-sync/spec.md
2. Fill Technical Context (scan for NEEDS CLARIFICATION)
   → ✅ No NEEDS CLARIFICATION in spec
   → ✅ Project Type: Web application (Next.js App Router)
   → ✅ Structure Decision: Next.js monorepo structure
3. Fill the Constitution Check section
   → ✅ All principles evaluated
4. Evaluate Constitution Check section below
   → ✅ PASS - All principles compliant
   → ✅ Update Progress Tracking: Initial Constitution Check
5. Execute Phase 0 → research.md
   → ✅ Complete
6. Execute Phase 1 → contracts, data-model.md, quickstart.md, CLAUDE.md
   → ✅ Complete
7. Re-evaluate Constitution Check section
   → ✅ PASS - Design maintains compliance
   → ✅ Update Progress Tracking: Post-Design Constitution Check
8. Plan Phase 2 → Describe task generation approach (DO NOT create tasks.md)
   → ✅ Complete
9. STOP - Ready for /tasks command
```

**IMPORTANT**: The /plan command STOPS at step 9. Phases 2-4 are executed by other commands:
- Phase 2: /tasks command creates tasks.md
- Phase 3-4: Implementation execution (manual or via tools)

## Summary

**Primary Requirement**: Enable seamless cloud storage integration and quick text input to eliminate manual file upload friction.

**Feature Goals**:
1. **Google Drive Sync**: Users can connect their Google Drive account and automatically sync documents from a monitored folder without manual download/upload cycles
2. **Direct Text Input**: Users can paste markdown/text content directly for immediate processing without creating files

**Technical Approach**:
- OAuth 2.0 integration with Google Drive API (read-only scope)
- Webhook-based change notifications (<30s latency) for automatic sync
- Virtual document records for text input bypassing file storage
- Reuse existing processing pipeline for both Drive files and text input
- Encryption at rest for OAuth tokens using crypto-js

**User Value**: Transforms manual "write → download → upload → process" workflow into autonomous "write → auto-sync → process" flow, reinforcing the Autonomous by Default constitutional principle.

## Technical Context

**Language/Version**: TypeScript 5.x (Next.js 15, React 19)
**Primary Dependencies**:
- `googleapis` (Google Drive API v3 client)
- `crypto-js` (OAuth token encryption)
- Existing: `openai`, `@supabase/supabase-js`, `zod`, `ai`

**Storage**: Supabase PostgreSQL with new tables:
- `cloud_connections` (OAuth tokens, webhook state)
- `sync_events` (audit log for sync operations)
- Extensions to `uploaded_files` (source field, external_id, sync_enabled)

**Testing**: Vitest for unit/integration tests, contract tests for webhook endpoints, manual testing guide for OAuth flow

**Target Platform**: Next.js App Router deployed to Vercel, webhook endpoint requires publicly accessible HTTPS domain

**Project Type**: Web application (Next.js full-stack)

**Performance Goals**:
- Webhook response: <200ms acknowledgment
- Drive file download: <3s for 10MB files
- Text input processing: <5s (no file I/O overhead)
- End-to-end sync latency: <30s from Drive change to processing complete

**Constraints**:
- Google Drive API quota: 1000 queries/100 seconds/user
- Webhook TTL: Renewed every 24 hours (webhook channels expire)
- Single Drive connection per user (Phase 5 limitation)
- Read-only Drive access (no two-way sync)
- Text input: 100KB maximum size

**Scale/Scope**:
- Target: 100s of users initially (P0 MVP)
- Expected load: ~10-50 sync events/day/user
- Webhook handling: Must scale to 100 concurrent notifications
- Database: ~1000 cloud connections, ~10K sync events/month

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with AI Note Synthesiser Constitution v1.1.6:

- [x] **Autonomous by Default**: Feature operates without manual triggers (Sense → Reason → Act)
  - ✅ COMPLIANT: Drive webhooks automatically detect changes (Sense), download files (Reason), trigger processing pipeline (Act). Text input immediately processes on submit. No manual "sync now" required except as fallback.

- [x] **Deterministic Outputs**: JSON schemas documented and validated with retry logic
  - ✅ COMPLIANT: Reuses existing Zod schemas for document summaries. New schemas for CloudConnection, SyncEvent. Webhook payloads validated against Google Drive API spec.

- [x] **Modular Architecture**: Components decoupled with clear interfaces, no tight coupling
  - ✅ COMPLIANT: New services (`googleDriveService.ts`, `textInputService.ts`) integrate via existing `processingQueue.ts` and `embeddingService.ts`. Drive sync failures don't block manual uploads. Webhook handler isolated.

- [x] **Test-First Development**: TDD plan established (tests before implementation)
  - ✅ COMPLIANT: Contract tests for webhook endpoints, integration tests for OAuth flow and text input, manual testing guide for full Drive sync flow (due to OAuth complexity in test environment).

- [x] **Observable by Design**: Structured logging with metrics, errors, and confidence scores
  - ✅ COMPLIANT: `sync_events` table logs all Drive operations. Webhook responses include timing metrics. Token refresh attempts logged. Text input processing reuses existing telemetry.

- [x] **Vertical Slice Architecture**: Tasks deliver complete user value (SEE + DO + VERIFY), no backend-only or frontend-only work
  - ✅ COMPLIANT: Each task delivers end-to-end user journeys (e.g., "Connect Drive + select folder + see first sync"). No isolated backend tasks like "Create cloud_connections table" - always paired with UI.

**Initial Constitution Check**: ✅ PASS

## Project Structure

### Documentation (this feature)
```
specs/010-cloud-sync/
├── plan.md              # This file (/plan command output)
├── research.md          # Phase 0 output (/plan command)
├── data-model.md        # Phase 1 output (/plan command)
├── quickstart.md        # Phase 1 output (/plan command)
├── contracts/           # Phase 1 output (/plan command)
│   ├── POST_cloud_google-drive_connect.json
│   ├── GET_cloud_google-drive_callback.json
│   ├── POST_webhooks_google-drive.json
│   ├── POST_text-input.json
│   └── GET_cloud_connections.json
└── tasks.md             # Phase 2 output (/tasks command - NOT created by /plan)
```

### Source Code (repository root)
```
app/
├── api/
│   ├── cloud/
│   │   └── google-drive/
│   │       ├── connect/route.ts        # OAuth initiation
│   │       ├── callback/route.ts       # OAuth callback handler
│   │       └── disconnect/route.ts     # Disconnect Drive
│   ├── webhooks/
│   │   └── google-drive/route.ts       # Webhook receiver
│   ├── text-input/route.ts             # Text processing endpoint
│   └── cloud-connections/route.ts      # List connections
├── components/
│   ├── CloudSyncButton.tsx             # Connect Drive UI
│   ├── TextInputModal.tsx              # Quick Capture modal
│   └── ConnectionStatus.tsx            # Drive connection indicator
├── settings/
│   └── cloud/page.tsx                  # Cloud settings page
└── layout.tsx                          # Add "Quick Capture" nav button

lib/
├── services/
│   ├── googleDriveService.ts           # Drive API wrapper
│   ├── textInputService.ts             # Text processing service
│   ├── tokenEncryption.ts              # OAuth token encrypt/decrypt
│   └── webhookVerification.ts          # Webhook signature validation
└── schemas/
    ├── cloudConnectionSchema.ts        # CloudConnection Zod schema
    └── syncEventSchema.ts              # SyncEvent Zod schema

supabase/
└── migrations/
    ├── 015_add_source_to_uploaded_files.sql
    ├── 016_create_cloud_connections.sql
    └── 017_create_sync_events.sql

__tests__/
├── contract/
│   ├── google-drive-webhook.test.ts    # Webhook contract
│   └── text-input.test.ts              # Text input contract
└── integration/
    ├── google-drive-oauth.test.ts      # OAuth flow
    └── text-input-flow.test.ts         # End-to-end text input
```

**Structure Decision**: Next.js App Router monorepo structure with API routes under `app/api/`, React components under `app/components/`, and shared services under `lib/services/`. This matches the existing project structure (verified in CLAUDE.md). New feature introduces cloud-specific API routes nested under `app/api/cloud/` and `app/api/webhooks/`.

## Phase 0: Outline & Research

### Research Areas

Since the Technical Context has no NEEDS CLARIFICATION markers, research focuses on best practices and integration patterns for the chosen technologies.

### Research Tasks

1. **Google Drive API Webhook Patterns**
   - Decision: Use Google Drive Push Notifications (webhooks) over polling
   - Rationale: Drive webhooks provide <30s latency vs. polling (60s+ intervals). Webhooks scale better (no quota consumption for idle monitoring).
   - Alternatives considered: Polling (rejected: quota waste), Google Drive Activity API (rejected: requires separate polling, no push notifications)

2. **OAuth Token Security**
   - Decision: Encrypt tokens at rest using AES-256 via `crypto-js`, store encryption key in environment variable
   - Rationale: OAuth refresh tokens are long-lived (no expiry). Encryption prevents exposure if database is compromised. Industry standard approach.
   - Alternatives considered: Database-level encryption (rejected: Supabase free tier limitation), Token hashing (rejected: need decryption for API calls)

3. **Webhook Channel Management**
   - Decision: Store webhook channel ID in `cloud_connections.webhook_id`, implement daily renewal cron job
   - Rationale: Google Drive webhook channels expire after 24 hours. Renewal prevents sync breakage. Channel ID required for renewal API call.
   - Alternatives considered: No renewal (rejected: sync breaks after 24h), On-demand renewal (rejected: can't detect expiry until failure)

4. **Text Input Storage Strategy**
   - Decision: Create "virtual" `uploaded_files` records with `source='text_input'`, skip Supabase Storage, store markdown in `processed_documents.markdown_content`
   - Rationale: Reuses existing pipeline. No storage bucket overhead. Deduplication via content hash still works.
   - Alternatives considered: Separate `text_inputs` table (rejected: duplicates schema), Temporary file creation (rejected: unnecessary I/O)

5. **Drive File Deduplication**
   - Decision: Hash file content using SHA-256, query `uploaded_files.content_hash` before processing
   - Rationale: User may manually upload file before enabling Drive sync. Prevents duplicate processing. Same hash algorithm as existing uploads.
   - Alternatives considered: Drive file ID tracking (rejected: doesn't catch manual uploads), Filename matching (rejected: false negatives if renamed)

6. **LocalStorage Draft Recovery**
   - Decision: Auto-save text input draft to `localStorage` every 500ms debounced, restore on modal open
   - Rationale: Prevents data loss from accidental browser close. Native browser API, no backend storage needed. 500ms debounce reduces writes.
   - Alternatives considered: Server-side drafts (rejected: adds complexity, requires auth), No recovery (rejected: poor UX)

**Output**: research.md created (see separate file)

## Phase 1: Design & Contracts

### Data Model

**See `data-model.md` for complete entity definitions, field types, and relationships.**

Key entities:
- **CloudConnection**: OAuth tokens, provider type, folder selection, webhook state
- **SyncEvent**: Audit log for sync operations (file added/modified/error)
- **VirtualDocument**: Text input documents (extends uploaded_files with source='text_input')

### API Contracts

**See `contracts/` directory for OpenAPI 3.0 schemas.**

Endpoints:
1. `POST /api/cloud/google-drive/connect` - Initiate OAuth flow
2. `GET /api/cloud/google-drive/callback` - OAuth callback
3. `POST /api/webhooks/google-drive` - Receive Drive notifications
4. `POST /api/text-input` - Process text content
5. `GET /api/cloud-connections` - List active connections

### Contract Tests

Tests generated for each endpoint (see `__tests__/contract/`):
- Webhook signature validation
- Request/response schema validation
- Error code compliance (400, 403, 500)
- Tests MUST fail until implementation exists

### Quickstart Scenarios

**See `quickstart.md` for step-by-step test procedures.**

Scenarios:
1. Connect Google Drive and sync existing files
2. Detect new file added to Drive
3. Process text input via Quick Capture
4. Handle OAuth token expiration
5. Disconnect Drive and stop sync

## Phase 2: Task Planning Approach
*This section describes what the /tasks command will do - DO NOT execute during /plan*

**Task Generation Strategy**:
- Load `.specify/templates/tasks-template.md` as base
- Generate **vertical slice tasks** from Phase 1 design docs
- Each user journey becomes ONE complete slice (UI + API + Data + Feedback)
- Contract tests → test task BEFORE implementation task
- Integration tests → test scenario validation

**Slice Breakdown**:
1. **Google Drive OAuth Connection** (T001-T003)
   - T001: User connects Drive account and sees connection confirmation
   - T002: User selects folder to monitor and sees sync start
   - T003: User disconnects Drive and sync stops

2. **Drive Webhook Sync** (T004-T006)
   - T004: New file added to Drive appears in dashboard automatically
   - T005: Updated file in Drive triggers reprocessing
   - T006: Duplicate file (already uploaded) skips processing

3. **Direct Text Input** (T007-T009)
   - T007: User pastes text in Quick Capture and sees processing start
   - T008: Draft auto-saves and restores on modal reopen
   - T009: Text input document appears in dashboard with indicator

4. **Error Handling & Recovery** (T010-T012)
   - T010: Token expiration triggers refresh and user sees connection maintained
   - T011: Webhook delivery failure retries and logs error
   - T012: Text input validation errors display clear messages

**Ordering Strategy**:
- TDD order: Contract test → Integration test → Implementation
- Dependency order: OAuth before webhooks, text input independent (can run in parallel)
- Mark [P] for parallel: Text input tasks can run alongside Drive tasks

**Estimated Output**: 12-15 numbered, ordered vertical slice tasks in tasks.md

**IMPORTANT**: This phase is executed by the /tasks command, NOT by /plan

## Phase 3+: Future Implementation
*These phases are beyond the scope of the /plan command*

**Phase 3**: Task execution (/tasks command creates tasks.md)
**Phase 4**: Implementation (execute tasks.md following constitutional principles)
**Phase 5**: Validation (run tests, execute quickstart.md, performance validation)

## Complexity Tracking
*Fill ONLY if Constitution Check has violations that must be justified*

**No violations detected.** All constitutional principles are fully compliant in this design.

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
- [x] Initial Constitution Check: PASS
- [x] Post-Design Constitution Check: PASS
- [x] All NEEDS CLARIFICATION resolved
- [x] Complexity deviations documented (N/A - no deviations)

---
*Based on Constitution v1.1.6 - See `.specify/memory/constitution.md`*
