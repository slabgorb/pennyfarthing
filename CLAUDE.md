# CLAUDE.md — Pennyfarthing Framework

Pennyfarthing is a Claude Code agent orchestration framework with BikeLane workflows and themed personas. **Version:** 11.3.3. ES module monorepo (pnpm, TypeScript, Node >=18).

<critical>
## Implementation Rules

1. **Modify `pennyfarthing-dist/`** — this is the single source of truth for all definitions
2. **Use `.js` extensions** in all relative TypeScript imports
3. **Return result objects** `{success, data?, error?}` instead of throwing
4. **Use Haiku for subagents** — never Opus for mechanical tasks
5. **Commit `dist/`** alongside `src/` changes
6. **Scripts use `.pennyfarthing/` paths** — never `pennyfarthing-dist/` in runtime scripts
7. **Scripts must exist in ONE location only** — build-time validation prevents duplication
</critical>

<critical>
## Dogfooding Context

This repo is inlined at `pennyfarthing/` inside `pennyfarthing-orchestrator`. The `.pennyfarthing/` directory lives at the **orchestrator root**, not here. When debugging Cyclist:

```bash
CYCLIST_PROJECT_DIR=/path/to/pennyfarthing-orchestrator npm run dev:web
```

`CYCLIST_PROJECT_DIR` must point to the orchestrator root where `.pennyfarthing/` exists, otherwise `detectPennyfarthingProject()` fails and APIs return 404.
</critical>

<code-editing>
Never edit files inside `node_modules/` or symlink targets (`.pennyfarthing/` directories). Trace symlinks back to `pennyfarthing-dist/` and edit there.
</code-editing>

<git-operations>
Commit format: `<type>(<scope>): <subject>`

Two git repos in play:
- `pennyfarthing-orchestrator/` — sprint, sessions, docs
- `pennyfarthing/` — framework source (separate git history)
</git-operations>

<info>
## Build & Test

```bash
pnpm run build     # TypeScript compilation (tsc)
pnpm run dev       # Watch mode (tsc --watch)
pnpm run clean     # Remove dist/
pnpm test          # Node.js native test runner
pnpm run lint      # ESLint
```

Testing framework changes in the orchestrator:
```bash
pnpm run build && pnpm link
cd ~/Projects/pennyfarthing-orchestrator && pennyfarthing doctor
```

Publishing: `pnpm version patch|minor|major && pnpm publish`
</info>

<info>
## Directory Structure

| Directory | Purpose |
|-----------|---------|
| `pennyfarthing-dist/` | Published package content (source of truth) — agents, commands, guides, skills, personas, workflows, scripts |
| `packages/core/` | Main package (`@pennyfarthing/core`) — CLI, server (WheelHub), API routes, shared utilities (theme-loader, portrait-resolver, markers) |
| `packages/cyclist/` | Visual terminal (React 19, Tailwind v4, shadcn/ui, dockview panels) — thin wrapper over core server, adds WebSocket + OTLP |
| `packages/electron/` | Electron shell for Cyclist — extracted from cyclist for standalone distribution (98-20) |
| `packages/shared/` | **Deprecated** — absorbed into `packages/core/src/shared/` (story 98-16). Package still exists for backward compat but core is source of truth |
| `packages/themes-*/` | Theme packages (comedy, literary, mythology-fantasy, prestige-tv, realistic, scifi, superheroes) |
| `tests/` | Framework tests |
| `scripts/` | Meta scripts for framework dev only (NOT distributed) |
| `pennyfarthing_scripts/` | Distributed Python package (hooks, jira, sprint, story) |

### Migration Notes (Stories 98-16, 98-17, 98-18)

- **98-16:** `@pennyfarthing/shared` absorbed into `packages/core/src/shared/` — theme-loader, portrait-resolver, marker detection, skill-search all live in core now
- **98-17:** WheelHub server (Express app, API routes, settings) moved from `packages/cyclist/src/server.ts` to `packages/core/src/server/`. Cyclist is now a thin wrapper that adds real WebSocket handlers and OTLP receiver
- **98-18:** React UI build pipeline moved into core

Import shared utilities from core: `import { loadAllThemeMetadata } from '../../shared/index.js'` (within core) or `from '@pennyfarthing/core'` (external consumers).
</info>

<info>
## Script Locations

| Location | Distributed | Purpose |
|----------|-------------|---------|
| `scripts/` | No | Framework dev only (deploy, benchmarks, job-fair) |
| `pennyfarthing-dist/scripts/` | Yes | Bash/JS for user workflows (sprint, story, jira, git, portraits, core) |
| `pennyfarthing_scripts/` | Yes | Python package (jira, sprint, story, brownfield, hooks) |

**Path resolution:** Distributed scripts use `find-root.sh` (walks up from `$PWD` looking for `.pennyfarthing/`). Build scripts use `BASH_SOURCE`-relative paths. If `PROJECT_ROOT` is set, `find-root.sh` respects it as override.
</info>

