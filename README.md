# Pacenotes

An autonomous document intelligence workspace that helps users get to their destination by distilling meeting notes and research files into actionable insights and prioritising the next best tasks.

## Contents
- [Highlights](#highlights)
- [System Overview](#system-overview)
- [How It Works](#how-it-works)
- [Agent Instructions & Tools](#agent-instructions--tools)
- [Getting Started](#getting-started)
- [Development & Quality](#development--quality)
- [Project Structure](#project-structure)
- [Deployment](#deployment)
- [Resources](#resources)

## Highlights
- Multi-format ingestion (PDF, DOCX, TXT, Markdown) with deduplication and OCR fallback.
- Optional Google Drive integration for seamless document sync.
- Outcome-aware scoring blends AI summaries with the current strategic outcome and reflections.
- Mastra-powered agent orchestrates prioritisation using semantic search, dependency detection, and clustering tools.
- Document-aware prioritization with source transparency and selective inclusion/exclusion controls.
- Realtime dashboard surfaces document status, queue load, and prioritised plans.
- Built with Next.js 15, React 19, Tailwind CSS v4, and Supabase for storage, vector search, and telemetry.

## System Overview

**Current Development Phase**: Phase 18 - Manual Task Creation & Placement
- Manual task placement with agent-driven status badges and discard/override flows
- Duplicate detection with conflict warnings and force-create option
- Outcome change invalidates manual tasks into discard pile (soft delete, 30-day recovery)
- 1.2x impact boost for manual tasks during reprioritization
- Vector embeddings with pgvector for semantic search (<500ms)
- Mastra-powered agent tools (semantic search, dependency detection, clustering)
- Agent orchestration with tool execution and result parsing
- Task relationship graph and prioritization intelligence

### Frontend
- App Router in `app/` renders the upload flow (`app/page.tsx`), dashboard (`app/dashboard/page.tsx`), and priorities view (`app/priorities/page.tsx`).
- UI primitives live in `app/components/` and `components/ui/`, using shadcn + Radix.
- Client-side polling keeps file status fresh via `/api/status` and `/api/agent/sessions` endpoints.

### Backend & Data
- API routes under `app/api/` handle uploads, processing, exports, and agent control planes.
- Supabase stores raw uploads (`storage/notes`), structured outputs (`processed_documents`), task embeddings, outcomes, reflections, and agent sessions.
- Service layer in `lib/services/` converts files, calls OpenAI, filters actions, computes embeddings, and manages concurrency.

### Agentic Layer (Mastra)
- `lib/mastra/agents/taskOrchestrator.ts` defines the Task Orchestration Agent, its behaviour contract, and tool usage rules.
- Tools are registered in `lib/mastra/tools/index.ts` and instrumented through `lib/mastra/init.ts` for telemetry defined in `lib/mastra/config.ts`.
- `lib/mastra/services/agentOrchestration.ts` assembles context, launches the agent run, normalises the trace, and persists results back to Supabase.

## How It Works
### Document Intake & Synthesis
1. **Upload & Validation** – `app/api/upload/route.ts` validates file size/type, computes a content hash, stores the blob in Supabase, and enqueues the job via `lib/services/processingQueue.ts` (max three concurrent conversions).
2. **Processing Trigger** – background workers call `app/api/process/route.ts`, which loads metadata and the binary asset, flips document status to `processing`, and logs the run.
3. **Format Normalisation** – `lib/services/noteProcessor.ts` converts PDF/DOCX/TXT to Markdown, applying OCR fallback when native text is thin.
4. **AI Extraction** – `lib/services/aiSummarizer.ts` drives OpenAI to extract topics, decisions, actions, and metrics, with retry handling for invalid JSON and forced test flags.
5. **Outcome Scoring & Filtering** – `scoreActionsWithSemanticSimilarity` in `lib/services/aiSummarizer.ts` ranks actions against the active outcome from `user_outcomes`; `lib/services/filteringService.ts` trims actions that exceed capacity or violate state preferences.
6. **Embeddings & Storage** – `lib/services/embeddingService.ts` and `lib/services/embeddingQueue.ts` build task embeddings, store them through `lib/services/vectorStorage.ts`, and update Supabase tables (`task_embeddings`, `processed_documents`).
7. **Dashboard Surface** – the dashboard (`app/dashboard/page.tsx`) reads document status via `/api/documents`, exports via `/api/export`, and shares queue telemetry from `app/api/status/route.ts`.

### Outcome-Driven Task Prioritisation
1. **Trigger** – POST `/api/agent/prioritize` (`app/api/agent/prioritize/route.ts`) validates the active outcome, opens an `agent_sessions` record, and schedules orchestration.
2. **Context Assembly** – `lib/mastra/services/agentOrchestration.ts` gathers the active outcome, recent reflections (`lib/services/reflectionService.ts`), and up to 200 candidate tasks sourced from embeddings or raw structured outputs.
3. **Agent Instructions** – `taskOrchestratorAgent` in `lib/mastra/agents/taskOrchestrator.ts` receives a strict instruction block covering reasoning cadence, tool parameter schemas, and expected JSON output.
4. **Tool Execution** – Tools defined in `lib/mastra/tools/*.ts` (semantic search, document context, dependency detection, clustering, graph query) are auto-registered via `lib/mastra/init.ts`; telemetry spans capture retries, latency, and outputs.
5. **Result Parsing** – `lib/mastra/services/resultParser.ts` validates agent JSON, repairs partial traces, computes execution metadata, and persists an ordered plan + execution waves back to the originating session.
6. **Session Consumption** – The client polls `/api/agent/sessions/[sessionId]` and `/api/agent/sessions/latest` to show progress, fallback plans, or surfaced errors, and stores execution metrics for analytics.

## Agent Instructions & Tools
### Instruction Sources
- `lib/mastra/agents/taskOrchestrator.ts` – canonical prompt for the prioritisation agent, including mandatory behaviours and schema expectations.
- `AGENTS.md` – repository-level guardrails covering directory layout, testing guidance, and security posture for any new agent work.
- `specs/` – feature specs and planning artifacts referenced during orchestration to capture business rules; see `specs/` files for requirement IDs.
- `.claude/` – archived agent transcripts that can be replayed when diagnosing regressions or tuning reasoning strategies.

### Tool Registry Snapshot
| Tool | Location | Purpose |
| --- | --- | --- |
| `semantic-search` | `lib/mastra/tools/semanticSearch.ts` | Finds the most relevant tasks and embeddings for an outcome query. |
| `get-document-context` | `lib/mastra/tools/getDocumentContext.ts` | Fetches Markdown/context chunks for selected task IDs. |
| `detect-dependencies` | `lib/mastra/tools/detectDependencies.ts` | Infers prerequisite chains between tasks using AI and stored metadata. |
| `query-task-graph` | `lib/mastra/tools/queryTaskGraph.ts` | Reads previously persisted relationships to avoid redundant inference. |
| `cluster-by-similarity` | `lib/mastra/tools/clusterBySimilarity.ts` | Groups tasks into execution waves based on semantic similarity thresholds. |

### Working With Mastra
- Telemetry: `lib/mastra/config.ts` enables console telemetry with rate limits and slow-run alerts; instrumentation lives in `lib/mastra/init.ts`.
- Quick health check: `npx tsx scripts/test-mastra.ts` ensures tools register correctly and telemetry emits traces.
- Contract tests: `__tests__/contract/mastra-tools.test.ts` and `__tests__/integration/tool-execution.test.ts` (see repository guidelines) mirror runtime expectations for the agent layer.

## Getting Started
### Prerequisites
- **Node.js 20+** (required for native File API) – use `nvm use` to switch
- **pnpm** (package manager) – install with `npm install -g pnpm`
- **Supabase project** with:
  - Storage bucket `notes`
  - Postgres schema from `supabase/migrations/`
  - pgvector extension enabled
- **OpenAI API key** with access to GPT-4o (or GPT-4)

### Installation
1. Clone the repository and move into the workspace.
   ```bash
   git clone <repository-url>
   cd notes
   pnpm install
   ```
2. Copy environment defaults and supply credentials.
   ```bash
   cp .env.local.example .env.local
   ```

   Required variables:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   OPENAI_API_KEY=your_openai_api_key
   ENCRYPTION_KEY=32_byte_random_secret
   ```
   Generate the encryption key with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and store it securely.

   Optional variables (for Google Drive integration):
   ```env
   GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
   ```

3. Apply database migrations using the Supabase CLI (≥1.188).
   ```bash
   supabase db push
   # or
   supabase migration up
   ```
   Ensure the `notes` storage bucket is created (`supabase/migrations/20241004082124_create-notes-bucket.sql`).

4. Start the development server.
   ```bash
   pnpm dev
   ```
   Visit `http://localhost:3000` to upload documents and monitor prioritisation sessions.

## Development & Quality

### Commands
- `pnpm dev` – Start development server (http://localhost:3000)
- `pnpm build` – Build for production
- `pnpm start` – Start production server
- `pnpm lint` – ESLint + Prettier (TypeScript strict mode)
- `pnpm test` – Vitest in watch mode (TDD)
- `pnpm test:run` – Run tests once (CI mode)
- `pnpm test:ui` – Vitest UI dashboard
- `pnpm test:run <file>` – Run specific test file

### Testing Guidelines
- Unit tests sit alongside services/components; contract and integration suites live in `__tests__/contract/` and `__tests__/integration/` respectively.
- Target ≥80% coverage, adding regression specs for every bug fix or retry logic tweak.
- Supabase-dependent tests require `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; mock external APIs where possible.
- Integration specs that stress Tinypool threads: `pnpm test:run -- --pool=threads --poolOptions.threads.minThreads=1 --poolOptions.threads.maxThreads=1`
- Explorer scripts live in `scripts/` (e.g. `scripts/test-mastra.ts` for agent health)

**Known Testing Limitations:**
- FormData serialization in Vitest requires manual testing for file uploads (see `.claude/testing/T*_MANUAL_TEST.md`)
- Core logic is fully tested; end-to-end upload flows validated manually

### Development Workflow
This project uses a spec-driven workflow with custom slash commands:
1. `/specify "feature description"` – Create feature specification
2. `/plan` – Generate implementation plan
3. `/tasks` – Break down into vertical slice tasks
4. `/implement` – Execute tasks with TDD
5. `/analyze` – Validate cross-artifact consistency

See `CLAUDE.md` for full workflow details.

## Project Structure
```
notes/
├── app/                      # Next.js App Router, API routes, and shared UI
│   ├── api/                  # Upload, process, export, agent, status endpoints
│   ├── components/           # Feature-specific UI blocks
│   ├── dashboard/            # Document management dashboard
│   └── priorities/           # Task prioritization with agent orchestration
├── lib/
│   ├── mastra/               # Agents, tool registry, orchestration services
│   ├── services/             # File conversion, AI summarisation, embeddings, queues
│   ├── schemas/              # Zod schemas + helpers
│   └── hooks/                # Client-side data hooks
├── .claude/                  # Agent workspace
│   ├── agents/               # Agent definitions
│   ├── state/                # Task state tracking
│   ├── docs/                 # Implementation plans
│   ├── logs/                 # Test results, debug reports
│   └── reviews/              # Code review outputs
├── .specify/                 # Spec-driven workflow
│   ├── specs/                # Feature specifications
│   ├── templates/            # Workflow templates
│   └── memory/               # Project constitution
├── __tests__/                # Contract + integration suites
├── specs/                    # Feature specs & runbooks
├── supabase/                 # SQL migrations and storage policies
├── docs/                     # Additional guidance and design notes
└── scripts/                  # Mastra diagnostics and utilities
```

## Deployment

### Quick Deploy to Vercel
1. Configure environment variables in Vercel dashboard:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `OPENAI_API_KEY`
   - `ENCRYPTION_KEY` (generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)

2. Deploy:
   ```bash
   pnpm build
   ```
   Vercel is the recommended platform (Next.js 15 native support).

3. Apply Supabase migrations:
   ```bash
   supabase db push
   ```

4. Ensure Supabase Row Level Security policies mirror the migrations in `supabase/migrations/` to protect uploaded assets and agent traces.

**Alternative Platforms:** Netlify, Railway, DigitalOcean App Platform, and AWS Amplify are also supported.

## Resources

### Documentation
- **CLAUDE.md** – Quick start guide for Claude Code instances (start here!)
- **AGENTS.md** – Repository workflow, commit guidelines, testing standards
- **IMPLEMENTATION_STATUS.md** – Feature completion status and roadmap
- **.claude/SYSTEM_RULES.md** – Vertical slice protocol (mandatory reading)
- **.claude/standards.md** – TypeScript, TDD, design system, common patterns

### Specifications & Planning
- `specs/` – Feature specifications and runbooks
- `.claude/` – Agent transcripts & debugging context
- `.specify/` – Spec-driven workflow templates and memory

### Design & QA
- `design.json` / `design/design-system.json` – Visual language and component guidelines
- `MOBILE_RESPONSIVENESS_REPORT.md` – Mobile QA baselines
- `VISUAL_COMPARISON.md` – Visual regression tracking
- `IMPLEMENTATION_EXAMPLES.md` – Code patterns and examples

### Alternative AI Providers
- **GEMINI.md** – Google Gemini integration guide
- **QWEN.md** – Qwen model integration guide

### Utilities & Troubleshooting
- `npx tsx scripts/test-mastra.ts` – Validate Mastra tool registry and telemetry
- `npx tsx scripts/check-database-tasks.ts` – Verify task embeddings

**Common Issues:**
- **pdf-parse errors after install:** Run `pnpm install` to trigger postinstall patch
- **Empty task list:** Ensure `SUPABASE_SERVICE_ROLE_KEY` is set in `.env.local`
- **Embeddings not generating:** Verify `OPENAI_API_KEY` is set and run `supabase db push` to apply migrations
- **Module not found:** Restart TypeScript server (VSCode: Cmd/Ctrl+Shift+P → "TypeScript: Restart TS Server")

---
Built with ❤️ using Next.js 15, React 19, TypeScript, Supabase, and Mastra.

## Contributing
This project follows a strict **vertical slice development** protocol. Every code change must enable a user to SEE, DO, and VERIFY a feature. Read `.claude/SYSTEM_RULES.md` before contributing.
