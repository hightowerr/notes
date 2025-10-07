---
description: Generate an actionable, dependency-ordered tasks.md for the feature based on available design artifacts.
---

The user input to you can be provided directly by the agent or as a command argument - you **MUST** consider it before proceeding with the prompt (if not empty).

User input:

$ARGUMENTS

1. Run `.specify/scripts/bash/check-prerequisites.sh --json` from repo root and parse FEATURE_DIR and AVAILABLE_DOCS list. All paths must be absolute.
2. Load and analyze available design documents:
   - Always read plan.md for tech stack and libraries
   - IF EXISTS: Read data-model.md for entities
   - IF EXISTS: Read contracts/ for API endpoints
   - IF EXISTS: Read research.md for technical decisions
   - IF EXISTS: Read quickstart.md for test scenarios

   Note: Not all projects have all documents. For example:
   - CLI tools might not have contracts/
   - Simple libraries might not need data-model.md
   - Generate tasks based on what's available

3. Generate tasks following the template:
   - Use `.specify/templates/tasks-template.md` as the base
   - Replace example tasks with **vertical slice tasks**:

     **Each task MUST deliver complete user value:**
     * User story: "As a user, I can [action] to [achieve outcome]"
     * UI entry point: Component/page where user interacts
     * Backend work: Endpoint/service that processes the action
     * Data layer: Storage/retrieval implementation
     * Visible outcome: What user sees as confirmation
     * Test scenario: Complete journey verification

     **Task Categories:**
     * **[SLICE]**: Complete UI → Backend → Storage → Feedback loop
     * **[SETUP]**: ONLY if blocking ALL slices (rare, avoid if possible)
     * **[POLISH]**: Enhancements to existing working slices

4. Task generation rules (SLICE-FIRST):
   - Each user story → ONE vertical slice task including:
     * Frontend component + API endpoint + data persistence + user feedback
   - Group related user actions into single testable journey
   - Different user journeys = can be parallel [P]
   - Shared critical implementation files = sequential (no [P])
   - **NEVER** create backend-only or frontend-only tasks
   - **NEVER** create infrastructure tasks unless blocking all slices
   - **ALWAYS** include observable user outcome in task description

5. Order tasks by user value (NOT technical layers):
   - P0 user journeys first (must-have features)
   - Setup tasks ONLY if required for P0 slices to work
   - P1 user journeys after P0 slices validated
   - Polish tasks after core journeys complete
   - **REJECT** layered ordering (setup → tests → models → services)

6. Validate slice compliance before writing tasks.md:
   - ✅ Does each task enable user to SEE, DO, and VERIFY something?
   - ✅ Can each task be demoed to a non-technical person?
   - ✅ Does task include both frontend AND backend work?
   - ✅ Is there a clear user outcome described?
   - ❌ Reject any task that's backend-only, frontend-only, or infrastructure-only

7. Create FEATURE_DIR/tasks.md with:
   - Correct feature name from implementation plan
   - Numbered tasks (T001, T002, etc.) with [SLICE], [SETUP], or [POLISH] tags
   - User story for each slice task
   - Complete implementation scope (UI + API + Data + Feedback)
   - Test scenario showing user journey
   - Dependency notes
   - Parallel execution guidance

Context for task generation: $ARGUMENTS

The tasks.md should be immediately executable - each task must be a complete vertical slice that an LLM can implement and a user can test without additional context.
