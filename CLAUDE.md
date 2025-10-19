---
default_agent: slice-orchestrator
---

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**See `AGENTS.md` for repository-wide contributor workflow (structure, commands, commit expectations).**

**See `.claude/standards.md` for universal standards that apply to all agents:**
- TypeScript & code quality rules
- TDD workflow (Red-Green-Refactor)
- Design system & ShadCN conventions
- Common development patterns
- Error handling standards
- Testing requirements
- Known issues & workarounds

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
- `npm run test:unit` - Run unit tests only
- `npm run test:contract` - Run contract tests only
- `npm run test:integration` - Run integration tests only

**Note:** 27/44 automated tests passing (61% pass rate). Blockers: FormData serialization in test environment, test isolation timing. Use manual testing guides (`T002_MANUAL_TEST.md`, etc.) for upload/processing validation.

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

### Vector Embedding Infrastructure (T020-T027)

**Purpose**: Enable sub-500ms semantic search across all document tasks using vector embeddings. During document processing, the system automatically generates 1536-dimension embeddings for each extracted task and stores them in pgvector for fast similarity matching.

**Tech Stack**: OpenAI text-embedding-3-small via Vercel AI SDK, Supabase pgvector extension, IVFFlat index

#### Embedding Generation Flow

```
1. Document Processing (Automatic)
   ├─ POST /api/process completes task extraction
   ├─ embeddingService.generateBatchEmbeddings(tasks)
   │   ├─ Batch size: 50 tasks per batch
   │   ├─ Queue rate limiting: max 3 concurrent documents
   │   ├─ Individual task error handling (no batch blocking)
   │   └─ Timeout: 10s per embedding API call
   ├─ vectorStorage.storeEmbeddings(results)
   │   ├─ Bulk insert to task_embeddings table
   │   ├─ Status tracking: completed/pending/failed
   │   └─ Error message logging for failures
   └─ Update document.embeddings_status field
       ├─ "completed": All tasks have embeddings
       └─ "pending": Some/all embeddings failed (document still usable)

2. Semantic Search (API)
   ├─ POST /api/embeddings/search
   ├─ Generate query embedding (same model)
   ├─ Supabase RPC: search_similar_tasks(query_embedding, threshold, limit)
   ├─ Returns: task_id, task_text, document_id, similarity (sorted)
   └─ Response time: <500ms (95th percentile target)
```

**Key Services**:

- **`lib/services/embeddingService.ts`** - OpenAI embedding generation
  - `generateEmbedding(text: string)`: Single embedding via Vercel AI SDK `embed()` function
  - `generateBatchEmbeddings(tasks: Task[])`: Batch processing with Promise.all (max 50 tasks)
  - Error handling: Individual task failures don't block batch, status marked appropriately
  - Returns: Array of `EmbeddingGenerationResult` with status (completed/pending/failed)

- **`lib/services/vectorStorage.ts`** - Supabase pgvector operations
  - `storeEmbeddings(embeddings: TaskEmbeddingInsert[])`: Bulk insert with conflict handling
  - `searchSimilarTasks(queryEmbedding: number[], threshold: number, limit: number)`: Similarity search
  - `getEmbeddingsByDocumentId(documentId: string)`: Query embeddings for document
  - `deleteEmbeddingsByDocumentId(documentId: string)`: Manual cleanup (CASCADE handles automatic)

- **`lib/services/embeddingQueue.ts`** - Rate limiting (T026)
  - In-memory queue using `p-limit` library (max 3 concurrent document processing jobs)
  - Each document processes tasks serially in batches of 50
  - Prevents OpenAI API rate limiting during concurrent uploads
  - Queue depth tracking for monitoring

#### Search API Usage Patterns

**Basic Search**:
```typescript
// Search for semantically similar tasks
const response = await fetch('/api/embeddings/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: 'increase monthly revenue',
    limit: 20,        // Optional, default 20
    threshold: 0.7    // Optional, default 0.7 (0.0-1.0)
  })
});

const data = await response.json();
// {
//   tasks: [
//     {
//       task_id: "abc123...",
//       task_text: "Implement revenue tracking dashboard",
//       document_id: "550e8400-e29b-41d4-a716-446655440000",
//       similarity: 0.89
//     },
//     ...
//   ],
//   query: "increase monthly revenue",
//   count: 15
// }
```

