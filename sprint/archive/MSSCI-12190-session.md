# Story 56-1: WheelHub Connection Infrastructure

## Story Details
- **ID:** 56-1
- **Jira:** MSSCI-12190
- **Workflow:** tdd

## Workflow Tracking
**Workflow:** tdd
**Phase:** approved
**Phase Started:** 2026-01-21T22:48:19Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-01-21T16:57:00Z | 2026-01-21T17:17:00Z | 20m |
| red | 2026-01-21T17:17:00Z | 2026-01-21T17:20:00Z | 3m |
| green | 2026-01-21T17:20:00Z | - | - |

### Handoff History
| From | To | Gate | Status | Timestamp |
|------|-----|------|--------|-----------|
| tea | dev | tests_fail | PASSED | 2026-01-21T17:20:00Z |
| dev | reviewer | approval | PASSED | 2026-01-21T22:48:19Z |
| reviewer | sm | complete | PASSED | 2026-01-21T22:48:19Z |

## Story Context

**Epic:** 56 - Glanceable Status Awareness (MSSCI-12189)
**Points:** 5
**Priority:** P0

### Description

Extension connects to WheelHub WebSocket on activation.
Subscribes to /context, /agent, /gearshift, /story channels.
Shows "Connecting..." when unavailable, retries every 2 seconds.
Handles disconnection gracefully without crashing VS Code.

### Technical Context

The VS Code extension already runs WheelHub as an embedded server. Status bar items need to subscribe to the existing `WebSocketManager.onStats()` listener - no external WebSocket client needed.

### Files to Create

| Path | Purpose |
|------|---------|
| `packages/vscode-extension/src/statusbar/status-bar-manager.ts` | Status bar orchestration |
| `packages/vscode-extension/src/statusbar/index.ts` | Barrel export |

### Files to Modify

| Path | Change |
|------|--------|
| `packages/vscode-extension/src/extension.ts` | Import and activate StatusBarManager |

### Reference Files

| Path | Reason |
|------|--------|
| `packages/vscode-extension/src/server/websocket-manager.ts` | Stats subscription pattern |
| `packages/vscode-extension/src/providers/sidebar.ts` | Example of onStats usage |

### Acceptance Criteria

- [ ] StatusBarManager class created and registered on activation
- [ ] Subscribes to WebSocketManager.onStats() for real-time updates
- [ ] Shows "Connecting..." state when WheelHub is starting
- [ ] Handles WheelHub unavailability gracefully (no crashes)
- [ ] Implements retry logic (2 second intervals) on disconnection
- [ ] Properly disposes resources on deactivation

### Testing Strategy

- Unit tests for StatusBarManager lifecycle
- Unit tests for connection state handling
- Integration test: stats broadcast updates status bar

## TEA Assessment

**Tests Required:** Yes
**Reason:** 5-point story with new infrastructure code - requires comprehensive TDD coverage

**Test Files:**
- `packages/vscode-extension/tests/MSSCI-12190-status-bar-manager.test.ts` - StatusBarManager lifecycle, connection state, retry logic, disposal

**Tests Written:** 35 tests covering 6 ACs
**Status:** RED (all 35 failing - ready for Dev)

**AC Coverage:**
| AC | Tests | Description |
|----|-------|-------------|
| AC1 | 8 | File existence, class export, barrel, disposable interface, status bar creation |
| AC2 | 8 | WebSocketManager subscription, stats updates, context formatting, color thresholds |
| AC3 | 3 | Initial "Connecting..." state, tooltip, transition to live data |
| AC4 | 5 | Standalone mode, null/undefined handling, malformed data, disconnected state |
| AC5 | 6 | setConnectionState method, retry timer, 2-second interval, cleanup |
| AC6 | 4 | Dispose all items, unsubscribe, multiple dispose safety, no post-dispose updates |
| Integration | 2 | Extension activation, disposable registration |

**Handoff:** To Dev for implementation

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `packages/vscode-extension/src/statusbar/status-bar-manager.ts` - StatusBarManager class with connection state, retry logic, context display
- `packages/vscode-extension/src/statusbar/index.ts` - Barrel export
- `packages/vscode-extension/src/extension.ts` - Wire up StatusBarManager on activation
- `sprint/context/context-epic-56.md` - Epic technical context

**Tests:** 35/35 passing (GREEN)
**PR:** #422 - feat(vscode): implement StatusBarManager for WheelHub connection (MSSCI-12190)
**Branch:** feat/56-1-wheelhub-status-bar (pushed)

**Implementation Notes:**
- StatusBarManager creates status bar item with priority 100 (leftmost)
- Shows "Connecting..." initially, transitions to live data on first stats
- Color thresholds: green (<60%), yellow (60-80%), red (>80%)
- Uses `connectToWheelHub()` method for deferred connection to WheelHub
- 2-second retry interval via setInterval, cleared on connect/dispose

**Handoff:** To Reviewer for code review
