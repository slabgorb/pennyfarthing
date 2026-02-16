# Pennyfarthing

**v11.1.1** | *The outer loop goes once, the inner loop goes many times.*

<img src="pennyfarthing.png" alt="Pennyfarthing Logo" width="75" style="float:left; margin:10px">

A Claude Code agent orchestration framework built around three pillars: a flexible development platform, scientific personality research, and streamlined integrations.

---

## What is Pennyfarthing?

### 1. Development Platform

A multi-agent system with customizable BikeLane workflows for structured software development:

- **11 Coordinated Agents** - SM, TEA, Dev, Reviewer, Architect, PM, Tech Writer, UX Designer, DevOps, Orchestrator, BA
- **11 BikeLane Workflows** - Phased (TDD, BDD, Trivial, 2pTDD, TDD-Tandem, BDD-Tandem, Patch, Agent-Docs), Stepped (Architecture, Release, Git Cleanup)
- **51 Slash Commands** - Entry points for agent activation and workflows
- **22 Skills** - Reusable knowledge domains (testing, code-review, jira, mermaid, etc.)
- **Prime Context System** - Tiered context injection assembles agent definition, persona, session state, and sidecar memory
- **Automatic Handoffs** - Context-aware agent transitions via subagent delegation
- **Agent Sidecars** - Persistent learning files where agents record patterns, gotchas, and decisions across stories

### 2. Personality Research

A scientific study of how strong personalities affect AI agent behavior:

- **OCEAN Profiling** - Big Five personality scores for every character
- **TRAIL Framework** - Categorizing errors (reasoning, planning, execution) and correlating with personality
- **Benchmarking System** - `/solo`, `/benchmark-control`, `/benchmark` for statistical evaluation
- **JobFair** - Discovering which characters excel at roles beyond their native specialization

The 98 persona themes (Discworld, Star Trek, Breaking Bad, etc.) are instruments of inquiry, not decoration. Early findings show character expertise often trumps abstract personality scores.

### 3. Integration & Tooling

- **Cyclist Visual Terminal** - Electron-based IDE with 17 draggable Dockview panels, agent portraits, tool visualization, and workflow controls
- **BikeRack** - Standalone panel viewer for CLI-first developers — dashboard panels in your browser, Claude in your terminal
- **Jira Integration** - Bidirectional sync, epic auto-creation, sprint velocity
- **Sprint Management** - Story tracking with `current-sprint.yaml`
- **Codebase Analysis** - Hotspots, complexity, dead code, dependencies, code markers, and health score via `pf debug`

---

## Quick Start

```bash
cd your-project

# Install CLI
npm install --save-dev @pennyfarthing/core

# Initialize (creates symlinks)
npx pennyfarthing init

# Verify installation
npx pennyfarthing doctor

# Start working (in Claude Code)
/new-work
```

### Optional: Visual Terminal

```bash
# Install Cyclist (includes portraits)
npm install --save-dev @pennyfarthing/cyclist

# Launch
npx pennyfarthing cyclist
```

## Cyclist Visual Terminal

Cyclist is an Electron-based IDE built on React 19, Tailwind v4, and Dockview. It wraps Claude Code with a rich panel system and workflow controls.

### Panels

All panels are draggable, floatable, and splittable:

| Panel | Purpose |
|-------|---------|
| **Message** | Conversation stream (always visible) |
| **Sprint** | Current sprint stories and progress |
| **Progress** | At-a-glance story dashboard |
| **BikeLane** | Stepped workflow state and navigation |
| **AC** | Acceptance criteria checklist with progress |
| **Acceptance Criteria** | Story ACs with pass/fail tracking |
| **Changed** | Files added or modified during the session |
| **Diffs** | Git-based diff viewer for current changes |
| **Git** | Branch management and git operations |
| **Todo** | Task list tracking |
| **Audit Log** | Timestamped action history |
| **Settings** | Permission mode, relay mode, bell mode toggles |
| **Debug** | Prime context inspection with token counts |
| **Background** | Background job monitoring |
| **Workflow** | Workflow navigation and status |
| **Hotspots** | Codebase health — dead code, complexity, dependencies |

