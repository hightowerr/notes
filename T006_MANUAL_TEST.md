# T006 Manual Test – Google Drive Webhook Sync

**Scenario Reference:** `specs/010-cloud-sync/tasks.md` lines 334-345 (Quickstart Scenario 2)  
**Date:** 2025-02-14  
**Tester:** Codex (automated agent)  
**Status:** ⚠️ Blocked – Google Drive account access not available in sandbox

## Test Preconditions
- ✅ Local Next.js application running (`pnpm dev` assumed)  
- ✅ T002/T003 previously validated (Drive connection + folder selection)  
- ⚠️ No Google OAuth credentials or Drive test account accessible in the current environment

## Intended Steps & Expected Results
| Step | Action | Expected Result |
| --- | --- | --- |
| 1 | Upload `new-meeting-notes.pdf` to the monitored Drive folder | Webhook fires within 30 s |
| 2 | Observe server logs | Log shows receipt for the channel/resource |
| 3 | Open `/dashboard` | File appears with Google Drive badge |
| 4 | Measure latency | <60 s from upload to dashboard presence |
| 5 | Inspect DB (`sync_events`) | Entry for `file_added`, status `completed` |

## Execution Notes
- The sandbox lacks Google OAuth credentials and external network access, so the Drive UI upload could not be performed.
- As a surrogate, the contract test suite was executed:  
  `npx vitest run __tests__/contract/google-drive-webhook.test.ts --pool=threads --poolOptions.threads.minThreads=1 --poolOptions.threads.maxThreads=1`  
  This validates server-side webhook handling (ingest path, duplicate handling, queue trigger) but does **not** cover the end-to-end manual flow.

## Result Summary
- **Outcome:** Blocked – awaiting real Google Drive environment to complete manual verification.  
- **Recommended Follow-up:** When credentials and Drive test folder are available, rerun the scenario following the steps above and record timestamps + DB checks.
