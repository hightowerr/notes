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
- **`AGENTS.md`** - Repository workflow, structure, commit expectations
- **`.claude/standards.md`** - Universal standards for all agents (TypeScript, TDD, design system, error handling)
- **`IMPLEMENTATION_STATUS.md`** - Detailed feature completion status
- **`.claude/SYSTEM_RULES.md`** - Vertical slice development protocol (read before ANY coding)

## First Day Checklist

**Get running in 5 minutes:**

1. **Check Node version**: `node --version` (requires 20+, run `nvm use` to switch)
2. **Install dependencies**: `pnpm install` (this project uses **pnpm**, not npm)
3. **Set up environment**: Create `.env.local` with these required keys:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://emgvqqqqdbfpjwbouybj.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_key_here
   OPENAI_API_KEY=sk-proj-...
   ```
4. **Start dev server**: `pnpm dev`
5. **Open browser**: http://localhost:3000
6. **Read the rules**: Review [Design Principles](#design-principles) below - this project requires **vertical slice development**

## Project Overview

**AI Note Synthesiser** — An autonomous agent that converts documents (PDF/DOCX/TXT) to Markdown, extracts structured insights using GPT-4o, generates vector embeddings for semantic search, and provides intelligent task prioritization through Mastra-powered agents.

**Input Methods:**
- Manual file upload (drag-and-drop or file picker)
- Google Drive sync (automatic detection of new/updated files in monitored folder)
- Direct text input (Quick Capture modal for markdown/plaintext)

**Tech Stack:** Next.js 15, React 19, TypeScript, Vercel AI SDK (OpenAI GPT-4o), Supabase (pgvector), Tailwind CSS v4, Mastra, Google Drive API

**Core Pattern:** Sense → Reason → Act → Learn
- **Sense:** File upload detection, Drive webhooks, text input
- **Reason:** Convert to Markdown → AI summarization → Extract structured data
- **Act:** Store outputs, generate embeddings, prioritize tasks
- **Learn:** Log metrics, confidence scores, agent reasoning traces

## Development Commands

**Important:** This project uses **pnpm** as the package manager. Always use `pnpm` instead of `npm`.

### Core Commands
- `pnpm dev` - Start development server (http://localhost:3000)
- `pnpm build` - Build for production
- `pnpm start` - Start production server
- `pnpm lint` - Run ESLint

### Testing Commands
```bash
# Watch mode (recommended for development)
pnpm test

# Run all tests once (CI mode)
pnpm test:run

# Run specific test file
pnpm test:run __tests__/contract/outcomes.test.ts

# Run tests with UI dashboard
pnpm test:ui

# Run by category
pnpm test:unit          # Unit tests only
pnpm test:contract      # Contract tests only
pnpm test:integration   # Integration tests only
```

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
# 1. Create feature specification
/specify "feature description"

# 2. Generate implementation plan
/plan

# 3. Break down into vertical slice tasks
/tasks

# 4. Clarify ambiguities (optional)
/clarify

# 5. Execute implementation
/implement
```

**Slash Command Details:**
- `/specify` - Create feature specification from natural language description
- `/plan` - Generate implementation plan from spec (design artifacts)
- `/tasks` - Generate **vertical slice** task list (UI + Backend + Data + Feedback per task)
- `/clarify` - Ask targeted questions to resolve underspecified areas
- `/implement` - Execute implementation plan using slice-orchestrator agent
- `/analyze` - Perform consistency analysis across spec, plan, and tasks

**Important:** All tasks MUST be vertical slices delivering complete user value (SEE → DO → VERIFY). See `.claude/SYSTEM_RULES.md` for the mandatory vertical slice protocol.

## Architecture

### High-Level Processing Pipeline

```
1. Upload → 2. Convert to Markdown → 3. AI Extract → 4. Generate Embeddings → 5. Display
   ↓              ↓                       ↓                ↓                      ↓
 /api/upload   noteProcessor.ts      aiSummarizer.ts  embeddingService.ts   SummaryPanel.tsx
   ↓              ↓                       ↓                ↓                      ↓
 Supabase      Markdown storage      JSON storage     task_embeddings       Status polling
 storage                                                 (pgvector)
```

**Key Flow:**
1. **Upload** (`POST /api/upload`) → Validate, hash, store in Supabase, queue processing
2. **Process** (`POST /api/process`) → PDF/DOCX/TXT → Markdown → GPT-4o extraction
3. **Embed** (automatic) → Generate embeddings for tasks → Store in pgvector
4. **Display** (`GET /api/status/[fileId]`) → Poll status → Show SummaryPanel when complete
5. **Search** (`POST /api/embeddings/search`) → Semantic search across all tasks (<500ms)

### Key Service Modules

**Document Processing:**
- `lib/services/noteProcessor.ts` - Converts PDF/DOCX/TXT to Markdown
- `lib/services/aiSummarizer.ts` - GPT-4o extraction with structured output (Zod)
- `lib/services/processingQueue.ts` - Concurrent upload management (max 3 parallel)

