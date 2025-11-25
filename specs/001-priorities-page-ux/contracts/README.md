# Component Contracts

**Feature**: Priorities Page UX Refinement
**Branch**: `001-priorities-page-ux`

## Overview

This directory contains component contracts that define the expected behavior and prop interfaces for the priorities page UX refactoring. These contracts serve as executable specifications that guide TDD implementation.

## Contract Files

### component-contracts.test.ts

Defines the behavioral contracts for all modified components:

**TaskList Component Contract**:
- Header integration with sorting dropdown
- Sorting strategy change handling
- Task display and ordering
- Disabled state when no tasks

**ContextCard Component Contract**:
- Metadata display (completion time, quality check)
- Graceful handling of missing metadata
- Preservation of existing functionality

**SortingStrategySelector Component Contract**:
- Compact variant for header embedding
- Disabled state with tooltip
- Strategy selection and change handling

**ReasoningChain Component Contract**:
- Debug mode visibility control
- Chain-of-thought content display
- Collapsible behavior

**Integration Contract**:
- Sorting feedback loop (viewport verification)
- No scroll required to verify sorting effect

## Usage

### During TDD Implementation

1. **Red Phase**: Run failing contract tests
```bash
pnpm test:run specs/001-priorities-page-ux/contracts/component-contracts.test.ts
```

2. **Green Phase**: Implement minimal code to pass each test

3. **Refactor Phase**: Improve implementation while maintaining green tests

### Test Organization

Tests are organized by component and behavior:
- Each `describe` block covers a component
- Nested `describe` blocks cover specific behaviors
- `it` blocks define individual contract expectations

### Contract Enforcement

All contract tests must pass before:
- Merging to main branch
- Marking slice as complete
- Deploying to production

## Key Contracts

### TaskList Header Integration

```typescript
it('renders header with sorting dropdown when tasks exist', () => {
  render(<TaskList tasks={mockTasks} sortingStrategy="strategic-impact" onStrategyChange={fn()} />);
  expect(screen.getByRole('heading', { name: /your prioritized tasks/i })).toBeInTheDocument();
  expect(screen.getByRole('combobox')).toBeInTheDocument();
});
```

**Contract**: TaskList must render a header section with title and sorting dropdown before task rows.

### ContextCard Metadata Display

```typescript
it('displays completion time when provided', () => {
  const completionTime = new Date(Date.now() - 120000);
  render(<ContextCard outcome={mockOutcome} completionTime={completionTime} />);
  expect(screen.getByText(/completed.*2.*min.*ago/i)).toBeInTheDocument();
});
```

**Contract**: ContextCard must render completion time using `formatDistanceToNow` when provided.

### SortingStrategySelector Compact Variant

```typescript
it('applies compact styles when compact prop is true', () => {
  render(<SortingStrategySelector compact={true} />);
  expect(screen.getByRole('combobox')).toHaveClass(expect.stringContaining('h-9'));
});
```

**Contract**: SortingStrategySelector must apply reduced padding and font size when `compact={true}`.

### ReasoningChain Debug Mode

```typescript
it('returns null when debugMode is false', () => {
  const { container } = render(<ReasoningChain debugMode={false} />);
  expect(container.firstChild).toBeNull();
});
```

**Contract**: ReasoningChain must not render when `debugMode` is false or undefined.

## Mock Data

All contracts use consistent mock data defined at the top of the test file:

- `mockTasks`: Array of 3 prioritized tasks with varied scores
- `mockOutcome`: User outcome with assembled text and preferences
- `mockChainOfThought`: Array of reasoning steps for debug display

## Test Coverage Requirements

**Minimum Coverage**: 80% across all modified components

**Critical Paths to Cover**:
- Happy path: All props provided, normal rendering
- Missing data: Optional props undefined, graceful degradation
- Edge cases: Zero tasks, no outcome, rapid changes
- Integration: Sorting feedback loop, viewport verification

## Running Tests

**All contract tests**:
```bash
pnpm test:run specs/001-priorities-page-ux/contracts/
```

**Specific component**:
```bash
pnpm test:run specs/001-priorities-page-ux/contracts/ -t "TaskList Component Contract"
```

**Watch mode during development**:
```bash
pnpm test specs/001-priorities-page-ux/contracts/
```

## Contract Violations

If a contract test fails:

1. **Review the contract**: Is the expectation correct?
2. **Check implementation**: Does it match the contract?
3. **Update contract if needed**: If requirements changed, update contract first
4. **Never skip failing tests**: Fix implementation or update contract

## Adding New Contracts

When adding new behavior:

1. Write contract test first (TDD)
2. Run test to verify it fails (RED)
3. Implement minimal code to pass (GREEN)
4. Refactor while keeping tests green
5. Update this README with new contract documentation

## Contract Review Checklist

Before marking slice complete:

- [ ] All contract tests pass
- [ ] Coverage ≥80% for modified components
- [ ] No skipped or disabled tests
- [ ] Mock data represents realistic scenarios
- [ ] Contracts cover happy path, edge cases, and error states
- [ ] Integration contracts verify user journey end-to-end

## Related Documentation

- [spec.md](../spec.md) - Feature specification with user stories
- [plan.md](../plan.md) - Implementation plan with TDD workflow
- [data-model.md](../data-model.md) - Component prop interfaces
- [quickstart.md](../quickstart.md) - Manual testing guide

## Notes

- Contracts are executable specifications, not just tests
- Contracts define what to build, implementation defines how
- Failing contracts indicate missing functionality, not bugs
- Passing contracts indicate contract fulfillment, not completion
- Manual testing (quickstart.md) still required for visual/UX validation
