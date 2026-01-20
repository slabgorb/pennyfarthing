# MSSCI-11715: Cyclist UI/UX Improvements - Technical Context

## 1. Architecture Overview

### Main Entry Points

**Electron Main Process** (`src/main.ts`)
- Initializes Express server on random available port
- Sets up IPC channels for data and command communication
- Manages window lifecycle and hot reload
- Key constants: `IPC_DATA_CHANNELS`, `IPC_CLAUDE_CHANNELS`, `IPC_SETTINGS_CHANNELS`

**Express Server** (`src/server.ts`)
- Serves static files from `public/` directory
- Mounts API routers (`/api/*`) for story, git, settings, persona, etc.
- Sets up WebSocket for token stats broadcast
- Serves portraits from Pennyfarthing package (`/portraits`)

**Preload Script** (`src/preload.ts`)
- Exposes typed APIs via `contextBridge` as `window.electronAPI`
- Provides: stats, story, git, persona, claude, settings, fileBrowser, command, diff APIs
- Security: Uses context isolation; no direct Node access to renderer

**Renderer Entry** (`public/index.html`)
- Tab bar at top (horizontal navigation)
- Content area with resizable panels (file, diff, tool)
- Sidebar with story/stats/persona sections
- Main message view + editor area

### IPC Communication Patterns

All data flows through these channels (from `main.ts`):

```
Data Channels (request/response + subscriptions):
- stats:get/update - Token/model info
- story:get/update - Story phase, workflow, criteria
- git:get/update - Branch, status
- persona:get/update - Character, theme, OCEAN scores
- context:get/update - Context usage percentage
- usageStats:get/update - 5hr/weekly usage limits
- toolStats:get/update - Tool execution counts
- todos:get/update - Task checklist items

Claude Channels (direct send/message):
- claude:send - Send prompt to Claude
- claude:message - Stream message chunks back
- claude:complete - Query finished
- claude:error - Error occurred
- claude:setMode/getMode - Permission mode toggle

Settings Channels:
- settings:getVerboseMode/setVerboseMode
- settings:get/save - Full settings object
- settings:getThemeMetadata - Available themes
```

### Module Loading Order

1. `styles.css` - CSS custom properties set theme colors (dark/light)
2. `theme.js` - Loads saved theme from localStorage, applies via CSS variables
3. `index.html` loads scripts in order:
   - `controls.js` - Permission mode + clear session
   - `stats-strip.js` - Model + context meter
   - `story.js` - Story phase + workflow
   - `persona.js` - Character display + OCEAN
   - `portrait.js` - Portrait loading with fallback chain
   - `editor.js` - TipTap rich text editor
   - `panel-manager.js` - Coordinates panels (file, diff, tool)
   - Various component modules

---

## 2. Story-Specific Technical Details

### 35-2: Current Directory in Status Bar

**Where is status bar?**
- `/public/styles.css` - `.stats-strip` class (top of editor area)
- `/public/js/stats-strip.js` - Renders: model badge, context meter, usage limits
- `/public/index.html` - `<div id="stats-strip">` markup

**What stats are shown?**
- Model name (e.g., "claude-opus-4.5")
- Context meter: percentage fill + level (safe/warning/danger/critical)
- Usage limits: 5-hour block % + weekly %
- Compact button (hidden until 50% context threshold)

**Implementation pattern:**
```javascript
// stats-strip.js
function updateContextMeter(percent, tokens) {
  const fill = document.querySelector('#stats-strip .context-mini-fill');
  fill.style.width = `${percent}%`;  // Visual fill
  updateContextLevel(contextMini, percent);  // Color class
}
```

**For current directory:**
- Needs new DOM element in stats-strip (or use file-panel header)
- Call `getProjectDirectory()` from main process via IPC or API
- Update on `story:update` (when working in new project)

---

### 35-3: Workflow Phase Visualization

**How does story.js get workflow/phase info?**

File: `/public/js/story.js`
```javascript
// Line 150-178: updateWorkflowProgress()
function updateWorkflowProgress(workflow) {
  // workflow = [ { agent: 'sm', status: 'done' }, ... ]
  for (const step of workflow) {
    const stepEl = workflowEl.querySelector(`[data-agent="${step.agent}"]`);
    // Set icon: checkmark (done), bullet (current), circle (pending)
    // Update class: status-done/current/pending
  }
}
```

