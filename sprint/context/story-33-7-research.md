# Story 33-7 Research: Wire Approval Gate Into Tool Execution Pipeline

**Story:** 33-7
**Points:** 3
**Priority:** P0
**Repos:** cyclist
**Workflow:** TDD
**Epic:** 33 - Runtime Permission Management
**Date:** 2026-01-17

## Executive Summary

Story 33-7 is the **critical integration point** that connects all the permission infrastructure (33-1 through 33-4) into the actual Claude Code tool execution pipeline.

**Status:** Ready to claim - all dependencies complete

**Current State:**
- Permission schema defined ✓
- Modal UI complete ✓
- Grant system working ✓
- Approval gate functions ready ✓
- IPC channels defined ✓
- **Missing:** Integration into tool execution handler

**Impact:** Without this story, all permission features are dead code - they exist but are never called, so tools execute without any approval checks.

---

## The Problem

When Claude Code requests tool execution, Cyclist currently processes the `tool_use` message directly:

```
Tool_use message arrives
    ↓
[NO GATE CHECK]
    ↓
Tool executes immediately
```

The approval gate functions exist but are never called. This story integrates them:

```
Tool_use message arrives
    ↓
interceptToolUse() checks: grant exists? allowlisted? need approval?
    ├─ Grant/allowlist: PASS THROUGH
    └─ Need approval: SEND IPC REQUEST
       ↓
    User sees modal, chooses approval scope
       ↓
    Grant added to memory or file
       ↓
    Tool executes (or error injected if rejected)
```

---

## Existing Permission Infrastructure

### 1. Permission Schema (33-1) ✓

File: `packages/core/src/permissions/permission-schema.ts`

Defines structured format for permission requests:

```typescript
interface PermissionRequest {
  tool: string        // "Bash", "WebFetch", "Edit", etc.
  reason: string      // Why access is needed
  scope: string       // Pattern: "npm *", "*.github.com", "/src/*"
  grant_type: string  // "once" | "session" | "always"
}
```

### 2. Approval Modal UI (33-3) ✓

File: `packages/cyclist/src/public/js/components/ApprovalModal.js`

Generic modal that works with any tool type:

```javascript
// Show permission request
showPermissionModal(toolName, toolId, context, reason?)

// Three approval scopes
handleAllowOnce()      // Single use, auto-revoked
handleAllowSession()   // Until session ends
handleAlwaysAllow()    // Persisted to settings.json
handleReject()         // Block execution
```

Features:
- Tool name and context display
- Tool-aware safety classification (safe/caution/danger)
- Syntax highlighting for Bash
- Status indicator for pending requests

### 3. Grant System (33-4) ✓

File: `packages/cyclist/src/settings-store.ts`

In-memory and file-based grant storage:

```typescript
addGrant(grant)           // Store grant with scope
checkGrant(tool, scope)   // Check if grant exists (auto-revokes 'once')
removeGrant(grant)        // Revoke specific grant
getGrants()               // List all active grants
```

Features:
- Memory storage for 'once' and 'session' grants
- File persistence for 'always' grants (`.claude/settings.local.json`)
- Domain pattern matching for WebFetch: `*.github.com`
- Glob pattern matching for Bash: `npm *`, `git *`
- Path pattern matching for file ops: `/src/*`, `/test/*`

### 4. Approval Gate Functions (Story 22-3 + 33-3) ✓

File: `packages/cyclist/src/approval-gate.ts`

Core interception logic:

```typescript
// Main function: check if approval needed
interceptToolUse(message: ToolUseMessage): InterceptResult {
  // Returns: { shouldApprove, toolName, toolId, context }
}

// Request user approval (returns Promise)
requestApproval(command: string, toolId: string): Promise<boolean>

// Handle user response (resolves Promise)
resolveApproval(toolId: string, approved: boolean, grantScope?: GrantTypeValue)

// Create rejection error for Claude
createRejectionError(toolId: string): SDKToolResultError
```

### 5. IPC Channels (Story 24-1) ✓

File: `packages/cyclist/src/ipc-channels.ts`

Permission request/response channels defined but not yet wired:

```typescript
const IPC_CLAUDE_CHANNELS = {
  PERMISSION_REQUEST: 'claude:permission-request',   // Main → Renderer
  PERMISSION_RESPONSE: 'claude:permission-response'  // Renderer → Main
}
```

---

## Where to Wire the Gate

### Integration Point: `packages/cyclist/src/main.ts`

Location: Tool execution handler (~line 1100-1200)

**Current flow:**
```typescript
if (block.type === 'tool_use') {
  // Execute tool directly - NO PERMISSION CHECK
}
```

