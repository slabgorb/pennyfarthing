# Story 23-4: Compact Button with Context Awareness

## Story Information

| Field | Value |
|-------|-------|
| **Story ID** | 23-4 |
| **Epic** | Epic 23 (Cyclist Claude Code Command Integration) |
| **Title** | Compact Button with Context Awareness |
| **Points** | 3 |
| **Priority** | P1 (High) |
| **Status** | backlog |
| **Repos** | cyclist |
| **Jira Key** | MSSCI-11540 (marked "Done" in Jira but story status is backlog in sprint) |

## Acceptance Criteria

1. **Compact button appears when context > 50%**
   - Button should be visible in the UI when context usage exceeds 50%
   - Should be contextually relevant - appears in stats strip or controls area

2. **Cmd+Shift+K triggers compact from anywhere**
   - Global keyboard shortcut should work regardless of focus
   - Should execute `/compact` command through IPC layer

3. **After compact, context % updates**
   - UI should reflect the new context usage percentage post-compact
   - Should update stats strip display

4. **Works in both Electron and web modes**
   - Desktop (Electron) application support
   - Browser-based web mode support

## Context from Epic 23

### Vision
Expose high-value Claude Code commands through intuitive GUI elements in Cyclist, with dedicated IPC handlers for clean architecture. Priority commands: `/status` (usage limits), `/compact`, `/rewind`, `/doctor`.

### Architecture Decision
**Chosen:** Dedicated IPC handlers (not PTY injection)

**Rationale:**
- Cleaner separation of concerns
- Better error handling
- Can parse command output
- Enables richer UI integration
- Consistent with existing Cyclist patterns

## Dependency Chain

### 23-4 depends on:
- **Story 23-3** (Command Abstraction Layer - IPC) - COMPLETED
  - Provides the IPC handler infrastructure for executing Claude Code commands
  - Exports `IPC_COMMAND_CHANNELS` constants
  - Defines command execution in main process

### 23-4 feeds into:
- **Story 23-5** (Keyboard Shortcuts System) - will use compact shortcut
  - Broader keyboard shortcut system
  - Includes Cmd+Shift+D (Doctor), Cmd+Shift+P (Palette)

## Implementation Requirements

### IPC Communication Pattern (23-3)

```typescript
// IPC channel constants already defined in main.ts
export const IPC_COMMAND_CHANNELS = {
  EXECUTE: 'command:execute',
  RESULT: 'command:result',
  ERROR: 'command:error',
} as const;

// Preload exposes command API
window.electronAPI.command.execute(command: string) => Promise<void>
window.electronAPI.command.onResult(callback: (result: unknown) => void) => void
window.electronAPI.command.onError(callback: (error: string) => void) => void
```

### UI Components to Modify

#### 1. **stats-strip.js** (Primary location)
- Location: `/Users/keithavery/Projects/pennyfarthing/packages/cyclist/src/public/js/stats-strip.js`
- Already handles usage meter display (story 23-1 completed)
- Already exports `updateContextMeter()` function
- Need to:
  - Add compact button HTML element
  - Show/hide button based on context percentage
  - Handle click to execute `/compact` command
  - Update context % after command completes

#### 2. **controls.js** (Secondary location)
- Location: `/Users/keithavery/Projects/pennyfarthing/packages/cyclist/src/public/js/controls.js`
- Already handles mode cycling and clear button
- Good place for keyboard shortcut handler
- Need to:
  - Register Cmd+Shift+K keyboard listener
  - Trigger compact command through IPC

#### 3. **styles.css**
- Location: `/Users/keithavery/Projects/pennyfarthing/packages/cyclist/src/public/styles.css`
- Need to:
  - Add styles for compact button
  - Add visibility state classes (e.g., `.compact-button.hidden`)
  - Match existing control button styling

### File References

**Existing Files (Already Completed):**
- `packages/cyclist/src/main.ts` - IPC command handler setup (story 23-3)
- `packages/cyclist/src/preload.ts` - Command API exposure (story 23-3)
- `packages/cyclist/src/public/js/stats-strip.js` - Stats display (story 23-1)
- `packages/cyclist/src/public/js/controls.js` - Control handlers (story 23-2)

**Key Functions Already Available:**
- `updateContextMeter(percent, tokens)` - Updates context % display
- `updateStripStat(dataStat, value)` - Updates any stats value
- `formatResetTime(resetAt)` - Formats time until reset

