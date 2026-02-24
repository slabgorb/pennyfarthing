# CLAUDE.md — Pennyfarthing Framework

Pennyfarthing is a Claude Code agent orchestration framework with BikeLane workflows and themed personas. **Version:** 12.0.0. ES module monorepo (pnpm, TypeScript, Node >=18).

<critical>
## Implementation Rules

1. **Modify `pennyfarthing-dist/`** — single source of truth for all definitions
2. **Use `.js` extensions** in all relative TypeScript imports
3. **Return result objects** `{success, data?, error?}` — don't throw
4. **Use Haiku for subagents** — never Opus for mechanical tasks
5. **Commit `dist/`** alongside `src/` changes
6. **Scripts use `.pennyfarthing/` paths** — never `pennyfarthing-dist/` in runtime
7. **Scripts must exist in ONE location only** — build-time validation prevents duplication
8. **Never edit `node_modules/`** or symlink targets — trace to `pennyfarthing-dist/`
</critical>

<critical>
## Dogfooding Context

This repo is inlined at `pennyfarthing/` inside `pennyfarthing-orchestrator`. The `.pennyfarthing/` directory lives at the **orchestrator root**, not here.

Cyclist debugging: `CYCLIST_PROJECT_DIR=/path/to/pennyfarthing-orchestrator npm run dev:web`
(must point to orchestrator root where `.pennyfarthing/` exists)
</critical>

<git-operations>
Commit format: `<type>(<scope>): <subject>`

Two repos: `pennyfarthing-orchestrator/` (sprint, sessions, docs) and `pennyfarthing/` (framework source). This repo uses gitflow — PRs target `develop`.
</git-operations>

<info>
## Build & Test

```bash
pnpm run build     # TypeScript compilation
pnpm run dev       # Watch mode
pnpm test          # Node.js native test runner
pnpm run lint      # ESLint
```
</info>

<info>
## Directory Structure

| Directory | Purpose |
|-----------|---------|
| `pennyfarthing-dist/` | Published package (source of truth) — agents, commands, guides, skills, personas, workflows, scripts |
| `pennyfarthing-dist/src/pf/` | Python CLI package (hooks, jira, sprint, story, prime) |
| `packages/core/` | `@pennyfarthing/core` — CLI, WheelHub server, API routes, shared utilities |
| `packages/cyclist/` | Visual terminal (React 19, Tailwind v4, dockview) — thin wrapper over core |
| `packages/electron/` | Electron shell (legacy, minimal use) |
| `packages/benchmark/` | Persona benchmarking (JobFair) |
| `packages/themes-*/` | Theme packages (comedy, literary, mythology-fantasy, prestige-tv, realistic, scifi, superheroes) |
| `tests/` | Framework tests |
| `scripts/` | Framework dev only (NOT distributed) |

**Display modes:** BikeRack panels render in three contexts:
- **TUI** — `pf bikerack start` launches panels alongside Claude Code CLI in the terminal
- **GUI** — Cyclist web UI with full dockview panel layout in a browser
- **IDE** — VS Code / Cursor sidebar panels via WheelHub API

**Scripts:** `pennyfarthing-dist/scripts/` (distributed, bash/JS) and `pennyfarthing-dist/src/pf/` (distributed, Python). Path resolution via `find-root.sh` (walks up looking for `.pennyfarthing/`).
</info>

<info>
## Workflows & Agents

BikeLane workflow types: **Phased** (agent-driven handoffs) and **Stepped** (progressive gates). Workflow definitions live in `pennyfarthing-dist/workflows/*.yaml` — read the YAML for phase order, agents, tandem/team pairings, and gates. Use `pf workflow list` and `pf workflow show <name>` to inspect.

| Agent | Role | Agent | Role |
|-------|------|-------|------|
| SM | Story setup, completion | PM | Planning |
| TEA | Failing tests (RED) | Tech Writer | Documentation |
| Dev | Implementation (GREEN) | UX Designer | UI design |
| Reviewer | Adversarial review | DevOps | Infrastructure |
| Architect | System design | Orchestrator | Meta-operations |

**Subagents** (Task tool): `sm-setup`, `sm-finish`, `sm-file-summary`, `testing-runner`, `reviewer-preflight`, `tandem-backseat`

**Handoff:** Agent writes assessment → `pf.sh handoff resolve-gate` → `complete-phase` → `marker` → next agent activates.

**Codenames:** WheelHub (server), TirePump (context clearing), JobFair (benchmarking), BikeRack (panel viewer)
</info>

<context>
## Component Guides

Guides at `pennyfarthing-dist/guides/`. Read for detailed behavior, key files, and APIs.

| Component | Guide | Purpose |
|-----------|-------|---------|
| BikeLane | `bikelane.md` | Workflow engine — phased, stepped, procedural |
| BikeRack | `bikerack.md` | Standalone panel viewer for CLI-first dev |
| Gates | `gates.md` | Phase transition quality checks |
| Handoff CLI | `handoff-cli.md` | Gate resolution, session transitions, markers |
| Hooks | `hooks.md` | Claude Code hooks — session, pre/post tool use |
| Bell Mode | `bell-mode.md` | Message queue injection via PostToolUse |
| Relay Mode | `relay-mode.md` | Auto-handoff execution |
| TirePump | `tirepump.md` | Context clearing and session reload |
| Prime | `prime.md` | Agent activation with tiered context |
| Reflector | `reflector.md` | Agent-to-UI markers for QuickActions |
| Tandem | `tandem-protocol.md` | Background observer pairing |
| Output Styles | `output-styles.md` | Response modes (terse, verbose, teaching) |
| Brownfield | `brownfield-tools.md` | Codebase analysis — hotspots, complexity, health |
| Benchmarks | `../packages/benchmark/docs/benchmarks-guide.md` | Persona evaluation (OCEAN traits) |
</context>
