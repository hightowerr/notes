# SYSTEM_RULES.md

## 🚨 CRITICAL DEVELOPMENT PROTOCOL 🚨

**STOP AND READ BEFORE ANY CODE GENERATION OR TASK EXECUTION**

---

## CORE MANDATE: Every Slice Must Deliver User Value

### The Three Laws of Slice Development

Every code change MUST enable a user to:
1. **SEE IT** → Visible UI change or feedback  
2. **DO IT** → Interactive capability they can trigger  
3. **VERIFY IT** → Observable outcome that confirms it worked  

**If ANY of these are missing → STOP. It's not a slice, it's just code.**

---

## MANDATORY WORKFLOW

### Step 0: Pre-Flight Check ✓
Before starting ANY development task, you MUST:
- Define user story: "As a user, I can [action] to [achieve outcome]"  
- Identify UI component that user will interact with  
- Identify backend endpoint that will process the action  
- Confirm user can test this when complete: YES / NO  
	- If NO: STOP and request task restructuring

### Step 1: Agent Selection
- **Feature implementation** → ALWAYS use `slice-orchestrator`
- **Single bug fix** → May use individual agents BUT must verify user impact
- **Code review only** → Use `code-reviewer`
- **Error investigation** → Use `debugger` THEN `slice-orchestrator` for fix

### Step 2: TDD Enforcement
**NO EXCEPTIONS TO THIS ORDER:**
1. Write failing test FIRST  
2. Implement minimal code to pass  
3. Review code quality  
4. Run all tests  
5. Validate user journey  
6. Document what user can now do  

### Step 3: Completion Criteria
A task is ONLY complete when:
- ✅ User can perform the action via UI  
- ✅ Backend processes and persists the action  
- ✅ User receives feedback/confirmation  
- ✅ Tests cover the complete journey  
- ✅ Code reviewed and approved  
- ✅ You can demo it to a non-technical person  

---

## FORBIDDEN ACTIONS ⛔

**NEVER:**
- ❌ Write backend code without corresponding UI  
- ❌ Create UI without working backend  
- ❌ Mark task complete without user journey test  
- ❌ Skip the failing test phase  
- ❌ Implement features that can't be user-tested  
- ❌ Deliver "infrastructure" or "setup" as a slice  

---

## WHEN YOU'RE UNSURE

If you're about to write code but can't answer these questions, **STOP**:

1. What specific button/form/element will the user click?  
2. What happens visually when they do?  
3. How do they know it worked?  
4. Could my mom test this feature?  

If any answer is unclear → Ask for clarification BEFORE proceeding.

---

## CONVERSATION CHECKPOINTS

### At Start of Every Session
"I understand I must deliver user-testable slices. Every task must result in something you can see, interact with, and verify. Does your request align with this?"

### Before Writing Any Code
"This will enable users to [specific action]. They'll interact via [UI element] and see [outcome]. Correct?"

### After Task Completion
"Feature complete. Users can now [action] through [UI element], which [backend process], resulting in [visible outcome]. Ready to demo."


---

## STATE VALIDATION

Every `.claude/state/<task>.json` MUST include:
```json
{
  "user_story": "As a user, I can...",
  "ui_entry_point": "Component/page where user interacts",
  "user_action": "What user does",
  "visible_outcome": "What user sees as confirmation",
  "demo_steps": ["Step 1", "Step 2", "..."]
}
json```

## ESCALATION TRIGGERS
**Immediately notify the user if:**
- Task can't be completed as full slice
- No UI component exists for the feature
- Backend-only or frontend-only work is requested
- Tests can't validate user journey
- Requirement doesn't describe user value

## AGENT COORDINATION RULES
1. **slice-orchestrator** = Default for ALL feature work
2. **backend-engineer** = ONLY when orchestrator delegates
3. **frontend-ui-builder** = ONLY when orchestrator delegates
4. **test-runner** = MUST run before ANY task completion
5. **code-reviewer** = MUST run after ANY code generation
6. **debugger** = ONLY for investigation, never fixes directly

---

## 🤖 AUTOMATIC AGENT INVOCATION PROTOCOL

**The assistant MUST proactively invoke these agents at specific checkpoints:**

### Checkpoint 1: After ANY Code Write/Modify
```
IF assistant writes/modifies code THEN
  IMMEDIATELY invoke code-reviewer agent
  WAIT for review approval before proceeding
```

### Checkpoint 2: Before Marking Task Complete
```
IF task involves implementation THEN
  IMMEDIATELY invoke test-runner agent
  WAIT for all tests to pass
  IF tests fail THEN invoke debugger agent
```

### Checkpoint 3: On Error/Failure Detection
```
IF error/exception/test failure detected THEN
  IMMEDIATELY invoke debugger agent
  NEVER attempt fixes without diagnosis
  APPLY corrective plan from debug report
```

**VIOLATION = INVALID COMPLETION**

---

## THE GOLDEN RULE
**"If a user can't test it, we didn't ship it."**
Every commit, every PR, every task must add value that a real user can experience. No exceptions.