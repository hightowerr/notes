# Project Standards - Shared Knowledge Base

**Last Updated**: 2025-10-09  
**Purpose**: Single source of truth for all Claude Code agents  
**Usage**: All agents reference this to avoid duplication

## Tech Stack

### Core Framework

- **Next.js 15**: App Router architecture, file-based routing
- **React 19**: Server Components default, Client Components via 'use client'
- **TypeScript 5+**: Strict mode enabled, ES2017 target
- **Node.js**: 20+ required (native File API)

### Styling & UI

- **Tailwind CSS v4**: Utility-first, no custom CSS unless absolutely necessary
- **ShadCN UI**: Component library (CLI installation only, never manual)
- **next-themes**: Dark/light mode support

### Backend & Data

- **Supabase**:
  - PostgreSQL database
  - Storage (file uploads in 'notes' bucket)
  - Row Level Security (RLS) policies
  - Real-time subscriptions
  - Edge functions / Database triggers

- **Vercel AI SDK**: LLM integration, streaming responses, structured outputs
- **Zod**: Schema validation for all inputs

### Development

- **Vitest**: Unit and integration testing
- **React Testing Library**: Component testing
- **TypeScript**: Path alias @/* for imports
- **ESLint**: Code quality
- **Prettier**: Code formatting (if configured)

### External Services

- **OpenAI / Anthropic**: AI summarization (via Vercel AI SDK)
- **pdf-parse**: PDF text extraction (requires postinstall patch)
- **Unified**: Document parsing (PDF/DOCX/TXT → Markdown)

## Project Structure

```
project-root/
├── app/                          # Next.js App Router
│   ├── api/                     # API route handlers
│   │   └── [endpoint]/
│   │       ├── route.ts         # GET, POST, etc.
│   │       └── __tests__/       # API tests
│   ├── components/              # React components
│   │   ├── Component.tsx
│   │   └── __tests__/           # Component tests
│   ├── layout.tsx               # Root layout
│   └── page.tsx                 # Pages
│
├── lib/                          # Shared code
│   ├── services/                # Business logic
│   │   ├── noteProcessor.ts
│   │   └── __tests__/
│   ├── types/                   # TypeScript type definitions
│   └── utils/                   # Utility functions
│
├── .claude/                      # Agent workspace
│   ├── agents/                  # Agent definitions
│   ├── state/                   # Task state tracking
│   │   └── <task-id>.json
│   ├── docs/                    # Implementation plans
│   │   ├── ui-impl-<task>.md
│   │   ├── be-impl-<task>.md
│   │   └── curated/             # Library docs
│   ├── logs/                    # Test results, debug reports
│   │   ├── test-result-<task>.md
│   │   └── debug-<task>.md
│   ├── reviews/                 # Code review results
│   │   └── <task>.md
│   ├── testing/                 # Manual test procedures
│   └── context/                 # Feature context packages
│
├── .specify/specs/               # Feature specifications
│   └── <feature>/
│       ├── spec.md              # Feature requirements
│       └── tasks.md             # Implementation tasks
│
├── public/                       # Static assets
├── supabase/                     # Supabase migrations and config
└── tsconfig.json                 # TypeScript configuration
```

## Universal Constraints

### File Scope

- ✅ **ONLY** modify files in `files_in_scope` provided by orchestrator
- ❌ **NEVER** touch files outside assigned scope
- ❌ **NEVER** modify multiple unrelated concerns in one task
- ❌ **NEVER** change configuration files without explicit approval

### TypeScript

- ✅ **Strict mode compliance required** (`strict: true`)
- ✅ **Use path alias @/* for all imports** (e.g., `@/lib/services/noteProcessor`)
- ✅ **Explicit types** for function parameters and returns
- ✅ **Use `unknown` for truly dynamic values** (not `any`)
- ❌ **NEVER use `any`** without written justification in code comment
- ❌ **NEVER ignore TypeScript errors** with `@ts-ignore` without explanation
- ❌ **NEVER use type assertions (`as`)** when type guards are appropriate

### Code Quality

- ✅ **Self-documenting variable and function names**
- ✅ **Single Responsibility Principle** (functions do one thing)
- ✅ **Error handling with proper logging** (console + Supabase)
- ✅ **Pure functions where possible** (no side effects)
- ❌ **NEVER leave TODO comments** in completed code
- ❌ **NEVER commit commented-out code**
- ❌ **NEVER use `console.log`** without context (use `console.error`, `console.warn` with labels)

### Security

- ✅ **Validate all user inputs with Zod**
- ✅ **Use environment variables for secrets** (never hardcode)
- ✅ **Sanitize user-generated content** before display
- ✅ **Implement proper authentication checks**
- ❌ **NEVER expose internal error details** to users
- ❌ **NEVER commit secrets or API keys**
- ❌ **NEVER trust client-side data** without server validation

## TDD Workflow (All Implementation Agents)

### The Red-Green-Refactor Cycle

1. **RED: Write failing test first**
   - Test must fail initially (proves test works)
   - Covers acceptance criteria
   - Includes edge cases
   - Tests user-facing behavior
   - Run test to confirm failure

2. **GREEN: Implement minimal solution**
   - Make test pass (minimum code needed)
   - No premature optimization
   - Stay within file scope
   - Run test to confirm pass

3. **VERIFY: Validate test suite**
   - All tests pass
   - Coverage adequate
   - Edge cases handled
   - No regressions

4. **REFACTOR: (Optional) Improve code**
   - Maintain test pass status
   - Enhance readability
   - Remove duplication
   - Run tests again

### Test Requirements

Every implementation must:

- Write test **BEFORE** implementation
- Test must fail initially (RED phase)
- Test must pass after implementation (GREEN phase)
- Test file documented in state file
- No task marked complete with failing tests

**Test types needed:**

- **Unit tests**: Services, utilities, pure functions
- **Integration tests**: API routes, database operations
- **Component tests**: User interactions, rendering, accessibility
- **User journey tests**: Complete workflow (SEE → DO → VERIFY)

## State File Format

Every agent writes `.claude/state/<task-id>.json` upon completion:

```json
{
  "agent": "agent-name",
  "task_id": "unique-task-identifier",
  "status": "complete|blocked|in-progress",
  "test": "written|skipped|failed",
  "impl": "done|partial|blocked",
  "files": [
    "path/to/modified/file1.ts",
    "path/to/modified/file2.tsx"
  ],
  "plan_doc": ".claude/docs/<agent>-<task>.md",
  "enables_user_action": "User can now [specific action that user performs]",
  "notes": "Optional context, blockers, or special considerations"
}
```

### Required Fields

- **agent**: Which agent created this state
- **task_id**: Unique identifier for task
- **status**: Current task status
- **files**: All files modified (relative paths from project root)
- **enables_user_action**: What user can now do (be specific)

### Optional Fields (Agent-Specific)

**frontend-ui-builder adds:**
```json
{
  "shadcn_components": ["Button", "Form"],
  "accessibility": "WCAG 2.1 AA compliant - keyboard nav, screen reader",
  "responsive": "Mobile-first, tested sm/md/lg/xl",
  "backend_integration": {
    "consumes": "POST /api/endpoint",
    "verified": true
  }
}
```

**backend-engineer adds:**
```json
{
  "api_contract": {
    "endpoint": "POST /api/tags",
    "request": { "tag": "string" },
    "response": { "success": true, "data": { "id": "string" } },
    "errors": {
      "400": "Invalid input",
      "500": "Server error"
    }
  },
  "database_changes": "Added 'tags' column to notes table",
  "frontend_ready": true
}
```

**typescript-architect adds:**
```json
{
  "type_files": ["lib/types/repository.ts"],
  "usage_notes": "Import from @/types/repository"
}
```

## Automatic Quality Pipeline

After ANY implementation, these run automatically in strict sequence:

```
Implementation Complete
    ↓
┌────────────────────────┐
│ 1. code-reviewer       │ (BLOCKING)
│    Reviews all code    │
│    Checks standards    │
│    Output: .claude/reviews/<task>.md
│    Must pass: review: pass
└───────────┬────────────┘
            ↓
┌────────────────────────┐
│ 2. test-runner         │ (BLOCKING)
│    Executes tests      │
│    Validates coverage  │
│    Output: .claude/logs/test-result-<task>.md
│    Must pass: status: PASS
└───────────┬────────────┘
            ↓
       [Tests Pass?]
            ↓
       YES  │  NO
            ↓      ↓
       [Complete]  │
                   ↓
            ┌──────────────────┐
            │ 3. debugger      │ (AUTOMATIC)
            │    Root cause    │
            │    Corrective plan
            │    Output: .claude/logs/debug-<task>.md
            └──────┬───────────┘
                   │
                   └─→ Loop back to code-reviewer with fixes
```

### Quality Gate Rules

**Agents NEVER:**
- Self-invoke quality checks
- Skip any step in pipeline
- Proceed with failing tests
- Bypass code review

**Orchestrator ALWAYS:**
- Invokes quality pipeline automatically
- Blocks progression until pass
- Triggers debugger on test failures
- Applies corrective plans

## Vertical Slice Requirements

Every task MUST deliver something a user can:

### 1. SEE (Visible)
- UI change the user observes
- Observable outcome or result
- Visual feedback or confirmation
- Data displayed to user

### 2. DO (Interactive)
- Action user can perform
- Button to click, form to submit
- Capability to interact with system
- Workflow to complete

### 3. VERIFY (Confirmable)
- User sees result of their action
- Confirmation message or state change
- Evidence that action succeeded
- Observable side effect

### Anti-Patterns (NOT Vertical Slices)

❌ **Incomplete slices:**
- Backend API with no UI to call it
- UI component with no data or backend
- Database schema with no way to use it
- Service layer with no consumer
- "Preparation work" without user value

✅ **Valid slices:**
- Button → API call → Database → Result displayed
- Form → Validation → Storage → Confirmation message
- Upload → Processing → Result → User sees summary
- Filter UI → Query → Results → Updated display

### Full-Stack Coordination

For full-stack tasks:

1. Backend implements API + database operations
2. Backend creates state file with API contract
3. Backend sets `frontend_ready: true`
4. Frontend reads backend state file
5. Frontend consumes API and builds UI
6. Frontend verifies integration works
7. User can complete full workflow

## Accessibility Baseline

All UI implementations must meet **WCAG 2.1 AA minimum**:

### Keyboard Navigation

- ✅ All interactive elements accessible via keyboard
- ✅ Visible focus indicators (outline, border change)
- ✅ Logical tab order (left-to-right, top-to-bottom)
- ✅ Escape key closes modals/dialogs
- ✅ Enter/Space activates buttons

### Screen Readers

- ✅ Proper ARIA labels on interactive elements
- ✅ ARIA roles for complex components (dialog, navigation, etc.)
- ✅ ARIA live regions for dynamic content
- ✅ Alt text on images (or aria-hidden if decorative)
- ✅ Form labels associated with inputs

### Visual Design

- ✅ **Color contrast**: Text 4.5:1, Large text 3:1, UI components 3:1
- ✅ **Don't rely on color alone** (use icons, labels, patterns)
- ✅ **Text resizable to 200%** without loss of functionality
- ✅ **Touch targets minimum 44×44 pixels**

### Responsive Design

- ✅ **Mobile-first approach**
- ✅ **Breakpoints**: sm (640px), md (768px), lg (1024px), xl (1280px)
- ✅ **Content reflows** without horizontal scroll
- ✅ **Touch-friendly on mobile** (larger tap targets)

### Testing Accessibility

- ✅ Include accessibility tests in test suite
- ✅ Test keyboard navigation manually
- ✅ Use screen reader to verify (VoiceOver, NVDA, JAWS)
- ✅ Check with browser dev tools (Lighthouse, axe)

## ShadCN UI Conventions

### Installation (MANDATORY)

```bash
# ALWAYS use official CLI
npx shadcn-ui@latest add <component>

# Example
npx shadcn-ui@latest add button
npx shadcn-ui@latest add form
```

**NEVER:**
- Manually create component files
- Copy-paste component code from docs
- Modify installed components extensively (prefer composition)

### Component Selection Priority

#### Complete blocks (highest priority)
- Pre-built page sections (login-01, dashboard-07, etc.)
- Full layouts with multiple components
- Use when available for common patterns

#### Individual components (use when no blocks exist)
- Button, Input, Form, Card, Dialog, etc.
- Compose together to build features
- Follow official composition patterns

#### Custom components (last resort only)
- Only when no ShadCN equivalent exists
- Must justify why custom needed
- Document in implementation plan

### Usage Patterns

**Follow official demos exactly:**

```tsx
// ✅ Correct: Official pattern
<Button variant="default" onClick={handleClick}>
  Submit
</Button>

// ❌ Wrong: Custom variant not in ShadCN
<Button variant="custom-blue" onClick={handleClick}>
  Submit
</Button>
```

**Component composition:**

```tsx
// ✅ Correct: Compose ShadCN components
<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
  </CardHeader>
  <CardContent>
    <Form>...</Form>
  </CardContent>
</Card>
```

**Theming:**
- Use CSS variables for theme customization (in `globals.css`)
- Respect dark mode via `next-themes`
- Don't override component styles directly

### MCP Tools for ShadCN

Available MCP tools (use in document-curator and frontend-ui-builder):

- `mcp__shadcn__get_project_registries`: List available component sources
- `mcp__shadcn__list_items_in_registries`: See all components
- `mcp__shadcn__search_items_in_registries`: Search for specific components
- `mcp__shadcn__view_items_in_registries`: View component details
- `mcp__shadcn__get_item_examples_from_registries`: Get usage examples
- `mcp__shadcn__get_add_command_for_items`: Get install command
- `mcp__shadcn__get_audit_checklist`: Accessibility checklist

## Error Handling Standards

### Logging Pattern

```typescript
// ALWAYS log to both console and Supabase (if critical)
console.error('[ComponentName/ServiceName]:', error);

// For critical errors, also log to Supabase
await supabase
  .from('error_logs')
  .insert({
    component: 'ComponentName',
    error: error.message,
    stack: error.stack,
    context: { userId, documentId, /* relevant data */ },
    timestamp: new Date().toISOString()
  });
