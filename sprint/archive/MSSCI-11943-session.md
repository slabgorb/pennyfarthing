# Story MSSCI-11943: Story/Git WebSocket channels with file watchers

## Status: APPROVED
**Phase:** finish
**Started:** 2026-01-19
**Jira:** [MSSCI-11943](https://1898andco.atlassian.net/browse/MSSCI-11943)
**Branch:** feature/MSSCI-11943-websocket-story-git
**Points:** 5 (TDD workflow)

---

## Story Summary

Replace 10s/5s polling with WebSocket channels triggered by file watchers.
Hybrid approach: file watchers primary, optional git hooks for completeness.

## Acceptance Criteria

- [ ] /ws/story channel broadcasts on sprint/*.yaml changes
- [ ] /ws/git channel broadcasts on .git/HEAD and .git/index changes
- [ ] story.js uses WebSocket instead of setInterval polling
- [ ] Story panel updates within 2s of file change (not 10s)
- [ ] Git indicator updates within 2s of branch switch (not 5s)

---

## Workflow Progress

| Phase | Agent | Status |
|-------|-------|--------|
| Setup | SM | DONE |
| Tests | TEA | DONE |
| Implementation | Dev | DONE |
| Review | Reviewer | DONE |
| Finish | SM | CURRENT |

---

## TEA Assessment

**Tests Required:** Yes
**Reason:** 5-point feature story with clear acceptance criteria requiring WebSocket channels, file watchers, and frontend migration.

**Test Files:**
- `packages/cyclist/tests/MSSCI-11943-websocket-story-git.test.ts` - Comprehensive test coverage for all 5 ACs

**Tests Written:** 24 tests covering 5 ACs
**Status:** RED (18 failing, 6 passing - existing infrastructure tests pass)

### Test Breakdown by AC:

| AC | Tests | Description |
|----|-------|-------------|
| AC1 | 5 | /ws/story WebSocket channel - connection, initial data, broadcast on YAML change, multi-client, debounce |
| AC2 | 5 | /ws/git WebSocket channel - connection, initial data, HEAD change, index change, coalescing |
| AC3 | 4 | story.js exports - connectStoryWebSocket, connectGitWebSocket functions |
| AC4 | 2 | Story update timing - must be <2s (not 10s polling) |
| AC5 | 2 | Git update timing - must be <2s (not 5s polling) |
| Integration | 6 | Existing channels still work, API endpoints intact |

### Key Implementation Notes for Dev:

1. **New WebSocket Channels** (`websocket.ts`):
   - Add `/ws/story` channel following `/ws/background-tasks` pattern
   - Add `/ws/git` channel with similar structure
   - Use `getStoryClients()` and `getGitClients()` client sets

2. **File Watchers** (`server.ts` or new `file-watchers.ts`):
   - Watch `sprint/*.yaml` for story changes (100ms debounce)
   - Watch `.git/HEAD` for branch switches (500ms coalesce for rapid git ops)
   - Watch `.git/index` for staging changes (500ms coalesce)

3. **Frontend Migration** (`story.js`):
   - Export `connectStoryWebSocket()` and `connectGitWebSocket()` functions
   - Replace `setInterval` polling with WebSocket subscriptions
   - Keep IPC handlers as fallback for Electron mode

4. **Reference Implementation**: See `35-16-background-tasks-panel.test.ts` for WebSocket channel test patterns

**Handoff:** To Dev for implementation

---

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `packages/cyclist/src/websocket.ts` - Added /ws/story and /ws/git channels with file watchers, debounce/coalesce logic
- `packages/cyclist/src/public/js/story.js` - Added connectStoryWebSocket() and connectGitWebSocket() exports, WebSocket-first with IPC fallback

**Tests:** 24/24 passing (GREEN)
**PR:** #350 - feat(MSSCI-11943): Add WebSocket channels for story/git with file watchers
**Branch:** feature/MSSCI-11943-websocket-story-git (pushed)

**Implementation Details:**
- AC1: `/ws/story` channel broadcasts on sprint/*.yaml changes with 100ms debounce
- AC2: `/ws/git` channel broadcasts on .git/HEAD and .git/index changes with 500ms coalesce
- AC3: Exported `connectStoryWebSocket()` and `connectGitWebSocket()` from story.js
- AC4: Story updates within 2s (avg 113ms in tests)
- AC5: Git updates within 2s (avg 546ms in tests)

**Handoff:** To Reviewer for code review

---

## Workflow Tracking

**Workflow:** tdd
**Phase:** finish
**Phase Started:** 2026-01-19T11:28:48Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| green | 2026-01-19T15:52:00Z | 2026-01-19T11:24:34Z | 4h 27m |
| review | 2026-01-19T11:24:34Z | 2026-01-19T11:28:48Z | 4m |

---

## Reviewer Handoff

**Repo:** pennyfarthing
**Branch:** feature/MSSCI-11943-websocket-story-git
**PR:** #350 - feat(MSSCI-11943): Add WebSocket channels for story/git with file watchers
**PR Link:** https://github.com/anthropics/pennyfarthing/pull/350

### Files to Review

```
 packages/cyclist/src/public/js/story.js            | 229 ++++-
 packages/cyclist/src/websocket.ts                  | 168 +++-
 .../tests/MSSCI-11943-websocket-story-git.test.ts  | 928 +++++++++++++++++++++
 sprint/context/epic-48-tech-context.md             | 311 +++++++
```

### Implementation Summary

**What was implemented:**
1. **AC1 - /ws/story WebSocket channel**: Broadcasts story panel updates on sprint/*.yaml changes with 100ms debounce
2. **AC2 - /ws/git WebSocket channel**: Broadcasts git status updates on .git/HEAD and .git/index changes with 500ms coalesce
3. **AC3 - Frontend exports**: story.js exports connectStoryWebSocket() and connectGitWebSocket() functions
4. **AC4 - Story update timing**: Verified story updates occur within 2s (avg 113ms in tests)
5. **AC5 - Git update timing**: Verified git updates occur within 2s (avg 546ms in tests)

**Tests:**
- All 24 tests passing (GREEN)
- Full coverage of all 5 acceptance criteria
- Performance verified: story updates avg 113ms, git updates avg 546ms

**Quality Checks:**
- Lint: PASS
- Type Check: PASS
- Tests (MSSCI-11943): PASS (24/24)

---

## Reviewer Assessment

**PR:** #350
**Verdict:** APPROVED

**Code Review Evidence:**

- **Data flow traced:** WebSocket connections flow from file watchers (`websocket.ts:279-326`) through `broadcastStoryUpdate()` / `broadcastGitUpdate()` → client `onmessage` handlers (`story.js:436-445, 512-521`) → DOM update functions. Data is read-only file system state.

- **Wiring verified:**
  - WebSocket upgrade paths at `/ws/story` and `/ws/git` (`websocket.ts:112-119`)
  - Client sets properly managed with add on connection, delete on close/error
  - Initial data sent immediately on connection
  - Frontend connects in web mode, falls back to IPC+polling in Electron mode (`story.js:556-592`)

- **Pattern observed:** Follows established `/ws/background-tasks` channel pattern at `websocket.ts:75-76, 197-218`. Consistent with existing WebSocket handlers throughout the file.

- **Error handling:**
  - Server: try/catch around file watcher setup (lines 297-300, 323-325)
  - Server: readyState check before send prevents errors on closed connections
  - Client: try/catch around JSON.parse, graceful error logging
  - Client: exponential backoff reconnection (1s base, 1.5x multiplier, 30s cap)
  - Client: polling fallback if WebSocket fails

**Security:**
- Read-only endpoints - only broadcast file system state, no user input processed
- `getGitInfo()` uses fixed git commands, no injection risk
- Same trust model as existing WebSocket channels (local dev tool)

**Performance:**
- Story debounce 100ms, git coalesce 500ms - matches AC requirements
- Test latencies: ~113ms story, ~549ms git - well under 2s requirement

**Minor Observations (non-blocking):**
- `story.js:460-463`: Reconnect delay increase happens after scheduling reconnect, but reset on success makes this harmless
- No explicit file watcher cleanup on shutdown - acceptable for local dev tool (process exit releases)

**Handoff:** To SM for finish-story workflow

---

## Handoff History

| Phase | Agent | Timestamp | Context % | Mode |
|-------|-------|-----------|-----------|------|
| green | Dev | 2026-01-19T11:24:34Z | 44% | ask |
| review | Reviewer | 2026-01-19T11:28:48Z | 47% | ask |