<info>
## BikeLane Workflows & Agents

BikeLane is Pennyfarthing's customizable workflow engine.

| Type | Description | Examples |
|------|-------------|----------|
| **Phased** | Agent-driven with automatic handoffs | tdd, tdd-tandem, bdd, bdd-tandem, trivial, 2party-tdd, agent-docs, patch |
| **Stepped** | Progressive disclosure with gates | architecture, release, git-cleanup |

**TDD flow:** `/pf-session new` → SM → TEA → Dev → Reviewer → SM (finish)

| Agent | Role |
|-------|------|
| SM | Story setup, session management, completion |
| TEA | Write failing tests (RED phase) |
| Dev | Implement to pass tests (GREEN phase) |
| Reviewer | Adversarial review, approve/reject |

**Subagents:** `sm-setup`, `sm-finish`, `sm-handoff`, `sm-file-summary`, `testing-runner`, `handoff`, `reviewer-preflight` — all via Task tool with `subagent_type`.

**Handoff protocol:** Agent completes work → spawns subagent → subagent updates session → next agent reads state and continues.
</info>

<info>
## Cyclist (Visual Terminal)

Electron app with React 19, Tailwind v4, shadcn/ui, dockview-react panels.

**Codenames:** WheelHub (server — now in `packages/core/src/server/`), TirePump (context clearing), JobFair (benchmarking), BikeRack (standalone panel viewer)

**Key components:** `DockviewWorkspace.tsx` (layout), `MessageView.tsx` (conversation), `ToolCallBlock.tsx` / `ToolStack.tsx` (tool visualization), `QuickActions.tsx` (marker detection)

**BikeRack:** Standalone panel viewer mode — Dockview layout with `?panel=X` routing, `--project-dir` for decoupled launch. Key files: `bikerack.ts` (entry), `BikeRackWorkspace.tsx` (layout), `StandalonePanel.tsx` (routing). Launch: `pennyfarthing cyclist --bikerack`

**Panels:** MessagePanel (sacred center), ChangedPanel, DiffsPanel, SprintPanel, BikeLanePanel, ACPanel, AcceptanceCriteriaPanel, SettingsPanel, DebugPanel, GitPanel, BackgroundPanel, TodoPanel, AuditLogPanel, WorkflowPanel, HotspotsPanel

**CLI for users:** `pennyfarthing init | update | doctor [--fix] | uninstall`
</info>

<context>
## Component Guides

For detailed behavior, key files, configuration, and APIs for each component, read the guide:

| Component | What it is | Guide |
|-----------|-----------|-------|
| **BikeLane** | Workflow engine — phased, stepped, and procedural workflow orchestration | `pennyfarthing-dist/guides/bikelane.md` |
| **BikeRack** | Standalone panel viewer for CLI-first development — WheelHub without Cyclist UI | `pennyfarthing-dist/guides/bikerack.md` |
| **Gates** | Conditional checks blocking phase transitions until quality thresholds are met | `pennyfarthing-dist/guides/gates.md` |
| **Handoff CLI** | Phase gate resolution, session transitions, and marker generation | `pennyfarthing-dist/guides/handoff-cli.md` |
| **Hooks** | Claude Code hook system — session start, pre/post tool use, git hooks | `pennyfarthing-dist/guides/hooks.md` |
| **Bell Mode** | Message queue injection via PostToolUse hook — queue messages while Claude works | `pennyfarthing-dist/guides/bell-mode.md` |
| **Relay Mode** | Automatic agent handoff execution — skips user confirmation on HANDOFF markers | `pennyfarthing-dist/guides/relay-mode.md` |
| **TirePump** | Context clearing system — resets Claude session, reloads agent with fresh context | `pennyfarthing-dist/guides/tirepump.md` |
| **Prime** | Agent activation system — bootstraps agents with tiered context (identity, workflow, session) | `pennyfarthing-dist/guides/prime.md` |
| **Reflector** | Agent-to-UI protocol — `<!-- CYCLIST:TYPE:value -->` markers drive QuickActions buttons | `pennyfarthing-dist/guides/reflector.md` |
| **Tandem Protocol** | Background observer pairing and consultation protocol for agent collaboration | `pennyfarthing-dist/guides/tandem-protocol.md` |
| **Output Styles** | Configurable response modes (terse, verbose, teaching) | `pennyfarthing-dist/guides/output-styles.md` |
| **Brownfield Tools** | Codebase analysis — hotspots, complexity, dead code, dependencies, health score | `pennyfarthing-dist/guides/brownfield-tools.md` |
| **Benchmarks (JobFair)** | Persona evaluation — OCEAN trait correlation with agent task performance | `packages/benchmark/docs/benchmarks-guide.md` |
</context>
