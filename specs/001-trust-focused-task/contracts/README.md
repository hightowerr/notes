# API Contracts: Trust-Focused Task List Refactor

This directory contains API contract definitions for the trust-focused task list refactor. These contracts serve as the source of truth for API behavior and are validated by contract tests.

## Contract Files

1. **agent-brief-reasoning.yaml** - Agent output schema with brief_reasoning field validation
2. **manual-override-apply.yaml** - Manual override "Apply" button endpoint
3. **completed-tasks-pagination.yaml** - Completed tasks section data fetching

## Contract Testing Strategy

Each contract file defines:
- Request/response schemas
- Validation rules
- Error scenarios
- Performance targets

Contract tests are located in `__tests__/contract/` and validate:
- Schema compliance
- Status codes
- Error handling
- Edge cases

## No API Changes Required

**Note**: This feature primarily involves UI refactoring and agent prompt changes. The following contracts document expected behavior but may not require new API endpoints:

- **Brief reasoning**: Added to existing agent output schema (no new endpoint)
- **Filter persistence**: localStorage only (no API)
- **Completed tasks**: Client-side filtering (no new endpoint)
- **Manual override**: Existing `/api/tasks/[id]/override` endpoint (extended behavior)

## Contract Validation Rules

### Brief Reasoning Validation
- **Length**: 5-150 characters
- **Word count**: ≤20 words
- **Format**: Outcome-linked or dependency reference
- **Prohibited**: Generic phrases without specifics

### Focus Mode Filter
- **Inclusion**: Quick Wins + Strategic Bets quadrants
- **Exclusion**: Neutral + Overhead quadrants
- **Target reduction**: 40-60% of total tasks

### Manual Override Apply
- **Performance**: <100ms re-ranking
- **Validation**: Impact 0-10, effort >0
- **Concurrency**: Last write wins
- **Reasoning**: Regenerates on next agent cycle

## Testing Matrix

| Contract | Test Type | Location | Validation |
|----------|-----------|----------|------------|
| Brief reasoning | Unit | `__tests__/contract/agent-brief-reasoning.test.ts` | Schema validation, retry logic |
| Focus mode filter | Integration | `__tests__/integration/focus-mode-filter.test.ts` | Quadrant inclusion, task count reduction |
| Manual override | Integration | `__tests__/integration/manual-override-apply.test.ts` | Re-ranking speed, optimistic UI |
| Completed tasks | Integration | `__tests__/integration/completed-tasks-pagination.test.ts` | Pagination, "Show more" behavior |

## References

- Feature spec: `../spec.md`
- Data model: `../data-model.md`
- Research: `../research.md`
