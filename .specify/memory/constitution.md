<!--
============================================================================
SYNC IMPACT REPORT
============================================================================
Version Change: 1.0.0 → 1.0.1
Modified Principles: None
Added Sections: None
Removed Sections: None

Templates Requiring Updates:
  ✅ plan-template.md - Constitution Check references remain valid
  ✅ spec-template.md - User story format aligns with vertical slice mandate
  ✅ tasks-template.md - Task structure supports vertical slice delivery

Documentation Updates:
  ✅ CLAUDE.md - Enhanced with current phase context, Google Drive setup, slash commands
  ✅ README.md - Reorganized resources section, added development workflow clarity

Follow-up TODOs: None

Rationale for Version 1.0.1 (PATCH):
  - Documentation clarity improvements to CLAUDE.md and README.md
  - Enhanced runtime guidance section to reflect reorganized documentation structure
  - No principle changes, no governance changes, no breaking changes
  - Pure clarification and navigation improvements
============================================================================
-->

# AI Note Synthesiser Constitution

## Core Principles

### I. Vertical Slice Development (NON-NEGOTIABLE)

Every code change MUST deliver complete user value through three observable elements:

- **SEE IT**: Visible UI change or feedback that users can observe
- **DO IT**: Interactive capability users can trigger through the interface
- **VERIFY IT**: Observable outcome confirming the action worked

**Rationale**: Infrastructure or backend-only work that cannot be user-tested creates technical debt and delays value delivery. Every slice must be demonstrable to non-technical stakeholders.

**Enforcement**: Tasks lacking UI entry point, user action, or visible outcome MUST be rejected and restructured before implementation begins.

### II. Test-First Development (NON-NEGOTIABLE)

TDD cycle is mandatory with no exceptions to execution order:

- Write failing test FIRST
- Implement minimal code to pass the test
- Review code quality via automated reviewer
- Run complete test suite
- Validate end-to-end user journey
- Document user capability added

**Rationale**: Tests written after implementation tend to verify existing behavior rather than requirements, leading to brittle test suites and missed edge cases.

**Target Coverage**: ≥80% code coverage with contract tests for all API endpoints and integration tests for multi-service workflows.

### III. Autonomous Agent Architecture

System operates via Sense → Reason → Act → Learn loop:

- **Sense**: Document intake, vector embeddings, semantic search
- **Reason**: Mastra-powered agent orchestration with structured reasoning
- **Act**: Task prioritization, gap detection, dependency inference
- **Learn**: Outcome scoring, reflection-driven context adjustment

**Rationale**: Manual triggers and human-in-loop bottlenecks violate the core value proposition of autonomous document intelligence.

**Constraints**: Agent outputs MUST use deterministic JSON schemas validated with Zod. Confidence scores required for all AI-generated recommendations.

### IV. Modular Service Architecture

Services MUST be decoupled, independently testable, and single-purpose:

- Document processing services isolated from AI summarization
- Vector operations separate from task prioritization logic
- Cloud sync independent of core document pipeline
- Each service exports clear TypeScript interfaces

**Rationale**: Monolithic services create cascading test failures, complicate feature isolation, and prevent parallel development streams.

**Standards**: Services live in `lib/services/`, tests colocated or in `__tests__/`, no circular dependencies permitted.

### V. Observable by Design

All system operations MUST emit structured telemetry:

- Mastra tool execution traces with latency and retry metrics
- Processing queue states (pending/running/completed/failed)
- Agent reasoning steps persisted to `agent_sessions` table
- Error logs include context hashes for deduplication

**Rationale**: Debugging autonomous systems without telemetry requires reading code, recreating state, and guessing at race conditions.

**Performance SLOs**: Document processing <8s, semantic search p95 <500ms, agent prioritization <30s.

## Quality Standards

### Code Quality

- TypeScript strict mode enabled, no `any` types without explicit justification
- ESLint + Prettier enforced pre-commit
- All API routes validate inputs with Zod schemas
- React components use TypeScript for props, hooks typed

### Testing Requirements

- **Unit Tests**: Colocated with services in `__tests__/` or `lib/services/__tests__/`
- **Contract Tests**: API endpoint validation in `__tests__/contract/`
- **Integration Tests**: Multi-service flows in `__tests__/integration/`
- **Manual Test Guides**: Required for blocked automated tests (e.g., FormData serialization issues)

### Security & Privacy

