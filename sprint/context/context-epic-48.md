# Epic 48: WheelHub Notification Consolidation - Technical Context

## Overview
Consolidate notification patterns across Cyclist. Replace polling with event-driven WebSocket channels, standardize reconnection behavior, and add cross-tab synchronization.

## Technical Landscape

### Current State
Cyclist uses multiple notification mechanisms:
- WebSocket channels for real-time updates (messages, status)
- setInterval polling for badge counts (500ms in tab-bar.js)
- localStorage for state persistence (14 files, various patterns)
- Livereload with exponential backoff (now aligned to 2s fixed)

### Target State
- Event-driven badge updates (no polling)
- BroadcastChannel API for cross-tab sync
- Centralized localStorage access through settings-sync.js
- Consistent reconnection patterns across all channels

## Key Files

### Panel System
- `vertical-panel.js` - Base class for collapsible panels, handles localStorage persistence
- `panel-manager.js` - Coordinates all panels, stores display mode
- `file-panel.js`, `diff-panel.js`, `settings-panel.js`, `sidebar-panel.js`, `message-panel.js` - Individual panels

### Theme System
- `theme.js` - Applies theme preference on load
- `theme-manager.js` - Full theme management with custom themes
- `message-view-init.js` - Theme initialization

### Editor Components
- `editor/constants.js` - localStorage key definitions
- `editor/message-queue.js` - Persists draft messages
- `editor/command-history.js` - Command history (max 100)

### Other
- `story.js` - AC collapse state
- `tab-bar.js` - Badge polling (target for event-driven refactor)

## Patterns

### localStorage Access Pattern (current)
```javascript
// Load with error handling
function loadState() {
  try {
    const saved = localStorage.getItem(KEY);
    return saved ? JSON.parse(saved) : defaultState;
  } catch (e) {
    console.warn('Failed to load state:', e);
    return defaultState;
  }
}

// Save with error handling
function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Failed to save state:', e);
  }
}
```

### Target Pattern (settings-sync.js)
```javascript
// Centralized access with cross-tab broadcast
const settingsSync = {
  get(key, defaultValue) { /* ... */ },
  set(key, value) { /* broadcast to other tabs */ },
  subscribe(key, callback) { /* listen for changes */ }
};
```

## Dependencies
- BroadcastChannel API (modern browsers, no IE11)
- No external dependencies required

## Risks
- Race conditions between tabs writing simultaneously
- Migration path for existing localStorage usage
- Testing cross-tab behavior requires special setup
