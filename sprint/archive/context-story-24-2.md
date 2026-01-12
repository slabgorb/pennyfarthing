# Story 24-2: Pennyfarthing Settings Section - Technical Context

**Created:** 2026-01-12
**Author:** The Mad Hatter (SM)
**Epic:** 24 - Configuration & Theme Switcher Panels

---

## Story Overview

| Field | Value |
|-------|-------|
| **Story ID** | 24-2 |
| **Title** | Pennyfarthing Settings Section |
| **Points** | 2 |
| **Priority** | P1 |
| **Repos** | cyclist |
| **Branch** | feat/24-2-pennyfarthing-settings-section |
| **Depends On** | 24-1 (completed) |

---

## Current State

### Story 24-1 Delivered

The settings infrastructure is complete:
- Settings modal opens via Cmd+, or Cyclist menu
- Three sections exist: Workflow, Display, Notifications
- File persistence to `~/.cyclist/settings.yaml`
- Project overrides from `.claude/cyclist.local.yaml`
- File watching for live reload

### Pennyfarthing Configuration Today

Theme selection is stored in `.claude/persona-config.local.yaml`:
```yaml
theme: "alice-in-wonderland"
```

This file is:
- Read by `agent-session.sh` when agents activate
- Not accessible from Cyclist UI
- Requires manual file editing to change themes

### Available Themes

101 themes exist in `pennyfarthing-dist/personas/themes/`:
- alice-in-wonderland, a-team, agatha-christie, greek-mythology, star-trek, etc.
- Each theme maps agents to characters with OCEAN personalities

---

## Technical Approach

### New Settings Section: "pennyfarthing"

Add a fourth section to the settings schema:

```typescript
// In settings.ts
interface PennyfarthingSettings {
  theme: string;           // Theme name (e.g., "alice-in-wonderland")
}

interface CyclistSettings {
  workflow: WorkflowSettings;
  display: DisplaySettings;
  notifications: NotificationSettings;
  pennyfarthing: PennyfarthingSettings;  // NEW
}
```

### Theme Selection Flow

```
┌─────────────────────────────────────────────────────────────┐
│                  Theme Selection Flow                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Settings UI                                                │
│  ┌─────────────────────┐                                   │
│  │ Pennyfarthing       │                                   │
│  │ ┌─────────────────┐ │                                   │
│  │ │ Theme: [▼ list] │ │  ← Dropdown of 101 themes        │
│  │ └─────────────────┘ │                                   │
│  └─────────────────────┘                                   │
│            │                                                │
│            ▼ (on save)                                      │
│  ┌─────────────────────┐                                   │
│  │ settings.ts         │                                   │
│  │ saveUserSettings()  │  → ~/.cyclist/settings.yaml       │
│  └─────────────────────┘                                   │
│            │                                                │
│            ▼ (also writes)                                  │
│  ┌─────────────────────┐                                   │
│  │ .claude/persona-    │  ← Pennyfarthing reads this      │
│  │ config.local.yaml   │                                   │
│  └─────────────────────┘                                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Key Decision: Dual File Write

When theme changes:
1. Save to `~/.cyclist/settings.yaml` (Cyclist's settings)
2. Also write to `.claude/persona-config.local.yaml` (Pennyfarthing's config)

This maintains compatibility with existing Pennyfarthing scripts that read persona-config.local.yaml.

---

## Files to Modify

| File | Change |
|------|--------|
| `src/settings.ts` | Add `PennyfarthingSettings` interface, defaults, merge logic, validation |
| `src/public/settings.html` | Add Pennyfarthing section with theme dropdown |
| `src/public/js/settings-ui.js` | Add load/extract for pennyfarthing.theme, populate dropdown |
| `src/main.ts` | Add IPC handler to list available themes, write persona-config on theme change |

---

## Implementation Details

### 1. settings.ts Changes

```typescript
// New interface
interface PennyfarthingSettings {
  theme: string;
}

// Add to CyclistSettings
interface CyclistSettings {
  // ... existing
  pennyfarthing: PennyfarthingSettings;
}

