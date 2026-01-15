# Story 35-4: Three-way Mode Switch - Technical Context

## Story Overview

- **Epic:** 35 (Cyclist UI/UX Improvements)
- **Points:** 2
- **Priority:** P2
- **Repository:** cyclist (packages/cyclist)
- **Jira Key:** MSSCI-11719

## User Story

Replace the cycling mode button with an intuitive three-way toggle. Currently `cyclePermissionMode()` cycles through modes but the UI is just a button that changes text - not intuitive for users who don't know the order.

## Current State

### Mode Button Implementation

**Location:** `packages/cyclist/src/public/js/controls.js`

The current implementation cycles through three modes sequentially:
```javascript
const MODE_CYCLE = ['default', 'plan', 'acceptEdits'];
const MODE_DISPLAY = {
  'default': { label: 'MANUAL', className: '' },
  'plan': { label: 'PLAN', className: 'mode-plan' },
  'acceptEdits': { label: 'ACCEPT', className: 'mode-accept' }
};
```

- `cyclePermissionMode()` (L55-80) advances to next mode in array
- `updateModeButtonDisplay()` (L39-50) updates button text and CSS class
- IPC call to `electronAPI.claude.setMode(newMode)` persists the change

### Current UI (HTML)

**Location:** `packages/cyclist/src/public/index.html:137`
```html
<button class="mode-btn" data-control="plan-mode">MANUAL</button>
```

Single button that shows current mode text. Users must click repeatedly to reach desired mode.

### Current Styling

**Location:** `packages/cyclist/src/public/styles.css:636-678`
- `.mode-btn` - Base button styling
- `.mode-btn.mode-plan` - Teal color for PLAN mode
- `.mode-btn.mode-accept` - Purple color for ACCEPT mode

## Technical Approach

### Replace Button with Segmented Control

Create a three-segment toggle (similar to iOS segmented control):

```
┌─────────┬─────────┬─────────┐
│  PLAN   │ MANUAL  │ ACCEPT  │
└─────────┴─────────┴─────────┘
```

Each segment is directly clickable - no cycling needed.

### Implementation Details

1. **HTML Changes (index.html)**
   - Replace single `<button>` with segmented control container
   - Three child elements, one per mode
   - Use `data-mode="plan|default|acceptEdits"` attributes

2. **CSS Changes (styles.css)**
   - New `.mode-switch` container with flex layout
   - `.mode-switch-segment` for each option
   - `.mode-switch-segment.active` for selected state
   - Maintain existing color scheme (teal for plan, purple for accept)
   - Keyboard focus states for accessibility

3. **JavaScript Changes (controls.js)**
   - New `setPermissionMode(mode)` function for direct mode setting
   - Update `initControls()` to attach click handlers to segments
   - Update `updateModeButtonDisplay()` → `updateModeSwitch()` for new UI
   - Add keyboard navigation (arrow keys to move, enter to select)
   - Add keyboard shortcuts: P=plan, M=manual, A=accept

4. **IPC Integration**
   - Same `electronAPI.claude.setMode(mode)` call
   - Same `electronAPI.claude.getMode()` for initial state

## Files to Modify

| File | Changes |
|------|---------|
| `packages/cyclist/src/public/index.html` | Replace button with segmented control |
| `packages/cyclist/src/public/js/controls.js` | Direct mode selection, keyboard shortcuts |
| `packages/cyclist/src/public/styles.css` | Segmented control styling |

## Acceptance Criteria

- [ ] Segmented control replaces cycling button
- [ ] Three modes clearly labeled and clickable (PLAN, MANUAL, ACCEPT)
- [ ] Current mode visually distinct (highlighted segment)
- [ ] Direct selection (click PLAN goes to plan, not cycle)
- [ ] Keyboard shortcuts work (P=plan, M=manual, A=accept)
- [ ] Mode persists correctly via IPC

## Testing Strategy

1. Visual: Segmented control renders correctly with proper styling
2. Click: Each segment sets the correct mode via IPC
3. Keyboard: P/M/A shortcuts work regardless of focus
4. Persistence: Mode survives page reload
5. State: Active segment updates when mode changes externally

## Dependencies & Risks

- No dependencies on other stories
- Low risk - isolated UI component replacement
- Existing IPC layer unchanged