**Required change:**
```typescript
if (block.type === 'tool_use') {
  // Step 1: Check approval gate
  const interceptResult = interceptToolUse(message);

  // Step 2: If approval needed, wait for user
  if (interceptResult.shouldApprove) {
    const approved = await requestApproval(command, toolId);
    if (!approved) {
      // Reject: inject error instead of executing
      injectRejectionError(toolId);
      continue; // Skip execution
    }
  }

  // Step 3: Execute tool (approved or allowlisted)
  executeToolNormally(block);
}
```

**Key insight:** Tool_use messages must be INTERCEPTED before execution, checked against the gate, and possibly held waiting for IPC response.

---

## Technical Challenges & Solutions

### Challenge 1: Async Wait in Streaming Handler

**Problem:** Tool_use messages arrive in a streaming event handler, but we need to wait for async user approval.

**Solution:** Use Promise with IPC resolution:

```typescript
// When tool_use needs approval
const approved = await requestApproval(command, toolId);
// Handler pauses here until user responds via IPC

// In IPC response handler (renderer → main)
resolveApproval(toolId, approved, grantScope);
// This resolves the pending Promise above
```

### Challenge 2: Tool Context Extraction

**Problem:** Different tools store context in different fields:
- Bash: `input.command`
- WebFetch: `input.url`
- Edit/Write: `input.file_path`

**Solution:** `getToolScope()` function in approval-gate.ts:

```typescript
function getToolScope(toolName: string, input: Record<string, unknown>): string {
  switch (toolName) {
    case 'Bash': return (input.command as string) || '';
    case 'WebFetch': return (input.url as string) || '';
    case 'Edit':
    case 'Write':
    case 'Read': return (input.file_path as string) || '';
    default: return JSON.stringify(input);
  }
}
```

### Challenge 3: Multiple Concurrent Approvals

**Problem:** User might request multiple tools at the same time.

**Solution:** Map pending requests by toolId:

```typescript
const pendingApprovals: Map<string, {
  resolve: (approved: boolean) => void;
  command: string;
}> = new Map();

// Each tool_use_id gets its own approval Promise
requestApproval(command, toolId) {
  return new Promise(resolve => {
    pendingApprovals.set(toolId, { resolve, command });
  });
}
```

### Challenge 4: Grant Persistence

**Problem:** 'always' grants must survive app restart.

**Solution:** Callback-based persistence (already implemented):

```typescript
// In settings-store.ts
grantsPersistCallback = (grants) => settings.saveGrants(grants);

// When 'always' grant added
if (grantsPersistCallback) {
  grantsPersistCallback(persistedGrants);
}
```

---

## Acceptance Criteria Mapping

1. **Tool_use blocks check approval gate before processing**
   - interceptToolUse() called before execution
   - File: main.ts tool handler

2. **Bash commands with gate enabled trigger approval modal**
   - Gate checks getBashApprovalGate() status
   - IPC sends permission:request to renderer
   - File: approval-gate.ts, main.ts

3. **User approval unblocks tool execution**
   - resolveApproval(toolId, true) completes Promise
   - Tool executes normally
   - File: ApprovalModal.js, main.ts

4. **User rejection injects error response to Claude**
   - resolveApproval(toolId, false) completes Promise
   - createRejectionError() generated
   - Error injected instead of tool execution
   - File: approval-gate.ts, main.ts

5. **Grant scopes (once/session/always) persist correctly**
   - 'once' auto-revoked after use
   - 'session' cleared on app exit
   - 'always' saved to settings.json
   - File: settings-store.ts

6. **IPC channel handles approval request/response flow**
   - Main sends permission:request with tool info
   - Renderer sends permission:response with grant scope
   - File: main.ts, preload.ts, ipc-channels.ts

---

## Implementation Checklist

### Phase 1: Tests (TEA - Write Failing Tests)

- [ ] Test interceptToolUse with gate enabled/disabled
- [ ] Test interceptToolUse with existing grant (should pass through)
- [ ] Test interceptToolUse with no grant (should request)
- [ ] Test requestApproval returns Promise
- [ ] Test resolveApproval completes Promise with grant scope
- [ ] Test rejection creates proper SDKToolResultError format
- [ ] Test IPC request contains correct tool/context data
- [ ] Test IPC response maps back to correct toolId
- [ ] Test multiple concurrent approvals (queue handling)
- [ ] Test 'once' grants auto-revoke after use
- [ ] Test 'session' grants persist during session
- [ ] Test 'always' grants persist to file

### Phase 2: Implementation (Dev - Pass Tests)

- [ ] Add interceptToolUse call in main.ts tool handler
- [ ] Set up IPC listeners for permission response
- [ ] Create Map<toolId, Promise> for pending approvals
- [ ] Handle async approval wait in message stream
- [ ] Inject rejection errors for denied tools
- [ ] Test with Bash commands
- [ ] Test with WebFetch URLs
- [ ] Test with file operations (Edit/Write/Read)
- [ ] Verify grants persist across restarts
- [ ] Clear session grants on app exit

