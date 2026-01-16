# Story 33-3: Cyclist Permission UI

## Status
- **Phase:** green
- **Workflow:** tdd
- **Started:** 2026-01-14T18:40:37Z

## Story Details
- **Story ID:** 33-3
- **Points:** 3
- **Priority:** P1
- **Epic:** 33 - Runtime Permission Management
- **Repos:** cyclist

## Acceptance Criteria
1. [ ] Modal displays on permission request (any tool, not just Bash)
2. [ ] One-click approve/deny buttons
3. [ ] Shows tool name and reason for request
4. [ ] Status indicator in UI (shows pending permission requests)

## Technical Context
See `/Users/keithavery/Projects/pennyfarthing/.session/context-story-33-3.md`

### Problem Statement
The existing ApprovalModal in Cyclist handles **Bash command** approval only. Story 33-4 extended it with three grant scopes (once/session/always), but it's still Bash-specific.

For full runtime permission management, we need a **generic permission modal** that can handle approval requests for ANY tool (WebFetch, Edit, Write, etc.) - not just Bash commands.

### Implementation Approach
Generalize existing ApprovalModal from Bash-specific to handle any tool. Keep existing Bash functionality working.

**Recommended approach:**
1. Rename internal references from "Bash" to generic "tool"
2. Add tool name display (not just command)
3. Add reason/context display
4. Make safety analysis tool-aware
5. Update IPC channel names

## Files to Modify
- `packages/cyclist/src/public/js/components/ApprovalModal.js`
- `packages/cyclist/src/approval-gate.ts`
- `packages/cyclist/src/preload.ts`
- `packages/cyclist/src/main.ts`
- `packages/cyclist/src/public/index.html`
- `packages/cyclist/src/public/styles.css`

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
- **Story 33-4** (Spot permission grants): DONE

## TEA Assessment

**Tests Required:** Yes
**Reason:** New feature requires UI changes, IPC updates, and generic tool handling

**Test Files:**
- `packages/cyclist/tests/33-3-permission-ui.test.ts` - 62 tests covering all 4 ACs

**Tests Written:** 62 tests covering 4 ACs
**Status:** RED (50 failing, 12 passing - backward compatibility tests pass)

**Key Test Categories:**
- AC1: Generic tool detection (isToolUseMessage, showPermissionModal, interceptToolUse)
- AC2: Approve/deny buttons for generic tools (reuses existing handlers)
- AC3: Tool name and reason display (getDisplayedToolName, getDisplayedReason, getDisplayedContext, getToolSafetyLevel)
- AC4: Status indicator (getPendingCount, updateStatusIndicator, visual indicator)
- Integration: Grant storage for WebFetch, Edit, Write tools
- Backward compatibility: Existing Bash behavior preserved

**New Functions Required:**
- `isToolUseMessage()` - Detect any tool_use message
- `showPermissionModal(toolName, toolId, context, reason?)` - Generic modal display
- `getDisplayedToolName()` - Get current tool name
- `getDisplayedReason()` - Get displayed reason
- `getDisplayedContext()` - Get tool-specific context
- `getToolSafetyLevel(toolName, context)` - Tool-aware safety classification
- `getPendingCount()` - Get pending permission count
- `updateStatusIndicator()` - Update UI indicator
- `interceptToolUse()` - Generic tool interceptor in approval-gate.ts

**New IPC Channels:**
- `permission:request` - Main → Renderer for any tool
- `permission:response` - Renderer → Main for any tool

**New UI Elements:**
- `.tool-name` - Display tool name in modal
- `.reason-display` - Display reason in modal
- `.context-display` - Display tool-specific context
- `.permission-status` - Status indicator in UI
- `.permission-badge` - Badge for pending count

**Handoff:** To Dev for implementation

## Handoffs

### TEA → Dev Handoff (2026-01-14T18:40:37Z)

**Gate:** tests_fail - PASSED
**Tests:** RED (50 failing, 12 passing - backward compatibility tests pass)
**Test Commit:** a2a5465e (test(33-3): add failing tests for generic permission UI)

**Key Requirements for Dev:**
1. Implement generic tool detection (isToolUseMessage, interceptToolUse)
2. Create showPermissionModal function for any tool type
3. Implement tool name and reason display functions
4. Add tool-aware safety classification (getToolSafetyLevel)
5. Create status indicator with pending permission count
6. Implement new IPC channels (permission:request, permission:response)
7. Add UI elements for tool display and reason text
8. Ensure backward compatibility with existing Bash approval flow
9. Support WebFetch, Edit, Write tools in addition to Bash

