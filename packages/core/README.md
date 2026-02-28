# @pennyfarthing/core

Core library for the Pennyfarthing agent framework. Provides the WheelHub server, CLI tools, workflow engine, and shared utilities consumed by Cyclist, BikeRack, and external tooling.

## Overview

`@pennyfarthing/core` is the backbone of the Pennyfarthing framework. It ships:

- **WheelHub** — Express + WebSocket server exposing all panel data over a REST/WS API
- **BikeRack entry point** — standalone TUI panel server (`pf bikerack start`)
- **CLI** — `pennyfarthing` command for install management, theme control, and skill/command authoring
- **Workflow engine** — BikeLane loader, router, gate handler, and session state tracking
- **Shared utilities** — theme loading, skill search, marker detection, portrait resolution, plugin discovery
- **Benchmark API** — JobFair result aggregation and OCEAN correlation analysis

The package is published as `@pennyfarthing/core` and consumed directly by `@pennyfarthing/cyclist`. It can also be consumed programmatically by external tools via its `index.ts` exports.

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

### WheelHub (`src/server/`)

WheelHub is the Express + WebSocket server that powers all panel UIs. It exposes REST endpoints and WebSocket feeds for stats, personas, git state, story context, settings, telemetry, and more.

**Entry points:**

| Export path | File | Purpose |
|-------------|------|---------|
| `@pennyfarthing/core/server` | `src/server/server.ts` | WheelHub Express app + `createTerminalServer()` |
| `@pennyfarthing/core/bikerack/entry` | `src/server/entry.ts` | BikeRack standalone process launcher |

**Server startup flow:**

1. `createTerminalServer()` builds the Express app
2. `findAvailablePort()` finds an open port (default 1898 for Cyclist, 2898 for BikeRack)
3. `setupWebSocketServers()` attaches WebSocket servers for stats, persona, token stats, bell, hook requests, and git diffs
4. Plugin routers are registered via `initPluginRouters()`
5. BikeRack writes `.bikerack-port` to the project directory on listen

### API Routes (`src/server/api/`)

Each module creates its own Express router, registered in `server.ts`. Routes are grouped by domain:

| Module | Endpoint prefix | Purpose |
|--------|----------------|---------|
| `stats.ts` | `/api/stats` | Tool use counts, context stats, session info |
| `token-stats.ts` | `/api/token-stats` | Token consumption from OTEL spans |
| `persona.ts` | `/api/persona` | Active theme/persona, agent mappings |
| `portrait.ts` | `/api/portraits` | Portrait image resolution |
| `git.ts` | `/api/git` | Multi-repo git status from `repos.yaml` |
| `story.ts` | `/api/story` | Active story/session file parsing |
| `context.ts` | `/api/context` | Context window usage percentage |
| `settings.ts` | `/api/settings` | Project and user settings read/write |
| `mode.ts` | `/api/mode` | Display mode (tui / gui / ide) |
| `otlp.ts` | `/v1/traces` | OTEL trace ingestion from Claude Code |
| `telemetry.ts` | `/api/telemetry` | Parsed span data |
| `spans.ts` | `/api/spans` | Enriched span hierarchy |
| `evaluation.ts` | `/api/evaluation` | Agent evaluation scores |
| `hook-request.ts` | `/api/hooks` | Hook permission requests from Claude |
| `permissions.ts` | `/api/permissions` | Grant management |
| `identity.ts` | `/api/identity` | User identity (email from OTEL) |
| `todos.ts` | `/api/todos` | Claude Code todo tracking |
| `audit-log.ts` | `/api/audit-log` | Hook audit history |
| `file-browser.ts` | `/api/files` | Project file tree |
| `agent-load.ts` | `/api/agent-load` | Agent context load metrics |
| `bell.ts` | `/api/bell` | Bell mode message queue |
| `hotspots.ts` | `/api/hotspots` | Code complexity hotspots |
| `code-markers.ts` | `/api/markers` | Reflector markers from agent output |
| `dead-code.ts` | `/api/dead-code` | Unused code detection |
| `complexity.ts` | `/api/complexity` | File complexity analysis |
| `dependencies.ts` | `/api/dependencies` | Dependency graph |
| `health-score.ts` | `/api/health` | Codebase health score |
| `project-info.ts` | `/api/project` | Project metadata |
| `theme-agents.ts` | `/api/theme-agents` | Agent-to-character mappings for active theme |

A static `/health` endpoint (no prefix) is used by hooks to verify WheelHub is running before injecting messages.

### CLI (`src/cli/`)

The `pennyfarthing` binary (registered in `pennyfarthing-dist/`) provides:

| Command | Description |
|---------|-------------|
| `pennyfarthing update` | Update framework files to latest version |
| `pennyfarthing doctor` | Health check with `--fix` auto-repair |
| `pennyfarthing uninstall` | Remove Pennyfarthing from a project |
| `pennyfarthing version` | Show installed version |
| `pennyfarthing cyclist` | Launch Cyclist web UI |
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
pnpm test    # node --test dist/**/*.test.js (~1562 tests)
pnpm lint    # eslint src/
```

Tests use Node's native test runner. Run `pnpm run build` before testing — tests run against `dist/`, not `src/`.

### Key Source Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Public programmatic API exports |
| `src/cli/index.ts` | CLI entry point (`pennyfarthing` binary) |
| `src/server/server.ts` | WheelHub Express app, all route registration |
| `src/server/entry.ts` | BikeRack standalone process launcher |
| `src/server/websocket.ts` | WebSocket server setup and broadcast logic |
| `src/server/otlp-receiver.ts` | OTEL trace ingestion and `OTLPProvider` interface |
| `src/server/pennyfarthing.ts` | Project detection, persona resolution, agent watch |
| `src/server/git-cache.ts` | Git status cache with periodic polling |
| `src/server/sprint-data.ts` | Sprint YAML parsing for panel display |
| `src/server/story-parser.ts` | Session file parsing for active story context |
| `src/server/settings.ts` | Settings load/save with change events |

## Exports

The package exports three surfaces:

**`@pennyfarthing/core`** (root) — programmatic API: utilities, types, workflow functions, benchmark API, plugin discovery. Import this in scripts and tools that need to read Pennyfarthing data without starting a server.

**`@pennyfarthing/core/server`** — WheelHub Express app and server factories. Used by Cyclist to mount the server inside its own process.

**`@pennyfarthing/core/bikerack/entry`** — standalone BikeRack server process. Invoked by `pf bikerack start` to run panels in TUI mode without Cyclist.

## Related Packages

| Package | Description |
|---------|-------------|
| [`@pennyfarthing/cyclist`](../cyclist/) | Visual terminal UI — thin wrapper over core's WheelHub |
| [`@pennyfarthing/shared`](../shared/) | Shared types (absorbed into core at v12) |
| [`packages/benchmark`](../../packages/benchmark/) | JobFair benchmark runner and persona evaluation |
