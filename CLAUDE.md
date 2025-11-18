---
default_agent: slice-orchestrator
---

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 🚀 First 5 Minutes Quick Start

**If you're new to this codebase:**
1. **READ `.claude/SYSTEM_RULES.md` FIRST** - Mandatory vertical slice protocol (SEE → DO → VERIFY)
2. Check test status: `pnpm test:run` (currently 350/454 passing - 77% pass rate)
3. Verify Node 20+: `nvm use`
4. Check current work: Look at `.claude/state/*.json` for task status or see "Current Work" section below
5. Review features: See `IMPLEMENTATION_STATUS.md` for completion status

**Common first tasks:**
- Fix failing test → Check `.claude/logs/debug-*.md` first, then use `debugger` agent
- Add new feature → `/specify` → `/plan` → `/tasks` → `/implement`
- Debug production issue → `debugger` agent for diagnosis, then `slice-orchestrator` for fix
- Review code → `code-reviewer` agent

**Critical files to know:**
- **`.claude/SYSTEM_RULES.md`** - 🚨 Vertical slice protocol (MANDATORY READ)
- **`.claude/standards.md`** - TypeScript, TDD, design system, error handling
- **`AGENTS.md`** - Repository workflow, commit guidelines, security rules
- **`IMPLEMENTATION_STATUS.md`** - Feature completion status

## 🎯 Current Work (As of 2025-11-18)

**Active Branch**: `001-strategic-prioritization-impact`
**Feature**: Strategic Prioritization (Impact-Effort Model)
**Status**: Implementation in progress
**Test Status**: 350/454 passing (77%)

**Key Files**:
- Spec: `specs/001-strategic-prioritization-impact/spec.md`
- Tasks: `specs/001-strategic-prioritization-impact/tasks.md`
- Plan: `specs/001-strategic-prioritization-impact/plan.md`

**What's Being Built**:
- Strategic task ranking by Impact/Effort/Confidence scores
- Four sorting strategies: Balanced, Quick Wins, Strategic Bets, Urgent
- 2×2 Impact/Effort quadrant visualization
- Manual score override controls
- Async retry queue for failed LLM scoring calls

**If you're working on this feature**: Read the spec first, then check `tasks.md` for vertical slice breakdown.

