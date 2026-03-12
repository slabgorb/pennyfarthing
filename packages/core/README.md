# @pennyfarthing/core

Core library for the Pennyfarthing agent framework. Provides CLI tools, workflow engine, and shared utilities consumed by BikeRack and external tooling.

## Overview

`@pennyfarthing/core` is the backbone of the Pennyfarthing framework. It ships:

- **CLI** — `pennyfarthing` command for install management, theme control, and skill/command authoring
- **Workflow engine** — BikeLane loader, router, gate handler, and session state tracking
- **Shared utilities** — theme loading, skill search, marker detection, portrait resolution, plugin discovery
- **Benchmark API** — JobFair result aggregation and OCEAN correlation analysis
- **React panels** — BikeRack GUI components (built via Vite)

The WheelHub server is now Python-based (FastAPI) at `pennyfarthing-dist/src/pf/wheelhub/`. See ADR-0022.

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

### WheelHub (Python FastAPI)

WheelHub is the Python FastAPI server that powers all panel UIs. It exposes REST endpoints and WebSocket feeds for stats, personas, git state, story context, settings, telemetry, and more.

**Location:** `pennyfarthing-dist/src/pf/wheelhub/`

The Node.js Express server was removed in Story 48-4 (Epic 48: Python WheelHub Migration).

### CLI (`src/cli/`)

The `pennyfarthing` binary (registered in `pennyfarthing-dist/`) provides:

| Command | Description |
|---------|-------------|
| `pennyfarthing update` | Update framework files to latest version |
| `pf validate` | Health check with `--fix` auto-repair |
| `pennyfarthing uninstall` | Remove Pennyfarthing from a project |
| `pennyfarthing version` | Show installed version |
| `pennyfarthing theme list/set/show/create` | Manage persona themes |
| `pennyfarthing command list/add/remove/link/sync` | Manage slash commands |
| `pennyfarthing skill list/add/remove/link/sync` | Manage skills |

CLI commands live in `src/cli/commands/`. Utilities (manifest, version, file hashing) are in `src/cli/utils/`.

### Workflow Engine (`src/workflow/`)

The BikeLane workflow system. Key modules:

| File | Purpose |
|------|---------|
| `workflow-loader.ts` | Load and parse workflow YAML definitions |
| `workflow-router.ts` | Route a story to its workflow by label/type |
| `workflow-schema.ts` | Zod schema validation for workflow definitions |
| `workflow-executor.ts` | Execute workflow steps and phase transitions |
| `gate-handler.ts` | Evaluate phase gate criteria |
| `handoff.ts` | Process agent handoffs between phases |
| `session-state.ts` | Track active session/phase/step state |
| `tandem-lifecycle.ts` | Tandem (background observer) pairing |
| `variable-resolver.ts` | Resolve `{{variables}}` in workflow definitions |
| `trimodal.ts` | Three-mode context injection (terse/verbose/teaching) |

### Shared Utilities (`src/shared/`)

Absorbed from `@pennyfarthing/shared` (Story 98-16). Exported from the package root:

| Export | Purpose |
|--------|---------|
| `loadTheme` / `listThemes` / `discoverAllThemeDirs` | Theme discovery and loading |
| `getAgentPersona` / `resolveThemePath` | Agent-to-persona resolution |
| `searchSkills` / `suggestSkills` | Skill search and suggestion |
| `generateSkillDocs` | Skill documentation generation |
| `detectMarkers` / `stripMarkers` | Reflector marker parsing |
| `portrait-resolver.ts` | Portrait image path resolution |
| `repos-topology.ts` | `repos.yaml` parsing for multi-repo topology |
| `spawn-prompt.ts` | Spawn a Claude prompt as a subagent |

### Other Modules

| Module | Purpose |
|--------|---------|
| `src/benchmark/` | JobFair result aggregation, OCEAN correlation, role statistics |
| `src/permissions/` | Permission request validation and grant schema |
| `src/plugins/` | Plugin manifest discovery and registration |
| `src/jira/` | Jira epic creation and sprint sync |
| `src/bmad/` | Sprint story parsing and export |
| `src/consultation/` | Tandem consultation protocol and dialogue management |
| `src/data-source.ts` | `DataSource` interface for WebSocket-backed data feeds |

## Development

### Build

```bash
pnpm run build        # tsc + vite build (React panels)
pnpm run build:tsc    # TypeScript only
pnpm run build:react  # Vite build for src/public/ React components
pnpm run dev          # Watch mode (tsc --watch)
pnpm run clean        # Remove dist/
```

The build produces two outputs:

- `dist/` — compiled TypeScript (ESM)
- `dist/public/` — Vite-built React components (BikeRack panels)

### Test

```bash
pnpm test    # node --test dist/**/*.test.js
pnpm lint    # eslint src/
```

Tests use Node's native test runner. Run `pnpm run build` before testing — tests run against `dist/`, not `src/`.

## Exports

**`@pennyfarthing/core`** (root) — programmatic API: utilities, types, workflow functions, benchmark API, plugin discovery. Import this in scripts and tools that need to read Pennyfarthing data without starting a server.

## Related Packages

| Package | Description |
|---------|-------------|
| [`@pennyfarthing/cyclist`](../cyclist/) | BikeRack GUI React build |
| [`pennyfarthing-dist/src/pf/wheelhub/`](../../pennyfarthing-dist/src/pf/wheelhub/) | Python FastAPI WheelHub server |