**IPC call flow:**
1. `story.js` calls `window.electronAPI.story.get()` (line 306)
2. Main process invokes `/api/story` endpoint
3. `story.ts` calls `getStoryInfo(projectDir)`
4. Reads `.session/{story-id}-session.md`, parses workflow array
5. Returns with workflow steps in proper order

**What IPC calls exist?**
- `story:get` - Fetch current story (once on init)
- `story:update` - Push from main when story file changes (polling every 10s)
- No direct story modifications from renderer (read-only)

**Workflow data structure:**
```typescript
// From story-parser.ts
interface WorkflowStep {
  agent: 'sm' | 'tea' | 'dev' | 'reviewer';
  status: 'done' | 'current' | 'pending';
}

interface StoryInfo {
  id: string;
  title: string;
  phase: 'RED' | 'GREEN' | 'REFACTOR' | ...;
  workflow: WorkflowStep[];
  criteria: CriteriaItem[];
  sprint: { completed: number; total: number };
}
```

---

### 35-4: Three-Way Mode Switch

**Where is cyclePermissionMode() in controls.js?**

File: `/public/js/controls.js` (lines 55-80)
```javascript
const MODE_CYCLE = ['default', 'plan', 'acceptEdits'];

async function cyclePermissionMode(event) {
  // 1. Find current mode
  const currentIndex = MODE_CYCLE.indexOf(currentMode);

  // 2. Cycle to next
  const newMode = MODE_CYCLE[(currentIndex + 1) % MODE_CYCLE.length];

  // 3. Send via IPC
  await window.electronAPI.claude.setMode(newMode);

  // 4. Update display
  updateModeButtonDisplay();  // Changes button label + CSS class
}
```

**How does mode state flow?**

**IPC/Storage:**
1. Renderer calls `electronAPI.claude.setMode(mode)`
2. Main process via IPC invokes ClaudeService
3. ClaudeService stores in memory (no persistence)
4. Next query uses that mode for permission gating
5. Renderer can read current mode via `electronAPI.claude.getMode()`

**Display:**
- Button element: `[data-control="plan-mode"]`
- Text cycles: "MANUAL" -> "PLAN" -> "ACCEPT" -> "MANUAL"
- CSS classes: `mode-plan` (yellow), `mode-accept` (green)
- Initialized on page load (line 186-193)

**No localStorage:** Mode resets when Cyclist restarts (intentional - prevents accidental dangerous mode)

---

### 35-5: Collapsible Portrait Panel

**Portrait panel structure in portrait.js:**

File: `/public/js/portrait.js`
```javascript
// DOM structure
const portraitContainer = document.getElementById('portrait');
const portraitImg = portraitContainer?.querySelector('img');
const portraitPlaceholder = portraitContainer?.querySelector('.portrait-placeholder');

// Size constants
const PORTRAIT_SIZES = {
  small: 'small',       // 64x64
  medium: 'medium',     // 128x128 (sidebar)
  large: 'large',       // 256x256 (modals)
  original: 'original'  // 512x512
};
```

**HTML location:** `/public/index.html` (in sidebar)
```html
<div id="portrait" class="portrait-container">
  <img alt="Portrait" />
  <div class="portrait-placeholder">No portrait</div>
</div>
```

**How is panel sizing managed?**

Resizable panels use:
- `panel-manager.js` - Coordinates file/diff/tool panels
- Each panel has `width` saved to localStorage
- Drag handle: `resize-handle` element
- Mouse events: `mousedown` -> `mousemove` -> `mouseup`

**For portrait (collapsible section):**
- Stored in `/public/index.html` as fixed sidebar section
- **Not** a managed panel (fixed, not resizable)
- Can be collapsed via click on header (toggle class `collapsed`)
- State saved to localStorage key: `cyclist-ac-collapsed` (story 27-1)

**Panel resizing pattern (from diff-panel.js):**
```javascript
const MIN_WIDTH = 150;
const DEFAULT_WIDTH = 350;
const STORAGE_KEY = 'cyclist-diff-panel';

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  return JSON.parse(saved) || { width: DEFAULT_WIDTH, collapsed: true };
}

function setWidth(width) {
  const clampedWidth = Math.max(MIN_WIDTH, Math.min(width, window.innerWidth * 0.5));
  panel.style.width = `${clampedWidth}px`;
  saveState({ width: clampedWidth });
}
```

