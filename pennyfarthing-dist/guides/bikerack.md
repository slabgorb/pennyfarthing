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
| `packages/core/src/public/components/BikeRackWorkspace.tsx` | Dockview layout for BikeRack |
| `packages/core/src/public/components/BikeRackIndex.tsx` | Panel listing index page |
| `packages/core/src/public/components/StandalonePanel.tsx` | `?panel=X` routing + `PANEL_REGISTRY` |
| `pennyfarthing_scripts/bikerack/cli.py` | `pf bikerack` launcher CLI |

## Constraints

- **No MessagePanel** — Claude conversation stays in your terminal. This is intentional.
- **Single session** — one Claude CLI per BikeRack instance (multi-session is deferred).
- **Bell/Relay/Reflector are dormant** — these features require ClaudeService and are skipped in BikeRack mode.

<info>
**ADR:** `docs/adr/0024-bikerack-mode.md`
</info>