**Test File Location:** `packages/cyclist/tests/33-3-permission-ui.test.ts`

**Files to Modify:**
- `packages/cyclist/src/public/js/components/ApprovalModal.js`
- `packages/cyclist/src/approval-gate.ts`
- `packages/cyclist/src/preload.ts`
- `packages/cyclist/src/main.ts`
- `packages/cyclist/src/public/index.html`
- `packages/cyclist/src/public/styles.css`

## Dev Assessment

**Status:** GREEN (62/62 tests passing)
**Implementation Commit:** 0f4f0264
**PR:** https://github.com/1898andCo/pennyfarthing/pull/245

**Changes Implemented:**

1. **ApprovalModal.js** - Added generic functions:
   - `isToolUseMessage()` - Detect any tool_use message
   - `showPermissionModal()` - Generic modal for any tool
   - `getDisplayedToolName()`, `getDisplayedReason()`, `getDisplayedContext()` - Accessors
   - `getToolSafetyLevel()` - Tool-aware safety classification
   - `getPendingCount()`, `updateStatusIndicator()` - Status tracking

2. **approval-gate.ts** - Added generic interceptor:
   - `interceptToolUse()` - Works with any tool type
   - `InterceptResult` interface for typed responses

3. **preload.ts** - Added IPC channels:
   - `ElectronPermissionAPI` interface
   - `permission:request` and `permission:response` channels
   - Test stubs for Node.js environment

4. **settings-store.ts** - Enhanced grant matching:
   - `matchDomainPattern()` for WebFetch URL matching
   - `checkGrant()` now uses tool-aware matching

5. **index.html** - Added UI elements:
   - `.tool-name` in modal header
   - `.reason-display` for reason text
   - `.context-display` for tool context
   - `.permission-status` indicator in tab bar

6. **styles.css** - Added styling:
   - Tool name styling (accent color)
   - Reason display (italic, secondary color)
   - Context display (monospace, code block style)
   - Permission status badge (red, pulse animation)

**Backward Compatibility:** Preserved. All existing Bash approval functions still work.

**Handoff:** To Reviewer for code review

## Reviewer Assessment

**Verdict:** APPROVED

**PR:** https://github.com/1898andCo/pennyfarthing/pull/245
**Tests:** 62/62 passing
**Build:** Clean (no TypeScript errors)

### What I Looked For

1. **Security:** The permission flow maintains proper separation - renderer shows modal, main process controls execution. No way to bypass the approval gate.

2. **Architecture:** Clean extension of existing patterns. The `interceptToolUse()` wraps and extends `interceptBashToolUse()` rather than replacing it. The `showPermissionModal()` handles all tools including Bash through a unified path.

3. **Edge Cases:**
   - Empty context handled gracefully
   - Invalid URLs fall back to glob matching
   - Unknown tools default to 'caution' safety level

4. **Backward Compatibility:** Naomi preserved all existing Bash functions. The 12 backward compatibility tests prove it.

### Findings

**Minor (0):** None worth mentioning.

**Major (0):** None.

**Critical (0):** None. The code is clean.

### Notes

The domain matching for WebFetch (`matchDomainPattern`) is a thoughtful addition - it handles `*.github.com` matching both `github.com` and `api.github.com`. The safety classification for tools is sensible - WebFetch is safe for known domains, caution for unknown; Edit/Write are always caution; Read/Glob/Grep are safe.

The permission status indicator in the tab bar is a nice UX touch - shows users when approvals are pending without being intrusive.

The test coverage is comprehensive - all 4 ACs are covered with specific test cases for each tool type.

### Recommendation

Ship it. This is solid work. The code follows existing patterns, has proper tests, and doesn't introduce any security holes or architectural debt.

**Handoff:** To SM for finish

## Workflow Tracking
**Workflow:** tdd
**Phase:** approved
**Phase Started:** 2026-01-14T13:55:00Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-01-14T00:00:00Z | 2026-01-14T12:09:13Z | 12h 9m |
| tea | 2026-01-14T12:09:13Z | 2026-01-14T18:40:37Z | 6h 31m |
| green | 2026-01-14T18:40:37Z | 2026-01-14T13:46:00Z | ~1h |
| review | 2026-01-14T13:46:00Z | 2026-01-14T13:55:00Z | ~9m |
| approved | 2026-01-14T13:55:00Z | - | - |