```

### User-Facing Error Messages

**Be specific:**
```typescript
// ✅ Good: Specific and actionable
throw new Error('File size exceeds 10MB limit');

// ❌ Bad: Generic and unhelpful
throw new Error('Invalid file');
```

**Be actionable:**
```typescript
// ✅ Good: Tells user what to do
return { 
  error: 'Email format invalid. Please use format: user@example.com' 
};

// ❌ Bad: No guidance
return { error: 'Email validation failed' };
```

**Be consistent:**
- Use toast notifications for user feedback
- Red toast for errors
- Green toast for success
- Yellow/orange for warnings
- Position: Bottom-right typically

**Be graceful:**
- Always provide fallback UI
- Show loading states during operations
- Display retry option when appropriate
- Never show stack traces to users

### Retry Logic

For external API calls (e.g., AI SDK):

```typescript
const MAX_RETRIES = 3;
const BACKOFF_MS = 1000;

async function callWithRetry<T>(
  operation: () => Promise<T>,
  retries = MAX_RETRIES
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (retries > 0) {
      console.warn(`Retrying... (${MAX_RETRIES - retries + 1}/${MAX_RETRIES})`);
      await new Promise(resolve => 
        setTimeout(resolve, BACKOFF_MS * (MAX_RETRIES - retries + 1))
      );
      return callWithRetry(operation, retries - 1);
    }
    throw error;
  }
}
```

### HTTP Status Codes

Backend API routes must use:

- **200**: Success
- **201**: Created (for POST creating new resource)
- **400**: Bad request (invalid input, validation failure)
- **401**: Unauthorized (authentication required)
- **403**: Forbidden (authenticated but not allowed)
- **404**: Not found
- **409**: Conflict (duplicate resource)
- **500**: Internal server error (log full details, show generic to user)

## Testing Standards

### Test File Location

```
app/components/Button.tsx
app/components/__tests__/Button.test.tsx

