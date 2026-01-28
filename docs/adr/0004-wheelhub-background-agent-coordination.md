# ADR-0004: Wheelhub Background Agent Coordination

**Status:** Accepted
**Date:** 2026-01-18
**Author:** Architect Agent (Emperor Palpatine)
**Accepted:** 2026-01-28
**Note:** Core infrastructure implemented: OTLP receiver tracks tasks, IPC broadcasts completions, inline notifications work. Sidebar panel (Phase 2) is future work.

## Context

Pennyfarthing agents use Claude Code's `Task` tool with `run_in_background: true` to execute long-running subagents (test runners, preflight checks, file summaries) without blocking the main conversation. The vision: users interact with the foreground agent while background work proceeds, receiving notifications when tasks complete.

**Current Pain Points:**

1. **Agents don't actually background properly** - They either don't use `run_in_background`, or they immediately block waiting for output with `TaskOutput { block: true }`, defeating the purpose.

2. **No registration mechanism** - When a background task launches, Wheelhub (Cyclist's coordination server) has no way to know about it until completion.

3. **No "running tasks" visibility** - Users can't see what background agents are currently executing.

4. **Completion-only notifications** - The frontend only shows tasks when they complete, not while running.

5. **No sidebar panel** - Background tasks should appear in a dedicated sidebar panel, not just inline notifications.

### Current Architecture (Incomplete)

```
┌─────────────────┐                    ┌─────────────────┐
│  Claude Agent   │──── OTEL spans ───▶│    Wheelhub     │
│  (foreground)   │                    │  (otlp-receiver)│
└─────────────────┘                    └────────┬────────┘
                                                │
                                                │ IPC on completion
                                                ▼
                                       ┌─────────────────┐
                                       │  Cyclist UI     │
                                       │  (notification) │
                                       └─────────────────┘
```

**What Exists:**
- `otlp-receiver.ts`: `trackBackgroundTask()`, `getBackgroundTasks()`, `setBackgroundTaskCallback()` - tracks tasks in memory
- `ipc-channels.ts`: `IPC_BACKGROUND_TASK_CHANNELS.TASK_COMPLETED`
- `main.ts`: Broadcasts completion to renderer via IPC
- `preload.ts`: Exposes `backgroundTask.onCompleted()` to renderer
- `message-renderers.js`: `renderBackgroundTaskNotification()` - inline notification
- `styles.css`: Styling for `.background-task-notification`
- Tests: `31-15-background-task-notifications.test.ts` - comprehensive acceptance tests

**What's Missing:**
- HTTP endpoint to query current background tasks (`getBackgroundTasks()` exists but no API route)
- WebSocket channel for real-time task state updates
- IPC for task *start* events (not just completion)
- Sidebar panel component showing running/completed tasks
- Agent-side discipline to NOT immediately block after backgrounding

### Root Causes

1. **Agent Behavior Problem:** Agents are documented to use `run_in_background: true`, but the pattern shown often immediately calls `TaskOutput { block: true }` which blocks the conversation. The documentation says not to do this, but agents do it anyway.

2. **Infrastructure Gap:** Even if agents behaved correctly, users have no visibility into running tasks. The system only fires events on completion.

3. **UI Gap:** No dedicated panel exists to show background task status.

## Decision

Implement a complete background agent coordination system with three components:

### 1. Wheelhub API Extension

Add REST and WebSocket endpoints for background task management:

```typescript
// New routes in api/background-tasks.ts
GET  /api/background-tasks           // List all tracked tasks
GET  /api/background-tasks/:id       // Get specific task
POST /api/background-tasks/:id/ack   // Acknowledge completion (dismiss notification)

// New WebSocket channel
/ws/background-tasks                  // Real-time task events
  → { type: 'task:started', task: BackgroundTask }
  → { type: 'task:completed', task: BackgroundTask }
  → { type: 'task:error', task: BackgroundTask }
```

### 2. IPC Extension for Task Start Events

Currently only completion is broadcast. Add start event:

```typescript
// ipc-channels.ts
export const IPC_BACKGROUND_TASK_CHANNELS = {
  TASK_STARTED: 'backgroundTask:started',   // NEW
  TASK_COMPLETED: 'backgroundTask:completed',
};

// main.ts - broadcast on both events
setBackgroundTaskStartCallback((task) => {
  broadcastToRenderer(IPC_BACKGROUND_TASK_CHANNELS.TASK_STARTED, task);
});
```

### 3. Sidebar Background Tasks Panel

New UI component in the sidebar showing:

```
┌──────────────────────────────────┐
│ Background Tasks            [2]  │
├──────────────────────────────────┤
│ ⏳ testing-runner               │
│    "Run unit tests"              │
│    Started 45s ago               │
├──────────────────────────────────┤
│ ✅ reviewer-preflight            │
│    "Gather review data"          │
│    Completed 2m ago         [×]  │
│    ▶ Show output                 │
└──────────────────────────────────┘
```

Features:
- Shows pending tasks with spinner and elapsed time
- Shows completed tasks with success/failure indicator
- Expandable output for completed tasks
- Dismiss button for completed tasks
- Count badge in panel header
- Auto-scroll to new tasks

### 4. Agent Behavior Clarification

Update agent documentation to make the anti-pattern absolutely clear:

```yaml
# CORRECT - Fire and forget
Task tool:
  run_in_background: true
  prompt: ...
# Agent continues working, does NOT call TaskOutput

# WRONG - Defeats backgrounding
Task tool:
  run_in_background: true
  prompt: ...
TaskOutput:       # ← NEVER DO THIS IMMEDIATELY
  block: true
```

Add enforcement: If agents need the result, they should NOT background. If they background, they should NOT block.

### Architecture After Implementation

```
┌─────────────────┐     ┌─────────────────────────────────────┐
│  Claude Agent   │     │           Wheelhub                   │
│  (foreground)   │     │                                      │
└────────┬────────┘     │  ┌─────────────┐  ┌──────────────┐  │
         │              │  │ OTLP        │  │ REST API     │  │
         │ OTEL spans   │  │ Receiver    │  │ /api/bg-tasks│  │
         └──────────────┼─▶│             │  │              │  │
                        │  └──────┬──────┘  └──────────────┘  │
                        │         │                 ▲          │
                        │         ▼                 │          │
                        │  ┌─────────────────────────┐        │
                        │  │  Background Task Store   │        │
                        │  │  (in-memory + optional   │        │
                        │  │   persistence)           │        │
                        │  └──────────┬──────────────┘        │
                        │             │                        │
                        │  ┌──────────▼──────────┐            │
                        │  │  Event Broadcaster   │            │
                        │  │  - IPC (Electron)    │            │
                        │  │  - WebSocket (web)   │            │
                        │  └──────────┬──────────┘            │
                        └─────────────┼────────────────────────┘
                                      │
         ┌────────────────────────────┼────────────────────────┐
         │                            │                        │
         ▼                            ▼                        ▼
┌─────────────────┐      ┌─────────────────────┐    ┌─────────────────┐
│ Message View    │      │ Sidebar Panel       │    │ Status Bar      │
│ (notifications) │      │ (task list)         │    │ (count badge)   │
└─────────────────┘      └─────────────────────┘    └─────────────────┘
```

## Implementation Phases

### Phase 1: Foundation (Backend)
1. Add `setBackgroundTaskStartCallback()` to otlp-receiver
2. Add IPC broadcast for task start events
3. Create `/api/background-tasks` REST endpoint
4. Create `/ws/background-tasks` WebSocket channel

### Phase 2: UI (Frontend)
1. Create BackgroundTasksPanel component
2. Add to sidebar layout
3. Wire up IPC listeners for start/complete
4. Implement task card rendering with states

### Phase 3: Agent Discipline
1. Update shared-agent-behavior.md with clearer anti-pattern documentation
2. Add examples of correct fire-and-forget patterns
3. Consider adding linting or warnings for the anti-pattern

### Phase 4: Polish
1. Persistence (survive app restart)
2. Task timeout handling
3. Bulk dismiss
4. Sound notifications (optional)

## Consequences

### Positive
- Users see background work in progress, not just completion
- Agents can truly work asynchronously without blocking
- Better debugging - visible what's running
- More responsive UX during long operations
- Foundation for future parallel agent coordination

### Negative
- More UI complexity in sidebar
- Additional WebSocket channel to maintain
- Potential for "notification fatigue" if many tasks run
- Need to be thoughtful about task retention/cleanup

### Risks
- Agents may still block incorrectly - need enforcement, not just documentation
- Memory growth if tasks not cleaned up
- Race conditions between OTEL span arrival and UI sync

## Alternatives Considered

### 1. Polling-Only Approach
Frontend polls `/api/background-tasks` every N seconds instead of WebSocket push.
- **Rejected:** Adds latency, wastes requests, poor UX for start events

### 2. Inline-Only Notifications
Keep current approach of only showing completion in message stream.
- **Rejected:** No visibility into running tasks, no dedicated UI

### 3. Agent-Side State File
Agents write to a file, Cyclist watches it.
- **Rejected:** Adds complexity, OTEL spans already provide this data

## References

- Test file: `packages/cyclist/tests/31-15-background-task-notifications.test.ts`
- OTEL receiver: `packages/cyclist/src/otlp-receiver.ts`
- Agent guide: `pennyfarthing-dist/guides/shared-agent-behavior.md` → "Interactive Background Task Protocol"
- Pattern doc: `pennyfarthing-dist/guides/patterns/fan-out-fan-in-pattern.md`
