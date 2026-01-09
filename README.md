# Pennyfarthing

**v6.0.0** | *The outer loop goes once, the inner loop goes many times.*

<img src="pennyfarthing.png" alt="Pennyfarthing Logo" width="75" style="float:left; margin:10px" margin="10px">

A Claude Code agent orchestration framework with TDD workflow and themed personas. Install via npm, configure once, and let coordinated agents guide your development.

---

### 🎭 [**Browse 91 Themes in the Interactive Showcase →**](https://animated-meme-3e4494y.pages.github.io/)

Explore all themes with OCEAN spider charts, Chernoff faces, and 910 character profiles.

---

## Features

- **10 Agents + 13 Subagents** - Strategic (PM, Architect) and tactical (SM, TEA, Dev, Reviewer) agents with official Haiku-based subagents for mechanical tasks
- **Automatic Handoffs** - Context-aware agent transitions via official subagent format
- **94 Persona Themes** - Star Trek, Breaking Bad, Dune, The Office, Game of Thrones, Arthurian Mythos, and more with OCEAN personality profiles
- **13 Skills** - Reusable knowledge domains (testing, code-review, judge, jira-cli, etc.)
- **28 Slash Commands** - Entry points for agent activation, benchmarking, and workflows
- **Scientific Benchmarking** - Evaluate personas against standardized scenarios with statistical analysis
- **CLI Tool** - `pennyfarthing init`, `update`, `doctor`, `uninstall`, `theme`

## Quick Start

```bash
cd your-project

# Install as dev dependency (scoped package)
npm install --save-dev @pennyfarthing/core

# Initialize (creates symlinks, no file copying)
npx pennyfarthing init

# Verify installation
npx pennyfarthing doctor

# Start working (in Claude Code)
/new-work
```

> **Note:** The package was renamed from `pennyfarthing` to `@pennyfarthing/core` in v6.0. If upgrading, uninstall the old package first: `npm uninstall pennyfarthing`

## The TDD Flow

```
/new-work → SM → TEA → Dev → Reviewer → SM (finish)
             │     │     │       │
          setup  tests  impl   review
```

| Agent | Role | Phase |
|-------|------|-------|
| **SM** | Scrum Master | Story selection, session setup, completion |
| **TEA** | Test Engineer | Write failing tests (RED) |
| **Dev** | Developer | Make tests pass (GREEN) |
| **Reviewer** | Code Reviewer | Quality validation, approve/reject |

Handoffs are automatic when context usage is below 70%. Above that threshold, agents recommend starting a fresh session.

## Cyclist - Visual Desktop Interface

Cyclist is the visual companion to Pennyfarthing - a desktop application that wraps Claude Code in a rich UI with real-time agent personas, session stats, and workflow visualization.

```bash
# Run from monorepo (development)
cd packages/cyclist
pnpm run dev

# Or build the distributable app
pnpm run build:electron
```

### Features

- **Real-time Persona Display** - Character portraits and OCEAN personality profiles update as agents change
- **Session Statistics** - Token usage (input/output), context percentage, model info
- **Story Progress** - Visual TDD workflow tracker (SM → TEA → Dev → Reviewer)
- **Task Visualizer** - Live todo list from Claude's TodoWrite tool
- **Rich Text Editor** - TipTap-based prompt editor with formatting
- **Tab Panel** - Diff viewer, file browser, workspace tools

### Architecture

Cyclist uses Electron with an Express server for the UI:

| Component | Purpose |
|-----------|---------|
| `main.ts` | Electron main process, IPC handlers, PTY spawn |
| `preload.ts` | Secure IPC bridge via contextBridge |
| `pennyfarthing.ts` | Theme loading, persona detection |
| `claude-service.ts` | Claude Code CLI wrapper |
| `otlp-receiver.ts` | OpenTelemetry metrics receiver |

See [Cyclist Documentation](docs/CYCLIST.md) for full details.

## CLI Commands

| Command | Description |
|---------|-------------|
| `pennyfarthing init [name]` | Initialize in a project |
| `pennyfarthing update` | Update to latest version |
| `pennyfarthing doctor` | Check installation health |
| `pennyfarthing doctor --fix` | Auto-fix common issues |
| `pennyfarthing uninstall` | Remove for clean reinstall |
| `pennyfarthing theme list` | Show available themes |
| `pennyfarthing theme set <name>` | Change active theme |
| `pennyfarthing theme show [name]` | Display theme details |
| `pennyfarthing theme create <name>` | Create custom theme |
| `pennyfarthing version` | Show version info |

## Documentation

| Document | Description |
|----------|-------------|
| [**User Guide**](docs/USER-GUIDE.md) | Complete documentation |
| [Getting Started](docs/GETTING-STARTED.md) | Quick start guide |
| [TDD Flow Diagrams](docs/TDD-FLOW-DIAGRAMS.md) | Visual sequence diagrams and flowcharts |
| [Architecture](docs/ARCHITECTURE.md) | System design and principles |
| [Agents](docs/AGENTS.md) | Agent reference |
| [Commands](docs/COMMANDS.md) | Slash command reference |
| [Skills](docs/SKILLS.md) | Knowledge domain reference |
| [Workflows](docs/WORKFLOWS.md) | TDD and workflow guides |
| [Personas](docs/PERSONAS.md) | Theme customization |
| [Theme Comparison](docs/THEME-COMPARISON.md) | Personality analysis & Big Five (OCEAN) profiles |
| [Configuration](docs/CONFIGURATION.md) | Configuration reference |
| [Permissions](docs/PERMISSIONS.md) | Claude Code permissions setup |
| [Benchmarking](docs/BENCHMARKING.md) | Scientific persona evaluation |
| [Cyclist](docs/CYCLIST.md) | Cyclist sidebar integration |

