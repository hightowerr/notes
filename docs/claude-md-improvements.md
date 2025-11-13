# CLAUDE.md Suggested Improvements

**Date:** 2025-11-10
**Status:** Optional enhancements - current file is already excellent

---

## Minor Fixes

### 1. Remove Duplicate Entry (Line 419-420)
**Current:**
```markdown
- **Concurrent Processing:** Max 3 parallel uploads
- **Data Retention:** 30 days auto-cleanup (daily at 2 AM UTC)
- **Concurrent Processing:** Max 3 parallel uploads with automatic queueing
```

**Suggested:**
```markdown
- **Concurrent Processing:** Max 3 parallel uploads with automatic queueing
- **Data Retention:** 30 days auto-cleanup (daily at 2 AM UTC)
```

---

### 2. Remove Duplicate Section Heading (Lines 97-106)
**Current:**
```markdown
### Feature Development Workflow (.specify/)

**Feature Development Workflow:**
```

**Suggested:** Remove one of the headings

---

### 3. Add Note About Mastra CLI (After Line 95)
**Add:**
```markdown
**Note:** Mastra CLI (`mastra dev`) had bundler issues in v0.18.0 and was removed from devDependencies.
The production Mastra setup (`@mastra/core`, `@mastra/mcp`) remains functional for agents and tools.
```

---

## Optional Additions

### 4. Add Manual Task Features Section (After Line 160)
**Add to "Gap Filling" section:**
```markdown
**Manual Task Management** (`lib/services/` - Phase 9):
- `manualTaskService.ts` - Create, edit, delete user-added tasks
- `lib/schemas/manualTaskSchemas.ts` - Validation for manual task CRUD
- API: `POST /api/tasks/manual`, `PUT /api/tasks/[id]`, `DELETE /api/tasks/[id]`
```

---

### 5. Add Refactoring Docs Reference (After Line 465)
**Add to "Resources" section:**
```markdown
- **Refactoring Documentation:** `docs/refactoring/` - Analysis and improvement plans
```

---

### 6. Clarify Node.js Version Requirement (Line 31)
**Current:**
```markdown
1. **Check Node version**: `node --version` (requires 20+, use `nvm use` to switch)
```

**Suggested (if you want to be more explicit):**
```markdown
1. **Check Node version**: `node --version` (requires 20.x per `.nvmrc`, use `nvm use` to switch)
```

---

## Consistency Check with README.md

The README.md uses `npm` commands throughout, but the project actually uses `pnpm` (verified by `pnpm-lock.yaml`).

**CLAUDE.md is correct** - it consistently uses `pnpm`.

**Recommendation:** Update README.md to use `pnpm` instead of `npm` for consistency, or add a note at the top:
```markdown
> **Note:** This project uses `pnpm`. Replace `npm` with `pnpm` in all commands below.
```

---

## Summary

Your CLAUDE.md is already in great shape! The issues identified are:
- ✅ **High priority:** Remove duplicate "Concurrent Processing" line
- ✅ **Medium priority:** Remove duplicate section heading
- ⚠️ **Low priority:** Add notes about Mastra CLI removal and new manual task features
- ℹ️ **For reference:** README.md has npm/pnpm inconsistency (not CLAUDE.md's fault)

**Recommendation:** Make the high-priority fixes if you want perfection, but the file is already highly functional as-is.