---

### 35-6: Font Face Selector

**Where are fonts defined in CSS?**

File: `/public/styles.css` (line 27-28)
```css
html, body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
}
```

**No custom fonts currently defined.** Uses system fonts:
- macOS: -apple-system, SF Pro
- Windows: Segoe UI
- Linux: system-ui fallback

**xterm.js font configuration:**

File: `/public/js/editor.js` (uses TipTap, not xterm)

**Pattern for adding fonts:**
```css
/* In styles.css */
@font-face {
  font-family: 'Fira Code';
  src: url('/fonts/FiraCode-Regular.woff2') format('woff2');
}

:root {
  --editor-font: 'Fira Code', monospace;
}

.editor { font-family: var(--editor-font); }
```

---

### 35-7: Custom Styling Themes

**Current theme.js implementation:**

File: `/public/js/theme.js`
```javascript
const themes = {
  dark: {
    bgPrimary: '#1a1a2e',
    bgSecondary: '#16213e',
    textPrimary: '#e4e4e7',
    accent: '#4f46e5',
    // ... 9 more properties
  },
  light: { /* ... */ }
};

function applyTheme(themeName) {
  const theme = themes[themeName];
  const root = document.documentElement;

  // Update CSS custom properties
  Object.entries(theme).forEach(([key, value]) => {
    root.style.setProperty(`--${toKebabCase(key)}`, value);
  });

  // Dispatch event for other modules
  window.dispatchEvent(new CustomEvent('themechange', {
    detail: { theme: themeName }
  }));
}
```

**CSS custom properties used:**

File: `/public/styles.css` (lines 9-24)
```css
:root {
  --bg-primary: #1a1a2e;
  --bg-secondary: #16213e;
  --bg-terminal: #0f0f1a;
  --text-primary: #e4e4e7;
  --text-secondary: #a1a1aa;
  --accent: #4f46e5;
  --border: #27272a;
  --status-ready: #22c55e;
  --status-working: #f59e0b;
  --status-error: #ef4444;
  --sidebar-width: 300px;
  --panel-min-width: 150px;
  --panel-default-width: 280px;
}
```

**Terminal themes for xterm.js:**
```javascript
// theme.js lines 36-84
const terminalThemes = {
  dark: {
    background: '#0f0f1a',
    foreground: '#e4e4e7',
    cursor: '#e4e4e7',
    // ... ANSI colors (black, red, green, etc.)
  },
  light: { /* ... */ }
};

function getTerminalTheme(themeName) {
  return terminalThemes[themeName || currentTheme];
}
```

---

### 35-8: Fix Theme Switcher

**ThemePicker.js issues:**

File: `/public/js/components/ThemePicker.js`

Current implementation (35-1 added this):
```javascript
let currentTheme = null;
let recentThemes = [];
let themeMetadata = [];

async function init() {
  const picker = document.getElementById('theme-picker');
  await loadThemeMetadata();
  // Set up event handlers...
}

async function loadThemeMetadata() {
  try {
    // Try IPC first
    if (window.electronAPI?.settings?.getThemeMetadata) {
      themeMetadata = await window.electronAPI.settings.getThemeMetadata();
    } else {
      // HTTP fallback
      const response = await fetch('/api/settings/themes');
      themeMetadata = await response.json();
    }
  } catch (err) {
    console.error('[ThemePicker] Failed:', err);
  }
}
```

**Known issues to fix:**
1. Recent themes not persisted (just array in memory)
2. Theme selection doesn't trigger visual update
3. No search/filter capability (unlike ThemeBrowser.js)
4. Missing null checks on picker element

**persona.js integration:**

File: `/public/js/persona.js` (lines 150-160+)
```javascript
// ThemePicker integration point
import * as ThemePicker from './components/ThemePicker.js';

// In persona section click handler:
persona.addEventListener('click', () => {
  ThemePicker.show();  // Open theme picker
});
```

**Pattern for theme switching:**
```javascript
// 1. User selects theme in picker
// 2. Picker calls API: PATCH /api/settings
// 3. Server updates ~/.cyclist/settings.yaml
// 4. Server dispatches 'persona:update' IPC
// 5. persona.js updatePersona() called
// 6. Loads new portrait with theme
// 7. Dispatch 'themechange' event
// 8. portrait.js reloadPortraitWithTheme(newTheme)
```

