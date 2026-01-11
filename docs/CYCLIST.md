# Cyclist - Visual Desktop Interface

Cyclist is a desktop application for running Claude Code with a visual terminal interface. It provides real-time agent personas, session statistics, story progress tracking, and a rich text editor - all wrapped in an Electron app.

## Overview

As of v6.0, Cyclist is integrated into the Pennyfarthing monorepo as `@pennyfarthing/cyclist`. It uses:

- **Electron** for the desktop application shell
- **Express** for serving the UI and handling API requests
- **node-pty** for pseudo-terminal emulation
- **xterm.js** for terminal rendering
- **TipTap** for rich text editing

## Quick Start

### Development Mode

```bash
# From the monorepo root
cd packages/cyclist
pnpm install
pnpm run dev
```

This launches Electron with hot reload enabled - changes to `dist/*` trigger automatic refresh.

### Single Run (No Hot Reload)

```bash
pnpm run dev:once
```

### Build Distributable App

```bash
pnpm run build:electron
```

Build artifacts are placed in `packages/cyclist/release/`:

| Platform | Output |
|----------|--------|
| macOS | `Cyclist-{version}.dmg`, `Cyclist-{version}-mac.zip` |
| Windows | `Cyclist Setup {version}.exe`, `Cyclist {version}.exe` (portable) |
| Linux | `Cyclist-{version}.AppImage`, `cyclist_{version}_amd64.deb` |

## Project Directory

Cyclist needs a project directory to operate on. Specify it via:

1. **CLI Argument** (recommended for scripts):
   ```bash
   electron . --project-dir=/path/to/project
   ```

2. **Folder Picker** (default when no argument):
   - Shows native folder picker on launch
   - If canceled, app quits gracefully

## Architecture

### Process Model

```
┌─────────────────────────────────────────────────────────────────┐
│                     Electron Main Process                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ PTY (Claude)│  │ OTLP Server │  │ Pennyfarthing Detection │  │
│  │ node-pty    │  │ Port 4318   │  │ Theme/Persona Loading   │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
│         │                │                      │                │
│         └────────────────┼──────────────────────┘                │
│                          │                                       │
│                    IPC Channels                                  │
│                          │                                       │
└──────────────────────────┼───────────────────────────────────────┘
                           │
┌──────────────────────────┼───────────────────────────────────────┐
│                    Preload Script                                │
│              (contextBridge - secure IPC)                        │
└──────────────────────────┼───────────────────────────────────────┘
                           │
┌──────────────────────────┼───────────────────────────────────────┐
│                    Renderer Process                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ MessageView │  │   Sidebar   │  │   Tab Panel             │  │
│  │ (terminal)  │  │  (persona,  │  │ (diffs, files, browser) │  │
│  │             │  │   stats)    │  │                         │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              TipTap Rich Text Editor                        ││
│  │         (prompt input with formatting toolbar)              ││
│  └─────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────┘
```

### Key Source Files

| File | Purpose |
|------|---------|
| `src/main.ts` | Electron main process, IPC handlers, PTY management |
| `src/preload.ts` | Secure IPC bridge via contextBridge |
| `src/pennyfarthing.ts` | Theme loading, persona detection, agent watching |
| `src/claude-service.ts` | Claude Code CLI wrapper (programmatic mode) |
| `src/otlp-receiver.ts` | OpenTelemetry metrics receiver (port 4318) |
| `src/parser.ts` | Parses Claude CLI output for stats |
| `src/story-parser.ts` | Extracts story info from session files |
| `src/tool-stats.ts` | Parses tool usage statistics |
| `src/paths.ts` | Project directory management |

### Frontend Modules

| File | Purpose |
|------|---------|
| `public/js/persona.js` | Persona section updates |
| `public/js/portrait.js` | Character portrait loading |
| `public/js/stats.js` | Session statistics display |
| `public/js/story.js` | Story progress and workflow |
| `public/js/todos.js` | Task visualizer |
| `public/js/editor.js` | TipTap editor initialization |
| `public/js/controls.js` | Permission mode controls |
| `public/js/theme.js` | Theme management |

## IPC Channels

All main↔renderer communication uses typed IPC channels:

### Data Channels

| Channel | Purpose |
|---------|---------|
| `stats:get` / `stats:update` | Session statistics |
| `persona:get` / `persona:update` | Agent persona data |
| `story:get` / `story:update` | Story progress |
| `git:get` / `git:update` | Git status |
| `toolStats:get` / `toolStats:update` | Tool usage stats |
| `tokenStats:get` / `tokenStats:update` | Token consumption |
| `todos:get` / `todos:update` | Todo list items |
| `context:update` | Context usage percentage |

### Claude SDK Channels

| Channel | Purpose |
|---------|---------|
| `claude:send` | Send prompt to Claude |
| `claude:message` | Receive message chunks |
| `claude:complete` | Conversation complete |
| `claude:error` | Error handling |
| `claude:setMode` / `claude:getMode` | Permission mode |
| `claude:abort` | Cancel current request |
| `claude:clear` | Clear session |

### Other Channels

| Channel | Purpose |
|---------|---------|
| `agent:launch` | Launch specific agent |
| `diff:update` | Diff viewer updates |
| `file-browser:list-directory` | File browser navigation |
| `file-browser:open-file` | Open file in editor |

## UI Components

### Sidebar Sections

