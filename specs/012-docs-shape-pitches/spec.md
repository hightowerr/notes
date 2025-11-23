# Feature Specification: Outcome-Driven Prioritization (Evaluator-Optimizer Pattern)

**Feature Branch**: `012-docs-shape-pitches`
**Created**: 2025-11-18
**Status**: Draft
**Input**: User description: "@docs/shape-up-pitches/phase-14-outcome-driven-prioritization.md"

## Clarifications

### Session 2025-11-18

- Q: Should the unified generator agent use Phase 11 scores as mandatory inputs, soft suggestions, ignore them entirely, or use a hybrid approach? → A: Ignore Phase 11 scores entirely (agent calculates fresh impact/effort for all tasks in unified pass)
- Q: During prioritization execution (15-30s), what should the priorities page display? → A: Progressive disclosure: show tasks as they're scored in real-time (partial results stream in)
- Q: When LLM validation fails after 1 retry, what should happen next? → A: Show error banner, preserve UI state, allow user to manually retry with same inputs
- Q: How long should chain_of_thought metadata be retained in agent_sessions? → A: 30 days (align with document retention policy, auto-cleanup after)
- Q: How should reflection negation accuracy and task classification accuracy be measured post-launch? → A: Hybrid (log overrides + periodic user surveys asking "Did reflections work as expected?")

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Outcome-Aligned Filtering (Priority: P1)

As a user with an active outcome, I want tasks to be filtered based on their direct impact on my outcome metric, so that I only see tasks that genuinely advance my goal and avoid wasting time on low-impact work.

**Why this priority**: This addresses the core problem - tasks are currently misclassified (e.g., payment integration showing as NEUTRAL instead of LEVERAGE), and users get nonsensical priority lists that contradict their outcomes. Without accurate filtering, all other features are built on a broken foundation.

**Independent Test**: Can be fully tested by setting an outcome "Increase credit payment conversion by 20%", running prioritization, and verifying that high-impact tasks like "Apple Pay integration" are INCLUDED with clear reasoning, while low-impact tasks like "Update API docs" are EXCLUDED with explanations.

**Acceptance Scenarios**:

1. **Given** user has set outcome "Increase credit payments by 20%", **When** prioritization runs, **Then** payment-related tasks (Apple Pay, checkout optimization) are marked INCLUDED with alignment scores 7-10
2. **Given** user has set outcome "Increase credit payments by 20%", **When** prioritization runs, **Then** non-revenue tasks (documentation, internal refactoring) are marked EXCLUDED with clear reasoning
3. **Given** user views priorities page, **When** filtering completes, **Then** included tasks show inclusion_reason and alignment_score (0-10)
4. **Given** user views priorities page, **When** they expand excluded section, **Then** 150+ excluded tasks display with exclusion_reason explaining why each doesn't advance the outcome

---

### User Story 2 - Reflection-Based Prioritization (Priority: P2)

As a user who writes reflections like "ignore wishlist related items", I want the system to correctly deprioritize or exclude wishlist tasks (not boost them to the top), so that my reflections actually guide prioritization instead of making it worse.

**Why this priority**: Current system uses character-frequency vectors that cannot understand negation - "ignore X" has high similarity to "X", so it boosts X tasks. This makes the reflection feature actively harmful, causing 90%+ of users to abandon it.

**Independent Test**: Can be fully tested by writing reflection "ignore documentation tasks", running prioritization, and verifying that "Update API docs" is excluded or deprioritized (not boosted to top 10).

**Acceptance Scenarios**:

1. **Given** user writes reflection "ignore wishlist related items", **When** prioritization runs, **Then** wishlist tasks appear in excluded section, not active list
2. **Given** user writes reflection "focus on mobile", **When** prioritization runs, **Then** mobile-related tasks are prioritized higher within included set
3. **Given** user views task reasoning, **When** reflection influenced ranking, **Then** reasoning mentions specific reflection and how it affected the decision
4. **Given** user writes multiple reflections with negations, **When** prioritization runs, **Then** all negations are correctly handled (exclusions, not boosts)

