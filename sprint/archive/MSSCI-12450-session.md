# Story Session: MSSCI-12450 Bell Mode Queue Refinements

**Story:** Bell mode queue handling refinements
**Points:** 3
**Workflow:** TDD
**Branch:** `feat/MSSCI-12450-bell-mode-queue-refinement`
**Started:** 2026-01-26

## Story Description

Refine bell mode message queue behavior for both ON and OFF states:

### Acceptance Criteria

**When bell mode is OFF:**
- Messages sent by user should queue (existing impl works)
- When Claude stops turn, all queued messages should be sent at once, and cleared out of the queue

**When bell mode is ON:**
- Messages should be injected into context via PostToolUse hook (existing impl works)
- Messages should be removed from queue after sending (existing impl works)
- Any messages left in queue after turn stop should be sent immediately

### Technical Context

**Key Files:**
- `packages/cyclist/src/public/js/editor/message-queue.js` - Frontend queue management
- `packages/cyclist/src/public/js/message-view-init.js` - Turn complete handling (`onComplete`)
- `packages/cyclist/src/bell-mode.ts` - Backend bell mode state
- `pennyfarthing-dist/scripts/hooks/bell-mode-hook.sh` - PostToolUse hook

**Current Behavior:**
- `processNextInQueue()` sends messages one at a time when processing stops
- Bell mode ON: Hook handles injection, browser dequeues on `bell-consumed` event
- Turn stop currently just calls `processNextInQueue()` which sends only one message

**Required Changes:**
1. Bell OFF: Modify turn complete to send ALL queued messages at once (not one by one)
2. Bell ON: After turn stop, check for remaining queue and send all immediately

### Phase History

| Phase | Agent | Status | Notes |
|-------|-------|--------|-------|
| RED | TEA | complete | 21 failing tests written for queue behavior |
| GREEN | Dev | complete | All 21 tests passing |
| REVIEW | Reviewer | complete | APPROVED - clean implementation |

## TEA Assessment (RED Phase)

### Tests Written
Created `packages/cyclist/tests/B-12450-bell-queue-refinement.test.ts` with 21 failing tests.

### Test Coverage

**AC1: Bell mode OFF + turn stop (6 tests)**
- `sendAllQueuedMessages()` function export
- Batch send all queued messages when bell OFF
- Queue cleared after sending
- Empty queue handling
- Queue change callback notification
- Image attachment handling in batch send

**AC2: Bell mode ON + turn stop (6 tests)**
- `flushRemainingQueue()` function export
- Send remaining messages after hook consumption
- Queue cleared after flushing
- Empty queue handling
- Bell mode state independence
- Queue change callback notification

**Integration: Turn complete handler (5 tests)**
- `handleTurnComplete()` function export
- Correct function called based on bell mode state
- Respect queue paused state
- Respect processing state

**Edge cases (4 tests)**
- FIFO order preservation
- Rapid successive turn completes
- Queue sync to file after batch send
- Regression: existing `processNextInQueue()` still works

### New Functions Required in message-queue.js

1. **`sendAllQueuedMessages()`** - Sends ALL queued messages at once, clears queue
2. **`flushRemainingQueue()`** - Sends remaining messages (bell mode cleanup)
3. **`handleTurnComplete()`** - Coordinator that checks bell mode and calls appropriate function

### Implementation Notes for Dev

- All three functions should respect `queuePaused` and `processingState` guards
- Must call `saveMessageQueue()` after clearing to sync storage
- Must call `notifyQueueChange(0)` after clearing queue
- Preserve FIFO order when iterating through queue
- `handleTurnComplete()` should replace the `processNextInQueue()` call in `message-view-init.js` `onComplete` handler
