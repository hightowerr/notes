# AI Note Synthesiser - Development Context

## Project Overview

The AI Note Synthesiser is an autonomous document intelligence workspace built with Next.js 15, React 19, and Mastra. It ingests meeting notes and research files in multiple formats (PDF, DOCX, TXT, Markdown), distills them into actionable insights, and prioritizes the next best tasks using an outcome-driven agent running on Mastra.

The system features a multi-stage workflow:
1. **Document Ingestion & Processing** - Converts various file formats to structured content with OCR fallback
2. **AI Extraction** - Extracts topics, decisions, actions, and metrics from documents
3. **Outcome-Aware Scoring** - Ranks actions against strategic outcomes using semantic similarity
4. **Agent-Driven Prioritization** - Uses a Mastra-powered agent with semantic search, dependency detection, and clustering tools

## Architecture

### Frontend
- Next.js App Router in `app/` with upload flow (`app/page.tsx`) and dashboard (`app/dashboard/page.tsx`)
- UI components using shadcn + Radix, stored in `app/components/` and `components/ui/`
- Client-side polling for real-time updates via `/api/status` and `/api/agent/sessions`

### Backend & Data
- API routes in `app/api/` handle uploads, processing, exports, and agent control
- Supabase for storage (raw uploads in `storage/notes`, processed data in `processed_documents`, vector embeddings, outcomes, reflections, and agent sessions)
- Service layer in `lib/services/` handles file conversion, AI calls, embeddings, and concurrency management

### Agentic Layer (Mastra)
- Task Orchestration Agent in `lib/mastra/agents/taskOrchestrator.ts` with strict instruction contracts
- Tool registry in `lib/mastra/tools/index.ts` with instrumentation through `lib/mastra/init.ts`
- Agent orchestration in `lib/mastra/services/agentOrchestration.ts` for context assembly and result normalization

## Key Tools & Services

### Core Mastra Tools
- `semantic-search` (`lib/mastra/tools/semanticSearch.ts`) - Finds relevant tasks using vector embeddings
- `get-document-context` - Fetches document context for specific tasks
- `detect-dependencies` - Infers task relationships using AI
- `query-task-graph` - Reads persisted task relationships
- `cluster-by-similarity` - Groups tasks into execution waves

### Processing Services
- `noteProcessor.ts` - Handles multi-format conversion with OCR fallback
- `aiSummarizer.ts` - AI extraction and outcome scoring
- `embeddingService.ts` & `vectorStorage.ts` - Vector embeddings and similarity search
- `processingQueue.ts` - Concurrency management for document processing

## Development Setup

### Prerequisites
- Node.js 18+
- pnpm, npm, or yarn
- Supabase project with storage bucket `notes` and required Postgres schema
- OpenAI API key with model access

### Installation
```bash
npm install
cp .env.local.example .env.local  # Configure environment variables
supabase db push  # Apply database migrations
npm run dev
```

### Environment Variables
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key
OPENAI_API_KEY=your_openai_api_key
ENCRYPTION_KEY=32_byte_random_secret
```

## Testing & Quality

### Available Commands
- `npm run test` - Run Vitest in watch mode
- `npm run test:run` - Run tests once
- `npm run test:ui` - Launch Vitest UI dashboard
- `npm run lint` - ESLint + Prettier

### Test Structure
- Unit tests alongside services/components
- Contract tests in `__tests__/contract/` (Mastra tools)
- Integration tests in `__tests__/integration/`
- Target ≥80% coverage with regression specs for bug fixes

## Recent Changes & Fixes

### Semantic Search Tool (Key Fix)
The semantic search tool was updated to properly handle Mastra's execution context format:
- Now correctly extracts arguments from `input.context` in runtime vs. direct arguments in tests
- Maintains custom error codes (`INVALID_THRESHOLD`, `INVALID_LIMIT`)
- Includes defensive JSON parsing for agent responses with control characters

### Result Parser Enhancements
Added defensive JSON parsing with control character sanitization:
- `sanitizeJsonString()` function to handle problematic control characters
- `safeJsonParse()` with fallback sanitization approach
- Resolves "Bad control character in string literal" parsing errors

## Project Structure

```
notes/
├── app/                      # Next.js App Router, API routes, UI components
│   ├── api/                  # Upload, process, export, agent, status endpoints
│   ├── components/           # Feature-specific UI blocks
│   └── dashboard/            # Outcome and document dashboards
├── lib/
│   ├── mastra/               # Agents, tool registry, orchestration services
│   ├── services/             # File conversion, AI summarisation, embeddings, queues
│   ├── schemas/              # Zod schemas
│   └── hooks/                # Client-side data hooks
├── __tests__/                # Unit, contract, integration test suites
├── specs/                    # Feature specs & runbooks
├── supabase/                 # SQL migrations and storage policies
├── docs/                     # Additional guidance and design notes
└── scripts/                  # Utilities and diagnostics
```

## Deployment

- Build with `npm run build` and serve via `npm run start`
- Vercel recommended for Next.js 15 native support
- Ensure Supabase RLS policies are configured from `supabase/migrations/`
- Required environment variables same as development

## Important Notes

- The system uses TypeScript strict mode with comprehensive Zod schema validation
- Mastra telemetry is enabled with rate limits; see `lib/mastra/config.ts` for configuration
- Vector embeddings stored in Supabase enable semantic search capabilities
- Agent responses are thoroughly validated and sanitized to handle malformed JSON