---

### User Story 3 - Transparent Reasoning Display (Priority: P2)

As a user viewing my priority list, I want to see clear explanations for why each task was included/excluded and how it was scored, so that I can trust the system's decisions and understand the critical path.

**Why this priority**: Without transparency, users cannot validate AI decisions or learn why tasks moved positions. This builds trust and enables users to provide better reflections based on understanding the system's logic.

**Independent Test**: Can be fully tested by viewing any task in the priorities UI and seeing impact score, effort estimate, confidence level, and reasoning text explaining the scoring rationale.

**Acceptance Scenarios**:

1. **Given** user views task #1 "Implement Apple Pay V6", **When** they examine details, **Then** they see: inclusion_reason, impact: 8/10, effort: 12h, confidence: 0.85, reasoning explaining why it's high priority
2. **Given** user views excluded task "Update API documentation", **When** they examine details, **Then** they see exclusion_reason: "Documentation doesn't advance payment metric"
3. **Given** prioritization involved self-corrections, **When** user views reasoning chain, **Then** they see corrections_made field showing what the agent fixed
4. **Given** user clicks "[Why this score?]" on any task, **When** modal opens, **Then** they see breakdown of impact, effort, dependencies, and reflection adjustments
5. **Given** LLM returns malformed JSON twice, **When** validation fails after automatic retry, **Then** error banner displays with "Prioritization failed" message, previous results remain visible, and "Retry" button appears for manual re-trigger

---

### User Story 4 - Quality Self-Evaluation with Hybrid Loop (Priority: P3)

As a user, I want the system to self-check its prioritization quality and automatically refine when confidence is low, so that I get reliable results even when the agent is uncertain about edge cases.

**Why this priority**: This ensures quality without sacrificing speed - 80% of cases get fast path (15s), 20% trigger evaluation loop (28s) only when needed. Prevents shipping low-quality prioritizations.

**Independent Test**: Can be fully tested by triggering prioritization with ambiguous tasks (blocked items, unclear outcomes) and verifying that evaluation loop triggers when confidence < 0.7, showing iteration history.

**Acceptance Scenarios**:

1. **Given** agent generates prioritization with confidence ≥ 0.85, **When** hybrid logic runs, **Then** evaluation loop is skipped, result returned in ~15s, metadata shows evaluation_triggered: false
2. **Given** agent generates prioritization with confidence < 0.7, **When** hybrid logic runs, **Then** evaluator agent reviews, provides feedback, generator refines, metadata shows iterations: 2-3
3. **Given** agent over-filters (includes < 10 tasks from 200), **When** hybrid logic runs, **Then** evaluation loop triggers regardless of confidence score
4. **Given** evaluation loop runs 3 iterations without PASS, **When** max iterations reached, **Then** system returns best effort with warning and low confidence score
5. **Given** user views session metadata, **When** they expand reasoning chain, **Then** they see each iteration's confidence, corrections, and evaluator feedback

---

### User Story 5 - Performance Optimization (Priority: P3)