**Vector Embeddings:**
- `lib/services/embeddingService.ts` - OpenAI text-embedding-3-small generation
- `lib/services/vectorStorage.ts` - Supabase pgvector operations
- `lib/services/embeddingQueue.ts` - Rate limiting (max 3 concurrent documents)

**Mastra Tools (Phase 2):**
- `lib/mastra/tools/semanticSearch.ts` - Find tasks by semantic meaning
- `lib/mastra/tools/getDocumentContext.ts` - Retrieve full document content
- `lib/mastra/tools/detectDependencies.ts` - AI-powered relationship detection
- `lib/mastra/tools/queryTaskGraph.ts` - Query existing relationships
- `lib/mastra/tools/clusterBySimilarity.ts` - Group similar tasks

**Other Services:**
- `lib/services/outcomeService.ts` - Outcome statement assembly
- `lib/services/reflectionService.ts` - Quick-capture reflections
- `lib/services/recomputeService.ts` - Background recompute jobs
- `lib/jobs/cleanupExpiredFiles.ts` - Automatic file cleanup (30-day retention)

**Cloud Sync Services (Phase 5):**
- `lib/services/googleDriveService.ts` - Drive API client, OAuth token management
- `lib/services/googleDriveFolderSync.ts` - Folder monitoring, file download
- `lib/services/tokenEncryption.ts` - AES-256 encryption for OAuth tokens
- `lib/services/webhookVerification.ts` - Webhook signature validation
- `lib/services/webhookRetry.ts` - Retry logic with exponential backoff
- `lib/services/textInputService.ts` - In-memory text processing (no file storage)

### Database Schema (Supabase)

**Core Tables:**
- `uploaded_files` - File metadata, status tracking, queue_position, source (upload/drive/text_input)
- `processed_documents` - AI outputs, Markdown content, 30-day auto-expiry
- `task_embeddings` - Vector embeddings (1536-dim) with pgvector IVFFlat index
- `user_outcomes` - User-defined outcome statements
- `reflections` - Quick-capture reflections for context-aware reasoning
- `task_relationships` - Task dependencies (prerequisite/blocking/related)
- `agent_sessions` - Agent execution traces and reasoning steps
- `processing_logs` - Metrics, errors, retry attempts
- `cloud_connections` - OAuth tokens, folder selection, webhook state (Phase 5)
- `sync_events` - Audit log for cloud sync operations (Phase 5)

**Storage Buckets:**
- `notes/` - Original uploaded files (hash-based naming)
- `notes/processed/` - Generated Markdown and JSON files

**Migrations:** `supabase/migrations/` (001-018+) - Apply manually via Supabase Dashboard → SQL Editor or `supabase db push`

### API Endpoints

**Document Management:**
- `POST /api/upload` - File upload with validation, deduplication, queue management
- `POST /api/process` - Orchestrates conversion → summarization → storage
- `GET /api/status/[fileId]` - Real-time status polling
- `GET /api/documents` - Retrieve all documents with filtering/sorting
- `GET /api/export/[fileId]?format=json|markdown` - Export document summary

**Vector Search:**
- `POST /api/embeddings/search` - Semantic search across task embeddings
  - Request: `{ query: string, limit?: number, threshold?: number }`
  - Response time target: <500ms (95th percentile)

**Outcome Management:**
- `GET /api/outcomes` - Fetch active outcome statement
- `POST /api/outcomes` - Create or update outcome statement

**Reflections:**
- `POST /api/reflections` - Create quick reflection entry
- `GET /api/reflections?limit=20&tags=work` - Retrieve recent reflections

**Agent Orchestration:**
- `POST /api/agent/prioritize` - Trigger task prioritization agent
- `GET /api/agent/sessions/[sessionId]` - Get agent session details
- `GET /api/agent/sessions/latest` - Get latest agent session

**Cloud Sync (Phase 5):**
- `POST /api/cloud/google-drive/connect` - Initiate Google Drive OAuth flow
- `GET /api/cloud/google-drive/callback` - OAuth callback handler
- `POST /api/cloud/google-drive/select-folder` - Choose Drive folder to monitor
- `POST /api/webhooks/google-drive` - Webhook for Drive change notifications
- `POST /api/text-input` - Direct text input (Quick Capture)
- `GET /api/cloud-connections` - List user's cloud connections

**Maintenance:**
- `POST /api/cleanup?dryRun=true` - Manual cleanup trigger (deletes expired documents)

### Frontend Architecture

**Main Pages:**
- `app/page.tsx` - Upload UI with drag-and-drop, status polling, queue summary
- `app/dashboard/page.tsx` - Document grid with filtering, sorting, bulk export
- `app/priorities/page.tsx` - Agent-prioritized task view with reasoning traces

