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

- **Start development server**: `npm run dev` (http://localhost:3000)
- **Build for production**: `npm run build`
- **Start production server**: `npm run start`
- **Run linter**: `npm run lint`

## Architecture

### Next.js App Router Structure
- `app/` directory for routing and layouts
- `app/layout.tsx` — Root layout with Geist fonts
- `app/page.tsx` — Home page (upload UI)
- `app/globals.css` — Global Tailwind styles

### Key Processing Pipeline
1. **File Detection:** Supabase trigger or browser upload
2. **Conversion:** PDFs, DOCX, TXT → Markdown (Unified Parser)
3. **Summarisation:** Vercel AI SDK extracts `{ topics, decisions, actions, LNO tasks }`
4. **Storage:** Supabase stores both JSON and Markdown outputs
5. **Feedback:** Console logs + UI confirmation

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

- **Supabase Integration:** File storage, triggers, error logs
- **AI SDK Integration:** Summarisation with retry logic on invalid JSON
- **Unified Parser:** Document conversion layer (PDF/DOCX/TXT → MD)
- **Error Handling:** Log errors to Supabase + console; retry once with adjusted prompt

## Design Principles

- **Frontend design:** Always usee shadcn over custom components
- **Frontend components:** Always install Shadcn componentss using the install command: Example: pnpm dlx shadcn@latest add button
- **Frontend colours:** Always user the standard Tailwind and Shadcn colours. Never use inline custom colours
- **Autonomous by default:** No manual "summarise" button
- **Deterministic outputs:** Consistent JSON schema
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
- `tsconfig.json` — TypeScript compiler options
- `postcss.config.mjs` — PostCSS for Tailwind
