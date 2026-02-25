# BikeRack

<info>
Standalone panel viewer for CLI-first developers. BikeRack runs WheelHub (the Express/WebSocket server) without Cyclist's conversation UI, serving dashboard panels in a browser while Claude Code runs in your own terminal.
</info>

## Overview

Cyclist bundles the conversation UI and dashboard panels into one Electron app. BikeRack decouples them: you get the panels (sprint status, git diffs, workflow state, etc.) in a browser, and Claude Code stays in your terminal.

```
┌─────────────────┐       ┌──────────────────────┐
│  Claude CLI      │       │  WheelHub (BikeRack)  │
│  (your terminal) │──────▶│  Port 2898            │
│                  │ OTEL  │  No ClaudeService     │
│                  │ files │  16 WS channels       │
└─────────────────┘       └──────────┬─────────────┘
                                     │ HTTP + WS
                                     ▼
                          ┌──────────────────────┐
                          │  Browser              │
                          │  Dockview layout      │
                          │  or ?panel=X routing  │
                          └──────────────────────┘
```

## Quick Start

There are two approaches to running BikeRack.

**Approach 1: Manual just commands**

```bash
# hint - cd ($repo)
just wheelhub stop # in case it's running, clears left over pid and port files
just wheelhub start # open browser w/ the URL for GUI
just claude # handles some env setup

# in another terminal
# hint - cd ($repo)
just tui

# or
just bikerack # your mileage may vary
```

**Approach 2: pf CLI**

```bash
# Launch BikeRack + Claude CLI together
pf bikerack start

# Or via just recipe
just bikerack

# With a specific project directory
just bikerack dir=/path/to/project

# Stop a running instance
pf bikerack stop

# Check status
pf bikerack status
```

BikeRack opens a browser with the Dockview panel layout. Claude CLI runs in the foreground. When Claude exits, BikeRack shuts down automatically via `trap EXIT`.

## Panel Routing

BikeRack supports two modes:

**Dockview layout** (default) — full multi-panel workspace at `http://localhost:{port}/bikerack`

**Standalone panel** — single panel full-screen via query param:

| URL | Panel |
|-----|-------|
| `?panel=sprint` | Sprint status |
| `?panel=git` | Git operations |
| `?panel=diffs` | Diff viewer |
| `?panel=workflow` | Workflow state |
| `?panel=changed` | Changed files |
| `?panel=ac` | Acceptance criteria |
| `?panel=todos` | Task list |
| `?panel=audit` | Audit log |
| `?panel=background` | Background jobs |
| `?panel=debug` | Debug/prime context |
| `?panel=bikelane` | BikeLane workflow |
| `?panel=settings` | Settings |
| `?panel=portrait` | Agent portrait |

## How It Works

1. **Launcher** (`pf bikerack start`) starts WheelHub with `IS_BIKERACK=1`
2. **WheelHub** listens on port 2898 (separate from Cyclist's 1898)
3. **ClaudeService is skipped** — no `/ws/claude` WebSocket channel
4. **OTEL telemetry** flows from Claude CLI to WheelHub's OTLP receiver
5. **File watchers** detect changes to `.session/`, `sprint/`, and git state
6. **Panels** render as React components consuming WebSocket data — identical components to Cyclist

### Mode Detection

```typescript
// Server-side
import { isBikeRackMode } from './server.js';
if (isBikeRackMode()) { /* skip Claude-specific setup */ }
```

Client-side detection is URL-based: the presence of `?panel=X` triggers standalone rendering.

### Port and PID Files

| File | Purpose |
|------|---------|
| `.bikerack-port` | Port number, written after `server.listen()` — readiness signal |
| `.wheelhub-pid` | WheelHub PID, written by launcher — enables `pf bikerack stop` |

Both are deleted on shutdown. Shared with Cyclist (single WheelHub namespace).

## Layout Persistence

Save and restore BikeRack panel layouts:

```bash
pf bc save my-layout      # Save current layout
pf bc load my-layout      # Restore a saved layout
pf bc list                 # List saved layouts
```

## Key Files

| File | Purpose |
|------|---------|
| `packages/cyclist/src/bikerack.ts` | BikeRack WheelHub entry point |
| `packages/core/src/server/BikeRackWorkspace.tsx` | Dockview layout for BikeRack |
| `packages/core/src/server/BikeRackIndex.tsx` | Panel listing index page |
| `packages/core/src/server/StandalonePanel.tsx` | `?panel=X` routing + `PANEL_REGISTRY` |
| `pf/bikerack/cli.py` | `pf bikerack` launcher CLI |

## TUI Mode (Terminal Dashboard)

BikeRack also ships a Textual-based TUI that runs entirely in the terminal — no browser needed.

### Prerequisites

- **Python** >= 3.11
- **uv** (recommended) or pip
- **just** >= 1.0

### Setup

```bash
# From the pennyfarthing repo root — create venv and install TUI deps
python3 -m venv .venv
uv pip install --python .venv/bin/python3 -e "pennyfarthing-dist"
```

This installs the required packages into `.venv/`:

| Package | Purpose |
|---------|---------|
| `textual` >= 1.0 | Terminal UI framework |
| `websockets` >= 12.0 | WheelHub WebSocket client |
| `rich` | Terminal rendering (textual dependency) |
| `click` >= 8.0 | CLI framework |
| `pyyaml` >= 6.0 | YAML parsing |
| `textual-image` >= 0.7.0 | Agent portrait images |

The justfile automatically uses `.venv/bin/python3` when `.venv/` exists.

### Launch

```bash
# Default — connects to WheelHub on localhost:1898
just tui

# Point at a specific project directory
just tui dir=/path/to/project

# Custom WheelHub port
just tui port=2898
```

### Panels

The TUI provides tabbed panels navigable via keyboard:

| Key | Action |
|-----|--------|
| `Tab` / `]` | Next panel |
| `[` | Previous panel |
| `Shift+S` | Split view |
| `Ctrl+P` | Command palette |
| `q` | Quit |

Available panels: Sprint, Git, Diffs, Audit Log, Debug, Progress.

### Troubleshooting

**`ModuleNotFoundError: No module named 'textual'`**
```bash
# Deps not installed in venv — re-run setup
uv pip install --python .venv/bin/python3 -e "pennyfarthing-dist"
```

**`No module named 'pf'`**
The justfile sets `PYTHONPATH` automatically. If running manually:
```bash
PYTHONPATH=pennyfarthing-dist:$PYTHONPATH .venv/bin/python3 -m pf.bikerack.tui
```

**Portrait images not rendering**
`textual-image` is included in the base install. Requires a terminal with Sixel or Kitty graphics protocol support (iTerm2, WezTerm, Kitty). Falls back to text-only in unsupported terminals.

## Constraints

- **No MessagePanel** — Claude conversation stays in your terminal. This is intentional.
- **Single session** — one Claude CLI per BikeRack instance (multi-session is deferred).
- **Bell/Relay/Reflector are dormant** — these features require ClaudeService and are skipped in BikeRack mode.

<info>
**ADR:** `docs/adr/0024-bikerack-mode.md`
</info>
