# Story 22-5: Verbose Mode Setting with Expanded Tool Blocks - Research Report

## Story Details

**Story ID:** 22-5  
**Title:** Verbose mode setting with expanded tool blocks  
**Points:** 2  
**Priority:** P2  
**Epic:** 22 - Verbose Mode - Tool Visibility & Intervention  
**Repos:** cyclist  
**Status:** backlog  

### Acceptance Criteria

1. Verbose mode toggle in View menu
2. When enabled, tool blocks render expanded
3. Tool inputs visible without clicking
4. Setting persists across sessions
5. Keyboard shortcut works (Cmd+Shift+V)

### Description

Add a "Verbose Mode" toggle that changes how tool execution is displayed in the message view.

When enabled:
- Tool use blocks expanded by default (not collapsed)
- Tool inputs shown inline without requiring click
- Tool results shown inline (with scroll for long output)
- Syntax highlighting for code/commands

Setting location:
- Cyclist menu: View > Verbose Mode
- Persisted in cyclist settings
- Keyboard shortcut: Cmd+Shift+V

---

## Related Completed Work

### Story 22-1: Tool Activity Bar Component (3 pts, DONE 2026-01-10)

**What was built:** A sticky activity bar at the bottom of the message view that displays currently executing tools with:
- Tool name and primary parameter (file path, command, pattern)
- Real-time elapsed time counter
- Graceful fade-out 300ms after completion

**Key patterns:**
- ES module with 16 exported functions for testability
- Map-based tool tracking by tool_id
- DOM guards for Node.js test compatibility
- CSS variables for theme consistency
- 51 comprehensive tests

**Files created/modified:**
- NEW: `packages/cyclist/src/public/js/components/ToolActivityBar.js` (401 lines)
- MODIFIED: `packages/cyclist/src/public/styles.css` (+82 lines)
- MODIFIED: `packages/cyclist/src/public/index.html` (container + script)
- MODIFIED: `packages/cyclist/vitest.config.ts` (env: happy-dom)

**Key lesson:** 100ms timer interval feels responsive for elapsed time updates.

### Story 22-2: Abort Button for Running Operations (2 pts, DONE 2026-01-10)

