---
default_agent: slice-orchestrator
---

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Table of Contents
- [Quick Links](#quick-links)
- [First Day Checklist](#first-day-checklist)
- [Project Overview](#project-overview)
- [Development Commands](#development-commands)
- [Architecture](#architecture)
- [Configuration](#configuration)
- [Design Principles](#design-principles)
- [Common Development Patterns](#common-development-patterns)
- [Known Issues & Workarounds](#known-issues--workarounds)
- [Agent Usage](#agent-usage)
- [Performance Targets](#performance-targets)
- [Quick Troubleshooting](#quick-troubleshooting)

## Quick Links
- **`.claude/SYSTEM_RULES.md`** - 🚨 READ FIRST: Mandatory vertical slice protocol (SEE → DO → VERIFY)
- **`AGENTS.md`** - Repository workflow, commit guidelines, security rules
- **`.claude/standards.md`** - TypeScript, TDD, design system, error handling standards
- **`IMPLEMENTATION_STATUS.md`** - Feature completion status

## First Day Checklist

1. **Check Node version**: `node --version` (requires 20+, use `nvm use` to switch)
2. **Install dependencies**: `pnpm install` (this project uses **pnpm**)
3. **Set up environment**: Create `.env.local` with required keys:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://emgvqqqqdbfpjwbouybj.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_key_here
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key  # Required for task metadata API
   OPENAI_API_KEY=sk-proj-...
   ENCRYPTION_KEY=32_byte_hex  # Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
4. **Apply migrations**: `supabase db push` or manually via Supabase Dashboard → SQL Editor
5. **Start dev server**: `pnpm dev` → http://localhost:3000
6. **Read the rules**: Review `.claude/SYSTEM_RULES.md` - this project requires **vertical slice development** (every task must deliver user-testable value)

## Project Overview

**AI Note Synthesiser** — An autonomous agent that converts documents (PDF/DOCX/TXT) to Markdown, extracts structured insights using GPT-4o, generates vector embeddings for semantic search, and provides intelligent task prioritization through Mastra-powered agents.

**Tech Stack:** Next.js 15, React 19, TypeScript, Vercel AI SDK (OpenAI GPT-4o), Supabase (pgvector), Tailwind CSS v4, Mastra, Google Drive API

**Core Pattern:** Sense → Reason → Act → Learn

## Development Commands

### Core Commands
```bash
pnpm dev             # Start development server (http://localhost:3000)
pnpm build           # Build for production
pnpm start           # Start production server
pnpm lint            # Run ESLint (use -- --fix to auto-correct)
```

### Testing Commands
```bash
pnpm test            # Watch mode (recommended for development)
pnpm test:run        # Run all tests once (CI mode)
pnpm test:ui         # Tests with UI dashboard

# Run specific test file
pnpm test:run __tests__/contract/outcomes.test.ts

# Run by category
pnpm test:run lib/services/__tests__/    # Unit tests
pnpm test:run __tests__/contract/        # Contract tests
pnpm test:run __tests__/integration/     # Integration tests

# Stress test with single thread (for Tinypool issues)
pnpm test:run -- --pool=threads --poolOptions.threads.minThreads=1 --poolOptions.threads.maxThreads=1
```

**Current Test Status:** 29/46 tests passing (63% pass rate)
- **Passing:** Component tests, database tests, schema validation, service logic, task insertion, cycle detection
- **Blocked:** Upload API contract tests (FormData serialization issue in test environment)
- **Workaround:** Use manual testing guides (`specs/*/T*_MANUAL_TEST.md`)

### Mastra Validation
**Current Test Status:** 27/44 tests passing (61% pass rate)
- **Workaround for blocked tests**: Use manual testing guides (`T002_MANUAL_TEST.md`, `T004_MANUAL_TEST.md`)
- **If you need test organization details**: See `.claude/standards.md` lines 695-775
- **If you need TDD workflow**: See `.claude/standards.md` lines 159-204

### Utility Scripts
- `npx tsx scripts/test-mastra.ts` - Validate Mastra tool registry and telemetry
- `npx tsx scripts/run-semantic-search.ts` - Test semantic search manually
- `bash scripts/test-search-endpoint.sh` - Quick test of embedding search API

### Workflow Commands (.specify/)

**Feature Development Workflow:**
```bash
npx tsx scripts/test-mastra.ts              # Validate tool registry and telemetry
npx tsx scripts/run-semantic-search.ts     # Test semantic search manually
bash scripts/test-search-endpoint.sh       # Quick test of embedding search API
```

### Feature Development Workflow (.specify/)

**Slash Commands** (used with Claude Code):
```bash
/specify "feature description"  # 1. Create feature specification
/plan                           # 2. Generate implementation plan
/tasks                          # 3. Break down into vertical slice tasks
/clarify                        # 4. Ask targeted questions (optional)
/implement                      # 5. Execute implementation
/analyze                        # 6. Consistency analysis across artifacts
```

**Important:** All tasks MUST be vertical slices delivering complete user value (SEE → DO → VERIFY). See `.claude/SYSTEM_RULES.md` for the mandatory vertical slice protocol.

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

### Service Modules

**Document Processing** (`lib/services/`):
- `noteProcessor.ts` - PDF/DOCX/TXT → Markdown (with OCR fallback)
- `aiSummarizer.ts` - GPT-4o extraction with structured output (Zod)
- `processingQueue.ts` - Concurrent upload management (max 3 parallel)

**Vector Embeddings** (`lib/services/`):
- `embeddingService.ts` - OpenAI text-embedding-3-small generation
- `vectorStorage.ts` - Supabase pgvector operations
- `embeddingQueue.ts` - Rate limiting (max 3 concurrent)

**Mastra Tools** (`lib/mastra/tools/`):
- `semanticSearch.ts` - Find tasks by semantic meaning
- `getDocumentContext.ts` - Retrieve full document content
- `detectDependencies.ts` - AI-powered relationship detection
- `queryTaskGraph.ts` - Query existing relationships
- `clusterBySimilarity.ts` - Group similar tasks
- `suggestBridgingTasks.ts` - Generate tasks to fill plan gaps (Feature 011)

**Gap Filling** (`lib/services/` - Feature 011):
- `gapDetection.ts` - Detect logical gaps using 4 indicators (time, action type, skill, dependency)
- `taskInsertion.ts` - Insert tasks with Kahn's algorithm cycle detection
- Zod schemas: `lib/schemas/gapAnalysis.ts`

**Cloud Sync** (`lib/services/` - Phase 5):
- `googleDriveService.ts` - Drive API client, OAuth token management
- `googleDriveFolderSync.ts` - Folder monitoring, file download
- `tokenEncryption.ts` - AES-256 encryption for OAuth tokens
- `textInputService.ts` - In-memory text processing

### Database Schema (Supabase)

**Core Tables:**
- `uploaded_files` - File metadata, status tracking, queue_position, source (upload/drive/text_input)
- `processed_documents` - AI outputs, Markdown content, 30-day auto-expiry
- `task_embeddings` - Vector embeddings (1536-dim) with pgvector IVFFlat index
- `user_outcomes` - User-defined outcome statements
- `reflections` - Quick-capture reflections for context-aware reasoning
- `task_relationships` - Task dependencies (prerequisite/blocking/related)
- `agent_sessions` - Agent execution traces, reasoning steps, gap_analysis JSONB
- `processing_logs` - Metrics, errors, retry attempts
- `cloud_connections` - OAuth tokens, folder selection, webhook state
- `sync_events` - Audit log for cloud sync operations

**Storage Buckets:**
- `notes/` - Original uploaded files (hash-based naming)
- `notes/processed/` - Generated Markdown and JSON files

**Migrations:** `supabase/migrations/` (001-022+)

### API Endpoints

**Document Management:**
- `POST /api/upload` - File upload with validation, deduplication, queue management
- `POST /api/process` - Orchestrates conversion → summarization → storage
- `GET /api/status/[fileId]` - Real-time status polling
- `GET /api/documents` - Retrieve all documents with filtering/sorting
- `GET /api/export/[fileId]?format=json|markdown` - Export document summary

**Vector Search:**
- `POST /api/embeddings/search` - Semantic search across task embeddings (<500ms target)

**Outcome & Reflections:**
- `GET /api/outcomes` - Fetch active outcome statement
- `POST /api/outcomes` - Create or update outcome statement
- `POST /api/reflections` - Create quick reflection entry
- `GET /api/reflections?limit=20&tags=work` - Retrieve recent reflections

**Agent Orchestration:**
- `POST /api/agent/prioritize` - Trigger task prioritization agent
- `GET /api/agent/sessions/[sessionId]` - Get agent session details
- `GET /api/agent/sessions/latest` - Get latest agent session

**Gap Filling (Feature 011):**
- `POST /api/agent/suggest-gaps` - Detect gaps and generate bridging tasks
- `POST /api/agent/accept-suggestions` - Insert accepted tasks with cycle validation

**Cloud Sync:**
- `POST /api/cloud/google-drive/connect` - Initiate Google Drive OAuth flow
- `GET /api/cloud/google-drive/callback` - OAuth callback handler
- `POST /api/cloud/google-drive/select-folder` - Choose Drive folder to monitor
- `POST /api/webhooks/google-drive` - Webhook for Drive change notifications
- `POST /api/text-input` - Direct text input (Quick Capture)

**Maintenance:**
- `POST /api/cleanup?dryRun=true` - Manual cleanup trigger (deletes expired documents)

### Frontend Architecture

**Main Pages:**
- `app/page.tsx` - Upload UI with drag-and-drop, status polling, queue summary
- `app/dashboard/page.tsx` - Document grid with filtering, sorting, bulk export
- `app/priorities/page.tsx` - Agent-prioritized task view with reasoning traces

**Key Components:**
- `app/components/SummaryPanel.tsx` - Displays topics, decisions, actions, LNO tasks
- `app/components/OutcomeBuilder.tsx` - Modal form for outcome statements
- `app/components/ReflectionPanel.tsx` - Quick-capture reflection interface
- `app/components/ReasoningTracePanel.tsx` - Agent reasoning visualization
- `app/priorities/components/GapDetectionModal.tsx` - Gap detection UI (Feature 011)

**UI Library:** shadcn/ui components (install via `npx shadcn@latest add <component>`)

### Design System

**Core Principles:**
- **No borders** - Use color contrast and shadows instead
- **Depth layers** - 4-layer system (`--bg-layer-1` through `--bg-layer-4`)
- **Two-layer shadows** - `.shadow-2layer-sm/md/lg`
- **Semantic colors** - Each has `*-bg`, `*-hover`, `*-text` variants
- **WCAG AA compliance** - 4.5:1 minimum contrast ratio

**Full reference:** `.claude/standards.md` lines 421-479
**If you need:**
- Color layer specifications → See `.claude/standards.md` lines 421-432
- Shadow system utilities → See `.claude/standards.md` lines 452-471
- Accessibility requirements → See `.claude/standards.md` lines 381-420
- ShadCN UI conventions → See `.claude/standards.md` lines 480-560

## Configuration

### Environment Variables

**Required** (create `.env.local`):
```env
NEXT_PUBLIC_SUPABASE_URL=https://emgvqqqqdbfpjwbouybj.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_key_here
OPENAI_API_KEY=sk-proj-...
ENCRYPTION_KEY=32_byte_hex_secret
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
- **Client Architecture:** Modern @supabase/ssr pattern (migrated 2025-11-07)
  - `lib/supabase/client.ts` → Browser client (Client Components)
  - `lib/supabase/server.ts` → Server client with cookies (API routes, RLS-respecting)
  - `lib/supabase/admin.ts` → Admin client with service_role (webhooks, admin ops only)

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

1. **Autonomous by Default** - No manual triggers, system operates via Sense → Reason → Act loop
2. **Deterministic Outputs** - Consistent JSON schemas with Zod validation
3. **Modular Architecture** - Decoupled services with clear interfaces
4. **Test-First Development** - TDD mandatory (write failing test first)
5. **Observable by Design** - Structured logging with metrics, errors, confidence scores

## Common Development Patterns

**Full patterns:** `.claude/standards.md` lines 871-1011

**API Endpoint Template:**
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

**Supabase Relationship Query (normalize arrays/objects/null):**
```typescript
const processedDoc = Array.isArray(fileData.processed_documents)
  ? fileData.processed_documents[0]
  : fileData.processed_documents;
```

**React Hook Form Sync (defer getValues):**
```typescript
setTimeout(() => { const values = form.getValues(); }, 0);
```
**If you need:**
- API endpoint patterns → See `.claude/standards.md` lines 874-903
- Component patterns → See `.claude/standards.md` lines 905-929
- Service patterns → See `.claude/standards.md` lines 931-962
- Supabase relationship queries → See `.claude/standards.md` lines 964-988
- React Hook Form sync patterns → See `.claude/standards.md` lines 990-1011
- Error handling standards → See `.claude/standards.md` lines 562-692

## Known Issues & Workarounds

**Quick fixes:**
- **pdf-parse errors?** → Auto-patched via `pnpm install` postinstall hook
- **FormData test failures?** → Use manual testing guides (`T002_MANUAL_TEST.md` pattern)
- **Wrong Node version?** → Run `nvm use` (requires Node.js 20+)
- **Empty task list on /priorities page?** → Add `SUPABASE_SERVICE_ROLE_KEY` to `.env.local` (required for task metadata API)

### pdf-parse Library
- **Issue:** Debug mode causes test file errors
- **Fix:** Automatic patch via `pnpm install` postinstall hook (`scripts/patch-pdf-parse.js`)
- **Verify:** Check `node_modules/.pnpm/pdf-parse@1.1.1/node_modules/pdf-parse/index.js` has `isDebugMode = false`

### FormData Testing
- **Issue:** File properties become undefined in Vitest
- **Workaround:** Use manual testing guides (`specs/*/T*_MANUAL_TEST.md`)
- **Status:** 29/46 tests passing (63% pass rate)

### Node.js Version
- **Required:** Node.js 20+ (check `.nvmrc`)
- **Command:** `nvm use` before development

### AI Hallucination (RESOLVED)
- **Fix Date:** 2025-10-09
- **Solution:** OCR placeholder cleanup + meta-content detection + confidence penalty
- **Result:** Scanned PDFs marked `review_required`, no fabricated tasks
**If you need:**
- pdf-parse details → See `.claude/standards.md` lines 1028-1084
- FormData testing workaround → See `.claude/standards.md` lines 1046-1069
- Node.js setup → See `.claude/standards.md` lines 1086-1099
- AI hallucination prevention → See `.claude/standards.md` lines 1115-1148 (RESOLVED 2025-10-09)
- Edge case handling → See `.claude/standards.md` lines 1013-1024

## Agent Usage

**See `AGENTS.md` for complete workflow.**

**Available Agents:**
- **slice-orchestrator** (default) - Feature implementation coordination
- **backend-engineer** - Backend services and API endpoints
- **frontend-ui-builder** - React components and UI integration
- **test-runner** - Test validation and coverage verification
- **code-reviewer** - Code quality review after implementation
- **debugger** - Error investigation and root cause analysis

**Workflow:** slice-orchestrator → delegates to backend-engineer/frontend-ui-builder → test-runner → code-reviewer

## Performance Targets

- **Processing Time:** <8 seconds per document
- **Search Performance:** <500ms (95th percentile) for semantic search
- **Confidence Threshold:** ≥80% for auto-approval
- **Max File Size:** 10MB
- **Concurrent Processing:** Max 3 parallel uploads
- **Data Retention:** 30 days auto-cleanup (daily at 2 AM UTC)
- **Concurrent Processing:** Max 3 parallel uploads with automatic queueing

**If you need data structure schemas:** Check `lib/schemas/` or the actual TypeScript types in service files

## Quick Troubleshooting

**Embeddings not generating?**
1. Check `OPENAI_API_KEY` is set
2. Verify migrations 007, 008, 009 applied
3. Check `task_embeddings` table exists

**Search returns empty results?**
1. Verify embeddings exist: `SELECT count(*) FROM task_embeddings WHERE status = 'completed';`
2. Try lower threshold (0.3 for testing)
3. Run `ANALYZE task_embeddings;` to refresh query planner

**Search slower than 500ms?**
1. Verify IVFFlat index exists: `\d task_embeddings`
2. Check index lists parameter (~100 for 10K rows)
3. Rebuild index if needed or upgrade to HNSW for >100K embeddings

**Queue not working?**
1. Verify migration 003 (queue_position) applied
2. Restart dev server (`npm run dev`)
3. Check `processingQueue.ts` singleton initialized

**Tests failing after fresh install?**
1. Run `pnpm install` to trigger pdf-parse patch
2. Verify `node_modules/.pnpm/pdf-parse@1.1.1/node_modules/pdf-parse/index.js` has `isDebugMode = false`
3. If still failing, manually set to `false`

**Priorities page showing empty task cards?**
1. Verify `SUPABASE_SERVICE_ROLE_KEY` is set in `.env.local`
2. Get service role key from Supabase Dashboard → Settings → API
3. Restart dev server: `pnpm dev`
4. Task metadata API (`/api/tasks/metadata`) requires admin client access

## Resources

- **Implementation Status:** `IMPLEMENTATION_STATUS.md`
- **Standards & Patterns:** `.claude/standards.md`
- **System Rules:** `.claude/SYSTEM_RULES.md` (🚨 READ FIRST)
- **Agent Workflow:** `AGENTS.md`
- **Feature Specs:** `specs/*/spec.md`
- **Agent Transcripts:** `.claude/logs/`
- **Mobile QA:** `MOBILE_RESPONSIVENESS_REPORT.md`