## Table of Contents
- [What to Expect](#what-to-expect)
- [Development Commands](#development-commands)
- [Testing Strategy](#testing-strategy)
- [When to Use Which Agent](#when-to-use-which-agent)
- [Project Overview](#project-overview)
- [Architecture](#architecture)
- [Database & API](#database--api)
- [Common Error Messages & Fixes](#common-error-messages--fixes)
- [Configuration](#configuration)
- [Design Principles](#design-principles)
- [Common Development Patterns](#common-development-patterns)
- [Performance Targets](#performance-targets)
- [Resources](#resources)

## What to Expect

**Normal Performance**:
- Document processing: <8s for most files
- Semantic search: <500ms (95th percentile)
- Test pass rate: 350/454 (77%) - 102 tests failing (mostly mocking/integration issues)
- Build time: ~30s for production build
- Priorities page: <100ms render for up to ~1,000 tasks thanks to virtualized active list

**What's NOT an Error**:
- Upload tests fail in CI (use manual tests in `specs/*/T*_MANUAL_TEST.md`)
- Scanned PDFs show `review_required` status (anti-hallucination safeguard - by design)
- Queue resets on server restart (in-memory, acceptable for P0)
- pdf-parse patch runs on every `pnpm install` (required for library to work)

**Known Limitations (P0)**:
- Max 3 concurrent uploads (design choice for API rate limiting)
- 30-day document retention (auto-cleanup)
- No multi-user support (single-user workspace)
- FormData testing blocked in Vitest (manual testing required)
- Virtualized list only activates for >500 tasks (intentionally conservative threshold)

## Development Commands

### Core Commands
```bash
pnpm dev             # Start dev server → http://localhost:3000
pnpm build           # Build for production
pnpm start           # Start production server
pnpm lint            # Run ESLint (add -- --fix to auto-correct)
nvm use              # Switch to Node 20+ (from .nvmrc)
```

### Testing Commands
```bash
pnpm test            # Watch mode (recommended for TDD)
pnpm test:run        # CI mode - run all tests once
pnpm test:ui         # Vitest UI dashboard
pnpm test:run <file> # Run specific test file

# Run by category
pnpm test:run lib/services/__tests__/    # Unit tests
pnpm test:run __tests__/contract/        # Contract tests
pnpm test:run __tests__/integration/     # Integration tests

# Stress test with single thread (for Tinypool issues)
pnpm test:run -- --pool=threads --poolOptions.threads.minThreads=1 --poolOptions.threads.maxThreads=1
```

### Utility Scripts
```bash
npx tsx scripts/test-mastra.ts              # Validate Mastra tool registry
npx tsx scripts/run-semantic-search.ts     # Test semantic search manually
bash scripts/test-search-endpoint.sh       # Quick API test
npx tsx scripts/check-database-tasks.ts    # Verify task embeddings
```

### Feature Development Workflow (Slash Commands)
```bash
/specify "feature description"  # 1. Create feature specification
/plan                           # 2. Generate implementation plan
/tasks                          # 3. Break down into vertical slice tasks
/clarify                        # 4. Ask targeted questions (optional)
/implement                      # 5. Execute implementation
/analyze                        # 6. Consistency analysis across artifacts
```

**Important:** All tasks MUST be vertical slices (SEE → DO → VERIFY). See `.claude/SYSTEM_RULES.md`.

## Testing Strategy

**Current Status**: 350/454 tests passing (77% pass rate)

**Quick Test Commands**:
```bash
pnpm test                          # Watch mode (TDD)
pnpm test:run                      # Run all once
pnpm test:run path/to/file.test.ts # Run specific file
pnpm test:ui                       # Visual dashboard
```

**Test Organization**:
```
lib/services/__tests__/         # Unit tests - Service logic, utilities
app/components/__tests__/       # Component tests - UI, accessibility
__tests__/contract/             # Contract tests - API endpoint behavior
__tests__/integration/          # Integration tests - Full user workflows
specs/*/T*_MANUAL_TEST.md       # Manual tests - FormData workaround
```

**Running Tests**:
```bash
pnpm test                                      # Watch mode (TDD workflow)
pnpm test:run                                  # All tests once
pnpm test:run __tests__/contract/outcomes.test.ts  # Specific file
pnpm test:run lib/services/__tests__/          # By directory
```

**Test Categories**:
- **Unit Tests**: High pass rate (service logic, schemas, utilities)
- **Component Tests**: High pass rate (React components, user interactions)
- **Integration Tests**: Some failures (mocking issues, async timing)
- **Contract Tests**: Mixed (some endpoints need manual testing)

**Known Blockers**:
- **FormData serialization** in Vitest → Use manual testing guides
  - See `.claude/standards.md` lines 1046-1069 for details
  - Manual tests: `specs/*/T*_MANUAL_TEST.md`
- **Async timing** in cleanup tests → Tests pass in isolation, flaky in parallel

**Manual Testing Required For**:
- File upload flows (T001_MANUAL_TEST.md)
- Document processing (T002_MANUAL_TEST.md)
- Validation errors (T004_MANUAL_TEST.md)
- Export functionality (T007-manual-test.md)

**TDD Workflow**: Write failing test → Implement → Review → Verify (see `.claude/standards.md` lines 159-204)

## When to Use Which Agent

```
┌─ Need to implement feature?
│  └─> slice-orchestrator (default)
│      └─> Delegates to backend-engineer + frontend-ui-builder
│          └─> Automatically runs test-runner + code-reviewer
│
├─ Just investigating error?
│  └─> debugger (diagnosis only, doesn't fix)
│      └─> Then slice-orchestrator for implementation
│
├─ Need code review only?
│  └─> code-reviewer
│
├─ Need to run tests?
│  └─> test-runner
│
└─ Type system design?
   └─> typescript-architect
```

**Available Agents:**
- **slice-orchestrator** (default) - Feature implementation coordination
- **backend-engineer** - Backend services and API endpoints
- **frontend-ui-builder** - React components and UI integration
- **test-runner** - Test validation and coverage verification
- **code-reviewer** - Code quality review after implementation
- **debugger** - Error investigation and root cause analysis
- **typescript-architect** - Advanced type system design

**Critical Rules:**
- ✅ ALWAYS use `slice-orchestrator` for feature work
- ✅ TDD: Write failing test FIRST, then implement
- ✅ Quality pipeline runs automatically (code-reviewer → test-runner)
- ❌ NEVER bypass orchestrator for multi-file features
- ❌ NEVER skip the failing test phase
- ❌ NEVER mark complete without user journey test

**See `AGENTS.md` for complete workflow details.**

## Git Workflow

**Branch Naming**:
- Feature branches: `001-feature-name`, `002-feature-name` (numbered sequentially)
- Spec-driven: Each feature has a corresponding `specs/001-feature-name/` directory

**Before Starting Work**:
```bash
git status  # Check current branch (you're on: 001-strategic-prioritization-impact)
git branch  # See all branches
```

**Current Branch**: `001-strategic-prioritization-impact` (Strategic Prioritization feature)

**Main Branch**: Not set in this repo (check git remote for upstream)

## Project Overview

**AI Note Synthesiser** — An autonomous agent that converts documents (PDF/DOCX/TXT) to Markdown, extracts structured insights using GPT-4o, generates vector embeddings for semantic search, and provides intelligent task prioritization through Mastra-powered agents.

**Tech Stack:**
- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS v4, shadcn/ui
- **Backend**: Vercel AI SDK (OpenAI GPT-4o), Supabase (PostgreSQL + pgvector), Mastra
- **External**: Google Drive API, pdf-parse, mammoth, Tesseract.js (OCR)

**Core Pattern:** Sense → Reason → Act → Learn

**Package Manager:** This project uses **pnpm** (not npm)

**Node Version:** Requires Node.js 20+ (use `nvm use`)

## Architecture

### High-Level Processing Pipeline

```
1. Upload → 2. Convert → 3. AI Extract → 4. Embed → 5. Display
   ↓           ↓            ↓              ↓          ↓
/api/upload  noteProcessor aiSummarizer  embeddings SummaryPanel
   ↓           ↓            ↓              ↓          ↓
 Supabase    Markdown     JSON storage   pgvector   Polling
```

**Key Flows:**
1. **Document Intake**: Upload → Validate → Hash → Store → Queue → Convert → Extract → Embed
2. **Task Prioritization**: Trigger → Load Context → Agent Run → Tool Execution → Parse Results → Store
3. **Gap Filling**: Detect Gaps → Generate Tasks → Review/Edit → Accept → Insert with Cycle Detection

### Key Services (See code for details)

**Document Processing** (`lib/services/`):
- `noteProcessor.ts` - PDF/DOCX/TXT → Markdown (with OCR fallback)
- `aiSummarizer.ts` - GPT-4o extraction with structured output (Zod schemas)
- `processingQueue.ts` - Max 3 concurrent uploads, FIFO queue

**Vector Embeddings** (`lib/services/`):
- `embeddingService.ts` - OpenAI text-embedding-3-small (1536-dim vectors)
- `vectorStorage.ts` - Supabase pgvector operations
- `embeddingQueue.ts` - Rate limiting (max 3 concurrent)

**Mastra Tools** (`lib/mastra/tools/`):
- `semanticSearch.ts` - Find tasks by semantic meaning
- `getDocumentContext.ts` - Retrieve full document content
- `detectDependencies.ts` - AI-powered relationship detection
- `queryTaskGraph.ts` - Query existing relationships
- `clusterBySimilarity.ts` - Group similar tasks
- `suggestBridgingTasks.ts` - Generate tasks to fill plan gaps

**Gap Filling** (`lib/services/` - Feature 011):
- `gapDetection.ts` - Detect gaps using 4 indicators (time, action type, skill, dependency)
- `taskInsertion.ts` - Insert tasks with Kahn's algorithm cycle detection

**Cloud Sync** (`lib/services/` - Phase 5):
- `googleDriveService.ts` - Drive API client, OAuth token management
- `googleDriveFolderSync.ts` - Folder monitoring, file download
- `tokenEncryption.ts` - AES-256 encryption for OAuth tokens

### Frontend Architecture

**Main Pages:**
- `app/page.tsx` - Upload UI with drag-and-drop, queue summary
- `app/dashboard/page.tsx` - Document grid with filtering, sorting, bulk export
- `app/priorities/page.tsx` - Agent-prioritized task view with reasoning traces

**Key Components:**
- `app/components/SummaryPanel.tsx` - AI outputs (topics, decisions, actions, LNO)
- `app/components/OutcomeBuilder.tsx` - Modal form for outcome statements
- `app/components/ReflectionPanel.tsx` - Quick-capture reflection interface
- `app/components/ReasoningTracePanel.tsx` - Agent reasoning visualization
- `app/priorities/components/GapDetectionModal.tsx` - Gap detection UI

**UI Library:** shadcn/ui components (install via `npx shadcn@latest add <component>`)

## Database & API

### Database Schema (Supabase)

**Core Tables:**
- `uploaded_files` - File metadata, status, queue_position, source (upload/drive/text)
- `processed_documents` - AI outputs, Markdown content, 30-day auto-expiry
- `task_embeddings` - Vector embeddings (1536-dim) with pgvector IVFFlat index
- `user_outcomes` - User-defined outcome statements
- `reflections` - Quick-capture reflections for context
- `task_relationships` - Task dependencies (prerequisite/blocking/related)
- `agent_sessions` - Agent execution traces, gap_analysis JSONB
- `processing_logs` - Metrics, errors, retry attempts
- `cloud_connections` - OAuth tokens, folder selection, webhook state

**Storage Buckets:**
- `notes/` - Original uploaded files (hash-based naming)
- `notes/processed/` - Generated Markdown and JSON files

**Migrations:** `supabase/migrations/` (001-024+)

**Supabase Client Architecture:**
- `lib/supabase/client.ts` → Browser client (Client Components)
- `lib/supabase/server.ts` → Server client with cookies (API routes, RLS-respecting)
- `lib/supabase/admin.ts` → Admin client with service_role (webhooks, admin ops only)

### API Endpoints

**Document Management:**
- `POST /api/upload` - File upload with validation, deduplication, queue management
- `POST /api/process` - Orchestrates conversion → summarization → storage
- `GET /api/status/[fileId]` - Real-time status polling
- `GET /api/documents` - Retrieve all documents with filtering/sorting
- `GET /api/export/[fileId]?format=json|markdown` - Export document summary

**Vector Search:**
- `POST /api/embeddings/search` - Semantic search (<500ms target)

**Outcome & Reflections:**
- `GET /api/outcomes` - Fetch active outcome
- `POST /api/outcomes` - Create/update outcome
- `POST /api/reflections` - Create reflection
- `GET /api/reflections?limit=20&tags=work` - Retrieve reflections

**Agent Orchestration:**
- `POST /api/agent/prioritize` - Trigger task prioritization
- `GET /api/agent/sessions/[sessionId]` - Get session details
- `GET /api/agent/sessions/latest` - Get latest session

**Gap Filling (Feature 011):**
- `POST /api/agent/suggest-gaps` - Detect gaps, generate bridging tasks
- `POST /api/gaps/accept` - Insert accepted tasks with cycle validation

**Cloud Sync:**
- `POST /api/cloud/google-drive/connect` - Initiate OAuth flow
- `GET /api/cloud/google-drive/callback` - OAuth callback
- `POST /api/cloud/google-drive/select-folder` - Choose Drive folder
- `POST /api/webhooks/google-drive` - Webhook for Drive changes

**Maintenance:**
- `POST /api/cleanup?dryRun=true` - Manual cleanup trigger

## Common Error Messages & Fixes

### "ENOENT: ./test/data/05-versions-space.pdf"
**Cause:** pdf-parse patch didn't apply
**Fix:**
```bash
pnpm install  # Re-runs postinstall hook
# OR manually:
node scripts/patch-pdf-parse.js
```
**Verify:**
```bash
cat node_modules/.pnpm/pdf-parse@1.1.1/node_modules/pdf-parse/index.js | grep "isDebugMode = false"
```

### "File properties undefined in FormData"
**Cause:** Known Vitest + Next.js FormData serialization issue
**Fix:** Use manual testing guides
**Details:** See `.claude/standards.md` lines 1046-1069
**Manual tests:** `specs/*/T*_MANUAL_TEST.md`

### "Task embeddings table does not exist"
**Cause:** Missing database migrations
**Fix:**
```bash
supabase db push
# OR apply migrations 007-009 manually via Supabase Dashboard → SQL Editor
```

### "Module not found: @/..."
**Cause:** TypeScript path alias not recognized
**Fix:** Restart TypeScript server in IDE
**VSCode:** Cmd/Ctrl + Shift + P → "TypeScript: Restart TS Server"

### Empty task list on /priorities page
**Cause:** Missing `SUPABASE_SERVICE_ROLE_KEY` environment variable
**Fix:**
```bash
# 1. Add to .env.local
echo 'SUPABASE_SERVICE_ROLE_KEY=your_service_role_key' >> .env.local

# 2. Get key from Supabase Dashboard → Settings → API

# 3. Restart dev server
pnpm dev

# 4. Test metadata API
curl http://localhost:3000/api/tasks/metadata
```

### Embeddings not generating
**Troubleshooting:**
```bash
# 1. Check OPENAI_API_KEY is set
grep OPENAI_API_KEY .env.local

# 2. Verify migrations applied
supabase db push

# 3. Check task_embeddings table exists
# Via Supabase Dashboard → Table Editor

# 4. Check processing logs
# Via Supabase Dashboard → Table Editor → processing_logs
```

### Search returns empty results
**Troubleshooting:**
```sql
-- 1. Verify embeddings exist
SELECT count(*) FROM task_embeddings WHERE status = 'completed';

-- 2. Try lower threshold (0.3 for testing)
-- In search API call

-- 3. Refresh query planner
ANALYZE task_embeddings;

-- 4. Verify IVFFlat index exists
\d task_embeddings
```

### Search slower than 500ms
**Troubleshooting:**
1. Verify IVFFlat index exists (see above)
2. Check index lists parameter (~100 for 10K rows)
3. Rebuild index if needed
4. For >100K embeddings, upgrade to HNSW index

## Configuration

### Environment Variables

**Required** (create `.env.local`):
```env
NEXT_PUBLIC_SUPABASE_URL=https://emgvqqqqdbfpjwbouybj.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key  # Required for task metadata API
OPENAI_API_KEY=sk-proj-...
ENCRYPTION_KEY=32_byte_hex  # Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Optional:**
```env
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### TypeScript Configuration
- Path alias: `@/*` → project root
- Strict mode enabled
- Target: ES2017

### Supabase Setup
- **Storage Bucket:** `notes` (50MB limit, `application/*` and `text/*` MIME types)
- **RLS Policies:** Public access for P0 development
- **pgvector:** Enabled in migration 007, IVFFlat index for 10K scale

## Design Principles

### 🚨 CRITICAL: Vertical Slice Development

**READ `.claude/SYSTEM_RULES.md` BEFORE ANY CODE GENERATION**

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

### Core Architectural Principles

1. **Autonomous by Default** - No manual triggers, Sense → Reason → Act loop
2. **Deterministic Outputs** - Consistent JSON schemas with Zod validation
3. **Modular Architecture** - Decoupled services with clear interfaces
4. **Test-First Development** - TDD mandatory (write failing test first)
5. **Observable by Design** - Structured logging with metrics, errors, confidence scores

### Design System

**Core Principles:**
- **No borders** - Use color contrast and shadows instead
- **Depth layers** - 4-layer system (`--bg-layer-1` through `--bg-layer-4`)
- **Two-layer shadows** - `.shadow-2layer-sm/md/lg`
- **Semantic colors** - Each has `*-bg`, `*-hover`, `*-text` variants
- **WCAG AA compliance** - 4.5:1 minimum contrast ratio

**Full design system reference:** `.claude/standards.md` lines 421-479

**If you need:**
- Color layer specifications → `.claude/standards.md` lines 421-432
- Shadow system utilities → `.claude/standards.md` lines 452-471
- Accessibility requirements → `.claude/standards.md` lines 381-420
- ShadCN UI conventions → `.claude/standards.md` lines 480-560

## Common Development Patterns

**Full patterns reference:** `.claude/standards.md` lines 871-1011

### API Endpoint Template
```typescript
// app/api/example/route.ts
import { z } from 'zod';
import { NextResponse } from 'next/server';

const requestSchema = z.object({ field: z.string() });

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { field } = requestSchema.parse(body);
    // ... process ...
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
```

### Supabase Relationship Query Pattern
When querying with `.single()`, Supabase may return relationship as object/array/null:
```typescript
const processedDoc = Array.isArray(fileData.processed_documents)
  ? fileData.processed_documents[0]
  : fileData.processed_documents;

if (!processedDoc) {
  return NextResponse.json({ error: 'Document not found' }, { status: 404 });
}
```
**Examples:** `app/api/export/[fileId]/route.ts`, `app/api/documents/route.ts`

### React Hook Form State Sync Pattern
Use `setTimeout` to defer reading form values after user interaction:
```typescript
const handleModalClose = (open: boolean) => {
  if (!open) {
    setTimeout(() => {
      const values = form.getValues();
      saveDraft(values);
    }, 0);
  }
  onOpenChange(open);
};
```
**Example:** `app/components/OutcomeBuilder.tsx:142-153`

**If you need:**
- API endpoint patterns → `.claude/standards.md` lines 874-903
- Component patterns → `.claude/standards.md` lines 905-929
- Service patterns → `.claude/standards.md` lines 931-962
- Error handling standards → `.claude/standards.md` lines 562-692

## Performance Targets

- **Processing Time:** <8 seconds per document
- **Search Performance:** <500ms (95th percentile) for semantic search
- **Confidence Threshold:** ≥80% for auto-approval
- **Max File Size:** 10MB
- **Concurrent Processing:** Max 3 parallel uploads with automatic queueing
- **Data Retention:** 30 days auto-cleanup (daily at 2 AM UTC)

**If you need data structure schemas:** Check `lib/schemas/` or TypeScript types in service files

## Resources

- **Implementation Status:** `IMPLEMENTATION_STATUS.md`
- **Standards & Patterns:** `.claude/standards.md`
- **System Rules:** `.claude/SYSTEM_RULES.md` (🚨 READ FIRST)
- **Agent Workflow:** `AGENTS.md`
- **Feature Specs:** `specs/*/spec.md`
- **Agent Transcripts:** `.claude/logs/`
- **Mobile QA:** `MOBILE_RESPONSIVENESS_REPORT.md`

---

**Last Updated:** 2025-11-18
**Maintained By:** Project team
**Quick Start:** Read this file, then `.claude/SYSTEM_RULES.md`, then start coding