**Check Embedding Status**:
```typescript
// Check if document has embeddings ready
const statusResponse = await fetch(`/api/status/${fileId}`);
const status = await statusResponse.json();

if (status.embeddings_status === 'completed') {
  // All embeddings generated successfully - safe to search
} else if (status.embeddings_status === 'pending') {
  // Some/all embeddings failed - document usable but search may miss tasks
  // No automatic retry per FR-031
}
```

**Handle Pending Embeddings**:
```typescript
// Query tasks with pending embeddings (for manual retry)
const { data: pendingTasks } = await supabase
  .from('task_embeddings')
  .select('task_id, task_text, error_message')
  .eq('document_id', fileId)
  .eq('status', 'pending');

// Note: Manual re-processing required - no automatic retry
```

#### Database Schema

**task_embeddings Table**:
```sql
CREATE TABLE task_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id TEXT NOT NULL UNIQUE,              -- sha256(task_text + document_id)
  task_text TEXT NOT NULL,
  document_id UUID NOT NULL REFERENCES processed_documents(id) ON DELETE CASCADE,
  embedding vector(1536) NOT NULL,           -- OpenAI text-embedding-3-small
  status TEXT NOT NULL DEFAULT 'pending'     -- 'completed' | 'pending' | 'failed'
    CHECK (status IN ('completed', 'pending', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- IVFFlat index for fast similarity search (lists=100 for 10K embeddings)
CREATE INDEX idx_task_embeddings_vector
  ON task_embeddings USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Additional indexes
CREATE INDEX idx_task_embeddings_task_id ON task_embeddings(task_id);
CREATE INDEX idx_task_embeddings_document_id ON task_embeddings(document_id);
CREATE INDEX idx_task_embeddings_status ON task_embeddings(status) WHERE status != 'completed';
```

