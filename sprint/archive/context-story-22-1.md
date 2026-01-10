# Story 22-1: Tool Activity Bar Component - Technical Context

## Story Overview
- **Epic:** 22 - Verbose Mode (Tool Visibility & Intervention)
- **Points:** 3 | **Priority:** P1
- **Repos:** cyclist
- **Branch:** feat/22-1-tool-activity-bar

## Current State

The Cyclist application currently has minimal tool visibility:
- `activity.js` shows a small activity line in the persona section that fades after 500ms
- Tool execution is hidden in collapsed `<details>` blocks in MessageView
- Abort infrastructure exists but has no UI trigger

**Key existing components:**
- `activity.js` (L81-207) - Small activity line with icon/detail extraction
- `claude-service.ts` (L118-142) - SDKToolUseMessage/SDKToolResultMessage types
- `main.ts` (L776-777) - Broadcasts `claude:message` to renderer
- `MessageView.js` (L535-610) - Renders tool_use/tool_result in collapsed blocks

## Technical Approach

Create a new `ToolActivityBar.js` component that provides prominent, real-time visibility into tool execution.

**Component Design:**
```
┌──────────────────────────────────────────────────────────────────────────┐
│ 🔴 RUNNING │ ⚡ Bash │ npm install --save-dev jest │ 12.3s │            │
└──────────────────────────────────────────────────────────────────────────┘
```

**State Management:**
- Track active tool via `tool_id` from tool_use message
- Start timer on tool_use, stop on matching tool_result
- Clear bar gracefully when no active tools

**Message Flow Integration:**
1. Subscribe to `claude:message` IPC events in renderer
2. On `tool_use`: Extract name, input params, start timer
3. On `tool_result`: Match tool_id, stop timer, fade out bar
4. Handle rapid tool execution (queue or replace)

## Files to Create

| File | Purpose |
|------|---------|
| `packages/cyclist/src/public/js/components/ToolActivityBar.js` | Main component |
| `packages/cyclist/src/public/css/components/tool-activity-bar.css` | Styling |

## Files to Modify

| File | Change |
|------|--------|
| `packages/cyclist/src/public/index.html` | Add container div for activity bar |
| `packages/cyclist/src/public/js/app.js` | Initialize ToolActivityBar component |

## Acceptance Criteria

- [ ] AC1: Activity bar appears when tool execution starts
- [ ] AC2: Shows tool name and primary parameter (file, command, pattern)
- [ ] AC3: Elapsed time updates in real-time
- [ ] AC4: Bar disappears gracefully when tool completes
- [ ] AC5: Works in both Electron and web modes

## Testing Strategy

**Unit Tests:**
- ToolActivityBar renders correctly with tool data
- Timer starts/stops on tool_use/tool_result
- Primary parameter extraction for different tool types (Bash→command, Read→file_path, Grep→pattern)

**Integration Tests:**
- Bar appears when `claude:message` fires with tool_use
- Bar disappears when matching tool_result arrives
- Multiple rapid tools handled correctly

**E2E Tests:**
- Full flow: Execute command → bar visible → completion → bar hidden

## Key Patterns from Existing Code

**Tool Icons** (from activity.js):
```javascript
const TOOL_ICONS = {
  Task: '🚀', Bash: '⚡', Read: '📖', Write: '✏️',
  Edit: '✏️', Glob: '🔍', Grep: '🔎', WebFetch: '🌐'
}
```

**Primary Parameter Extraction** (from activity.js):
- `Bash` → `input.command` (first word or npm/yarn command)
- `Read/Write/Edit` → `input.file_path` (basename)
- `Glob/Grep` → `input.pattern`
- `Task` → `input.description`

**Message Structure** (from claude-service.ts):
```typescript
interface SDKToolUseMessage {
  type: 'tool_use';
  tool_name: string;
  tool_id: string;
  input: { command?: string; file_path?: string; pattern?: string; }
}
```

## Dependencies & Risks

**Dependencies:**
- Existing IPC message broadcast (`claude:message`)
- Existing tool icon/parameter patterns from activity.js

**Risks:**
- Rapid tool execution may cause flicker → Mitigation: debounce or queue
- Web mode may not have IPC → Mitigation: Check for `window.electronAPI` presence

## Notes for TEA

This story focuses only on the visibility component. The Abort button (22-2) will be added in a follow-up story that builds on this foundation.

Consider testing:
- What happens when tool_result never arrives (timeout)?
- What happens with concurrent tool_use messages (subagents)?
- CSS transitions for smooth appear/disappear
