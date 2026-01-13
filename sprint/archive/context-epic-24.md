# Epic 24: Configuration & Theme Switcher Panels - Technical Context

**Created:** 2026-01-12
**Author:** The Mad Hatter (SM)
**Sprint:** 10 (partial - story 24-1 only)

---

## Epic Overview

| Field | Value |
|-------|-------|
| **Epic ID** | epic-24 |
| **Title** | Configuration & Theme Switcher Panels |
| **Total Points** | 21 (3 pts in Sprint 10, 18 pts in backlog) |
| **Priority** | P2 |
| **Repos** | cyclist, pennyfarthing |
| **Status** | in-progress |

**Description:** Full settings hub in Cyclist covering Pennyfarthing, Claude Code, and Cyclist preferences. Rich theme browser with search, OCEAN profiles, character previews, and favorites.

---

## Current State Analysis

### Existing Settings Infrastructure

**settings-store.ts** (in-memory only):
- Manages Bash approval gates (Story 22-3)
- Manages dangerous path detection (Story 22-4)
- Manages verbose mode toggle (Story 22-5)
- **NO persistent file storage** - all settings lost on app restart

**IPC Channels Already Defined:**
```typescript
// From main.ts
'settings:getVerboseMode'
'settings:setVerboseMode'
'settings:verboseModeUpdate'
```

**Theme Systems (TWO separate systems):**
1. **UI Theme** (`dark`/`light`): Stored in localStorage, managed by `theme.js`
2. **Persona Theme** (alice-in-wonderland, etc.): Read from `.claude/persona-config.yaml`

### Existing Modal Patterns

Three modals exist with consistent patterns:
- `ApprovalModal.js` (Bash command approval)
- `DangerousPathModal.js` (Path approval)
- `AuditLogViewer.js` (Execution log)

**Common Pattern:**
```javascript
// State management - module-level variables
let isVisible = false;
let currentData = null;
let responseCallback = null;

// Show/hide via classList
element.classList.add('hidden');
element.classList.remove('hidden');

// Keyboard shortcuts
document.addEventListener('keydown', handleKeydown);

// IPC communication
window.electronAPI.onApprovalRequest(handleRequest);
```

### Relevant ADRs

**ADR-001 (Architect Sidecar):** Cyclist Settings & TDD Flow Integration
- Decided on **hybrid file-based** storage
- User defaults: `~/.cyclist/settings.yaml`
- Project overrides: `.claude/cyclist.local.yaml`
- Shallow merge per section

**Full Implementation Guide:** `~/.claude/plans/cyclist-settings-flow.md`

---

## Technical Approach for Story 24-1

### Architecture

Story 24-1 creates the foundation. Per the ADR and implementation guide:

```
┌─────────────────────────────────────────────────────────────┐
│                     Settings Architecture                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ~/.cyclist/settings.yaml     .claude/cyclist.local.yaml   │
│  (user defaults)              (project overrides)          │
│         │                            │                      │
│         └────────────┬───────────────┘                      │
│                      │                                      │
│              loadSettings()                                 │
│                      │                                      │
│         ┌────────────┴────────────┐                        │
│         │                         │                        │
│    main.ts                   renderer                       │
│    (IPC handlers)            (settings-ui.js)              │
│         │                         │                        │
│         └──────── IPC ───────────┘                         │
│                                                             │
│    Menu: Cmd+, → openSettingsWindow()                       │
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
  show_flow: true            # Show current phase + next agent
  show_ocean: false          # Show OCEAN bars in persona section
  sidebar_width: 300         # Pixel width

notifications:
  phase_change: true         # Desktop notification on agent change
  sound: false               # Audio feedback
```

---

## Files to Create (Story 24-1)

| File | Purpose |
|------|---------|
| `packages/cyclist/src/settings.ts` | Settings load/save/merge/watch logic |
| `packages/cyclist/src/settings-window.ts` | Electron modal window management |
| `packages/cyclist/src/public/settings.html` | Settings UI HTML |
| `packages/cyclist/src/public/settings.css` | Settings-specific styling |
| `packages/cyclist/src/public/js/settings-ui.js` | Settings form logic |

## Files to Modify (Story 24-1)

| File | Change |
|------|--------|
| `packages/cyclist/src/main.ts` | Add IPC handlers, menu item, settings window opener |
| `packages/cyclist/src/preload.ts` | Extend ElectronSettingsAPI for new IPC channels |
| `packages/cyclist/src/settings-store.ts` | Integrate with file-based persistence |

