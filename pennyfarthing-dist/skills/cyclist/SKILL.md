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
```

### Quick Launch Examples

```bash
# Web mode for current directory
cd packages/cyclist && CYCLIST_PROJECT_DIR=$PWD npm start

# Web mode on custom port
cd packages/cyclist && PORT=3000 CYCLIST_PROJECT_DIR=/path npm start

# Dev mode with hot reload
cd packages/cyclist && CYCLIST_DEV_WEB=1 CYCLIST_PROJECT_DIR=/path npm run dev:server
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
| `npm run dev:web` | Web server with tsx watch |
| `npm run dev:server` | Server-only with tsx watch |
| `npm run build` | Compile TypeScript |

## Requirements

- Project must have `.claude/` directory (Pennyfarthing-enabled)
- For Electron: Cyclist.app must be installed
- For web: Run from `packages/cyclist/` directory

## Troubleshooting

### Server won't start
- Ensure you're in the cyclist package directory
- Run `npm run build` first if dist/ is stale
- Check console for port conflict messages

### No portraits showing
- Verify `pennyfarthing-dist/personas/portraits/` exists
- Check theme in `.claude/persona-config.yaml`

### "Not a Pennyfarthing project"
- Ensure project has `.claude/` directory
- Run `pennyfarthing init` in the project first