**search_similar_tasks RPC Function**:
```sql
CREATE OR REPLACE FUNCTION search_similar_tasks(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 20
)
RETURNS TABLE (
  task_id text,
  task_text text,
  document_id uuid,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.task_id,
    t.task_text,
    t.document_id,
    1 - (t.embedding <=> query_embedding) AS similarity
  FROM task_embeddings t
  WHERE t.status = 'completed'
    AND 1 - (t.embedding <=> query_embedding) > match_threshold
  ORDER BY t.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

#### Troubleshooting

**Issue: Embeddings not being generated**

**Symptoms**: task_embeddings table empty after document processing

**Check**:
1. Verify `OPENAI_API_KEY` environment variable is set correctly
2. Check document processing completed successfully (`status = 'completed'`)
3. Verify migrations 007, 008, 009 applied to database
4. Check error logs for API failures: `grep "Embedding.*failed" logs/error.log`

**Fix**: Ensure embedding service is hooked into processing pipeline in `lib/services/aiSummarizer.ts`

---

**Issue: Search returns empty results**

**Symptoms**: POST /api/embeddings/search returns `{ tasks: [], count: 0 }`

**Check**:
1. Verify embeddings exist: `SELECT count(*) FROM task_embeddings WHERE status = 'completed';`
2. Try lower threshold (0.3 for testing): `{ "query": "...", "threshold": 0.3 }`
3. Check query embedding generated successfully (no 500 error)
4. Verify pgvector index created: `\d task_embeddings` in psql

**Fix**: Run `ANALYZE task_embeddings;` to refresh query planner statistics

---

**Issue: Search slower than 500ms**

**Symptoms**: API response time exceeds 500ms for 200+ embeddings

**Check**:
1. Verify IVFFlat index exists: `\d task_embeddings` (should show ivfflat index)
2. Check index lists parameter: Should be ~100 for 10K rows (scale formula: sqrt(row_count))
3. Query plan using index: `EXPLAIN ANALYZE SELECT * FROM search_similar_tasks(...);`
4. Database resource usage: Supabase dashboard → Database → Performance

**Fix**: Rebuild index with correct lists parameter or upgrade to HNSW index for >100K embeddings

---

**Issue: Document marked "pending" despite upload success**

**Symptoms**: `embeddings_status = 'pending'` after document processing completes

**Expected Behavior**: This is intentional graceful degradation (FR-024)

**Cause**: OpenAI API was unavailable during embedding generation. Document remains fully usable (summary displayed), but tasks won't appear in semantic search until embeddings generated.

**Resolution**:
1. Check error logs for root cause: `SELECT error_message FROM task_embeddings WHERE document_id = '{fileId}';`
2. Common causes: API timeout, rate limiting, network issues, invalid API key
3. **No automatic retry** (per FR-031) - requires manual re-processing if needed

---

**Issue: Rate limit errors from OpenAI API**

**Symptoms**: Errors in logs: `"rate_limit_exceeded"` or `429 Too Many Requests`

**Check**:
1. Verify embedding queue active: Check `lib/services/embeddingQueue.ts` initialized
2. Check concurrent upload count: Should be max 3 documents processing simultaneously
3. Batch size: Should be 50 tasks per batch

**Fix**: Ensure queue properly limits concurrency. If persistent, reduce batch size from 50 to 25 or add delay between batches.

---

#### Performance & Scale

**P0 Scale Limits** (Current Implementation):
- **Target**: 10,000 total tasks across all documents
- **Search Performance**: <500ms at 10K scale (95th percentile)
- **Storage**: ~62 MB for 10K embeddings (~6.2 KB per task)
- **Index**: IVFFlat with lists=100 (optimal for 10K rows)
- **Queue**: In-memory (resets on server restart, acceptable for P0)
- **Concurrent Processing**: Max 3 documents simultaneously
- **Batch Size**: 50 tasks per batch

**Performance Benchmarks**:
- Embedding generation: <2s added to document processing time
- Single embedding: ~150ms average latency
- Batch of 50 tasks: ~3-4s total (with queue rate limiting)
- Search (200 embeddings): ~150-250ms
- Search (10K embeddings): ~300-450ms

**Future Scale Path** (Beyond 10K → 100K+ embeddings):
1. **Vector Index Upgrade**: Migrate from IVFFlat to HNSW index
   - IVFFlat: O(log N) search, rebuild required when lists parameter changes
   - HNSW: O(log N) search, incremental updates, better recall at scale
   - Migration SQL: `CREATE INDEX USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);`

2. **Persistent Queue**: Replace in-memory queue with database-backed queue
   - Add `embedding_queue` table (schema in data-model.md)
   - Enable job persistence across server restarts
   - Support priority-based processing

3. **Batch Size Optimization**: Increase from 50 to 100-200 tasks per batch
   - Requires OpenAI tier upgrade for higher rate limits
   - Monitor for diminishing returns (network overhead vs parallelization)

4. **Caching Layer**: Add Redis cache for frequently searched queries
   - Cache query embeddings (avoid re-generating for common searches)
   - TTL: 1 hour (balance freshness vs performance)

**Monitoring Recommendations**:
- Track search latency P50/P95/P99 percentiles
- Alert if P95 exceeds 500ms threshold
- Monitor embedding generation success rate (target >95%)
- Track queue depth during peak upload periods

### Database Schema (Supabase)

**Tables:**
- `uploaded_files` - File metadata, status tracking, queue_position (T005)
- `processed_documents` - AI outputs, Markdown content, 30-day auto-expiry
- `processing_logs` - Metrics, errors, retry attempts
- `user_outcomes` - User-defined outcome statements (T008-T011)
- `task_embeddings` - Vector embeddings for semantic search (T020-T027, see Vector Embedding Infrastructure section)

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
- `POST /api/embeddings/search` - Semantic search across task embeddings (T024, T027)
  - Request body: `{ query: string, limit?: number (default 20), threshold?: number (default 0.7) }`
  - Returns: 200 with `{ tasks: SimilaritySearchResult[], query: string, count: number }`
  - Response time target: <500ms (95th percentile)
  - Error codes: 400 (invalid query/threshold), 500 (embedding generation failed), 503 (API unavailable)
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

**See `.claude/standards.md` for complete design system documentation including:**
- Depth-Based Color Layering (4-layer system with `--bg-layer-1` through `--bg-layer-4`)
- Two-Layer Shadow System (`.shadow-2layer-sm/md/lg`)
- Gradient utilities and hover effects
- ShadCN UI conventions and component selection
- Accessibility requirements (WCAG 2.1 AA)

**Key Design Variables** (defined in `app/globals.css`):
- **Background Layers**: `--bg-layer-1` (page) → `--bg-layer-4` (elevated states)
- **Primary Brand**: `--primary-2` (base), `--primary-3` (hover), `--primary-4` (accent)
- **Semantic Colors**: Each has `*-bg`, `*-hover`, `*-text` variants (success, warning, info, destructive)
- **Text Colors**: `--text-heading`, `--text-body`, `--text-muted`, `--text-on-primary`

**Design Rules:**
- ❌ Never use borders - rely on color contrast and shadows
- ✅ Use depth layers for all backgrounds
- ✅ Apply semantic colors for status indicators
- ✅ Ensure WCAG AA contrast (4.5:1 minimum)

### Mobile Responsiveness Status
**Last Reviewed:** 2025-10-16

The application is **functional but requires optimization** for mobile devices. See `MOBILE_RESPONSIVENESS_REPORT.md` for comprehensive analysis.

**Critical Issues (P0):**
- Header overflow on screens <375px
- Dashboard filter controls overflow
- SummaryPanel LNO tasks force horizontal scrolling
- OutcomeBuilder modal cramped on mobile

**Implementation Status:** Phase 1 fixes (critical issues) planned for Week 1. Full mobile optimization requires 2-3 weeks.

**Testing:** Manual testing required at 320px, 375px, 414px, 768px breakpoints until automated Playwright tests implemented.

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
- `001_create_initial_tables.sql` - uploaded_files, processing_logs
- `002_create_processing_tables.sql` - processed_documents, 30-day expiry trigger
- `003_add_queue_position.sql` - queue_position column for concurrent uploads (T005)
- `004_create_user_outcomes.sql` - user_outcomes table for outcome management (T008)
- `005_add_context_fields.sql` - Context awareness fields (state_preference, daily_capacity_hours) for T016
- `006_create_reflections.sql` - Reflections table for quick capture feature (T020+)
- `007_enable_pgvector.sql` - Enable pgvector extension for vector embeddings (T020)
- `008_create_task_embeddings.sql` - task_embeddings table with IVFFlat index (T020)
- `009_create_search_function.sql` - search_similar_tasks() RPC function (T020)

Apply migrations manually via Supabase Dashboard → SQL Editor (run `npm run db:migrate` if configured)

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

**See `.claude/standards.md` for complete error handling reference table.**

**Key behaviors:**
- **File validation:** Client-side instant rejection + server-side validation (defense in depth)
- **Duplicates:** 409 "DUPLICATE_FILE" (content hash-based)
- **Unreadable PDFs:** OCR fallback → `review_required` status
- **Low confidence:** <80% → `review_required` status
- **Processing timeout:** >8s logs warning but continues

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

**See `.claude/standards.md` for complete development patterns including:**
- Adding new API endpoints (with Zod validation and error handling)
- Adding new components (ShadCN-first approach)
- Adding new services (with logging and error handling)
- Supabase relationship query normalization
- React Hook Form state synchronization
- Edge cases & error handling reference table

**Quick Reference - Most Common Patterns:**

**Supabase Relationship Query:** Always normalize arrays/objects/null when using `.single()`:
```typescript
const processedDoc = Array.isArray(fileData.processed_documents)
  ? fileData.processed_documents[0]
  : fileData.processed_documents;