## Directory Structure

After initialization:

```
your-project/
├── .claude/
│   ├── pennyfarthing/        # Source files (managed)
│   │   ├── agents/           # Agent definitions + official subagents
│   │   ├── commands/         # Slash commands
│   │   ├── guides/           # Behavior guides
│   │   ├── skills/           # Knowledge domains
│   │   └── personas/         # Theme files
│   ├── agents/               # → symlink to pennyfarthing/agents/
│   ├── commands/             # → symlink to pennyfarthing/commands/
│   ├── skills/               # → symlink to pennyfarthing/skills/
│   ├── personas/             # → symlink to pennyfarthing/personas/
│   ├── project/              # YOUR customizations
│   │   ├── agents/*-sidecar/ # Agent memory/learnings
│   │   ├── docs/             # shared-context.md
│   │   └── hooks/            # setup-env.sh
│   ├── manifest.json         # Installation manifest
│   ├── persona-config.yaml   # Theme selection
│   └── settings.local.json   # Claude Code settings
├── scripts/                  # → symlink to .claude/pennyfarthing/scripts/
│   ├── hooks/                # Session hooks
│   └── utils/                # Utility scripts
├── sprint/
│   ├── current-sprint.yaml   # Active sprint
│   ├── archive/              # Completed sessions
│   └── context/              # Story summaries
└── .session/
    └── {story-id}-session.md       # Active work session
```

## Available Themes (94 total)

| Category | Themes |
|----------|--------|
| **Sci-Fi TV** | `the-expanse`, `star-trek-tng`, `star-trek-tos`, `firefly`, `battlestar-galactica`, `doctor-who` |
| **Sci-Fi Film** | `star-wars`, `dune`, `blade-runner`, `the-matrix`, `alien` |
| **Fantasy** | `game-of-thrones`, `lord-of-the-rings`, `the-witcher`, `sandman`, `his-dark-materials`, `arthurian-mythos` |
| **Mythology** | `greek-mythology`, `lovecraft-mythos`, `norse-mythology` |
| **Drama** | `breaking-bad`, `the-wire`, `succession`, `mad-men`, `deadwood`, `fargo` |
| **Comedy** | `the-office`, `parks-and-rec`, `ted-lasso`, `the-good-place`, `arrested-development` |
| **Literary** | `discworld`, `shakespeare`, `jane-austen`, `sherlock-holmes`, `hitchhikers-guide` |
| **Games** | `mass-effect`, `portal`, `baldurs-gate`, `disco-elysium` |
| **Classic** | `princess-bride`, `a-team`, `mash`, `west-wing` |
| **Minimal** | `control`, `minimalist` |

All 94 themes include OCEAN (Big Five) personality profiles and Chernoff face visualizations.

See [Theme Comparison Guide](docs/THEME-COMPARISON.md) for personality analysis, OCEAN profiles, and help choosing between themes.

Create custom themes with `/theme-maker`.

Configure in `.claude/persona-config.yaml`:
```yaml
theme: star-trek-tos
```

## Customization

### Output Styles

Pennyfarthing ships with output styles for Claude Code's `/output-style` command:

| Style | Description |
|-------|-------------|
| `verbose` | Detailed explanations, educational |
| `terse` | Minimal output, just the essentials |
| `teaching` | Explains reasoning, suggests alternatives |

Usage: `/output-style verbose` (in Claude Code)

### Preferences

User preferences are configured in `.claude/pennyfarthing/preferences.yaml`:

```yaml
# Enable persona character voice in agent output
character_voice: true

# Show reasoning and decision explanations
explain_decisions: true

# Auto-commit on story completion
auto_commit: false
```

Override locally with `.claude/pennyfarthing/preferences.local.yaml` (gitignored).

## Updating

```bash
# v6.0+: Update via npm (scoped package)
npm update @pennyfarthing/core

# Verify after update
npx pennyfarthing doctor
```

> **Migrating from v5.x?** Uninstall the old package first: `npm uninstall pennyfarthing && npm install --save-dev @pennyfarthing/core`

## Uninstalling

```bash
# Remove managed files (preserves your project customizations)
pennyfarthing uninstall

# Remove everything except archived work
pennyfarthing uninstall --all
```

Archived sprint data (`sprint/archive/`, `sprint/context/`) is always preserved.

## What's New in v6.0

- **Monorepo Architecture** - Restructured as pnpm workspace
  - `@pennyfarthing/core` - Main framework package
  - `@pennyfarthing/cyclist` - GUI companion (Electron)
  - `@pennyfarthing/shared` - Cross-package utilities (portrait resolver)
- **Cyclist Integration** - Full GUI support with persona sidebar
  - Portrait resolver works across all install scenarios
  - Real-time agent display with OCEAN-slugged filenames
- **3 New Themes** - Arthurian Mythos, Greek Mythology, Lovecraft Mythos
  - 30 new characters with full OCEAN profiles
  - Woodcut-style portraits for all characters
- **94 Total Themes** - Up from 91

## What's New in v5.x

- **Job Fair Benchmarking** - Data-driven role optimization with `/job-fair` command
- **Context Circuit Breaker** - Hard stop at 85% context with `/continue-session` recovery
- **Choreography Patterns** - 4 comprehensive guides (TDD flow, helper delegation, fan-out/fan-in, approval gates)
- **Scientific Benchmarking** - `/solo`, `/benchmark`, `/judge` commands for persona evaluation
- **Showcase Website** - Interactive theme browser at [showcase site](https://animated-meme-3e4494y.pages.github.io/)

---

*For full changelog, see [CHANGELOG.md](CHANGELOG.md)*

## License

Copyright 2025 1898 & Co. All rights reserved.
