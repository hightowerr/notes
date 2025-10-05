# PRD: ⚙️ P0 – Thinnest Agentic Slice (Proof of Agency)

## Project Spec
**Project:** AI Note Synthesiser  
**Feature:** P0 – Thinnest Agentic Slice (Proof of Agency)  
**Platforms:** Web (Next.js 15 + TypeScript + Vercel AI SDK + Supabase)  
**Primary Users:** Knowledge workers and technical professionals who attend frequent meetings and suffer from information overload and context switching.  
**Deadline / Appetite:** 6 weeks  
**Objective:** Build the first autonomous “sense–reason–act” loop. The system should detect a new file, convert it to Markdown, summarise it, and produce structured JSON without user interaction.

---

## Problem
Users drown in unstructured AI-generated notes. They lack time to clean, categorise, or extract actions from endless meeting transcripts.  
The goal is to remove this friction by enabling an **agent that works silently** — detecting new note files and turning them into usable summaries and structured outputs.

---

## Goals
1. Detect new files in a watched folder or via upload.  
2. Convert PDFs, DOCX, TXT → Markdown.  
3. Summarise content and extract `{ topics, decisions, actions }`.  
4. Output both Markdown and JSON versions.  
5. Store locally (Supabase/Storage) and display success feedback.  
6. Operate autonomously — **no manual “summarise” action.**

---

## Non-Functional Notes
- Local-first; minimal setup.  
- Output must be deterministic (consistent JSON keys).  
- Modular so future versions can plug into RAG and memory.  
- Error logs visible in console + stored in Supabase for inspection.  

---

## Scope Guardrails
**In Scope:**  
- File detection, conversion, summarisation, JSON/MD output  
- Local Supabase triggers (no cloud dependencies)  
- Basic browser-based upload UI  

**Out of Scope:**  
- Multi-user features  
- Collaboration or tagging UI  
- External integrations (Slack, Notion, etc.)  
- RAG or memory retrieval  

---

## Dependencies
| Type | Upstream | Downstream |
|------|-----------|------------|
| Tech | Supabase (trigger, storage) | JSON/MD writer |
| Tech | AI SDK (Vercel) | Summariser |
| Tech | Unified Parser | Markdown converter |
| Non-tech | User provides note files | System produces structured output |

---

## Edge Cases & Error States
| Case | Expected Behaviour |
|------|--------------------|
| Invalid file format | Log error, skip processing |
| Unreadable PDF | Attempt OCR fallback (Tesseract), else skip |
| LLM returns invalid JSON | Retry with adjusted prompt parameters |
| Low-confidence summary | Mark as “review required” in logs |
| Duplicate file name | Overwrite or append hash suffix |

---

## TDD Approach
1. **File Detection Test:**  
   - GIVEN a new file appears in `/Meeting Notes`  
   - WHEN the watcher detects it  
   - THEN the system triggers summarisation flow.  
2. **Summarisation Test:**  
   - GIVEN valid Markdown text  
   - WHEN summarised via AI SDK mock  
   - THEN return structured JSON + MD output.  
3. **Output Test:**  
   - GIVEN a processed file  
   - WHEN stored  
   - THEN paths are returned + confirmation logged.

---

## Acceptance Criteria
- [ ] File watcher/trigger detects new files automatically.  
- [ ] PDFs, DOCX, TXT successfully convert to Markdown.  
- [ ] AI summary returns Markdown + JSON with `{ topics, decisions, actions, LNO tasks (Leverage, Neutral, Ovehead) }`.  
- [ ] Output saved locally and visible in console/UI.  
- [ ] Errors logged and retried once with adjusted prompt.

---

## Dependencies (split)
**Upstream:**  
- File watcher, Supabase triggers  
- Unified parser for doc conversion  
- AI SDK for summarisation  

**Downstream:**  
- Local Supabase storage  
- Console or minimal UI view  

---

## Implementation Notes
- **Sense:** Supabase trigger or local watcher detects file changes.  
- **Reason:** Convert → clean → summarise → extract structured data.  
- **Act:** Store JSON + MD, display “Summary ready.”  
- **Learn:** Log run metrics (hash, duration, confidence).  

---

## Success Metrics
| Metric | Target |
|--------|---------|
| Autonomy (no clicks required) | 100% |
| File detection reliability | ≥ 95% |
| Summarisation accuracy (manual review) | ≥ 85% |
| Output completeness (topics/actions/decisions) | 100% |
| Avg. time to process file | < 8s |

---

## Risks
- Complex document structures may reduce summarisation quality.  
- OCR fallback may increase latency.  
- LLM drift (prompt instability) may affect JSON validity.

---

## Out of Scope (No-Gos)
- Collaboration features  
- RAG or retrieval augmentation  
- Persistent long-term memory  
- Multi-language support  
- External notifications  

---

## Deliverable
A **Next.js + TypeScript web app** that autonomously detects new files, summarises them, and produces Markdown + structured JSON outputs — proving the agent can **sense → reason → act** without manual input.
