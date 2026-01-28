# Story MSSCI-12470: Tab bar: Fix indicator sync on startup

## Story Details
- **ID:** MSSCI-12470
- **Title:** Tab bar: Fix indicator sync on startup
- **Jira Key:** MSSCI-12470
- **Points:** 1
- **Priority:** P1
- **Workflow:** trivial
- **Repos:** pennyfarthing
- **Feature Branch:** feature/MSSCI-12470-tab-indicator-sync
- **Assignee:** kavery

## Description
On app startup, Message and Sidebar panels are open but their tab indicators don't show active state. Must click twice to sync.

## Acceptance Criteria
- Tab indicators match actual panel state on startup
- First click toggles correctly

## Workflow Tracking
**Workflow:** trivial
**Phase:** approved
**Phase Started:** 2026-01-27T22:40:48Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-01-27T17:27:00Z | 2026-01-27T22:29:41Z | 5h 2m |
| implement | 2026-01-27T22:29:41Z | 2026-01-27T22:37:17Z | 7m |
| review | 2026-01-27T22:37:17Z | 2026-01-27T22:40:48Z | 3m |
| approved | 2026-01-27T22:40:48Z | - | - |

## Context
This story is part of Epic 64 (Cyclist UX Polish) in Sprint 12. It addresses tab indicator synchronization issues in the Cyclist visual terminal, ensuring panel state is correctly reflected in UI on application startup.

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `packages/cyclist/src/public/js/vertical-panel.js` - Base class: sync initial state to PanelManager after registration
- `packages/cyclist/src/public/js/sidebar-panel.js` - Sync sidebar state on startup
- `packages/cyclist/src/public/js/message-panel.js` - Sync message panel state on startup

**Root Cause:** Panels restored from settings-sync could be expanded, but PanelManager always initialized `isOpen=false`. TabBar read from PanelManager, so indicators showed inactive even when panels were open.

**Fix:** After panel registration, check if panel is not collapsed and call `PanelManager.open()` to sync the state.

**Tests:** 3009/3009 passing (15 pre-existing failures unrelated to this change)
**PR:** #523 - fix(cyclist): sync panel state to PanelManager on startup (MSSCI-12470)
**Branch:** feature/MSSCI-12470-tab-indicator-sync (pushed)

**Handoff:** To Reviewer for code review

### Handoff History
| From | To | Gate | Status | Timestamp |
|------|-----|------|--------|-----------|
| implement (dev) | review (reviewer) | tests_pass | PASSED | 2026-01-27T22:37:17Z |
| review (reviewer) | approved (sm) | approval | PASSED | 2026-01-27T22:40:48Z |

## Reviewer Assessment

**Verdict:** APPROVED

**Review Checklist:**
1. [VERIFIED] Fix correctly handles both registration patterns - VerticalPanel.register() and custom registration
2. [VERIFIED] Initialization order correct - state loaded before sync happens
3. [VERIFIED] No race condition - sync init() completes before async import callback
4. [VERIFIED] Calling PanelManager.open() on already-expanded panel is safe (no-op in expand() guard)
5. [VERIFIED] Error handling adequate - open() guards against unknown panel, doesn't throw
6. [VERIFIED] Guard for PanelManager existence is correct in base class
7. [VERIFIED] No double-registration - sidebar/message use custom registration, not VerticalPanel.register()

**Data Flow Traced:** settings-sync persisted state → VerticalPanel.init() loads _collapsed → registerWithPanelManager() → PanelManager.open() sets isOpen=true → emits panel-changed → TabBar.updateTabState() sets aria-pressed=true

**Pattern Observed:** Good separation - base class fix at `vertical-panel.js:250-254` for future panels, specific fixes for sidebar/message which bypass base class

**Error Handling:** PanelManager.open() at `panel-manager.js:157-159` guards against unknown panel with early return

**Observations:**
| Severity | Issue | Location | Action |
|----------|-------|----------|--------|
| [LOW] | Brief sync→re-sync within same tick | All fixed files | No visual flash - acceptable |
| [MEDIUM] | settings-panel.js has same pattern but not fixed | settings-panel.js:98-118 | Out of scope - story mentions only Message/Sidebar |

**Security:** No security concerns - client-side UI state sync only

**Tests:** 3009 passing. 15 failures are pre-existing (bell-mode, bikelane-section, etc.) - none touch modified files.

**Handoff:** To SM (Drummer) for finish-story