```

**React Hook Form Sync:** Defer `getValues()` with `setTimeout` to avoid stale values:
```typescript
setTimeout(() => { const values = form.getValues(); }, 0);
```

**See examples in:**
- `app/api/export/[fileId]/route.ts:164-179` (Supabase normalization)
- `app/components/OutcomeBuilder.tsx:142-153` (Hook Form sync)

## Known Issues & Workarounds

**See `.claude/standards.md` for complete issue documentation including:**
- pdf-parse library issue (postinstall patch required)
- FormData testing limitation (manual testing workaround)
- Node.js version requirement (20+ for native File API)
- AI Task Hallucination (RESOLVED - 3-layer defense implemented)

**Quick Reference:**

### pdf-parse Library
- **Issue:** Debug mode causes test file errors
- **Fix:** Automatic patch via `npm install` postinstall hook
- **Verify:** Check `node_modules/.pnpm/pdf-parse@1.1.1/node_modules/pdf-parse/index.js` has `isDebugMode = false`

### FormData Testing
- **Issue:** File properties become undefined in Vitest
- **Workaround:** Use manual testing guides (`T002_MANUAL_TEST.md`, etc.)
- **Status:** 27/44 tests passing (61% pass rate)

### Node.js Version
- **Required:** Node.js 20+ (check `.nvmrc`)
- **Command:** `nvm use` before development

### AI Hallucination (RESOLVED)
- **Fix Date:** 2025-10-09
- **Solution:** OCR placeholder cleanup + meta-content detection + confidence penalty
- **Result:** Scanned PDFs marked `review_required`, no fabricated tasks
- **Details:** See `.claude/logs/debug-ai-hallucination.md`
