# Story 33-3: Cyclist Permission UI - Technical Context

## Story Overview
- **ID:** 33-3
- **Title:** Cyclist permission UI
- **Points:** 3
- **Priority:** P1
- **Epic:** 33 - Runtime Permission Management
- **Repos:** cyclist

## Problem Statement

The existing ApprovalModal in Cyclist handles **Bash command** approval only. Story 33-4 extended it with three grant scopes (once/session/always), but it's still Bash-specific.

For full runtime permission management, we need a **generic permission modal** that can handle approval requests for ANY tool (WebFetch, Edit, Write, etc.) - not just Bash commands.

## Acceptance Criteria

1. Modal displays on permission request (any tool, not just Bash)
2. One-click approve/deny buttons
3. Shows tool name and reason for request
4. Status indicator in UI (shows pending permission requests)

## Existing Infrastructure

### 1. ApprovalModal.js (packages/cyclist/src/public/js/components/)
**Current:** Bash-specific approval modal with:
- Syntax highlighting for bash commands
- Safety level indicators (safe/caution/danger)
- Three grant scope buttons (Allow Once, Allow Session, Always Allow)
- Keyboard shortcuts (Enter=once, s=session, a=always, Escape=reject)
- IPC integration via `window.electronAPI.bash.onApprovalRequest`

**Gap:** Hardcoded for Bash tool - checks `tool_name === 'Bash'`, displays command syntax.

### 2. approval-gate.ts (packages/cyclist/src/approval-gate.ts)
**Current:** Intercepts Bash tool_use messages in main process:
- `interceptBashToolUse()` - checks if approval needed
- `requestApproval()` - creates promise pending user response
- `resolveApproval()` - handles user response + grant storage

**Gap:** Function names and logic are Bash-specific.

### 3. settings-store.ts (packages/cyclist/src/settings-store.ts)
**Current:** Grant storage system with:
- `PermissionGrant` type: `{ tool, scope, grant_type, granted_at }`
- `addGrant()`, `checkGrant()`, `removeGrant()` - tool-agnostic already
- Persistence to `~/.cyclist/grants.json` for 'always' grants

**Status:** Already generic enough - works with any tool name.

### 4. HTML Structure (packages/cyclist/src/public/index.html)
Lines 337-372 contain approval modals:
- `#approval-modal` - Bash command approval
- `#dangerous-path-modal` - Path protection approval

### 5. CSS Styling (packages/cyclist/src/public/styles.css)
- Modal classes: `.modal`, `.modal-header`, `.modal-content`, `.modal-footer`
- Button classes: `.approve-btn`, `.reject-btn`, `.always-allow-btn`
- Safety indicators: `.safety-safe`, `.safety-caution`, `.safety-danger`

## Technical Approach

### Option A: Extend ApprovalModal (Recommended)
Generalize the existing ApprovalModal to handle any tool:
1. Rename internal references from "Bash" to generic "tool"
2. Add tool name display (not just command)
3. Add reason/context display
4. Make safety analysis tool-aware
5. Update IPC channel names

**Pros:** Reuses existing patterns, minimal new code
**Cons:** Refactoring existing file, may break existing bash approval

### Option B: New PermissionModal Component
Create separate `PermissionModal.js` for generic permissions:
1. New component specifically for non-Bash tool permissions
2. Keep ApprovalModal for Bash commands (backward compatible)
3. Different IPC channels for different tools

**Pros:** No risk of breaking Bash approval
**Cons:** Code duplication, two modals to maintain

### Recommended: Option A with careful refactoring

## Implementation Plan

### 1. Generalize IPC Protocol
```typescript
// Current: window.electronAPI.bash.onApprovalRequest
// Target:  window.electronAPI.permission.onRequest

interface PermissionRequest {
  tool: string;           // 'Bash', 'WebFetch', 'Edit', etc.
  toolId: string;         // tool_use_id
  context: {
    command?: string;     // For Bash
    url?: string;         // For WebFetch
    path?: string;        // For Edit/Write
    reason?: string;      // Agent's stated reason
  };
}
```

### 2. Update ApprovalModal.js
- Add `tool` parameter to `showApprovalModal()`
- Display tool name in modal header
- Conditionally show syntax highlighting (only for Bash)
- Add reason display area
- Update safety analysis to be tool-aware

### 3. Update approval-gate.ts
- Rename `interceptBashToolUse()` → `interceptToolUse()`
- Add tool-aware pattern matching
- Update IPC handlers for generic protocol

### 4. Add Permission Status Indicator
- Badge in toolbar showing pending permission count
- Or status in stats strip

### 5. Update HTML/CSS
- Generalize modal structure (tool name, reason, context)
- Ensure styling works for all tool types

## Files to Modify

| File | Changes |
|------|---------|
| `packages/cyclist/src/public/js/components/ApprovalModal.js` | Generalize for any tool |
| `packages/cyclist/src/approval-gate.ts` | Generic interceptor |
| `packages/cyclist/src/preload.ts` | Update IPC channels |
| `packages/cyclist/src/main.ts` | Update IPC handlers |
| `packages/cyclist/src/public/index.html` | Update modal structure |
| `packages/cyclist/src/public/styles.css` | Styling for tool names |

## Testing Strategy

### Unit Tests
- Modal shows correct tool name for different tools
- Context displayed correctly (command for Bash, URL for WebFetch, etc.)
- Grant scopes work for all tools

### Integration Tests
- IPC flow works end-to-end for non-Bash tools
- Grant storage works for all tool types

### Manual Tests
- Visual appearance of modal for different tools
- Keyboard shortcuts work
- Status indicator updates correctly

## Dependencies

- **Story 33-1** (Permission request protocol): DONE
- **Story 33-2** (/permissions skill): DONE
- **Story 33-4** (Spot permission grants): DONE - grant scopes already implemented

## Key Files Reference

| Category | Files |
|----------|-------|
| Modal Component | `packages/cyclist/src/public/js/components/ApprovalModal.js` |
| Main Process | `packages/cyclist/src/approval-gate.ts`, `main.ts` |
| Settings | `packages/cyclist/src/settings-store.ts` |
| IPC Bridge | `packages/cyclist/src/preload.ts` |
| UI Structure | `packages/cyclist/src/public/index.html` |
| Styling | `packages/cyclist/src/public/styles.css` |
