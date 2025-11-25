# Quickstart: Document-Aware Prioritization

**Feature**: 014-document-aware-prioritization
**Date**: 2025-11-24

## Prerequisites

- Node.js 20+ (`nvm use`)
- pnpm installed
- Local Supabase running or connection to dev instance
- Environment variables configured in `.env.local`

## Setup

```bash
# Switch to feature branch
git checkout 014-document-aware-prioritization

# Install dependencies
pnpm install

# Run tests to verify setup
pnpm test:run
```

## Development Workflow

### 1. Start Development Server

```bash
pnpm dev
```

Navigate to `http://localhost:3000/priorities` to see the feature.

### 2. Run Tests in Watch Mode

```bash
pnpm test
```

### 3. Key Files to Modify

| File | Purpose |
|------|---------|
| `app/api/documents/prioritization-status/route.ts` | NEW: Document status API |
| `app/priorities/page.tsx` | Enhanced outcome display |
| `app/priorities/components/SourceDocuments.tsx` | NEW: Document list with toggles |
| `app/priorities/components/ContextCard.tsx` | Pending count badge |
| `lib/hooks/useDocumentExclusions.ts` | NEW: localStorage hook |
| `lib/schemas/documentStatus.ts` | NEW: Zod schemas |

### 4. Testing New API Endpoint

```bash
# Test document status endpoint (replace UUID with actual outcome_id)
curl "http://localhost:3000/api/documents/prioritization-status?outcome_id=YOUR_OUTCOME_ID"

# Test with exclusions
curl "http://localhost:3000/api/documents/prioritization-status?outcome_id=YOUR_OUTCOME_ID&excluded_ids=DOC_ID_1,DOC_ID_2"
```

### 5. localStorage Testing

Open browser DevTools → Application → Local Storage → `http://localhost:3000`

Key format: `document-exclusions-${outcomeId}`

```javascript
// Manually set exclusions for testing
localStorage.setItem('document-exclusions-YOUR_OUTCOME_ID', JSON.stringify({
  excludedIds: ['doc-uuid-1', 'doc-uuid-2'],
  lastUpdated: new Date().toISOString()
}));
```

## Manual Test Checklist

### Outcome Visibility (P1)

- [ ] Load priorities page with active outcome
- [ ] Verify outcome displays with brand-colored left border
- [ ] Verify outcome has subtle background tint
- [ ] Verify state preference and capacity badges appear

### Pending Count Badge (P1)

- [ ] Upload a new document, process it
- [ ] Navigate to priorities page
- [ ] Verify "(1 new)" badge appears on recalculate button
- [ ] Click recalculate, verify badge disappears after completion

### Source Documents (P2)

- [ ] Run prioritization with multiple documents
- [ ] Verify "Source Documents" section appears
- [ ] Verify each document shows name and task count
- [ ] Verify section is collapsible

### Document Exclusion (P2)

- [ ] Uncheck a document in the list
- [ ] Verify checkbox state persists after page refresh
- [ ] Click recalculate
- [ ] Verify excluded document's tasks are NOT in results
- [ ] Re-check document, recalculate, verify tasks return

### Edge Cases

- [ ] Clear localStorage, reload - all documents included
- [ ] Exclude all documents - warning shown, button disabled
- [ ] Delete a document via dashboard - exclusion list filters it out

## Troubleshooting

### "outcome_id is required" error

Ensure you have an active outcome set. Navigate to home page and create one if missing.

### localStorage not persisting

Check if browser is in private/incognito mode. localStorage may be restricted.

### Document count shows 0

Verify documents are processed (`status: 'completed'` in `uploaded_files`).
Run `pnpm tsx scripts/check-database-tasks.ts` to verify task embeddings.

### API returns empty documents array

Check Supabase connection:
```bash
# Verify env vars
echo $NEXT_PUBLIC_SUPABASE_URL
echo $NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

## Related Documentation

- [Feature Spec](./spec.md)
- [Implementation Plan](./plan.md)
- [Data Model](./data-model.md)
- [API Contract](./contracts/prioritization-status-api.yaml)