## Related Stories & Dependencies

### Completed Prerequisites:
- **23-1** (Usage Limits in Stats Strip) - 3 pts - DONE
  - Provides context meter display infrastructure
  - Exports update functions used by 23-4

- **23-2** (Fix Clear to Reset All Session State) - 2 pts - DONE
  - Fixes state reset on clear button
  - Pattern for button handlers in controls.js

- **23-3** (Command Abstraction Layer - IPC) - 3 pts - DONE
  - Core IPC infrastructure for command execution
  - Must complete before 23-4 can work

### Recommended Story Order (From Epic Context):
1. ~~23-2~~ (blocking) - DONE
2. ~~23-1~~ (highest user value, P0) - DONE
3. ~~23-3~~ (foundation for others) - DONE
4. **23-4** (uses IPC layer) - CURRENT
5. 23-5 (Keyboard Shortcuts System)
6. 23-6 (Command Palette)
7. 23-7 (Doctor Panel)
8. 23-8 (Rewind Timeline)
9. 23-9 (Rewind Preview - depends on 23-8)

## Technical Details

### Context Percentage Calculation
From stats-strip.js:
- Context is tracked as a percentage (0-100)
- Display levels:
  - Safe: < 50%
  - Warning: 50-80%
  - Danger: 80-95%
  - Critical: >= 95%

### Button Visibility Logic
```javascript
// Pseudocode
if (contextPercentage > 50) {
  compactButton.classList.remove('hidden');
} else {
  compactButton.classList.add('hidden');
}
```

### Command Execution Flow
1. User clicks compact button OR presses Cmd+Shift+K
2. JavaScript calls `window.electronAPI.command.execute('/compact')`
3. IPC channel 'command:execute' sends to main process
4. Main process:
   - Injects `/compact` into Claude SDK PTY session
   - Waits for command completion
   - Broadcasts result back to renderer via 'command:result'
5. JavaScript:
   - Receives result event
   - Calls `getContextUsage()` or polls for updated context
   - Updates context % display via `updateContextMeter()`

### CSS Styling Pattern
From existing controls (controls.js):
- Buttons use `data-control` or `id` attributes
- States via class names: `.hidden`, `.mode-plan`, `.mode-accept`
- Transitions: 0.15s ease for hover effects
- Size: 24px × 24px for icon buttons

## Existing Context Files

**Epic Context:** `/Users/keithavery/Projects/pennyfarthing/.session/context-epic-23.md`
- Full epic overview
- Architecture decisions
- Key files list
- IPC pattern definition
- Story order recommendations

**Story Context:** None found for 23-4 specifically
- May need to create if starting work

## Key Implementation Notes

1. **Context Tracking**: Uses `window.electronAPI.context` IPC channel
   - Polls main process for context updates
   - Updates happen automatically as new messages flow

2. **Button Placement**: Most logical in stats strip (stats-strip.js)
   - Near context meter for proximity to percentage display
   - Part of existing stats display infrastructure
   - Already has subscription to context updates

3. **Keyboard Shortcut**: Should be in controls.js
   - Reuses existing pattern from mode/clear buttons
   - Global listener on window/document

4. **Electron vs Web**: 
   - Both support IPC through `window.electronAPI`
   - Keyboard shortcut may need web-specific handling
   - Test both modes per acceptance criteria

5. **State Consistency**:
   - Don't show button if context < 50%
   - Show button prominently if context > 50%
   - Update immediately after compact executes

## Risk Considerations

- **Timing**: Command execution is async - need to handle loading state
- **Error Handling**: `/compact` might fail - need error feedback
- **Race Conditions**: Context might update between polls
- **Web Mode**: Keyboard shortcuts work differently in browser vs Electron

## Previous Learnings (From Other Stories)

From story 23-2 (Clear button fix):
- Multiple UI state items need clearing
- Don't forget agent panel state
- File/diff panels have `resetState()` functions

From story 23-1 (Usage limits):
- Usage stats have polling mechanism
- Color coding: Green (>50%), Yellow (25-50%), Red (<25%)
- Tooltips show reset timestamps

From story 23-3 (IPC abstraction):
- Command pattern uses invoke() for execution
- Results broadcast via on() listener pattern
- Main process handles command injection

