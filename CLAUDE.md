# CLAUDE.md — Pennyfarthing Framework

Pennyfarthing is a Claude Code agent orchestration framework with BikeLane workflows and themed personas. **Version:** 12.1.3. ES module monorepo (pnpm, TypeScript, Node >=18).

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
| `packages/shared/` | Shared types and utilities |
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

**Handoff:** Agent writes assessment → `pf handoff resolve-gate` → `complete-phase` → `marker` → next agent activates.

**Codenames:** WheelHub (server), TirePump (context clearing), JobFair (benchmarking), BikeRack (panel viewer)
</info>

<context>
## Component Guides

Read guides for detailed behavior, key files, and APIs. All paths relative to `pennyfarthing-dist/`.

### Guides (`guides/`)

| Component | Guide | Purpose |
|-----------|-------|---------|
| BikeLane | `guides/bikelane.md` | Workflow engine — phased, stepped, procedural |
| BikeRack | `guides/bikerack.md` | Standalone panel viewer for CLI-first dev |
| Gates | `guides/gates.md` | Phase transition quality checks |
| Handoff CLI | `guides/handoff-cli.md` | Gate resolution, session transitions, markers |
| Hooks | `guides/hooks.md` | Claude Code hooks — session, pre/post tool use |
| Bell Mode | `guides/bell-mode.md` | Message queue injection via PostToolUse |
| Relay Mode | `guides/relay-mode.md` | Auto-handoff execution |
| TirePump | `guides/tirepump.md` | Context clearing and session reload |
| Prime | `guides/prime.md` | Agent activation with tiered context |
| Reflector | `guides/reflector.md` | Agent-to-UI markers for QuickActions |
| Tandem | `guides/tandem-protocol.md` | Background observer pairing |
| Output Styles | `guides/output-styles.md` | Response modes (terse, verbose, teaching) |
| Brownfield | `guides/brownfield-tools.md` | Codebase analysis — hotspots, complexity, health |

### Schemas (`schemas/`)

| Schema | File | Purpose |
|--------|------|---------|
| Gate | `schemas/gate-schema.md` | Gate file format and GATE_RESULT contract |
| Session | `schemas/session-schema.md` | Session file XML structure |
| Workflow | `schemas/workflow-schema.md` | Workflow YAML configuration schema |
| Workflow Step | `schemas/workflow-step-schema.md` | Step file XML tag schema |
| Skill | `schemas/skill-schema.md` | Skill file structure and XML tags |
| Context | `schemas/context-schema.md` | Context document sections and validation |

### Patterns (`patterns/`)

| Pattern | File | Purpose |
|---------|------|---------|
| Fan-out/Fan-in | `patterns/fan-out-fan-in-pattern.md` | Parallel agent execution and result aggregation |
| Approval Gates | `patterns/approval-gates-pattern.md` | Human/agent approval checkpoints |
| Helper Delegation | `patterns/helper-delegation-pattern.md` | Delegating mechanical work to subagents |
| TDD Flow | `patterns/tdd-flow-pattern.md` | RED-GREEN-REFACTOR agent workflow |

### Agent Templates (`agents/templates/`)

| Template | File | Purpose |
|----------|------|---------|
| Strategic | `agents/templates/agent-template-strategic.md` | Template for strategic (Opus-class) agents |
| Tactical | `agents/templates/agent-template-tactical.md` | Template for tactical (Haiku-class) subagents |

### Taxonomy (`guides/taxonomy/`)

| Resource | File | Purpose |
|----------|------|---------|
| XML Tags | `guides/taxonomy/xml-tags.md` | Complete XML tag reference for all file types |
| Command Tag Taxonomy | `guides/taxonomy/command-tag-taxonomy.md` | Tag classification and usage rules |
| Prompt Patterns | `guides/taxonomy/prompt-patterns.md` | Prompt engineering patterns and XML usage |
</context>
