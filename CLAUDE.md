# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**AI Note Synthesiser** — An autonomous agent that detects uploaded note files, converts them to Markdown, summarises content, and extracts structured data without manual intervention.

**Tech Stack:** Next.js 15, React 19, TypeScript, Vercel AI SDK, Supabase, Tailwind CSS v4

**Core Pattern:** Sense → Reason → Act loop
- **Sense:** File detection via upload or Supabase triggers
- **Reason:** Convert to Markdown → Summarise → Extract structured data
- **Act:** Store JSON + MD outputs, display success feedback
- **Learn:** Log metrics (hash, duration, confidence)

## Development Commands

### Core Commands
- **Start development server**: `npm run dev` (http://localhost:3000)
- **Build for production**: `npm run build`
- **Start production server**: `npm run start`
- **Run linter**: `npm run lint`

### Workflow Commands (.specify)
- `/plan` - Create implementation plan from feature spec
- `/specify` - Create feature specification from description
- `/tasks` - Generate **slice-based** task list (UI + Backend + Data + Feedback per task)
- `/clarify` - Identify underspecified areas in spec
- `/constitution` - Create/update project constitution
- `/implement` - Execute implementation plan using slice-orchestrator

**Note:** `/tasks` now generates vertical slice tasks (not layer-based). Each task includes user story, complete implementation scope (UI→Backend→Data→Feedback), and test scenario.

## Architecture

### Project Structure
```
app/                    # Next.js App Router
├── layout.tsx          # Root layout with Geist fonts
├── page.tsx            # Home page (upload UI with mock data)
├── globals.css         # Global Tailwind styles
└── api/
    ├── test-supabase/  # Supabase connection test endpoint
    ├── setup-storage/  # Storage bucket creation (RLS issues)
    └── upload-test/    # File upload test endpoint (working)

components/
├── ui/                 # shadcn/ui components
│   ├── button.tsx
│   ├── card.tsx
│   ├── badge.tsx
│   ├── dropdown-menu.tsx
│   ├── scroll-area.tsx
│   └── separator.tsx
├── theme-provider.tsx
└── theme-toggle.tsx

lib/
├── utils.ts            # Tailwind cn() utility
└── supabase.ts         # Supabase client initialization

docs/
├── supabase-setup.md       # Supabase configuration guide
└── supabase-rls-policies.sql # RLS policies for storage

.specify/
├── memory/
│   └── constitution.md # Project principles (v1.0.0)
├── templates/          # Spec, plan, task templates
└── scripts/bash/       # Workflow automation scripts
```

### Key Processing Pipeline
1. **File Detection:** ✅ Browser upload UI ready, Supabase triggers pending
2. **Conversion:** ⏳ PDFs, DOCX, TXT → Markdown (Unified Parser - not implemented)
3. **Summarisation:** ⏳ Vercel AI SDK extracts `{ topics, decisions, actions, LNO tasks }` (not implemented)
4. **Storage:** ✅ Supabase storage bucket configured with RLS policies
5. **Feedback:** ⏳ Console logs + UI confirmation (mock data only)

**Implementation Status:**
- ✅ Frontend UI complete with drag-and-drop upload, topics, decisions, actions, LNO task columns
- ✅ Supabase connection established (`lib/supabase.ts`)
- ✅ Storage bucket `notes` created with RLS policies for public access
- ✅ File upload API endpoint working (`/api/upload-test`)
- ⏳ File conversion pipeline (PDF/DOCX/TXT → MD) pending
- ⏳ AI summarization integration pending
- ⏳ Database schema for storing processed results pending
- ⏳ Frontend-backend integration pending

### TypeScript Configuration
- Path alias `@/*` → root directory
- Strict mode enabled
- Target: ES2017
- Module resolution: bundler

### Data Structure (Output)
```json
{
  "topics": ["..."],
  "decisions": ["..."],
  "actions": ["..."],
  "lno_tasks": {
    "leverage": ["..."],
    "neutral": ["..."],
    "overhead": ["..."]
  }
}
```

## Key Files & Modules

### Implemented
- **`app/page.tsx`:** Main UI with file upload, topics, decisions, actions, and LNO task columns (currently mock data)
- **`lib/supabase.ts`:** Supabase client using publishable key from environment variables
- **`app/api/upload-test/route.ts`:** Working file upload endpoint that stores files in Supabase `notes` bucket
- **`app/api/test-supabase/route.ts`:** Connection health check endpoint
- **`components/ui/*`:** shadcn/ui components (install via `pnpm dlx shadcn@latest add <component>`)
- **`lib/utils.ts`:** Tailwind merge utility function
- **`docs/supabase-setup.md`:** Supabase configuration guide with RLS policy instructions
- **`docs/supabase-rls-policies.sql`:** SQL for public access policies on storage bucket

### Pending Implementation
- **Unified Parser:** Document conversion layer (PDF/DOCX/TXT → MD)
- **AI SDK Integration:** Summarisation with retry logic on invalid JSON
- **Database Schema:** Tables for storing processed summaries and metadata
- **Error Handling:** Log errors to Supabase + console; retry once with adjusted prompt
- **Frontend Integration:** Connect upload UI to actual backend processing

## Design Principles

### UI/Frontend
- **Always use shadcn over custom components**
- **Install components via CLI:** `pnpm dlx shadcn@latest add <component>`
- **Use standard Tailwind/shadcn colours** - Never use inline custom colours
- **Theme support:** Dark/light mode via `next-themes`

### Core Principles (Constitution v1.0.0)
The project follows strict architectural principles defined in `.specify/memory/constitution.md`:

1. **Autonomous by Default:** No manual "summarise" button - system operates via Sense → Reason → Act loop
2. **Deterministic Outputs:** Consistent JSON schemas with validation and retry logic
3. **Modular Architecture:** Decoupled components with clear interfaces
4. **Test-First Development (NON-NEGOTIABLE):** TDD mandatory for all features
5. **Observable by Design:** Structured logging with metrics, errors, and confidence scores

**Development Workflow:** Use `/plan` → `/tasks` → `/implement` commands following TDD principles

### 🚨 CRITICAL: Slice-Based Development (SYSTEM_RULES.md)
**EVERY code change MUST deliver complete user value:**

**The Three Laws:**
1. **SEE IT** → Visible UI change or feedback
2. **DO IT** → Interactive capability user can trigger
3. **VERIFY IT** → Observable outcome confirming it worked

**Mandatory Workflow:**
- **Step 0:** Define user story, identify UI component + backend endpoint, confirm user can test
- **Step 1:** Use `slice-orchestrator` agent for ALL feature implementation
- **Step 2:** TDD enforcement (failing test FIRST, then implement, then review)
- **Step 3:** Complete ONLY when user can demo the feature end-to-end

**FORBIDDEN:**
- ❌ Backend-only or frontend-only tasks
- ❌ Infrastructure tasks without user value
- ❌ Skipping failing test phase
- ❌ Tasks that can't be demoed to non-technical person

**See `.claude/SYSTEM_RULES.md` for complete protocol**

### Technical
- **Local-first:** Minimal external dependencies
- **Modular:** Ready for future RAG/memory integration
- **Error visibility:** Console logs + Supabase storage

## Scope Guardrails

**In Scope:**
- File detection, conversion, summarisation, JSON/MD output
- Local Supabase triggers
- Basic browser-based upload UI

**Out of Scope:**
- Multi-user features, collaboration, tagging UI
- External integrations (Slack, Notion)
- RAG or memory retrieval
- Multi-language support

## Edge Cases

| Case | Expected Behaviour |
|------|-------------------|
| Invalid file format | Log error, skip processing |
| Unreadable PDF | Attempt OCR fallback (Tesseract), else skip |
| LLM returns invalid JSON | Retry with adjusted prompt parameters |
| Low-confidence summary | Mark as "review required" in logs |
| Duplicate file name | Overwrite or append hash suffix |

## Success Metrics

- Autonomy: 100% (no clicks required)
- File detection reliability: ≥ 95%
- Summarisation accuracy: ≥ 85%
- Output completeness: 100%
- Avg. processing time: < 8s

## Configuration Files

- `next.config.ts` — Next.js configuration
- `eslint.config.mjs` — ESLint with Next.js rules
- `tsconfig.json` — TypeScript compiler options (path alias `@/*`, strict mode, ES2017)
- `postcss.config.mjs` — PostCSS for Tailwind
- `package.json` — Dependencies and scripts (uses npm, not pnpm for core commands)
- `.env.local` — Environment variables (not in git):
  ```
  NEXT_PUBLIC_SUPABASE_URL=https://emgvqqqqdbfpjwbouybj.supabase.co
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_key_here
  ```

## Supabase Setup

The project uses Supabase for file storage. Setup is complete:

1. **Storage Bucket:** `notes` bucket created with 50MB limit
2. **RLS Policies:** Public access policies applied (see `docs/supabase-rls-policies.sql`)
3. **Allowed MIME Types:** PDF, DOCX, TXT, Markdown

### Testing Supabase

```bash
# Test connection
curl http://localhost:3000/api/test-supabase

# Test file upload
curl -X POST -F "file=@/path/to/file.pdf" http://localhost:3000/api/upload-test
```

**Note:** The `/api/setup-storage` endpoint has RLS issues when trying to create buckets programmatically. Use Supabase Dashboard instead.

## Important Notes

- **Current Implementation:** Frontend UI complete with mock data. File upload to Supabase working. Processing pipeline (conversion, AI summarization) not yet implemented.
- **Testing:** No test framework configured yet (TDD principle requires setup before implementing processing pipeline)
- **Active Feature:** P0 Thinnest Agentic Slice (see `specs/001-prd-p0-thinnest/tasks.md`)
  - T001 [SLICE]: User uploads file → automatic processing starts
  - T002 [SLICE]: User sees AI summary appear automatically
  - T003 [SLICE]: User views dashboard with processed notes
  - Tasks are **vertical slices** - each delivers complete user value (UI + Backend + Data + Feedback)

## Task Structure (Slice-Based)

Example task format from `specs/001-prd-p0-thinnest/tasks.md`:

```
T001 [SLICE] User uploads note file and sees processing begin automatically

User Story: As a knowledge worker, I can drag-and-drop a PDF to upload it
and immediately see automatic processing begin without manual intervention

Implementation Scope:
- UI (app/page.tsx): Drag-drop zone, validation, progress, status badge
- Backend (app/api/upload/route.ts): Validation, hash generation, storage,
  trigger processing
- Data: Supabase storage + uploaded_files table
- Feedback: Toast notification, status badge, console logs

Test Scenario: [8 verification steps for end-to-end journey]
```

**Key Difference from Traditional Tasks:**
- ❌ Old: "Create User model" (backend-only)
- ✅ New: "User uploads file and sees processing start" (complete slice)

Each task must be demoable to a non-technical person showing SEE → DO → VERIFY.
