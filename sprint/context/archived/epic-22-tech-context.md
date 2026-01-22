# Epic 22: Verbose Mode - Tool Visibility & Intervention

## Technical Context

**Epic:** 22 | **Points:** 13 | **Priority:** P1 | **Marker:** safety
**Repos:** cyclist
**ADR:** ADR-004 (architect-sidecar/decisions.md)

## Epic Overview

Give users real-time visibility into Claude's tool execution and the ability to intervene before or during dangerous operations. Currently tool execution is hidden in collapsed blocks - users can't see what's about to run or abort operations quickly.

### Stories

| ID | Title | Points | Priority | Layer |
|----|-------|--------|----------|-------|
| 22-1 | Tool Activity Bar component | 3 | P1 | 1 - Visibility |
| 22-2 | Abort button for running operations | 2 | P1 | 1 - Visibility |
| 22-3 | Bash command approval gate | 3 | P1 | 2 - Approval |
| 22-4 | Dangerous path detection | 2 | P2 | 2 - Approval |
| 22-5 | Verbose mode setting | 2 | P2 | 3 - Display |
| 22-6 | Tool execution audit log | 1 | P3 | 3 - Display |

### Architecture Layers

```
Layer 3: Display Controls (22-5, 22-6)
        ↑ Optional verbosity & audit
Layer 2: Approval Gates (22-3, 22-4)
        ↑ Pre-execution intervention
Layer 1: Activity Bar (22-1, 22-2)
        ↑ Real-time visibility & abort
```

## Current Architecture

### Tool Message Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. ClaudeService spawns: claude -p --output-format stream-json (via PTY)    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. sendMessage() async generator yields SDKMessage objects                   │
│    - tool_use: { type, tool_name, tool_id, input }                          │
│    - tool_result: { type, tool_id, output, is_error }                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3. main.ts broadcasts: broadcastToRenderer('claude:message', message)        │
│    Also extracts: diffs (Edit/Write), todos (TodoWrite), tokens (result)    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
              ┌─────────────────────┴─────────────────────┐
              ▼                                           ▼
┌────────────────────────────┐              ┌────────────────────────────┐
│ 4a. MessageView renders    │              │ 4b. activity.js updates    │
│     - renderToolUseMessage │              │     - formatToolActivity   │
│     - renderToolResultMessage│            │     - updateActivity       │
│     - collapsed <details>  │              │     - small activity line  │
└────────────────────────────┘              └────────────────────────────┘
```

### Current Abort Infrastructure

The abort infrastructure **already exists** but is not wired to UI:

```typescript
// preload.ts L216 - API exists
claude.abort(): Promise<void>  // calls ipcRenderer.invoke('claude:abort')

// main.ts L861-865 - Handler exists
ipcMain.handle('claude:abort', () => service.interrupt())

// claude-service.ts L577-585 - Implementation exists
interrupt(): void {
  this.currentProcess?.write('\x1b')  // Send Escape to PTY
  this.interrupted = true
  this.emit('interrupted')
}
```

**Gap:** No UI button triggers `window.electronAPI.claude.abort()`

### Key SDK Message Types

```typescript
// claude-service.ts L118-142
interface SDKToolUseMessage {
  type: 'tool_use';
  tool_name: string;     // 'Bash', 'Read', 'Write', 'Edit', 'Task', etc.
  tool_id: string;       // Unique identifier for correlation
  input: {               // Tool-specific parameters
    command?: string;    // Bash
    file_path?: string;  // Read, Write, Edit
    pattern?: string;    // Glob, Grep
    // ...
  };
}

interface SDKToolResultMessage {
  type: 'tool_result';
  tool_id: string;       // Correlates with tool_use
  output: string;
  is_error?: boolean;
}
```

### Current Activity Line (activity.js)

```javascript
// activity.js - Current implementation
const TOOL_ICONS = {
  Task: '🚀', Bash: '⚡', Read: '📖', Write: '✏️',
  Edit: '✏️', Glob: '🔍', Grep: '🔎', WebFetch: '🌐', ...
}

// Extracts tool_use from assistant messages
function extractToolUse(message) {
  if (message.type !== 'assistant') return null
  const content = message.message?.content
  // Find { type: 'tool_use', name, input } in content array
}

// Formats: "📖 Read: filename.ts" or "⚡ Bash: npm"
function formatToolActivity(message) {
  const { tool_name, input } = message
  const icon = TOOL_ICONS[tool_name]
  // Extract detail from input.pattern, input.file_path, input.command, etc.
}
```

**Gap:** Small activity line in persona section, no abort button, fades after 500ms

## Implementation Approach

### 22-1 + 22-2: Tool Activity Bar + Abort (Foundational)

**New Component:** `packages/cyclist/src/public/js/components/ToolActivityBar.js`

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 🔴 RUNNING │ ⚡ Bash │ npm install --save-dev jest │ 12.3s │ [ABORT] │
└──────────────────────────────────────────────────────────────────────────┘
```

**Integration Points:**

