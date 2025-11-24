---
default_agent: slice-orchestrator
---

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Start

**First steps:**
1. **READ `.claude/SYSTEM_RULES.md` FIRST** - Mandatory vertical slice protocol (SEE → DO → VERIFY)
2. Verify Node 20+: `nvm use`
3. Run tests: `pnpm test:run`
4. Check current work: `git status` and look at `specs/*/tasks.md` for active feature

**Common tasks:**
- Add new feature → `/specify` → `/plan` → `/tasks` → `/implement`
- Fix failing test → Check `.claude/logs/debug-*.md`, use `debugger` agent
- Debug issue → `debugger` agent for diagnosis, then `slice-orchestrator` for fix

**Critical files:**
- `.claude/SYSTEM_RULES.md` - Vertical slice protocol (MANDATORY)
- `.claude/standards.md` - TypeScript, TDD, design system standards
- `AGENTS.md` - Repository workflow, commit guidelines
- `IMPLEMENTATION_STATUS.md` - Feature completion status

## Commands

```bash
# Development
pnpm dev             # Start dev server → http://localhost:3000
pnpm build           # Build for production
pnpm lint            # Run ESLint (-- --fix to auto-correct)
nvm use              # Switch to Node 20+ (from .nvmrc)

# Testing
pnpm test            # Watch mode (TDD)
pnpm test:run        # CI mode - all tests once
pnpm test:ui         # Vitest UI dashboard
pnpm test:run <file> # Specific test file
pnpm test:run lib/services/__tests__/    # Unit tests
pnpm test:run __tests__/contract/        # Contract tests
pnpm test:run __tests__/integration/     # Integration tests

# Utilities
npx tsx scripts/test-mastra.ts           # Validate Mastra tool registry
npx tsx scripts/check-database-tasks.ts  # Verify task embeddings

# Feature workflow (slash commands)
/specify "feature description"  # Create specification
/plan                           # Generate implementation plan
/tasks                          # Break into vertical slice tasks
/implement                      # Execute implementation
/analyze                        # Cross-artifact consistency check
```

## Agent Selection

```
Feature implementation?     → slice-orchestrator (default)
  └→ Delegates to backend-engineer + frontend-ui-builder
  └→ Auto-runs test-runner + code-reviewer

Error investigation?        → debugger (diagnosis only)
  └→ Then slice-orchestrator for fix

Code review only?           → code-reviewer
Type system design?         → typescript-architect
```

**Rules:**
- ALWAYS use `slice-orchestrator` for feature work
- TDD: Write failing test FIRST, then implement
- NEVER mark complete without user journey test

## Git Workflow

**Branch naming:** `001-feature-name`, `002-feature-name` (numbered sequentially)
**Spec-driven:** Each feature has `specs/001-feature-name/` directory

## Project Overview

**AI Note Synthesiser** — Autonomous document intelligence that ingests documents (PDF/DOCX/TXT), converts to Markdown, extracts structured insights via GPT-4o, generates vector embeddings for semantic search, and provides intelligent task prioritization through Mastra-powered agents.

**Tech Stack:**
- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS v4, shadcn/ui
- **Backend**: Vercel AI SDK (OpenAI GPT-4o), Supabase (PostgreSQL + pgvector), Mastra
- **External**: Google Drive API, pdf-parse, mammoth, Tesseract.js (OCR)

**Package Manager:** pnpm (not npm) | **Node:** 20+ required (`nvm use`)

## Architecture

```
Upload → Convert → AI Extract → Embed → Display
  ↓        ↓           ↓          ↓        ↓
/api/   noteProcessor aiSummarizer pgvector SummaryPanel
```

**Key Services** (`lib/services/`):
- `noteProcessor.ts` - PDF/DOCX/TXT → Markdown (OCR fallback)
- `aiSummarizer.ts` - GPT-4o extraction with Zod schemas
- `processingQueue.ts` - Max 3 concurrent, FIFO queue
- `embeddingService.ts` - OpenAI text-embedding-3-small (1536-dim)