---

### 35-9: Settings Panel Fixes

**settings-ui.js structure:**

File: `/public/js/settings-ui.js`

Key functions:
```javascript
export function loadFormValues(settings) {
  // Load settings into form fields
  // Handles: workflow (radio), display (checkboxes), notifications, theme
}

export function getFormValues() {
  // Extract values from form as object
  return {
    workflow: { handoff_mode: 'auto'|'manual' },
    display: { show_flow, show_ocean, sidebar_width },
    notifications: { phase_change, sound },
    pennyfarthing: { theme, favorites }
  };
}

async function handleSubmit(event) {
  const settings = getFormValues();
  await window.electronAPI.settings.save(settings);
  window.close();  // Close settings window
}
```

**IPC calls for settings:**

From `preload.ts` + `main.ts`:
```typescript
// Preload exposes:
window.electronAPI.settings = {
  get: () => Promise<CyclistSettings>,
  save: (settings) => Promise<void>,
  getThemeMetadata: () => Promise<Theme[]>,
  onChanged: (callback) => void
}
```

**Settings storage:**
- `~/.cyclist/settings.yaml` - User's local overrides
- Read by `settings.ts` constructor
- Merged with defaults
- Persisted via `settings.ts:saveUserSettings()`

---

### 35-10: Line Numbers in Diffs

**Diff panel implementation:**

File: `/public/js/diff-panel.js`
- Manages collapse/expand state
- Resizes width
- Stores state to localStorage

File: `/public/js/components/DiffViewer.js`
- Receives diffs from Edit/Write tool messages
- Computes unified diff
- Renders diff with line numbers

**How diffs are rendered:**

```javascript
// DiffViewer.js lines 202-233
export function computeDiff(oldContent, newContent) {
  const oldLines = oldContent ? oldContent.split('\n') : [];
  const newLines = newContent ? newContent.split('\n') : [];

  // Return: [ { type: 'added'|'removed', line: string, lineNumber: 1 }, ... ]
}

// Line 282-305: Create DOM element
export function createDiffLineElement(line) {
  const el = document.createElement('div');
  el.className = `diff-line ${line.type}`;  // diff-line added/removed

  const prefix = document.createElement('span');
  prefix.className = 'diff-line-prefix';
  prefix.textContent = line.type === 'added' ? '+' : '-';

  const content = document.createElement('span');
  content.className = 'diff-line-content';
  content.textContent = line.line;

  el.appendChild(prefix);
  el.appendChild(content);
  return el;
}
```

**For line numbers:**
- Diff data includes `lineNumber` field
- Currently rendered as just the prefix (+/-)
- To add numbers: insert element with `lineNumber` value
- CSS: align-right in monospace font

```html
<!-- Current -->
<div class="diff-line added">
  <span class="diff-line-prefix">+</span>
  <span class="diff-line-content">const x = 5;</span>
</div>

<!-- With line numbers -->
<div class="diff-line added">
  <span class="diff-line-number">42</span>
  <span class="diff-line-prefix">+</span>
  <span class="diff-line-content">const x = 5;</span>
</div>
```

---

### 35-11: Clickable File Paths

**Diff header rendering:**

File: `/public/js/components/DiffViewer.js`

File paths come from Edit/Write tool messages:
```javascript
export function extractDiffDataFromEdit(message) {
  return {
    id: message.tool_id,
    filePath: input.file_path,  // e.g., "src/foo.js"
    oldContent: input.old_string,
    newContent: input.new_string,
    toolType: 'Edit',
    timestamp: Date.now(),
  };
}
```

**shell.openPath availability:**

From `preload.ts` (lines 133-139):
```typescript
interface ElectronFileBrowserAPI {
  listDirectory: (path: string) => Promise<unknown>;
  openFile: (path: string) => Promise<void>;
  openInEditor: (path: string, lineNumber?: number) => Promise<boolean>;
  onFileOpened: (callback) => void;
}
```

**For clickable file paths in diffs:**
- Add click handler to file path in diff header
- Call `window.electronAPI.fileBrowser.openFile(filePath)`
- Or `openInEditor(filePath, lineNumber)` to jump to exact line

