# Story 33-7: Wire approval gate into tool execution pipeline

**Epic:** 33 - Runtime Permission Management
**Assigned:** Keith Avery
**Points:** 3
**Workflow:** tdd
**Repos:** cyclist

## Story Summary

Wire the approval gate checks into the tool execution pipeline. This story implements the plumbing so that when a tool_use block is executed (e.g., a Bash command), it first checks if an approval gate is enabled, and if so, triggers an approval modal. The user can approve or reject the action, and scopes (once/session/always) persist correctly. The IPC channel handles the request/response flow.

## Acceptance Criteria

- [ ] Tool_use blocks check approval gate before processing
- [ ] Bash commands with gate enabled trigger approval modal
- [ ] User approval unblocks tool execution
- [ ] User rejection injects error response to Claude
- [ ] Grant scopes (once/session/always) persist correctly
- [ ] IPC channel handles approval request/response flow

## TEA Assessment

**Test Result Status:** RED (as expected)
**Test File:** `/packages/cyclist/tests/33-7-approval-gate-wiring.test.ts`
**Test Commit:** `e084cdf1` (test: add failing tests for 33-7 approval gate wiring)

### Test Coverage Summary

Written 6 test suites covering all acceptance criteria:

1. **AC1: Tool_use blocks check approval gate before processing** (7 tests)
   - Verifies `processToolUseWithApproval()` function exists in main.ts
   - Confirms `interceptToolUse()` called for every tool_use message
   - Tests gate checking for Bash, Edit, WebFetch, Read, Write tools
   - Tests gate-disabled bypass behavior
   - Tests grant matching behavior

2. **AC2: Bash commands with gate enabled trigger approval modal** (3 tests)
   - Verifies `sendApprovalRequest()` function exported from main.ts
   - Tests IPC message sent when approval needed
   - Tests tool name and command context included in request

3. **AC3: User approval unblocks tool execution** (3 tests)
   - Tests promise resolution when user approves
   - Tests tool execution continues after approval
   - Tests multiple concurrent approvals with toolId Map

4. **AC4: User rejection injects error response to Claude** (5 tests)
   - Tests rejection result returned to calling code
   - Tests error message created with type `tool_result`
   - Tests error injection via IPC
   - Tests tool is NOT executed after rejection

5. **AC5: Grant scopes (once/session/always) persist correctly** (7 tests)
   - Tests grant creation for "Allow Once", "Allow Session", "Always Allow"
   - Tests persistent callback invoked for always grants
   - Tests once grant auto-revokes after first use
   - Tests session grants persist across multiple uses
   - Tests always grants persist across multiple uses

6. **AC6: IPC channel handles approval request/response flow** (7 tests)
   - Tests `setupApprovalIPCHandlers()` function exists
   - Tests handler registered for `permission-response` channel
   - Tests pending approval resolved on IPC response
   - Tests rejection via IPC response
   - Tests grantScope included in response handling
   - Tests full request-response cycle

### Integration Tests

- **Full approval workflow:** Tests complete cycle from dangerous command through approval to execution
- **Rejection workflow:** Tests complete rejection cycle with error injection

**Total Test Count:** 32 failing tests
**Test Framework:** Vitest
**Test Scope:** All acceptance criteria covered by test scenarios

### Why Tests Fail

Tests expect the following functions to exist in `src/main.ts` (or be exported from it):
- `processToolUseWithApproval()` - Main entry point for tool processing
- `sendApprovalRequest()` - Send IPC approval request to renderer
- `setupApprovalIPCHandlers()` - Register IPC handlers
- `handlePermissionResponse()` - Handle IPC response from renderer
- `setIPCSender()` - Test helper to mock IPC
- `setToolExecutor()` - Test helper to mock tool execution
- `setErrorInjector()` - Test helper to mock error injection

These functions wire together the existing infrastructure:
- `approval-gate.ts` - Gate interception logic (already exists)
- `settings-store.ts` - Grant management (already exists)
- `ApprovalModal.js` - Modal UI (already exists)
- `ipc-channels.ts` - IPC definitions (already exists)

The Dev phase task is to implement these integration points in `main.ts`.

## Workflow Tracking