app/api/users/route.ts
app/api/users/__tests__/route.test.ts

lib/services/noteProcessor.ts
lib/services/__tests__/noteProcessor.test.ts
```

### Test Naming Convention

```typescript
describe('ComponentName or FunctionName', () => {
  it('should render with default props', () => { /* ... */ });
  
  it('should handle user click events', () => { /* ... */ });
  
  it('should display error state when API fails', () => { /* ... */ });
  
  it('should be keyboard accessible', () => { /* ... */ });
  
  it('should validate input correctly', () => { /* ... */ });
});
```

### Coverage Requirements

**Must test:**
- ✅ **Happy path** (expected user behavior)
- ✅ **Error paths** (API failures, validation errors)
- ✅ **Edge cases** (empty data, max values, special characters)
- ✅ **User interactions** (clicks, form submissions, navigation)
- ✅ **Accessibility** (keyboard nav, screen reader)
- ✅ **Integration** (frontend + backend for full-stack)

**Can skip:**
- Framework internals (React, Next.js behavior)
- Third-party library testing (trust they're tested)
- Visual regression (unless critical to feature)

### Manual Testing

When automated testing blocked (e.g., FormData limitation):

Create `.claude/testing/<task>-manual.md`:

```markdown
# Manual Test: [Task Name]

