# Story 31-15: Background Task Completion Notifications - Summary

## What Was Built

Added UI notifications in Cyclist when background subagents complete their work. Users now see expandable notifications in the MessageView when any Task tool with `run_in_background: true` finishes, showing the subagent type, success/failure status, and full output on click.

## Key Technical Decisions

1. **Reused OTEL Pipeline**: Extended the existing OTLP receiver to detect Task spans with `run_in_background: true` rather than creating a separate tracking mechanism. This keeps all span processing centralized.

2. **Callback Pattern**: Followed the established callback pattern (`setTokenStatsCallback`, `setToolEventCallback`, `setUserEmailCallback`) for IPC wiring rather than introducing a new paradigm. Consistency matters.

3. **MessageView Integration**: Rendered notifications directly in the MessageView component rather than creating a separate toast system. This keeps the conversation flow natural - background task completions appear as part of the message stream.

4. **Expandable Details**: Used native HTML `<details>` element for click-to-expand rather than custom modal logic. Simpler, more accessible, and follows existing patterns in the codebase.

## Implementation Patterns

- **IPC Data Flow**: OTEL span → callback function → `broadcastToRenderer()` → preload bridge → renderer listener
- **Type-safe Preload API**: `ElectronBackgroundTaskAPI` interface with full TypeScript types for task data
- **Output Truncation**: Tasks store max 2000 chars of output to prevent memory bloat
- **XSS Prevention**: All user content escaped via `escapeHtml()` before rendering

## Files Modified

| File | Changes |
|------|---------|
| `packages/cyclist/src/otlp-receiver.ts` | +100 lines: `trackBackgroundTask()`, `getBackgroundTasks()`, `setBackgroundTaskCallback()`, `resetBackgroundTasks()` |
| `packages/cyclist/src/main.ts` | +10 lines: imports and callback wiring in `startProjectWatchers()` |
| `packages/cyclist/src/preload.ts` | +52 lines: `ElectronBackgroundTaskAPI` interface and implementation |
| `packages/cyclist/src/public/js/message-view-init.js` | +18 lines: IPC listener and notification rendering |
| `packages/cyclist/src/public/js/components/message-view/message-renderers.js` | +27 lines: `renderBackgroundTaskNotification()` |
| `packages/cyclist/src/public/styles.css` | +61 lines: notification styling with success/error states |
| `packages/cyclist/tests/31-15-background-task-notifications.test.ts` | +826 lines: 32 tests covering all 5 ACs |

## Lessons for Future Work

1. **Test IPC End-to-End**: The initial implementation passed all unit tests but missed the critical IPC wiring step. Future stories should include integration tests that verify the full data flow, not just isolated unit behavior.

2. **Follow Existing Patterns**: When adding new IPC channels, look for similar implementations (e.g., `setTokenStatsCallback`) and follow the exact same wiring pattern in `main.ts:startProjectWatchers()`.

3. **Preload Bridge is Essential**: Any data that flows from main to renderer needs three things: (1) broadcast in main.ts, (2) channel listener in preload.ts, (3) API consumer in renderer JS. Missing any one breaks the chain.

## Metrics

- **Story Points**: 3
- **Actual Duration**: ~13h (across TEA, Dev, Review phases with one rejection loop)
- **Tests**: 32 passing
- **PR**: #257 (merged)