1. **Subscribe to messages** - Listen for `claude:message` IPC events
2. **Track tool state** - Map tool_id → { name, input, startTime, status }
3. **Correlate results** - Match tool_result.tool_id to pending tool_use
4. **Wire abort** - Button calls `window.electronAPI.claude.abort()`
5. **Position** - Sticky bar at bottom of message view, above input

**Files to Create/Modify:**
- `packages/cyclist/src/public/js/components/ToolActivityBar.js` (NEW)
- `packages/cyclist/src/public/css/components/tool-activity-bar.css` (NEW)
- `packages/cyclist/src/public/index.html` (add container div)
- `packages/cyclist/src/public/js/app.js` (initialize component)

### 22-3: Bash Approval Gate

**Pattern:** Intercept tool_use before display/execution

```javascript
// In message handler (app.js or new approval.js)
function handleMessage(message) {
  if (message.type === 'tool_use' && message.tool_name === 'Bash') {
    if (settings.requireBashApproval && !isAllowlisted(message.input.command)) {
      // Show approval modal
      const approved = await showApprovalModal(message)
      if (!approved) {
        // Inject rejection - this is the tricky part
        // May need to abort and show error to user
      }
    }
  }
  // Continue normal message flow
}
```

**Complexity:** Cannot directly inject tool_result - Claude Code controls the subprocess. Options:
1. **Abort on reject** - Kill process, show error, let Claude recover
2. **Block via hook** - Use PreToolUse hook (external to Cyclist)
3. **Warn only** - Show modal but don't block execution

**Recommended:** Option 1 (Abort on reject) for MVP, Option 2 for full solution

### 22-4: Dangerous Path Detection

**Sensitive Path Patterns:**
```javascript
const SENSITIVE_PATTERNS = [
  /^\.env(\..*)?$/,              // .env, .env.local, etc.
  /^\.git\//,                    // .git directory
  /^node_modules\//,             // dependencies
  /package-lock\.json$/,         // lockfiles
  /pnpm-lock\.yaml$/,
  /^~\/\.ssh\//,                 // SSH credentials
  /^~\/\.aws\//,                 // AWS credentials
  /^\/etc\//,                    // System config
  /^\/usr\//,                    // System binaries
]

function isSensitivePath(path) {
  return SENSITIVE_PATTERNS.some(pattern => pattern.test(path))
}
```

**Tool Coverage:**
- `Write.file_path`
- `Edit.file_path`
- `Bash.command` with redirects (`>`, `>>`, `|`, `tee`)

### 22-5: Verbose Mode Toggle

**Setting Location:** Cyclist menu + keyboard shortcut

```javascript
// Menu item
{ label: 'Verbose Mode', type: 'checkbox',
  accelerator: 'CmdOrCtrl+Shift+V',
  click: () => toggleVerboseMode() }

// MessageView.js modification
function renderToolUseMessage(message) {
  const isVerbose = getVerboseMode()
  const openAttr = isVerbose ? 'open' : ''
  return `<details class="tool-input" ${openAttr}>...</details>`
}
```

**Persistence:** Save to `~/.cyclist/settings.yaml` or localStorage

### 22-6: Audit Log

**Extend existing infrastructure:**
- `otlp-receiver.ts` already has `ToolEvent` interface and `getToolEvents()`
- Add `tool-log-viewer.js` component
- Add menu item: Tools > Execution Log

## Key File References

| File | Purpose | Lines of Interest |
|------|---------|-------------------|
| `claude-service.ts` | Message source, abort implementation | L118-142 (types), L577-585 (interrupt) |
| `main.ts` | IPC handlers, message broadcast | L776-777 (broadcast), L861-865 (abort) |
| `preload.ts` | Renderer API bridge | L216 (abort API) |
| `activity.js` | Current activity display | L81-105 (format), L167-207 (update) |
| `MessageView.js` | Tool message rendering | L535-573 (tool_use), L590-610 (result) |
| `otlp-receiver.ts` | Tool event storage | L15-34 (ToolEvent), L377-404 (process) |

## Testing Strategy

### Unit Tests
- ToolActivityBar component isolation
- Path pattern matching for dangerous paths
- Tool state tracking (start/end correlation)

### Integration Tests
- Abort button triggers process interrupt
- Activity bar shows during tool execution
- Approval modal blocks until user action

### E2E Tests
- Full flow: tool_use → activity bar → tool_result → bar hides
- Abort during Bash execution
- Bash approval modal flow

## Dependencies & Risks

### Dependencies
- Existing abort infrastructure (claude-service.ts, main.ts, preload.ts)
- Existing activity display patterns (activity.js)
- Existing tool event storage (otlp-receiver.ts)

### Risks
1. **Approval gate complexity** - Cannot inject tool_result, must abort on reject
2. **Bash command parsing** - Detecting redirects in complex commands
3. **Race conditions** - Rapid tool execution may confuse state tracking
4. **Subagent abort** - Aborting during Task tool execution

### Mitigations
- 22-1 + 22-2 foundational - get basic flow working first
- Approval modal is opt-in (default: off)
- Activity bar auto-clears on error/complete states
