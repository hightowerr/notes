# AI Note Synthesiser

An autonomous document intelligence workspace that ingests meeting notes and research files, distils them into actionable insights, and prioritises the next best tasks with an outcome-driven agent running on Mastra.

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
- Outcome-aware scoring blends AI summaries with the current strategic outcome and reflections.
- Mastra-powered agent orchestrates prioritisation using semantic search, dependency detection, and clustering tools.
- Realtime dashboard surfaces document status, queue load, and prioritised plans.
- Built with Next.js 15, React 19, Tailwind, and Supabase for storage, vector search, and telemetry.

## System Overview
### Frontend
- App Router in `app/` renders the upload flow (`app/page.tsx`) and dashboard (`app/dashboard/page.tsx`).
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
- Node.js 18 or newer.
- pnpm/nvm/yarn/npm (project uses npm scripts).
- Supabase project with storage bucket `notes` and Postgres schema from `supabase/migrations/`.
- OpenAI API key with access to the deployed model family.

### Installation
1. Clone the repository and move into the workspace.
   ```bash
   git clone <repository-url>
   cd notes
   npm install
   ```
2. Copy environment defaults and supply credentials.
   ```bash
   cp .env.local.example .env.local
   ```

   Required variables:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key
   OPENAI_API_KEY=your_openai_api_key
   ENCRYPTION_KEY=32_byte_random_secret
   ```
   Generate the encryption key with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and store it securely.

3. Apply database migrations using the Supabase CLI (≥1.188).
   ```bash
   supabase db push
   # or
   supabase migration up
   ```
   Ensure the `notes` storage bucket is created (`supabase/migrations/20241004082124_create-notes-bucket.sql`).

4. Start the development server.
   ```bash
   npm run dev
   ```
   Visit `http://localhost:3000` to upload documents and monitor prioritisation sessions.

## Development & Quality
- `npm run lint` – ESLint + Prettier (TypeScript strict mode).
- `npm run test` – Vitest in watch mode; for single pass use `npm run test:run`.
- `npm run test:ui` – launches the Vitest UI dashboard.
- Integration specs that stress Tinypool threads: `npm run test:run -- --pool=threads --poolOptions.threads.minThreads=1 --poolOptions.threads.maxThreads=1`.
- Explorer scripts live in `scripts/` (e.g. `scripts/test-mastra.ts` for agent health).

Testing guidelines:
- Unit tests sit alongside services/components; contract and integration suites live in `__tests__/contract/` and `__tests__/integration/` respectively.
- Target ≥80 % coverage, adding regression specs for every bug fix or retry logic tweak.
- Supabase-dependent tests require `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; mock external APIs where possible.

## Project Structure
```
notes/
├── app/                      # Next.js App Router, API routes, and shared UI
│   ├── api/                  # Upload, process, export, agent, status endpoints
│   ├── components/           # Feature-specific UI blocks
│   └── dashboard/            # Outcome and document dashboards
├── lib/
│   ├── mastra/               # Agents, tool registry, orchestration services
│   ├── services/             # File conversion, AI summarisation, embeddings, queues
│   ├── schemas/              # Zod schemas + helpers
│   └── hooks/                # Client-side data hooks
├── __tests__/                # Contract + integration suites
├── specs/                    # Feature specs & runbooks
├── supabase/                 # SQL migrations and storage policies
├── docs/                     # Additional guidance and design notes
└── scripts/                  # Mastra diagnostics and utilities
```

## Deployment
1. Configure environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `OPENAI_API_KEY`) in your hosting provider.
2. Build with `npm run build` and serve via `npm run start`.
3. Vercel is the quickest path (Next.js 15 native); Netlify, Railway, DO App Platform, and AWS Amplify are also supported.
4. Ensure Supabase Row Level Security policies mirror the migrations shipped in `supabase/migrations/` to protect uploaded assets and agent traces.

## Resources
- Specs & planning artifacts – `specs/`
- Agent transcripts & debugging context – `.claude/`
- Implementation examples & standards – `IMPLEMENTATION_EXAMPLES.md`, `standards.md`
- Mobile QA and visual baselines – `MOBILE_RESPONSIVENESS_REPORT.md`, `VISUAL_COMPARISON.md`
- Need to validate Mastra wiring? `npx tsx scripts/test-mastra.ts`

---
Built with ❤️ using Next.js 15, React 19, TypeScript, Supabase, and Mastra.