**What was built:** Abort state handling for ToolActivityBar:
- Reuses existing stop button (#stop-btn) and Escape key handler
- Shows "Aborting..." visual feedback with red styling
- Auto-hides after 1 second

**Key patterns:**
- Abort state management via module variables
- Element caching with lazy loading
- Timeout management with proper cleanup
- CSS state classes (.aborting) for visual changes

**Files modified:**
- MODIFIED: `ToolActivityBar.js` (+84 lines for abort handling)
- MODIFIED: `message-view-init.js` (wired handleAbort to stop button)
- MODIFIED: `styles.css` (+15 lines for .aborting class)

**Key lesson:** 1-second hide delay works well for abort feedback timing.

### Story 22-3: Bash Command Approval Gate (3 pts, DONE 2026-01-10)

**What was built:** Pre-execution approval system for Bash commands:
- Modal interface with syntax highlighting
- Safety classification (safe/caution/danger)
- "Always Allow" with glob pattern matching
- Setting toggle to enable/disable feature

**Architecture:**
- IPC channels: `bash:approval-request` / `bash:approval-response`
- In-memory settings store with getter/setter exports
- Promise-based queue for pending approvals

**Files created/modified:**
- NEW: `src/settings-store.ts` (enable state, allowlist patterns)
- NEW: `src/approval-gate.ts` (main process interception)
- NEW: `src/public/js/components/ApprovalModal.js` (modal UI + highlighting)
- MODIFIED: `preload.ts` (bash + settings IPC channels)
- MODIFIED: `index.html` (modal container)
- MODIFIED: `styles.css` (modal + highlight styles)

**Key lesson:** Security review pattern for UI - trace data flow from input through display and verify escaping at each step.

---

## Epic 22 Context

**Epic:** 22 - Verbose Mode - Tool Visibility & Intervention  
**Points:** 13 | **Completed:** 3 | **Remaining:** 10  
**Priority:** P1 | **Marker:** safety  
**Repos:** cyclist  

### Architecture Layers

```
Layer 3: Display Controls (22-5, 22-6)
        ↑ Optional verbosity & audit
Layer 2: Approval Gates (22-3, 22-4)
        ↑ Pre-execution intervention
Layer 1: Activity Bar (22-1, 22-2)
        ↑ Real-time visibility & abort
```

Stories 22-1, 22-2, 22-3 provide the foundational visibility and approval infrastructure. Story 22-5 (Verbose Mode) sits in Layer 3 - the display control layer that affects how the tool blocks themselves render.

### Message Flow Architecture

```
ClaudeService (PTY) → SDKMessage objects
  ├─ tool_use: {type, tool_name, tool_id, input}
  └─ tool_result: {type, tool_id, output, is_error}
        ↓
main.ts broadcasts: broadcastToRenderer('claude:message', message)
        ↓
MessageView renders:
  ├─ renderToolUseMessage(tool_id, tool_name, input)
  │   └─ <details> open={isVerbose} class="tool-input">
  └─ renderToolResultMessage(tool_id, output, is_error)
        ↓
activity.js updates ToolActivityBar simultaneously
```

---

## Technical Architecture for 22-5

### Current Tool Message Rendering (MessageView.js)

Tool use blocks currently render with `<details>` element (collapsed by default):

```javascript
// Current pattern in MessageView.js
function renderToolUseMessage(message) {
  const html = `
    <details class="tool-input">
      <summary>${toolIcon} ${toolName}: ${shortParams}</summary>
      <pre><code>${JSON.stringify(input, null, 2)}</code></pre>
    </details>
  `;
  return html;
}
```

### Implementation Approach

**Option A: CSS-only Toggle (Recommended for MVP)**

```javascript
function renderToolUseMessage(message, isVerbose) {
  const openAttr = isVerbose ? 'open' : '';
  const html = `
    <details class="tool-input" ${openAttr}>
      <summary>${toolIcon} ${toolName}</summary>
      <pre><code>${formatInput(input)}</code></pre>
    </details>
  `;
  return html;
}

// In app.js message handler
ipcRenderer.on('claude:message', (message) => {
  const isVerbose = settingsStore.getVerboseMode();
  renderMessage(message, isVerbose);
  // If verbose, also ensure no collapsed state
  if (isVerbose) {
    document.querySelectorAll('.tool-input').forEach(el => {
      el.setAttribute('open', '');
    });
  }
});
```

**Option B: Dynamic Re-rendering (More Robust)**

```javascript
function toggleVerboseMode(newState) {
  settingsStore.setVerboseMode(newState);
  
  // Re-render all tool blocks
  document.querySelectorAll('[data-tool-id]').forEach(block => {
    if (block.classList.contains('tool-input')) {
      if (newState) {
        block.setAttribute('open', '');
      } else {
        block.removeAttribute('open');
      }
    }
  });
  
  // Broadcast to other windows
  ipcRenderer.send('settings:verbose-mode-changed', newState);
}
```

### File Structure & Implementation

**Files to Create:**
1. `src/settings-store.ts` extension
   - Add `getVerboseMode()` / `setVerboseMode(bool)`
   - Persist to electron-store config

2. `src/public/js/components/VerboseModeToggle.js` (optional)
   - Helper functions for toggle management
   - Consistency with ToolActivityBar and ApprovalModal patterns

**Files to Modify:**

1. **`src/main.ts`** (Menu + IPC)
   ```typescript
   // In createWindow() menu setup
   {
     label: 'View',
     submenu: [
       { type: 'separator' },
       {
         label: 'Verbose Mode',
         type: 'checkbox',
         accelerator: 'CmdOrCtrl+Shift+V',
         checked: getVerboseMode(),
         click: (menuItem) => {
           setVerboseMode(menuItem.checked);
           broadcastToRenderer('settings:verbose-mode-changed', menuItem.checked);
         }
       }
     ]
   }
   
   // IPC handler
   ipcMain.on('settings:get-verbose-mode', (event) => {
     event.returnValue = getVerboseMode();
   });
   ```

2. **`src/public/index.html`**
   - No new elements needed (uses existing message container)

3. **`src/public/js/app.js` or `message-view-init.js`**
   ```javascript
   import { settingsStore } from '../settings-store.js';
   
   // On startup
   const isVerbose = settingsStore.getVerboseMode();
   expandAllToolBlocks(isVerbose);
   
   // Listen for changes
   ipcRenderer.on('settings:verbose-mode-changed', (newState) => {
     expandAllToolBlocks(newState);
   });
   
   function expandAllToolBlocks(isVerbose) {
     const details = document.querySelectorAll('.tool-input, .tool-result');
     details.forEach(el => {
       if (isVerbose) {
         el.setAttribute('open', '');
       } else {
         el.removeAttribute('open');
       }
     });
   }
   ```

4. **`src/public/styles.css`** (Minimal changes)
   ```css
   /* Ensure tool blocks expand smoothly */
   .tool-input[open],
   .tool-result[open] {
     /* Existing styles apply */
   }
   
   /* Optional: prevent collapse animation when verbose mode active */
   .verbose-mode .tool-input,
   .verbose-mode .tool-result {
     /* details always open styling */
   }
   ```

---

## Implementation Considerations

### Dependencies (All Available)

1. **settings-store.ts** - Already exists with get/set patterns (from 22-3)
   - Add two functions: `getVerboseMode()`, `setVerboseMode(bool)`

2. **electron-store** - Already used for settings persistence
   - Key: `verboseMode: boolean` (default: false)

3. **MessageView.js** - Already renders tool blocks
   - Just need to pass `isVerbose` flag and set `open` attribute

### Acceptance Criteria Mapping

| AC | Implementation | Files |
|----|----|-----|
| Toggle in View menu | Menu item + ipcMain handler | `main.ts` |
| Tool blocks render expanded | Set `open` attribute on `<details>` | `app.js` or `message-view-init.js` |
| Tool inputs visible without click | Automatic with `open` attribute | CSS + HTML |
| Setting persists | electron-store integration in settings-store.ts | `settings-store.ts` |
| Keyboard shortcut (Cmd+Shift+V) | Menu accelerator | `main.ts` |

### Testing Strategy

**Unit Tests:** `tests/22-5-verbose-mode.test.ts`
- `getVerboseMode()` / `setVerboseMode()` in settings store
- `expandAllToolBlocks()` utility function
- Details element open/closed attribute handling

**Integration Tests:**
- Menu item toggle updates UI
- Keyboard shortcut (Cmd+Shift+V) works
- IPC communication between main/renderer
- Setting persists across window reopen

**Manual Testing:**
- Toggle View > Verbose Mode
- Verify all tool blocks expand/collapse
- Verify Cmd+Shift+V works
- Restart Cyclist, verify setting persists
- Test with Tool Activity Bar (should work together)
- Test with Approval Gate (should work together)

---

## Key Differences from Related Stories

| Aspect | 22-1 Activity Bar | 22-3 Approval Gate | 22-5 Verbose Mode |
|--------|-----------|---------|------|
| **Layer** | Visibility | Approval | Display |
| **Scope** | New component | New feature | Existing UI adjustment |
| **Complexity** | Medium (state tracking) | High (security) | Low (DOM + settings) |
| **Integration** | All tools | Bash only | All tool blocks |
| **User Action** | Passive display | Active approval | Toggle + auto-expand |

**Key insight:** 22-5 is much simpler than 22-1 and 22-3 because it only manipulates existing HTML attributes and the menu system. No new components required.

---

## Potential Challenges

1. **Tool result blocks** - Need to ensure `<details>` for tool results also respects verbose mode
2. **Scrolling long outputs** - When expanded, very long tool results (e.g., `cat large-file.txt`) may create very tall messages; consider adding `max-height` with scroll
3. **Window resizing** - Activity bar should not interfere with verbose mode display
4. **Performance** - Expanding all blocks on every setting change is fast (< 100 tool blocks typical), but could optimize with CSS class instead
5. **Concurrent operations** - With ToolActivityBar showing multiple tools, verbose mode should show all their expanded results

---

## Recommended Implementation Path

### Phase 1: Basic Toggle (1 session)
1. Add `getVerboseMode()` / `setVerboseMode()` to settings-store
2. Add View > Verbose Mode menu item with keyboard shortcut
3. Implement `expandAllToolBlocks(isVerbose)` utility
4. Wire IPC message broadcast on setting change
5. Basic tests (5-10 tests)

### Phase 2: Persistence & Polish (optional, next story)
1. Test setting persists across sessions
2. Optimize with CSS class instead of individual attribute updates
3. Add scroll container for long tool results
4. Integration tests with Activity Bar and Approval Gate

---

## Files Affected Summary

| File | Type | Purpose |
|------|------|---------|
| `src/settings-store.ts` | Modify | Add verbose mode getter/setter |
| `src/main.ts` | Modify | Add menu item + IPC handler |
| `src/public/js/app.js` or `message-view-init.js` | Modify | Wire up toggle logic |
| `src/public/styles.css` | Minor modify | Optional polish for expanded state |
| `tests/22-5-verbose-mode.test.ts` | Create | 10-20 tests |

**Total estimated changes:** ~80-120 lines of code + tests

