# Story 31-15: Background Task Completion Notifications

## Story Overview

**Epic:** 31 - Customizable Workflow Engine
**Points:** 3 (standard TDD flow)
**Priority:** P2
**Repos:** cyclist

## Problem Statement

Background subagents (via Task tool with `run_in_background: true`) run silently. The agent must poll with TaskOutput to check results, and users have no visibility into when background tasks complete. This creates a disconnect in Cyclist's UI - users see tasks start but get no notification when they finish.

## Technical Context

### Current Architecture

1. **Task Tool Background Execution**
   - Task tool accepts `run_in_background: true` parameter
   - Returns immediately with `output_file` path for polling
   - Agent uses TaskOutput to check status and read results
   - No automatic notification mechanism exists

2. **OTEL Tool Span Pipeline**
   - `otlp-receiver.ts` receives tool spans via OTLP endpoint
   - `ToolEvent` type captures tool executions with `toolName`, `input`, `durationMs`, `success`
   - `setToolEventCallback()` broadcasts new events to renderer
   - `ToolLogViewer.js` displays tool execution history

3. **ToolActivityBar Component** (`src/public/js/components/ToolActivityBar.js`)
   - Shows currently executing tools with name, params, elapsed time
   - Tracks active tools via `activeTools` Map
   - Auto-hides 300ms after last tool completes
   - No background task tracking

4. **IPC Channels**
   - `IPC_AUDIT_LOG_CHANNELS.ENTRY` - broadcasts individual tool events
   - `IPC_DATA_CHANNELS.TOOL_STATS_UPDATE` - broadcasts aggregated stats
   - No dedicated channel for background task notifications

### Span Attributes Available

From telemetry-types.ts `ToolSpanAttributes`:
```typescript
'tool.name': string;      // e.g., 'Task'
'tool.input'?: string;    // subagent description
'tool.success': boolean;
'tool.error'?: string;
```

From Task tool spans, we have `run_in_background` in input but need to detect background completion.

## Implementation Approach

### Option A: OTEL Span Correlation (Recommended)

Background tasks create nested spans:
1. Parent span: Task tool invocation (immediate)
2. Child spans: Subagent's tool calls (deferred)

Track background tasks by:
1. Detect Task spans with `run_in_background: true` in input
2. Store task ID and description in pending map
3. Monitor for TaskOutput spans referencing same task ID
4. On TaskOutput completion, emit notification event

### Option B: Session File Tracking

Story 31-14 added session file tracking of background task IDs. Could:
1. Watch session file for `background_tasks` section changes
2. Poll TaskOutput status for tracked tasks
3. Emit notification when status changes

### Option C: UI-Only Toast System

Simpler approach:
1. Add toast notification component
2. Hook into existing tool event stream
3. Show toast when Task tool with background flag completes

## Files to Modify

| File | Changes |
|------|---------|
| `src/otlp-receiver.ts` | Detect background Task completions, emit notification events |
| `src/main.ts` | Add IPC channel for background task notifications |
| `src/preload.ts` | Expose background task notification API |
| `src/public/js/components/ToolActivityBar.js` | Add background task badge/indicator |
| `src/public/js/components/` | New Toast notification component |
| `src/public/index.html` | Add toast container element |
| `src/public/css/components/` | Toast styling |

## Acceptance Criteria

1. Cyclist tracks background task IDs from Task tool
2. UI notification appears when background task completes
3. Notification shows task type and success/failure status
4. User can click notification to see full result
5. Works with testing-runner and other background subagents

## Test Strategy

1. Unit test: Background task detection from OTEL spans
2. Unit test: Toast component rendering
3. Unit test: Notification click handler
4. Integration: Background Task → notification flow
5. E2E: Run background subagent, verify notification appears

## Dependencies

- Story 31-14 (DONE): Background task infrastructure
- OTEL span streaming working (from Epic 36 work)

## Out of Scope

- Native OS notifications (future enhancement)
- Sound alerts (configurable in settings later)
- Background task queue management UI
