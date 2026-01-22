# Story 33-7: Wire Approval Gate into Tool Execution Pipeline - Summary

## What Was Built

Wired the approval gate infrastructure into Cyclist's tool execution pipeline using Claude Code's PreToolUse hook system. The implementation enables runtime permission control for dangerous commands (especially Bash), allowing users to approve, reject, or grant persistent permissions for tool execution. Multi-instance isolation ensures multiple Cyclist windows don't interfere with each other's approval flows.

## Key Technical Decisions

1. **Dual-Path Architecture**: Observer path triggers UI (fire-and-forget from stream observation), while hook path controls execution (PreToolUse hook blocks until user decides). This was necessary because Cyclist observes Claude Code's output stream but cannot block execution from the observer.

2. **Dynamic Port Allocation**: Each Cyclist instance binds to an available port starting from 7432, writing the actual port to `.cyclist-approval-port` in the project directory. The hook script discovers this port at runtime, ensuring requests route to the correct instance.

3. **Fail-Open Design**: When the approval server isn't running (ECONNREFUSED), the hook allows the tool to proceed rather than blocking the user. This prioritizes user experience over security in the case of infrastructure failure.

4. **Server Startup Timing**: The approval server must start inside `app.whenReady()` after the project directory is set, not during module initialization. This ensures the port file can be written to the correct location.

## Implementation Patterns

- **Port File Discovery Pattern**: Same pattern used for `.cyclist-port` (OTEL) and `.cyclist-pid` (process tracking) - write file on start, read from hooks/clients, clean up on shutdown.
- **IPC + HTTP Hybrid**: IPC for Electron renderer communication, HTTP for cross-process hook communication.
- **Pending Promise Map**: `pendingHookApprovals` map keyed by `toolId` enables concurrent approval requests without blocking each other.

## Files Modified

| File | Changes |
|------|---------|
| `packages/cyclist/src/main.ts` | +376 lines - approval server, IPC handlers, integration |
| `packages/cyclist/src/server.ts` | +52 lines - port file management functions |
| `packages/cyclist/src/hooks/cyclist-pretooluse-hook.js` | +223 lines - hook script for Claude Code |
| `packages/cyclist/tests/33-7-approval-gate-wiring.test.ts` | +1015 lines - comprehensive test coverage |

## Lessons for Future Work

1. **Timing Matters in Electron**: Module-level code runs before `app.whenReady()`. Any code depending on runtime state (like project directory) must be deferred to the ready handler.

2. **Multi-Instance Testing**: When building features that use ports or files for IPC, always consider the multi-instance scenario. A hardcoded port will cause cross-instance interference.

3. **Hook Integration Points**: Claude Code's hook system is the only way to control tool execution. Stream observation is read-only - you cannot block from the observer.

4. **Review Persistence**: Four rounds of review were needed to catch timing and architecture issues. Thorough code review catches bugs that tests alone cannot.

## Review History

| Round | Verdict | Issue Fixed |
|-------|---------|-------------|
| 1 | REJECTED | Approval gate not actually wired to execution |
| 2 | REJECTED | Hardcoded port causes multi-instance interference |
| 3 | REJECTED | Server startup timing - runs before project dir set |
| 4 | APPROVED | All issues resolved |

## Test Coverage

- 38 tests covering all 6 acceptance criteria
- AC1-AC6 verified through unit and integration tests
- Full approval flow tested end-to-end

---

Completed: 2026-01-17
PR: #311
Branch: feature/33-7-approval-gate-wiring
