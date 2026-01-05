# Cyclist Integration

Cyclist is a Claude REPL wrapper with a sidebar UI that displays real-time agent personas, session stats, story progress, and git status alongside the Claude terminal.

> **Note:** Cyclist is transitioning from Express/WebSocket to an Electron-based desktop application. The API documented here applies to the current web-based implementation. Electron version will use IPC instead of HTTP/WebSocket.

## Quick Start

```bash
# From your Pennyfarthing project directory
pennyfarthing cyclist

# With custom port
pennyfarthing cyclist --port 4000

# Without auto-opening browser
pennyfarthing cyclist --no-open
```

## Prerequisites

Cyclist must be installed as a sibling directory or via `CYCLIST_PATH`:

```bash
# Option 1: Sibling directory (development)
ls ../cyclist/package.json  # Should exist

# Option 2: Environment variable
export CYCLIST_PATH=/path/to/cyclist
```

## How It Works

### Architecture

```
pennyfarthing cyclist
        │
        ▼
┌─────────────────┐
│ Pennyfarthing   │  Sets environment variables:
│ CLI             │  - CYCLIST_PROJECT_DIR
│                 │  - CYCLIST_THEME
│                 │  - CYCLIST_THEME_PATH
│                 │  - CYCLIST_SESSION_ID
│                 │  - CYCLIST_ACTIVE=1
└────────┬────────┘
         │ spawn
         ▼
┌─────────────────┐
│ Cyclist Server  │  Runs on localhost:3000
│                 │  - Express HTTP server
│                 │  - WebSocket connections
│                 │  - PTY for Claude terminal
└────────┬────────┘
         │ watches
         ▼
┌─────────────────┐
│ .session/agents │  File-based agent state
│                 │  One file per session ID
└─────────────────┘
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `CYCLIST_PROJECT_DIR` | Path to the Pennyfarthing project |
| `CYCLIST_THEME` | Active theme name (e.g., "west-wing") |
| `CYCLIST_THEME_PATH` | Full path to theme YAML file |
| `CYCLIST_SESSION_ID` | Claude Code session ID for agent lookup |
| `CYCLIST_ACTIVE` | Set to "1" when running in Cyclist |

### Statusbar Detection

When `CYCLIST_ACTIVE=1` is set, Pennyfarthing's statusline hook outputs nothing. This prevents duplicate information since Cyclist's sidebar displays the same data.

## API Reference

Cyclist exposes HTTP REST endpoints and WebSocket connections for real-time updates.

### REST Endpoints

#### GET /api/persona

Returns the current agent persona.

**Response:**
```json
{
  "character": "Leo McGarry",
  "displayName": "Leo",
  "role": "sm",
  "roleDescription": "Chief of Staff who runs the White House through sheer will",
  "style": "Direct, pragmatic, protective",
  "theme": "west-wing",
  "quote": "This guy's walking down the street when he falls in a hole...",
  "ocean": {
    "O": 65,
    "C": 90,
    "E": 70,
    "A": 55,
    "N": 45
  }
}
```

**Errors:**
- `404` - Not a Pennyfarthing project or no active persona

#### GET /api/portrait

Returns the current portrait image path.

**Response:**
```json
{
  "src": "/portraits/west-wing/sm.png"
}
```

#### POST /api/portrait

Sets the current portrait.

**Request:**
```json
{
  "src": "/portraits/west-wing/dev.png"
}
```

#### GET /api/stats

Returns current session statistics.

**Response:**
```json
{
  "tokens": 1250,
  "messages": 15,
  "model": "claude-opus-4-5",
  "status": "Ready",
  "context": "42%"
}
```

#### POST /api/stats

Updates session statistics (partial updates supported).

**Request:**
```json
{
  "tokens": 1500,
  "context": "55%"
}
```

#### GET /api/story

Returns current story information.

**Response:**
```json
{
  "id": "15-3",
  "title": "Enhance Cyclist sidebar with persona/story/git sections",
  "phase": "dev",
  "status": "in_progress",
  "points": 3,
  "sprint": {
    "number": 6,
    "completed": 65,
    "total": 71
  }
}
```

#### GET /api/git

Returns git status for the project.

**Response:**
```json
{
  "branch": "develop",
  "clean": true,
  "ahead": 0,
  "behind": 0
}
```

### WebSocket Connections

#### /ws/stats

Real-time session statistics updates. Debounced to 100ms.

**Message format:**
```json
{
  "tokens": 1500,
  "messages": 18,
  "model": "claude-opus-4-5",
  "status": "Working",
  "context": "55%"
}
```

#### /ws/persona

Real-time persona updates when agent changes.

**Message format:**
Same as `GET /api/persona` response.

## Sidebar Sections

The Cyclist sidebar displays four sections:

### 1. Persona Section
- Character portrait (woodcut-style)
- Character name and role
- Theme name
- Character quote

### 2. Stats Section
- Token count
- Message count
- Model name
- Context usage percentage

### 3. Story Section
- Story ID and title
- Current phase (SM, TEA, Dev, Reviewer)
- Sprint progress bar

### 4. Git Section
- Current branch
- Clean/dirty status
- Ahead/behind remote

## Portrait Assets

Portraits are stored in `pennyfarthing-dist/personas/sprites/` and symlinked into Cyclist:

```
cyclist/src/public/sprites → pennyfarthing-dist/personas/sprites/
```

Each theme has portraits for all 10 agent roles:
```
sprites/{theme}/
├── sm.png
├── tea.png
├── dev.png
├── reviewer.png
├── pm.png
├── architect.png
├── devops.png
├── tech-writer.png
├── ux-designer.png
└── orchestrator.png
```

## Pennyfarthing Module API

The `pennyfarthing.ts` module provides these functions:

### detectPennyfarthingProject(projectDir)

Checks if a directory is a Pennyfarthing project.

```typescript
import { detectPennyfarthingProject } from './pennyfarthing.js';