```javascript
// In diff rendering
const filePathEl = document.createElement('div');
filePathEl.className = 'diff-file-path';
filePathEl.textContent = diffData.filePath;

filePathEl.addEventListener('click', async () => {
  try {
    await window.electronAPI.fileBrowser.openInEditor(
      diffData.filePath,
      1  // Optional: line number
    );
  } catch (err) {
    console.error('Failed to open file:', err);
  }
});
```

---

## 3. Common Patterns

### How to Add New Settings

**1. Update data structure** (`settings.ts`):
```typescript
export type CyclistSettings = {
  workflow: { handoff_mode: 'auto' | 'manual' };
  display: { show_flow: boolean; sidebar_width: number };
  myNewSetting: { option1: string }; // Add here
};
```

**2. Add to settings UI** (`settings-ui.js`):
```javascript
export function loadFormValues(settings) {
  const myOption = form.querySelector('#my_new_option');
  if (myOption) {
    myOption.value = settings.myNewSetting?.option1 ?? 'default';
  }
}

export function getFormValues() {
  return {
    // ... other fields ...
    myNewSetting: {
      option1: form.querySelector('#my_new_option')?.value
    }
  };
}
```

**3. Add form fields** (`settings.html`):
```html
<label>My New Option</label>
<input type="text" id="my_new_option" />
```

**4. Test** - Create test file following pattern: `tests/{story}-{area}.test.ts`

### How to Add New UI Components

**Pattern from ThemePicker.js:**

```javascript
/**
 * MyComponent - Brief description
 */

// State
let isVisible = false;
let componentState = {};

// Public API
export function init() {
  setupDOM();
  setupEventListeners();
}

export function show() {
  element.style.display = 'block';
  isVisible = true;
}

export function hide() {
  element.style.display = 'none';
  isVisible = false;
}

// Private helpers
function setupDOM() {
  // Create or reference DOM elements
}

function setupEventListeners() {
  // Attach handlers
}

// Auto-initialize
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
```

**For modal/popup components:**
- Use dialog/overlay pattern
- Listen for Escape key: `e.key === 'Escape' && hide()`
- Listen for outside click: `if (!element.contains(e.target)) hide()`
- Disable body scroll when visible (optional)

### Event Patterns (themechange, etc.)

**Custom events dispatched by Cyclist:**

```javascript
// theme.js - When user changes theme
window.dispatchEvent(new CustomEvent('themechange', {
  detail: { theme: themeName }
}));

// Listeners (portrait.js)
window.addEventListener('themechange', (e) => {
  const { theme } = e.detail;
  reloadPortraitWithTheme(theme);
});
```

**Pattern for module communication:**
1. Module A dispatches event: `window.dispatchEvent(new CustomEvent(...))`
2. Module B listens: `window.addEventListener(...)`
3. Prefer events over direct function calls (loose coupling)
4. Document custom events in module comments

**IPC events (from main process):**
```javascript
// In renderer module
window.electronAPI.story.onUpdate((_event, story) => {
  updateStory(story);  // Main process pushed update
});
```

---

## 4. Testing Patterns

### Where are tests?

Directory: `/packages/cyclist/tests/`

Files by story:
- `B-*.test.ts` - Benchmarked user stories
- `E*.test.ts` - Electron integration tests
- `*.test.ts` - Specific feature tests

Example test files relevant to Epic 35:
- `24-1-settings-panel.test.ts` - Settings form + theme browser
- `B-22-stats-strip.test.ts` - Stats display
- `B-13-story-details.test.ts` - Story/workflow rendering
- `B-10-mode-tracking.test.ts` - Mode toggle state

### Test Naming Conventions

```
{story}-{description}.test.ts

Examples:
- 24-1-settings-panel.test.ts (story 24-1)
- 22-3-bash-approval.test.ts (story 22-3)
- B-22-stats-strip.test.ts (benchmark story B-22)
```

### How to Run Tests

```bash
# From /packages/cyclist
npm test  # Run all tests (vitest)

npm test -- {story}.test.ts  # Run specific test
npm test -- --ui  # Interactive UI mode
npm test -- --coverage  # Coverage report
```

**Test framework:** Vitest (Node.js native test runner)

**Configuration:** `vitest.config.ts`

