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

## Quick Start (Recommended)

Use `just` commands from the project root:

```bash
# Start Cyclist Electron (recommended)
just cyclist-electron

# Start Cyclist web server only (browser-based)
just cyclist-web

# Start Cyclist for a different project
just cyclist-electron project_dir=/path/to/project
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CYCLIST_PROJECT_DIR` | Project directory path (required for web mode) | `$PWD` |
| `PORT` | Server port | `1898` |
| `CYCLIST_SESSION_ID` | Session tracking ID | auto-generated |
| `CYCLIST_DEV_WEB` | Enable web dev mode (set to `1`) | unset |
| `CYCLIST_THEME_PATH` | Custom theme file path | auto-detected |

## CLI Flags (Electron App)

| Flag | Description |
|------|-------------|
| `--project-dir=/path` | Specify project directory |

## Launch Commands

### Using Just (Recommended)

```bash
# Electron mode (from any pennyfarthing project)
just cyclist-electron

# Web mode (browser-based)
just cyclist-web

# With explicit project directory
just cyclist-electron project_dir=/path/to/project
just cyclist-web project_dir=/path/to/project
```

### Web Backend (Browser Mode)

Run from the **cyclist package directory**:

```bash
# Production mode
cd packages/cyclist
CYCLIST_PROJECT_DIR=/path/to/project npm start

# Development mode with hot reload
cd packages/cyclist
CYCLIST_PROJECT_DIR=/path/to/project npm run dev:web
```

Opens at: http://localhost:1898 (or next available port)

### Electron App

```bash
# Using CLI wrapper (if installed)
cyclist /path/to/project

# Direct launch via open
open -a Cyclist --args --project-dir=/path/to/project

# Development (from packages/cyclist)
cd packages/cyclist
CYCLIST_PROJECT_DIR=/path/to/project npm run dev
```

## Port Auto-Discovery

The server automatically finds an available port starting from 1898:
- Tries ports 1898, 1899, 1900... up to 10 attempts
- Logs the actual port: `Cyclist running at http://localhost:{port}`

## npm Scripts Reference

From `packages/cyclist/`:

| Script | Description |
|--------|-------------|
| `npm start` | Run production server |
| `npm run dev` | Electron dev mode with file watching |
| `npm run dev:once` | Build and run Electron once (no watching) |
| `npm run dev:web` | Web server with tsx watch |
| `npm run dev:server` | Server-only with tsx watch |
| `npm run build` | Compile TypeScript |

## Just Commands Reference

| Command | Description |
|---------|-------------|
| `just cyclist-electron` | Start Electron dev mode |
| `just cyclist-web` | Start web server mode |
| `just cyclist-build` | Build Cyclist TypeScript |
| `just cyclist-rebuild` | Rebuild native modules (node-pty) |
| `just cyclist-setup` | Full clean + install + rebuild + build |
| `just cyclist-build-and-install` | Build and install Cyclist.app |
| `just test-cyclist` | Run Cyclist tests |

## Requirements

- Project must have `.pennyfarthing/` directory with config (Pennyfarthing-enabled)
- For Electron: Cyclist.app must be installed, or run from source
- For web: Run from `packages/cyclist/` directory

## Troubleshooting

### Window not appearing (Electron)

The `package.json` has `"main": "dist/server.js"` for npm module use. The `dev` scripts explicitly run `electron dist/main.js` to use the correct entry point. If you run `electron .` directly, it will run the web server instead of the Electron main process.

**Fix:** Use `just cyclist-electron` or `npm run dev` which run `electron dist/main.js`.

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
