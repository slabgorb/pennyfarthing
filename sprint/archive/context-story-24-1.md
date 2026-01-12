# Story 24-1: Settings Panel Infrastructure - Technical Context

**Created:** 2026-01-12
**Author:** The Mad Hatter (SM)
**Epic:** 24 - Configuration & Theme Switcher Panels

---

## Story Overview

| Field | Value |
|-------|-------|
| **Story ID** | 24-1 |
| **Title** | Settings Panel Infrastructure |
| **Points** | 3 |
| **Priority** | P1 |
| **Repos** | cyclist |
| **Branch** | feat/24-1-settings-panel-infrastructure |

---

## Current State

### Existing Settings Infrastructure

**settings-store.ts** provides in-memory settings:
- Bash approval gate (on/off + command allowlist)
- Dangerous path detection (on/off + path allowlist)
- Verbose mode toggle
- **No file persistence** - all settings lost on restart

**IPC Channels for Settings (main.ts L1303-1320):**
```typescript
IPC_SETTINGS_CHANNELS = {
  VERBOSE_MODE_GET: 'settings:getVerboseMode',
  VERBOSE_MODE_SET: 'settings:setVerboseMode',
  VERBOSE_MODE_UPDATE: 'settings:verboseModeUpdate',
  // + bash/path gate channels
}
```

**Preload API (preload.ts L190-225):**
```typescript
ElectronSettingsAPI {
  getBashApprovalGate(): Promise<boolean>
  setBashApprovalGate(enabled: boolean): Promise<void>
  getDangerousPathGate(): Promise<boolean>
  setDangerousPathGate(enabled: boolean): Promise<void>
  getVerboseMode(): Promise<boolean>
  setVerboseMode(enabled: boolean): Promise<void>
  onVerboseModeChange(callback): void
}
```

### What's Missing

1. **File-based persistence** - Settings don't survive restart
2. **Unified settings UI** - No single place to view/edit all settings
3. **Menu shortcut** - No Cmd+, to open settings
4. **Project overrides** - No `.claude/cyclist.local.yaml` support

---

## Technical Approach

### Architecture (per ADR-001)

```
┌─────────────────────────────────────────────────────────────┐
│                     Settings Flow                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ~/.cyclist/settings.yaml     .claude/cyclist.local.yaml   │
│  (user defaults)              (project overrides)          │
│         │                            │                      │
│         └────────────┬───────────────┘                      │
│                      │                                      │
│              loadSettings()                                 │
│         (merge: project overrides user)                     │
│                      │                                      │
│         ┌────────────┴────────────┐                        │
│         │                         │                        │
│    main.ts                   Settings Window                │
│    (IPC handlers)            (settings.html)               │
│         │                         │                        │
│         └──────── IPC ───────────┘                         │
│                                                             │
│    Menu: Cyclist > Settings (Cmd+,)                         │
│                                                             │
│    File Watcher: auto-reload on external edit              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Settings Schema

```yaml
# ~/.cyclist/settings.yaml
workflow:
  auto_handoff: false        # Auto-trigger next agent when phase completes
  handoff_confirm: true      # Show confirmation dialog before handoff

display:
  show_flow: true            # Show TDD flow indicator
  show_ocean: false          # Show OCEAN personality bars
  sidebar_width: 300         # Sidebar pixel width

notifications:
  phase_change: true         # Desktop notification on agent change
  sound: false               # Audio feedback
```

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/settings.ts` | Load/save/merge/watch settings from YAML files |
| `src/settings-window.ts` | Electron BrowserWindow for settings modal |
| `src/public/settings.html` | Settings form UI |
| `src/public/settings.css` | Settings-specific styling |
| `src/public/js/settings-ui.js` | Form logic and IPC communication |

## Files to Modify

| File | Change |
|------|--------|
| `src/main.ts` | Add IPC handlers, menu item, integrate settings window |
| `src/preload.ts` | Add new settings IPC methods |
| `src/settings-store.ts` | Integrate with file-based persistence |

---

