# Cyclist Web Mode

Web mode runs Cyclist as a standalone browser application, without the Electron shell. This is useful for:

- **Remote access** - Access Cyclist from another machine or tablet
- **Lighter footprint** - No Chromium overhead (~200MB less RAM)
- **Docker/container deployments** - Run Cyclist headless in CI/CD

## Quick Start

```bash
# Start WheelHub (Python FastAPI server)
pf bikerack start
```

Open `http://localhost:1898` in your browser.

## Configuration

### Required: Project Directory

Web mode requires you to specify the project directory:

```bash
# Option 1: Environment variable (recommended)
WHEELHUB_PROJECT_DIR=/path/to/your/project pf bikerack start

# Option 2: Run from the project directory
cd /path/to/your/project && pf bikerack start
```

### OTEL Token Stats

As of v6.1 (Story 20-1), Cyclist auto-configures OTEL for web mode:

1. Cyclist writes port to `.bikerack-port` in project directory
2. Claude Code hook reads this and sets OTEL endpoint
3. Token stats appear automatically

**No manual OTEL configuration needed.**

## Feature Parity Matrix

| Feature | Electron | Web | Notes |
|---------|:--------:|:---:|-------|
| **Core UI** ||||
| Persona display | ✅ | ✅ | Identical |
| Story progress | ✅ | ✅ | Identical |
| Todo visualizer | ✅ | ✅ | Identical |
| Token/tool stats | ✅ | ✅ | Identical |
| Context usage | ✅ | ✅ | Identical |
| File browser | ✅ | ✅ | Read-only in both |
| Diff viewer | ✅ | ⚠️ | Push-only in web |
| **Claude Interaction** ||||
| Send prompts | ✅ | ✅ | Via WebSocket |
| Permission modes | ✅ | ✅ | Via WebSocket |
| Abort/clear | ✅ | ✅ | Via WebSocket |
| Streaming | ✅ | ✅ | Identical |
| **Navigation** ||||
| Agent menu | ✅ | ❌ | See workaround |
| Workflow menu | ✅ | ❌ | See workaround |
| Keyboard shortcuts | ✅ | ⚠️ | Editor shortcuts only |
| **System** ||||
| Project picker | ✅ | ❌ | Use env var |
| External editor | ✅ | ❌ | Copy path instead |
| Hot reload (dev) | ✅ | ❌ | Manual refresh |
| Process cleanup | ✅ | ❌ | Manual |
| Graceful shutdown | ✅ | ⚠️ | Browser close |

**Legend:** ✅ Full support | ⚠️ Partial/different | ❌ Not available

## Web Mode Workarounds

### Agent/Workflow Launch

In Electron, the menu bar provides quick agent launch with shortcuts (e.g., `Cmd+Shift+S` for SM). In web mode, type the command directly in the prompt:

| Electron Menu | Web Equivalent |
|---------------|----------------|
| Agents > SM | Type `/sm` in prompt |
| Agents > Dev | Type `/dev` in prompt |
| Workflows > New Work | Type `/new-work` in prompt |
| Workflows > Work | Type `/work` in prompt |

### External Editor

In Electron, clicking a file in the browser opens it in your `$EDITOR`. In web mode:

1. Click file to view path
2. Copy path to clipboard
3. Open manually in your editor

### Project Directory

Instead of a folder picker dialog:

```bash
# Set once in your shell profile
export CYCLIST_PROJECT_DIR=/path/to/default/project

# Or per-session
WHEELHUB_PROJECT_DIR=/other/project pf bikerack start
```

## Architecture Differences

### Electron Mode
```
┌─────────────────────────────────────┐
│         Electron Main Process       │
│  ┌─────────┐ ┌─────────┐ ┌───────┐ │
│  │ PTY     │ │ IPC     │ │ Menu  │ │
│  │ Manager │ │ Bridge  │ │ Bar   │ │
│  └─────────┘ └─────────┘ └───────┘ │
└──────────────────┬──────────────────┘
                   │ IPC Channels
┌──────────────────┴──────────────────┐
│          Renderer Process           │
│     (BrowserWindow + preload.ts)    │
└─────────────────────────────────────┘
```

### Web Mode
```
┌─────────────────────────────────────┐
│      WheelHub (Python FastAPI)      │
│  ┌─────────┐ ┌─────────┐ ┌───────┐ │
│  │ OTLP    │ │ REST    │ │ WS    │ │
│  │ Receiver│ │ API     │ │ Server│ │
│  └─────────┘ └─────────┘ └───────┘ │
└──────────────────┬──────────────────┘
                   │ HTTP/WebSocket
┌──────────────────┴──────────────────┐
│            Browser                  │
│     (React GUI via Vite build)      │
└─────────────────────────────────────┘
```

The React GUI connects to WheelHub's REST and WebSocket endpoints via the `WebSocketDataSource` class.

## Known Limitations

### 1. No Native Menus (HIGH impact)

The Electron menu bar provides:
- Quick agent launch with keyboard shortcuts
- Workflow commands
- Execution log access
- Verbose mode toggle

**Workaround:** Type commands directly. Consider bookmarking common prompts.

**Future:** Story 20-3 proposes URL-based agent launch (e.g., `?agent=sm`).

### 2. No Process Cleanup (MEDIUM impact)

Electron cleans up stale Claude processes on startup. Web mode does not.

**Workaround:** Manually kill orphaned processes:
```bash
pkill -f "claude"
```

### 3. No File Dialog (LOW impact for most users)

Electron shows a native folder picker on launch.

**Workaround:** Set `CYCLIST_PROJECT_DIR` environment variable.

### 4. No External Editor Integration (LOW impact)

Clicking files in Electron opens them in `$EDITOR`.

**Workaround:** Use the copy-to-clipboard pattern and paste into your editor.

## When to Use Each Mode

| Use Case | Recommended Mode |
|----------|------------------|
| Primary workstation | Electron |
| Remote/SSH access | Web |
| Low-memory machine | Web |
| Quick checks from phone/tablet | Web |
| CI/CD monitoring | Web |
| Full feature access | Electron |

## Troubleshooting

### Token stats not appearing

1. Verify Cyclist wrote `.bikerack-port` in your project directory
2. Check the Pennyfarthing hook is installed (`ls .claude/hooks/`)
3. Ensure Claude Code was started AFTER Cyclist

### WebSocket connection failed

1. Check browser console for errors
2. Verify WheelHub server is running (`pf bikerack status`)
3. Try refreshing the page

### Permission mode not syncing

The permission mode is stored locally in the browser and synced via WebSocket. If it seems stuck:

1. Check WebSocket connection in browser DevTools
2. Try `claude:clear` to reset session

## See Also

- [CYCLIST.md](../../../docs/CYCLIST.md) - Main Cyclist documentation
- [QUICK-ACTION-SETUP.md](QUICK-ACTION-SETUP.md) - Finder integration (Electron only)
