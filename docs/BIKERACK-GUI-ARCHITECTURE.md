# BikeRack GUI Architecture

BikeRack GUI is the browser-based visual interface for Claude Code with Pennyfarthing integration. It provides real-time agent personas, session statistics, story progress tracking, and a rich text editor.

## Overview

As of v9.0, BikeRack GUI uses a **React-based UI** with **Dockview panels** (see ADR-0019). It uses:

- **Python FastAPI** (uvicorn) for serving the UI and handling API requests
- **React 19** for the UI layer (`src/public/components/`)
- **Dockview** for panel management (floating, splitting, dragging)
- **WebSocket** for real-time communication
- **TipTap** for rich text editing

## Quick Start

### Development Mode

```bash
# From the monorepo root
cd packages/cyclist
pnpm install
pnpm run dev
```

This launches the dev server with hot reload enabled.

### Single Run (No Hot Reload)

```bash
pnpm run dev:once
```

## Architecture## Architecture

### Internal Codenames

BikeRack GUI uses bicycle-themed internal codenames for major subsystems:

| Codename | Component | Description |
|----------|-----------|-------------|
| **WheelHub** | `pennyfarthing-dist/src/pf/wheelhub/app.py` | Central coordination server (Python FastAPI) - the hub where all communication converges (API endpoints, WebSocket channels, OTLP receiver, hook approval handling) |
| **TirePump** | Context clearing system | Reinflates the session when context runs low - clears Claude session, resets stats, reloads current agent while preserving workflow state |
| **JobFair** | Character benchmarking | Runs every character in a theme against benchmarks to discover which personas excel at each role, producing talent matrices for theme optimization |

See `packages/cyclist/README.md` for detailed implementation notes.

### Multi-Instance Support

BikeRack GUI supports running multiple instances for different projects simultaneously:

- **File > New Window** (Cmd+Shift+N) - Opens folder picker for a new project
- Each instance runs on a separate port with isolated state
- Port files (`.bikerack-port`) prevent cross-instance conflicts

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
| `src/bell-mode.ts` | Bell mode state and queue management |
| `src/ipc-channels.ts` | Typed IPC channel definitions |
| `src/websocket.ts` | WebSocket server and channel management |
| `src/api/hook-request.ts` | WheelHub hook approval flow |
| `src/api/git.ts` | Git status including multi-repo support |

### React Components (v9.0+)

The UI is now React-based. Key components in `src/public/components/`:

| Component | Purpose |
|-----------|---------|
| `DockviewWorkspace.tsx` | Main layout with dockview-react panels |
| `MessageView.tsx` | Conversation display with streaming content |
| `MessageList.tsx` | Scrollable message history |
| `Message.tsx` | Individual message rendering |
| `ToolCallBlock.tsx` | Tool use display with intent summaries |
| `ToolStack.tsx` | Grouped consecutive tool calls |
| `ToolStatus.tsx` | Pending/success/error indicators |
| `Editor.tsx` | TipTap rich text input |
| `ControlBar.tsx` | Mode toggles and controls |
| `QuickActions.tsx` | PF marker detection and buttons |
| `StatsStrip.tsx` | Compact stats bar |
| `PersonaHeader.tsx` | Agent persona in message header |
| `DiffViewer.tsx` | Side-by-side diff display |
| `FileTree.tsx` | Project file browser |
| `CommandPalette.tsx` | Fuzzy command search |
| `StreamingContent.tsx` | Real-time message streaming |
| `SubagentSpan.tsx` | Background task visualization |
| `ErrorBoundary.tsx` | React error boundary wrapper |

### Panel Components

Panels in `src/public/components/panels/`:

| Panel | Purpose |
|-------|---------|
| `MessagePanel.tsx` | Sacred center - conversation (locked) |
| `ChangedPanel.tsx` | Changed files list |
| `DiffsPanel.tsx` | File diff viewer |
| `SprintPanel.tsx` | Sprint/story tracking |
| `ProgressPanel.tsx` | Workflow phase progress |
| `BikeLanePanel.tsx` | BikeLane stepped workflow UI |
| `AcceptanceCriteriaPanel.tsx` | Story acceptance criteria checklist |
| `SettingsPanel.tsx` | Configuration UI |
| `DebugPanel.tsx` | OTEL spans and debugging |
| `GitPanel.tsx` | Git status and operations |
| `BackgroundPanel.tsx` | Background task tracker |

### Legacy JS Modules (being migrated)

Some vanilla JS remains in `public/js/` during React migration:

## IPC Channels

All main↔renderer communication uses typed IPC channels:

### Data Channels

| Channel | Purpose |
|---------|---------|
| `stats:get` / `stats:update` | Session statistics |
| `persona:get` / `persona:update` | Agent persona data |
| `story:get` / `story:update` | Story progress |
| `git:get` / `git:update` | Git status (single repo) |
| `git:all` | Multi-repo git status |
| `toolStats:get` / `toolStats:update` | Tool usage stats |
| `tokenStats:get` / `tokenStats:update` | Token consumption |
| `todos:get` / `todos:update` | Todo list items |
| `context:update` | Context usage percentage |
| `project:info` | Project directory info |
| `usage:stats` | Usage statistics |

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
| `context:clear` / `context:clearAndLoad` | TirePump context clearing |
| `audit-log:*` | Audit log entries, export, stats |
| `background-task:*` | Background task tracking |
| `skill:*` | Skill tracking (start, complete, error) |

## WebSocket Channels

All real-time communication uses WebSocket channels:

| Channel | Purpose |
|---------|---------|
| `/ws/stats` | Stats broadcast (model, context, limits) |
| `/ws/persona` | Agent persona/theme updates |
| `/ws/token-stats` | Real-time token telemetry |
| `/ws/claude` | Claude communication (web mode) |
| `/ws/livereload` | Dev mode hot reload |
| `/ws/background-tasks` | Background task notifications |
| `/ws/story` | Story/sprint updates (100ms debounce) |
| `/ws/git` | Git status updates (500ms coalesce) |
| `/ws/bell` | Bell mode message injection |
| `/ws/spans` | Real-time OTEL debugging spans |
| `/ws/welcome` | Session welcome messages |
| `/ws/hooks` | Hook request approval flow |

## REST API Endpoints

Core API endpoints served by WheelHub:

| Endpoint | Purpose |
|----------|---------|
| `/api/stats` | Current stats (tokens, tools, context) |
| `/api/persona` | Current agent persona/theme |
| `/api/git` | Single repo git status |
| `/api/git/all` | Multi-repo git status |
| `/api/story` | Current sprint and story info |
| `/api/files` | File listing and opening |
| `/api/token-stats` | Token usage telemetry |
| `/api/context` | Context meter usage |
| `/api/theme-agents` | Theme character assignments |
| `/api/mode` | Permission/handoff/relay mode |
| `/api/settings` | User settings (theme, fonts, grants) |
| `/api/background-tasks` | Running background tasks |
| `/api/hook-request` | WheelHub hook approval |
| `/api/portrait` | Agent portrait images |
| `/api/bell-queue` | Bell mode queue sync |
| `/v1/traces` | OTLP trace receiver |

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
- Multi-repo status (when configured in `pennyfarthing-settings.yaml`)

#### 4. Tasks Section (Collapsible)
- Live todo list from TodoWrite tool
- Progress indicator (completed/total)
- Status icons (pending, in_progress, completed)

### Main Content Area

- **MessageView** - Rendered Claude conversation
- **Tab Panel** - Workspace tools (diffs, files, browser)
- **Quick Actions** - Suggested prompt buttons (including CONTINUE marker support)
- **Editor** - Rich text input with toolbar
- **Stats Strip** - Compact stats, project directory, and multi-repo git status

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
| `PF_COMMAND` | Override Claude CLI path |
| `PF_SESSION_ID` | Session ID for persona lookup |
| `PF_PROJECT_DIR` | Project directory path |
| `PF_THEME` | Active theme name |
| `PF_GUI_ACTIVE` | Set to "1" when running in BikeRack GUI |
| `PORT` | Server port (default: 1898) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP endpoint for telemetry |

## Pennyfarthing Integration

### Theme Detection

BikeRack GUI reads theme configuration from the project:

```typescript
import { loadThemeConfig, loadThemeYaml } from './pennyfarthing.js';

const config = loadThemeConfig('/path/to/project');
// { theme: 'west-wing' }

const agents = loadThemeYaml(themePath);
// { sm: {...}, dev: {...}, tea: {...}, ... }
```

### Agent Watching

BikeRack GUI monitors `.session/agents/` for agent changes:

```typescript
import { watchAgentChanges } from './pennyfarthing.js';

const cleanup = watchAgentChanges(
  projectDir,
  sessionId,
  (agentRole) => console.log(`Agent changed to: ${agentRole}`)
);
```

### Statusbar Suppression

When `PF_GUI_ACTIVE=1` is set, Pennyfarthing's statusline hook outputs nothing - BikeRack GUI's sidebar displays the same information.

## Hook Approval System

BikeRack GUI consolidates all hook communication through WheelHub for secure tool approval.

### Flow

1. Hook script sends POST to `/api/hook-request` with tool data
2. WheelHub checks allowlist/grants for auto-approval
3. If manual approval needed, broadcasts to WebSocket clients
4. Client shows approval modal, user decides
5. Decision returned to hook via HTTP response

### Auto-Allowlisted Commands

Safe commands are auto-approved without user interaction:

- `ls`, `pwd`, `echo`
- `cat` on markdown/text/code files
- `git status|diff|log|branch`
- `npm run build|test|lint`
- `node|npm --version`

### Context-Aware Requests

Hook requests include context state for informed decisions:

```typescript
interface HookRequest {
  toolName: string;
  toolId: string;
  input: Record<string, unknown>;
  context?: {
    percentage: number;
    isHigh: boolean;      // >70%
    isCritical: boolean;  // >85%
  };
}
```

## OpenTelemetry Integration

BikeRack GUI includes an OTLP receiver on port 4318 that captures:

- Token usage (input/output/cache)
- API request timings
- Tool call events with duration
- Context percentage
- Cost calculations

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

## Multi-Repo Git Status

For monorepo or multi-project setups, BikeRack GUI displays git status for all configured repositories.

### Configuration

Add repos to `.claude/project/pennyfarthing-settings.yaml`:

```yaml
repos:
  - path: /path/to/main-repo
    name: main
  - path: /path/to/api-repo
    name: api
```

### Display

The stats strip shows status badges for each repo:
- Abbreviated name (e.g., "conductor-api" → "api")
- Status icon: ✓ clean, ● dirty
- Ahead/behind counts when applicable

Single-repo projects show one indicator; multi-repo shows all.

### API

- `GET /api/git` - Single repo status
- `GET /api/git/all` - All configured repos

Updates are polled every 5 seconds with 500ms coalescing on file changes.

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

### Test Naming

Tests follow the `B-*.test.ts` naming convention (57 total tests).

## See Also

- [User Guide](USER-GUIDE.md) - Complete Pennyfarthing documentation
- [Personas](PERSONAS.md) - Theme customization and OCEAN profiles
- [Architecture](ARCHITECTURE.md) - System design principles