**Key Components:**
- `app/components/SummaryPanel.tsx` - Displays topics, decisions, actions, LNO tasks
- `app/components/OutcomeBuilder.tsx` - Modal form for outcome statements (draft recovery)
- `app/components/OutcomeDisplay.tsx` - Persistent banner showing active outcome
- `app/components/ReflectionPanel.tsx` - Quick-capture reflection interface
- `app/components/ReasoningTracePanel.tsx` - Agent reasoning visualization

**UI Library:** shadcn/ui components (install via `pnpm dlx shadcn@latest add <component>`)

### Design System

**Core Principles:**
- **No borders** - Use color contrast and shadows instead
- **Depth layers** - 4-layer system (`--bg-layer-1` through `--bg-layer-4`)
- **Two-layer shadows** - `.shadow-2layer-sm/md/lg`
- **Semantic colors** - Each has `*-bg`, `*-hover`, `*-text` variants
- **WCAG AA compliance** - 4.5:1 minimum contrast ratio

**If you need:**
- Color layer specifications → See `.claude/standards.md` lines 421-432
- Shadow system utilities → See `.claude/standards.md` lines 452-471
- Accessibility requirements → See `.claude/standards.md` lines 381-420
- ShadCN UI conventions → See `.claude/standards.md` lines 480-560

## Configuration

### Environment Variables

**Required variables** (create `.env.local` in project root):
```env
# Supabase (Database & Storage)
NEXT_PUBLIC_SUPABASE_URL=https://emgvqqqqdbfpjwbouybj.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_key_here
OPENAI_API_KEY=sk-proj-...
ENCRYPTION_KEY=32_byte_random_secret  # Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Optional variables:**
```env
# Development
NODE_ENV=development              # development | production | test
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Supabase (admin operations)
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key  # Only needed for admin operations
```

**Environment setup notes:**
- Get Supabase credentials from your project dashboard at https://supabase.com
- OpenAI API key required for `gpt-4o` model and `text-embedding-3-small`
- Service role key is optional (only needed for RLS bypass in development)
- Never commit `.env.local` to version control (already in `.gitignore`)

### TypeScript
- Path alias: `@/*` → project root
- Strict mode enabled
- Target: ES2017

### Supabase Setup
- **Storage Bucket:** `notes` (50MB limit, `application/*` and `text/*` MIME types)
- **RLS Policies:** Public access for P0 development
- **Migrations:** Apply manually via Supabase Dashboard → SQL Editor
- **pgvector:** Enabled in migration 007, IVFFlat index for 10K scale

## Design Principles

### 🚨 CRITICAL: Vertical Slice Development

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

### Core Architectural Principles

1. **Autonomous by Default** - No manual triggers, system operates via Sense → Reason → Act loop
2. **Deterministic Outputs** - Consistent JSON schemas with Zod validation
3. **Modular Architecture** - Decoupled services with clear interfaces
4. **Test-First Development** - TDD mandatory (automated tests currently blocked by FormData issue)
5. **Observable by Design** - Structured logging with metrics, errors, confidence scores

## Common Development Patterns

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

**If you need:**
- pdf-parse details → See `.claude/standards.md` lines 1028-1084
- FormData testing workaround → See `.claude/standards.md` lines 1046-1069
- Node.js setup → See `.claude/standards.md` lines 1086-1099
- AI hallucination prevention → See `.claude/standards.md` lines 1115-1148 (RESOLVED 2025-10-09)
- Edge case handling → See `.claude/standards.md` lines 1013-1024

## Agent Usage

**See `AGENTS.md` for repository-wide agent workflow.**

- **slice-orchestrator** - Feature implementation coordination (use for ALL features)
- **backend-engineer** - Backend services and API endpoints
- **frontend-ui-builder** - React components and UI integration
- **test-runner** - Test validation and coverage verification
- **code-reviewer** - Code quality review after implementation
- **debugger** - Error investigation and root cause analysis

**Workflow:** slice-orchestrator delegates to backend-engineer and frontend-ui-builder, then uses test-runner and code-reviewer for validation

## Performance Targets

- **Processing Time:** <8 seconds per document
- **Search Performance:** <500ms (95th percentile) for semantic search
- **Confidence Threshold:** ≥80% for auto-approval
- **Max File Size:** 10MB
- **Concurrent Processing:** Max 3 parallel uploads
- **Data Retention:** 30 days auto-cleanup (daily at 2 AM UTC)

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
2. Restart dev server (`pnpm dev`)
3. Check `processingQueue.ts` singleton initialized

## Resources

- **Implementation Status:** `IMPLEMENTATION_STATUS.md`
- **Standards & Patterns:** `.claude/standards.md`
- **System Rules:** `.claude/SYSTEM_RULES.md`
- **Agent Workflow:** `AGENTS.md`
- **Feature Specs:** `specs/*/spec.md`
- **Agent Transcripts:** `.claude/logs/`
- **Mobile QA:** `MOBILE_RESPONSIVENESS_REPORT.md`