**Setup:** Most tests mock Electron API (`window.electronAPI`) and DOM

### Example Test Pattern

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('35-4: Mode Toggle', () => {
  beforeEach(() => {
    // Setup DOM
    document.body.innerHTML = `
      <button data-control="plan-mode">MANUAL</button>
    `;

    // Mock IPC
    window.electronAPI = {
      claude: {
        setMode: vi.fn().mockResolvedValue(undefined),
        getMode: vi.fn().mockResolvedValue('default')
      }
    };

    // Load module
    import('./controls.js');
  });

  it('should cycle mode on button click', async () => {
    const btn = document.querySelector('[data-control="plan-mode"]');
    btn.click();

    expect(window.electronAPI.claude.setMode).toHaveBeenCalledWith('plan');
    expect(btn.textContent).toBe('PLAN');
  });
});
```

---

## 5. File Organization Summary

```
packages/cyclist/
├── src/
│   ├── main.ts                 # Electron main process
│   ├── preload.ts              # IPC bridge (contextBridge API)
│   ├── server.ts               # Express setup + API mounting
│   ├── settings.ts             # Settings storage + parsing
│   ├── settings-store.ts       # In-memory settings cache
│   ├── story-parser.ts         # Parse .session file for workflow
│   ├── pennyfarthing.ts        # Persona/theme resolution
│   ├── api/
│   │   ├── story.ts            # GET story info
│   │   ├── settings.ts         # GET/PATCH settings + themes
│   │   ├── persona.ts          # GET persona + agents
│   │   ├── stats.ts            # Token counts
│   │   ├── git.ts              # Branch + status
│   │   └── ... (13 total)
│   └── public/
│       ├── index.html          # Main UI
│       ├── styles.css          # Global styles + CSS vars
│       ├── js/
│       │   ├── theme.js        # Dark/light theme + terminal theme
│       │   ├── controls.js     # Mode toggle + clear button
│       │   ├── stats-strip.js  # Model/context/usage display
│       │   ├── story.js        # Workflow visualization
│       │   ├── persona.js      # Character display
│       │   ├── portrait.js     # Portrait loading + fallback
│       │   ├── editor.js       # TipTap editor
│       │   ├── settings-ui.js  # Settings form + theme browser
│       │   ├── panel-manager.js# Coordinates panels
│       │   ├── diff-panel.js   # Collapsible diff panel
│       │   ├── components/
│       │   │   ├── ThemePicker.js
│       │   │   ├── ThemeBrowser.js
│       │   │   ├── DiffViewer.js
│       │   │   ├── ChangedFilesList.js
│       │   │   └── ... (10+ components)
│       │   └── editor/
│       │       ├── toolbar.js
│       │       ├── message-queue.js
│       │       └── ... (submodules)
│       └── css/
│           └── theme-browser.css
├── tests/
│   ├── 24-1-settings-panel.test.ts
│   ├── B-22-stats-strip.test.ts
│   ├── B-13-story-details.test.ts
│   └── ... (80+ test files)
└── vitest.config.ts
```

---

## 6. Key Technical Dependencies

- **Electron** - Desktop application framework
- **Express** - HTTP server for APIs
- **TypeScript** - Main process + API code
- **TipTap** - Rich text editor (tiptap.bundle.js, 655KB)
- **Vitest** - Test runner (Node.js native)
- **Vite** - Build tool (implicit through vitest)

---

## 7. Quick Reference: Key Files per Story

| Story | Primary Files |
|-------|---------------|
| 35-2 | `stats-strip.js`, `styles.css` |
| 35-3 | `story.js`, `story-parser.ts`, `api/story.ts` |
| 35-4 | `controls.js`, `preload.ts` (claude channels) |
| 35-5 | `portrait.js`, `persona.js`, `index.html` |
| 35-6 | `styles.css`, `settings-ui.js`, `editor.js` |
| 35-7 | `theme.js`, `styles.css`, `settings-ui.js` |
| 35-8 | `ThemePicker.js`, `persona.js`, `settings.ts` |
| 35-9 | `settings-ui.js`, `settings.ts`, `preload.ts` |
| 35-10 | `DiffViewer.js`, `diff-panel.js` |
| 35-11 | `DiffViewer.js`, `preload.ts` (fileBrowser) |
