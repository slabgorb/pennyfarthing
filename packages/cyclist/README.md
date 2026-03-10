# Cyclist

Visual terminal interface for Claude Code with Pennyfarthing integration.

## Prerequisites

- **Node.js** >= 18.0.0
- **pnpm** >= 9.0.0 (required, npm will not work)
- **just** >= 1.0.0 (command runner for build tasks)
- **Python 3** (for node-pty native module compilation)
- **Build tools**: Xcode Command Line Tools (macOS), build-essential (Linux), or Visual Studio Build Tools (Windows)

### macOS

```bash
# Install Xcode Command Line Tools (if not already installed)
xcode-select --install

# Install just (if not already installed)
brew install just
```

### Linux (Debian/Ubuntu)

```bash
sudo apt-get install build-essential python3

# Install just
curl --proto '=https' --tlsv1.2 -sSf https://just.systems/install.sh | bash -s -- --to /usr/local/bin
```

### Windows

```powershell
# Install just via winget
winget install Casey.Just
```

## First-Time Setup

From the **monorepo root** (not this directory):

```bash
# 1. Install all dependencies (must use pnpm)
pnpm install

# 2. Build Cyclist
just cyclist-build

# 3. (Optional) Rebuild native modules if you see node-pty errors
just cyclist-rebuild
```

Or use the all-in-one setup command:

```bash
just cyclist-setup
```

## Running Cyclist

### Electron App (Development)

```bash
just cyclist-electron
```

Opens a folder picker on first run. Select a Pennyfarthing-enabled project (must have `.claude/` directory).

### Web Mode

```bash
just cyclist-web /path/to/project
```

Or with environment variable:

```bash
WHEELHUB_PROJECT_DIR=/path/to/project pf bikerack start
```

Access at http://localhost:1898 (auto-increments if port in use).

### Server Only (No Hot Reload)

```bash
just cyclist-server /path/to/project
```

## Token Statistics

To see token stats in Cyclist, launch Claude Code with OTEL telemetry:

```bash
# Terminal 1: Start Cyclist
just cyclist-web /path/to/project

# Terminal 2: Launch Claude with telemetry
just claude-with-cyclist
```

## Installation (macOS)

Build and install the Electron app to `/Applications`:

```bash
just cyclist-build-and-install
```

Or step by step:

```bash
just cyclist-package      # Build distributable
just cyclist-install-app  # Copy to /Applications
just cyclist-install-cli  # Create `cyclist` CLI command
```

## Upgrading Cyclist

When upgrading from a previous version or after pulling changes:

```bash
# Standard upgrade path
git pull
just cyclist-setup        # Cleans artifacts, reinstalls deps, rebuilds
just cyclist-doctor --fix # Diagnose and auto-fix issues
just cyclist-install      # Reinstall app and CLI
```

### When to Rebuild

A full rebuild is needed after:

- **Node.js upgrade** - Native modules must be recompiled for new Node ABI
- **After git pull** - Source changes require fresh build
- **pnpm update** - Dependency changes may affect workspace symlinks
- **Switching branches** - Different branches may have incompatible artifacts

### Quick Diagnostic

If Cyclist fails to start after an upgrade:

```bash
just cyclist-doctor --fix
```

This checks prerequisites, validates builds, and auto-repairs common issues like broken symlinks or missing native modules.

## Troubleshooting

### "just: command not found"

Install `just` command runner:

```bash
# macOS
brew install just

# Linux
curl --proto '=https' --tlsv1.2 -sSf https://just.systems/install.sh | bash -s -- --to /usr/local/bin

# Windows
winget install Casey.Just
```

See [just documentation](https://github.com/casey/just) for more installation options.

### "Cannot find module '@pennyfarthing/core'"

You must install from the monorepo root, not from `packages/cyclist/`:

```bash
cd /path/to/pennyfarthing  # Go to monorepo root
pnpm install               # Use pnpm, not npm
```

### node-pty compilation errors

```bash
# Ensure build tools are installed
xcode-select --install     # macOS

# Rebuild native modules
just cyclist-rebuild
```

### "No Pennyfarthing project found"

Cyclist requires a project with Pennyfarthing installed. The project must have:

```
your-project/
└── .pennyfarthing/
    └── config.local.yaml
```

Initialize Pennyfarthing in your project:

```bash
cd /path/to/your/project
pf setup
```

### Port 1898 in use

Cyclist automatically finds the next available port (1899, 1900, etc.). Check console output for the actual port.

## Scripts Reference

| Command | Description |
|---------|-------------|
| `pnpm run dev` | Electron with hot reload |
| `pnpm run dev:vite` | Vite dev mode with hot reload |
| `pnpm run build` | Build React GUI via Vite |
| `pnpm test` | Run tests (vitest) |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `CYCLIST_PROJECT_DIR` | Project directory (required for web mode) |
| `PORT` | Server port (default: 1898) |
| `CYCLIST_DEV_WEB` | Enable web dev mode |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Telemetry endpoint for token stats |

## Architecture

### Wheelhub

**WheelHub** is Cyclist's internal coordination server—the central hub where all communication converges. Like a bicycle wheel's hub, it remains stable while handling:

- **API endpoints** - REST routes for stats, personas, git, stories, settings, etc.
- **WebSocket servers** - Real-time communication with the terminal and UI
- **OTLP receiver** - Telemetry ingestion from Claude Code
- **Acceptance handling** - Processing user acceptance signals from the UI
- **Cache invalidation** - Coordinating state refreshes across components

Wheelhub is implemented in `server.ts` and its supporting modules.

### TirePump

**TirePump** is Cyclist's context clearing system—reinflating the session when context runs low. Like pumping air back into a flat tire, it:

- **Clears the Claude session** - Terminates the current Claude Code process cleanly
- **Resets all stats** - Zeroes token counts, tool stats, context percentage
- **Reloads the current agent** - Relaunches with the same agent command (e.g., `/dev`)
- **Preserves workflow state** - Session files in `.session/` persist across reloads

TirePump button is always visible in the ControlBar, with a warning style applied at 70%+ context usage. Implementation spans `main.ts` (IPC handler), `stats-strip.js` (UI), and `preload.ts` (API bridge).

### JobFair

**JobFair** is Pennyfarthing's character benchmarking system—like a job fair where every character in a theme auditions for every role. It:

- **Runs every character against benchmarks** - Tests all theme personas (e.g., Star Wars cast) on standardized scenarios
- **Discovers hidden talents** - Finds which characters unexpectedly excel at roles outside their native assignment
- **Produces talent matrices** - Shows performance scores for each character × role combination
- **Guides theme configuration** - Helps optimize which character plays which agent role

JobFair is invoked via `/job-fair <theme>` and uses `scripts/solo-runner.sh` to execute benchmark runs. Results are saved to `internal/results/job-fair/`.

### Directory Structure

```
src/
├── main.ts          # Electron main process
├── preload.ts       # Electron IPC bridge
├── server.ts        # Wheelhub - central coordination server
├── websocket.ts     # WebSocket servers (terminal, stats)
├── api/             # REST API routes
│   ├── index.ts     # Router exports
│   ├── stats.ts     # Stats endpoints
│   ├── persona.ts   # Persona/theme endpoints
│   └── ...          # Other API modules
└── public/          # Frontend assets
    ├── index.html
    ├── styles.css
    └── js/          # Client JavaScript
```

## Related Docs

- [Web Mode Guide](docs/WEB-MODE.md)
- [Quick Actions Setup](docs/QUICK-ACTION-SETUP.md)
