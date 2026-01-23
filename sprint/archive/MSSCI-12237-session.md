# Story 58-1: Story Status Tree View

## Story Details

| Field | Value |
|-------|-------|
| **ID** | 58-1 |
| **Jira** | MSSCI-12237 |
| **Title** | Story Status Tree View |
| **Points** | 2 |
| **Epic** | 58 - Sprint & Story Awareness |
| **Workflow** | tdd |
| **Phase** | setup |

## Workflow Tracking

**Workflow:** tdd
**Phase:** finish
**Phase Started:** 2026-01-23T10:41:45Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-01-23T18:42:00Z | 2026-01-23T10:14:44Z | - |
| test | 2026-01-23T10:14:44Z | 2026-01-23T10:21:08Z | 6m |
| green | 2026-01-23T10:21:08Z | 2026-01-23T10:36:25Z | 15m |
| review | 2026-01-23T10:36:25Z | 2026-01-23T10:41:45Z | 5m |

### Handoff History
| From | To | Gate | Status | Timestamp |
|------|-----|------|--------|-----------|
| red (TEA) | green (Dev) | tests_fail | PASSED | 2026-01-23T10:21:08Z |
| green (Dev) | review (Reviewer) | tests_pass | PASSED | 2026-01-23T10:36:25Z |
| review (Reviewer) | finish (SM) | approval | PASSED | 2026-01-23T10:41:45Z |

## Branch

`feat/58-1-story-status-tree-view`

## Technical Context

### Problem Statement

The VS Code extension sidebar needs to display story status from `.session/{story-id}-session.md` files. Currently, the extension has dual data sources:
1. WheelHub WebSocket updates (primary)
2. Local file watchers (redundant fallback)

### Goal

Unify story data flow through WheelHub by:
1. Adding `.session/` file watching to Cyclist (WheelHub server)
2. Removing file watcher code from VS Code extension sidebar
3. Sidebar consumes story updates exclusively via WheelHub `/ws/story` channel

### Implementation Approach

**Cyclist Changes (packages/cyclist/src/websocket.ts):**
- Add file watcher for `.session/*-session.md` files
- On session file change, call `getStoryInfo()` and `broadcastStoryUpdate()`
- Debounce with same 100ms delay as sprint watcher

**VS Code Extension Changes (packages/vscode-extension/src/providers/sidebar.ts):**
- Remove `startFileWatchers()` method and related code (lines ~875-1044)
- Remove `sessionWatcher`, `configWatcher`, `sprintWatcher` properties
- Remove `parseSessionFile()`, `parseConfigFile()`, `initialFileParse()` methods
- Sidebar now relies entirely on `connectToWheelHub()` for story data

### Files to Modify

| File | Change |
|------|--------|
| `packages/cyclist/src/websocket.ts` | Add `.session/` file watcher |
| `packages/vscode-extension/src/providers/sidebar.ts` | Remove file watcher code |
| `packages/vscode-extension/src/extension.ts` | Remove `startFileWatchers()` call |

### Acceptance Criteria

- [x] AC1: Sidebar displays story title from WheelHub (not file watchers)
- [x] AC2: "No active story" shown when no `.session/*-session.md` exists
- [x] AC3: Story updates within 500ms of session file change
- [x] AC4: No file watcher code remains in VS Code extension for session files

## Workflow Progress

- [ ] SM: Setup story context
- [ ] TEA: Write failing tests
- [ ] Dev: Implement to pass tests
- [ ] Reviewer: Code review

## TEA Assessment

**Tests Required:** Yes
**Reason:** Feature requires code changes in two packages with clear behavioral expectations

**Test Files:**
- `packages/cyclist/tests/MSSCI-12237-session-file-watcher.test.ts` - Session file watcher and WebSocket broadcast
- `packages/vscode-extension/tests/MSSCI-12237-story-tree-view.test.ts` - WheelHub-only story data flow

**Tests Written:** 30 tests covering 4 ACs
**Status:** RED (15 failing - ready for Dev)

**Failing Tests Summary:**

