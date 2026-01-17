---
name: cyclist
description: Launch Cyclist visual terminal for Claude Code. Use this skill when starting Cyclist to monitor agent work, view personas, or debug sessions.
---

# Cyclist Visual Terminal Skill

## When to Use This Skill

- Starting Cyclist to monitor Claude Code sessions
- Viewing persona portraits and attributes
- Debugging agent interactions visually
- Running Cyclist in web mode for development

## Overview

Cyclist is a visual terminal interface for Claude Code that displays:
- Real-time terminal output with persona styling
- Agent portraits and OCEAN personality traits
- Story/session progress tracking
- Git status and context information

## Quick Start

Use `just cyclist` from the project root:

```bash
# Electron with folder picker (default)
just cyclist

# Electron in current directory
just cyclist here

# Electron in specific directory
just cyclist dir=/path/to/project

# Web dev mode (browser + hot reload)
just cyclist web

# Web server only (production)
just cyclist server

# Verbose/debug logging
just cyclist verbose

# Combine flags
just cyclist here verbose
just cyclist web dir=/path/to/project
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CYCLIST_PROJECT_DIR` | Project directory path | auto (picker in Electron) |
| `PORT` | Server port | `1898` |
| `CYCLIST_SESSION_ID` | Session tracking ID | auto-generated |
| `CYCLIST_VERBOSE` | Enable verbose logging | unset |
| `CYCLIST_DEV_WEB` | Enable web dev mode (set to `1`) | unset |
| `CYCLIST_THEME_PATH` | Custom theme file path | auto-detected |

## CLI Flags (Electron App)

| Flag | Description |
|------|-------------|
| `--project-dir=/path` | Specify project directory |

## Just Commands Reference

| Command | Description |
|---------|-------------|
| `just cyclist` | Start Electron with folder picker |
| `just cyclist here` | Start Electron in current directory |
| `just cyclist dir=/path` | Start Electron in specific directory |
| `just cyclist web` | Start web dev mode (browser + hot reload) |
| `just cyclist server` | Start web server only (production) |
| `just cyclist verbose` | Enable verbose/debug logging |
| `just cyclist-build` | Build Cyclist TypeScript |
| `just cyclist-rebuild` | Rebuild native modules (node-pty) |
| `just cyclist-setup` | Full clean + install + rebuild + build |
| `just cyclist-build-and-install` | Build and install Cyclist.app |
| `just test-cyclist` | Run Cyclist tests |

## Direct npm Scripts

From `packages/cyclist/`:

| Script | Description |
|--------|-------------|
| `npm start` | Run production server |
| `npm run dev` | Electron dev mode with file watching |
| `npm run dev:once` | Build and run Electron once (no watching) |
| `npm run dev:web` | Web server with tsx watch |
| `npm run dev:server` | Server-only with tsx watch |
| `npm run build` | Compile TypeScript |

## Port Auto-Discovery

The server automatically finds an available port starting from 1898:
- Tries ports 1898, 1899, 1900... up to 10 attempts
- Logs the actual port: `Cyclist running at http://localhost:{port}`

## Requirements

- Project must have `.pennyfarthing/` directory with config (Pennyfarthing-enabled)
- For Electron: Cyclist.app must be installed, or run from source
- For web: Run from `packages/cyclist/` directory

## Troubleshooting

### Window not appearing (Electron)

The `package.json` has `"main": "dist/server.js"` for npm module use. The `dev` scripts explicitly run `electron dist/main.js` to use the correct entry point. If you run `electron .` directly, it will run the web server instead of the Electron main process.

**Fix:** Use `just cyclist` which runs `electron dist/main.js`.

### Server won't start

- Ensure you're in the cyclist package directory (or use `just` commands)
- Run `npm run build` first if dist/ is stale
- Check console for port conflict messages

### No portraits showing

- Verify `pennyfarthing-dist/personas/portraits/` exists
- Check theme in `.pennyfarthing/config.local.yaml`

### "Not a Pennyfarthing project"

- Ensure project has `.pennyfarthing/` directory with `config.local.yaml` or agent symlinks
- Or has `.claude/` directory with persona-config.yaml (legacy)
- Run `pennyfarthing init` in the project first
- Or set `CYCLIST_PROJECT_DIR` to point to a valid project

### Native module issues (node-pty)

```bash
# Rebuild native modules for current Electron version
just cyclist-rebuild

# Or full setup from scratch
just cyclist-setup
```

### Missing workspace dependencies

If you see `Cannot find module '@pennyfarthing/core'`, the monorepo dependencies aren't built. The `just cyclist` command auto-detects this and builds them, but you can also run manually:

```bash
pnpm run build  # From project root
```
