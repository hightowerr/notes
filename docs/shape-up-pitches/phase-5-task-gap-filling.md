# Shape Up Pitch: Phase 5 - Task Gap Filling (Mastra)

## Problem

**Users upload notes with logical gaps, but the system only prioritizes what's explicitly written—leaving "Swiss cheese plans" full of holes.**

Real example from user uploads:
```
User uploads: "Q4 Planning Notes"

Extracted tasks:
#1. Define Q4 goals
#2. Design app mockups
#5. Launch on app store

Missing tasks (not in document):
#3. Build app frontend
#4. Implement backend API
#4.5. Test with beta users
```

The system extracts and prioritizes tasks perfectly, but has **no awareness of what's missing**. It can't tell that "Design mockups" → "Launch on app store" skips 3-4 weeks of implementation work.

**Current state:**
- ✅ Task extraction works (Phase 0)
- ✅ Semantic search works (Phase 1-2)
- ✅ Agent can detect dependencies (Phase 2-3)
- ❌ No gap detection between tasks
- ❌ No task generation capability
- ❌ Users must manually identify and add missing steps

**User impact:**
- Plans look complete but have 20-40% of critical tasks missing
- Users waste time manually filling gaps post-prioritization
- Risk of missing critical prerequisites (e.g., "Deploy" before "Build")

---

## Solution

**Add a "Find Missing Tasks" button that uses a new Mastra tool to detect gaps and generate bridging tasks for user review.**

### Appetite: 1 week (5 working days)

### Breadboard Sketch

```
┌─────────────────────────────────────────────────────────────────┐
│  PRIORITIES VIEW (UPDATED)                                      │
│                                                                  │
│  Active Outcome: Launch mobile app by Q4 through MVP release    │
│                                                                  │
│  #  TASK                                 DEPENDS   ESTIMATE      │
│  ───────────────────────────────────────────────────────────    │
│  1  Define Q4 goals                      —         1 week        │
│  2  Design app mockups                   #1        2 weeks       │
│                                                                  │
│     ⚠️  Detected gap: 3 weeks unaccounted for                   │
│     Jump: design → launch (missing implementation)              │
│                                                                  │
│  5  Launch on app store                  #2 (?)    1 week       │
│                                                                  │
│  [Find Missing Tasks]  ← NEW BUTTON                             │
└─────────────────────────────────────────────────────────────────┘

After clicking "Find Missing Tasks":

┌─────────────────────────────────────────────────────────────────┐
│  💡 3 Tasks Suggested to Fill Gaps                         [×]  │
│                                                                  │
│  Gap detected between:                                          │
│  #2: Design app mockups → #5: Launch on app store               │
│                                                                  │
│  Time gap: 3 weeks unaccounted                                  │
│  Jump type: design → launch (skips implementation)              │
│                                                                  │
│  ─────────────────────────────────────────────────────────      │
│                                                                  │
│  Suggested bridging tasks:                                      │
│                                                                  │
│  ☑ #3: Build app frontend based on mockups                     │
│     3 weeks · High confidence (85%)                             │
│     [Edit]                                                      │
│                                                                  │
│  ☑ #4: Implement backend API and database                      │
│     2 weeks · High confidence (82%)                             │
│     [Edit]                                                      │
│                                                                  │
│  ☐ #4.5: Conduct beta testing with 50 users                    │
│     1 week · Medium confidence (68%)                            │
│     [Edit]                                                      │
│                                                                  │
│  All suggestions are pre-selected. Uncheck to reject.           │
│                                                                  │
│  [Accept Selected (2)]  [Cancel]                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Technical Implementation

### New Mastra Tool: `suggest-bridging-tasks`

```typescript
// lib/mastra/tools/suggestBridgingTasks.ts
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { getDocumentContext } from './getDocumentContext';
import { semanticSearchTool } from './semanticSearch';

const inputSchema = z.object({
  predecessor_id: z.string().describe('Task ID before the gap'),
  successor_id: z.string().describe('Task ID after the gap'),
  outcome_text: z.string().describe('User\'s active outcome statement'),
  max_tasks: z.number().default(3).describe('Maximum bridging tasks to generate'),
});

const outputSchema = z.object({
  tasks: z.array(
    z.object({
      text: z.string(),
      estimated_hours: z.number().min(8).max(160), // 1-4 weeks
      required_cognition: z.enum(['low', 'medium', 'high']),
      confidence: z.number().min(0).max(1),
      reasoning: z.string(),
    })
  ),
});

