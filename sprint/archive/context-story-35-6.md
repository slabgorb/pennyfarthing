# Story 35-6: Font Face Selector - Technical Context

## Story Overview

| Field | Value |
|-------|-------|
| **Story ID** | 35-6 |
| **Epic** | 35 - Cyclist UI/UX Improvements |
| **Points** | 2 |
| **Priority** | P2 |
| **Repos** | cyclist |
| **Jira** | MSSCI-11721 |

**Goal:** Let users choose terminal and UI font faces. Currently fonts are hardcoded in CSS with no customization.

## Current State

### Font Hardcoding
- **UI fonts** hardcoded in `settings.css:13`: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif`
- **Terminal fonts** controlled by xterm.js but not exposed to users
- No CSS variables for fonts yet

### Settings Infrastructure
The settings system has a well-established pattern:
- **`settings.ts`** - Node.js module with YAML persistence, file watching, merging
- **`settings.html`** - HTML form with Display and Notifications sections
- **`settings-ui.js`** - Renderer process logic, IPC communication
- **`settings.css`** - Dark VS Code-inspired styling

**Current DisplaySettings interface (`settings.ts:40-44`):**
```typescript
interface DisplaySettings {
  show_flow: boolean;
  show_ocean: boolean;
  sidebar_width: number;
}
```

Font settings need to be added here.

## Technical Approach

### 1. Extend Settings Schema
Add to `DisplaySettings` in `settings.ts`:
```typescript
interface DisplaySettings {
  show_flow: boolean;
  show_ocean: boolean;
  sidebar_width: number;
  terminal_font: string;  // NEW
  ui_font: string;        // NEW
}
```

Add defaults to `DEFAULT_SETTINGS`:
```typescript
display: {
  show_flow: true,
  show_ocean: true,
  sidebar_width: 280,
  terminal_font: 'Monaco',      // NEW - good macOS default
  ui_font: 'system-ui',         // NEW - use system fonts
}
```

### 2. Font Enumeration
Use Electron's `app.systemPreferences.getMediaAccessStatus` is wrong - need to enumerate system fonts.

**Options:**
1. **Hardcoded font list** - List of common monospace fonts known to exist
2. **CSS `@font-face` enumeration** - Not practical
3. **Electron `systemPreferences`** - No direct font API

**Recommendation:** Use a curated list of common monospace fonts for terminal, and common UI fonts for UI. Check availability via FontFaceSet API in renderer process.

**Curated terminal fonts (monospace):**
- Monaco, Menlo, Consolas, 'SF Mono', 'Source Code Pro', 'Fira Code', 'JetBrains Mono', 'IBM Plex Mono', 'Cascadia Code', 'Courier New'

**Curated UI fonts:**
- system-ui, -apple-system, 'Segoe UI', Roboto, Ubuntu, 'Helvetica Neue', Arial

### 3. Settings UI Changes

**`settings.html`** - Add font section:
```html
<section class="settings-section" data-section="fonts">
  <h3>Fonts</h3>
  <div class="setting-item">
    <label class="setting-label">Terminal Font</label>
    <select id="terminal_font" class="setting-select">
      <!-- Options populated by JS -->
    </select>
    <span class="font-preview" id="terminal-preview">AaBbCc 123</span>
  </div>
  <div class="setting-item">
    <label class="setting-label">UI Font</label>
    <select id="ui_font" class="setting-select">
      <!-- Options populated by JS -->
    </select>
    <span class="font-preview" id="ui-preview">AaBbCc 123</span>
  </div>
</section>
```

**`settings-ui.js`** - Add font handling:
- Populate dropdowns with curated font lists
- Update preview text when selection changes
- Extract font values in `getFormValues()`
- Apply fonts in `loadFormValues()`

### 4. Apply Fonts

**CSS Variables** - Add to `:root` in `main.css` or similar:
```css
:root {
  --font-terminal: var(--user-terminal-font, Monaco);
  --font-ui: var(--user-ui-font, system-ui);
}
```

**Terminal (xterm.js)** - Apply font via xterm options:
```javascript
const term = new Terminal({
  fontFamily: settings.display.terminal_font,
  // ...
});
```

**UI** - Apply via document style:
```javascript
document.documentElement.style.setProperty('--user-ui-font', settings.display.ui_font);
```

### 5. Font Availability Check

Use FontFaceSet API to verify fonts exist:
```javascript
async function checkFontAvailable(fontName) {
  await document.fonts.ready;
  return document.fonts.check(`12px "${fontName}"`);
}
```

Filter dropdown to only show available fonts.

## Files to Modify

| File | Changes |
|------|---------|
| `packages/cyclist/src/settings.ts` | Add `terminal_font`, `ui_font` to DisplaySettings |
| `packages/cyclist/src/public/settings.html` | Add Fonts section with two dropdowns + previews |
| `packages/cyclist/src/public/js/settings-ui.js` | Font list population, preview updates, form handling |
| `packages/cyclist/src/public/settings.css` | Styles for font dropdowns and preview text |
| `packages/cyclist/src/public/css/main.css` | CSS variables for fonts |
| Terminal component (TBD) | Apply terminal_font setting to xterm.js |

## Acceptance Criteria

- [ ] **AC1:** Font selector in settings panel
- [ ] **AC2:** Separate terminal and UI font options
- [ ] **AC3:** Dropdown with available monospace fonts
- [ ] **AC4:** Font preview in settings before applying
- [ ] **AC5:** Font preference saved and restored on startup
- [ ] **AC6:** Terminal (xterm.js) respects font setting

## Testing Strategy

1. **Unit tests** - Settings type validation, font list constants
2. **Integration tests** - Settings save/load with new font fields
3. **Manual testing** - Font preview, application, persistence

## Dependencies & Risks

- **No blockers** - Independent story
- **Risk:** Font availability varies by system; need graceful fallbacks
- **Risk:** xterm.js font application may require resize event after change

## Scale Routing

**2 points** = Trivial workflow (SM → Dev directly, skip TEA)

This is a UI feature addition with clear scope and existing patterns to follow.