- OAuth tokens encrypted with AES-256 before database storage
- Supabase Row Level Security policies for all user-facing tables
- API keys never committed, managed via `.env.local`
- 30-day auto-expiry for processed documents

### Performance & Scale

- Max file size: 10MB
- Concurrent processing: 3 uploads max
- Vector search optimized with pgvector IVFFlat index
- Task embeddings pre-computed, cached, and reused

## Development Workflow

### Pre-Flight Check (Before ANY Code)

1. Define user story: "As a user, I can [action] to [achieve outcome]"
2. Identify UI component for user interaction
3. Identify backend endpoint processing the action
4. Confirm: Can user test this when complete? (YES required to proceed)

### Spec-Driven Workflow

This project uses a structured feature development workflow with slash commands:

1. `/specify "feature description"` - Create `specs/###-feature/spec.md` with user stories
2. `/plan` - Generate `specs/###-feature/plan.md` with implementation approach
3. `/tasks` - Break into `specs/###-feature/tasks.md` vertical slice tasks
4. `/implement` - Execute tasks in order with TDD, creating `.claude/state/*.json` tracking
5. `/analyze` - Cross-check spec, plan, tasks for consistency

Each command references `.specify/templates/` and this constitution for standards compliance.

### Agent Selection Protocol

- **Feature implementation**: ALWAYS use `slice-orchestrator` agent
- **Bug fix with user impact**: Use `slice-orchestrator` for complete slice
- **Code review only**: Use `code-reviewer` agent
- **Error investigation**: Use `debugger` agent, THEN `slice-orchestrator` for fix

### Completion Criteria

Task is complete ONLY when all checkpoints pass:

- ✅ User can perform action via UI
- ✅ Backend processes and persists action
- ✅ User receives feedback/confirmation
- ✅ Tests cover complete user journey
- ✅ Code reviewed and approved by `code-reviewer` agent
- ✅ Feature can be demoed to non-technical person

### Forbidden Actions

NEVER:

- ❌ Write backend code without corresponding UI
- ❌ Create UI without working backend
- ❌ Mark task complete without user journey test
- ❌ Skip the failing test phase
- ❌ Implement features that cannot be user-tested
- ❌ Deliver "infrastructure" or "setup" as a standalone slice

## Governance

### Amendment Process

1. Proposed changes MUST include rationale and impact analysis
2. Version bump follows semantic versioning:
   - **MAJOR**: Backward-incompatible governance or principle removal
   - **MINOR**: New principle added or material expansion
   - **PATCH**: Clarifications, wording improvements, non-semantic fixes
3. Update Sync Impact Report (HTML comment) documenting:
   - Version change
   - Modified/added/removed principles
   - Template updates required
   - Follow-up TODOs
4. Validate consistency across `.specify/templates/` files

### Compliance Review

All code reviews MUST verify:

- Vertical slice criterion met (SEE → DO → VERIFY)
- Tests written before implementation
- Agent selection protocol followed
- Completion criteria checklist passed

### Complexity Justification

Use of patterns violating simplicity principles requires documentation:

- Repository pattern (when direct Supabase client sufficient)
- Additional microservices (when monolith viable)
- Custom state management (when React Context sufficient)

Justification captured in feature `plan.md` under "Complexity Tracking" section.

### Runtime Guidance

For implementation patterns, standards, and troubleshooting, developers MUST consult:

**Primary Documentation** (start here):
- `CLAUDE.md` - Quick start guide, architecture overview, troubleshooting, slash command workflow
- `README.md` - Project overview, getting started, development commands, resource index

**Development Standards**:
- `.claude/SYSTEM_RULES.md` - Vertical slice protocol, agent coordination rules
- `.claude/standards.md` - TypeScript conventions, TDD workflow, design system, common patterns
- `AGENTS.md` - Repository workflow, commit guidelines, security posture

**Specifications**:
- `specs/###-feature/` - Feature specifications, plans, tasks for each development phase
- `.specify/templates/` - Templates for spec, plan, tasks, and workflow commands

**Implementation Status**:
- `IMPLEMENTATION_STATUS.md` - Feature completion matrix, known issues, roadmap

**Design & QA**:
- `design.json` / `design/design-system.json` - Visual language, component guidelines
- `MOBILE_RESPONSIVENESS_REPORT.md` - Mobile QA baselines
- `VISUAL_COMPARISON.md` - Visual regression tracking

**Version**: 1.0.1 | **Ratified**: 2025-01-13 | **Last Amended**: 2025-01-25