**Workflow:** tdd
**Phase:** finish
**Phase Started:** 2026-01-17T11:16:42Z
**Status:** approved - ready for SM finish

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| sm | 2026-01-17T10:33:07Z | 2026-01-17T10:33:07Z | 0m |
| tea | 2026-01-17T10:33:07Z | 2026-01-17T10:38:45Z | 5m |
| green | 2026-01-17T10:38:45Z | 2026-01-17T10:56:29Z | 17m |
| review | 2026-01-17T10:56:29Z | 2026-01-17T11:16:42Z | 20m |
| finish | 2026-01-17T11:16:42Z | - | in progress |

## Context & References

### Story Research
- Full technical breakdown: `sprint/context/story-33-7-research.md`
- Epic 33 context: `sprint/context/epic-33-context.md`
- Permission protocol: `pennyfarthing-dist/guides/permission-protocol.md`

### Core Files for TEA (Test Writing)
- `packages/cyclist/src/approval-gate.ts` - Gate interception logic
- `packages/cyclist/src/settings-store.ts` - Grant management
- `packages/cyclist/src/main.ts` - Integration point (tool handler ~line 1100)
- `packages/cyclist/src/public/js/components/ApprovalModal.js` - Modal UI
- `packages/cyclist/src/ipc-channels.ts` - IPC channel definitions

### Key Technical Points for Tests
1. interceptToolUse() must check gate before tool execution
2. Bash commands trigger approval modal when gate enabled
3. User approval (once/session/always) determines grant persistence
4. User rejection creates SDKToolResultError for Claude
5. Multiple concurrent approvals handled via toolId Map
6. IPC channels: `claude:permission-request` (main→renderer) and `claude:permission-response` (renderer→main)

## Reviewer Assessment (Round 2)

**Verdict:** APPROVED
**Timestamp:** 2026-01-17T11:16:42Z
**PR:** #311

### Assessment

All acceptance criteria are now met with complete tool execution integration:

1. **Tool_use blocks check approval gate before processing** - VERIFIED
   - `processToolUseWithApproval()` properly integrated into main.ts tool handler
   - `interceptToolUse()` called for every tool_use message
   - Gate checking verified for Bash, Edit, WebFetch, Read, Write tools
   - Tests passing

2. **Bash commands with gate enabled trigger approval modal** - VERIFIED
   - `sendApprovalRequest()` properly exported and wired
   - IPC message sent when approval needed
   - Tool name and command context included in request

3. **User approval unblocks tool execution** - VERIFIED
   - Promise resolution working correctly when user approves
   - Tool execution continues after approval
   - Multiple concurrent approvals handled via toolId Map

4. **User rejection injects error response to Claude** - VERIFIED
   - Rejection result returned correctly
   - Error message created with type `tool_result`
   - Tool NOT executed after rejection

5. **Grant scopes (once/session/always) persist correctly** - VERIFIED
   - Grants created for all scope types
   - Persistent callback invoked for always grants
   - Once grants auto-revoke after first use
   - Session and always grants persist across multiple uses

6. **IPC channel handles approval request/response flow** - VERIFIED
   - `setupApprovalIPCHandlers()` properly registered
   - Handler for `permission-response` channel functional
   - Full request-response cycle working end-to-end

### Summary

The complete approval gate wiring is now functional. All 32 tests passing. The feature properly integrates the approval modal into the tool execution pipeline, allowing users to approve or reject dangerous operations with proper scope management.

## Handoff History

| Phase | Agent | Timestamp | Context % | Mode |
|-------|-------|-----------|-----------|------|
| red | TEA | 2026-01-17T10:38:45Z | 28% | test-gate-pass |
| green | Dev | 2026-01-17T10:38:45Z | 35% | dev-implementation |
| review | Reviewer | 2026-01-17T10:56:29Z | 32% | reviewer-critical |
| review | Reviewer | 2026-01-17T11:16:42Z | 31% | reviewer-approved |

## Notes

- Feature branch: feature/33-7-approval-gate-wiring (created and current)
- No Jira story (internal implementation)
- Tests written and committed, all 32 tests failing as expected
- Ready for Dev to implement approval gate wiring in main.ts