### Phase 3: Edge Cases

- [ ] Tool request while modal already showing
- [ ] User closes modal without responding
- [ ] Settings changed while tool pending approval
- [ ] IPC disconnection during approval wait
- [ ] Multiple concurrent tool requests from same command

### Phase 4: Review

- [ ] Code review approval
- [ ] All tests passing (62+ tests green)
- [ ] No TypeScript errors
- [ ] IPC channels properly type-checked

---

## Testing Strategy

### Unit Tests (approval-gate.ts)
- Test interceptToolUse with various message types
- Test grant scope matching for Bash/WebFetch/file tools
- Test rejection error format

### Integration Tests (main.ts + approval-gate.ts)
- Tool_use message → gate check → IPC request → user response
- Verify approved tool executes normally
- Verify rejected tool gets error injected
- Verify grant scope determines persistence

### IPC Tests
- permission-request channel receives correct tool info
- permission-response properly resolves pending approval
- Multiple concurrent approvals handled correctly

### Persistence Tests
- 'always' grants survive app restart
- 'once' grants auto-revoke after first use
- 'session' grants cleared on exit

### Manual/E2E Tests
- User sees modal when tool needs approval
- User can approve with each grant scope
- User can reject and see error message
- Approved tools execute
- Rejected tools show "Command rejected" in conversation

---

## Files to Study

### Core Components (Required Reading)
- `packages/cyclist/src/approval-gate.ts` - Gate interception logic
- `packages/cyclist/src/settings-store.ts` - Grant management
- `packages/cyclist/src/public/js/components/ApprovalModal.js` - UI modal
- `packages/cyclist/src/ipc-channels.ts` - Channel definitions
- `packages/cyclist/src/main.ts` - Integration point (~line 1100)

### Supporting Components
- `packages/cyclist/src/preload.ts` - IPC bridges
- `packages/cyclist/src/settings.ts` - Grant file persistence
- `packages/cyclist/src/claude-service.ts` - SDK message types

### Documentation
- `pennyfarthing-dist/guides/permission-protocol.md` - Protocol spec
- `sprint/context/epic-33-context.md` - Full Epic 33 context

### Reference (Completed Stories)
- `sprint/context/story-33-3-summary.md` - UI implementation
- `sprint/context/story-33-6-summary.md` - Denial display

---

## Dependencies

### Must Complete Before This Story
- 33-1: Permission request protocol ✓ DONE
- 33-2: /permissions skill ✓ DONE
- 33-3: Cyclist Permission UI ✓ DONE
- 33-4: Spot permission grants ✓ DONE

### Will Unblock
- 33-5: Permission presets by workflow

### Related
- 22-3: Bash approval gate (predecessor)
- 36-8: Tool call enrichment (separate epic)

---

## Success Criteria (All Must Pass)

1. Tool_use messages are **INTERCEPTED** before execution
   - Verify: Tool requests appear in logs before execution

2. Approval gate **RUNS** for all tool types
   - Verify: Test Bash, WebFetch, Edit, Write, Read

3. Modal **APPEARS** when approval needed
   - Verify: UI shows, user can interact

4. User can **APPROVE** with grant scope
   - Verify: Tool executes after clicking button

5. User can **REJECT** and see error
   - Verify: Tool does NOT execute, error shown

6. Grants **PERSIST** correctly
   - Verify: Restart app, check 'always' grants still exist

7. IPC **WORKS** bidirectionally
   - Verify: Request and response both received

8. **ALL TESTS PASS**
   - Verify: npm test passes with 62+ green

---

## Key Technical Insights

1. **The Missing Link:** Permission infrastructure exists but is never called. This story connects it to the actual tool execution pipeline.

2. **Async Pattern:** Tool_use messages arrive in a stream, but we need to wait for async user input. Solved with Promise + IPC resolution.

3. **Multiple Approvals:** Map pending requests by toolId to support concurrent tool requests.

4. **Grant Scopes:** Three lifetimes (once/session/always) with different storage strategies (memory vs file).

5. **Tool Agnostic:** Approval gate works with any Claude Code tool through context extraction and pattern matching.

---

## Estimated Complexity

- **3 points:** Accurate
  - Integration (~4 hours): Main.ts wiring + IPC setup
  - Tests (~6 hours): Unit + integration + edge cases
  - Polish (~2 hours): Edge case handling, error messages

---

## Status & Readiness

**Status:** READY TO CLAIM AND START

All prerequisites completed. Infrastructure in place. Clear integration point identified. High-impact, high-value work that unblocks the entire Epic 33.

**Next Step:** Claim story and move to TEA phase to write failing tests.