## Reason for Manual Testing
[Why automated testing not possible]

## Prerequisites
- [Environment setup needed]
- [Data setup needed]

## Test Steps

1. [Step 1 with expected result]
2. [Step 2 with expected result]
3. [Step 3 with expected result]

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2

## Edge Cases to Test
- [Edge case 1]
- [Edge case 2]

## Results
**Tested by**: [Name]  
**Date**: [Date]  
**Status**: PASS | FAIL  
**Notes**: [Any observations]
```

Reference manual test pattern: `T002_MANUAL_TEST.md`

## Communication Standards

### Progress Updates Format

```
🔄 Task: [task-name]
📍 Phase: [Context/Implementation/Review/Testing/Debug]
🤖 Agent: [agent-name]
📊 Status: [brief status update]
```

**Example:**
```
🔄 Task: add-tag-filtering
📍 Phase: Implementation
🤖 Agent: frontend-ui-builder
📊 Status: Installing ShadCN Select component
```

### Completion Reports Format

```
✅ Task Complete: [task-name]
👤 User Can Now: [specific action enabled]
📁 Files Modified: [count] files
🧪 Tests: [X passed / Y total]
📝 Notes: [any important context]
🔜 Next: [next task or "Feature complete"]
```

**Example:**
```
✅ Task Complete: add-tag-filtering
👤 User Can Now: Filter notes by tags using dropdown menu
📁 Files Modified: 3 files
🧪 Tests: 8 passed / 8 total
📝 Notes: Uses ShadCN Select component, mobile-responsive
🔜 Next: add-tag-bulk-operations
```

### Escalation Triggers

When to stop and ask orchestrator/user:

🚨 **Ambiguous requirements**
- Task description unclear
- Acceptance criteria conflict
- Multiple valid interpretations

🚨 **Missing dependencies**
- Required library not installed
- Environment variables not set
- Database tables don't exist

🚨 **Repeated failures**
- Same test failing after 3+ fix attempts
- Root cause can't be identified
- Circular dependency issues

🚨 **Scope violations**
- Task requires files outside `files_in_scope`
- Breaking changes to existing APIs
- Architecture deviation needed

🚨 **Technical blockers**
- MCP tools not working
- Test environment broken
- Build failing for unknown reason

## Known Issues & Workarounds

### FormData Testing Limitation

**Issue**: FormData serialization fails in Vitest test environment  
**Symptom**: Tests involving file uploads fail with serialization errors  
**Workaround**: Use manual testing approach

- Create manual test document in `.claude/testing/`
- Follow pattern from `T002_MANUAL_TEST.md`
- Document test steps and expected results
- Verify manually before deployment

**When this affects you:**
- Any file upload tests
- FormData parsing in API routes
- Multipart form handling

### pdf-parse Library

**Issue**: Requires postinstall patch for proper operation  
**Solution:**
```bash
npm run postinstall
```

**When needed:**
- First-time setup after `npm install`
- After fresh clone of repository
- After clearing `node_modules`

**How it works**: Patches library to work with Next.js bundler

### Node.js Version Requirement

**Requirement**: Node.js 20+ for native File API  
**Check version:**
```bash
node --version
```

**Install/switch with nvm:**
```bash
nvm install 20
nvm use 20
```

**Why needed**: Native File API used in upload processing

### Supabase Storage

- **30-day auto-expiry**: Processed documents auto-delete after 30 days
- **RLS policies**: Ensure proper permissions for file access
- **Content hash deduplication**: Duplicate files (same hash) are rejected
- **Status tracking**: Files go through: `pending → processing → completed/failed`

### AI SDK Edge Cases

- **Invalid JSON responses**: Retry logic handles malformed JSON from LLM
- **Rate limits**: Respect API rate limits (built into AI SDK)
- **Token limits**: Monitor token usage for large documents
- **Low confidence**: Flag summaries for manual review if confidence < threshold

## Quick Reference

### State File Locations

- **Task state**: `.claude/state/<task-id>.json`
- **Implementation plans**: `.claude/docs/<agent>-<task>.md`
- **Curated library docs**: `.claude/docs/curated/<task-id>.md`
- **Test results**: `.claude/logs/test-result-<task>.md`
- **Debug reports**: `.claude/logs/debug-<task>.md`
- **Code reviews**: `.claude/reviews/<task>.md`
- **Manual tests**: `.claude/testing/<task>-manual.md`
- **Context packages**: `.claude/context/<feature>.md`

### Common Commands

```bash
# Install ShadCN component
npx shadcn-ui@latest add <component>

