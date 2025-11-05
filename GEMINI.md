---
default_agent: slice-orchestrator
---

# GEMINI.md

This file provides guidance to Gemini when working with code in this repository.

**See `AGENTS.md` for repository-wide contributor workflow (structure, commands, commit expectations).**

**See `.gemini/standards.md` for universal standards that apply to all agents:**
- TypeScript & code quality rules
- TDD workflow (Red-Green-Refactor)
- Design system & ShadCN conventions
- Common development patterns
- Error handling standards
- Testing requirements
- Known issues & workarounds

**See `IMPLEMENTATION_STATUS.md` for detailed completion status of all features.**

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

**AI Note Synthesiser** — An autonomous agent that converts uploaded documents (PDF/DOCX/TXT) to Markdown, extracts structured insights using GPT-4o, generates vector embeddings for semantic search, and provides intelligent task prioritization through Mastra-powered agents.

**Tech Stack:** Next.js 15, React 19, TypeScript, Vercel AI SDK (OpenAI GPT-4o), Supabase (pgvector), Tailwind CSS v4, Mastra

**Core Pattern:** Sense → Reason → Act → Learn
- **Sense:** File upload detection
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
- `pnpm test` - Run tests in watch mode
- `pnpm test:ui` - Run tests with Vitest UI
- `pnpm test:run` - Run tests once (CI mode)
- `pnpm test:unit` - Run unit tests only
- `pnpm test:contract` - Run contract tests only
- `pnpm test:integration` - Run integration tests only

**Current Test Status:** 27/44 tests passing (61% pass rate)
- **Passing:** Component tests, database tests, schema validation, service logic
- **Blocked:** Upload API contract tests (FormData serialization issue in test environment)
- **Workaround:** Use manual testing guides (`T002_MANUAL_TEST.md`, `T004_MANUAL_TEST.md`, etc.)

### Utility Scripts
- `npx tsx scripts/test-mastra.ts` - Validate Mastra tool registry and telemetry
- `npx tsx scripts/run-semantic-search.ts` - Test semantic search manually
- `bash scripts/test-search-endpoint.sh` - Quick test of embedding search API

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

### Database Schema (Supabase)

**Core Tables:**
- `uploaded_files` - File metadata, status tracking, queue_position
- `processed_documents` - AI outputs, Markdown content, 30-day auto-expiry
- `task_embeddings` - Vector embeddings (1536-dim) with pgvector IVFFlat index
- `user_outcomes` - User-defined outcome statements
- `reflections` - Quick-capture reflections for context-aware reasoning
- `task_relationships` - Task dependencies (prerequisite/blocking/related)
- `agent_sessions` - Agent execution traces and reasoning steps
- `processing_logs` - Metrics, errors, retry attempts

**Storage Buckets:**
- `notes/` - Original uploaded files (hash-based naming)
- `notes/processed/` - Generated Markdown and JSON files

**Migrations:** `supabase/migrations/` (001-014) - Apply manually via Supabase Dashboard → SQL Editor

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

**See `.gemini/standards.md` for complete design system documentation.**

**Key Principles:**
- **No borders** - Use color contrast and shadows instead
- **Depth layers** - 4-layer system (`--bg-layer-1` through `--bg-layer-4`)
- **Two-layer shadows** - `.shadow-2layer-sm/md/lg`
- **Semantic colors** - Each has `*-bg`, `*-hover`, `*-text` variants
- **WCAG AA compliance** - 4.5:1 minimum contrast ratio

## Configuration

### Environment Variables
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

**See `.gemini/SYSTEM_RULES.md` for complete protocol**

### Core Architectural Principles

1. **Autonomous by Default** - No manual triggers, system operates via Sense → Reason → Act loop
2. **Deterministic Outputs** - Consistent JSON schemas with Zod validation
3. **Modular Architecture** - Decoupled services with clear interfaces
4. **Test-First Development** - TDD mandatory (automated tests currently blocked by FormData issue)
5. **Observable by Design** - Structured logging with metrics, errors, confidence scores

## Common Development Patterns

**See `.gemini/standards.md` for complete development patterns.**

**Quick Reference:**

**Adding API Endpoint:**
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

**React Hook Form Sync (defer getValues with setTimeout):**
```typescript
setTimeout(() => { const values = form.getValues(); }, 0);
```

## Known Issues & Workarounds

**See `.gemini/standards.md` for complete issue documentation.**

### pdf-parse Library
- **Issue:** Debug mode causes test file errors
- **Fix:** Automatic patch via `pnpm install` postinstall hook
- **Verify:** Check `node_modules/.pnpm/pdf-parse@1.1.1/node_modules/pdf-parse/index.js` has `isDebugMode = false`

### FormData Testing
- **Issue:** File properties become undefined in Vitest
- **Workaround:** Use manual testing guides (`T002_MANUAL_TEST.md`, etc.)
- **Status:** 27/44 tests passing (61% pass rate)

### Node.js Version
- **Required:** Node.js 20 (check `.nvmrc`)
- **Command:** `nvm use` before development

### AI Hallucination (RESOLVED)
- **Fix Date:** 2025-10-09
- **Solution:** OCR placeholder cleanup + meta-content detection + confidence penalty
- **Result:** Scanned PDFs marked `review_required`, no fabricated tasks

## Agent Usage

**See `AGENTS.md` for repository-wide agent workflow.**

- **slice-orchestrator** - Feature implementation coordination (use for ALL features)
- **backend-engineer** - Backend services and API endpoints
- **frontend-ui-builder** - React components and UI integration
- **test-runner** - Test validation and coverage verification
- **code-reviewer** - Code quality review after implementation
- **debugger** - Error investigation and root cause analysis

**Workflow:** slice-orchestrator delegates to backend-engineer and frontend-ui-builder, then uses test-runner and code-reviewer for validation

## Success Metrics

- **Autonomy:** 100% (zero manual triggers for upload/processing/cleanup)
- **Processing Time:** <8 seconds target
- **Search Performance:** <500ms (95th percentile) for semantic search
- **Confidence Threshold:** ≥80% for auto-approval
- **File Formats:** PDF, DOCX, TXT, Markdown
- **Max File Size:** 10MB
- **Data Retention:** 30 days auto-cleanup (daily at 2 AM UTC)
- **Concurrent Processing:** Max 3 parallel uploads with automatic queueing

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

### Outcome Statement
```typescript
{
  direction: 'increase' | 'decrease' | 'maintain' | 'launch' | 'ship',
  object_text: string,        // 3-100 chars
  metric_text: string,        // 3-100 chars
  clarifier: string,          // 3-150 chars
  assembled_text: string,     // Computed with grammar rules
  is_active: boolean          // Only one active outcome per user
}
```

**Assembly Formula:**
- Launch/Ship: `"{Direction} {object} by {metric} through {clarifier}"` (no "the" article)
- Others: `"{Direction} the {object} by {metric} through {clarifier}"`

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
- **Standards & Patterns:** `.gemini/standards.md`
- **System Rules:** `.gemini/SYSTEM_RULES.md`
- **Agent Workflow:** `AGENTS.md`
- **Feature Specs:** `specs/*/spec.md`
- **Agent Transcripts:** `.gemini/logs/`
- **Mobile QA:** `MOBILE_RESPONSIVENESS_REPORT.md`
