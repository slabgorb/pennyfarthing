# MSSCI-12275: Bell Mode - Inject Queued Messages After Tool Use

## Story Info
- **Jira:** MSSCI-12275
- **Points:** 5
- **Priority:** P2
- **Workflow:** tdd
- **Branch:** feat/MSSCI-12275-bell-mode
- **Repos:** pennyfarthing

## Description
When Bell mode is enabled, queued messages are injected into the conversation context after each tool use, rather than waiting for Claude to finish. This lets users provide feedback mid-turn without aborting Claude's work.

## Acceptance Criteria
- [ ] AC1: Clickable 🔔 toggle in queue UI area (not buried in settings)
- [ ] AC2: Bell mode state persisted in `.pennyfarthing/` config
- [ ] AC3: When Bell mode on and queue non-empty, message injected via PostToolUse hook
- [ ] AC4: Injected message appears as additionalContext in Claude's next API call
- [ ] AC5: Claude continues processing with injected message in context
- [ ] AC6: Queue count updates correctly after bell injection
- [ ] AC7: 🔔 visual state reflects current mode (on/off)

## Technical Context

### Current Message Queue Flow
1. User submits while Claude processing → message queued
2. Claude finishes → `processNextInQueue()` called
3. Queued message sent as new turn

### Bell Mode Flow (New)
1. User submits while Claude processing → message queued
2. Claude calls tool → tool_result event fires
3. **If Bell mode ON and queue non-empty:**
   - Dequeue message
   - Inject as user message into conversation context
   - Claude sees it on next API call
4. Claude continues working, now aware of user feedback

### Key Files
- `packages/cyclist/src/otlp-receiver.ts` - tool_result event handling (line ~693)
- `packages/cyclist/src/public/js/editor/message-queue.js` - queue management
- `packages/cyclist/src/public/js/settings-sync.js` - settings storage
- `packages/cyclist/src/claude-service.ts` - conversation/message flow

### Implementation Approach
1. Add `bellMode` setting to settings-sync (default: false)
2. In OTEL receiver, after `claude_code.tool_result` event:
   - Check if bellMode enabled
   - Check if queue non-empty
   - If both, signal to inject message
3. Need to understand how to inject user message mid-turn
   - May need to hook into claude-service message flow
   - Or use SDK's conversation API if available

### Key Discovery: PostToolUse Hook

**Claude Code's PostToolUse hook** is the mechanism for Bell mode!

From [Claude Code Hooks documentation](https://code.claude.com/docs/en/hooks):

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "User feedback: <queued message>"
  }
}
```

After each tool execution, the hook can return `additionalContext` which gets injected into Claude's context for the next API call. This is exactly what Bell mode needs.

### Revised Implementation Approach

1. **Clickable 🔔 toggle** - In queue UI area, toggles bell mode on/off
2. **Bell mode state** - Persisted in `.pennyfarthing/bell-mode.json` (readable by hook)
3. **PostToolUse hook script** (`.pennyfarthing/scripts/hooks/bell-mode-hook.sh`):
   - Read bell mode state from `.pennyfarthing/bell-mode.json`
   - Check message queue file at `.pennyfarthing/bell-queue.json`
   - If enabled + queue non-empty: dequeue, return as additionalContext JSON
   - If disabled or empty: exit 0 with no output
4. **Hook registration** - Add to `.claude/settings.local.json`:
   ```json
   "hooks": {
     "PostToolUse": [{
       "hooks": [{"type": "command", "command": ".pennyfarthing/scripts/hooks/bell-mode-hook.sh"}]
     }]
   }
   ```
5. **Queue bridge** - When bell mode on, Cyclist writes queued messages to `.pennyfarthing/bell-queue.json` (file-based IPC between browser and hook)
6. **Queue sync** - After hook consumes message, Cyclist syncs localStorage queue state

### Architecture: File-based IPC

```
[Browser/Cyclist UI]                    [PostToolUse Hook]
       |                                       |
       | 1. User clicks 🔔                     |
       | 2. Write .pennyfarthing/bell-mode.json|
       |                                       |
       | 3. User queues message                |
       | 4. Write .pennyfarthing/bell-queue.json
       |                                       |
       |                    5. Tool completes--|
       |                    6. Hook reads files|
       |                    7. Returns additionalContext
       |                                       |
       | 8. File watcher detects queue change  |
       | 9. Sync localStorage                  |
```

### Key Files to Create/Modify

- `packages/cyclist/src/public/js/message-view-init.js` - Add 🔔 toggle to queue UI
- `.pennyfarthing/scripts/hooks/bell-mode-hook.sh` - PostToolUse hook script
- `packages/cyclist/src/bell-mode.ts` - File watcher and state management
- `.claude/settings.local.json` - Hook registration (via init/update)

## Workflow Status
- **Phase:** setup → red (handoff to TEA)
- **Current Agent:** SM
- **Next Agent:** TEA (Igor)

---
*Session started: 2026-01-22*
