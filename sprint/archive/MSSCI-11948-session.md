# Story MSSCI-11948: Remove redundant popup tool use notifications

## Story Details
- **ID:** MSSCI-11948
- **Title:** Remove redundant popup tool use notifications
- **Points:** 2
- **Workflow:** trivial
- **Repos:** cyclist
- **Branch:** feat/MSSCI-11948-remove-tool-activity-bar
- **Assignee:** Keith Avery

## Context

The ToolActivityBar component (sticky bar showing current tool execution with timer) is now redundant because tool use is visible in the message stream. The approval modal handles permission requests, and the message view shows tool execution in context.

This is part of Epic 48 (WheelHub Notification Consolidation) where we're removing redundant UI elements as notification consolidation is complete.

## Acceptance Criteria

- [x] Popup tool use notification code removed (ToolActivityBar)
- [x] No visual regression in tool use visibility
- [x] Approval modal remains the single source for tool interactions

## Technical Approach

1. Remove ToolActivityBar.js component
2. Remove #tool-activity-bar from index.html
3. Remove ToolActivityBar CSS from styles.css
4. Clean up imports in any files that reference ToolActivityBar
5. Run tests to verify no regressions

## Files to Modify

- `packages/cyclist/src/public/js/components/ToolActivityBar.js` - DELETE
- `packages/cyclist/src/public/index.html` - Remove #tool-activity-bar element
- `packages/cyclist/src/public/styles.css` - Remove #tool-activity-bar styles
- Any files importing ToolActivityBar

## Workflow Tracking

**Workflow:** trivial
**Phase:** finish
**Phase Started:** 2026-01-19T14:50:27Z

### Phase History

| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-01-19T21:15:00Z | 2026-01-19T21:30:00Z | 15m |
| impl | 2026-01-19T21:30:00Z | 2026-01-19T14:46:54Z | ~ |
| review | 2026-01-19T14:46:54Z | 2026-01-19T14:50:27Z | 3m |

## Handoff History

| Phase | Agent | Timestamp | Context % | Mode |
|-------|-------|-----------|-----------|------|
| impl | Dev | 2026-01-19T14:46:54Z | 63% | auto (context high) |
| review | Reviewer | 2026-01-19T14:50:27Z | 74% | auto (context high) |

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `packages/cyclist/src/public/js/components/ToolActivityBar.js` - DELETED
- `packages/cyclist/src/public/index.html` - Removed #tool-activity-bar element and script tag
- `packages/cyclist/src/public/styles.css` - Removed ~95 lines of #tool-activity-bar CSS
- `packages/cyclist/src/public/js/message-view-init.js` - Removed import and handleAbort() call
- `packages/cyclist/tests/22-1-tool-activity-bar.test.ts` - DELETED
- `packages/cyclist/tests/22-2-abort-button.test.ts` - DELETED

**Tests:** 3005/3005 passing (GREEN)
**PR:** #359 - feat(MSSCI-11948): Remove redundant ToolActivityBar component
**Branch:** feat/MSSCI-11948-remove-tool-activity-bar (pushed)

**Notes:**
- Removed ~1400 lines of code total (component, tests, CSS)
- Abort functionality (stop button, Escape key) remains functional - the core abort logic in message-view-init.js is independent
- Tool visibility now handled entirely by message stream

**Handoff:** To Reviewer for code review

## Reviewer Handoff

**Repo:** cyclist
**Branch:** feat/MSSCI-11948-remove-tool-activity-bar
**PR:** #359 - https://github.com/anthropics/pennyfarthing-2/pull/359

**Implementation Summary:**

Removed the redundant ToolActivityBar component (sticky bar showing tool execution with timer) as tool use is now visible in the message stream. This is part of Epic 48 (WheelHub Notification Consolidation).

**Key Files to Review:**

Changed files:
- `packages/cyclist/src/public/js/components/ToolActivityBar.js` (485 lines deleted)
- `packages/cyclist/src/public/styles.css` (97 lines deleted)
- `packages/cyclist/src/public/index.html` (10 lines removed)
- `packages/cyclist/src/public/js/message-view-init.js` (2 lines removed)
- `packages/cyclist/tests/22-1-tool-activity-bar.test.ts` (516 lines deleted)
- `packages/cyclist/tests/22-2-abort-button.test.ts` (300 lines deleted)

Total: 7 files changed, 1411 lines deleted

**Test Status:** GREEN (3005/3005 passing)
**Quality Gates:** PASSED

## Approval Summary

**Status:** APPROVED
**Decision:** PR #359 approved by Reviewer. Implementation meets acceptance criteria. Ready for SM to finish story.

## Reviewer Assessment

**PR:** #359
**Verdict:** APPROVED

**Code Review Evidence:**
- **Data flow traced:** Abort functionality at `message-view-init.js:229-235` - stop button click and Escape key both call `abortClaude()` which calls `window.electronAPI.claude.abort()`. The removed `handleAbort()` was purely visual feedback on the deleted component - core functionality intact.
- **Pattern observed:** Clean deletion pattern - removed component, CSS, HTML element, script tag, import, and call site. No orphaned references remain (verified via grep).
- **Error handling:** The `abortClaude()` function guards with `if (window.electronAPI?.claude)` at line 230 - safe.

**Wiring Verification:**
- Stop button (`#stop-btn`) still wired at `message-view-init.js:238-240`
- Escape key handler still wired at `message-view-init.js:243-249`
- Tool visibility now handled by message stream (via `updateActivity()`/`clearActivity()` from `activity.js`)

**Security:** N/A - This is purely UI code removal, no auth or data handling changes.

**Performance:** Positive impact - removed 485 lines of JavaScript that ran on every tool_use/tool_result message, eliminating DOM manipulation and timer management overhead.

**Minor Observations (non-blocking):**
- None. Clean deletion with no loose ends.

**Handoff:** To SM for finish-story workflow
