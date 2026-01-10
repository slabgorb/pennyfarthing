# Story 22-3: Bash Command Approval Gate - Technical Context

## Story Overview
- **Epic:** 22 - Verbose Mode: Tool Visibility & Intervention
- **Points:** 3
- **Priority:** P1 (safety feature)
- **Repo:** cyclist

## Current State

### Message Flow Architecture
Tool use messages flow through a well-defined pipeline:
1. **ClaudeService** (`claude-service.ts:366-510`) - Spawns Claude CLI with `--output-format stream-json`, parses NDJSON messages
2. **Main Process** (`main.ts:767-885`) - Receives messages via async generator, broadcasts to renderer via IPC
3. **Preload Bridge** (`preload.ts:214-229`) - Exposes `window.electronAPI.claude.onMessage()` subscription
4. **Renderer Components** - ToolActivityBar and MessageView receive and display tool execution

### Tool Use Message Formats
Two formats exist (must handle both):
```typescript
// Format 1: Discrete SDK message
{ type: 'tool_use', tool_use_id: string, name: string, input: object }

// Format 2: Nested in assistant message content
{ type: 'assistant', message: { content: [{ type: 'tool_use', id: string, name: string, input: object }] } }
```

### ToolActivityBar (Story 22-1)
Already implemented in `components/ToolActivityBar.js`:
- Subscribes to messages via `subscribeToMessages()` (L422-452)
- Extracts nested tool_use from assistant messages (L432-444)
- Tracks active tools with Map<toolId, {startTime}>
- Handles abort with visual feedback (L379-417)

### Settings Storage
**Gap Identified:** No `settings-store.ts` exists. Current session-based settings:
- Permission mode: `ClaudeService.setPermissionMode()`
- Auto-scroll: `MessageView.setAutoScroll()`

Story 22-3 requires persistent settings storage for:
- Approval gate toggle (on/off)
- Allowlist patterns

### Modal Patterns
**Gap Identified:** No CSS-based modal patterns exist in the codebase.
- Current dialogs use Electron's native `dialog.showOpenDialog()` and `dialog.showMessageBox()`
- Story 22-3 needs a custom approval modal in the renderer

## Technical Approach

### Architecture Decision: Main Process Interception
The approval gate should intercept in the **main process** (`main.ts`), not the renderer. Rationale:
1. Main process is the single point before PTY receives commands
2. Renderer can't block message flow to Claude
3. Allows synchronous approval before forwarding

### Interception Point
In `main.ts:setupClaudeIPCHandlers()`, intercept tool_use messages:
```typescript
// Pseudo-code for interception
if (isBashToolUse(message) && approvalGateEnabled) {
  const approved = await requestApproval(message);
  if (!approved) {
    // Inject rejection as tool_result error
    return injectToolError(message.tool_use_id, 'User rejected command');
  }
}
// Continue normal message flow
```

### New Components Required

1. **ApprovalModal.js** - Renderer component for approval UI
   - Shows command with syntax highlighting
   - Approve / Reject / Always Allow buttons
   - Command safety analysis hints

2. **settings-store.ts** - Persistent settings (electron-store or file-based)
   - `bashApprovalGate: boolean` (default: false)
   - `bashAllowlist: string[]` (glob patterns)

3. **IPC Channels** - New channels for approval flow
   - `bash:approval-request` - Main → Renderer (show modal)
   - `bash:approval-response` - Renderer → Main (user decision)

### Approval Flow Sequence
```
Claude CLI → ClaudeService → main.ts
                               ↓
                        Is Bash tool_use?
                               ↓ yes
                        Gate enabled?
                               ↓ yes
                        Matches allowlist?
                               ↓ no
                    ┌──────────────────────┐
                    │ bash:approval-request │ → Renderer shows modal
                    └──────────────────────┘
                               ↓
                    ┌──────────────────────┐
                    │ bash:approval-response│ ← User clicks Approve/Reject
                    └──────────────────────┘
                               ↓
                        Approved? → Continue to PTY
                        Rejected? → Inject tool_result error
                        Always Allow? → Add to allowlist, continue
```

### Allowlist Pattern Matching
Use glob patterns for allowlist:
- `git *` - Allow all git commands
- `npm run *` - Allow npm scripts
- `just *` - Allow justfile recipes
- `ls *` - Allow directory listing

### Command Safety Analysis
Display hints in approval modal:
- **Safe indicators:** `git status`, `ls`, `cat`, read-only commands
- **Caution indicators:** `rm`, `mv`, file modifications
- **Danger indicators:** `rm -rf`, `sudo`, `curl | bash`, pipes to shell

## Files to Modify

| File | Changes |
|------|---------|
| `packages/cyclist/src/main.ts` | Add approval interception in setupClaudeIPCHandlers, new IPC channels |
| `packages/cyclist/src/preload.ts` | Expose bash approval IPC channels |
| `packages/cyclist/src/settings-store.ts` | **NEW** - Create settings storage |
| `packages/cyclist/src/public/js/components/ApprovalModal.js` | **NEW** - Approval modal UI |
| `packages/cyclist/src/public/styles.css` | Add modal styling |
| `packages/cyclist/src/public/index.html` | Add modal container element |

## Acceptance Criteria
- [ ] AC1: Setting toggle in Cyclist preferences (can be menu item initially)
- [ ] AC2: Approval modal appears before Bash execution (when gate enabled)
- [ ] AC3: Full command visible with syntax highlighting
- [ ] AC4: Approve continues execution normally
- [ ] AC5: Reject sends error back to Claude
- [ ] AC6: Always Allow adds to session allowlist

## Testing Strategy

### Unit Tests
- `settings-store.test.ts` - Settings persistence CRUD
- `approval-modal.test.js` - Modal rendering and button handlers
- Pattern matching for allowlist

### Integration Tests
- Bash interception with gate enabled/disabled
- Approval flow end-to-end (mock user interaction)
- Allowlist persistence across commands
- Rejection error propagation to Claude

### Manual Testing
- Enable gate, run Bash command, verify modal appears
- Approve command, verify execution continues
- Reject command, verify Claude receives error
- "Always Allow" a pattern, verify subsequent commands skip modal

## Dependencies & Risks

### Dependencies
- Story 22-1 (Tool Activity Bar) - **DONE** - Provides visual context
- Story 22-2 (Abort Button) - **DONE** - Provides abort mechanism

### Risks
| Risk | Mitigation |
|------|------------|
| Blocking main process during approval | Use async/await with IPC promise pattern |
| Modal not visible (window focus) | Bring window to front on approval request |
| Race condition with multiple Bash tools | Queue approvals, process sequentially |
| User frustrated by constant approvals | Good allowlist patterns, "Always Allow" prominent |

## Implementation Notes

### Settings Storage Options
1. **electron-store** - Simple, mature, auto-persist to JSON
2. **File-based** - Manual JSON read/write to `.cyclist/settings.json`

Recommend **electron-store** for simplicity unless we want to avoid adding dependencies.

### Syntax Highlighting in Modal
Options:
1. Use Prism.js (already loaded for code blocks?)
2. Simple regex-based Bash highlighting
3. No highlighting (plain monospace)

Recommend option 2 (simple regex) for MVP - highlight keywords, operators, paths.

### Escape Hatch
If approval gate causes issues, users need an escape:
- Toggle off via menu (View > Bash Approval Gate)
- Or environment variable: `CYCLIST_SKIP_BASH_APPROVAL=1`