**Mastra Tools** (`lib/mastra/tools/`):
- `semanticSearch.ts`, `detectDependencies.ts`, `clusterBySimilarity.ts`
- `suggestBridgingTasks.ts` - Gap filling for task plans

**Main Pages:**
- `app/page.tsx` - Upload UI with drag-and-drop
- `app/dashboard/page.tsx` - Document grid, filtering, export
- `app/priorities/page.tsx` - Agent-prioritized tasks with reasoning

**UI Library:** shadcn/ui (`npx shadcn@latest add <component>`)

## Database

**Core Tables** (Supabase PostgreSQL):
- `uploaded_files` - File metadata, status, queue_position
- `processed_documents` - AI outputs, Markdown, 30-day auto-expiry
- `task_embeddings` - Vector embeddings (1536-dim) with pgvector IVFFlat index
- `user_outcomes` - User-defined outcome statements
- `reflections` - Quick-capture reflections
- `agent_sessions` - Agent execution traces

**Storage:** `notes/` bucket (original files, hash-based naming)
**Migrations:** `supabase/migrations/`

**Supabase Clients:**
- `lib/supabase/client.ts` → Browser (Client Components)
- `lib/supabase/server.ts` → Server with cookies (API routes)
- `lib/supabase/admin.ts` → Admin with service_role (webhooks only)

## Common Errors & Fixes

**"ENOENT: ./test/data/05-versions-space.pdf"**
- pdf-parse patch didn't apply → `pnpm install` (re-runs postinstall)

**"File properties undefined in FormData"**
- Vitest + Next.js issue → Use manual tests in `specs/*/T*_MANUAL_TEST.md`

**"Task embeddings table does not exist"**
- Missing migrations → `supabase db push`

**"Module not found: @/..."**
- Restart TS server → VSCode: Cmd/Ctrl+Shift+P → "TypeScript: Restart TS Server"

**Empty task list on /priorities**
- Missing `SUPABASE_SERVICE_ROLE_KEY` → Add to `.env.local`, restart `pnpm dev`

**Embeddings not generating**
- Check `OPENAI_API_KEY` is set, verify migrations with `supabase db push`

## Configuration

**Required** (`.env.local`):
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
OPENAI_API_KEY=sk-proj-...
ENCRYPTION_KEY=32_byte_hex  # node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**TypeScript:** Strict mode, path alias `@/*` → project root

## Design Principles

**Vertical Slice Development (MANDATORY):**
Every task must deliver something a user can SEE, DO, and VERIFY. Read `.claude/SYSTEM_RULES.md`.

**Architectural Principles:**
- Autonomous by default - Sense → Reason → Act loop
- Deterministic outputs - Zod validation on all schemas
- TDD mandatory - Write failing test first
- Observable by design - Structured logging

**Design System:**
- No borders - Use color contrast and shadows (`--bg-layer-1` through `--bg-layer-4`)
- Two-layer shadows - `.shadow-2layer-sm/md/lg`
- WCAG AA compliance - 4.5:1 minimum contrast
- Full reference: `.claude/standards.md` (Design System section)

## Key Patterns

**Supabase relationship queries** - Normalize before accessing:
```typescript
const processedDoc = Array.isArray(fileData.processed_documents)
  ? fileData.processed_documents[0]
  : fileData.processed_documents;
```

**React Hook Form state sync** - Defer with setTimeout:
```typescript
setTimeout(() => { const values = form.getValues(); saveDraft(values); }, 0);
```

**Full patterns:** `.claude/standards.md` (Common Development Patterns section)

## Performance Targets

- Document processing: <8s
- Semantic search: <500ms (95th percentile)
- Max file size: 10MB
- Concurrent uploads: Max 3, auto-queued
- Data retention: 30 days

## Resources

- `.claude/SYSTEM_RULES.md` - Vertical slice protocol (READ FIRST)
- `.claude/standards.md` - TypeScript, TDD, design system
- `AGENTS.md` - Repository workflow, commit guidelines
- `specs/*/spec.md` - Feature specifications
- `IMPLEMENTATION_STATUS.md` - Completion status