---

## Key Implementation Notes

### 1. YAML vs JSON for Settings

Using YAML per ADR-001:
- Human-readable and editable
- Consistent with Pennyfarthing patterns (`.local.yaml` convention)
- Use `yaml` npm package (already used elsewhere in Cyclist)

### 2. File Watching with Chokidar

```typescript
import { watch } from 'chokidar';

const watcher = watch([userPath, projectPath], { ignoreInitial: true });
watcher.on('change', () => {
  const newSettings = loadSettings(projectDir);
  broadcastToRenderer('settings:changed', newSettings);
});
```

### 3. Electron Modal Window

Settings uses a **separate BrowserWindow** (modal):
- Opens via `Cmd+,` keyboard shortcut
- Parent/child relationship with main window
- Shares preload script for IPC
- Fixed size (450x500), non-resizable

### 4. IPC Channel Naming Convention

Follow existing pattern:
```typescript
export const IPC_SETTINGS_CHANNELS = {
  GET: 'settings:get',
  SAVE: 'settings:save',
  CHANGED: 'settings:changed',
};
```

---

## Sprint 10 Scope (Story 24-1 Only)

**In Scope:**
- Settings file infrastructure (`settings.ts`)
- Settings modal window (`settings-window.ts`)
- Basic settings UI with all sections
- Cmd+, keyboard shortcut
- File persistence to `~/.cyclist/settings.yaml`
- Project overrides from `.claude/cyclist.local.yaml`
- Settings load on startup

**Out of Scope (Future Stories):**
- 24-2: Pennyfarthing-specific settings section
- 24-3: Claude Code settings section
- 24-4: Cyclist preferences section
- 24-5: Theme browser with search
- 24-6: Theme preview with portraits
- 24-7: Theme favorites
- 24-8: Quick theme switcher

---

## Acceptance Criteria (Story 24-1)

- [ ] Settings panel opens from Cyclist menu
- [ ] Cmd+, keyboard shortcut opens settings
- [ ] Settings persist to `~/.cyclist/settings.yaml`
- [ ] Project overrides work from `.claude/cyclist.local.yaml`
- [ ] Settings load on startup
- [ ] UI shows all setting categories (workflow, display, notifications)
- [ ] File watching reloads settings on external edit

---

## Testing Strategy

### Unit Tests
- `settings.ts`: Test merge logic, default handling, file parsing
- Mock filesystem for load/save tests

### Integration Tests
- Settings window opens correctly
- IPC channels work end-to-end
- File watching triggers updates

### Manual Testing
- Edit YAML externally, verify reload
- Verify settings survive app restart
- Test project overrides work correctly

---

## Dependencies & Risks

### Dependencies
- `yaml` npm package (parse/stringify)
- `chokidar` npm package (file watching)
- Both already used in Cyclist, no new deps needed

### Risks
| Risk | Mitigation |
|------|------------|
| File permission issues | Try/catch with fallback to defaults |
| Invalid YAML in user files | Parse errors logged, use defaults |
| Settings window conflicts with modals | Settings is separate window, not modal in main window |

---

## Reference Materials

- **Implementation Guide:** `~/.claude/plans/cyclist-settings-flow.md`
- **ADR-001:** `.claude/project/agents/architect-sidecar/decisions.md`
- **Existing Modal Pattern:** `packages/cyclist/src/public/js/components/ApprovalModal.js`
- **Settings Store:** `packages/cyclist/src/settings-store.ts`

---

## Story Sequence (Full Epic)

| Order | Story | Points | Depends On |
|-------|-------|--------|------------|
| 1 | **24-1**: Settings Panel Infrastructure | 3 | - |
| 2 | 24-2: Pennyfarthing Settings Section | 2 | 24-1 |
| 3 | 24-3: Claude Code Settings Section | 2 | 24-1 |
| 4 | 24-4: Cyclist Preferences Section | 2 | 24-1 |
| 5 | 24-5: Theme Browser with Search | 5 | - |
| 6 | 24-6: Theme Preview with Portraits | 3 | 24-5 |
| 7 | 24-7: Theme Favorites | 2 | 24-5 |
| 8 | 24-8: Quick Theme Switcher | 2 | - |

---

*"We're all mad here, but at least our settings will be saved!" — The Mad Hatter*
