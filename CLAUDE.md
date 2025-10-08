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

### Database Schema (Supabase)

**Tables:**
- `uploaded_files` - File metadata, status tracking
- `processed_documents` - AI outputs, Markdown content, 30-day auto-expiry
- `processing_logs` - Metrics, errors, retry attempts

**Storage:**
- `notes/` - Original uploaded files (hash-based naming)
- `notes/processed/` - Generated Markdown and JSON files

### API Endpoints

- `POST /api/upload` - File upload with validation, deduplication, automatic processing trigger
- `POST /api/process` - Orchestrates conversion → summarization → storage pipeline
- `GET /api/status/[fileId]` - Real-time status polling for frontend
- `GET /api/test-supabase` - Connection health check (dev only)

### Frontend Architecture

**Main Components:**
- `app/page.tsx` - Upload UI with status polling (2s interval), SummaryPanel integration
- `app/components/SummaryPanel.tsx` - Displays topics, decisions, actions, LNO tasks in 3 columns

**shadcn/ui Components:**
- Install via: `pnpm dlx shadcn@latest add <component>`
- Never create custom components when shadcn exists
- Standard Tailwind colors only (no inline custom colors)

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

Apply migrations manually via Supabase Dashboard → SQL Editor

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

### ✅ T002 - AI Summary Display (BACKEND COMPLETE - Frontend Testing In Progress)
- File processing service (PDF/DOCX/TXT → Markdown) ✅
- AI summarization service (GPT-4o) ✅
- Processing orchestration endpoint ✅
- Status polling endpoint ✅
- SummaryPanel component with real-time updates ✅
- Backend Status: **PRODUCTION-READY** (verified with Class 07.pdf: 262KB, 15s processing, 100% confidence)
- Frontend Status: **NEEDS MANUAL VERIFICATION** (UI display, polling behavior, toast notifications)
- Testing: See `T002_MANUAL_TEST.md` for comprehensive manual test scenarios
- Known Issue: pdf-parse library fixed with `scripts/patch-pdf-parse.js` patch

### ⏳ T003 - Dashboard View (PENDING)
- Grid layout with all processed files
- Filtering and sorting
- Quick preview and expansion

## Data Structure (AI Output)

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

## Testing

### Test Framework: Vitest
- Contract tests: Validate API contracts and schemas
- Integration tests: End-to-end user journeys
- Component tests: React components with Testing Library

### Current Test Status
- **Automated tests:** 23/38 passing (15 blocked by test environment limitations)
- **Blockers:**
  - FormData serialization: File properties (name, type, size) become undefined when passed through Next.js Request.formData() in test environment
  - Root cause: Incompatibility between undici's FormData and Next.js API route handlers in Vitest
- **Workaround:** Manual testing via `T002_MANUAL_TEST.md` (comprehensive test scenarios documented)
- **Tests passing:** Component tests, database tests, schema validation
- **Tests blocked:** Upload contract tests, processing integration tests (require FormData)

### Test Files Structure
```
__tests__/
├── setup.ts                           # Test environment setup
├── contract/
│   ├── upload.test.ts                 # Upload API contract tests
│   └── process.test.ts                # Processing API contract tests
├── integration/
│   ├── upload-flow.test.ts            # Upload user journey
│   └── summary-flow.test.ts           # Summary display journey
└── app/components/__tests__/
    └── SummaryPanel.test.tsx          # Component tests
```

## Edge Cases & Error Handling

| Case | Behavior |
|------|----------|
| Unsupported file format | Return 400 with descriptive error |
| File >10MB | Return 400 "FILE_TOO_LARGE" |
| Duplicate file (same hash) | Return 409 "DUPLICATE_FILE" |
| Unreadable PDF | OCR fallback (placeholder), mark for review |
| Invalid AI JSON | Retry once with adjusted parameters |
| Confidence <80% | Mark as "review_required" status |
| Processing >8s | Continue processing but log warning |

## Success Metrics

- **Autonomy:** 100% (zero manual triggers)
- **Processing Time:** <8 seconds target
- **Confidence Threshold:** ≥80% for auto-approval
- **File Formats:** PDF, DOCX, TXT, Markdown
- **Max File Size:** 10MB
- **Data Retention:** 30 days auto-cleanup

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