// Add to DEFAULT_SETTINGS
const DEFAULT_SETTINGS: CyclistSettings = {
  // ... existing
  pennyfarthing: {
    theme: 'alice-in-wonderland'
  }
};

// Update mergeSettings to handle new section
// Update validateSettings to check pennyfarthing.theme is string
```

### 2. settings.html Changes

Add new section after notifications:

```html
<section class="settings-section" data-section="pennyfarthing">
  <h2>Pennyfarthing</h2>
  <div class="setting-item">
    <label for="theme">Agent Theme</label>
    <select id="theme" name="theme">
      <!-- Populated dynamically -->
    </select>
    <p class="setting-description">
      Character theme for agent personas (requires agent restart)
    </p>
  </div>
</section>
```

### 3. settings-ui.js Changes

```javascript
// Load themes into dropdown on init
async function loadThemeOptions() {
  const themes = await window.electronAPI.settings.getAvailableThemes();
  const select = document.getElementById('theme');
  themes.forEach(theme => {
    const option = document.createElement('option');
    option.value = theme;
    option.textContent = formatThemeName(theme); // "alice-in-wonderland" → "Alice In Wonderland"
    select.appendChild(option);
  });
}

// In loadFormValues:
document.getElementById('theme').value = settings.pennyfarthing?.theme || 'alice-in-wonderland';

// In getFormValues:
pennyfarthing: {
  theme: document.getElementById('theme').value
}
```

### 4. main.ts Changes

```typescript
// New IPC handler to list themes
ipcMain.handle('settings:getAvailableThemes', async () => {
  const themesDir = path.join(projectRoot, 'pennyfarthing-dist/personas/themes');
  const files = await fs.readdir(themesDir);
  return files
    .filter(f => f.endsWith('.yaml'))
    .map(f => f.replace('.yaml', ''))
    .sort();
});

// In saveUserSettings handler, also write persona-config
if (settings.pennyfarthing?.theme) {
  const personaConfigPath = path.join(projectRoot, '.claude/persona-config.local.yaml');
  await fs.writeFile(personaConfigPath, `theme: "${settings.pennyfarthing.theme}"\n`);
}
```

### 5. preload.ts Changes

```typescript
// Add to settings API
getAvailableThemes: () => ipcRenderer.invoke('settings:getAvailableThemes'),
```

---

## Acceptance Criteria

- [ ] **AC1:** Settings panel shows "Pennyfarthing" section
- [ ] **AC2:** Theme dropdown lists all available themes (101)
- [ ] **AC3:** Current theme is pre-selected in dropdown
- [ ] **AC4:** Changing theme saves to `~/.cyclist/settings.yaml`
- [ ] **AC5:** Changing theme also updates `.claude/persona-config.local.yaml`
- [ ] **AC6:** Theme names display formatted (kebab-case → Title Case)

---

## Testing Strategy

### Unit Tests
- `settings.ts`: Verify pennyfarthing section merges correctly
- `settings.ts`: Validate theme is string
- Default theme is alice-in-wonderland

### Integration Tests
- getAvailableThemes returns sorted list of theme names
- Theme change writes to both settings files
- Settings load with pennyfarthing.theme populated

### Manual Testing
- [ ] Open settings, see Pennyfarthing section
- [ ] Dropdown shows all themes sorted alphabetically
- [ ] Change theme, save, verify persona-config.local.yaml updated
- [ ] Restart Cyclist, verify theme persists
- [ ] Activate agent, verify new theme loads

---

## Dependencies

No new dependencies. Uses existing:
- `yaml` for parsing
- `fs` for file operations
- Existing IPC patterns from 24-1

---

## Notes for Dev

This is a **2-point trivial story** following established patterns from 24-1:

1. Add interface + defaults + merge + validate in `settings.ts`
2. Add HTML section with dropdown in `settings.html`
3. Add load/extract + theme list population in `settings-ui.js`
4. Add IPC handler for theme list + dual-write on save in `main.ts`
5. Expose new IPC in `preload.ts`

The dual-write to persona-config.local.yaml is important for Pennyfarthing compatibility - agents read that file, not Cyclist's settings.yaml.

---

*"Change places! Change themes!" — The Mad Hatter*