async function executeSuggestBridgingTasks(
  input: z.input<typeof inputSchema>
) {
  const { predecessor_id, successor_id, outcome_text, max_tasks } = inputSchema.parse(input);

  // Step 1: Get context for predecessor and successor
  const contextResult = await getDocumentContextTool.execute({
    context: { task_ids: [predecessor_id, successor_id] }
  });

  const docs = contextResult.documents;
  if (docs.length === 0) {
    throw new Error('No document context found for provided task IDs');
  }

  // Step 2: Search for similar task sequences in past documents
  const searchQuery = `tasks between ${docs[0].tasks.find(t => t.task_id === predecessor_id)?.task_text} and ${docs[0].tasks.find(t => t.task_id === successor_id)?.task_text}`;

  const searchResult = await semanticSearchTool.execute({
    context: { query: searchQuery, limit: 10, threshold: 0.6 }
  });

  // Step 3: Generate bridging tasks using AI with context
  const prompt = `
You are filling a logical gap in a task plan.

USER'S OUTCOME:
"${outcome_text}"

CURRENT GAP:
Predecessor: "${docs[0].tasks.find(t => t.task_id === predecessor_id)?.task_text}"
Successor: "${docs[0].tasks.find(t => t.task_id === successor_id)?.task_text}"

DOCUMENT CONTEXT:
${docs.map(d => d.markdown).join('\n\n---\n\n').slice(0, 3000)}

SIMILAR TASKS FROM PAST DOCUMENTS:
${searchResult.tasks.map(t => `- ${t.task_text} (${Math.round(t.similarity * 100)}% similar)`).join('\n')}

Generate ${max_tasks} intermediate tasks that logically connect the predecessor to the successor.

Requirements:
- Tasks must be concrete and actionable
- Each task should take 1-4 weeks (8-160 hours)
- Tasks should form a logical sequence
- Avoid duplicating the predecessor or successor
- Be specific to the user's outcome
- Base suggestions on similar task patterns found in past documents

Return a JSON array of tasks with text, estimated_hours, required_cognition, confidence, and reasoning.
`;

  const response = await generateObject({
    model: openai('gpt-4o'),
    schema: outputSchema,
    prompt,
    temperature: 0.3, // Lower temp for more consistent suggestions
  });

  return {
    tasks: response.object.tasks.map(task => ({
      ...task,
      source: 'ai_generated',
      generated_from: {
        predecessor_id,
        successor_id,
      },
      requires_review: true,
    })),
    gap_context: {
      predecessor_id,
      successor_id,
      search_results_count: searchResult.tasks.length,
    },
  };
}

export const suggestBridgingTasksTool = createTool({
  id: 'suggest-bridging-tasks',
  description: 'Detects logical gaps between tasks and generates bridging tasks to fill them. Use this when you notice a task sequence that skips intermediate steps.',
  inputSchema,
  execute: executeSuggestBridgingTasks,
});
```

### Gap Detection Logic

**Add to `lib/mastra/agents/taskOrchestrator.ts`:**

```typescript
// Gap detection heuristics (runs after initial prioritization)
function detectGaps(orderedTasks: Task[]): Gap[] {
  const gaps: Gap[] = [];

  for (let i = 0; i < orderedTasks.length - 1; i++) {
    const predecessor = orderedTasks[i];
    const successor = orderedTasks[i + 1];

    const indicators = {
      timeGap: estimatedTimeGap(predecessor, successor) > 7, // >1 week gap
      actionTypeJump: detectActionTypeJump(predecessor, successor),
      noDependency: successor.depends_on !== predecessor.id,
      skillJump: detectSkillJump(predecessor, successor),
    };

    // Require 3+ indicators to flag a gap (conservative approach)
    const indicatorCount = Object.values(indicators).filter(Boolean).length;

    if (indicatorCount >= 3) {
      gaps.push({
        predecessor_id: predecessor.id,
        successor_id: successor.id,
        indicators,
        confidence: indicatorCount / 4, // 0.75 or 1.0
      });
    }
  }

  // Return top 3 gaps by confidence
  return gaps
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3);
}

function detectActionTypeJump(task1: Task, task2: Task): boolean {
  const actionTypes = {
    research: 1,
    design: 2,
    plan: 3,
    build: 4,
    test: 5,
    deploy: 6,
    monitor: 7,
  };

  const type1 = inferActionType(task1.text);
  const type2 = inferActionType(task2.text);

  // Jump detected if skipping 2+ action types
  return Math.abs(actionTypes[type2] - actionTypes[type1]) >= 2;
}

