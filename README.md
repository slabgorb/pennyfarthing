# Pennyfarthing

**v3.6.1** | *The outer loop goes once, the inner loop goes many times.*

<img src="pennyfarthing.png" alt="Pennyfarthing Logo" width="75" style="float:left; margin:10px" margin="10px">

A Claude Code agent orchestration framework with TDD workflow and themed personas. Install via npm, configure once, and let coordinated agents guide your development.

## Features

- **10 Agents + 13 Subagents** - Strategic (PM, Architect) and tactical (SM, TEA, Dev, Reviewer) agents with official Haiku-based subagents for mechanical tasks
- **Automatic Handoffs** - Context-aware agent transitions via official subagent format
- **7 Persona Themes** - Star Trek, Discworld, Shakespeare, Jane Austen, and more
- **11 Skills** - Reusable knowledge domains (testing, code-review, jira-cli, etc.)
- **25 Slash Commands** - Entry points for agent activation and workflows
- **CLI Tool** - `pennyfarthing init`, `update`, `doctor`, `uninstall`

## Quick Start

```bash
# Install globally
npm install -g pennyfarthing

# Initialize in your project
cd your-project
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
| [Configuration](docs/CONFIGURATION.md) | Configuration reference |
| [Permissions](docs/PERMISSIONS.md) | Claude Code permissions setup |

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

## Available Themes

| Theme | Style |
|-------|-------|
| `star-trek-tos` | Star Trek: The Original Series (Kirk, Spock, McCoy) |
| `star-trek` | Star Trek: TNG (Picard, Data, Riker) |
| `discworld` | Terry Pratchett (DEATH, Vetinari, Vimes) |
| `shakespeare` | Shakespearean drama (Prospero, Puck, Hamlet) |
| `jane-austen` | Regency era wit (Mr. Darcy, Elizabeth Bennet) |
| `literary-classics` | Classic literature mix |
| `minimalist` | Professional, no personas |

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
# Update to latest version
pennyfarthing update

# Check for updates without applying
pennyfarthing update --check
```

## Uninstalling

```bash
# Remove managed files (preserves your project customizations)
pennyfarthing uninstall

# Remove everything except archived work
pennyfarthing uninstall --all
```

Archived sprint data (`sprint/archive/`, `sprint/context/`) is always preserved.

## What's New in v3.5

- **Theme CLI Commands** - `pennyfarthing theme list|set|show|create` for command-line theme management
- **User Preferences** - `.claude/pennyfarthing/preferences.yaml` for customizing agent behavior (character_voice, explain_decisions, auto_commit)
- **Output Styles** - Three built-in styles (verbose, terse, teaching) for Claude Code's `/output-style`
- **Sidecar Templates** - `pennyfarthing init` now installs templated sidecar content with section headers
- **Sprint Metrics** - `scripts/utils/sprint-metrics.sh` displays points completed/remaining
- **Session Hook Improvements** - Logs event source type, cleaner agent state reset

## What's New in v3.0

- **Official Subagents** - 13 subagents in Claude Code's official YAML frontmatter format
- **Session File Naming** - Changed from `current_work.md` to `{story-id}-session.md` for parallel work
- **Scripts as Symlinks** - Single source of truth from `pennyfarthing-dist/scripts/`
- **Centralized Error Handling** - Subagents return structured `status: success|blocked` results
- **NPM Package** - Install via npm with `pennyfarthing init`
- **Health Checks** - `doctor --fix` auto-repairs common issues

## License

Copyright 2025 1898 & Co. All rights reserved.