# Run all tests
npm test

# Run specific test file
npm test -- path/to/test.test.ts

# Run tests in watch mode
npm test -- --watch

# Type check
npm run type-check

# Build project
npm run build

# Run development server
npm run dev

# Format code (if configured)
npm run format

# Lint code
npm run lint
```

### Environment Variables

Required in `.env.local`:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# AI Service (OpenAI or Anthropic)
OPENAI_API_KEY=your-openai-key
# OR
ANTHROPIC_API_KEY=your-anthropic-key

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Import Aliases

```typescript
// Use path alias for all imports
import { noteService } from '@/lib/services/noteService';
import { Button } from '@/components/ui/button';
import type { Note } from '@/lib/types/note';

// ❌ Don't use relative imports
import { noteService } from '../../../lib/services/noteService';
```

### TypeScript Configuration

From `tsconfig.json`:

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2017",
    "lib": ["ES2017"],
    "moduleResolution": "bundler",
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```

## Emergency Contacts

### Orchestrator Blocked
- **Check**: `.claude/state/` for task status files
- **Look for**: Latest state file, check status and notes fields
- **Action**: Read notes for blocker details, escalate to user if unclear

### Tests Failing Repeatedly
- **After 3 cycles**: Escalate to user with debug reports
- **Provide**: All debug reports from `.claude/logs/debug-*.md`
- **Include**: What has been tried, current hypothesis

### Scope Unclear
- **Check**: `.specify/specs/<feature>/spec.md` for feature requirements
- **Check**: `.specify/specs/<feature>/tasks.md` for task breakdown
- **Action**: If still unclear, halt and ask user for clarification

### Integration Not Working
- **Check backend state**: `.claude/state/<task>-backend.json` for API contract
- **Check frontend state**: `.claude/state/<task>-frontend.json` for integration details
- **Verify**: API contract matches between backend and frontend
- **Test**: Call API manually with curl/Postman to isolate issue

---

All agents must reference this document rather than duplicating information in individual prompts.

**Agents reference specific sections:**
- **Implementation agents** → Tech Stack, TDD Workflow, Testing Standards
- **Quality agents** → Quality Pipeline, Testing Standards, Known Issues
- **Intelligence agents** → Project Structure, Tech Stack
- **All agents** → Universal Constraints, State File Format, Communication Standards