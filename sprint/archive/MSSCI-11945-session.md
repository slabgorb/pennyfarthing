# Story MSSCI-11945: Livereload pattern alignment

## Story Details
- **ID:** MSSCI-11945
- **Epic:** MSSCI-11942 (WheelHub Notification Consolidation)
- **Points:** 1
- **Priority:** P3
- **Repos:** cyclist
- **Branch:** feat/MSSCI-11945-livereload-2s-reconnect
- **Workflow:** trivial
- **Assignee:** Keith

## Acceptance Criteria
- [x] livereload.js uses 2s fixed reconnection
- [x] Retries forever (no max attempts)
- [x] Console message on disconnect tells user what's happening

## Technical Notes
File: packages/cyclist/src/public/js/livereload.js
- Replace exponential backoff with 2s fixed interval
- Remove MAX_RECONNECT_ATTEMPTS limit
- Add console.log on disconnect: "Server disconnected. Retrying every 2s..."

## Workflow Tracking
**Workflow:** trivial
**Phase:** dev
**Phase Started:** 2026-01-19 21:21:15 UTC

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-01-19 21:17:09 UTC | 2026-01-19 21:21:15 UTC | 4m |
| dev | 2026-01-19 21:21:15 UTC | 2026-01-19 21:27:00 UTC | 6m |
| reviewer | 2026-01-19 21:27:00 UTC | 2026-01-19 21:30:00 UTC | 3m |

## Reviewer Assessment
**Decision:** APPROVED
**Reviewer:** Chrisjen Avasarala

### Summary
Clean simplification of livereload reconnection logic. Removes unnecessary complexity (exponential backoff, attempt counter, max retries) in favor of straightforward 2s fixed retry that runs forever.

### Findings
| Severity | Finding |
|----------|---------|
| None | No issues found |

### Acceptance Criteria
All three ACs verified and met:
1. `RECONNECT_DELAY = 2000` - 2s fixed reconnection
2. No `MAX_RECONNECT_ATTEMPTS` - retries forever
3. Console message: "Server disconnected. Retrying every 2s..."

### Code Quality
- 17 lines removed, 3 added (-14 net)
- No forbidden patterns
- Dev-only code (localhost check)
- No security concerns

**Verdict:** Ship it.