#### 1. Persona Section
- Character portrait (woodcut-style, OCEAN-slugged filenames)
- Character name and role
- Theme name
- Character quote
- Activity lines (helper tasks, tool usage)

#### 2. Story Section
- Story ID and title
- Current phase indicator
- Workflow progress visualization (SM → TEA → Dev → Reviewer)
- Acceptance criteria checklist
- Sprint progress bar

#### 3. Git Section
- Current branch
- Clean/dirty status
- Ahead/behind remote

#### 4. Tasks Section (Collapsible)
- Live todo list from TodoWrite tool
- Progress indicator (completed/total)
- Status icons (pending, in_progress, completed)

### Main Content Area

- **MessageView** - Rendered Claude conversation
- **Tab Panel** - Workspace tools (diffs, files, browser)
- **Quick Actions** - Suggested prompt buttons
- **Editor** - Rich text input with toolbar
- **Stats Strip** - Compact stats in prompt bar

## Portrait System

Portraits are stored with OCEAN-slugged filenames for each character:

```
pennyfarthing-dist/personas/sprites/{theme}/
├── {ocean-slug-character1}.png
├── {ocean-slug-character2}.png
└── ...
```

The OCEAN slug format encodes personality traits:
- First letter of each trait (O, C, E, A, N)
- H/M/L for High/Medium/Low
- Example: `OHCHEHAHNH-leo-mcgarry.png`

Portrait resolution uses `@pennyfarthing/shared`:

```typescript
import { resolvePortraitPath } from '@pennyfarthing/shared';

const portraitPath = resolvePortraitPath(theme, character, oceanSlug);
```

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `CYCLIST_COMMAND` | Override Claude CLI path |
| `CYCLIST_SESSION_ID` | Session ID for persona lookup |
| `CYCLIST_PROJECT_DIR` | Project directory path |
| `CYCLIST_THEME` | Active theme name |
| `CYCLIST_ACTIVE` | Set to "1" when running in Cyclist |
| `PORT` | Server port (default: 1898) |

## Pennyfarthing Integration

### Theme Detection

Cyclist reads theme configuration from the project:

```typescript
import { loadThemeConfig, loadThemeYaml } from './pennyfarthing.js';

const config = loadThemeConfig('/path/to/project');
// { theme: 'west-wing' }

const agents = loadThemeYaml(themePath);
// { sm: {...}, dev: {...}, tea: {...}, ... }
```

### Agent Watching

Cyclist monitors `.session/agents/` for agent changes:

```typescript
import { watchAgentChanges } from './pennyfarthing.js';

const cleanup = watchAgentChanges(
  projectDir,
  sessionId,
  (agentRole) => console.log(`Agent changed to: ${agentRole}`)
);
```

### Statusbar Suppression

When `CYCLIST_ACTIVE=1` is set, Pennyfarthing's statusline hook outputs nothing - Cyclist's sidebar displays the same information.

## OpenTelemetry Integration

Cyclist includes an OTLP receiver on port 4318 that captures:

- Token usage (input/output)
- API request timings
- Tool call events
- Context percentage

Configure Claude Code to send telemetry:

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl+Enter` | Send prompt |
| `Escape` | Stop Claude |
| `Cmd/Ctrl+B` | Bold |
| `Cmd/Ctrl+I` | Italic |
| `Cmd/Ctrl+Shift+C` | Code block |

## Menu Structure

### Agents Menu

| Tactical | Strategic |
|----------|-----------|
| SM (Scrum Master) | PM (Product Manager) |
| TEA (Test Engineer) | Architect |
| Dev (Developer) | DevOps |
| Reviewer | Tech Writer |
|  | UX Designer |

### Workflows Menu

- New Work (`/new-work`)
- Continue Session (`/continue-session`)
- Sprint Context (`/sprint-context`)
- Work (`/work`)

## Troubleshooting

### Persona not loading

1. Check `.session/agents/` directory exists
2. Verify agent files are being written by `agent-session.sh`
3. Check theme YAML exists at the expected path

### Portrait not showing

1. Verify portrait exists in `pennyfarthing-dist/personas/sprites/{theme}/`
2. Check OCEAN-slug filename matches character
3. Confirm `@pennyfarthing/shared` resolver is working

### High memory usage

The Electron process includes Chromium overhead. For lighter usage:
- Use standalone mode: `pnpm run dev:server` (browser-based) - see [Web Mode Guide](../packages/cyclist/docs/WEB-MODE.md)
- Close unused tabs in the tab panel

### Hot reload not working

1. Ensure you're running `pnpm run dev` (not `dev:once`)
2. Check `electron-reload` is installed
3. Verify `dist/` is being updated by TypeScript compiler

## Testing

Tests use Vitest with happy-dom for DOM tests:

```bash
# Run all tests
pnpm test

# Run specific test file
pnpm test -- tests/parser.test.ts

# Watch mode
pnpm test -- --watch
```

## See Also

- [User Guide](USER-GUIDE.md) - Complete Pennyfarthing documentation
- [Personas](PERSONAS.md) - Theme customization and OCEAN profiles
- [Architecture](ARCHITECTURE.md) - System design principles
- [Web Mode Guide](../packages/cyclist/docs/WEB-MODE.md) - Browser-based usage and feature parity
- [Quick Action Setup](../packages/cyclist/docs/QUICK-ACTION-SETUP.md) - Finder integration
