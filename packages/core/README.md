# @pennyfarthing/core

React GUI component library for the Pennyfarthing agent framework. Provides BikeRack panel components, hooks, and the WebSocket data source consumed by `@pennyfarthing/cyclist`.

## Overview

`@pennyfarthing/core` is a pure React component library. It ships:

- **BikeRack panels** — React components for sprint status, git diffs, workflow state, tool stats, settings, and more
- **Hooks** — React hooks for WebSocket data feeds, panel state, and UI interactions
- **WebSocketDataSource** — Client-side data layer connecting to the Python WheelHub server
- **DataSource interface** — Abstract interface for panel data feeds

Server-side logic (API routes, OTLP receiver, WebSocket channels, CLI) lives in the Python `pf` package at `pennyfarthing-dist/src/pf/`. See ADR-0034.

## Prerequisites

- **Node.js** >= 18.0.0
- **pnpm** >= 9.0.0 (install from monorepo root, not this directory)

## Installation

Install from the monorepo root — never from inside `packages/core/`:

```bash
pnpm install
```

To build:

```bash
# From monorepo root
pnpm --filter @pennyfarthing/core build

# Or from this directory
pnpm run build
```

## Architecture

### React GUI (`src/public/`)

All React components, hooks, and panels for the BikeRack dashboard:

| Directory | Purpose |
|-----------|---------|
| `src/public/components/` | React panel components (sprint, git, diffs, workflow, etc.) |
| `src/public/hooks/` | React hooks for data feeds and UI state |
| `src/public/bikerack/` | BikeRack entry points and WebSocketDataSource |
| `src/public/marker/` | Reflector marker detection and parsing |
| `src/public/data-source.ts` | `DataSource` interface for WebSocket-backed data feeds |

### WheelHub (Python server)

The WheelHub server that powers all panel UIs is implemented in Python at `pennyfarthing-dist/src/pf/wheelhub/`. It runs as a FastAPI/uvicorn process and exposes:

- REST endpoints (`/api/*`) for panel data
- WebSocket channels (`/ws/*`) for real-time updates
- OTLP receiver (`/v1/*`) for Claude Code telemetry
- Static file serving for the Vite-built React GUI

The React GUI connects to WheelHub via the `WebSocketDataSource` class in `src/public/bikerack/websocket-data-source.ts`.

## Development

### Build

```bash
pnpm run build        # Vite build (React panels)
pnpm run build:react  # Same — Vite build for src/public/ React components
pnpm run clean        # Remove dist/
```

The build produces:

- `dist/public/` — Vite-built React components (BikeRack panels)

### Test

```bash
pnpm test    # vitest
pnpm lint    # eslint src/
```

### Key Source Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Package root (minimal — server code removed) |
| `src/public/bikerack/index.ts` | BikeRack component exports and WebSocketDataSource |
| `src/public/bikerack/websocket-data-source.ts` | WebSocket client connecting to WheelHub |
| `src/public/bikerack/BikeRackWorkspace.tsx` | Main BikeRack workspace layout |
| `src/public/data-source.ts` | `DataSource` interface |
| `src/public/components/panels/` | Individual panel components |
| `src/public/hooks/` | React hooks for panel data |

## Exports

**`@pennyfarthing/core`** (root) — minimal export (server-side code removed to Python).

**`@pennyfarthing/bikerack`** (Vite alias) — BikeRack components and WebSocketDataSource. Used by Cyclist's Vite build via the `@pennyfarthing/bikerack` alias.

## Related Packages

| Package | Description |
|---------|-------------|
| [`@pennyfarthing/cyclist`](../cyclist/) | React entry points and Vite/Vitest/Tailwind config |
| `pennyfarthing-dist/src/pf/wheelhub/` | Python WheelHub server (FastAPI/uvicorn) |
