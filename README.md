# Pennyfarthing

**v3.1.0** | *The outer loop goes once, the inner loop goes many times.*

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
| `pennyfarthing version` | Show version info |

## Documentation

| Document | Description |
|----------|-------------|
| [**User Guide**](docs/USER-GUIDE.md) | Complete documentation |
| [Getting Started](docs/GETTING-STARTED.md) | Quick start guide |
| [Agents](docs/AGENTS.md) | Agent reference |
| [Commands](docs/COMMANDS.md) | Slash command reference |
| [Workflows](docs/WORKFLOWS.md) | TDD and workflow guides |
| [Personas](docs/PERSONAS.md) | Theme customization |
| [Configuration](docs/CONFIGURATION.md) | Configuration reference |

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

## What's New in v3.1

- **YAML Frontmatter Subagents** - All 13 subagents now use Claude Code's official YAML frontmatter format with `name`, `description`, `tools`, and `model` fields
- **Consolidated Agents Directory** - Subagents moved from `subagents/` into `agents/` for single location
- **Per-Repo Test Filtering** - Testing runner supports auto-discovery and per-repo filter patterns
- **Frontmatter Validation** - New `validate-subagent-frontmatter.sh` script ensures subagent compliance

## What's New in v3.0

- **Official Subagents** - 13 subagents migrated to Claude Code's official agent format with `subagent_type`
- **Session File Naming** - Changed from `current_work.md` to `{story-id}-session.md` for parallel work support
- **Scripts as Symlinks** - `scripts/` symlinks to `pennyfarthing-dist/scripts/` for single source of truth
- **CLI Scripts Path** - Scripts install to `.claude/pennyfarthing/scripts/`
- **Centralized Error Handling** - Subagents return structured `status: success|blocked` results
- **NPM Package** - Install via npm with `pennyfarthing init`
- **CLI Tool** - `pennyfarthing init`, `update`, `doctor`, `uninstall`
- **Health Checks** - `doctor --fix` auto-repairs common issues

## License

MIT - 1898 & Co.