if (detectPennyfarthingProject('/path/to/project')) {
  console.log('Pennyfarthing project detected');
}
```

### getCurrentPersona(projectDir, sessionId?)

Gets the current agent persona.

```typescript
import { getCurrentPersona } from './pennyfarthing.js';

const persona = getCurrentPersona('/path/to/project', 'session-123');
// Returns Persona object or null
```

### watchAgentChanges(projectDir, sessionId, callback)

Watches for agent changes and invokes callback.

```typescript
import { watchAgentChanges } from './pennyfarthing.js';

const cleanup = watchAgentChanges(
  '/path/to/project',
  'session-123',
  (agentRole) => console.log(`Agent changed to: ${agentRole}`)
);

// Later: cleanup() to stop watching
```

### loadThemeConfig(projectDir)

Loads theme configuration from persona-config.yaml.

```typescript
import { loadThemeConfig } from './pennyfarthing.js';

const config = loadThemeConfig('/path/to/project');
// { theme: 'west-wing' }
```

### loadThemeYaml(themePath)

Parses a theme YAML file.

```typescript
import { loadThemeYaml } from './pennyfarthing.js';

const agents = loadThemeYaml('/path/to/west-wing.yaml');
// { sm: {...}, dev: {...}, tea: {...}, ... }
```

### computeDisplayNames(agents)

Computes shortest unique display names for characters.

```typescript
import { computeDisplayNames } from './pennyfarthing.js';

const displayNames = computeDisplayNames(agents);
// Map { 'Leo McGarry' => 'Leo', 'Sam Seaborn' => 'Sam', ... }
```

## Troubleshooting

### Cyclist not found

```
Error: Cyclist not found. Set CYCLIST_PATH environment variable
```

**Solution:** Install Cyclist at `../cyclist` or set `CYCLIST_PATH`:
```bash
export CYCLIST_PATH=/path/to/cyclist
```

### Persona not loading

1. Check `.session/agents/` directory exists
2. Verify agent files are being written by `agent-session.sh`
3. Check theme YAML exists at the expected path

### Portrait not showing

1. Verify sprite symlink exists: `ls cyclist/src/public/sprites`
2. Check portrait file exists: `ls pennyfarthing-dist/personas/sprites/{theme}/{role}.png`
3. Regenerate portraits if missing: `python scripts/generate-sprites.py`

### Statusbar showing in Cyclist

1. Verify `CYCLIST_ACTIVE=1` is set in Cyclist's spawn environment
2. Check `statusline.sh` respects the environment variable

## See Also

- [User Guide](USER-GUIDE.md) - Complete Pennyfarthing documentation
- [Personas](PERSONAS.md) - Theme customization
- [Architecture](ARCHITECTURE.md) - System design