## Implementation Details

### 1. settings.ts - Core Settings Module

```typescript
// Key functions to implement:
loadSettings(projectDir?: string): CyclistSettings
saveUserSettings(settings: Partial<CyclistSettings>): void
watchSettings(projectDir, onChange): () => void  // returns unsubscribe fn
mergeSettings(base, override): CyclistSettings

// File locations:
USER_SETTINGS_DIR = ~/.cyclist/
USER_SETTINGS_FILE = ~/.cyclist/settings.yaml
PROJECT_SETTINGS = {projectDir}/.claude/cyclist.local.yaml
```

### 2. settings-window.ts - Electron Modal

```typescript
// Opens a child BrowserWindow for settings
openSettingsWindow(parentWindow: BrowserWindow): void

// Configuration:
- Modal window (blocks parent)
- Size: 450x500, non-resizable
- Shares preload script
- Loads settings.html
```

### 3. IPC Channels to Add

```typescript
// New channels in main.ts
IPC_SETTINGS_CHANNELS.GET = 'settings:get'
IPC_SETTINGS_CHANNELS.SAVE = 'settings:save'
IPC_SETTINGS_CHANNELS.CHANGED = 'settings:changed'

// Handlers:
ipcMain.handle('settings:get', () => currentSettings)
ipcMain.handle('settings:save', (_, settings) => {
  saveUserSettings(settings)
  return loadSettings(projectDir)
})
```

### 4. Menu Integration

```typescript
// In app menu (macOS Cyclist menu):
{
  label: 'Settings...',
  accelerator: 'Cmd+,',
  click: () => openSettingsWindow(mainWindow)
}
```

### 5. File Watching

```typescript
// Using chokidar for file watching
import { watch } from 'chokidar'

const watcher = watch([userPath, projectPath], { ignoreInitial: true })
watcher.on('change', () => {
  currentSettings = loadSettings(projectDir)
  broadcastToRenderer('settings:changed', currentSettings)
})
```

---

## Acceptance Criteria

- [ ] **AC1:** Settings panel opens from Cyclist menu
- [ ] **AC2:** Cmd+, keyboard shortcut opens settings
- [ ] **AC3:** Settings persist to `~/.cyclist/settings.yaml`
- [ ] **AC4:** Project overrides work from `.claude/cyclist.local.yaml`
- [ ] **AC5:** Settings load on startup
- [ ] **AC6:** UI shows all setting categories (workflow, display, notifications)
- [ ] **AC7:** File watching reloads settings on external edit

---

## Testing Strategy

### Unit Tests (settings.ts)
- Default settings returned when no files exist
- User settings merge correctly
- Project settings override user settings
- Invalid YAML falls back to defaults

### Integration Tests
- Settings window opens and closes
- IPC handlers respond correctly
- File save creates valid YAML

### Manual Testing
- [ ] Open settings with Cmd+,
- [ ] Toggle each setting and save
- [ ] Restart app, verify settings persist
- [ ] Edit YAML externally, verify reload
- [ ] Create project override, verify it takes precedence

---

## Dependencies

| Package | Purpose | Status |
|---------|---------|--------|
| `yaml` | YAML parse/stringify | Already installed |
| `chokidar` | File watching | Already installed |

No new dependencies required.

---

## Reference Materials

- **Implementation Guide:** `~/.claude/plans/cyclist-settings-flow.md`
- **ADR-001:** `.claude/project/agents/architect-sidecar/decisions.md`
- **Existing Pattern:** `src/public/js/components/ApprovalModal.js`
- **Main Process:** `src/main.ts` (L1303-1320 for existing settings IPC)

---

## Notes for TEA

This is a **3-point story** with clear infrastructure scope:
1. File-based settings persistence (read/write YAML)
2. Settings modal window (Electron BrowserWindow)
3. Menu integration (Cmd+,)
4. File watching for external edits

The settings UI should be functional but basic - future stories (24-2 through 24-4) will add specific settings sections.

---

*"Change places!" — The Mad Hatter*
