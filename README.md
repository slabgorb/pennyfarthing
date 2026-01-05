# Pennyfarthing

**v5.2.0** | *The outer loop goes once, the inner loop goes many times.*

<img src="pennyfarthing.png" alt="Pennyfarthing Logo" width="75" style="float:left; margin:10px" margin="10px">

A Claude Code agent orchestration framework with TDD workflow and themed personas. Install via npm, configure once, and let coordinated agents guide your development.

---

### 🎭 [**Browse 91 Themes in the Interactive Showcase →**](https://animated-meme-3e4494y.pages.github.io/)

Explore all themes with OCEAN spider charts, Chernoff faces, and 910 character profiles.

---

## Features

- **10 Agents + 13 Subagents** - Strategic (PM, Architect) and tactical (SM, TEA, Dev, Reviewer) agents with official Haiku-based subagents for mechanical tasks
- **Automatic Handoffs** - Context-aware agent transitions via official subagent format
- **91 Persona Themes** - Star Trek, Breaking Bad, Dune, The Office, Game of Thrones, and more with OCEAN personality profiles
- **13 Skills** - Reusable knowledge domains (testing, code-review, judge, jira-cli, etc.)
- **28 Slash Commands** - Entry points for agent activation, benchmarking, and workflows
- **Scientific Benchmarking** - Evaluate personas against standardized scenarios with statistical analysis
- **CLI Tool** - `pennyfarthing init`, `update`, `doctor`, `uninstall`, `theme`

## Quick Start

```bash
cd your-project

# Install as dev dependency
npm install --save-dev pennyfarthing

# Initialize (creates symlinks, no file copying)
pennyfarthing init

# Verify installation
pennyfarthing doctor

# Start working (in Claude Code)
/new-work
```

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

## Available Themes (91 total)

| Category | Themes |
|----------|--------|
| **Sci-Fi TV** | `the-expanse`, `star-trek-tng`, `star-trek-tos`, `firefly`, `battlestar-galactica`, `doctor-who` |
| **Sci-Fi Film** | `star-wars`, `dune`, `blade-runner`, `the-matrix`, `alien` |
| **Fantasy** | `game-of-thrones`, `lord-of-the-rings`, `the-witcher`, `sandman`, `his-dark-materials` |
| **Drama** | `breaking-bad`, `the-wire`, `succession`, `mad-men`, `deadwood`, `fargo` |
| **Comedy** | `the-office`, `parks-and-rec`, `ted-lasso`, `the-good-place`, `arrested-development` |
| **Literary** | `discworld`, `shakespeare`, `jane-austen`, `sherlock-holmes`, `hitchhikers-guide` |
| **Games** | `mass-effect`, `portal`, `baldurs-gate`, `disco-elysium` |
| **Classic** | `princess-bride`, `a-team`, `mash`, `west-wing` |
| **Minimal** | `control`, `minimalist` |

All 91 themes include OCEAN (Big Five) personality profiles and Chernoff face visualizations.

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
# v4.0+: Update via npm (symlinks point to node_modules)
npm update pennyfarthing

# Verify after update
pennyfarthing doctor
```

## Uninstalling

```bash
# Remove managed files (preserves your project customizations)
pennyfarthing uninstall

# Remove everything except archived work
pennyfarthing uninstall --all
```

Archived sprint data (`sprint/archive/`, `sprint/context/`) is always preserved.

## What's New in v5.1

- **Cyclist Integration** (Epic 15) - Launch Cyclist with Pennyfarthing context
  - `pennyfarthing cyclist` command with auto-discovery
  - Real-time persona, story, and git status in Cyclist sidebar
  - Automatic statusbar detection (disabled when running in Cyclist)
- **Git Merge Hooks** (Epic 8) - Automatic state reconciliation
  - Post-merge hook detects PR merges and archives completed stories
  - Session cleanup on branch switch
- **Showcase Website Complete** - Interactive theme browser
  - 1006 static pages across 91 themes
  - Query builder with OCEAN expression parser
  - Character portraits, comparison views, favorites
- **91 Themes** - Up from 63, all with OCEAN profiles

## What's New in v5.0

- **Scientific Benchmarking** - Complete persona evaluation framework
  - `/solo` - Run agents on standardized scenarios
  - `/benchmark-control` - Create statistical baselines (n=10)
  - `/benchmark` - Compare personas with Cohen's d effect size
  - `/judge` - Rubric-based evaluation with TRAIL error detection
  - 24+ scenarios across 6 categories
  - See [BENCHMARKING.md](docs/BENCHMARKING.md) for details
- **TRAIL-OCEAN Research** - Error detection correlation analysis
  - Extended scenario schema with error_type taxonomy
  - 10 debugging scenarios with 61 tagged issues

## What's New in v4.2

- **Chernoff Face Visualization** - OCEAN personality profiles rendered as Chernoff faces (SVG + ASCII)
  - 630 character faces across all 63 themes
  - `/theme-maker` generates OCEAN profiles automatically
- **Context Warning Hook** - Automatic alerts at 70% context usage
- **Session Isolation Fix** - Multi-session statusline pollution resolved

---

*For full changelog, see [CHANGELOG.md](CHANGELOG.md)*

## License

Copyright 2025 1898 & Co. All rights reserved.