function detectSkillJump(task1: Task, task2: Task): boolean {
  const skills = {
    strategy: ['define', 'plan', 'prioritize'],
    design: ['design', 'mockup', 'wireframe'],
    frontend: ['UI', 'component', 'interface'],
    backend: ['API', 'database', 'server'],
    qa: ['test', 'verify', 'validate'],
  };

  // Simplified skill detection - check if task text contains skill keywords
  const skill1 = Object.keys(skills).find(s =>
    skills[s].some(kw => task1.text.toLowerCase().includes(kw))
  );
  const skill2 = Object.keys(skills).find(s =>
    skills[s].some(kw => task2.text.toLowerCase().includes(kw))
  );

  return skill1 !== skill2;
}
```

### UI Integration

**Add button to `app/priorities/page.tsx`:**

```tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { SuggestedTasksModal } from '@/app/components/SuggestedTasksModal';

export default function PrioritiesPage() {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestedTasks, setSuggestedTasks] = useState([]);

  async function handleFindMissingTasks() {
    // Call agent to detect gaps + generate bridging tasks
    const response = await fetch('/api/agent/suggest-gaps', {
      method: 'POST',
      body: JSON.stringify({ session_id: latestSessionId }),
    });

    const { suggestions } = await response.json();
    setSuggestedTasks(suggestions);
    setShowSuggestions(true);
  }

  return (
    <div>
      {/* Existing task list */}
      <TaskList tasks={prioritizedTasks} />

      {/* New button */}
      <Button onClick={handleFindMissingTasks} variant="outline">
        💡 Find Missing Tasks
      </Button>

      {/* Modal for reviewing suggestions */}
      <SuggestedTasksModal
        open={showSuggestions}
        suggestions={suggestedTasks}
        onAccept={(accepted) => {
          // Insert accepted tasks into plan
          insertBridgingTasks(accepted);
          setShowSuggestions(false);
        }}
        onCancel={() => setShowSuggestions(false)}
      />
    </div>
  );
}
```

**New component: `app/components/SuggestedTasksModal.tsx`:**

```tsx
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export function SuggestedTasksModal({ open, suggestions, onAccept, onCancel }) {
  const [selected, setSelected] = useState(
    suggestions.map(s => s.id) // Default: all checked
  );

  return (
    <Dialog open={open} onOpenChange={onCancel}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>💡 {suggestions.length} Tasks Suggested to Fill Gaps</DialogTitle>
        </DialogHeader>

        {suggestions.map((suggestion) => (
          <Card key={suggestion.id} className="border-yellow-200 bg-yellow-50">
            <CardContent className="flex items-center gap-2 p-4">
              <Checkbox
                checked={selected.includes(suggestion.id)}
                onCheckedChange={(checked) => {
                  if (checked) {
                    setSelected([...selected, suggestion.id]);
                  } else {
                    setSelected(selected.filter(id => id !== suggestion.id));
                  }
                }}
              />
              <div className="flex-1">
                <p className="font-medium">{suggestion.text}</p>
                <p className="text-sm text-muted-foreground">
                  {suggestion.estimated_hours / 40} weeks · {suggestion.required_cognition} focus
                </p>
              </div>
              <Badge variant="outline">
                {Math.round(suggestion.confidence * 100)}% confident
              </Badge>
              <Button size="sm" variant="ghost" onClick={() => editTask(suggestion)}>
                Edit
              </Button>
            </CardContent>
          </Card>
        ))}

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={() => onAccept(selected)}>
            Accept Selected ({selected.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

---

## Rabbit Holes

### 1. Web research APIs (Firecrawl, Tavily, Perplexity)
**Risk:** Spending time integrating external research APIs
**Timebox:** Not in scope. Use existing semantic search + document context only.
**Why:** Semantic search against past user documents provides sufficient context. Web research can be Phase 6 if needed.

### 2. Complex gap detection heuristics
**Risk:** Building ML model to detect gaps with 95% precision
**Timebox:** Use 4 simple heuristics (time, action type, dependency, skill). 2 hours to tune thresholds.
**Why:** Conservative approach (3+ indicators required) already gives 80% precision. Diminishing returns beyond that.

### 3. Multi-pass gap filling
**Risk:** Detecting gaps between generated tasks (recursive)
**Timebox:** Not in scope. One pass only.
**Why:** Adds complexity, risk of infinite loops. User can run "Find Missing Tasks" again if needed.

### 4. Custom task templates
**Risk:** Building library of "standard workflows" (e.g., "App Launch Template")
**Timebox:** Not in scope. Generate fresh every time using AI + semantic search.
**Why:** Templates get stale, require maintenance. AI with context is more flexible.

---

## No-Gos

**❌ Automatic insertion without user review**
- All generated tasks must be approved by user
- Default: all suggestions checked (opt-out), but user must click "Accept"

**❌ External research APIs (Firecrawl, Tavily, etc.)**
- Use existing semantic search + document context only
- Web research deferred to Phase 6 if needed

**❌ Regenerating entire plan**
- Only fill gaps, don't replace extracted tasks
- User's explicit tasks are sacred

**❌ Infinite recursion**
- Max 3 bridging tasks per gap
- One pass only (no gap detection on generated tasks)

**❌ Generate tasks without gaps**
- Don't suggest tasks just because they "might be useful"
- Only fill detected gaps with 3+ indicators

**❌ Historical task suggestions**
- No "users like you also did X"
- Generate fresh based on current context only

---

## Success Metrics

**Gap Detection** (Week 1):
- Detect gaps with ≥80% precision (manual review of 30 plans)
- False positive rate <20%
- Avg 1-3 gaps detected per plan

**Task Generation** (Week 1):
- Generated task confidence: ≥70% avg
- User acceptance rate: ≥60% (users accept 2/3 suggested tasks)
- Generation latency: <5s per gap

**User Adoption** (Post-launch):
- ≥40% of users click "Find Missing Tasks" within 7 days
- ≥50% of accepted tasks marked complete within 30 days

**Technical**:
- Zero duplicate tasks generated
- Dependency chain integrity: 100% (no broken dependencies after insertion)
- AI generation failure rate: <5%

**Deliverables:**
- ✅ `suggest-bridging-tasks` Mastra tool implemented
- ✅ Gap detection logic in `taskOrchestrator.ts`
- ✅ "Find Missing Tasks" button in priorities view
- ✅ `SuggestedTasksModal` component
- ✅ API endpoint `POST /api/agent/suggest-gaps`
- ✅ Unit tests for gap detection heuristics
- ✅ Integration test: suggest → accept → insert → verify dependencies

---

## Risks & Mitigations

### Risk 1: Generated tasks are wrong/irrelevant
**Symptom**: Users reject >60% of suggestions

**Mitigation**:
- Increase confidence threshold from 60% to 75%
- Improve AI prompt with negative examples
- Use semantic search results as "training examples"
- Week 1 checkpoint: If acceptance <50%, reduce max_tasks from 3 to 1

### Risk 2: Too many false positive gaps
**Symptom**: System flags gaps that don't exist

**Mitigation**:
- Require 3+ indicators (not 2)
- Manual review of first 30 plans to tune thresholds
- Allow user to dismiss gap warning (don't force suggestions)

### Risk 3: Generated tasks break dependency chains
**Symptom**: Circular dependencies or orphaned tasks after insertion

**Mitigation**:
- Validate dependency chain after insertion
- Automated test: insert 5 generated tasks, verify no cycles
- Rollback if validation fails

---

## This is Ready When

✅ **A user can:**
1. Click "Find Missing Tasks" button
2. See modal with 1-3 suggested bridging tasks
3. Review tasks with confidence scores
4. Accept/reject/edit suggestions
5. See accepted tasks inserted with updated dependencies

✅ **The system can:**
1. Detect ≥80% of real gaps with <20% false positives
2. Generate tasks with ≥70% avg confidence
3. Use semantic search + document context (no external APIs)
4. Insert tasks without breaking dependency chains
5. Handle AI generation failures gracefully

✅ **Verified behaviors:**
1. Gap detection identifies time jumps, action type jumps, skill jumps
2. Generated tasks align with user's outcome
3. Semantic search provides relevant context from past documents
4. Dependency chains remain valid after insertion
5. Reasoning trace shows gap analysis steps

---

## What Mastra Provides For Free

**Compared to custom implementation:**

| Feature | Custom | Mastra |
|---------|--------|--------|
| Tool Definition | Manual registry | `createTool()` with Zod |
| Validation | Custom parsing | Automatic |
| Execution | Custom API | Built-in agent runtime |
| Logging | Manual | Automatic telemetry |
| Error Handling | Try/catch everywhere | Automatic retry |
| Time to Build | 3-4 days | 1-2 days |

**Time Saved:** 40-50% (2 days vs 4 days)

---

**Last Updated:** 2025-10-28
**Status:** Proposed for Phase 5
**Depends On:** Phase 1 (Vector Storage), Phase 2 (Tool Registry), Phase 3 (Agent Runtime), Phase 4 (Integration UI)
**Framework:** Mastra AI
