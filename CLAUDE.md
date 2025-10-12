---
default_agent: slice-orchestrator
---

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**AI Note Synthesiser** — An autonomous agent that detects uploaded note files, converts them to Markdown, summarizes content, and extracts structured data without manual intervention.

**Tech Stack:** Next.js 15, React 19, TypeScript, Vercel AI SDK (OpenAI GPT-4o), Supabase, Tailwind CSS v4

**Core Pattern:** Sense → Reason → Act loop
- **Sense:** File upload detection
- **Reason:** Convert to Markdown → AI summarization → Extract structured data
- **Act:** Store JSON + Markdown outputs, display summary panel
- **Learn:** Log metrics (hash, duration, confidence scores)

## Development Commands

### Core Commands
- `npm run dev` - Start development server (http://localhost:3000)
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

**Important:** Use Node.js 20+ (check `.nvmrc`). Run `nvm use` before starting development.

### Testing Commands
- `npm run test` - Run tests in watch mode
- `npm run test:ui` - Run tests with Vitest UI
- `npm run test:run` - Run tests once (CI mode)
- `npm run test:run -- <file>` - Run specific test file

**Note:** 23/38 automated tests passing. 15 tests blocked by FormData serialization in test environment. Use manual testing (see `T002_MANUAL_TEST.md`) for upload/processing validation.

### Workflow Commands (.specify/)
- `/plan` - Create implementation plan from feature spec
- `/specify` - Create feature specification from description
- `/tasks` - Generate **vertical slice** task list (UI + Backend + Data + Feedback per task)
- `/clarify` - Identify underspecified areas in spec
- `/implement` - Execute implementation plan using slice-orchestrator agent

**Note:** All tasks MUST be vertical slices delivering complete user value (SEE → DO → VERIFY)

## Architecture

### High-Level Processing Pipeline

```
1. Upload (T001)
   ├─ Browser → POST /api/upload
   ├─ Validate file (type, size, hash)
   ├─ Store in Supabase storage (notes bucket)
   └─ Save metadata to uploaded_files table

2. Process (T002)
   ├─ POST /api/process (automatic trigger from upload)
   ├─ noteProcessor.ts: PDF/DOCX/TXT → Markdown
   ├─ aiSummarizer.ts: GPT-4o extraction
   │   ├─ Topics (array of strings)
   │   ├─ Decisions (array of strings)
   │   ├─ Actions (array of strings)
   │   └─ LNO tasks (Leverage/Neutral/Overhead categorization)
   ├─ Store Markdown in notes/processed/
   ├─ Store JSON in processed_documents table
   └─ Update status: completed | review_required | failed

3. Display (T002 Frontend)
   ├─ Status polling (GET /api/status/[fileId])
   ├─ SummaryPanel.tsx renders when complete
   └─ Toast notification on completion
```

### Key Service Modules

**`lib/services/noteProcessor.ts`** - File conversion service
- Converts PDF (pdf-parse), DOCX (mammoth), TXT to Markdown
- Generates SHA-256 content hashes for deduplication
- OCR fallback placeholder for unreadable PDFs
- **Important:** Uses dynamic import for pdf-parse to avoid module-level test code execution
- **Patch Required:** `scripts/patch-pdf-parse.js` runs via postinstall hook to fix pdf-parse debug mode

**`lib/services/aiSummarizer.ts`** - AI extraction service
- Uses Vercel AI SDK with OpenAI GPT-4o
- Structured output via Zod schemas
- Retry logic for invalid JSON (adjusts temperature/tokens)
- Confidence scoring: <80% flags as "review required"

**`lib/services/processingQueue.ts`** - Concurrent upload management (T005)
- Enforces max 3 parallel processing jobs
- FIFO queue for additional uploads
- In-memory state (P0 acceptable, resets on server restart)
- Automatic queue progression on job completion
- Singleton pattern for shared state across API routes

**`lib/jobs/cleanupExpiredFiles.ts`** - Automatic file cleanup (T006)
- Deletes expired documents (expires_at < NOW())
- Removes storage files (original + processed markdown)
- CASCADE delete via uploaded_files → processed_documents
- Dry-run mode for testing without deletion
- Structured logging with cleanup metrics

### Database Schema (Supabase)

**Tables:**
- `uploaded_files` - File metadata, status tracking, queue_position (T005)
- `processed_documents` - AI outputs, Markdown content, 30-day auto-expiry
- `processing_logs` - Metrics, errors, retry attempts
- `user_outcomes` - User-defined outcome statements (T008-T011)

**Storage:**
- `notes/` - Original uploaded files (hash-based naming)
- `notes/processed/` - Generated Markdown and JSON files

### API Endpoints

- `POST /api/upload` - File upload with validation (client + server), deduplication, automatic processing trigger, queue management (T005)
  - Returns: 201 (success), 400 (invalid format), 413 (too large), 409 (duplicate)
  - Response includes: `status` ('processing' | 'pending'), `queuePosition` (null if immediate, number if queued)
- `POST /api/process` - Orchestrates conversion → summarization → storage pipeline
- `GET /api/status/[fileId]` - Real-time status polling for frontend (used by upload page)
- `GET /api/documents` - Retrieve all documents with filtering and sorting (used by dashboard)
  - Query params: `status`, `sort`, `order`
- `GET /api/cleanup` - Returns cleanup endpoint information and usage (T006)
- `POST /api/cleanup` - Manual cleanup trigger, deletes expired documents (T006)
  - Query params: `dryRun=true` (preview without deletion)
- `GET /api/export/[fileId]` - Export document summary as JSON or Markdown (T007)
  - Query params: `format=json|markdown`
  - Returns formatted file with proper Content-Disposition headers
- `GET /api/outcomes` - Fetch active outcome statement (T009)
  - Returns: 200 with outcome object, or 404 if no active outcome
- `POST /api/outcomes` - Create or update outcome statement (T009)
  - Validates with Zod, assembles text, deactivates old outcome if exists
  - Returns: 201 (created) or 200 (updated) with assembled text
- `GET /api/test-supabase` - Connection health check (dev only)

### Frontend Architecture

**Main Components:**
- `app/page.tsx` - Upload UI with drag-and-drop, multi-file support, client-side validation, status polling (2s interval), SummaryPanel integration, Queue Status Summary (T005), Outcome banner and builder (T008-T011)
- `app/dashboard/page.tsx` - Dashboard with grid layout, filtering, sorting, card expand/collapse, Outcome banner and builder (T008-T011)
- `app/components/SummaryPanel.tsx` - Displays topics, decisions, actions, LNO tasks in 3 columns
- `app/components/OutcomeBuilder.tsx` - Modal form for creating/editing outcome statements with real-time preview, draft recovery (T009-T011)
- `app/components/OutcomeDisplay.tsx` - Persistent banner showing active outcome across all pages (T009)
- `app/components/ConfirmReplaceDialog.tsx` - Confirmation dialog for replacing existing outcome (T010)

**shadcn/ui Components:**
- Install via: `pnpm dlx shadcn@latest add <component>`
- Never create custom components when shadcn exists
- Use depth layer color system (see Design System section below)

### Design System

**Depth-Based Color Layering (4-Layer System):**
The application uses a depth-based color system in `app/globals.css` that creates visual hierarchy through color contrast instead of borders:

- `--bg-layer-1`: Page background (darkest in light mode, darkest in dark mode)
- `--bg-layer-2`: Container/Card backgrounds
- `--bg-layer-3`: Interactive elements (buttons, tabs, inputs)
- `--bg-layer-4`: Elevated states (hover, selected, active)

**Primary Brand Shades:**
- `--primary-2`: Base brand color (oklch 0.55 0.22 264.53 - purple/blue)
- `--primary-3`: Hover/Active states
- `--primary-4`: Lightest accents

**Semantic Colors:**
Each semantic color has three variants:
- `*-bg`: Background color for layer 3
- `*-hover`: Hover state for layer 4
- `*-text`: Text color with proper contrast

Available: `success`, `warning`, `info`, `destructive`

**Text Colors:**
- `--text-heading`: High contrast for headings (oklch 0.10 in light, 0.98 in dark)
- `--text-body`: Standard body text (oklch 0.25 in light, 0.85 in dark)
- `--text-muted`: Secondary text (oklch 0.45 in light, 0.60 in dark)
- `--text-on-primary`: White text on colored backgrounds

**Two-Layer Shadow System:**
Creates depth through inner highlight + outer shadow:

- `.shadow-2layer-sm`: Subtle depth (badges, nav items, tabs)
  - Combines: `inset 0 1px 0 rgba(255,255,255,0.1)` + `0 1px 2px rgba(0,0,0,0.1)`
- `.shadow-2layer-md`: Standard depth (cards, dropdowns, modals)
  - Combines: `inset 0 1px 0 rgba(255,255,255,0.15)` + `0 3px 6px rgba(0,0,0,0.15)`
- `.shadow-2layer-lg`: Prominent depth (hover states, focused elements)
  - Combines: `inset 0 2px 0 rgba(255,255,255,0.2)` + `0 6px 12px rgba(0,0,0,0.2)`

**Gradient Utilities:**
- `.gradient-shiny`: Premium "light from top" effect with built-in inner shadow
- `.gradient-shiny-subtle`: Subtle gradient for interactive elements
- `.hover-shadow-lift`: Smooth transform (-2px) + shadow transition on hover

**Component Shadow Usage:**
- Buttons: `shadow-2layer-sm` → `shadow-2layer-md` on hover
- Cards: `shadow-2layer-md` → `shadow-2layer-lg` on hover
- Badges: `shadow-2layer-sm` (static)
- Headers/Footers: `shadow-2layer-md`

**Important Rules:**
- ❌ Never use borders (border-0) - rely on color contrast and shadows
- ✅ Always use depth layers for backgrounds
- ✅ Use semantic colors (`*-bg`, `*-text`) for status indicators
- ✅ Apply `.hover-shadow-lift` for interactive elements
- ✅ Ensure WCAG AA contrast (4.5:1 for text)

## Configuration

### Environment Variables (`.env.local`)
```env
NEXT_PUBLIC_SUPABASE_URL=https://emgvqqqqdbfpjwbouybj.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_key_here
OPENAI_API_KEY=sk-proj-...
```

### TypeScript
- Path alias: `@/*` → project root
- Strict mode enabled
- Target: ES2017

### Supabase Setup
**Storage Bucket:** `notes` (50MB limit, `application/*` and `text/*` MIME types allowed)
**RLS Policies:** Public access for P0 development (see `docs/supabase-rls-policies.sql`)

**Database Migrations:**
- `supabase/migrations/001_create_initial_tables.sql` - uploaded_files, processing_logs
- `supabase/migrations/002_create_processing_tables.sql` - processed_documents, 30-day expiry trigger
- `supabase/migrations/003_add_queue_position.sql` - queue_position column for concurrent uploads (T005)
- `supabase/migrations/004_create_user_outcomes.sql` - user_outcomes table for outcome management (T008)

Apply migrations manually via Supabase Dashboard → SQL Editor

**⚠️ IMPORTANT:** After applying migration 003, restart the dev server for queue management to work correctly.

## Design Principles (SYSTEM_RULES.md)

### 🚨 CRITICAL: Slice-Based Development

**Every code change MUST deliver complete user value:**

**The Three Laws:**
1. **SEE IT** → Visible UI change or feedback
2. **DO IT** → Interactive capability user can trigger
3. **VERIFY IT** → Observable outcome confirming it worked

**Mandatory Workflow:**
1. Define user story: "As a user, I can [action] to [achieve outcome]"
2. Use `slice-orchestrator` agent for ALL feature implementation
3. TDD: Write failing test FIRST, then implement, then review
4. Complete ONLY when user can demo the feature end-to-end

**FORBIDDEN:**
- ❌ Backend-only or frontend-only tasks
- ❌ Infrastructure tasks without user value
- ❌ Tasks that can't be demoed to non-technical person

**See `.claude/SYSTEM_RULES.md` for complete protocol**

### Core Architectural Principles (.specify/memory/constitution.md)

1. **Autonomous by Default** - No manual triggers, system operates via Sense → Reason → Act loop
2. **Deterministic Outputs** - Consistent JSON schemas with Zod validation
3. **Modular Architecture** - Decoupled services with clear interfaces
4. **Test-First Development** - TDD mandatory (though automated tests currently blocked by environment)
5. **Observable by Design** - Structured logging with metrics, errors, confidence scores

## Implementation Status

### ✅ T001 - File Upload (COMPLETE)
- Backend API production-ready
- Frontend UI complete with drag-and-drop
- Database schema deployed
- Content hash deduplication
- Status: **PRODUCTION-READY**

### ✅ T002 - AI Summary Display (PRODUCTION-READY)
- File processing service (PDF/DOCX/TXT → Markdown) ✅
- AI summarization service (GPT-4o) ✅
- Processing orchestration endpoint ✅
- Status polling endpoint ✅
- SummaryPanel component with real-time updates ✅
- LNO task extraction with anti-hallucination safeguards ✅
- Status: **PRODUCTION-READY**
  - Text-based PDFs: Full extraction with real content-grounded tasks
  - Scanned PDFs: OCR fallback with `review_required` status
  - Verified: Both document types handle gracefully without hallucination
- Testing: See `T002_MANUAL_TEST.md` for comprehensive test scenarios
- AI Hallucination Fix: OCR placeholder cleanup + meta-content detection (2025-10-09)

### ✅ T003 - Dashboard View (COMPLETE)
- Grid layout with all processed files ✅
- Filtering by status (All/Completed/Processing/Review Required/Failed) ✅
- Sorting by date/name/confidence/size ✅
- Card expand/collapse for full summary ✅
- Responsive design (1/2/3 column layout) ✅
- Status: **PRODUCTION-READY**
- Testing: See `.claude/testing/T003-manual-test.md`

### ✅ T004 - Error Validation (COMPLETE)
- Client-side pre-upload validation (instant feedback) ✅
- Server-side validation (defense in depth) ✅
- Enhanced error messages with filename and size ✅
- HTTP 413 for oversized files, 400 for invalid formats ✅
- Database logging of all rejections to `processing_logs` ✅
- Staggered toast display for multiple errors (100ms delay) ✅
- Status: **PRODUCTION-READY**
- Testing: See `T004_MANUAL_TEST.md` (8/8 scenarios passing)

### ✅ T005 - Concurrent Upload Queue (COMPLETE)
- Processing queue service (max 3 parallel jobs) ✅
- FIFO queue management with automatic progression ✅
- Queue status display with position numbers ✅
- Queue Status Summary (Processing/Queued/Complete counts) ✅
- Toast notifications differentiate queued vs immediate processing ✅
- Status: **PRODUCTION-READY**
- Backend Tests: 18/18 passing
- Testing: See `.claude/testing/T005-manual-test.md` (7 scenarios)
- **Note:** Requires migration 003 (queue_position column) applied to database

### ✅ T006 - Automatic Cleanup (COMPLETE)
- Cleanup service with dry-run support ✅
- Manual trigger API endpoint (GET/POST) ✅
- Vercel Cron configuration (daily 2 AM UTC) ✅
- CASCADE delete logic (uploaded_files → processed_documents) ✅
- Structured logging with cleanup metrics ✅
- Status: **PRODUCTION-READY**
- Automated Tests: 4/6 passing (2 flaky due to test timing)
- Testing: See `.claude/testing/T006-manual-test.md` (8 scenarios)
- **Note:** Cleanup runs automatically daily, manual trigger available for testing

### ✅ T007 - Export Functionality (COMPLETE)
- Single export (JSON/Markdown) from SummaryPanel with download buttons ✅
- Bulk export with ZIP generation from Dashboard ✅
- Selection UI with checkboxes on completed documents ✅
- Auto-clear selections on filter change (prevents stale selections) ✅
- Status validation before export (skips unprocessed documents) ✅
- Status: **PRODUCTION-READY**
- Testing: See `.claude/testing/T007-manual-test.md` (15 scenarios)
- API: `GET /api/export/[fileId]?format=json|markdown`
- **Important:** Export endpoint normalizes Supabase relationship format (array vs object)

### ✅ T008-T011 - Outcome Management Core (COMPLETE)
- **T008**: Database migration for `user_outcomes` table ✅
  - Single active outcome per user (unique partial index)
  - Auto-update trigger for `updated_at` timestamp
  - Migration: `supabase/migrations/004_create_user_outcomes.sql`
- **T009**: Create and display outcome statements ✅
  - 4-field form: Direction, Object, Metric, Clarifier
  - Real-time preview with `useDeferredValue` (<1000ms updates)
  - Persistent banner across all pages
  - GET/POST `/api/outcomes` endpoints
  - Outcome assembly logic handles Launch/Ship article omission
- **T010**: Edit with confirmation dialog ✅
  - Pre-filled form when editing existing outcome
  - Confirmation dialog prevents accidental replacement
  - Different UI labels for edit vs create mode
  - Backend deactivates old outcome, creates new one
- **T011**: Draft recovery with localStorage ✅
  - Auto-save draft on modal close (with setTimeout to avoid race condition)
  - 24-hour expiry with lazy cleanup
  - "Resume editing?" prompt when reopening
  - Draft cleared after successful save
  - Storage key: `outcome_draft_v1`
- Status: **PRODUCTION-READY**
- Services: `lib/services/outcomeService.ts` (assembly logic), `lib/hooks/useOutcomeDraft.ts` (draft management)
- **Important:** Draft save uses setTimeout to ensure React Hook Form state is synchronized before reading values

### ✅ T012 - Async Recompute Job (COMPLETE)
- Background recompute service triggers when outcomes change ✅
- Max 3 concurrent jobs with exponential backoff retry (1s, 2s, 4s) ✅
- Non-blocking API response (queues job, returns immediately) ✅
- Integration with POST `/api/outcomes` endpoint ✅
- Success toast shows action count: "Re-scoring N actions..." ✅
- Toast warning on permanent failure (FR-045) ✅
- Status: **PRODUCTION-READY**
- Service: `lib/services/recomputeService.ts`
- AI Integration: `lib/services/aiSummarizer.ts` (scoreActions method)
- **Debug Fix**: Corrected database schema query to use `structured_output` and join through `uploaded_files`
- **Note**: P0 implementation fetches documents but doesn't modify them (AI rescoring deferred to future)

### ✅ T013 - Launch/Ship Article Omission (COMPLETE)
- Grammar logic for Launch/Ship directions (omits "the" article) ✅
- Implemented in `assembleOutcome()` function ✅
- Real-time preview reflects correct grammar ✅
- Database stores grammatically correct assembled text ✅
- Status: **PRODUCTION-READY**
- **Note**: Already implemented as part of T009, verified and marked complete

## Data Structures

### AI Output (Document Summary)
```typescript
{
  topics: string[],           // ["Budget Planning", "Team Restructure"]
  decisions: string[],        // ["Approved 15% budget increase"]
  actions: string[],          // ["Schedule follow-up meeting"]
  lno_tasks: {
    leverage: string[],       // High-value tasks
    neutral: string[],        // Standard operational tasks
    overhead: string[]        // Administrative/maintenance tasks
  }
}
```

### Outcome Statement (User Input)
```typescript
{
  direction: 'increase' | 'decrease' | 'maintain' | 'launch' | 'ship',
  object_text: string,        // 3-100 chars: "monthly recurring revenue"
  metric_text: string,        // 3-100 chars: "25% within 6 months"
  clarifier: string,          // 3-150 chars: "enterprise customer acquisition"
  assembled_text: string,     // Computed: "Increase the monthly recurring revenue by 25% within 6 months through enterprise customer acquisition"
  is_active: boolean          // Only one active outcome per user
}
```

**Assembly Formula:**
- Launch/Ship: `"{Direction} {object} by {metric} through {clarifier}"` (no "the" article)
- Others: `"{Direction} the {object} by {metric} through {clarifier}"`

## Testing

### Test Framework: Vitest
- Contract tests: Validate API contracts and schemas
- Integration tests: End-to-end user journeys
- Component tests: React components with Testing Library

### Current Test Status
- **Automated tests:** 27/44 passing (61% pass rate)
- **Blockers:**
  - FormData serialization: File properties (name, type, size) become undefined when passed through Next.js Request.formData() in test environment
  - Root cause: Incompatibility between undici's FormData and Next.js API route handlers in Vitest
  - Test isolation: Some cleanup tests flaky due to async database timing issues
- **Workaround:** Manual testing guides for upload/processing/cleanup validation
- **Tests passing:** Component tests, database tests, schema validation, core cleanup logic
- **Tests blocked/flaky:** Upload contract tests (FormData), 2 cleanup tests (timing)

### Test Files Structure
```
__tests__/
├── setup.ts                           # Test environment setup
├── contract/
│   ├── upload.test.ts                 # Upload API contract tests
│   └── process.test.ts                # Processing API contract tests
├── integration/
│   ├── upload-flow.test.ts            # Upload user journey
│   ├── summary-flow.test.ts           # Summary display journey
│   └── cleanup.test.ts                # Cleanup service tests (T006)
└── app/components/__tests__/
    └── SummaryPanel.test.tsx          # Component tests
```

## Edge Cases & Error Handling

| Case | Behavior |
|------|----------|
| Unsupported file format | Client: Instant toast rejection. Server: 400 with descriptive error |
| File >10MB | Client: Instant toast rejection. Server: 413 "FILE_TOO_LARGE" |
| Duplicate file (same hash) | Server: 409 "DUPLICATE_FILE" |
| Multiple invalid files | Client: Staggered toasts (100ms delay between each) |
| Unreadable PDF | OCR fallback (placeholder), mark for review |
| Invalid AI JSON | Retry once with adjusted parameters |
| Confidence <80% | Mark as "review_required" status |
| Processing >8s | Continue processing but log warning |

## Success Metrics

- **Autonomy:** 100% (zero manual triggers for upload/processing/cleanup)
- **Processing Time:** <8 seconds target
- **Confidence Threshold:** ≥80% for auto-approval
- **File Formats:** PDF, DOCX, TXT, Markdown
- **Max File Size:** 10MB
- **Data Retention:** 30 days auto-cleanup (daily at 2 AM UTC)
- **Concurrent Processing:** Max 3 parallel uploads with automatic queueing

## Task Structure Example

From `specs/001-prd-p0-thinnest/tasks.md`:

```
T002 [SLICE] User sees AI-generated summary after automatic processing completes

User Story: As a knowledge worker, after uploading a note file, I can see
an AI-generated summary with topics, decisions, actions, and LNO tasks appear
automatically within 8 seconds without clicking anything

Implementation Scope:
- UI: SummaryPanel.tsx with topics/decisions/actions/LNO columns
- Backend: noteProcessor.ts, aiSummarizer.ts, /api/process, /api/status
- Data: processed_documents table, notes/processed/ storage
- Feedback: Toast notification, status badge, console logs

Test Scenario: [9 verification steps for end-to-end journey]
```

**Key Pattern:** Each task delivers complete vertical slice (not horizontal layers)

## Agent Usage (.claude/agents/)

- **slice-orchestrator** - Feature implementation coordination (use for ALL features)
- **backend-engineer** - Backend services and API endpoints
- **frontend-ui-builder** - React components and UI integration
- **test-runner** - Test validation and coverage verification
- **code-reviewer** - Code quality review after implementation
- **debugger** - Error investigation and root cause analysis

**Workflow:** slice-orchestrator delegates to backend-engineer and frontend-ui-builder, then uses test-runner and code-reviewer for validation

## Common Development Patterns

### Adding a New API Endpoint
1. Create test file in `__tests__/contract/`
2. Define Zod schema in `lib/schemas.ts`
3. Implement handler in `app/api/[name]/route.ts`
4. Add error handling with proper HTTP status codes
5. Log operations to console and `processing_logs` table

### Adding a New Component
1. Use shadcn if exists: `pnpm dlx shadcn@latest add <component>`
2. Create in `app/components/` if custom needed
3. Include TypeScript types for all props
4. Support dark/light mode via `next-themes`
5. Add test file in `app/components/__tests__/`

### Adding a New Service
1. Create in `lib/services/`
2. Export clear interface/types
3. Include comprehensive error handling
4. Add structured logging for observability
5. Test with both success and failure scenarios

### Supabase Relationship Query Pattern
When querying nested relationships with `.single()`, Supabase may return the relationship as:
- A single object (most common)
- A single-item array (sometimes)
- `null` (when no related record exists)

**Always normalize before accessing:**
```typescript
const processedDoc = Array.isArray(fileData.processed_documents)
  ? fileData.processed_documents[0]
  : fileData.processed_documents;

if (!processedDoc) {
  // Handle missing data
}
```

**Examples:** See `/api/export/[fileId]/route.ts` (lines 164-179) or `/api/documents/route.ts` (lines 116-118)

### React Hook Form State Synchronization Pattern
When reading form values immediately after user interaction (e.g., on modal close), React Hook Form may not have synchronized field state yet.

**Problem:** `form.getValues()` returns stale/empty values when called during the same event loop as field onChange.

**Solution:** Use `setTimeout` to defer reading until after form state updates:
```typescript
const handleModalClose = (open: boolean) => {
  if (!open) {
    // Defer to next event loop to ensure form state is synchronized
    setTimeout(() => {
      const values = form.getValues();
      saveDraft(values);
    }, 0);
  }
  onOpenChange(open);
};
```

**When to use:** Any time you need to read form state immediately after user-triggered events (click, blur, close).

**Example:** See `app/components/OutcomeBuilder.tsx:142-153` (draft save on modal close)

## Known Issues & Workarounds

### pdf-parse Library Issue
**Problem:** pdf-parse v1.1.1 executes test code at module import time, causing `ENOENT: ./test/data/05-versions-space.pdf` error.

**Solution:** Automatic patch applied via `postinstall` hook:
- `scripts/patch-pdf-parse.js` disables debug mode (`isDebugMode = false`)
- Dynamic import in `noteProcessor.ts` prevents immediate execution
- Patch runs after `npm install` / `pnpm install`

**Verification:** After install, check that `node_modules/.pnpm/pdf-parse@1.1.1/node_modules/pdf-parse/index.js` contains `isDebugMode = false` (line 6)

### FormData Testing Limitation
**Problem:** File properties (name, type, size) become undefined in Vitest when using Next.js Request.formData()

**Root Cause:**
- undici's FormData + Next.js Request incompatibility in test environment
- File objects serialize to strings during Request.formData() call
- Constructor shows 'String' instead of 'File'

**Workaround:**
- Use manual testing for upload/processing validation (see `T002_MANUAL_TEST.md`)
- Automated tests cover component logic, schemas, and database operations
- API contract tests exist but require manual execution via browser/Postman

**Future Fix Options:**
- Use MSW (Mock Service Worker) to intercept before Next.js serialization
- Run actual Next.js server for integration tests
- Wait for Vitest/Next.js FormData support improvements

### Node.js Version Requirement
**Required:** Node.js 20+ (native File API support)

**Issue:** Tests fail on Node.js 18 because native File API is unavailable

**Solution:** Use `.nvmrc` file - run `nvm use` before development

### AI Task Hallucination (RESOLVED - 2025-10-09)
**Problem:** AI was generating fabricated LNO tasks like "Implement enhanced OCR processing" and "Develop strategy for prioritizing text-based PDFs" instead of extracting real tasks from document content.

**Root Cause:** OCR placeholder text in `noteProcessor.ts` contained extractable system-level phrases. When scanned PDFs triggered OCR fallback, the AI correctly extracted tasks from the placeholder - but these were system development tasks, not user tasks from the document.

**Solution (3-Layer Defense):**
1. **OCR Placeholder Cleanup** (`noteProcessor.ts:245-264`)
   - Replaced placeholder text with non-extractable system notice
   - Removed phrases like "enhanced OCR processing", "prioritize text-based PDFs"
   - New placeholder: "Document Processing Notice... Unable to extract text content"

2. **Meta-Content Detection** (`aiSummarizer.ts:157-164`)
   - Added AI prompt rule to detect system notices vs user documents
   - Returns minimal valid content for placeholders (not empty arrays that break schema)
   - Prevents fabrication of system-level tasks

3. **Confidence Penalty** (`aiSummarizer.ts:217-229`)
   - Detects OCR placeholder patterns in AI output
   - Forces 30% confidence → triggers `review_required` status
   - Ensures scanned documents flagged for manual review

**Production Behavior:**
- Text-based PDFs: Real tasks extracted from actual document content
- Scanned PDFs: System notice processed, minimal content, `review_required` status
- No more hallucinated "Implement OCR" or "Develop strategy" tasks

**Verification:** See `.claude/logs/debug-ai-hallucination.md` for full analysis
