# Pennyfarthing

**v7.9.2** | *The outer loop goes once, the inner loop goes many times.*

<img src="pennyfarthing.png" alt="Pennyfarthing Logo" width="75" style="float:left; margin:10px">

A Claude Code agent orchestration framework built around three pillars: a flexible development platform, scientific personality research, and streamlined integrations.

---

## What is Pennyfarthing?

### 1. Development Platform

A multi-agent system with customizable BikeLane workflows for structured software development:

- **19 Coordinated Agents** - SM, TEA, Dev, Reviewer, Architect, PM, and more
- **19 BikeLane Workflows** - Phased (TDD, BDD, Trivial), Stepped (PRD, Architecture), Procedural (Brainstorming, Retrospective)
- **45 Slash Commands** - Entry points for agent activation and workflows
- **22 Skills** - Reusable knowledge domains (testing, code-review, jira, mermaid, etc.)
- **Automatic Handoffs** - Context-aware agent transitions via subagent delegation

### 2. Personality Research

A scientific study of how strong personalities affect AI agent behavior:

- **OCEAN Profiling** - Big Five personality scores for every character
- **TRAIL Framework** - Categorizing errors (reasoning, planning, execution) and correlating with personality
- **Benchmarking System** - `/solo`, `/benchmark-control`, `/benchmark` for statistical evaluation
- **JobFair** - Discovering which characters excel at roles beyond their native specialization

The 102 persona themes (Discworld, Star Trek, Breaking Bad, etc.) are instruments of inquiry, not decoration. Early findings show character expertise often trumps abstract personality scores.

### 3. Integration & Tooling

Smoothing out development processes:

- **Jira Integration** - Bidirectional sync, epic auto-creation, sprint velocity
- **Sprint Management** - Story tracking with `current-sprint.yaml`
- **Cyclist Visual Terminal** - Rich UI with agent portraits, session stats, workflow visualization

---

### [**Explore the Research Showcase**](https://animated-meme-3e4494y.pages.github.io/)

102 themes with OCEAN spider charts, benchmark tiers, and 1020 character profiles.

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
/work
```

### Optional: Visual Terminal

```bash
# Install Cyclist (160 MB, includes portraits)
npm install --save-dev @pennyfarthing/cyclist

# Launch
npx pennyfarthing cyclist
```

## BikeLane Workflows

BikeLane is the umbrella workflow system supporting three types:

| Type | Description | Examples |
|------|-------------|----------|
| **Phased** | Agent-driven with automatic handoffs | tdd, bdd, trivial, agent-docs |
| **Stepped** | Progressive disclosure with user gates | prd, architecture, research, sprint-planning |
| **Procedural** | Flexible agent-guided processes | brainstorming, code-review, retrospective |

### Example: TDD Workflow (Phased)

```
/work → SM → TEA → Dev → Reviewer → SM (finish)
         │     │     │       │
      setup  tests  impl   review
```

| Agent | Role | Phase |
|-------|------|-------|
| **SM** | Scrum Master | Story selection, session setup, completion |
| **TEA** | Test Engineer | Write failing tests (RED) |
| **Dev** | Developer | Make tests pass (GREEN) |
| **Reviewer** | Code Reviewer | Quality validation, approve/reject |

Use `/workflow list` to see all 19 workflows. Use `/workflow start <name>` to begin any workflow.

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

## Documentation

| Document | Description |
|----------|-------------|
| [**User Guide**](docs/USER-GUIDE.md) | Complete documentation |
| [Getting Started](docs/GETTING-STARTED.md) | Quick start guide |
| [Workflow Diagrams](docs/WORKFLOW-DIAGRAMS.md) | Visual Mermaid diagrams for all workflows |
| [BikeLane](docs/BIKELANE.md) | Workflow system architecture |
| [Agents](docs/AGENTS.md) | Agent reference |
| [Commands](docs/COMMANDS.md) | Slash command reference |
| [Benchmarking](docs/BENCHMARKING.md) | Scientific persona evaluation |
| [Jira Integration](docs/JIRA-INTEGRATION.md) | Jira CLI and sprint sync |
| [Cyclist](docs/CYCLIST.md) | Visual terminal documentation |

## Available Themes (102)

| Category | Themes |
|----------|--------|
| **Sci-Fi TV** | `the-expanse`, `star-trek-tng`, `firefly`, `battlestar-galactica`, `doctor-who` |
| **Sci-Fi Film** | `star-wars`, `dune`, `blade-runner`, `the-matrix`, `alien` |
| **Fantasy** | `game-of-thrones`, `lord-of-the-rings`, `discworld`, `sandman`, `arthurian-mythos` |
| **Drama** | `breaking-bad`, `the-wire`, `succession`, `mad-men`, `fargo` |
| **Comedy** | `the-office`, `parks-and-rec`, `ted-lasso`, `the-good-place` |
| **Literary** | `shakespeare`, `jane-austen`, `sherlock-holmes`, `hitchhikers-guide` |
| **Games** | `mass-effect`, `portal`, `baldurs-gate`, `disco-elysium` |

All themes include OCEAN (Big Five) personality profiles. See [Theme Comparison](docs/THEME-COMPARISON.md) for personality analysis.

Configure in `.pennyfarthing/config.local.yaml`:
```yaml
theme: the-expanse
```

## Directory Structure

After initialization:

```
your-project/
├── .claude/
│   ├── commands/             # → symlinks to @pennyfarthing/core
│   ├── skills/               # → symlinks to @pennyfarthing/core
│   └── project/              # Your customizations
├── .pennyfarthing/
│   ├── agents/               # → symlink to @pennyfarthing/core
│   ├── workflows/            # → symlink to @pennyfarthing/core
│   ├── sidecars/             # Agent learning files
│   └── config.local.yaml     # Theme selection
├── sprint/
│   ├── current-sprint.yaml   # Active sprint
│   └── archive/              # Completed sessions
└── .session/
    └── {story-id}-session.md # Active work session
```

## What's New in v7.6

- **BikeLane Workflow System** - Unified umbrella for Phased, Stepped, and Procedural workflows
- **BMAD 6.0 Compatibility** - Full import support for BMAD workflows with tri-modal execution
- **19 Workflows** - Expanded from TDD-only to comprehensive workflow library
- **Scientific Benchmarking** - TRAIL-OCEAN hypothesis testing framework
- **JobFair** - Cross-role performance discovery system

See [CHANGELOG.md](CHANGELOG.md) for full details.

---

## License

Copyright 2025-2026 1898 & Co. All rights reserved.
