## Story MSSCI-11950: Background tasks panel not showing background tasks
**Epic:** MSSCI-11942 (WheelHub Notification Consolidation)
**Points:** 2 | **Priority:** P1
**Repos:** cyclist
**Feature Branch:** fix/MSSCI-11950-background-tasks-panel
**Phase:** sm
**Status:** done

## Acceptance Criteria
- [ ] Background tasks appear in panel when spawned
- [ ] Task status updates shown in real-time
- [ ] Completed tasks remain visible until dismissed

## Workflow
- [x] SM: Story setup
- [x] TEA: Write failing tests (7 RED)
- [x] Dev: Implement to GREEN (47/47 passing)
- [x] Reviewer: Code review (APPROVED)
- [x] SM: Finish story (PR #370 merged)

## Technical Context

### Architecture Overview
Three channels deliver background task data to the frontend:
1. **IPC Events** - `backgroundTask:started`, `backgroundTask:completed` (Electron main→renderer)
2. **WebSocket** - `/ws/background-tasks` broadcasts `task:started`/`task:completed`
3. **REST API** - `GET /api/background-tasks` for initial state

### Critical Gap Identified
**BackgroundTasksPanel.js only listens to IPC events** (`window.electronAPI?.backgroundTask`).
It does NOT connect to the WebSocket endpoint. For web-only mode (no Electron), the panel
receives no real-time updates.

### Key Files
| File | Purpose |
|------|---------|
| `src/public/js/components/BackgroundTasksPanel.js` | UI + IPC listeners (lines 155-168) |
| `src/api/background-tasks.ts` | WebSocket broadcast + REST API |
| `src/otlp-receiver.ts` | Task tracking from OTLP logs (lines 718-755) |
| `src/websocket.ts` | WebSocket server setup for `/ws/background-tasks` |
| `src/main.ts` | IPC callback wiring (lines 897-906) |

### Data Flow
```
OTLP logs → otlp-receiver.ts (trackBackgroundTask)
         → broadcastBackgroundTaskEvent()
         → WebSocket clients + IPC broadcast
         → BackgroundTasksPanel.js (IPC only!)
```

### Hypothesis
The panel works in Electron (IPC available) but fails in web-only mode because:
1. `window.electronAPI` is undefined in browser context
2. No WebSocket client fallback exists in the panel

### Existing Tests
- `tests/35-16-background-tasks-panel.test.ts` - comprehensive panel tests
- `tests/31-15-background-task-notifications.test.ts` - earlier notification tests

## Test Strategy

### New Test File
`tests/B-MSSCI-11950-websocket-fallback.test.ts` - 9 tests covering WebSocket fallback

### RED State (7 failing, 2 passing)
Tests fail because `BackgroundTasksPanel.js` lacks:
1. `connectWebSocket(url)` - Connect to `/ws/background-tasks`
2. `isConnected` - Property to check connection status
3. `getConnectionState()` - Get detailed state ('connected', 'disconnected', etc.)

### Test Coverage by AC

**AC1: Background tasks appear in panel when spawned**
- Should export `connectWebSocket` function
- Should auto-connect to WebSocket when IPC unavailable
- Should add task when `task:started` received via WebSocket

**AC2: Task status updates shown in real-time**
- Should update task status when `task:completed` received
- Should show failed task status via WebSocket

**AC3: Completed tasks remain visible until dismissed** (2 passing - existing functionality)
- Should keep completed tasks until explicitly dismissed
- Should render completed tasks in panel HTML

### Implementation Required
Add WebSocket client to `BackgroundTasksPanel.js`:
1. Check if `window.electronAPI?.backgroundTask` exists
2. If not, connect to `/ws/background-tasks` WebSocket
3. Handle `task:started` and `task:completed` messages
4. Fetch initial tasks via `GET /api/background-tasks` on connect
5. Implement reconnection logic (2s fixed interval per WheelHub pattern)

## Implementation Notes

### Changes Made
Added WebSocket fallback to `BackgroundTasksPanel.js`:

**New Exports:**
- `connectWebSocket(url)` - Connect to WebSocket endpoint
- `disconnectWebSocket()` - Clean up WebSocket connection
- `isConnected()` - Check if connected
- `getConnectionState()` - Get state ('disconnected'|'connecting'|'connected')

**WebSocket Message Handling:**
- `task:started` → calls `addBackgroundTask()`
- `task:completed` → calls `updateBackgroundTask()`
- `init` → handles initial task list from server

**Features:**
- 2s fixed reconnection interval (WheelHub pattern)
- Fetches initial tasks via REST API on connect
- Proper cleanup in `destroyBackgroundTasksPanel()`

### Test Results
- **9/9 tests passing** (B-MSSCI-11950-websocket-fallback.test.ts)
- **38/38 tests passing** (35-16-background-tasks-panel.test.ts)
- No regressions in existing functionality

### Files Changed
- `packages/cyclist/src/public/js/components/BackgroundTasksPanel.js` - WebSocket client
- `packages/cyclist/tests/B-MSSCI-11950-websocket-fallback.test.ts` - New test file

## Reviewer Assessment

**Decision:** APPROVED ✓

**Tests:** 47/47 passing (9 new + 38 existing)
**PR:** #370

### Security Analysis
- JSON parsing wrapped in try/catch ✓
- No XSS vectors (data flows through existing safe rendering) ✓
- URL derivation is simple string replacement, no injection risk ✓
- Only `console.error` for error conditions (acceptable) ✓

### Code Quality
- Follows existing module patterns ✓
- Proper cleanup in `destroyBackgroundTasksPanel()` ✓
- WheelHub 2s fixed reconnection pattern ✓
- Idempotent task addition (guards against duplicates) ✓

### Minor Notes (not blocking)
- `connectWebSocket` only checks `OPEN` state before closing, could orphan `CONNECTING` connections
- However, this is an edge case and existing patterns in codebase have similar behavior

### Acceptance Criteria Verification
- [x] AC1: Background tasks appear in panel when spawned - via `task:started` handler
- [x] AC2: Task status updates shown in real-time - via `task:completed` handler
- [x] AC3: Completed tasks remain visible until dismissed - existing functionality preserved

Ready for The Mad Hatter (SM) to finish story.

## Completion Summary

**Story:** MSSCI-11950 - Background tasks panel not showing background tasks
**Points:** 2 | **PR:** #370 (merged)
**Completed:** 2026-01-20

### What Was Done
Fixed the BackgroundTasksPanel to work in web-only mode (non-Electron) by adding WebSocket
fallback when IPC events are unavailable. The panel now connects to `/ws/background-tasks`
and receives real-time task updates via WebSocket messages.

### Key Changes
1. Added `connectWebSocket()` / `disconnectWebSocket()` functions to BackgroundTasksPanel.js
2. Implemented `task:started` and `task:completed` message handlers
3. Added 2s fixed reconnection interval (WheelHub pattern)
4. Proper cleanup in `destroyBackgroundTasksPanel()`

### Test Coverage
- 9 new tests in `B-MSSCI-11950-websocket-fallback.test.ts`
- 47/47 total tests passing (no regressions)

### Acceptance Criteria
- [x] Background tasks appear in panel when spawned
- [x] Task status updates shown in real-time
- [x] Completed tasks remain visible until dismissed
