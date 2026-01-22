# Story 56-2: Context Meter Status Bar Item

## Session Info

| Field | Value |
|-------|-------|
| Story | 56-2 |
| Jira | MSSCI-12230 |
| Title | Context Meter Status Bar Item |
| Points | 3 |
| Epic | 56 - Glanceable Status Awareness |
| Workflow | tdd |
| Branch | feat/MSSCI-12230-context-meter-status-bar |
| Started | 2026-01-22 |

## Technical Context

See: `.session/context-story-56-2.md`

### Summary

The StatusBarManager (MSSCI-12190) already displays context information but uses the unified `onStats()` channel. Per MSSCI-12227, it should use the dedicated `/context` channel via `onContext()`.

### Work Required

1. Migrate from `onStats()` to `onContext()` for context data
2. Use `ContextData` interface directly: `{ tokens, usablePercent, maxTokens }`
3. Add new test verifying `onContext()` subscription

### Files to Modify

- `packages/vscode-extension/src/statusbar/status-bar-manager.ts`

### Files to Reference

- `packages/vscode-extension/src/server/websocket-manager.ts` - `ContextData`, `onContext()`
- `packages/vscode-extension/tests/MSSCI-12227-wheelhub-channels.test.ts` - Channel patterns

## Acceptance Criteria

- [ ] AC1: StatusBarManager subscribes to `/context` channel via `onContext()`
- [ ] AC2: Context display updates from `ContextData` (not `StatsData.context`)
- [ ] AC3: Format remains `CONTEXT: Xk (Y%)` with proper thresholds
- [ ] AC4: Existing tests continue to pass (backward compatible)
- [ ] AC5: New test verifies `onContext()` subscription

## Workflow Tracking

**Workflow:** tdd
**Phase:** finish
**Phase Started:** 2026-01-22T20:58:31Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-01-22 | 2026-01-22 15:29:06 | 10m |
| test | 2026-01-22 15:29:06 | 2026-01-22T20:33:40Z | 4m |
| green | 2026-01-22T20:33:40Z | 2026-01-22T20:55:19Z | 21m |
| review | 2026-01-22T20:55:19Z | 2026-01-22T20:58:31Z | 3m |

## Workflow

```
[x] SM: Setup
[ ] TEA: Write failing tests (RED)
[ ] Dev: Implement (GREEN)
[ ] Reviewer: Code review
[ ] SM: Finish
```

## Current Phase

**green** - Dev implementation phase

## TEA Assessment

**Tests Required:** Yes
**Reason:** Migration to dedicated `/context` channel requires verification

**Test Files:**
- `packages/vscode-extension/tests/MSSCI-12230-context-meter-status-bar.test.ts` - 19 tests covering all 5 ACs

**Tests Written:** 19 tests covering 5 ACs
**Status:** RED (15 failing, 4 passing - backward compat tests pass)

**Test Coverage by AC:**
| AC | Tests | Status |
|----|-------|--------|
| AC1: onContext() subscription | 3 tests | RED |
| AC2: ContextData handling | 3 tests | RED |
| AC3: Format/thresholds | 4 tests | 1 GREEN, 3 RED |
| AC4: Backward compat | 2 tests | GREEN |
| AC5: onContext verification | 4 tests | RED |
| Resource cleanup | 2 tests | RED |
| connectToWheelHub | 2 tests | RED |

**Implementation Notes for Dev:**
1. Add `contextUnsubscribe?: () => void` member to StatusBarManager
2. In constructor, call `wsManager.onContext()` and store callback
3. Create `handleContext(data: ContextData)` method similar to `handleStats`
4. Update `connectToWheelHub()` to also subscribe to `onContext()`
5. Unsubscribe from both channels on dispose

**Handoff:** To Dev (Yoda) for implementation

### Handoff History
| From | To | Gate | Status | Timestamp |
|------|-----|------|--------|-----------|
| red (tea) | green (dev) | tests_fail | PASSED | 2026-01-22T20:33:40Z |
| green (dev) | review (reviewer) | tests_pass | PASSED | 2026-01-22T20:55:19Z |
| review (reviewer) | finish (sm) | approval | PASSED | 2026-01-22T20:58:31Z |

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `packages/vscode-extension/src/statusbar/status-bar-manager.ts` - Added onContext() subscription, handleContext() method, cleanup on dispose

**Tests:** 19/19 passing (GREEN)
**All vscode-extension tests:** 557/557 passing
**PR:** #447 - feat(vscode): migrate StatusBarManager to dedicated /context channel
**Branch:** feat/MSSCI-12230-context-meter-status-bar (pushed)

**Implementation Details:**
1. Imported `ContextData` type from websocket-manager
2. Added `contextUnsubscribe` member for cleanup
3. Subscribe to `onContext()` in constructor when available
4. Created `handleContext(data: ContextData)` method for ContextData format
5. Updated `connectToWheelHub()` to also subscribe to context channel
6. Unsubscribe from both channels on dispose

**Backward Compatibility:** Maintained - still subscribes to onStats() and handles StatsData.context

**Handoff:** To Reviewer (Obi-Wan Kenobi) for code review

## Handoff Notes

Han Solo (TEA): Tests are RED and ready. The implementation is straightforward - StatusBarManager needs to call `wsManager.onContext()` alongside `onStats()`, then handle the `ContextData` format which has `tokens`, `usablePercent`, and `maxTokens` fields directly (no nested `.context` property). The format and threshold logic already exists, you just need to wire up the new channel. May the Force be with you, Yoda.

Yoda (Dev): Implemented, the channel migration is. Simple the changes were - subscribe to onContext() when available, handle ContextData format directly, clean up on dispose. All 557 tests pass, they do. PR #447 ready for review is.

## Reviewer Assessment

**PR:** #447
**Verdict:** APPROVED

**Code Review Evidence:**
- **Data flow traced:** `ContextData` from `wsManager.onContext()` at status-bar-manager.ts:87 → `handleContext()` at :135 → validates `typeof percent === 'number'` at :148 → clamps 0-100 at :150 → `updateContextDisplay()` at :153 (safe - validated before use)
- **Pattern observed:** Follows existing `handleStats()` structure; uses feature-flag check `typeof wsManager.onContext === 'function'` at :86,:318
- **Error handling:** Disposed check at :136; WebSocketManager wraps listeners in try-catch at websocket-manager.ts:398-402

**Security:** N/A - no auth changes, no user input to external systems
**Performance:** No issues - simple callback handler, no loops or heavy computation

**Non-Blocking Observations:**
- [MEDIUM] Missing null/undefined guard in `handleContext()` at status-bar-manager.ts:135 - recommend adding `if (!data || typeof data !== 'object') return;` for consistency with `handleStats()`. Not blocking: WebSocketManager catches errors in listener callbacks.

**Handoff:** To SM (Grand Admiral Thrawn) for finish-story workflow

---

*Session created by SM (Grand Admiral Thrawn)*
*TEA Assessment by Han Solo*
*Dev Assessment by Yoda*
*Reviewer Assessment by Obi-Wan Kenobi*