| Package | Test | AC |
|---------|------|-----|
| cyclist | should broadcast null story when session file is deleted | AC2 |
| cyclist | should update within 500ms of session file change | AC3 |
| cyclist | should broadcast to multiple connected clients | AC1 |
| cyclist | should include story title/phase/branch in broadcast | AC1 |
| vscode | should NOT have startFileWatchers method | AC4 |
| vscode | should NOT have stopFileWatchers method | AC4 |
| vscode | should NOT have sessionWatcher property | AC4 |
| vscode | should NOT have parseSessionFile method | AC4 |
| vscode | should NOT have initialFileParse method | AC4 |
| vscode | sidebar.ts should not contain "sessionWatcher" | AC4 |

**Implementation Focus:**

1. **Cyclist (websocket.ts):** Add `.session/` file watcher that broadcasts story updates via `/ws/story` channel
2. **VS Code Extension (sidebar.ts):** Remove all file watcher code (~170 lines) - methods `startFileWatchers`, `stopFileWatchers`, `parseSessionFile`, `parseConfigFile`, `initialFileParse`
3. **VS Code Extension (extension.ts):** Remove `startFileWatchers()` call at line ~110

**Handoff:** To Dev for implementation

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `packages/cyclist/src/websocket.ts` - Add .session/ file watcher with 100ms debounce
- `packages/cyclist/src/story-parser.ts` - Fix phase regex to handle bolded table format
- `packages/vscode-extension/src/providers/sidebar.ts` - Remove 170+ lines of file watcher code
- `packages/vscode-extension/src/extension.ts` - Remove startFileWatchers() call
- `packages/vscode-extension/tests/MSSCI-12048-sidebar.test.ts` - Update superseded tests
- `packages/vscode-extension/tests/MSSCI-12237-story-tree-view.test.ts` - Fix test to allow agent portrait watcher

**Tests:** 30/30 passing (GREEN)
- Cyclist: 12 tests passing (session file watcher)
- VS Code Extension: 18 tests passing (WheelHub-only data flow)

**PR:** #455 - feat(cyclist): add session file watcher for story status tree view (58-1)
**Branch:** feat/58-1-story-status-tree-view (pushed)

**Self-Review Completed:**
- [x] Code wired correctly - websocket.ts watches .session/ and broadcasts
- [x] Code follows patterns - same debounce as sprint watcher
- [x] All ACs met - tests verify AC1-AC4
- [x] No debug code left behind
- [x] Error handling in place

**Handoff:** To Reviewer for code review

## Reviewer Assessment

**PR:** #455
**Verdict:** APPROVED

**Code Review Evidence:**
- **Data flow traced:** Session file change at `.session/` → `websocket.ts:307-320` watcher triggers → `getStoryInfo()` at `story-parser.ts:414-486` parses file → `broadcastStoryUpdate()` at `websocket.ts:490-497` sends to clients → `sidebar.ts:846-850` receives via `handleStatsUpdate()`. Flow is safe - uses parameterized paths, no user input.
- **Pattern observed:** Session watcher at `websocket.ts:302-324` follows established pattern from sprint watcher at `websocket.ts:280-300` - same debounce timer (100ms), same structure.
- **Error handling:** Try/catch at `story-parser.ts:429/483` catches file read errors, returns `nullResult`. Watcher setup errors caught at `websocket.ts:321-323`. Race conditions handled gracefully.

**Security:** N/A - local dev tooling, no auth changes. File paths are constructed from known directories (`.session/`, `sprint/`), no user-controlled input.
**Performance:** 100ms debounce prevents rapid fire updates; `getStoryInfo()` selects most recent file by mtime at `story-parser.ts:450-457` - efficient single pass.

**Non-Blocking Observations:**
- [LOW] Regex at `story-parser.ts:71` could be tightened - `\*?\*?` matches single asterisks too, but doesn't affect correctness

**Handoff:** To SM for finish-story workflow

## Notes

- This is Story 1 of Epic 58 (Sprint & Story Awareness)
- Builds on WebSocket infrastructure from MSSCI-11943
- Pattern established in Story 57-3 (Real-time Agent Updates)