### Tool Visualization

Cyclist renders tool use as human-readable summaries instead of raw JSON. Consecutive identical tool calls are stacked, and results are collapsible.

### Workflow Modes

| Mode | Description |
|------|-------------|
| **Permission Mode** | `plan` / `manual` / `accept` — controls how much Claude can do without approval |
| **Relay Mode** | Automatic agent handoffs — detects `CYCLIST:HANDOFF` markers and runs the next agent |
| **Bell Mode** | Queue messages while Claude works — injected at next tool execution via hooks |

### Agent Portraits

Each of the 319 persona characters across 29 themes has a unique portrait displayed in the conversation stream, making multi-agent workflows visually distinct.

### BikeRack (CLI-First Dashboard)

For developers who prefer Claude Code in their own terminal, BikeRack runs WheelHub separately and serves panels in a browser:

```bash
pf bikerack start      # Launch BikeRack + Claude CLI
just bikerack          # Same, via just recipe
```

BikeRack provides the same panels as Cyclist without the conversation UI. Panels receive data via OTEL telemetry and file watchers.

## Prime Context System

Prime assembles the full agent context at activation: agent definition, persona character, behavior guide, sprint state, active session, and sidecar memory. This is injected via `--append-system-prompt` so agents behave identically whether launched from Cyclist or the CLI.

Prime uses **tiered injection** to manage token overhead:

| Tier | Tokens | When |
|------|--------|------|
| **Full** | ~4000 | New session or new agent |
| **Refresh** | ~2000 | Same agent, stale context |
| **Handoff** | ~1000 | Agent-to-agent transition |
| **Minimal** | ~200 | Deep in same agent session |

## Agent Sidecars

Sidecars are persistent learning files where agents record what they discover during story work. Each agent maintains three files in `.pennyfarthing/sidecars/`:

- **`{agent}-patterns.md`** — Strategies and patterns that worked
- **`{agent}-gotchas.md`** — Mistakes and edge cases to avoid
- **`{agent}-decisions.md`** — Architecture decisions and rationale

Agents write to sidecars before every handoff. Prime loads them on activation, so agents build on previous experience instead of rediscovering the same issues.

## BikeLane Workflows

BikeLane is the umbrella workflow system supporting two types:

| Type | Description | Examples |
|------|-------------|----------|
| **Phased** | Agent-driven with automatic handoffs | tdd, bdd, trivial, agent-docs |
| **Stepped** | Progressive disclosure with user gates | architecture, release, git-cleanup |

### Example: TDD Workflow (Phased)

| Agent | Role | Phase |
|-------|------|-------|
| **SM** | Scrum Master | Story selection, session setup, completion |
| **TEA** | Test Engineer | Write failing tests (RED) |
| **Dev** | Developer | Make tests pass (GREEN) |
| **Reviewer** | Code Reviewer | Quality validation, approve/reject |

Use `/workflow list` to see all workflows. Use `/workflow start <name>` to begin any stepped workflow.

### Workflow Gates

Gates are conditional checks on phase transitions. When an agent finishes a phase, the gate evaluates whether the transition should proceed:

| Gate | Purpose |
|------|---------|
| `tests-pass` | Verify all tests pass before review |
| `tests-fail` | Verify tests are RED before implementation |
| `approval` | Verify reviewer has approved |
| `confidence-sm` | Check if user instruction is unambiguous |

Gates are defined in `pennyfarthing-dist/gates/` and referenced via `gate.file` in workflow YAML.

### Tandem Mode

Tandem workflows pair a background observer with the primary agent. The backseat watches the primary agent's work and injects observations:

- **TDD-Tandem** — Architect watches TEA, TEA watches Dev, PM watches Reviewer
- **BDD-Tandem** — Adds UX Designer watching Dev, Architect watching UX

For active questions (not passive observation), agents use the **Consultation Protocol** — synchronous Sonnet-powered request/response between agents.

## Benchmarking & Personality Research

Pennyfarthing includes a scientific benchmarking system for evaluating how personality affects agent performance:

```bash
# Run a single agent on a scenario
/solo theme:agent --scenario cache-invalidation

# Create a control baseline (10 runs)
/benchmark-control reviewer --scenario order-service

# Compare persona vs control with statistics
/benchmark breaking-bad reviewer --scenario order-service
```

**Key Findings:**
- Cohen's d effect sizes measure performance differences
- Multivariate OCEAN patterns predict better than individual traits
- Character expertise often trumps abstract personality scores
- The "Stoic Analyst" profile (Low O + High C + Low E + Low N) excels at code review

See [Benchmarking Documentation](docs/BENCHMARKING.md) for methodology.

## CLI Commands

| Command | Description |
|---------|-------------|
| `pennyfarthing init` | Initialize in a project |
| `pennyfarthing update` | Update to latest version |
| `pennyfarthing doctor` | Check installation health |
| `pennyfarthing doctor --fix` | Auto-fix common issues |
| `pennyfarthing uninstall` | Remove for clean reinstall |
| `pennyfarthing theme list` | Show available themes |
| `pennyfarthing theme set <name>` | Change active theme |
| `pennyfarthing cyclist` | Launch Cyclist visual terminal |
| `pf bikerack start` | Launch BikeRack dashboard |
| `pf debug hotspots analyze` | Git change frequency analysis |
| `pf debug complexity analyze` | Code complexity metrics |
| `pf debug deadcode stale` | Find files with no recent commits |
| `pf debug healthscore analyze` | Composite codebase health score |
| `pf handoff marker <agent>` | Generate handoff marker |
| `pf validate` | Run all validators |

## Documentation

### Guides (in `pennyfarthing-dist/guides/`)

| Guide | Description |
|-------|-------------|
| [BikeLane](pennyfarthing-dist/guides/bikelane.md) | Workflow engine — phased, stepped, procedural |
| [BikeRack](pennyfarthing-dist/guides/bikerack.md) | Standalone panel viewer for CLI-first development |
| [Gates](pennyfarthing-dist/guides/gates.md) | Workflow phase transition gates |
| [Handoff CLI](pennyfarthing-dist/guides/handoff-cli.md) | Phase transitions and marker generation |
| [Hooks](pennyfarthing-dist/guides/hooks.md) | Hook system configuration and reference |
| [Prime](pennyfarthing-dist/guides/prime.md) | Agent activation and context loading |
| [Bell Mode](pennyfarthing-dist/guides/bell-mode.md) | Message queue injection |
| [Relay Mode](pennyfarthing-dist/guides/relay-mode.md) | Automatic agent handoffs |
| [Reflector](pennyfarthing-dist/guides/reflector.md) | Agent-to-UI marker protocol |
| [TirePump](pennyfarthing-dist/guides/tirepump.md) | Context clearing system |
| [Tandem Protocol](pennyfarthing-dist/guides/tandem-protocol.md) | Background observer pairing |
| [Output Styles](pennyfarthing-dist/guides/output-styles.md) | Configurable response modes |
| [Brownfield Tools](pennyfarthing-dist/guides/brownfield-tools.md) | Codebase analysis CLI tools |
| [Benchmarks](packages/benchmark/docs/benchmarks-guide.md) | Persona evaluation system |

## Available Themes (98)

Core includes 27 themes. Optional theme packs add 71 more across 7 packages:

| Package | Themes | Examples |
|---------|--------|----------|
| `@pennyfarthing/core` (included) | 27 | `the-expanse`, `star-trek-tng`, `breaking-bad`, `discworld`, `fifth-element` |
| `@pennyfarthing/themes-prestige-tv` | 17 | `succession`, `the-wire`, `mad-men`, `fargo`, `the-sopranos` |
| `@pennyfarthing/themes-literary` | 15 | `shakespeare`, `jane-austen`, `sherlock-holmes`, `1984`, `great-gatsby` |
| `@pennyfarthing/themes-realistic` | 14 | `ancient-philosophers`, `jazz-legends`, `film-auteurs`, `software-pioneers` |
| `@pennyfarthing/themes-comedy` | 9 | `the-office`, `parks-and-rec`, `ted-lasso`, `monty-python`, `futurama` |
| `@pennyfarthing/themes-scifi` | 8 | `foundation`, `snow-crash`, `neuromancer`, `babylon-5` |
| `@pennyfarthing/themes-mythology-fantasy` | 4 | `greek-mythology`, `norse-mythology`, `his-dark-materials`, `the-witcher` |
| `@pennyfarthing/themes-superheroes` | 4 | `marvel-mcu`, `avatar-the-last-airbender`, `legion-of-doom` |