As a user, I want prioritization to complete in under 20 seconds on average (30% faster than today's 25s), so that I can iterate quickly on my outcome and reflections without waiting.

**Why this priority**: Speed enables iterative refinement - users are more likely to engage with reflections and outcomes if feedback is fast. However, quality is more critical, so this is P3.

**Independent Test**: Can be fully tested by running prioritization 20 times and verifying that 80%+ complete in <18s (fast path) and 100% complete in <30s (quality path).

**Acceptance Scenarios**:

1. **Given** 200 tasks to prioritize with clear outcome, **When** agent has high confidence (≥0.85), **Then** prioritization completes in <18s (fast path)
2. **Given** 200 tasks to prioritize with ambiguous outcome, **When** evaluation loop triggers, **Then** prioritization completes in <30s (quality path with 2-3 iterations)
3. **Given** user triggers prioritization, **When** metadata is returned, **Then** duration_ms is logged and visible in reasoning chain
4. **Given** average across 100 prioritization runs, **When** measured, **Then** average duration ≤ 20s (target: 17.6s based on 80/20 split)
5. **Given** user triggers prioritization, **When** agent is processing (15-30s window), **Then** UI progressively displays tasks as they're scored, showing partial results streaming in real-time

---

### Edge Cases

- **What happens when outcome is vague or missing?** System should return error or warning prompting user to define clear outcome before prioritization
- **What happens when all tasks are unrelated to outcome?** Agent should flag this, potentially include top 10-20 by general strategic value with caveat
- **What happens when reflection contradicts outcome?** (e.g., outcome is "increase revenue" but reflection says "ignore all sales features") Agent should prioritize outcome over reflection and note the conflict in reasoning
- **What happens when evaluation loop never converges?** Hard stop at 3 iterations, return best effort with low confidence warning
- **What happens when LLM returns malformed JSON?** Schema validation fails, system retries once automatically. If retry fails, show error banner, preserve UI state (previous prioritization visible), and display manual retry button for user to re-trigger with same inputs
- **What happens when user has 0 reflections?** System still works, prioritizes purely on outcome alignment
- **What happens when tasks have circular dependencies?** Dependency detection should flag these in reasoning, prioritize based on breaking cycles
- **What happens when >30% of tasks move >5 positions from previous plan without justification?** Evaluation loop triggers to verify changes are intentional
- **What happens when user manually overrides agent decisions?** Manual overrides persist in localStorage, agent sees them as context in next run but doesn't automatically incorporate them (user must update outcome/reflections)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST implement unified prioritization generator agent that performs filtering, prioritization, and inline self-evaluation in a single pass
- **FR-002**: System MUST filter tasks into INCLUDED and EXCLUDED sets based on outcome alignment, with each decision accompanied by reasoning text
- **FR-003**: System MUST assign alignment scores (0-10) to each task indicating strength of connection to outcome metric
- **FR-004**: System MUST prioritize included tasks by calculating fresh impact (0-10) and effort (0.5-160 hours) scores independently, plus dependencies and reflection adjustments
- **FR-005**: System MUST perform inline self-evaluation where generator agent checks its own work and reports confidence (0-1)
- **FR-006**: System MUST implement conditional evaluation loop that triggers when confidence < 0.7, <10 tasks included, >30% major movements, or self-corrections > 100 chars
- **FR-007**: System MUST implement quality evaluator agent that assesses prioritization on 4 criteria: outcome alignment, strategic coherence, reflection integration, continuity
- **FR-008**: System MUST limit evaluation loop to max 3 iterations, returning best effort if PASS not achieved
- **FR-009**: System MUST handle reflection negations correctly (e.g., "ignore X" excludes X tasks, not boosts them)
- **FR-010**: System MUST provide transparent reasoning for every inclusion, exclusion, score assignment, and ranking decision
- **FR-011**: System MUST display excluded tasks in collapsible UI section with exclusion reasons visible
- **FR-012**: System MUST display chain-of-thought reasoning showing iterations, confidence scores, corrections, and evaluator feedback
- **FR-013**: System MUST achieve fast path performance (<18s) for high-confidence prioritizations (≥0.85 confidence)
- **FR-014**: System MUST achieve quality path performance (<30s) for low-confidence prioritizations requiring evaluation
- **FR-015**: System MUST deprecate character-frequency reflection ranking service (`lib/services/reflectionBasedRanking.ts`) with migration path to new system
- **FR-016**: System MUST integrate with existing agent orchestration (`lib/mastra/services/agentOrchestration.ts`) via `prioritizeWithHybridLoop` function
- **FR-017**: System MUST use GPT-4o for generator agent (reasoning depth) and GPT-4o-mini for evaluator agent (cost optimization)
- **FR-018**: System MUST store excluded tasks and evaluation metadata in `agent_sessions` table with JSONB columns
- **FR-019**: System MUST provide feature flag `USE_UNIFIED_PRIORITIZATION` for gradual rollout and instant rollback
- **FR-020**: System MUST validate all LLM outputs against Zod schemas (`PrioritizationResultSchema`, `EvaluationResultSchema`)
- **FR-021**: System MUST support progressive disclosure during prioritization, streaming partial task results to UI as they're scored (15-30s window)
- **FR-022**: System MUST retry LLM validation failures once automatically, then on second failure: preserve UI state showing previous prioritization, display error banner with actionable message, and provide manual retry button
- **FR-023**: System MUST auto-delete agent_sessions records (including excluded_tasks and evaluation_metadata JSONB columns) after 30 days, aligned with existing document retention policy
- **FR-024**: System MUST log all user manual overrides (task moves between included/excluded, score adjustments) to processing_logs table with fields: session_id, task_id, override_type, original_decision, user_decision, timestamp
- **FR-025**: System MUST display periodic in-app surveys (every 20 prioritization runs or weekly, whichever comes first) asking "Did reflections work as expected?" with thumbs up/down feedback

### Non-Functional Requirements

- **NFR-001**: Average prioritization time MUST be ≤20s (30% improvement over current 25s)
- **NFR-002**: Fast path (high confidence) MUST complete in <18s for 80% of cases
- **NFR-003**: Quality path (evaluation loop) MUST complete in <30s for 20% of cases
- **NFR-004**: Reflection accuracy MUST achieve 95% success rate for negation handling (current: 0%), measured via: (1) override rate for reflection-influenced tasks <5%, (2) user survey thumbs-up rate ≥90%
- **NFR-005**: Task classification accuracy MUST achieve 70%+ correct quadrant assignment for high-value tasks, measured via: manual override rate for included/excluded decisions <20%
- **NFR-006**: Evaluation loop trigger rate MUST be 15-25% of total runs (indicates good inline self-check)
- **NFR-007**: API cost per prioritization MUST be <$0.05 (managed via hybrid logic and mini model for evaluator)
- **NFR-008**: User override rate MUST be <15% of tasks (indicates good alignment)
- **NFR-009**: Test coverage MUST be ≥85% for loop logic, agent prompts, evaluation criteria
- **NFR-010**: System MUST maintain backward compatibility during migration via feature flag

### Key Entities

- **PrioritizationResult**: Generated by unified agent, contains thoughts (outcome analysis, filtering rationale, prioritization strategy, self-check notes), included_tasks (with inclusion_reason, alignment_score), excluded_tasks (with exclusion_reason), ordered_task_ids, per_task_scores (impact, effort, confidence, reasoning), overall confidence, critical_path_reasoning, corrections_made
- **EvaluationResult**: Generated by evaluator agent, contains status (PASS | NEEDS_IMPROVEMENT | FAIL), feedback (specific actionable issues), criteria scores (outcome_alignment, strategic_coherence, reflection_integration, continuity)
- **HybridLoopMetadata**: Tracks evaluation loop execution, contains iterations count, duration_ms, evaluation_triggered boolean, chain_of_thought array (iteration number, confidence, corrections, evaluator feedback per iteration). Retained for 30 days, then auto-deleted via cleanup job aligned with document retention policy
- **ExcludedTask**: Subset of task data with exclusion reasoning, contains task_id, task_text, exclusion_reason, alignment_score (for transparency even when excluded)
- **TaskScore**: Per-task scoring details, contains impact (0-10), effort (0.5-160), confidence (0-1), reasoning (text explanation), dependencies (array of prerequisite task IDs)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Reflection negation accuracy: 95%+ of "ignore X" reflections correctly exclude X tasks (current: 0% - actively boosts them)
- **SC-002**: Task classification accuracy: 70%+ of high-value tasks correctly classified into LEVERAGE quadrant (not NEUTRAL)
- **SC-003**: Average prioritization time: ≤20s across all runs (current: 25s) - 20% improvement
- **SC-004**: Fast path performance: 80%+ of high-confidence runs complete in <18s
- **SC-005**: Quality path performance: 100% of evaluation loop runs complete in <30s
- **SC-006**: Evaluation trigger rate: 15-25% of total prioritization runs trigger evaluation loop
- **SC-007**: Filtering precision: <20% of included tasks manually moved to excluded by users
- **SC-008**: User override rate: <15% of tasks require manual score adjustments
- **SC-009**: Reflection usage: 50%+ of users write reflections weekly (current: <10% due to broken feature)
- **SC-010**: Excluded tasks review: 40%+ of users expand excluded section to review reasoning
- **SC-011**: User satisfaction: Priority quality NPS improves by +30 points
- **SC-012**: API cost: <$0.05 per prioritization run (within budget via hybrid optimization)
- **SC-013**: Test coverage: 85%+ for prioritization loop, agent prompts, evaluation logic
- **SC-014**: Migration success: 100% of sessions processed by new system within 2 weeks of launch
- **SC-015**: Rollback safety: Feature flag enables instant revert to old system if issues detected
- **SC-016**: Data retention: Cleanup job successfully deletes agent_sessions metadata >30 days old, verified via daily automated checks
- **SC-017**: Observability: Override logging captures 100% of user manual adjustments to processing_logs; survey response rate ≥30% for periodic "Did reflections work?" prompts

## Constraints & Assumptions

### Constraints

- **C-001**: Must maintain backward compatibility with existing agent_sessions schema via JSONB columns (excluded_tasks, evaluation_metadata)
- **C-002**: Must not break existing manual override functionality (localStorage-based)
- **C-003**: Must use existing Mastra infrastructure (no new agent frameworks)
- **C-004**: Must respect existing OpenAI API rate limits (mitigated via gpt-4o-mini for evaluator)
- **C-005**: Must complete within 4-week appetite (small batch architectural simplification)

### Assumptions

- **A-001**: Users have defined an active outcome before prioritization (if not, show error/warning)
- **A-002**: Unified agent calculates impact/effort scores independently without relying on Phase 11 strategic scoring outputs
- **A-003**: Phase 7 reflection system is active and provides reflection history
- **A-004**: Task count is typically 100-300 (system designed for up to 500 per batch)
- **A-005**: GPT-4o and GPT-4o-mini remain available and cost-effective for production use
- **A-006**: Hybrid logic (80% fast path, 20% quality path) holds in production based on confidence distribution
- **A-007**: Users will engage more with reflections once negation handling is fixed
- **A-008**: Existing characterfrequency vector service can be deprecated without impacting other features

## Out of Scope (No-gos)

- **Historical outcome tracking** – Deferred to Phase 15 (Learning Loop)
- **Multi-outcome support** – Single active outcome only for P0
- **Team-based prioritization** – Single-user workspace assumption maintained
- **Custom evaluation criteria** – Fixed rubric (outcome/coherence/reflections/continuity)
- **A/B testing different prompts** – Iterative refinement only, no split-testing
- **Phase 11 strategic scoring integration** – Unified agent calculates fresh scores independently; no dependency on or consumption of Phase 11 outputs
- **Automated prompt optimization** – Manual prompt engineering only
- **Real-time streaming of agent reasoning/chain-of-thought** – Reasoning metadata (corrections, evaluator feedback) returned on completion only; task scores stream progressively
- **User-configurable evaluation thresholds** – Hardcoded confidence < 0.7 trigger

## Open Questions

- [ ] Should we show excluded tasks by default (expanded) or collapsed? (UX decision - recommend collapsed to avoid overwhelming new users)
- [ ] What should happen if user has 0 reflections but evaluation loop triggers? (Answer: Reflections optional, loop can run without them)
- [ ] Should manual overrides from localStorage be fed back to agent as hard constraints or soft context? (Recommend soft context to avoid boxing in the agent)
- [ ] How do we handle outcome changes mid-session? Re-prioritize immediately or wait for user trigger? (Recommend user trigger to avoid surprising mid-work)
- [ ] Should we log evaluation loop iterations to separate table for analysis? (Recommend yes for observability, add to processing_logs)
- [ ] What's the rollback threshold? (e.g., if >X% of users disable feature flag, auto-revert?) (Recommend manual decision based on user feedback, no auto-revert)
- [ ] Should we cache LLM responses for identical task sets + outcome? (Potential optimization, but adds complexity - defer to Phase 15)