All themes include OCEAN (Big Five) personality profiles. See [Personas](docs/PERSONAS.md) for personality analysis.

### Installing Theme Packs

```bash
# Install individual packs
npm install --save-dev @pennyfarthing/themes-prestige-tv

# Or install all theme packs at once
npm install --save-dev @pennyfarthing/themes-{comedy,literary,mythology-fantasy,prestige-tv,realistic,scifi,superheroes}
```

Configure in `.pennyfarthing/config.local.yaml`:
```yaml
theme: the-expanse
```

## Directory Structure

After initialization:

```
your-project/
├── .pennyfarthing/
│   ├── agents/               # → symlink to @pennyfarthing/core
│   ├── guides/               # → symlink to @pennyfarthing/core
│   ├── gates/                # → symlink to @pennyfarthing/core
│   ├── output-styles/        # → symlink to @pennyfarthing/core
│   ├── personas/             # → symlink to @pennyfarthing/core
│   ├── scripts/              # → symlink to @pennyfarthing/core
│   ├── templates/            # → symlink to @pennyfarthing/core
│   ├── workflows/            # → symlink to @pennyfarthing/core
│   ├── sidecars/             # Agent learning files (local, writable)
│   ├── config.local.yaml     # Theme, output style, modes
│   └── repos.yaml            # Multi-repo topology
├── .claude/
│   ├── commands/             # → symlinks for Claude Code discovery
│   └── skills/               # → symlinks for Claude Code discovery
├── sprint/
│   ├── current-sprint.yaml   # Active sprint
│   └── archive/              # Completed sessions
└── .session/
    └── {story-id}-session.md # Active work session
```

## What's New in v11.0.0

- **Single Package Consolidation** — `@pennyfarthing/shared` absorbed into `@pennyfarthing/core`. WheelHub server, React UI build, and all shared utilities now live in core. Cyclist is a thin wrapper adding WebSocket + OTLP.
- **Workflow Gate System** — Conditional checks (tests-pass, tests-fail, approval, confidence) that block phase transitions until quality thresholds are met
- **Handoff CLI** — Python CLI (`pf handoff`) for gate resolution, session transitions, and environment-aware marker generation
- **Tandem Consultation Protocol** — Synchronous agent-to-agent questions via Sonnet (complements passive backseat observation)
- **Output Styles** — Configurable response modes (terse, verbose, teaching) that adjust agent communication without changing behavior
- **Codebase Analysis Tools** — `pf debug` suite: hotspots, complexity, dead code, dependencies, code markers, health score — with WheelHub API routes for panel integration
- **Context Circuit Breaker** — Hard stop at 80% context usage, auto-saves agent state for `/continue-session` recovery
- **Git Hook Chaining** — Dispatcher `.d/` pattern allows multiple tools to install hooks without overwriting each other
- **v11 Migration Automation** — Detects and removes old packages during upgrade

### Previous Highlights

- **v10.3** - BikeRack Dockview migration, BikeRack launcher CLI, repos topology system, BA agent
- **v10.2** - Tandem backseat protocol, tandem workflows (TDD/BDD-tandem), CI quality gates, schema validation
- **v10.1** - Codebase health dashboard, tool dialog system, 2party-TDD workflow, cross-file reference validator
- **v10.0** - Clean install consolidation, tool use approval system, plan mode exit UI
- **v9.3** - Theme packages (97 themes across 7 packs), release workflow, shadcn/ui migration
- **v9.0** - Dockview panel system, React 19 rewrite, tool visualization, prime context, bell/relay modes
- **v8.x** - BikeLane workflows, scientific benchmarking, JobFair, agent sidecars

See [CHANGELOG.md](CHANGELOG.md) for full details.

---

## License

Copyright 2025-2026 1898 & Co. All rights reserved.
